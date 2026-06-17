import { build } from "esbuild";
import { fileURLToPath } from "node:url";

let cachedKeyToolsBundle: Promise<string> | null = null;

export function getKeyToolsClientBundle(): Promise<string> {
  if (cachedKeyToolsBundle === null) {
    cachedKeyToolsBundle = buildKeyToolsClientBundle();
  }

  return cachedKeyToolsBundle;
}

async function buildKeyToolsClientBundle(): Promise<string> {
  const entryPoint = fileURLToPath(new URL("./browser-key-tools.ts", import.meta.url));

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
    throw new Error("Key tools bundle did not produce any output.");
  }

  return output.text;
}
