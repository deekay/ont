#!/usr/bin/env node
// #46 Value-record + recovery-descriptor lifecycle vs live infra.
//
// Drives the resolver's value-record and recovery-descriptor write paths over
// the tunnel against a real mature, on-chain auction-acquired name and asserts
// the resolver enforces ownership + sequence rules:
//
//   value records:
//     sign-value-record -> publish-value-record (seq N, N+1) -> get-value/get-value-history
//     replay (stale_sequence), gap (sequence_gap), wrong owner (owner_mismatch)
//   recovery descriptors:
//     sign-recovery-descriptor -> publish-recovery-descriptor (seq M, M+1) -> get-recovery-descriptor/history
//     replay (stale_sequence), wrong owner (owner_mismatch)
//   recovery wallet proof:
//     print-recovery-wallet-proof-message -> BIP322 sign with the recovery wallet
//     -> build-recovery-wallet-proof -> verify-recovery-wallet-proof (valid)
//     -> publish-recovery-wallet-proof (201); tampered proof -> verify fails locally
//
// All write paths run through the CLI; rejections are checked via raw resolver POSTs.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Signer } from "bip322-js";

import {
  cliJson,
  publishScenarioSummary,
  resolverUrl,
  runCommand,
  scenarioArtifactsDir,
  waitForResolver,
  withPrivateSignetSession,
  writeScenarioSummary
} from "./private-signet-smoke-lib.mjs";

const SCENARIO = "value-recovery";
const REMOTE_SUMMARY_PATH = "/var/lib/ont/private-value-recovery-summary.json";
const ROOT = new URL("..", import.meta.url).pathname;
const TSX_BIN = `${ROOT}node_modules/.bin/tsx`;
const CLI_ENTRY = "apps/cli/src/index.ts";

const scenarios = [];
function record(entry) {
  scenarios.push(entry);
  const tag = entry.outcome === "pass" ? "PASS" : "FAIL";
  console.log(`[${SCENARIO}] ${tag} ${entry.step} :: ${entry.detail}`);
  return entry;
}

// Raw CLI stdout (for commands that print plain strings rather than JSON).
async function cliText(args) {
  const { stdout } = await runCommand(TSX_BIN, [CLI_ENTRY, ...args], { cwd: ROOT });
  return stdout.trim();
}

// CLI that may exit non-zero (verify sets exit code 1 on invalid proofs;
// a forged envelope is rejected at parse time before any JSON is printed).
async function cliResultAllowFail(args) {
  const { code, stdout, stderr } = await runCommand(TSX_BIN, [CLI_ENTRY, ...args], {
    cwd: ROOT,
    allowFailure: true
  });
  let json = null;
  try {
    json = stdout.length > 0 ? JSON.parse(stdout) : null;
  } catch {
    json = null;
  }
  return { code, stdout, stderr, json };
}

function resolverBase() {
  return resolverUrl().replace(/\/$/, "");
}

async function postJson(path, body) {
  const res = await fetch(`${resolverBase()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  return { status: res.status, payload: text.length === 0 ? null : JSON.parse(text) };
}

async function getJson(path) {
  const res = await fetch(`${resolverBase()}${path}`);
  const text = await res.text();
  return { status: res.status, payload: text.length === 0 ? null : JSON.parse(text) };
}

function assertExpectedPublish(step, result, detail) {
  const ok = result.status === 201 && result.payload?.ok === true;
  return record({
    step,
    outcome: ok ? "pass" : "fail",
    status: result.status,
    detail: ok ? detail : `expected 201 ok, got ${result.status} ${JSON.stringify(result.payload)}`
  });
}

function assertRejected(step, result, expectedError, detail) {
  const observedError = result.payload?.error ?? null;
  const ok = result.status >= 400 && observedError === expectedError;
  return record({
    step,
    outcome: ok ? "pass" : "fail",
    status: result.status,
    observedError,
    expectedError,
    detail: ok
      ? `${detail} -> ${result.status} ${observedError}`
      : `expected ${expectedError}, got ${result.status} ${observedError} ${JSON.stringify(result.payload)}`
  });
}

async function main() {
  await withPrivateSignetSession(async ({ owner, recipient, pendingOwner }) => {
    await waitForResolver();
    const outDir = scenarioArtifactsDir(SCENARIO);
    await mkdir(outDir, { recursive: true });

    const wifByAddress = new Map([
      [owner.fundingAddress, owner.fundingWif],
      [recipient.fundingAddress, recipient.fundingWif],
      [pendingOwner.fundingAddress, pendingOwner.fundingWif]
    ]);

    // --- select a mature name owned by `owner` -----------------------------
    const namesResponse = await getJson("/names");
    const names = namesResponse.payload?.names ?? [];
    const target = names.find(
      (entry) => entry.status === "mature" && entry.currentOwnerPubkey === owner.ownerPubkey
    );
    if (!target) {
      throw new Error("no mature name owned by the owner account is available on the resolver");
    }
    const name = target.name;
    const ownershipRef = target.lastStateTxid;
    console.log(
      `[${SCENARIO}] selected name=${name} owner=${owner.ownerPubkey.slice(0, 12)}… ownershipRef=${ownershipRef.slice(0, 12)}…`
    );

    // =====================================================================
    // PART A — value records
    // =====================================================================
    // Auto-resolve the next sequence from the resolver's chain head.
    const valueAStem = join(outDir, "value-a.json");
    const valueA = await cliJson([
      "sign-value-record",
      "--name", name,
      "--owner-private-key-hex", owner.ownerPrivateKeyHex,
      "--resolver-url", resolverUrl(),
      "--value-type", "2",
      "--payload-utf8", `https://ont.example/${name}/a-${Date.now()}`,
      "--write", valueAStem
    ]);
    const seqA = valueA.sequence;
    const publishA = await postJson("/values", valueA);
    assertExpectedPublish(`value publish seq=${seqA}`, publishA, `accepted at sequence ${seqA}`);

    const currentAfterA = await getJson(`/name/${name}/value`);
    record({
      step: "get-value after seq A",
      outcome: currentAfterA.payload?.sequence === seqA ? "pass" : "fail",
      detail: `current sequence=${currentAfterA.payload?.sequence} (want ${seqA})`
    });

    // Next sequence (auto-resolved → seqA + 1), new payload.
    const valueBStem = join(outDir, "value-b.json");
    const valueB = await cliJson([
      "sign-value-record",
      "--name", name,
      "--owner-private-key-hex", owner.ownerPrivateKeyHex,
      "--resolver-url", resolverUrl(),
      "--value-type", "2",
      "--payload-utf8", `https://ont.example/${name}/b-${Date.now()}`,
      "--write", valueBStem
    ]);
    const seqB = valueB.sequence;
    record({
      step: "sign-value-record monotonic next",
      outcome: seqB === seqA + 1 && valueB.previousRecordHash === publishA.payload?.recordHash ? "pass" : "fail",
      detail: `seqB=${seqB} (want ${seqA + 1}); previousRecordHash links to seq A head=${valueB.previousRecordHash === publishA.payload?.recordHash}`
    });
    const publishB = await postJson("/values", valueB);
    assertExpectedPublish(`value publish seq=${seqB}`, publishB, `accepted at sequence ${seqB}`);

    const currentAfterB = await getJson(`/name/${name}/value`);
    record({
      step: "get-value after seq B",
      outcome: currentAfterB.payload?.sequence === seqB ? "pass" : "fail",
      detail: `current sequence=${currentAfterB.payload?.sequence} (want ${seqB})`
    });

    // History chain via CLI: contiguous + predecessor linkage.
    const history = await cliJson(["get-value-history", name, "--resolver-url", resolverUrl()]);
    const histRecords = history.records ?? history.chain?.records ?? [];
    const tail = histRecords.slice(-2);
    const contiguous =
      tail.length === 2 &&
      tail[1].sequence === tail[0].sequence + 1 &&
      tail[1].previousRecordHash === tail[0].recordHash;
    record({
      step: "get-value-history monotonic chain",
      outcome: contiguous ? "pass" : "fail",
      detail: `history length=${histRecords.length}; last two contiguous+linked=${contiguous}`
    });

    // Replay: re-POST the seq A record (now stale) → stale_sequence.
    assertRejected("value replay (stale seq A)", await postJson("/values", valueA), "stale_sequence", "replay of seq A");

    // Sequence gap: explicit sequence far ahead of head → sequence_gap.
    const valueGapStem = join(outDir, "value-gap.json");
    const valueGap = await cliJson([
      "sign-value-record",
      "--name", name,
      "--owner-private-key-hex", owner.ownerPrivateKeyHex,
      "--ownership-ref", ownershipRef,
      "--previous-record-hash", publishB.payload?.recordHash,
      "--sequence", String(seqB + 4),
      "--value-type", "2",
      "--payload-utf8", "gap",
      "--write", valueGapStem
    ]);
    assertRejected("value sequence gap", await postJson("/values", valueGap), "sequence_gap", `seq ${seqB + 4} skips head ${seqB}`);

    // Wrong owner: sign with recipient's key for owner's name → owner_mismatch.
    const valueWrongOwnerStem = join(outDir, "value-wrong-owner.json");
    const valueWrongOwner = await cliJson([
      "sign-value-record",
      "--name", name,
      "--owner-private-key-hex", recipient.ownerPrivateKeyHex,
      "--ownership-ref", ownershipRef,
      "--previous-record-hash", publishB.payload?.recordHash,
      "--sequence", String(seqB + 1),
      "--value-type", "2",
      "--payload-utf8", "intruder",
      "--write", valueWrongOwnerStem
    ]);
    assertRejected("value wrong owner", await postJson("/values", valueWrongOwner), "owner_mismatch", "recipient key signs owner's name");

    // =====================================================================
    // PART B — recovery descriptors
    // =====================================================================
    const recoveryAStem = join(outDir, "recovery-a.json");
    const recoveryA = await cliJson([
      "sign-recovery-descriptor",
      "--name", name,
      "--owner-private-key-hex", owner.ownerPrivateKeyHex,
      "--resolver-url", resolverUrl(),
      "--recovery-address", pendingOwner.fundingAddress,
      "--write", recoveryAStem
    ]);
    const recSeqA = recoveryA.sequence;
    const recPublishA = await postJson("/recovery-descriptors", recoveryA);
    assertExpectedPublish(`recovery publish seq=${recSeqA}`, recPublishA, `accepted at sequence ${recSeqA}, addr=pendingOwner`);

    const recCurrentAfterA = await getJson(`/name/${name}/recovery`);
    record({
      step: "get-recovery-descriptor after seq A",
      outcome:
        recCurrentAfterA.payload?.sequence === recSeqA &&
        recCurrentAfterA.payload?.recoveryAddress === pendingOwner.fundingAddress
          ? "pass"
          : "fail",
      detail: `current seq=${recCurrentAfterA.payload?.sequence} addr=${recCurrentAfterA.payload?.recoveryAddress}`
    });

    // Rotate the recovery address at the next sequence.
    const recoveryBStem = join(outDir, "recovery-b.json");
    const recoveryB = await cliJson([
      "sign-recovery-descriptor",
      "--name", name,
      "--owner-private-key-hex", owner.ownerPrivateKeyHex,
      "--resolver-url", resolverUrl(),
      "--recovery-address", recipient.fundingAddress,
      "--write", recoveryBStem
    ]);
    const recSeqB = recoveryB.sequence;
    record({
      step: "sign-recovery-descriptor monotonic next",
      outcome:
        recSeqB === recSeqA + 1 &&
        recoveryB.previousDescriptorHash === recPublishA.payload?.descriptorHash
          ? "pass"
          : "fail",
      detail: `seqB=${recSeqB} (want ${recSeqA + 1}); links to seq A head=${recoveryB.previousDescriptorHash === recPublishA.payload?.descriptorHash}`
    });
    const recPublishB = await postJson("/recovery-descriptors", recoveryB);
    assertExpectedPublish(`recovery publish seq=${recSeqB}`, recPublishB, `accepted at sequence ${recSeqB}, addr=recipient`);

    const recHistory = await cliJson(["get-recovery-descriptor-history", name, "--resolver-url", resolverUrl()]);
    const recDescriptors = recHistory.descriptors ?? recHistory.chain?.descriptors ?? [];
    const recTail = recDescriptors.slice(-2);
    const recContiguous =
      recTail.length === 2 &&
      recTail[1].sequence === recTail[0].sequence + 1 &&
      recTail[1].previousDescriptorHash === recTail[0].descriptorHash;
    record({
      step: "get-recovery-descriptor-history monotonic chain",
      outcome: recContiguous ? "pass" : "fail",
      detail: `history length=${recDescriptors.length}; last two contiguous+linked=${recContiguous}`
    });

    // Replay + wrong owner rejections.
    assertRejected(
      "recovery replay (stale seq A)",
      await postJson("/recovery-descriptors", recoveryA),
      "stale_sequence",
      "replay of recovery seq A"
    );

    const recWrongOwnerStem = join(outDir, "recovery-wrong-owner.json");
    const recWrongOwner = await cliJson([
      "sign-recovery-descriptor",
      "--name", name,
      "--owner-private-key-hex", recipient.ownerPrivateKeyHex,
      "--ownership-ref", ownershipRef,
      "--previous-descriptor-hash", recPublishB.payload?.descriptorHash,
      "--sequence", String(recSeqB + 1),
      "--recovery-address", recipient.fundingAddress,
      "--write", recWrongOwnerStem
    ]);
    assertRejected(
      "recovery wrong owner",
      await postJson("/recovery-descriptors", recWrongOwner),
      "owner_mismatch",
      "recipient key signs owner's recovery descriptor"
    );

    // =====================================================================
    // PART C — recovery wallet proof (build/print/verify/publish)
    // =====================================================================
    // The head descriptor (recovery-b) names recipient.fundingAddress as the
    // recovery wallet; the proof must carry that wallet's BIP322 signature.
    const headDescriptorPath = recoveryBStem;
    const recoveryAddress = recipient.fundingAddress;
    const recoveryWif = wifByAddress.get(recoveryAddress);
    const newOwnerPubkey = pendingOwner.ownerPubkey;
    const successorBondVout = "0";

    const proofMessage = await cliText([
      "print-recovery-wallet-proof-message",
      headDescriptorPath,
      "--prev-state-txid", ownershipRef,
      "--new-owner-pubkey", newOwnerPubkey,
      "--successor-bond-vout", successorBondVout
    ]);
    record({
      step: "print-recovery-wallet-proof-message",
      outcome: proofMessage.length > 0 ? "pass" : "fail",
      detail: `message length=${proofMessage.length}`
    });

    const signatureBase64 = Signer.sign(recoveryWif, recoveryAddress, proofMessage);
    const proofPath = join(outDir, "recovery-wallet-proof.json");
    const proof = await cliJson([
      "build-recovery-wallet-proof",
      headDescriptorPath,
      "--prev-state-txid", ownershipRef,
      "--new-owner-pubkey", newOwnerPubkey,
      "--successor-bond-vout", successorBondVout,
      "--signature-base64", signatureBase64,
      "--write", proofPath
    ]);
    record({
      step: "build-recovery-wallet-proof",
      outcome: proof.proofHash && proof.message === proofMessage ? "pass" : "fail",
      detail: `proofHash=${proof.proofHash?.slice(0, 12)}…; message matches printed=${proof.message === proofMessage}`
    });

    const verifyValid = await cliResultAllowFail(["verify-recovery-wallet-proof", headDescriptorPath, proofPath]);
    record({
      step: "verify-recovery-wallet-proof (valid)",
      outcome: verifyValid.json?.ok === true && verifyValid.json?.reason === "valid" ? "pass" : "fail",
      detail: `ok=${verifyValid.json?.ok} reason=${verifyValid.json?.reason}`
    });

    const proofPublish = await postJson("/recovery-proofs", proof);
    record({
      step: "publish-recovery-wallet-proof",
      outcome: proofPublish.status === 201 && proofPublish.payload?.ok === true ? "pass" : "fail",
      status: proofPublish.status,
      detail:
        proofPublish.status === 201
          ? `accepted, proofHash=${proofPublish.payload?.proofHash?.slice(0, 12)}…`
          : `expected 201, got ${proofPublish.status} ${JSON.stringify(proofPublish.payload)}`
    });

    // Confirm the published proof is retrievable by hash.
    const proofLookup = await getJson(`/recovery-proofs/${proof.proofHash}`);
    record({
      step: "get recovery proof by hash",
      outcome: proofLookup.status === 200 ? "pass" : "fail",
      status: proofLookup.status,
      detail: `lookup status=${proofLookup.status}`
    });

    // Adversarial (1): tamper newOwnerPubkey but leave message stale → the proof
    // envelope is self-verifying at parse time, so it is rejected before verify runs.
    const flipped = `${newOwnerPubkey.slice(0, -2)}${newOwnerPubkey.endsWith("00") ? "11" : "00"}`;
    const tamperedEnvelopePath = join(outDir, "recovery-wallet-proof-tampered-envelope.json");
    await writeFile(
      tamperedEnvelopePath,
      JSON.stringify({ ...proof, newOwnerPubkey: flipped }, null, 2) + "\n",
      "utf8"
    );
    const verifyTamperedEnvelope = await cliResultAllowFail([
      "verify-recovery-wallet-proof",
      headDescriptorPath,
      tamperedEnvelopePath
    ]);
    record({
      step: "verify-recovery-wallet-proof (forged envelope rejected at parse)",
      outcome: verifyTamperedEnvelope.code !== 0 && verifyTamperedEnvelope.json?.ok !== true ? "pass" : "fail",
      detail: `exit=${verifyTamperedEnvelope.code}; ${verifyTamperedEnvelope.stderr.split("\n")[0].slice(0, 120)}`
    });

    // Adversarial (2): flip newOwnerPubkey AND recompute a consistent message, but
    // reuse the original signature → envelope parses, signature check fails.
    const tamperedMessage = await cliText([
      "print-recovery-wallet-proof-message",
      headDescriptorPath,
      "--prev-state-txid", ownershipRef,
      "--new-owner-pubkey", flipped,
      "--successor-bond-vout", successorBondVout
    ]);
    const tamperedSigPath = join(outDir, "recovery-wallet-proof-tampered-sig.json");
    await writeFile(
      tamperedSigPath,
      JSON.stringify({ ...proof, newOwnerPubkey: flipped, message: tamperedMessage }, null, 2) + "\n",
      "utf8"
    );
    const verifyTamperedSig = await cliResultAllowFail([
      "verify-recovery-wallet-proof",
      headDescriptorPath,
      tamperedSigPath
    ]);
    record({
      step: "verify-recovery-wallet-proof (wrong signature rejected)",
      outcome:
        verifyTamperedSig.json?.ok === false && verifyTamperedSig.json?.reason === "wallet_signature_invalid"
          ? "pass"
          : "fail",
      detail: `ok=${verifyTamperedSig.json?.ok} reason=${verifyTamperedSig.json?.reason}`
    });

    // ----- summary -------------------------------------------------------
    const failures = scenarios.filter((entry) => entry.outcome !== "pass");
    const summary = {
      kind: "ont-private-signet-value-recovery-summary",
      status: failures.length === 0 ? "complete" : "incomplete",
      message:
        failures.length === 0
          ? "Value-record and recovery-descriptor lifecycle verified against live resolver: monotonic publish, replay/gap/owner rejections, and recovery wallet proof build/verify/publish."
          : `${failures.length} scenario step(s) failed`,
      completedAt: new Date().toISOString(),
      resolverUrl: resolverUrl(),
      name,
      ownershipRef,
      ownerPubkey: owner.ownerPubkey,
      valueRecords: { firstSequence: seqA, secondSequence: seqB },
      recoveryDescriptors: { firstSequence: recSeqA, secondSequence: recSeqB },
      recoveryProof: { proofHash: proof.proofHash, recoveryAddress },
      scenarios
    };

    await writeScenarioSummary(SCENARIO, summary);
    console.log(JSON.stringify(summary, null, 2));

    try {
      await publishScenarioSummary(SCENARIO, REMOTE_SUMMARY_PATH);
      console.log(`[${SCENARIO}] published summary to ${REMOTE_SUMMARY_PATH}`);
    } catch (error) {
      console.log(`[${SCENARIO}] summary publish skipped: ${error instanceof Error ? error.message : error}`);
    }

    if (failures.length > 0) {
      throw new Error(`value/recovery lifecycle incomplete: ${failures.map((f) => f.step).join(", ")}`);
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
