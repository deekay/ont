// @ont/claim — B5 surface (claim site). See docs/core/B5_SURFACES_PLAN.md §7. Consumes L1-L4 APIs; decides
// nothing. The runtime surface holds NO keys and never signs — signing is handed off across a wallet boundary
// (B5-WALLET / a DI signTx). The mock-wallet fixture is test-only and is NOT exported here.
export {
  shapeClaimRequest,
  type ClaimRequest,
  type ShapeClaimRequestResult,
  type ClaimRequestRejectReason,
} from "./shape-claim-request.js";
export {
  projectClaimView,
  type ClaimView,
  type ProjectClaimViewResult,
} from "./project-claim-view.js";
