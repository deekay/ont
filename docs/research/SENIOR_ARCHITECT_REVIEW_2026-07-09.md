# ONT senior architecture and product-readiness review

**Review date:** 2026-07-09  
**Repository snapshot:** `d3d34d35` (`main`)  
**Status:** External architecture analysis; **not project canon and not a numbered decision**  
**Audience:** DK, ONT contributors, and a subsequent LLM or human reviewer

> This document records a senior architecture review of the product, protocol,
> implementation, test posture, open questions, and launch plan. It deliberately
> separates observed facts from recommendations. It does not amend
> [`STATUS.md`](../core/STATUS.md), [`DECISIONS.md`](../core/DECISIONS.md), or any
> protocol specification.

## How a subsequent reviewer should use this document

Before relying on any statement here, follow the refresh protocol in
[`CLAUDE.md`](../../CLAUDE.md): inspect recent commits, then read the canonical
documents in their declared order. In case of conflict, current code wins for code
behavior, numbered decisions win for ratified policy, and the canonical acquisition
state machine wins over this review's proposals.

Treat the four labels below literally:

- **Observation** — behavior or project state found in the reviewed snapshot.
- **Assessment** — the reviewer's interpretation of those facts.
- **Recommendation** — a proposed change, not an authorized project decision.
- **Decision required** — a fork the product owner and protocol authors must resolve.

No implementation change is authorized by this document. In particular, its data
availability recommendation conflicts with the production interpretation of Decision
#84 and would require an explicit decision before implementation.

## 1. Executive judgment

### 1.1 Bottom line

ONT is unusually disciplined protocol R&D with a coherent product thesis, strong
predicate-level verification, and serious attention to trust boundaries. It is not,
however, best described as a feature-complete product awaiting deployment. A more
accurate description is:

> Individual consensus predicates and evidence adapters are well developed, while
> the authoritative composed product state machine is not yet complete.

The project is ready for a controlled private-Signet integration phase if the test is
described narrowly and honestly. Today it can credibly demonstrate that an anchor was
included in the configured Bitcoin chain and that a claimed entry is a member of the
anchored batch. It should not yet tell users that complete, current ownership has been
proved merely from those facts.

The project is not ready for irreversible mainnet activation. The blockers are not
mostly UI polish. They are the composed consensus lifecycle, historical data
availability semantics, proof assurance language, adversarial/reorg coverage,
operational durability, and production wallet/publisher behavior.

### 1.2 What is working

- The product thesis is crisp: a Bitcoin-secured payment name without a token,
  recurring rent, registrar discretion, or administrative revocation.
- The clean-build and quarantine discipline is sound.
- Wire formats, negative vectors, fail-closed adapters, branded evidence, and pure
  predicate tests are strong.
- Publisher, indexer, resolver, wallet, evidence, and consensus responsibilities are
  separated better than in most projects at this stage.
- Full canonical DA records can be retrieved and independently recomputed rather than
  trusting a publisher's assertion about fees or roots.
- The web and mobile verification direction is correct: the client should verify,
  rather than merely display an operator verdict.
- Private Signet is the right environment for deterministic integration and recovery
  drills, provided its provider-trusted security model is explicit.

### 1.3 What is not yet working as a finished product

- No single reducer currently composes anchors, batched acquisition, notice windows,
  collisions, bonds, auctions, transfer, recovery, height transitions, and reorgs into
  one authoritative name state.
- The live batched-claim path validates a narrower set of facts and then writes
  committed entries directly. This is not equivalent to applying the canonical
  acquisition lifecycle.
- Client copy collapses several proof levels into the word "verified" and therefore
  overstates what the proof bundle establishes.
- The current DA height rule cannot establish that bytes were publicly retrievable at
  the anchor height. A fresh verifier can be shown late-revealed bytes and will stamp
  them with the earlier anchor height.
- A local private-Signet stand-up has succeeded, but the public site did not expose a
  live health/API surface at the paths tested on 2026-07-09.
- Several production paths still rely on demo defaults, boot-time fixtures, skipped
  browser tests, or operator-specific configuration.

### 1.4 Principal recommendation

Make one pure, deterministic, reorg-aware reducer the only authority allowed to emit
name state:

```text
reduceBlock(
  priorState,
  verifiedBlockFacts,
  verifiedExternalEvidence,
  frozenProtocolParameters
) -> nextState + eventVerdicts + portableTransitionReceipts
```

Every indexer, resolver, proof service, web app, and mobile app should consume the
reducer's state or independently verify its portable receipts. No API handler or
ingestion path should be able to award ownership by bypassing this reducer.

For DA, do not ship the current "present bytes imply available at anchor height" rule
as unconditional mainnet safety. The safest launch is L1-authoritative acquisition for
v1 while batched DA remains a Signet/research path. If cheap batching is a non-negotiable
v1 requirement, introduce a candid, replayable witnessed-DA trust model and a two-phase
Bitcoin activation event. Both choices are explained in section 8.

## 2. Review scope and evidence

This review examined:

- the canonical product and design documents;
- the acquisition state machine and numbered decisions;
- core consensus, evidence, claim-path, indexer, publisher, web, and mobile code;
- test and CI behavior;
- private-Signet artifacts already present in the working tree; and
- the current DA research notes and their implementation.

The reviewed checkout had untracked `.scratch/` and `site/` directories. They were not
modified. No project files were changed during the underlying assessment; this review
document is the only resulting repository addition.

### 2.1 Validation results at the snapshot

The following root checks completed successfully:

- build;
- TypeScript type checking;
- package-boundary checks;
- audit-map checks;
- deployment checks;
- documentation-link checks; and
- the main test suite: **1,541 passing, 5 skipped, 0 failing**.

The mobile typecheck and the web/mobile crypto cross-check also completed successfully.

Important qualifications:

- Some skipped tests exercise real-node or regtest behavior.
- A local browser UX smoke could not execute because Chromium was unavailable.
  The current CI workflow explicitly permits that smoke to skip.
- Dependency audit output reported four low-severity findings at the root and eleven
  moderate findings under mobile. Counts alone do not establish exploitability, but
  every finding should be dispositioned before release.
- [`STATUS.md`](../core/STATUS.md) recorded an older test count and repository snapshot,
  so it needs a truth reset before being used as a launch dashboard.

### 2.2 Public and private environment observation

On 2026-07-09, `https://opennametags.org` returned the static web surface, while the
tested `/api/health`, `/ont-private/api/health`, and `/ont-private/` paths returned 404.
That is an observation about those paths, not proof that no backend was deployed
elsewhere.

Local private-Signet artifacts show that the stack was stood up, mined its configured
chain, and anchored a test name. That is useful integration evidence. It is not proof
of a public, durable, independently operated environment.

### 2.3 Implementation snapshot notes to preserve

These details are easy to lose in a high-level handoff and should be rechecked rather
than blindly carried forward:

- [`apps/indexer/src/live/select-enforcement.ts`](../../apps/indexer/src/live/select-enforcement.ts)
  defaults to enforcement off. Its `http-da` mode loads a declared root list at boot
  into an in-memory material map; this is the source of the runtime-discovery concern.
- The same selector's fallback gate schedule is ₿1,000,000 for one-byte names and
  ₿100,000 for the long-name floor. [`STATUS.md`](../core/STATUS.md) described a
  different launch gate. Environment configuration may override the code, but the
  deployment default and canonical parameter story must be reconciled before testing.
- [`mobile/src/config.ts`](../../mobile/src/config.ts) has a null publisher endpoint and
  demo mode enabled by default. The comments correctly say production must change
  this; a release gate should enforce it rather than rely on the comment.
- [`docker/Dockerfile`](../../docker/Dockerfile) installs the full dependency graph and
  runs the application as the base image's default root user. A production image
  should use a non-root runtime user, copy only runtime artifacts/dependencies, include
  health checks, and be scanned/pinned by digest.
- [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) deliberately permits the
  browser fixture smoke to skip if the Playwright/Chromium install fails or hangs. This
  is a documented infrastructure compromise, but it leaves a real product-journey gap.
- The engine reports a structurally valid auction bid as `auction_bid_recorded`, but
  [`applyAuctionBid`](../../packages/consensus/src/engine.ts) does not mutate auction or
  ownership state. That is validation/provenance, not complete auction settlement.

## 3. Architecture assessment

### 3.1 Sound architectural choices

#### Deterministic kernel and fail-closed evidence

The project generally draws the right boundary: network and chain providers produce
untrusted facts; adapters validate and brand those facts; pure consensus functions
consume only verified evidence. This makes failure behavior testable and limits the
surface where external data can influence state.

#### Component separation

The intended roles are sensible:

- the **publisher** accepts and assembles submissions;
- the **Bitcoin writer/operator** anchors protocol events;
- the **DA service** serves content-addressed records;
- the **indexer** reconstructs state;
- the **resolver** exposes state and proofs;
- the **wallet/client** independently checks evidence; and
- the **kernel** decides protocol validity.

This separation should be retained. The issue is not that the components are wrong;
it is that the final authority has not yet been concentrated in a complete reducer.

#### Audit-surface discipline

The explicit audit manifest is valuable. The caution is that a manifest is a map, not
proof of closure. Imported parsers, codecs, cryptography, storage behavior, provider
assumptions, and build tooling can all expand the effective audit surface. The manifest
should eventually be generated or verified against the transitive production graph.

#### Full DA record rather than publisher verdict

Serving the entire canonical batch record is the right integrity design. It lets an
independent consumer recompute:

- the old and new roots;
- batch membership;
- entry ordering and duplicates;
- the batch size;
- fee basis and charged fee; and
- completeness of the committed transition.

This is much stronger than serving a signed JSON assertion. It solves content integrity
and transition recomputation. It does not, by itself, solve publication time or durable
availability.

#### Shared client verification

The shared verification core and the mobile dependency guard are good product
architecture. Verification semantics should be identical across web, native mobile,
CLI, and any future extension. Platform code should only fetch and render.

### 3.2 The composed reducer gap

**Observation.** [`packages/consensus/src/engine.ts`](../../packages/consensus/src/engine.ts)
currently excludes `RootAnchor` from extracted engine events. Its state model and
application path focus on transfer, auction-bid, and recovery events. Separately,
the batched enforcement path in
[`apps/indexer/src/enforce-batched-claims.ts`](../../apps/indexer/src/enforce-batched-claims.ts)
verifies the anchor, fee, membership, availability witness, and whole-batch material,
then writes the committed entries directly.

[`packages/claim-path/src/enforce-batched-claim.ts`](../../packages/claim-path/src/enforce-batched-claim.ts)
explicitly leaves the contested acquisition path as follow-up work.

The auction-bid application path validates that the referenced output exists, is a
payment output, and equals the bid amount. It then emits an applied provenance verdict;
it does not construct the auction lot, select a winner, update ownership, or schedule
bond release.

**Assessment.** These are useful vertical slices, but they do not yet form the
canonical acquisition state machine. A batch member can pass the implemented path
without that path also demonstrating all of the following:

- short-name eligibility;
- provisional notice state;
- all relevant claims across competing anchors;
- collision and nullification behavior;
- bond escalation;
- complete auction lot construction and settlement;
- height-triggered transitions;
- transfer and recovery continuity; and
- rollback and deterministic replay after a reorg.

Having each predicate somewhere in the repository is not sufficient. Consensus is the
composition, ordering, and state-transition behavior of those predicates.

**Recommendation.** Introduce a single reducer package with:

1. a versioned, serializable consensus state schema;
2. explicit block-level inputs, including chain identity and block hash;
3. verified evidence inputs with no network callbacks;
4. deterministic event ordering and duplicate rules;
5. explicit height-boundary transitions;
6. per-event applied/ignored/fault verdicts;
7. a state commitment and portable transition receipt per block;
8. checkpoint plus undo/replay support for reorgs; and
9. differential tests proving that every product surface reaches the same state.

The indexer may own persistence and orchestration, but it must not own extra consensus
law. The resolver should never infer ownership from database rows that were not emitted
by the reducer.

### 3.3 Proof semantics and user-facing assurance

**Observation.** The present proof flow can establish important facts:

- a cited Bitcoin transaction is included under the configured header source;
- an ONT root commitment occurs in that transaction;
- a name/owner leaf is a member of the cited accumulator root; and
- the surrounding proof bundle is structurally well formed.

It does not, from membership alone, establish:

- that the notice window closed;
- that no other qualifying claim or bond existed;
- that the cheap path was eligible;
- that the anchor was incorporated into canonical ONT state;
- that later transfer or recovery events did not change the owner;
- that the cited block remains canonical after a reorg; or
- that the result is current at the verifier's chosen chain tip.

**Assessment.** Copy such as "Bitcoin-verified: ownership verified against Bitcoin" or
"verified against Bitcoin on this device" compresses all of those distinctions into a
single green state. The cryptography may be correct while the product claim remains too
broad.

**Recommendation.** Define assurance as a monotonic ladder, and show the highest level
actually established:

1. **Anchor included** — the root anchor is included in the selected Bitcoin chain.
2. **Batch member** — the name/record is a valid member of that root.
3. **Claim provisional** — the claim entered ONT's acquisition lifecycle and is still
   subject to a stated deadline or contest.
4. **Ownership finalized at block X** — the complete reducer finalized the owner under
   the active parameter set at a named block.
5. **Current through tip Y** — the verifier checked all later state transitions through
   its selected, sufficiently confirmed tip.

These labels should appear in the API schema as typed states, not merely UI copy. A
client must not render level 4 from a level-2 bundle.

### 3.4 Provider and private-Signet trust

Decision #36 correctly recognizes the private-Signet constraint: when the configured
operator controls the challenge key and block production, there is no independent
proof-of-work security for that environment. The optional Esplora/header source can
improve data access and chain-shape checking, but it cannot transform a one-operator
private chain into decentralized consensus.

This is acceptable for deterministic integration. It should be presented as:

- **validity checked by the client** against a configured private chain;
- **liveness and chain history controlled by the private-Signet operator**; and
- **not evidence of mainnet-grade decentralization or censorship resistance**.

### 3.5 Runtime discovery and durability

The current HTTP DA mode demonstrates two-operator fetching, which is a meaningful
milestone. The live selection path still primarily discovers configured roots and
prefetches material at startup. Product operation needs:

- runtime discovery of every new anchor;
- durable retry queues;
- content-addressed cache and integrity revalidation;
- multiple independently configured origins;
- backpressure and bounded payload handling;
- restart-safe progress cursors;
- negative caching that cannot become permanent censorship;
- archive inventory reconciliation; and
- a clean-node re-derivation drill using no operator database snapshot.

## 4. Product and mechanism assessment

### 4.1 Product wedge

The most credible initial product is narrower than a general decentralized identity
system:

> Type a human-readable name, verify its Bitcoin-backed payment record locally, and pay
> it without trusting a registrar or hosted resolver verdict.

That is concrete and testable. Generic profiles, arbitrary HTTPS records, and broad
identity claims should not dilute the first launch.

### 4.2 A name secures a string, not an identity

A flat, permissionless namespace can establish control of a string under its rules. It
cannot establish that the controller is the person, company, trademark owner, or public
figure users associate with that string.

The product should avoid "impersonation-proof" or equivalent language. The correct
claim is closer to: ONT prevents silent reassignment of the registered string under the
protocol; users and wallets still need social/organizational signals to interpret it.

This distinction affects search ranking, contact confirmation, lookalike warnings,
payment confirmation, and recovery UX.

### 4.3 Collision and denial-amplification risk

The bare-collision/nullification rule deserves explicit economic modeling before it is
frozen. If an attacker can repeatedly create a cheap qualifying collision that forces a
legitimate claimant into a larger bond or auction, the cheap gate becomes a denial
amplifier.

Model at least:

- cost to attack one name and many names;
- victim capital lock and delay;
- repeated attacks across generations;
- publisher and miner censorship;
- hidden/late batch material;
- attacker recovery after losing an auction; and
- whether the attack is profitable only for griefing.

### 4.4 Bonds are capital locks, not ordinary fees

A returnable bond can be economically expensive even if nominally refunded. Product
copy and parameter modeling should include:

- expected lock duration;
- Bitcoin fee costs on entry and release;
- volatility and liquidity cost;
- reorg and replacement behavior;
- wallet coin-control risk; and
- recovery when the release path is not automatically exercised.

Wallets should use dedicated bond accounts/UTXOs, freeze them from ordinary spending,
simulate transactions before broadcast, monitor every state transition, and expose a
manual recovery path.

### 4.5 Auction format

The current open ascending direction is appropriate for Signet because it is simple,
observable, and debuggable. A more intricate sealed-bid or commit/reveal construction
would create additional completeness and withholding problems. Unless modeling reveals
a decisive exploit, retain the open format and focus on complete lot construction,
deterministic tie-breaking, settlement, refund, and reorg behavior.

### 4.6 Immutability changes the launch standard

An immutable namespace does not get an ordinary mainnet beta. Parameters, ambiguous
states, and allocation errors can permanently determine valuable names. The right
sequence is long-lived private testing, a public activation-candidate network with
frozen artifacts, independent replay, and only then irreversible activation.

## 5. Assessment of planning, tiebreakers, and open questions

### 5.1 Planning strengths

The project has excellent slice discipline. Individual work items tend to have:

- a named invariant;
- an explicit boundary;
- vectors and negative cases;
- a fail-closed implementation;
- status/decision documentation; and
- deployment or audit checks.

This produces high local quality and makes the work reviewable.

### 5.2 Planning weakness: local completion ahead of composed semantics

The same slice discipline has optimized for finishing isolated predicates before
proving the complete lifecycle. That creates a misleading dashboard: many green rows
can coexist with no single path that proves a name from first claim through finalized
current ownership.

Future milestones should be phrased as end-to-end properties, for example:

- "Two independent nodes replay the same blocks and DA records and derive the same
  finalized owner after a collision and reorg";
- not "availability predicate complete" plus "auction predicate complete" in separate
  rows.

### 5.3 Status-document drift

At the reviewed snapshot, [`STATUS.md`](../core/STATUS.md) was dated 2026-06-29,
referenced an older commit, and contained test counts and component descriptions that
did not reflect the July work. Separately, `G-A`, `G-B`, and `G-C` labels are used in
more than one planning taxonomy, which makes status discussions harder to follow.

**Recommendation.** Perform a truth reset:

- one dated repository snapshot;
- one vocabulary for product gates;
- one vocabulary for build slices;
- explicit `wired`, `prototype`, `test-only`, and `not built` columns;
- a link from each green status to its end-to-end acceptance test; and
- no claim of a unified kernel until the authoritative reducer owns the full lifecycle.

### 5.4 Existing DA tiebreaker

Decision #84 chose O1 + O3:

- for a presented valid content witness, assign `firstServableHeight` to the anchor
  height; and
- route priority-bearing contention to direct L1.

This was a reasonable attempt to avoid unverifiable producer attestations and to keep
contention objective. It also accurately noted that absence of data is not positively
provable.

The unresolved problem is stronger: O1 does not merely simplify the late-served branch.
It backdates a witness. A node first shown the data long after the window assigns the
same early height as a node that retrieved it at the anchor. "Finalize once" preserves
a verdict for a node that already has one, but a clean node replaying from chain plus
currently served bytes has no canonical record of the earlier absence/verdict.

**Assessment.** Decision #84 is suitable as a private-Signet research shortcut. It is
not sufficient for an unconditional mainnet safety claim.

### 5.5 The fundamental DA tiebreaker

The project must choose which invariant has priority, because a root-only Bitcoin
anchor plus off-chain bytes cannot simultaneously provide all three:

1. trustless, deterministic fresh-node replay of historical availability;
2. approximately `0.015 vB/name` L1 cost; and
3. no additional availability authority or consensus system.

No codec, ZK proof, accumulator, or local timestamp removes that tradeoff. The product
owner needs to select one of these positions:

- put sufficient data/evidence on Bitcoin;
- disclose and govern a DA authority/quorum;
- depend on an external DA consensus system; or
- remove historical off-chain availability from ownership consensus.

That is the most important open architecture decision in the project.

## 6. Data availability: precise problem statement

### 6.1 Guarantees that must not be conflated

ONT should use separate terms for five properties:

| Property | What it means | What the current root + record can prove |
|---|---|---|
| Content integrity | The bytes match the committed root and canonical transition | Yes |
| Present retrievability | A verifier can retrieve matching bytes now | Yes, by retrieving them |
| Historical publication | Matching bytes were admitted to a defined public channel by height `H` | No |
| Durable availability | Matching bytes remain retrievable after finalization | Operationally encouraged, not cryptographically guaranteed |
| Decentralized availability | No one operator or small colluding set can suppress the bytes | Not from a root-only anchor |

Erasure coding and sampling improve retrievability. Mirrors improve durability and
censorship resistance. Neither creates a trustless historical timestamp for a fresh
verifier unless an accepted consensus system records evidence of publication.

### 6.2 The late-reveal divergence

Consider a root anchored at height `h` with availability deadline `h + W`:

1. Publisher withholds the batch record through the deadline.
2. Node A is online, fails closed, and excludes the batch.
3. At `h + W + 100`, the publisher begins serving the exact committed bytes.
4. Node B starts from scratch and receives those bytes.
5. Under O1, Node B assigns `firstServableHeight = h` because the bytes bind to the
   anchor, then includes the batch.

If Node A's earlier settled verdict is not itself part of a canonical, independently
verifiable history, the nodes cannot converge from the same Bitcoin chain and currently
available evidence. The late bytes prove integrity, not when they became public.

### 6.3 Why common tools do not solve it alone

- **A ZK validity proof** can prove that a hidden batch correctly transforms one root
  into another. It does not prove that anyone could download the witness.
- **A signature from the publisher** proves what the publisher asserted, not public
  availability.
- **An HTTP `Date` header or local observation time** is not shared consensus evidence.
- **Content addressing/IPFS-style naming** proves identity of retrieved content, not
  publication time or persistence.
- **Mirrors** improve the probability of survival after at least one received the data,
  but a fresh verifier still needs evidence of when that happened.
- **Erasure coding plus sampling** can give probabilistic evidence of present
  retrievability. Historical sample attestations require a trusted or consensus-backed
  record.
- **Finalize once** works only if the settled verdict is itself durably canonical and
  replayable. A local database flag is not enough.

## 7. DA architecture options

### Option A — L1-authoritative v1, batching remains pre-production

Every ownership-affecting acquisition places sufficient claim/activation data on
Bitcoin. The accumulator may be used as an index or proof compression device, but
off-chain bytes do not decide whether an owner exists.

Variants include:

- direct L1 acquisition for every name;
- a compact on-chain claim commitment followed by an on-chain activation/reveal; or
- limiting v1 to low-volume registrations while the batched protocol remains opt-in
  Signet research.

**Benefits**

- strongest alignment with the "Bitcoin decides" product promise;
- clean fresh-node replay and reorg behavior;
- no DA committee or external consensus dependency;
- much smaller mainnet audit surface; and
- lets ONT validate product demand before freezing the hardest scaling mechanism.

**Costs**

- materially higher blockspace and per-name cost;
- lower throughput;
- weakens the current scaling headline; and
- may require a versioned future migration path for batching.

**Assessment:** Safest first-mainnet architecture and this review's preferred product
choice. It is better to launch a smaller claim honestly than an irreversible namespace
whose ownership replay depends on an unprovable timestamp.

### Option B — witnessed public DA log plus two-phase Bitcoin activation

Define availability operationally as admission into a public, append-only log witnessed
by a frozen threshold set. This adds an explicit authority, but makes historical replay
deterministic and the trust assumption auditable.

Proposed flow:

1. Publisher constructs a canonical versioned batch envelope containing `prevRoot`,
   `nextRoot`, ordered entries, batch size, fee facts, and optional erasure-coding
   manifest.
2. Publisher submits it to a content-addressed append-only public log before anchoring.
3. Each witness independently fetches the complete envelope, reconstructs the root,
   checks whole-batch validity, stores it, and signs an availability certificate.
4. A threshold certificate identifies the root, manifest hash, batch size, witness
   epoch, and the Bitcoin height/time boundary by which the witnesses observed it.
5. Anyone may post a `BatchActivate` event to Bitcoin containing the certificate hash
   or compact certificate material.
6. ONT treats the batch as entering consensus at the activation transaction's confirmed
   height, never retroactively at the earlier root-commit height.
7. A certificate posted after the deadline may start a new generation or lose priority;
   it is never backdated.
8. Witnessed log tree heads and consistency proofs are periodically anchored to
   Bitcoin, allowing later auditors to detect deletion or equivocation.

The certificate must be verified against a launch-frozen witness set and epoch. Witness
changes require an explicit protocol upgrade/activation rule. Ordinary mirrors remain
permissionless; only historical admission/timing depends on the witnesses.

**Benefits**

- fresh nodes derive the same historical result;
- late data cannot be silently backdated;
- full bytes remain off L1;
- operationally practical for a staged launch; and
- the new trust assumption is visible and measurable rather than implicit.

**Costs**

- safety now depends on the threshold not certifying unavailable/private data;
- witness membership, key rotation, compromise, equivocation, and outage become
  governance problems;
- the activation event and wire format add complexity; and
- "Bitcoin-only" must be qualified: Bitcoin orders certified events, while a witness
  quorum attests DA admission.

**Assessment:** Best pragmatic choice if cheap batched acquisition is mandatory for v1.
Start honestly as 1-of-1 or 2-of-3 on private Signet, then require a stronger threshold
and independent operators before any production claim. A transparency-log design is
preferable to free-floating signatures because it provides inclusion, consistency, and
equivocation evidence.

### Option C — external DA consensus layer

Publish batches to a separate DA network or blob system that supplies an inclusion and
finality proof. The ONT reducer verifies or accepts a checkpointed proof of that system,
then processes a Bitcoin activation.

**Benefits**

- can provide scalable publication and established availability operations;
- avoids ONT inventing its own witness network; and
- may support sampling and erasure coding out of the box.

**Costs**

- adds another consensus, bridge, upgrade, fee, and liveness dependency;
- may not offer a compact proof Bitcoin/ONT clients can verify directly;
- changes the product's trust and longevity story; and
- external rules can change independently of ONT.

**Assessment:** Architecturally honest, but likely too much dependency for the current
product thesis. Evaluate only if a specific system can meet frozen verification,
long-term archival, and client-size requirements.

### Option D — full or sampled Bitcoin publication

Publish the entire batch, erasure-coded chunks, or challenge-selected shares in Bitcoin
transactions.

Full publication provides the clearest DA guarantee but defeats the intended batching
economics. Random on-chain samples reduce cost but prove only those shares. A producer
holding the full batch privately can answer challenges without making the unsampled
data broadly available.

An interactive design could derive random share indices from future Bitcoin block
hashes, require a bonded responder to reveal those shares on chain, and finalize only
after enough rounds. This provides a probabilistic proof of retrievability from the
responder during the window, not a general proof that every client could obtain the
full batch. It also creates substantial protocol, latency, griefing, and fee complexity.

**Assessment:** Keep full-data-on-L1 for contested or escape paths. Do not make a novel
sampling game a v1 dependency.

### Option E — optimistic batching with per-user L1 escape

The publisher gives each claimant a signed durable receipt and membership path. If the
batch is withheld, the claimant can place a compact escape claim on Bitcoin before a
deadline.

This improves individual censorship recovery, but it does not solve the general hidden
member problem: after the deadline, a publisher could reveal a previously hidden batch
member to a fresh node. Preventing that member from counting still requires a canonical
record of timely publication, or an on-chain activation/receipt per member, which loses
the batching benefit.

**Assessment:** Valuable as a product safety valve when combined with Option B or L1
acquisition. Not a standalone historical-DA solution.

### Option F — remove DA from ownership consensus

The batched layer could issue a non-authoritative capability or directory record, while
actual ownership activates only through a later L1 event. Alternatively, batched names
could be clearly labeled a lower-assurance tier.

**Benefits**

- preserves inexpensive discovery and experimentation;
- keeps globally authoritative ownership replay on Bitcoin.

**Costs**

- creates two acquisition/assurance paths;
- conflicts with the current one-path product model; and
- may confuse users unless product separation is very clear.

**Assessment:** Cleaner technically than pretending the DA issue is solved, but product
complexity makes Option A preferable unless the two tiers serve genuinely distinct
markets.

### Option G — validity-rollup or BitVM-style dispute machinery

A sophisticated off-chain state transition with Bitcoin fraud proofs could, in theory,
make incorrect state updates challengeable. General fraud verification and data
withholding disputes on current Bitcoin require interactive games, economic actors,
long windows, and a much larger audit surface. Even a validity proof does not solve DA
without an availability rule.

**Assessment:** Research direction, not launch architecture.

## 8. Recommended DA direction

### 8.1 Recommendation for private Signet

Keep O1 only as an explicitly labeled test shortcut while using Signet to reproduce the
failure that O1 cannot resolve. Add a DA mode switch so the same tests can exercise:

- `present-content-at-anchor` (current O1 research behavior);
- `l1-authoritative`; and
- `witnessed-activation`.

The point of Signet should be to compare the architectures with identical claim flows,
not to canonize the first working transport.

### 8.2 Recommendation for first mainnet

Choose Option A unless low L1 cost is a launch-critical product requirement proven by
real user demand. It is the smallest trustworthy irreversible protocol.

If low-cost batching is mandatory, choose Option B and state the trust model plainly:

> Bitcoin provides ordering, immutability, and activation finality. A launch-frozen
> threshold of independent DA witnesses attests that the full canonical batch entered
> the public log before activation. Anyone can mirror and verify the data; the quorum is
> authoritative only for historical admission time.

Do not call that unconditional or Bitcoin-only DA. It is a transparent federated
bootstrap that can be decentralized or replaced by a stronger mechanism in a future,
versioned namespace epoch.

### 8.3 Concrete changes for the witnessed design

If Option B is selected, the design should include:

- a new `BatchActivate` wire event distinct from `RootAnchor`;
- no ownership priority inherited from an unactivated root;
- canonical certificate serialization and domain separation;
- threshold verification in the pure reducer;
- witness epoch and exact key set in the frozen activation manifest;
- an append-only Merkle log with inclusion and consistency proofs;
- at least two independent byte stores in addition to witness local storage;
- anyone-can-submit activation, so the publisher cannot suppress a completed quorum;
- certificate and root expiration rules;
- deterministic behavior for late certificates;
- witness equivocation evidence and incident policy;
- reorg handling for both root and activation transactions;
- portable proof bundles containing Bitcoin inclusion, certificate, log inclusion,
  batch bytes/path, reducer transition receipt, and current-tip evidence; and
- copy that distinguishes quorum-certified publication from Bitcoin inclusion.

### 8.4 DA adversarial test matrix

No DA design should be frozen until two independent implementations pass at least:

1. withhold the complete batch until `h + W + C + 1`, then reveal it to a clean node;
2. keep one node online at the deadline and boot another after late reveal;
3. serve `N - 1` entries, then the missing entry after the window;
4. serve extra, duplicate, reordered, stale-base, and root-poisoned entries;
5. make mirrors disagree or delete previously served bytes;
6. eclipse one node onto a malicious origin set;
7. reorg the root but not activation, activation but not root, and both;
8. post a late certificate and attempt to inherit the earlier generation's priority;
9. rotate witness epochs across an in-flight batch;
10. compromise fewer than threshold, exactly threshold, and more than threshold keys;
11. produce inconsistent log tree heads and verify equivocation is detectable;
12. lose every operator database and rederive from Bitcoin plus public archives;
13. finalize, then make the bytes disappear and verify the documented failure mode;
14. repeat the same tests for recovery evidence, which has analogous availability
    concerns; and
15. run the same corpus against two independently written reducers.

## 9. Private-Signet productization gaps

The next private-Signet milestone should be called complete only when it proves one
vertical lifecycle, not merely individual services.

### Required before the Signet test is product-valid

1. **Authoritative reducer.** Define the versioned state and route every acquisition
   and ownership transition through it.
2. **Honest assurance schema.** Replace binary "verified" with the assurance ladder.
3. **One full happy path.** Claim -> publish -> anchor -> retrieve DA -> enter provisional
   state -> close notice window -> finalize -> resolve -> verify in wallet.
4. **Negative lifecycle paths.** Short-name rejection, collision/nullification, bonded
   escalation, auction settlement, transfer, recovery, and invalid evidence.
5. **Deliberate reorg.** Reorg across anchor, provisional, finalization, transfer, and
   recovery boundaries; demonstrate identical replay.
6. **Runtime DA operation.** Discover roots as blocks arrive, retry durably, fetch from
   multiple origins, and restart cleanly.
7. **Real claimant publisher.** The existing publisher/operator batch assembly is a
   foundation; the product needs submission authorization, durable receipts, status,
   idempotency, abuse controls, and end-user recovery.
8. **Production client defaults.** Remove demo-on behavior and null publisher defaults
   from the test build. Configure a clean resolver/publisher origin explicitly.
9. **Modern Bitcoin transaction path.** Exercise SegWit/Taproot-funded anchor writes
   directly rather than relying on a legacy funding hop.
10. **Relay-policy reality.** Test actual package size and carrier choices against the
    intended nodes and redesign any payload that depends on nonstandard relay.
11. **Non-skippable browser journey.** CI must fail when the main claim/pay/verify smoke
    cannot run.
12. **Two-operator independence.** A second operator should derive state without the
    first operator's database, hidden configuration, or predeclared root fixture.

### Suggested Signet exit demonstration

Record one reproducible script and screen capture in which:

- two nodes begin from empty databases;
- a mobile/web claimant submits a real claim;
- a distinct publisher assembles and serves it;
- an operator anchors it;
- both nodes discover, verify, and derive the same provisional/final state;
- one DA origin is taken offline;
- a conflicting claim forces the designed contention path;
- a reorg changes the intermediate result;
- both nodes replay to the same final owner; and
- a clean mobile client explains exactly which assurance level it has established.

## 10. Mainnet-launch gaps

In addition to every Signet exit item, mainnet requires:

### Consensus and proofs

- resolve historical DA and ratify the revised decision;
- complete reducer and independent implementation/replay;
- prove current finalized ownership, not only accumulator membership;
- prove auction set completeness and deterministic settlement;
- freeze all parameter sets and activation rules in a machine-readable manifest;
- publish golden vectors for every event and lifecycle boundary;
- define deep-reorg and catastrophic-reorg policy; and
- commission independent protocol, Bitcoin-script/transaction, and cryptographic audits.

### Namespace and economics

- publish the activation height and prelaunch claim-handling policy;
- model collision/nullification denial economics;
- model bond affordability and lock duration;
- test publisher censorship and miner censorship scenarios;
- document name normalization/lookalike policy; and
- establish exact launch behavior for already-known names and preclaims.

### Payment product

- freeze the exact payment record types and encoding;
- define wallet discovery and update semantics;
- validate address/network mismatches and unsupported assets fail closed;
- add contact confirmation and lookalike warnings;
- keep generic identity/profile scope out of the critical path; and
- complete a safe transfer/recovery UX before users store meaningful value behind a
  name.

### Decentralization and operations

- operate at least two independent archives and resolvers;
- complete a clean re-derivation drill from public artifacts;
- productionize persistence, backups, restore, monitoring, alerts, and incident playbooks;
- bound every network body, queue, cache, and expensive verification path;
- add rate limits and abuse controls without making one hosted API authoritative;
- make publisher receipts and failure states durable and user-visible;
- define archive retention and disappearance behavior;
- publish reproducible binaries/images and a signed release manifest; and
- remove test-only secrets, demo defaults, and operator-specific assumptions.

### Wallet safety and supply chain

- dedicated bond coin control, freezes, fee preflight, confirmation monitoring, and
  recovery;
- hardware-wallet and backup behavior for owner/recovery keys;
- dependency-audit disposition with pinned/verified production graphs;
- SBOM and provenance for web, mobile, containers, and CLI;
- mobile store/TestFlight release pipeline and rollback plan; and
- external application security review of publisher, resolver, web, and mobile.

## 11. Recommended work sequence

### Phase 0 — truth reset

- Update status to the current commit and test counts.
- Separate component completion from lifecycle completion.
- Resolve gate-name collisions.
- Mark proof claims by assurance level.

### Phase 1 — compose consensus

- Specify the state schema and `reduceBlock` contract.
- Route anchors and batched entries through it.
- Add notice, collision, bond, auction, transfer, recovery, height, and reorg behavior.
- Generate portable receipts and a state commitment.

### Phase 2 — decide DA architecture

- Reproduce the late-reveal divergence.
- Implement the L1 and witnessed-activation prototypes behind an explicit mode.
- Model cost, latency, trust, and operator failure.
- Ratify one mainnet direction; amend Decision #84 accordingly.

### Phase 3 — private-Signet lifecycle

- Build the real claimant/publisher flow.
- Run two independent operators and archives.
- Complete adversarial, browser, mobile, and reorg journeys.
- Remove demo and fixture assumptions.

### Phase 4 — activation candidate

- Freeze wire formats, parameters, witness/DA model, and launch manifest.
- Commission independent review and a second reducer/replay implementation.
- Run a long-lived public activation-candidate environment.
- Practice loss, restore, key compromise, archive loss, and incident response.

### Phase 5 — irreversible launch decision

Launch only if a clean reviewer can answer all of these from public artifacts:

- Why is this the current owner?
- Which complete lifecycle transitions produced that result?
- What establishes timely data publication?
- Which trust assumptions are Bitcoin-native and which are not?
- Can a clean node reproduce the result after the original operator disappears?
- What happens under reorg, censorship, data loss, key loss, and conflicting claims?

## 12. Direct answers for the next reviewer

### Is `STATUS.md` this reviewer's document?

No. [`docs/core/STATUS.md`](../core/STATUS.md) predates this review and is declared by
the repository to be the canonical project status document. This reviewer did not
create or edit it.

### What is the most important architectural change?

Create one authoritative composed reducer and prohibit every service from deriving
ownership by any other path.

### What is the most important product change?

Make the first product a narrow, excellent payment-name experience, and display exact
assurance levels rather than a generic green "verified" state.

### What is the most important DA change?

Stop treating matching bytes presented today as proof that they were available at an
earlier anchor height. For mainnet, either keep acquisition L1-authoritative or adopt a
declared witnessed public-log and two-phase activation model.

### Is the current project ready for the private-Signet test?

It is ready for infrastructure and integration testing. It is not yet ready to call the
test a proof of complete ownership semantics until the composed reducer and vertical
lifecycle are wired.

### Is it ready for launch?

No. The remaining work includes consensus composition, DA semantics, current-ownership
proofs, adversarial/reorg testing, production publisher/wallet paths, operational
durability, independent replay/audit, and a frozen activation process.

## 13. Decision packet to put in front of DK

The next architecture meeting should make or explicitly defer these decisions:

1. **DA invariant:** Is strict fresh-node replay more important than the current L1 cost
   target and absence of a DA authority?
2. **Launch acquisition:** L1-authoritative v1, witnessed batched v1, or no mainnet
   activation until a stronger permissionless DA construction exists?
3. **Authority boundary:** Is the reducer the sole source of name state, with all
   existing direct-write paths removed?
4. **Assurance vocabulary:** Approve the five-level proof model and forbid broader
   product claims.
5. **Namespace promise:** Confirm that ONT secures control of a string, not real-world
   identity.
6. **Signet exit:** Approve the single two-node, reorg, contention, and client-verification
   demonstration as the actual milestone.
7. **Mainnet standard:** Confirm that no irreversible launch occurs before a long-lived
   activation candidate, independent reducer/replay, and external audit.

The architecture is salvageable without abandoning the product thesis. The key is to
prefer explicit authority, explicit assurance, and complete state composition over a
cheaper story that the evidence does not actually prove.
