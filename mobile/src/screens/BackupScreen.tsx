// Encrypted backup + restore — the Lexe-shaped recovery flow.
//
// Backup encrypts the wallet secrets on-device (scrypt + XChaCha20-Poly1305,
// see wallet/backup.ts) under a freshly generated recovery code, then hands the
// ciphertext to a BackupProvider. Restore pulls the ciphertext back, decrypts
// with the recovery code, and imports the wallet. Today the provider is a local
// stub standing in for Google Drive / iCloud — the storage is faked, the
// encryption is real, and the provider only ever sees ciphertext.
import { useNavigation } from "@react-navigation/native";
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge, Button, Card, KV, SectionTitle } from "../components/ui";
import type { RootNav } from "../navigation/types";
import { colors, font, radius, spacing } from "../theme";
import {
  decryptWalletBackup,
  encryptWalletBackup,
  generateRecoveryCode,
  type EncryptedBackup,
} from "../wallet/backup";
import { LocalStubBackupProvider } from "../wallet/backup-provider";
import { useWallet } from "../wallet/WalletContext";

export default function BackupScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const { wallet, importHdWallet } = useWallet();
  const provider = useMemo(() => new LocalStubBackupProvider(), []);

  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  const [restoreCode, setRestoreCode] = useState("");
  const [restorePass, setRestorePass] = useState("");
  const [restored, setRestored] = useState(false);

  async function backUp() {
    if (!wallet) return;
    setBusy(true);
    setError(null);
    try {
      const code = generateRecoveryCode();
      const blob = encryptWalletBackup(
        {
          seedHex: wallet.seedHex,
          names: wallet.names,
          nextIndex: wallet.nextIndex,
          network: wallet.network,
        },
        code,
        passphrase,
      );
      await provider.save(blob);
      setCreatedCode(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    setError(null);
    try {
      const blob: EncryptedBackup | null = await provider.load();
      if (!blob) {
        throw new Error("No backup found in this location.");
      }
      const payload = decryptWalletBackup(blob, restoreCode, restorePass);
      await importHdWallet({ seedHex: payload.seedHex, names: payload.names, nextIndex: payload.nextIndex });
      setRestored(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed.");
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
      <Text style={styles.title}>Back up / restore</Text>
      <Text style={styles.subtitle}>Encrypted on-device · recovery code never leaves the phone</Text>
      <View style={{ marginTop: spacing.sm, alignSelf: "flex-start" }}>
        <Badge label={`demo storage · ${provider.label}`} tone="warn" />
      </View>

      <Card style={styles.spaced}>
        <Text style={styles.cardHint}>
          Your keys are encrypted on this device (scrypt + XChaCha20-Poly1305) under a recovery code,
          then stored. Only the storage is simulated locally for now — Google Drive and iCloud plug in
          behind the same interface, and only ever see ciphertext.
        </Text>
      </Card>

      {/* ---- Back up (needs a wallet) ---- */}
      {wallet ? (
        <>
          <SectionTitle>Back up this wallet</SectionTitle>
          {createdCode ? (
            <Card style={{ borderColor: colors.success }}>
              <View style={styles.row}>
                <Text style={[styles.cardLabel, { color: colors.success }]}>Backup created</Text>
                <Badge label="saved" tone="success" />
              </View>
              <Text style={styles.cardHint}>
                Write this recovery code down and keep it safe. It is the only way to decrypt the
                backup — it is not stored anywhere and cannot be recovered.
              </Text>
              <View style={styles.codeBox}>
                <Text selectable style={styles.code}>
                  {createdCode}
                </Text>
              </View>
              {passphrase ? (
                <Text style={styles.cardHint}>You also set a passphrase — both are required to restore.</Text>
              ) : null}
              <View style={styles.actions}>
                <Button title="Done" variant="secondary" onPress={() => setCreatedCode(null)} />
              </View>
            </Card>
          ) : (
            <Card>
              <Text style={styles.cardLabel}>Optional passphrase</Text>
              <Text style={styles.cardHint}>
                A second factor on top of the recovery code. Leave blank to use the code alone.
              </Text>
              <TextInput
                style={styles.input}
                value={passphrase}
                onChangeText={setPassphrase}
                placeholder="(optional)"
                placeholderTextColor={colors.textFaint}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.actions}>
                <Button title="Create encrypted backup" onPress={backUp} loading={busy} />
              </View>
            </Card>
          )}
        </>
      ) : null}

      {/* ---- Restore ---- */}
      <SectionTitle>Restore from a backup</SectionTitle>
      {restored ? (
        <Card style={{ borderColor: colors.success }}>
          <Text style={[styles.cardLabel, { color: colors.success }]}>Wallet restored</Text>
          <Text style={styles.cardHint}>
            The backup decrypted and your keys are back in the device Keychain.
          </Text>
          <View style={styles.actions}>
            <Button title="Go to Wallet" onPress={() => nav.navigate("Tabs", { screen: "Wallet" })} />
          </View>
        </Card>
      ) : (
        <Card>
          {wallet ? (
            <Text style={styles.cardHint}>
              Restoring replaces the wallet currently on this device. Make sure it is backed up first.
            </Text>
          ) : null}
          <Text style={[styles.cardLabel, { marginTop: wallet ? spacing.sm : 0 }]}>Recovery code</Text>
          <TextInput
            style={styles.input}
            value={restoreCode}
            onChangeText={setRestoreCode}
            placeholder="xxxx-xxxx-xxxx-…"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={[styles.cardLabel, { marginTop: spacing.md }]}>Passphrase (if you set one)</Text>
          <TextInput
            style={styles.input}
            value={restorePass}
            onChangeText={setRestorePass}
            placeholder="(optional)"
            placeholderTextColor={colors.textFaint}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.actions}>
            <Button
              title="Restore wallet"
              onPress={restore}
              disabled={restoreCode.trim().length === 0}
              loading={busy}
            />
          </View>
        </Card>
      )}

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
  cardLabel: { color: colors.text, fontWeight: "700", fontSize: 14 },
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
  codeBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.success,
  },
  code: { fontFamily: font.mono, fontSize: 18, color: colors.text, letterSpacing: 1, textAlign: "center" },
  inlineError: { color: colors.danger, fontSize: 13, lineHeight: 18 },
});
