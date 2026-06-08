// Bare-claim browser client.
//
// The trust-sensitive surface, kept small and auditable: it derives the owner key
// locally from a 12-word phrase (see ./keys.ts), verifies the publisher's inclusion
// proof against its own anchored root, and trusts nothing the publisher returns.
import { sha256 } from "@noble/hashes/sha2.js";
import { deriveFundingAddress, deriveOwnerKey, generateMnemonic12, isValidMnemonic, type OwnerKey } from "./keys.js";

// ---------- bytes / hex ----------
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
const HEX_PATTERN = /^[0-9a-f]*$/;
function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.toLowerCase();
  if (!HEX_PATTERN.test(normalized) || normalized.length % 2 !== 0) throw new Error("invalid hex");
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) out[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
  return out;
}
function utf8ToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
function sha256Bytes(bytes: Uint8Array): Uint8Array {
  return Uint8Array.from(sha256(bytes));
}

// ---------- name + accumulator (verify half of the engine) ----------
const NAME_PATTERN = /^[a-z0-9]{1,32}$/;
function normalizeName(input: string): string {
  const normalized = input.trim().toLowerCase();
  if (!NAME_PATTERN.test(normalized)) throw new Error("invalid name: lowercase a-z and 0-9, 1-32 characters");
  return normalized;
}
function isValidName(input: string): boolean {
  try { normalizeName(input); return true; } catch { return false; }
}

const ACCUMULATOR_DEPTH = 256;
const EMPTY_NODE = new Uint8Array(32);
const LEAF_DOMAIN = Uint8Array.from([0x00]);
const INTERNAL_DOMAIN = Uint8Array.from([0x01]);
function hashLeaf(key: Uint8Array, value: Uint8Array): Uint8Array {
  return sha256Bytes(concatBytes(LEAF_DOMAIN, key, value));
}
function hashInternal(left: Uint8Array, right: Uint8Array): Uint8Array {
  return sha256Bytes(concatBytes(INTERNAL_DOMAIN, left, right));
}
const DEFAULTS: readonly Uint8Array[] = ((): readonly Uint8Array[] => {
  const defaults: Uint8Array[] = new Array(ACCUMULATOR_DEPTH + 1);
  defaults[ACCUMULATOR_DEPTH] = EMPTY_NODE;
  for (let level = ACCUMULATOR_DEPTH - 1; level >= 0; level -= 1) {
    const child = defaults[level + 1] ?? EMPTY_NODE;
    defaults[level] = hashInternal(child, child);
  }
  return defaults;
})();
function keyBit(key: Uint8Array, index: number): 0 | 1 {
  const byte = key[index >> 3] ?? 0;
  return ((byte >> (7 - (index & 7))) & 1) as 0 | 1;
}
function accumulatorKeyForName(name: string): string {
  return bytesToHex(sha256Bytes(utf8ToBytes(normalizeName(name))));
}
interface AccumulatorProof {
  readonly keyHex: string;
  readonly value: string | null;
  readonly siblings: readonly { readonly level: number; readonly hash: string }[];
}
function verifyAccumulatorProof(rootHex: string, proof: AccumulatorProof): boolean {
  const key = hexToBytes(proof.keyHex);
  const siblingByLevel = new Map<number, Uint8Array>();
  for (const sibling of proof.siblings) siblingByLevel.set(sibling.level, hexToBytes(sibling.hash));
  let digest = proof.value === null ? EMPTY_NODE : hashLeaf(key, hexToBytes(proof.value));
  for (let childLevel = ACCUMULATOR_DEPTH; childLevel >= 1; childLevel -= 1) {
    const parentLevel = childLevel - 1;
    const sibling = siblingByLevel.get(childLevel) ?? DEFAULTS[childLevel] ?? EMPTY_NODE;
    digest = keyBit(key, parentLevel) === 0 ? hashInternal(digest, sibling) : hashInternal(sibling, digest);
  }
  return bytesToHex(digest) === rootHex.toLowerCase();
}

// ---------- claim API (trust nothing the publisher returns) ----------
const NOTICE_WINDOW_BLOCKS = 6;
interface ClaimQuote {
  readonly quoteId: string;
  readonly name: string;
  readonly available: boolean;
  readonly reason?: string;
  readonly totalBaseSats?: string;
  readonly ownerCommitment: string;
  readonly leaf: string;
  readonly lightningInvoice?: string;
}
interface InclusionProof {
  readonly root: string;
  readonly leaf: string;
  readonly value: string;
  readonly siblings: ReadonlyArray<{ readonly level: number; readonly hash: string }>;
}
interface ClaimReceipt {
  readonly status: string;
  readonly name: string;
  readonly reason?: string;
  readonly anchorTxid?: string;
  readonly anchorHeight?: number;
  readonly inclusionProof?: InclusionProof;
}
interface ClaimResult {
  readonly ok: boolean;
  readonly problems: string[];
  readonly status: string;
  readonly anchorTxid: string | null;
  readonly anchorHeight: number;
  readonly noticeWindowCloseHeight: number;
  readonly proofVerified: boolean;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  let parsed: unknown;
  try { parsed = text ? JSON.parse(text) : undefined; } catch { throw new Error(`Non-JSON response from ${url}`); }
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    if (parsed && typeof parsed === "object" && "message" in parsed) message = String((parsed as Record<string, unknown>).message);
    throw new Error(message);
  }
  return parsed as T;
}

function unavailableMessage(name: string, reason?: string): string {
  switch (reason) {
    case "taken": return `"${name}" is already owned.`;
    case "reserved": return `"${name}" has a pending claim right now — it frees up within a few minutes if that claim isn't completed. Try again shortly.`;
    case "auction_pending": return `"${name}" is being auctioned.`;
    default: return `"${name}" is unavailable${reason ? ` (${reason})` : ""}.`;
  }
}

async function fetchVerifiedQuote(name: string, ownerPubkey: string): Promise<ClaimQuote> {
  const normalized = normalizeName(name);
  const quote = await requestJson<ClaimQuote>(`/api/claim/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: normalized, ownerPubkey, paymentRail: "lightning" })
  });
  if (!quote.available) throw new Error(unavailableMessage(normalized, quote.reason));
  const problems: string[] = [];
  if ((quote.leaf ?? "").toLowerCase() !== accumulatorKeyForName(normalized)) problems.push("quote leaf does not match H(name)");
  if ((quote.ownerCommitment ?? "").toLowerCase() !== ownerPubkey.toLowerCase()) problems.push("quote does not commit this owner key");
  if (problems.length > 0) throw new Error(problems.join("; "));
  return quote;
}

function evaluateReceipt(name: string, ownerPubkey: string, receipt: ClaimReceipt): ClaimResult {
  const problems: string[] = [];
  const proof = receipt.inclusionProof;
  let proofVerified = false;
  if (receipt.status === "confirmed") {
    if (!proof || !receipt.anchorTxid) {
      problems.push("publisher reported confirmed without an inclusion proof + anchor txid");
    } else {
      proofVerified = verifyAccumulatorProof(proof.root, { keyHex: proof.leaf, value: proof.value, siblings: proof.siblings });
      if (!proofVerified) problems.push("inclusion proof does not verify against its committed root");
      if ((proof.leaf ?? "").toLowerCase() !== accumulatorKeyForName(name)) problems.push("inclusion proof is for a different name");
      if ((proof.value ?? "").toLowerCase() !== ownerPubkey) problems.push("inclusion proof commits a different owner key");
    }
  }
  const anchorHeight = receipt.anchorHeight ?? 0;
  return {
    ok: receipt.status === "confirmed" && problems.length === 0,
    problems,
    status: receipt.status,
    anchorTxid: receipt.anchorTxid ?? null,
    anchorHeight,
    noticeWindowCloseHeight: anchorHeight > 0 ? anchorHeight + NOTICE_WINDOW_BLOCKS : 0,
    proofVerified
  };
}

async function submitClaim(quoteId: string, name: string, ownerPubkey: string): Promise<ClaimResult> {
  const receipt = await requestJson<ClaimReceipt>(`/api/claim/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quoteId, paymentProof: { rail: "lightning" } })
  });
  return evaluateReceipt(normalizeName(name), ownerPubkey.toLowerCase(), receipt);
}

// ---------- UI ----------
function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}
function setStatus(kind: "info" | "ok" | "error", html: string): void {
  const status = el<HTMLDivElement>("status");
  status.className = `status ${kind}`;
  status.innerHTML = html;
}
function esc(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}

// One wallet (one recovery phrase) holds many names, each under its own owner-key
// index — matching the app's HD model (m/696969'/0'/i'). `names` maps a claimed
// name to its index; `nextIndex` is the next free index to allocate. The same
// phrase therefore needs only one backup, and distinct keys keep names unlinkable.
interface ClaimWallet {
  mnemonic: string;
  names: Record<string, number>;
  nextIndex: number;
}
const WALLET_BACKUP_VERSION = 1;

let wallet: ClaimWallet | null = null;
let currentKey: OwnerKey | null = null;
let currentQuote: ClaimQuote | null = null;
let currentName = "";
let currentIndex = 0;

/** Create a fresh wallet on first use if none is active (or imported). */
function ensureWallet(): ClaimWallet {
  if (wallet === null) wallet = { mnemonic: generateMnemonic12(), names: {}, nextIndex: 0 };
  return wallet;
}

/**
 * The owner key index for a name: its existing index if already in this wallet,
 * otherwise the next free index. New (unclaimed) names share `nextIndex` until one
 * is claimed — claiming is what consumes an index, so re-checking before claiming
 * always re-derives at the current `nextIndex`.
 */
function indexForName(w: ClaimWallet, name: string): number {
  return name in w.names ? (w.names[name] as number) : w.nextIndex;
}

function showKeyBackup(name: string, w: ClaimWallet, key: OwnerKey, index: number): void {
  currentKey = key;
  currentName = name;
  currentIndex = index;
  el<HTMLElement>("key-section").hidden = false;
  el<HTMLElement>("mnemonic").textContent = w.mnemonic;
  el<HTMLElement>("owner-pubkey").textContent = key.ownerPubkey;
  el<HTMLElement>("owner-index").textContent = `#${index + 1}`;
  (el<HTMLInputElement>("backup-confirm")).checked = false;
  (el<HTMLButtonElement>("claim-btn")).disabled = true;
  // One deposit address per phrase (fixed funding path) — fund once for all names.
  el<HTMLElement>("funding-address").textContent = deriveFundingAddress(w.mnemonic);
  el<HTMLElement>("balance").textContent = "";
  el<HTMLElement>("wallet-section").hidden = false;
  renderWalletNames();
}

function renderWalletNames(): void {
  if (wallet === null) return;
  const entries = Object.entries(wallet.names).sort((a, b) => a[1] - b[1]);
  const wrap = el<HTMLElement>("wallet-names-wrap");
  wrap.hidden = entries.length === 0;
  const list = el<HTMLElement>("wallet-names");
  list.innerHTML = entries
    .map(([name, index]) => `<li><strong>${esc(name)}</strong> <span class="muted">— key #${index + 1}</span></li>`)
    .join("");
}

function downloadKey(): void {
  if (wallet === null) return;
  const blob = new Blob(
    [`ONT recovery phrase (keep secret — it controls every name in this wallet forever):\n${wallet.mnemonic}\n\nThis one phrase controls all names you claim under this wallet.\n`],
    { type: "text/plain" }
  );
  triggerDownload(blob, "ont-recovery-phrase.txt");
}

/** Download the full wallet backup: the phrase + the name→key-index map + nextIndex. */
function downloadWallet(): void {
  if (wallet === null) return;
  const backup = {
    format: "ont-claim-wallet",
    version: WALLET_BACKUP_VERSION,
    mnemonic: wallet.mnemonic,
    names: wallet.names,
    nextIndex: wallet.nextIndex
  };
  triggerDownload(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }), "ont-wallet-backup.json");
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function onCheck(event: Event): Promise<void> {
  event.preventDefault();
  el<HTMLElement>("key-section").hidden = true;
  el<HTMLElement>("result-section").hidden = true;
  // Keep the wallet section visible once a wallet is active (so an imported wallet
  // doesn't vanish on a failed check); it's hidden only before the first wallet.
  if (wallet === null) el<HTMLElement>("wallet-section").hidden = true;
  const raw = (el<HTMLInputElement>("name")).value;
  if (!isValidName(raw)) {
    setStatus("error", "Enter a valid name — lowercase a–z and 0–9, 1–32 characters.");
    return;
  }
  const name = normalizeName(raw);
  // Derive the owner key under the active wallet (creating a fresh wallet on first
  // use) at this name's index — its existing index if already in the wallet, else
  // the next free one. So a second name reuses your phrase at the next key, not a
  // whole new phrase.
  const w = ensureWallet();
  const index = indexForName(w, name);
  const key = deriveOwnerKey(w.mnemonic, index);
  // Reveal the derived key FIRST — this is pure local crypto and works with no
  // network (the offline / air-gapped path). Claiming is gated separately on a
  // verified quote, so being offline still lets you generate and save your keys.
  currentQuote = null;
  showKeyBackup(name, w, key, index);
  updateClaimEnabled();
  setStatus("info", `Key derived for <strong>${esc(name)}</strong> — checking availability…`);
  try {
    const quote = await fetchVerifiedQuote(name, key.ownerPubkey);
    currentQuote = quote;
    updateClaimEnabled();
    const cost = quote.totalBaseSats ? `₿${quote.totalBaseSats}` : "the ₿1,000 gate + a small publisher fee";
    const nth = Object.keys(w.names).length > 0 ? " It joins your existing wallet under a new key." : "";
    setStatus("ok", `<strong>${esc(name)}</strong> is available — about ${esc(cost)}.${nth} Save your phrase below, then claim it.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not check that name.";
    setStatus("error", `${esc(message)} Your key for <strong>${esc(name)}</strong> is shown below regardless (keys generate offline) — connect to claim it.`);
  }
}

/** Claim is allowed only once a verified quote exists AND the backup is confirmed. */
function updateClaimEnabled(): void {
  const confirmed = (el<HTMLInputElement>("backup-confirm")).checked;
  (el<HTMLButtonElement>("claim-btn")).disabled = !(confirmed && currentQuote !== null);
}

// The publisher returns names as a string[]; the resolver returns [{name, source}].
interface OwnerNamesResponse {
  readonly names?: ReadonlyArray<string | { readonly name?: string }>;
}

function extractNames(payload: OwnerNamesResponse): string[] {
  return (payload.names ?? [])
    .map((entry) => (typeof entry === "string" ? entry : entry?.name))
    .filter((n): n is string => typeof n === "string");
}

/**
 * Names owned by one derived key, unioning the publisher (local/fast) and the
 * resolver (authoritative/cross-publisher, if configured). `reachable` is true if
 * either source responded — so the scan can stop cleanly when fully offline.
 */
async function ownedNamesFor(ownerPubkey: string): Promise<{ names: string[]; reachable: boolean }> {
  const names = new Set<string>();
  let reachable = false;
  for (const path of [`/api/owner/${ownerPubkey}`, `/api/resolver/owner/${ownerPubkey}`]) {
    try {
      for (const n of extractNames(await requestJson<OwnerNamesResponse>(path))) names.add(n);
      reachable = true;
    } catch {
      // This source is unreachable/not-configured — fall back to the other.
    }
  }
  return { names: [...names], reachable };
}

/**
 * Gap-scan: rediscover which HD indices a seed already uses by asking which names
 * each derived owner key owns (publisher ∪ resolver). This makes the 12-word phrase
 * a SUFFICIENT backup — import the words alone and your names + next index are
 * reconstructed, no saved map needed. Stops after GAP_LIMIT consecutive empty
 * indices (BIP44-style), or early if every source is offline.
 */
async function discoverWallet(mnemonic: string): Promise<{ names: Record<string, number>; nextIndex: number }> {
  const GAP_LIMIT = 5;
  const MAX_SCAN = 200;
  const names: Record<string, number> = {};
  let nextIndex = 0;
  let gap = 0;
  for (let i = 0; gap < GAP_LIMIT && i < MAX_SCAN; i += 1) {
    const key = deriveOwnerKey(mnemonic, i);
    const { names: owned, reachable } = await ownedNamesFor(key.ownerPubkey);
    if (!reachable) break; // fully offline — stop and treat the rest as unused
    if (owned.length > 0) {
      for (const n of owned) {
        try { names[normalizeName(n)] = i; } catch { /* skip malformed */ }
      }
      nextIndex = i + 1;
      gap = 0;
    } else {
      gap += 1;
    }
  }
  return { names, nextIndex };
}

/** Import a 12-word phrase (gap-scan to rediscover names) or a wallet backup. */
async function onImport(): Promise<void> {
  const raw = (el<HTMLTextAreaElement>("import-input")).value.trim();
  if (!raw) {
    setStatus("error", "Paste your 12-word phrase or a wallet backup file first.");
    return;
  }
  try {
    let imported: ClaimWallet;
    if (raw.startsWith("{")) {
      const parsed = JSON.parse(raw) as Partial<ClaimWallet> & { mnemonic?: unknown; names?: unknown; nextIndex?: unknown };
      const mnemonic = typeof parsed.mnemonic === "string" ? parsed.mnemonic.trim().toLowerCase() : "";
      if (!isValidMnemonic(mnemonic)) throw new Error("wallet backup has no valid 12-word phrase");
      const names: Record<string, number> = {};
      let maxIndex = -1;
      for (const [n, i] of Object.entries((parsed.names as Record<string, unknown>) ?? {})) {
        if (typeof i === "number" && Number.isInteger(i) && i >= 0 && isValidName(n)) {
          names[normalizeName(n)] = i;
          if (i > maxIndex) maxIndex = i;
        }
      }
      const declaredNext = typeof parsed.nextIndex === "number" && Number.isInteger(parsed.nextIndex) ? parsed.nextIndex : 0;
      imported = { mnemonic, names, nextIndex: Math.max(declaredNext, maxIndex + 1) };
    } else {
      const mnemonic = raw.replace(/\s+/g, " ").trim().toLowerCase();
      if (!isValidMnemonic(mnemonic)) throw new Error("that is not a valid 12-word recovery phrase");
      // Gap-scan the chain to rediscover this seed's names + next index, so the
      // 12 words alone are a sufficient backup (no saved map required).
      setStatus("info", "Phrase valid — scanning for names already claimed under it…");
      const discovered = await discoverWallet(mnemonic);
      imported = { mnemonic, names: discovered.names, nextIndex: discovered.nextIndex };
    }
    wallet = imported;
    currentQuote = null;
    currentKey = null;
    currentName = "";
    (el<HTMLDetailsElement>("import-details")).open = false;
    (el<HTMLTextAreaElement>("import-input")).value = "";
    el<HTMLElement>("key-section").hidden = true;
    el<HTMLElement>("result-section").hidden = true;
    el<HTMLElement>("funding-address").textContent = deriveFundingAddress(wallet.mnemonic);
    el<HTMLElement>("balance").textContent = "";
    el<HTMLElement>("wallet-section").hidden = false;
    renderWalletNames();
    const count = Object.keys(wallet.names).length;
    setStatus(
      "ok",
      count > 0
        ? `Wallet imported — ${count} name${count === 1 ? "" : "s"}, next claim uses key #${wallet.nextIndex + 1}. Check a name above to add another.`
        : "Phrase imported as a fresh wallet (starting at key #1). Check a name above to claim under it."
    );
  } catch (error) {
    setStatus("error", esc(error instanceof Error ? error.message : "Could not import that."));
  }
}

async function onClaim(): Promise<void> {
  if (!currentKey || !currentQuote) return;
  (el<HTMLButtonElement>("claim-btn")).disabled = true;
  setStatus("info", `Claiming <strong>${esc(currentName)}</strong>…`);
  try {
    const result = await submitClaim(currentQuote.quoteId, currentName, currentKey.ownerPubkey);
    el<HTMLElement>("result-section").hidden = false;
    if (result.ok) {
      // Consume the index for this name: record name→index and advance nextIndex so
      // the next claim gets a distinct key. Then reset the in-progress claim so the
      // next name must be re-checked (and re-derived at the new nextIndex).
      if (wallet !== null) {
        wallet.names[currentName] = currentIndex;
        wallet.nextIndex = Math.max(wallet.nextIndex, currentIndex + 1);
        renderWalletNames();
      }
      el<HTMLElement>("result").innerHTML =
        `<strong>${esc(currentName)} is yours.</strong> Anchored in <code>${esc(result.anchorTxid ?? "")}</code>. ` +
        `A public notice window runs until block ${result.noticeWindowCloseHeight}; if no one contests it with a bond, it finalizes. ` +
        `Inclusion proof verified locally: ${result.proofVerified ? "yes" : "no"}.`;
      setStatus("ok", "Claimed and added to your wallet. Check another name above to claim it under the same phrase — or download your wallet backup to keep the name→key map.");
      currentQuote = null;
      currentKey = null;
      currentName = "";
      el<HTMLElement>("key-section").hidden = true;
      (el<HTMLInputElement>("name")).value = "";
    } else {
      el<HTMLElement>("result").innerHTML =
        `Status: <code>${esc(result.status)}</code>.` +
        (result.problems.length ? `<ul>${result.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : "");
      setStatus("error", "The claim did not complete cleanly — see details below.");
      (el<HTMLButtonElement>("claim-btn")).disabled = false;
    }
  } catch (error) {
    setStatus("error", esc(error instanceof Error ? error.message : "Claim failed."));
    (el<HTMLButtonElement>("claim-btn")).disabled = false;
  }
}

interface AddressStats {
  readonly chain_stats?: { readonly funded_txo_sum?: number; readonly spent_txo_sum?: number };
  readonly mempool_stats?: { readonly funded_txo_sum?: number; readonly spent_txo_sum?: number };
}
async function fetchBalanceSats(addr: string): Promise<number> {
  const stats = await requestJson<AddressStats>(`/api/address/${addr}`);
  const chain = (stats.chain_stats?.funded_txo_sum ?? 0) - (stats.chain_stats?.spent_txo_sum ?? 0);
  const mem = (stats.mempool_stats?.funded_txo_sum ?? 0) - (stats.mempool_stats?.spent_txo_sum ?? 0);
  return chain + mem;
}
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

async function onCheckBalance(): Promise<void> {
  const addr = el<HTMLElement>("funding-address").textContent ?? "";
  if (!addr) return;
  const out = el<HTMLElement>("balance");
  out.textContent = " checking…";
  try {
    out.textContent = ` balance: ₿${(await fetchBalanceSats(addr)).toLocaleString()}`;
  } catch (error) {
    out.textContent = ` couldn't load balance: ${esc(error instanceof Error ? error.message : "error")}`;
  }
}

async function onFaucet(): Promise<void> {
  const addr = el<HTMLElement>("funding-address").textContent ?? "";
  if (!addr) return;
  const out = el<HTMLElement>("balance");
  const btn = el<HTMLButtonElement>("faucet-btn");
  btn.disabled = true;
  try {
    let start = 0;
    try { start = await fetchBalanceSats(addr); } catch { /* treat as 0 */ }
    await requestJson(`/api/faucet`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: addr })
    });
    out.textContent = " requested — mining a block (~60s)…";
    for (let i = 0; i < 9; i += 1) {
      await sleep(15_000);
      let now = start;
      try { now = await fetchBalanceSats(addr); } catch { continue; }
      if (now > start) { out.textContent = ` funded — balance: ₿${now.toLocaleString()}`; return; }
    }
    out.textContent = " still pending — click Check balance in a moment.";
  } catch (error) {
    out.textContent = ` faucet failed: ${esc(error instanceof Error ? error.message : "error")}`;
  } finally {
    btn.disabled = false;
  }
}

function init(): void {
  el<HTMLFormElement>("claim-form").addEventListener("submit", (e) => { void onCheck(e); });
  el<HTMLButtonElement>("download-key").addEventListener("click", downloadKey);
  el<HTMLInputElement>("backup-confirm").addEventListener("change", updateClaimEnabled);
  el<HTMLButtonElement>("claim-btn").addEventListener("click", () => { void onClaim(); });
  el<HTMLButtonElement>("import-btn").addEventListener("click", () => { void onImport(); });
  el<HTMLButtonElement>("download-wallet").addEventListener("click", downloadWallet);
  el<HTMLButtonElement>("check-balance").addEventListener("click", () => { void onCheckBalance(); });
  el<HTMLButtonElement>("faucet-btn").addEventListener("click", () => { void onFaucet(); });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
