#!/usr/bin/env node
// Minimal Esplora-shaped HTTP adapter over a Bitcoin backend.
//
// The ONT reference wallet talks to the wider network through a small set of
// Esplora-style endpoints:
//
//   GET  /address/{address}/utxo   -> confirmed spendable outputs (funding)
//   POST /tx                        -> broadcast a raw transaction
//   GET  /address/{address}         -> chain/mempool funded/spent stats (check-address)
//   GET  /block-height/{height}     -> block hash at height (check-esplora)
//   GET  /tx/{txid}/status          -> confirmation status of a tx
//   GET  /tx/{txid}/hex             -> raw transaction hex
//
// Many node setups expose those facts but not the Blockstream-electrs Esplora
// REST API. This adapter translates the wallet's calls (plus a couple of
// harmless read-only extras) onto one of two backends:
//
//   SHIM_BACKEND=rpc        -> Bitcoin Core JSON-RPC (scantxoutset + sendrawtransaction)
//   SHIM_BACKEND=electrum   -> an Electrum server such as romanz/electrs
//                              (blockchain.scripthash.listunspent + transaction.broadcast)
//
// The Electrum backend is the useful one for a private signet that already runs
// Core + romanz/electrs (Electrum only, no Esplora REST) and exposes the
// Electrum port publicly: point the shim at it and the wallet can fund +
// broadcast with no node credentials and nothing installed server-side.
//
// This adapter holds no keys and signs nothing; it is a pure read/relay shim.
//
// Config (all via env):
//   SHIM_BIND               bind address                 (default 127.0.0.1)
//   SHIM_PORT               listen port                  (default 3002)
//   SHIM_BACKEND            "rpc" | "electrum"           (default rpc)
//   SHIM_ALLOW_ORIGIN       optional CORS allow-origin
//  rpc backend:
//   BITCOIN_RPC_URL         Core RPC base URL            (default http://127.0.0.1:38332)
//   BITCOIN_RPC_USER        Core RPC username
//   BITCOIN_RPC_PASSWORD    Core RPC password
//  electrum backend:
//   ELECTRUM_HOST           Electrum host                (default 127.0.0.1)
//   ELECTRUM_PORT           Electrum port                (default 50001)
//   ELECTRUM_TLS            "1" to use TLS               (default off)
//   ELECTRUM_NETWORK        address network params       (default testnet; signet uses testnet)

import { createServer } from "node:http";
import net from "node:net";
import tls from "node:tls";
import { createHash } from "node:crypto";
import { address as bjsAddress, networks } from "bitcoinjs-lib";

const BIND = process.env.SHIM_BIND ?? "127.0.0.1";
const PORT = Number.parseInt(process.env.SHIM_PORT ?? "3002", 10);
const BACKEND = (process.env.SHIM_BACKEND ?? "rpc").toLowerCase();
const ALLOW_ORIGIN = process.env.SHIM_ALLOW_ORIGIN ?? "";

class BackendError extends Error {
  constructor(message, httpStatus = 502) {
    super(message);
    this.httpStatus = httpStatus;
  }
}

function satsFromBtc(amountBtc) {
  const fixed = Number(amountBtc).toFixed(8);
  const [whole, frac] = fixed.split(".");
  return Number(BigInt(whole) * 100000000n + BigInt(frac));
}

// ---------------------------------------------------------------------------
// Bitcoin Core RPC backend
// ---------------------------------------------------------------------------

function makeRpcBackend() {
  const url = (process.env.BITCOIN_RPC_URL ?? "http://127.0.0.1:38332").replace(/\/+$/, "");
  const user = process.env.BITCOIN_RPC_USER ?? "";
  const password = process.env.BITCOIN_RPC_PASSWORD ?? "";
  const authHeader =
    user.length > 0 || password.length > 0
      ? `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`
      : null;

  async function rpc(method, params = []) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(authHeader ? { authorization: authHeader } : {}) },
      body: JSON.stringify({ jsonrpc: "1.0", id: "esplora-shim", method, params })
    });
    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new BackendError(`non-JSON RPC response (HTTP ${response.status}): ${text.slice(0, 200)}`, 502);
    }
    if (parsed.error) {
      throw new BackendError(parsed.error.message ?? "rpc error", 400);
    }
    return parsed.result;
  }

  return {
    label: `rpc ${url}`,
    async listUnspent(address) {
      const scan = await rpc("scantxoutset", ["start", [{ desc: `addr(${address})` }]]);
      if (!scan || scan.success !== true) {
        throw new BackendError("scantxoutset did not complete", 502);
      }
      return (scan.unspents ?? []).map((u) => ({
        txid: u.txid,
        vout: u.vout,
        value: satsFromBtc(u.amount),
        status: { confirmed: true, block_height: Number(u.height ?? 0) }
      }));
    },
    async broadcast(rawHex) {
      return String(await rpc("sendrawtransaction", [rawHex.trim()]));
    },
    async tipHeight() {
      return Number(await rpc("getblockcount"));
    },
    async blockHashAtHeight(height) {
      return String(await rpc("getblockhash", [height]));
    },
    async transactionHex(txid) {
      return String(await rpc("getrawtransaction", [txid, false]));
    },
    async transactionStatus(txid) {
      const info = await rpc("getrawtransaction", [txid, true]);
      const confirmations = Number(info?.confirmations ?? 0);
      const blockHash = typeof info?.blockhash === "string" ? info.blockhash : undefined;
      const blockTime = info?.blocktime != null ? Number(info.blocktime) : undefined;
      let blockHeight;
      if (blockHash) {
        try {
          const header = await rpc("getblockheader", [blockHash]);
          if (header?.height != null) blockHeight = Number(header.height);
        } catch {
          // best-effort: status without height is still valid Esplora shape
        }
      }
      return {
        confirmed: confirmations > 0 || blockHash !== undefined,
        ...(Number.isInteger(blockHeight) ? { block_height: blockHeight } : {}),
        ...(blockHash !== undefined ? { block_hash: blockHash } : {}),
        ...(blockTime !== undefined ? { block_time: blockTime } : {})
      };
    },
    async addressSummary(address) {
      // Core has no address index, so this only sees current unspents:
      // funded == current UTXOs, spent unknown (reported 0). The Electrum
      // backend computes accurate funded/spent stats.
      const scan = await rpc("scantxoutset", ["start", [{ desc: `addr(${address})` }]]);
      const unspents = (scan && scan.success === true ? scan.unspents : []) ?? [];
      let fundedSum = 0;
      for (const u of unspents) fundedSum += satsFromBtc(u.amount);
      const empty = { funded_txo_count: 0, funded_txo_sum: 0, spent_txo_count: 0, spent_txo_sum: 0, tx_count: 0 };
      return {
        address,
        chain_stats: {
          funded_txo_count: unspents.length,
          funded_txo_sum: fundedSum,
          spent_txo_count: 0,
          spent_txo_sum: 0,
          tx_count: unspents.length
        },
        mempool_stats: empty
      };
    },
    async info() {
      const chain = await rpc("getblockchaininfo");
      return { chain: chain.chain, blocks: chain.blocks };
    }
  };
}

// Block hash = reversed double-SHA256 of the 80-byte header.
function blockHashFromHeaderHex(headerHex) {
  const header = Buffer.from(headerHex, "hex");
  const first = createHash("sha256").update(header).digest();
  const second = createHash("sha256").update(first).digest();
  return Buffer.from(second).reverse().toString("hex");
}

// ---------------------------------------------------------------------------
// Electrum backend (romanz/electrs, etc.)
// ---------------------------------------------------------------------------

function makeElectrumBackend() {
  const host = process.env.ELECTRUM_HOST ?? "127.0.0.1";
  const port = Number.parseInt(process.env.ELECTRUM_PORT ?? "50001", 10);
  const useTls = process.env.ELECTRUM_TLS === "1";
  const networkName = process.env.ELECTRUM_NETWORK ?? "testnet";
  const network =
    networkName === "bitcoin" ? networks.bitcoin : networkName === "regtest" ? networks.regtest : networks.testnet;

  let nextId = 1;

  // One short-lived connection per request: simple and robust for low volume.
  function call(method, params) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const sock = useTls
        ? tls.connect({ host, port, rejectUnauthorized: false })
        : net.connect({ host, port });
      let buf = "";
      const timer = setTimeout(() => {
        sock.destroy();
        reject(new BackendError(`electrum ${method} timed out`, 504));
      }, 20000);
      const onReady = () => sock.write(JSON.stringify({ id, method, params }) + "\n");
      sock.on(useTls ? "secureConnect" : "connect", onReady);
      sock.on("data", (d) => {
        buf += d.toString("utf8");
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (!line.trim()) continue;
          let msg;
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          if (msg.id !== id) continue;
          clearTimeout(timer);
          sock.end();
          if (msg.error) {
            const m = typeof msg.error === "string" ? msg.error : msg.error.message ?? JSON.stringify(msg.error);
            return reject(new BackendError(m, 400));
          }
          return resolve(msg.result);
        }
      });
      sock.on("error", (e) => {
        clearTimeout(timer);
        reject(new BackendError(`electrum socket error: ${e.message}`, 502));
      });
    });
  }

  function scripthash(address) {
    const spk = bjsAddress.toOutputScript(address, network);
    const digest = createHash("sha256").update(spk).digest();
    return Buffer.from(digest).reverse().toString("hex");
  }

  return {
    label: `electrum ${host}:${port}`,
    async listUnspent(address) {
      const sh = scripthash(address);
      const unspents = await call("blockchain.scripthash.listunspent", [sh]);
      return (unspents ?? []).map((u) => ({
        txid: u.tx_hash,
        vout: u.tx_pos,
        value: Number(u.value),
        status: { confirmed: Number(u.height) > 0, block_height: Number(u.height) || undefined }
      }));
    },
    async broadcast(rawHex) {
      return String(await call("blockchain.transaction.broadcast", [rawHex.trim()]));
    },
    async tipHeight() {
      const header = await call("blockchain.headers.subscribe", []);
      return Number(header?.height ?? 0);
    },
    async blockHashAtHeight(height) {
      const headerHex = await call("blockchain.block.header", [height]);
      if (typeof headerHex !== "string" || headerHex.length < 160) {
        throw new BackendError(`electrum block.header(${height}) returned no header`, 404);
      }
      return blockHashFromHeaderHex(headerHex);
    },
    async transactionHex(txid) {
      return String(await call("blockchain.transaction.get", [txid, false]));
    },
    async transactionStatus(txid) {
      const verbose = await call("blockchain.transaction.get", [txid, true]);
      if (!verbose || typeof verbose !== "object") {
        throw new BackendError(`electrum transaction.get(${txid}) returned no data`, 404);
      }
      const confirmations = Number(verbose.confirmations ?? 0);
      const blockHash = typeof verbose.blockhash === "string" ? verbose.blockhash : undefined;
      const blockTime = verbose.blocktime != null ? Number(verbose.blocktime) : undefined;
      let blockHeight;
      if (confirmations > 0) {
        const header = await call("blockchain.headers.subscribe", []);
        const tip = Number(header?.height ?? 0);
        if (tip > 0) blockHeight = tip - confirmations + 1;
      }
      return {
        confirmed: confirmations > 0 || blockHash !== undefined,
        ...(Number.isInteger(blockHeight) ? { block_height: blockHeight } : {}),
        ...(blockHash !== undefined ? { block_hash: blockHash } : {}),
        ...(blockTime !== undefined ? { block_time: blockTime } : {})
      };
    },
    async addressSummary(address) {
      const sh = scripthash(address);
      // bitcoinjs toOutputScript returns a Uint8Array; Buffer.from(...) is
      // required for a real hex string (Uint8Array.toString("hex") is a no-op).
      const spkHex = Buffer.from(bjsAddress.toOutputScript(address, network)).toString("hex").toLowerCase();
      const [history, unspents] = await Promise.all([
        call("blockchain.scripthash.get_history", [sh]),
        call("blockchain.scripthash.listunspent", [sh])
      ]);
      const historyList = Array.isArray(history) ? history : [];
      const unspentList = Array.isArray(unspents) ? unspents : [];

      // Outpoints still unspent right now (txid:vout -> true).
      const unspentKeys = new Set(unspentList.map((u) => `${u.tx_hash}:${u.tx_pos}`));

      // Walk each tx touching the address once; collect outputs that fund it.
      const confirmedFunded = [];
      const mempoolFunded = [];
      let confirmedTxCount = 0;
      let mempoolTxCount = 0;
      for (const entry of historyList) {
        const isConfirmed = Number(entry.height) > 0;
        if (isConfirmed) confirmedTxCount += 1;
        else mempoolTxCount += 1;
        const verbose = await call("blockchain.transaction.get", [entry.tx_hash, true]);
        const vouts = verbose && Array.isArray(verbose.vout) ? verbose.vout : [];
        vouts.forEach((out, index) => {
          const outHex = typeof out?.scriptPubKey?.hex === "string" ? out.scriptPubKey.hex.toLowerCase() : "";
          if (outHex !== spkHex) return;
          const n = Number(out.n ?? index);
          (isConfirmed ? confirmedFunded : mempoolFunded).push({
            key: `${entry.tx_hash}:${n}`,
            value: satsFromBtc(out.value)
          });
        });
      }

      const statsFor = (funded, txCount) => {
        let fundedSum = 0;
        let unspentCount = 0;
        let unspentSum = 0;
        for (const f of funded) {
          fundedSum += f.value;
          if (unspentKeys.has(f.key)) {
            unspentCount += 1;
            unspentSum += f.value;
          }
        }
        return {
          funded_txo_count: funded.length,
          funded_txo_sum: fundedSum,
          spent_txo_count: funded.length - unspentCount,
          spent_txo_sum: fundedSum - unspentSum,
          tx_count: txCount
        };
      };

      return {
        address,
        chain_stats: statsFor(confirmedFunded, confirmedTxCount),
        mempool_stats: statsFor(mempoolFunded, mempoolTxCount)
      };
    },
    async info() {
      const header = await call("blockchain.headers.subscribe", []);
      return { chain: networkName, blocks: Number(header?.height ?? 0) };
    }
  };
}

const backend = BACKEND === "electrum" ? makeElectrumBackend() : makeRpcBackend();

// ---------------------------------------------------------------------------
// HTTP surface (Esplora-shaped)
// ---------------------------------------------------------------------------

function send(res, status, body, contentType = "application/json") {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const headers = { "content-type": contentType };
  if (ALLOW_ORIGIN) {
    headers["access-control-allow-origin"] = ALLOW_ORIGIN;
    headers["access-control-allow-methods"] = "GET,POST,OPTIONS";
    headers["access-control-allow-headers"] = "content-type";
  }
  res.writeHead(status, headers);
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (req.method === "OPTIONS") {
      return send(res, 204, "");
    }

    const utxoMatch = path.match(/^\/address\/([^/]+)\/utxo$/);
    if (req.method === "GET" && utxoMatch) {
      const address = decodeURIComponent(utxoMatch[1]);
      return send(res, 200, await backend.listUnspent(address));
    }

    const addressMatch = path.match(/^\/address\/([^/]+)$/);
    if (req.method === "GET" && addressMatch) {
      const address = decodeURIComponent(addressMatch[1]);
      return send(res, 200, await backend.addressSummary(address));
    }

    const blockHeightMatch = path.match(/^\/block-height\/(\d+)$/);
    if (req.method === "GET" && blockHeightMatch) {
      const height = Number.parseInt(blockHeightMatch[1], 10);
      return send(res, 200, await backend.blockHashAtHeight(height), "text/plain");
    }

    const txStatusMatch = path.match(/^\/tx\/([0-9a-fA-F]{64})\/status$/);
    if (req.method === "GET" && txStatusMatch) {
      return send(res, 200, await backend.transactionStatus(txStatusMatch[1].toLowerCase()));
    }

    const txHexMatch = path.match(/^\/tx\/([0-9a-fA-F]{64})\/hex$/);
    if (req.method === "GET" && txHexMatch) {
      return send(res, 200, await backend.transactionHex(txHexMatch[1].toLowerCase()), "text/plain");
    }

    if (req.method === "POST" && path === "/tx") {
      const raw = await readBody(req);
      try {
        return send(res, 200, await backend.broadcast(raw), "text/plain");
      } catch (error) {
        return send(res, 400, error instanceof Error ? error.message : String(error), "text/plain");
      }
    }

    if (req.method === "GET" && path === "/blocks/tip/height") {
      return send(res, 200, String(await backend.tipHeight()), "text/plain");
    }

    if (req.method === "GET" && path === "/fee-estimates") {
      return send(res, 200, {});
    }

    if (req.method === "GET" && path === "/") {
      const info = await backend.info();
      return send(res, 200, { ok: true, adapter: "esplora-rpc-shim", backend: backend.label, ...info });
    }

    return send(res, 404, {
      error: "not_found",
      paths: [
        "/address/{address}/utxo",
        "/address/{address}",
        "/tx",
        "/tx/{txid}/status",
        "/tx/{txid}/hex",
        "/block-height/{height}",
        "/blocks/tip/height",
        "/"
      ]
    });
  } catch (error) {
    const status = error instanceof BackendError ? Math.max(400, error.httpStatus) : 500;
    send(res, status, { error: "shim_error", message: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, BIND, () => {
  process.stdout.write(
    `esplora-rpc-shim listening on http://${BIND}:${PORT} via ${backend.label}\n` +
      `  GET  /address/{address}/utxo\n` +
      `  GET  /address/{address}\n` +
      `  GET  /block-height/{height}\n` +
      `  GET  /tx/{txid}/status\n` +
      `  GET  /tx/{txid}/hex\n` +
      `  GET  /blocks/tip/height\n` +
      `  POST /tx\n`
  );
});
