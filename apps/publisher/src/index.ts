// @ont/publisher — clean runnable publisher service. HTTP assemble+broadcast shell over
// @ont/adapter-publisher with injected broadcast I/O; no signing keys, no private accumulator, no live network
// in the tested core.
import { createInMemoryPublisherBroadcastPort, createPublisherHttpServer } from "./server.js";

export {
  createInMemoryPublisherBroadcastPort,
  createPublisherHttpServer,
  handlePublisherRequest,
  type PublisherBroadcastPort,
  type PublisherBroadcastResult,
  type PublisherServiceOptions,
} from "./server.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number.parseInt(process.env.PORT ?? "4176", 10);
  const server = createPublisherHttpServer({ broadcast: createInMemoryPublisherBroadcastPort() });
  server.listen(port, () => {
    console.log(`@ont/publisher listening on http://127.0.0.1:${port}`);
  });
}
