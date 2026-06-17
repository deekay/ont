// Pure OP_RETURN payload extraction (no I/O, no event/RootAnchor semantics).
//
// Parsing a scriptPubKey's bytes into a single OP_RETURN data push is Bitcoin/script
// plumbing, so it lives in @ont/bitcoin as the single source of truth (the
// merkleRootFromProof precedent). adapter-indexer's inclusion firewall and the
// go-live indexer-live RootAnchor prefilter both consume it; decodeEvent / RootAnchor
// semantics stay in their respective layers. (go-live G1 sub-slice 3b-2.5.)
//
// PURPOSE: scriptPubKey hex → the bytes of a script that is EXACTLY
//   `OP_RETURN <direct-push|OP_PUSHDATA1> <data>` and nothing else, or null.
// SCOPE: byte extraction only. TESTS: ./op-return.test.ts.

/**
 * The data bytes of a script that is EXACTLY `OP_RETURN <push> <data>` and NOTHING ELSE — or null. The
 * script must be consumed exactly: a single direct push (0x01..0x4b) or OP_PUSHDATA1 (0x4c len, ≤255),
 * with `data` ending the script (no trailing bytes, not a "first push wins" parse; OP_0 / OP_PUSHDATA2/4 /
 * opcode forms rejected). Fail-closed on malformed hex. Never throws.
 */
export function opReturnData(_scriptPubKeyHex: unknown): Uint8Array | null {
  // RED stub — sub-slice 3b-2.5 green pending CL red-OK.
  throw new Error("opReturnData: not implemented (3b-2.5 green pending)");
}
