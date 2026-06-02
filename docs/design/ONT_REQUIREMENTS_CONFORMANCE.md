# ONT — Design vs. Requirements Conformance

A line-by-line check of the current design against every requirement in
[`ONT_DESIGN_REQUIREMENTS.md`](./ONT_DESIGN_REQUIREMENTS.md). "The design" = the Bitcoin-sequenced
name accumulator as specified across the one-pager, the risk work, the DA-agreement note, and the
firmed decisions in memory (unified reserve model, two cost forms, delta-merge, convergence rule).

Verdict scale: **✅ Meets** · **🟡 Partial / contingent** · **🔴 Open / undecided** · **🚫 Conflicts as written**.

Last updated: 2026-05-24.

---

## Bottom line

**No hard invariant (I1–I5) is violated, and with T2 resolved there are no remaining 🚫 conflicts.**
Each invariant is either met or has a credible mechanism, and two of the scariest — I1
(uniqueness/convergence) and the data-withholder defense — now have *passing prototypes*. The
remaining items are definition, one unbuilt safety path, one unanalyzed adversary, and empirical
validation — not rule-breaks:

1. **✅ T2 resolved (2026-05-23):** user-cost target set to 1,000 sats (~$1), revisit on feedback. (Was the lone 🚫.)
2. **✅ F6 recovery decided (2026-05-24): first-class requirement** with wallet-default arming; stays recovery-not-revocation (I2), designed + prototyped. Left: spec the recovery tx + transfer-resets-arming rule.
3. **🟡 I4 for light clients** — full verifiers are fine; phones still lack a fraud-proof path.
4. **✅ Upgrade/governance neutrality decided (2026-05-24): opt-in upgrades only** — rules change only as versions users adopt; no forced changes. (Closes the previously-unregistered I3 gap.)
5. **✅ §9 bootstrap pledges committed (2026-05-24):** founder no-pre-grab + DA server is sunset-bound scaffolding.
6. **🟡 MEV/ordering (R9) — analyzed (2026-05-24):** can't steal a name via ordering; residual bounded. Open only: open-auction relay-bid handling (or adopt sealed second-price).
7. **🟡 Empirical — Phases 1 & 2 built offline (2026-05-24, `ONT_SIGNET_PROTOTYPE_SCOPE.md`):** **C1** accumulator + serialized proofs (~log₂(N), <1 KB); **C2** anchor codec + `RootChain` + block read-back + measured anchor vBytes (162–194 vB, *above* the 150 estimate); **C3/C4** the production batch rail (`batch-rail.ts`) — DA-filtered deltas merged into the real accumulator, derived roots anchored, honest nodes **converge** (naive forks), withholding self-harms, resulting state **provable**. Remaining: the *live* signet measurements/broadcast (needs the node) + protocol wire migration.

---

## 3. Functional Requirements

| Req | Verdict | Evidence / gap |
| --- | --- | --- |
| **F1 Claim** (mechanical rule) | ✅ | Insertion into the accumulator gated by a flat sunk fee; no discretion. Prototyped (`delta-merge-sim`). |
| **F2 Resolve** (unambiguous) | 🟡 | Resolve-to-*owner* is strong (I1 + convergence). Resolve-to-*destination* depends on record freshness (R15), not fully specced. |
| **F3 Prove** (portable, trustless) | ✅ | SMT inclusion proof against a Bitcoin-anchored root; compact proofs validated in code. Real sizes = R11. |
| **F4 Transfer** (provable, no weakening) | 🟡 | Owner-key transfer machinery exists (`transfer-package.ts`); "free transfer" decided. Interaction with progressive hardening unverified end-to-end. |
| **F5 Update destination** (owner-authorized) | 🟡 | Owner-signed value records exist (`value-record.ts`). Staleness (R15) is the open edge. |
| **F6 Recover** | ✅ (decided 2026-05-24) | **A requirement, with wallet-default arming.** Sovereignty-safe mechanism (owner-armed backup + on-chain veto), extended to UTXO-less names in `ONT_LONG_TAIL_RECOVERY.md` and **prototyped** in `recovery-sim.ts` (thief-can't-steal, owner-recovers, prior-owner-can't-recover-transferred). Stays recovery-not-revocation (I2). Left: spec the recovery tx + transfer-resets-arming rule. |

## 4. Hard Invariants (the make-or-break set)

| Inv | Verdict | Evidence / gap |
| --- | --- | --- |
| **I1 Uniqueness / unambiguous resolution** | 🟡 (defended, prototyped) | Uniqueness enforced *at insertion* (no challenge window). Honest-node **convergence prototyped** (`da-convergence-sim`: naive rule forks, proposed rule converges vs a withholding adversary). Residual: window pinning + contested-leaf DA + it's an abstract model. The single closest-to-the-bone invariant, and the R1/R2 work directly serves it. |
| **I2 Sovereign ownership** | ✅ (with a noted dependency) | One-time **sunk** 1,000 sats (~$1) + **returnable** bonds (opportunity cost, returned at maturity). No rent, no Harberger. *Dependency:* sovereignty holds only because the bond is returned at maturity and the name is then held free — if maturity were effectively perpetual or re-bonding required, it would breach I2. |
| **I3 Neutrality** | 🟡 (designed-in, fewer watch-items) | Mechanical allocation, no token, no founder allocation; publisher "structurally barred from registrar" via direct-L1 cap. **Evolution decided 2026-05-24: opt-in upgrades only** (no forced changes). Remaining watch-items: (a) convenience-server-becoming-dependency (mitigated by the founder's sunset pledge, §9), (b) publisher concentration (R8). |
| **I4 Verifiability without trust** | 🟡 (full ✅, light clients ✗) | Full verifiers reconstruct ownership by recomputation against Bitcoin — solid. **Light clients lack a fraud-proof / challenge path** (the unbuilt R1/R2 residual), so a phone currently trusts a summary. Design correctly avoids the "no-challenge-over-a-window" liability (§12) via insertion-time uniqueness. |
| **I5 Censorship-resistant settlement** | 🟡 (designed, unprototyped) | Bitcoin sequences roots; **direct-L1 fallback** is the censorship backstop. Conceptually core; empirically it's signet-prototype component (4), not yet built. |

## 5. Scarcity & Cost Model

| Req | Verdict | Evidence / gap |
| --- | --- | --- |
| **S1 Bitcoin orders/settles** | ✅ | Bitcoin-sequenced rollup; disputes settle on L1. |
| **S2 Neutral scarce gate** | ✅ | 1,000 sats (~$1) gate (miner-fee or PoW), locally verifiable, no issuer. |
| **S3 Credibility (no other chain)** | ✅ | Only Bitcoin + (optional) PoW. No external chain/validator/token. |
| **S4 No new token** | ✅ | None. |
| **S5 Don't destroy user funds** | ✅ (conditional) | "Sunk" = paid to miners (or energy via PoW), **not burned**. Holds *as long as* the gate never becomes a coin-burn. |
| **S6 Anti-squat cost one-time/sunk** | ✅ | 1,000 sats (~$1) one-time sunk; bonds returnable. No recurring/contestable squat cost. |

## 6. Aims

| Aim | Verdict | Evidence / gap |
| --- | --- | --- |
| **A1 Flat namespace** | ✅ | Single flat string space; kept (not flexed). |
| **A2 Low cost for ordinary names** | ✅ (spirit) | 1,000 sats (~$1) is cheap for mass use — but see T2 for the quantified conflict. |
| **A3 Simplicity** | 🟡 | *User* story is simple ("claim for 1,000 sats / ~$1, own forever"); the *verifier/mechanism* story (accumulator + DA agreement + windows + two rails + auction) is not. Acceptable under §11 (A3 is the lowest-priority flex), but real. |

## 7. Scale & Cost Targets

| Target | Verdict | Evidence / gap |
| --- | --- | --- |
| **T1 10^8–10^9 without per-name blockspace** | 🟡 (contingent) | Long-tail batch rail does this (0.015 vB/name) — *if* R2 (throughput, prototyped), R1 (DA, prototyped), and a low contest rate (R3, the bet) all hold, and the signet numbers (R11) confirm. |
| **T2 User cost (1,000 sats / ~$1 target)** | ✅ (resolved 2026-05-23) | T2 revised from "cents-scale" to **1,000 sats (~$1)** — accepted for human mass adoption; revisit toward cents only if feedback or machine/IoT-at-billions pushes back. The earlier conflict is closed by setting the target to the design. |
| **T3 Verifier budget; cost not growing with N** | 🟡 | Per-name verification is compact and ~log₂(N) — **now measured** (`accumulator.ts`): proofs 339 B @ 100 → 577 B @ 10k names, ~1.1 KB @ 1e9 ✅. **Bootstrapping full state** at billions is still O(N) (R12) → leans on verifiable snapshots. Per-name ✅ / full-bootstrap 🟡. |

## 8. Adversary Model (defense + cost stated?)

| Adversary | Verdict | Defense / cost |
| --- | --- | --- |
| **Squatter** | ✅ | Linear sunk cost (1,000 sats × N); premium names → auction. 1M names ≈ 10 BTC (~$1M). |
| **Griefer** | 🟡 | Withhold = self-harm; contest costs gate + commit. Cheap-delay griefing (forcing auctions/notice delays) needs the contested-flow spec (R4). |
| **Censor** | 🟡 | Direct-L1 fallback (designed, unprototyped). |
| **Equivocator** | ✅ (prototyped) | I1 + Bitcoin ordering + insertion-time uniqueness + convergence rule. |
| **Sybil** | ✅ | Cost scales per *name*, not per identity — identities are free but useless without per-name spend. |
| **Data-withholder** | 🟡 (prototyped) | Self-harm + fail-closed + on-chain availability marker; convergence vs a withholder passes in code. Residual: window pinning, light-client path. |
| **Founder-capture** | 🟡 | §9 test + convenience-not-dependency + no allocation. Live items: DA-server sunset, no-pre-grab (see §9). |
| *(MEV / ordering — R9)* | 🟡 (analyzed 2026-05-24) | `ONT_MEV_ORDERING_ANALYSIS.md`: can't *steal* a name via ordering (commit-reveal + commutativity + bid-not-order + L1 fallback). Residual bounded. Open: open-auction relay-bid handling (or pick sealed second-price). |

## 9. Bootstrap-Compromise Acceptance Test (founder's DA server + loud launch)

| Criterion | Verdict | Note |
| --- | --- | --- |
| 1. Sunset-bound | ✅ (committed 2026-05-24) | Founder pledged the DA server is sunset-bound scaffolding with a stated end condition ("until enough independent operators run them"). |
| 2. Transparent | ✅ | Stated openly. |
| 3. Exitable / non-entrenching | ✅ | Stays a convenience: anyone can run a server, all answers check against Bitcoin. |
| 4. Legibly parameterized | ✅ | Windows/params public once pinned. |
| 5. No retroactive capture | ✅ (committed 2026-05-24) | Founder pledged **no pre-grab** of valuable names — plays by the same mechanical rule. |

## 10. Non-Goals — all respected ✅
Not a smart-contract platform · not bulk mutable data on Bitcoin · no token · not hierarchical/DNS
· not reliant on a non-Bitcoin chain. The design conforms to all five.

## 11–12. Priority ordering & derived implications
- Invariant priority respected: scale is what flexes (via contest rate), never an invariant. ✅
- §12 implications honored — uniqueness kept (no petname escape); one-time sunk cost; insertion-time
  finality avoids the non-inclusion-over-time proof. ✅
- **One conscious divergence (decided 2026-05-24):** the gate is a **Bitcoin miner fee** (Bitcoin both
  prices and orders), diverging from §12's "PoW prices, Bitcoin orders" expectation. Permitted by
  S2/S3; chosen for simplicity + the security-budget contribution, accepting that PoW would have been
  cleaner for neutrality and the censorship fallback. R5 (drift) still applies.

---

## Conflicts & gaps to resolve (the actionable list)

1. **✅ T2 vs the 1,000 sats (~$1) gate — resolved (2026-05-23):** target set to 1,000 sats (~$1), revisit on feedback. Machine/IoT-at-billions (which would want ~$0.10) deferred until it pushes back.
2. **✅ F6 recovery decided (2026-05-24):** first-class requirement, wallet-default arming. Left: spec the recovery tx + transfer-resets-arming rule.
3. **🟡 Build the light-client fraud-proof path** so I4 holds for phones, not just full nodes.
4. **✅ Upgrade/governance neutrality decided (2026-05-24): opt-in upgrades only.**
5. **✅ Bootstrap commitments made (2026-05-24):** founder no-pre-grab + sunset-bound DA server.
6. **🟡 MEV/ordering (R9) — done (2026-05-24, `ONT_MEV_ORDERING_ANALYSIS.md`):** can't steal via ordering; residual bounded. Only open thread is the open-auction relay-bid handling, which sealed second-price (Option B) sidesteps.
7. **🟡 Validate empirically** — the signet prototype is what turns I1/I5/T1/T3 from "designed/modeled" into "measured."

## What this says about confidence

The design is **structurally sound against its own constitution**: every hard invariant is met or
credibly mechanized, no non-goal is breached, and the priority ordering is respected. The open
*decisions* (recovery status, gate form, upgrade path, bootstrap pledges) and the T2 conflict are now
**decided**, and MEV is analyzed. What remains is *one unbuilt safety path* (light-client fraud
proofs), a few spec/pin tasks (recovery tx, windows, contested flow), and *empirical validation* on
signet. None of these is an invariant violation — the strongest thing a conformance check can say at
the design stage.

See also: [`ONT_RISK_REGISTER.md`](./ONT_RISK_REGISTER.md),
[`ONT_DATA_AVAILABILITY_AGREEMENT.md`](./ONT_DATA_AVAILABILITY_AGREEMENT.md),
[`ONT_RISKS_PLAIN_LANGUAGE.md`](./ONT_RISKS_PLAIN_LANGUAGE.md).
