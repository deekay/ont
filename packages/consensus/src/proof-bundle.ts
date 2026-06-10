import {
  concatBytes,
  normalizeName,
  sha256Bytes,
  sha256Hex,
  utf8ToBytes,
  verifyAccumulatorMembership
} from "@ont/protocol";

// The two current acquisition paths. Ark/RGB explorations were removed from the
// frozen verifier: they were never the launch path, and the sovereignty core
// must stay small enough to audit. See docs/core/SIMPLIFICATION_AUDIT.md (Phase 4).
export type ProofBundleSource = "bitcoin_l1_direct_auction" | "accumulator_batch_claim";

export type ProofBundleCheckStatus = "passed" | "failed";

export interface ProofBundleVerificationCheck {
  readonly id: string;
  readonly status: ProofBundleCheckStatus;
  readonly message: string;
}

export interface ProofBundleVerificationReport {
  readonly valid: boolean;
  readonly proofSource: ProofBundleSource | "unknown";
  readonly name: string;
  readonly normalizedName: string;
  readonly assuranceTier: string;
  readonly passedCheckCount: number;
  readonly failedCheckCount: number;
  readonly checks: readonly ProofBundleVerificationCheck[];
  readonly summary: string;
}

type JsonRecord = Record<string, unknown>;

const PROOF_BUNDLE_SOURCES = new Set<string>([
  "bitcoin_l1_direct_auction",
  "accumulator_batch_claim"
]);

/**
 * STRUCTURAL verification only. Checks that a proof bundle is internally
 * consistent: well-formed, the ownership chain and value-record chain line up,
 * and the cited auction/accumulator data has the right shape. It does NOT verify
 * that the cited Bitcoin transactions are actually in proof-of-work-backed blocks
 * — for that, see verifyProofBundleAgainstBitcoin. A passing structural report
 * means "this bundle is well-formed and self-consistent", not "this ownership is
 * settled on Bitcoin".
 */
export function verifyProofBundleStructure(input: unknown): ProofBundleVerificationReport {
  const checks: ProofBundleVerificationCheck[] = [];
  const addCheck = (id: string, condition: boolean, message: string): void => {
    checks.push({
      id,
      status: condition ? "passed" : "failed",
      message
    });
  };

  const bundle = isRecord(input) ? input : {};
  addCheck("bundle.object", isRecord(input), "bundle is a JSON object");

  const proofSource = getString(bundle, "proofSource") ?? "unknown";
  const supportedProofSource = isProofBundleSource(proofSource);
  const name = getString(bundle, "name") ?? "";
  const normalizedName = getString(bundle, "normalizedName") ?? "";
  const assuranceTier = getString(bundle, "assuranceTier") ?? "";
  const ownershipProof = getRecord(bundle, "ownershipProof");
  const currentOwnerPubkey = getString(ownershipProof, "currentOwnerPubkey");
  const ownershipRef = getString(ownershipProof, "ownershipRef");

  let normalizedFromName: string | null = null;
  try {
    normalizedFromName = normalizeName(name);
  } catch {
    normalizedFromName = null;
  }

  addCheck("bundle.format", getString(bundle, "format") === "ont-proof-bundle", "format is ont-proof-bundle");
  addCheck("bundle.version", getNumber(bundle, "bundleVersion") === 0, "bundleVersion is 0");
  addCheck("bundle.proofSource", supportedProofSource, "proofSource is a supported proof-bundle source");
  addCheck("bundle.name.valid", normalizedFromName !== null, "name is a valid ONT name");
  addCheck(
    "bundle.name.normalized",
    normalizedFromName !== null && normalizedName === normalizedFromName,
    "normalizedName matches the canonical ONT name"
  );
  addCheck("bundle.assuranceTier", assuranceTier.length > 0, "assuranceTier is present");
  addCheck("bundle.verificationGoal", hasNonEmptyString(bundle, "verificationGoal"), "verificationGoal is present");
  addCheck("ownership.object", ownershipProof !== null, "ownershipProof is present");
  addCheck("ownership.currentOwnerPubkey", isHexOfLength(currentOwnerPubkey, 32), "current owner pubkey is 32-byte hex");
  addCheck("ownership.ownershipRef", typeof ownershipRef === "string" && ownershipRef.length > 0, "ownershipRef is present");

  validateValueRecordChain({
    bundle,
    addCheck,
    currentOwnerPubkey,
    ownershipRef
  });

  if (supportedProofSource) {
    switch (proofSource) {
      case "bitcoin_l1_direct_auction":
        validateDirectL1AuctionBundle({
          bundle,
          addCheck,
          currentOwnerPubkey
        });
        break;
      case "accumulator_batch_claim":
        validateAccumulatorBatchClaimBundle({
          bundle,
          addCheck,
          normalizedName: normalizedFromName,
          currentOwnerPubkey
        });
        break;
    }
  }

  const passedCheckCount = checks.filter((check) => check.status === "passed").length;
  const failedCheckCount = checks.length - passedCheckCount;
  const reportSource = supportedProofSource ? proofSource : "unknown";
  const reportName = normalizedName || name || "(unknown)";
  const summary = failedCheckCount === 0
    ? `${reportSource} proof bundle for ${reportName} passed ${passedCheckCount} structural checks.`
    : `${reportSource} proof bundle for ${reportName} failed ${failedCheckCount} of ${checks.length} structural checks.`;

  return {
    valid: failedCheckCount === 0,
    proofSource: reportSource,
    name,
    normalizedName,
    assuranceTier,
    passedCheckCount,
    failedCheckCount,
    checks,
    summary
  };
}

/**
 * @deprecated Use {@link verifyProofBundleStructure} (renamed to make the
 * structural-only scope explicit). Bitcoin inclusion is verified separately by
 * {@link verifyProofBundleAgainstBitcoin}.
 */
export function verifyProofBundle(input: unknown): ProofBundleVerificationReport {
  return verifyProofBundleStructure(input);
}

// --- Bitcoin inclusion verification ---------------------------------------
// The structural verifier above proves a bundle is self-consistent. This second
// level proves the bundle's claims are actually anchored in Bitcoin: every cited
// anchor transaction is committed by a block header (Merkle inclusion) and that
// header carries the proof-of-work its own difficulty target demands. With an
// optional header source it also confirms the header is the one on the caller's
// canonical chain at the claimed height (so a valid-PoW-but-off-chain header
// can't be substituted). All hashing uses the protocol's SHA-256 primitive.

/** A block header the caller trusts to be on the canonical chain at `height`. */
export interface BitcoinHeaderSource {
  /** Canonical 80-byte block header (hex) at `height`, or null if unknown. */
  headerHexAtHeight(height: number): string | null;
}

/** One cited anchor with its Bitcoin inclusion proof. */
export interface BitcoinAnchorInclusion {
  readonly txid: string;
  readonly height: number;
  readonly blockHeaderHex: string;
  /** Merkle siblings (display/big-endian hex), as esplora /merkle-proof returns. */
  readonly merkle: readonly string[];
  /** Transaction index within the block (Merkle path direction). */
  readonly pos: number;
}

function doubleSha256(bytes: Uint8Array): Uint8Array {
  return sha256Bytes(sha256Bytes(bytes));
}

function hexToBytesOrNull(hex: unknown): Uint8Array | null {
  if (typeof hex !== "string" || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    return null;
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function reversed(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    out[i] = bytes[bytes.length - 1 - i] as number;
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Compact nBits → 256-bit target. */
function bitsToTarget(bits: number): bigint {
  const exponent = bits >>> 24;
  const mantissa = BigInt(bits & 0x007fffff);
  if (exponent <= 3) {
    return mantissa >> (8n * BigInt(3 - exponent));
  }
  return mantissa << (8n * BigInt(exponent - 3));
}

/** True if doubleSHA256(header) ≤ the target encoded in the header's nBits. */
function headerMeetsTarget(header: Uint8Array): boolean {
  if (header.length !== 80) {
    return false;
  }
  const bits =
    (header[72] as number) |
    ((header[73] as number) << 8) |
    ((header[74] as number) << 16) |
    ((header[75] as number) << 24);
  const target = bitsToTarget(bits >>> 0);
  // Block hash is little-endian internally; its numeric value is the big-endian
  // reading, i.e. the reversed bytes.
  const hashValue = BigInt("0x" + bytesToHex(reversed(doubleSha256(header))));
  return target > 0n && hashValue <= target;
}

/** Recompute the Merkle root (internal byte order) from a txid + sibling path. */
function merkleRootFromProof(
  txidDisplayHex: string,
  siblingsDisplayHex: readonly string[],
  pos: number,
): Uint8Array | null {
  const txid = hexToBytesOrNull(txidDisplayHex);
  if (txid === null || txid.length !== 32) {
    return null;
  }
  let acc = reversed(txid); // display → internal order
  let index = pos;
  for (const siblingHex of siblingsDisplayHex) {
    const siblingBytes = hexToBytesOrNull(siblingHex);
    if (siblingBytes === null || siblingBytes.length !== 32) {
      return null;
    }
    const sibling = reversed(siblingBytes);
    acc =
      (index & 1) === 1
        ? doubleSha256(concatBytes(sibling, acc))
        : doubleSha256(concatBytes(acc, sibling));
    index >>= 1;
  }
  return acc;
}

function parseAnchorInclusions(bundle: JsonRecord): BitcoinAnchorInclusion[] {
  const section = getRecord(bundle, "bitcoinInclusion");
  const anchors = getRecordArray(section, "anchors");
  const parsed: BitcoinAnchorInclusion[] = [];
  for (const anchor of anchors) {
    const txid = getString(anchor, "txid");
    const height = getNumber(anchor, "height");
    const blockHeaderHex = getString(anchor, "blockHeaderHex");
    const pos = getNumber(anchor, "pos");
    const merkleField = getField(anchor, "merkle");
    const merkle = Array.isArray(merkleField)
      ? merkleField.filter((value): value is string => typeof value === "string")
      : [];
    if (txid !== null && height !== null && blockHeaderHex !== null && pos !== null) {
      parsed.push({ txid, height, blockHeaderHex, merkle, pos });
    }
  }
  return parsed;
}

/** The on-chain anchor txid(s) a bundle's ownership claim depends on, by source. */
function citedAnchorTxids(bundle: JsonRecord, proofSource: string): string[] {
  if (proofSource === "accumulator_batch_claim") {
    const txid = getString(getRecord(bundle, "batchAnchor"), "anchorTxid");
    return txid === null ? [] : [txid];
  }
  if (proofSource === "bitcoin_l1_direct_auction") {
    const outpoint = getRecord(getRecord(bundle, "settlementProof"), "currentBondOutpoint");
    const txid = getString(outpoint, "txid");
    return txid === null ? [] : [txid];
  }
  return [];
}

/**
 * Verify a proof bundle AGAINST Bitcoin. Runs the structural verifier first,
 * then proves every cited anchor transaction is Merkle-committed by a block
 * header carrying valid proof-of-work. Pass `options.headerSource` to also pin
 * each header to the canonical chain at its claimed height. The report's `valid`
 * is true only when structure passes AND every cited anchor is Bitcoin-verified.
 */
export function verifyProofBundleAgainstBitcoin(
  input: unknown,
  options: { readonly headerSource?: BitcoinHeaderSource } = {},
): ProofBundleVerificationReport {
  const structural = verifyProofBundleStructure(input);
  const checks: ProofBundleVerificationCheck[] = [...structural.checks];
  const addCheck = (id: string, condition: boolean, message: string): void => {
    checks.push({ id, status: condition ? "passed" : "failed", message });
  };

  const bundle = isRecord(input) ? input : {};
  const proofSource = structural.proofSource;
  const inclusions = parseAnchorInclusions(bundle);
  const cited = proofSource === "unknown" ? [] : citedAnchorTxids(bundle, proofSource);

  addCheck(
    "btc.inclusion.present",
    inclusions.length > 0,
    "bundle carries Bitcoin inclusion proofs (bitcoinInclusion.anchors)",
  );
  addCheck(
    "btc.cited.present",
    cited.length > 0,
    "bundle cites at least one on-chain anchor transaction to verify",
  );

  const verifiedTxids = new Set<string>();
  for (const [index, anchor] of inclusions.entries()) {
    const header = hexToBytesOrNull(anchor.blockHeaderHex);
    const headerOk = header !== null && header.length === 80;
    addCheck(`btc.${index}.header`, headerOk, `anchor ${index + 1} block header is 80 bytes`);

    const powOk = headerOk && headerMeetsTarget(header as Uint8Array);
    addCheck(`btc.${index}.pow`, powOk, `anchor ${index + 1} header meets its proof-of-work target`);

    const computedRoot = merkleRootFromProof(anchor.txid, anchor.merkle, anchor.pos);
    const headerRoot = headerOk ? (header as Uint8Array).slice(36, 68) : null;
    const inclusionOk =
      computedRoot !== null &&
      headerRoot !== null &&
      bytesToHex(computedRoot) === bytesToHex(headerRoot);
    addCheck(
      `btc.${index}.inclusion`,
      inclusionOk,
      `anchor ${index + 1} transaction is Merkle-committed by its block header`,
    );

    let chainOk = true;
    if (options.headerSource) {
      const canonical = options.headerSource.headerHexAtHeight(anchor.height);
      chainOk = canonical !== null && canonical.toLowerCase() === anchor.blockHeaderHex.toLowerCase();
      addCheck(
        `btc.${index}.chain`,
        chainOk,
        `anchor ${index + 1} header is the canonical chain header at height ${anchor.height}`,
      );
    }

    if (headerOk && powOk && inclusionOk && chainOk) {
      verifiedTxids.add(anchor.txid.toLowerCase());
    }
  }

  for (const [index, txid] of cited.entries()) {
    addCheck(
      `btc.cited.${index}.verified`,
      verifiedTxids.has(txid.toLowerCase()),
      `cited anchor ${txid.slice(0, 12)}… has a verified Bitcoin inclusion proof`,
    );
  }

  const passedCheckCount = checks.filter((check) => check.status === "passed").length;
  const failedCheckCount = checks.length - passedCheckCount;
  const anchored = options.headerSource ? "anchored to the supplied chain" : "Merkle/PoW-verified";
  const summary =
    failedCheckCount === 0
      ? `${proofSource} proof bundle for ${structural.normalizedName || structural.name || "(unknown)"} passed all ${passedCheckCount} checks (${anchored}).`
      : `${proofSource} proof bundle for ${structural.normalizedName || structural.name || "(unknown)"} failed ${failedCheckCount} of ${checks.length} checks against Bitcoin.`;

  return {
    valid: failedCheckCount === 0,
    proofSource,
    name: structural.name,
    normalizedName: structural.normalizedName,
    assuranceTier: structural.assuranceTier,
    passedCheckCount,
    failedCheckCount,
    checks,
    summary,
  };
}

function validateDirectL1AuctionBundle(input: {
  readonly bundle: JsonRecord;
  readonly addCheck: (id: string, condition: boolean, message: string) => void;
  readonly currentOwnerPubkey: string | null;
}): void {
  const { bundle, addCheck, currentOwnerPubkey } = input;
  const transcript = getRecord(bundle, "auctionTranscript");
  const bids = getRecordArray(transcript, "acceptedBids");
  const winner = getRecord(transcript, "winner");
  const settlement = getRecord(bundle, "settlementProof");
  const currentBondOutpoint = getRecord(settlement, "currentBondOutpoint");
  const winningTxid = getString(winner, "winningTxid");
  const winnerOwnerPubkey = getString(winner, "winnerOwnerPubkey");
  const winningAmount = parseNonNegativeBigInt(getField(winner, "winningAmountSats"));
  const winningBid = bids.find((bid) => getString(bid, "txid") === winningTxid) ?? null;
  const winningBidAmount = parseNonNegativeBigInt(getField(winningBid, "amountSats"));
  const currentBondValue = parseNonNegativeBigInt(getField(currentBondOutpoint, "valueSats"));
  const requiredBondSats = parseNonNegativeBigInt(getField(settlement, "requiredBondSats"));

  addCheck("direct.transcript.object", transcript !== null, "direct auction transcript is present");
  addCheck(
    "direct.transcript.source",
    getString(transcript, "transcriptSource") === "bitcoin_l1_bid_transactions",
    "direct auction transcript source is Bitcoin L1 bid transactions"
  );
  addCheck("direct.bids.nonempty", bids.length > 0, "direct auction has at least one accepted bid");

  for (const [index, bid] of bids.entries()) {
    addCheck(`direct.bids.${index}.txid`, isHexOfLength(getString(bid, "txid"), 32), `bid ${index + 1} has a 32-byte txid`);
    addCheck(
      `direct.bids.${index}.ownerPubkey`,
      isHexOfLength(getString(bid, "ownerPubkey"), 32),
      `bid ${index + 1} has a 32-byte owner pubkey`
    );
    addCheck(
      `direct.bids.${index}.amount`,
      parseNonNegativeBigInt(getField(bid, "amountSats")) !== null,
      `bid ${index + 1} has a non-negative amount`
    );
  }

  addCheck("direct.winner.object", winner !== null, "direct auction winner is present");
  addCheck("direct.winner.bidFound", winningBid !== null, "winner references an accepted bid");
  addCheck(
    "direct.winner.ownerMatchesBid",
    winningBid !== null && winnerOwnerPubkey === getString(winningBid, "ownerPubkey"),
    "winner owner pubkey matches the winning bid owner pubkey"
  );
  addCheck(
    "direct.winner.amountMatchesBid",
    winningAmount !== null && winningBidAmount !== null && winningAmount === winningBidAmount,
    "winner amount matches the winning bid amount"
  );
  addCheck(
    "direct.ownership.ownerMatchesWinner",
    typeof currentOwnerPubkey === "string" && currentOwnerPubkey === winnerOwnerPubkey,
    "current owner pubkey matches the auction winner"
  );
  addCheck(
    "direct.settlement.kind",
    getString(settlement, "kind") === "winner_bid_bond_becomes_name_bond",
    "settlement uses the winning bid bond as the name bond"
  );
  addCheck(
    "direct.settlement.bondTxMatchesWinner",
    typeof winningTxid === "string" && getString(currentBondOutpoint, "txid") === winningTxid,
    "current bond outpoint txid matches the winning bid txid"
  );
  addCheck(
    "direct.settlement.bondValue",
    currentBondValue !== null && requiredBondSats !== null && currentBondValue >= requiredBondSats,
    "current bond value satisfies the required bond amount"
  );

  // Soundness: the declared winner must be the highest accepted bid. Without this,
  // a bundle can certify a lower bid as winner (internally consistent) while a
  // higher accepted bid sits in the same transcript — the verifier would accept a
  // loser as the owner. "Highest accepted bid wins" is replayed here from the
  // transcript the bundle itself commits to.
  const highestAcceptedBid = bids.reduce<bigint | null>((max, bid) => {
    const amount = parseNonNegativeBigInt(getField(bid, "amountSats"));
    if (amount === null) return max;
    return max === null || amount > max ? amount : max;
  }, null);
  addCheck(
    "direct.winner.isHighestBid",
    winningAmount !== null && highestAcceptedBid !== null && winningAmount === highestAcceptedBid,
    "winner is the highest accepted bid (no accepted bid exceeds it)"
  );

  // Set well-formedness: each accepted bid must be a distinct L1 transaction.
  // Without this, a producer could list the same txid twice (or pad the set with
  // duplicates) — inflating the apparent bid count or smuggling a second "winner"
  // row. We dedupe on txid and require the listed count to match the distinct
  // count. (We only count syntactically valid 32-byte txids so a malformed txid
  // can't masquerade as "unique".)
  const bidTxids = bids
    .map((bid) => getString(bid, "txid"))
    .filter((txid): txid is string => isHexOfLength(txid, 32));
  const distinctBidTxids = new Set(bidTxids);
  addCheck(
    "direct.bids.unique",
    bidTxids.length === bids.length && distinctBidTxids.size === bids.length,
    "every accepted bid is a distinct L1 transaction (no duplicate txids)"
  );

  // HONEST RESIDUAL TRUST (not self-certified here): these checks prove the winner
  // is the highest among the *listed* accepted bids and that the list is internally
  // well-formed — but NOT that the list is the COMPLETE set of L1 bids for this
  // auction. A producer that omits a genuinely higher bid still passes the bundle.
  // Set-completeness vs. Bitcoin can only be established by independently
  // enumerating the auction's L1 bid transactions (the light-client closure,
  // tracked as the open "bitcoinInclusion" work). Documented in docs/core/STATUS.md.
}

function validateAccumulatorBatchClaimBundle(input: {
  readonly bundle: JsonRecord;
  readonly addCheck: (id: string, condition: boolean, message: string) => void;
  readonly normalizedName: string | null;
  readonly currentOwnerPubkey: string | null;
}): void {
  const { bundle, addCheck, normalizedName, currentOwnerPubkey } = input;
  const proof = getRecord(bundle, "accumulatorProof");
  const root = getString(proof, "root");
  const leaf = getString(proof, "leaf");
  const value = getString(proof, "value");
  const siblings = getRecordArray(proof, "siblings");
  const batchAnchor = getRecord(bundle, "batchAnchor");
  const expectedLeaf = normalizedName === null ? null : sha256Hex(utf8ToBytes(normalizedName));

  addCheck("accumulator.proof.object", proof !== null, "accumulator inclusion proof is present");
  addCheck("accumulator.root", isHexOfLength(root, 32), "accumulator root is 32-byte hex");
  addCheck("accumulator.leaf", isHexOfLength(leaf, 32), "leaf key is 32-byte hex");
  addCheck(
    "accumulator.leaf.bindsName",
    expectedLeaf !== null && leaf === expectedLeaf,
    "leaf key equals H(name) — the proof is bound to this name"
  );
  addCheck("accumulator.value", isHexOfLength(value, 32), "owner value commitment is 32-byte hex");
  // The value the membership proof commits to MUST be the claimed current owner
  // — otherwise the bundle blesses an owner the proof does not actually prove.
  addCheck(
    "accumulator.value.bindsOwner",
    value === currentOwnerPubkey,
    "owner value commitment equals the claimed current owner pubkey"
  );
  addCheck("accumulator.siblings.array", Array.isArray(getField(proof, "siblings")), "membership proof siblings are an array");
  for (const [index, sibling] of siblings.entries()) {
    addCheck(`accumulator.siblings.${index}.level`, getNumber(sibling, "level") !== null, `sibling ${index + 1} has a level`);
    addCheck(`accumulator.siblings.${index}.hash`, isHexOfLength(getString(sibling, "hash"), 32), `sibling ${index + 1} hash is 32-byte hex`);
  }
  // Soundness: recompute the sparse-Merkle root from (leaf, value, siblings) and
  // require it to equal the claimed root. Without this the verifier accepts any
  // structurally well-formed proof for a name the bundle is not a member of.
  // Shares the exact fold (@ont/protocol) used to BUILD roots, so the offline
  // verifier and the live indexer cannot disagree about membership.
  const membershipRecomputes =
    proof !== null &&
    isHexOfLength(root, 32) &&
    isHexOfLength(leaf, 32) &&
    isHexOfLength(value, 32) &&
    siblings.every((s) => getNumber(s, "level") !== null && isHexOfLength(getString(s, "hash"), 32)) &&
    verifyAccumulatorMembership(root as string, {
      keyHex: leaf as string,
      value: value as string,
      siblings: siblings.map((s) => ({ level: getNumber(s, "level") as number, hash: getString(s, "hash") as string }))
    });
  addCheck(
    "accumulator.membership.verifies",
    membershipRecomputes,
    "membership proof recomputes to the claimed accumulator root"
  );
  addCheck("accumulator.anchor.object", batchAnchor !== null, "batch anchor metadata is present");
  addCheck("accumulator.anchor.txid", isHexOfLength(getString(batchAnchor, "anchorTxid"), 32), "batch anchor txid is 32-byte hex");
  addCheck("accumulator.anchor.height", getNumber(batchAnchor, "anchorHeight") !== null, "batch anchor height is present");
}

function validateValueRecordChain(input: {
  readonly bundle: JsonRecord;
  readonly addCheck: (id: string, condition: boolean, message: string) => void;
  readonly currentOwnerPubkey: string | null;
  readonly ownershipRef: string | null;
}): void {
  const { bundle, addCheck, currentOwnerPubkey, ownershipRef } = input;
  const valueRecordChain = getRecord(bundle, "valueRecordChain");
  if (valueRecordChain === null) {
    return;
  }

  const records = getRecordArray(valueRecordChain, "records");
  addCheck("valueRecords.records.array", Array.isArray(getField(valueRecordChain, "records")), "value record chain records are an array");

  let previousRecordHash: string | null = null;
  for (const [index, record] of records.entries()) {
    const expectedSequence = index + 1;
    const recordHash = getString(record, "recordHash");
    const declaredPreviousRecordHash = getField(record, "previousRecordHash");
    const previousMatches =
      (previousRecordHash === null && declaredPreviousRecordHash === null) ||
      (typeof declaredPreviousRecordHash === "string" && declaredPreviousRecordHash === previousRecordHash);

    addCheck(
      `valueRecords.${index}.recordHash`,
      isHexOfLength(recordHash, 32),
      `value record ${expectedSequence} has a 32-byte record hash`
    );
    addCheck(
      `valueRecords.${index}.sequence`,
      getNumber(record, "sequence") === expectedSequence,
      `value record ${expectedSequence} has the expected sequence number`
    );
    addCheck(
      `valueRecords.${index}.previousRecordHash`,
      previousMatches,
      `value record ${expectedSequence} references the previous value record`
    );
    addCheck(
      `valueRecords.${index}.ownerPubkey`,
      typeof currentOwnerPubkey === "string" && getString(record, "ownerPubkey") === currentOwnerPubkey,
      `value record ${expectedSequence} is signed for the current owner pubkey`
    );
    addCheck(
      `valueRecords.${index}.ownershipRef`,
      typeof ownershipRef === "string" && getString(record, "ownershipRef") === ownershipRef,
      `value record ${expectedSequence} references the current ownershipRef`
    );

    previousRecordHash = recordHash;
  }
}

function isProofBundleSource(value: string): value is ProofBundleSource {
  return PROOF_BUNDLE_SOURCES.has(value);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getField(record: JsonRecord | null, key: string): unknown {
  return record === null ? undefined : record[key];
}

function getRecord(record: JsonRecord | null, key: string): JsonRecord | null {
  const value = getField(record, key);
  return isRecord(value) ? value : null;
}

function getRecordArray(record: JsonRecord | null, key: string): readonly JsonRecord[] {
  const value = getField(record, key);
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function getString(record: JsonRecord | null, key: string): string | null {
  const value = getField(record, key);
  return typeof value === "string" ? value : null;
}

function getNumber(record: JsonRecord | null, key: string): number | null {
  const value = getField(record, key);
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function getBoolean(record: JsonRecord | null, key: string): boolean | null {
  const value = getField(record, key);
  return typeof value === "boolean" ? value : null;
}

function hasNonEmptyString(record: JsonRecord | null, key: string): boolean {
  const value = getString(record, key);
  return typeof value === "string" && value.length > 0;
}

function isHexOfLength(value: string | null, byteLength: number): boolean {
  return typeof value === "string" && new RegExp(`^[0-9a-fA-F]{${byteLength * 2}}$`).test(value);
}

function parseNonNegativeBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") {
    return value >= 0n ? value : null;
  }

  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  }

  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    return BigInt(value);
  }

  return null;
}
