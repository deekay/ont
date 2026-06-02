// Transfer a name to another person's owner key.
//
// Coordination: the recipient generates a key in their own wallet and gives you
// only their x-only owner pubkey. You sign a transfer authorization with the
// name's CURRENT owner key (the per-name derived key), naming their pubkey as the
// new owner. The signature is real and self-verified.
//
// Settling it on-chain: for a MATURE name (the simple path) we build a real
// transaction — funding input → OP_RETURN(authorization) → change — and broadcast
// it via the esplora shim. The engine re-checks the signature against the current
// owner before rewriting ownership. Demo mode simulates the broadcast; an immature
// name's on-chain transfer (which needs a successor bond) isn't built yet.
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
import { isValidName, normalizeName } from "../wallet/accumulator";
import { generateOwnerKey } from "../wallet/keys";
import {
  broadcastMatureTransfer,
  demoPrevStateTxid,
  readTransferState,
  signTransfer,
  type BroadcastedTransfer,
  type SignedTransfer,
  type TransferState,
} from "../wallet/transfer-write";
import { useWallet } from "../wallet/WalletContext";

type Step = "input" | "checked" | "done";

export default function TransferScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const route = useRoute<RouteProp<RootStackParamList, "Transfer">>();
  const { wallet, ownerKeyForName } = useWallet();
  const { demo } = useDemoMode();
  const { claims, recordTransfer } = useDemoHoldings();

  const [name, setName] = useState(route.params?.name ?? "");
  const [recipient, setRecipient] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<TransferState | null>(null);
  const [result, setResult] = useState<SignedTransfer | null>(null);
  const [broadcast, setBroadcast] = useState<BroadcastedTransfer | null>(null);

  const trimmed = normalizeName(name);
  const nameOk = isValidName(trimmed);
  const ownerKey = ownerKeyForName(trimmed);
  const ownerPubkey = ownerKey?.ownerPubkey ?? null;
  const recipientOk = /^[0-9a-f]{64}$/i.test(recipient.trim());
  const recipientIsSelf = recipientOk && recipient.trim().toLowerCase() === (ownerPubkey ?? "").toLowerCase();
  const owns =
    state != null &&
    ownerPubkey != null &&
    (state.currentOwnerPubkey ?? "").toLowerCase() === ownerPubkey.toLowerCase();
  // On-chain settlement via the simple path is valid only for a mature name; an
  // immature name's transfer needs a successor bond (not built into the app yet).
  const canBroadcast = !demo && state?.status === "mature";

  function reset() {
    setStep("input");
    setState(null);
    setResult(null);
    setBroadcast(null);
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
        setState({
          name: trimmed,
          status: "claimed (demo)",
          currentOwnerPubkey: ownerPubkey,
          prevStateTxid: demoPrevStateTxid(trimmed),
        });
        setStep("checked");
        return;
      }
      const s = await readTransferState(trimmed);
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

  function useDemoRecipient() {
    // Generate a throwaway recipient key so the transfer is walkable solo in demo.
    setRecipient(generateOwnerKey().ownerPubkey);
  }

  async function doTransfer() {
    if (!ownerKey || !ownerPubkey || !state?.prevStateTxid || !wallet) return;
    setBusy(true);
    setError(null);
    try {
      const signed = signTransfer({
        name: trimmed,
        ownerPrivateKeyHex: ownerKey.ownerPrivateKeyHex,
        ownerPubkey,
        newOwnerPubkey: recipient.trim(),
        prevStateTxid: state.prevStateTxid,
      });

      if (demo) {
        recordTransfer({ name: signed.name, newOwnerPubkey: signed.newOwnerPubkey, at: new Date().toISOString() });
        setResult(signed);
        setStep("done");
        return;
      }

      if (canBroadcast) {
        // Build, sign, and broadcast the real on-chain transfer transaction.
        const b = await broadcastMatureTransfer({
          signed,
          seedHex: wallet.seedHex,
          network: wallet.network,
        });
        setBroadcast(b);
      }
      setResult(signed);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer failed.");
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
      <Text style={styles.title}>Transfer a name</Text>
      <Text style={styles.subtitle}>Hand ownership to someone else's owner key</Text>
      {demo ? (
        <View style={{ marginTop: spacing.sm, alignSelf: "flex-start" }}>
          <Badge label="demo · broadcast simulated" tone="warn" />
        </View>
      ) : null}

      {!wallet ? (
        <Card style={styles.spaced}>
          <Text style={styles.cardLabel}>No wallet on this device</Text>
          <Text style={styles.cardHint}>A transfer is signed by the name's owner key. Create a wallet first.</Text>
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
            {state.prevStateTxid ? <KV label="Prev state txid" value={shortHex(state.prevStateTxid, 10, 8)} mono /> : null}
            {!owns ? (
              <Text style={[styles.cardHint, { marginTop: spacing.sm }]}>
                Only the current owner key can transfer this name.
              </Text>
            ) : null}
            {owns && !demo && state.status === "mature" ? (
              <Text style={[styles.cardHint, { marginTop: spacing.sm }]}>
                Mature — signing broadcasts the transfer on-chain and pays a small network fee from
                your funding balance.
              </Text>
            ) : null}
            {owns && !demo && state.status !== "mature" ? (
              <Text style={[styles.cardHint, { marginTop: spacing.sm }]}>
                This name isn't mature yet, so it can't settle on-chain here (that path needs a
                successor bond). You can still sign the authorization.
              </Text>
            ) : null}
          </Card>
        </>
      ) : null}

      {wallet ? (
        <>
          <SectionTitle>Recipient owner key</SectionTitle>
          <Card>
            <Text style={styles.cardHint}>
              The recipient generates a key in their own wallet and gives you only their owner pubkey
              (32 bytes of hex). Their private key never leaves their device.
            </Text>
            <TextInput
              style={styles.input}
              value={recipient}
              onChangeText={(t) => {
                setRecipient(t);
                if (step === "done") reset();
              }}
              placeholder="recipient x-only owner pubkey (64 hex)"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              editable={step !== "done"}
            />
            {recipient.trim().length > 0 && !recipientOk ? (
              <Text style={styles.inlineError}>An owner key is 64 hex characters (32 bytes).</Text>
            ) : null}
            {recipientIsSelf ? (
              <Text style={styles.inlineError}>That's this name's own key — pick a different recipient.</Text>
            ) : null}
            {demo && step !== "done" ? (
              <View style={styles.actions}>
                <Button title="Use a demo recipient" variant="secondary" onPress={useDemoRecipient} />
              </View>
            ) : null}
          </Card>
        </>
      ) : null}

      {wallet && step === "input" ? (
        <View style={styles.actions}>
          <Button title="Check name" onPress={checkName} disabled={!nameOk} loading={busy} />
        </View>
      ) : null}

      {wallet && step === "checked" ? (
        <View style={styles.actions}>
          <Button
            title={
              demo
                ? "Sign & transfer (demo)"
                : canBroadcast
                  ? "Sign & broadcast on-chain"
                  : "Sign transfer authorization"
            }
            onPress={doTransfer}
            disabled={!owns || !recipientOk || recipientIsSelf || !state?.prevStateTxid}
            loading={busy}
          />
          <Button title="Start over" variant="secondary" onPress={reset} />
        </View>
      ) : null}

      {step === "done" && result ? (
        <>
          <SectionTitle>
            {demo ? "Transferred (demo)" : broadcast ? "Broadcast on-chain" : "Authorization signed"}
          </SectionTitle>
          <Card style={{ borderColor: colors.success }}>
            <View style={styles.row}>
              <Text style={[styles.cardLabel, { color: colors.success }]}>
                {demo ? "Transfer simulated" : broadcast ? "Transfer broadcast" : "Transfer authorization signed"}
              </Text>
              <Badge
                label={demo ? "demo" : broadcast ? "on-chain" : "signed"}
                tone={demo ? "warn" : "success"}
              />
            </View>
            <Text style={styles.cardHint}>
              {demo
                ? "Signed for real with this name's owner key and self-verified. In a real broadcast this OP_RETURN hands the name to the recipient; the consensus engine re-checks your signature against the current owner before rewriting ownership."
                : broadcast
                  ? "Broadcast to the network. Once it confirms, the indexer reads the OP_RETURN, re-checks your signature against the current owner, and reassigns the name to the recipient's key."
                  : "Signed for real with this name's owner key and self-verified. This name isn't mature yet, so its on-chain settlement (which needs a successor bond) isn't built into the app — hand this authorization to the on-chain settle step."}
            </Text>
            <KV label="New owner" value={shortHex(result.newOwnerPubkey, 10, 8)} mono />
            {broadcast ? (
              <>
                <KV label="Txid" value={shortHex(broadcast.txid, 12, 8)} mono />
                <KV label="Network fee" value={`₿${broadcast.feeSats.toLocaleString()} (${broadcast.vbytes} vB)`} />
              </>
            ) : (
              <>
                <KV label="Auth hash" value={shortHex(result.authHash, 12, 8)} mono />
                <KV label="Signature" value={shortHex(result.signature, 12, 8)} mono />
              </>
            )}
            <View style={styles.actions}>
              <Button title="View name" variant="secondary" onPress={() => nav.navigate("NameDetail", { name: trimmed })} />
              <Button title="Transfer another" variant="secondary" onPress={reset} />
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
