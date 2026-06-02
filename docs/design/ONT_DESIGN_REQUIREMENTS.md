# ONT Design Requirements (Clean Sheet)

Status: foundational requirements, written deliberately without anchoring on any
existing ONT solution. The purpose is to judge candidate designs against fixed
criteria instead of defending prior research. A design either satisfies these or
it does not.

Convention: **Invariants** are non-negotiable (a violation kills the design).
**Aims** are strong preferences we optimize for but may flex. **Targets** are
quantified goals. Each requirement states, where useful, how we would know it is
violated.

---

## 1. Purpose

ONT is a system of **human-readable payment/destination handles**. A user must
be able to name a person, agent, organization, service, or device and be
confident the name resolves to the one correct destination its owner controls.

The naming of a destination must be:

- meaningful to humans (memorable strings)
- owned, not rented
- resolvable by anyone without permission
- verifiable without trusting the party that answered

---

## 2. Actors

| Actor | Job | Can be malicious? |
| --- | --- | --- |
| Claimer | Acquires a name. | Yes |
| Owner | Holds the owner key; controls the name and its destination record. | Yes |
| Sender / resolver-user | Looks up a name to reach a destination. | No (the party we protect) |
| Resolver / indexer | Serves lookups and evidence; replays rules. | Yes |
| Verifier | Independently checks a proof of ownership. | Honest, possibly partial data |
| Adversary | Squatter, griefer, censor, equivocator, Sybil, data-withholder. | Yes |
| Bootstrap operator | Early scaffolding infrastructure (see §9). | Yes |

---

## 3. Functional Requirements

- **F1 Claim.** Anyone can acquire an unowned valid name by a mechanical rule.
- **F2 Resolve.** Anyone can resolve a name to its current destination record,
  unambiguously (see I1).
- **F3 Prove.** An owner can produce a portable proof of ownership that a fresh
  verifier checks without trusting the source (see I4).
- **F4 Transfer.** An owner can transfer the name to a new owner key; the
  transfer is itself provable and does not weaken the name's guarantees.
- **F5 Update destination.** An owner can update the mutable destination record
  the name points to, authorized by the owner key.
- **F6 Recover.** **(Decided 2026-05-24: a requirement.)** If an owner loses their
  key, the system must support recovery, and wallets arm a default backup at claim
  time so ordinary users are protected by default. It must stay recovery-not-revocation
  (only the owner's own pre-armed keys can move the name; owner-vetoable). Mechanism:
  `ONT_LONG_TAIL_RECOVERY.md`.

---

## 4. Hard Invariants

- **I1 — Global uniqueness / unambiguous resolution.** A name resolves to
  exactly one owner and one current destination, globally and consistently. Two
  honest resolvers must never return different owners for the same name. This is
  required by the payment use case: ambiguity means money goes to the wrong
  party. *Violated if:* any mechanism allows the same string to mean different
  destinations to different honest observers.

- **I2 — Sovereign ownership.** Acquisition cost is one-time. After acquisition
  there is no rent, no renewal, no forced sale, and no revocation. The name is
  controlled solely by the owner key, is permanent, and its proof is portable.
  *Violated if:* holding a name requires ongoing payment, ongoing capital lockup,
  or exposes the holder to having it taken without their consent.

- **I3 — Neutrality.** No party — explicitly including the founder — acts as
  editor, issuer, registrar, or allocator. Names are allocated by a mechanical
  rule, never by discretion. No reserved lists, no editorial name classes, no
  founder allocation, no new token whose issuance a party controls. *Violated
  if:* any name's fate depends on a person's or committee's judgment, or any
  party can mint scarcity and hand it out. (Bounded bootstrap exceptions: §9.)
  **Evolution (decided 2026-05-24): opt-in upgrades only** — rules may change after
  launch only as new versions users choose to adopt; no party can force a change.
  Preserves I3 while avoiding permanent ossification.

- **I4 — Verifiability without trust.** A fresh verifier can reconstruct why a
  name is owned from public/portable data, without trusting any single resolver,
  relay, operator, or the founder. *Violated if:* the answer to "why does this
  person own this name?" is "ask service X and believe it."

- **I5 — Censorship-resistant settlement.** Final ordering and dispute
  resolution derive from Bitcoin, which no party in the ONT system can censor or
  reorder beyond Bitcoin's own assumptions. Bitcoin is the backstop that makes
  I1–I4 enforceable when parties misbehave. *Violated if:* a disputed or
  censored name has no Bitcoin-anchored path to resolution.

---

## 5. Scarcity and Cost Model

- **S1 — Bitcoin is the ordering and dispute-finality anchor.** Conflicts and
  final settlement are decided by Bitcoin. (Implements I5.)

- **S2 — Issuance may be gated by a neutral scarce resource.** A cost gate on
  claiming is permitted to resist Sybil/mass-grabbing. The gate must itself be
  neutral (I3): no issuer, no validator set, locally verifiable.

- **S3 — Credibility bar for any scarce resource.** A scarcity mechanism must
  NOT rely on another blockchain's consensus, validator set, governance, or
  token. Acceptable scarcity: Bitcoin capital/blockspace, and **proof-of-work
  (energy)** — credible because it is thermodynamic, has no issuer, and is
  locally verifiable. *Rejected:* ETH/SOL/other-chain tokens or staking as the
  scarce resource.

- **S4 — No new token.** ONT introduces no new transferable consensus asset.

- **S5 — Prefer not to destroy user funds.** Burning users' bitcoin is
  dispreferred. (Spending energy via PoW, or paying Bitcoin transaction fees to
  miners, is consistent with this — neither destroys user-held coins.)

- **S6 — Anti-squat cost must be sovereignty-preserving.** Any cost that deters
  squatting must be one-time and sunk at acquisition, never recurring or
  contestable (else it violates I2).

---

## 6. Aims (Strong but Flexible)

- **A1 — Flat namespace.** Names are a single flat string space (`alice`, not
  `alice@thing`), for aesthetics and simplicity. Flex only if the math forces
  it; if flexed, the result must still satisfy I1–I5.
- **A2 — Low cost for ordinary names.** Long-tail names should be cheap enough
  for mass, casual use.
- **A3 — Simplicity.** Prefer designs a careful user and a fresh verifier can
  understand.

---

## 7. Scale and Cost Targets (proposed — confirm)

- **T1 — Issuance ceiling.** Be capable of issuing on the order of 10^8–10^9
  names without per-name Bitcoin blockspace, trending toward global population +
  agents/devices over time.
- **T2 — User cost.** Ordinary long-tail acquisition should cost far less than a
  Bitcoin on-chain transaction. **Target set to ₿1,000 (~$1)
  (decided 2026-05-23):** cheap enough for human mass adoption, high enough to
  deter bulk squatting and meaningfully contribute to the security budget.
  Revisit toward cents only if feedback or a machine/IoT-at-billions use case
  pushes back. (₿1,000 is the fixed amount; its ~$1 helper floats with BTC price — see R5.)
- **T3 — Verifier budget.** A fresh verifier should be able to validate any
  single name's ownership with compact data, and bootstrap full state on
  commodity hardware/storage. Verification cost per name must not grow with total
  names issued.

(Numbers are placeholders to make trade-offs concrete; adjust before they become
load-bearing.)

---

## 8. Adversary Model

A design must state its defense and cost for each:

- **Squatter** — mass-acquires plausibly-valuable names to resell.
- **Griefer** — tries to block, delay, or invalidate honest claims cheaply.
- **Censor** — relay/resolver/miner refuses to publish or serve.
- **Equivocator** — issues conflicting claims/records to different parties.
- **Sybil** — spins up unlimited identities/keys at near-zero cost.
- **Data-withholder** — publishes a commitment but hides the data needed to
  verify it.
- **Founder-capture** — uses any bootstrap role to entrench advantage.

For each, the design should answer: what stops it, and how much scarce resource
(BTC, energy) must the attacker spend per unit of harm?

---

## 9. Bootstrap-Compromise Acceptance Test

Neutrality (I3) may be relaxed during kickstart only if the compromise is:

1. **Sunset-bound** — ends on a date, metric, or "until X exists" condition.
2. **Transparent** — stated openly, never hidden in resolver behavior.
3. **Exitable / non-entrenching** — others can replace the bootstrap party; it
   cannot lock in a founder advantage that outlives the bootstrap.
4. **Legibly parameterized** — parameters are public so people can judge "good
   enough."
5. **No retroactive capture** — does not let the bootstrap party pre-grab
   valuable names or skim ongoing rent.

A compromise that fails #3 or #5 is a registrar, not scaffolding, and is
rejected.

**Founder commitments (made 2026-05-24):** (a) **no pre-grab** — the founder will not
register valuable names for himself before or at launch; he plays by the same mechanical
rule as everyone (satisfies #5). (b) **DA server is temporary** — the founder's
data-availability server is sunset-bound scaffolding with a stated end condition (e.g.
"until enough independent operators run them"), never a permanent dependency (satisfies #1, #3).

---

## 10. Non-Goals

- Not a general smart-contract platform.
- Not a store of mutable bulk data on Bitcoin.
- Not a new currency or token.
- Not a hierarchical/DNS-style delegated namespace (unless A1 is flexed).
- Not reliant on any non-Bitcoin chain for security or scarcity.

---

## 11. Priority Ordering When Requirements Conflict

When goals collide, resolve in this order:

1. **Co-equal hard invariants (never sacrificed):** I3 Neutrality, I2
   Sovereignty, I1 Uniqueness, I4 Verifiability, I5 Bitcoin settlement.
2. **Then flex, in order:** Bitcoin-only scarcity purity (relax toward PoW
   before anything else) → A1 Flat namespace → A3 Simplicity.
3. **Scale (T1–T3) is the objective we maximize subject to the above** — not a
   reason to breach an invariant.

---

## 12. Implications for the Solution Space (derived, not requirements)

These follow from the requirements and pre-constrain any candidate design:

- Because I1 (uniqueness) is required by the payment use case, the "drop
  uniqueness / petname" escape from Byzantine-agreement cost is **unavailable**.
  Agreement cost must instead be made cheap when *uncontested* and paid in full
  only on real disputes.
- Because I2 forbids recurring/contestable costs, squatting can only be deterred
  by a one-time sunk acquisition cost (S6) plus long-tail substitutability, with
  genuinely scarce names settled on Bitcoin.
- Because I4 forbids trusting one resolver, "prove no challenge occurred over a
  window" (a non-inclusion-over-time proof) is a liability; designs that make
  ownership final at a *point in time* (e.g. uniqueness enforced at insertion)
  avoid the hardest data-availability problem.
- Because S1+S3 separate roles, the likely shape is: **PoW prices issuance,
  Bitcoin orders and settles disputes** — not PoW or Bitcoin doing both.
  **(Decided 2026-05-24: gate = a Bitcoin miner fee, so Bitcoin both prices and
  orders. Permitted by S2/S3; chosen over PoW for simplicity + the security-budget
  contribution, accepting that PoW would have been cleaner for neutrality and the
  censorship fallback. R5 drift still applies.)**

---

## 13. Open Questions To Settle Next

1. **F6 recovery:** requirement, best-effort, or out of scope? A mechanism now
   exists for UTXO-less names (`ONT_LONG_TAIL_RECOVERY.md`, 2026-05-24) — arm
   off-chain, invoke via a rare temporary recovery UTXO, owner veto on-chain;
   stays recovery-not-revocation. **Decided 2026-05-24: it is a requirement, with
   wallet-default arming.** Still to spec: the tx + the transfer-resets-arming rule.
2. **Scale targets (T1–T3):** T2 user cost **set to ₿1,000 (~$1)** (2026-05-23, revisit on
   feedback); T1 and T3 placeholders still to confirm.
3. **Transferability of cheap-issued names:** free owner-key transfer, or
   transfer-friction (e.g. harden-before-resale) to suppress squat-and-flip?
   (Trades a property right against squat resistance.)
4. **PoW parameters in principle:** per-claim cost target, and whether to use a
   memory-hard function — only relevant once a candidate uses PoW.
