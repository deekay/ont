import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { colors, font, radius, spacing, StatusTone, toneColors } from "../theme";

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  onPress?: () => void;
}) {
  const content = <View style={[styles.card, style]}>{children}</View>;
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

export function Badge({ label, tone = "neutral" }: { label: string; tone?: StatusTone }) {
  const c = toneColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function KV({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: StatusTone;
}) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text
        style={[styles.kvValue, mono && styles.mono, tone && { color: toneColors[tone].fg }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function Mono({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.mono, style]}>{children}</Text>;
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} />
      {label ? <Text style={styles.centerText}>{label}</Text> : null}
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorBody}>{error.message}</Text>
      {onRetry ? <Button title="Retry" onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

export function Empty({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.centerText}>{subtitle}</Text> : null}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
}) {
  const bg =
    variant === "primary" ? colors.accent : variant === "danger" ? colors.danger : colors.surfaceAlt;
  const fg = variant === "secondary" ? colors.text : "#fff";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  pressed: { opacity: 0.7 },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 12, fontWeight: "600", letterSpacing: 0.2 },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
    gap: spacing.lg,
  },
  kvLabel: { color: colors.textMuted, fontSize: 14, flexShrink: 0 },
  kvValue: { color: colors.text, fontSize: 14, fontWeight: "500", flexShrink: 1, textAlign: "right" },
  mono: { fontFamily: font.mono, fontSize: 13 },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  center: { alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.md },
  centerText: { color: colors.textMuted, textAlign: "center" },
  errorTitle: { color: colors.danger, fontWeight: "700", fontSize: 16 },
  errorBody: { color: colors.textMuted, textAlign: "center" },
  emptyTitle: { color: colors.text, fontWeight: "600", fontSize: 16 },
  button: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    flexShrink: 1,
  },
  buttonText: { fontSize: 16, fontWeight: "600" },
});
