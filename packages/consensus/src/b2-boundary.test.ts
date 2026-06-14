import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const srcDir = dirname(fileURLToPath(import.meta.url));

const BANNED_IMPORTS = [
  /^node:/,
  /^fs$/,
  /^fs\/promises$/,
  /^http$/,
  /^https$/,
  /^net$/,
  /^tls$/,
  /^dgram$/,
  /^dns$/,
  /^child_process$/,
  /^worker_threads$/,
  /^cluster$/,
  /^readline$/,
  /^process$/,
  /^timers$/,
  /^perf_hooks$/,
  /^os$/,
];

const BANNED_GLOBALS = [
  /\bDate\b/,
  /\bsetTimeout\b/,
  /\bsetInterval\b/,
  /\bfetch\b/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bindexedDB\b/,
  /\bprocess\.env\b/,
];

function productionFiles(): string[] {
  return readdirSync(srcDir)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .sort();
}

function importSpecifiers(text: string): string[] {
  const specifiers: string[] = [];
  const fromRe = /\bfrom\s*["']([^"']+)["']/g;
  const bareRe = /\bimport\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = fromRe.exec(text)) !== null) specifiers.push(match[1] as string);
  while ((match = bareRe.exec(text)) !== null) specifiers.push(match[1] as string);
  return specifiers;
}

describe("B2 ownership-kernel purity boundary", () => {
  it("production modules have no filesystem, network, process, or clock imports", () => {
    const offenders: string[] = [];
    for (const file of productionFiles()) {
      const text = readFileSync(join(srcDir, file), "utf8");
      for (const specifier of importSpecifiers(text)) {
        if (BANNED_IMPORTS.some((re) => re.test(specifier))) offenders.push(`${file} -> ${specifier}`);
      }
    }

    expect(
      offenders,
      "B2 kernel verdicts must be pure predicates over witnessed inputs. Production @ont/consensus modules must not import host I/O, process, network, timer, or clock modules; see docs/core/B2_KERNEL_HARDENING.md A10/D1/T1/Z1/G7 and docs/core/SOFTWARE_CANON.md L2."
    ).toEqual([]);
  });

  it("production modules do not read host time or browser/network globals", () => {
    const offenders: string[] = [];
    for (const file of productionFiles()) {
      const text = readFileSync(join(srcDir, file), "utf8");
      for (const re of BANNED_GLOBALS) {
        if (re.test(text)) offenders.push(`${file} contains ${re.source}`);
      }
    }

    expect(
      offenders,
      "B2 kernel verdicts must not consult wall-clock time, local receipt time, browser storage, or live network APIs."
    ).toEqual([]);
  });
});
