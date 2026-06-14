// B2 transaction scanner / skip-bad boundary.
//
// A pure classification layer that sits between the wire decoder and the
// ownership kernel. It turns a transaction's OP_RETURN outputs into ordered
// valid ONT events plus zero-side-effect diagnostics, enforcing the ratified
// skip-bad spine: same-block-order (#55) and one-anchor-per-tx (#54). It does
// NOT mutate state, reserve outpoints, verify signatures, or check semantic
// authority — those are downstream kernel predicates.
//
// Spec: docs/core/B2_SKIP_BAD_CLASSIFICATION.md (classification table +
// future-version gating + zero-partial-side-effects), riding the normative
// wire decoder in docs/spec/WIRE_FORMAT.md via @ont/wire.

import { decodeEvent, MAGIC, type OntEvent, EventType } from "@ont/wire";

/**
 * How a single transaction output was classified by the ONT scan.
 * - `non-ont`            — not ONT-shaped; ignored entirely.
 * - `invalid-ont-shaped` — carries the `ONT` magic but is not a valid
 *                          active-version event; zero side effects.
 * - `inactive-version`   — well-framed `ONT` payload whose version is not
 *                          active at this height; inert pending a named
 *                          activation rule (no silent hardfork).
 * - `valid`              — a fully decoded active-version event.
 */
export type ScanClass = "non-ont" | "invalid-ont-shaped" | "inactive-version" | "valid";

/** One transaction output as handed to the scanner. */
export interface ScanInputOutput {
  readonly vout: number;
  /** The OP_RETURN data segment, or null for a non-OP_RETURN / empty output. */
  readonly payload: Uint8Array | null;
}

export interface ScanContext {
  readonly height: number;
  readonly txIndex: number;
  /** Event frame versions active at `height`. B2 today: `{0x01}`. */
  readonly activeVersions: ReadonlySet<number>;
}

/** Per-output classification result (diagnostics; never a state effect). */
export interface ScanOutput {
  readonly vout: number;
  readonly class: ScanClass;
  /** Non-null iff `class === "valid"`. */
  readonly event: OntEvent | null;
  /** Human-readable reason; empty for valid events. */
  readonly diagnostic: string;
}

/** A valid event tagged with its position for same-block-order (#55). */
export interface OrderedEvent {
  readonly height: number;
  readonly txIndex: number;
  readonly vout: number;
  readonly event: OntEvent;
}

export interface TxScanResult {
  readonly height: number;
  readonly txIndex: number;
  /** Every output, ascending vout, with its classification. */
  readonly outputs: readonly ScanOutput[];
  /** Applicable valid events, ascending vout. Empty when `ontRejected`. */
  readonly events: readonly OrderedEvent[];
  /** Whole-transaction ONT reject — true when one-anchor-per-tx (#54) fires. */
  readonly ontRejected: boolean;
  /** Reason for a whole-tx reject; empty otherwise. */
  readonly rejectReason: string;
}

const MAGIC_BYTES = ((): readonly number[] => {
  const codes: number[] = [];
  for (let i = 0; i < MAGIC.length; i++) codes.push(MAGIC.charCodeAt(i));
  return codes;
})();

const hasMagic = (payload: Uint8Array): boolean =>
  payload.length >= MAGIC_BYTES.length && MAGIC_BYTES.every((b, i) => payload[i] === b);

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : "decode failed";

/**
 * Classify one OP_RETURN payload. Pure; never throws. A non-ONT or
 * invalid/inactive output yields no event and is purely diagnostic.
 */
export function classifyOutput(
  payload: Uint8Array | null,
  activeVersions: ReadonlySet<number>,
): { readonly class: ScanClass; readonly event: OntEvent | null; readonly diagnostic: string } {
  if (payload === null) return { class: "non-ont", event: null, diagnostic: "non-OP_RETURN or empty output" };
  if (payload.length < MAGIC_BYTES.length) return { class: "non-ont", event: null, diagnostic: "shorter than ONT magic" };
  if (!hasMagic(payload)) return { class: "non-ont", event: null, diagnostic: "magic is not ONT" };

  // ONT-shaped from here: a malformed frame is a diagnostic, never a side effect.
  if (payload.length < 5) {
    return { class: "invalid-ont-shaped", event: null, diagnostic: "truncated frame: missing version/type byte" };
  }

  // Version gate before type/length: a non-active version is inert pending a
  // named activation rule, and is reported distinctly so activation behavior is
  // observable (B2_SKIP_BAD_CLASSIFICATION.md future-version gating).
  const version = payload[3] as number; // frame: magic[0..2], version[3], type[4]
  if (!activeVersions.has(version)) {
    return {
      class: "inactive-version",
      event: null,
      diagnostic: `frame version 0x${version.toString(16).padStart(2, "0")} not active at this height`,
    };
  }

  // Active version: delegate full validity (type registry, exact length,
  // canonicality) to the normative wire decoder. Any rejection is a zero-effect
  // invalid-ont-shaped diagnostic.
  try {
    const event = decodeEvent(payload);
    return { class: "valid", event, diagnostic: "" };
  } catch (err) {
    return { class: "invalid-ont-shaped", event: null, diagnostic: errorMessage(err) };
  }
}

/**
 * Scan one transaction's outputs into ordered valid events + diagnostics.
 * Enforces one-anchor-per-tx (#54): more than one valid RootAnchor rejects ALL
 * ONT effects of the transaction (no accepted anchor and no sibling effects).
 */
export function scanTransaction(outputs: readonly ScanInputOutput[], ctx: ScanContext): TxScanResult {
  const ordered = [...outputs].sort((a, b) => a.vout - b.vout);

  const classified: ScanOutput[] = ordered.map((o) => {
    const c = classifyOutput(o.payload, ctx.activeVersions);
    return { vout: o.vout, class: c.class, event: c.event, diagnostic: c.diagnostic };
  });

  const validEvents: OrderedEvent[] = classified
    .filter((o): o is ScanOutput & { event: OntEvent } => o.class === "valid" && o.event !== null)
    .map((o) => ({ height: ctx.height, txIndex: ctx.txIndex, vout: o.vout, event: o.event }));

  const anchorCount = validEvents.filter((e) => e.event.type === EventType.RootAnchor).length;
  if (anchorCount > 1) {
    return {
      height: ctx.height,
      txIndex: ctx.txIndex,
      outputs: classified,
      events: [],
      ontRejected: true,
      rejectReason: `one-anchor-per-tx (#54): ${anchorCount} valid RootAnchor events in one tx`,
    };
  }

  return {
    height: ctx.height,
    txIndex: ctx.txIndex,
    outputs: classified,
    events: validEvents,
    ontRejected: false,
    rejectReason: "",
  };
}

/** One transaction's outputs together with its in-block index. */
export interface ScanBlockTx {
  readonly txIndex: number;
  readonly outputs: readonly ScanInputOutput[];
}

/**
 * Scan a block's transactions into per-tx results ordered by txIndex,
 * preserving every diagnostic — including whole-tx one-anchor-per-tx (#54)
 * rejects, so a caller can see that a rejected tx was seen and why, not merely
 * that its events vanished.
 */
export function scanBlockTransactions(
  txs: readonly ScanBlockTx[],
  ctx: { readonly height: number; readonly activeVersions: ReadonlySet<number> },
): readonly TxScanResult[] {
  return [...txs]
    .sort((a, b) => a.txIndex - b.txIndex)
    .map((tx) =>
      scanTransaction(tx.outputs, { height: ctx.height, txIndex: tx.txIndex, activeVersions: ctx.activeVersions }),
    );
}

/**
 * Convenience: the flat (height, txIndex, vout)-ordered stream of valid events
 * across a block (same-block-order #55). Whole-tx rejects contribute nothing;
 * use {@link scanBlockTransactions} to inspect why a tx was rejected.
 */
export function scanBlock(
  txs: readonly ScanBlockTx[],
  ctx: { readonly height: number; readonly activeVersions: ReadonlySet<number> },
): readonly OrderedEvent[] {
  return scanBlockTransactions(txs, ctx).flatMap((r) => r.events);
}
