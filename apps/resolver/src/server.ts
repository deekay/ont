import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  confirmedAnchorTxToServedTx,
  projectServedRecoveryHistory,
  projectServedValueHistory,
  validateRecoveryDescriptorSubmission,
  validateValueRecordSubmission,
} from "@ont/adapter-resolver";
import type {
  ConfirmedAnchorTxView,
  OwnershipInterval,
  ProjectServedRecoveryHistoryInput,
  ProjectServedValueHistoryInput,
} from "@ont/adapter-resolver";
import type { SignedRecoveryDescriptor, SignedValueRecord } from "@ont/protocol";

/** Injected read-only confirmed-anchor view source (G2 slice 4b). The harness composes it over the durable
 *  store (createFileConfirmedAnchorStore.getByTxid → bridge); the resolver server NEVER imports the indexer
 *  or the file store. Absent ⇒ /tx/:txid is not served (404). */
export type AnchorTxViewSource = (txid: string) => Promise<ConfirmedAnchorTxView | null>;

export interface ResolverStore {
  valueState(name: string): Promise<ProjectServedValueHistoryInput | null>;
  recoveryState(name: string): Promise<ProjectServedRecoveryHistoryInput | null>;
  valueHead(name: string): Promise<{ currentOwnership: OwnershipInterval | null; head: SignedValueRecord | null } | null>;
  recoveryHead(
    name: string
  ): Promise<{ currentOwnership: OwnershipInterval | null; head: SignedRecoveryDescriptor | null } | null>;
  appendValueRecord(record: SignedValueRecord): Promise<void>;
  appendRecoveryDescriptor(descriptor: SignedRecoveryDescriptor): Promise<void>;
}

export interface ResolverServiceOptions {
  readonly store: ResolverStore;
  /** Read-only confirmed-anchor tx source for GET /tx/:txid; absent ⇒ that route 404s. */
  readonly anchorTxView?: AnchorTxViewSource;
}

export function createInMemoryResolverStore(): ResolverStore {
  const values = new Map<string, { currentOwnership: OwnershipInterval | null; records: SignedValueRecord[] }>();
  const recoveries = new Map<string, { currentOwnership: OwnershipInterval | null; descriptors: SignedRecoveryDescriptor[] }>();
  return {
    async valueState(name) {
      const state = values.get(name);
      return state ? { name, currentOwnership: state.currentOwnership, records: state.records } : null;
    },
    async recoveryState(name) {
      const state = recoveries.get(name);
      return state ? { name, currentOwnership: state.currentOwnership, descriptors: state.descriptors } : null;
    },
    async valueHead(name) {
      const state = values.get(name);
      if (!state) return null;
      return { currentOwnership: state.currentOwnership, head: state.records[state.records.length - 1] ?? null };
    },
    async recoveryHead(name) {
      const state = recoveries.get(name);
      if (!state) return null;
      return {
        currentOwnership: state.currentOwnership,
        head: state.descriptors[state.descriptors.length - 1] ?? null,
      };
    },
    async appendValueRecord(record) {
      const state = values.get(record.name) ?? { currentOwnership: null, records: [] };
      state.records.push(record);
      values.set(record.name, state);
    },
    async appendRecoveryDescriptor(descriptor) {
      const state = recoveries.get(descriptor.name) ?? { currentOwnership: null, descriptors: [] };
      state.descriptors.push(descriptor);
      recoveries.set(descriptor.name, state);
    },
  };
}

export async function handleResolverRequest(request: Request, options: ResolverServiceOptions): Promise<Response> {
  try {
    const url = new URL(request.url);
    const segments = pathSegments(url);

    if (segments.length === 1 && segments[0] === "health") {
      if (request.method !== "GET") return json({ ok: false, reason: "method-not-allowed" }, 405);
      return json({ ok: true, service: "@ont/resolver" });
    }

    if (segments.length === 3 && segments[0] === "names") {
      if (request.method !== "GET") return json({ ok: false, reason: "method-not-allowed" }, 405);
      const name = segments[1];
      if (!name) return json({ ok: false, reason: "bad-name" }, 400);
      if (segments[2] === "value-history") return serveValueHistory(name, options.store);
      if (segments[2] === "recovery-history") return serveRecoveryHistory(name, options.store);
    }

    if (segments.length === 2 && segments[0] === "tx") {
      if (request.method !== "GET") return json({ ok: false, reason: "method-not-allowed" }, 405);
      const txid = segments[1];
      if (!txid) return json({ ok: false, reason: "bad-txid" }, 400);
      return serveConfirmedTx(txid, options.anchorTxView);
    }

    if (segments.length === 2 && segments[0] === "submissions") {
      if (request.method !== "POST") return json({ ok: false, reason: "method-not-allowed" }, 405);
      if (segments[1] === "value-record") return submitValueRecord(request, options.store);
      if (segments[1] === "recovery-descriptor") return submitRecoveryDescriptor(request, options.store);
    }

    return json({ ok: false, reason: "not-found" }, 404);
  } catch {
    return json({ ok: false, reason: "bad-request" }, 400);
  }
}

export function createResolverHttpServer(options: ResolverServiceOptions): Server {
  return createServer((req, res) => {
    void handleNodeRequest(req, res, options);
  });
}

async function serveConfirmedTx(txid: string, anchorTxView?: AnchorTxViewSource): Promise<Response> {
  // RED stub — slice 4b green implements: source miss → 404; projection null → 404; success → 200 ServedTx.
  void txid;
  void anchorTxView;
  void confirmedAnchorTxToServedTx;
  return json({ ok: false, reason: "not-implemented" }, 501);
}

async function serveValueHistory(name: string, store: ResolverStore): Promise<Response> {
  try {
    const state = await store.valueState(name);
    if (state === null) return json({ ok: false, reason: "not-served" }, 404);
    const projected = projectServedValueHistory(state);
    return json(projected, readStatus(projected.ok, projected.ok ? null : projected.reason));
  } catch {
    return json({ ok: false, reason: "store-unavailable" }, 503);
  }
}

async function serveRecoveryHistory(name: string, store: ResolverStore): Promise<Response> {
  try {
    const state = await store.recoveryState(name);
    if (state === null) return json({ ok: false, reason: "not-served" }, 404);
    const projected = projectServedRecoveryHistory(state);
    return json(projected, readStatus(projected.ok, projected.ok ? null : projected.reason));
  } catch {
    return json({ ok: false, reason: "store-unavailable" }, 503);
  }
}

async function submitValueRecord(request: Request, store: ResolverStore): Promise<Response> {
  const body = await readJson(request);
  if (!body.ok) return json({ ok: false, reason: body.reason }, 400);
  const record = body.value as SignedValueRecord;
  try {
    const head = await store.valueHead(record.name);
    const validated = validateValueRecordSubmission({
      record,
      currentOwnership: head?.currentOwnership ?? null,
      existingHead: head?.head ?? null,
    });
    if (!validated.ok) return json(validated, 422);
    await store.appendValueRecord(record);
    return json(validated, 202);
  } catch {
    return json({ ok: false, reason: "store-unavailable" }, 503);
  }
}

async function submitRecoveryDescriptor(request: Request, store: ResolverStore): Promise<Response> {
  const body = await readJson(request);
  if (!body.ok) return json({ ok: false, reason: body.reason }, 400);
  const descriptor = body.value as SignedRecoveryDescriptor;
  try {
    const head = await store.recoveryHead(descriptor.name);
    const validated = validateRecoveryDescriptorSubmission({
      descriptor,
      currentOwnership: head?.currentOwnership ?? null,
      existingHead: head?.head ?? null,
    });
    if (!validated.ok) return json(validated, 422);
    await store.appendRecoveryDescriptor(descriptor);
    return json(validated, 202);
  } catch {
    return json({ ok: false, reason: "store-unavailable" }, 503);
  }
}

function readStatus(ok: boolean, reason: string | null): number {
  if (ok) return 200;
  return reason === "ownership-unknown" || reason === "empty-history" ? 404 : 409;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function pathSegments(url: URL): string[] {
  return url.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
}

async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; reason: "bad-json" }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, reason: "bad-json" };
  }
}

async function handleNodeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: ResolverServiceOptions
): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  const host = req.headers.host ?? "127.0.0.1";
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(", "));
  }
  const init: RequestInit = {
    method: req.method ?? "GET",
    headers,
  };
  if (chunks.length > 0) init.body = Buffer.concat(chunks);
  const request = new Request(`http://${host}${req.url ?? "/"}`, init);
  const response = await handleResolverRequest(request, options);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}
