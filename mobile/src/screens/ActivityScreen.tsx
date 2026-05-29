import { useNavigation } from "@react-navigation/native";
import React from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolver } from "../api/resolver";
import type { ActivityEntry } from "../api/types";
import { Badge, Card, Empty, ErrorView, Loading } from "../components/ui";
import { shortHex, titleCase } from "../format";
import { useAsync } from "../hooks/useAsync";
import type { RootNav } from "../navigation/types";
import { eventTone } from "../status";
import { colors, font, spacing } from "../theme";

export default function ActivityScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const state = useAsync(() => resolver.activity(50), []);

  if (state.loading && !state.data) return <Loading label="Loading activity…" />;
  if (state.error && !state.data) return <ErrorView error={state.error} onRetry={state.reload} />;

  const entries = state.data?.activity ?? [];

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Activity</Text>
        <Text style={styles.subtitle}>On-chain ONT events, newest first</Text>
      </View>
      <FlatList
        data={entries}
        keyExtractor={(e, i) => `${e.txid}-${i}`}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={<Empty title="No activity yet" />}
        refreshControl={
          <RefreshControl refreshing={state.refreshing} onRefresh={state.refresh} tintColor={colors.accent} />
        }
        renderItem={({ item }) => (
          <ActivityCard
            entry={item}
            onPressName={(name) => nav.navigate("NameDetail", { name })}
          />
        )}
      />
    </View>
  );
}

function ActivityCard({ entry, onPressName }: { entry: ActivityEntry; onPressName: (name: string) => void }) {
  const ev = entry.events?.[0];
  const affected = ev?.affectedName;
  return (
    <Card onPress={affected ? () => onPressName(affected) : undefined}>
      <View style={styles.row}>
        <Text style={styles.type}>{ev ? ev.typeName : "TX"}</Text>
        {ev?.validationStatus ? (
          <Badge label={titleCase(ev.validationStatus)} tone={eventTone(ev.validationStatus)} />
        ) : null}
      </View>
      {affected ? <Text style={styles.affected}>{affected}</Text> : null}
      <View style={styles.metaRow}>
        <Text style={styles.meta}>block {entry.blockHeight}</Text>
        <Text style={styles.txid}>{shortHex(entry.txid, 10, 8)}</Text>
      </View>
      {ev?.reason ? <Text style={styles.reason}>{titleCase(ev.reason)}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: 30, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  subtitle: { color: colors.textMuted, marginTop: 2 },
  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  type: { fontWeight: "700", color: colors.text, fontSize: 16 },
  affected: { color: colors.accentInk, fontWeight: "600", marginTop: 2 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
  meta: { color: colors.textMuted, fontSize: 13 },
  txid: { fontFamily: font.mono, fontSize: 12, color: colors.textFaint },
  reason: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
});
