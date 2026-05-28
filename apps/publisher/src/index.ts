// ONT publisher entry point. Starts the HTTP server with stub payment +
// anchor implementations by default — usable for local dev / regtest and as
// the wallet's `claim --rail cheap` target during development. Real payment
// verification + on-chain broadcast are pluggable; see publisher.ts.
//
// Set ONT_PUBLISHER_STORE_PATH to persist state across restarts.

import { env } from "node:process";

import { Publisher, type PublisherSnapshot } from "./publisher.js";
import { startPublisherServer } from "./server.js";
import { FilePublisherStore, type PublisherStore } from "./store.js";

async function main(): Promise<void> {
  const port = env.ONT_PUBLISHER_PORT ? Number(env.ONT_PUBLISHER_PORT) : 7878;
  const network = parseNetwork(env.ONT_PUBLISHER_NETWORK ?? "regtest");
  const storePath = env.ONT_PUBLISHER_STORE_PATH;
  const store: PublisherStore | null = storePath ? new FilePublisherStore(storePath) : null;

  // Build the publisher with a deferred-binding onChange so we can wire the
  // store *after* construction (the publisher needs to exist before we can
  // call publisher.snapshot()).
  let pendingSave: NodeJS.Timeout | null = null;
  const publisher = new Publisher({
    network,
    operatorName: env.ONT_PUBLISHER_OPERATOR_NAME ?? "dev publisher",
    contact: env.ONT_PUBLISHER_CONTACT ?? "",
    onChange: () => {
      if (store === null) return;
      // Debounce: a burst of mutations only writes once.
      if (pendingSave !== null) clearTimeout(pendingSave);
      pendingSave = setTimeout(() => {
        store.save(publisher.snapshot()).catch((error) => {
          console.error(`publisher store save failed: ${error instanceof Error ? error.message : String(error)}`);
        });
      }, 250);
    }
  });

  if (store !== null) {
    const existing = (await store.load()) as PublisherSnapshot | null;
    if (existing !== null) {
      publisher.restore(existing);
      console.log(`publisher state restored from ${storePath} (${existing.batches.length} batch(es))`);
    } else {
      console.log(`publisher will persist to ${storePath} (no prior state)`);
    }
  }

  const server = await startPublisherServer({ publisher, port });
  console.log(`ONT publisher listening on ${server.url} (${network}, stub payment + anchor)`);
  console.log(
    "env: ONT_PUBLISHER_PORT (default 7878), ONT_PUBLISHER_NETWORK (default regtest), ONT_PUBLISHER_STORE_PATH"
  );
}

function parseNetwork(value: string): "main" | "signet" | "testnet" | "regtest" {
  switch (value) {
    case "main":
    case "signet":
    case "testnet":
    case "regtest":
      return value;
    default:
      throw new Error(`unknown ONT_PUBLISHER_NETWORK: ${value}`);
  }
}

main().catch((error: unknown) => {
  console.error(`publisher failed to start: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
