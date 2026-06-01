// Cross-check mobile transfer-authorization signing against the engine. Proves:
//   - identical canonical digest for the same transfer fields
//   - mobile-signed transfer authorizations verify under the ENGINE (and vice versa)
//   - tampering (recipient key / flags / bond vout) breaks verification
import {
  computeTransferAuthorizationHash as engineHash,
  signTransferAuthorization as engineSign,
  verifyTransferAuthorization as engineVerify,
} from "../../packages/protocol/src/events.ts";
import { deriveOwnerPubkey as engineDerive } from "../../packages/protocol/src/value-record.ts";

const mod = await import("../../mobile/src/wallet/transfer.ts");
const t = (mod as any).default ?? mod;
const { computeTransferAuthorizationHash, signTransferAuthorization, verifyTransferAuthorization } = t;

let failures = 0;
const ok = (label: string, cond: boolean) => {
  if (!cond) {
    failures += 1;
    console.error("FAIL  " + label);
  } else {
    console.log("ok    " + label);
  }
};

const PRIV = "1122334455667788991011121314151617181920212223242526272829303132";
const owner = engineDerive(PRIV);
const fields = {
  prevStateTxid: "ab".repeat(32),
  newOwnerPubkey: "cd".repeat(32),
  flags: 0,
  successorBondVout: 0,
};

// 1. Canonical digest is byte-for-byte identical.
ok("transfer digest matches engine", computeTransferAuthorizationHash(fields) === engineHash(fields));

// 2. Cross-verification both directions.
const mobileSig = signTransferAuthorization({ ...fields, ownerPrivateKeyHex: PRIV });
ok("engine verifies a mobile-signed transfer", engineVerify({ ...fields, ownerPubkey: owner, signature: mobileSig }) === true);
const engineSig = engineSign({ ...fields, ownerPrivateKeyHex: PRIV });
ok("mobile verifies an engine-signed transfer", verifyTransferAuthorization({ ...fields, ownerPubkey: owner, signature: engineSig }) === true);

// 3. Tampering breaks verification.
ok(
  "tampered recipient key is rejected",
  verifyTransferAuthorization({ ...fields, newOwnerPubkey: "ee".repeat(32), ownerPubkey: owner, signature: engineSig }) === false,
);
ok(
  "tampered flags are rejected",
  verifyTransferAuthorization({ ...fields, flags: 1, ownerPubkey: owner, signature: engineSig }) === false,
);

// 4. Each field is bound into the digest.
ok("flags change the digest", computeTransferAuthorizationHash({ ...fields, flags: 1 }) !== computeTransferAuthorizationHash(fields));
ok("successorBondVout changes the digest", computeTransferAuthorizationHash({ ...fields, successorBondVout: 1 }) !== computeTransferAuthorizationHash(fields));
ok("newOwnerPubkey changes the digest", computeTransferAuthorizationHash({ ...fields, newOwnerPubkey: "ef".repeat(32) }) !== computeTransferAuthorizationHash(fields));

if (failures > 0) {
  console.error(`\n${failures} transfer check(s) failed.`);
  process.exit(1);
}
console.log("\nok    transfer: mobile transfer authorizations are byte-identical to the engine.");
