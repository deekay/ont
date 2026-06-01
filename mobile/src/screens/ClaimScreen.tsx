// Cheap-rail claim flow: the flat-gate (~₿1,000) path from the ONT one-path
// model. The screen drives the wallet's owner key through quote → pay → submit
// → verify, and trusts nothing the publisher says — every commitment is checked
// locally (see wallet/claim.ts). It is fully implemented but stays inert until a
// reachable publisher is configured (config.PUBLISHER_BASE); until then it shows
// the deterministic leaf a name would occupy so the local-verify guarantee is
// still legible.
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MockPublisherClient } from "../api/mock-publisher";
import {
  getPublisherClient,
  type PublisherClaimReceipt,
  type PublisherClientLike,
  type PublisherQuote,
} from "../api/publisher";
import { useDemoHoldings } from "../DemoHoldings";
import { useDemoMode } from "../DemoMode";
import { Badge, Button, Card, KV, SectionTitle } from "../components/ui";
import { formatAmount, formatDateTime, shortHex } from "../format";
import type { RootNav, RootStackParamList } from "../navigation/types";
import { colors, font, radius, spacing } from "../theme";
import {
  ConfirmedClaim,
  fetchVerifiedQuote,
  verifyConfirmedReceipt,
} from "../wallet/claim";
import { accumulatorKeyForName, isValidName } from "../wallet/accumulator";
import { checkNameAvailability, type NameAvailability } from "../wallet/availability";
import { useWallet } from "../wallet/WalletContext";

type Step = "input" | "quoted" | "pending" | "done";

export default function ClaimScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const route = useRoute<RouteProp<RootStackParamList, "Claim">>();
  const { wallet } = useWallet();
  const ownerPubkey = wallet?.owner.ownerPubkey ?? null;

  const { demo } = useDemoMode();
  const { claims, recordClaim } = useDemoHoldings();
  const client = useMemo<PublisherClientLike | null>(
    () => (demo ? new MockPublisherClient() : getPublisherClient()),
    [demo],
  );

  const [name, setName] = useState(route.params?.name ?? "");
  const [step, setStep] = useState<Step>("input");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<PublisherQuote | null>(null);
  const [paymentHash, setPaymentHash] = useState("");
  const [receipt, setReceipt] = useState<PublisherClaimReceipt | null>(null);
  const [verdict, setVerdict] = useState<ConfirmedClaim | null>(null);
  const [avail, setAvail] = useState<NameAvailability | null>(null);

  const trimmed = name.trim().toLowerCase();
  const nameOk = isValidName(trimmed);
  const previewLeaf = nameOk ? accumulatorKeyForName(trimmed) : null;

  function reset() {
    setStep("input");
    setQuote(null);
    setReceipt(null);
    setVerdict(null);
    setPaymentHash("");
    setError(null);
    setAvail(null);
  }

  async function getQuote() {
    if (!client || !ownerPubkey) return;
    setBusy(true);
    setError(null);
    setAvail(null);
    try {
      // The namespace is real even in demo; only the payment/anchor is faked. So
      // check the live resolver, then layer this device's demo claims on top.
      const demoOwned = demo && claims.some((c) => c.name === trimmed);
      const availability: NameAvailability = demoOwned
        ? { kind: "owned-by-you", record: null }
        : await checkNameAvailability(trimmed, ownerPubkey);
      if (availability.kind !== "available") {
        setAvail(availability);
        return;
      }
      const q = await fetchVerifiedQuote(client, { name: trimmed, ownerPubkey, rail: "lightning" });
      setQuote(q);
      setStep("quoted");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get a verified quote.");
    } finally {
      setBusy(false);
    }
  }

  async function submitClaim() {
    if (!client || !quote) return;
    setBusy(true);
    setError(null);
    try {
      const r = await client.submit({
        quoteId: quote.quoteId,
        paymentProof: {
          rail: "lightning",
          ...(paymentHash.trim() ? { paymentHash: paymentHash.trim() } : {}),
        },
      });
      applyReceipt(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed.");
    } finally {
      setBusy(false);
    }
  }

  async function checkStatus() {
    if (!client || !quote) return;
    setBusy(true);
    setError(null);
    try {
      const r = await client.status(quote.quoteId);
      applyReceipt(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Status check failed.");
    } finally {
      setBusy(false);
    }
  }

  function applyReceipt(r: PublisherClaimReceipt) {
    setReceipt(r);
    if (r.status === "confirmed") {
      const v = verifyConfirmedReceipt(r, { name: trimmed, ownerPubkey: ownerPubkey ?? "" });
      setVerdict(v);
      setStep("done");
      if (v.ok && client?.isDemo) {
        recordClaim({
          name: trimmed,
          anchorHeight: v.anchorHeight,
          noticeWindowCloseHeight: v.noticeWindowCloseHeight,
          at: new Date().toISOString(),
        });
      }
    } else {
      setVerdict(null);
      setStep("pending");
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Claim a name</Text>
      <Text style={styles.subtitle}>Flat-gate cheap rail · finalizes if uncontested</Text>
      {client?.isDemo ? (
        <View style={{ marginTop: spacing.sm, alignSelf: "flex-start" }}>
          <Badge label="demo mode · simulated payment" tone="warn" />
        </View>
      ) : null}

      {!ownerPubkey ? (
        <Card style={styles.spaced}>
          <Text style={styles.cardLabel}>No owner key on this device</Text>
          <Text style={styles.cardHint}>
            Claiming records your owner key as the name's accumulator value. Create or import a wallet first.
          </Text>
          <View style={styles.actions}>
            <Button title="Go to Wallet" onPress={() => nav.navigate("Tabs", { screen: "Wallet" })} />
          </View>
        </Card>
      ) : null}

      {/* Name entry + deterministic leaf preview (always available, no network needed). */}
      <SectionTitle>Name</SectionTitle>
      <Card>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={(t) => {
            setName(t);
            setAvail(null);
            if (step !== "input") reset();
          }}
          placeholder="lowercase alphanumeric, 1–32 chars"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          editable={step === "input"}
        />
        {trimmed.length > 0 && !nameOk ? (
          <Text style={styles.inlineError}>
            Names are lowercase a–z and 0–9, 1 to 32 characters.
          </Text>
        ) : null}
        {previewLeaf ? (
          <View style={styles.leafBox}>
            <Text style={styles.leafLabel}>Accumulator leaf · H(name)</Text>
            <Text selectable style={styles.mono}>
              {previewLeaf}
            </Text>
            <Text style={styles.cardHint}>
              The fixed 256-bit slot this name occupies. A quote that commits to any other leaf is
              rejected before payment.
            </Text>
          </View>
        ) : null}
      </Card>

      {/* Gated state: no reachable publisher configured. */}
      {!client ? (
        <>
          <SectionTitle>Cheap rail</SectionTitle>
          <Card>
            <View style={styles.row}>
              <Text style={styles.cardLabel}>Publisher not configured</Text>
              <Badge label="inert" tone="warn" />
            </View>
            <Text style={styles.cardHint}>
              The flat-gate rail pays a small invoice to a batching publisher, which anchors the
              claim to Bitcoin and returns an inclusion proof. The hosted publisher runs bound to
              localhost and isn't publicly reachable, so this build has no endpoint to call.
            </Text>
            <Text style={[styles.cardHint, { marginTop: spacing.sm }]}>
              The full flow and its local verification — leaf match, owner-key match, and inclusion
              proof against the anchored root — are implemented and unit-checked against the engine.
              Point config.PUBLISHER_BASE at a reachable publisher to activate it.
            </Text>
          </Card>
        </>
      ) : null}

      {/* Availability gate: a cheap claim only makes sense for an available name. */}
      {avail && avail.kind !== "available" ? (
        <Card style={[styles.spaced, { borderColor: colors.warn }]}>
          {avail.kind === "owned-by-you" ? (
            <>
              <Text style={[styles.cardLabel, { color: colors.warn }]}>You already own this name</Text>
              <Text style={styles.cardHint}>
                No need to claim it again — set its value or a recovery wallet instead.
              </Text>
              <View style={styles.actions}>
                {avail.record ? (
                  <Button
                    title="View name"
                    variant="secondary"
                    onPress={() => nav.navigate("NameDetail", { name: trimmed })}
                  />
                ) : (
                  <Button title="Go to My ONT" variant="secondary" onPress={() => nav.navigate("MyNames")} />
                )}
              </View>
            </>
          ) : avail.kind === "in-auction" ? (
            <>
              <Text style={[styles.cardLabel, { color: colors.warn }]}>This name is being contested</Text>
              <Text style={styles.cardHint}>
                Someone else wants it too, so it's gone to an auction. A cheap claim isn't possible
                while it's contested — bid in the auction instead.
              </Text>
              <View style={styles.actions}>
                <Button title="Go to auctions" onPress={() => nav.navigate("Tabs", { screen: "Auctions" })} />
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.cardLabel, { color: colors.warn }]}>This name is already claimed</Text>
              <Text style={styles.cardHint}>
                Another key owns it. You can view it, but a name that's already taken can't be claimed.
              </Text>
              <View style={styles.actions}>
                <Button
                  title="View name"
                  variant="secondary"
                  onPress={() => nav.navigate("NameDetail", { name: trimmed })}
                />
              </View>
            </>
          )}
        </Card>
      ) : null}

      {/* Active flow (only when a publisher is configured and a wallet exists). */}
      {client && ownerPubkey && step === "input" ? (
        <View style={styles.actions}>
          <Button
            title={avail && avail.kind !== "available" ? "Check again" : "Check availability & quote"}
            onPress={getQuote}
            disabled={!nameOk}
            loading={busy}
          />
        </View>
      ) : null}

      {client && quote && (step === "quoted" || step === "pending" || step === "done") ? (
        <>
          <SectionTitle>Quote</SectionTitle>
          <Card>
            <View style={styles.amountRow}>
              <Text style={styles.amountLabel}>Total</Text>
              <Text style={styles.amountValue}>{formatAmount(quote.totalBaseSats)}</Text>
            </View>
            <KV label="Gate" value={formatAmount(quote.gateBaseSats)} />
            <KV label="Service" value={formatAmount(quote.serviceBaseSats)} />
            <KV label="Expires" value={formatDateTime(quote.expiresAt)} />
            <View style={styles.verifyBox}>
              <Badge label="✓ leaf matches H(name)" tone="success" />
              <Badge label="✓ owner key matches wallet" tone="success" />
            </View>
          </Card>

          {quote.lightningInvoice ? (
            <>
              <SectionTitle>Pay</SectionTitle>
              <Card>
                <Text style={styles.cardHint}>
                  {client?.isDemo
                    ? "Demo invoice — no real payment. Tap Submit claim to simulate paying; you'll get back a real, verifiable inclusion proof (only the payment and anchor are synthetic)."
                    : "Pay this Lightning invoice from your own wallet, then submit. Nothing is recorded until the publisher anchors the claim and its proof verifies here."}
                </Text>
                <Text selectable style={[styles.mono, { marginTop: spacing.sm }]}>
                  {quote.lightningInvoice}
                </Text>
              </Card>
            </>
          ) : null}
        </>
      ) : null}

      {client && step === "quoted" ? (
        <Card style={styles.spaced}>
          <Text style={styles.cardLabel}>Payment hash (optional)</Text>
          <Text style={styles.cardHint}>Provide the preimage hash if your payer returns one.</Text>
          <TextInput
            style={styles.input}
            value={paymentHash}
            onChangeText={setPaymentHash}
            placeholder="payment hash"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.actions}>
            <Button title="Submit claim" onPress={submitClaim} loading={busy} />
            <Button title="Cancel" variant="secondary" onPress={reset} />
          </View>
        </Card>
      ) : null}

      {client && step === "pending" && receipt ? (
        <>
          <SectionTitle>Status</SectionTitle>
          <Card>
            <KV label="State" value={receipt.status} tone="warn" />
            {receipt.batchId ? <KV label="Batch" value={shortHex(receipt.batchId, 8, 6)} mono /> : null}
            {receipt.reason ? <KV label="Reason" value={receipt.reason} /> : null}
            <Text style={[styles.cardHint, { marginTop: spacing.sm }]}>
              Not anchored yet. Check again once the publisher batches and anchors the claim.
            </Text>
            <View style={styles.actions}>
              <Button title="Check status" onPress={checkStatus} loading={busy} />
              <Button title="Start over" variant="secondary" onPress={reset} />
            </View>
          </Card>
        </>
      ) : null}

      {client && step === "done" && verdict ? (
        <>
          <SectionTitle>Result</SectionTitle>
          {verdict.ok ? (
            <Card style={{ borderColor: colors.success }}>
              <View style={styles.row}>
                <Text style={[styles.cardLabel, { color: colors.success }]}>Inclusion proof verified</Text>
                <Badge label="provisional" tone="warn" />
              </View>
              <Text style={styles.cardHint}>
                The proof verifies locally against its anchored root and commits your owner key to
                this name. A cheap claim is provisional: it finalizes only if uncontested once the
                notice window closes.
              </Text>
              {verdict.anchorTxid ? (
                <KV label="Anchor txid" value={shortHex(verdict.anchorTxid, 12, 8)} mono />
              ) : null}
              {verdict.anchorHeight > 0 ? <KV label="Anchored at" value={`block ${verdict.anchorHeight}`} /> : null}
              {verdict.noticeWindowCloseHeight > 0 ? (
                <KV
                  label="Finalizes after"
                  value={`block ${verdict.noticeWindowCloseHeight} (${verdict.noticeWindowBlocks} blocks)`}
                />
              ) : null}
              <View style={styles.actions}>
                {nameOk ? (
                  <Button
                    title="View name"
                    variant="secondary"
                    onPress={() => nav.navigate("NameDetail", { name: trimmed })}
                  />
                ) : null}
                <Button title="Claim another" variant="secondary" onPress={reset} />
              </View>
            </Card>
          ) : (
            <Card style={{ borderColor: colors.danger }}>
              <Text style={[styles.cardLabel, { color: colors.danger }]}>Verification failed — not recorded</Text>
              {verdict.problems.map((p, i) => (
                <Text key={i} style={styles.inlineError}>
                  • {p}
                </Text>
              ))}
              <View style={styles.actions}>
                <Button title="Start over" variant="secondary" onPress={reset} />
              </View>
            </Card>
          )}
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
  mono: { fontFamily: font.mono, fontSize: 12, color: colors.text, lineHeight: 18 },
  leafBox: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  leafLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: spacing.xs },
  inlineError: { color: colors.danger, marginTop: spacing.xs, fontSize: 13, lineHeight: 18 },
  amountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  amountLabel: { color: colors.textMuted, fontSize: 14 },
  amountValue: { color: colors.text, fontWeight: "800", fontSize: 18 },
  verifyBox: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
});
