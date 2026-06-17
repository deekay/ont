import { createInMemoryResolverStore, createResolverHttpServer } from "./server.js";

export {
  createInMemoryResolverStore,
  createResolverHttpServer,
  handleResolverRequest,
  type ResolverServiceOptions,
  type ResolverStore,
} from "./server.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number.parseInt(process.env.PORT ?? "4174", 10);
  const server = createResolverHttpServer({ store: createInMemoryResolverStore() });
  server.listen(port, () => {
    // stdout is the process contract for the runnable shell; tests use handleResolverRequest directly.
    console.log(`@ont/resolver listening on http://127.0.0.1:${port}`);
  });
}
