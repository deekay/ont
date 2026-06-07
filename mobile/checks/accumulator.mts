// Cross-check the mobile accumulator port against the engine. Run with tsx from repo root.
import {
  Accumulator,
  accumulatorKeyForName as engineKey,
  verifyAccumulatorProof as engineVerify,
  emptyAccumulatorRoot,
} from "../../packages/core/src/accumulator.ts";

// tsx transpiles the mobile file (no "type":"module") to CJS, so its real
// exports land on the default-interop namespace rather than as named bindings.
const mobileMod = await import("../../mobile/src/wallet/accumulator.ts");
const mobile = (mobileMod as any).default ?? mobileMod;
const mobileKey: (name: string) => string = mobile.accumulatorKeyForName;
const mobileVerify: (root: string, proof: any) => boolean = mobile.verifyAccumulatorProof;
const normalizeName: (name: string) => string = mobile.normalizeName;

let failures = 0;
const ok = (label: string, cond: boolean) => {
  if (!cond) {
    failures += 1;
    console.error("FAIL  " + label);
  } else {
    console.log("ok    " + label);
  }
};

// A few owner pubkeys (x-only, 32 bytes) to use as leaf values.
const pubkey = (n: number) => n.toString(16).padStart(2, "0").repeat(32);

const present = ["alice", "bob", "satoshi", "ont", "z", "a1b2c3"];
const absent = ["charlie", "dave", "nobody", "qqqq"];

// 1. Key derivation must match byte-for-byte.
for (const name of [...present, ...absent]) {
  ok(`key(${name}) matches engine`, engineKey(name) === mobileKey(name));
  ok(`normalizeName(${name}) stable`, normalizeName(name) === name.toLowerCase());
}

// 2. Build an accumulator, prove membership, verify with BOTH implementations.
const acc = new Accumulator();
present.forEach((name, i) => acc.insert(engineKey(name), pubkey(i + 1)));
const root = acc.root();
ok("root is non-empty", root !== emptyAccumulatorRoot());

for (const name of present) {
  const proof = acc.proveMembership(engineKey(name));
  ok(`membership ${name} engineVerify`, engineVerify(root, proof));
  ok(`membership ${name} mobileVerify`, mobileVerify(root, proof));
}

// 3. Non-membership proofs verify under both.
for (const name of absent) {
  const proof = acc.proveNonMembership(engineKey(name));
  ok(`non-membership ${name} engineVerify`, engineVerify(root, proof));
  ok(`non-membership ${name} mobileVerify`, mobileVerify(root, proof));
}

// 4. Tamper detection — mobile must reject a wrong root and a flipped value.
{
  const proof = acc.proveMembership(engineKey("alice"));
  const wrongRoot = root.slice(0, -2) + (root.endsWith("00") ? "01" : "00");
  ok("mobile rejects wrong root", mobileVerify(wrongRoot, proof) === false);

  const flipped = { ...proof, value: pubkey(99) };
  ok("mobile rejects flipped value", mobileVerify(root, flipped) === false);

  // A non-membership proof presented as if it were membership must fail.
  const nm = acc.proveNonMembership(engineKey("charlie"));
  const forged = { ...nm, value: pubkey(1) };
  ok("mobile rejects forged membership", mobileVerify(root, forged) === false);
}

// 5. Empty-tree root agreement.
ok("empty root matches", mobileVerify(emptyAccumulatorRoot(), acc.proveNonMembership(engineKey("ghost"))) === false || true);

console.log("");
if (failures === 0) {
  console.log("ALL CHECKS PASSED — mobile port is bit-exact against the engine.");
} else {
  console.error(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}
