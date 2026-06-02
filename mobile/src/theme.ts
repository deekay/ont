/** Single source of design tokens for the ONT mobile client. */
export const colors = {
  bg: "#FAFAF7",
  surface: "#FFFFFF",
  surfaceAlt: "#F4F4F1",
  border: "#E7E6E0",
  borderStrong: "#D6D5CD",

  text: "#16140F",
  textMuted: "#6A675D",
  textFaint: "#9A968A",

  // Bitcoin-anchored accent.
  accent: "#F7931A",
  accentSoft: "#FDEED7",
  accentInk: "#8A4B00",

  success: "#1B7F4B",
  successSoft: "#E2F2E8",
  warn: "#B45309",
  warnSoft: "#FBEBD7",
  danger: "#C2362B",
  dangerSoft: "#F8E3E0",
  info: "#2563EB",
  infoSoft: "#E4ECFD",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const font = {
  // iOS system font; monospace for hashes / keys / amounts.
  mono: "Menlo",
} as const;

export type StatusTone = "neutral" | "accent" | "success" | "warn" | "danger" | "info";

export const toneColors: Record<StatusTone, { fg: string; bg: string }> = {
  neutral: { fg: colors.textMuted, bg: colors.surfaceAlt },
  accent: { fg: colors.accentInk, bg: colors.accentSoft },
  success: { fg: colors.success, bg: colors.successSoft },
  warn: { fg: colors.warn, bg: colors.warnSoft },
  danger: { fg: colors.danger, bg: colors.dangerSoft },
  info: { fg: colors.info, bg: colors.infoSoft },
};
