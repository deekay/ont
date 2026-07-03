import { readFile } from "node:fs/promises";

import {
  buildSignetLaunchHeaderSourceFromHeaders,
  checkProofBundleHeaderDepthCoverage,
  createEsploraHeaderRangeProvider,
  createResolverHeaderRangeProvider,
  runVerifyProofBundleAgainstBitcoin,
} from "@ont/light-client";
import { LAUNCH_CONFIRMATION_DEPTH, SIGNET_LAUNCH_CHECKPOINT_ID } from "@ont/launch-config";

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/+$/, "");
const verificationMod = await import(`${ROOT}/mobile/src/verification/bitcoin.ts`);
const {
  createMobileSignetHeaderRangeProvider,
  fetchMobileSignetLaunchHeaderSource,
  mobileBitcoinVerificationState,
  unavailableMobileBitcoinVerificationState,
} = verificationMod;

let failures = 0;
const ok = (label: string, cond: boolean, extra = "") => {
  if (!cond) {
    failures += 1;
    console.error(`FAIL  ${label}${extra ? "  :: " + extra : ""}`);
  } else {
    console.log(`ok    ${label}${extra ? "  :: " + extra : ""}`);
  }
};

interface SignetHeaderFixture {
  readonly anchorHeight: number;
  readonly confirmationDepth: number;
  readonly requiredHeight: number;
  readonly headers: readonly { readonly height: number; readonly headerHex: string }[];
}

const OWNER = "22".repeat(32);
const fixture = await loadSignetHeaderRange();
const headersHex = fixture.headers.map((header) => header.headerHex);
const source = buildSignetLaunchHeaderSourceFromHeaders({
  headersHex,
  anchorHeight: fixture.anchorHeight,
});
if (!source.ok) {
  console.error(`fixture header range did not validate: ${source.reason}`);
  process.exit(1);
}

const bundle = await loadSignetAnchoredBundle();
const anchorHeader = fixture.headers.find((header) => header.height === fixture.anchorHeight);
const coverageHeader = fixture.headers.find((header) => header.height === fixture.requiredHeight);
ok("fixture carries the shared launch depth K=6", fixture.confirmationDepth === LAUNCH_CONFIRMATION_DEPTH);
ok("fixture starts at anchor 311446", fixture.anchorHeight === 311_446);
ok("fixture reaches anchor+K 311452", fixture.requiredHeight === fixture.anchorHeight + LAUNCH_CONFIRMATION_DEPTH);
ok("honest coverage source has anchor header", source.headerSource.headerHexAtHeight(fixture.anchorHeight) === anchorHeader?.headerHex);
ok("honest coverage source has anchor+K header", source.headerSource.headerHexAtHeight(fixture.requiredHeight) === coverageHeader?.headerHex);
ok(
  "honest coverage source uses distinct real anchor and anchor+K headers",
  source.headerSource.headerHexAtHeight(fixture.anchorHeight) !== source.headerSource.headerHexAtHeight(fixture.requiredHeight),
);

{
  const core = runVerifyProofBundleAgainstBitcoin({ bundle, headerSource: source.headerSource });
  const depth = checkProofBundleHeaderDepthCoverage({
    bundle,
    headerSource: source.headerSource,
    confirmationDepth: LAUNCH_CONFIRMATION_DEPTH,
  });
  const mobile = mobileBitcoinVerificationState({
    proofBundle: bundle,
    headerSource: source.headerSource,
    ownerPubkeyHex: OWNER,
  });
  ok("core verifier accepts the good signet bundle", core.ok === true);
  ok("depth coverage accepts the good signet range", depth.ok === true);
  ok("mobile maps verifier ok + depth ok to Bitcoin-verified", mobile.kind === "bitcoin-verified");
  ok("mobile verified state keeps owner visible", mobile.ownerPubkeyHex === OWNER);
  ok("mobile uses the shared checkpoint id", mobile.checkpointId === SIGNET_LAUNCH_CHECKPOINT_ID);
  ok("mobile labels signet header authenticity honestly", mobile.signetHeaderAuthenticity === "provider-trusted");
}

{
  const core = runVerifyProofBundleAgainstBitcoin({ bundle });
  const mobile = mobileBitcoinVerificationState({ proofBundle: bundle, ownerPubkeyHex: OWNER });
  ok("no header source maps to the same core reason", core.ok === false && mobile.reason === core.reason);
  ok("no header source is resolver-mirror, not unavailable", mobile.kind === "resolver-mirror" && mobile.showOwnership === true);
  ok("no header source still shows ownership", mobile.ownerPubkeyHex === OWNER);
}

{
  const missingInclusion = cloneRecord(bundle);
  delete missingInclusion.bitcoinInclusion;
  const core = runVerifyProofBundleAgainstBitcoin({ bundle: missingInclusion, headerSource: source.headerSource });
  const mobile = mobileBitcoinVerificationState({
    proofBundle: missingInclusion,
    headerSource: source.headerSource,
    ownerPubkeyHex: OWNER,
  });
  ok("missing bitcoinInclusion is rejected by the shared core", core.ok === false);
  ok("missing bitcoinInclusion maps to the same core reason", core.ok === false && mobile.reason === core.reason);
  ok("missing bitcoinInclusion still renders ownership as mirror", mobile.kind === "resolver-mirror" && mobile.ownerPubkeyHex === OWNER);
}

{
  const shortSource = {
    headerHexAtHeight: (height: number): string | null =>
      height === fixture.anchorHeight ? anchorHeader?.headerHex ?? null : null,
  };
  const core = runVerifyProofBundleAgainstBitcoin({ bundle, headerSource: shortSource });
  const depth = checkProofBundleHeaderDepthCoverage({
    bundle,
    headerSource: shortSource,
    confirmationDepth: LAUNCH_CONFIRMATION_DEPTH,
  });
  const mobile = mobileBitcoinVerificationState({
    proofBundle: bundle,
    headerSource: shortSource,
    ownerPubkeyHex: OWNER,
  });
  ok("short source still validates the anchor header", core.ok === true);
  ok("short source fails the shared depth check", depth.ok === false && depth.reason === "short-header-range");
  ok("short source maps to non-authoritative mobile state", mobile.kind === "resolver-mirror" && mobile.reason === "short-header-range");
  ok("short source still shows ownership", mobile.ownerPubkeyHex === OWNER);
}

{
  const mobile = mobileBitcoinVerificationState({ proofBundle: null, ownerPubkeyHex: OWNER });
  ok("missing proof bundle is non-authoritative, not verified", mobile.kind === "resolver-mirror" && mobile.reason === "no-proof-bundle");
  ok("missing proof bundle still shows served ownership", mobile.ownerPubkeyHex === OWNER);
}

{
  const unavailable = unavailableMobileBitcoinVerificationState("transport-error");
  ok("transport errors stay in the existing unavailable/error state", unavailable.kind === "unavailable");
}

{
  const fetched = await fetchMobileSignetLaunchHeaderSource({
    anchorHeight: fixture.anchorHeight,
    provider: {
      fetchHeaderHex: async (startHeight, count) => {
        ok("mobile provider seam asks for checkpoint-forward start", startHeight === 311_446);
        ok("mobile provider seam asks through anchor+K", count === 7);
        return headersHex;
      },
    },
  });
  ok("mobile live header-source seam validates fixture provider", fetched.ok === true);
  if (fetched.ok) {
    ok("mobile live header-source seam returns signet metadata", fetched.network === "signet");
  }
}

{
  const calls: string[] = [];
  const resolverProvider = createResolverHeaderRangeProvider({
    resolverUrl: "http://resolver.test/",
    fetchImpl: async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ startHeight: 311_446, headersHex }), { status: 200 });
    },
  });
  const fetched = await fetchMobileSignetLaunchHeaderSource({
    anchorHeight: fixture.anchorHeight,
    provider: resolverProvider,
  });
  ok("mobile resolver HTTP provider asks exact checkpoint-forward URL", calls[0] === "http://resolver.test/bitcoin/header-range?startHeight=311446&count=7");
  ok("mobile resolver HTTP provider validates through the shared live seam", fetched.ok === true);
}

{
  const hashes = fixture.headers.map((header) => header.height.toString(16).padStart(64, "0"));
  const esploraProvider = createEsploraHeaderRangeProvider({
    esploraBaseUrl: "https://esplora.test/signet/api",
    fetchImpl: esploraFetch(fixture, hashes),
  });
  const fetched = await fetchMobileSignetLaunchHeaderSource({
    anchorHeight: fixture.anchorHeight,
    provider: esploraProvider,
  });
  ok("mobile Esplora provider validates through the shared live seam", fetched.ok === true);
  const selected = createMobileSignetHeaderRangeProvider({
    provider: "esplora",
    resolverUrl: "http://resolver.test",
    esploraBaseUrl: "https://esplora.test/signet/api",
    fetchImpl: esploraFetch(fixture, hashes),
  });
  const selectedFetched = await fetchMobileSignetLaunchHeaderSource({
    anchorHeight: fixture.anchorHeight,
    provider: selected,
  });
  ok("mobile Esplora selector stays RN-safe and provider-trusted", selectedFetched.ok === true);
}

{
  const missing = await fetchMobileSignetLaunchHeaderSource({
    anchorHeight: fixture.anchorHeight,
    provider: null,
  });
  ok("missing live provider fails closed", missing.ok === false && missing.reason === "missing-header-provider");
}

console.log("");
if (failures === 0) {
  console.log("ALL PROOF-BUNDLE CHECKS PASSED - mobile maps the shared light-client gate without forked verifier logic.");
} else {
  console.error(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}

async function loadSignetAnchoredBundle(): Promise<Record<string, unknown>> {
  const raw = await readFile(new URL("../../fixtures/proof-bundles/signet-anchored-claim-proof.json", import.meta.url), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

async function loadSignetHeaderRange(): Promise<SignetHeaderFixture> {
  const raw = await readFile(new URL("../../fixtures/bitcoin/signet-launch-header-range-311446-311452.json", import.meta.url), "utf8");
  return JSON.parse(raw) as SignetHeaderFixture;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function esploraFetch(
  fixture: SignetHeaderFixture,
  hashes: readonly string[],
): typeof fetch {
  return async (url) => {
    const u = new URL(String(url));
    const heightMatch = u.pathname.match(/\/block-height\/([0-9]+)$/);
    if (heightMatch) {
      const height = Number.parseInt(heightMatch[1]!, 10);
      const index = fixture.headers.findIndex((header) => header.height === height);
      return index === -1 ? new Response("", { status: 404 }) : new Response(`${hashes[index]!}\n`, { status: 200 });
    }
    const headerMatch = u.pathname.match(/\/block\/([0-9a-f]{64})\/header$/);
    if (headerMatch) {
      const index = hashes.indexOf(headerMatch[1]!);
      return index === -1 ? new Response("", { status: 404 }) : new Response(`${fixture.headers[index]!.headerHex}\n`, { status: 200 });
    }
    return new Response("", { status: 404 });
  };
}
