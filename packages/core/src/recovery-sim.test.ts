import { describe, expect, it } from "vitest";

import {
  type ActionResult,
  type RecoverableName,
  armRecovery,
  createName,
  finalizeRecovery,
  invokeRecovery,
  transferName,
  vetoRecovery
} from "./index.js";

// Keys are opaque labels; "holding" a key = being able to pass it as `signedBy`.
const ALICE = "alice-main";
const ALICE_BACKUP = "alice-backup";
const ALICE_NEW = "alice-new-key";
const THIEF = "thief-key";
const BOB = "bob-main";
const BOB_BACKUP = "bob-backup";
const B1 = "backup-1";
const B2 = "backup-2";
const B3 = "backup-3";
const WINDOW = 144;

function applied(result: ActionResult): RecoverableName {
  expect(result.status, `expected applied but got rejected: ${result.reason}`).toBe("applied");
  return result.record;
}

function rejected(result: ActionResult, reason: string): RecoverableName {
  expect(result.status).toBe("rejected");
  expect(result.reason).toBe(reason);
  return result.record;
}

function armedAlice(): RecoverableName {
  return applied(
    armRecovery(createName("coffee", ALICE), {
      signedBy: ALICE,
      recoverySet: [ALICE_BACKUP],
      threshold: 1,
      challengeWindowBlocks: WINDOW
    })
  );
}

describe("recovery for UTXO-less names (long-tail / post-maturity)", () => {
  it("(a) a thief with the recovery wallet but not the main key cannot steal — the owner vetoes", () => {
    let record = armedAlice();

    // Thief holds the backup wallet and invokes recovery toward their own key.
    record = applied(
      invokeRecovery(record, { signedBy: [ALICE_BACKUP], proposedOwnerPubkey: THIEF, height: 100 })
    );

    // Alice still holds her main key and vetoes within the window.
    record = applied(vetoRecovery(record, { signedBy: ALICE, height: 150 }));

    // The thief's finalize now has nothing pending — the steal fails.
    rejected(finalizeRecovery(record, { height: 100 + WINDOW }), "finalize_nothing_pending");
    expect(record.ownerPubkey).toBe(ALICE);
  });

  it("(b) a genuine owner who lost their main key recovers after the window", () => {
    let record = armedAlice();

    // Main key is lost (no veto possible). The backup invokes toward Alice's fresh key.
    record = applied(
      invokeRecovery(record, { signedBy: [ALICE_BACKUP], proposedOwnerPubkey: ALICE_NEW, height: 100 })
    );

    // Window passes with no veto -> finalize moves the name to the new key.
    record = applied(finalizeRecovery(record, { height: 100 + WINDOW }));
    expect(record.ownerPubkey).toBe(ALICE_NEW);
    expect(record.descriptor).toBeNull(); // new owner must re-arm
  });

  it("(c) a previous owner cannot recover a name they already transferred away", () => {
    let record = armedAlice();

    // Alice sells to Bob; the transfer resets the recovery arming.
    record = applied(transferName(record, { signedBy: ALICE, newOwnerPubkey: BOB }));
    expect(record.ownerPubkey).toBe(BOB);
    expect(record.descriptor).toBeNull();

    // Alice's old backup wallet tries to recover the sold name -> nothing is armed.
    rejected(
      invokeRecovery(record, { signedBy: [ALICE_BACKUP], proposedOwnerPubkey: ALICE, height: 200 }),
      "recovery_not_armed"
    );
    expect(record.ownerPubkey).toBe(BOB);

    // Bob can arm his own recovery — the feature is available to the new owner, just not the old arming.
    const bobArmed = applied(
      armRecovery(record, { signedBy: BOB, recoverySet: [BOB_BACKUP], threshold: 1, challengeWindowBlocks: WINDOW })
    );
    expect(bobArmed.descriptor?.recoverySet).toEqual([BOB_BACKUP]);
  });

  it("rejects an invoke from a wallet outside the armed recovery set", () => {
    const record = armedAlice();
    rejected(
      invokeRecovery(record, { signedBy: [THIEF], proposedOwnerPubkey: THIEF, height: 100 }),
      "recovery_threshold_not_met"
    );
  });

  it("a late veto is rejected and the recovery still finalizes", () => {
    let record = armedAlice();
    record = applied(
      invokeRecovery(record, { signedBy: [ALICE_BACKUP], proposedOwnerPubkey: ALICE_NEW, height: 100 })
    );
    // Veto exactly at/after finalizeHeight is too late.
    rejected(vetoRecovery(record, { signedBy: ALICE, height: 100 + WINDOW }), "veto_too_late");
    record = applied(finalizeRecovery(record, { height: 100 + WINDOW }));
    expect(record.ownerPubkey).toBe(ALICE_NEW);
  });

  it("only the main key can veto (a griefer cannot abort a legitimate recovery)", () => {
    let record = armedAlice();
    record = applied(
      invokeRecovery(record, { signedBy: [ALICE_BACKUP], proposedOwnerPubkey: ALICE_NEW, height: 100 })
    );
    rejected(vetoRecovery(record, { signedBy: THIEF, height: 120 }), "veto_not_owner");
  });

  it("a k-of-n recovery set needs the threshold met — one compromised backup is not enough", () => {
    const record = applied(
      armRecovery(createName("vault", ALICE), {
        signedBy: ALICE,
        recoverySet: [B1, B2, B3],
        threshold: 2,
        challengeWindowBlocks: WINDOW
      })
    );

    rejected(
      invokeRecovery(record, { signedBy: [B1], proposedOwnerPubkey: THIEF, height: 100 }),
      "recovery_threshold_not_met"
    );
    const pending = applied(
      invokeRecovery(record, { signedBy: [B1, B2], proposedOwnerPubkey: ALICE_NEW, height: 100 })
    );
    expect(pending.pendingRecovery?.proposedOwnerPubkey).toBe(ALICE_NEW);
  });

  it("re-arming rotates the descriptor and invalidates the old recovery set", () => {
    let record = armedAlice(); // set = [ALICE_BACKUP], sequence 1
    record = applied(
      armRecovery(record, { signedBy: ALICE, recoverySet: [B1], threshold: 1, challengeWindowBlocks: WINDOW })
    );
    expect(record.descriptor?.sequence).toBe(2);

    // The old backup wallet no longer authorizes recovery.
    rejected(
      invokeRecovery(record, { signedBy: [ALICE_BACKUP], proposedOwnerPubkey: THIEF, height: 100 }),
      "recovery_threshold_not_met"
    );
    // The new set does.
    expect(
      applied(invokeRecovery(record, { signedBy: [B1], proposedOwnerPubkey: ALICE_NEW, height: 100 }))
        .pendingRecovery?.proposedOwnerPubkey
    ).toBe(ALICE_NEW);
  });

  it("cannot open a second recovery while one is pending, and non-owners cannot arm", () => {
    let record = armedAlice();
    record = applied(
      invokeRecovery(record, { signedBy: [ALICE_BACKUP], proposedOwnerPubkey: ALICE_NEW, height: 100 })
    );
    rejected(
      invokeRecovery(record, { signedBy: [ALICE_BACKUP], proposedOwnerPubkey: THIEF, height: 101 }),
      "recovery_already_pending"
    );
    rejected(
      armRecovery(createName("coffee", ALICE), {
        signedBy: THIEF,
        recoverySet: [THIEF],
        threshold: 1,
        challengeWindowBlocks: WINDOW
      }),
      "arm_not_owner"
    );
  });

  it("documents the residual limit: recovery set compromised AND main key lost => hijack possible", () => {
    // This is the known edge the k-of-n set mitigates: if the attacker controls enough of the
    // recovery set AND the owner cannot veto (key truly lost), recovery can be hijacked.
    let record = armedAlice(); // single backup, threshold 1
    record = applied(
      invokeRecovery(record, { signedBy: [ALICE_BACKUP], proposedOwnerPubkey: THIEF, height: 100 })
    );
    // Owner cannot veto (key lost) -> the window passes and the attacker finalizes.
    record = applied(finalizeRecovery(record, { height: 100 + WINDOW }));
    expect(record.ownerPubkey).toBe(THIEF); // why higher thresholds / trusted backups matter
  });
});
