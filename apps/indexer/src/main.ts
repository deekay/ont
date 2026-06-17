// @ont/indexer — runnable entry (the daemon process). Selects the block source from the live env
// (ONT_SOURCE=memory|node — memory is the hermetic default; node runs the chain gate before any poll) and
// runs the ingest loop until SIGINT/SIGTERM, paced by INDEXER_POLL_MS. Cursor/anchor stores stay in-memory
// for G1 (durable persistence = G2). The loop logic is in runner.ts; this never decides a firewall rule.
// Kept OUT of index.ts so importing the library has no side effects.
import {
  runIndexerLoop,
  createInMemoryIndexerCursorStore,
  createInMemoryConfirmedAnchorStore,
} from "./runner.js";
import { selectIndexerBlockSource } from "./live/select-block-source.js";

async function main(): Promise<void> {
  const intervalMs = Number(process.env.INDEXER_POLL_MS ?? "1000");
  let stopping = false;
  const stop = (): void => {
    stopping = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  // Env-selected block source. In node mode this awaits the chain gate (regtest|signet only) BEFORE
  // any block poll — a mispointed/missing RPC fails closed here, before the loop starts.
  const blockSource = await selectIndexerBlockSource(process.env);

  console.log(JSON.stringify({ service: "@ont/indexer", status: "starting", intervalMs }));
  await runIndexerLoop(
    {
      blockSource,
      cursorStore: createInMemoryIndexerCursorStore(0),
      anchorStore: createInMemoryConfirmedAnchorStore(),
    },
    {
      shouldStop: () => stopping,
      onError: (error) => console.error(JSON.stringify({ service: "@ont/indexer", error: String(error) })),
      waitForNext: () => new Promise((resolve) => setTimeout(resolve, intervalMs)),
    },
  );
  console.log(JSON.stringify({ service: "@ont/indexer", status: "stopped" }));
}

main().catch((error) => {
  console.error(JSON.stringify({ service: "@ont/indexer", fatal: String(error) }));
  process.exitCode = 1;
});
