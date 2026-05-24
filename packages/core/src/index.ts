// --- v1 consensus + production ---
// The sovereignty-critical rules and the v1 acquisition/indexing machinery.
// See docs/design/ONT_SOVEREIGNTY_MAP.md for what is and isn't part of the trust surface.
export * from "./engine.js";
export * from "./state.js";
export * from "./proof-bundle.js";
export * from "./indexer.js";
export * from "./auction-policy.js";
export * from "./auction-sim.js";
export * from "./auction-state.js";
export * from "./auction-market-sim.js";
export * from "./experimental-auction.js";

// --- research / simulations (NOT consensus) ---
// Property prototypes and numerical models. None of these can take or change a name;
// they exist to validate scaling-design claims. See src/research/README.md.
export * from "./research/accumulator.js";
export * from "./research/delta-merge-sim.js";
export * from "./research/da-convergence-sim.js";
export * from "./research/recovery-sim.js";
export * from "./research/root-anchor.js";
export * from "./research/batch-rail.js";
export * from "./research/sponsored-flat-issuance-sim.js";
