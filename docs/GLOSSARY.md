# ONT — Glossary

The jargon law (doc-canon (#45), item 5): **one concept, one name, defined
once — here.** Prose uses plain words with the term in parentheses at first
use; no other document defines a term. If a doc and this glossary disagree on
what a word means, fix the doc.

House renames (ratified 2026-06-11): the four batch-path synonyms — "cheap
rail", "accumulator rail", "batch rail", "batched commitment" — are all **the
batched claim path**; "bare claim" is written as plain words ("a claim with no
bond"); "DA" is written out as **data availability** in prose (the `DA`
abbreviation and the `W`/`C`/`K` window notation appear only inside `spec/`);
"frozen core" is **audited core (frozen at launch)**; "rail" as a metaphor is
retired in favor of "path".

Amounts: **₿, where ₿1 = 1 satoshi** (see the ₿ entry).

---

**anchor** — the on-chain commitment of a batch: one Bitcoin transaction whose
OP_RETURN carries `prevRoot → newRoot` for the accumulator. Anchoring is what
gives a batch Bitcoin ordering and timestamping. A claim is "anchored" once its
batch's anchor confirms.

**audited core (frozen at launch)** — the small set of consensus files
(`packages/consensus/src/`, CI-locked) that decide name state, intended to be
frozen at launch the way Bitcoin's consensus rules are. "Audited" is the claim
a reader can check today; "frozen at launch" is the commitment. What sits
inside it versus outside is the honest boundary drawn in
[`core/STATUS.md`](./core/STATUS.md).

**₿** — ONT's unit notation: **₿1 = 1 satoshi** (so ₿1,000 = 1,000 sats ≈ $1
at ~$100k/BTC). The ₿ amount is the protocol truth; any dollar figure beside it
is a casual helper that drifts with the price.

**batched claim path, the** — the cheap, default way a name is acquired: a
claim is paid for, batched by a publisher into a sparse-Merkle accumulator,
anchored to Bitcoin in one transaction shared with thousands of other claims,
and finalized if its notice window closes clean. The expensive alternative is
the contested path (see *contested*). Replaces the retired synonyms "cheap
rail", "accumulator rail", "batch rail", and "batched commitment".

**bond** — returnable bitcoin posted to contest or defend a name. A
**qualifying bond** (at or above the bond floor) is the only thing that opens
an auction (Decision #37); the largest bond wins. Bonds are locked, not spent —
returnable after release — and are an ONT-level designation over a plain
output, enforced by the audited core, not by Bitcoin script. A claim with no
bond can never take a contested name (see *nullified*).

**bond-first** — opening the auction directly with a bond, with no prior cheap
claim. The natural path for a known-premium name; mandatory (with length-scaled
opening bonds) for names of 4 characters or fewer.

**claim gate** — the fixed ₿1,000 miner fee paid to make any claim. It is
anti-spam, not a price: it goes to Bitcoin miners, not to any registrar or
operator, and it deliberately does not ration scarce names (bonds and auctions
do that).

**contested** — the state of a name once a qualifying bond is posted against it
inside its notice window (or bond-first). A contested name escalates to the L1
bonded auction; the highest bid wins. Bare collisions do not contest a name —
they nullify it.

**data availability** — the requirement that a batch's bytes actually be
public, not just committed to on-chain, so anyone can recompute name state from
Bitcoin. The fail-closed rule: a batch whose bytes don't surface in time is
excluded, never trusted. Written out in prose; the `DA` abbreviation and the
`W`/`C`/`K` window notation are used only inside
[`spec/ONT_DATA_AVAILABILITY_AGREEMENT.md`](./spec/ONT_DATA_AVAILABILITY_AGREEMENT.md).

**final** — a claim whose notice window closed clean (no qualifying bond, no
bare collision). Finality is derived from chain state at the window's closing
height, not from any server's say-so. Until then a claim is *provisional*.

**first-anchor-wins** — the deterministic merge rule among non-conflicting
claims: when the same name is claimed on different batches outside a live
window, the earliest Bitcoin-anchored claim holds. Ordering inside a window
never awards a contested name (bonds do).

**mature owner** — an owner whose winning bond has passed maturity and been
released: ownership with no remaining bond encumbrance, indistinguishable from
an uncontested claimant's.

**maturity** — the period a winning bond must stay posted after an auction
(parameter: ~1 year; see *settlement lock*). Spending the bond early without a
valid successor forfeits the name (it reopens — an ONT rule, not a Bitcoin
timelock). After maturity the bond releases.

**notice window** — the waiting period a claim's anchor opens before the claim
can finalize. Its only job is fairness: it gives anyone else who wants the name
time to post a bond. Closes clean → final; qualifying bond → contested; bare
collision → nullified. Length is a placeholder parameter
([`core/STATUS.md`](./core/STATUS.md)).

**nullified** — the outcome when two or more claims with no qualifying bond
collide in a window: the name resolves to **no owner** and reopens for
claiming. Collisions can deny; only bonds can award (Decision #37). This is
what makes ordering games and bare front-running worthless.

**owner key** — the key that *is* ownership. It signs value records, transfers,
and recovery setup, off-chain. Distinct from the wallet key that signs Bitcoin
transactions; both derive from one 12-word secret (Decision #41).

**proof bundle** — the portable evidence package that lets anyone verify a
name's ownership against Bitcoin without trusting a resolver: anchors,
membership proofs against the anchored root, and (for auction names) the bid
transcript. What the bundle does and does not yet self-certify is tracked in
[`core/STATUS.md`](./core/STATUS.md).

**provisional** — a claim that is anchored but whose notice window is still
open. Visibly not yet owned: wallets and resolvers must not present a
provisional claim as final.

**publisher** — the write-side service: quotes a price, takes payment, batches
claims into the accumulator, anchors, and serves batch bytes and inclusion
proofs. A convenience, never an authority — it cannot forge ownership, and
anyone can run one or go direct to L1.

**resolver** — the read-side service: an independent mirror that derives name
state from Bitcoin and answers lookups. Holds no authority; every answer is
checkable against Bitcoin, so a resolver is only ever *convenient*, not
*trusted*.

**settlement lock** — the parameter implementing *maturity*: how long a winning
bond stays locked after settlement (currently 52,560 blocks ≈ 1 year, a
placeholder). One concept with *maturity*; "settlement lock" names the
parameter, "maturity" names the period and the state change.

**value record** — the owner-signed, off-chain record saying what a name
points to (payment target, URL, profile). Updatable any time by the owner key,
versioned; ownership and records are separate layers — a stale record never
means a lost name.
