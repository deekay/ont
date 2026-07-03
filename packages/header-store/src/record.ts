export interface HeaderRecord {
  readonly height: number;
  readonly headerHex: string;
}

/** Persistence port for checkpoint-forward Bitcoin headers. Reads are exact contiguous ranges. */
export interface HeaderRangeStore {
  has(height: number): Promise<boolean>;
  put(record: HeaderRecord): Promise<void>;
  putMany(records: readonly HeaderRecord[]): Promise<void>;
  /** Return exactly `count` headers from `startHeight`, or null when any height is missing/unavailable. */
  getRange(startHeight: number, count: number): Promise<readonly string[] | null>;
}
