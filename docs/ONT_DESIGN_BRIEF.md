# ONT Design Brief — for Bitcoin reviewers

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

See [`design/ONT_DESIGN_REQUIREMENTS.md`](./design/ONT_DESIGN_REQUIREMENTS.md) and
[`design/ONT_SOVEREIGNTY_MAP.md`](./design/ONT_SOVEREIGNTY_MAP.md).

## 2. Prior art, and why ONT is different

We are not the first to want this. The honest comparison:

- **Namecoin** — the original Bitcoin-adjacent namespace. First-come-free invited
  squatting, merge-mining security is contested, and the chain stagnated. ONT keeps the
  goal but replaces first-come-free with a **sunk gate + long-tail substitutability +
  contested-only auction**, and settles on Bitcoin itself rather than a separate chain.
- **ENS** — excellent UX, but on Ethereum, with **annual rent** (renewal), an increasingly
  L2 footprint (new trust/DA assumptions), and — the deeper issue — **a governing DAO**. The
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
[`design/ONT_ACQUISITION_STATE_MACHINE.md`](./design/ONT_ACQUISITION_STATE_MACHINE.md).

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

## 4. Trust surface and verification

**The surface is deliberately tiny.** Who-owns-what is a deterministic function of Bitcoin,
implemented in a frozen core: `engine.ts` (event replay), `state.ts` (name state), and
`proof-bundle.ts` (portable proofs), over the `@ont/protocol` primitives (names, wire
formats, events, transfer/value/recovery payloads). A CI test
(`packages/consensus/src/trust-surface.test.ts`) **fails the build** if that core grows a
dependency on anything but `@ont/protocol` / `@ont/bitcoin`, or if the package gains a file
outside the documented set — so the surface a newcomer must audit cannot silently grow.
Allocation (auctions), convenience (resolver/indexer), and research/simulation code live
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

## 5. Scaling — the accumulator rail and data availability

Billions of names cannot each be a Bitcoin transaction, so cheap uncontested claims batch:

- **The rail.** Publishers collect claims and apply them as deltas to a sparse-Merkle
  **accumulator**; only the root is anchored on Bitcoin (`prevRoot -> newRoot` in an
  OP_RETURN) — a ~150-byte root regardless of batch size, so the per-name cost falls as batches grow;
  at ~10k claims/batch it is ~0.015 vB/name amortized (the practical cap is data availability, not the
  Merkle structure).
- **Data availability (the crux).** The batch *bytes* must be available for anyone to
  recompute the root. The rule is **fail-closed**: a delta counts toward the canonical root
  only if its bytes surface by a Bitcoin-height-keyed deadline (`anchorHeight + W + C`).
  Bytes that never surface are **excluded, not fatal** — honest nodes converge by dropping
  them. Contested leaves rely on the hard deadline so a withheld claim cannot reappear
  later and steal priority. See
  [`design/ONT_DATA_AVAILABILITY_AGREEMENT.md`](./design/ONT_DATA_AVAILABILITY_AGREEMENT.md).
- **Leaderless multi-publisher.** Distinct-name inserts commute; genuine conflicts resolve
  by deterministic priority (block height, then tx index, then txid). No single publisher
  owns the root. See
  [`research/ONT_MULTI_PUBLISHER_CONVERGENCE.md`](./research/ONT_MULTI_PUBLISHER_CONVERGENCE.md).
- **The gate is enforced, not advisory.** A batch anchor counts only if its Bitcoin
  transaction fee is **≥ the sum of the per-name gates** — so the ₿1,000 cannot be
  batched away, and miners receive ₿1,000 × N. See
  [`design/ONT_ISSUANCE_FEE_MECHANICS.md`](./design/ONT_ISSUANCE_FEE_MECHANICS.md).

**Honest status.** This rail is implemented and unit-tested — `runBatchRail` plus
simulations that assert delta commutativity and convergence against a data-withholding
adversary. But the **live resolver/indexer does not yet consume it**: today it derives
state from single-publisher anchors. Promoting the rail from research into the canonical
indexer is the single largest remaining architecture step, and the DA windows
(`W`, `C`, `K`) are unpinned.

**Publisher payment and trust-minimization.** A publisher bundles many claims and pays the single
aggregate miner fee for the batch, out of payments it has already collected off-chain (Lightning).
v1 uses a **pay-first flow with reputable publishers**: the operator includes a claim only after
payment, and a non-paying claim is simply left out — so the publisher takes **no capital risk** (it
never pays a fee for a claim it hasn't been paid for); the small, bounded risk sits with the *user*.
The residual trust is that a *paid-but-excluded* claimant relies on the operator's reputation
and the L1 fallback. Crucially, **a publisher cannot steal a name**: if it pockets the payment or
commits the wrong owner key, the rightful party **contests on-chain, which forces an auction they
win** — so the worst a bad publisher can do is cost a claimant ~₿1,000 (~$1) and a re-claim, never
take the name. **Atomically binding** the off-chain payment to on-chain inclusion is a
**longer-term research item, not a v1 dependency** — we are deliberately *not* designing v1 around
adaptor-conditional Lightning payments, which are a long-roadmap capability. The trust is **bounded**
either way: a publisher never controls a *name* (ownership remains the owner key + Bitcoin), the
worst it can do is refuse or fail a batch, and a user can always claim directly on L1.

The user's all-in cost is the **₿1,000 gate (sunk, to miners) plus a thin publisher service fee** —
the publisher's marginal per-name cost is single-digit sats (an amortized channel-close + anchor), and
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
batchable through the same rail in the target design. *Pointing or updating* a name (value records)
is fully off-chain and free. So "cheap at scale" describes issuance and updates; trading names is the
part whose throughput depends on the batched rail.

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
[`design/ONT_ACQUISITION_STATE_MACHINE.md`](./design/ONT_ACQUISITION_STATE_MACHINE.md),
[`design/ONT_MEV_ORDERING_ANALYSIS.md`](./design/ONT_MEV_ORDERING_ANALYSIS.md) §D3, and R16 in
[`design/ONT_RISK_REGISTER.md`](./design/ONT_RISK_REGISTER.md).

**Parameters — frozen vs placeholder (be skeptical of the placeholders):**

| Parameter | Value | Status |
| --- | --- | --- |
| `CLAIM_GATE_SATS` | ₿1,000 | Working baseline (revisit only on strong feedback) |
| `AUCTION_BOND_FLOOR_SATS` | ₿50,000 | **Placeholder** — not pinned |
| short-name opening bond (≤4-char) | ₿100,000,000 (≈1 BTC) for 1 char, halving per char | Working baseline; 5+ chars use gate + contention |
| `BOND_MATURITY_BLOCKS` | ~52,560 (~1 yr) | **Test override** — must be frozen pre-launch |
| `DEFAULT_NOTICE_WINDOW_BLOCKS` | 6 (~1 hr) | **Placeholder** — real value is the launch-fairness lever; must be long (weeks) and published |
| DA windows `W`, `C`, `K` | unset | **Unpinned** — reorg-safety + DA deadlines |

These must be frozen and published (ideally checkpointed at genesis) before launch, because
they determine replay behavior. We are deliberately showing them open rather than pretending
they're decided.

## 7. Solved / prototype / open

| Area | State | Notes |
| --- | --- | --- |
| Owner-key model (transfer / value / recovery auth) | **Solved + live** | Enforced at replay; proven on signet; byte-identical across two implementations |
| Minimal frozen trust surface | **Solved** | 3 consensus files CI-locked (no-growth test); the protocol rules they build on are audit surface, pinned by review |
| Returnable-bond contested auction | **Solved + live** | Bid → resolver-accepted end-to-end on signet |
| Bitcoin-inclusion proof verification (Merkle + PoW) | **Solved (verifier)** | Tested vs real mainnet block; producers don't emit inclusion proofs yet |
| Accumulator rail + fail-closed DA + leaderless merge | **Prototype** | Built + unit-tested; **not wired into the live indexer** |
| Publisher | **Prototype** | Single-writer; multi-publisher convergence simulated, not deployed |
| Light-client (phone/browser) verification | **Open** | Verifier ready; emit-side + header sourcing unbuilt |
| Launch parameters (window, maturity, DA, bond floor) | **Open** | Placeholders; must freeze + publish |
| Publisher discovery / censorship resistance | **Open** | Config-only discovery today; direct-L1 self-claim is the fallback |

## 8. Risks and contested choices (with the obvious alternative)

| Choice | Our stance | Alternative a Bitcoin dev might propose |
| --- | --- | --- |
| **OP_RETURN payloads up to ~171 bytes** (recover-owner; most events smaller) | Simpler; we confirmed ONT OP_RETURNs relay + confirm on signet | Hide the root in script via a covenant (e.g. CTV-family) — needs a soft fork, limits to upgraded nodes |
| **Batched rail + DA** vs pure L1 | Required to hit the billions-of-names target (~0.015 vB/name); contested escalate to L1 | Pure L1: every claim a tx (~1 vB/name, 1000× footprint) — simpler, no DA risk, but won't scale |
| **Open ascending auction** | Visible bids, soft close, returnable bond; matches L1 transparency | Sealed second-price — sidesteps MEV/relay-bid timing (see [`design/ONT_MEV_ORDERING_ANALYSIS.md`](./design/ONT_MEV_ORDERING_ANALYSIS.md)) |
| **Bond enforced at ONT-replay, not script** | Simpler; deterrent is "lose the name," sufficient for denial-seekers | Script-level slashing (covenant / presigned penalty) — stronger deterrent, "lose the bitcoin," but a real script construction |
| **Gate fixed in ₿ (drifts in USD)** | No oracle; neutral | USD-peg (oracle, breaks I3) or PoW/burn (no drift, no security-budget contribution) |
| **Cold-start premium-name land-rush** | Long, pre-announced, height-keyed notice window buys time for a competitive early market to form (so premium names aren't swept cheaply) | Decaying launch gate (start high, decay to ₿1,000) — punishes early sweepers uniformly; the leading contingency. Or accept the one-time rush. See [`design/ONT_RISK_REGISTER.md`](./design/ONT_RISK_REGISTER.md) (R7) |
| **Bond can be spent without a valid successor** → name invalidates (reopens to claim) | Effective against a griefer who wants *denial* | Weaker against a pure grief-maximizer; script slashing would punish the coin too |
| **Miner self-issuance** (a miner mines its own anchor fee-free) | Bounded by hashrate share; endemic to Bitcoin (miners already include own txs fee-free) | Accepted; not a unique ONT break |

The deeper adversarial treatment (publisher fee-theft/censorship, eclipse, MEV, DoS) is in
[`research/ONT_ADVERSARIAL_ANALYSIS.md`](./research/ONT_ADVERSARIAL_ANALYSIS.md) and
[`research/ONT_DECENTRALIZATION_AND_DISCOVERY.md`](./research/ONT_DECENTRALIZATION_AND_DISCOVERY.md).

## 9. What we'd most value your feedback on

1. **DA + convergence soundness.** Is the fail-closed height-keyed DA rule correct against
   reorgs and withholding? Are `W`/`C`/`K` the right shape (on-chain availability marker vs.
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

## 10. Deeper references

Canonical: [`ONT.md`](./ONT.md) · [`ONT_ONE_PAGER.md`](./ONT_ONE_PAGER.md) ·
[`core/CURRENT_ARCHITECTURE_BRIEF.md`](./core/CURRENT_ARCHITECTURE_BRIEF.md) ·
[`core/SIMPLIFICATION_AUDIT.md`](./core/SIMPLIFICATION_AUDIT.md)

Design depth: [sovereignty map](./design/ONT_SOVEREIGNTY_MAP.md) ·
[acquisition state machine](./design/ONT_ACQUISITION_STATE_MACHINE.md) ·
[issuance/fee mechanics](./design/ONT_ISSUANCE_FEE_MECHANICS.md) ·
[data-availability agreement](./design/ONT_DATA_AVAILABILITY_AGREEMENT.md) ·
[MEV / ordering](./design/ONT_MEV_ORDERING_ANALYSIS.md) ·
[risk register](./design/ONT_RISK_REGISTER.md) ·
[requirements](./design/ONT_DESIGN_REQUIREMENTS.md)

Research / adversarial: [adversarial analysis](./research/ONT_ADVERSARIAL_ANALYSIS.md) ·
[multi-publisher convergence](./research/ONT_MULTI_PUBLISHER_CONVERGENCE.md) ·
[decentralization + discovery](./research/ONT_DECENTRALIZATION_AND_DISCOVERY.md) ·
[post-quantum / signature agility](./research/POST_QUANTUM_AND_SIGNATURE_AGILITY.md) ·
[prior art: Pubky/Pkarr](./research/ONT_VS_PUBKY_PKARR.md) ·
[open questions for experts](./research/OPEN_QUESTIONS_FOR_EXPERTS.md)

The code: the trust surface is `packages/consensus/src/{engine,state,proof-bundle}.ts` +
`packages/protocol/src/`. Verify with `npm run test -w @ont/consensus` (and `@ont/protocol`,
`@ont/core`).
