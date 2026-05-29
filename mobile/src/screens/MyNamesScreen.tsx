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
  const { wallet } = useWallet();
  const ownerPubkey = wallet?.owner.ownerPubkey?.toLowerCase() ?? null;

  const state = useAsync<MyData>(async () => {
    if (!ownerPubkey) return { owned: [], leading: [] };
    const [names, auctions] = await Promise.all([resolver.names(), resolver.experimentalAuctions()]);
    const owned = names.names.filter((n) => (n.currentOwnerPubkey ?? "").toLowerCase() === ownerPubkey);
    const leading = auctions.auctions.filter(
      (a) => (a.currentLeaderBidderCommitment ?? "").toLowerCase() === ownerPubkey,
    );
    return { owned, leading };
  }, [ownerPubkey]);

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
