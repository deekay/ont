// Deposit / funding — the wallet's funding address (pays on-chain fees + bonds),
// its live balance, and guidance to send coins. On signet there's no in-app
// buy; you fund the address from an external wallet or the signet faucet.
import { useNavigation } from "@react-navigation/native";
import React from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { chain, type EsploraUtxo } from "../api/resolver";
import { Badge, Button, Card, Empty, ErrorView, KV, Loading, SectionTitle } from "../components/ui";
import { NETWORK } from "../config";
import { formatAmount } from "../format";
import { useAsync } from "../hooks/useAsync";
import type { RootNav } from "../navigation/types";
import { colors, font, radius, spacing } from "../theme";
import { useWallet } from "../wallet/WalletContext";

interface FundingData {
  readonly utxos: EsploraUtxo[];
  readonly total: number;
  readonly confirmed: number;
}

export default function DepositScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const { wallet } = useWallet();
  const address = wallet?.funding.fundingAddress ?? null;

  const funding = useAsync<FundingData>(async () => {
    if (!address) return { utxos: [], total: 0, confirmed: 0 };
    const utxos = await chain.addressUtxos(address);
    const total = utxos.reduce((sum, u) => sum + (u?.value ?? 0), 0);
    const confirmed = utxos.filter((u) => u?.status?.confirmed).reduce((sum, u) => sum + (u?.value ?? 0), 0);
    return { utxos, total, confirmed };
  }, [address]);

  if (!wallet || !address) {
    return <Empty title="No wallet" subtitle="Create or import a wallet to get a funding address." />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
      refreshControl={
        <RefreshControl refreshing={funding.refreshing} onRefresh={funding.refresh} tintColor={colors.accent} />
      }
    >
      <Text style={styles.title}>Deposit</Text>
      <Text style={styles.subtitle}>Fund the wallet to pay fees + bonds</Text>

      <SectionTitle right={<Badge label={NETWORK} tone="accent" />}>Funding address · P2WPKH</SectionTitle>
      <Card>
        <Text selectable style={styles.address}>
          {address}
        </Text>
        <Text style={styles.hint}>
          Send {NETWORK} coins to this address from any wallet (or the {NETWORK} faucet). The funding key
          pays on-chain fees and auction bonds; it never holds a Lightning balance.
        </Text>
      </Card>

      <SectionTitle>Balance</SectionTitle>
      {funding.loading && !funding.data ? (
        <Loading label="Scanning UTXOs…" />
      ) : funding.error && !funding.data ? (
        <ErrorView error={funding.error} onRetry={funding.reload} />
      ) : funding.data ? (
        <Card>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Total</Text>
            <Text style={styles.balanceValue}>{formatAmount(funding.data.total)}</Text>
          </View>
          {funding.data.total !== funding.data.confirmed ? (
            <KV label="Confirmed" value={formatAmount(funding.data.confirmed)} />
          ) : null}
          <KV label="UTXOs" value={String(funding.data.utxos.length)} />
        </Card>
      ) : null}

      <View style={{ marginTop: spacing.lg }}>
        <Button title="Back to Wallet" variant="secondary" onPress={() => nav.navigate("Tabs", { screen: "Wallet" })} />
      </View>
      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 30, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  subtitle: { color: colors.textMuted, marginTop: 2 },
  address: {
    fontFamily: font.mono,
    fontSize: 14,
    color: colors.text,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    lineHeight: 20,
  },
  hint: { color: colors.textMuted, fontSize: 13, marginTop: spacing.sm, lineHeight: 18 },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  balanceLabel: { color: colors.textMuted, fontSize: 14 },
  balanceValue: { color: colors.text, fontWeight: "800", fontSize: 20 },
});
