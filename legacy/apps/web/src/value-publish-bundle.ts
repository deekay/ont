import { build } from "esbuild";
import { fileURLToPath } from "node:url";

let cachedValuePublishBundle: Promise<string> | null = null;

export function getValuePublishClientBundle(): Promise<string> {
  if (cachedValuePublishBundle === null) {
    cachedValuePublishBundle = buildValuePublishClientBundle();
  }

  return cachedValuePublishBundle;
}

async function buildValuePublishClientBundle(): Promise<string> {
  const entryPoint = fileURLToPath(new URL("./value-publish-client.ts", import.meta.url));

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
    throw new Error("Value publish bundle did not produce any output.");
  }

  return output.text;
}
