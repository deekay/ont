// LIVE check (dev-only): proves the mobile value-record WRITE path against the
// configured resolver (config.API_BASE). Requires the local signet test accounts
// under .data/private-signet-demo/ and a resolver that accepts POST /values.
// Not part of the default offline suite. Run: tsx mobile/checks/value-write.live.mts
import { readFile } from "node:fs/promises";
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/+$/, "");
async function load(path: string): Promise<any> { const m = await import(path); return m.default ?? m; }

const vw = await load(`${ROOT}/mobile/src/wallet/value-write.ts`);
const resolverMod = await load(`${ROOT}/mobile/src/api/resolver.ts`);
const cfg = await load(`${ROOT}/mobile/src/config.ts`);
const { publishNameValue, readValueState } = vw;
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

const before = await readValueState(NAME);
ok("owner test account owns the name", (before.currentOwnerPubkey ?? "").toLowerCase() === owner.ownerPubkey.toLowerCase());
const expectedNext = before.nextSequence;

const payload = `https://ont.example/${NAME}/mobile-${Date.now()}`;
const result = await publishNameValue({ name: NAME, ownerPrivateKeyHex: owner.ownerPrivateKeyHex, valueType: 2, payloadUtf8: payload });
ok("publish accepted at expected next sequence", result.sequence === expectedNext, `seq=${result.sequence}`);
ok("publish is not simulated (live)", result.simulated === false);

const head = await resolver.value(NAME);
ok("resolver serves the new sequence as head", head.sequence === result.sequence);
ok("served payload matches what we signed", Buffer.from(head.payloadHex, "hex").toString("utf8") === payload);

let guardThrew = false;
try { await publishNameValue({ name: NAME, ownerPrivateKeyHex: recipient.ownerPrivateKeyHex, valueType: 2, payloadUtf8: "intruder" }); }
catch { guardThrew = true; }
ok("wrong-owner write is refused locally", guardThrew);

console.log("");
if (failures === 0) console.log("ALL VALUE-WRITE LIVE CHECKS PASSED.");
else { console.error(`${failures} CHECK(S) FAILED.`); process.exit(1); }
