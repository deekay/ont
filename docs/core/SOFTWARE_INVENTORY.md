# ONT Software Inventory — code fates and the spec normativity ledger

> **Status: DRAFT — pending adversarial review.** This is the B1-blocking
> ledger required by clean-build (#46) Item 3, in two halves: every code unit
> classified with its doc-rule mapping, and every spec file's normativity
> status. Per the normative-hardening amendment, **no spec section enters as
> `normative`** — promotion is earned per section through the five-step
> hardening before the phase that implements it. Snapshot basis:
> `main` @ 60d4673, ~57k lines TS.

## Half 1 — Code: classification and fates

Classification vocabulary (Item 3): **keep-as-reference** (quarantined and
expected to be read often — primary mining material), **rewrite**
(functionality re-implemented blank-page from the spec; old unit quarantined),
**retire** (functionality does not return), **unknown** (must resolve before
its layer's phase starts). Under Item 6 (nothing is precious) *every* unit's
code is quarantined to `legacy/` at B1 start; the classification states what
the unit's *functionality* and *code* are for during the rebuild.

### Packages

| Unit | Lines | What it is (verified read) | Doc rules it maps to | Fate |
| --- | --- | --- | --- | --- |
| `packages/protocol` | ~3.8k | wire layer: name grammar, canonical encoding, event/payload formats, signatures, constants; vector-rich (`wire-size.test.ts` pins the 171-byte recover-owner bound) | `spec/` wire sections; STATUS key numbers (OP_RETURN size, bond curve) | **rewrite → `@ont/wire` (B1)**; prime vector-mining source |
| `packages/consensus` | ~2.0k | audited core, 3 CI-locked files (boundary-manifest (#44)) | acquisition state machine, settlement-into-core (#42), bond-opens (#37) | **rewrite → `@ont/consensus` (B2)**; CI-locked files are keep-as-reference-grade mining |
| `packages/core` | ~11.1k | machinery + research sims; experiment-infected; name collision ("core" retired) | state transitions (kernel rules currently outside the audited boundary); proof construction | **rewrite → split**: state transitions → `@ont/consensus` (B2), proofs → `@ont/evidence` (B3); research sims **retire** to quarantine |
| `packages/bitcoin` | ~2.2k | RPC/Esplora plumbing (block fetch, polling) | none (non-deciding I/O) | **rewrite** (B3/B4 support) |
| `packages/architect` | ~1.4k | **resolved (was unknown):** Bitcoin PSBT builder for auction bids, transfers (gift/sale), recovery; `index.ts` (~1.0k) + `browser.ts` (~340, bids-only for web/mobile); consumed by wallet, cli, web; structural validation only, no rule-deciding logic | publisher protocol spec (bid/transfer artifact shapes); recovery invoke spec | **rewrite** — non-deciding client-side artifact construction, lands in `@ont/evidence` or a surfaces support lib (placement decided at B3 spec hardening); PSBT shapes are mining material |
| `packages/db` | ~1.1k | **resolved (was unknown):** Postgres/file persistence; single `ont_documents` JSONB table keyed (kind, document_key); snapshot serialization; no consensus logic | none (boundary rule: persistence is adapters-only) | **rewrite** (B4, inside adapters); schema is reference, not law |

### Apps

| Unit | Lines | What it is (verified read) | Doc rules it maps to | Fate |
| --- | --- | --- | --- | --- |
| `apps/publisher` | ~2.3k | write-side adapter: pay-first, quotes, signet anchoring, data-availability serving (`/da/{root}`), per-leaf loss detection + refund | publisher protocol spec; data-availability agreement | **rewrite** (B4) |
| `apps/indexer` | ~0.4k | **resolved (split was unclear):** batch block-ingestion orchestrator, no HTTP; delegates all rule application to `packages/core`'s engine; writes snapshots via `packages/db` | none directly (orchestration) | **rewrite** (B4) — likely absorbed into the new resolver's ingestion path rather than kept as a separate app (B4 spec decision) |
| `apps/resolver` | ~3.0k | **resolved:** HTTP read API + signed-submission acceptance (value records, recovery descriptors/proofs); `validation.ts` guards append-only stores (signature, sequence, ownership-ref) — store guards, not consensus rules; carries `ONT_EXPERIMENTAL_AUCTION_*` runtime config (~50 lines) | publisher protocol spec (read side); recovery invoke spec (submission rules) | **rewrite** (B4). Flag for the hunting list: the experimental-auction config block is old-model-leakage bait; the submission-validation rules must be spec-cited or dropped |
| `apps/web` | ~17.0k | largest unit; site/explorer/tools | glossary (user-facing copy law); operate/ walkthroughs | **rewrite** (B5) |
| `apps/wallet` | ~4.7k | wallet CLI; 2/72 pre-existing test failures (proof-export) | recovery invoke spec; 12-word secret conformance | **rewrite** (B5); conformance vectors are mining material |
| `apps/cli` | ~6.5k | operator/prototype CLI; demo residue suspected | operate/ | **rewrite** (B5) after a demo-residue pass; residue **retires** |
| `apps/claim` | ~1.0k | self-contained claim site; `keys.conformance.test.ts` locks the 12-word cross-surface derivation | 12-word secret conformance; claim flow | **rewrite** (B5); conformance test is keep-as-reference-grade mining |

**No unit remains `unknown`.** The three Item-3 unknowns (`packages/architect`,
`packages/db`, the indexer/resolver split) were resolved by direct read on
2026-06-11 and classified above.

### Named mining sources (Item 2's golden artifacts)

- `packages/protocol/src/wire-size.test.ts` — wire-size pins.
- Root-anchor codec vectors pinned byte-identical against the BDK spike.
- 12-word-secret cross-surface vectors (engine, web, mobile,
  `apps/claim/src/keys.conformance.test.ts`).
- Proof-bundle fixtures (highest-bid-wins + distinct-bid well-formedness).
- `packages/consensus`'s three CI-locked files (boundary-manifest (#44)).

## Half 2 — Spec normativity ledger

Per the hardening amendment: every rule-bearing section enters as
**`candidate`**; `normative` is earned per section via the five-step
hardening, just-in-time for the phase that implements it. Non-rule-bearing
material is `analysis`. Status is recorded here and as a status header in
each spec file (headers land in the same PR as each file's first hardening
pass, so files are touched once with review).

| Spec file | Enters as | Hardened for phase | Notes |
| --- | --- | --- | --- |
| `spec/AUCTION.md` | candidate | B2 | bond-opens (#37) semantics; transcript completeness feeds the kernel predicate |
| `spec/CONFORMANCE.md` | candidate | B1 | vector definitions; B1 gate consumes it first |
| `spec/CONTESTED_AUCTION_REFERENCE.md` | candidate | B2 | reference flow; check old-model leakage against bond-opens |
| `spec/ONT_ACQUISITION_STATE_MACHINE.md` | candidate | B2 | the kernel's backbone; first hardening target |
| `spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` | candidate | B2/B3 | fail-closed deadline verdict; **blocked on the pre-B2 marker-vs-folded-anchor named spec decision (OPEN_QUESTIONS §1.1)** |
| `spec/ONT_ISSUANCE_FEE_MECHANICS.md` | candidate | B2 | aggregate gate-fee validation |
| `spec/ONT_PUBLISHER_PROTOCOL_SPEC.md` | candidate | B3/B4 | wire shapes harden earlier (B1) if cited there |
| `spec/ONT_RECOVERY_INVOKE_SPEC.md` | candidate | B2 (authority rules) / B5 (flows) | split by section at hardening |
| `GLOSSARY.md` | candidate | B1 onward | vocabulary law; terms cited by tests harden with their sections |
| `core/STATUS.md` parameter table | candidate | per parameter | several values are explicit placeholders (notice window, min bond, service fee) — placeholders cannot harden past candidate |
| `research/*` (live six) | analysis | — | inputs, never implementable |
| `research/archive/*` | analysis | — | superseded; mining context only |

## Standing obligations this ledger creates

- B1 cannot start until this ledger is reviewed and merged (Item 3) and the
  signet decommission event has been announced (ruled call 5).
- Each phase's opening PR cites this ledger and the hardening sign-offs for
  the sections it implements.
- Changes of fate (e.g., a `retire` resurrecting) are ledger PRs, not inline
  decisions.
