// Reproducing tests for soundness gaps in the portable proof-bundle verifier,
// found by the 2026-06-09 adversarial e2e campaign and hand-verified against the
// shipped fixtures. See docs/research/ONT_ADVERSARIAL_FINDINGS_2026_06_09.md.
//
// These use vitest's `it.fails`: the body asserts the CORRECT (sound) behavior,
// and `it.fails` documents that the verifier does NOT yet do it — so each test
// PASSES today (the assertion throws) and FAILS LOUDLY the moment the gap is
// closed, forcing whoever fixes it to delete the `.fails` and lock in the
// behavior. They are reproductions, not a green-light: the gaps are real.
//
// IMPORTANT BOUNDARY NOTE for the fix: the canonical sparse-Merkle recompute
// (`verifyAccumulatorProof`) lives in @ont/core, which the frozen consensus core
// may NOT import (packages/consensus/src/trust-surface.test.ts locks deps to
// @ont/protocol + @ont/bitcoin). Closing PB1/PB3 therefore needs the recompute
// primitive available inside the frozen boundary — either moved into
// @ont/protocol (one implementation, shared) or reimplemented here from the
// sha256 primitives already imported. That is an architecture decision for DK,
// not a mechanical edit. Flagged in the findings doc.
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { verifyProofBundleStructure } from "./index.js";

describe("proof-bundle soundness gaps (adversarial findings 2026-06-09)", () => {
  it("baseline: the shipped accumulator fixture itself exposes the gaps", async () => {
    // The shipped fixture passes structural verification even though (a) its
    // accumulator `value` (3333…) does NOT equal the ownershipProof
    // currentOwnerPubkey (2222…), and (b) its root/siblings are placeholder
    // bytes that cannot recompute to the claimed root. That a known-good
    // fixture has both properties and still verifies is itself the evidence.
    const bundle = await loadFixture();
    expect(verifyProofBundleStructure(bundle).valid).toBe(true);
    const proof = bundle.accumulatorProof as Record<string, unknown>;
    const ownership = bundle.ownershipProof as Record<string, unknown>;
    expect(proof.value).not.toBe(ownership.currentOwnerPubkey);
  });

  // PB1 / PB3 — the membership proof's root is never recomputed from
  // (leaf, value, siblings), so a fabricated proof for a name the bundle is not
  // actually a member of still verifies.
  it.fails("PB1/PB3: rejects a tampered Merkle sibling (root recompute)", async () => {
    const bundle = await loadFixture();
    const proof = bundle.accumulatorProof as Record<string, unknown>;
    const siblings = proof.siblings as Record<string, unknown>[];
    // Flip a sibling hash to different (still well-formed 32-byte hex) bytes.
    siblings[0] = { ...siblings[0], hash: "aa".repeat(32) };
    expect(verifyProofBundleStructure(bundle).valid).toBe(false);
  });

  it.fails("PB3: rejects an accumulator root unrelated to leaf/siblings/anchor", async () => {
    const bundle = await loadFixture();
    const proof = bundle.accumulatorProof as Record<string, unknown>;
    proof.root = "cd".repeat(32); // arbitrary, recomputes from nothing in the bundle
    expect(verifyProofBundleStructure(bundle).valid).toBe(false);
  });

  // PB2 — the accumulator value commitment is never required to equal the
  // claimed current owner pubkey, so the verifier blesses ownership the
  // membership proof does not commit to.
  it.fails("PB2: rejects a value commitment that is not the claimed owner", async () => {
    const bundle = await loadFixture();
    const proof = bundle.accumulatorProof as Record<string, unknown>;
    const ownership = bundle.ownershipProof as Record<string, unknown>;
    // Force a mismatch explicitly (the shipped fixture already mismatches).
    proof.value = "ab".repeat(32);
    expect(ownership.currentOwnerPubkey).not.toBe(proof.value);
    expect(verifyProofBundleStructure(bundle).valid).toBe(false);
  });
});

async function loadFixture(): Promise<Record<string, unknown>> {
  const fixtureUrl = new URL(
    "../../../fixtures/proof-bundles/accumulator-batch-claim-proof.json",
    import.meta.url
  );
  return JSON.parse(await readFile(fixtureUrl, "utf8")) as Record<string, unknown>;
}
