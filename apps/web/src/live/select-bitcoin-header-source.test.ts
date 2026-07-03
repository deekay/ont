import { describe, expect, it } from "vitest";
import type { HeaderRangeProvider } from "@ont/light-client";
import {
  ONT_WEB_BITCOIN_HEADER_SOURCE_ENV,
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

  it("present unsupported id -> throws; fixture:block-170 survives only as a negative test", () => {
    expect(() => selectBitcoinHeaderProvider({ [ONT_WEB_BITCOIN_HEADER_SOURCE_ENV]: "live" })).toThrow(/unsupported header source/);
    expect(() => selectBitcoinHeaderProvider({ [ONT_WEB_BITCOIN_HEADER_SOURCE_ENV]: "signet:launch-checkpoint" })).toThrow(/unsupported header source/);
    expect(() => selectBitcoinHeaderProvider({ [ONT_WEB_BITCOIN_HEADER_SOURCE_ENV]: "fixture:block-170" })).toThrow(/unsupported header source/);
  });
});
