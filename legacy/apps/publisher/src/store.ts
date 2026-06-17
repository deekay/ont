// File-backed persistence for the publisher. The publisher itself stays
// stateless w.r.t. disk — it just emits a snapshot when something changes;
// the store decides whether/where to write it. Keeps tests simple (no IO) and
// makes the production wiring a one-liner.

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

export const PUBLISHER_STORE_FORMAT = "ont-publisher-state";
export const PUBLISHER_STORE_VERSION = 1;

export interface PublisherStoreDocument {
  readonly format: typeof PUBLISHER_STORE_FORMAT;
  readonly version: typeof PUBLISHER_STORE_VERSION;
  readonly snapshot: unknown;
}

export interface PublisherStore {
  load(): Promise<unknown | null>;
  save(snapshot: unknown): Promise<void>;
}

/**
 * Writes the publisher's snapshot to a JSON file. Uses an atomic
 * write-and-rename so a crashed publisher can't leave a torn file.
 */
export class FilePublisherStore implements PublisherStore {
  constructor(readonly path: string) {}

  async load(): Promise<unknown | null> {
    if (!existsSync(this.path)) {
      return null;
    }
    const text = readFileSync(this.path, "utf8");
    const parsed = JSON.parse(text) as Partial<PublisherStoreDocument>;
    if (parsed.format !== PUBLISHER_STORE_FORMAT) {
      throw new Error(`unexpected publisher store format in ${this.path}`);
    }
    if (parsed.version !== PUBLISHER_STORE_VERSION) {
      throw new Error(`unsupported publisher store version in ${this.path}`);
    }
    return parsed.snapshot ?? null;
  }

  async save(snapshot: unknown): Promise<void> {
    const doc: PublisherStoreDocument = {
      format: PUBLISHER_STORE_FORMAT,
      version: PUBLISHER_STORE_VERSION,
      snapshot
    };
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
    renameSync(tmp, this.path);
  }
}

/** Default — keeps everything in memory; restart loses state. */
export class InMemoryPublisherStore implements PublisherStore {
  private snapshot: unknown = null;

  async load(): Promise<unknown | null> {
    return this.snapshot;
  }

  async save(snapshot: unknown): Promise<void> {
    this.snapshot = snapshot;
  }
}
