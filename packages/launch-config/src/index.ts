import type { BitcoinDifficultyCheckpoint, BitcoinNetworkParams } from "@ont/bitcoin";

export type LaunchBitcoinNetwork = "signet";

export const LAUNCH_BITCOIN_NETWORKS = ["signet"] as const satisfies readonly LaunchBitcoinNetwork[];

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
