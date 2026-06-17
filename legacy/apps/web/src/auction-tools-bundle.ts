import { build } from "esbuild";
import { fileURLToPath } from "node:url";

let cachedAuctionToolsBundle: Promise<string> | null = null;

export function getAuctionToolsClientBundle(): Promise<string> {
  if (cachedAuctionToolsBundle === null) {
    cachedAuctionToolsBundle = buildAuctionToolsClientBundle();
  }

  return cachedAuctionToolsBundle;
}

async function buildAuctionToolsClientBundle(): Promise<string> {
  const entryPoint = fileURLToPath(new URL("./auction-tools-client.ts", import.meta.url));

  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
    minify: false,
    charset: "utf8",
    legalComments: "none"
  });

  const output = result.outputFiles[0];
  if (!output) {
    throw new Error("Auction tools bundle did not produce any output.");
  }

  return output.text;
}
