/**
 * App configuration, keyed by network so flipping to mainnet is one change.
 *
 * The app talks to a hosted ONT stack over public HTTPS:
 *   - resolver read API (+ value-record writes) under /api/*
 *   - the esplora-shaped shim (funding scan + broadcast) under /esplora/*
 *
 * To go to mainnet: set ACTIVE_NETWORK = "main" and fill the mainnet host below.
 * Everything else (addresses, display, write paths) follows from NETWORK.
 */
type OntNetworkName = "main" | "signet";

interface NetworkConfig {
  readonly network: OntNetworkName;
  readonly host: string;
  readonly label: string;
}

/** The single switch. Flip to "main" (and set its host) to point at mainnet. */
const ACTIVE_NETWORK: OntNetworkName = "signet";

const NETWORKS: Record<OntNetworkName, NetworkConfig> = {
  signet: {
    network: "signet",
    host: "https://opennametags.org",
    label: "Private signet",
  },
  main: {
    network: "main",
    // TODO: point at the mainnet stack when it exists. Placeholder until then.
    host: "https://opennametags.org",
    label: "Mainnet",
  },
};

const active = NETWORKS[ACTIVE_NETWORK];

export const ONT_HOST = active.host;
export const API_BASE = `${ONT_HOST}/api`;
export const ESPLORA_BASE = `${ONT_HOST}/esplora`;

/** Owner keys are x-only Schnorr; funding addresses are bech32 (tb1q… on signet). */
export const NETWORK = active.network;
export const NETWORK_LABEL = active.label;

/**
 * Bitcoin-first display convention. Amounts come off the wire as integer base
 * units (strings). We render them as ₿<integer> with an approximate dollar
 * helper anchored at ₿1,000 ≈ $1 (~$100k / 1 BTC). Never surface the legacy
 * unit name in prose.
 */
export const BASE_UNITS_PER_USD = 1000;

/**
 * Cheap-rail publisher endpoint (the batching service behind the flat ~₿1,000
 * claim). Null by default: the hosted publisher binds to localhost on the infra
 * host and isn't publicly reachable. When demo mode is on, the Claim screen uses
 * a local mock; with demo off and this set, it uses the live publisher.
 */
export const PUBLISHER_BASE: string | null = null;

/**
 * Notice/contest window for a cheap-rail claim, in blocks. A cheap claim is
 * provisional when anchored: it finalizes only if uncontested once this window
 * closes (ONT one-path model). Mirrors the engine's DEFAULT_NOTICE_WINDOW_BLOCKS.
 */
export const NOTICE_WINDOW_BLOCKS = 6;

/**
 * Demo mode default. Lexe-shaped pieces that don't exist on the private signet
 * (the Lightning payment for a cheap-rail claim; cloud backup) are stubbed
 * locally so the whole app is walkable without mainnet/Lexe/Google. Demo mode
 * fakes the external service, never the crypto. Toggle at runtime on the Wallet
 * screen; production builds will default this to false.
 */
export const DEMO_MODE_DEFAULT = true;

/**
 * Private-signet test faucet. The hosted funding endpoint
 * (POST { address, amountSats } → sends from the auto-miner wallet and mines a
 * block) is enabled on the "/ont-private" demo deployment — the public-root
 * vhost has it off — so we target that path directly. Null on mainnet: there is
 * no faucet for real bitcoin. Signet coins are worthless test coins, which is
 * exactly what makes them useful for exercising real on-chain flows.
 */
export const FAUCET_URL: string | null =
  NETWORK === "signet" ? `${ONT_HOST}/ont-private/api/private-signet-fund` : null;

/** Base units requested per faucet tap (₿1,000,000 ≈ $1,000 of signet coins). */
export const FAUCET_REQUEST_SATS = 1_000_000;
