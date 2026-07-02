// @ont/indexer live — the daemon's env-selected runner dependency graph.
//
// main.ts calls this once at startup, then hands the result to runIndexerLoop. Tests can inject a fixture
// block-source/confirm while still exercising the same store + enforcement selection path the daemon uses.
import { selectIndexerBlockSource } from "./select-block-source.js";
import { selectIndexerStores } from "./select-stores.js";
import { selectIndexerEnforcement } from "./select-enforcement.js";
import type { ConfirmAnchor } from "../ingest-anchors.js";
import type { IndexerBlockSource, IndexerRunnerDeps } from "../runner.js";

export interface SelectIndexerRunnerDepsOptions {
  readonly blockSource?: IndexerBlockSource;
  readonly confirm?: ConfirmAnchor;
}

export async function selectIndexerRunnerDeps(
  env: Record<string, string | undefined>,
  options: SelectIndexerRunnerDepsOptions = {},
): Promise<IndexerRunnerDeps> {
  const blockSource = options.blockSource ?? await selectIndexerBlockSource(env);
  const { cursorStore, anchorStore } = selectIndexerStores(env);
  const enforcement = selectIndexerEnforcement(env);
  return {
    blockSource,
    cursorStore,
    anchorStore,
    ...(options.confirm === undefined ? {} : { confirm: options.confirm }),
    ...(enforcement === undefined ? {} : { enforcement }),
  };
}
