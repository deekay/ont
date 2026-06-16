// @ont/cli — B5 surface (the `ont` CLI, clean-build). See docs/core/B5_CLI_CLASSIFICATION.md. A thin operator
// orchestrator: consumes L1-L4 APIs, reimplements no rules, holds no keys, never signs (signing → B5-WALLET).
// First slice = the read commands (get-value-history / get-recovery-descriptor-history / get-tx) over an
// injected CliReadPort.
export { type CliReadPort, type CliTxRead } from "./read-port.js";
export {
  shapeReadQuery,
  shapeNameQuery,
  shapeTxidQuery,
  type ReadCommand,
  type ReadQuery,
  type NameQuery,
  type TxidQuery,
  type ShapeRejectReason,
} from "./shape-read-query.js";
export {
  renderValueHistory,
  renderRecoveryHistory,
  renderTx,
  type HistoryView,
  type TxView,
  type RenderHistoryResult,
  type RenderTxResult,
} from "./render-read.js";
