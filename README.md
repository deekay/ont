# Open Name Tags (ONT)

**A short, human-readable name like `alice`, settled on Bitcoin, that you actually own.** No
company, registrar, token, or rent. Ownership is a key you hold — no one (not even ONT's authors)
can move or revoke it — and a name's owner can be re-derived from public data and Bitcoin without
trusting any server.

This README is the **high-level design** — read it on arrival. For the short, shareable version see
the **[one-pager](./docs/ONT_ONE_PAGER.md)**; for the full detail see the **[design
brief](./docs/ONT_DESIGN_BRIEF.md)**; the plain-language source of truth is
**[ONT.md](./docs/ONT.md)**. Amounts are written in **₿ where ₿1 = 1 satoshi** — the ₿ figures are
fixed; USD equivalents assume **~$100,000/BTC** and drift with the price (so the ₿1,000 claim gate ≈ $1).

> **Status: active prototype on a Bitcoin test network (signet) — not mainnet-ready.** We are
> deliberately honest about what runs today vs. what's designed; see
> [What's live vs. prototype](#whats-live-vs-prototype). The **canonical status + numbers** live in
> **[docs/core/STATUS.md](./docs/core/STATUS.md)** — if any doc disagrees, that file wins.

---

## What it's for

Most names online are really *accounts*: a company hands them out and can rename you, reclaim them,
or shut you down. An ONT name is the opposite — a name only your key controls. What you'd point one at:

- **A payment handle** — pay `alice` instead of a long address; the name resolves to a Bitcoin/
  Lightning destination (the same BIP-21 / BIP-353-shaped payload a wallet already understands).
- **An identity handle** — one verifiable, impersonation-proof username for open-source / decentralized
  apps that no platform can reassign.

The people who feel this most are the ones who've already lost a handle once: a Lightning Address whose
host shut down, a Nostr NIP-05 that broke when a domain lapsed, an OSS maintainer tired of re-publishing
donation addresses. Adoption is unproven *today* — this is what a sovereign name is *good for*, not a claim that
everyone needs one.

## How it works

There is one path for every name; it forks only if two people want the same one.

1. **Claim** a name for a flat **₿1,000** (~$1) fee paid to **Bitcoin's miners**, not to ONT.
2. **A public notice window opens** — everyone's chance to contest it.
3. **Uncontested → it finalizes cheaply.** Many uncontested claims batch into one Bitcoin commitment
   (a Merkle accumulator root anchored on-chain), which is how it scales to billions of names.
4. **Contested → a returnable-bond auction.** To contest, someone posts a **returnable bond**, which
   opens an L1 auction; the **largest bond wins**. You can *bond-first* to open the auction directly on
   a name you already know is premium (`bitcoin`). A bare second claim with no bond can't take a name —
   it just nullifies (the name reopens), never awards, so block ordering buys no one a name.

Either way you end up with the same thing: a globally-unique name controlled by **one owner key**,
which signs transfers, off-chain destination records (instant, free, never touch Bitcoin), and
recovery. → [acquisition state machine](./docs/design/ONT_ACQUISITION_STATE_MACHINE.md)

## What ONT guarantees

Five properties are treated as inviolable invariants — everything else (parameters, auction form, UX)
is negotiable:

- **Sovereign** — acquisition is a one-time cost; after that, no rent, renewal, expiry, forced sale, or
  revocation. Your key controls the name.
- **Neutral** — no registrar, editor, or allocator, *explicitly including the founder*. Names go by a
  fixed mechanical rule — no reserved lists, no token, no founder pre-grab. Rule changes are opt-in new
  versions only.
- **Verifiable without trust** — a fresh verifier reconstructs *why* a name is owned from public data +
  Bitcoin, trusting no resolver, operator, or founder.
- **Censorship-resistant** — final ordering and dispute resolution derive from Bitcoin.
- **Unambiguous** — a name resolves to exactly one owner; two honest observers never disagree.

**Fair launch (by design).** The neutrality rule covers the *start*, not just the ongoing rule: no
founder, insider, or tester allocation — the intent is that names become claimable only from a single,
pre-announced launch height, with no pre-grab. The exact launch mechanism, and how to keep the day-one
rush *competitive* rather than a quiet whale sweep of premium names, is an **open question we're still
working** — see [risk register](./docs/design/ONT_RISK_REGISTER.md) R7.

→ [sovereignty map](./docs/design/ONT_SOVEREIGNTY_MAP.md) ·
[design requirements](./docs/design/ONT_DESIGN_REQUIREMENTS.md)

## How this differs from what you already know

- **Namecoin** — first-come-free invited squatting, on a separate merge-mined chain. ONT keeps the goal
  but replaces first-come-free with a sunk gate + contested-only auction, and settles on Bitcoin itself.
- **ENS** — annual rent, an increasingly L2 footprint, and a token-weighted **governing DAO** that can
  re-price and adjudicate names. ONT has **no governance body**, **no rent**, and settles on Bitcoin.
- **BNS / Stacks** — depends on the Stacks token. ONT adds **no token and no new chain**.
- **Handshake** — its own proof-of-work coin, for TLDs. ONT issues handles, adds **no coin**, settles on
  Bitcoin.
- **BIP-353 / Lightning Address / NIP-05** — the closest "name → who gets paid / who is this," but
  **domain-bound** (you can lose the `@domain`) or custodial. ONT is *a different name root for the same
  payment payload*: it carries the same BIP-21/BIP-353 bytes, so a wallet adds ONT support by swapping
  the **resolution step** — the payment code is unchanged — and the name root no longer depends on a DNS
  zone you can lose.
- **Pkarr / Pubky** — self-sovereign keys publishing records over a DHT. ONT borrows "a key owns its
  records" but adds a scarce, globally-unique, **Bitcoin-ordered** namespace with contest resolution.

→ [prior art (design brief §2)](./docs/ONT_DESIGN_BRIEF.md) ·
[ONT vs Pkarr/Pubky](./docs/research/ONT_VS_PUBKY_PKARR.md)

## The trust surface

Who-owns-what is a deterministic function of Bitcoin, computed in a frozen core plus protocol
primitives:

- `packages/consensus/src/engine.ts` (event replay), `state.ts` (name state), `proof-bundle.ts`
  (portable proofs — internal consistency **plus** Merkle-inclusion + header-proof-of-work verification
  against Bitcoin)
- `packages/protocol/src/` (names, wire formats, events, transfer/value/recovery payloads)
- `packages/consensus/src/trust-surface.test.ts` **fails the build** if that core grows a dependency
  outside `@ont/protocol` / `@ont/bitcoin`, or gains a file outside the documented set — so the audit
  surface (exactly the three consensus files above) cannot silently grow.

**Verify it yourself:**

```bash
npm install
npm run test -w @ont/consensus      # trust surface + proof bundles (incl. Bitcoin Merkle/PoW)
npm run test -w @ont/protocol
npm run test -w @ont/core
```

## What's live vs. prototype

Exactly what runs on-chain today versus what's still prototype:

| Capability | State |
| --- | --- |
| Owner-key transfer, owner-signed value records, recovery descriptors | **Live on signet** — byte-for-byte cross-checked across two independent implementations (the TS engine and the mobile wallet) |
| Bonded contested-auction bid, resolver-accepted end-to-end | **Live on signet** |
| Proof-bundle verification against Bitcoin (Merkle inclusion + header PoW) | **Verifier done** (tested vs. a real mainnet block); producers don't emit inclusion proofs yet, so the phone/light-client path isn't closed |
| Cheap accumulator rail (batched claims) | **Live on signet, end-to-end** — claim → on-chain anchor → indexer verifies the batch against the anchored root → name resolves in the public explorer (try it at [claim.opennametags.org](https://claim.opennametags.org)). The fail-closed availability deadline (W/C/K) is design+simulation only, and the Lightning payment is stubbed on signet (Lexe is mainnet-only) |
| Leaderless multi-publisher convergence | **Simulated + tested**; a single-writer publisher runs in production |
| Mainnet | **Not yet** — active prototype |

## Key numbers

**Decided baselines** (revisited only on strong feedback):

| Parameter | Value |
| --- | --- |
| Claim gate, every name | **₿1,000** (~$1 at ~$100k/BTC) — sunk, paid to Bitcoin's miners |
| Opening bond, scarce short names (≤4 char) | length-scaled: **₿100,000,000** (1 BTC, ~$100k) for 1 char, **halving per added character** (2-char ₿50,000,000 … 4-char ₿12,500,000). Names 5+ chars pay only the flat gate — plus a bond only if contested. |

**Deliberately not pinned yet** — each sets consensus-replay behavior, so it must be frozen and
published before launch, and each is something we want feedback on:

| Parameter | Working value | Why it's still open |
| --- | --- | --- |
| Contested-auction min bond | ~₿50,000 (~$50), returnable | the floor that makes contesting cost real capital — too low invites griefing, too high blocks legitimate contests |
| Bond maturity | ~52,560 blocks (~1 yr) in tests | how long a winning bond stays locked before it can be released |
| Notice window | weeks (the test default is ~1 hr) | the launch-fairness lever — long enough that a day-one rush stays competitive |
| Data-availability windows | unset | the height-keyed deadlines that keep off-chain batch data safe against withholding + reorgs |

The on-chain **footprint** isn't a parameter we set — it's a *measured consequence*:
~**0.016–0.019 vB/name** at ~10k claims/batch, and lower as batches grow (the limit is data
availability, not the Merkle structure).

Full parameter table and the economic rationale are in the [design brief](./docs/ONT_DESIGN_BRIEF.md).

## Known tradeoffs (honest)

- **OP_RETURN size.** ONT's on-chain events are OP_RETURN payloads up to ~171 bytes (the recover-owner
  event; most events are 41–135 B) — above Bitcoin's default 80-byte datacarrier policy, so relay still
  depends on node policy (modern Bitcoin Core defaults are more permissive; we confirmed ONT OP_RETURNs
  relay and confirm on signet). Whether this is acceptable on mainnet vs. a script/covenant carrier is
  an open question.
- **Light-client verification isn't closed end-to-end** — the verifier checks Merkle + PoW, but
  producers don't emit the inclusion proofs a phone would consume yet.
- **The cheap batched-claim rail isn't wired into the canonical indexer**, and the publisher is
  single-writer; leaderless multi-publisher convergence is simulated, not deployed.

The full risk register and the open questions we most want feedback on are linked below.

## Design in depth

The detailed design — each part of the system, one click away:

- **[Acquisition state machine](./docs/design/ONT_ACQUISITION_STATE_MACHINE.md)** — the exact lifecycle:
  claim → notice → bond-opens-auction, and why a bare collision can't steal a name.
- **[Data-availability agreement](./docs/design/ONT_DATA_AVAILABILITY_AGREEMENT.md)** — the fail-closed,
  height-keyed rule that makes off-chain batch data safe against withholding and reorgs.
- **[MEV / ordering analysis](./docs/design/ONT_MEV_ORDERING_ANALYSIS.md)** — why block ordering, even a
  miner's, can't be converted into a stolen name.
- **[Issuance & fee mechanics](./docs/design/ONT_ISSUANCE_FEE_MECHANICS.md)** — the sunk miner-fee gate
  and how a batched anchor is forced to pay the full per-name gate.
- **[Multi-publisher convergence](./docs/research/ONT_MULTI_PUBLISHER_CONVERGENCE.md)** — how independent
  publishers converge on one canonical root with no leader.
- **[Decentralization & discovery](./docs/research/ONT_DECENTRALIZATION_AND_DISCOVERY.md)** — how
  publishers and resolvers are found, and why discovery is a *liveness*, not a *trust*, problem.
- **[Owner-key recovery](./docs/research/OWNER_KEY_RECOVERY.md)** — owner-armed, vetoable recovery that
  can never become a takeover path.
- **[Adversarial analysis](./docs/research/ONT_ADVERSARIAL_ANALYSIS.md)** — the full threat model
  (publisher fee-theft/censorship, eclipse, MEV, DoS).
- **[Sovereignty map](./docs/design/ONT_SOVEREIGNTY_MAP.md)** — each invariant mapped to the mechanism
  that enforces it.
- **[Risk register](./docs/design/ONT_RISK_REGISTER.md)** — every known risk, with severity and status.
- **[Open questions for experts](./docs/research/OPEN_QUESTIONS_FOR_EXPERTS.md)** — the sharp questions
  we most want pushed on.
- **[Post-quantum & signature agility](./docs/research/POST_QUANTUM_AND_SIGNATURE_AGILITY.md)** — how the
  key/signature scheme can evolve.

The single deepest read is the **[design brief](./docs/ONT_DESIGN_BRIEF.md)**, which ties all of these
together.

## Two keys

- the **wallet key** signs the Bitcoin transactions that establish or move ownership;
- the **owner key** signs the off-chain destination records and authorizes transfers + recovery. In v1,
  losing the owner key (without a pre-armed recovery descriptor) means losing update and transfer
  authority for that name.

## Run it yourself

```bash
# local prototype (bundled fixture chain)
npm install
npm run dev:all          # http://127.0.0.1:3000

# your own web + resolver stack
cp .env.example .env
npm run selfhost:doctor
npm run selfhost:up      # http://127.0.0.1:3000
```

To point the stack at your own Bitcoin backend, see
[SELF_HOSTING.md](./docs/core/SELF_HOSTING.md).

Using the product is optional and not needed for review: hosted demo at
[opennametags.org](https://opennametags.org) (it currently exercises the contested/auction path
end-to-end; the cheap batched-claim path is prototyped — see the status table above). Walkthroughs:
[Sparrow private-signet](./docs/demo/SPARROW_PRIVATE_SIGNET.md) · [Flint demo](./docs/demo/FLINT_DEMO.md).

## Repository map

TypeScript monorepo (`npm` workspaces).

**Trust surface — audit this first:** `packages/consensus` (engine · state · proof-bundle) +
`packages/protocol` (names · wire · events · transfer/value/recovery payloads).

Everything else:

- `packages/bitcoin` — Bitcoin RPC parsing + chain-source helpers
- `packages/core` — indexer, auction state, snapshots, and the research/scaling prototypes
- `packages/architect` — transaction-prep / PSBT building (shared by web + CLI)
- `packages/db` — snapshot + record persistence adapters
- `apps/web` — hosted site: explorer, auctions, transfer prep
- `apps/resolver` — read API, record API, provenance
- `apps/cli` — auction / transfer / record / operator tooling
- `apps/indexer` — chain indexing entrypoint
- `apps/publisher` — batching publisher for the cheap-claim rail (prototype)
- `apps/wallet` — local desktop wallet/client prototype
- `mobile/` — the iOS wallet (Expo / React Native), the second independent implementation

## License

[MIT](./LICENSE).
