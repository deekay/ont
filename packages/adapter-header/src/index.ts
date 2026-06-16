// @ont/adapter-header — B4 canonical Bitcoin header source. See PURPOSE-equivalent header in
// canonical-header-source.ts and docs/core/B4_ADAPTERS_PLAN.md §8.
export {
  buildCanonicalHeaderSourceFromHeaders,
  fetchCanonicalHeaderSource,
  type HeaderRangeProvider,
  type FetchCanonicalHeaderSourceInput,
  type CanonicalHeaderResult,
  type CanonicalHeaderRejectReason,
} from "./canonical-header-source.js";
