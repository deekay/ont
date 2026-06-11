# ONT — Open Questions

The consolidated list of ONT's genuinely open design and analysis questions, for an
external Bitcoin reviewer deciding where to push. Consolidated on 2026-06-11 per
doc-canon (#45) from three sources: `design/ONT_HARD_PROBLEMS.md`,
`research/OPEN_QUESTIONS_FOR_EXPERTS.md`, and
`research/ONT_OPEN_ANALYSIS_AREAS_2026_06_09.md` (now archived). Status labels and
answered-by pointers are preserved from the sources; for what is actually built and
wired today, [`core/STATUS.md`](./core/STATUS.md) is the single source of truth.

Decisions are cited as "Decision #N" against [`core/DECISIONS.md`](./core/DECISIONS.md).

---

## 1. Data availability

### 1.1 Fold the availability marker into the anchor? — [ANSWERED — marker-fold (#47); still a first-class external-review ask]

**Ruled 2026-06-11: fold** — marker-fold (#47), decision paper
[`research/DA_MARKER_FOLD.md`](./research/DA_MARKER_FOLD.md). The marker
event (0x0d) is retired; all availability deadlines key off the anchor's
mined height; the fail-closed §6c challenge is unchanged. The question
stays a first-class ask for Bitcoin-dev reviewers (DK, 2026-06-09) with an
explicit reopen trigger: a consensus role for a second timestamp that the
paper's §2 misses reopens the decision by named spec PR before the B2
kernel freezes its DA predicate. Historical context (the original gap):
the marker was wire-defined and tested but never emitted or checked in
production, and the fail-closed availability deadline was enforced only in
research simulations. Normative context:
[`spec/ONT_DATA_AVAILABILITY_AGREEMENT.md`](./spec/ONT_DATA_AVAILABILITY_AGREEMENT.md).

### 1.2 Archival data-availability economics — [OPEN]

The one unfunded standing obligation. The design's other standing-obligation answers are
good — ownership has no keepalive, recovery liveness is opt-in, value-record hosting is
resolver policy, claim gates are sunk not rented — but **someone must retain and serve
historical batch data indefinitely** for late-joining full verifiers, and nobody is paid
to. Fail-closed rules protect anchor-time, not year-ten replay; content-addressed
bundles (Decision #39) make mirroring *possible* but not *incentivized*. At 1B names
this is TB-scale. Needed: a research note on who stores history, what subsidizes it
(archival resolvers, anchored snapshots/checkpoints, owner-retained proofs as the
floor), and what a late verifier does if a historical batch is unretrievable everywhere.

---

## 2. Auctions, fairness, and griefing

### 2.1 L1 auction bid mechanics: visible vs. binding vs. cheap — [PARTIALLY ANSWERED — a choice remains]

Honest negative result: making escalating bids **visible + binding + cheap** at once is
not cleanly achievable on today's Bitcoin. Off-chain bids are only credible with
forfeitable collateral, which Bitcoin can't conditionally enforce without a covenant
soft fork; the covenant-free workarounds (pre-signed forfeiture, DLC/adaptor
signatures) reintroduce a counterparty or an oracle. The *ordering* half is solved —
anchor the close to a Bitcoin height and treat on-chain settlement as authoritative,
with anti-snipe deadline extension. The *binding* half forces a choice:

| Option | Visible drama | Binding | Blockspace | Trust added |
| --- | --- | --- | --- | --- |
| A. Sealed second-price + on-chain collateral | no | yes | cheap | none |
| B. Open non-binding signaling → sealed binding settlement | as "talk" | at settle | cheap | none |
| C. Open binding on-chain ascending | yes | yes | expensive/bid | none |
| D. Open binding off-chain ascending | yes | yes | cheap | covenant or oracle |

Recommendation from the analysis: **Option B** as the default, **Option C** reserved
for rare marquee names, **Option D** parked unless a covenant soft fork (e.g.
`OP_CTV`/`CSFS`-style) lands. Scope note (decided 2026-05-24): there is **no off-chain
auction on the batched claim path** — a contested name escalates to the L1 bonded
auction — so this question applies only to the L1 auction's own bid mechanics. See
[`spec/CONTESTED_AUCTION_REFERENCE.md`](./spec/CONTESTED_AUCTION_REFERENCE.md). For
reviewers: does the negative result hold, and is B over C the right default?

### 2.2 Nullification-attrition residuals — [MODELED 2026-06-09; residuals open]

Decision #37 (bond opens the auction) closed the dust-cost blockspace attack but left a
dust-cost **denial** attack: ₿1,000/round to collide a cheap claim so it nullifies and
the victim's notice window restarts — money-symmetric per round, outcome-asymmetric.
Modeled in
[`research/archive/ONT_NULLIFICATION_ATTRITION_MODEL.md`](./research/archive/ONT_NULLIFICATION_ATTRITION_MODEL.md):
the bond exit is cheaper than the attack at every window phase, so the rational game is
one collision → bond → over; the residual exposure is capital *access* — exactly the
asymmetry Decision #43 accepts (defense/deterrence asymmetry documented honestly;
sponsorship/proxy-bonding tooling rejected outright, while third-party bonding stays
permissionless since bonds are bearer BTC). Still open, explicitly deferred to external
review:

- whether a **per-name escalating gate with decay** is worth adding (rejected for v1;
  re-claim cooldown rejected outright as subsidizing the attacker);
- **pricing the bond floor as a defense price** when launch parameters freeze, and
  reporting what each parameter choice does to the #43 asymmetry — parameters are the
  one lever left.

Recommended v1 posture: no new mechanism + the `collided` UX.

### 2.3 Re-derive the 20-year blockspace forecast — [OPEN — housekeeping]

The 20-year blockspace forecast discussed in the dev channel (2026-06-01) predates
Decision #37 and must be re-derived with the bonded-contest substitution before it is
ever published beyond the channel.

---

## 3. Scaling and multi-publisher throughput

### 3.1 Delta-merge at scale — [PARTIALLY ANSWERED — mechanism prototyped, numbers unvalidated]

Leaderless multi-publisher throughput (risk register R2 in
[`RISKS.md`](./RISKS.md)) is downgraded from
"unsolved" to "candidate, mechanism prototyped." The unlock: sparse-Merkle-tree
insertions into distinct leaves are commutative, so publishers broadcast independent
*deltas* proven against the last confirmed root, and the block is the aggregation
boundary — no inter-publisher coordination, miner ordering irrelevant, a withheld delta
is merely excluded rather than halting the chain. The prototype
([`../packages/core/src/research/delta-merge-sim.ts`](../packages/core/src/research/delta-merge-sim.ts))
asserts commutativity, conflict determinism, the data-availability benefit, and
permissionless checkpoint verification in code. What remains is **unvalidated numbers,
not an unsolved mechanism**: absolute proof sizes and merge throughput at billions of
leaves need a signet-scale benchmark (risk register R11). Per
[`core/STATUS.md`](./core/STATUS.md), leaderless multi-publisher is simulated, not
deployed — the live signet publisher is single-writer.

### 3.2 Checkpoint liveness incentive — [OPEN]

In the delta-merge design the merged root is *derived*, not committed by any single tx:
anyone can compute and publish it, and a wrong checkpoint is rejected by recomputation.
But someone must actually publish each derived root for light clients. Permissionless
and verifiable — yet it needs an incentive so it reliably happens.

---

## 4. Recovery

Decision #40 makes recovery opt-in with a delegable, non-custodial, **abort-only** veto
watcher, which answers the liveness objection. Two pieces are undesigned (implementation
context: [`spec/ONT_RECOVERY_INVOKE_SPEC.md`](./spec/ONT_RECOVERY_INVOKE_SPEC.md)):

### 4.1 The abort-only credential construction — [OPEN]

A watcher credential that can cancel a recovery but can never initiate or redirect one.

### 4.2 Veto-grief economics — [OPEN]

A compromised recovery set can force the owner to pay for repeated on-chain vetoes.
Model cost-per-attempt vs. cost-per-veto, and spell out the escape path (rotate owner
key / disarm recovery) so a compromised recovery set has a bounded total cost.

---

## 5. Resolution and discovery

Two conventions exist only as workspace guides and channel answers, not repo spec, and
need promotion:

### 5.1 Resolver policy codes — [OPEN]

A resolver policy/`/info` convention with explicit rejection codes distinguishing
**protocol-invalid** (bad signature, stale sequence, wrong ownershipRef) from
**policy-declined** (valid record this resolver won't store). Wallets must present
these differently.

### 5.2 Freshness semantics — [OPEN]

A resolver can serve a stale but validly signed value record. Multi-resolver comparison
is the v1 mitigation, but nothing specifies client behavior when resolvers disagree, or
what a "current head" assertion even means across resolvers.

---

## 6. Wallet and payment substrate

The ONT client layer is best built on an existing non-custodial, always-online,
programmable Lightning node rather than a wallet from scratch. Open questions about
what that substrate must expose:

### 6.1 On-chain wallet substrate and the Rust/TS boundary — [PARTIALLY ANSWERED]

Does the substrate allow **arbitrary PSBT construction / sign / broadcast** (custom
outputs, an `OP_RETURN`) vs. only high-level "send to address"? This decides whether
the contested-name bonded auction, transfers, recovery, and the self-claim L1 fallback
can live in the app rather than bouncing to an external signer. Max (2026-06-05)
advised [BDK](https://bitcoindevkit.org) (the Rust Bitcoin Dev Kit) as the right
substrate for both the publisher's tx signing and the mobile app — recommended
direction, **not yet adopted** (current code is `bitcoinjs-lib` + Esplora). Still open:
how the Rust wallet layer interoperates with the TS engine/clients (FFI boundary via
`bdk-ffi`/UniFFI, where signing lives, build/release implications for the React Native
app).

### 6.2 A separate, on-device-only owner key — [OPEN]

The ONT owner key controls a name permanently and must not ride an LN credential's
convenience backup. Can the substrate hold an owner key outside any cloud-backup flow —
i.e. *not* derived from the node's root seed?

### 6.3 Backup threat model — [OPEN]

At first login, what lands in cloud storage (just the client-side-encrypted root
seed)? What is the threat model for the cloud provider plus a weak user password?
(Confirms "storage, not recovery authority.")

### 6.4 Lightning atomic binding (PTLCs and similar) — [ANSWERED — do not pursue near-term]

Resolved per expert feedback (Max, 2026-06-05) and Decision #38: don't add technical
complexity for trust-minimization when the amount at risk per claim is tiny (~₿1,000 /
~$1). v1 uses a **pay-first flow with reputable publishers** — pay, then included; a
non-payer is simply left out (see
[`spec/ONT_ISSUANCE_FEE_MECHANICS.md`](./spec/ONT_ISSUANCE_FEE_MECHANICS.md)).
Atomically binding the off-chain payment to on-chain inclusion remains a longer-term
research item with no v1 dependency on any specific primitive; if revisited, it reopens
here.
