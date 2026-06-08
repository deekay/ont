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
- **Import** an existing phrase or a **wallet backup** (`Already have names?`): a bare 12-word phrase
  starts a fresh wallet at key #1; a wallet backup (`{ mnemonic, names, nextIndex }`) restores the
  name→key map so new claims resume at the right index (and names don't collide). Because sequential
  indices need that map, **download the wallet backup** to continue on another device / in the app.
  (Auto-discovering the next index from a bare phrase needs an indexer reverse-lookup — future; the
  wallet backup is the robust path until then.)
- **To unify names already under two different phrases:** there's no merge primitive — you **transfer**
  each name from the old phrase's key to the next index under your main phrase (owner-key → owner-key,
  signed by the old key). That's a full-app action (PSBTs), not a bare-claim, and the transfer is
  public, so it links those two keys.

Auctions and contesting a name need the full app (on-chain PSBTs); this site is bare-claims only.

The entire trust-sensitive surface is one small, auditable file: [`src/client.ts`](src/client.ts).

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
