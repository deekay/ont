# ONT — Own your name on Bitcoin

ONT lets anyone own a human-readable name — like `alice` — that is **truly theirs**, secured by
Bitcoin, with no company, registrar, token, or rent.

This is the single source of truth for what ONT is and how it works. Everything else in `docs/` is
either a deeper reference or earlier research, and is secondary to this document.

---

## What it is

A name in ONT is a short, human-readable string you own outright. Owning it means holding a key that
controls it — with that key you can transfer the name or set what it points to (say, a payment
destination). No one else can move it, take it, or make you pay to keep it. Anyone can look a name up
and verify who owns it, checking the answer against Bitcoin rather than trusting whoever told them.

## Why it matters

- **Truly owned.** One-time cost, then it's yours: no rent, no renewal, no expiry, no revocation.
  Once a name is yours, no one — not even the project's creators — can take it.
- **Neutral.** No registrar, no admin, no token, no founder name-grab. Names are handed out by a
  fixed mechanical rule, never by anyone's judgment or discretion.
- **Verifiable without trust.** You can prove you own a name, and anyone can check it against Bitcoin
  without trusting a server. A lying server gets caught, not obeyed.
- **Bitcoin-native.** Bitcoin supplies the ordering and the final settlement. ONT adds no new
  blockchain and no new token.
- **Built to scale.** Room for billions of names — people, businesses, agents, devices — without
  bloating Bitcoin.

## How it works

**A name and its owner.** A name is controlled by an owner key. With that key you sign transfers (to
hand the name to someone else) and updates (to change what the name points to). That signature is the
only thing that can move a name.

**Claiming a name — one path.** There's a single way in, and it only branches if a name is contested:

1. **Claim it.** Pay a small fixed amount of bitcoin — **₿1,000 (~$1)**, as a fee to Bitcoin miners —
   to claim the name you want. (A few thousand obviously-scarce names, like very short ones, start
   higher.)
2. **A short notice window opens.** If no one else claims the same name during it, the name is simply
   yours — the common case, and it's cheap. Behind the scenes, thousands of these uncontested claims
   are bundled into a single Bitcoin commitment, which is how the system scales to billions of names.
3. **If someone else wants it too, it's contested** — and *only then* does it escalate to an
   **auction**. Contestation is the one thing that turns a name into a bond-backed, auctioned name.

**How the auction works.** Everyone who wants the contested name bids, and each bid is backed by a
*returnable* Bitcoin bond — real skin in the game, not destroyed money. The highest bid wins; the
winner's bond stays locked for a while as a commitment, then is returned. Because genuinely contested
names are rare, auctions are the exception, not the rule.

Either way — uncontested, or won at auction — you end up with the same thing: a globally unique name
controlled by your key.

**Everyone agrees who owns what.** There is no authority that decides ownership. Every participant
computes the same answer by replaying Bitcoin in order. Two honest observers always arrive at the same
owner for a name — which is what lets a name mean one thing, everywhere.

**You can prove it, and check anyone.** Ownership comes with a portable proof that anyone can verify
against Bitcoin. Apps, wallets, and resolvers mirror and verify this data; they never get to decide
it.

**If you lose your key.** You can arm a backup recovery arrangement ahead of time, so a lost key isn't
the end. Crucially, only *you* can set it up and only your pre-arranged keys can use it — recovery can
never be turned into a way for someone else to take your name.

**Why it costs a little.** The small claim cost keeps spam and squatting expensive without charging
rent. It's paid to Bitcoin miners, so it strengthens Bitcoin's security rather than enriching the
project. The amount is **fixed in bitcoin** — **₿1,000**, meaning 1,000 bitcoin base units
(0.00001 BTC), about $1 at present. (We write bitcoin amounts this way throughout: a ₿ figure is the
truth, the `~$` is just a casual helper that drifts.) It is *not* pegged to a dollar, which would
require a trusted price feed — so its dollar value drifts as Bitcoin's price moves. We accept that drift deliberately
(it keeps the rule simple and trustless); if claiming ever feels expensive, wallets or communities
can sponsor the fee for users without changing the rule itself.

## Why you can keep trusting it

ONT is built to be **frozen, like Bitcoin** — not a service that quietly changes under you. The rules
that decide ownership are deliberately small and auditable (a careful reader can confirm them in a
handful of files). The project operates no privileged role. And any future change is **opt-in**: no
one can force a new version of the rules on you.

## What's working today

The core lifecycle — claim, own, transfer, update, recover a name, and settle a contested name by
auction — runs end-to-end on a private Bitcoin test network. The batched commitment that lets cheap
uncontested claims scale to billions is prototyped and measured, and is being hardened before it goes
live. This is a matter of *maturity, not direction*: the design above is the plan, and the parts not
yet live don't change it.

## Going deeper

- **[The Sovereignty Map](./design/ONT_SOVEREIGNTY_MAP.md)** — the exact, minimal set of rules that
  guarantee no one can take your name, and where each lives in the code.
- **[Design reference](./design/README.md)** — the mechanics, risks, and scaling design in depth.
- **Earlier explorations** (in `docs/research/`, marked historical) — paths we considered and did
  *not* pursue, kept for honesty. They are not part of the plan above; don't read them as the design.
