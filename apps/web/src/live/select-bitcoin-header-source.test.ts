import { describe, expect, it } from "vitest";
import { buildSignetLaunchHeaderSourceFromHeaders, type BitcoinHeaderSource } from "@ont/light-client";
import {
  ONT_WEB_BITCOIN_HEADER_SOURCE_ENV,
  SIGNET_LAUNCH_HEADER_SOURCE_ID,
  selectBitcoinHeaderSource,
} from "./select-bitcoin-header-source.js";
import { readFile } from "node:fs/promises";

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

  it("present signet launch id -> returns an injected checkpoint-validated source", async () => {
    const fixture = await loadSignetHeaderRange();
    const result = buildSignetLaunchHeaderSourceFromHeaders({
      headersHex: fixture.headers.map((header) => header.headerHex),
      anchorHeight: fixture.anchorHeight,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const selected = selectBitcoinHeaderSource(
      { [ONT_WEB_BITCOIN_HEADER_SOURCE_ENV]: SIGNET_LAUNCH_HEADER_SOURCE_ID },
      { [SIGNET_LAUNCH_HEADER_SOURCE_ID]: result.headerSource },
    );
    expect(selected?.headerHexAtHeight(311_446)).toBe(fixture.headers[0]?.headerHex);
    expect(selected?.headerHexAtHeight(311_452)).toBe(fixture.headers.at(-1)?.headerHex);
    expect(selected?.headerHexAtHeight(311_446)).not.toBe(selected?.headerHexAtHeight(311_452));
    expect(selected?.headerHexAtHeight(311_453)).toBeNull();
  });

  it("present unsupported id -> throws (live provider not wired silently)", () => {
    expect(() => selectBitcoinHeaderSource({ [ONT_WEB_BITCOIN_HEADER_SOURCE_ENV]: "live" })).toThrow(/unsupported header source/);
    expect(() => selectBitcoinHeaderSource({ [ONT_WEB_BITCOIN_HEADER_SOURCE_ENV]: "fixture:block-170" })).toThrow(/unsupported header source/);
  });
});

interface SignetHeaderFixture {
  readonly anchorHeight: number;
  readonly headers: readonly { readonly headerHex: string }[];
}

async function loadSignetHeaderRange(): Promise<SignetHeaderFixture> {
  const fixtureUrl = new URL("../../../../fixtures/bitcoin/signet-launch-header-range-311446-311452.json", import.meta.url);
  const raw = await readFile(fixtureUrl, "utf8");
  return JSON.parse(raw) as SignetHeaderFixture;
}
