# Open Name Tags (ONT) — one-pager

**ONT is a way to own a short, human-readable name — like `alice` — that is genuinely
yours: secured by Bitcoin, with no company, registrar, token, or rent.** Ownership is a
key you hold. Anyone can look a name up and verify the owner against Bitcoin instead of
trusting a server.

This is the short version for technical reviewers. The plain-language source of truth is
[`ONT.md`](./ONT.md); the level below this page is [`ONT_DESIGN_BRIEF.md`](./ONT_DESIGN_BRIEF.md).

---

## Why a sovereign name could matter

ONT is a bet that a neutral, ownable name on Bitcoin is worth having. We are **not**
claiming everyone needs one. The concrete use cases we find credible, narrowest first:

- **Payment handles.** A wallet resolves `alice` → *who gets paid* before money moves —
  a Bitcoin/Lightning destination you control and can rotate, not a custodial username.
- **Sovereign identity handles.** A username for open-source / decentralized messengers
  and social apps that no platform can reassign or revoke.
- **Addressing for publishing or agent endpoints** *(speculative)* — a stable, owner-
  controlled pointer to a service or agent.

The owner key signs **off-chain destination records**, so one name can carry several
destinations and update them over time without touching Bitcoin for routine changes.

## How it works — one path

There is a single way in; it only branches if a name is contested.

1. **Claim it.** Pay a small fixed amount of bitcoin — **₿1,000 (~$1, where ₿1 = 1
   satoshi)** — as a fee to Bitcoin miners. (A few thousand obviously-scarce names — very
   short ones, ≤4 characters — carry length-based opening floors and effectively start at
   auction. Everything 5+ chars uses the flat gate plus contention.)
2. **A public notice window opens.** If no one else claims the same name in the window, it
   is yours — the common case, and it is cheap. Thousands of uncontested claims batch into
   a **single Bitcoin commitment** (a sparse-Merkle accumulator), which is how the design
   targets billions of names without bloating Bitcoin.
3. **If someone else wants it too, it is contested** — and *only then* does it escalate to
   an **L1 returnable-bond auction**. The winner's bitcoin stays in their own custody,
   committed for a maturity period, then released; the name stays theirs. No rent, no burn,
   no payment to the project.

Either way you end up with the same object: a globally unique name controlled by your
owner key, which authorizes records, transfers, and recovery.

## Why you can trust it without trusting us

- **Bitcoin orders and settles.** Two honest observers replay Bitcoin and compute the same
  owner for every name. Resolvers and publishers mirror and serve data; they cannot decide
  ownership.
- **The trust surface is small.** Who-owns-what is a deterministic function of Bitcoin,
  implemented in a **frozen ~7-file core** (`@ont/consensus` + the protocol primitives). A
  CI test fails if that core grows a dependency on anything but Bitcoin/protocol
  primitives, so the surface a newcomer must audit cannot quietly expand.
- **Ownership is portable + Bitcoin-checkable.** A proof bundle lets a fresh verifier
  re-derive ownership. The verifier now checks the cited anchor is **Merkle-committed by a
  real block header that meets its proof-of-work target** — not just internal consistency.
- **Neutral by construction.** No registrar, admin, token, founder name-grab, rent, or
  revocation. Names are handed out by a fixed mechanical rule, never by anyone's judgment.

## Status — honest

ONT is an **active prototype**, not mainnet-ready.

**Runs on-chain today (private signet, proven end-to-end):** claim, owner-key transfer,
owner-signed value records, recovery descriptors, and a **bonded auction bid that the
resolver observes and accepts**. The consensus engine, wire formats, and signatures are
real and cross-checked byte-for-byte against an independent mobile implementation.

**Prototype / not yet wired:** the cheap accumulator rail is built and unit-tested
(commutativity, convergence against a data-withholding adversary) but **not yet consumed by
the live indexer** — so cheap claims aren't canonical resolver state yet. The publisher is
single-writer (the leaderless multi-publisher design is simulated, not deployed). Proof
bundles can be *verified* against Bitcoin, but producers don't yet *emit* the inclusion
proofs a light client needs.

This is a matter of **maturity, not direction**.

## What we most want Bitcoin developers to push on

1. **Data-availability + convergence:** is the fail-closed DA rule (a batch counts only if
   its bytes surface by a Bitcoin-height-keyed deadline) sound against reorgs and
   withholding, and are the windows right?
2. **On-chain footprint:** ONT events use OP_RETURN payloads up to ~135 bytes (we've
   confirmed they relay + confirm on signet). Acceptable, or should the root anchor hide in
   script via a covenant?
3. **Light-client verification:** how much is a launch blocker — full Merkle/PoW proof
   bundles emitted end-to-end vs. trusting a resolver set with fanout disagreement
   detection?
4. **Launch fairness / cold-start:** the notice window defends against a day-one premium-
   name land-rush; is a window enough, or is a decaying launch gate worth the added rule?

Deeper treatment, the prior-art comparison, the full risk register, and the parameter
table are in [`ONT_DESIGN_BRIEF.md`](./ONT_DESIGN_BRIEF.md).

- Repository: [github.com/deekay/ont](https://github.com/deekay/ont)
- Product surface (not needed for review): [opennametags.org](https://opennametags.org)
