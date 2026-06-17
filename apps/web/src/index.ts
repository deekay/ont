// @ont/web — B5 surface (the explorer/web, clean-build). See docs/core/B5_WEB_CLASSIFICATION.md. READ/DISPLAY
// ONLY: consumes the B4 adapters through a narrow read-port and renders served state as HTML with
// resolver-indexed-mirror / not-ownership-authority copy. No keys, no signing, no crypto libs, no wallet
// internals. AuctionBid tx display renders decoded W16 fields; auction bidding/signing stays wallet-only.
import { createEmptyWebReadPort, createWebHttpServer } from "./server.js";

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
export {
  createEmptyWebReadPort,
  createWebHttpServer,
  handleWebRequest,
  type WebServiceOptions,
} from "./server.js";
// Confirmed-anchor read path — the projection contract is owned by @ont/adapter-resolver (G2 slice 4a);
// re-export it so the regtest e2e + web consumers keep their existing import paths.
export {
  confirmedAnchorTxToServedTx,
  type ConfirmedAnchorTxView,
} from "@ont/adapter-resolver";
export {
  createSnapshotWebReadPort,
  type ConfirmedAnchorSnapshot,
} from "./live/snapshot-read-port.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number.parseInt(process.env.PORT ?? "4175", 10);
  const server = createWebHttpServer({ port: createEmptyWebReadPort() });
  server.listen(port, () => {
    console.log(`@ont/web listening on http://127.0.0.1:${port}`);
  });
}
