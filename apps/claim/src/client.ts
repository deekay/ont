// Bare-claim browser client.
//
// The trust-sensitive surface, kept small and auditable: it derives the owner key
// locally from a 12-word phrase (see ./keys.ts), verifies the publisher's inclusion
// proof against its own anchored root, and trusts nothing the publisher returns.
import { sha256 } from "@noble/hashes/sha2.js";
import { deriveFundingAddress, deriveOwnerKey, generateMnemonic12, type OwnerKey } from "./keys.js";

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

async function fetchVerifiedQuote(name: string, ownerPubkey: string): Promise<ClaimQuote> {
  const normalized = normalizeName(name);
  const quote = await requestJson<ClaimQuote>(`/api/claim/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: normalized, ownerPubkey, paymentRail: "lightning" })
  });
  const problems: string[] = [];
  if (!quote.available) problems.push(`publisher reports "${normalized}" unavailable (${quote.reason ?? "no reason"})`);
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

async function claimAvailableName(name: string, ownerPubkey: string): Promise<ClaimResult> {
  const normalized = normalizeName(name);
  const owner = ownerPubkey.toLowerCase();
  const quote = await fetchVerifiedQuote(normalized, owner);
  const receipt = await requestJson<ClaimReceipt>(`/api/claim/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quoteId: quote.quoteId, paymentProof: { rail: "lightning" } })
  });
  return evaluateReceipt(normalized, owner, receipt);
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

let currentMnemonic: string | null = null;
let currentKey: OwnerKey | null = null;
let currentName = "";

function showKeyBackup(name: string, mnemonic: string, key: OwnerKey): void {
  currentMnemonic = mnemonic;
  currentKey = key;
  currentName = name;
  el<HTMLElement>("key-section").hidden = false;
  el<HTMLElement>("mnemonic").textContent = mnemonic;
  el<HTMLElement>("owner-pubkey").textContent = key.ownerPubkey;
  (el<HTMLInputElement>("backup-confirm")).checked = false;
  (el<HTMLButtonElement>("claim-btn")).disabled = true;
  // Wallet: the deposit address from the same phrase (for auctions / direct-L1).
  el<HTMLElement>("funding-address").textContent = deriveFundingAddress(mnemonic);
  el<HTMLElement>("balance").textContent = "";
  el<HTMLElement>("wallet-section").hidden = false;
}

function downloadKey(): void {
  if (!currentMnemonic || !currentKey) return;
  const blob = new Blob(
    [`ONT recovery phrase for "${currentName}"\n\n12-word recovery phrase (keep secret — it controls the name forever):\n${currentMnemonic}\n\npublic owner ID (safe to share): ${currentKey.ownerPubkey}\n`],
    { type: "text/plain" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ont-recovery-${currentName}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

async function onCheck(event: Event): Promise<void> {
  event.preventDefault();
  el<HTMLElement>("key-section").hidden = true;
  el<HTMLElement>("result-section").hidden = true;
  el<HTMLElement>("wallet-section").hidden = true;
  const raw = (el<HTMLInputElement>("name")).value;
  if (!isValidName(raw)) {
    setStatus("error", "Enter a valid name — lowercase a–z and 0–9, 1–32 characters.");
    return;
  }
  const name = normalizeName(raw);
  setStatus("info", `Generating your recovery phrase and checking <strong>${esc(name)}</strong>…`);
  const mnemonic = generateMnemonic12();
  const key = deriveOwnerKey(mnemonic, 0);
  try {
    const quote = await fetchVerifiedQuote(name, key.ownerPubkey);
    showKeyBackup(name, mnemonic, key);
    const cost = quote.totalBaseSats ? `₿${quote.totalBaseSats}` : "the ₿1,000 gate + a small publisher fee";
    setStatus("ok", `<strong>${esc(name)}</strong> is available — about ${esc(cost)}. Save your phrase below, then claim it.`);
  } catch (error) {
    setStatus("error", esc(error instanceof Error ? error.message : "Could not check that name."));
  }
}

async function onClaim(): Promise<void> {
  if (!currentKey) return;
  (el<HTMLButtonElement>("claim-btn")).disabled = true;
  setStatus("info", `Claiming <strong>${esc(currentName)}</strong>…`);
  try {
    const result = await claimAvailableName(currentName, currentKey.ownerPubkey);
    el<HTMLElement>("result-section").hidden = false;
    if (result.ok) {
      el<HTMLElement>("result").innerHTML =
        `<strong>${esc(currentName)} is yours.</strong> Anchored in <code>${esc(result.anchorTxid ?? "")}</code>. ` +
        `A public notice window runs until block ${result.noticeWindowCloseHeight}; if no one contests it with a bond, it finalizes. ` +
        `Inclusion proof verified locally: ${result.proofVerified ? "yes" : "no"}.`;
      setStatus("ok", "Claimed. Keep your recovery phrase safe — it is the only thing that controls this name.");
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
async function onCheckBalance(): Promise<void> {
  const addr = el<HTMLElement>("funding-address").textContent ?? "";
  if (!addr) return;
  const out = el<HTMLElement>("balance");
  out.textContent = " checking…";
  try {
    const stats = await requestJson<AddressStats>(`/api/address/${addr}`);
    const chain = (stats.chain_stats?.funded_txo_sum ?? 0) - (stats.chain_stats?.spent_txo_sum ?? 0);
    const mem = (stats.mempool_stats?.funded_txo_sum ?? 0) - (stats.mempool_stats?.spent_txo_sum ?? 0);
    out.textContent = ` balance: ₿${(chain + mem).toLocaleString()}${mem ? " (incl. unconfirmed)" : ""}`;
  } catch (error) {
    out.textContent = ` couldn't load balance: ${esc(error instanceof Error ? error.message : "error")}`;
  }
}

function init(): void {
  el<HTMLFormElement>("claim-form").addEventListener("submit", (e) => { void onCheck(e); });
  el<HTMLButtonElement>("download-key").addEventListener("click", downloadKey);
  el<HTMLInputElement>("backup-confirm").addEventListener("change", (e) => {
    (el<HTMLButtonElement>("claim-btn")).disabled = !(e.target as HTMLInputElement).checked;
  });
  el<HTMLButtonElement>("claim-btn").addEventListener("click", () => { void onClaim(); });
  el<HTMLButtonElement>("check-balance").addEventListener("click", () => { void onCheckBalance(); });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
