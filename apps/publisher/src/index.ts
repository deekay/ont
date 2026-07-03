// @ont/publisher — clean runnable publisher service. Split HTTP shell over @ont/adapter-publisher:
// /assemble/* return the unsigned tx and never broadcast; /broadcast is the only port-owning route (relays an
// already-signed legacy raw). No signing keys, no private accumulator, no live network in the tested core.
import { createPublisherHttpServer } from "./server.js";
import { selectPublisherBroadcastPort } from "./live/select-broadcast.js";
import { createFileDaRecordStore } from "@ont/adapter-da";

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
  const daRecordSource = process.env.ONT_DA_DIR ? createFileDaRecordStore(process.env.ONT_DA_DIR) : undefined;
  const server = createPublisherHttpServer({ broadcast, daRecordSource });
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
