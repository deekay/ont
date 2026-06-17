// @ont/node-live — shared live-runtime surface for the go-live phase.
export {
  parseAllowedChain,
  assertExpectedChain,
  type AllowedChain,
  type ChainAssert,
} from "./chain-gate.js";

export { selectLivePort, type SelectLivePortOptions } from "./select-live-port.js";

export { resolveNodeRuntime, type NodeRuntimeEnv } from "./resolve-node-runtime.js";
