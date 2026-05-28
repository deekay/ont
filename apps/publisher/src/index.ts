// ONT publisher entry point. Starts the HTTP server with stub payment +
// anchor implementations by default — usable for local dev / regtest and as
// the wallet's `claim --rail cheap` target during development. Real payment
// verification + on-chain broadcast are pluggable; see publisher.ts.

import { env } from "node:process";

import { Publisher } from "./publisher.js";
import { startPublisherServer } from "./server.js";

async function main(): Promise<void> {
  const port = env.ONT_PUBLISHER_PORT ? Number(env.ONT_PUBLISHER_PORT) : 7878;
  const network = parseNetwork(env.ONT_PUBLISHER_NETWORK ?? "regtest");

  const publisher = new Publisher({
    network,
    operatorName: env.ONT_PUBLISHER_OPERATOR_NAME ?? "dev publisher",
    contact: env.ONT_PUBLISHER_CONTACT ?? ""
  });

  const server = await startPublisherServer({ publisher, port });
  console.log(`ONT publisher listening on ${server.url} (${network}, stub payment + anchor)`);
  console.log("env: ONT_PUBLISHER_PORT (default 7878), ONT_PUBLISHER_NETWORK (default regtest)");
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
