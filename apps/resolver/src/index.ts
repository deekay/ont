import { createInMemoryResolverStore, createResolverHttpServer } from "./server.js";
import { selectResolverAnchorTxView } from "./live/select-resolver-anchor-view.js";
import { selectResolverNameStateView } from "./live/select-resolver-name-state-view.js";
import { selectResolverHeaderRangeView } from "./live/select-resolver-header-range-view.js";

export {
  createInMemoryResolverStore,
  createResolverHttpServer,
  handleResolverRequest,
  type ResolverServiceOptions,
  type ResolverStore,
} from "./server.js";
export { selectResolverAnchorTxView } from "./live/select-resolver-anchor-view.js";
export { selectResolverNameStateView } from "./live/select-resolver-name-state-view.js";
export { selectResolverHeaderRangeView } from "./live/select-resolver-header-range-view.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number.parseInt(process.env.PORT ?? "4174", 10);
  // Env-selected durable confirmed-anchor read (G2 slice 6b): ONT_STORE=file + ONT_STORE_DIR serves /tx/:txid
  // from the indexer's confirmed-anchors.json; memory/unset → no anchorTxView (/tx 404s, the hermetic default).
  const anchorTxView = selectResolverAnchorTxView(process.env);
  // Env-selected durable enforced name-state read (LE-RESOLVE): ONT_STORE=file + ONT_STORE_DIR serves
  // /names/:name/state from the indexer's name-state.json; memory/unset → no nameStateView (404, hermetic default).
  const nameStateView = selectResolverNameStateView(process.env);
  // Env-selected durable header-range read for GET /bitcoin/header-range. memory/unset → unavailable (404);
  // file mode reads headers.json written by the indexer.
  const headerRangeView = selectResolverHeaderRangeView(process.env);
  const server = createResolverHttpServer({
    store: createInMemoryResolverStore(),
    ...(anchorTxView ? { anchorTxView } : {}),
    ...(nameStateView ? { nameStateView } : {}),
    ...(headerRangeView ? { headerRangeView } : {}),
  });
  server.listen(port, () => {
    // stdout is the process contract for the runnable shell; tests use handleResolverRequest directly.
    console.log(`@ont/resolver listening on http://127.0.0.1:${port}`);
  });
}
