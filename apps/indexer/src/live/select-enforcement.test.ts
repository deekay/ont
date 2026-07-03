import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveOwnerPubkey } from "@ont/protocol";
import { describe, expect, it } from "vitest";
import { selectIndexerEnforcement } from "./select-enforcement.js";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const GENERATOR = join(ROOT, "scripts/generate-fixture-batch-material.mjs");
const OWNER_SECRET = "11".repeat(32);
const OWNER_PUBKEY = deriveOwnerPubkey(OWNER_SECRET);

describe("selectIndexerEnforcement fixture material reader", () => {
  it("loads material emitted by the A' generator under the same material key the anchor input uses", () => {
    const dir = mkdtempSync(join(tmpdir(), "ont-fixture-material-"));
    try {
      const materialPath = join(dir, "batch-material.json");
      const anchorPath = join(dir, "root-anchor-input.json");
      execFileSync(process.execPath, [
        GENERATOR,
        "--entry-secret",
        `Alice:${OWNER_SECRET}`,
        "--material-out",
        materialPath,
        "--anchor-out",
        anchorPath,
      ], { cwd: ROOT, stdio: "pipe" });

      const materialFile = JSON.parse(readFileSync(materialPath, "utf8")) as {
        materials: [{
          anchoredRoot: string;
          prevRoot: string;
          committedEntries: readonly { name: string; ownerPubkey: string }[];
          baseLeaves: readonly { keyHex: string; valueHex: string }[];
          servedLeaves: readonly { keyHex: string; valueHex: string }[];
        }];
      };
      const anchorInput = JSON.parse(readFileSync(anchorPath, "utf8")) as {
        prevRoot: string;
        newRoot: string;
        batchSize: number;
      };
      const encoded = materialFile.materials[0]!;

      expect(anchorInput.prevRoot).toBe(encoded.prevRoot);
      expect(anchorInput.newRoot).toBe(encoded.anchoredRoot);
      expect(anchorInput.batchSize).toBe(1);
      expect(`${anchorInput.prevRoot}:${anchorInput.newRoot}`).toBe(`${encoded.prevRoot}:${encoded.anchoredRoot}`);

      const enforcement = selectIndexerEnforcement({
        ONT_ENFORCEMENT: "fixture-file",
        ONT_BATCH_MATERIAL_FILE: materialPath,
      });
      expect(enforcement).not.toBeUndefined();
      const decoded = enforcement!.batchMaterial(anchorInput.newRoot, anchorInput.prevRoot);

      expect(decoded).not.toBeNull();
      expect(decoded?.committedEntries).toEqual([{ name: "alice", ownerPubkey: OWNER_PUBKEY }]);
      expect([...decoded!.baseLeaves.entries()]).toEqual([]);
      expect(decoded?.servedLeaves).toEqual(encoded.servedLeaves);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
