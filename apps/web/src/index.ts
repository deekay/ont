// @ont/web — B5 surface (the explorer/web, clean-build). See docs/core/B5_WEB_CLASSIFICATION.md. READ/DISPLAY
// ONLY: consumes the B4 adapters through a narrow read-port and renders served state as HTML with
// resolver-indexed-mirror / not-ownership-authority copy. No keys, no signing, no crypto libs, no wallet
// internals. AuctionBid tx display renders decoded W16 fields; auction bidding/signing stays wallet-only.
import { createEmptyWebReadPort, createWebHttpServer } from "./server.js";
import { selectResolverTxSource } from "./live/select-resolver-tx-source.js";
import { selectResolverNameStateSource } from "./live/select-resolver-name-state-source.js";
import { selectBitcoinHeaderProvider } from "./live/select-bitcoin-header-source.js";

export {
  renderNameView,
  shapeName,
  htmlEscape,
  RESOLVER_MIRROR_NOTICE,
  type BitcoinVerificationRenderOptions,
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
  type ServedNameStateResult,
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
// Live resolver tx read source (G2 slice 5a/5b-2): the transport adapter + the env selector the web main uses.
export {
  createResolverTxSource,
  type ResolverTxSource,
} from "./live/resolver-tx-source.js";
export { selectResolverTxSource } from "./live/select-resolver-tx-source.js";
export {
  createResolverNameStateSource,
  type ResolverNameStateSource,
} from "./live/resolver-name-state-source.js";
export { selectResolverNameStateSource } from "./live/select-resolver-name-state-source.js";
export {
  ONT_WEB_BITCOIN_HEADER_SOURCE_ENV,
  SIGNET_LAUNCH_HEADER_SOURCE_ID,
  selectBitcoinHeaderProvider,
  type BitcoinHeaderProviderFactory,
} from "./live/select-bitcoin-header-source.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number.parseInt(process.env.PORT ?? "4175", 10);
  // Live resolver tx source selected from the environment: ONT_RESOLVER_URL unset → undefined (hermetic
  // default, sync port only); nonempty → the live source; empty/blank → fail closed (throws here at startup).
  const server = createWebHttpServer({
    port: createEmptyWebReadPort(),
    txSource: selectResolverTxSource(process.env),
    nameStateSource: selectResolverNameStateSource(process.env),
    bitcoinHeaderProvider: selectBitcoinHeaderProvider(process.env),
  });
  server.listen(port, () => {
    console.log(`@ont/web listening on http://127.0.0.1:${port}`);
  });
}
