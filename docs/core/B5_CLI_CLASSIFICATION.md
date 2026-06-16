# B5-CLI classification — the `ont` CLI clean-build triage

> **Status: TRIAGE (B5-CLI classify-first). Writer: ClaudeleLunatique. Reviewer: ChatLunatique.** Old
> `apps/cli` (@ont/cli, bin `ont`, ~6.5k) is quarantined at `legacy/apps/cli`. This is the command-by-command
> triage CL required before the rewrite (event 389d6db3). The clean CLI is a **thin orchestrator**: it consumes
> L1-L4 (`@ont/*` adapters + claim-path) and reimplements no rules; it holds **no keys and never signs**
> (signing → B5-WALLET / DI signer); broadcast/RPC/esplora are edge I/O. Build per the B5 bar (purpose/scope/
> tests; pure cores red→green; hermetic harness — mocked fetch/adapter ports, no live network; `check:surfaces`
> extended to `apps/cli` when the clean code lands). On `clean-build-b5`.
>
> **Calls:** KEEP = clean-build operator command (consume-don't-reimplement). DELEGATE = signing / key-material
> / W17 wallet-handoff artifact → B5-WALLET (CLI orchestrates + hands off, never signs). DROP = simulator /
> signet-demo / old-auction-market / sponsor-credit / old-model residue with no current adapter-backed use.

## First slice — read/query commands (KEEP, hermetic)

Pure request/output shaping over a **mocked fetch/adapter port** (no live resolver/esplora; no signing; no
broadcast). The smallest coherent operator-useful CLI.

| old command | call | clean replacement | first slice |
|---|---|---|---|
| `get-name` | KEEP | shape name → resolver fetch port → render name record (chain-derived, not-authority stamp) | ✅ |
| `get-name-activity` | KEEP | shape name → fetch port → render activity | ✅ |
| `get-value` | KEEP | shape name → fetch port → render value record | ✅ |
| `get-value-history` | KEEP | shape name → fetch port → render value history (carry resolver stamps) | ✅ |
| `get-recovery-descriptor` | KEEP | shape name → fetch port → render descriptor | ✅ |
| `get-recovery-descriptor-history` | KEEP | shape name → fetch port → render descriptor history | ✅ |
| `list-activity` | KEEP | shape query → fetch port → render activity list | ✅ |
| `get-tx` | KEEP | shape txid → chain fetch port → render tx (read-only) | ✅ |

## KEEP — later slices (edge I/O publish / verify / diagnostics; no signing)

| old command | call | clean replacement | first slice |
|---|---|---|---|
| `publish-value-record` | KEEP (edge) | publish an ALREADY-SIGNED value record to the resolver (its store-guard validates — B4-RESOLVE-GUARD) | — |
| `publish-recovery-descriptor` | KEEP (edge) | publish an already-signed descriptor (resolver store-guard validates — B4-RESOLVE-RECOVER) | — |
| `publish-recovery-wallet-proof` | KEEP (edge) | publish an already-signed wallet proof | — |
| `verify-recovery-wallet-proof` | KEEP (verify) | consume `@ont/protocol` verifyRecoveryWalletProof on a provided proof | — |
| `inspect-proof-bundle` | KEEP (verify) | consume the audited proof-bundle verification (`@ont/consensus`); no inline checks | — |
| `print-recovery-wallet-proof-message` | KEEP (pure) | render the BIP322 message template to sign (no key, no signing) | — |
| `broadcast-transaction` | KEEP (edge) | submit a fully-signed raw tx to a broadcast port (B4-PUB-BROADCAST edge; live smoke separate) | — |
| `check-rpc` | KEEP (edge) | bitcoin RPC connectivity diagnostic | — |
| `check-esplora` | KEEP (edge) | esplora connectivity diagnostic | — |
| `check-address` | KEEP (edge) | esplora address check diagnostic | — |

## DELEGATE → B5-WALLET (signing / key material / W17 wallet-handoff artifacts)

The CLI orchestrates assemble (via `@ont/adapter-publisher`) + hands signing off; it never holds keys.

| old command | call | note |
|---|---|---|
| `generate-live-account` | DELEGATE | key generation → wallet |
| `sign-artifacts` | DELEGATE | signing → wallet |
| `sign-value-record` | DELEGATE | signing/key flow → wallet |
| `sign-recovery-descriptor` | DELEGATE | signing/key flow → wallet |
| `build-recovery-wallet-proof` | DELEGATE | proof creation = signing/commitment → wallet |
| `build-auction-bid-artifacts` | DELEGATE | W17 auction-bid envelope + PSBT → wallet-handoff |
| `create-auction-bid-package` | DELEGATE | W17 auction-bid package → wallet-handoff |
| `build-transfer-artifacts` | DELEGATE | W17 transfer envelope + PSBT → wallet-handoff |
| `build-immature-sale-transfer-artifacts` | DELEGATE | W17 → wallet-handoff |
| `build-sale-transfer-artifacts` | DELEGATE | W17 → wallet-handoff |
| `submit-transfer` | DELEGATE | assemble (adapter) + SIGN (wallet) + broadcast (edge) — the signing leg is wallet-owned |
| `submit-immature-sale-transfer` | DELEGATE | signing leg → wallet |
| `submit-sale-transfer` | DELEGATE | signing leg → wallet |
| `inspect-transfer-package` | DELEGATE | W17 transfer-package inspector travels with the wallet artifact (reopen as KEEP-verify if a non-signing inspector is wanted) |
| `inspect-auction-bid-package` | DELEGATE | W17 auction-bid-package inspector → wallet artifact |

## DROP (simulator / old-auction-market / sponsor / old-model residue)

| old command | call | reason |
|---|---|---|
| `simulate-auction` | DROP | simulator residue (CL: aggressive drop) |
| `simulate-auction-market` | DROP | old auction-market simulator |
| `simulate-sponsored-issuance` | DROP | sponsor-credit residue |
| `print-auction-policy` | DROP | old-model auction-policy display (`@ont/core` auction); no adapter-backed operator use |

## Totals + next step

37 commands → **8 KEEP first-slice (read)**, **10 KEEP later (edge/verify)**, **15 DELEGATE→B5-WALLET**,
**4 DROP**. First B5-CLI slice = the 8 read commands as pure request/output shaping over a mocked fetch/adapter
port (hermetic; no live resolver/signing/broadcast). KEEP requires consume-don't-reimplement: no `@ont/core`
auction simulators, no inline predicates/windows/digests, no direct crypto packages (boundary-lint enforced).
Confirm-at-rewrite: the `inspect-*-package` DELEGATE-vs-KEEP-verify call (whether a non-signing inspector is
wanted in the CLI vs only in the wallet).

## Build status (clean-build-b5)

- **Read commands (8/8) — GREEN.** First read sub-slice `get-value-history` / `get-recovery-descriptor-history`
  / `get-tx` (`@ont/cli` shapers + renders over the injected `CliReadPort`, resolver stamps preserved). Raw-read
  sub-slice `get-name` / `get-value` / `get-recovery-descriptor` / `get-name-activity` / `list-activity` (lean ii:
  the CLI displays the resolver's raw JSON under a `ResolverRawRead` not-authority envelope; no B4 single-read
  projections).
- **Verify cores (3/3) — GREEN.** `print-recovery-wallet-proof-message` (consumes `createRecoveryWalletProofMessage`),
  `verify-recovery-wallet-proof` (surfaces `verifyRecoveryWalletProof` verbatim), `inspect-proof-bundle` (surfaces
  `verifyProofBundleStructure` verbatim — structural inspection, not Bitcoin finality).

### Edge KEEP commands — edge-I/O note (no unit slice; CL-concurred, like B4-PUB-BROADCAST §11.4)

The remaining KEEP commands are **edge I/O** with no recompute-don't-trust core to unit-gate; treated as a
written purpose/scope/tests note, live-network smoke deferred until a target exists (signet decommissioned). No
keys, no signing, no reinstated old CLI crypto deps.

- `publish-value-record` / `publish-recovery-descriptor` / `publish-recovery-wallet-proof` — POST an
  ALREADY-SIGNED artifact to the resolver; the resolver's B4 store-guards (`validateValueRecordSubmission` /
  `validateRecoveryDescriptorSubmission`) are the firewall, so the CLI is a thin edge poster. **Scope:** shape
  the request + hit a publish port; **tests:** mocked-port request shaping where useful + live smoke deferred.
- `broadcast-transaction` — submit a fully-signed raw tx to a broadcast port (Esplora/node). **Scope/tests:**
  edge; live smoke deferred (same posture as B4-PUB-BROADCAST §11.4).
- `check-rpc` / `check-esplora` / `check-address` — connectivity / address diagnostics. **Scope/tests:** edge
  diagnostics; live smoke deferred.

With this, **all B5-CLI KEEP commands are accounted for** (reads + verify green; edge as this note). The 15
DELEGATE commands wait on **B5-WALLET** (the only signer + the W17 transfer/auction-bid handoff); the 4 DROP
commands are retired.
