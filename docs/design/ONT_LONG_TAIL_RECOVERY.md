# ONT — Recovery for Names With No UTXO (Long-Tail & Post-Maturity)

Owner-key loss is the most *human* risk in the system: ordinary people lose keys constantly, and
"lose your phone → lose your name forever" is a hard sell for mass adoption. This note works through
how recovery extends to names that have **no on-chain footprint** — the cheap long-tail names, and
(it turns out) every name after its bond matures.

Status: design analysis, 2026-05-24. Builds on the existing v1 recovery mechanism.

---

## Plain-language summary

- **The trap:** a "reset" for a lost key is the same door a thief uses to steal. Recovery is only
  safe if it's something *you arm in advance with your own key*, and *your key can veto*.
- **What's built today works — but only on bonded names, and only while the bond is locked.** It
  recovers by spending the name's Bitcoin bond into a new bond, with a waiting period your main key
  can cancel. The cheap long-tail names have no bond, and even bonded names lose this once the bond
  matures.
- **The fix:** keep *arming* recovery free and off-chain (it's just data attached to the name), and
  let the rare act of *invoking* recovery pay for a small, temporary Bitcoin transaction — the same
  "rare high-stakes events escalate to Bitcoin" pattern the design already uses for contested names.
- **Why it's safe:** the veto lives on Bitcoin, so a thief can't win and the system never has to
  prove "nothing happened" off-chain. Sovereignty holds: only your own pre-set keys can ever move
  the name.

---

## 1. What recovery looks like today (and why it doesn't reach the long tail)

From `engine.ts` + `recovery-descriptor.ts` + `recovery-wallet-proof.ts`:

1. **Arm (off-chain, owner-signed).** While you own a name, your main key signs a *recovery
   descriptor*: a backup **recovery wallet** address + a **challenge window** (default 144 blocks ≈
   1 day), with a sequence number so it can be rotated.
2. **Invoke (on-chain).** The recovery wallet posts a Bitcoin transaction that **spends the name's
   bond UTXO** into a **successor bond** under a new owner key, carrying a (data-available) proof
   that the recovery wallet authorized it.
3. **Veto (on-chain).** This opens a challenge window; the **original main key** can post a cancel
   transaction before `finalizeHeight` to abort it. Uncancelled → the new key takes over.

This is clean and sovereign — but it is **fully UTXO-mediated** and gated on
`blockHeight < maturityHeight`, i.e. it only works **while the bond is immature/locked**. Two whole
populations fall outside it:

- **Long-tail $1 names** — they never have a UTXO; they live only as a leaf in the accumulator.
- **Any name after bond maturity** — the bond is returned, the name becomes a UTXO-less accumulator
  leaf, and recovery switches off.

So "recovery for the long tail" is really **"recovery for any fully-sovereign, UTXO-less name."**
Solving it generalizes recovery to the whole namespace, not just a special tier.

## 2. The core tension — recovery reintroduces "prove nothing happened"

For a UTXO-less name, ownership changes are *records in batches*, not UTXO spends. The natural design
is: invoke and veto as accumulator events, timed by Bitcoin block height. But that runs straight into
the one pattern the requirements doc (§12) tells us to avoid: recovery finalizes **only if no cancel
appeared in the window** — a *non-inclusion-over-time* claim. Verifying "no veto happened" means
having all the window's batch data and trusting you saw everything — exactly the data-availability
dependency (R1) the design works hard to contain.

The bond sidesteps this precisely *because* it's on-chain: both the invoke and the veto are Bitcoin
actions, so "did a veto happen?" is answered by Bitcoin's UTXO state, not by "did I see all the
off-chain data." The long-tail version has to recover that property without a permanent UTXO.

## 3. Two ways to give a UTXO-less name a veto

| Approach | How invoke + veto work | Cost at rest | Cost to recover | Trust / dependency |
| --- | --- | --- | --- | --- |
| **A. Accumulator-native** | Invoke and veto are batch events; window in block heights | none | none | Rides on R1's DA agreement + inherits the light-client "prove no veto" gap |
| **B. Temporary recovery UTXO** *(recommended)* | Invoke = a small Bitcoin tx creating a short-lived recovery UTXO; veto = main key spends/contests it on-chain; finalize updates the accumulator leaf, UTXO reclaimed | none | one (or two) Bitcoin txs | None beyond Bitcoin — veto is on-chain, no non-inclusion proof |

**A** is appealing because resting names stay completely free — but it makes every recovery's safety
equal to the (still-residual) light-client DA story, and it relies on proving a negative off-chain.

**B** costs a Bitcoin transaction *per recovery event*, but recovery is **rare** — most names never
lose a key — so the aggregate on-chain load is negligible, and it buys a clean, DA-independent veto.
This is the same shape the design already endorses: the cheap common case stays off-chain (batched,
no UTXO), and a rare high-stakes event (here, recovery; elsewhere, a contested name) pays for a
temporary Bitcoin footprint that's reclaimed afterward.

## 4. Recommended shape

- **Arm off-chain, for every name.** Commit the recovery descriptor *into the name's accumulator
  record* (the leaf binds a `recoveryDescriptorHash`). Free, available to all billions of names,
  including after maturity. Owner-signed and rotatable.
- **Invoke on-chain, only when needed.** The recovery wallet posts a small Bitcoin transaction
  creating a temporary recovery UTXO that references the name, the descriptor, and the proposed new
  key. This anchors the challenge window to Bitcoin and is the *only* time a long-tail name touches
  L1.
- **Veto on-chain.** The main key spends/contests the recovery UTXO before `finalizeHeight`. Because
  the veto is a Bitcoin action, no node ever has to prove "no veto was hidden off-chain."
- **Finalize into the accumulator.** If the window passes un-vetoed, a batch event — provable
  against the on-chain recovery outcome — updates the leaf's owner key to the new key. The temporary
  UTXO is reclaimed (churn, not bloat).

Net: resting names carry **no UTXO**; only a name *actively being recovered* briefly touches Bitcoin.
Recovery becomes available to the whole namespace, not just locked bonds.

## 5. Subtleties that must be handled

1. **Transfer must reset the arming (the seller-backdoor).** If Alice sells `coffee` to Bob but her
   old recovery descriptor (naming *Alice's* backup wallet) survives, Alice can "recover" — i.e.
   **steal** — the name back. So a transfer must invalidate the prior descriptor and require the new
   owner to re-arm. (Today's descriptor binds `ownerPubkey`/`ownershipRef` + sequence, which helps;
   the accumulator transfer rule must enforce the reset.)
2. **Lost-and-stolen → k-of-n backup.** A single recovery wallet is a single point of compromise (if
   a thief gets it *and* you lost your main key, the veto can't fire). Let the descriptor name a
   *k-of-n* recovery set (social/multi-device) so one compromise isn't enough.
3. **Window length is the owner's choice and a real tradeoff.** Longer = more time to veto a theft
   attempt; shorter = faster recovery. The owner sets it per descriptor; high-value names lean long.
4. **Opt-in, but wallet-default.** The protocol only enforces what the owner committed — including
   *nothing* (no descriptor → no recovery, the purist outcome). For mass adoption, wallets should arm
   a sensible default (e.g. a timelocked backup) at claim time, so ordinary users get recovery without
   thinking about it while the protocol stays neutral.
5. **The recovery-proof availability gate already exists.** Today's flow checks the recovery wallet
   proof is *available* before accepting it — a mini data-availability requirement that the long-tail
   version inherits and the R1 agreement rule already covers.

## 6. Invariant check

- **Sovereignty (no revocation):** preserved. A name moves only via the owner's own pre-committed
  descriptor, and the owner's main key can veto. No external party — including the founder — can
  invoke it. This is recovery, not revocation.
- **Neutrality:** preserved. No discretion; the recovering party pays a one-time Bitcoin service fee
  for a rare action (not rent), using their own pre-set keys.
- **Verifiability:** with approach B the recovery and its veto are on-chain, so a fresh verifier
  reconstructs the outcome from Bitcoin + the accumulator finalize event — no "trust that no veto was
  hidden."

## 7. What's resolved vs. still open

**Resolved (in design):** UTXO-less recovery is achievable; it generalizes recovery to the whole
namespace (not just immature bonds); approach B keeps it DA-independent and consistent with the
"escalate rare events to L1" philosophy; sovereignty/neutrality hold.

**Still open:**
1. **Decide F6's status** — first-class requirement vs. best-effort. Given a workable mechanism, it
   can reasonably be promoted to a requirement *with* the wallet-default for mass adoption.
2. **Specify the temporary recovery-UTXO transaction** — script, how the veto spends/contests it, and
   how the accumulator finalize event proves against the on-chain outcome.
3. **Specify the transfer-resets-arming rule** in the accumulator (subtlety 1) — the sharpest
   correctness item.
4. ~~Prototype it~~ — **done (see below).**

## 8. Prototype (2026-05-24)

`packages/core/src/recovery-sim.ts` (+ `recovery-sim.test.ts`) models the state machine — arm →
invoke → (veto | finalize), plus transfer — with authorization represented by key possession (an
actor can only act for keys it holds). 10 tests assert, in code:

- **(a) A thief with the recovery wallet but not the main key cannot steal** — they invoke, the
  owner vetoes within the window, and the finalize then has nothing pending. Owner unchanged.
- **(b) A genuine owner who lost the main key recovers** — backup invokes, no veto, the window
  passes, finalize moves the name to the fresh key.
- **(c) A previous owner cannot recover a transferred name** — transfer resets the arming, so the
  seller's backup wallet hits "recovery_not_armed"; the new owner can arm their own.
- Supporting: invokes from outside the armed set are rejected; late vetoes fail (recovery still
  finalizes); only the main key can veto; **k-of-n** needs the threshold met; re-arming rotates the
  descriptor and invalidates the old set; no double-recovery; non-owners can't arm.
- One test **documents the residual limit**: if the recovery set is compromised *and* the main key
  is lost, recovery can be hijacked — which is exactly why higher thresholds / trusted backups matter.

The model validates the security shape; it is not the Bitcoin-tx-level mechanism (still open item 2).

See also: [`ONT_DATA_AVAILABILITY_AGREEMENT.md`](./ONT_DATA_AVAILABILITY_AGREEMENT.md) (the DA rule
this leans on), [`ONT_REQUIREMENTS_CONFORMANCE.md`](./ONT_REQUIREMENTS_CONFORMANCE.md) (F6, I2),
[`ONT_RISK_REGISTER.md`](./ONT_RISK_REGISTER.md).
