<!--
GENERATED FILE - DO NOT EDIT.
Generator: scripts/gen-audit-map.mjs
Source: packages/consensus/src/trust-surface.test.ts
Regenerate: node scripts/gen-audit-map.mjs --write
-->

# @ont/consensus Audit Surface Map

Audited files: 25 across 4 tiers.

## CORE_DECIDERS

State/replay deciders that mutate name state through owner-key authority and deterministic Bitcoin replay.

| file | external-import allowlist |
| --- | --- |
| `engine.ts` | `@ont/protocol`, `@ont/bitcoin`, `@ont/wire` |
| `state.ts` | `@ont/protocol`, `@ont/bitcoin` |
| `proof-bundle.ts` | `@ont/protocol`, `@ont/bitcoin` |

## CONSENSUS_SUPPORT

Consensus-bearing input normalization: the scanner decides which bytes reach the deciders.

| file | external-import allowlist |
| --- | --- |
| `scanner.ts` | `@ont/wire`, `@ont/bitcoin` |

## CONSENSUS_PARAMS

Pure consensus-parameter surface: validated DA-window inputs consumed by audited rules.

| file | external-import allowlist |
| --- | --- |
| `params.ts` | (none) |

## CONSENSUS_VERDICTS

Pure verdict deciders consumed by state deciders; they decide consensus predicates without mutating state.

| file | external-import allowlist |
| --- | --- |
| `da-verdict.ts` | (none) |
| `value-record-authority.ts` | `@ont/wire` |
| `gate-fee.ts` | `@ont/bitcoin` |
| `transcript-completeness.ts` | (none) |
| `bond-qualification.ts` | (none) |
| `settlement.ts` | (none) |
| `recovery-invoke-authority.ts` | `@ont/wire` |
| `auction-resolution.ts` | (none) |
| `notice-window.ts` | (none) |
| `reopen-resolution.ts` | (none) |
| `occupancy.ts` | (none) |
| `batch-exclusion.ts` | `@ont/protocol` |
| `window-schedule.ts` | (none) |
| `name-canonicalization.ts` | `@ont/wire` |
| `claim-path-eligibility.ts` | (none) |
| `post-final-attempt.ts` | (none) |
| `lot-commitment-match.ts` | `@ont/wire` |
| `bond-continuity-break.ts` | (none) |
| `transfer-authority-state.ts` | (none) |
| `fee-fact-eligibility.ts` | (none) |
