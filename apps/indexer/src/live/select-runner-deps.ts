// @ont/indexer live — the daemon's env-selected runner dependency graph.
//
// main.ts calls this once at startup, then hands the result to runIndexerLoop. Tests can inject a fixture
// block-source/confirm while still exercising the same store + enforcement selection path the daemon uses.
import { SIGNET_BITCOIN_DIFFICULTY_CHECKPOINT } from "@ont/launch-config";
import {
  selectIndexerBlockSourceWithHeaders,
  type IndexerHeaderSource,
  type SelectedIndexerBlockSource,
} from "./select-block-source.js";
import { selectIndexerStores } from "./select-stores.js";
import { selectIndexerEnforcement } from "./select-enforcement.js";
import type { ConfirmAnchor } from "../ingest-anchors.js";
import type { IndexerBlockSource, IndexerCursorStore, IndexerRunnerDeps } from "../runner.js";
import type { HeaderRangeStore, HeaderRecord } from "@ont/header-store";

export interface SelectIndexerRunnerDepsOptions {
  readonly blockSource?: IndexerBlockSource;
  readonly confirm?: ConfirmAnchor;
}

export async function selectIndexerRunnerDeps(
  env: Record<string, string | undefined>,
  options: SelectIndexerRunnerDepsOptions = {},
): Promise<IndexerRunnerDeps> {
  const selected: SelectedIndexerBlockSource = options.blockSource === undefined
    ? await selectIndexerBlockSourceWithHeaders(env)
    : { blockSource: options.blockSource };
  const { cursorStore, anchorStore, headerStore } = selectIndexerStores(env);
  if (selected.headerSource !== undefined) {
    await backfillIndexerHeaderRange({
      cursorStore,
      headerStore,
      headerSource: selected.headerSource,
      startHeight: SIGNET_BITCOIN_DIFFICULTY_CHECKPOINT.height + 1,
    });
  }
  const enforcement = selectIndexerEnforcement(env);
  return {
    blockSource: selected.blockSource,
    cursorStore,
    anchorStore,
    headerStore,
    ...(options.confirm === undefined ? {} : { confirm: options.confirm }),
    ...(enforcement === undefined ? {} : { enforcement }),
  };
}

export interface BackfillIndexerHeaderRangeInput {
  readonly cursorStore: IndexerCursorStore;
  readonly headerStore: HeaderRangeStore;
  readonly headerSource: IndexerHeaderSource;
  readonly startHeight: number;
}

export async function backfillIndexerHeaderRange(input: BackfillIndexerHeaderRangeInput): Promise<void> {
  const cursor = await input.cursorStore.load();
  const records: HeaderRecord[] = [];
  for (let height = input.startHeight; height <= cursor.height; height += 1) {
    if (await input.headerStore.has(height)) continue;
    records.push(await input.headerSource.headerAtHeight(height));
  }
  await input.headerStore.putMany(records);
}
