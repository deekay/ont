/**
 * Live ONT infrastructure endpoints.
 *
 * The app talks to the hosted private-signet stack over public HTTPS:
 *   - resolver read API + value-record writes live under /api/*
 *   - the esplora-shaped shim (funding scan + broadcast) lives under /esplora/*
 *
 * These are the same endpoints the reference web client and CLI use, so the
 * mobile client reuses the validated surface with no shim-layer changes.
 */
export const ONT_HOST = "https://opennametags.org";

export const API_BASE = `${ONT_HOST}/api`;
export const ESPLORA_BASE = `${ONT_HOST}/esplora`;

/** Private signet — owner keys are x-only Schnorr; funding addresses are bech32 tb1q…. */
export const NETWORK = "signet" as const;

/**
 * Bitcoin-first display convention.
 * Amounts come off the wire as integer base units (strings). We render them as
 * ₿<integer> and offer an approximate dollar helper anchored at ₿1,000 ≈ $1
 * (i.e. ~$100k / 1 BTC). Never surface the legacy unit name in prose.
 */
export const BASE_UNITS_PER_USD = 1000;

/**
 * Cheap-rail publisher endpoint (the batching service behind the flat ~₿1,000
 * claim). The claim flow is fully implemented and verifies every publisher
 * response locally against the anchored accumulator root before recording
 * anything — but it stays inert until a deployment supplies a reachable base
 * URL here.
 *
 * Unset by default on purpose: the hosted publisher runs bound to localhost on
 * the infrastructure host and is not publicly reachable, so there is no public
 * URL to default to. When null the Claim screen shows a clear "not configured"
 * state instead of attempting a request.
 */
export const PUBLISHER_BASE: string | null = null;

/**
 * Demo mode default.
 *
 * Lexe-shaped pieces that don't exist on the private signet — the Lightning
 * payment for a cheap-rail claim, and cloud backup — are stubbed locally so the
 * full app is walkable end to end without mainnet/Lexe/Google. Demo mode swaps a
 * MockPublisherClient in for the (unreachable) real publisher: synthetic quote,
 * a simulated payment, and a receipt whose inclusion proof is *real* and is
 * checked by the real verifier against a self-consistent synthetic root.
 *
 * Honest by construction: only the external service (payment / anchor) is faked;
 * the cryptographic verification still runs. Toggle at runtime on the Wallet
 * screen. Production builds will default this to false.
 */
export const DEMO_MODE_DEFAULT = true;

/**
 * Notice/contest window for a cheap-rail claim, in blocks. A cheap claim is
 * provisional when anchored: it finalizes only if uncontested once this window
 * closes (ONT one-path model). Mirrors the engine's DEFAULT_NOTICE_WINDOW_BLOCKS.
 */
export const NOTICE_WINDOW_BLOCKS = 6;
