import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import React from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { resolver } from "../api/resolver";
import type { AuctionEntry, BidOutcome } from "../api/types";
import { Badge, Button, Card, KV, Loading, ErrorView, SectionTitle } from "../components/ui";
import { formatAmount, formatBtc, shortHex, titleCase } from "../format";
import { useAsync } from "../hooks/useAsync";
import type { RootNav, RootStackParamList } from "../navigation/types";
import { auctionPhaseTone, eventTone } from "../status";
import { colors, font, spacing } from "../theme";

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

  if (state.loading && !state.data) return <Loading label="Loading auction…" />;
  if (state.error && !state.data) return <ErrorView error={state.error} onRetry={state.reload} />;
  const a: AuctionEntry = state.data!;

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

      <SectionTitle>Timing</SectionTitle>
      <Card>
        <KV label="Class" value={a.classLabel} />
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
  outcomeAmount: { fontWeight: "700", color: colors.text, fontSize: 15 },
  outcomeMetaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
  outcomeReason: { color: colors.textMuted, fontSize: 13, flexShrink: 1 },
  outcomeHeight: { fontFamily: font.mono, fontSize: 12, color: colors.textFaint },
});
