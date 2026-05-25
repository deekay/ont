# ONT — Sovereignty Map

**For a newcomer who wants to answer one question: "if I own a name here, can anyone take it from me — and can I check that myself, without trusting anyone?"**

This is the map of the *trust surface*: the small set of rules that make a name yours, and exactly
where each lives in the code. ONT is meant to be read and frozen like a consensus system, not a
product that quietly changes under you — so this surface is deliberately tiny. If you understand the
rules below, you understand the whole sovereignty guarantee. Everything else in the repo (wallets,
indexers, the website, simulations) is convenience that *cannot* take your name.

Status: living map of the v1 sovereignty core, 2026-05-24.

---

## The guarantee in one table

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

---

## The rules, plainly

1. **A name is just a normalized string.** No hidden classes, no reserved lists — `normalizeName` maps any input to one canonical `[a-z0-9]{1,32}` form, so `Alice` and `alice` are the same name and there's no ambiguity about what you own.

2. **Ownership is a key, and only that key can move the name.** Your name's current state names an owner public key. To transfer it, the protocol requires a Schnorr signature from *that* key over the exact transfer (`prevStateTxid`, new owner, …). `applyTransfer` rejects anything else as `transfer_invalid_signature`. No signature from your key ⇒ the name does not move. Full stop.

3. **Uniqueness is enforced by deterministic replay, not by a server's say-so.** Everyone computes the same ownership state by replaying the same Bitcoin transactions in Bitcoin's order. A name that's already owned can't be re-claimed, and two honest nodes never disagree about who owns it.

4. **No rent, no revocation, no forced sale.** Read the rules and notice what's *missing*: there is no code path by which time passes and you lose a name, or by which any party reassigns it. The bond is returnable at maturity (opportunity cost, not a fee), and after maturity the name is held free. Sovereignty here is partly a guarantee about code that **does not exist**.

5. **Recovery is opt-in and can't be turned into theft.** If (and only if) you armed a backup arrangement with your own key, a pre-designated recovery wallet can start moving the name — and that opens a challenge window in which **your main key can cancel it**. No outsider can ever invoke it against you; it's recovery, never revocation. (Decided 2026-05-24: recovery is a first-class feature, with wallets arming a sensible default.)

6. **Bitcoin is the clock and the judge.** ONT adds no new consensus. Ordering and dispute finality come from Bitcoin; ONT clients just replay Bitcoin transactions through the rules above. That's why no ONT party can censor or reorder you beyond Bitcoin's own assumptions.

7. **You can verify your own name.** Ownership is provable with a portable, source-tagged proof bundle that a fresh verifier checks against the public chain — you never have to trust the resolver that handed it to you.

## How a skeptic verifies a name themselves

1. Take the name and the claimed owner key.
2. Replay the relevant Bitcoin transactions through the rules (`applyBlockTransactionsWithProvenance`) — or check a portable proof bundle with `verifyProofBundle`.
3. Confirm the chain of ownership ends at that key, every transfer along the way carried that-owner's signature, and no conflicting claim exists.
4. You needed no server's permission and no trust in the project — only Bitcoin and these rules.

## What is **not** in the trust surface (you can ignore it for sovereignty)

- **Resolvers / indexers** — they *serve* answers and replay the rules for convenience, but they can't forge ownership; you verify against Bitcoin. A lying resolver is caught, not obeyed.
- **Wallets, CLI, website** — they help you *build* transactions; they hold no authority over names.
- **Auctions** — they decide *who gets* a contested or premium name (allocation), not whether ownership is sovereign once held. Important, but a separate concern from "can my name be taken."
- **The long-tail accumulator rail** (the batched, cheap-issuance path) — additive, more complex, and **separately auditable**; it is being designed so it can never weaken the sovereignty of a name on the bonded core. It is not part of this minimal launch trust surface.
- **Everything labeled a simulation / prototype / experiment** — research that proves properties, not shipped consensus code.

## Frozen vs. mutable

- **Frozen (this map):** the consensus core — the rules above. Changes here require users to re-extend trust, so they should be rare and exceptional (opt-in only).
- **Mutable:** resolvers, indexers, wallets, the website, tooling, docs, research. These can improve freely because they can't take your name.

---

This boundary is **enforced in code**, not just documented: `packages/core/src/trust-surface.test.ts`
fails CI if the frozen core (`engine.ts`, `state.ts`, `proof-bundle.ts`) ever imports anything beyond
the `@ont/protocol`/`@ont/bitcoin` primitives and the other core files — so it can never silently
grow to depend on allocation (auctions), the indexer/resolver, or research/simulation code. The same
test keeps research a leaf nothing else depends on. An audit of the trust surface is therefore an
audit of those files plus the protocol-side rules above, and CI guarantees it stays that small.

A separate `@ont/consensus` package (frozen core) vs. `@ont/research` (sims/experiments) remains an
option, but the enforced in-package boundary already gives the audit guarantee without the extra
workspace plumbing — consistent with `feedback-freeze-minimal-auditable-core` (minimize complexity).
See also [`ONT_REQUIREMENTS_CONFORMANCE.md`](./ONT_REQUIREMENTS_CONFORMANCE.md) (the I1–I5 invariants
this surface implements).
