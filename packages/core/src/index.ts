// @ont/core public surface, grouped by trust level. The authoritative account of
// what is and isn't sovereignty-critical lives in docs/design/ONT_SOVEREIGNTY_MAP.md;
// trust-surface.test.ts freezes the boundary so the core below cannot silently grow
// to depend on the groups beneath it.

// --- Frozen sovereignty core (the trust surface) ---
// Lives in its own package, @ont/consensus, so the rules that decide whether a name
// can be taken depend only on @ont/protocol + @ont/bitcoin and can never import the
// allocation, indexer, website, or research code below. Re-exported here for the
// convenience of existing @ont/core consumers. See docs/design/ONT_SOVEREIGNTY_MAP.md.
export * from "@ont/consensus";

// --- Allocation (NOT the sovereignty core) ---
// Decides WHO gets a contested or premium name, not whether ownership is sovereign
// once held. Important, but a separate concern (see ONT_SOVEREIGNTY_MAP.md).
export * from "./auction-policy.js";
export * from "./auction-sim.js";
export * from "./auction-state.js";
export * from "./auction-market-sim.js";
export * from "./experimental-auction.js";

// --- Convenience (NOT the sovereignty core) ---
// Serves and replays answers for clients; cannot forge ownership. A lying indexer
// is caught by verifying against Bitcoin, not obeyed.
export * from "./indexer.js";

// --- Research / simulations (NOT consensus) ---
// Property prototypes and numerical models. None of these can take or change a name;
// they exist to validate scaling-design claims. See src/research/README.md.
export * from "./research/accumulator.js";
export * from "./research/delta-merge-sim.js";
export * from "./research/da-convergence-sim.js";
export * from "./research/recovery-sim.js";
export * from "./research/root-anchor.js";
export * from "./research/batch-rail.js";
export * from "./research/sponsored-flat-issuance-sim.js";
