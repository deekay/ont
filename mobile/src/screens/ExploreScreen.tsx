import { useNavigation } from "@react-navigation/native";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolver } from "../api/resolver";
import type { NameRecord } from "../api/types";
import { Badge, Card, Empty, ErrorView, Loading } from "../components/ui";
import { shortHex, titleCase } from "../format";
import { useAsync } from "../hooks/useAsync";
import type { RootNav } from "../navigation/types";
import { nameStatusTone } from "../status";
import { colors, radius, spacing } from "../theme";

export default function ExploreScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const names = useAsync(() => resolver.names(), []);

  const filtered = useMemo(() => {
    const all = names.data?.names ?? [];
    const sorted = [...all].sort((a, b) => a.name.localeCompare(b.name));
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        (n.currentOwnerPubkey ?? "").toLowerCase().includes(q),
    );
  }, [names.data, query]);

  if (names.loading && !names.data) return <Loading label="Loading names…" />;
  if (names.error && !names.data) return <ErrorView error={names.error} onRetry={names.reload} />;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Names</Text>
        <Text style={styles.subtitle}>
          {(names.data?.names.length ?? 0).toString()} claimed on the live chain
        </Text>
      </View>
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name or owner key"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.search}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(n) => n.name}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={<Empty title="No names match" subtitle="Try a different search." />}
        refreshControl={
          <RefreshControl refreshing={names.refreshing} onRefresh={names.refresh} tintColor={colors.accent} />
        }
        renderItem={({ item }) => <NameRow record={item} onPress={() => nav.navigate("NameDetail", { name: item.name })} />}
      />
    </View>
  );
}

function NameRow({ record, onPress }: { record: NameRecord; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.name}>{record.name}</Text>
        <Text style={styles.owner}>
          {record.currentOwnerPubkey ? `owner ${shortHex(record.currentOwnerPubkey)}` : "unowned"}
          {record.acquisitionKind ? ` · via ${record.acquisitionKind}` : ""}
        </Text>
      </View>
      <Badge label={titleCase(record.status)} tone={nameStatusTone(record.status)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: 30, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  subtitle: { color: colors.textMuted, marginTop: 2 },
  searchWrap: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  search: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  rowMain: { flex: 1 },
  name: { fontSize: 18, fontWeight: "700", color: colors.text },
  owner: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
});
