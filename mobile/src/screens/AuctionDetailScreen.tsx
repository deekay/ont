import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import React, { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MockAuctionBidder, isBiddable, minimumNextBidSats, type DemoBidResult } from "../api/mock-auction";
import { resolver } from "../api/resolver";
import type { AuctionEntry, BidOutcome } from "../api/types";
import { Badge, Button, Card, KV, Loading, ErrorView, SectionTitle } from "../components/ui";
import { useDemoHoldings } from "../DemoHoldings";
import { useDemoMode } from "../DemoMode";
import { formatAmount, formatBtc, shortHex, titleCase } from "../format";
import { useAsync } from "../hooks/useAsync";
import type { RootNav, RootStackParamList } from "../navigation/types";
import { auctionPhaseTone, eventTone } from "../status";
import { colors, font, radius, spacing } from "../theme";
import { broadcastAuctionBid, type BroadcastedBid } from "../wallet/auction-write";
import { useWallet } from "../wallet/WalletContext";

export default function AuctionDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "AuctionDetail">>();
  const nav = useNavigation<RootNav>();
  const { auctionId } = route.params;
  const state = useAsync(async () => {
    const all = await resolver.experimentalAuctions();
    const found = all.auctions.find((a) => a.auctionId === auctionId);
    if (!found) throw new Error(`Auction ${auctionId} not found`);
    return found;
  }, [auctionId]);
  const { demo } = useDemoMode();
  const { recordBid } = useDemoHoldings();
  const { wallet, allocateOwnerKeyForName } = useWallet();
  const [bidAmount, setBidAmount] = useState("");
  const [bidResult, setBidResult] = useState<DemoBidResult | null>(null);
  const [realBid, setRealBid] = useState<BroadcastedBid | null>(null);
  const [bidBusy, setBidBusy] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);

  if (state.loading && !state.data) return <Loading label="Loading auction…" />;
  if (state.error && !state.data) return <ErrorView error={state.error} onRetry={state.reload} />;
  const a: AuctionEntry = state.data!;
  const minNext = minimumNextBidSats(a);
  const biddable = isBiddable(a);

  async function placeBid() {
    if (!wallet) return;
    // The bidder commitment is the per-name owner key you'd control if you win.
    const owner = await allocateOwnerKeyForName(a.normalizedName);
    const result = new MockAuctionBidder().placeBid({
      auction: a,
      bidAmountSats: bidAmount.trim(),
      ownerPubkey: owner.ownerPubkey,
    });
    setBidResult(result);
    if (result.accepted) {
      recordBid({
        auctionId: a.auctionId,
        name: a.normalizedName,
        bidAmountSats: result.bidAmountSats,
        leading: result.becameLeader,
        at: new Date().toISOString(),
      });
    }
  }

  async function placeRealBid() {
    if (!wallet) return;
    setBidBusy(true);
    setBidError(null);
    try {
      const raw = bidAmount.trim();
      if (!/^[0-9]+$/.test(raw)) throw new Error("Enter a bid amount in base units.");
      const amount = BigInt(raw);
      if (amount < minNext) {
        throw new Error(`Bid must be at least ${minNext.toString()} base units.`);
      }
      // The owner key you'd control if you win — committed in the bid.
      const owner = await allocateOwnerKeyForName(a.normalizedName);
      const result = await broadcastAuctionBid({
        entry: a,
        ownerPubkey: owner.ownerPubkey,
        bidAmountSats: amount,
        seedHex: wallet.seedHex,
        network: wallet.network,
      });
      setRealBid(result);
      recordBid({
        auctionId: a.auctionId,
        name: a.normalizedName,
        bidAmountSats: amount.toString(),
        leading: false,
        at: new Date().toISOString(),
      });
    } catch (e) {
      setBidError(e instanceof Error ? e.message : "Could not place the bid.");
    } finally {
      setBidBusy(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={state.refreshing} onRefresh={state.refresh} tintColor={colors.accent} />
      }
    >
      <View style={styles.titleRow}>
        <Text style={styles.name}>{a.normalizedName}</Text>
        <Badge label={a.phaseLabel} tone={auctionPhaseTone(a.phase)} />
      </View>
      {a.description ? <Text style={styles.desc}>{a.description}</Text> : null}

      <SectionTitle>Bidding</SectionTitle>
      <Card>
        <KV
          label="Highest bid"
          value={a.currentHighestBidSats ? formatAmount(a.currentHighestBidSats) : "none yet"}
        />
        <KV label="Minimum next" value={formatAmount(a.currentRequiredMinimumBidSats ?? a.openingMinimumBidSats)} />
        <KV label="Opening floor" value={formatBtc(a.openingMinimumBidSats)} />
        {a.currentLeaderBidderCommitment ? (
          <KV label="Leader" value={shortHex(a.currentLeaderBidderCommitment, 10, 6)} mono />
        ) : null}
      </Card>

      {demo ? (
        <>
          <SectionTitle right={<Badge label="demo" tone="warn" />}>
            {biddable ? "Place a bid" : "Bidding"}
          </SectionTitle>
          {!biddable ? (
            <Card>
              <Text style={styles.hint}>
                Bidding isn't open in this phase ({a.phaseLabel}) — there's nothing to do here.
                {a.winnerOwnerPubkey ? " This auction has settled; see the winner below." : ""}
              </Text>
            </Card>
          ) : !wallet ? (
            <Card>
              <Text style={styles.hint}>
                You need a wallet first — it derives a fresh owner key for each name you claim or win.
                Create it, then come back to bid.
              </Text>
              <View style={styles.bidActions}>
                <Button title="Go to Wallet" variant="secondary" onPress={() => nav.navigate("Tabs", { screen: "Wallet" })} />
              </View>
            </Card>
          ) : (
            <Card>
              <Text style={styles.hint}>
                Bonded second-price bid. Demo: your owner key is the real bidder commitment and the
                minimum is enforced from live auction state — only the on-chain bond + broadcast is simulated.
              </Text>
              <Text style={styles.bidLabel}>Bid amount · ₿ base units</Text>
              <TextInput
                style={styles.input}
                value={bidAmount}
                onChangeText={(t) => {
                  setBidAmount(t.replace(/[^0-9]/g, ""));
                  setBidResult(null);
                }}
                placeholder={`min ${minNext.toString()}`}
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
              />
              {bidAmount ? <Text style={styles.bidPreview}>{formatAmount(bidAmount)}</Text> : null}
              <View style={styles.bidActions}>
                <Button
                  title="Use minimum"
                  variant="secondary"
                  onPress={() => {
                    setBidAmount(minNext.toString());
                    setBidResult(null);
                  }}
                />
                <Button title="Place bid (demo)" onPress={placeBid} disabled={bidAmount.trim().length === 0} />
              </View>
              {bidResult ? (
                bidResult.accepted ? (
                  <View style={[styles.bidResult, { borderColor: colors.success }]}>
                    <View style={styles.outcomeHead}>
                      <Text style={[styles.bidLabel, { color: colors.success }]}>
                        {bidResult.becameLeader ? "Bid accepted — you're leading" : "Bid accepted"}
                      </Text>
                      <Badge label="demo" tone="warn" />
                    </View>
                    <KV label="Your bid" value={formatAmount(bidResult.bidAmountSats)} />
                    <KV label="Bidder commitment" value={shortHex(bidResult.bidderCommitment, 10, 6)} mono />
                    <KV label="Bond txid (demo)" value={shortHex(bidResult.bidTxid, 10, 6)} mono />
                  </View>
                ) : (
                  <Text style={styles.bidError}>Rejected: {bidResult.reason}</Text>
                )
              ) : null}
            </Card>
          )}
        </>
      ) : null}

      {!demo ? (
        <>
          <SectionTitle right={<Badge label="on-chain" tone="accent" />}>
            {biddable ? "Place a bid" : "Bidding"}
          </SectionTitle>
          {!biddable ? (
            <Card>
              <Text style={styles.hint}>
                Bidding isn't open in this phase ({a.phaseLabel}).
                {a.winnerOwnerPubkey ? " This auction has settled; see the winner below." : ""}
              </Text>
            </Card>
          ) : !wallet ? (
            <Card>
              <Text style={styles.hint}>
                You need a wallet first — it derives a fresh owner key for each name and pays the bond
                + fee from its funding balance.
              </Text>
              <View style={styles.bidActions}>
                <Button title="Go to Wallet" variant="secondary" onPress={() => nav.navigate("Tabs", { screen: "Wallet" })} />
              </View>
            </Card>
          ) : realBid ? (
            <Card style={{ borderColor: colors.success }}>
              <View style={styles.outcomeHead}>
                <Text style={[styles.bidLabel, { color: colors.success, marginTop: 0 }]}>Bid broadcast on-chain</Text>
                <Badge label="on-chain" tone="success" />
              </View>
              <Text style={styles.hint}>
                Your bid is locked as a returnable Bitcoin bond paid to your funding key. Once the tx
                confirms, the indexer records the bid against this auction.
              </Text>
              <KV label="Bid / bond" value={formatAmount(String(realBid.bondSats))} />
              <KV label="Bond txid" value={shortHex(realBid.txid, 10, 6)} mono />
              <KV label="Network fee" value={`₿${realBid.feeSats.toLocaleString()} (${realBid.vbytes} vB)`} />
              <KV label="Bidder commitment" value={shortHex(realBid.bidderCommitment, 10, 6)} mono />
              <View style={styles.bidActions}>
                <Button
                  title="Refresh auction"
                  variant="secondary"
                  onPress={() => {
                    setRealBid(null);
                    state.reload();
                  }}
                />
              </View>
            </Card>
          ) : (
            <Card>
              <Text style={styles.hint}>
                Bonded bid. Your bid amount is locked as a returnable Bitcoin bond and broadcast
                on-chain; the engine records it against this auction.
              </Text>
              <Text style={styles.bidLabel}>Bid amount · ₿ base units</Text>
              <TextInput
                style={styles.input}
                value={bidAmount}
                onChangeText={(t) => {
                  setBidAmount(t.replace(/[^0-9]/g, ""));
                  setBidError(null);
                }}
                placeholder={`min ${minNext.toString()}`}
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
              />
              {bidAmount ? <Text style={styles.bidPreview}>{formatAmount(bidAmount)}</Text> : null}
              <View style={styles.bidActions}>
                <Button
                  title="Use minimum"
                  variant="secondary"
                  onPress={() => {
                    setBidAmount(minNext.toString());
                    setBidError(null);
                  }}
                />
                <Button
                  title="Place bid on-chain"
                  onPress={placeRealBid}
                  disabled={bidAmount.trim().length === 0}
                  loading={bidBusy}
                />
              </View>
              {bidError ? <Text style={styles.bidError}>{bidError}</Text> : null}
            </Card>
          )}
        </>
      ) : null}

      <SectionTitle>Timing</SectionTitle>
      <Card>
        <KV label="Path" value="Contested auction" />
        <KV label="Chain height" value={String(a.currentBlockHeight)} />
        <KV label="Unlock block" value={String(a.unlockBlock)} />
        {a.blocksUntilUnlock != null ? <KV label="Blocks to unlock" value={String(a.blocksUntilUnlock)} /> : null}
        {a.blocksUntilClose != null ? <KV label="Blocks to close" value={String(a.blocksUntilClose)} /> : null}
        {a.settlementLockBlocks != null ? (
          <KV label="Settlement lock" value={`${a.settlementLockBlocks} blocks`} />
        ) : null}
      </Card>

      <SectionTitle>Tally</SectionTitle>
      <Card>
        <KV label="Accepted" value={String(a.acceptedBidCount ?? 0)} />
        <KV label="Rejected" value={String(a.rejectedBidCount ?? 0)} tone={a.rejectedBidCount ? "danger" : undefined} />
        <KV label="Observed" value={String(a.totalObservedBidCount ?? 0)} />
        {a.winnerOwnerPubkey ? <KV label="Winner key" value={shortHex(a.winnerOwnerPubkey, 12, 8)} mono /> : null}
        {a.settlementHeight != null ? <KV label="Settled at" value={String(a.settlementHeight)} /> : null}
      </Card>

      {a.visibleBidOutcomes && a.visibleBidOutcomes.length > 0 ? (
        <>
          <SectionTitle>Bid outcomes</SectionTitle>
          {a.visibleBidOutcomes.map((o, i) => (
            <BidOutcomeRow key={i} outcome={o} />
          ))}
        </>
      ) : null}

      <View style={{ marginTop: spacing.xl }}>
        <Button
          title={`View name · ${a.normalizedName}`}
          variant="secondary"
          onPress={() => nav.navigate("NameDetail", { name: a.normalizedName })}
        />
      </View>
      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

function BidOutcomeRow({ outcome }: { outcome: BidOutcome }) {
  const accepted = (outcome.outcome ?? "").toLowerCase() === "accepted";
  return (
    <Card style={styles.spaced}>
      <View style={styles.outcomeHead}>
        <Text style={styles.outcomeAmount}>{outcome.bidAmountSats ? formatBtc(outcome.bidAmountSats) : "—"}</Text>
        <Badge
          label={titleCase(outcome.outcome ?? "—")}
          tone={eventTone(accepted ? "accepted" : "rejected")}
        />
      </View>
      <View style={styles.outcomeMetaRow}>
        {outcome.reason ? <Text style={styles.outcomeReason}>{titleCase(outcome.reason)}</Text> : null}
        {outcome.blockHeight != null ? <Text style={styles.outcomeHeight}>block {outcome.blockHeight}</Text> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  name: { fontSize: 30, fontWeight: "800", color: colors.text, letterSpacing: -0.5, flexShrink: 1 },
  desc: { color: colors.textMuted, marginTop: spacing.sm, lineHeight: 20 },
  spaced: { marginBottom: spacing.sm },
  outcomeHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  bidLabel: { color: colors.text, fontWeight: "700", fontSize: 14, marginTop: spacing.md },
  input: {
    marginTop: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    padding: spacing.md,
    color: colors.text,
    fontFamily: font.mono,
    fontSize: 14,
    backgroundColor: colors.surfaceAlt,
    minHeight: 44,
  },
  bidPreview: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
  bidActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md, flexWrap: "wrap" },
  bidResult: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth },
  bidError: { color: colors.danger, fontSize: 13, marginTop: spacing.md, lineHeight: 18 },
  outcomeAmount: { fontWeight: "700", color: colors.text, fontSize: 15 },
  outcomeMetaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
  outcomeReason: { color: colors.textMuted, fontSize: 13, flexShrink: 1 },
  outcomeHeight: { fontFamily: font.mono, fontSize: 12, color: colors.textFaint },
});
