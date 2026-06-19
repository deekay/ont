#!/usr/bin/env node
// Go-live G3 slice-1 — deploy-infra clean-stack gate. See docs/operate/G3_CLEAN_SLATE_VPS.md.
//
// The clean-build go-live stack is bitcoind(signet) -> indexer(node ingest -> durable file store) ->
// resolver(read) -> web(display). This gate is a RATCHET that keeps the checked-in deploy infra
// (docker-compose.yml, docker/entrypoint.sh, .env.example) wired to the CLEAN apps' real runtime env and
// free of old-stack (pre-clean-build / pre-ONT-rebrand) leakage. It is a STATIC shape check only — it does
// NOT boot the stack; the clean-slate signet boot/read smoke is the operator gate in the runbook (DK-owned).
//
// The clean runtime contract (verified against the app entrypoints):
//   resolver  apps/resolver/src/index.ts   PORT (4174), ONT_STORE, ONT_STORE_DIR; serves /health, /tx/:txid
//   web       apps/web/src/index.ts        PORT (4175), ONT_RESOLVER_URL; serves /health
//   indexer   apps/indexer/src/main.ts     ONT_SOURCE=node, ONT_CHAIN, ONT_RPC_URL[/_USER/_PASSWORD],
//                                          ONT_STORE=file, ONT_STORE_DIR, INDEXER_POLL_MS; chain-gated daemon
//   stores    @ont/indexer select-stores   ONT_STORE=memory|file + ONT_STORE_DIR (resolver reads the same dir)
//   runtime   @ont/node-live               ONT_SOURCE | ONT_CHAIN | ONT_RPC_URL | ONT_RPC_USER | ONT_RPC_PASSWORD
//
// Exit 0 = clean; exit 1 = violations (listed). No deps; reads files as text.
import { existsSync, readFileSync } from "node:fs";

const FILES = {
  compose: "docker-compose.yml",
  entrypoint: "docker/entrypoint.sh",
  env: ".env.example",
};

// Old-stack tokens that must NOT appear in any deploy-infra file. Each is an unambiguous env-var / path
// (not a bare English word) so the match can't false-positive on prose or comments.
const DENY = [
  { token: "GNS_", why: "pre-ONT-rebrand env prefix (use ONT_*)" },
  { token: "ONT_SNAPSHOT_PATH", why: "legacy snapshot store (clean read path is ONT_STORE=file + ONT_STORE_DIR)" },
  { token: "ONT_VALUE_STORE_PATH", why: "legacy value-record snapshot (not the G2 durable confirmed-anchor path)" },
  { token: "ONT_SNAPSHOT_KEY", why: "legacy snapshot keying (gone in the clean store model)" },
  { token: "ONT_SOURCE_MODE", why: "old entrypoint launch-height machinery (clean uses ONT_SOURCE=memory|node)" },
  { token: "ONT_LAUNCH_HEIGHT", why: "old launch-height seed (clean indexer chain-gates via @ont/node-live)" },
  { token: "ONT_ESPLORA_BASE_URL", why: "old esplora source mode (clean live source is ONT_SOURCE=node + ONT_RPC_URL)" },
  { token: "ONT_BITCOIN_RPC_URL", why: "old RPC env name (clean = ONT_RPC_URL)" },
  { token: "ONT_BITCOIN_RPC_USERNAME", why: "old RPC env name (clean = ONT_RPC_USER)" },
  { token: "ONT_BITCOIN_RPC_PASSWORD", why: "old RPC env name (clean = ONT_RPC_PASSWORD)" },
  { token: "ONT_RESOLVER_PORT", why: "resolver listens on PORT (default 4174), not ONT_RESOLVER_PORT" },
  { token: "ONT_WEB_PORT", why: "web listens on PORT (default 4175), not ONT_WEB_PORT" },
  { token: "ONT_WEB_RESOLVER_URL", why: "web reads ONT_RESOLVER_URL, not ONT_WEB_RESOLVER_URL" },
  { token: "/api/health", why: "web health endpoint is /health, not /api/health" },
  { token: "apps/indexer/src/index.js", why: "indexer index.js is exports-only; the daemon is main.js" },
  { token: "dist/apps/indexer/src/index.js", why: "indexer daemon entry is main.js, not index.js" },
];

// Clean-stack tokens that MUST appear in docker-compose.yml (the stack must wire the real clean env).
const REQUIRE_COMPOSE = [
  { token: "bitcoind:", why: "a fresh signet bitcoind service is part of the clean-slate stack" },
  { token: "ONT_SOURCE", why: "indexer live ingest needs ONT_SOURCE=node" },
  { token: "ONT_CHAIN", why: "indexer chain gate needs ONT_CHAIN=signet" },
  { token: "ONT_RPC_URL", why: "indexer node source needs the bitcoind RPC URL" },
  { token: "ONT_STORE", why: "durable confirmed-anchor store selector (file)" },
  { token: "ONT_STORE_DIR", why: "shared durable store dir (indexer writes, resolver reads)" },
  { token: "ONT_RESOLVER_URL", why: "web reads its tx source from the resolver URL" },
];

// Clean-stack requirements for the entrypoint dispatch.
const REQUIRE_ENTRYPOINT = [
  { token: "apps/indexer/dist/apps/indexer/src/main.js", why: "indexer service must exec the daemon main.js" },
];

const violations = [];

function read(path) {
  if (!existsSync(path)) {
    violations.push(`MISSING: ${path} — required deploy-infra file is absent`);
    return "";
  }
  return readFileSync(path, "utf8");
}

const text = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, read(p)]));
const allText = Object.entries(text).map(([k, v]) => ({ file: FILES[k], v }));

for (const { token, why } of DENY) {
  for (const { file, v } of allText) {
    if (v.includes(token)) violations.push(`OLD-STACK in ${file}: "${token}" — ${why}`);
  }
}
for (const { token, why } of REQUIRE_COMPOSE) {
  if (!text.compose.includes(token)) violations.push(`MISSING in ${FILES.compose}: "${token}" — ${why}`);
}
for (const { token, why } of REQUIRE_ENTRYPOINT) {
  if (!text.entrypoint.includes(token)) violations.push(`MISSING in ${FILES.entrypoint}: "${token}" — ${why}`);
}

if (violations.length > 0) {
  console.error("check-deploy-clean-stack: FAIL");
  for (const v of violations) console.error(`  - ${v}`);
  console.error(`\n${violations.length} violation(s). The deploy infra still carries old-stack wiring.`);
  process.exit(1);
}

console.log("check-deploy-clean-stack: clean (docker-compose.yml, docker/entrypoint.sh, .env.example)");
