# Decentralization and discovery — design note

Status: design note, not frozen. Answers a specific set of questions: how do
publishers and resolvers actually work, how do they decentralize, and — the
question that motivated this note — **is there a bootstrapping mechanism like
Bitcoin's seed IPs, or a way to use the Bitcoin blockchain itself to discover
which publishers/resolvers are available?** The neutrality-sensitive choices at
the end need a human decision before anything is wired.

Companions:
- `ONT_PUBLISHER_PROTOCOL_SPEC.md` — the publisher's HTTP API and anchor-tx
  construction.
- `ONT_MULTI_PUBLISHER_CONVERGENCE.md` — how more than one publisher converges
  on a canonical root (the leaderless merge, Model B).
- `ONT_ADVERSARIAL_ANALYSIS.md` — the threat model; this note is the
  constructive answer to its surface-2 and surface-3 gaps.

## The reframing that makes the whole question tractable

**ONT name state is a deterministic function of Bitcoin.** Given the Bitcoin
block history, the frozen `@ont/consensus` rules, and the data-availability windows, every
honest indexer computes *the same* name ownership, value records, and contest
state — in any processing order. This is not aspirational; it is the
convergence guarantee proven in `da-convergence-sim.test.ts` and composed in
`runBatchRail`.

The consequence for decentralization and discovery is the load-bearing insight
of this note:

> If a client verifies ONT state against Bitcoin itself, then **discovery is a
> liveness problem, not a trust problem.** The client does not need to find an
> *honest* resolver — it needs to find *any reachable* resolver and then check
> its answer. A lying resolver is caught by verification; a slow resolver is
> caught by fanout. Discovery only has to deliver "at least one reachable node
> that will hand me data I can check," which is a much weaker requirement than
> "a trustworthy node."

This flips the usual P2P-discovery problem on its head. Bitcoin's seed IPs have
to bootstrap you into an *honest majority* view of the network, because a node
that lies about the chain can eclipse you. ONT resolvers cannot lie about name
state *if the client verifies against Bitcoin*, because the answer is
determined by Bitcoin, which the client can check independently. So the
discovery mechanism for ONT can be much sloppier than Bitcoin's and still be
safe — **provided the verification path exists.** It largely does not yet (see
"The precondition" below), which is why this note treats verification and
discovery as one problem.

## The trust model: safety vs liveness (da-trust-model)

The reframing above has a sharp consequence worth stating as doctrine, because
it is the thing a critical reviewer will press on: **ONT separates *safety* from
*liveness*, and never lets the second contaminate the first.**

- **Safety (who validly owns a name) is unconditional and has no authority
  slot.** It is a pure function of Bitcoin + the presented commitment-matching
  bytes, recomputed identically by anyone. No resolver is consulted to decide
  it. "Who sees the complete set?" therefore has a deliberately boring answer:
  *it does not matter who sees it, because seeing is not deciding* — the set is
  self-verifying against the anchored `batchSize` + root, so any observer
  confirms completeness independently and no observer's view is privileged.
- **Liveness (can I get the bytes) is bootstrapped and improves over time.** It
  is the only residual (the Data-Availability Agreement §8), and it is where the
  resolver market lives.

**The posture, stated plainly (this is the part to put in front of a skeptic):**
during bootstrap we hold temporary **censorship/liveness power** — we can
*deny* by withholding bytes — but **zero theft power**: we can never forge
ownership (bad bytes fail the seal) and we can never strip a settled name
(finalize-once). That censorship power **erodes the moment independent archives
exist.** Safety is unconditional and never centralized; only liveness is
centralized, temporarily, and provably decays. That is *precisely* early
Bitcoin's posture — fragile liveness, never-compromised validation.

**The bootstrap commitment.** Like Bitcoin, the network starts thin and is
coaxed wider — but note *what* gets bootstrapped: Satoshi bootstrapped the
consensus *enforcers* (miners/nodes); ONT does **not** bootstrap consensus
(ours rides Bitcoin's, already decentralized). We bootstrap a *serving*
network. Concretely:

- We commit to running **one honest, maximally-complete resolver** at launch,
  and to recruiting others.
- Completeness is a **competitive, auditable metric**: the box says N
  (`batchSize`), so any resolver claiming completeness can be checked — "shows N
  vs shows N−1" is provable against the on-chain commitment. Resolvers compete
  on it; gossip surfaces who is complete.
- This is an **availability/adoption** commitment, not a trust anchor: our
  resolver is verifiable against Bitcoin like any other and earns no authority
  from being first or being ours.

**The one rule that keeps this honest:** an availability/completeness checkpoint
— whether gossiped or posted to L1 — is an *out-of-band, falsifiable* signal,
**never a consensus input.** The instant the kernel treated a checkpoint as
*proof* of availability, it would mint the attestation authority this whole
model exists to avoid (rejected as the bonded-attestation shape, Data-
Availability Agreement §215). Checkpoints inform humans and resolvers; they
never decide a verdict.

**What makes this "solved" rather than "solved once we build X" — the reviewer
checklist:**

1. The validity function provably **never consults a resolver** (pure over
   Bitcoin + witness).
2. **Fail-closed**: absent/withheld bytes have no effect — worst case is denial,
   never corruption.
3. **Contested names route to bonded/L1**, where availability ambiguity is zero
   — the high-stakes cases do not lean on the mirror market.
4. The mirror market is **liveness-only, auditable, bootstrapped honest-first**.
5. **Light-client header verification (SPV)** exists — the precondition that
   makes 1–4 true rather than aspirational. This is the launch gate
   (da-trust-model, `../core/DECISIONS.md` #82); "The precondition" section
   below is hereby elevated from a recommendation to a committed gate.
6. **Honest disclosure**: long-tail availability is a bootstrapped *liveness*
   property, not a cryptographic guarantee — claimed as exactly that and no
   more.

The normative invariants are pinned in the Data-Availability Agreement §8c;
this section is their rationale and the operational commitment.

## How publishers work, and how they decentralize

A publisher (`apps/publisher`) is a thin batching service. It quotes a gate
price, takes a Lightning payment, batches batched-path claims, anchors one
OP_RETURN committing `prevRoot -> newRoot` (`encodeRootAnchorBody`, event type
`OntEventType.RootAnchor = 0x0b` under `PROTOCOL_MAGIC = "ONT"`), and serves
inclusion proofs. It touches no owner key and holds no authority; the client
re-derives the leaf and verifies the inclusion proof itself
(`ONT_PUBLISHER_PROTOCOL_SPEC.md`, "what the wallet must NOT do").

Decentralization story:
- **Anyone can run one.** No license, no registration, no privileged role. The
  spec's whole "why this is small" section is an argument that a publisher is
  mechanical assembly of existing primitives.
- **Convergence under many publishers is leaderless.** `ONT_MULTI_PUBLISHER_CONVERGENCE.md`
  picks Model B: each anchor is a delta proven against the last confirmed root;
  the canonical next root is *derived* by merging all data-availability-valid deltas in a
  block, conflicts resolved by commit priority. Distinct-leaf inserts commute,
  so two honest publishers building on the same tip both land — no leader
  election, no namespace partition, no cartel.

The gaps (from the adversarial note): the merge logic exists and is tested, but
(1) no live resolver consumes `runBatchRail` as the canonical deriver, (2) the
publisher anchors off its own private accumulator rather than the canonical
root, and (3) **there is no way to find a publisher other than the one in your
config.** The first two are wiring covered by the convergence note. The third
is discovery, below.

## How resolvers work, and how they decentralize

A resolver (`apps/resolver`) is an independent `@ont/consensus` mirror over
Bitcoin (RPC / Esplora / fixture). It re-derives name state from the chain and
answers lookups over HTTP. It holds no authority — `apps/wallet/src/resolver.ts`
says so in its header: "it holds no authority over names (we verify ownership
against Bitcoin, not against it)."

Decentralization story:
- **Anyone can run one**, same as publishers — it is just a deterministic
  indexer of public Bitcoin data.
- **Clients can query several.** `apps/web/src/resolver-fanout.ts` fans out over
  a configured list (`ONT_RESOLVER_URL` + `ONT_RESOLVER_URLS`), classifying the
  set as `consistent | lagging | conflict | all_missing`. Disagreement is
  *detected*.

The gap that matters (adversarial note 3.2): **the fanout detects disagreement
but cannot adjudicate it.** It picks "canonical" by history *length*
(`compareValueHistoryResults` sorts by `completeToSequence`), which assumes the
most-advanced resolver is honest. It does no cryptographic verification against
Bitcoin. A client facing a `conflict` has no trustless way to decide who is
right from resolver data alone. This is the precondition problem again.

## The precondition: light-client verification against Bitcoin

The reframing ("discovery is just liveness") holds *only if* the client
verifies. Today it half-verifies:

- `verifyProofBundle` (`packages/consensus/src/proof-bundle.ts`) checks a
  proof bundle's internal consistency: the value-record signature chain, the
  owner pubkey shape, accumulator inclusion proofs, Ark/auction merkle roots.
  This is real and useful.
- **But it does not verify against Bitcoin block headers.** It takes the anchor
  txid and the committed root as *given* — there is no SPV-style check that the
  anchor transaction is actually in a block with real proof-of-work at the
  claimed height. So a resolver (or a proof-bundle producer) that fabricates an
  anchor the client never saw on-chain is not caught by `verifyProofBundle`
  alone; the client is trusting that the cited anchor is real.

So the precondition for "discovery is just liveness" is a **light-client
verification path**: the client obtains Bitcoin block headers independently
(its own node, or SPV with header-chain proof-of-work checks), and verifies
that every cited anchor OP_RETURN is in a header-chain-confirmed block at the
claimed depth before trusting any resolver-supplied state. With that in place,
a resolver becomes a pure data-availability convenience — it can speed you up
or slow you down, but it cannot deceive you.

**This is the single most important thing to build**, and it should precede
investing in fancy discovery, because cheap/sloppy discovery is *safe* once
verification exists and *dangerous* until it does.

## The bootstrapping question (the core ask)

> Is there a bootstrapping mechanism similar to Bitcoin's own seed IPs, or some
> other way to use the Bitcoin blockchain to discover the availability of a set
> of resolvers or publishers?

First, what Bitcoin does, for calibration. A fresh Bitcoin node bootstraps
peers from, in order: (1) a hardcoded list of **DNS seeds** (domains that
return A/AAAA records of live nodes), (2) a hardcoded list of **seed IPs**
baked into the binary as a fallback if DNS fails, then (3) **addr gossip** —
once connected to anyone, it learns more peers. The hardcoded seeds are a
deliberate, audited, minimal trust anchor; everything after is gossip.

For ONT, here are the real options, with their trust/centralization profiles.

### Option A — config-only (today)

`ONT_PUBLISHER_URL`, `ONT_RESOLVER_URL`, `ONT_RESOLVER_URLS`. The operator (or
the app's defaults) hands you endpoints.

- **Pro:** trivial; works now.
- **Con:** the default list is a centralization and eclipse vector (adversarial
  note 3.3). Whoever ships the defaults chooses your reality — unless you
  verify against Bitcoin, in which case it only chooses your *liveness*.
- **Verdict:** fine as the innermost fallback (Bitcoin's "hardcoded seed IPs"
  analog), *if* verification exists. Not sufficient as the only mechanism.

### Option B — on-chain announcement event (the "use Bitcoin to discover" answer)

Add a new `OntEventType` (the enum already cleanly supports more — current
assigned values are sparse: `0x03, 0x07, 0x09, 0x0b`; `0x0d` is retired —
never reuse, per marker-fold (#47)) for a **service
announcement**: a publisher or resolver posts a small OP_RETURN under the `ONT`
magic declaring an endpoint (host/onion + a pubkey + maybe a capability flag),
optionally signed by a key it also uses to sign its served data.

- **Pro:** this is *literally* "publish to the Bitcoin blockchain so anyone can
  discover available resolvers/publishers." Anyone scanning ONT OP_RETURNs
  builds a directory with no privileged registry. It is permissionless (posting
  costs a Bitcoin fee, which is the anti-spam) and censorship-resistant (you
  cannot stop someone from announcing on Bitcoin).
- **Con:** an announcement is a *claim of existence and reachability*, not a
  proof of honesty or even of current liveness — endpoints rot, and an attacker
  can spam announcements cheaply to drown honest ones. So a discoverer still
  needs (a) to verify served data against Bitcoin (the precondition) and (b)
  some liveness/quality filter (try several, keep the ones that answer and
  verify). Reputation/staking on top is possible but adds mechanism and
  neutrality risk.
- **Verdict:** the most "ONT-native" discovery primitive and the direct answer
  to the question. Cheap to specify (one event type + a scanner). Its weakness
  (announcements are unverified liveness hints) is exactly the weakness the
  precondition makes harmless: you do not trust an announced resolver, you
  verify it.

### Option C — discovery via the system itself (well-known ONT name)

`ValueType.HttpsTarget = 0x02` already exists: a name's value record can point
to an HTTPS endpoint. So a **well-known ONT name** (say `_resolvers` or a
launch-reserved name) could carry a value record listing resolver/publisher
endpoints, owner-signed and verified like any other name.

- **Pro:** dogfoods the system — discovery uses the same name→record→verify
  path as everything else, with no new event type. The list is owner-signed and
  updatable.
- **Con:** it has an *owner*. Whoever holds `_resolvers` is a directory
  authority — a neutrality red flag, and a juicy capture target at launch
  (which loops straight back to the launch-fairness problem). Mitigations:
  reserve it to a published multisig / rotating set, or treat it as one
  *optional* source among several, never the root of trust.
- **Verdict:** ergonomic and useful as a *convenience aggregator*, dangerous as
  *the* trust root. Best framed as "a directory you may consult," explicitly not
  privileged, with the on-chain scan (Option B) and verification (precondition)
  as the trustless floor beneath it.

### Option D — DNS seeds / hardcoded fallback (the closest Bitcoin analog)

Ship a small hardcoded list of DNS seeds and/or seed endpoints in the client,
exactly like Bitcoin's binary does.

- **Pro:** simplest robust bootstrap; battle-tested pattern; only needs to get
  you to *one* reachable node, after which Options B/C/gossip take over.
- **Con:** the seed list is chosen by whoever ships the client — a soft
  centralization. Bitcoin accepts this because the seeds only bootstrap
  *liveness* into a system where the chain is self-verifying. ONT can accept it
  for the same reason, *if* verification exists.
- **Verdict:** reasonable innermost bootstrap, identical in spirit to Bitcoin.
  The seeds must be multiple, independently operated, and documented, and the
  client must verify served data so the seeds cannot deceive — only fail to
  respond.

### How they compose (recommended layering)

Mirroring Bitcoin's defense-in-depth, innermost (most trusted-to-be-present) to
outermost (most decentralized):

1. **Hardcoded/config seeds (A + D)** — get to one reachable node. Chosen by the
   client shipper; safe because the client verifies.
2. **On-chain announcement scan (B)** — build a permissionless directory from
   Bitcoin itself. The trustless backbone; no registry authority.
3. **Well-known-name aggregator (C)** — an optional convenience list, owner-
   signed, never the trust root.
4. **Gossip** — resolvers/publishers can return "other nodes I know" (an `addr`
   analog), seeded by any of the above.

The whole stack is safe iff the client verifies served state against Bitcoin
headers. Without that, *every* layer is an eclipse vector; with it, the worst a
bad discovery source can do is waste your time.

## Neutrality tradeoffs (the decisions that need you)

1. **No privileged directory.** Any discovery mechanism that has an owner or an
   editor (Option C's well-known name, a curated seed list treated as
   authoritative, a reputation registry with an admin) is a neutrality hazard
   and a capture target. The rule to hold: discovery sources provide
   *liveness*, never *authority*; the trust root is always Bitcoin +
   verification. Anything that violates that should be rejected even if it is
   more convenient.

2. **Announcement spam vs. anti-spam.** Option B's anti-spam is the Bitcoin fee
   to post. Whether to add anything more (PoW, staking, expiry) trades
   spam-resistance against mechanism and against permissionlessness. Default to
   "fee is the only gate; discoverers filter by liveness + verification" and add
   mechanism only if spam proves to be a real problem.

3. **Who funds the on-chain footprint.** Announcements and (per the convergence
   note) checkpoints both cost Bitcoin fees. Keep funding permissionless —
   anyone may post, anyone may ignore — and never introduce a paid/licensed
   announcer role.

## The precondition, restated as the recommended order of work

1. **Build light-client verification against Bitcoin headers.** A path where the
   wallet/resolver client obtains headers independently and confirms every cited
   anchor is in a real, PoW-confirmed block at the claimed depth, then verifies
   the proof bundle on top. This is what turns `verifyProofBundle`'s structural
   checks into trustless verification, and it is the precondition for safe
   sloppy discovery. **Do this first.**
2. **Wire the canonical-root derivation into the resolver** (`runBatchRail`),
   per the convergence note, so there is a thing to verify *against*.
3. **Add the on-chain service-announcement event (Option B)** and a scanner — the
   ONT-native, registry-free discovery primitive.
4. **Ship a hardcoded multi-seed bootstrap (A + D)** as the innermost fallback,
   documented and independently operated.
5. **Optionally add the well-known-name aggregator (C)** as a clearly
   non-authoritative convenience, with multisig/rotation if used at all.
6. **Gossip** as the outermost layer once 3–5 exist.

## Open questions for a human decision

1. Is light-client header verification in scope before launch, or do we ship
   "verify bundle structure + trust your resolver set + fan out to detect
   disagreement" and harden later? (This determines whether resolver
   equivocation, adversarial-note 3.2, is a launch blocker.) **[ANSWERED by
   da-trust-model (DECISIONS #82): yes — light-client header verification is a
   launch gate for the firewall claim; resolver equivocation is a launch
   blocker, not deferred.]**
2. Do we add the on-chain service-announcement event type now (it is cheap and
   the enum has room), or defer discovery entirely to config + docs for v0?
3. If we use a well-known discovery name (Option C), who owns it — a published
   multisig, a rotating set, or is it deliberately *not* used to avoid the
   directory-authority hazard?
4. What is the hardcoded seed set, who operates the seeds, and how is their
   independence documented so the bootstrap is not a hidden centralization?
5. Does the announcement event carry just an endpoint + key, or also capability
   flags (publisher vs resolver, supported networks, fee policy) — and how much
   of that should be on-chain vs. fetched from the endpoint after discovery?
