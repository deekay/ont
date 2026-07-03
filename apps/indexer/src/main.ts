// @ont/indexer — runnable entry (the daemon process). Selects the block source from the live env
// (ONT_SOURCE=memory|node — memory is the hermetic default; node runs the chain gate before any poll) and
// runs the ingest loop until SIGINT/SIGTERM, paced by INDEXER_POLL_MS. Cursor/anchor/name-state stores and optional
// LE-INDEX enforcement are env-selected. The loop logic is in runner.ts; this never decides a firewall rule.
// Kept OUT of index.ts so importing the library has no side effects.
import { runIndexerLoop } from "./runner.js";
import { selectIndexerRunnerDeps } from "./live/select-runner-deps.js";

async function main(): Promise<void> {
  const intervalMs = Number(process.env.INDEXER_POLL_MS ?? "1000");
  let stopping = false;
  const stop = (): void => {
    stopping = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  // Env-selected runner deps. In node mode this awaits the chain gate BEFORE any block poll; when
  // ONT_ENFORCEMENT=fixture-file|http-da, this also wires batch material + name-state + policy or fails closed.
  const deps = await selectIndexerRunnerDeps(process.env);

  console.log(JSON.stringify({ service: "@ont/indexer", status: "starting", intervalMs }));
  await runIndexerLoop(
    deps,
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
