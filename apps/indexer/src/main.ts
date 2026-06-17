// @ont/indexer — runnable entry (the daemon process). Wires clean-startup ports (empty block-source + in-memory
// cursor/anchor stores) and runs the ingest loop until SIGINT/SIGTERM, paced by INDEXER_POLL_MS. Real esplora/
// Bitcoin block-source + durable stores are injected here in deployment; the loop logic is in runner.ts. Logs
// JSON lines; never decides a firewall rule. Kept OUT of index.ts so importing the library has no side effects.
import {
  runIndexerLoop,
  createEmptyIndexerBlockSource,
  createInMemoryIndexerCursorStore,
  createInMemoryConfirmedAnchorStore,
} from "./runner.js";

async function main(): Promise<void> {
  const intervalMs = Number(process.env.INDEXER_POLL_MS ?? "1000");
  let stopping = false;
  const stop = (): void => {
    stopping = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.log(JSON.stringify({ service: "@ont/indexer", status: "starting", intervalMs }));
  await runIndexerLoop(
    {
      blockSource: createEmptyIndexerBlockSource(),
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
