import { describe, expect, it } from "vitest";
import type { BitcoinHeaderSource } from "@ont/light-client";
import {
  FIXTURE_BLOCK_170_HEADER_SOURCE_ID,
  ONT_WEB_BITCOIN_HEADER_SOURCE_ENV,
  selectBitcoinHeaderSource,
} from "./select-bitcoin-header-source.js";

const source: BitcoinHeaderSource = { headerHexAtHeight: () => "aa" };

describe("selectBitcoinHeaderSource", () => {
  it("unset env -> undefined (hermetic default)", () => {
    expect(selectBitcoinHeaderSource({})).toBeUndefined();
  });

  it("present empty/blank -> throws (fail closed)", () => {
    expect(() => selectBitcoinHeaderSource({ [ONT_WEB_BITCOIN_HEADER_SOURCE_ENV]: "" })).toThrow(/ONT_WEB_BITCOIN_HEADER_SOURCE/);
    expect(() => selectBitcoinHeaderSource({ [ONT_WEB_BITCOIN_HEADER_SOURCE_ENV]: "   " })).toThrow(/ONT_WEB_BITCOIN_HEADER_SOURCE/);
  });

  it("present nonempty registry id -> returns the registered source", () => {
    expect(selectBitcoinHeaderSource({ [ONT_WEB_BITCOIN_HEADER_SOURCE_ENV]: "fixture" }, { fixture: source })).toBe(source);
  });

  it("present built-in fixture id -> returns a hermetic fixture source", () => {
    const selected = selectBitcoinHeaderSource({ [ONT_WEB_BITCOIN_HEADER_SOURCE_ENV]: FIXTURE_BLOCK_170_HEADER_SOURCE_ID });
    expect(selected?.headerHexAtHeight(170)).toBeTypeOf("string");
    expect(selected?.headerHexAtHeight(176)).toBeTypeOf("string");
    expect(selected?.headerHexAtHeight(177)).toBeNull();
  });

  it("present unsupported id -> throws (live provider not wired silently)", () => {
    expect(() => selectBitcoinHeaderSource({ [ONT_WEB_BITCOIN_HEADER_SOURCE_ENV]: "live" })).toThrow(/unsupported header source/);
  });
});
