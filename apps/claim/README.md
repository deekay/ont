# @ont/claim — bare-claim site

The low-friction "claim a name with any Lightning wallet" front door, split out of
`@ont/web` so it runs on **its own origin** (e.g. `claim.opennametags.org`). Keeping the
key-handling page on a separate origin from the marketing/docs site means general web
content shares no origin with the code that generates an owner key.

## What it does
1. You type a name; the browser **derives the owner key locally** (`@noble`, never sent to us) from
   **one recovery phrase**, at the name's HD index (`m/696969'/0'/i'`, matching the app).
2. It fetches a publisher **quote** and verifies the quote commits `H(name)` + your key.
3. You save your phrase (download / confirm), then **claim** — submit, and the returned
   **inclusion proof is verified locally** against its anchored root before the claim is shown as real.

### One phrase, many names (HD)
- Claiming a **second** name reuses your phrase at the **next key index** — one backup for all your
  names, and each name gets a distinct key so they aren't publicly linkable. The deposit address is one
  fixed path per phrase (fund once).
- **Import** just your **12 words** and the site **gap-scans** to rediscover your wallet: it derives
  owner keys 0, 1, 2… and asks which names each owns, stopping after a run of empty indices
  (BIP44-style). So the **seed alone is a sufficient backup** — claim a name today, come back next month
  with only your phrase, and add a second name under the same wallet at the right key. The scan
  **unions two sources**: the **publisher** (`/api/owner/{pubkey}` → its anchored claims, local + fast)
  and, when `CLAIM_RESOLVER_URL` is set, the **resolver** (`/api/resolver/owner/{pubkey}` → chain-derived,
  authoritative, cross-publisher — also picks up names you claimed in the app under the same seed). With
  no resolver configured it degrades to publisher-only. A **wallet backup** (`{ mnemonic, names,
  nextIndex }`) still imports instantly without a scan and is handy for moving to the app.
- **To unify names already under two different phrases:** there's no merge primitive — you **transfer**
  each name from the old phrase's key to the next index under your main phrase (owner-key → owner-key,
  signed by the old key). That's a full-app action (PSBTs), not a bare-claim, and the transfer is
  public, so it links those two keys.

Auctions and contesting a name need the full app (on-chain PSBTs); this site is bare-claims only.

The entire trust-sensitive surface is one small, auditable file: [`src/client.ts`](src/client.ts).

### Client-side & offline (BIP39-calculator style)
All seed/key work is **in the browser** — generate the phrase, derive owner keys (`m/696969'/0'/i'`)
and the funding address — and the **secret never leaves the page**. The only things sent to the server
are *public*: the name, your owner pubkey, and your deposit address (see every `fetch` in `client.ts`).
The page **inlines** its JS into a single self-contained file (also served at `/claim.js` for
auditing/diffing), so you can **save it and run it offline**: key generation works with no network, and
you only need to be online to submit the claim itself.

## Run (local / signet)
```
npm install            # from repo root (workspaces)
npm run dev -w @ont/claim
```
Environment:
- `CLAIM_WEB_PORT` / `PORT` — listen port (default `3001`).
- `CLAIM_PUBLISHER_URL` — the batching publisher base URL (falls back to `ONT_WEB_PUBLISHER_URL`, then `http://127.0.0.1:8788`).
- `CLAIM_NETWORK_LABEL` — shown in the header (default `signet`).
- `CLAIM_RATE_LIMIT_PER_MINUTE` — per-IP claim quote/submit limit (default `10`).

On signet the Lightning payment is stubbed by the publisher, so claim is one-shot. On mainnet
the publisher returns a real BOLT11 to pay before submit (invoice/QR display is the next step).

## Deploy — LIVE at https://claim.opennametags.org (signet)

Deployed **isolated** (own dir `/opt/ont-claim` + its own node_modules, outside the shared
workspace) so it can't disturb the live web/resolver/publisher. Runs as user `ont` via `tsx`
on `:3003`, behind a Caddy vhost (auto-TLS), proxying to the droplet publisher on `:7878`.
Artifacts in [`deploy/`](deploy/): `ont-claim.service`, `ont-claim.env.example`, `Caddyfile.snippet`.

Reproduce/update: `rsync src package.json` → `/opt/ont-claim`, `npm install` (+ `tsx`),
`systemctl restart ont-claim`. Needs a DNS A record `claim.opennametags.org → <droplet IP>` (done).
