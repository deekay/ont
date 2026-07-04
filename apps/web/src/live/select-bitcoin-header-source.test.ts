import { describe, expect, it } from "vitest";
import type { HeaderRangeProvider } from "@ont/light-client";
import {
  PRIVATE_SIGNET_GENESIS_DIFFICULTY_CHECKPOINT,
  SIGNET_LAUNCH_CHECKPOINT_ENV,
} from "@ont/launch-config";
import {
  ONT_ESPLORA_URL_ENV,
  ONT_HEADER_PROVIDER_ENV,
  ONT_RESOLVER_URL_ENV,
  ONT_WEB_BITCOIN_HEADER_SOURCE_ENV,
  selectBitcoinLaunchCheckpoint,
  selectBitcoinHeaderProvider,
} from "./select-bitcoin-header-source.js";

const provider: HeaderRangeProvider = { fetchHeaderHex: async () => ["aa"] };

describe("selectBitcoinHeaderProvider", () => {
  it("unset env -> undefined (hermetic default)", () => {
    expect(selectBitcoinHeaderProvider({})).toBeUndefined();
  });

  it("present empty/blank -> throws (fail closed)", () => {
    expect(() => selectBitcoinHeaderProvider({ [ONT_WEB_BITCOIN_HEADER_SOURCE_ENV]: "" })).toThrow(/ONT_WEB_BITCOIN_HEADER_SOURCE/);
    expect(() => selectBitcoinHeaderProvider({ [ONT_WEB_BITCOIN_HEADER_SOURCE_ENV]: "   " })).toThrow(/ONT_WEB_BITCOIN_HEADER_SOURCE/);
  });

  it("resolver:<url> -> returns a resolver header provider", () => {
    const seen: string[] = [];
    const selected = selectBitcoinHeaderProvider(
      { [ONT_WEB_BITCOIN_HEADER_SOURCE_ENV]: "resolver:http://resolver.test/" },
      (input) => {
        seen.push(input.resolverUrl);
        return provider;
      },
    );
    expect(selected).toBe(provider);
    expect(seen).toEqual(["http://resolver.test/"]);
  });

  it("ONT_HEADER_PROVIDER=resolver selects the resolver provider from ONT_RESOLVER_URL", () => {
    const seen: string[] = [];
    const selected = selectBitcoinHeaderProvider(
      { [ONT_HEADER_PROVIDER_ENV]: "resolver", [ONT_RESOLVER_URL_ENV]: " http://resolver.test " },
      {
        resolver: (input) => {
          seen.push(input.resolverUrl);
          return provider;
        },
      },
    );
    expect(selected).toBe(provider);
    expect(seen).toEqual(["http://resolver.test"]);
  });

  it("ONT_HEADER_PROVIDER=esplora selects the Esplora provider from ONT_ESPLORA_URL", () => {
    const seen: string[] = [];
    const selected = selectBitcoinHeaderProvider(
      { [ONT_HEADER_PROVIDER_ENV]: "esplora", [ONT_ESPLORA_URL_ENV]: " https://esplora.test/signet/api " },
      {
        esplora: (input) => {
          seen.push(input.esploraBaseUrl);
          return provider;
        },
      },
    );
    expect(selected).toBe(provider);
    expect(seen).toEqual(["https://esplora.test/signet/api"]);
  });

  it("ONT_HEADER_PROVIDER missing sub-env and unsupported values fail closed", () => {
    expect(() => selectBitcoinHeaderProvider({ [ONT_HEADER_PROVIDER_ENV]: "esplora" })).toThrow(/ONT_ESPLORA_URL/);
    expect(() => selectBitcoinHeaderProvider({ [ONT_HEADER_PROVIDER_ENV]: "resolver" })).toThrow(/ONT_RESOLVER_URL/);
    expect(() => selectBitcoinHeaderProvider({ [ONT_HEADER_PROVIDER_ENV]: "node" })).toThrow(/deferred/);
    expect(() => selectBitcoinHeaderProvider({ [ONT_HEADER_PROVIDER_ENV]: "unknown" })).toThrow(/ONT_HEADER_PROVIDER/);
  });

  it("present unsupported id -> throws; fixture:block-170 survives only as a negative test", () => {
    expect(() => selectBitcoinHeaderProvider({ [ONT_WEB_BITCOIN_HEADER_SOURCE_ENV]: "live" })).toThrow(/unsupported header source/);
    expect(() => selectBitcoinHeaderProvider({ [ONT_WEB_BITCOIN_HEADER_SOURCE_ENV]: "signet:launch-checkpoint" })).toThrow(/unsupported header source/);
    expect(() => selectBitcoinHeaderProvider({ [ONT_WEB_BITCOIN_HEADER_SOURCE_ENV]: "fixture:block-170" })).toThrow(/unsupported header source/);
  });
});

describe("selectBitcoinLaunchCheckpoint", () => {
  it("defaults to the bundled public-signet checkpoint", () => {
    expect(selectBitcoinLaunchCheckpoint({})).not.toEqual(PRIVATE_SIGNET_GENESIS_DIFFICULTY_CHECKPOINT);
  });

  it("selects the private-signet checkpoint from complete env and fails closed on partial env", () => {
    expect(selectBitcoinLaunchCheckpoint(privateSignetCheckpointEnv())).toEqual(PRIVATE_SIGNET_GENESIS_DIFFICULTY_CHECKPOINT);
    expect(() => selectBitcoinLaunchCheckpoint({ [SIGNET_LAUNCH_CHECKPOINT_ENV.height]: "0" })).toThrow(/partial signet launch checkpoint override/);
  });
});

function privateSignetCheckpointEnv(): Record<string, string> {
  return {
    [SIGNET_LAUNCH_CHECKPOINT_ENV.height]: "0",
    [SIGNET_LAUNCH_CHECKPOINT_ENV.hashHex]: PRIVATE_SIGNET_GENESIS_DIFFICULTY_CHECKPOINT.hashHex,
    [SIGNET_LAUNCH_CHECKPOINT_ENV.bits]: "0x1e0377ae",
    [SIGNET_LAUNCH_CHECKPOINT_ENV.time]: "1598918400",
    [SIGNET_LAUNCH_CHECKPOINT_ENV.epochStartTime]: "1598918400",
    [SIGNET_LAUNCH_CHECKPOINT_ENV.cumulativeWorkHex]: "49d414",
  };
}
