import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  bytesToHex,
  parseSignedValueRecord,
  signValueRecord,
  type SignedValueRecord
} from "@ont/protocol";

import { resolveResolverUrl, resolveResolverUrls } from "./resolver-actions.js";

export interface MultiResolverValuePublishResult {
  readonly resolverUrl: string;
  readonly ok: boolean;
  readonly status: number | null;
  readonly code: string | null;
  readonly message: string | null;
  readonly payload: unknown;
}

export interface MultiResolverValuePublishSummary {
  readonly kind: "ont-multi-resolver-value-publish";
  readonly name: string;
  readonly sequence: number;
  readonly resolverCount: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly results: readonly MultiResolverValuePublishResult[];
}

export function createSignedValueRecord(options: {
  readonly name: string;
  readonly ownerPrivateKeyHex: string;
  readonly ownershipRef: string;
  readonly sequence: number;
  readonly previousRecordHash: string | null;
  readonly valueType: number;
  readonly payloadUtf8?: string;
  readonly payloadHex?: string;
  readonly issuedAt?: string;
}): SignedValueRecord {
  return signValueRecord({
    name: options.name,
    ownerPrivateKeyHex: options.ownerPrivateKeyHex,
    ownershipRef: options.ownershipRef,
    sequence: options.sequence,
    previousRecordHash: options.previousRecordHash,
    valueType: options.valueType,
    ...(options.issuedAt === undefined ? {} : { issuedAt: options.issuedAt }),
    payloadHex: resolvePayloadHex(
      options.payloadUtf8 === undefined && options.payloadHex === undefined
        ? {}
        : {
            ...(options.payloadUtf8 === undefined ? {} : { payloadUtf8: options.payloadUtf8 }),
            ...(options.payloadHex === undefined ? {} : { payloadHex: options.payloadHex })
          }
    )
  });
}

export async function loadSignedValueRecord(filePath: string): Promise<SignedValueRecord> {
  const resolvedPath = resolve(process.cwd(), filePath);
  const raw = await readFile(resolvedPath, "utf8");
  return parseSignedValueRecord(JSON.parse(raw));
}

export async function publishValueRecord(options: {
  readonly resolverUrl?: string;
  readonly valueRecord: SignedValueRecord;
}): Promise<unknown> {
  const resolverUrl = resolveResolverUrl(options.resolverUrl);
  const response = await fetch(`${resolverUrl.replace(/\/$/, "")}/values`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(options.valueRecord)
  });
  const raw = await response.text();
  const parsed = raw.length === 0 ? null : JSON.parse(raw);

  if (!response.ok) {
    const message =
      parsed !== null &&
      typeof parsed === "object" &&
      parsed !== null &&
      "message" in parsed &&
      typeof parsed.message === "string"
        ? parsed.message
        : `resolver returned HTTP ${response.status}`;
    throw new Error(message);
  }

  return parsed;
}

export async function publishValueRecordToResolvers(options: {
  readonly resolverUrls?: readonly string[];
  readonly valueRecord: SignedValueRecord;
}): Promise<MultiResolverValuePublishSummary> {
  const resolverUrls = resolveResolverUrls(options.resolverUrls);
  const results = await Promise.all(
    resolverUrls.map(async (resolverUrl): Promise<MultiResolverValuePublishResult> => {
      try {
        const payload = await publishValueRecord({
          resolverUrl,
          valueRecord: options.valueRecord
        });
        return {
          resolverUrl,
          ok: true,
          status: 201,
          code: null,
          message: null,
          payload
        };
      } catch (error) {
        return {
          resolverUrl,
          ok: false,
          status: null,
          code: "resolver_publish_failed",
          message: error instanceof Error ? error.message : "Unable to publish the signed destination record.",
          payload: null
        };
      }
    })
  );

  const successCount = results.filter((result) => result.ok).length;

  return {
    kind: "ont-multi-resolver-value-publish",
    name: options.valueRecord.name,
    sequence: options.valueRecord.sequence,
    resolverCount: resolverUrls.length,
    successCount,
    failureCount: resolverUrls.length - successCount,
    results
  };
}

function resolvePayloadHex(input: {
  readonly payloadUtf8?: string;
  readonly payloadHex?: string;
}): string {
  if (input.payloadUtf8 !== undefined && input.payloadHex !== undefined) {
    throw new Error("use either --payload-utf8 or --payload-hex, not both");
  }

  if (input.payloadUtf8 !== undefined) {
    return bytesToHex(Buffer.from(input.payloadUtf8, "utf8"));
  }

  return input.payloadHex ?? "";
}
