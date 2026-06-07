// The single bare-claim page. Minimal, self-contained HTML + CSS so the whole
// site is small enough to read end-to-end. The trust-sensitive logic lives in
// /claim.js (src/client.ts), served as a module script.

const STYLES = `
:root { color-scheme: light dark; --fg: #111; --muted: #666; --bg: #fff; --card: #f6f6f7; --accent: #f7931a; --err: #c0392b; --ok: #1e7d34; }
@media (prefers-color-scheme: dark) { :root { --fg: #eee; --muted: #999; --bg: #111; --card: #1c1c1e; } }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: var(--fg); background: var(--bg); }
main { max-width: 620px; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
h1 { font-size: 1.6rem; margin: 0 0 .25rem; }
.lede { color: var(--muted); margin: 0 0 1.75rem; }
form { display: flex; gap: .5rem; }
input[type=text] { flex: 1; padding: .7rem .8rem; font-size: 1.05rem; border: 1px solid var(--muted); border-radius: 8px; background: var(--bg); color: var(--fg); }
button { padding: .7rem 1.1rem; font-size: 1rem; border: 0; border-radius: 8px; background: var(--accent); color: #111; font-weight: 600; cursor: pointer; }
button[disabled] { opacity: .5; cursor: not-allowed; }
button.secondary { background: var(--card); color: var(--fg); border: 1px solid var(--muted); }
.status { margin: 1.25rem 0; padding: .8rem 1rem; border-radius: 8px; background: var(--card); }
.status.error { color: var(--err); } .status.ok { color: var(--ok); }
.status:empty { display: none; }
section { margin-top: 1.5rem; padding: 1rem 1.1rem; background: var(--card); border-radius: 10px; }
section[hidden] { display: none; }
.warn { color: var(--err); font-weight: 600; }
code, .key { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .82rem; word-break: break-all; }
.key { display: block; padding: .5rem .6rem; margin: .35rem 0 .75rem; background: var(--bg); border: 1px solid var(--muted); border-radius: 6px; }
label.check { display: flex; gap: .5rem; align-items: flex-start; margin: .75rem 0; }
footer { margin-top: 3rem; color: var(--muted); font-size: .85rem; }
.muted { color: var(--muted); font-size: .85rem; margin-top: 1rem; }
a { color: var(--accent); }
`;

export function renderClaimPage(networkLabel: string, clientBundlePath: string): string {
  const net = networkLabel ? `<span class="lede"> · ${escapeHtml(networkLabel)}</span>` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Claim a name — Open Name Tags</title>
<style>${STYLES}</style>
</head>
<body>
<main>
  <h1>Claim a name${net}</h1>
  <p class="lede">A short, human-readable name like <code>alice</code>, settled on Bitcoin, that only your key controls. Pick one, save your key, claim it.</p>

  <form id="claim-form" autocomplete="off">
    <input id="name" type="text" inputmode="latin" placeholder="yourname" aria-label="name" maxlength="32" />
    <button type="submit">Check</button>
  </form>

  <div id="status" class="status"></div>

  <section id="key-section" hidden>
    <p class="warn">Save your 12-word recovery phrase. It alone controls the name forever — no one can recover it for you.</p>
    <div>your 12-word recovery phrase — the only thing to save<span id="mnemonic" class="key"></span></div>
    <button id="download-key" class="secondary" type="button">Download backup</button>
    <label class="check"><input id="backup-confirm" type="checkbox" /> I have saved my recovery phrase somewhere safe.</label>
    <button id="claim-btn" type="button" disabled>Claim it</button>
    <p class="muted">Public owner ID (derived from your phrase, safe to share — no need to save it): <span id="owner-pubkey" class="key"></span></p>
  </section>

  <section id="result-section" hidden>
    <div id="result"></div>
  </section>

  <section id="wallet-section" hidden>
    <h3 style="margin:.2rem 0 .35rem">Your wallet</h3>
    <p class="muted" style="margin-top:0">Derived from the same phrase. You only need to fund this to bid in an auction or contest a name — a bare-claim needs no deposit.</p>
    <div>deposit address (signet)<span id="funding-address" class="key"></span></div>
    <button id="check-balance" class="secondary" type="button">Check balance</button>
    <span id="balance" class="muted"></span>
  </section>

  <footer>
    Your key is generated in your browser and never sent to us. This page verifies the publisher's
    inclusion proof locally before showing a claim as real. Auctions and contesting a name need the
    full app. <a href="https://github.com/deekay/ont">How it works</a>.
  </footer>
</main>
<script type="module" src="${escapeHtml(clientBundlePath)}"></script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}
