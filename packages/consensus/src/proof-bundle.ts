import { normalizeName, sha256Hex, utf8ToBytes } from "@ont/protocol";

export type ProofBundleSource =
  // Current acquisition paths:
  | "bitcoin_l1_direct_auction"
  | "accumulator_batch_claim"
  // Experimental / research sources (superseded explorations — not the current launch path):
  | "ark_auction_transcript"
  | "ark_sponsored_claim"
  | "rgb_style_state_transition";

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
  "accumulator_batch_claim",
  "ark_auction_transcript",
  "ark_sponsored_claim",
  "rgb_style_state_transition"
]);

export function verifyProofBundle(input: unknown): ProofBundleVerificationReport {
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
          normalizedName: normalizedFromName
        });
        break;
      case "ark_auction_transcript":
        validateArkAuctionBundle({
          bundle,
          addCheck,
          currentOwnerPubkey
        });
        break;
      case "ark_sponsored_claim":
        validateArkSponsoredClaimBundle({
          bundle,
          addCheck,
          currentOwnerPubkey
        });
        break;
      case "rgb_style_state_transition":
        validateRgbStyleStateTransitionBundle({
          bundle,
          addCheck,
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
}

function validateAccumulatorBatchClaimBundle(input: {
  readonly bundle: JsonRecord;
  readonly addCheck: (id: string, condition: boolean, message: string) => void;
  readonly normalizedName: string | null;
}): void {
  const { bundle, addCheck, normalizedName } = input;
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
  addCheck("accumulator.siblings.array", Array.isArray(getField(proof, "siblings")), "membership proof siblings are an array");
  for (const [index, sibling] of siblings.entries()) {
    addCheck(`accumulator.siblings.${index}.level`, getNumber(sibling, "level") !== null, `sibling ${index + 1} has a level`);
    addCheck(`accumulator.siblings.${index}.hash`, isHexOfLength(getString(sibling, "hash"), 32), `sibling ${index + 1} hash is 32-byte hex`);
  }
  addCheck("accumulator.anchor.object", batchAnchor !== null, "batch anchor metadata is present");
  addCheck("accumulator.anchor.txid", isHexOfLength(getString(batchAnchor, "anchorTxid"), 32), "batch anchor txid is 32-byte hex");
  addCheck("accumulator.anchor.height", getNumber(batchAnchor, "anchorHeight") !== null, "batch anchor height is present");
}

function validateArkAuctionBundle(input: {
  readonly bundle: JsonRecord;
  readonly addCheck: (id: string, condition: boolean, message: string) => void;
  readonly currentOwnerPubkey: string | null;
}): void {
  const { bundle, addCheck, currentOwnerPubkey } = input;
  const transcript = getRecord(bundle, "auctionTranscript");
  const batch = getRecord(transcript, "transcriptBatch");
  const bids = getRecordArray(transcript, "acceptedBids");
  const winner = getRecord(transcript, "winner");
  const settlement = getRecord(bundle, "settlementProof");
  const currentBondOutpoint = getRecord(settlement, "currentBondOutpoint");
  const winningBidId = getString(winner, "bidId");
  const winnerOwnerPubkey = getString(winner, "winnerOwnerPubkey");
  const winningAmount = parseNonNegativeBigInt(getField(winner, "winningAmountSats"));
  const winningBid = bids.find((bid) => getString(bid, "bidId") === winningBidId) ?? null;
  const winningBidAmount = parseNonNegativeBigInt(getField(winningBid, "amountSats"));
  const currentBondValue = parseNonNegativeBigInt(getField(currentBondOutpoint, "valueSats"));
  const requiredBondSats = parseNonNegativeBigInt(getField(settlement, "requiredBondSats"));

  addCheck("arkAuction.transcript.object", transcript !== null, "Ark auction transcript is present");
  addCheck(
    "arkAuction.transcript.source",
    getString(transcript, "transcriptSource") === "ark_batch_transcript",
    "Ark auction transcript source is an Ark batch transcript"
  );
  addCheck(
    "arkAuction.rules.sameAsL1",
    getBoolean(transcript, "sameAuctionRulesAsL1") === true,
    "Ark auction uses the same ONT auction rules as L1"
  );
  addCheck("arkAuction.batch.object", batch !== null, "Ark auction transcript batch metadata is present");
  addCheck("arkAuction.batch.merkleRoot", isHexOfLength(getString(batch, "merkleRoot"), 32), "Ark batch Merkle root is 32-byte hex");
  addCheck("arkAuction.bids.nonempty", bids.length > 0, "Ark auction has at least one accepted bid");

  for (const [index, bid] of bids.entries()) {
    const collateral = getRecord(bid, "collateralProof");
    addCheck(`arkAuction.bids.${index}.bidId`, hasNonEmptyString(bid, "bidId"), `bid ${index + 1} has a bid id`);
    addCheck(
      `arkAuction.bids.${index}.ownerPubkey`,
      isHexOfLength(getString(bid, "ownerPubkey"), 32),
      `bid ${index + 1} has a 32-byte owner pubkey`
    );
    addCheck(`arkAuction.bids.${index}.inclusionProof`, hasNonEmptyString(bid, "inclusionProof"), `bid ${index + 1} has an inclusion proof`);
    addCheck(`arkAuction.bids.${index}.collateral`, collateral !== null, `bid ${index + 1} has collateral proof metadata`);
  }

  addCheck("arkAuction.winner.object", winner !== null, "Ark auction winner is present");
  addCheck("arkAuction.winner.bidFound", winningBid !== null, "winner references an accepted Ark bid");
  addCheck(
    "arkAuction.winner.ownerMatchesBid",
    winningBid !== null && winnerOwnerPubkey === getString(winningBid, "ownerPubkey"),
    "winner owner pubkey matches the winning Ark bid owner pubkey"
  );
  addCheck(
    "arkAuction.winner.amountMatchesBid",
    winningAmount !== null && winningBidAmount !== null && winningAmount === winningBidAmount,
    "winner amount matches the winning Ark bid amount"
  );
  addCheck(
    "arkAuction.ownership.ownerMatchesWinner",
    typeof currentOwnerPubkey === "string" && currentOwnerPubkey === winnerOwnerPubkey,
    "current owner pubkey matches the Ark auction winner"
  );
  addCheck(
    "arkAuction.settlement.kind",
    getString(settlement, "kind") === "l1_winner_bond_after_ark_transcript",
    "Ark auction winner settles into a normal L1 name bond"
  );
  addCheck(
    "arkAuction.settlement.bondValue",
    currentBondValue !== null && requiredBondSats !== null && currentBondValue >= requiredBondSats,
    "current L1 bond value satisfies the required bond amount"
  );
}

function validateArkSponsoredClaimBundle(input: {
  readonly bundle: JsonRecord;
  readonly addCheck: (id: string, condition: boolean, message: string) => void;
  readonly currentOwnerPubkey: string | null;
}): void {
  const { bundle, addCheck, currentOwnerPubkey } = input;
  const ownershipProof = getRecord(bundle, "ownershipProof");
  const sponsorCreditProof = getRecord(bundle, "sponsorCreditProof");
  const creditStateBefore = getRecord(sponsorCreditProof, "creditStateBefore");
  const creditSpend = getRecord(sponsorCreditProof, "creditSpend");
  const creditStateAfter = getRecord(sponsorCreditProof, "creditStateAfter");
  const sponsoredClaim = getRecord(bundle, "sponsoredClaim");
  const challengeWindow = getRecord(bundle, "challengeWindow");
  const beforeCredits = parseNonNegativeBigInt(getField(creditStateBefore, "availableCredits"));
  const creditsSpent = parseNonNegativeBigInt(getField(creditSpend, "creditsSpent"));
  const afterCredits = parseNonNegativeBigInt(getField(creditStateAfter, "availableCredits"));
  const startHeight = getNumber(challengeWindow, "startHeight");
  const endHeight = getNumber(challengeWindow, "endHeight");

  addCheck("arkSponsored.sponsorCreditProof.object", sponsorCreditProof !== null, "sponsor credit proof is present");
  addCheck(
    "arkSponsored.sponsor.ownerPubkey",
    isHexOfLength(getString(sponsorCreditProof, "sponsorOwnerPubkey"), 32),
    "sponsor owner pubkey is 32-byte hex"
  );
  addCheck("arkSponsored.claim.object", sponsoredClaim !== null, "sponsored claim is present");
  addCheck("arkSponsored.claim.inclusionProof", hasNonEmptyString(sponsoredClaim, "inclusionProof"), "sponsored claim has an inclusion proof");
  addCheck(
    "arkSponsored.claim.recipientMatchesOwner",
    typeof currentOwnerPubkey === "string" && getString(sponsoredClaim, "recipientOwnerPubkey") === currentOwnerPubkey,
    "sponsored claim recipient owner pubkey matches current owner"
  );
  addCheck(
    "arkSponsored.credits.beforeCoversSpend",
    beforeCredits !== null && creditsSpent !== null && beforeCredits >= creditsSpent,
    "available credits before the transition cover the credit spend"
  );
  addCheck(
    "arkSponsored.credits.afterMatchesSpend",
    beforeCredits !== null && creditsSpent !== null && afterCredits !== null && afterCredits === beforeCredits - creditsSpent,
    "available credits after the transition equal prior credits minus spent credits"
  );
  addCheck(
    "arkSponsored.challengeWindow.ordering",
    startHeight !== null && endHeight !== null && endHeight >= startHeight,
    "challenge window end height is at or after start height"
  );
  addCheck(
    "arkSponsored.challengeWindow.uncontestedFinal",
    getString(challengeWindow, "challengeResult") !== "uncontested" ||
      getString(ownershipProof, "state") === "sponsored_final",
    "uncontested sponsored claims finalize into sponsored_final ownership state"
  );
  addCheck(
    "arkSponsored.transferPolicy.afterFinality",
    getString(ownershipProof, "transferPolicy") === "owner_key_transfer_after_finality_preserves_assurance",
    "sponsored names transfer by owner key after finality while preserving assurance tier"
  );
}

function validateRgbStyleStateTransitionBundle(input: {
  readonly bundle: JsonRecord;
  readonly addCheck: (id: string, condition: boolean, message: string) => void;
  readonly currentOwnerPubkey: string | null;
}): void {
  const { bundle, addCheck, currentOwnerPubkey } = input;
  const contract = getRecord(bundle, "rgbLikeContract");
  const transitions = getRecordArray(bundle, "stateTransitionChain");
  const ownership = getRecord(bundle, "ownershipProof");
  const latestTransition = transitions.length > 0 ? transitions[transitions.length - 1] ?? null : null;

  addCheck("rgb.contract.object", contract !== null, "RGB-like contract metadata is present");
  addCheck("rgb.contract.schema", hasNonEmptyString(contract, "schemaId"), "RGB-like schema id is present");
  addCheck("rgb.transitions.nonempty", transitions.length > 0, "RGB-like state transition chain is present");

  for (const [index, transition] of transitions.entries()) {
    addCheck(`rgb.transitions.${index}.transitionId`, hasNonEmptyString(transition, "transitionId"), `transition ${index + 1} has an id`);
    addCheck(
      `rgb.transitions.${index}.newOwnerPubkey`,
      isHexOfLength(getString(transition, "newOwnerPubkey"), 32),
      `transition ${index + 1} has a 32-byte new owner pubkey`
    );

    if (index > 0) {
      const previousTransition = transitions[index - 1] ?? null;
      addCheck(
        `rgb.transitions.${index}.previousTransitionId`,
        getString(transition, "previousTransitionId") === getString(previousTransition, "transitionId"),
        `transition ${index + 1} references the previous transition id`
      );
    }
  }

  addCheck(
    "rgb.ownership.latestTransition",
    latestTransition !== null && getString(ownership, "latestTransitionId") === getString(latestTransition, "transitionId"),
    "ownership proof references the latest transition"
  );
  addCheck(
    "rgb.ownership.currentOwner",
    latestTransition !== null &&
      typeof currentOwnerPubkey === "string" &&
      currentOwnerPubkey === getString(latestTransition, "newOwnerPubkey"),
    "current owner pubkey matches the latest state transition"
  );
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
