// Offline interop: the mobile recovery-descriptor port must be byte-identical to
// the engine — same digest, cross-verifying signatures, tamper rejection.
import {
  signRecoveryDescriptor as engineSign,
  verifyRecoveryDescriptor as engineVerify,
  computeRecoveryDescriptorHash as engineHash,
} from "../../packages/protocol/src/recovery-descriptor.ts";
import { deriveOwnerPubkey as engineDerive } from "../../packages/protocol/src/value-record.ts";

const m = await import("../../mobile/src/wallet/recovery-descriptor.ts");
const mob = (m as any).default ?? m;
const { signRecoveryDescriptor, verifyRecoveryDescriptor, computeRecoveryDescriptorHash } = mob;

let failures = 0;
const ok = (label: string, cond: boolean) => {
  if (!cond) { failures += 1; console.error("FAIL  " + label); } else console.log("ok    " + label);
};

const PRIV = "1122334455667788991011121314151617181920212223242526272829303132";
const owner = engineDerive(PRIV);
const fields = {
  name: "satoshi",
  ownerPubkey: owner,
  ownershipRef: "ab".repeat(32),
  sequence: 3,
  previousDescriptorHash: "cd".repeat(32),
  recoveryAddress: "tb1qmdxqetclns2s97l8xsjjjlat6uxasgqmmcrmzw",
  signingProfile: "bip322",
  challengeWindowBlocks: 144,
  issuedAt: "2026-05-29T00:00:00.000Z",
};

ok("computeRecoveryDescriptorHash matches engine", computeRecoveryDescriptorHash(fields) === engineHash(fields));

const signInput = {
  name: fields.name, ownerPrivateKeyHex: PRIV, ownershipRef: fields.ownershipRef,
  sequence: fields.sequence, previousDescriptorHash: fields.previousDescriptorHash,
  recoveryAddress: fields.recoveryAddress, issuedAt: fields.issuedAt,
};
const mobileSigned = signRecoveryDescriptor(signInput);
ok("mobile-signed verifies (mobile)", verifyRecoveryDescriptor(mobileSigned) === true);
ok("mobile-signed verifies (ENGINE)", engineVerify(mobileSigned) === true);

const engineSigned = engineSign(signInput);
ok("engine-signed verifies (MOBILE)", verifyRecoveryDescriptor(engineSigned) === true);

const genesis = signRecoveryDescriptor({ ...signInput, sequence: 1, previousDescriptorHash: null });
ok("genesis (null prev) verifies (mobile)", verifyRecoveryDescriptor(genesis) === true);
ok("genesis (null prev) verifies (ENGINE)", engineVerify(genesis) === true);

ok("tamper recoveryAddress rejected (mobile)", verifyRecoveryDescriptor({ ...mobileSigned, recoveryAddress: "tb1qzzz" }) === false);
ok("tamper recoveryAddress rejected (ENGINE)", engineVerify({ ...mobileSigned, recoveryAddress: "tb1qzzz" }) === false);
ok("tamper signature rejected (mobile)", verifyRecoveryDescriptor({ ...mobileSigned, signature: "00".repeat(64) }) === false);

console.log("");
if (failures === 0) console.log("ALL RECOVERY-DESCRIPTOR INTEROP CHECKS PASSED — mobile == engine.");
else { console.error(`${failures} CHECK(S) FAILED.`); process.exit(1); }
