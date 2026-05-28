# Adversarial analysis — whole-system threat model

Status: design note, not frozen. A working inventory of how ONT can be
attacked, griefed, or degraded across all four surfaces — the cheap rail,
the publisher, the resolver, and the auction — plus a prominent section on
launch-fairness, which is the threat with the shortest fuse. Each entry names
the attack, what it costs the attacker, what defends against it today (with a
code or doc reference), and where the residual gap is. Items marked **GAP**
have no current defense in the code.

Companions:
- `ONT_CONTEST_WINDOW_PHILOSOPHY.md` — the contest/notice window and bond
  forfeiture, in depth. This note references it rather than repeating it.
- `ONT_MULTI_PUBLISHER_CONVERGENCE.md` — convergence under more than one
  publisher; the source of several defenses cited below.
- `ONT_DECENTRALIZATION_AND_DISCOVERY.md` — how publishers/resolvers
  decentralize and how clients find them; the home of the discovery and
  light-client gaps named here.

## What we trust, and what we do not

The point of writing this down is to keep the trust boundary honest. ONT
inherits Bitcoin's security for *ordering and timestamping* and nothing more.

Trusted:
- **Bitcoin consensus.** Block ordering, proof-of-work, the UTXO set, and the
  OP_RETURN bytes in confirmed transactions. If an attacker can reorg Bitcoin
  at will, ONT is the least of anyone's problems.
- **The hash functions and signature scheme** ONT commits to (sha256 leaves,
  the owner-key signatures verified in `@ont/protocol`).
- **The frozen consensus rules** in `@ont/consensus` — the same bytes produce
  the same name state for everyone who runs them.

NOT trusted:
- **Any publisher.** A publisher batches claims and anchors them; it is a
  convenience, not an authority. It can withhold, censor, equivocate, or
  vanish. The client re-verifies everything (see below).
- **Any resolver.** A resolver mirrors Bitcoin-derived state over HTTP; it can
  lag, lie, or be eclipsed. Nothing it says is authoritative on its own.
- **Network reachability.** DNS, the open ports a publisher/resolver listens
  on, and the path to them are all attacker-influenceable.
- **The set of eyes watching at launch.** This is the one trust assumption ONT
  *wants* to hold (an honest claimant will notice and contest a theft) but
  cannot enforce, and it is weakest exactly when capture is most valuable —
  the opening days. That is why launch-fairness gets its own section.

The recurring theme: **ONT name state is a deterministic function of Bitcoin.**
Every defense that works, works because a client can recompute the answer from
Bitcoin itself and refuse to trust an intermediary's claim. Every gap that
remains is a place where a client currently trusts an intermediary instead of
recomputing.

## Surface 1 — the cheap rail (claiming)

### 1.1 Launch capture — a whale claims the top N names before anyone is watching

The flagship threat. One actor with ₿-denominated patience pays the flat
₿1,000 gate on the top 100,000 brands/handles in the opening days, betting
that the real owners are not watching and do not have coin out of cold storage
to contest in time.

- **Cost to attacker:** ₿1,000 per name (to miners) × N. Cheap by design — the
  gate is anti-spam, not a price signal.
- **Defense today:** the notice/contest window. A cheap claim is *provisional*,
  not owned (`feb653a` made the wallet honest about this; `batch-rail.ts`
  classifies `provisional` vs `final`). A real owner who notices inside the
  window contests, which escalates the name to a bonded second-price auction —
  the whale does not get a free steal, they have to *win an auction* against
  the legitimate owner.
- **Residual gap:** the defense is only as good as the window length and the
  odds the real owner is watching. At launch both are adversarial — see
  `ONT_CONTEST_WINDOW_PHILOSOPHY.md`, which argues for a long launch window
  decaying to a steady-state floor, and the launch-fairness section below.
- **The trap to avoid:** keying "is the market ready" off any market-derived
  signal (total value bonded, distinct bidders), because at launch the whale
  *is* the market and controls that signal. The window schedule must be
  frozen, monotonic, and height-keyed.

### 1.2 Sybil-contest griefing — force a victim's claim to auction with a throwaway claim

Contesting is permissionless, and the "is this contested" check keys on
*distinct delta id*, not real-world identity (`batch-rail.ts`: a name with ≥2
distinct in-window claimants escalates). So one actor can anchor a second
claim for a victim's name under a throwaway id and force the name out of the
cheap path into the bonded auction.

- **Cost to attacker:** one extra ₿1,000 gate per griefed name, *plus* — and
  this is the saving grace — they then have to actually post a bond and win the
  auction to take the name. Forcing the auction is not a steal; it converts a
  ₿1,000 grief into "now we both bid." This is encoded as a documenting test
  in `batch-rail.test.ts` ("escalation keys on distinct delta ids, so a Sybil
  claimant can force a provisional name to L1").
- **Defense today:** the cost asymmetry (the griefer pays the gate and gains
  nothing unless they outbid) plus the bonded auction's own economics.
- **Residual gap:** the *harm* is not a lost name — it is friction. A
  sufficiently funded griefer can force every claim into an auction, taxing
  honest claimants' time and forcing them to keep bidding capital warm. At
  launch this compounds the capture problem: an attacker who cannot quietly
  capture names can at least make claiming them expensive and slow for
  everyone. Worth naming as a known cost, per
  `ONT_MULTI_PUBLISHER_CONVERGENCE.md`'s "griefing bound" section.

### 1.3 Claim front-running — see a pending claim and beat it

A publisher (or a miner, or anyone watching the mempool/quote traffic) sees a
claim for a desirable name and races their own in first.

- **Defense today:** under the one-path model this does not hand the
  front-runner the name. Two claims for the same name inside the window =
  contested = auction. Front-running a cheap claim only *triggers the auction*,
  it does not win it. Commit-priority ordering (`(height, txIndex, txid)`)
  decides who is "first" only among uncontested claims, where it does not
  matter because there is no competition.
- **Residual gap:** a publisher uniquely positioned to see quote traffic before
  it is anchored has an information advantage for *deciding what to contest*.
  This is a publisher-trust issue, handled in surface 2. The MEV/ordering half
  lives in `docs/design/ONT_MEV_ORDERING_ANALYSIS.md`.

## Surface 2 — the publisher

The publisher is a thin batching service (`apps/publisher`). It quotes a price,
takes a Lightning payment for the gate, batches claims, anchors an OP_RETURN
committing `prevRoot -> newRoot`, and serves inclusion proofs. The client
(`apps/wallet/src/publisher-client.ts`) independently re-derives the leaf
(`sha256(name)`), checks `ownerCommitment === owner key`, and verifies the
inclusion proof against the accumulator. So the publisher cannot forge
ownership. What it *can* do:

### 2.1 Withholding / withhold-then-reveal name theft

Anchor a claim on-chain but withhold the batch bytes, then reveal them later to
retroactively "win" a name against a competitor who could not see the claim in
time.

- **Defense today:** the DA filter, fail-closed. `da-convergence-sim.ts`
  requires an availability marker mined by `anchorHeight + W` and the bytes
  surfacing by `+ W + C`; a delta that was not actually available is *excluded*,
  not treated as canonical. `runBatchRail` only counts DA-valid deltas. A
  documenting test ("a withheld competing claim cannot force a contest")
  confirms a withheld claim cannot even trigger an escalation. This is the
  defense the convergence note calls out as "what defeats withhold-then-reveal
  name theft."
- **Residual gap:** the DA windows (`W`, `C`, `K`) are parameters; if set too
  short an attacker with marginal network control could still race the
  availability marker. They must be chosen conservatively and decoupled from
  the notice window (see philosophy note, "do not couple the contest window to
  the DA confirm-depth").

### 2.2 Equivocation — anchor one thing, serve another

Commit `newRoot` on-chain but serve different batch bytes off-chain to
different clients.

- **Defense today:** `newRoot = root(prevRoot ⊕ delta)` is a *DA binding*. An
  indexer that fetches the published batch leaves and recomputes `newRoot`
  rejects the anchor if it does not match (`ONT_MULTI_PUBLISHER_CONVERGENCE.md`,
  "what are prevRoot/newRoot for"). So a publisher cannot serve bytes that
  disagree with what it anchored without detection by anyone who checks.
- **Residual gap:** detection requires *someone* to fetch the bytes and
  recompute. A wallet that trusts a single publisher's inclusion proof without
  cross-checking against the canonical root (the honest correctness gap the
  convergence note flags) would not notice. The fix is the canonical-root
  re-check before recording a name as owned — built in the classifier, not yet
  wired end-to-end in the wallet.

### 2.3 Censorship — refuse to batch a name

A publisher simply declines to quote or anchor a particular name (political
target, a name it wants for itself, a competitor's brand).

- **Defense today:** discovery is config-only (`ONT_PUBLISHER_URL`), so the
  intended answer is "use another publisher." Anyone can run one; the protocol
  privileges none.
- **Residual gap (GAP):** there is no second publisher to fall back to in
  practice yet, and **no discovery mechanism to find one** — see
  `ONT_DECENTRALIZATION_AND_DISCOVERY.md`. Censorship-resistance is a *claim*
  the architecture supports but the deployment does not yet deliver, because
  every test and smoke runs a single publisher
  (`ONT_MULTI_PUBLISHER_CONVERGENCE.md`, "why this is worth doing now"). Until
  multi-publisher coexistence is real, a censoring publisher is a single point
  of failure for the cheap rail.

### 2.4 Denial of service — no rate-limiting

`apps/publisher` has no rate-limiting or anti-DoS. An attacker floods quote/
submit endpoints and takes the publisher offline.

- **Defense today:** none in code. The gate is paid in Lightning *before* a
  claim is anchored, which bounds the cost of actually *filling batches* with
  spam, but the quote and read endpoints are unmetered.
- **Residual gap (GAP):** standard service-hardening (rate limits, proof-of-
  work or paid quotes, connection limits) is unbuilt. This is operational, not
  protocol — but it interacts with censorship: knocking out the one reachable
  publisher *is* censorship of the whole cheap rail until discovery + multiple
  publishers exist.

### 2.5 Quote/anchor race — name taken between quote and payment

A client pays the gate for a name that becomes final on a competing anchor
before its own claim lands.

- **Defense today:** the convergence note's per-leaf loss detection —
  `dropped_existing` → refund. The publisher is supposed to detect this at
  finalization and refund the gate.
- **Residual gap:** per-leaf loss detection + refund is *specified* in
  `ONT_MULTI_PUBLISHER_CONVERGENCE.md` (publisher behavior item 3) but is part
  of the not-yet-wired Model-B consumption. Today a single publisher building
  on its own accumulator mostly avoids the race by construction, but that is an
  artifact of single-writer deployment, not a guarantee.

### 2.6 Fee theft / non-delivery

Take the Lightning payment and never anchor, or anchor and never serve the
proof.

- **Defense today:** the payment is for a *gate*, and the client verifies
  inclusion against Bitcoin. A publisher that takes payment and does not anchor
  produces no inclusion proof, so the client knows it did not get what it paid
  for and does not record ownership. The harm is a lost ₿1,000 gate, not a lost
  name.
- **Residual gap:** no automatic refund path for "paid but never anchored"
  beyond the per-leaf detection above; recourse is "stop using that publisher."
  Bounded-loss (the gate) by design, but a reputation/accountability layer is
  absent.

## Surface 3 — the resolver

A resolver (`apps/resolver`) is an independent `@ont/consensus` mirror over
Bitcoin (RPC / Esplora / fixture) that answers lookups over HTTP. It holds no
authority — ownership is verified against Bitcoin, not against it
(`apps/wallet/src/resolver.ts` header). Discovery is config-only
(`ONT_RESOLVER_URL` / `ONT_RESOLVER_URLS`).

### 3.1 Lag — a resolver serves a stale view

A resolver behind on blocks reports an old owner or misses a recent claim.

- **Defense today:** multi-resolver fanout. `apps/web/src/resolver-fanout.ts`
  (`fetchNameValueHistoryFromResolvers`) queries every configured resolver and
  classifies the set as `consistent | lagging | conflict | all_missing`,
  picking the longest history as canonical and flagging the rest as lagging.
  A lagging resolver is detected and down-ranked.
- **Residual gap:** "longest history wins" is a *liveness* heuristic, not a
  *correctness* proof — it assumes the most-advanced resolver is honest. A
  resolver that fabricates a longer history is treated as canonical until it
  contradicts another (see 3.2).

### 3.2 Equivocation / conflict — resolvers disagree

Two resolvers return different owners, different value-record histories, or
forked chains for the same name.

- **Defense today:** the fanout *detects* this — `classifyValueHistoryCompatibility`
  returns `conflict` on mismatched `ownershipRef`, mismatched record hashes at
  the same sequence, or any history with gaps/forks, and the summary status
  becomes `conflict`. So a client is *warned*.
- **Residual gap (GAP — the big one):** detection is not adjudication. The
  fanout can tell you the resolvers disagree but **cannot tell you which one is
  right**, because it does no cryptographic light-client verification against
  Bitcoin. It picks canonical by history *length*, not by checking the OP_RETURN
  anchors and inclusion proofs against Bitcoin headers. A client facing a
  `conflict` has no trustless way to resolve it from resolver data alone — it
  must go to Bitcoin itself. This is the single most important gap in the
  system and the core of `ONT_DECENTRALIZATION_AND_DISCOVERY.md`: ONT state is
  a deterministic function of Bitcoin, so the *right* design is a light-client
  proof bundle a wallet can verify against block headers, reducing resolver
  choice to a liveness problem. That verification path is not built.

### 3.3 Eclipse — feed a client only attacker-controlled resolvers

If an attacker controls a victim's configured resolver list (compromised
config, malicious default, DNS/network control), every "independent" resolver
is the same adversary and the fanout's disagreement detection sees false
unanimity.

- **Defense today:** none specific. Fanout assumes the configured set is
  genuinely independent.
- **Residual gap (GAP):** without (a) a trustless discovery mechanism that is
  not itself attacker-controlled and (b) light-client verification against
  Bitcoin, an eclipsed client is fully deceived. The eclipse is defeated the
  moment the client verifies against Bitcoin headers it obtained independently
  — which loops back to 3.2's gap. Discovery and verification are the same
  problem wearing two hats.

## Surface 4 — the auction (escalation)

The auction is reached *only* by escalation from a contested cheap claim
(`ONT.md` one-path model). It is a bonded second-price L1 auction. Bonds are an
ONT-level designation over a plain `payment` output — **not** a Bitcoin script
construct (no HTLC/CLTV/CSV/covenant); enforced by `@ont/consensus`
(`invalidateBrokenBondContinuity`), not by Bitcoin script. See the philosophy
note's "the bond is ONT-enforced, not Bitcoin-script-enforced" subsection.

### 4.1 The winner walks — pull the bond after winning

A contest winner takes the name, then spends the bond UTXO without creating a
valid successor bond.

- **Defense today:** documented fully in `ONT_CONTEST_WINDOW_PHILOSOPHY.md`
  ("what happens when a contest winner walks"). Spending an immature/pre-release
  bond without a valid successor makes the name `status: "invalid"`
  (`collectSpentImmatureBonds` + `invalidateBrokenBondContinuity` in
  `engine.ts`). The name returns to *unclaimed* via the same one-path — no
  auto-contest, no runner-up preference. After maturity/release the bond is
  returnable (matches ONT.md's "returnable… not destroyed money").
- **Residual gap (open tension):** because the bond is ONT-enforced rather than
  script-enforced, ONT can *invalidate the name* on a broken bond but cannot
  *slash the coin* — there is no on-chain penalty output. True economic slashing
  would require a script-level construction (covenant or pre-signed penalty tx),
  which is a design change, not an ONT rule. So the deterrent against
  walking-after-winning is "you lose the name and the name reopens," not "you
  lose money." For a griefer who wins to deny rather than to own, the name
  reopening is exactly what they did *not* want, so the deterrent mostly holds —
  but it is worth stating that the bond is not a financial penalty bond.

### 4.2 Shill / self-bidding to inflate the second price

The winner bids against themselves (via Sybils) to set the second price near
their max and extract more from a legitimate competitor, or to make a name look
contested-and-expensive to scare off honest bidders.

- **Defense today:** second-price mechanics limit *overpayment* (you pay the
  second-highest, so over-bidding against yourself risks paying your own shill's
  price). Bonds cost real capital to post.
- **Residual gap:** classic auction-theory shill risk is not specifically
  mitigated; with anonymous bidders a determined actor can manipulate the
  *appearance* of competition. This interacts with launch-fairness (below):
  early auctions with few real eyes are the easiest to shill.

### 4.3 Bond griefing — lock up a competitor's capital

Force auctions (4.1.2 Sybil-contest) repeatedly so honest participants must
keep bonded capital warm and locked.

- **Defense today:** bonds are returnable after release; the griefer also
  bonds, so they tie up their own capital symmetrically.
- **Residual gap:** the *time-value* and opportunity cost of locked capital is
  a real tax even when the principal is returned. Settlement-lock parameters
  (`auction-policy.ts`: `defaultSettlementLockBlocks` 52,560 ≈ 1 year) are long;
  a griefer can impose a long capital lock on a victim who chooses to bid. The
  parameters trade off grief-resistance against capital efficiency and deserve
  modeling.

## The launch-fairness problem (the one with the shortest fuse)

This is the threat the user is most concerned about and the one least amenable
to a purely technical fix: **in the opening days, with few eyes watching, the
early allocations must end up looking fair in hindsight — not "it all went to
the one billionaire who moved first."** Six months out, a skeptic should be
able to look at how the first names were allocated and conclude the process was
reasonable.

Why it is hard:
- Capture is most valuable and least observed at launch (1.1).
- Every market-derived "readiness" signal is adversary-controlled when the
  adversary is the only one with capital deployed (philosophy note, Principle 2).
- The cheap gate (₿1,000) is deliberately not a price signal, so it does not
  ration scarce premium names — it is anti-spam, not an allocator.

Levers that exist or are proposed (none individually sufficient):

1. **Long launch contest window, decaying to a floor.** The primary lever.
   `ONT_CONTEST_WINDOW_PHILOSOPHY.md` argues a launch window on the order of a
   month, height-keyed and monotonically decaying over roughly a halving to a
   ~1–2 week steady-state floor. This buys real owners time to notice and
   contest. The schedule must be frozen and manipulation-proof (the adaptive
   part may only *extend*, never shrink).

2. **Provisional-not-owned semantics.** Already built (`feb653a`): a cheap claim
   shows as provisional until its window closes. A capture is visibly
   provisional and contestable, not a fait accompli — which matters for the
   *perception* of fairness as much as the mechanics.

3. **Escalation-to-auction on contest.** Already built (`runBatchRail`). A
   whale who claims a brand does not own it if the brand-holder shows up; they
   have to win a second-price auction. This is the structural reason early
   capture is not a free land-grab.

4. **Class-based launch policy.** `auction-policy.ts` already encodes a
   `launch_name` class (floor 50,000, lock 52,560 blocks). Premium/launch names
   *can* be subjected to different (longer windows, higher floors, mandatory
   auction) rules than the long tail. This is a real fairness lever: the top-N
   most-capturable names need not use the same cheap-and-fast path as obscure
   ones.

**Open fairness levers worth a human decision (NOT yet designed):**

- **Should the top-N premium names start in auction rather than cheap-claim?**
  If the most valuable, most-capturable names *always* allocate by open auction
  (no quiet cheap claim), then "it went to whoever paid the most in an open,
  observable process" is a defensible fairness story, and the whale cannot
  capture quietly — they must win publicly. The cost is that auction is less
  egalitarian than first-come cheap claim. This is the central launch-fairness
  trade.
- **A launch-period rate limit per payer / per key on cheap claims.** Caps how
  many names one identity can quietly claim before windows close. Hard to
  enforce against Sybils without an identity primitive ONT deliberately lacks —
  likely weak, but worth stating as considered-and-rejected if so.
- **Transparency as a fairness mechanism.** A public, append-only, queryable
  feed of "names claimed in the last window, and their contest status" makes
  capture *visible* in real time, which is itself a deterrent and a
  hindsight-fairness artifact. This is a resolver/indexer feature, cheap to
  build, and probably the highest-leverage *perception* lever. Cross-references
  the discovery note (a resolver could expose a "recent claims / open contests"
  endpoint).
- **A documented, frozen launch schedule published before launch.** If the
  window-decay schedule, class rules, and any premium-name policy are committed
  to *before* anyone can claim — height-keyed, no governance — then the
  fairness of the process does not depend on trusting the operators' later
  discretion. "The rules were fixed in advance and applied to everyone" is the
  strongest hindsight-fairness claim available.

The honest summary: the *mechanics* (provisional claims, contest→auction,
class policy) make capture contestable rather than final, which is necessary
but not sufficient. The *perception* of fairness additionally requires (a) a
long, frozen, pre-announced launch window, (b) seriously considering open
auction for the top-N names, and (c) real-time transparency of claims and
contests. (a) is argued in the philosophy note; (b) and (c) are open decisions
flagged here.

## Cross-cutting gap summary

The gaps that are unbuilt today, ranked by how load-bearing they are for the
core "trustless, decentralized" claim:

1. **No light-client verification against Bitcoin (3.2).** The deepest gap.
   Resolver disagreement is detected but not adjudicable without trusting a
   resolver. Everything downstream (eclipse-resistance, multi-resolver
   correctness, "ONT state is a function of Bitcoin") depends on closing it.
2. **No discovery mechanism for publishers/resolvers (2.3, 3.3).** Config-only
   discovery means censorship/eclipse resistance is architecturally claimed but
   not deployed. The home of the user's "Bitcoin seed-IP analog?" question —
   see `ONT_DECENTRALIZATION_AND_DISCOVERY.md`.
3. **Multi-publisher coexistence not wired (2.1, 2.2, 2.5).** The convergence
   logic (`runBatchRail`, DA filter, merge) exists and is tested, but no live
   resolver consumes it and the publisher anchors off its own accumulator. One
   publisher = one point of failure for the cheap rail today.
4. **No publisher DoS hardening (2.4).** Operational, but interacts with
   censorship.
5. **Launch-fairness levers beyond the contest window (launch section).** Open
   auction for top-N, transparency feed, pre-announced frozen schedule — design
   decisions, not yet made.
6. **Bonds are not financial-penalty bonds (4.1).** ONT can invalidate a name
   on a broken bond but cannot slash coin without a script-level change.

## Open questions for a human decision

1. Do the top-N premium/launch names allocate by open auction from the start,
   or by cheap claim with a long window like everything else? (The central
   launch-fairness trade.)
2. Is a light-client proof-bundle verification path in scope before launch, or
   do we ship with "trust your resolver set, fan out to detect disagreement"
   and close the gap after? (Determines whether 3.2 is a launch blocker.)
3. What are the DA window parameters (`W`, `C`, `K`) and the launch contest
   window, as concrete heights — and are they published before launch?
4. Should the protocol ever express slashing (a financial penalty for walking
   after winning), which requires a script-level bond construction, or is
   "lose the name, name reopens" a sufficient deterrent? (See 4.1.)
5. Is a public real-time claims/contests transparency feed a launch
   requirement for fairness perception?
6. What rate-limiting / anti-DoS posture do reference publishers ship with, and
   is any of it protocol-visible (e.g. paid quotes) versus purely operational?
