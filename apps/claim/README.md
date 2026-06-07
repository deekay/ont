# @ont/claim — bare-claim site

The low-friction "claim a name with any Lightning wallet" front door, split out of
`@ont/web` so it runs on **its own origin** (e.g. `claim.opennametags.org`). Keeping the
key-handling page on a separate origin from the marketing/docs site means general web
content shares no origin with the code that generates an owner key.

## What it does
1. You type a name; the browser **generates the owner key locally** (`@noble`, never sent to us).
2. It fetches a publisher **quote** and verifies the quote commits `H(name)` + your key.
3. You save your key (download / confirm), then **claim** — submit, and the returned
   **inclusion proof is verified locally** against its anchored root before the claim is shown as real.

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
