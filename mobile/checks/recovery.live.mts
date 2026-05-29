// LIVE check (dev-only): proves the mobile recovery-descriptor WRITE path against
// the configured resolver. Requires the local signet test accounts and a resolver
// that accepts POST /recovery-descriptors. NOTE: the public opennametags.org/api
// currently returns 405 for this path (the resolver supports it; the public proxy
// allowlist does not yet) — run against the tunneled resolver until that's fixed.
// Not part of the default offline suite.
import { readFile } from "node:fs/promises";
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/+$/, "");
async function load(path: string): Promise<any> { const m = await import(path); return m.default ?? m; }

const rw = await load(`${ROOT}/mobile/src/wallet/recovery-write.ts`);
const resolverMod = await load(`${ROOT}/mobile/src/api/resolver.ts`);
const cfg = await load(`${ROOT}/mobile/src/config.ts`);
const { publishNameRecovery, readRecoveryState } = rw;
const { resolver } = resolverMod;

let failures = 0;
const ok = (label: string, cond: boolean, extra = "") => {
  if (!cond) { failures += 1; console.error(`FAIL  ${label}${extra ? "  :: " + extra : ""}`); }
  else console.log(`ok    ${label}${extra ? "  :: " + extra : ""}`);
};

const owner = JSON.parse(await readFile(`${ROOT}/.data/private-signet-demo/owner.json`, "utf8"));
const recipient = JSON.parse(await readFile(`${ROOT}/.data/private-signet-demo/recipient.json`, "utf8"));
const NAME = "canyon";
console.log(`resolver target: ${cfg.API_BASE}`);

const before = await readRecoveryState(NAME);
ok("owner test account owns the name", (before.currentOwnerPubkey ?? "").toLowerCase() === owner.ownerPubkey.toLowerCase());
const expectedNext = before.nextSequence;

const result = await publishNameRecovery({ name: NAME, ownerPrivateKeyHex: owner.ownerPrivateKeyHex, recoveryAddress: recipient.fundingAddress });
ok("recovery accepted at expected next sequence", result.sequence === expectedNext, `seq=${result.sequence}`);

const head = await resolver.recovery(NAME);
ok("resolver serves the new descriptor as head", head.sequence === result.sequence);
ok("served recovery address matches", head.recoveryAddress === recipient.fundingAddress);

console.log("");
if (failures === 0) console.log("ALL RECOVERY LIVE CHECKS PASSED.");
else { console.error(`${failures} CHECK(S) FAILED.`); process.exit(1); }
