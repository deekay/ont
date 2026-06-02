// Recovery-descriptor write flow: the owner key designating a recovery wallet
// (address) for a name it owns — ONT's protocol-native recovery path. Mirrors
// SetValueScreen; signs locally (BIP340 Schnorr, recovery-descriptor.ts),
// self-verifies, then publishes. The resolver re-checks owner + ownershipRef +
// exact-next sequence before recording.
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge, Button, Card, KV, SectionTitle } from "../components/ui";
import { useDemoHoldings } from "../DemoHoldings";
import { useDemoMode } from "../DemoMode";
import { shortHex } from "../format";
import type { RootNav, RootStackParamList } from "../navigation/types";
import { colors, font, radius, spacing } from "../theme";
import { accumulatorKeyForName, isValidName, normalizeName } from "../wallet/accumulator";
import {
  publishNameRecovery,
  readRecoveryState,
  signRecoveryForDemo,
  type PublishRecoveryResult,
  type RecoveryState,
} from "../wallet/recovery-write";
import { useWallet } from "../wallet/WalletContext";

type Step = "input" | "checked" | "done";

export default function RecoveryScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const route = useRoute<RouteProp<RootStackParamList, "Recovery">>();
  const { wallet, ownerKeyForName } = useWallet();
  const { demo } = useDemoMode();
  const { claims, recoveries, recordRecovery } = useDemoHoldings();

  const [name, setName] = useState(route.params?.name ?? "");
  const [recoveryAddress, setRecoveryAddress] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<RecoveryState | null>(null);
  const [result, setResult] = useState<PublishRecoveryResult | null>(null);

  const trimmed = normalizeName(name);
  const nameOk = isValidName(trimmed);
  const addrOk = recoveryAddress.trim().length > 0;
  // Per-name owner key: the derived key this wallet uses for `trimmed`.
  const ownerKey = ownerKeyForName(trimmed);
  const ownerPubkey = ownerKey?.ownerPubkey ?? null;
  const ownerPrivateKeyHex = ownerKey?.ownerPrivateKeyHex ?? null;
  const owns =
    state != null &&
    ownerPubkey != null &&
    (state.currentOwnerPubkey ?? "").toLowerCase() === ownerPubkey.toLowerCase();

  function reset() {
    setStep("input");
    setState(null);
    setResult(null);
    setError(null);
  }

  async function checkName() {
    setBusy(true);
    setError(null);
    try {
      if (demo) {
        if (!claims.some((c) => c.name === trimmed)) {
          setError(`Claim "${trimmed}" in demo first (Wallet → Claim a name).`);
          setState(null);
          setStep("input");
          return;
        }
        const used = recoveries.filter((r) => r.name === trimmed).length;
        const last = recoveries.filter((r) => r.name === trimmed)[0];
        setState({
          name: trimmed,
          status: "claimed (demo)",
          currentOwnerPubkey: ownerPubkey,
          ownershipRef: accumulatorKeyForName(trimmed),
          currentSequence: used === 0 ? null : used,
          currentRecoveryAddress: last?.recoveryAddress ?? null,
          nextSequence: used + 1,
        });
        if (last?.recoveryAddress && !recoveryAddress) setRecoveryAddress(last.recoveryAddress);
        setStep("checked");
        return;
      }
      const s = await readRecoveryState(trimmed);
      if (s === null) {
        setError(`The resolver doesn't know "${trimmed}" yet — it has to be claimed first.`);
        setState(null);
        setStep("input");
        return;
      }
      setState(s);
      if (s.currentRecoveryAddress && !recoveryAddress) setRecoveryAddress(s.currentRecoveryAddress);
      setStep("checked");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the name's current state.");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!ownerPrivateKeyHex) return;
    setBusy(true);
    setError(null);
    try {
      const r = demo
        ? signRecoveryForDemo({
            name: trimmed,
            ownerPrivateKeyHex,
            recoveryAddress: recoveryAddress.trim(),
            sequence: state?.nextSequence ?? 1,
          })
        : await publishNameRecovery(
            { name: trimmed, ownerPrivateKeyHex, recoveryAddress: recoveryAddress.trim() },
            { simulate: false },
          );
      setResult(r);
      setStep("done");
      if (r.simulated) {
        recordRecovery({ name: r.name, recoveryAddress: r.recoveryAddress, sequence: r.sequence, at: new Date().toISOString() });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Set a recovery wallet</Text>
      <Text style={styles.subtitle}>Owner-signed recovery descriptor · recovers the name if your key is lost</Text>

      {!wallet ? (
        <Card style={styles.spaced}>
          <Text style={styles.cardLabel}>No wallet on this device</Text>
          <Text style={styles.cardHint}>
            A recovery descriptor is signed by the name's owner key. Create a wallet first.
          </Text>
          <View style={styles.actions}>
            <Button title="Go to Wallet" onPress={() => nav.navigate("Tabs", { screen: "Wallet" })} />
          </View>
        </Card>
      ) : null}

      <SectionTitle>Name</SectionTitle>
      <Card>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={(t) => {
            setName(t);
            if (step !== "input") reset();
          }}
          placeholder="a name this wallet owns"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          editable={step === "input"}
        />
        {trimmed.length > 0 && !nameOk ? (
          <Text style={styles.inlineError}>Names are lowercase a–z and 0–9, 1 to 32 characters.</Text>
        ) : null}
      </Card>

      {step !== "input" && state ? (
        <>
          <SectionTitle>Current state</SectionTitle>
          <Card>
            <View style={styles.row}>
              <Text style={styles.cardLabel}>{state.name}</Text>
              <Badge label={owns ? "✓ owned by this wallet" : "not owned here"} tone={owns ? "success" : "warn"} />
            </View>
            <KV label="Status" value={state.status} />
            {state.ownershipRef ? <KV label="Ownership ref" value={shortHex(state.ownershipRef, 10, 8)} mono /> : null}
            <KV
              label="Recovery chain"
              value={
                state.currentSequence === null
                  ? "none set → next is seq 1"
                  : `head seq ${state.currentSequence} → next is seq ${state.nextSequence}`
              }
            />
            {state.currentRecoveryAddress ? (
              <KV label="Current recovery" value={state.currentRecoveryAddress} />
            ) : null}
            {!owns ? (
              <Text style={[styles.cardHint, { marginTop: spacing.sm }]}>
                Only the current owner key can set recovery for this name.
              </Text>
            ) : null}
          </Card>
        </>
      ) : null}

      {ownerPubkey ? (
        <>
          <SectionTitle>Recovery wallet address</SectionTitle>
          <Card>
            <Text style={styles.cardHint}>
              The address that can recover this name through the challenge window if the owner key is lost.
              Use an address you control from a separate, safe wallet.
            </Text>
            <TextInput
              style={styles.input}
              value={recoveryAddress}
              onChangeText={(t) => {
                setRecoveryAddress(t);
                if (step === "done") reset();
              }}
              placeholder="tb1q… (signet)"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              editable={step !== "done"}
            />
          </Card>
        </>
      ) : null}

      {ownerPubkey && step === "input" ? (
        <View style={styles.actions}>
          <Button title="Check name" onPress={checkName} disabled={!nameOk} loading={busy} />
        </View>
      ) : null}

      {ownerPubkey && step === "checked" ? (
        <View style={styles.actions}>
          <Button title="Sign & publish recovery" onPress={publish} disabled={!owns || !addrOk} loading={busy} />
          <Button title="Start over" variant="secondary" onPress={reset} />
        </View>
      ) : null}

      {step === "done" && result ? (
        <>
          <SectionTitle>Published</SectionTitle>
          <Card style={{ borderColor: colors.success }}>
            <View style={styles.row}>
              <Text style={[styles.cardLabel, { color: colors.success }]}>
                {result.simulated ? "Recovery descriptor signed (demo)" : "Recovery descriptor published"}
              </Text>
              <Badge label={result.simulated ? "demo · seq " + result.sequence : `seq ${result.sequence}`} tone={result.simulated ? "warn" : "success"} />
            </View>
            <Text style={styles.cardHint}>
              {result.simulated
                ? "Signed locally with your owner key and self-verified — not published in demo mode. Turn demo off on the Wallet screen to publish to the resolver."
                : "Signed locally with your owner key and verified by the resolver against the name's current owner and chain head before it was recorded."}
            </Text>
            <KV label="Recovery address" value={result.recoveryAddress} />
            <KV label="Descriptor hash" value={shortHex(result.descriptorHash, 12, 8)} mono />
            <View style={styles.actions}>
              {nameOk ? (
                <Button
                  title="View name"
                  variant="secondary"
                  onPress={() => nav.navigate("NameDetail", { name: trimmed })}
                />
              ) : null}
              <Button title="Set another" variant="secondary" onPress={reset} />
            </View>
          </Card>
        </>
      ) : null}

      {error ? (
        <Card style={[styles.spaced, { borderColor: colors.danger }]}>
          <Text style={styles.inlineError}>{error}</Text>
        </Card>
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
  spaced: { marginTop: spacing.md },
  cardLabel: { color: colors.text, fontWeight: "700", fontSize: 14, flexShrink: 1 },
  cardHint: { color: colors.textMuted, fontSize: 13, marginTop: 2, lineHeight: 18 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg, flexWrap: "wrap" },
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
  inlineError: { color: colors.danger, marginTop: spacing.xs, fontSize: 13, lineHeight: 18 },
});
