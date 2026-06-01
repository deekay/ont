// Value-record WRITE flow: the owner key asserting a name's current value.
//
// This is the second crypto pillar made interactive — the wallet signs a
// canonical, length-prefixed value record (BIP340 Schnorr, see
// wallet/value-record.ts) and publishes it to the resolver. The screen refuses
// to sign unless this wallet is the resolver's current owner of the name, and
// the record is self-verified locally before it is sent; the resolver then
// independently re-checks signature, owner, ownershipRef, and exact-next
// sequence. See wallet/value-write.ts for the orchestration.
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
import { useWallet } from "../wallet/WalletContext";
import {
  publishNameValue,
  readValueState,
  signValueForDemo,
  type PublishValueResult,
  type ValueState,
} from "../wallet/value-write";

type Step = "input" | "checked" | "done";

function parseValueType(raw: string): number | null {
  if (!/^\d{1,3}$/.test(raw.trim())) return null;
  const n = Number.parseInt(raw.trim(), 10);
  return n >= 0 && n <= 255 ? n : null;
}

export default function SetValueScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const route = useRoute<RouteProp<RootStackParamList, "SetValue">>();
  const { wallet, ownerKeyForName } = useWallet();
  const { demo } = useDemoMode();
  const { claims, values, recordValue } = useDemoHoldings();

  const [name, setName] = useState(route.params?.name ?? "");
  const [valueTypeStr, setValueTypeStr] = useState("2");
  const [value, setValue] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<ValueState | null>(null);
  const [result, setResult] = useState<PublishValueResult | null>(null);

  const trimmed = normalizeName(name);
  const nameOk = isValidName(trimmed);
  // The owner key is per-name: it's the derived key this wallet uses for `trimmed`.
  const ownerKey = ownerKeyForName(trimmed);
  const ownerPubkey = ownerKey?.ownerPubkey ?? null;
  const ownerPrivateKeyHex = ownerKey?.ownerPrivateKeyHex ?? null;
  const valueType = parseValueType(valueTypeStr);
  const valueOk = value.trim().length > 0;
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
        // Demo sandbox: ownership comes from your demo claims, not the resolver.
        if (!claims.some((c) => c.name === trimmed)) {
          setError(`Claim "${trimmed}" in demo first (Wallet → Claim a name).`);
          setState(null);
          setStep("input");
          return;
        }
        const used = values.filter((v) => v.name === trimmed).length;
        setState({
          name: trimmed,
          status: "claimed (demo)",
          currentOwnerPubkey: ownerPubkey,
          ownershipRef: accumulatorKeyForName(trimmed),
          currentSequence: used === 0 ? null : used,
          nextSequence: used + 1,
        });
        setStep("checked");
        return;
      }
      const s = await readValueState(trimmed);
      if (s === null) {
        setError(`The resolver doesn't know "${trimmed}" yet — it has to be claimed first.`);
        setState(null);
        setStep("input");
        return;
      }
      setState(s);
      setStep("checked");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the name's current state.");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!ownerPrivateKeyHex || valueType === null) return;
    setBusy(true);
    setError(null);
    try {
      const r = demo
        ? signValueForDemo({
            name: trimmed,
            ownerPrivateKeyHex,
            valueType,
            payloadUtf8: value.trim(),
            sequence: state?.nextSequence ?? 1,
          })
        : await publishNameValue(
            { name: trimmed, ownerPrivateKeyHex, valueType, payloadUtf8: value.trim() },
            { simulate: false },
          );
      setResult(r);
      setStep("done");
      if (r.simulated) {
        recordValue({ name: r.name, valueType: r.valueType, value: value.trim(), sequence: r.sequence, at: new Date().toISOString() });
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
      <Text style={styles.title}>Set a name's value</Text>
      <Text style={styles.subtitle}>Owner-signed value record · published to the resolver</Text>

      {!wallet ? (
        <Card style={styles.spaced}>
          <Text style={styles.cardLabel}>No wallet on this device</Text>
          <Text style={styles.cardHint}>
            A value record is signed by the name's owner key. Create a wallet first.
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

      {/* Current resolver state for the name: who owns it, the chain head. */}
      {step !== "input" && state ? (
        <>
          <SectionTitle>Current state</SectionTitle>
          <Card>
            <View style={styles.row}>
              <Text style={styles.cardLabel}>{state.name}</Text>
              <Badge label={owns ? "✓ owned by this wallet" : "not owned here"} tone={owns ? "success" : "warn"} />
            </View>
            <KV label="Status" value={state.status} />
            {state.ownershipRef ? (
              <KV label="Ownership ref" value={shortHex(state.ownershipRef, 10, 8)} mono />
            ) : null}
            <KV
              label="Value chain"
              value={
                state.currentSequence === null
                  ? "no value yet → next is seq 1"
                  : `head seq ${state.currentSequence} → next is seq ${state.nextSequence}`
              }
            />
            {!owns ? (
              <Text style={[styles.cardHint, { marginTop: spacing.sm }]}>
                Only the current owner key can publish a value for this name. The resolver rejects a
                record signed by any other key.
              </Text>
            ) : null}
          </Card>
        </>
      ) : null}

      {/* Value entry + publish (only when this wallet owns the name). */}
      {ownerPubkey ? (
        <>
          <SectionTitle>Value</SectionTitle>
          <Card>
            <Text style={styles.cardLabel}>Value type</Text>
            <Text style={styles.cardHint}>A single byte (0–255). By convention, 2 is a URL.</Text>
            <TextInput
              style={styles.input}
              value={valueTypeStr}
              onChangeText={(t) => {
                setValueTypeStr(t);
                if (step === "done") reset();
              }}
              placeholder="2"
              placeholderTextColor={colors.textFaint}
              keyboardType="number-pad"
              editable={step !== "done"}
            />
            {valueTypeStr.trim().length > 0 && valueType === null ? (
              <Text style={styles.inlineError}>Value type must be an integer from 0 to 255.</Text>
            ) : null}

            <Text style={[styles.cardLabel, { marginTop: spacing.md }]}>Value</Text>
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={(t) => {
                setValue(t);
                if (step === "done") reset();
              }}
              placeholder="https://example.com"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              editable={step !== "done"}
            />
          </Card>
        </>
      ) : null}

      {/* Actions */}
      {ownerPubkey && step === "input" ? (
        <View style={styles.actions}>
          <Button title="Check name" onPress={checkName} disabled={!nameOk} loading={busy} />
        </View>
      ) : null}

      {ownerPubkey && step === "checked" ? (
        <View style={styles.actions}>
          <Button
            title="Sign & publish value"
            onPress={publish}
            disabled={!owns || !valueOk || valueType === null}
            loading={busy}
          />
          <Button title="Start over" variant="secondary" onPress={reset} />
        </View>
      ) : null}

      {/* Result */}
      {step === "done" && result ? (
        <>
          <SectionTitle>Published</SectionTitle>
          <Card style={{ borderColor: colors.success }}>
            <View style={styles.row}>
              <Text style={[styles.cardLabel, { color: colors.success }]}>
                {result.simulated ? "Value record signed (demo)" : "Value record published"}
              </Text>
              <Badge label={result.simulated ? "demo · seq " + result.sequence : `seq ${result.sequence}`} tone={result.simulated ? "warn" : "success"} />
            </View>
            <Text style={styles.cardHint}>
              {result.simulated
                ? "Signed locally with your owner key and self-verified — not published in demo mode. Turn demo off on the Wallet screen to publish to the resolver."
                : "Signed locally with your owner key and verified by the resolver against the name's current owner and chain head before it was recorded."}
            </Text>
            <KV label="Type" value={String(result.valueType)} />
            <KV label="Value" value={value.trim()} />
            <KV label="Record hash" value={shortHex(result.recordHash, 12, 8)} mono />
            <KV label="Ownership ref" value={shortHex(result.ownershipRef, 10, 8)} mono />
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
