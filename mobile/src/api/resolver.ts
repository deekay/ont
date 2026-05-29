import type { SignedRecoveryDescriptor } from "../wallet/recovery-descriptor";
import type { SignedValueRecord } from "../wallet/value-record";
import { ApiError, apiGet, apiPost, esploraGetText, esploraGetJson } from "./client";
import type {
  ActivityResponse,
  ConfigResponse,
  ExperimentalAuctionsResponse,
  HealthResponse,
  NameActivityResponse,
  NameRecord,
  NamesResponse,
  RecoveryDescriptor,
  RecoveryDescriptorPublishResponse,
  ValueHistoryResponse,
  ValueRecord,
  ValueRecordPublishResponse,
} from "./types";

export const resolver = {
  health: () => apiGet<HealthResponse>("/health"),
  config: () => apiGet<ConfigResponse>("/config"),

  names: () => apiGet<NamesResponse>("/names"),
  name: (name: string) => apiGet<NameRecord>(`/name/${encodeURIComponent(name)}`),
  nameActivity: (name: string, limit = 25) =>
    apiGet<NameActivityResponse>(`/name/${encodeURIComponent(name)}/activity?limit=${limit}`),

  value: (name: string) => apiGet<ValueRecord>(`/name/${encodeURIComponent(name)}/value`),
  valueHistory: (name: string) =>
    apiGet<ValueHistoryResponse>(`/name/${encodeURIComponent(name)}/value/history`),

  /** Publish a locally-signed value record. The resolver re-verifies the
   *  signature, owner, ownershipRef, and exact-next sequence before accepting. */
  publishValue: (record: SignedValueRecord) =>
    apiPost<ValueRecordPublishResponse>("/values", record),

  /** Publish a locally-signed recovery descriptor (same checks as values). */
  publishRecovery: (descriptor: SignedRecoveryDescriptor) =>
    apiPost<RecoveryDescriptorPublishResponse>("/recovery-descriptors", descriptor),
  recovery: (name: string) => apiGet<RecoveryDescriptor>(`/name/${encodeURIComponent(name)}/recovery`),

  activity: (limit = 30) => apiGet<ActivityResponse>(`/activity?limit=${limit}`),
  experimentalAuctions: () => apiGet<ExperimentalAuctionsResponse>("/experimental-auctions"),
};

export const chain = {
  tipHeight: async (): Promise<number> => {
    const text = await esploraGetText("/blocks/tip/height");
    const height = Number.parseInt(text.trim(), 10);
    if (!Number.isFinite(height) || height < 0) {
      throw new ApiError(`esplora returned a non-numeric block height: ${text.slice(0, 40)}`, 200, text);
    }
    return height;
  },
  addressUtxos: (address: string) =>
    esploraGetJson<EsploraUtxo[]>(`/address/${encodeURIComponent(address)}/utxo`),
};

export interface EsploraUtxo {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean; block_height?: number };
}
