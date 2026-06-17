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
const HEX = /^[0-9a-fA-F]*$/;

function hexToBytesOrNull(hex: unknown): Uint8Array | null {
  if (typeof hex !== "string" || hex.length % 2 !== 0 || !HEX.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function opReturnData(scriptPubKeyHex: unknown): Uint8Array | null {
  const script = hexToBytesOrNull(scriptPubKeyHex);
  if (script === null || script.length < 2 || script[0] !== 0x6a) return null;
  const op = script[1]!;
  let dataStart: number;
  let len: number;
  if (op >= 0x01 && op <= 0x4b) {
    len = op;
    dataStart = 2;
  } else if (op === 0x4c) {
    if (script.length < 3) return null;
    len = script[2]!;
    dataStart = 3;
  } else {
    return null;
  }
  if (dataStart + len !== script.length) return null; // must consume the script EXACTLY
  return script.slice(dataStart, dataStart + len);
}
