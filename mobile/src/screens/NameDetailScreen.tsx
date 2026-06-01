import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import React from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError } from "../api/client";
import { resolver } from "../api/resolver";
import type { ActivityEntry, NameRecord, ValueHistoryResponse } from "../api/types";
import { Badge, Button, Card, KV, Loading, ErrorView, SectionTitle } from "../components/ui";
import { formatAmount, formatDateTime, hexToUtf8, shortHex, titleCase } from "../format";
import { useAsync } from "../hooks/useAsync";
import type { RootNav, RootStackParamList } from "../navigation/types";
import { availabilityFromRecord } from "../wallet/availability";
import { useWallet } from "../wallet/WalletContext";
import { eventTone, nameStatusTone } from "../status";
import { colors, font, spacing } from "../theme";

interface NameDetailData {
  record: NameRecord;
  values: ValueHistoryResponse | null;
  activity: ActivityEntry[];
}

async function loadNameDetail(name: string): Promise<NameDetailData> {
  const [record, values, activity] = await Promise.all([
    resolver.name(name),
    resolver
      .valueHistory(name)
      .catch((e) => (e instanceof ApiError && e.status === 404 ? null : Promise.reject(e))),
    resolver
      .nameActivity(name, 20)
      .then((r) => r.activity)
      .catch((e) => (e instanceof ApiError && e.status === 404 ? [] : Promise.reject(e))),
  ]);
  return { record, values, activity };
}

export default function NameDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "NameDetail">>();
  const nav = useNavigation<RootNav>();
  const { wallet } = useWallet();
  const { name } = route.params;
  const state = useAsync(() => loadNameDetail(name), [name]);

  if (state.loading && !state.data) return <Loading label={`Loading ${name}…`} />;
  if (state.error && !state.data) return <ErrorView error={state.error} onRetry={state.reload} />;
  const data = state.data!;
  const r = data.record;
  const ownedHere =
    !!wallet &&
    !!r.currentOwnerPubkey &&
    r.currentOwnerPubkey.toLowerCase() === wallet.owner.ownerPubkey.toLowerCase();
  // What can you actually do with this name from here?
  const availability = availabilityFromRecord(r, wallet?.owner.ownerPubkey ?? null);
  const claimable = !ownedHere && availability.kind === "available";
  const inAuction = availability.kind === "in-auction";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={state.refreshing} onRefresh={state.refresh} tintColor={colors.accent} />
      }
    >
      <View style={styles.titleRow}>
        <Text style={styles.name}>{r.name}</Text>
        <Badge label={titleCase(r.status)} tone={nameStatusTone(r.status)} />
      </View>

      {claimable ? (
        <Card style={styles.primaryCard}>
          <Text style={styles.primaryLabel}>This name is available</Text>
          <Text style={styles.primaryHint}>
            No one owns it on the live chain right now. Claim it with the flat-gate cheap rail.
          </Text>
          <Button title={`Claim ${r.name}`} onPress={() => nav.navigate("Claim", { name: r.name })} />
        </Card>
      ) : inAuction ? (
        <Card style={styles.primaryCard}>
          <Text style={styles.primaryLabel}>This name is being contested</Text>
          <Text style={styles.primaryHint}>
            It's gone to an auction, so it can't be cheaply claimed. Bid in the auction instead.
          </Text>
          <Button title="Go to auctions" onPress={() => nav.navigate("Tabs", { screen: "Auctions" })} />
        </Card>
      ) : null}

      <SectionTitle>Ownership</SectionTitle>
      <Card>
        <KV label="Owner key" value={shortHex(r.currentOwnerPubkey, 12, 8)} mono />
        <KV label="Acquired via" value={r.acquisitionKind ? titleCase(r.acquisitionKind) : "—"} />
        {r.acquisitionAuctionId ? <KV label="Auction" value={r.acquisitionAuctionId} mono /> : null}
        <KV label="Last state txid" value={shortHex(r.lastStateTxid, 12, 8)} mono />
        {r.lastStateHeight !== undefined ? (
          <KV label="Last state height" value={String(r.lastStateHeight)} />
        ) : null}
        {ownedHere ? (
          <View style={styles.ownerActions}>
            <Badge label="✓ owned by this wallet" tone="success" />
            <View style={styles.ownerButtons}>
              <Button title="Set value" variant="secondary" onPress={() => nav.navigate("SetValue", { name: r.name })} />
              <Button title="Set recovery" variant="secondary" onPress={() => nav.navigate("Recovery", { name: r.name })} />
            </View>
          </View>
        ) : null}
      </Card>

      <SectionTitle>Lifecycle</SectionTitle>
      <Card>
        {r.claimHeight !== undefined ? <KV label="Claim height" value={String(r.claimHeight)} /> : null}
        {r.maturityHeight !== undefined ? (
          <KV label="Maturity height" value={String(r.maturityHeight)} />
        ) : null}
        {r.winningCommitBlockHeight !== undefined ? (
          <KV label="Winning commit" value={String(r.winningCommitBlockHeight)} />
        ) : null}
        {r.claimRevealTxid ? <KV label="Reveal txid" value={shortHex(r.claimRevealTxid, 12, 8)} mono /> : null}
      </Card>

      {r.requiredBondSats || r.currentBondTxid ? (
        <>
          <SectionTitle>Bond</SectionTitle>
          <Card>
            {r.requiredBondSats ? <KV label="Required" value={formatAmount(r.requiredBondSats)} /> : null}
            {r.currentBondValueSats ? <KV label="Current" value={formatAmount(r.currentBondValueSats)} /> : null}
            {r.currentBondTxid ? (
              <KV
                label="Bond UTXO"
                value={`${shortHex(r.currentBondTxid, 10, 6)}:${r.currentBondVout ?? 0}`}
                mono
              />
            ) : null}
          </Card>
        </>
      ) : null}

      <SectionTitle right={data.values ? <Text style={styles.count}>{data.values.records.length}</Text> : undefined}>
        Value records
      </SectionTitle>
      {data.values && data.values.records.length > 0 ? (
        data.values.records
          .slice()
          .sort((a, b) => b.sequence - a.sequence)
          .map((rec) => (
            <Card key={rec.recordHash} style={styles.spaced}>
              <View style={styles.valueHead}>
                <Text style={styles.valueSeq}>#{rec.sequence}</Text>
                <Text style={styles.valueHash}>{shortHex(rec.recordHash, 8, 6)}</Text>
              </View>
              <Text style={styles.valuePayload}>
                {hexToUtf8(rec.payloadHex) ?? `0x${rec.payloadHex.slice(0, 48)}…`}
              </Text>
              <Text style={styles.valueMeta}>{formatDateTime(rec.issuedAt)}</Text>
            </Card>
          ))
      ) : (
        <Card>
          <Text style={styles.muted}>No value record published for the current ownership interval.</Text>
        </Card>
      )}

      <SectionTitle>Recent activity</SectionTitle>
      {data.activity.length > 0 ? (
        data.activity.slice(0, 12).map((entry) => <ActivityRow key={entry.txid} entry={entry} />)
      ) : (
        <Card>
          <Text style={styles.muted}>No indexed activity.</Text>
        </Card>
      )}
      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const ev = entry.events?.[0];
  return (
    <Card style={styles.spaced}>
      <View style={styles.activityHead}>
        <Text style={styles.activityType}>{ev ? ev.typeName : "TX"}</Text>
        {ev?.validationStatus ? (
          <Badge label={titleCase(ev.validationStatus)} tone={eventTone(ev.validationStatus)} />
        ) : null}
      </View>
      <Text style={styles.activityMeta}>block {entry.blockHeight}</Text>
      <Text style={styles.activityTxid}>{shortHex(entry.txid, 12, 10)}</Text>
      {ev?.reason ? <Text style={styles.activityReason}>{titleCase(ev.reason)}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  name: { fontSize: 30, fontWeight: "800", color: colors.text, letterSpacing: -0.5, flexShrink: 1 },
  primaryCard: { marginTop: spacing.md, gap: spacing.sm, borderColor: colors.accent },
  primaryLabel: { color: colors.text, fontWeight: "700", fontSize: 15 },
  primaryHint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  count: { color: colors.textFaint, fontSize: 13, fontWeight: "600" },
  spaced: { marginBottom: spacing.sm },
  ownerActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.md,
    flexWrap: "wrap",
  },
  ownerButtons: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  valueHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.xs },
  valueSeq: { fontWeight: "700", color: colors.text },
  valueHash: { fontFamily: font.mono, fontSize: 12, color: colors.textFaint },
  valuePayload: { color: colors.text, fontSize: 14 },
  valueMeta: { color: colors.textFaint, fontSize: 12, marginTop: spacing.xs },
  activityHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  activityType: { fontWeight: "700", color: colors.text, fontSize: 15 },
  activityMeta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  activityTxid: { fontFamily: font.mono, fontSize: 12, color: colors.textFaint, marginTop: 2 },
  activityReason: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
  muted: { color: colors.textMuted },
});
