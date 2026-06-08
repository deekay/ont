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

export function renderClaimPage(networkLabel: string, clientBundleSource: string, auditBundlePath: string): string {
  const net = networkLabel ? `<span class="lede"> · ${escapeHtml(networkLabel)}</span>` : "";
  // Inline the bundle so the page is self-contained / offline-saveable. Only `</script`
  // needs neutralizing; everything else is valid inside a module script verbatim.
  const inlineScript = clientBundleSource.replace(/<\/script/gi, "<\\/script");
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

  <details id="import-details">
    <summary class="muted" style="cursor:pointer;margin-top:.6rem">Already have names? Use your existing recovery phrase or wallet backup</summary>
    <div style="margin-top:.6rem">
      <textarea id="import-input" rows="3" placeholder="paste your 12-word phrase, or a wallet backup file" aria-label="import phrase or wallet backup" style="width:100%;padding:.6rem .7rem;font-size:.95rem;border:1px solid var(--muted);border-radius:8px;background:var(--bg);color:var(--fg);font-family:ui-monospace,Menlo,monospace"></textarea>
      <button id="import-btn" class="secondary" type="button" style="margin-top:.5rem">Import wallet</button>
      <p class="muted" style="margin-top:.5rem">A <strong>12-word phrase alone</strong> is treated as a fresh wallet starting at name #1 — only use it for a phrase you haven't claimed names with elsewhere. To <em>continue</em> a wallet you already use (here or in the app), import its <strong>wallet backup</strong> so we resume at the right key and your names don't collide.</p>
    </div>
  </details>

  <div id="status" class="status"></div>

  <section id="key-section" hidden>
    <p class="warn">Save your 12-word recovery phrase. It alone controls <strong>every name in this wallet</strong> forever — no one can recover it for you.</p>
    <div>your 12-word recovery phrase — the only secret to save<span id="mnemonic" class="key"></span></div>
    <button id="download-key" class="secondary" type="button">Download recovery phrase</button>
    <label class="check"><input id="backup-confirm" type="checkbox" /> I have saved my recovery phrase somewhere safe.</label>
    <button id="claim-btn" type="button" disabled>Claim it</button>
    <p class="muted">This name uses owner key <span id="owner-index" class="key" style="display:inline;padding:.1rem .3rem">#1</span> under your phrase. Public owner ID (safe to share): <span id="owner-pubkey" class="key"></span></p>
  </section>

  <section id="result-section" hidden>
    <div id="result"></div>
  </section>

  <section id="wallet-section" hidden>
    <h3 style="margin:.2rem 0 .35rem">Your wallet</h3>
    <p class="muted" style="margin-top:0">One recovery phrase holds all your names, each under its own key (so they aren't publicly linkable). Claim another name above and it's added here automatically.</p>
    <div id="wallet-names-wrap" hidden>
      <div class="muted" style="margin:.2rem 0">names in this wallet</div>
      <ul id="wallet-names" style="margin:.2rem 0 .6rem;padding-left:1.1rem"></ul>
      <button id="download-wallet" class="secondary" type="button">Download wallet backup</button>
      <p class="muted" style="margin-top:.4rem">The wallet backup holds your phrase <em>and</em> the name→key map — import it to continue this wallet on another device or in the app, so new claims resume at the right key.</p>
    </div>
    <div style="margin-top:1rem">deposit address (signet)<span id="funding-address" class="key"></span></div>
    <p class="muted" style="margin-top:0">Fund this only to bid in an auction or contest a name — a bare-claim needs no deposit.</p>
    <button id="check-balance" class="secondary" type="button">Check balance</button>
    <button id="faucet-btn" class="secondary" type="button">Get test ₿</button>
    <span id="balance" class="muted"></span>
  </section>

  <footer>
    <p><strong>Runs entirely in your browser.</strong> Your recovery phrase and keys are generated and
    derived locally and <strong>never sent</strong> — the only things that leave this page are your
    <em>public</em> owner ID, the name, and your deposit address. This page verifies the publisher's
    inclusion proof locally before showing a claim as real.</p>
    <p>It's a <strong>single self-contained file</strong>, like a BIP39 calculator: save it (⌘/Ctrl-S)
    and open it <strong>offline</strong> — generating your phrase and keys works with no network
    (you only need to be online to submit the claim itself). Audit the exact code inline here or at
    <a href="${escapeHtml(auditBundlePath)}"><code>${escapeHtml(auditBundlePath)}</code></a>.</p>
    <p>Auctions and contesting a name need the full app. <a href="https://github.com/deekay/ont">How it works</a>.</p>
  </footer>
</main>
<script type="module">${inlineScript}</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}
