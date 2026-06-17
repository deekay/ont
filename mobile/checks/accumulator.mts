// Cross-check the mobile accumulator port against the clean protocol package.
// Run with tsx from repo root.
import {
  accumulatorRootOf,
  normalizeName as engineNormalizeName,
  sha256Hex,
  utf8ToBytes,
  verifyAccumulatorMembership as engineVerify,
} from "@ont/protocol";

// tsx transpiles the mobile file (no "type":"module") to CJS, so its real
// exports land on the default-interop namespace rather than as named bindings.
const mobileMod = await import("../../mobile/src/wallet/accumulator.ts");
const mobile = (mobileMod as any).default ?? mobileMod;
const mobileKey: (name: string) => string = mobile.accumulatorKeyForName;
const mobileRootForSingleLeaf: (keyHex: string, valueHex: string) => string =
  mobile.accumulatorRootForSingleLeaf;
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
const engineKey = (name: string): string => sha256Hex(utf8ToBytes(engineNormalizeName(name)));

const present = ["alice", "bob", "satoshi", "ont", "z", "a1b2c3"];
const absent = ["charlie", "dave", "nobody", "qqqq"];

// 1. Key derivation must match byte-for-byte.
for (const name of [...present, ...absent]) {
  ok(`key(${name}) matches engine`, engineKey(name) === mobileKey(name));
  ok(`normalizeName(${name}) stable`, normalizeName(name) === name.toLowerCase());
}

// 2. Single-leaf roots and proofs verify with BOTH implementations.
const singleKey = engineKey("alice");
const singleValue = pubkey(1);
const root = accumulatorRootOf(new Map([[singleKey, singleValue]]));
const emptyRoot = accumulatorRootOf(new Map());
const membership = { keyHex: singleKey, value: singleValue, siblings: [] };
ok("single-leaf root matches clean protocol", mobileRootForSingleLeaf(singleKey, singleValue) === root);
ok("root is non-empty", root !== emptyRoot);
ok("membership alice engineVerify", engineVerify(root, membership));
ok("membership alice mobileVerify", mobileVerify(root, membership));

for (const name of present.slice(1)) {
  const key = engineKey(name);
  const value = pubkey(present.indexOf(name) + 1);
  const proof = { keyHex: key, value, siblings: [] };
  const singleRoot = accumulatorRootOf(new Map([[key, value]]));
  ok(`single-leaf root ${name} matches clean protocol`, mobileRootForSingleLeaf(key, value) === singleRoot);
  ok(`membership ${name} engineVerify`, engineVerify(singleRoot, proof));
  ok(`membership ${name} mobileVerify`, mobileVerify(singleRoot, proof));
}

// 3. Empty-tree non-membership proofs verify under both.
for (const name of absent) {
  const proof = { keyHex: engineKey(name), value: null, siblings: [] };
  ok(`empty non-membership ${name} engineVerify`, engineVerify(emptyRoot, proof));
  ok(`empty non-membership ${name} mobileVerify`, mobileVerify(emptyRoot, proof));
}

// 4. Tamper detection — mobile must reject a wrong root and a flipped value.
{
  const wrongRoot = root.slice(0, -2) + (root.endsWith("00") ? "01" : "00");
  ok("mobile rejects wrong root", mobileVerify(wrongRoot, membership) === false);

  const flipped = { ...membership, value: pubkey(99) };
  ok("mobile rejects flipped value", mobileVerify(root, flipped) === false);

  // A non-membership proof presented as if it were membership must fail.
  const forged = { keyHex: engineKey("charlie"), value: pubkey(1), siblings: [] };
  ok("mobile rejects forged membership", mobileVerify(root, forged) === false);
}

// 5. Empty-tree root agreement.
ok("empty root matches clean protocol", emptyRoot === accumulatorRootOf(new Map()));

console.log("");
if (failures === 0) {
  console.log("ALL CHECKS PASSED — mobile port is bit-exact against clean @ont/protocol.");
} else {
  console.error(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}
