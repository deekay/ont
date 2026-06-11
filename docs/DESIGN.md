# ONT Design — for Bitcoin reviewers

> On 2026-06-11, per decision doc-canon (#45) in [`core/DECISIONS.md`](./core/DECISIONS.md), this document absorbed the design brief (`ONT_DESIGN_BRIEF.md`), the sovereignty map (`design/ONT_SOVEREIGNTY_MAP.md`), and the design requirements (`design/ONT_DESIGN_REQUIREMENTS.md`); the requirement-by-requirement code mapping moved to [`spec/CONFORMANCE.md`](./spec/CONFORMANCE.md).

This is the level below the [one-pager](./ONT_ONE_PAGER.md): enough to critique the
design, push on alternatives, and decide whether it's interesting. It is honest about what
is **solved**, what is **prototype**, and what is **open**. The plain-language source of
truth is [`ONT.md`](./ONT.md); deep references are linked inline and listed at the end.

A note on terminology and honesty up front: amounts are written in **₿ where ₿1 = 1
satoshi** (so the claim gate is ₿1,000 ≈ $1). We have tried hard not to overclaim — where
something is simulated rather than running, or designed rather than built, this document
says so.

---

## 1. The problem and the design goals

**The problem.** Give people a short, human-readable name they *own* — transferable,
updatable, and globally unique — without a registrar, a token, recurring rent, or trusting
a server, and settle it on Bitcoin rather than a new chain.

ONT treats five properties as **inviolable invariants**. Everything else (parameters,
auction form, UX) is negotiable; these are the bright lines.

- **I1 — Unambiguous resolution.** A name resolves to exactly one owner, and two honest
  observers never disagree.
- **I2 — Sovereign ownership.** Acquisition is a one-time cost. After that: no rent, no
  renewal, no expiry, no forced sale, no revocation. The owner key controls the name.
- **I3 — Neutrality.** No registrar, editor, or allocator — explicitly including the
  founder. Names are allocated by a fixed mechanical rule, never discretion. No reserved
  lists, no token, no founder pre-grab. Rule changes are **opt-in new versions only**; no
  one can force a new rule on an existing owner.
- **I4 — Verifiable without trust.** A fresh verifier reconstructs *why* a name is owned
  from public data + Bitcoin, without trusting any resolver, operator, or the founder.
- **I5 — Censorship-resistant settlement.** Final ordering and dispute resolution derive
  from Bitcoin, which no ONT party can censor beyond Bitcoin's own assumptions.

The full clean-sheet requirements these invariants come from — functional requirements,
scarcity rules, targets, adversary model, and the priority ordering when they conflict —
are [§10](#10-requirements--the-clean-sheet-constitution) below. The trust-surface /
sovereignty map is [§4](#4-trust-surface-sovereignty-and-verification).

## 2. Prior art, and why ONT is different

We are not the first to want this. The honest comparison:

- **Namecoin** — the original Bitcoin-adjacent namespace. First-come-free invited
  squatting, merge-mining security is contested, and the chain stagnated. ONT keeps the
  goal but replaces first-come-free with a **sunk gate + long-tail substitutability +
  contested-only auction**, and settles on Bitcoin itself rather than a separate chain.
- **ENS** — excellent UX, but on Ethereum, with **annual rent** (renewal), an increasingly
  L2 footprint (new trust/data-availability assumptions), and — the deeper issue — **a governing DAO**. The
  ENS DAO is a token-weighted body that sets pricing/renewal policy and controls the
  registrar and root; it *can change the rules and adjudicate names by vote*. That is a
  centralized decider by another name. ONT has **no governance body**: the rule is
  mechanical, changes are opt-in only, and no committee can re-price, reassign, or
  reinterpret your name. It is Bitcoin-settled and charges **no rent**.
- **BNS / Stacks** — Bitcoin-*adjacent*, but depends on the **Stacks token** and its
  consensus. ONT adds **no token and no new chain**.
- **Handshake (HNS)** — decentralized root-zone/TLD naming with its own proof-of-work coin.
  Different target (top-level domains, not handles) and a separate coin/chain. ONT issues
  handles, adds **no coin**, and settles on Bitcoin.
- **DNS and platform handles** — centralized and revocable by design. ONT has **no
  revocation path** for anyone but the owner.
- **Pkarr / Pubky** — self-sovereign keys publishing records over a DHT. ONT borrows the
  "a key owns its records" idea but adds a **scarce, globally-unique human-readable
  namespace with Bitcoin-ordered uniqueness and contest resolution** — the part a DHT
  alone doesn't give you. See [`research/ONT_VS_PUBKY_PKARR.md`](./research/ONT_VS_PUBKY_PKARR.md).
- **Today's payment / identity handles (Lightning Address, NIP-05, Unstoppable Domains)** —
  the closest existing "name → who gets paid / who is this." They are **domain-bound**
  (Lightning Address and NIP-05 resolve through a DNS domain you don't ultimately control) or
  **sold as NFTs by a company** (Unstoppable). ONT's first use case is the same — a payment
  handle — but neutrally allocated and self-sovereign, not custodial, domain-tied, or for-sale.

**ONT vs. human-readable Bitcoin addresses (BIP-353 / Lightning Address).** ONT replaces the
*naming/lookup* layer, not the payment payload — a name's value record carries the same
BIP-21/BIP-353-shaped bytes a wallet already understands, so a wallet adds ONT support by swapping
the resolution step (the payment-flow code is unchanged):

| | Lightning Address | BIP-353 | ONT |
|---|---|---|---|
| Identifier shape | `alice@domain` | `₿alice@domain` | `alice` (flat) |
| Lookup transport | HTTPS to the domain | DNSSEC TXT record | resolver returns an owner-signed record |
| Authority over the name | domain operator | DNSSEC + domain operator | Bitcoin |
| Record signed by the payee | no | no (DNSSEC signs the zone) | yes |
| Survives losing the domain | no | no | n/a — there is no domain |
| Cost floor | a domain + hosting | a DNSSEC-capable domain | ₿1,000 claim gate + possible bond |

**Why Bitcoin.** Bitcoin supplies neutral global ordering, final settlement, and a security
budget the claim gate pays into. The cost is blockspace discipline (hence batching) and
inheriting Bitcoin's own liveness/censorship assumptions. We think that trade is the whole
point; a reviewer who disagrees is exactly who we want to hear from.

## 3. The model

**Names.** A valid v1 name is a normalized lowercase string matching `[a-z0-9]{1,32}`.

**Owner key.** Each name is controlled by an x-only key. Only the owner key authorizes
transfers, off-chain value records, and recovery setup. No key, no movement. This owner-key
layer is the cleanest, most settled part of the system.

**The acquisition state machine** (one path, branch only on contention):

```
claim (₿1,000 gate, owner pubkey committed)
   -> public notice window
        -> no bond, one claim   -> accumulator finalization -> owner
        -> no bond, >=2 claims   -> nullified (no owner) -> reopens for claiming
        -> a qualifying bond      -> L1 returnable-bond auction -> largest bond wins
                                        -> bonded owner -> (maturity) -> mature owner
   (bond-first: a bond with no prior claim opens the auction directly)
   -> owner key thereafter signs transfer / value records / recovery
```

Acquisition has exactly two outcomes: a cheap claim that **finalizes uncontested**, or the
**winning bond in an auction**. An auction is opened by a **bond** — posted against an existing
claim, or **bond-first** with no prior claim (the natural path for a name you already know is
premium, e.g. `bitcoin`) — *never* by a bare second claim. A bare cheap collision can **nullify** a
name (it reopens for claiming) but can never *take* it. So ordering a cheap claim first buys
nothing — the only way to acquire a contested name is to lock a real returnable bond, identical for
a miner and for everyone else; this closes the former ordering grab (R16) at the root. See
[`spec/ONT_ACQUISITION_STATE_MACHINE.md`](./spec/ONT_ACQUISITION_STATE_MACHINE.md).

**Off-chain records.** What a name *points to* (a Bitcoin/Lightning destination, an HTTPS
target, etc.) is an owner-signed record: sequence-numbered and predecessor-hash-chained
within the current ownership interval, stored and served by resolvers. Mutable updates
never touch Bitcoin.

**Privacy — a name is a public directory entry.** Everything a name points to is public and
crawlable; resolvers serve these records to anyone. That is by design: a name is for what you
*want* public — a payment address (public by nature; it is how you get paid), a website, a
verified profile — not for private contact details (personal email, Signal). Putting sensitive
data behind a public name exposes it, and a less-obvious second name does not help, since all
records are crawlable — obscurity is not privacy. Genuinely private, name-addressable data would
require an **encrypted-records** layer — a payload sealed to chosen recipient keys (Nostr-style
selective disclosure) — layered on top of the public directory. That is a deliberate future
direction, **not v1**: v1 is the public layer, and a prominent name like `marc` is a public
payment/identity handle, which is precisely its value (a canonical, ownable, impersonation-proof
pointer), not a private address book.

**Recovery.** Recovery is owner-armed and **not** revocation: you pre-sign a recovery
descriptor and store it with a chosen backup party; invoking it posts an on-chain request
through a temporary UTXO, and your original key holds a **veto** during a challenge window.
An outsider cannot start it, and you can block it — so recovery can never become a way to
take your name. See [`research/OWNER_KEY_RECOVERY.md`](./research/OWNER_KEY_RECOVERY.md).

## 4. Trust surface, sovereignty, and verification

**The surface is deliberately tiny.** Who-owns-what is a deterministic function of Bitcoin.
The audited core — **to be frozen at launch** (Decision #44) — is `engine.ts` (event
replay), `state.ts` (name state), and `proof-bundle.ts` (portable proofs), over the
`@ont/protocol` primitives (names, wire formats, events, transfer/value/recovery payloads).
Today that boundary implements **owner-key authority and replay validation**; auction
settlement and batched-path finalization are migrating inside per Decisions #42/#44, and
until they land those rules live outside it (see [`core/STATUS.md`](./core/STATUS.md) for
the honest scoped claim). A CI test (`packages/consensus/src/trust-surface.test.ts`)
**fails the build** if the boundary changes without a recorded decision — the allowlist is
the boundary manifest, so the surface a newcomer must audit cannot silently drift.
Allocation policy, convenience (resolver/indexer), and research/simulation code live
*outside* this boundary.

**A fresh verifier** replays Bitcoin transactions carrying ONT events through the engine
and computes name state. No resolver, operator, or founder is in the loop.

**Proof bundles** are the portability layer, and now have two explicit levels:

- `verifyProofBundleStructure` — internal consistency only: ownership chain, value-record
  chain, auction transcript shape, accumulator inclusion shape. A pass means "well-formed
  and self-consistent," **not** "settled on Bitcoin."
- `verifyProofBundleAgainstBitcoin` *(new)* — proves each cited anchor transaction is
  **Merkle-committed by a block header whose double-SHA256 meets the target encoded in its
  own nBits** (real proof-of-work), and optionally pins that header to the canonical chain
  at its claimed height via an injected header source. Unit-tested against a real Bitcoin
  mainnet block (block 170), with tamper tests for both PoW and the Merkle path.

**Honest gap (light clients).** The *verifier* is ready, but producers (wallet, resolver)
do not yet **emit** bundles that carry the `bitcoinInclusion` section, so the
phone/browser light-client path — "trust no resolver; check against Bitcoin headers" — is
not closed end-to-end. Full verifiers are solid today; light-client verification is the
next build, and we'd value a view on whether it's a launch blocker.

### The sovereignty map

**For a newcomer who wants to answer one question: "if I own a name here, can anyone take it from me — and can I check that myself, without trusting anyone?"**

This is the map of the *trust surface*: the small set of rules that make a name yours, and exactly
where each lives in the code. ONT is meant to be read and frozen like a consensus system, not a
product that quietly changes under you — so this surface is deliberately tiny. If you understand the
rules below, you understand the whole sovereignty guarantee. Everything else in the repo (wallets,
indexers, the website, simulations) is convenience that *cannot* take your name.

Status: living map of the v1 sovereignty core, originally dated 2026-05-24.

#### The guarantee in one table

| What you're promised | The rule | Where it lives |
| --- | --- | --- |
| Your name is a fixed, plain string | Names are `[a-z0-9]`, 1–32 chars, normalized to one canonical form | `protocol/names.ts` |
| **Only your key can move your name** | A transfer is valid only if the **current owner's key** signed it | `core/engine.ts` `applyTransfer` + `protocol/events.ts` `verifyTransferAuthorization` |
| One name, one owner | A name already owned cannot be claimed again; state is derived by deterministic replay | `core/engine.ts` (block replay) + `core/state.ts` |
| No rent, no expiry, no forced sale | Nothing in the rules lets anyone reclaim, expire, or seize a name; the bond is returnable | the *absence* of any such rule in `core/engine.ts`; bond math in `protocol/bond.ts` |
| Recovery can't become theft | A name moves via recovery only through a backup **you armed yourself**, and **your main key can veto** it during a challenge window | `protocol/recovery-descriptor.ts`, `recovery-wallet-proof.ts`, `core/engine.ts` `applyRecoverOwner` |
| Bitcoin decides order and finality | Every state change is a Bitcoin transaction; the state is a deterministic replay of Bitcoin, so two honest reviewers always agree | `core/engine.ts` `applyBlockTransactionsWithProvenance` |
| You can prove ownership to anyone | A portable proof bundle lets a fresh verifier check ownership from public data, trusting no server | `core/proof-bundle.ts` |

That's the whole trust surface: **~7 files.** A bad actor's only routes to "take your name" are (1) forge your signature, (2) break Bitcoin's ordering, or (3) find a bug in those files. There is no admin, no registrar, no expiry, no override.

#### The rules, plainly

1. **A name is just a normalized string.** No hidden classes, no reserved lists — `normalizeName` maps any input to one canonical `[a-z0-9]{1,32}` form, so `Alice` and `alice` are the same name and there's no ambiguity about what you own.

2. **Ownership is a key, and only that key can move the name.** Your name's current state names an owner public key. To transfer it, the protocol requires a Schnorr signature from *that* key over the exact transfer (`prevStateTxid`, new owner, …). `applyTransfer` rejects anything else as `transfer_invalid_signature`. No signature from your key ⇒ the name does not move. Full stop.

3. **Uniqueness is enforced by deterministic replay, not by a server's say-so.** Everyone computes the same ownership state by replaying the same Bitcoin transactions in Bitcoin's order. A name that's already owned can't be re-claimed, and two honest nodes never disagree about who owns it.

4. **No rent, no revocation, no forced sale.** Read the rules and notice what's *missing*: there is no code path by which time passes and you lose a name, or by which any party reassigns it. The bond is returnable at maturity (opportunity cost, not a fee), and after maturity the name is held free. Sovereignty here is partly a guarantee about code that **does not exist**.

5. **Recovery is opt-in and can't be turned into theft.** If (and only if) you armed a backup arrangement with your own key, a pre-designated recovery wallet can start moving the name — and that opens a challenge window in which **your main key can cancel it**. No outsider can ever invoke it against you; it's recovery, never revocation. (Decided 2026-05-24: recovery is a first-class feature, with wallets arming a sensible default.)

6. **Bitcoin is the clock and the judge.** ONT adds no new consensus. Ordering and dispute finality come from Bitcoin; ONT clients just replay Bitcoin transactions through the rules above. That's why no ONT party can censor or reorder you beyond Bitcoin's own assumptions.

7. **You can verify your own name.** Ownership is provable with a portable, source-tagged proof bundle that a fresh verifier checks against the public chain — you never have to trust the resolver that handed it to you.

#### How a skeptic verifies a name themselves

1. Take the name and the claimed owner key.
2. Replay the relevant Bitcoin transactions through the rules (`applyBlockTransactionsWithProvenance`) — or check a portable proof bundle with `verifyProofBundle`.
3. Confirm the chain of ownership ends at that key, every transfer along the way carried that-owner's signature, and no conflicting claim exists.
4. You needed no server's permission and no trust in the project — only Bitcoin and these rules.

#### What is **not** in the trust surface (you can ignore it for sovereignty)

- **Resolvers / indexers** — they *serve* answers and replay the rules for convenience, but they can't forge ownership; you verify against Bitcoin. A lying resolver is caught, not obeyed.
- **Wallets, CLI, website** — they help you *build* transactions; they hold no authority over names.
- **Auctions** — they decide *who gets* a contested or premium name (allocation), not whether ownership is sovereign once held. Important, but a separate concern from "can my name be taken."
- **The long-tail batched claim path** (the cheap-issuance path) — additive, more complex, and **separately auditable**; it is being designed so it can never weaken the sovereignty of a name on the bonded core. It is not part of this minimal launch trust surface.
- **Everything labeled a simulation / prototype / experiment** — research that proves properties, not shipped consensus code.

#### Frozen vs. mutable

- **Frozen (this map):** the consensus core — the rules above. Changes here require users to re-extend trust, so they should be rare and exceptional (opt-in only).
- **Mutable:** resolvers, indexers, wallets, the website, tooling, docs, research. These can improve freely because they can't take your name.

#### The package boundary

The core-side trust surface now lives in its own package, **`@ont/consensus`** (`engine.ts`,
`state.ts`, `proof-bundle.ts`), which depends only on `@ont/protocol` and `@ont/bitcoin`. A reviewer
can audit the whole surface by reading that one small package plus the protocol-side rules above; its
entire dependency footprint is visible in `packages/consensus/package.json`. `@ont/core` re-exports it
for convenience, so allocation (auctions), the indexer, and research/simulation code can *consume* the
core but the package boundary makes it physically impossible for the core to import them.

The boundary is also **enforced in code**: `packages/consensus/src/trust-surface.test.ts` fails CI if
the audited core imports anything beyond `@ont/protocol`/`@ont/bitcoin` and its own files, and
`packages/core/src/research-quarantine.test.ts` keeps research a leaf nothing else depends on. So the
trust surface a newcomer must audit cannot silently grow. This realizes
`feedback-freeze-minimal-auditable-core`. See also
[`spec/CONFORMANCE.md`](./spec/CONFORMANCE.md) (the I1–I5 invariants this
surface implements).

## 5. Scaling — the batched claim path and data availability

Billions of names cannot each be a Bitcoin transaction, so cheap uncontested claims batch:

- **The path.** Publishers collect claims and apply them as deltas to a sparse-Merkle
  **accumulator**; only the root is anchored on Bitcoin (`prevRoot -> newRoot` in an
  OP_RETURN) — a ~150-byte root regardless of batch size, so the per-name cost falls as batches grow;
  at ~10k claims/batch it is ~0.015 vB/name amortized (the practical cap is data availability, not the
  Merkle structure).
- **Data availability (the crux).** The batch *bytes* must be available for anyone to
  recompute the root. The rule is **fail-closed**: a delta counts toward the canonical root
  only if its bytes surface by a Bitcoin-height-keyed deadline (`anchorHeight + W + C`).
  Bytes that never surface are **excluded, not fatal** — honest nodes converge by dropping
  them. Contested leaves rely on the hard deadline so a withheld claim cannot reappear
  later and steal priority. The *witnessing* (an on-chain availability marker, Bitcoin-timed) is
  settled; the **transport** — how the bytes are served and mirrored — is the live open call,
  with content-addressed/marker-committed bytes (publisher-served + anyone-mirrorable, not
  consensus-critical) as the working direction and a **core area flagged for feedback**. See
  [`spec/ONT_DATA_AVAILABILITY_AGREEMENT.md`](./spec/ONT_DATA_AVAILABILITY_AGREEMENT.md) (§8b transport).
- **Leaderless multi-publisher.** Distinct-name inserts commute; genuine conflicts resolve
  by deterministic priority (block height, then tx index, then txid). No single publisher
  owns the root. See
  [`research/ONT_MULTI_PUBLISHER_CONVERGENCE.md`](./research/ONT_MULTI_PUBLISHER_CONVERGENCE.md).
- **The gate rule (designed; not yet enforced in code).** The rule is that a batch anchor
  counts only if its Bitcoin transaction fee is **≥ the sum of the per-name gates** — so the
  ₿1,000 cannot be batched away, and miners receive ₿1,000 × N. As of 2026-06-10 this
  validation is **not yet implemented** in the replay/consensus path (the live signet
  publisher pays a flat configured anchor fee); implementing it inside the audited boundary
  is queued work. See
  [`spec/ONT_ISSUANCE_FEE_MECHANICS.md`](./spec/ONT_ISSUANCE_FEE_MECHANICS.md) and the
  Known-incomplete list in [`core/STATUS.md`](./core/STATUS.md).

**Honest status.** The path is **live end-to-end on the private signet** (since
2026-06-09): a claim is batched, anchored on-chain, and the indexer re-verifies every
membership proof against the Bitcoin-anchored root before a name resolves —
verify-don't-trust at every hop, with `runBatchRail` simulations additionally asserting
delta commutativity and convergence against a data-withholding adversary. What is **not**
live is the adversarial half: the fail-closed data-availability deadline (the availability marker and the
data-availability windows) is enforced only in design and simulation, transport is
publisher-served v1 (content-addressed mirroring is the working direction), multi-publisher
convergence is simulated but not deployed, and the windows themselves are unpinned.
Enforcing the deadline rule in the live path is the sharpest remaining architecture step.

**Publisher payment and trust-minimization.** A publisher bundles many claims and pays the single
aggregate miner fee for the batch, out of payments it has already collected off-chain (Lightning).
v1 uses a **pay-first flow with reputable publishers**: the operator includes a claim only after
payment, and a non-paying claim is simply left out — so the publisher takes **no capital risk** (it
never pays a fee for a claim it hasn't been paid for); the small, bounded risk sits with the *user*.
The residual trust is that a *paid-but-excluded* claimant relies on the operator's reputation
and the L1 fallback. Crucially, **a publisher cannot assign ownership by fiat**: ownership is
decided by Bitcoin-ordered events and the owner key, never by the publisher's word — a batch is
data the publisher *produces*, not authority it holds. If a publisher pockets a payment or commits
the wrong owner key, the rightful party's recourse is on-chain: re-claim, or contest with a bond,
where allocation follows the normal largest-qualifying-bond rule. The worst case is **bounded** —
losing the ~₿1,000 (~$1) gate/service fee plus the work of re-claiming or contesting — and the
misbehavior is publicly visible. The trust story is bounded harm + reputation + on-chain recourse,
not cryptographic impossibility of publisher misbehavior. **Atomically binding** the off-chain payment to on-chain inclusion is a
**longer-term research item, not a v1 dependency** — we are deliberately *not* designing v1 around
adaptor-conditional Lightning payments, which are a long-roadmap capability. The trust is **bounded**
either way: a publisher never controls a *name* (ownership remains the owner key + Bitcoin), the
worst it can do is refuse or fail a batch, and a user can always claim directly on L1.

The user's all-in cost is the **₿1,000 gate (sunk, to miners) plus a thin publisher service fee** —
the publisher's marginal per-name cost is single-digit ₿ (an amortized channel-close + anchor), and
any markup is capped by the direct-L1 alternative (≈₿1,000 at low fee rates), so the fee stays thin.
**v1 starts with a few reputable publishers and minimizes this trust over time.**

**Operator roles and packaging.** ONT has exactly two service roles, both unprivileged — neither
decides ownership; Bitcoin does. A **publisher** is the *write-side*: it accepts paid claims (Lightning),
batches them, broadcasts the anchor, and serves receipts/inclusion proofs. A **resolver** (indexer) is
the *read-side*: it replays Bitcoin-derived state and serves ownership + owner-signed value records.

| | Publisher | Resolver |
| --- | --- | --- |
| Side | Write | Read |
| Payment rail (Lightning) | Required | Not required |
| On-chain funds / liquidity | Required (anchor broadcast) | Not required |
| Bitcoin node | Required | Required |
| Storage | Batch data + receipts | Full indexed state |
| Uptime profile | Burstable (per batch cycle) | Continuous |
| Decides ownership | **No** (Bitcoin does) | **No** (Bitcoin does) |
| Client trust model | Trust-on-use, on-chain recourse | Verify-don't-trust |

The roles stay **separate at the protocol/API layer** but ship **bundled as one operator stack**
(publisher + resolver + indexer + archive in a single deployable). Bundling is operational convenience,
not protocol coupling: a wallet can claim through publisher A, verify against resolver B, compare
resolvers C/D, or self-host either piece. Operator sets overlap but differ — wallets / exchanges / LN
providers / app platforms tend to run **both**; block explorers, researchers, and independent verifiers
run **resolver-only**; a high-volume onboarding funnel might run **publisher-only** and hand lookups off
to public resolvers.

**The ~0.015 vB/name figure is issuance only.** It is the amortized cost of *getting* a name.
Ongoing **transfers** are a separate load: a bonded name's transfer must carry its bond UTXO forward
(necessarily L1), and a mature/accumulator transfer is an owner-signed event that is L1 today and
batchable through the same path in the target design. *Pointing or updating* a name (value records)
is fully off-chain and free. So "cheap at scale" describes issuance and updates; trading names is the
part whose throughput depends on the batched claim path.

## 6. Economics

**The claim gate.** ₿1,000 per name, **sunk**, paid to miners. It keeps spam and squatting
expensive without charging rent, and contributes to Bitcoin's security budget instead of
enriching the project. It is **fixed in bitcoin** (no oracle), so its USD value drifts with
the BTC price. The alternatives we weighed: a USD peg needs a trusted price feed (breaks
neutrality, I3); a PoW/burn gate avoids drift and is arguably the cleaner neutrality story
but forfeits the security-budget contribution and a censorship fallback. **Current stance:
miner-fee gate, drift accepted** — and explicitly up for debate.

**The bond (contested names only).** The auction is backed by *returnable* bonds: a bidder
locks bitcoin **they still own** (a plain owner-controlled UTXO). The winner **becomes owner —
and can point and transfer the name — the moment the auction settles**; the bond simply stays
locked until maturity and is then released, so the ~1-year maturity is a *capital* lockup, not a
gate on using the name. The cost is liquidity/opportunity, not a burn or a payment to anyone.
Bond continuity is enforced at consensus-replay time (ONT-level), not by Bitcoin script.

**Bond-first / the escalation trigger.** An auction is opened by a **bond**, not a bare second
claim — posted against an existing in-window claim, or *bond-first* with no prior claim (the
natural path for a name you already know is premium, e.g. `bitcoin`). A bare cheap collision can
only **nullify** a name (it resolves to no owner and reopens for claiming), never award it. This is
what makes ordering worthless for acquisition: front-running a cheap claim can at most *deny*
(₿1,000, no payoff), while *taking* a contested name requires locking a real returnable bond —
identical cost for a miner and for anyone else, which closes the former ordering grab (R16). The
≤4-char opening bonds are the *mandatory* bond-first case of this one mechanism, and the ₿50,000
escalation floor (the cost to open/contest an auction) graduates from placeholder to a real launch
decision. See
[`spec/ONT_ACQUISITION_STATE_MACHINE.md`](./spec/ONT_ACQUISITION_STATE_MACHINE.md),
the MEV & ordering analysis (§D3) and R16 in
[`RISKS.md`](./RISKS.md).

**Parameters — frozen vs placeholder (be skeptical of the placeholders):**

| Parameter | Value | Status |
| --- | --- | --- |
| `CLAIM_GATE_SATS` | ₿1,000 | Working baseline (revisit only on strong feedback) |
| `AUCTION_BOND_FLOOR_SATS` | ₿50,000 | **Placeholder** — not pinned |
| short-name opening bond (≤4-char) | ₿100,000,000 (≈1 BTC) for 1 char, halving per char | Working baseline; 5+ chars use gate + contention |
| `BOND_MATURITY_BLOCKS` | ~52,560 (~1 yr) | **Test override** — must be frozen pre-launch |
| `DEFAULT_NOTICE_WINDOW_BLOCKS` | 6 (~1 hr) | **Placeholder** — real value is the launch-fairness lever; must be long (weeks) and published |
| Data-availability windows | unset | **Unpinned** — reorg-safety + data-availability deadlines |

These must be frozen and published (ideally checkpointed at genesis) before launch, because
they determine replay behavior. We are deliberately showing them open rather than pretending
they're decided.

## 7. Solved / prototype / open

| Area | State | Notes |
| --- | --- | --- |
| Owner-key model (transfer / value / recovery auth) | **Solved + live** | Enforced at replay; proven on signet; byte-identical across two implementations |
| Minimal audited trust surface (frozen at launch) | **Boundary enforced; scope expanding** | 3 consensus files CI-manifested (Decision #44), covering owner-key authority + replay validation today; settlement and batched-path rules are moving inside (#42). The protocol rules they build on are audit surface, pinned by review |
| Returnable-bond contested auction | **Solved + live** | Bid → resolver-accepted end-to-end on signet |
| Bitcoin-inclusion proof verification (Merkle + PoW) | **Solved (verifier)** | Tested vs real mainnet block; producers don't emit inclusion proofs yet |
| Batched claim path (claim → anchor → verified resolve → explore) | **Live (signet)** | End-to-end since 2026-06-09, verify-don't-trust at every hop; **open: fail-closed data-availability deadline enforcement (sim-only today), content-addressed mirroring (§8b), leaderless multi-publisher** |
| Publisher | **Prototype** | Single-writer; multi-publisher convergence simulated, not deployed |
| Light-client (phone/browser) verification | **Open** | Verifier ready; emit-side + header sourcing unbuilt |
| Launch parameters (window, maturity, data availability, bond floor) | **Open** | Placeholders; must freeze + publish |
| Publisher discovery / censorship resistance | **Open** | Config-only discovery today; direct-L1 self-claim is the fallback |

## 8. Risks and contested choices (with the obvious alternative)

| Choice | Our stance | Alternative a Bitcoin dev might propose |
| --- | --- | --- |
| **OP_RETURN payloads up to ~171 bytes** (recover-owner; most events smaller) | Simpler; we confirmed ONT OP_RETURNs relay + confirm on signet | Hide the root in script via a covenant (e.g. CTV-family) — needs a soft fork, limits to upgraded nodes |
| **Batched claim path + data availability** vs pure L1 | Required to hit the billions-of-names target (~0.015 vB/name); contested escalate to L1 | Pure L1: every claim a tx (~1 vB/name, 1000× footprint) — simpler, no data-availability risk, but won't scale |
| **Open ascending auction** | Visible bids, soft close, returnable bond; matches L1 transparency | Sealed second-price — sidesteps MEV/relay-bid timing (see the MEV & ordering analysis in [`RISKS.md`](./RISKS.md)) |
| **Bond enforced at ONT-replay, not script** | Simpler; deterrent is "lose the name," sufficient for denial-seekers | Script-level slashing (covenant / presigned penalty) — stronger deterrent, "lose the bitcoin," but a real script construction |
| **Gate fixed in ₿ (drifts in USD)** | No oracle; neutral | USD-peg (oracle, breaks I3) or PoW/burn (no drift, no security-budget contribution) |
| **Cold-start premium-name land-rush** | Long, pre-announced, height-keyed notice window buys time for a competitive early market to form (so premium names aren't swept cheaply) | Decaying launch gate (start high, decay to ₿1,000) — punishes early sweepers uniformly; the leading contingency. Or accept the one-time rush. See [`RISKS.md`](./RISKS.md) (R7) |
| **Bond can be spent without a valid successor** → name invalidates (reopens to claim) | Effective against a griefer who wants *denial* | Weaker against a pure grief-maximizer; script slashing would punish the coin too |
| **Miner self-issuance** (a miner mines its own anchor fee-free) | Bounded by hashrate share; endemic to Bitcoin (miners already include own txs fee-free) | Accepted; not a unique ONT break |

The deeper adversarial treatment (publisher fee-theft/censorship, eclipse, MEV, DoS) is in
the whole-system threat model in [`RISKS.md`](./RISKS.md) and
[`research/ONT_DECENTRALIZATION_AND_DISCOVERY.md`](./research/ONT_DECENTRALIZATION_AND_DISCOVERY.md).

## 9. What we'd most value your feedback on

1. **Data availability + convergence soundness.** Is the fail-closed height-keyed data-availability rule correct against
   reorgs and withholding? Are the data-availability windows the right shape (on-chain availability marker vs.
   pure timing)?
2. **On-chain footprint + relay.** Are ~171-byte OP_RETURN ONT events acceptable as a
   prototype baseline, or is the standardness/relay/datacarrier story a real obstacle on
   mainnet — and is a script/covenant carrier worth the soft-fork dependency?
3. **Light-client verification.** Launch blocker or post-launch? What's the minimum honest
   bar — Merkle+PoW proof bundles emitted end-to-end, or resolver-set fanout with
   disagreement detection?
4. **Auction form.** Open ascending vs sealed second-price for contested names, given MEV
   and relay-bid timing?
5. **Bond enforcement.** Is ONT-level bond continuity enough, or does launch need
   script-level slashing — and what's the cleanest Bitcoin construction if so?
6. **Launch fairness.** Is a long notice window enough against a day-one premium-name
   land-rush, or is a decaying launch gate worth the extra rule?
7. **The gate itself.** Miner-fee vs PoW-burn vs something else — which best serves
   neutrality + a real anti-spam floor without an oracle?

We are explicitly **not** asking you to pick the final auction window, bond floor, or
settlement duration — those stay provisional. We are asking whether the **architecture** is
sound and where it's weakest.

## 10. Requirements — the clean-sheet constitution

Status: foundational requirements, written deliberately without anchoring on any
existing ONT solution. The purpose is to judge candidate designs against fixed
criteria instead of defending prior research. A design either satisfies these or
it does not.

Convention: **Invariants** are non-negotiable (a violation kills the design).
**Aims** are strong preferences we optimize for but may flex. **Targets** are
quantified goals. Each requirement states, where useful, how we would know it is
violated.

**The requirement-by-requirement mapping of the current design (and code) against this
section is [`spec/CONFORMANCE.md`](./spec/CONFORMANCE.md).**

### 10.1 Purpose

ONT is a system of **human-readable payment/destination handles**. A user must
be able to name a person, agent, organization, service, or device and be
confident the name resolves to the one correct destination its owner controls.

The naming of a destination must be:

- meaningful to humans (memorable strings)
- owned, not rented
- resolvable by anyone without permission
- verifiable without trusting the party that answered

### 10.2 Actors

| Actor | Job | Can be malicious? |
| --- | --- | --- |
| Claimer | Acquires a name. | Yes |
| Owner | Holds the owner key; controls the name and its destination record. | Yes |
| Sender / resolver-user | Looks up a name to reach a destination. | No (the party we protect) |
| Resolver / indexer | Serves lookups and evidence; replays rules. | Yes |
| Verifier | Independently checks a proof of ownership. | Honest, possibly partial data |
| Adversary | Squatter, griefer, censor, equivocator, Sybil, data-withholder. | Yes |
| Bootstrap operator | Early scaffolding infrastructure (see §10.9). | Yes |

### 10.3 Functional Requirements

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

### 10.4 Hard Invariants

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
  party can mint scarcity and hand it out. (Bounded bootstrap exceptions: §10.9.)
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

### 10.5 Scarcity and Cost Model

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

### 10.6 Aims (Strong but Flexible)

- **A1 — Flat namespace.** Names are a single flat string space (`alice`, not
  `alice@thing`), for aesthetics and simplicity. Flex only if the math forces
  it; if flexed, the result must still satisfy I1–I5.
- **A2 — Low cost for ordinary names.** Long-tail names should be cheap enough
  for mass, casual use.
- **A3 — Simplicity.** Prefer designs a careful user and a fresh verifier can
  understand.

### 10.7 Scale and Cost Targets (proposed — confirm)

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

### 10.8 Adversary Model

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

### 10.9 Bootstrap-Compromise Acceptance Test

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
rule as everyone (satisfies #5). (b) **the data-availability server is temporary** — the founder's
data-availability server is sunset-bound scaffolding with a stated end condition (e.g.
"until enough independent operators run them"), never a permanent dependency (satisfies #1, #3).

### 10.10 Non-Goals

- Not a general smart-contract platform.
- Not a store of mutable bulk data on Bitcoin.
- Not a new currency or token.
- Not a hierarchical/DNS-style delegated namespace (unless A1 is flexed).
- Not reliant on any non-Bitcoin chain for security or scarcity.

### 10.11 Priority Ordering When Requirements Conflict

When goals collide, resolve in this order:

1. **Co-equal hard invariants (never sacrificed):** I3 Neutrality, I2
   Sovereignty, I1 Uniqueness, I4 Verifiability, I5 Bitcoin settlement.
2. **Then flex, in order:** Bitcoin-only scarcity purity (relax toward PoW
   before anything else) → A1 Flat namespace → A3 Simplicity.
3. **Scale (T1–T3) is the objective we maximize subject to the above** — not a
   reason to breach an invariant.

### 10.12 Implications for the Solution Space (derived, not requirements)

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

### 10.13 Open Questions To Settle Next

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

## 11. Deeper references

Canonical: [`ONT.md`](./ONT.md) · [`ONT_ONE_PAGER.md`](./ONT_ONE_PAGER.md) ·
[`core/ARCHITECTURE.md`](./core/ARCHITECTURE.md) ·
[simplification audit (archived)](./research/archive/SIMPLIFICATION_AUDIT.md)

Design depth: [sovereignty map (§4)](#4-trust-surface-sovereignty-and-verification) ·
[requirements (§10)](#10-requirements--the-clean-sheet-constitution) ·
[requirements conformance](./spec/CONFORMANCE.md) ·
[acquisition state machine](./spec/ONT_ACQUISITION_STATE_MACHINE.md) ·
[issuance/fee mechanics](./spec/ONT_ISSUANCE_FEE_MECHANICS.md) ·
[data-availability agreement](./spec/ONT_DATA_AVAILABILITY_AGREEMENT.md) ·
[MEV / ordering](./RISKS.md) ·
[risk register](./RISKS.md)

Research / adversarial: [adversarial analysis](./RISKS.md) ·
[multi-publisher convergence](./research/ONT_MULTI_PUBLISHER_CONVERGENCE.md) ·
[decentralization + discovery](./research/ONT_DECENTRALIZATION_AND_DISCOVERY.md) ·
[post-quantum / signature agility](./research/POST_QUANTUM_AND_SIGNATURE_AGILITY.md) ·
[prior art: Pubky/Pkarr](./research/ONT_VS_PUBKY_PKARR.md) ·
[open questions for experts](./OPEN_QUESTIONS.md)

The code: the trust surface is `packages/consensus/src/{engine,state,proof-bundle}.ts` +
`packages/protocol/src/`. Verify with `npm run test -w @ont/consensus` (and `@ont/protocol`,
`@ont/core`).
