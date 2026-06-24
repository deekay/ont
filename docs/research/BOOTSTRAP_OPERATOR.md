# `bootstrap-operator` — auditable single-operator launch mode (decision paper)

**Status: DRAFT — decision-ready. ChatLunatique GREEN with ratification conditions (no veto);
awaiting DK ruling.** Writer ClaudeleLunatique; reviewer ChatLunatique (review events `895b53e6`,
`be1a89fbf37f`, `5748c776`). Proposed DECISIONS name `bootstrap-operator` (next number **#89** — DK
assigns). On ruling, the DECISIONS.md entry is written from this paper.

**This is a launch-MODE / sequencing decision — NO new consensus law.** It pins launch posture on top
of the already-ratified da-trust-model (#82), batch-completeness (#83), and availability-height (#84).
It adds nothing to `@ont/consensus`.

---

## The statement (proposed DECISIONS entry)

**`bootstrap-operator`** — ONT launches as an **auditable single-operator launch mode with mandatory
verification and a written decentralization ladder.** One honest operator runs indexer + resolver +
publisher + archive; all name-state derives deterministically from Bitcoin + a public, append-only,
content-addressed archive (hash on-chain, bytes off-chain). The worst a bad operator can do is **go
down or censor — never forge or steal** (the #82 da-trust-model firewall: safety unconditional,
liveness bootstrapped). The launch mode is explicitly *not* the final protocol: decentralization is a
written 4-rung ladder, each rung removing one trust assumption against an **objective exit
threshold**.

The title carries the framing constraint ChatLunatique insisted on: this is a deliberately
centralized *launch mode*, not a disguised final protocol.

---

## The one ruling

*Adopt `bootstrap-operator` for launch* — subject to the ratification conditions below. Everything
else in the 2026-06-21 adversary docket is either **answered-now** or **deferred-to-a-rung-with-a-
written-trigger**.

---

## Ratification conditions (ChatLunatique — folded as conditions, not objections)

Green-light is conditional on all five. The first three are **launch-blocking build gates**; the last
two are launch-blocking discipline.

**RC-1 — Light-client verification is a hard launch blocker.** Clients MUST require
`bitcoinInclusion` and run `verifyProofBundleAgainstBitcoin` against an independent canonical header
source on every relevant proof path, enforced end-to-end **before cutover** (#82 invariant 4 /
`D-light-client-gate`). If clients accept resolver/operator state without verifying proof bundles
against Bitcoin, the operator becomes trusted for ownership and the whole argument collapses. Cheap
and mostly built — finish and enforce it.

**RC-2 — No soft dependency on the operator archive.** Day one requires: content-addressed **archive
export**, **portable receipts/material/proofs** (a user can hold their own), **deterministic mirror
instructions**, and **≥1 operator-funded public archive**. Archive durability is launch-blocking *in
portable form* — users must not be operationally trapped behind private operator storage. (Fully
*replicated* redundancy is Rung 2; portability is day-one.)

**RC-3 — A minimal re-derive verifier is a launch gate alongside RC-1.** Ship a "re-derive from
scratch" verifier so the operator is *trusted-but-caught* from day one: anyone recomputes the entire
name-state from Bitcoin + archive and detects operator misbehaviour. May be a **CLI / replay command +
fixtures + documented mirror/archive format** — not necessarily polished UX. (RC-1 stops ownership
lies in normal client flows; RC-3 makes the operator *catchable*. They are complementary launch
gates.)

**RC-4 — The ladder has objective exit criteria** (see ladder table) — measurable thresholds, never
"when mature."

**RC-5 — Product copy must not lie about what is solved.** Bootstrap does NOT solve
squatting/legitimacy, discovery capture, archive liveness, or operator censorship — it makes those
non-safety launch risks **explicit and removable**. Copy says: *ONT secures the string;
verification/discovery is non-authoritative.*

---

## Launch-blocking build gates (the must-ship set)

| Gate | What ships | Source condition |
|---|---|---|
| **G-A Light-client gate** | `verifyProofBundleAgainstBitcoin` enforced end-to-end on every relevant proof path, against an independent canonical header source. | RC-1 / #82 inv.4 |
| **G-B Re-derive verifier** | CLI/replay command + fixtures + documented mirror/archive format; recomputes full name-state from Bitcoin + archive. | RC-3 |
| **G-C Portable material** | Content-addressed archive export + portable receipts/material/proofs + deterministic mirror instructions + ≥1 operator-funded public archive. | RC-2 |
| **G-D DA deadline tests green** | The four-case battery below passes as conformance tests. | RC-3 (semantics) |
| **G-E Honest copy** | Non-authoritative framing wired into product surfaces. | RC-5 |

---

## DA deadline test battery (exact semantics — RC-3 / G-D)

DA means "material is in the public archive by the deadline." Late backfill must **not** revive
cheap-path priority. Required conformance tests (consistent with availability-height #84 —
`firstServableHeight = h` — and the existing `enforcement-e2e` §6.3 battery):

1. **Bare anchor → no mutation.** An anchor with no presented material applies no name-state delta.
2. **Missing material → no mutation.** Material withheld past the deadline fails closed; no mutation.
3. **Late material → no cheap-path priority revival.** Material presented after the deadline does not
   resurrect priority (the accumulator path collapses `firstServableHeight` to `h`; priority races
   route to bonded/L1 per #84).
4. **Valid user-supplied material before deadline → accepted.** Material whose bytes reconstruct the
   anchored commitment, presented in-window, is accepted.

---

## The collapse map — 2026-06-21 docket item → disposition

| Docket item | Disposition |
|---|---|
| **D-light-client-gate** | **Launch-blocking (G-A / RC-1).** |
| **D-legitimacy-layer** (squatting / astroturf) | **Answered — permanent design stance + RC-5.** Consensus rejects post-finality re-contest; non-authoritative verification/discovery UX + loud "secures the string, not the brand" framing. Off-protocol by design; not a rung. |
| **D-notice-schedule** | **Answered — freeze long-at-launch.** Height-floor/decay/extend-only schedule (~90d→7d) + bond-floor curve; da-windows #49 `(K,W,C)` stay launch-freeze parameters. |
| **D-batch-blast-radius** | **Answered — mitigate, keep fail-closed.** Batch-size caps + pre-seal validation + reclaim/retry UX + publisher accountability (#83 fail-closed unchanged). |
| **D-archive-liveness** | **Launch-blocking in portable form (G-C / RC-2); full replication → Rung 2.** |
| **D-discovery-bootstrap** | **Launch: signed/config seed set (operator-attested); deferred → Rung 4.** |
| **served-material-transport** (gating LE-DA-SERVE + LE-INVOKE) | **Answered.** Operator serves bytes over plain HTTP, content-addressed, hash-reverified (the minimal-binary REC). Permissionless transport is Rung 3. |

**Net: the pile shrinks to one ruling** — adopt `bootstrap-operator` for launch, with RC-1..RC-5.

---

## The decentralization ladder — objective exit criteria (RC-4)

Each rung is independently shippable, removes exactly one trust assumption, and reopens on a
**measurable** threshold (not narrative). Deferring a rung only ever costs liveness, which the ladder
buys back.

| Rung | Removes | What ships | Objective exit trigger |
|---|---|---|---|
| **1 — Verifiable** | *trusted* → *trusted-but-caught* | The re-derive verifier/replay tool + documented mirror format (G-B). **Shipped at launch** per RC-3 — not deferred. | n/a (day-one launch gate). |
| **2 — Replicated** | single point of *serving* | ≥1 independent mirror/operator running the same deterministic pipeline; clients cross-check (determinism ⇒ bit-for-bit convergence). | A measurable trigger fires: archive byte-count or claim-volume threshold crossed; operator downtime/censorship incident recorded; ≥1 unresolved archive-missing case; OR a second operator target exists. |
| **3 — Permissionless availability** | operator-attested DA | The already-designed `LE-DA-SERVE` transport + bonded challenge game; anyone publishes/challenges. | Long-tail volume threshold crossed OR a recorded withholding incident operator-attested DA could not resolve. |
| **4 — Permissionless discovery** | signed seed list | On-chain seed announcements (D-discovery-bootstrap v2) replace the signed list; operator becomes one resolver among many. | Number of third-party operators above threshold OR client-default concentration (one resolver serving > X% of clients) becomes a measurable centralization chokepoint. |

(Concrete numeric thresholds for Rungs 2–4 are a launch-freeze parameter set, frozen with the rest of
the launch params — the requirement here is that each trigger is *measurable*, per RC-4.)

---

## Boundary resolutions (my three open boundaries — RESOLVED by ChatLunatique)

1. **Archive durability** → **launch-blocking in portable form, not fully replicated** (RC-2 / G-C).
   Day one: content-addressed export + portable receipts/material/proofs + deterministic mirror
   instructions + ≥1 operator-funded archive. Independent redundancy = Rung 2.
2. **Verifier placement** → **launch gate**, alongside the light-client gate (RC-3 / G-B). CLI/replay
   + fixtures; trusted-but-caught from day one.
3. **Trigger concreteness** → **objective measurable thresholds** (RC-4): claim volume, archive byte
   count, downtime/censorship incidents, unresolved archive-missing cases, third-party-operator
   count, client-default concentration.

---

## Ripple / next steps (after DK ruling)

- Write the DECISIONS.md `bootstrap-operator` entry (#89) from this paper — statement + RC-1..RC-5 +
  ladder + DA test battery.
- Mark `served-material-transport` answered in the LE-DA-SERVE / LE-INVOKE design notes (operator HTTP
  + content-addressed + hash-reverify) → unblocks LE-INVOKE.
- Update `ONT_DECENTRALIZATION_AND_DISCOVERY.md` "recommended order of work" to the rung framing;
  cross-link from STATUS.md / GO_LIVE_PLAN.md.
- Tee the launch-blocking gates (G-A..G-E) as the go-live work-list; freeze the Rung 2–4 numeric
  thresholds with the launch param set.
