// @ont/publisher — clean runnable publisher service. HTTP assemble+broadcast shell over
// @ont/adapter-publisher with injected broadcast I/O; no signing keys, no private accumulator, no live network
// in the tested core.
import { createPublisherHttpServer } from "./server.js";
import { selectPublisherBroadcastPort } from "./live/select-broadcast.js";

export {
  createInMemoryPublisherBroadcastPort,
  createPublisherHttpServer,
  handlePublisherRequest,
  type PublisherBroadcastPort,
  type PublisherBroadcastResult,
  type PublisherServiceOptions,
} from "./server.js";
// Env-selected live broadcast port (go-live slice 4b) — published so the regtest e2e composes it.
export { selectPublisherBroadcastPort } from "./live/select-broadcast.js";

async function bootstrap(): Promise<void> {
  const port = Number.parseInt(process.env.PORT ?? "4176", 10);
  // Env-selected broadcast port. In node mode this awaits the chain gate (regtest|signet only)
  // BEFORE the server listens — a rejected chain/env prevents startup entirely (CL green watch).
  const broadcast = await selectPublisherBroadcastPort(process.env);
  const server = createPublisherHttpServer({ broadcast });
  server.listen(port, () => {
    console.log(`@ont/publisher listening on http://127.0.0.1:${port}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrap().catch((error) => {
    console.error(JSON.stringify({ service: "@ont/publisher", fatal: String(error) }));
    process.exitCode = 1;
  });
}
