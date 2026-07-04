import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { proofBundleMaxAnchorHeight } from "@ont/light-client";
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
import { API_BASE, HEADER_PROVIDER, HEADER_PROVIDER_ESPLORA_URL, SIGNET_LAUNCH_CHECKPOINT } from "../config";
import {
  createMobileSignetHeaderRangeProvider,
  fetchMobileSignetLaunchHeaderSource,
  mobileBitcoinVerificationState,
  unavailableMobileBitcoinVerificationState,
  type MobileBitcoinVerificationState,
} from "../verification/bitcoin";

interface NameDetailData {
  record: NameRecord;
  values: ValueHistoryResponse | null;
  activity: ActivityEntry[];
  bitcoinVerification: MobileBitcoinVerificationState;
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
  const bitcoinVerification = await loadBitcoinVerification(name, record);
  return { record, values, activity, bitcoinVerification };
}

const mobileHeaderProvider = createMobileSignetHeaderRangeProvider({
  provider: HEADER_PROVIDER,
  resolverUrl: API_BASE,
  esploraBaseUrl: HEADER_PROVIDER_ESPLORA_URL,
});

async function loadBitcoinVerification(
  name: string,
  record: NameRecord,
): Promise<MobileBitcoinVerificationState> {
  let served: Awaited<ReturnType<typeof resolver.nameState>>;
  try {
    served = await resolver.nameState(name);
  } catch {
    return unavailableMobileBitcoinVerificationState("transport-error");
  }

  const legacyOwnerPubkeyHex = record.currentOwnerPubkey ?? null;
  if (served === null || (served.ok === false && served.reason === "name-unknown")) {
    return mobileBitcoinVerificationState({
      proofBundle: null,
      ownerPubkeyHex: legacyOwnerPubkeyHex,
    });
  }
  if (!served.ok) return unavailableMobileBitcoinVerificationState("transport-error");

  const servedOwnerPubkeyHex =
    served.owner !== null && typeof served.owner === "object" && typeof served.owner.ownerPubkeyHex === "string"
      ? served.owner.ownerPubkeyHex
      : null;
  if (servedOwnerPubkeyHex === null) return unavailableMobileBitcoinVerificationState("transport-error");

  const anchorHeight = proofBundleMaxAnchorHeight(served.proofBundle);
  if (anchorHeight === null) {
    return mobileBitcoinVerificationState({
      proofBundle: served.proofBundle,
      headerSource: null,
      ownerPubkeyHex: servedOwnerPubkeyHex,
    });
  }

  const headerSource = await fetchMobileSignetLaunchHeaderSource({
    anchorHeight,
    provider: mobileHeaderProvider,
    checkpoint: SIGNET_LAUNCH_CHECKPOINT ?? undefined,
  });

  return mobileBitcoinVerificationState({
    proofBundle: served.proofBundle,
    headerSource: headerSource.ok ? headerSource.headerSource : null,
    ownerPubkeyHex: servedOwnerPubkeyHex,
    checkpointId: headerSource.ok ? headerSource.checkpointId : undefined,
    network: headerSource.ok ? headerSource.network : undefined,
  });
}

export default function NameDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "NameDetail">>();
  const nav = useNavigation<RootNav>();
  const { wallet, allOwnerPubkeys } = useWallet();
  const { name } = route.params;
  const state = useAsync(() => loadNameDetail(name), [name]);

  if (state.loading && !state.data) return <Loading label={`Loading ${name}…`} />;
  if (state.error && !state.data) return <ErrorView error={state.error} onRetry={state.reload} />;
  const data = state.data!;
  const r = data.record;
  // Per-name keys: owned-here if the name's owner matches ANY of my derived keys.
  const mine = allOwnerPubkeys().map((p) => p.toLowerCase());
  const ownedHere = !!r.currentOwnerPubkey && mine.includes(r.currentOwnerPubkey.toLowerCase());
  // What can you actually do with this name from here?
  const availability = availabilityFromRecord(r, ownedHere ? r.currentOwnerPubkey ?? null : null);
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
      <View style={styles.titleBlock}>
        <View style={styles.titleRow}>
          <Text style={styles.name}>{r.name}</Text>
          <Badge label={titleCase(r.status)} tone={nameStatusTone(r.status)} />
        </View>
        <BitcoinVerificationBadge state={data.bitcoinVerification} />
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
              <Button title="Transfer" variant="secondary" onPress={() => nav.navigate("Transfer", { name: r.name })} />
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

function BitcoinVerificationBadge({ state }: { state: MobileBitcoinVerificationState }) {
  const tone =
    state.kind === "bitcoin-verified" ? "success" : state.kind === "resolver-mirror" ? "warn" : "neutral";
  const badgeLabel =
    state.kind === "bitcoin-verified" ? "Bitcoin verified" : state.kind === "resolver-mirror" ? "Resolver mirror" : "Unavailable";
  return (
    <View style={styles.verificationBlock}>
      <Badge label={badgeLabel} tone={tone} />
      <Text style={state.kind === "unavailable" ? styles.verificationMuted : styles.verificationText}>
        {verificationSummary(state)}
      </Text>
    </View>
  );
}

function verificationSummary(state: MobileBitcoinVerificationState): string {
  if (state.kind === "bitcoin-verified") {
    const authenticity =
      state.signetHeaderAuthenticity === "provider-trusted" ? "provider-trusted signet headers" : state.network;
    return `${state.label}; ${authenticity}; anchor ${state.anchorHeight}, required ${state.requiredHeight}`;
  }
  if (state.kind === "resolver-mirror") {
    return state.label;
  }
  return state.label;
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
  titleBlock: { gap: spacing.sm },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  name: { fontSize: 30, fontWeight: "800", color: colors.text, letterSpacing: -0.5, flexShrink: 1 },
  verificationBlock: { alignItems: "flex-start", gap: spacing.xs },
  verificationText: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  verificationMuted: { color: colors.textFaint, fontSize: 13, lineHeight: 18 },
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
