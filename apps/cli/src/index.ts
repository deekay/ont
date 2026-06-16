// @ont/cli — B5 surface (the `ont` CLI, clean-build). See docs/core/B5_CLI_CLASSIFICATION.md. A thin operator
// orchestrator: consumes L1-L4 APIs, reimplements no rules, holds no keys, never signs (signing → B5-WALLET).
// First slice = the read commands (get-value-history / get-recovery-descriptor-history / get-tx) over an
// injected CliReadPort.
export { type CliReadPort, type CliTxRead, type ResolverRawRead, type ResolverRawQuery } from "./read-port.js";
export {
  shapeReadQuery,
  shapeNameQuery,
  shapeTxidQuery,
  shapeRawReadQuery,
  type ReadCommand,
  type ReadQuery,
  type NameQuery,
  type TxidQuery,
  type RawReadCommand,
  type RawReadQuery,
  type ShapeRejectReason,
} from "./shape-read-query.js";
export {
  renderValueHistory,
  renderRecoveryHistory,
  renderTx,
  renderResolverRaw,
  type HistoryView,
  type TxView,
  type RawView,
  type RenderHistoryResult,
  type RenderTxResult,
  type RenderResolverRawResult,
} from "./render-read.js";
