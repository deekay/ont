#!/usr/bin/env node
// G3 read-presence smoke seed (slice-1). See docs/operate/G3_CLEAN_SLATE_VPS.md.
//
// Writes ONE clearly-SEEDED, non-signet, non-consensus ConfirmedAnchorRecord into ONT_STORE_DIR via the REAL
// @ont/anchor-store writer (selectIndexerStores file store), so an operator can prove the durable file READ path
// — store -> resolver GET /tx/:txid -> web render — WITHOUT the deferred publisher/claim path. The record is a
// fixture (NOT a real signet anchor); it proves serve/read plumbing only, never chain validation or ownership.
// Construction mirrors the hermetic 6c restart-survival e2e (packages/regtest-e2e), the in-repo deterministic proof.
//
// Caveat: this seeds the live store. On a fresh/quiet signet the indexer writes nothing, so the seed persists; a
// later real anchor `put` rebuilds the file from the indexer's own in-memory set and supersedes this seed. Run it
// as a one-shot read-presence check, not as durable state. Prints the seeded anchor txid on success.
import { legacyTxidOf } from "@ont/bitcoin";
import { assembleRootAnchorTx } from "@ont/adapter-publisher";
import { selectIndexerStores } from "@ont/indexer";

const dir = process.env.ONT_STORE_DIR ?? process.argv[2];
if (!dir) {
  console.error("usage: ONT_STORE_DIR=<dir> node scripts/g3-seed-anchor.mjs   (or pass the dir as arg1)");
  process.exit(1);
}

// Deterministic SEEDED fixture — fixed bytes so the txid is stable across runs. NOT a real signet anchor.
const PREV_ROOT = "bb".repeat(32);
const NEW_ROOT = "7a".repeat(32);
const BATCH_SIZE = 5;
const MINED_HEIGHT = 800_123;

const anchorTx = assembleRootAnchorTx({
  prevRoot: PREV_ROOT,
  newRoot: NEW_ROOT,
  batchSize: BATCH_SIZE,
  fundingInputs: [{ prevoutTxid: "ab".repeat(32), prevoutVout: 0 }],
});
if (anchorTx === null) {
  console.error("seed: assembleRootAnchorTx returned null");
  process.exit(1);
}
const anchorTxid = legacyTxidOf(anchorTx);
if (anchorTxid === null) {
  console.error("seed: anchor tx not serializable");
  process.exit(1);
}

const { anchorStore } = selectIndexerStores({ ONT_STORE: "file", ONT_STORE_DIR: dir });
await anchorStore.put({
  confirmedAnchor: { anchorTxid, minedHeight: MINED_HEIGHT, anchoredRoot: NEW_ROOT, batchSize: BATCH_SIZE },
  feeTxParts: { anchorTx, prevoutTxs: [] },
});
// Label on stderr so the output can't be mistaken for a real signet acceptance artifact; stdout stays the bare
// txid so `TXID=$(node scripts/g3-seed-anchor.mjs)` capture keeps working.
console.error(`g3-seed-anchor: wrote a SEEDED fixture confirmed-anchor record (non-signet, non-consensus — NOT a real acceptance artifact) under ${dir}`);
console.log(anchorTxid);
