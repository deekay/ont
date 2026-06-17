import { sha256 } from "@noble/hashes/sha2.js";

type HashEncoding = "hex";
type HashChunk = string | Uint8Array;

export function createHash(algorithm: string) {
  if (algorithm !== "sha256") {
    throw new Error(`browser shim only supports sha256, received ${algorithm}`);
  }

  const state = sha256.create();

  return {
    update(chunk: HashChunk) {
      if (typeof chunk === "string") {
        state.update(new TextEncoder().encode(chunk));
      } else {
        state.update(chunk);
      }

      return this;
    },
    digest(encoding?: HashEncoding) {
      const bytes = Uint8Array.from(state.digest());

      if (encoding === "hex") {
        return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      }

      return bytes;
    }
  };
}
