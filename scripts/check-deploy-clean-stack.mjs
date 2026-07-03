#!/usr/bin/env node
// Go-live G3 slice-1 — deploy-infra clean-stack gate. See docs/operate/G3_CLEAN_SLATE_VPS.md.
//
// The clean-build go-live stack is private-signet miner -> bitcoind(private signet) ->
// indexer(node ingest -> durable file store) -> resolver(read) -> web(display). This gate is a RATCHET
// that keeps the checked-in deploy infra (docker-compose.yml, docker/entrypoint.sh, .env.example, miner
// assets) wired to the CLEAN apps' real runtime env and
// free of old-stack (pre-clean-build / pre-ONT-rebrand) leakage, and keeps the operator runbook honest
// (per-service coverage + repo-prep separated from DK-owned destructive steps). It is a STATIC shape check
// only — it does NOT boot the stack; the clean-slate private-signet boot/read smoke is the operator gate in the runbook.
//
// The clean runtime contract (verified against the app entrypoints):
//   resolver  apps/resolver/src/index.ts   PORT (4174), ONT_STORE, ONT_STORE_DIR; serves /health, /tx/:txid
//   web       apps/web/src/index.ts        PORT (4175), ONT_RESOLVER_URL; serves /health
//   indexer   apps/indexer/src/main.ts     ONT_SOURCE=node, ONT_CHAIN, ONT_RPC_URL[/_USER/_PASSWORD],
//                                          ONT_STORE=file, ONT_STORE_DIR, INDEXER_POLL_MS; chain-gated daemon
//   publisher apps/publisher/src/index.ts  PORT (4176), ONT_SOURCE=node, ONT_CHAIN, ONT_RPC_URL[/_USER/_PASSWORD];
//                                          chain-gated, non-signing; /assemble/* (unsigned) + /broadcast (signed raw)
//   stores    @ont/indexer select-stores   ONT_STORE=memory|file + ONT_STORE_DIR (resolver reads the same dir)
//   runtime   @ont/node-live               ONT_SOURCE | ONT_CHAIN | ONT_RPC_URL | ONT_RPC_USER | ONT_RPC_PASSWORD
//   miner     private-signet-miner         ONT_SIGNET_MINER_ADDRESS, ONT_SIGNET_BOOTSTRAP_BLOCKS,
//                                          ONT_SIGNET_MINE_INTERVAL_SECONDS
//
// Exit 0 = clean; exit 1 = violations (listed). No deps; reads files as text.
import { existsSync, readFileSync } from "node:fs";

const FILES = {
  compose: "docker-compose.yml",
  entrypoint: "docker/entrypoint.sh",
  env: ".env.example",
  minerDockerfile: "docker/private-signet-miner.Dockerfile",
  minerScript: "docker/private-signet-miner.sh",
  runbook: "docs/operate/G3_CLEAN_SLATE_VPS.md",
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
// DENY is scoped to the wiring files; the checker's own deny-list literals here are not deploy infra.
const DENY_FILES = ["compose", "entrypoint", "env"];

// Clean-stack tokens that MUST appear in docker-compose.yml (plain substring).
const REQUIRE_COMPOSE = [
  { token: "bitcoind:", why: "a fresh signet bitcoind service is part of the clean-slate stack" },
  { token: "ONT_SOURCE", why: "indexer live ingest needs ONT_SOURCE=node" },
  { token: "ONT_CHAIN", why: "indexer chain gate needs ONT_CHAIN=signet" },
  { token: "ONT_RPC_URL", why: "indexer node source needs the bitcoind RPC URL" },
  { token: "ONT_RESOLVER_URL", why: "web reads its tx source from the resolver URL" },
  { token: "publisher:", why: "the non-signing publisher write service (assemble unsigned + broadcast signed raw) is part of the go-live write path" },
  { token: "private-signet-miner:", why: "private signet needs a miner sidecar for bootstrap maturity and ongoing confirmations" },
  { token: "-signetchallenge=${ONT_SIGNET_CHALLENGE:-51}", why: "bitcoind must run private signet, not public default signet" },
  { token: "-dnsseed=0", why: "private signet must not attempt public-signet DNS peer discovery" },
  { token: "ONT_SIGNET_MINER_ADDRESS", why: "miner coinbase must pay the off-box funding/signing wallet" },
];
// Clean-stack requirements that need exact shape, not just token presence (CL bar: ONT_STORE=file + nonempty dir).
const REQUIRE_COMPOSE_RE = [
  { re: /ONT_STORE:\s*file\b/, why: "durable store must be ONT_STORE=file (not memory) for live read" },
  { re: /ONT_STORE_DIR:\s*\S+/, why: "ONT_STORE_DIR must be set to a nonempty path (indexer writes, resolver reads)" },
  { re: /PORT:\s*"4176"/, why: "publisher service must set PORT=4176 (its HTTP listen port — index.ts default)" },
  { re: /ONT_SIGNET_BOOTSTRAP_BLOCKS:\s*"\$\{ONT_SIGNET_BOOTSTRAP_BLOCKS:-110\}"/, why: "miner must bootstrap 110 blocks by default so coinbase matures" },
  { re: /ONT_SIGNET_MINE_INTERVAL_SECONDS:\s*"\$\{ONT_SIGNET_MINE_INTERVAL_SECONDS:-45\}"/, why: "miner must keep producing low-rate blocks for confirmations" },
];

// Clean-stack requirements for the entrypoint dispatch.
const REQUIRE_ENTRYPOINT = [
  { token: "apps/indexer/dist/apps/indexer/src/main.js", why: "indexer service must exec the daemon main.js" },
];

// Runbook must carry per-service coverage and separate repo-prep from DK-owned destructive steps (CL bar).
// The publisher is now part of the go-live write path (publisher slice), so its per-service row IS required.
const REQUIRE_RUNBOOK_RE = [
  { re: /\|\s*\*\*bitcoind\*\*/, why: "runbook needs a per-service row for bitcoind (env/storage/health/smoke)" },
  { re: /\|\s*\*\*indexer\*\*/, why: "runbook needs a per-service row for indexer" },
  { re: /\|\s*\*\*resolver\*\*/, why: "runbook needs a per-service row for resolver" },
  { re: /\|\s*\*\*web\*\*/, why: "runbook needs a per-service row for web" },
  { re: /\|\s*\*\*publisher\*\*/, why: "runbook needs a per-service row for the publisher write service" },
  { re: /\|\s*\*\*private-signet-miner\*\*/, why: "runbook needs a per-service row for the private-signet miner" },
  { re: /repo-prep/i, why: "runbook must label the non-destructive repo-prep steps" },
  { re: /destructive/i, why: "runbook must call out the destructive teardown explicitly" },
  { re: /DK-owned/i, why: "destructive VPS teardown must be marked DK-owned, separated from repo-prep" },
];

const REQUIRE_ENV = [
  { token: "ONT_SIGNET_CHALLENGE=51", why: ".env.example must document the private-signet OP_TRUE challenge" },
  { token: "ONT_SIGNET_MINER_ADDRESS=replace-with-off-box-legacy-signet-address", why: ".env.example must require the off-box funding wallet address" },
  { token: "ONT_SIGNET_BOOTSTRAP_BLOCKS=110", why: ".env.example must pin the 110-block coinbase-maturity bootstrap default" },
];

const REQUIRE_MINER_DOCKERFILE = [
  { token: "contrib/signet/miner", why: "miner sidecar must adapt Bitcoin Core's proven signet miner" },
  { token: "grind-header-fast.c", why: "miner sidecar must build the checked-in fast grinder" },
  { token: "ont-private-signet-miner", why: "miner image must enter through the compose miner wrapper" },
];

const REQUIRE_MINER_SCRIPT = [
  { token: "signetchallenge=${SIGNET_CHALLENGE}", why: "miner bitcoin-cli config must use the same private-signet challenge as bitcoind" },
  { token: "replace-with-off-box-legacy-signet-address", why: "miner must fail closed if the operator leaves the placeholder address in .env" },
  { token: "ONT_SIGNET_MINER_ADDRESS", why: "miner must pay coinbase to the off-box funding wallet" },
  { token: "ONT_SIGNET_BOOTSTRAP_BLOCKS", why: "miner must bootstrap to the coinbase maturity target" },
  { token: "ONT_SIGNET_MINE_INTERVAL_SECONDS", why: "miner must keep mining at a low ongoing cadence" },
  { token: "contrib/signet/miner", why: "miner wrapper must call Bitcoin Core's signet miner" },
  { token: "--grind-cmd", why: "miner wrapper must pass the fast grinder command" },
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

for (const { token, why } of DENY) {
  for (const k of DENY_FILES) {
    if (text[k].includes(token)) violations.push(`OLD-STACK in ${FILES[k]}: "${token}" — ${why}`);
  }
}
for (const { token, why } of REQUIRE_COMPOSE) {
  if (!text.compose.includes(token)) violations.push(`MISSING in ${FILES.compose}: "${token}" — ${why}`);
}
for (const { re, why } of REQUIRE_COMPOSE_RE) {
  if (!re.test(text.compose)) violations.push(`MISSING in ${FILES.compose}: /${re.source}/ — ${why}`);
}
for (const { token, why } of REQUIRE_ENTRYPOINT) {
  if (!text.entrypoint.includes(token)) violations.push(`MISSING in ${FILES.entrypoint}: "${token}" — ${why}`);
}
for (const { token, why } of REQUIRE_ENV) {
  if (!text.env.includes(token)) violations.push(`MISSING in ${FILES.env}: "${token}" — ${why}`);
}
for (const { token, why } of REQUIRE_MINER_DOCKERFILE) {
  if (!text.minerDockerfile.includes(token)) violations.push(`MISSING in ${FILES.minerDockerfile}: "${token}" — ${why}`);
}
for (const { token, why } of REQUIRE_MINER_SCRIPT) {
  if (!text.minerScript.includes(token)) violations.push(`MISSING in ${FILES.minerScript}: "${token}" — ${why}`);
}
for (const { re, why } of REQUIRE_RUNBOOK_RE) {
  if (!re.test(text.runbook)) violations.push(`MISSING in ${FILES.runbook}: /${re.source}/ — ${why}`);
}

// Quarantine ratchet (old-deploy quarantine — docs/operate/OLD_DEPLOY_QUARANTINE_SCOPE.md): every ./scripts/<file>
// a live root package.json entry invokes must exist, and no live entry may point into the quarantine dir
// (legacy/scripts/). Catches a script dropped/moved while its npm entry is left behind, or a quarantined script
// wired back to a live entry.
{
  const pkgPath = "package.json";
  const raw = read(pkgPath);
  let scripts = {};
  try {
    scripts = (JSON.parse(raw || "{}").scripts) ?? {};
  } catch (err) {
    violations.push(`UNREADABLE ${pkgPath}: ${err.message}`);
  }
  for (const [name, cmd] of Object.entries(scripts)) {
    if (/\blegacy\/scripts\//.test(cmd)) {
      violations.push(`QUARANTINED-REF in ${pkgPath}: script "${name}" invokes legacy/scripts/ — quarantined scripts must not be wired to a live npm entry`);
    }
    for (const m of cmd.matchAll(/\.\/scripts\/([A-Za-z0-9_.-]+)/g)) {
      if (!existsSync(`scripts/${m[1]}`)) {
        violations.push(`DANGLING in ${pkgPath}: script "${name}" invokes ./scripts/${m[1]} which does not exist (quarantined or deleted — drop or repoint the entry)`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error("check-deploy-clean-stack: FAIL");
  for (const v of violations) console.error(`  - ${v}`);
  console.error(`\n${violations.length} violation(s). The deploy infra still carries old-stack wiring.`);
  process.exit(1);
}

console.log("check-deploy-clean-stack: clean (docker-compose.yml, docker/entrypoint.sh, miner assets, .env.example, runbook, package.json script targets)");
