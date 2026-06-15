import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const srcDir = dirname(fileURLToPath(import.meta.url));

// The sovereignty trust-surface MANIFEST of @ont/consensus.
// See docs/DESIGN.md (trust surface / sovereignty map) ("the whole trust surface: ~7 files").
// Today these modules hold owner-key authority and replay validation: a name
// moves only if its current owner key signed it, and that is provable to
// anyone. They do NOT yet decide all ownership — auction settlement and
// cheap-rail finalization live outside and are migrating inside per Decisions
// #42/#44 (see docs/core/STATUS.md for the honest scoped claim). They must
// depend ONLY on the protocol/bitcoin primitives and on each other — never on
// allocation policy, convenience (indexer/resolver), or research/simulation
// code.
//
// Per Decision #44 (docs/core/DECISIONS.md), this list is a boundary manifest,
// not a dev-time freeze: during development it MAY change, but only together
// with a numbered DECISIONS.md entry and conformance coverage — this test
// exists so *silent* drift fails the build. The boundary freezes permanently
// at public/mainnet launch (a launch-gate checklist item). If you are editing
// this list, write the decision entry first.
//
// The audited B2 package splits into four tiers (DECISIONS b2-scanner-boundary
// (#57), b2-consensus-params-boundary (#58), b2-consensus-verdicts-boundary
// (#59)). "Consensus-deciding" is NOT synonymous with "state-mutating":
//   - CORE_DECIDERS: the state/replay deciders. They MUTATE name state — a
//     name's owner moves only if these say so — via owner-key authority and
//     deterministic Bitcoin replay.
//   - CONSENSUS_SUPPORT: non-mutating but consensus-bearing input normalization
//     (the scanner: skip-bad, future-version gating, same-block-order, and the
//     >1-RootAnchor whole-tx reject decide which bytes ever reach the deciders,
//     so two implementations that scan differently fork before the core sees
//     anything — it must be audited, but it has zero authority to mutate name
//     state, so it is not a decider).
//   - CONSENSUS_PARAMS: the pure consensus-parameter surface (the validated
//     (K, W, C) DA-window triple per canon Item 5). It mutates nothing and
//     decides nothing on its own — it is the parametric input the audited rules
//     are evaluated against, so the deciders depend on it, not the reverse. It
//     takes values as caller inputs and depends on nothing outside the audited
//     modules (no external package, no host I/O).
//   - CONSENSUS_VERDICTS: pure verdict deciders (the DA-verdict predicate; the
//     value-record authority predicate). They ARE consensus-deciding — a claim
//     counts only if the verdict says so (D10) — but they compute a verdict the
//     state deciders consume rather than mutating state themselves, so they are
//     listed separately from CORE_DECIDERS. Pure: they consume witnessed facts,
//     the audited parameter surface, and — only where a specific verdict needs
//     them — the audited B1 wire digest/verification primitives (@ont/wire); no
//     host I/O and no state mutation (#60). The external allowlist is pinned PER
//     FILE, not tier-wide: da-verdict.ts rides nothing external; only
//     value-record-authority.ts admits @ont/wire (see VERDICTS_ALLOWED_BY_FILE).
const CORE_DECIDERS = ["engine.ts", "state.ts", "proof-bundle.ts"] as const;
const CONSENSUS_SUPPORT = ["scanner.ts"] as const;
const CONSENSUS_PARAMS = ["params.ts"] as const;
const CONSENSUS_VERDICTS = ["da-verdict.ts", "value-record-authority.ts", "gate-fee.ts", "transcript-completeness.ts", "bond-qualification.ts", "settlement.ts", "recovery-invoke-authority.ts", "auction-resolution.ts", "notice-window.ts", "reopen-resolution.ts", "occupancy.ts", "batch-exclusion.ts", "window-schedule.ts", "name-canonicalization.ts", "claim-path-eligibility.ts", "post-final-attempt.ts", "lot-commitment-match.ts", "bond-continuity-break.ts", "transfer-authority-state.ts", "fee-fact-eligibility.ts"] as const;

// Consensus-support rides the B1 normative wire grammar (@ont/wire); the parameter
// surface rides nothing external (values enter as inputs).
//
// The core-decider allowlist is pinned PER FILE (the #60 pattern, extended to the
// state-mutating deciders by b2-core-deciders-wire-auth-digests (#61)): engine.ts rides
// @ont/protocol (event codec/types) + @ont/bitcoin (tx shape) + @ont/wire (the B1 §5
// owner-key auth digests transferAuthDigest/recoverAuthDigest/verifySchnorr), while
// state.ts and proof-bundle.ts stay as narrow as before (no @ont/wire). Pinning per file
// stops the same silent tier-wide expansion #60 fixed for CONSENSUS_VERDICTS — admitting
// @ont/wire to a state-mutating decider is justified only for engine.ts, only for the
// §5 digests, and only because the equivalence pins prove they match the legacy digests.
const CORE_DECIDERS_ALLOWED_BY_FILE: Record<string, ReadonlySet<string>> = {
  "engine.ts": new Set(["@ont/protocol", "@ont/bitcoin", "@ont/wire"]),
  "state.ts": new Set(["@ont/protocol", "@ont/bitcoin"]),
  "proof-bundle.ts": new Set(["@ont/protocol", "@ont/bitcoin"])
};
const SUPPORT_ALLOWED_PACKAGES = new Set(["@ont/wire", "@ont/bitcoin"]);
const PARAMS_ALLOWED_PACKAGES = new Set<string>([]);
// The verdict allowlist is pinned PER FILE, not tier-wide. da-verdict.ts rides
// nothing external — its verdict is computed from witnessed facts + the parameter
// surface alone — so a tier-wide @ont/wire allowance would let it silently grow a
// wire dependency on nothing but self-discipline. Only value-record-authority.ts
// admits @ont/wire: it must verify a §8.1 Schnorr signature and recompute a §8.1
// record digest, which are B1 wire primitives (NOT the legacy @ont/protocol v2
// records, which WIRE §8.1 declares evidence-only). #60 permits the verdict tier
// to admit audited B1 wire primitives where a specific verdict needs them; this
// map records which file actually does and mechanically holds the others empty
// (b2-consensus-verdicts-wire-primitives (#60), amending #59).
const VERDICTS_ALLOWED_BY_FILE: Record<string, ReadonlySet<string>> = {
  "da-verdict.ts": new Set<string>([]),
  "value-record-authority.ts": new Set(["@ont/wire"]),
  // gate-fee is a pure structural gate over witnessed (anchor, batch, fee); it rides
  // nothing external (no g(name) schedule here — B3), so its allowlist is empty (#62).
  "gate-fee.ts": new Set<string>([]),
  // transcript-completeness is a pure predicate over a counted bid transcript + a
  // B3-verified completeness witness; it rides nothing external (witness format + lot
  // range are B3), so its allowlist is empty (#63).
  "transcript-completeness.ts": new Set<string>([]),
  // bond-qualification is the pure #37 escalation qualification test (bond >= floor); the
  // floor is a launch-freeze parameter, so it rides nothing external — allowlist empty (#64).
  "bond-qualification.ts": new Set<string>([]),
  // settlement holds the S5 lock-commitment match + S15 materialization gate; both pure over
  // their inputs + a launch-freeze maturity parameter, riding nothing external — allowlist empty (#65).
  "settlement.ts": new Set<string>([]),
  // recovery-invoke-authority is the pure acceptRecoverOwner authorization/evidence gate; it must
  // recompute the W13 invoke digest (recoverAuthDigest), the §8.2a descriptor digest
  // (recoveryDescriptorDigest), and verify BIP340 signatures (verifySchnorr) against the B1
  // invokable-version constant — so it rides @ont/wire B1 primitives only (#67).
  "recovery-invoke-authority.ts": new Set(["@ont/wire"]),
  // auction-resolution is the pure opening-floor / bid-acceptance / winner-selection surface; it
  // consumes launch params + B3-verified lot/script facts and rides nothing external (#68).
  "auction-resolution.ts": new Set<string>([]),
  // notice-window is the pure finalize/nullify/escalate/provisional verdict at the notice deadline;
  // it consumes resolved per-claim DA verdicts + the launch W_notice param and delegates bond
  // qualification to the resident #37 predicate (./bond-qualification.js) — riding nothing external (#69).
  "notice-window.ts": new Set<string>([]),
  // reopen-resolution is the pure reopen/re-auction generation verdict; it derives the latest
  // bond-break release height from witnessed break facts and matches the reopen lot's anchor,
  // riding nothing external (#70).
  "reopen-resolution.ts": new Set<string>([]),
  // occupancy is the pure insertion-only / no-takeover-of-final gate; it consumes a name's resolved
  // governing occupancy and rides nothing external (#71).
  "occupancy.ts": new Set<string>([]),
  // batch-exclusion hosts two verdicts: (1) the pure insert-only batched-insertion derivation for the
  // DA-exclusion locality / state-equivalence property (DA verdict enters as consumed
  // excludedBatchIds, #72); and (2) #83 batch-completeness `evaluateBatchCompleteness`, which COMPUTES
  // the canonical-root replay itself (D-CV is kernel law, ratified #83) and therefore rides the audited
  // @ont/protocol accumulator primitive `accumulatorRootOf` — the per-file allowlist-extension pattern
  // (admit an audited primitive where a specific verdict needs it). No host I/O, no state mutation.
  "batch-exclusion.ts": new Set<string>(["@ont/protocol"]),
  // window-schedule is the pure height-keyed, extend-only window-length verdict; anchor height + a
  // frozen value-free schedule enter as inputs and it rides nothing external (#74).
  "window-schedule.ts": new Set<string>([]),
  // name-canonicalization is the pure A6 reject-don't-normalize gate; it rides the audited B1
  // canonical-name primitive isCanonicalName, so it admits @ont/wire only (#75).
  "name-canonicalization.ts": new Set(["@ont/wire"]),
  // claim-path-eligibility is the pure PR-15 short-name threshold gate over a canonical byte length +
  // launch threshold; it rides nothing external (#76).
  "claim-path-eligibility.ts": new Set<string>([]),
  // post-final-attempt is the pure B7 state-shape gate — a post-final claim/bond attempt is refused
  // with no state effect; it consumes a resolved final incumbent + attempt kind, riding nothing
  // external (#77).
  "post-final-attempt.ts": new Set<string>([]),
  // lot-commitment-match is the pure B12 WIRE §6 recompute-and-compare gate; it rides the audited B1
  // computeLotCommitment primitive, so it admits @ont/wire only (#78).
  "lot-commitment-match.ts": new Set(["@ont/wire"]),
  // bond-continuity-break is the pure S6 observed-spend release gate over resolved chain facts; no
  // signer/key channel, riding nothing external (#79).
  "bond-continuity-break.ts": new Set<string>([]),
  // transfer-authority-state is the pure X11 gate — transfer authority requires an owned lifecycle
  // state; it consumes the resolved nameLifecycleState, riding nothing external (#80).
  "transfer-authority-state.ts": new Set<string>([]),
  // fee-fact-eligibility is the pure F9 gate — a fee fact exists only once K-deep on the current
  // canonical chain, valued at the anchor's own intrinsic fee; rides nothing external (#81).
  "fee-fact-eligibility.ts": new Set<string>([]),
};
const ALL_MANIFEST = [...CORE_DECIDERS, ...CONSENSUS_SUPPORT, ...CONSENSUS_PARAMS, ...CONSENSUS_VERDICTS];
const ALLOWED_RELATIVE = new Set(ALL_MANIFEST.map((file) => `./${file.replace(/\.ts$/, ".js")}`));

function importSpecifiers(file: string): readonly string[] {
  const text = readFileSync(join(srcDir, file), "utf8");
  const specifiers: string[] = [];
  // `import ... from "x"`, `import type ... from "x"`, `export ... from "x"`.
  const fromRe = /\bfrom\s*["']([^"']+)["']/g;
  // Bare side-effect imports: `import "x"`.
  const bareRe = /\bimport\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = fromRe.exec(text)) !== null) {
    specifiers.push(match[1] as string);
  }
  while ((match = bareRe.exec(text)) !== null) {
    specifiers.push(match[1] as string);
  }
  return specifiers;
}

function assertImportsAllowed(file: string, allowedPackages: ReadonlySet<string>, tier: string): void {
  for (const specifier of importSpecifiers(file)) {
    if (specifier.startsWith("node:")) {
      continue;
    }
    const allowed = allowedPackages.has(specifier) || ALLOWED_RELATIVE.has(specifier);
    expect(
      allowed,
      `${file} (${tier}) must not import "${specifier}". It may depend only on ` +
        `${[...allowedPackages].join(", ")}, node builtins, and the other audited B2 modules ` +
        `(${ALL_MANIFEST.join(", ")}). Importing allocation (auctions), indexer/resolver ` +
        `convenience, or research/simulation code here would silently expand the trust surface a ` +
        `newcomer must audit. See docs/DESIGN.md (trust surface / sovereignty map) and ` +
        `DECISIONS b2-scanner-boundary (#57).`
    ).toBe(true);
  }
}

describe("sovereignty trust surface (docs/DESIGN.md (trust surface / sovereignty map))", () => {
  for (const file of CORE_DECIDERS) {
    const allowed = CORE_DECIDERS_ALLOWED_BY_FILE[file];
    const allowedDesc = !allowed ? "(no per-file allowlist — manifest error)" : [...allowed].join(", ");
    it(`${file} (core decider) depends only on ${allowedDesc} and audited modules`, () => {
      expect(
        allowed,
        `${file} is listed in CORE_DECIDERS but has no entry in CORE_DECIDERS_ALLOWED_BY_FILE. ` +
          `Each core decider's external allowlist is pinned individually (#61); add an explicit entry.`
      ).toBeDefined();
      assertImportsAllowed(file, allowed as ReadonlySet<string>, "core decider");
    });
  }

  it("engine.ts no longer rides the legacy @ont/protocol auth verifiers (now @ont/wire digests, #61)", () => {
    const engineSrc = readFileSync(join(srcDir, "engine.ts"), "utf8");
    for (const legacy of ["verifyTransferAuthorization", "verifyRecoverOwnerCancelAuthorization"]) {
      expect(
        engineSrc.includes(legacy),
        `engine.ts must verify B1 §5 owner-key signatures via @ont/wire (verifySchnorr + ` +
          `transferAuthDigest/recoverAuthDigest), not the legacy @ont/protocol ${legacy} — see ` +
          `b2-core-deciders-wire-auth-digests (#61).`
      ).toBe(false);
    }
  });

  for (const file of CONSENSUS_SUPPORT) {
    it(`${file} (consensus support) depends only on @ont/wire grammar, @ont/bitcoin, and audited modules`, () => {
      assertImportsAllowed(file, SUPPORT_ALLOWED_PACKAGES, "consensus support");
    });
  }

  for (const file of CONSENSUS_PARAMS) {
    it(`${file} (consensus params) depends on no external package — only audited modules`, () => {
      assertImportsAllowed(file, PARAMS_ALLOWED_PACKAGES, "consensus params");
    });
  }

  for (const file of CONSENSUS_VERDICTS) {
    const allowed = VERDICTS_ALLOWED_BY_FILE[file];
    const allowedDesc = !allowed
      ? "(no per-file allowlist — manifest error)"
      : allowed.size === 0
        ? "no external package"
        : `${[...allowed].join(", ")} B1 primitives`;
    it(`${file} (consensus verdict) depends only on ${allowedDesc} and audited modules`, () => {
      expect(
        allowed,
        `${file} is listed in CONSENSUS_VERDICTS but has no entry in VERDICTS_ALLOWED_BY_FILE. ` +
          `Each verdict file's external allowlist is pinned individually (#60); add an explicit ` +
          `entry (an empty set means empty-external).`
      ).toBeDefined();
      assertImportsAllowed(file, allowed as ReadonlySet<string>, "consensus verdict");
    });
  }

  it("every source file in the package is part of the documented audited manifest", () => {
    // @ont/consensus exists to BE the trust surface, so its production modules
    // should be exactly the documented decider + support files — nothing else
    // slips in here.
    const production = readdirSync(srcDir)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && file !== "index.ts")
      .sort();
    expect(production).toEqual([...ALL_MANIFEST].sort());
  });
});
