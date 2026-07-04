import type { BitcoinDifficultyCheckpoint, BitcoinNetworkParams } from "@ont/bitcoin";

export type LaunchBitcoinNetwork = "signet";
export type LaunchBitcoinDifficultyCheckpoint = BitcoinDifficultyCheckpoint;

export const LAUNCH_BITCOIN_NETWORKS = ["signet"] as const satisfies readonly LaunchBitcoinNetwork[];

// Launch-client verification depth for the current hermetic/signet test deployment posture. This is not
// consensus law: clients use it to decide whether a verified inclusion has enough validated header coverage
// to be displayed as Bitcoin-verified. Provenance: da-windows (#49) S7 provisional K=6 for conformance/test
// deployments; final launch values freeze later.
export const LAUNCH_CONFIRMATION_DEPTH = 6;

// PoW retarget parameters consumed by @ont/bitcoin. Signet challenge validation
// and active-chain freshness are launch-client/provider policy, not this config.
export const SIGNET_BITCOIN_NETWORK_PARAMS = {
  powLimitHex: "00000377ae000000000000000000000000000000000000000000000000000000",
  powTargetTimespan: 14 * 24 * 60 * 60,
  powRetargetInterval: 2016,
} as const satisfies BitcoinNetworkParams;

export const SIGNET_BITCOIN_DIFFICULTY_CHECKPOINT = {
  height: 311_445,
  hashHex: "00000003039bc6bf57032bcc38bbba04126f8e0dee75f5ace50e099753b51953",
  bits: 0x1d1539c3,
  time: 1_783_028_953,
  epochStartTime: 1_782_456_498,
  cumulativeWorkHex: "eafb567b00e",
} as const satisfies BitcoinDifficultyCheckpoint;

export const PRIVATE_SIGNET_GENESIS_DIFFICULTY_CHECKPOINT = {
  height: 0,
  hashHex: "00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6",
  bits: 0x1e0377ae,
  time: 1_598_918_400,
  epochStartTime: 1_598_918_400,
  cumulativeWorkHex: "49d414",
} as const satisfies BitcoinDifficultyCheckpoint;

export const SIGNET_LAUNCH_CHECKPOINT_ENV = {
  height: "ONT_LAUNCH_CHECKPOINT_HEIGHT",
  hashHex: "ONT_LAUNCH_CHECKPOINT_HASH",
  bits: "ONT_LAUNCH_CHECKPOINT_BITS",
  time: "ONT_LAUNCH_CHECKPOINT_TIME",
  epochStartTime: "ONT_LAUNCH_CHECKPOINT_EPOCH_START",
  cumulativeWorkHex: "ONT_LAUNCH_CHECKPOINT_WORK",
} as const;

export const SIGNET_LAUNCH_CHECKPOINT_ENV_KEYS = [
  SIGNET_LAUNCH_CHECKPOINT_ENV.height,
  SIGNET_LAUNCH_CHECKPOINT_ENV.hashHex,
  SIGNET_LAUNCH_CHECKPOINT_ENV.bits,
  SIGNET_LAUNCH_CHECKPOINT_ENV.time,
  SIGNET_LAUNCH_CHECKPOINT_ENV.epochStartTime,
  SIGNET_LAUNCH_CHECKPOINT_ENV.cumulativeWorkHex,
] as const;

export type SignetLaunchCheckpointEnv = Record<string, string | undefined>;

export function signetLaunchCheckpointId(checkpoint: BitcoinDifficultyCheckpoint): string {
  return `signet:${checkpoint.height}:${checkpoint.hashHex}`;
}

export const SIGNET_LAUNCH_CHECKPOINT_ID = signetLaunchCheckpointId(SIGNET_BITCOIN_DIFFICULTY_CHECKPOINT);

export function readSignetLaunchDifficultyCheckpointOverride(
  env: SignetLaunchCheckpointEnv,
): BitcoinDifficultyCheckpoint | null {
  const present = SIGNET_LAUNCH_CHECKPOINT_ENV_KEYS.filter((key) => env[key] !== undefined);
  if (present.length === 0) return null;
  if (present.length !== SIGNET_LAUNCH_CHECKPOINT_ENV_KEYS.length) {
    const missing = SIGNET_LAUNCH_CHECKPOINT_ENV_KEYS.filter((key) => env[key] === undefined);
    throw new Error(`partial signet launch checkpoint override: missing ${missing.join(", ")}`);
  }

  return {
    height: readNonNegativeSafeInteger(env, SIGNET_LAUNCH_CHECKPOINT_ENV.height),
    hashHex: readLowerHex(env, SIGNET_LAUNCH_CHECKPOINT_ENV.hashHex, 64),
    bits: readCompactBits(env, SIGNET_LAUNCH_CHECKPOINT_ENV.bits),
    time: readNonNegativeSafeInteger(env, SIGNET_LAUNCH_CHECKPOINT_ENV.time),
    epochStartTime: readNonNegativeSafeInteger(env, SIGNET_LAUNCH_CHECKPOINT_ENV.epochStartTime),
    cumulativeWorkHex: readLowerHex(env, SIGNET_LAUNCH_CHECKPOINT_ENV.cumulativeWorkHex),
  };
}

export function selectSignetLaunchDifficultyCheckpoint(env: SignetLaunchCheckpointEnv): BitcoinDifficultyCheckpoint {
  return readSignetLaunchDifficultyCheckpointOverride(env) ?? SIGNET_BITCOIN_DIFFICULTY_CHECKPOINT;
}

// BIP325 default signet challenge scriptPubKey. Header validation does not
// consume this yet; GA-SIGNET-SOLUTION will validate block solution material
// against it once clients carry the needed coinbase/witness data.
export const SIGNET_CHALLENGE_SCRIPT_PUBKEY_HEX =
  "512103ad5e0edad18cb1f0fc0d28a3d4f1f3e445640337489abb10404f2d1e086be430210359ef5021964fe22d6f8e05b2463c9540ce96883fe3b278760f048f5189f2e6c452ae";

export const BITCOIN_NETWORK_PARAMS_BY_NETWORK = {
  signet: SIGNET_BITCOIN_NETWORK_PARAMS,
} as const satisfies Record<LaunchBitcoinNetwork, BitcoinNetworkParams>;

export const BITCOIN_DIFFICULTY_CHECKPOINT_BY_NETWORK = {
  signet: SIGNET_BITCOIN_DIFFICULTY_CHECKPOINT,
} as const satisfies Record<LaunchBitcoinNetwork, BitcoinDifficultyCheckpoint>;

export const SIGNET_CHALLENGE_SCRIPT_PUBKEY_BY_NETWORK = {
  signet: SIGNET_CHALLENGE_SCRIPT_PUBKEY_HEX,
} as const satisfies Record<LaunchBitcoinNetwork, string>;

function readRequired(env: SignetLaunchCheckpointEnv, key: string): string {
  const raw = env[key];
  if (raw === undefined) throw new Error(`${key} is required`);
  const value = raw.trim();
  if (value === "") throw new Error(`${key} is set but empty`);
  return value;
}

function readNonNegativeSafeInteger(env: SignetLaunchCheckpointEnv, key: string): number {
  const value = readRequired(env, key);
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${key} must be a non-negative integer`);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${key} must be a safe integer`);
  return parsed;
}

function readLowerHex(env: SignetLaunchCheckpointEnv, key: string, length?: number): string {
  const value = readRequired(env, key);
  const pattern = length === undefined ? /^[0-9a-f]+$/ : new RegExp(`^[0-9a-f]{${length}}$`);
  if (!pattern.test(value)) {
    const suffix = length === undefined ? "lowercase hex" : `${length} lowercase hex chars`;
    throw new Error(`${key} must be ${suffix}`);
  }
  return value;
}

function readCompactBits(env: SignetLaunchCheckpointEnv, key: string): number {
  const value = readRequired(env, key);
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  if (!/^[0-9a-f]{8}$/.test(hex)) throw new Error(`${key} must be an 8-digit lowercase hex compact target`);
  return Number.parseInt(hex, 16);
}
