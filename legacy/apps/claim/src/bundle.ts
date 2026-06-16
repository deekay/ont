import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let cached: Promise<string> | null = null;

/** esbuild-bundle the self-contained browser claim client (cached). */
export function getClaimClientBundle(): Promise<string> {
  if (cached === null) cached = buildClaimClientBundle();
  return cached;
}

async function buildClaimClientBundle(): Promise<string> {
  // esbuild bundles the TypeScript SOURCE. Resolve src/client.ts whether this
  // module runs from src/ (tsx) or dist/ (node dist/index.js).
  const here = dirname(fileURLToPath(import.meta.url));
  const srcDir = here.replace(/[/\\]dist$/, (m) => m.replace("dist", "src"));
  const entryPoint = join(srcDir, "client.ts");
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
    minify: true,
    charset: "utf8",
    legalComments: "none"
  });
  const output = result.outputFiles[0];
  if (!output) throw new Error("Claim client bundle produced no output.");
  return output.text;
}
