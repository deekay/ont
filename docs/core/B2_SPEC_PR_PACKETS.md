# B2 Spec-PR Decision Packets — decision-ready for DK

> **Normativity: `analysis`** — advisory recommendations, NOT ratified law.
> The neutral gap catalog is [B2_SPEC_PR_REGISTRY.md](./B2_SPEC_PR_REGISTRY.md)
> Part A (36 PRs); this file augments each with **Options → Recommendation →
> Ripple** so DK can rule a batch fast on return. A recommendation here is
> ClaudeleLunatique's advisory call (writer/reviewer/DK protocol); **DK
> decides**, ChatLunatique reviews the packet. Per the parking rule, no
> consensus law is agent-decided — these only make the choices legible.

Each packet keys to a registry PR by number and lists its flags. "Ratify as
recommended" = adopt the recommended option as a named spec decision (and, where
noted, a one-sentence amendment to the cited doc). PRs are independent unless a
packet says "pairs with PR-n".

---

## PR-5. First-anchor-wins = earliest-VALID-anchor (conflict C1)

**Flags (4):** A12-01, D5-01, B8-01, B11-01. **Registry priority:** P1. **Blocking dependency:** new one-sentence named spec decision; no open named decision implicated (the rule TEXT is derivable now).

**Options**
- **(a) earliest-VALID-anchor** — the lifecycle keys to the earliest anchor that passed ALL eligibility verdicts (accepted + DA-eligible + gate-fee-covered); a forfeited/excluded anchor confers no priority, and a post-exclusion re-anchor starts a fresh window at its own height.
- **(b) earliest-ANCHORED** — the earliest decodable anchor on-chain wins priority regardless of whether it was ever eligible.

**Recommendation (advisory, for DK ratification): (a) earliest-VALID-anchor.**
Option (b) lets a withheld or DA-failed anchor resurrect priority simply by being earliest on-chain — the withhold-then-reveal resurrection attack — and lets an ineligible anchor block honest claimants. Option (a) closes both: a forfeited/excluded anchor confers no priority, and a post-exclusion re-anchor starts fresh, which is what "first-anchor-wins" is meant to express (the earliest *valid* claim holds; ordering never awards a contested name — bonds do, per #37). Conflict C1 resolves toward (a); same-(name,owner) re-claims are idempotent. This is the registry's stated conflict-resolved direction.

**Ripple**
- Locks the A12 / B8 / D5 / B11 (priority half) vectors once ratified.
- Rule TEXT is independent of #49 and PR-1 — those gate the *enforceability* of the forfeit verdict (served-bytes witness + window timing), not the rule itself; ratifiable now as a one-sentence amendment to the first-anchor-wins definition (GLOSSARY + the DA agreement).
- **Pairs with PR-6** (same first-anchor-wins definition block: "competing claim" = distinct-owner-key).
- No new attack surface; it removes one (withhold-then-reveal resurrection).

---

*Remaining PRs (PR-1..PR-4, PR-6..PR-36) to be added on the same Options →
Recommendation → Ripple shape; this PR-5 packet is the format template pending
ChatLunatique's review.*
