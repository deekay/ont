// "My ONT" — the names this wallet owns and the auctions it's leading, read live
// from the resolver and filtered by the wallet's owner key. Read-only and real:
// demo (simulated) claims/bids don't appear here, only on-chain ownership does.
import { useNavigation } from "@react-navigation/native";
import React from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolver } from "../api/resolver";
import type { AuctionEntry, NameRecord } from "../api/types";
import { Badge, Card, Empty, ErrorView, KV, Loading, SectionTitle } from "../components/ui";
import { useDemoHoldings } from "../DemoHoldings";
import { formatAmount, shortHex, titleCase } from "../format";
import { useAsync } from "../hooks/useAsync";
import type { RootNav } from "../navigation/types";
import { auctionPhaseTone, nameStatusTone } from "../status";
import { colors, spacing } from "../theme";
import { useWallet } from "../wallet/WalletContext";

interface MyData {
  readonly owned: NameRecord[];
  readonly leading: AuctionEntry[];
}

export default function MyNamesScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const { wallet, allOwnerPubkeys } = useWallet();
  const { claims, values, recoveries, bids, transfers } = useDemoHoldings();
  // Per-name keys: a name is "mine" if its owner matches ANY of my derived keys.
  const ownerPubkeys = allOwnerPubkeys();
  const ownerKeysCsv = ownerPubkeys.join(",").toLowerCase();
  const demoCount = claims.length + values.length + recoveries.length + bids.length + transfers.length;

  const state = useAsync<MyData>(async () => {
    const mine = new Set(ownerPubkeys.map((p) => p.toLowerCase()));
    if (mine.size === 0) return { owned: [], leading: [] };
    // Independent reads: a hiccup in one shouldn't blank the other section.
    const [namesRes, auctionsRes] = await Promise.allSettled([
      resolver.names(),
      resolver.experimentalAuctions(),
    ]);
    if (namesRes.status === "rejected" && auctionsRes.status === "rejected") {
      throw namesRes.reason;
    }
    const owned =
      namesRes.status === "fulfilled"
        ? namesRes.value.names.filter((n) => mine.has((n.currentOwnerPubkey ?? "").toLowerCase()))
        : [];
    const leading =
      auctionsRes.status === "fulfilled"
        ? auctionsRes.value.auctions.filter((a) =>
            mine.has((a.currentLeaderBidderCommitment ?? "").toLowerCase()),
          )
        : [];
    return { owned, leading };
  }, [ownerKeysCsv]);

  if (!wallet) {
    return <Empty title="No wallet" subtitle="Create or import a wallet to see the names you own." />;
  }
  if (state.loading && !state.data) return <Loading label="Loading your names…" />;
  if (state.error && !state.data) return <ErrorView error={state.error} onRetry={state.reload} />;
  const data = state.data!;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
      refreshControl={
        <RefreshControl refreshing={state.refreshing} onRefresh={state.refresh} tintColor={colors.accent} />
      }
    >
      <Text style={styles.title}>My ONT</Text>
      <Text style={styles.subtitle}>Names this wallet owns · live from the resolver</Text>

      <SectionTitle right={<Text style={styles.count}>{data.owned.length}</Text>}>Names you own</SectionTitle>
      {data.owned.length === 0 ? (
        <Card>
          <Text style={styles.hint}>No names owned yet. Claim one from the Wallet screen.</Text>
        </Card>
      ) : (
        data.owned.map((n) => (
          <Card key={n.name} style={styles.spaced} onPress={() => nav.navigate("NameDetail", { name: n.name })}>
            <View style={styles.row}>
              <Text style={styles.name}>{n.name}</Text>
              <Badge label={titleCase(n.status)} tone={nameStatusTone(n.status)} />
            </View>
            {n.acquisitionKind ? <KV label="Acquired via" value={titleCase(n.acquisitionKind)} /> : null}
            {n.lastStateTxid ? <KV label="Ownership ref" value={shortHex(n.lastStateTxid, 10, 6)} mono /> : null}
          </Card>
        ))
      )}

      <SectionTitle right={<Text style={styles.count}>{data.leading.length}</Text>}>
        Auctions you're leading
      </SectionTitle>
      {data.leading.length === 0 ? (
        <Card>
          <Text style={styles.hint}>You're not the high bidder on any live auction.</Text>
        </Card>
      ) : (
        data.leading.map((a) => (
          <Card
            key={a.auctionId}
            style={styles.spaced}
            onPress={() => nav.navigate("AuctionDetail", { auctionId: a.auctionId })}
          >
            <View style={styles.row}>
              <Text style={styles.name}>{a.normalizedName}</Text>
              <Badge label={a.phaseLabel} tone={auctionPhaseTone(a.phase)} />
            </View>
            {a.currentHighestBidSats ? <KV label="Leading bid" value={formatAmount(a.currentHighestBidSats)} /> : null}
          </Card>
        ))
      )}

      {demoCount > 0 ? (
        <>
          <SectionTitle right={<Badge label="demo · this device" tone="warn" />}>Demo activity</SectionTitle>
          {claims.map((c, i) => (
            // Demo claims are device-local and not on the resolver, so this card
            // is informational — tapping through to NameDetail would 404.
            <Card key={`c${i}`} style={styles.spaced}>
              <View style={styles.row}>
                <Text style={styles.name}>{c.name}</Text>
                <Badge label="claim · provisional" tone="warn" />
              </View>
              <KV label="Finalizes after" value={`block ${c.noticeWindowCloseHeight}`} />
            </Card>
          ))}
          {values.map((v, i) => (
            <Card key={`v${i}`} style={styles.spaced}>
              <View style={styles.row}>
                <Text style={styles.name}>{v.name}</Text>
                <Badge label={`value · seq ${v.sequence}`} />
              </View>
              <KV label={`type ${v.valueType}`} value={v.value} />
            </Card>
          ))}
          {recoveries.map((r, i) => (
            <Card key={`r${i}`} style={styles.spaced}>
              <View style={styles.row}>
                <Text style={styles.name}>{r.name}</Text>
                <Badge label={`recovery · seq ${r.sequence}`} />
              </View>
              <KV label="Recovery wallet" value={r.recoveryAddress} />
            </Card>
          ))}
          {bids.map((b, i) => (
            <Card key={`b${i}`} style={styles.spaced} onPress={() => nav.navigate("AuctionDetail", { auctionId: b.auctionId })}>
              <View style={styles.row}>
                <Text style={styles.name}>{b.name}</Text>
                <Badge label={b.leading ? "bid · leading" : "bid"} tone={b.leading ? "success" : "neutral"} />
              </View>
              <KV label="Your bid" value={formatAmount(b.bidAmountSats)} />
            </Card>
          ))}
          {transfers.map((t, i) => (
            <Card key={`t${i}`} style={styles.spaced}>
              <View style={styles.row}>
                <Text style={styles.name}>{t.name}</Text>
                <Badge label="transfer · sent" tone="warn" />
              </View>
              <KV label="New owner" value={shortHex(t.newOwnerPubkey, 10, 6)} mono />
            </Card>
          ))}
        </>
      ) : null}

      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 30, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  subtitle: { color: colors.textMuted, marginTop: 2 },
  spaced: { marginBottom: spacing.sm },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  name: { fontSize: 18, fontWeight: "700", color: colors.text, flexShrink: 1 },
  count: { color: colors.textFaint, fontSize: 13, fontWeight: "600" },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
});
