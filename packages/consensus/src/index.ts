// @ont/consensus — the frozen sovereignty core.
//
// This package is the whole trust surface inside the ONT codebase (with the
// protocol-side primitives in @ont/protocol): the rules that decide whether a
// name can be taken. A name moves only if its current owner key signed it;
// uniqueness and finality come from deterministic Bitcoin replay; ownership is
// provable to anyone. It depends only on @ont/protocol and @ont/bitcoin — never
// on allocation (auctions), the indexer/resolver, the website, or research/
// simulation code. trust-surface.test.ts freezes that, and the package boundary
// makes it physically impossible to import the rest of the system in here.
//
// See docs/design/ONT_SOVEREIGNTY_MAP.md.
export * from "./engine.js";
export * from "./state.js";
export * from "./proof-bundle.js";
