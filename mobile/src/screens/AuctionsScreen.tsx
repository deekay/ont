import { useNavigation } from "@react-navigation/native";
import React from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolver } from "../api/resolver";
import type { AuctionEntry } from "../api/types";
import { Badge, Card, Empty, ErrorView, Loading } from "../components/ui";
import { formatBtc } from "../format";
import { useAsync } from "../hooks/useAsync";
import type { RootNav } from "../navigation/types";
import { auctionPhaseTone } from "../status";
import { colors, spacing } from "../theme";

const PHASE_ORDER: Record<string, number> = {
  soft_close: 0,
  live_bidding: 1,
  awaiting_opening_bid: 2,
  pending_unlock: 3,
  settled: 4,
};

export default function AuctionsScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const state = useAsync(() => resolver.experimentalAuctions(), []);

  if (state.loading && !state.data) return <Loading label="Loading auctions…" />;
  if (state.error && !state.data) return <ErrorView error={state.error} onRetry={state.reload} />;

  const auctions = [...(state.data?.auctions ?? [])].sort(
    (a, b) => (PHASE_ORDER[a.phase] ?? 9) - (PHASE_ORDER[b.phase] ?? 9),
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Auctions</Text>
        <Text style={styles.subtitle}>
          Bonded second-price · chain height {state.data?.currentBlockHeight ?? "—"}
        </Text>
      </View>
      <FlatList
        data={auctions}
        keyExtractor={(a) => a.auctionId}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={<Empty title="No auctions" />}
        refreshControl={
          <RefreshControl refreshing={state.refreshing} onRefresh={state.refresh} tintColor={colors.accent} />
        }
        renderItem={({ item }) => (
          <AuctionCard auction={item} onPress={() => nav.navigate("AuctionDetail", { auctionId: item.auctionId })} />
        )}
      />
    </View>
  );
}

export function AuctionCard({ auction, onPress }: { auction: AuctionEntry; onPress?: () => void }) {
  const leading = auction.currentHighestBidSats
    ? `${formatBtc(auction.currentHighestBidSats)} leading`
    : `${formatBtc(auction.currentRequiredMinimumBidSats ?? auction.openingMinimumBidSats)} minimum`;
  return (
    <Card onPress={onPress}>
      <View style={styles.row}>
        <Text style={styles.name}>{auction.normalizedName}</Text>
        <Badge label={auction.phaseLabel} tone={auctionPhaseTone(auction.phase)} />
      </View>
      <Text style={styles.leading}>{leading}</Text>
      <Text style={styles.meta}>
        Contested auction
        {auction.phase === "live_bidding" && auction.blocksUntilClose != null
          ? ` · closes in ${auction.blocksUntilClose} blocks`
          : auction.phase === "pending_unlock" && auction.blocksUntilUnlock != null
            ? ` · unlocks in ${auction.blocksUntilUnlock} blocks`
            : ""}
        {auction.totalObservedBidCount ? ` · ${auction.totalObservedBidCount} bids` : ""}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: 30, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  subtitle: { color: colors.textMuted, marginTop: 2 },
  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  name: { fontSize: 18, fontWeight: "700", color: colors.text, flexShrink: 1 },
  leading: { color: colors.text, fontWeight: "600", marginTop: spacing.xs },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
});
