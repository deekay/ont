// @ont/web — B5 surface (the explorer/web, clean-build). See docs/core/B5_WEB_CLASSIFICATION.md. READ/DISPLAY
// ONLY: consumes the B4 adapters through a narrow read-port and renders served state as HTML with
// resolver-indexed-mirror / not-ownership-authority copy. No keys, no signing, no crypto libs, no wallet
// internals. AuctionBid tx display renders decoded W16 fields; auction bidding/signing stays wallet-only.
export {
  renderNameView,
  shapeName,
  htmlEscape,
  RESOLVER_MIRROR_NOTICE,
  type ShapeNameResult,
} from "./render-name-view.js";
export {
  renderTxView,
  shapeTxid,
  TX_CHAIN_NOTICE,
  type ShapeTxidResult,
} from "./render-tx-view.js";
export { renderLanding, route, LANDING_NOTICE } from "./render-explorer-landing.js";
export {
  type WebReadPort,
  type ServedValueState,
  type ServedRecoveryState,
  type ServedTx,
  type ServedTxOutput,
} from "./web-read-port.js";
