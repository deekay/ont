// B2 consensus-parameter surface — data-availability windows and availability mode.
//
// Per canon Item 5 ("ChatLunatique signs the CONSENSUS_PARAMS surface") and the
// boundary manifest (Decision #44), the audited core is parameterized, never
// hard-coded: K (confirmation depth), W (availability window), C (challenge
// window), and the launch availability mode enter the kernel as explicit inputs,
// and @ont/consensus holds none of their values as a constant (G9 / D12). This
// module is the REQUIRED-tier slice of that surface — the DA-window triple that
// rules D9 / D12 / G9 govern, plus the §6 height-keyed availability-mode seam.
//
// The broader closed CONSENSUS_PARAMS set (G10: W_NOTICE, AUCTION_WINDOW,
// SOFT_CLOSE_WINDOW, the gate schedule, opening floors, qualifying-bond minimum,
// maturity blocks, accepted-payload cap, challenge-window bounds, ...) is
// candidate-stays / launch-parameter-freeze work with unresolved typing
// questions, and is deliberately NOT modeled here. It joins this surface as
// those typing questions resolve and the launch-parameter freeze lands.
//
// da-windows (#49) S6 ratifies the structural validity constraints this module
// enforces (K >= W+C, and the K/W/C >= 1 lower bounds). The concrete (K, W, C)
// values are NOT ratified: the S7 values (6, 2, 3) are provisional — for
// conformance/test only — and freeze at the launch-parameter freeze. So this
// module validates a caller-supplied triple and carries no defaults: no S7
// placeholder value can fossilize into the code. What is baked is the ratified
// structure; what stays caller-supplied is the launch-freeze value selection.
//
// Rules: docs/core/B2_KERNEL_HARDENING.md — D9 (window-fit invariant), D12 (no
// baked window values), G9 (parametric kernel). Spec sources cited there:
// docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md §6a/§6e/§11.

/**
 * The data-availability window triple — the required-tier slice of the
 * CONSENSUS_PARAMS surface. All three are integer Bitcoin block counts.
 */
export interface DaWindowParams {
  /**
   * Confirmation depth. A batch anchored at height `h` is eligible for the
   * canonical confirmed root only once `h` is K-deep, i.e. tip ≥ h+K (D9).
   * `K ≥ 1`.
   */
  readonly K: number;
  /**
   * Availability window. A batch's bytes must be demonstrably servable by
   * height `h+W` (D9 / §6a). `W ≥ 1`.
   */
  readonly W: number;
  /**
   * Challenge window, measured after the availability deadline: the challenge
   * deadline is `h+W+C`. `C ≥ 1`.
   */
  readonly C: number;
}

export type AvailabilityMode = "O1-collapsed" | "O2-in-band";

export interface LaunchParams {
  readonly launchHeight: number;
  readonly daWindow: DaWindowParams;
  readonly availabilityMode: AvailabilityMode;
}

/** Thrown when a `(K, W, C)` triple is not a valid DA-window parameterization. */
export class ConsensusParamsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsensusParamsError";
  }
}

/**
 * Require an integer block count `≥ 1` (G9 / G10 validity constraints). Rejects
 * non-integers (incl. `NaN`, fractions, and `undefined` from a missing field)
 * and values below 1, so there is no path to a silent zero/negative window.
 */
function requireBlockCount(label: string, value: number): void {
  if (!Number.isInteger(value)) {
    throw new ConsensusParamsError(`${label} must be an integer block count, got ${String(value)}`);
  }
  if (value < 1) {
    throw new ConsensusParamsError(`${label} must be >= 1, got ${value}`);
  }
}

/**
 * Construct a validated, frozen DA-window parameterization.
 *
 * Enforces exactly the required-tier constraints — no invented bounds:
 *  - `K`, `W`, `C` are integer block counts (G10).
 *  - `K ≥ 1`, `W ≥ 1`, `C ≥ 1` (G9 validity-constraint test).
 *  - `K ≥ W + C` — the D9 enforced window-fit invariant: the whole eligibility
 *    decision (availability at `h+W`, then challenge at `h+W+C`) must resolve
 *    inside the confirmation lag `h+K`, so a batch never finalizes with its
 *    challenge window still open (no include-then-retract). This is the strong
 *    form D9 picks over the weaker §6a `W ≤ K`. `K = W + C` is the tightest
 *    accepted fit.
 *
 * There is no default parameterization: every value is required and caller-
 * supplied, so no compile-time constant can fossilize into a protocol value
 * (D12 / G9 attack flag). The returned object is frozen for determinism.
 */
export function createDaWindowParams(input: { readonly K: number; readonly W: number; readonly C: number }): DaWindowParams {
  requireBlockCount("K (confirmation depth)", input.K);
  requireBlockCount("W (availability window)", input.W);
  requireBlockCount("C (challenge window)", input.C);

  if (input.K < input.W + input.C) {
    throw new ConsensusParamsError(
      `window-fit invariant violated: K (${input.K}) must be >= W + C ` +
        `(${input.W} + ${input.C} = ${input.W + input.C}); the eligibility decision ` +
        `must resolve before finalization (D9)`
    );
  }

  return Object.freeze({ K: input.K, W: input.W, C: input.C });
}

/**
 * Resolve the consensus availability mode at a block height from frozen launch
 * params. Today the mode is constant across heights; future activation logic must
 * enter here so reducers never read a global/tip mode.
 */
export function modeAt(_height: number, params: LaunchParams): AvailabilityMode {
  return params.availabilityMode;
}

/**
 * Whether a batch anchored at `anchorHeight` is eligible for the canonical
 * confirmed root at chain tip `tipHeight`: true once the anchor is K-deep
 * (`tipHeight ≥ anchorHeight + K`). This is da-windows (#49) S2's ratified
 * eligibility boundary `eligibleAt := H ≥ h+K` (inclusive at exactly `h+K`,
 * matching D9's test). Pure and parametric — evaluable at any valid
 * parameterization (G9).
 */
export function confirmedRootEligible(anchorHeight: number, tipHeight: number, params: DaWindowParams): boolean {
  return tipHeight >= anchorHeight + params.K;
}

/**
 * The availability deadline height `h+W`: a batch's bytes must be demonstrably
 * servable by this height. Returns the bare height — da-windows (#49) S2
 * ratifies inclusive deadlines ("by `h+X`" = height ≤ `h+X`), and the deadline
 * comparison itself belongs to the DA-verdict predicate (S3 `holdsPriority` /
 * `includable`, a later increment) that consumes this height.
 */
export function availabilityDeadlineHeight(anchorHeight: number, params: DaWindowParams): number {
  return anchorHeight + params.W;
}

/**
 * The challenge deadline height `h+W+C`, measured after the availability window.
 * Returns the bare height (see {@link availabilityDeadlineHeight} on the S2
 * inclusive-deadline reading and where the comparison lives).
 */
export function challengeDeadlineHeight(anchorHeight: number, params: DaWindowParams): number {
  return anchorHeight + params.W + params.C;
}
