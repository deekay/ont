# ONT — Wallet & Onboarding Direction

Forward-looking product/architecture direction for how people actually *hold and use* ONT names.
**Not frozen design, not a v1 commitment** — the consensus core (`@ont/consensus`) is unaffected by
anything here. This is the mutable client layer (see [`../design/ONT_SOVEREIGNTY_MAP.md`](../design/ONT_SOVEREIGNTY_MAP.md):
wallets hold *no authority* over names, so they can evolve freely).

Status: direction note, 2026-05-25. Captures a design conversation; decisions here are provisional.

---

## 0. What exists today (`apps/wallet`)

A runnable reference client now exists as a TypeScript CLI (`@ont/wallet`), assembling the
existing `@ont/*` packages. It is a prototype on signet/regtest, **not a mainnet wallet**, and
it deliberately tracks the architecture below rather than getting ahead of it.

- **Keys & custody split (§2 shape):** an on-device, password-encrypted keystore (AES-256-GCM
  + scrypt) holds the **owner key** (controls the name) and a separate **funding key** (pays
  fees/bonds). The owner key is generated locally and never derived from a Lightning credential.
- **Claim / bid / bond:** `claim <name> --amount <n>` auto-sources live auction state from the
  resolver and works in any phase (opening, live bidding, soft close). It hard-fails when the
  bid preview says the consensus would reject the bid (below minimum, too early, closed) so it
  never burns a tx. Every bid the wallet builds records its bond outpoint locally; auto-fund
  refuses to spend a locked bond (spending one before its release is a consensus-level
  slashing condition). `sync` reconciles bond statuses from the resolver's auction outcomes;
  `bids` shows what's in flight; `auctions` lists what's live on the resolver.
- **The lifecycle:** `transfer <name> --to <pubkey> --fee-sats <n>` mirrors claim
  (auto-sources prev-state-txid + bond outpoint, auto-funds the fee minus locked bonds).
  `set-destination` publishes owner-signed value records, `arm-recovery` publishes owner-armed
  recovery descriptors, and `sync` reconciles tracked names + bid bonds against the resolver.
  Fully-explicit flags let every command run offline. Plus `lookup`, `names`/`track`/`forget`,
  `balance`, and a one-command `demo`.
- **Portable, self-verifying proofs:** `export-proof <name>` assembles a
  `bitcoin_l1_direct_auction` proof bundle from resolver data (winning L1 bid, its bond,
  current owner) and runs `@ont/consensus`' `verifyProofBundle` locally before emitting — so
  it never hands out a bundle it knows is invalid. The result verifies offline without
  trusting the resolver that served it.
- **Network I/O is opt-in and replaceable:** reads/publishes against any resolver (no authority
  granted to it); broadcasts only with `--broadcast`, via an Esplora API (mempool.space by
  default, your own node via `ONT_BROADCAST_URL`).
- **The Lexe leg (§5):** the wallet's `LightningPayer` adapter (Lexe sidecar over local HTTP,
  plus an offline stub) is the integration point that future `claim --rail cheap` will use.
  There's no standalone `pay` command — the wallet isn't a general-purpose LN wallet; the
  whole point of integrating LN is making a name claim atomic with its payment.

**Honest gaps / tradeoffs:** it's a CLI, not the native-mobile app §4 envisions (the phone's
secure element is a hardening upgrade, not a requirement); the **cheap batched-claim rail
isn't wired end-to-end** — the live acquisition route is the on-chain auction path, and the LN
adapter is the integration point but not yet joined to a claim; `export-proof` covers names
still held by their original auction winner — extending it to the transfer chain + value
record chain is a follow-up; **recovery invoke** (the on-chain `RECOVER_OWNER` after the
challenge window) is also a follow-up. Everything here is the mutable client layer; the
consensus core is untouched.

---

## 1. Should ONT provide a default wallet? Yes — it's close to necessary

Two things force it:

1. **The trust-minimized claim flow needs ONT-aware client software** (verify a name's availability
   and a Merkle inclusion proof, talk to publishers, manage the owner key, fall back to L1). No stock
   wallet does this, so *someone* must ship it. A reference wallet is the natural vehicle, and it
   becomes the reference implementation others re-implement against an open spec.
2. **It kills the Sparrow dependency.** Sparrow was a demo crutch (sign/broadcast PSBTs with software
   the user already trusts). A real wallet has key-gen, signing, and broadcast built in, so a normal
   user never touches Sparrow — basically required for non-technical adoption.

### Neutrality guardrails (non-negotiable)

The danger is the wallet quietly becoming a trust hub or a *required* component. To stay consistent
with neutrality (I3) and "freeze the core":

- **Open protocol spec + open client library** so alternative wallets are easy to build.
- **Open source + reproducible builds** — auditable, not a backdoor.
- **Self-custodial; the project never holds keys or names.**
- **Verify against Bitcoin** — the wallet only helps *build* transactions and *check* answers;
  protocol correctness never depends on it being honest.
- **Reference, not gatekeeper.** The moment "you need the official wallet" is true, neutrality is
  gone. Encourage multiple clients.

## 2. Architecture: an ONT layer on a programmable, non-custodial Lightning node

Rather than build a Lightning wallet from scratch, build the **ONT-specific layer** on top of a
non-custodial, always-online, programmable LN node — **Lexe** is the reference shape (LDK-based,
self-custodial Lightning nodes in Intel SGX enclaves, 24/7 uptime, open/reproducible/attested, with
Rust + sidecar REST SDKs).

- **ONT layer (what we build):** owner-key management on-device, availability + inclusion-proof
  verification, publisher selection, payment/swap orchestration, L1 fallback, transfers, recovery.
  Shipped as an **open `ont` client library + spec** so it's not tied to one wallet.
- **Lightning rail (lean on Lexe):** the always-online non-custodial node solves the brutal part
  (reliable mobile LN, liquidity, being a swap counterparty). Integrate via the SDK/sidecar.
- **On-chain rail (also already there):** running an LN node requires an on-chain wallet underneath
  (Lexe uses BDK), so the on-chain side — bonds, bids, settlement, transfers, recovery, and the
  self-claim L1 fallback — can live in the same app. That means the whole **claim → auction → own →
  update → recover** experience could be one in-app flow, and it replaces the Sparrow PSBT crutch. The
  on-chain bidding is the *conventional* half; the exotic part is the LN swap. Open: whether the SDK
  exposes PSBT-level construction (custom outputs / OP_RETURN) or only high-level sends — see
  [`OPEN_QUESTIONS_FOR_EXPERTS.md`](./OPEN_QUESTIONS_FOR_EXPERTS.md).
- **Relationship to Lexe: build-on-top + upstream PRs, _not_ a fork.** Forking means inheriting their
  enclave + node code *and running your own enclave hosting* (losing their meganode hosting) and
  diverging forever. Contribute any missing primitives upstream; let Lexe be the flagship integrator.
- **Preferred integration path (engagement status, 2026-05):** the hope is Lexe ships ONT as a
  first-class entry in its app (an "ONT" tab), with us building the integration and submitting it to
  merge. Fallback: an independent reference app, likely still built on Lexe's open-source node. This
  depends on Lexe's appetite, which is still open — early conversations are encouraging (their founder
  has engaged on the design), but nothing is committed.

### Key-custody split (the load-bearing rule)

The ONT **owner key controls a name permanently** — a far higher bar than a hot LN balance.

- **Owner key:** generated and held by the ONT layer in the **phone's on-device secure element**,
  backed by ONT's **armed-recovery** design. A *separate* key — **not** derived from the LN node's
  root seed, and **not** in any shared cloud enclave.
- **Lightning credential:** Lexe's model (enclave + phone, with a convenience-grade encrypted Google
  Drive backup) governs only the **1,000 sats (~$1) payment leg**. Fine for that — a Google lockout there is a
  recoverability annoyance, not a theft surface.
- The two keys **bind only at swap time**; they are never co-mingled. So Lexe's Google dependency
  never touches the name-controlling key.

## 3. Onboarding: progressive sovereignty (start simple, keep a real path)

Early, low-stakes simplicity is a huge benefit for testing and adoption — *as long as it isn't
required and there is a real path to full sovereignty.* The invariant that makes the path real:

> **Decouple the owner key's identity from its storage.** The key is generated on-device and is the
> same key forever; Google Drive / hardware / multisig are *swappable backup methods* over it.
> "Upgrade sovereignty" = *change where the key is backed up* — **same key, same name, no migration.**
> (Critical because mainnet names are permanent.)

**Tiers** (the protocol never knows which tier anyone is on — all client-side):

| Tier | Storage of the owner key | Trust posture |
| --- | --- | --- |
| **Test / signet** | anything, incl. raw Google convenience | zero real stakes — be maximally simple |
| **Early mainnet (default)** | on-device key + optional (default-on) **client-side-encrypted** cloud backup + armed-recovery-by-default | convenient, escapable, **not-takeable** |
| **Hardening** | drop the cloud copy / hardware / multisig | full self-custody — one tap, same key/name |

**The one cheap guardrail even in convenience mode (mainnet):** keep the cloud backup
**client-side encrypted** — Google is *storage*, not *recovery authority*. Then the difference between
"easy onboarding" and "we accidentally became custodial" is preserved nearly for free: an early
tester's name still can't be *taken* by a Google-account compromise or a compelled Google; worst case
is a recoverability hiccup, caught by armed recovery. (On signet, don't even bother.) **Be honest in
the UI** about the active tier, since a name is permanent.

## 4. Platform: native mobile primary, never the only client

- **Native mobile (iOS/Android)** as the primary on-ramp: where users are, and the only place you get
  a hardware **secure enclave** for the owner key.
- **Mitigate app-store gatekeeping** (a real neutrality tension for a sovereignty app): open-source +
  reproducible + **sideloadable (APK / F-Droid)**, plus a **web/desktop path** (desktop can pair with
  the user's own node for max sovereignty). Never the *only* client.

## 5. Payments & the swap/PTLC question — an upgrade, not a launch blocker

Who writes to the chain: in the common uncontested path the **publisher** writes the anchor; the
wallet writes L1 directly only for the **self-sovereign fallback, a contested→auction bid, or a
transfer**.

How the user pays the publisher their 1,000 sats (~$1) gate, by tier of trust-minimization:

1. **Now / launch — naive pay to a *reputable* publisher.** Early publishers are known, always-online
   entities (wallet vendors, Lexe-style services, aligned institutions — see the "who runs publishers"
   analysis). For a **1,000 sats (~$1)** stake, **reputation + the L1 fallback + a rare absorbed 1,000 sats** is good enough;
   pay-on-inclusion-proof reverses the residual risk onto whoever is more trusted. **No PTLC, no
   adaptor signatures, works today.**
2. **Hardening — the adaptor/conditional-payment swap** (payment ⟺ the specific anchor committing your
   verified root). Trustless against an *arbitrary* publisher. Bilateral (user ↔ a specific publisher,
   plausibly a direct channel), so it needs *endpoint* support, **not network-wide PTLC routing** —
   and a self-controlled node like Lexe can adopt it ahead of network-wide rollout.
3. **Floor — self-sovereign N=1 L1 claim.** Zero publisher trust, always available.

**Does building on Lexe solve the swap/PTLC problem?** It doesn't *solve* it, but it **largely removes
it from the critical path**: (a) reputable always-online publishers make naive-pay fine for a 1,000 sats (~$1) stake at
launch; (b) Lexe is the ideal vehicle to later implement the trustless swap *bilaterally*, sidestepping
network-wide PTLCs; (c) the L1 path is always the trust floor. So the swap is a **hardening upgrade**,
most valuable for higher-value names (scarce/short) and anonymous-publisher scale — exactly when
Lexe-grade tooling exists to do it. See [`../design/ONT_ISSUANCE_FEE_MECHANICS.md`](../design/ONT_ISSUANCE_FEE_MECHANICS.md).

## 6. Open questions / dependencies

Mostly resolvable directly with the Lexe founders and a Lightning protocol expert — see
[`OPEN_QUESTIONS_FOR_EXPERTS.md`](./OPEN_QUESTIONS_FOR_EXPERTS.md):

- Does Lexe's SDK/sidecar expose (or could it expose, upstream) **conditional/adaptor payments** bound
  to an external on-chain event? (decides build-on-top vs. upstream-PR for the swap)
- Can an ONT integration hold a **separate on-device owner key outside Lexe's credential/backup flow**
  (not derived from the Google-backed root seed)? (gates the custody split in §2)
- **PTLC vs. ECDSA-adaptor-today** for the bilateral swap; realistic timeline.
- Lexe's appetite to be the **flagship ONT wallet**.
- Mobile non-custodial LN / LSP-liquidity friction; who funds/maintains a reference wallet (public
  good, not a business — same shape as the publisher economics).
