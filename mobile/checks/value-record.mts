// Cross-check mobile value-record signing against the engine. Proves:
//   - identical canonical digest (recordHash) for the same fields
//   - mobile-signed records verify under the ENGINE (and vice versa)
//   - tampering breaks verification
import {
  signValueRecord as engineSign,
  verifyValueRecord as engineVerify,
  computeValueRecordHash as engineHash,
  deriveOwnerPubkey as engineDerive,
} from "../../packages/protocol/src/value-record.ts";

const vrMod = await import("../../mobile/src/wallet/value-record.ts");
const vr = (vrMod as any).default ?? vrMod;
const { signValueRecord, verifyValueRecord, computeValueRecordHash, deriveOwnerPubkey } = vr;

let failures = 0;
const ok = (label: string, cond: boolean) => {
  if (!cond) { failures += 1; console.error("FAIL  " + label); }
  else console.log("ok    " + label);
};

const PRIV = "1122334455667788991011121314151617181920212223242526272829303132";
const fields = {
  name: "satoshi",
  ownershipRef: "ab".repeat(32),
  sequence: 3,
  previousRecordHash: "cd".repeat(32),
  valueType: 1,
  payloadHex: Buffer.from("hello ont", "utf8").toString("hex"),
  issuedAt: "2026-05-29T00:00:00.000Z",
};

// 1. Same owner pubkey derived from the same private key.
ok("deriveOwnerPubkey matches engine", deriveOwnerPubkey(PRIV) === engineDerive(PRIV));

// 2. Canonical digest (recordHash) is byte-for-byte identical.
const owner = engineDerive(PRIV);
const hashFields = { ...fields, ownerPubkey: owner };
ok("computeValueRecordHash matches engine", computeValueRecordHash(hashFields) === engineHash(hashFields));

// 3. Mobile-signed record verifies under the ENGINE.
const mobileSigned = signValueRecord({ ...fields, ownerPrivateKeyHex: PRIV });
ok("mobile-signed record verifies (mobile)", verifyValueRecord(mobileSigned) === true);
ok("mobile-signed record verifies (ENGINE)", engineVerify(mobileSigned) === true);
ok("mobile recordHash == engine recordHash for signed fields",
  computeValueRecordHash(mobileSigned) === engineHash(mobileSigned));

// 4. Engine-signed record verifies under MOBILE.
const engineSigned = engineSign({ ...fields, ownerPrivateKeyHex: PRIV });
ok("engine-signed record verifies (MOBILE)", verifyValueRecord(engineSigned) === true);

// 5. previousRecordHash = null path (genesis record).
const genesis = signValueRecord({ ...fields, sequence: 1, previousRecordHash: null, ownerPrivateKeyHex: PRIV });
ok("genesis (null prev) verifies (mobile)", verifyValueRecord(genesis) === true);
ok("genesis (null prev) verifies (ENGINE)", engineVerify(genesis) === true);

// 6. Tamper detection — flip individual fields and confirm both reject.
ok("tamper payload rejected (mobile)", verifyValueRecord({ ...mobileSigned, payloadHex: "00" }) === false);
ok("tamper payload rejected (ENGINE)", engineVerify({ ...mobileSigned, payloadHex: "00" }) === false);
ok("tamper sequence rejected (mobile)", verifyValueRecord({ ...mobileSigned, sequence: 99 }) === false);
ok("tamper name rejected (ENGINE)", engineVerify({ ...mobileSigned, name: "alice" }) === false);
ok("tamper signature rejected (mobile)",
  verifyValueRecord({ ...mobileSigned, signature: "00".repeat(64) }) === false);

console.log("");
if (failures === 0) console.log("ALL VALUE-RECORD CHECKS PASSED — mobile signing interops with the engine.");
else { console.error(`${failures} CHECK(S) FAILED.`); process.exit(1); }
