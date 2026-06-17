export const STYLESHEET = `
:root {
  --bg: #eef2ed;
  --bg-strong: #dfe8e2;
  --panel: rgba(251, 252, 248, 0.88);
  --panel-solid: #fbfcf8;
  --ink: #171d1a;
  --muted: #59645f;
  --accent: #1f7a65;
  --accent-strong: #124d42;
  --line: rgba(20, 45, 38, 0.12);
  --line-strong: rgba(20, 45, 38, 0.2);
  --shadow: 0 26px 72px rgba(23, 50, 44, 0.14);
  --shadow-soft: 0 16px 42px rgba(23, 50, 44, 0.1);
  --shadow-card: 0 12px 28px rgba(23, 50, 44, 0.08);
  --shadow-lift: 0 18px 40px rgba(23, 50, 44, 0.12);
  --radius-lg: 30px;
  --radius-md: 22px;
}

* {
  box-sizing: border-box;
}

[hidden] {
  display: none !important;
}

html,
body {
  margin: 0;
  min-height: 100%;
}

body {
  color: var(--ink);
  background:
    linear-gradient(120deg, rgba(31, 122, 101, 0.06) 0 1px, transparent 1px),
    linear-gradient(180deg, #fbfcf8 0%, var(--bg) 48%, var(--bg-strong) 100%);
  background-size: 46px 46px, auto;
  font-family: "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
}

.page-shell {
  width: min(1240px, calc(100vw - 40px));
  margin: 0 auto;
  padding: 34px 0 60px;
}

.site-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 22px;
  padding: 13px 16px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(255, 250, 243, 0.72)),
    rgba(255, 252, 246, 0.72);
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(18px);
}

.site-nav-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--ink);
  text-decoration: none;
  font-weight: 700;
  letter-spacing: 0.015em;
}

.site-nav-brand-mark {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: block;
  flex: 0 0 auto;
}

.site-nav-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  align-items: center;
}

.site-nav-link {
  color: var(--muted);
  text-decoration: none;
  font-size: 0.92rem;
  font-weight: 600;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid transparent;
}

.site-nav-link:hover,
.site-nav-brand:hover {
  color: var(--ink);
}

.site-nav-link:hover {
  background: rgba(31, 29, 26, 0.04);
}

.site-nav-link.is-active {
  color: var(--ink);
  border-color: rgba(31, 29, 26, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(244, 239, 232, 0.76));
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(280px, 0.75fr);
  gap: 20px;
  align-items: stretch;
  margin-bottom: 28px;
}

.hero-single {
  grid-template-columns: minmax(0, 1fr);
}

.hero-single .hero-copy {
  width: 100%;
  max-width: 880px;
}

.hero-page {
  max-width: 920px;
  margin-left: auto;
  margin-right: auto;
}

.hero-page .hero-copy {
  max-width: 880px;
  margin: 0 auto;
  min-height: 0;
  padding: 30px 36px 28px;
  text-align: center;
  background:
    radial-gradient(circle at top center, rgba(31, 29, 26, 0.04), transparent 32%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(248, 244, 237, 0.9)),
    var(--panel);
}

.hero-page .eyebrow {
  margin-bottom: 10px;
}

.hero-page h1 {
  max-width: 12ch;
  margin: 0 auto;
  font-size: clamp(2.2rem, 5.2vw, 3.85rem);
  line-height: 0.93;
  letter-spacing: -0.048em;
  text-wrap: balance;
}

.hero-page .lede {
  margin: 14px auto 0;
  max-width: 32ch;
  font-size: clamp(1.02rem, 1.4vw, 1.16rem);
  line-height: 1.58;
  text-wrap: balance;
}

.hero-page .hero-status {
  margin-top: 18px;
  margin-left: auto;
  margin-right: auto;
}

.hero-page-explore h1 {
  max-width: 11ch;
}

.hero-page-explore .lede {
  max-width: 29ch;
}

.hero-page-values .hero-copy,
.hero-page-transfer .hero-copy,
.hero-page-setup .hero-copy {
  max-width: 900px;
}

.hero-page-values .lede {
  max-width: 42ch;
}

.hero-page-transfer .lede,
.hero-page-setup .lede {
  max-width: 34ch;
}

.hero-home {
  max-width: 1160px;
  margin-left: auto;
  margin-right: auto;
  grid-template-columns: minmax(0, 1.08fr) minmax(340px, 0.72fr);
  gap: 18px;
  align-items: start;
}

.hero-home-product {
  margin-bottom: 22px;
}

.hero-home-copy,
.hero-home-lookup,
.hero-home-launch-strip {
  border: 1px solid var(--line);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(247, 250, 245, 0.84)),
    var(--panel);
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(14px);
}

.hero-home-copy {
  padding: 32px 36px;
  border-radius: 18px;
  display: grid;
  gap: 16px;
  align-content: start;
  background:
    linear-gradient(135deg, rgba(31, 122, 101, 0.13), transparent 42%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(247, 250, 245, 0.88)),
    var(--panel);
}

.hero-home-kicker {
  margin: 0;
  color: var(--accent-strong);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.72rem;
  font-weight: 800;
}

.hero-home-copy h1 {
  margin: 0;
  max-width: 15ch;
  font-size: clamp(2.25rem, 4.1vw, 3.45rem);
  line-height: 1.02;
  letter-spacing: 0;
  color: var(--ink);
  text-wrap: balance;
}

.hero-home-lede {
  margin: 0;
  max-width: 56ch;
  color: var(--muted);
  font-size: clamp(1rem, 1.2vw, 1.12rem);
  line-height: 1.56;
  text-wrap: pretty;
}

.hero-home-proof-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.hero-home-proof-row span {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 8px 12px;
  border: 1px solid rgba(18, 77, 66, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--ink);
  font-size: 0.9rem;
  font-weight: 700;
}

.hero-home-lookup {
  padding: 26px;
  border-radius: 18px;
  display: grid;
  gap: 18px;
  align-content: start;
}

.hero-home-lookup.has-search-result .hero-lookup-status-grid,
.hero-home-lookup.has-search-result .hero-lookup-actions {
  display: none;
}

.hero-home-lookup-head {
  display: grid;
  gap: 8px;
}

.hero-home-lookup h2 {
  margin: 0;
  font-size: clamp(1.45rem, 2.2vw, 2rem);
  letter-spacing: 0;
}

.hero-home-lookup-head p:last-child {
  margin: 0;
  color: var(--muted);
  line-height: 1.5;
}

.hero-search-form {
  gap: 10px;
}

.hero-lookup-status-grid {
  display: grid;
  gap: 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.hero-lookup-status-grid article {
  display: grid;
  gap: 4px;
  padding: 13px 0;
}

.hero-lookup-status-grid article + article {
  border-top: 1px solid var(--line);
}

.hero-lookup-status-grid span,
.hero-home-launch-strip span {
  color: var(--muted);
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hero-lookup-status-grid strong,
.hero-home-launch-strip strong {
  color: var(--ink);
  font-size: 0.96rem;
  line-height: 1.4;
}

.hero-lookup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.hero-search-result {
  margin-top: 0;
}

.hero-search-result.empty {
  padding: 14px 0 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: var(--muted);
}

.lookup-availability-result {
  display: grid;
  gap: 8px;
}

.lookup-result-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.lookup-result-title-row .search-state-label {
  flex: 1 1 auto;
}

.lookup-result-name {
  margin: 0;
  font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
  font-size: clamp(1.8rem, 3vw, 2.45rem);
  line-height: 1.05;
  color: var(--ink);
  overflow-wrap: anywhere;
}

.lookup-result-summary {
  margin: 0;
  color: var(--muted);
  line-height: 1.45;
}

.lookup-next-step {
  display: grid;
  gap: 6px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}

.lookup-next-step p:last-child {
  margin: 0;
  color: var(--muted);
  line-height: 1.52;
}

.hero-home-launch-strip {
  grid-column: 1 / -1;
  border-radius: 14px;
  padding: 16px 18px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.hero-home-launch-strip article {
  display: grid;
  gap: 6px;
}

.hero-copy,
.hero-card,
.panel {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 250, 243, 0.82)),
    var(--panel);
  backdrop-filter: blur(16px);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-soft);
}

.hero-copy {
  border-radius: var(--radius-lg);
  padding: 34px;
}

.hero-card {
  border-radius: var(--radius-lg);
  padding: 28px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  background:
    linear-gradient(145deg, rgba(176, 90, 43, 0.1), rgba(255, 252, 246, 0.92)),
    var(--panel);
}

.hero-actions {
  align-items: stretch;
}

.eyebrow {
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.74rem;
  color: var(--accent-strong);
}

.eyebrow-link {
  color: inherit;
  text-decoration: none;
}

.eyebrow-link:hover {
  text-decoration: underline;
}

h1,
h2 {
  font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
  line-height: 1.04;
  margin: 0;
  text-wrap: balance;
}

h1 {
  font-size: clamp(2.5rem, 6vw, 4.3rem);
  max-width: 12ch;
}

h2 {
  font-size: clamp(1.58rem, 2.1vw, 1.96rem);
  letter-spacing: -0.022em;
}

.lede,
.panel-head p,
.hero-card-meta,
.stat-label,
.field-label,
.list-status,
.result-meta,
.name-meta {
  color: var(--muted);
}

.lede {
  margin: 18px 0 0;
  max-width: 56ch;
  font-size: 1.02rem;
  line-height: 1.65;
  text-wrap: pretty;
}

.hero-status {
  margin: 18px 0 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 11px 16px;
  border-radius: 999px;
  border: 1px solid rgba(31, 29, 26, 0.1);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(244, 239, 232, 0.82));
  color: var(--ink);
  font-size: 0.94rem;
  font-weight: 600;
  line-height: 1.3;
  box-shadow: 0 10px 24px rgba(77, 53, 23, 0.06);
}

.hero-card-label {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
}

.hero-card-value {
  margin: 8px 0;
  font-size: 1.9rem;
  font-weight: 700;
}

.hero-card-meta {
  margin: 0;
  line-height: 1.5;
}

.hero-action-list {
  display: grid;
  gap: 12px;
  margin-top: 10px;
}

.hero-home-card .hero-action-list {
  margin-top: 0;
  gap: 10px;
}

.hero-action-item {
  border: 1px solid var(--line);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.64);
  padding: 14px;
  display: grid;
  gap: 6px;
}

.hero-action-item strong {
  font-size: 0.98rem;
}

.hero-action-item p {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
  max-width: 34ch;
}

.hero-home-card .hero-action-item {
  padding: 13px 14px;
  gap: 6px;
}

.hero-home-card .hero-card-meta {
  margin-top: 0;
  padding-top: 4px;
}

.hero-cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.section-cta-row {
  margin-top: 18px;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 26px;
}

.jump-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
  margin: 0 0 24px;
}

.jump-bar a {
  display: inline-flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.78);
  color: var(--ink);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 700;
  box-shadow: var(--shadow-soft);
}

.jump-bar a:hover {
  background: rgba(255, 255, 255, 0.92);
  border-color: rgba(31, 29, 26, 0.14);
}

.jump-bar-overview {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  max-width: min(100%, 1080px);
  overflow: visible;
  padding: 12px;
  margin-left: auto;
  margin-right: auto;
  margin-bottom: 8px;
  border: 1px solid rgba(31, 29, 26, 0.08);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.66);
  box-shadow: var(--shadow-soft);
}

.jump-bar-overview::-webkit-scrollbar {
  display: none;
}

.jump-bar-overview a {
  flex: 0 1 auto;
  max-width: 100%;
  white-space: nowrap;
  padding: 8px 12px;
  text-align: center;
  box-shadow: none;
  background: rgba(255, 255, 255, 0.72);
}

.jump-bar-label {
  flex: 1 0 100%;
  padding: 0 4px 2px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.72rem;
  font-weight: 800;
}

.link-strip {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 16px 18px;
}

.link-strip-label {
  margin: 0;
  color: var(--muted);
  font-size: 0.84rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.support-strip-label {
  margin: 0;
  color: var(--muted);
  font-size: 0.84rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.link-strip-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.link-chip {
  display: inline-flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.78);
  color: var(--ink);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 700;
  box-shadow: var(--shadow-soft);
  white-space: nowrap;
}

.link-chip:hover {
  background: rgba(255, 255, 255, 0.92);
  border-color: rgba(31, 29, 26, 0.14);
}

.site-footer {
  margin-top: 32px;
  padding: 26px 30px 30px;
  border-radius: var(--radius-md);
  border: 1px solid var(--line);
  background:
    radial-gradient(circle at top right, rgba(31, 29, 26, 0.04), transparent 28%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(247, 243, 236, 0.84)),
    var(--panel);
  box-shadow: var(--shadow-soft);
  display: grid;
  gap: 22px;
}

.site-footer-brand {
  display: grid;
  gap: 8px;
  max-width: 52ch;
}

.site-footer-kicker {
  margin: 0;
  color: var(--accent-strong);
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.site-footer-copy {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
  text-wrap: pretty;
}

.site-footer-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px 28px;
}

.site-footer-group {
  display: grid;
  gap: 12px;
}

.site-footer-group h2 {
  font-size: 1.02rem;
  letter-spacing: -0.01em;
}

.site-footer-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
}

.site-footer-links a {
  color: var(--accent-strong);
  text-decoration: none;
  font-weight: 600;
}

.site-footer-links a:hover {
  text-decoration: underline;
}

.hero-cta-row .action-link,
.detail-actions-row .action-link {
  flex: 0 0 auto;
}

.panel {
  border-radius: var(--radius-md);
  padding: 28px 30px;
  display: grid;
  gap: 22px;
  align-content: start;
}

.panel-compose-minimal {
  gap: 0;
}

.panel-support-strip {
  padding-top: 18px;
  padding-bottom: 18px;
}

.tool-handoff-note {
  margin: 0;
  color: var(--muted);
  font-size: 0.95rem;
  line-height: 1.5;
  max-width: 78ch;
  text-wrap: pretty;
}

.tool-handoff-note a {
  color: var(--accent-strong);
}

.tool-handoff-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.62);
}

.tool-handoff-card h3 {
  margin: 0 0 6px;
}

.tool-handoff-card p {
  margin: 0;
  color: var(--muted);
  line-height: 1.5;
  text-wrap: pretty;
}

.tool-callout-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  margin-bottom: 18px;
}

.command-block {
  margin: 0;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: rgba(26, 17, 8, 0.92);
  color: #f5f0eb;
  font-size: 0.95rem;
  line-height: 1.45;
  overflow-x: auto;
}

.command-block code {
  font-family: "SFMono-Regular", SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
}

.panel-home {
  max-width: 1080px;
  width: 100%;
  margin-left: auto;
  margin-right: auto;
}

.panel-home + .panel-home {
  margin-top: 8px;
}

.panel-search,
.panel-overview,
.panel-activity,
.panel-compose,
.panel-live-smoke,
.panel-pending,
.panel-guide,
.panel-network,
.panel-list,
.panel-support-strip {
  grid-column: 1 / -1;
}

.panel-search {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.94), rgba(255, 252, 246, 0.78)),
    radial-gradient(circle at top right, rgba(176, 90, 43, 0.14), transparent 34%),
    var(--panel-solid);
  border-color: rgba(127, 53, 20, 0.14);
}

.panel-collapsible {
  overflow: hidden;
}

.panel-summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0;
}

.panel-summary::-webkit-details-marker {
  display: none;
}

.panel-summary-copy {
  display: grid;
  gap: 8px;
}

.panel-summary-copy p {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}

.summary-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.78);
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 700;
  white-space: nowrap;
}

.summary-chip.is-waiting {
  background: rgba(255, 255, 255, 0.72);
  color: var(--muted);
}

.summary-chip.is-current,
.summary-chip.is-ready {
  background: rgba(255, 255, 255, 0.86);
  color: var(--ink);
}

.summary-chip.is-complete {
  background: rgba(80, 150, 90, 0.14);
  color: #265f2e;
}

.detail-overview-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 18px 0;
}

.detail-summary-card {
  border: 1px solid var(--line);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  padding: 16px;
  display: grid;
  gap: 8px;
}

.detail-summary-card label {
  color: var(--muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.detail-summary-value {
  font-size: 1.05rem;
  font-weight: 700;
}

.detail-summary-copy {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}

.detail-actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 16px 0 20px;
}

.detail-meta-row {
  margin: 8px 0 0;
}

.detail-technical details,
.detail-technical {
  margin-top: 18px;
}

.detail-technical summary {
  cursor: pointer;
  font-weight: 700;
  color: var(--accent-strong);
}

.detail-technical summary::-webkit-details-marker {
  display: none;
}

.detail-technical-body {
  margin-top: 16px;
}

.collapsible-panel-body {
  margin-top: 0;
  display: grid;
  gap: 18px;
}

.panel-head {
  margin-bottom: 0;
}

.panel-head-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.panel-head-copy {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.panel-head-copy p,
.panel-head p {
  margin: 0;
  line-height: 1.6;
  max-width: 58ch;
  text-wrap: pretty;
}

.info-popover {
  position: relative;
  flex: 0 0 auto;
}

.info-popover[open] {
  z-index: 20;
}

.info-popover-toggle {
  list-style: none;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.9);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: var(--muted);
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(77, 53, 23, 0.08);
}

.info-popover-toggle::-webkit-details-marker {
  display: none;
}

.info-popover-card {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: min(300px, calc(100vw - 64px));
  border-radius: 16px;
  padding: 14px;
  background: rgba(255, 252, 246, 0.98);
  border: 1px solid var(--line);
  box-shadow: 0 20px 48px rgba(77, 53, 23, 0.18);
}

.info-popover-card p {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}

.search-form,
.tool-draft-form,
.compose-form,
.transfer-form {
  display: grid;
  gap: 16px;
}

.search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  align-items: stretch;
}

.search-row button {
  min-width: 144px;
}

.inline-input-row button {
  min-width: 136px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.draft-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.draft-field {
  display: grid;
  gap: 10px;
}

.draft-field-full {
  grid-column: 1 / -1;
}

.value-bundle-editor {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.54);
}

.value-bundle-editor-head {
  display: grid;
  gap: 4px;
}

.value-bundle-editor-head h4,
.value-bundle-editor-head p {
  margin: 0;
}

.value-bundle-editor-head h4 {
  font-family: var(--font-display);
  font-size: clamp(1.2rem, 2vw, 1.45rem);
}

.value-bundle-editor-head p {
  color: var(--muted);
  line-height: 1.5;
}

.value-bundle-rows {
  display: grid;
  gap: 18px;
}

.value-bundle-row {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.6fr) auto;
  gap: 14px;
  align-items: end;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(31, 29, 26, 0.08);
  background: rgba(244, 239, 232, 0.56);
}

.value-bundle-row-actions {
  display: flex;
  align-items: end;
}

.value-bundle-remove-button {
  white-space: nowrap;
}

.value-bundle-preview {
  display: grid;
  gap: 12px;
}

.value-bundle-preview-row {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(31, 29, 26, 0.08);
  background: rgba(244, 239, 232, 0.72);
}

.value-bundle-preview-row label {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.value-bundle-preview-row .field-value {
  margin: 0;
  line-height: 1.55;
  word-break: break-word;
}

.value-history-card {
  display: grid;
  gap: 12px;
  margin-top: 18px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid rgba(31, 29, 26, 0.08);
  background: rgba(244, 239, 232, 0.58);
}

.value-history-head {
  display: grid;
  gap: 4px;
}

.value-history-rows {
  display: grid;
  gap: 8px;
}

.resolver-compare-card {
  display: grid;
  gap: 12px;
  margin-top: 18px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid rgba(31, 29, 26, 0.08);
  background: rgba(176, 90, 43, 0.06);
}

.value-technical-details .value-history-card,
.value-technical-details .resolver-compare-card {
  grid-column: 1 / -1;
  margin-top: 0;
}

.resolver-compare-list {
  display: grid;
  gap: 6px;
}

.resolver-compare-list p {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}

.value-history-row {
  display: grid;
  grid-template-columns: 0.6fr 1.4fr 1fr;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.62);
  color: var(--text);
  font-size: 0.9rem;
}

.draft-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-top: 8px;
}

.inline-input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: end;
}

.field-hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.45;
}

.claim-flow {
  display: grid;
  gap: 22px;
  max-width: 1020px;
  margin: 0 auto;
}

.claim-intake-grid {
  display: grid;
  grid-template-columns: minmax(240px, 0.34fr) minmax(0, 1fr);
  gap: 18px 22px;
  align-items: start;
}

.claim-intake-callout {
  display: grid;
  gap: 12px;
  padding: 18px;
  border-radius: 20px;
  border: 1px solid rgba(176, 90, 43, 0.16);
  background:
    radial-gradient(circle at top right, rgba(176, 90, 43, 0.08), transparent 30%),
    linear-gradient(180deg, rgba(255, 249, 243, 0.96), rgba(255, 255, 255, 0.82));
  box-shadow: var(--shadow-card);
}

.claim-intake-callout .action-link {
  justify-self: flex-start;
}

.claim-intake-form {
  display: grid;
  gap: 18px;
}

.claim-intake-essentials {
  display: grid;
  grid-template-columns: minmax(0, 0.88fr) minmax(300px, 1.12fr);
  gap: 18px;
  align-items: start;
}

.claim-intake-primary,
.claim-intake-owner {
  display: grid;
  gap: 16px;
}

.value-intake-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 0.78fr);
  gap: 18px 22px;
  align-items: start;
}

.value-intake-callout {
  min-height: 100%;
}

.transfer-intake-grid,
.transfer-role-workflow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.9fr);
  gap: 18px 22px;
  align-items: start;
}

.transfer-intake-main {
  display: grid;
  gap: 18px;
}

.transfer-role-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.transfer-export-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.transfer-export-card {
  gap: 14px;
}

.transfer-export-card-wide {
  grid-column: 1 / -1;
}

.transfer-export-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.transfer-role-panel,
.transfer-package-review-tool {
  display: grid;
  gap: 16px;
  padding: 20px;
  border-radius: 18px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.58);
}

.transfer-role-panel h3,
.transfer-package-review-tool h3,
.transfer-package-review-tool p {
  margin: 0;
}

.transfer-role-panel-receiver {
  background: rgba(244, 239, 232, 0.5);
}

.transfer-package-review-tool {
  margin-top: 18px;
  background: rgba(244, 239, 232, 0.42);
}

.transfer-package-review-head {
  display: grid;
  gap: 6px;
}

.transfer-role-workflow-simple {
  grid-template-columns: minmax(280px, 0.82fr) minmax(0, 1.18fr);
  margin-top: 22px;
}

.draft-grid-transfer {
  grid-template-columns: minmax(0, 0.72fr) minmax(0, 1.28fr);
}

.transfer-primary-result {
  margin-top: 20px;
}

.transfer-primary-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
}

.transfer-advanced-tools {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}

.transfer-advanced-tools .detail-technical-body {
  display: grid;
  gap: 18px;
}

.claim-flow-step {
  display: grid;
  gap: 0;
  padding: 0;
  border-radius: 22px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.66);
  overflow: hidden;
}

.claim-flow-step-emphasis {
  background:
    linear-gradient(145deg, rgba(176, 90, 43, 0.08), rgba(255, 255, 255, 0.78)),
    rgba(255, 255, 255, 0.72);
}

.wizard-step summary::-webkit-details-marker {
  display: none;
}

.wizard-step-summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  cursor: pointer;
  list-style: none;
  padding: 22px 24px;
}

.wizard-step-body {
  display: grid;
  gap: 18px;
  padding: 0 24px 24px;
}

.wizard-step-heading {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  min-width: 0;
}

.wizard-step-copy {
  display: grid;
  gap: 6px;
}

.wizard-step-copy h3 {
  margin: 0;
  letter-spacing: -0.016em;
}

.wizard-step-copy p {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
  max-width: 72ch;
  text-wrap: pretty;
}

.claim-step-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 78px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(127, 53, 20, 0.14);
  background: rgba(176, 90, 43, 0.08);
  color: var(--accent-strong);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.claim-step-actions {
  padding-top: 2px;
}

.field {
  display: grid;
  gap: 10px;
}

.field-label {
  font-size: 0.9rem;
  font-weight: 700;
}

.field-note {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.45;
}

input,
textarea,
button,
select {
  font: inherit;
}

input,
textarea,
select {
  width: 100%;
  border-radius: 16px;
  border: 1px solid rgba(20, 45, 38, 0.14);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 250, 246, 0.9));
  padding: 13px 15px;
  color: var(--ink);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.82),
    0 6px 18px rgba(23, 50, 44, 0.04);
  min-height: 50px;
}

input[readonly] {
  background: rgba(244, 239, 232, 0.92);
  color: var(--muted);
}

textarea {
  min-height: 112px;
  resize: vertical;
}

input:focus,
textarea:focus,
select:focus {
  outline: 2px solid rgba(31, 122, 101, 0.24);
  outline-offset: 1px;
  border-color: rgba(31, 122, 101, 0.52);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.82),
    0 0 0 4px rgba(31, 122, 101, 0.1);
}

.field-actions,
.transfer-package-actions,
.result-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.field-actions > *,
.transfer-package-actions > *,
.result-actions > *,
.draft-actions > *,
.detail-actions-row > * {
  flex: 0 0 auto;
}

button,
.action-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(18, 77, 66, 0.16);
  background: linear-gradient(135deg, var(--accent), #2e6f9a);
  color: #fff;
  padding: 12px 20px;
  font-weight: 700;
  letter-spacing: 0.01em;
  text-decoration: none;
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease, filter 120ms ease;
  box-shadow: 0 12px 28px rgba(23, 50, 44, 0.18);
  min-height: 48px;
}

button:hover,
.action-link:hover {
  transform: translateY(-1px);
  filter: brightness(1.03);
}

button.secondary,
.secondary-button,
.action-link.secondary {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 250, 246, 0.92));
  color: var(--accent-strong);
  border-color: rgba(18, 77, 66, 0.14);
  box-shadow: 0 12px 26px rgba(23, 50, 44, 0.1);
}

button.ghost,
.action-link.ghost {
  background: rgba(255, 255, 255, 0.74);
  color: var(--ink);
  border-color: rgba(31, 29, 26, 0.1);
  box-shadow: 0 8px 18px rgba(77, 53, 23, 0.08);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
  filter: none;
  transform: none;
  box-shadow: none;
}

.inline-button {
  padding: 8px 12px;
  font-size: 0.88rem;
  box-shadow: none;
}

.status-card,
.summary-card,
.activity-card,
.pending-card,
.name-card,
.recent-name-row,
.value-card,
.transfer-card,
.timeline-card,
.name-activity-card,
.live-smoke-card,
.result-card,
.highlight-card,
.transfer-essentials-card {
  border-radius: 20px;
  border: 1px solid var(--line);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(252, 247, 241, 0.78));
  padding: 22px;
  box-shadow: var(--shadow-card);
}

.value-json-preview {
  margin: 0;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid var(--line);
  background: rgba(26, 17, 8, 0.92);
  color: #f5f0eb;
  font-size: 0.92rem;
  line-height: 1.55;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.stats-grid,
.activity-list,
.pending-list,
.names-list,
.name-groups,
.name-group-list,
.compact-name-list {
  display: grid;
  gap: 16px;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.stats-grid {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.stat-card {
  border-radius: 18px;
  border: 1px solid var(--line);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(252, 247, 240, 0.82));
  padding: 18px;
  display: grid;
  gap: 8px;
  box-shadow: var(--shadow-card);
}

.name-group {
  display: grid;
  gap: 14px;
}

.name-group-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.name-group-copy {
  display: grid;
  gap: 6px;
}

.name-group-copy h3,
.name-group-copy p {
  margin: 0;
}

.name-group-copy p {
  color: var(--muted);
  line-height: 1.55;
  max-width: 62ch;
}

.name-group-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(176, 90, 43, 0.08);
  color: var(--accent-strong);
  font-weight: 700;
}

.transfer-package-summary,
.timeline-entry-grid,
.name-activity-grid,
.live-smoke-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.summary-grid,
.result-grid,
.name-grid,
.value-grid,
.transfer-grid,
.highlights-grid,
.activity-grid,
.name-list-grid,
.guide-grid,
.transfer-mode-grid {
  display: grid;
  gap: 16px;
}

.transfer-mode-secondary {
  margin-top: 16px;
}

.transfer-mode-secondary summary {
  cursor: pointer;
  font-weight: 700;
  color: var(--accent-strong);
}

.transfer-mode-secondary summary::-webkit-details-marker {
  display: none;
}

.summary-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.highlights-grid {
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
}

.transfer-mode-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.guide-grid {
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.result-grid,
.name-grid,
.value-grid,
.transfer-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.result-item-wide {
  grid-column: 1 / -1;
}

.status-card,
.summary-card {
  display: grid;
  gap: 8px;
}

.stat-label {
  font-size: 0.84rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.stat-value {
  font-size: 1.8rem;
  font-weight: 700;
}

.summary-meta {
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.5;
}

.highlight-card {
  display: grid;
  gap: 10px;
}

.guide-card {
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 20px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(250, 246, 240, 0.86));
  display: grid;
  gap: 12px;
  align-content: start;
  box-shadow: 0 10px 24px rgba(77, 53, 23, 0.045);
}

.guide-card h3 {
  margin: 0;
  font-size: 1.04rem;
  line-height: 1.12;
  letter-spacing: -0.012em;
}

.guide-card p,
.guide-card ul,
.guide-card ol {
  margin: 0;
  line-height: 1.55;
}

.guide-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 4px;
}

.guide-grid-steps {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.guide-grid-balanced {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.guide-card-wide {
  grid-column: 1 / -1;
}

.auction-bid-workflow {
  display: grid;
  gap: 16px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
}

.auction-bid-workflow-head {
  margin: 0;
}

.auction-psbt-builder {
  margin-top: 18px;
}

.bid-flow-timeline {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.64);
  overflow-x: auto;
}

.bid-flow-steps {
  --flow-line: rgba(27, 63, 55, 0.2);
  display: grid;
  grid-template-columns: repeat(6, minmax(118px, 1fr));
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 720px;
}

.bid-flow-step {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 9px;
  align-items: start;
  padding-right: 14px;
  color: var(--muted);
}

.bid-flow-step::after {
  content: "";
  position: absolute;
  top: 15px;
  left: 32px;
  right: 6px;
  height: 2px;
  background: var(--flow-line);
}

.bid-flow-step:last-child::after {
  display: none;
}

.bid-flow-marker {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: #fffaf4;
  color: var(--muted);
  font-weight: 900;
  font-size: 0.82rem;
}

.bid-flow-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.bid-flow-copy strong {
  color: inherit;
  font-size: 0.86rem;
  line-height: 1.2;
}

.bid-flow-copy small {
  color: var(--muted);
  font-size: 0.72rem;
  line-height: 1.25;
}

.bid-flow-step.is-complete {
  color: var(--accent-strong);
}

.bid-flow-step.is-complete::after {
  background: rgba(27, 94, 79, 0.5);
}

.bid-flow-step.is-complete .bid-flow-marker {
  border-color: rgba(27, 94, 79, 0.36);
  background: rgba(231, 240, 231, 0.94);
  color: var(--accent-strong);
}

.bid-flow-step.is-current {
  color: var(--ink);
}

.bid-flow-step.is-current .bid-flow-marker {
  border-color: rgba(176, 90, 43, 0.34);
  background: rgba(255, 239, 226, 0.98);
  color: #7f3514;
  box-shadow: 0 0 0 4px rgba(176, 90, 43, 0.08);
}

.bid-flow-step.is-pending {
  color: var(--muted);
}

.auction-psbt-builder textarea,
.auction-psbt-builder input[data-auction-funding-output],
.auction-psbt-builder [data-auction-funding-amount],
.auction-psbt-builder [data-auction-funding-address],
.auction-psbt-builder input[data-auction-funding-inputs] {
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
  font-size: 0.92rem;
}

.auction-psbt-advanced {
  margin-top: 2px;
}

.psbt-handoff-steps {
  display: grid;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
}

.psbt-handoff-steps .guide-list {
  color: var(--ink);
}

.psbt-trust-note {
  padding: 14px 16px;
  border: 1px solid rgba(27, 94, 79, 0.22);
  border-radius: 16px;
  background: rgba(231, 240, 231, 0.58);
}

.auction-owner-key-confirmation-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px 16px;
  align-items: start;
}

.auction-owner-key-confirmation-row .field-actions {
  margin: 0;
}

.auction-owner-key-confirmation-field {
  min-width: 0;
}

.auction-owner-key-confirmation-row .tx-panel-note {
  grid-column: 1 / -1;
}

.guide-step-card {
  gap: 14px;
}

.guide-step-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.guide-step-number {
  margin: 0;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(127, 53, 20, 0.14);
  background: rgba(176, 90, 43, 0.08);
  color: var(--accent-strong);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.guide-step-copy {
  display: grid;
  gap: 6px;
}

.guide-step-summary {
  color: var(--muted);
  font-size: 0.93rem;
  line-height: 1.5;
}

.guide-card-links {
  background:
    radial-gradient(circle at top right, rgba(176, 90, 43, 0.08), transparent 28%),
    linear-gradient(180deg, rgba(255, 249, 243, 0.98), rgba(255, 255, 255, 0.84));
  border-color: rgba(176, 90, 43, 0.16);
}

.protocol-flow {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px minmax(0, 1fr) 34px minmax(0, 1fr);
  gap: 0;
  align-items: stretch;
}

.protocol-flow-card {
  position: relative;
  min-width: 0;
  min-height: 100%;
  padding: 22px;
  border: 1px solid rgba(31, 29, 26, 0.09);
  border-radius: 24px;
  background: rgba(255, 252, 248, 0.96);
  box-shadow: 0 10px 24px rgba(77, 53, 23, 0.04);
  display: grid;
  gap: 14px;
  align-content: start;
}

.protocol-flow-card-chain {
  background:
    linear-gradient(180deg, rgba(255, 250, 245, 0.98), rgba(255, 255, 255, 0.92));
}

.protocol-flow-card-record {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(249, 246, 240, 0.9));
}

.protocol-flow-card-client {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(250, 247, 241, 0.9));
}

.protocol-flow-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.protocol-flow-number {
  margin: 0;
  width: 42px;
  height: 42px;
  border-radius: 16px;
  border: 1px solid rgba(176, 90, 43, 0.18);
  background: rgba(176, 90, 43, 0.08);
  color: var(--accent-strong);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.protocol-flow-place {
  margin: 0;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.76rem;
  font-weight: 800;
}

.protocol-flow-card h3 {
  margin: 0;
  font-size: clamp(1.28rem, 1.9vw, 1.62rem);
  line-height: 1.02;
  letter-spacing: -0.02em;
}

.protocol-flow-card p {
  margin: 0;
  color: var(--muted);
  line-height: 1.5;
  text-wrap: pretty;
}

.protocol-flow-arrow {
  position: relative;
  align-self: center;
  height: 2px;
  background: linear-gradient(90deg, rgba(176, 90, 43, 0.24), rgba(176, 90, 43, 0.62));
}

.protocol-flow-arrow::after {
  content: "";
  position: absolute;
  right: -1px;
  top: 50%;
  width: 10px;
  height: 10px;
  border-top: 2px solid rgba(176, 90, 43, 0.62);
  border-right: 2px solid rgba(176, 90, 43, 0.62);
  transform: translateY(-50%) rotate(45deg);
  border-radius: 1px;
}

.protocol-example {
  margin-top: 4px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(31, 29, 26, 0.08);
  background: rgba(255, 255, 255, 0.88);
  display: grid;
  gap: 8px;
}

.protocol-example p,
.protocol-result p {
  margin: 0;
}

.protocol-example p {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 10px;
  align-items: baseline;
}

.protocol-example span,
.protocol-result span {
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.protocol-example strong {
  min-width: 0;
  color: var(--ink);
  overflow-wrap: anywhere;
}

.protocol-example-destinations p {
  grid-template-columns: 88px minmax(0, 1fr);
}

.protocol-result {
  margin-top: 4px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(176, 90, 43, 0.15);
  background: rgba(255, 251, 246, 0.92);
  display: grid;
  gap: 8px;
}

.choice-compare {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 2px;
}

.choice-compare-compact {
  margin-top: 0;
}

.choice-card {
  min-width: 0;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(31, 29, 26, 0.09);
  background: rgba(255, 255, 255, 0.76);
  display: grid;
  gap: 6px;
}

.choice-card-recommended {
  border-color: rgba(176, 90, 43, 0.2);
  background:
    linear-gradient(180deg, rgba(255, 249, 243, 0.96), rgba(255, 255, 255, 0.84));
}

.choice-card h4 {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.15;
}

.choice-card p {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.45;
}

.panel-empty-state {
  border-color: rgba(176, 90, 43, 0.18);
  background:
    radial-gradient(circle at top right, rgba(176, 90, 43, 0.1), transparent 26%),
    linear-gradient(180deg, rgba(255, 249, 243, 0.96), rgba(255, 255, 255, 0.84));
}

.explore-empty-card {
  border-style: dashed;
  border-color: rgba(176, 90, 43, 0.22);
  background:
    radial-gradient(circle at top right, rgba(176, 90, 43, 0.1), transparent 28%),
    linear-gradient(180deg, rgba(255, 249, 243, 0.96), rgba(255, 255, 255, 0.88));
}

.transfer-recipient-helper-card {
  border-color: rgba(176, 90, 43, 0.16);
}

.transfer-recipient-helper-card {
  background:
    radial-gradient(circle at top right, rgba(176, 90, 43, 0.08), transparent 28%),
    linear-gradient(180deg, rgba(255, 249, 243, 0.96), rgba(255, 255, 255, 0.82));
  gap: 14px;
}

.transfer-recipient-helper-card .field-actions {
  margin-top: 2px;
}

.transfer-export-card .status-pill {
  flex: 0 0 auto;
}

.detail-link-disabled {
  color: var(--muted);
  text-decoration: none;
  pointer-events: none;
  cursor: default;
}

.demo-name-note {
  color: var(--muted);
}

.destination-architecture {
  display: grid;
  gap: 16px;
}

.destination-stage {
  display: grid;
  gap: 12px;
  border: 1px solid rgba(31, 29, 26, 0.08);
  border-radius: 28px;
  padding: 18px 20px 20px;
  box-shadow: var(--shadow-card);
}

.destination-stage-onchain {
  width: min(100%, 420px);
  justify-self: center;
  background:
    linear-gradient(180deg, rgba(255, 249, 243, 0.98), rgba(255, 245, 238, 0.84));
  border-color: rgba(176, 90, 43, 0.18);
}

.destination-stage-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.destination-stage-kicker,
.destination-service-label {
  margin: 0;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.destination-stage-meta {
  margin: 0;
  color: var(--accent-strong);
  font-size: 0.84rem;
  font-weight: 700;
}

.destination-stage-card {
  gap: 10px;
}

.destination-stage-card h3 {
  margin: 0;
  font-size: 1.22rem;
}

.destination-stage-card p {
  margin: 0;
}

.destination-example-name {
  margin: 0;
  font-size: clamp(2.15rem, 4vw, 2.7rem);
  line-height: 0.95;
  letter-spacing: -0.04em;
  color: var(--accent-strong);
}

.destination-stage-card-onchain {
  border-color: rgba(176, 90, 43, 0.26);
  background:
    linear-gradient(180deg, rgba(255, 249, 243, 0.98), rgba(255, 245, 238, 0.84));
}

.destination-stage-connector {
  width: 2px;
  height: 28px;
  margin: 0 auto;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(176, 90, 43, 0.18), rgba(176, 90, 43, 0.52));
}

.destination-stage-offchain {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(252, 249, 245, 0.76));
}

.destination-stage-card-offchain {
  background:
    linear-gradient(180deg, rgba(247, 243, 237, 0.82), rgba(255, 255, 255, 0.74));
  border-style: dashed;
  border-color: rgba(176, 90, 43, 0.16);
}

.destination-branch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.destination-branch-card {
  min-height: 108px;
}

.destination-service-value {
  margin: 0;
  font-size: 0.98rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.destination-map {
  display: grid;
  gap: 14px;
}

.destination-map-anchor,
.destination-map-record,
.destination-map-client {
  border: 1px solid rgba(31, 29, 26, 0.09);
  box-shadow: var(--shadow-card);
}

.destination-map-anchor {
  justify-self: center;
  width: min(100%, 520px);
  padding: 22px;
  border-radius: 28px;
  text-align: center;
  background:
    radial-gradient(circle at top, rgba(176, 90, 43, 0.13), transparent 32%),
    linear-gradient(180deg, rgba(255, 249, 243, 0.98), rgba(255, 255, 255, 0.84));
}

.destination-map-kicker {
  margin: 0 0 8px;
  color: var(--accent-strong);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.74rem;
  font-weight: 800;
}

.destination-map-anchor h3 {
  margin: 0;
  color: var(--accent-strong);
  font-size: clamp(2.4rem, 4.8vw, 3.65rem);
  line-height: 0.92;
  letter-spacing: -0.04em;
}

.destination-map-anchor p,
.destination-map-record p,
.destination-map-client p {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}

.destination-map-anchor > p:not(.destination-map-kicker) {
  max-width: 34ch;
  margin: 10px auto 0;
}

.destination-map-mini {
  width: fit-content;
  margin: 16px auto 0;
  padding: 8px 12px;
  border: 1px solid rgba(176, 90, 43, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.destination-map-mini span {
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
  font-weight: 800;
}

.destination-map-rail {
  width: 2px;
  height: 30px;
  margin: 0 auto;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(176, 90, 43, 0.18), rgba(176, 90, 43, 0.58));
}

.destination-map-record {
  padding: 22px;
  border-radius: 30px;
  background:
    radial-gradient(circle at top right, rgba(31, 29, 26, 0.05), transparent 30%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(249, 246, 240, 0.82));
  display: grid;
  grid-template-columns: minmax(240px, 0.72fr) minmax(0, 1.28fr);
  gap: 20px;
  align-items: start;
}

.destination-map-record h3,
.destination-map-client h3 {
  margin: 0 0 8px;
  font-size: clamp(1.32rem, 2vw, 1.7rem);
  line-height: 1.04;
  letter-spacing: -0.018em;
}

.destination-token-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.destination-token {
  min-width: 0;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(31, 29, 26, 0.08);
  background: rgba(255, 255, 255, 0.72);
  display: grid;
  gap: 5px;
}

.destination-token p {
  margin: 0;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
  font-weight: 800;
}

.destination-token strong {
  min-width: 0;
  color: var(--ink);
  font-size: 0.95rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.destination-map-client {
  justify-self: center;
  width: min(100%, 720px);
  padding: 20px 22px;
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(252, 247, 241, 0.78));
  text-align: center;
}

.path-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 14px;
}

.path-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(31, 29, 26, 0.1);
  border-radius: 22px;
  padding: 20px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(252, 247, 241, 0.76));
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 176px;
  box-shadow: var(--shadow-card);
}

.path-card-kicker {
  margin: 0;
  color: var(--accent-strong);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.path-card::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: linear-gradient(180deg, rgba(176, 90, 43, 0.46), rgba(176, 90, 43, 0.08));
}

.path-card h3,
.path-card p {
  margin: 0;
}

.path-card p {
  color: var(--muted);
  line-height: 1.5;
  max-width: 30ch;
  text-wrap: pretty;
}

.path-card-actions {
  margin-top: auto;
  padding-top: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.path-support-row {
  margin-top: 4px;
}

.path-card-actions .action-link {
  align-self: center;
}

.guide-list {
  margin: 0;
  padding-left: 18px;
  color: var(--muted);
  line-height: 1.55;
}

.highlight-kicker {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--accent-strong);
  font-weight: 700;
}

.highlight-card p {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}

.activity-card,
.pending-card,
.name-card,
.recent-name-row,
.live-smoke-card,
.name-activity-card,
.timeline-card,
.result-card,
.transfer-card {
  display: grid;
  gap: 14px;
}

.name-card.compact {
  padding: 14px 16px;
  gap: 8px;
}

.recent-names-list {
  display: grid;
  gap: 16px;
}

.recent-name-row {
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
}

.recent-name-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 14px 24px;
}

.recent-name-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.recent-name-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  justify-content: flex-end;
  align-items: center;
  margin: 0;
  text-align: right;
}

.recent-name-links a {
  color: var(--accent-strong);
  font-weight: 600;
  text-decoration: none;
}

.recent-name-links a:hover {
  text-decoration: underline;
}

body[data-page-kind="claim"] .content-grid,
body[data-page-kind="values"] .content-grid,
body[data-page-kind="transfer"] .content-grid,
body[data-page-kind="setup"] .content-grid {
  max-width: 1080px;
  margin: 0 auto;
}

body[data-page-kind="claim"] .panel-compose-minimal,
body[data-page-kind="values"] .panel-compose-minimal,
body[data-page-kind="transfer"] .panel-compose-minimal,
body[data-page-kind="setup"] .panel-guide,
body[data-page-kind="claim"] .panel-guide,
body[data-page-kind="values"] .panel-guide,
body[data-page-kind="transfer"] .panel-guide,
body[data-page-kind="claim"] .panel-support-strip,
body[data-page-kind="values"] .panel-support-strip,
body[data-page-kind="transfer"] .panel-support-strip,
body[data-page-kind="setup"] .panel-support-strip {
  max-width: 1080px;
  margin-left: auto;
  margin-right: auto;
}

body[data-page-kind="explore"] .content-grid,
body[data-page-kind="auctions"] .content-grid,
body[data-page-kind="explainer"] .content-grid {
  max-width: 1160px;
  margin: 0 auto;
}

body[data-page-kind="explore"] .explore-cluster {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(340px, 0.88fr);
  gap: 24px;
  align-items: start;
}

body[data-page-kind="explore"] .explore-cluster-main,
body[data-page-kind="explore"] .explore-cluster-side {
  display: grid;
  gap: 24px;
  align-content: start;
}

body[data-page-kind="explore"] .stats-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

body[data-page-kind="auctions"] .panel-list + .panel-list,
body[data-page-kind="auctions"] .panel-list + .panel-guide,
body[data-page-kind="auctions"] .panel-guide + .panel-live-smoke {
  margin-top: 2px;
}

body[data-page-kind="auctions"] .hero-page-auctions .hero-copy {
  background:
    radial-gradient(circle at top center, rgba(31, 29, 26, 0.03), transparent 36%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(248, 244, 237, 0.9)),
    var(--panel);
}

body[data-page-kind="auctions"] .hero-page-auctions .hero-status {
  border-color: rgba(31, 29, 26, 0.1);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(252, 247, 240, 0.86));
  color: var(--muted);
  box-shadow: 0 10px 24px rgba(77, 53, 23, 0.06);
}

body[data-page-kind="auctions"] .panel,
body[data-page-kind="auctions"] .activity-card,
body[data-page-kind="auctions"] .guide-card,
body[data-page-kind="auctions"] .result-card {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(247, 243, 236, 0.82)),
    var(--panel);
  border-color: rgba(31, 29, 26, 0.09);
}

body[data-page-kind="auctions"] .summary-chip,
body[data-page-kind="auctions"] .info-popover-toggle {
  background: rgba(255, 255, 255, 0.84);
  border-color: rgba(31, 29, 26, 0.1);
  color: var(--muted);
  box-shadow: 0 8px 20px rgba(77, 53, 23, 0.07);
}

body[data-page-kind="auctions"] .summary-chip.is-current,
body[data-page-kind="auctions"] .summary-chip.is-ready {
  background: rgba(255, 255, 255, 0.9);
  color: var(--ink);
}

body[data-page-kind="auctions"] .helper-text,
body[data-page-kind="auctions"] .tx-panel-note,
body[data-page-kind="auctions"] .result-meta {
  color: var(--muted);
}

body[data-page-kind="auctions"] .result-item label,
body[data-page-kind="auctions"] .field-label {
  color: rgba(99, 91, 80, 0.92);
}

body[data-page-kind="auctions"] .panel-summary-copy p,
body[data-page-kind="auctions"] .panel-head-copy p {
  max-width: 60ch;
}

.recent-name-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.5;
  margin: 0;
}

.tx-chip-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 10px;
}

.tx-link-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tx-inspect-button {
  min-height: 36px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.84);
  color: var(--accent-strong);
  border-color: rgba(127, 53, 20, 0.1);
  box-shadow: none;
  font-size: 0.84rem;
}

.tx-inspect-button:hover {
  background: rgba(255, 255, 255, 0.96);
  filter: none;
}

.result-title,
.name-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 10px 12px;
}

.name-summary,
.compact-name-summary {
  display: grid;
  gap: 8px;
}

.name-summary-meta,
.compact-name-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.5;
}

.name-list-group {
  display: grid;
  gap: 14px;
}

.name-list-group[hidden] {
  display: none;
}

.name-list-group .panel-head {
  margin-bottom: 4px;
}

.name-list-group-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.state-chip,
.status-chip,
.status-pill,
.filter-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 7px 14px;
  border: 1px solid rgba(127, 53, 20, 0.16);
  background: rgba(176, 90, 43, 0.1);
  color: var(--accent-strong);
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1.2;
  box-shadow: none;
}

.status-chip.available {
  background: rgba(80, 150, 90, 0.14);
  color: #265f2e;
}

.status-pill.available {
  background: rgba(80, 150, 90, 0.14);
  color: #265f2e;
}

.status-chip.pending {
  background: rgba(111, 111, 167, 0.14);
  color: #404896;
}

.status-pill.pending {
  background: rgba(111, 111, 167, 0.14);
  color: #404896;
}

.status-chip.immature {
  background: rgba(210, 137, 48, 0.15);
  color: #7a4a0f;
}

.status-pill.immature {
  background: rgba(210, 137, 48, 0.15);
  color: #7a4a0f;
}

.status-chip.mature {
  background: rgba(41, 108, 157, 0.14);
  color: #1e4f73;
}

.status-pill.mature {
  background: rgba(41, 108, 157, 0.14);
  color: #1e4f73;
}

.status-chip.invalid {
  background: rgba(178, 73, 78, 0.14);
  color: #7d1f25;
}

.status-pill.invalid {
  background: rgba(178, 73, 78, 0.14);
  color: #7d1f25;
}

.status-chip.value,
.status-chip.transfer,
.status-chip.claim,
.status-chip.reveal {
  background: rgba(111, 111, 167, 0.14);
  color: #404896;
}

.status-pill.value,
.status-pill.transfer,
.status-pill.claim,
.status-pill.reveal {
  background: rgba(111, 111, 167, 0.14);
  color: #404896;
}

.status-chip.invalidation {
  background: rgba(178, 73, 78, 0.14);
  color: #7d1f25;
}

.status-pill.invalidation {
  background: rgba(178, 73, 78, 0.14);
  color: #7d1f25;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 14px;
}

.filter-chip {
  background: rgba(255, 255, 255, 0.72);
  color: var(--ink);
  cursor: pointer;
}

.filter-chip.is-active {
  background: linear-gradient(135deg, rgba(176, 90, 43, 0.12), rgba(255, 255, 255, 0.94));
  color: var(--accent-strong);
}

.activity-meta,
.pending-meta,
.name-meta,
.timeline-meta,
.name-activity-meta,
.live-smoke-meta,
.result-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  font-size: 0.9rem;
  align-items: center;
  line-height: 1.5;
  margin: 0;
}

.name-card-main {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.name-card-copy {
  display: grid;
  gap: 8px;
}

.name-card h3,
.result-card h3,
.transfer-card h3,
.timeline-card h3,
.name-activity-card h3,
.live-smoke-card h3 {
  margin: 0;
  font-size: 1.2rem;
  font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
}

.name-card-header {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.name-card p,
.activity-card p,
.pending-card p,
.timeline-card p,
.name-activity-card p,
.transfer-card p,
.live-smoke-card p,
.result-card p {
  margin: 0;
  line-height: 1.6;
}

.name-card details {
  border-top: 1px solid var(--line);
  padding-top: 12px;
}

.name-card summary {
  cursor: pointer;
  font-weight: 700;
  color: var(--accent-strong);
}

.name-card summary::-webkit-details-marker {
  display: none;
}

.result-shell {
  display: grid;
  gap: 16px;
}

.lookup-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.lookup-fact {
  border-radius: 14px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.68);
  padding: 14px 16px;
  display: grid;
  gap: 6px;
}

.lookup-fact-label {
  color: var(--muted);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.lookup-fact-value {
  font-size: 1rem;
  line-height: 1.35;
}

.lookup-note {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}

.lookup-note-warning {
  color: var(--accent-strong);
}

.lookup-result-actions {
  margin-top: 4px;
}

.lookup-technical {
  margin-top: 0;
}

.result-empty {
  color: var(--muted);
  font-style: italic;
}

.result-banner {
  display: grid;
  gap: 8px;
  padding: 18px 20px;
  border-radius: 18px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.76);
}

.result-banner strong {
  font-size: 1.1rem;
}

.result-banner.available {
  background: rgba(80, 150, 90, 0.12);
}

.result-banner.pending {
  background: rgba(111, 111, 167, 0.12);
}

.result-banner.immature {
  background: rgba(210, 137, 48, 0.12);
}

.result-banner.mature {
  background: rgba(41, 108, 157, 0.12);
}

.result-banner.invalid {
  background: rgba(178, 73, 78, 0.12);
}

.search-state-banner {
  display: grid;
  gap: 6px;
  padding: 18px 20px;
  border-radius: 18px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.82);
}

.search-state-banner.available {
  background: rgba(80, 150, 90, 0.12);
}

.search-state-banner.pending {
  background: rgba(111, 111, 167, 0.12);
}

.search-state-banner.immature {
  background: rgba(210, 137, 48, 0.12);
}

.search-state-banner.mature {
  background: rgba(41, 108, 157, 0.12);
}

.search-state-banner.invalid {
  background: rgba(178, 73, 78, 0.12);
}

.search-state-label {
  margin: 0;
  color: var(--muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
}

.search-state-title {
  margin: 0;
  font-size: 1.12rem;
}

.search-state-copy {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}

.detail-timeline,
.detail-activity,
.transfer-mode-list {
  display: grid;
  gap: 12px;
}

.timeline-entry,
.name-activity-entry,
.transfer-mode-entry {
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.72);
}

.timeline-entry-grid,
.name-activity-grid {
  margin-top: 10px;
}

.timeline-entry-grid div,
.name-activity-grid div,
.transfer-package-summary div,
.live-smoke-grid div {
  display: grid;
  gap: 6px;
}

.timeline-entry-grid label,
.name-activity-grid label,
.transfer-package-summary label,
.live-smoke-grid label {
  color: var(--muted);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.mono {
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
  font-size: 0.92rem;
  overflow-wrap: anywhere;
}

.transfer-package-actions {
  margin-top: 6px;
}

.mode-list {
  display: grid;
  gap: 12px;
}

.mode-card {
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.72);
  display: grid;
  gap: 10px;
}

.mode-card.recommended {
  background: rgba(176, 90, 43, 0.08);
}

.mode-card h4 {
  margin: 0;
  font-size: 1rem;
}

.mode-card p,
.mode-card ol,
.mode-card ul {
  margin: 0;
  color: var(--muted);
  line-height: 1.6;
}

.mode-card ol,
.mode-card ul {
  padding-left: 18px;
}

.live-smoke-shell {
  display: grid;
  gap: 12px;
}

.message {
  margin-top: 8px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(31, 29, 26, 0.08);
  background: rgba(255, 255, 255, 0.84);
}

.message.error {
  background: rgba(178, 73, 78, 0.12);
}

.message.success {
  background: rgba(80, 150, 90, 0.12);
}

.message p {
  margin: 0;
}

.compact-name-card {
  border: 1px solid var(--line);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  padding: 14px 16px;
}

.compact-name-card summary {
  cursor: pointer;
  list-style: none;
}

.compact-name-card summary::-webkit-details-marker {
  display: none;
}

.resume-callout {
  border: 1px solid rgba(127, 53, 20, 0.14);
  background: linear-gradient(145deg, rgba(176, 90, 43, 0.1), rgba(255, 255, 255, 0.86));
}

.hidden {
  display: none !important;
}

@media (max-width: 980px) {
  .site-nav {
    flex-direction: column;
    align-items: flex-start;
    border-radius: 24px;
  }

  .site-nav-links {
    gap: 6px;
  }

  .hero,
  .content-grid {
    grid-template-columns: 1fr;
  }

  .hero-home,
  .hero-home-launch-strip {
    grid-template-columns: 1fr;
  }

  .hero-page .hero-copy {
    padding: 30px 30px 28px;
  }

  .hero-page h1 {
    max-width: 12ch;
    font-size: clamp(2.2rem, 7vw, 3.45rem);
  }

  .hero-page .lede {
    max-width: 34ch;
  }

  .hero-home-copy,
  .hero-home-lookup,
  .hero-home-launch-strip {
    grid-column: 1;
  }

  .claim-intake-grid,
  .claim-intake-essentials,
  .value-intake-grid,
  .transfer-intake-grid,
  .transfer-role-workflow,
  .transfer-role-grid,
  .transfer-export-grid,
  body[data-page-kind="explore"] .explore-cluster {
    grid-template-columns: 1fr;
  }

  body[data-page-kind="explore"] .explore-cluster-main,
  body[data-page-kind="explore"] .explore-cluster-side {
    gap: 20px;
  }

  .summary-grid,
  .stats-grid,
  .result-grid,
  .name-grid,
  .value-grid,
  .transfer-grid,
  .transfer-package-summary,
  .live-smoke-grid,
  .detail-overview-grid,
  .guide-grid,
  .guide-grid-steps,
  .transfer-mode-grid,
  .field-grid,
  .timeline-entry-grid,
  .name-activity-grid,
  .path-grid,
  .destination-branch-grid {
    grid-template-columns: 1fr;
  }

  .protocol-flow {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .protocol-flow-arrow {
    width: 2px;
    height: 28px;
    justify-self: center;
    background: linear-gradient(180deg, rgba(176, 90, 43, 0.18), rgba(176, 90, 43, 0.58));
  }

  .protocol-flow-arrow::after {
    right: 50%;
    top: auto;
    bottom: -1px;
    transform: translateX(50%) rotate(135deg);
  }

  .destination-map-record {
    grid-template-columns: 1fr;
  }

  .destination-token-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .destination-stage-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .guide-step-head {
    grid-template-columns: 1fr;
  }

  .name-card-main,
  .name-group-head,
  .panel-head-main,
  .panel-summary,
  .panel-support-strip,
  .wizard-step-summary,
  .wizard-step-heading {
    flex-direction: column;
    align-items: flex-start;
  }

  .panel-support-strip {
    grid-template-columns: 1fr;
  }

  .link-strip {
    grid-template-columns: 1fr;
  }

  .link-strip-actions {
    justify-content: flex-start;
  }

  .site-footer-grid {
    grid-template-columns: 1fr;
  }

  .recent-name-row {
    grid-template-columns: 1fr;
  }

  .recent-name-header {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .recent-name-links,
  .tx-chip-row {
    justify-content: flex-start;
    text-align: left;
  }

  .tool-callout-row {
    align-items: flex-start;
  }

  body[data-page-kind="explore"] .stats-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .page-shell {
    width: min(100vw, calc(100vw - 24px));
    padding: 18px 0 36px;
  }

  .site-nav {
    margin-bottom: 14px;
    padding: 12px;
  }

  .site-nav-brand {
    width: 100%;
  }

  .site-nav-links {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .site-nav-link {
    width: 100%;
    min-height: 42px;
    padding: 8px 6px;
    text-align: center;
    font-size: 0.8rem;
    line-height: 1.2;
  }

  .site-nav-link-external {
    grid-column: 1 / -1;
  }

  .hero-copy,
  .hero-card,
  .panel {
    padding: 20px;
  }

  .panel-support-strip {
    gap: 12px;
  }

  .link-strip-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    width: 100%;
  }

  .hero-home-copy,
  .hero-home-lookup,
  .hero-home-launch-strip {
    padding: 20px;
    border-radius: 14px;
  }

  .hero-home-copy h1 {
    font-size: clamp(2.05rem, 10vw, 3rem);
    max-width: 12ch;
  }

  .hero-home-proof-row,
  .hero-lookup-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .hero-home-proof-row span,
  .hero-lookup-actions > * {
    width: 100%;
    justify-content: center;
  }

  .hero-home-lookup {
    gap: 16px;
  }

  .hero-home-launch-strip {
    gap: 12px;
  }

  .protocol-flow-card,
  .destination-map-anchor,
  .destination-map-record,
  .destination-map-client {
    padding: 16px;
  }

  .protocol-example p,
  .protocol-example-destinations p {
    grid-template-columns: 1fr;
    gap: 2px;
  }

  .destination-token-grid {
    grid-template-columns: 1fr;
  }

  .choice-compare {
    grid-template-columns: 1fr;
  }

  .destination-map-mini {
    width: 100%;
    justify-content: center;
    border-radius: 18px;
  }

  .hero-page .hero-copy {
    padding: 24px 22px;
  }

  .hero-page h1 {
    max-width: 10ch;
    font-size: clamp(2.15rem, 9vw, 2.95rem);
    line-height: 0.95;
  }

  .hero-page .lede {
    max-width: 24ch;
    font-size: 1rem;
  }

  .wizard-step-summary {
    padding: 18px 20px;
    gap: 12px;
  }

  .wizard-step-body {
    padding: 0 20px 20px;
    gap: 14px;
  }

  .claim-flow {
    gap: 18px;
  }

  .claim-intake-callout {
    padding: 16px;
  }

  .transfer-intake-main {
    gap: 16px;
  }

  .wizard-step-heading {
    gap: 10px;
  }

  .wizard-step-copy p {
    font-size: 0.94rem;
  }

  .claim-step-badge {
    min-width: 66px;
    padding: 7px 10px;
    font-size: 0.74rem;
  }

  .wizard-step-state {
    align-self: flex-start;
  }

  h1 {
    max-width: unset;
    font-size: clamp(2rem, 9vw, 2.8rem);
  }

  .field-actions,
  .transfer-export-actions,
  .transfer-package-actions,
  .draft-actions,
  .detail-actions-row {
    width: 100%;
  }

  .search-row,
  .inline-input-row,
  .draft-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .value-bundle-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .value-history-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .search-row > button,
  .inline-input-row > button,
  .field-actions > *,
  .transfer-export-actions > *,
  .transfer-package-actions > *,
  .draft-actions > *,
  .detail-actions-row > *,
  .link-strip-actions > * {
    width: 100%;
  }

  .tool-callout-row .action-link {
    width: 100%;
  }

  .hero-cta-row {
    gap: 8px;
  }

  .jump-bar {
    gap: 8px;
    margin-bottom: 18px;
  }

  .hero-cta-row .action-link {
    flex: 1 1 100%;
    width: 100%;
  }

  .jump-bar {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 4px;
    margin-bottom: 20px;
    scrollbar-width: none;
  }

  .jump-bar::-webkit-scrollbar {
    display: none;
  }

  .jump-bar a {
    flex: 0 0 auto;
    width: auto;
    white-space: nowrap;
    justify-content: center;
    box-shadow: none;
  }

  .jump-bar-overview {
    flex-wrap: nowrap;
    align-items: center;
    overflow-x: auto;
    padding: 10px;
    border-radius: 999px;
    scroll-padding-inline: 10px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .jump-bar-overview .jump-bar-label {
    flex: 0 0 auto;
    padding: 0 8px 0 4px;
  }

  .jump-bar-overview a {
    flex: 0 0 auto;
  }

  .summary-chip,
  .state-chip,
  .status-chip,
  .filter-chip {
    width: auto;
    max-width: 100%;
  }

  .filter-row,
  .tx-link-list {
    gap: 8px;
  }

  body[data-page-kind="explore"] .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  body[data-page-kind="explore"] .stat-card {
    padding: 14px;
  }

  body[data-page-kind="explore"] .stat-value {
    font-size: 1.35rem;
  }

  body[data-page-kind="auctions"] .panel-summary-copy p,
  body[data-page-kind="auctions"] .panel-head-copy p {
    font-size: 0.94rem;
  }

  .tx-inspect-button {
    min-height: 38px;
    padding: 9px 12px;
    font-size: 0.88rem;
    box-shadow: none;
  }

  .recent-name-row,
  .activity-card,
  .pending-card,
  .name-card,
  .live-smoke-card,
  .timeline-card,
  .name-activity-card,
  .result-card,
  .transfer-card,
  .guide-card,
  .highlight-card {
    padding: 18px;
  }
}

/* Tool-surface polish: tighter sections, flatter cards, no clipped action rows. */
:root {
  --shadow: 0 18px 44px rgba(23, 50, 44, 0.1);
  --shadow-soft: 0 10px 26px rgba(23, 50, 44, 0.08);
  --shadow-card: 0 6px 16px rgba(23, 50, 44, 0.055);
  --shadow-lift: 0 10px 26px rgba(23, 50, 44, 0.09);
  --radius-lg: 10px;
  --radius-md: 8px;
  --radius-sm: 6px;
}

.site-nav,
.site-nav-link,
.hero-copy,
.hero-card,
.hero-home-copy,
.hero-home-lookup,
.hero-home-launch-strip,
.panel,
.site-footer,
.jump-bar-overview,
.jump-bar a,
.link-chip,
.tool-handoff-card,
.command-block,
.summary-chip,
.detail-summary-card,
.info-popover-toggle,
.info-popover-card,
.hero-status,
.hero-action-item,
.claim-flow-step,
.claim-step-badge,
input,
textarea,
select,
button,
.action-link,
.result-card,
.highlight-card,
.transfer-essentials-card,
.stat-card,
.guide-card,
.auction-bid-workflow,
.bid-flow-timeline,
.psbt-handoff-steps,
.psbt-trust-note,
.protocol-flow-card,
.protocol-flow-number,
.protocol-example,
.protocol-result,
.choice-card,
.panel-empty-state,
.explore-empty-card,
.destination-stage,
.destination-map-anchor,
.destination-map-record,
.destination-map-client,
.destination-token,
.path-card,
.transfer-role-panel,
.transfer-package-review-tool,
.value-bundle-editor,
.value-bundle-row,
.value-bundle-preview-row,
.value-history-card,
.resolver-compare-card,
.value-history-row,
.state-chip,
.status-chip,
.status-pill,
.filter-chip,
.lookup-fact,
.result-banner,
.search-state-banner,
.timeline-entry,
.name-activity-entry,
.transfer-mode-entry,
.mode-card,
.message,
.compact-name-card {
  border-radius: var(--radius-md);
}

.site-nav,
.hero-copy,
.hero-card,
.hero-home-copy,
.hero-home-lookup,
.panel,
.site-footer {
  box-shadow: var(--shadow-soft);
}

.hero-page {
  max-width: 1080px;
}

.hero-page .hero-copy {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px 24px;
  align-items: center;
  padding: 24px 28px;
  text-align: left;
}

.hero-page h1 {
  grid-column: 1;
  justify-self: start;
  max-width: none;
  margin: 0;
  width: 100%;
  font-size: clamp(2rem, 3.2vw, 3rem);
  line-height: 1;
  letter-spacing: 0;
  text-align: left;
}

.hero-page .lede {
  grid-column: 1;
  justify-self: start;
  margin: 8px 0 0;
  max-width: 46ch;
  width: 100%;
  text-align: left;
}

.hero-page .hero-status {
  grid-row: 1 / span 2;
  grid-column: 2;
  margin: 0;
  max-width: 34ch;
  text-align: center;
}

.panel {
  padding: 24px;
  gap: 18px;
}

.guide-card,
.result-card,
.highlight-card,
.transfer-essentials-card,
.stat-card,
.path-card,
.transfer-role-panel,
.transfer-package-review-tool {
  padding: 16px;
  box-shadow: var(--shadow-card);
}

.guide-card,
.result-card,
.stat-card,
.path-card,
.transfer-role-panel,
.transfer-package-review-tool {
  background: rgba(255, 255, 255, 0.74);
}

.claim-flow {
  gap: 16px;
}

.wizard-step-summary {
  padding: 18px 20px;
}

.wizard-step-body {
  padding: 0 20px 20px;
}

.value-intake-grid {
  grid-template-columns: minmax(280px, 0.92fr) minmax(300px, 1fr);
  gap: 16px;
}

.value-intake-callout {
  min-height: 0;
}

.transfer-role-workflow-simple {
  margin-top: 16px;
}

.path-grid {
  grid-template-columns: repeat(auto-fit, minmax(218px, 1fr));
}

.path-card {
  min-width: 0;
  min-height: 172px;
  overflow: visible;
}

.path-card-actions,
.guide-card-actions,
.hero-lookup-actions,
.link-strip-actions {
  flex-wrap: wrap;
}

.path-card-actions .action-link {
  min-width: 0;
  max-width: 100%;
}

button,
.action-link,
.link-chip {
  min-height: 42px;
  padding: 10px 16px;
  box-shadow: 0 8px 18px rgba(23, 50, 44, 0.11);
}

input,
textarea,
select {
  min-height: 46px;
  padding: 11px 13px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.result-card.empty {
  color: var(--ink);
}

@media (max-width: 980px) {
  .hero-page .hero-copy {
    grid-template-columns: 1fr;
    text-align: center;
  }

  .hero-page .lede {
    grid-column: auto;
    justify-self: center;
    margin-left: auto;
    margin-right: auto;
    width: auto;
    text-align: center;
  }

  .hero-page h1 {
    grid-column: auto;
    justify-self: center;
    width: auto;
    text-align: center;
  }

  .hero-page .hero-status {
    grid-row: auto;
    grid-column: auto;
    justify-self: center;
  }

  .value-intake-grid {
    grid-template-columns: 1fr;
  }
}

@media (min-width: 981px) {
  .path-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .page-shell {
    width: min(100vw, calc(100vw - 20px));
  }

  .hero-page .hero-copy,
  .hero-home-copy,
  .hero-home-lookup,
  .panel,
  .site-footer {
    padding: 18px;
  }

  .hero-page h1,
  .hero-home-copy h1 {
    font-size: clamp(2rem, 8.5vw, 2.7rem);
    max-width: none;
  }

  .path-card,
  .guide-card,
  .result-card,
  .highlight-card,
  .transfer-essentials-card,
  .stat-card,
  .transfer-role-panel,
  .transfer-package-review-tool {
    padding: 16px;
  }

  .link-strip-actions {
    grid-template-columns: 1fr;
  }
}

.claim-available { display: grid; gap: 10px; text-align: left; }
.claim-available-kicker { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
.claim-available h3 { margin: 0; font-size: 18px; }
.claim-available p { margin: 0; color: var(--ink); line-height: 1.5; }
.claim-available #valueClaimButton { justify-self: start; margin-top: 4px; }
.claim-available-result { margin-top: 8px; display: grid; gap: 8px; }
.claim-ok { color: #0a7d3c; font-weight: 600; }
.claim-err { color: #b00020; font-weight: 600; }
.claim-meta { font-size: 13px; color: var(--muted, #555); }
.claim-key-box { border: 1px solid var(--line); border-radius: 10px; padding: 12px; background: rgba(0,0,0,0.03); display: grid; gap: 6px; }
.claim-key { display: block; word-break: break-all; font-size: 13px; padding: 8px; background: #fff; border-radius: 6px; border: 1px solid var(--line); }
`;
