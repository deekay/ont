import { useNavigation } from "@react-navigation/native";
import React, { useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDemoMode } from "../DemoMode";
import type { RootNav } from "../navigation/types";
import { resolver, chain, type EsploraUtxo } from "../api/resolver";
import type { ConfigResponse, HealthResponse } from "../api/types";
import { Badge, Button, Card, KV, Loading, ErrorView, SectionTitle } from "../components/ui";
import { ONT_HOST, NETWORK } from "../config";
import { formatAmount, shortHex } from "../format";
import { useAsync } from "../hooks/useAsync";
import { colors, font, radius, spacing } from "../theme";
import { useWallet } from "../wallet/WalletContext";

interface StatusData {
  health: HealthResponse;
  config: ConfigResponse;
  tip: number;
}

interface FundingData {
  utxos: EsploraUtxo[];
  total: number;
  confirmed: number;
}

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const { status, wallet, busy, createWallet, importWallet, removeWallet } = useWallet();
  const { demo, setDemo } = useDemoMode();

  const infra = useAsync<StatusData>(async () => {
    const [health, config, tip] = await Promise.all([
      resolver.health(),
      resolver.config(),
      chain.tipHeight(),
    ]);
    return { health, config, tip };
  }, []);

  const fundingAddress = wallet?.funding.fundingAddress ?? null;
  const funding = useAsync<FundingData | null>(async () => {
    if (!fundingAddress) return null;
    const utxos = await chain.addressUtxos(fundingAddress);
    let total = 0;
    let confirmed = 0;
    for (const u of utxos) {
      total += u.value;
      if (u.status?.confirmed) confirmed += u.value;
    }
    return { utxos, total, confirmed };
  }, [fundingAddress]);

  // Import form + secret reveal state.
  const [mode, setMode] = useState<"view" | "import">("view");
  const [importOwner, setImportOwner] = useState("");
  const [importWif, setImportWif] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [revealOwner, setRevealOwner] = useState(false);
  const [revealWif, setRevealWif] = useState(false);

  function confirmRemove() {
    Alert.alert(
      "Remove wallet from this device?",
      "The keys are erased from the Keychain. Back up your owner key and funding WIF first — without them the name and funds are unrecoverable.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            removeWallet().catch(() => undefined);
            setRevealOwner(false);
            setRevealWif(false);
          },
        },
      ],
    );
  }

  async function submitImport() {
    setImportError(null);
    try {
      await importWallet({ ownerPrivateKeyHex: importOwner, fundingWif: importWif });
      setImportOwner("");
      setImportWif("");
      setMode("view");
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed.");
    }
  }

  if (status === "loading") return <Loading label="Opening keystore…" />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={infra.refreshing || funding.refreshing}
          onRefresh={() => {
            infra.refresh();
            funding.refresh();
          }}
          tintColor={colors.accent}
        />
      }
    >
      <Text style={styles.title}>Wallet</Text>
      <Text style={styles.subtitle}>Sovereign name ownership on Bitcoin</Text>

      {wallet ? (
        <>
          <SectionTitle right={<Badge label={wallet.network} tone="accent" />}>Your keys</SectionTitle>

          <Card>
            <Text style={styles.cardLabel}>Owner key · x-only Schnorr</Text>
            <Text style={styles.cardHint}>Controls the name. Signs ownership events.</Text>
            <Text selectable style={styles.monoBlock}>
              {wallet.owner.ownerPubkey}
            </Text>
            <View style={styles.revealRow}>
              <Button
                title={revealOwner ? "Hide secret key" : "Reveal secret key"}
                variant="secondary"
                onPress={() => setRevealOwner((v) => !v)}
              />
            </View>
            {revealOwner ? (
              <View style={styles.secretBox}>
                <Text style={styles.secretLabel}>Owner private key (back this up)</Text>
                <Text selectable style={styles.secretValue}>
                  {wallet.owner.ownerPrivateKeyHex}
                </Text>
              </View>
            ) : null}
          </Card>

          <Card style={{ marginTop: spacing.md }}>
            <Text style={styles.cardLabel}>Funding address · P2WPKH</Text>
            <Text style={styles.cardHint}>Pays fees and bonds. Send signet coins here.</Text>
            <Text selectable style={styles.monoBlock}>
              {wallet.funding.fundingAddress}
            </Text>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Balance</Text>
              {funding.loading && !funding.data ? (
                <Text style={styles.balanceValue}>checking…</Text>
              ) : funding.error ? (
                <Text style={styles.balanceValue}>unavailable</Text>
              ) : (
                <Text style={styles.balanceValue}>{formatAmount(funding.data?.total ?? 0)}</Text>
              )}
            </View>
            {funding.data && funding.data.total !== funding.data.confirmed ? (
              <KV label="Confirmed" value={formatAmount(funding.data.confirmed)} />
            ) : null}
            {funding.data ? (
              <KV label="UTXOs" value={String(funding.data.utxos.length)} />
            ) : null}
            <View style={styles.revealRow}>
              <Button
                title={revealWif ? "Hide funding WIF" : "Reveal funding WIF"}
                variant="secondary"
                onPress={() => setRevealWif((v) => !v)}
              />
            </View>
            {revealWif ? (
              <View style={styles.secretBox}>
                <Text style={styles.secretLabel}>Funding WIF (back this up)</Text>
                <Text selectable style={styles.secretValue}>
                  {wallet.funding.fundingWif}
                </Text>
              </View>
            ) : null}
          </Card>

          <Card style={{ marginTop: spacing.md }}>
            <View style={styles.demoRow}>
              <View style={{ flex: 1, paddingRight: spacing.md }}>
                <Text style={styles.cardLabel}>Demo mode</Text>
                <Text style={styles.cardHint}>
                  Simulate the claim + Lightning payment locally — no real payment, no chain write.
                  The inclusion proof is real and verified. Turn off to use a live publisher.
                </Text>
              </View>
              <Switch value={demo} onValueChange={setDemo} trackColor={{ true: colors.accent, false: colors.border }} />
            </View>
          </Card>

          <View style={{ marginTop: spacing.md }}>
            <Button title="Claim a name" onPress={() => nav.navigate("Claim")} />
          </View>

          <View style={{ marginTop: spacing.md }}>
            <Button title="Set a name's value" variant="secondary" onPress={() => nav.navigate("SetValue")} />
          </View>

          <View style={{ marginTop: spacing.md }}>
            <Button title="Remove wallet" variant="danger" onPress={confirmRemove} loading={busy} />
          </View>
        </>
      ) : mode === "import" ? (
        <>
          <SectionTitle>Import existing keys</SectionTitle>
          <Card>
            <Text style={styles.cardLabel}>Owner private key (64 hex chars)</Text>
            <TextInput
              style={styles.input}
              value={importOwner}
              onChangeText={setImportOwner}
              placeholder="a1b2c3…"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
            />
            <Text style={[styles.cardLabel, { marginTop: spacing.md }]}>Funding WIF</Text>
            <TextInput
              style={styles.input}
              value={importWif}
              onChangeText={setImportWif}
              placeholder="cN… / p2wpkh WIF"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {importError ? <Text style={styles.inlineError}>{importError}</Text> : null}
            <View style={styles.formActions}>
              <Button title="Import" onPress={submitImport} loading={busy} />
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => {
                  setMode("view");
                  setImportError(null);
                }}
              />
            </View>
          </Card>
        </>
      ) : (
        <>
          <SectionTitle>Your keys</SectionTitle>
          <Card>
            <Text style={styles.placeholderTitle}>No wallet on this device yet</Text>
            <Text style={styles.placeholderBody}>
              Generate an owner key (controls the name) and a funding key (pays fees and bonds).
              Both are stored encrypted in the device Keychain and never leave the phone.
            </Text>
            <View style={styles.formActions}>
              <Button title="Create wallet" onPress={() => createWallet()} loading={busy} />
              <Button title="Import keys" variant="secondary" onPress={() => setMode("import")} />
            </View>
          </Card>
        </>
      )}

      <SectionTitle>Live infrastructure</SectionTitle>
      {infra.loading && !infra.data ? (
        <Card>
          <Text style={styles.cardHint}>Checking infrastructure…</Text>
        </Card>
      ) : infra.error && !infra.data ? (
        <ErrorView error={infra.error} onRetry={infra.reload} />
      ) : infra.data ? (
        <Card>
          <KV
            label="Health"
            value={infra.data.health.ok ? "OK" : "degraded"}
            tone={infra.data.health.ok ? "success" : "danger"}
          />
          <KV label="Sync mode" value={infra.data.health.syncMode} />
          <KV label="Source" value={infra.data.health.source} />
          <KV label="Chain tip" value={String(infra.data.tip)} />
          {infra.data.health.expectedChain ? (
            <KV label="Chain" value={infra.data.health.expectedChain} />
          ) : null}
        </Card>
      ) : null}

      <SectionTitle>Endpoint</SectionTitle>
      <Card>
        <KV label="Host" value={ONT_HOST.replace("https://", "")} />
        <KV label="Network" value={NETWORK} />
        {infra.data ? <KV label="Product" value={infra.data.config.product} /> : null}
        <View style={{ marginTop: spacing.sm }}>
          <Badge label="Reusing the validated /api + /esplora surface" tone="accent" />
        </View>
      </Card>
      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 30, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  subtitle: { color: colors.textMuted, marginTop: 2 },
  placeholderTitle: { color: colors.text, fontWeight: "700", fontSize: 15 },
  placeholderBody: { color: colors.textMuted, marginTop: spacing.xs, lineHeight: 20 },
  cardLabel: { color: colors.text, fontWeight: "700", fontSize: 14 },
  cardHint: { color: colors.textMuted, fontSize: 13, marginTop: 2, lineHeight: 18 },
  demoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monoBlock: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.text,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  revealRow: { marginTop: spacing.md },
  secretBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
  },
  secretLabel: { color: colors.danger, fontWeight: "700", fontSize: 12 },
  secretValue: { fontFamily: font.mono, fontSize: 12, color: colors.text, marginTop: spacing.xs, lineHeight: 18 },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
  },
  balanceLabel: { color: colors.textMuted, fontSize: 14 },
  balanceValue: { color: colors.text, fontWeight: "700", fontSize: 16 },
  input: {
    marginTop: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    padding: spacing.md,
    color: colors.text,
    fontFamily: font.mono,
    fontSize: 13,
    backgroundColor: colors.surfaceAlt,
    minHeight: 44,
  },
  inlineError: { color: colors.danger, marginTop: spacing.sm, fontSize: 13 },
  formActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
});
