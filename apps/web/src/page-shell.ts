import { PRODUCT_NAME } from "@ont/protocol";

export type PageKind = "home" | "explore" | "advanced" | "auctions" | "values" | "transfer" | "setup" | "explainer";
const GITHUB_REPO_URL = "https://github.com/deekay/ont";
const GITHUB_BLOB_BASE_URL = `${GITHUB_REPO_URL}/blob/main`;
const DOC_URLS = {
  readme: `${GITHUB_BLOB_BASE_URL}/README.md`,
  fromZero: `${GITHUB_BLOB_BASE_URL}/docs/core/ONT_FROM_ZERO.md`,
  newUser: `${GITHUB_BLOB_BASE_URL}/docs/core/NEW_USER_TESTING_GUIDE.md`,
  sparrowPrivateSignet: `${GITHUB_BLOB_BASE_URL}/docs/demo/SPARROW_PRIVATE_SIGNET.md`,
  implementation: `${GITHUB_BLOB_BASE_URL}/docs/launch/ONT_IMPLEMENTATION_AND_VALIDATION.md`,
  launchSpec: `${GITHUB_BLOB_BASE_URL}/docs/launch/LAUNCH_SPEC_V0.md`,
  auctionSettlement: `${GITHUB_BLOB_BASE_URL}/docs/launch/AUCTION_SETTLEMENT_AND_OWNERSHIP.md`,
  destinations: `${GITHUB_BLOB_BASE_URL}/docs/research/VALUE_RECORD_HISTORY_AND_KEYBASE_NOTES.md`,
  transfer: `${GITHUB_BLOB_BASE_URL}/docs/research/TRANSFER_RELAY_OPTIONS.md`,
  recovery: `${GITHUB_BLOB_BASE_URL}/docs/research/OWNER_KEY_RECOVERY.md`,
  testing: `${GITHUB_BLOB_BASE_URL}/docs/core/TESTING.md`
} as const;
export interface PageShellOptions {
  basePath: string,
  faviconDataUrl: string,
  includePrivateAuctionSmoke: boolean,
  networkLabel: string,
  pageKind: PageKind,
  privateSignetElectrumEndpoint: string | null,
  privateSignetFundingAmountSats: bigint,
  privateSignetFundingMaxSats: bigint,
  privateSignetFundingEnabled: boolean,
}

export function renderPageHtml(options: PageShellOptions): string {
  const {
    basePath,
    faviconDataUrl,
    includePrivateAuctionSmoke,
    networkLabel,
    pageKind,
    privateSignetElectrumEndpoint,
    privateSignetFundingAmountSats,
    privateSignetFundingMaxSats,
    privateSignetFundingEnabled
  } = options;
  const title =
    pageKind === "home"
      ? PRODUCT_NAME
      : pageKind === "advanced"
      ? `${PRODUCT_NAME} Advanced`
      : pageKind === "auctions"
      ? `${PRODUCT_NAME} — Claim a Name`
      : pageKind === "values"
        ? `${PRODUCT_NAME} Destinations`
      : pageKind === "transfer"
        ? `${PRODUCT_NAME} Transfer Prep`
        : pageKind === "setup"
          ? `${PRODUCT_NAME} Setup`
        : pageKind === "explainer"
          ? `${PRODUCT_NAME} Overview`
          : `${PRODUCT_NAME} Explorer`;
  const description =
    pageKind === "home"
      ? "Search a name, inspect ownership, and choose whether to claim it, explore, or review the current Open Name Tags prototype."
      : pageKind === "advanced"
      ? "Advanced Open Name Tags surfaces for CLI-heavy workflows and review docs."
    : pageKind === "auctions"
      ? "Claim a name in Open Name Tags. Contested names settle by bonded auction; build the bid and review chain-derived activity."
      : pageKind === "values"
        ? "Update the destinations for an owned Open Name Tags name by signing locally and publishing the signed update."
      : pageKind === "transfer"
        ? "Prepare an Open Name Tags transfer by choosing the recipient owner key and checking the current on-chain state."
      : pageKind === "setup"
          ? "Set up Sparrow, connect to the hosted demo wallet endpoint, request demo coins, and complete the private signet walkthrough."
        : pageKind === "explainer"
          ? "Quick orientation for using the hosted Open Name Tags tools."
        : "Explorer for browsing owned names and resolver status in Open Name Tags.";

  const pageScripts = [
    `<script type="module" src="${withBasePath("/app.js", basePath)}"></script>`,
    pageKind === "auctions"
      ? `<script type="module" src="${withBasePath("/auction-tools.js", basePath)}"></script>`
      : "",
    pageKind === "values"
      ? `<script type="module" src="${withBasePath("/value-tools.js", basePath)}"></script>`
      : ""
  ]
    .filter(Boolean)
    .join("\n    ");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta
      name="description"
      content="${escapeHtml(description)}"
    />
    <link rel="icon" href="${faviconDataUrl}" />
    <link rel="apple-touch-icon" href="${faviconDataUrl}" />
    <link rel="stylesheet" href="${withBasePath("/styles.css", basePath)}" />
  </head>
  <body data-base-path="${escapeHtml(basePath)}" data-page-kind="${escapeHtml(pageKind)}">
    <div class="page-shell">
      ${renderPrimaryNav(basePath, pageKind, faviconDataUrl)}
      ${renderHeroSection(basePath, networkLabel, pageKind)}
      <main class="content-grid">
        ${
          pageKind === "home"
            ? renderHomePageSections(basePath)
            : pageKind === "advanced"
            ? renderAdvancedPageSections(basePath, includePrivateAuctionSmoke)
            : pageKind === "auctions"
            ? renderAuctionsPageSections(basePath, includePrivateAuctionSmoke)
            : pageKind === "values"
              ? renderValuesPageSections(basePath)
            : pageKind === "transfer"
              ? renderTransferPageSections(basePath)
              : pageKind === "setup"
              ? renderSetupPageSections(basePath, privateSignetElectrumEndpoint, privateSignetFundingEnabled, privateSignetFundingAmountSats, privateSignetFundingMaxSats)
              : pageKind === "explainer"
                ? renderExplainerPageSections(basePath)
              : renderExplorePageSections(basePath)
        }
      </main>
      ${renderSiteFooter(basePath)}
    </div>
    ${pageScripts}
  </body>
</html>`;
}

function renderHeroSection(
  configuredBasePath: string,
  configuredNetworkLabel: string,
  pageKind: PageKind
): string {
  if (pageKind === "transfer") {
    return `<header class="hero hero-single hero-page hero-page-transfer">
      <div class="hero-copy">
        <h1>Transfer Handoff</h1>
        <p class="lede">
          Prepare the current advanced handoff for moving a name to a new owner key.
        </p>
        <p id="chainSummary" class="hero-status">
          ${escapeHtml(configuredNetworkLabel)} · Height - · 0 names · 0 pending
        </p>
      </div>
    </header>`;
  }

  if (pageKind === "values") {
    return `<header class="hero hero-single hero-page hero-page-values">
      <div class="hero-copy">
        <h1>Update A Name's Destinations</h1>
        <p class="lede">
          Edit the destinations a name points to, sign the update in this browser, and publish only the signed record.
        </p>
        <p id="chainSummary" class="hero-status">
          ${escapeHtml(configuredNetworkLabel)} · Height - · 0 names · 0 pending
        </p>
      </div>
    </header>`;
  }

  if (pageKind === "explainer") {
    return `<header class="hero hero-single hero-page hero-page-explainer">
      <div class="hero-copy">
        <h1>Quick Overview</h1>
        <p class="lede">
          How the current prototype works, what is live today, and where to go next.
        </p>
      </div>
    </header>`;
  }

  if (pageKind === "setup") {
    return `<header class="hero hero-single hero-page hero-page-setup">
      <div class="hero-copy">
        <h1>Set Up Your Wallet</h1>
        <p class="lede">
          Common Sparrow setup for the hosted private demo: connect once, fund the same wallet, then use that wallet for auction signing.
        </p>
      </div>
    </header>`;
  }

  if (pageKind === "explore") {
    return `<header class="hero hero-single hero-page hero-page-explore">
      <div class="hero-copy">
        <h1>Explore The Live Registry</h1>
        <p class="lede">
          Owned names, active auctions, recent activity, and live registry state.
        </p>
        <p id="chainSummary" class="hero-status">
          ${escapeHtml(configuredNetworkLabel)} · Height - · 0 names
        </p>
      </div>
    </header>`;
  }

  if (pageKind === "advanced") {
    return `<header class="hero hero-single hero-page hero-page-advanced">
      <div class="hero-copy">
        <h1>Advanced Tools</h1>
        <p class="lede">
          CLI-heavy workflows, implementation notes, and protocol review. Most first-time users can stay on Setup, Auctions, and Explore.
        </p>
        <p class="hero-status">
          Advanced / optional surface · use when you need deeper protocol context or expert tooling.
        </p>
      </div>
    </header>`;
  }

  if (pageKind === "auctions") {
    return `<header class="hero hero-single hero-page hero-page-auctions">
      <div class="hero-copy">
        <h1>Claim A Name</h1>
        <p class="lede">
          Check a name, build the unsigned Sparrow PSBT, and review live state.
        </p>
        <p class="hero-status">
          In ONT's design you claim a name for a small fixed fee, and it escalates to a bonded
          auction only if someone else claims it too. This prototype runs the contested path
          end-to-end, so claiming here builds an opening bid. Website builds; Sparrow signs and broadcasts.
        </p>
      </div>
    </header>`;
  }

  return `<header class="hero hero-home hero-home-product">
    <section class="hero-home-copy" aria-labelledby="homeHeroTitle">
      <p class="hero-home-kicker">Sovereign names on Bitcoin</p>
      <h1 id="homeHeroTitle">Own your name like you own your bitcoin.</h1>
      <p class="hero-home-lede">
        Open Name Tags is a neutral naming protocol anchored to Bitcoin. No registrar, no token, no
        rent, no gatekeeper &mdash; you hold the keys, and Bitcoin settles who owns what. The rules are
        frozen and auditable, and anyone can run the infrastructure. You use it from the app; this site
        just explains it and lets you verify it yourself.
      </p>
      <div class="hero-home-proof-row" aria-label="What makes it sovereign">
        <span>You hold the keys</span>
        <span>No gatekeeper</span>
        <span>Verify, don't trust</span>
      </div>
      <div class="hero-lookup-actions">
        <a class="action-link" href="#app">Get the app</a>
        <a class="action-link secondary" href="#how-ont-works">How it works</a>
        <a class="action-link secondary" href="#verify">Verify it yourself</a>
      </div>
    </section>
    <section id="lookup" class="hero-home-lookup" aria-labelledby="homeLookupTitle">
      <div class="hero-home-lookup-head">
        <p class="hero-home-kicker">See it live</p>
        <h2 id="homeLookupTitle">Check a name</h2>
        <p>Look up any name on the live chain &mdash; whether it's claimable or already owned, and who owns it.</p>
      </div>
      <form id="searchForm" class="search-form hero-search-form">
        <label class="field-label" for="nameInput">Name</label>
        <div class="search-row">
          <input id="nameInput" name="name" type="text" maxlength="32" placeholder="alice" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" />
          <button type="submit">Check</button>
        </div>
      </form>
      <div id="searchResult" class="result-card empty hero-search-result" hidden></div>
      <div class="hero-lookup-actions">
        <a class="action-link secondary" href="${withBasePath("/explore", configuredBasePath)}">Explore the registry</a>
        <a class="action-link secondary" href="${withBasePath("/values", configuredBasePath)}">Browser tools</a>
      </div>
    </section>
  </header>`;
}

function renderPrimaryNav(configuredBasePath: string, pageKind: PageKind, faviconDataUrl: string): string {
  const links = [
    { href: withBasePath("/", configuredBasePath), label: "Home", active: pageKind === "home" },
    { href: withBasePath("/explore", configuredBasePath), label: "Explore", active: pageKind === "explore" },
    { href: withBasePath("/values", configuredBasePath), label: "Tools", active: pageKind === "values" },
    { href: withBasePath("/explainer", configuredBasePath), label: "Learn", active: pageKind === "explainer" }
  ];

  return `<nav class="site-nav" aria-label="Primary">
    <a class="site-nav-brand" href="${withBasePath("/", configuredBasePath)}">
      <img class="site-nav-brand-mark" src="${faviconDataUrl}" alt="" aria-hidden="true" />
      <span>Open Name Tags</span>
    </a>
    <div class="site-nav-links">
      ${links
        .map(
          (link) =>
            `<a class="site-nav-link${link.active ? " is-active" : ""}" href="${link.href}">${escapeHtml(link.label)}</a>`
        )
        .join("")}
    </div>
  </nav>`;
}

function renderInfoPopover(ariaLabel: string, body: string): string {
  return `<details class="info-popover">
    <summary class="info-popover-toggle" aria-label="${escapeHtml(ariaLabel)}" title="${escapeHtml(ariaLabel)}">i</summary>
    <div class="info-popover-card">${body}</div>
  </details>`;
}

function renderPanelHead(title: string, summary: string, infoBody?: string): string {
  return `<div class="panel-head">
    <div class="panel-head-main">
      <div class="panel-head-copy">
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(summary)}</p>
      </div>
      ${infoBody ? renderInfoPopover(`More about ${title}`, infoBody) : ""}
    </div>
  </div>`;
}

function renderHomePageSections(configuredBasePath: string): string {
  return `${renderHomeModelSection()}
    ${renderHomeNeutralitySection()}
    ${renderHomeAppSection(configuredBasePath)}
    ${renderHomeVerifySection(configuredBasePath)}`;
}

function renderExplorePageSections(configuredBasePath: string): string {
  return `${renderOverviewSection()}
    ${renderExploreEmptyStateSection(configuredBasePath)}
    ${renderExperimentalAuctionFeedSection()}
    <div class="explore-cluster">
      <div class="explore-cluster-main">
        ${renderRecentNamesSection()}
        ${renderNamesSection(true)}
      </div>
      <div class="explore-cluster-side">
        ${renderActivitySection(true)}
        ${renderNetworkDetailsSection(true)}
      </div>
    </div>`;
}

function renderExploreEmptyStateSection(configuredBasePath: string): string {
  return `<section id="explore-empty-state" class="panel panel-guide panel-empty-state" hidden>
    ${renderPanelHead(
      "No Live State Yet",
      "Explore shows owned names, active auctions, and recent chain activity from this resolver."
    )}
    <div class="guide-grid guide-grid-balanced">
      <article class="guide-card">
        <h3>Why This Can Be Empty</h3>
        <p id="exploreEmptyStateMessage">No owned names or active auctions are visible from this resolver right now.</p>
        <p id="exploreEmptyStateDetail" class="field-note">That can mean the demo chain was reset, or that no bid has confirmed yet.</p>
      </article>
      <article class="guide-card">
        <h3>What You Can Do Next</h3>
        <ul class="guide-list">
          <li>Set up Sparrow if you have not connected the demo wallet yet.</li>
          <li>Open Auctions to prepare a bid for a name.</li>
          <li>Come back here after a name is won and visible to the resolver.</li>
        </ul>
        <div class="guide-card-actions">
          <a class="action-link secondary" href="${withBasePath("/setup", configuredBasePath)}">Open setup</a>
          <a class="action-link secondary" href="${withBasePath("/auctions", configuredBasePath)}">Open auctions</a>
        </div>
      </article>
    </div>
  </section>`;
}

function renderAdvancedPageSections(configuredBasePath: string, includePrivateAuctionSmoke: boolean): string {
  return `${renderAdvancedGuideSection(configuredBasePath)}
    ${renderAdvancedReferencesSection(configuredBasePath)}
    ${renderAuctionLabSection(true)}
    ${renderAuctionLabNotesSection(true)}
    ${includePrivateAuctionSmoke ? renderPrivateAuctionSmokeSection(true) : ""}`;
}

function renderAuctionsPageSections(configuredBasePath: string, _includePrivateAuctionSmoke: boolean): string {
  return `${renderAuctionStartSection(configuredBasePath)}
    ${renderExperimentalAuctionFeedSection()}`;
}

function renderAdvancedGuideSection(configuredBasePath: string): string {
  return `<section id="advanced-start" class="panel panel-guide">
    ${renderPanelHead(
      "When To Use This Area",
      "This part of the website is for expert/reference work, not the common first-time path."
    )}
    <div class="guide-grid guide-grid-balanced">
      <article class="guide-card">
        <h3>Most People Can Ignore This</h3>
        <ul class="guide-list">
          <li>Use Setup, Auctions, and Explore for the normal website walkthrough.</li>
          <li>The website already hides most expert knobs from those pages on purpose.</li>
          <li>If you are learning the system for the first time, start there instead.</li>
        </ul>
      </article>
      <article class="guide-card">
        <h3>What Belongs Here</h3>
        <ul class="guide-list">
          <li>Auction implementation notes and review links</li>
          <li>CLI-heavy workflows and custom protocol experiments</li>
          <li>Reviewer-facing docs and implementation notes</li>
        </ul>
      </article>
      <article class="guide-card guide-card-wide">
        <h3>Use The CLI For Custom Work</h3>
        <p>If you need custom destination formats, multi-resolver fanout, policy modeling, deeper transfer/sale flows, or protocol research work, the CLI and docs are still the right tools.</p>
        <div class="guide-card-actions">
          <a class="action-link secondary" href="${DOC_URLS.fromZero}" target="_blank" rel="noreferrer noopener">Read from zero</a>
          <a class="action-link secondary" href="${DOC_URLS.launchSpec}" target="_blank" rel="noreferrer noopener">Launch spec</a>
          <a class="action-link secondary" href="${DOC_URLS.implementation}" target="_blank" rel="noreferrer noopener">Implementation</a>
        </div>
      </article>
    </div>
    <div class="hero-cta-row section-cta-row">
      <a class="action-link secondary" href="${withBasePath("/auctions", configuredBasePath)}">Open auctions</a>
      <a class="action-link secondary" href="${withBasePath("/explainer", configuredBasePath)}">Open overview</a>
      <a class="action-link secondary" href="${withBasePath("/setup", configuredBasePath)}">Back to setup</a>
    </div>
  </section>`;
}

function renderAdvancedReferencesSection(configuredBasePath: string): string {
  return `<section id="advanced-references" class="panel panel-guide">
    ${renderPanelHead(
      "Advanced Surfaces",
      "Use these when you want deeper auction context, implementation detail, or protocol-review material."
    )}
    <div class="guide-grid guide-grid-balanced">
      <article class="guide-card">
        <h3>Auction Implementation</h3>
        <p>Use the public auction page for real bid prep. Simulator state examples live here only for docs, review, and implementation checks.</p>
        <div class="guide-card-actions">
          <a class="action-link secondary" href="${withBasePath("/auctions", configuredBasePath)}">Open auctions</a>
        </div>
      </article>
      <article class="guide-card">
        <h3>Testing And Validation</h3>
        <p>Use the testing and implementation notes when you want to review what is actually exercised today versus what is still provisional.</p>
        <div class="guide-card-actions">
          <a class="action-link secondary" href="${DOC_URLS.testing}" target="_blank" rel="noreferrer noopener">Testing guide</a>
          <a class="action-link secondary" href="${DOC_URLS.implementation}" target="_blank" rel="noreferrer noopener">Implementation</a>
        </div>
      </article>
      <article class="guide-card">
        <h3>Protocol Review Docs</h3>
        <p>Use the launch and system docs when you want the higher-level protocol framing, tradeoffs, and current working assumptions.</p>
        <div class="guide-card-actions">
          <a class="action-link secondary" href="${DOC_URLS.fromZero}" target="_blank" rel="noreferrer noopener">From zero</a>
          <a class="action-link secondary" href="${DOC_URLS.launchSpec}" target="_blank" rel="noreferrer noopener">Launch spec</a>
        </div>
      </article>
    </div>
  </section>`;
}

function renderTransferPageSections(configuredBasePath: string): string {
  return `${renderTransferPrepSection()}
    ${renderTransferSupportStrip(configuredBasePath)}`;
}

function renderValuesPageSections(configuredBasePath: string): string {
  return `${renderValuesToolSection()}
    ${renderValuesSupportStrip(configuredBasePath)}`;
}

function renderSetupPageSections(
  configuredBasePath: string,
  privateSignetElectrumEndpoint: string | null,
  privateSignetFundingEnabled: boolean,
  privateSignetFundingAmountSats: bigint,
  privateSignetFundingMaxSats: bigint
): string {
  return `${renderSetupQuickstartSection(configuredBasePath, privateSignetElectrumEndpoint)}
    ${privateSignetFundingEnabled ? renderSetupFundingSection(privateSignetFundingAmountSats, privateSignetFundingMaxSats) : ""}
    ${renderSetupSupportStrip(configuredBasePath)}`;
}

function renderExplainerPageSections(configuredBasePath: string): string {
  return `${renderExplainerJumpBar(configuredBasePath)}
    ${renderHomeModelSection()}
    ${renderHomeDestinationDiagramSection()}
    ${renderUsingOntSection(configuredBasePath)}
    ${renderFeatureReferenceSection(configuredBasePath)}
    ${renderHomeDocsSection()}`;
}

function renderAuctionStartSection(configuredBasePath: string): string {
  return `<section id="auction-start" class="panel panel-compose">
    ${renderPanelHead(
      "Claim A Name",
      "Start with a name. The page shows whether it's claimable or already in a live contest, and prepares the right bid."
    )}
    <form id="searchForm" class="search-form tool-draft-form">
      <label class="field-label" for="nameInput">Name</label>
      <div class="search-row">
        <input id="nameInput" name="name" type="text" maxlength="32" placeholder="alice" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" />
        <button type="submit">Check name</button>
      </div>
    </form>
    <div id="searchResult" class="result-card empty" hidden></div>
    ${renderLinkStrip("Before you claim", [
      { href: withBasePath("/setup", configuredBasePath), label: "Set up Sparrow" },
      { href: DOC_URLS.auctionSettlement, label: "Auction guide", external: true },
      { href: DOC_URLS.recovery, label: "Recovery kit guide", external: true }
    ])}
  </section>`;
}

function renderAuctionLabSection(collapsible = false): string {
  const body = `${renderPanelHead(
    "Auction State Gallery",
    "Fixture-backed simulator states for documentation and implementation review.",
    `<p>This is not part of the normal bidding path. These cards are examples used to review auction states when the live chain does not naturally contain every case.</p>
    <ul>
      <li>They are not live names and do not appear in Explore.</li>
      <li>They let reviewers inspect states like unopened, live bidding, soft close, and settled without manufacturing each case by hand.</li>
    </ul>`
  )}
  <details class="detail-technical">
    <summary>Current website defaults</summary>
    <div class="detail-technical-body">
      <p class="field-note">These defaults are shown for review. Normal bidding should use the auction page and Sparrow PSBT flow.</p>
      <p id="auctionLabMeta" class="helper-text">Loading current auction defaults and flow examples.</p>
      <div id="auctionPolicySummary" class="guide-grid"></div>
    </div>
  </details>
  <div id="auctionLabList" class="activity-list"></div>`;

  if (!collapsible) {
    return `<section id="auction-lab" class="panel panel-list">${body}</section>`;
  }

  return `<details id="auction-lab" class="panel panel-list panel-collapsible">
    <summary class="panel-summary">
      <div class="panel-summary-copy">
        <h2>Auction State Gallery</h2>
        <p>Open only if you want fixture-backed simulator states for docs or implementation review.</p>
      </div>
      <span class="summary-chip">Open gallery</span>
    </summary>
    <div class="collapsible-panel-body">${body}</div>
  </details>`;
}

function renderExperimentalAuctionFeedSection(): string {
  return `<section id="experimental-auction-feed" class="panel panel-list">
    ${renderPanelHead(
      "Live Auction Activity",
      "Confirmed bid activity and current minimums from the resolver."
    )}
    <p id="experimentalAuctionMeta" class="helper-text">Loading observed bid activity.</p>
    <div id="experimentalAuctionList" class="activity-list"></div>
    ${renderLinkStrip("Reference", [
      { href: DOC_URLS.auctionSettlement, label: "Auction rules", external: true },
      { href: DOC_URLS.launchSpec, label: "Launch spec", external: true }
    ])}
  </section>`;
}

function renderAuctionLabNotesSection(collapsible = false): string {
  const body = `<div class="guide-grid">
      <article class="guide-card">
        <h3>Implemented</h3>
        <ul class="guide-list">
          <li>The current auction defaults, opening floors, soft close, and minimum increments are modeled here.</li>
          <li>Opening-bid packages that bind the name, bidder, owner key, bonded amount, and observed state.</li>
          <li>A stronger soft-close increment rule so bids that extend the clock must escalate more than normal mid-auction bids.</li>
          <li>Single-auction and market-level simulators with bidder budget pressure.</li>
          <li>CLI commands, fixture scenarios, and this website-facing auction state view.</li>
          <li>Sparrow PSBT handoffs directly from the auctions page, with CLI support kept for protocol experiments.</li>
          <li>Chain-derived auction state from confirmed bid transactions, including stale-state checks and derived bond spend/release summaries.</li>
          <li>Replacement-style rebids are now recognized only when the later bid spends the earlier bid bond.</li>
        </ul>
      </article>
      <article class="guide-card">
        <h3>Still In Progress</h3>
        <ul class="guide-list">
          <li>Settlement is implemented for the auction path, but final launch settlement rules are not frozen yet.</li>
          <li>The chain-derived feed is still a prototype view, not a mainnet launch commitment.</li>
          <li>The values here are working defaults, not yet locked protocol parameters.</li>
          <li>Advanced CLI support remains available for policy experiments; normal bid prep should stay on the website.</li>
        </ul>
      </article>
    </div>`;

  if (!collapsible) {
    return `<section class="panel panel-guide">
      ${renderPanelHead(
        "Launch Status",
        "What is already working here, what remains provisional, and which parts are still derived rather than final."
      )}
      ${body}
    </section>`;
  }

  return `<details class="panel panel-guide panel-collapsible">
    <summary class="panel-summary">
      <div class="panel-summary-copy">
        <h2>Launch Status</h2>
        <p>See what is already implemented, what is still provisional, and where auction settlement is still not final.</p>
      </div>
      <span class="summary-chip">Open summary</span>
    </summary>
    <div class="collapsible-panel-body">${body}</div>
  </details>`;
}

function renderHomeNeutralitySection(): string {
  return `<section id="neutral" class="panel panel-guide panel-home">
    ${renderPanelHead(
      "Neutral by design",
      "A name is a sovereign possession, not a subscription. Three properties make that true — and keep it true."
    )}
    <div class="path-grid">
      <article class="path-card">
        <p class="path-card-kicker">Self-custody</p>
        <h3>You hold the keys</h3>
        <p>Your owner key controls the name and signs every change. It is generated on your device and never leaves it. No one &mdash; not us, not an operator, not Apple &mdash; can move, rename, or seize your name. Only your key can.</p>
      </article>
      <article class="path-card">
        <p class="path-card-kicker">No gatekeeper</p>
        <h3>No registrar, token, or rent</h3>
        <p>There is no company that grants names and no token you must hold. A name opens at a flat ${escapeHtml("₿")}1,000 (~$1) claim; Bitcoin records who owns it. opennametags.org is just one optional window onto that &mdash; it can't approve, censor, or charge you.</p>
      </article>
      <article class="path-card">
        <p class="path-card-kicker">Frozen + auditable</p>
        <h3>Rules you can pin down</h3>
        <p>The protocol is a small, fixed consensus artifact — not a SaaS that changes under you. The rules are auditable, anyone can run a resolver or publisher, and you can verify every claim against Bitcoin yourself. You never have to trust us.</p>
      </article>
    </div>
  </section>`;
}

function renderHomeAppSection(configuredBasePath: string): string {
  return `<section id="app" class="panel panel-guide panel-home">
    ${renderPanelHead(
      "Use it from the app",
      "Day-to-day, ONT lives in the app: claim a name, set what it points to, set a recovery wallet, and bid — all signed on your device."
    )}
    <div class="guide-grid guide-grid-balanced">
      <article class="guide-card">
        <h3>Self-custodial by default</h3>
        <p>Owner + funding keys are generated and stored on-device (iOS Keychain), revealed only for your own backup. Every record is BIP340-signed locally; the app verifies inclusion proofs against Bitcoin before it trusts anything a server says.</p>
      </article>
      <article class="guide-card">
        <h3>On signet for testing</h3>
        <p>The app currently runs against a private signet so anyone can exercise the full lifecycle with no real funds. A TestFlight build for the signet test group is next; mainnet is a later, deliberate step.</p>
      </article>
    </div>
    ${renderLinkStrip("Prefer no install?", [
      { href: withBasePath("/values", configuredBasePath), label: "Use the browser tools" },
      { href: withBasePath("/explore", configuredBasePath), label: "Explore the registry" }
    ])}
  </section>`;
}

function renderHomeVerifySection(configuredBasePath: string): string {
  return `<section id="verify" class="panel panel-guide panel-home">
    ${renderPanelHead(
      "Verify it yourself, don't trust us",
      "Sovereignty means you can check everything without permission. Nothing here asks you to take our word for it."
    )}
    <div class="guide-grid guide-grid-balanced">
      <article class="guide-card">
        <h3>Check a name against Bitcoin</h3>
        <p>A resolver returns an inclusion proof for a name; you verify it against the anchored accumulator root, and check the owner's signature on the current record. The browser tools do this locally &mdash; no install, no account, no trust in this site.</p>
      </article>
      <article class="guide-card">
        <h3>Run your own</h3>
        <p>The resolver, publisher, and esplora shim are open and reproducible. Run your own and point the app or tools at it; the protocol doesn't depend on opennametags.org.</p>
      </article>
    </div>
    ${renderLinkStrip("Read the source", [
      { href: withBasePath("/values", configuredBasePath), label: "Browser tools" },
      { href: DOC_URLS.launchSpec, label: "Protocol spec", external: true },
      { href: DOC_URLS.readme, label: "Source + run your own", external: true }
    ])}
  </section>`;
}

function renderHomeModelSection(): string {
  return `<section id="how-ont-works" class="panel panel-guide">
    ${renderPanelHead(
      "How It Works",
      "Follow one name from a Bitcoin-secured claim to the destinations apps can use."
    )}
    <div class="protocol-flow" aria-label="ONT lifecycle for alice">
      <article class="protocol-flow-card protocol-flow-card-chain">
        <div class="protocol-flow-card-head">
          <p class="protocol-flow-number">01</p>
          <p class="protocol-flow-place">Bitcoin</p>
        </div>
        <h3>Claim It</h3>
        <p>Claim <span class="mono">alice</span> for a small fixed fee. If no one else wants it, it's simply yours; if it's contested, it escalates to a bonded auction. Either way Bitcoin records that an owner key controls it.</p>
        <div class="protocol-example" aria-label="Claim ownership example">
          <p><span>name</span><strong class="mono">alice</strong></p>
          <p><span>claim</span><strong>uncontested</strong></p>
          <p><span>owner</span><strong class="mono">8f3c...12ab</strong></p>
          <p><span>cost</span><strong>₿1,000 (~$1)</strong></p>
        </div>
      </article>
      <div class="protocol-flow-arrow" aria-hidden="true"></div>
      <article class="protocol-flow-card protocol-flow-card-record">
        <div class="protocol-flow-card-head">
          <p class="protocol-flow-number">02</p>
          <p class="protocol-flow-place">Resolver</p>
        </div>
        <h3>Publish Off-Chain</h3>
        <p>The owner signs the current destinations for <span class="mono">alice</span>. Resolvers store that signed record.</p>
        <div class="protocol-example protocol-example-destinations" aria-label="Destination examples">
          <p><span>btc</span><strong class="mono">bc1qxy...0wlh</strong></p>
          <p><span>lightning</span><strong class="mono">lno1q...9sa</strong></p>
          <p><span>email</span><strong class="mono">alice@example.com</strong></p>
          <p><span>website</span><strong class="mono">alice.example</strong></p>
        </div>
      </article>
      <div class="protocol-flow-arrow" aria-hidden="true"></div>
      <article class="protocol-flow-card protocol-flow-card-client">
        <div class="protocol-flow-card-head">
          <p class="protocol-flow-number">03</p>
          <p class="protocol-flow-place">Client</p>
        </div>
        <h3>Resolve And Verify</h3>
        <p>Clients check Bitcoin ownership, verify the owner signature, and use the destination type they understand.</p>
        <div class="protocol-result">
          <p class="mono">alice</p>
          <span>resolves to</span>
          <p class="mono">website -&gt; alice.example</p>
        </div>
      </article>
    </div>
  </section>`;
}

function renderExplainerJumpBar(_configuredBasePath: string): string {
  return `<nav class="jump-bar jump-bar-overview" aria-label="Overview sections">
    <span class="jump-bar-label">Overview sections</span>
    <a href="#how-ont-works">How it works</a>
    <a href="#one-name-many-destinations">One name, many destinations</a>
    <a href="#using-ont">Use the prototype</a>
    <a href="#reference-guides">Reference guides</a>
    <a href="#current-docs">Current status</a>
  </nav>`;
}

function renderHomeDestinationDiagramSection(): string {
  return `<section id="one-name-many-destinations" class="panel panel-guide">
    ${renderPanelHead(
      "One Name, Many Destinations",
      "The chain owns the name. The signed record says what it points to right now."
    )}
    <div class="destination-map" aria-label="How alice maps to destinations">
      <article class="destination-map-anchor">
        <p class="destination-map-kicker">Bitcoin anchor</p>
        <h3 class="mono">alice</h3>
        <p>Ownership and transfers stay public and auditable on Bitcoin.</p>
        <div class="destination-map-mini">
          <span>owner</span>
          <strong class="mono">8f3c...12ab</strong>
        </div>
      </article>
      <div class="destination-map-rail" aria-hidden="true"></div>
      <article class="destination-map-record">
        <div>
          <p class="destination-map-kicker">Resolver record</p>
          <h3>Latest owner-signed bundle</h3>
          <p>Resolvers keep the mutable destination layer off-chain. The current owner can update this bundle without putting every change on Bitcoin.</p>
        </div>
        <div class="destination-token-grid" aria-label="Example destinations for alice">
          ${renderDestinationToken("Bitcoin", "bc1qxy...0wlh")}
          ${renderDestinationToken("Lightning", "lno1q...9sa")}
          ${renderDestinationToken("Email", "alice@example.com")}
          ${renderDestinationToken("Phone", "+1 415 555 0123")}
          ${renderDestinationToken("Website", "alice.example")}
          ${renderDestinationToken("LinkedIn", "linkedin.com/in/alice")}
          ${renderDestinationToken("Signal", "alice_12")}
          ${renderDestinationToken("Cash App", "$alice1234")}
        </div>
      </article>
      <div class="destination-map-rail" aria-hidden="true"></div>
      <article class="destination-map-client">
        <p class="destination-map-kicker">Clients</p>
        <h3>Use what they understand</h3>
        <p>A wallet can use the Bitcoin or Lightning destination. A browser can use the website. A contact app can use email or phone.</p>
      </article>
    </div>
    <p class="tool-handoff-note">Small on-chain footprint, flexible off-chain records, and client-side verification of the latest owner-authorized data.</p>
  </section>`;
}

function renderDestinationToken(serviceName: string, serviceValue: string): string {
  return `<article class="destination-token">
    <p>${escapeHtml(serviceName)}</p>
    <strong class="mono">${escapeHtml(serviceValue)}</strong>
  </article>`;
}

function renderHomeDocsSection(): string {
  return `<section id="current-docs" class="panel panel-guide">
    ${renderPanelHead(
      "Current Status",
      "The hosted demo is real, but it is still a prototype. Use this page to separate what works now from what is still under active design."
    )}
    <div class="guide-grid guide-grid-balanced">
      <article class="guide-card">
        <h3>Works Today</h3>
        <ul class="guide-list">
          <li>Hosted signet setup and auction inspection</li>
          <li>Self-hosted website and resolver</li>
          <li>Browser destination publishing</li>
          <li>Sparrow PSBT handoffs and live auction smoke checks</li>
        </ul>
      </article>
      <article class="guide-card">
        <h3>Still Prototype</h3>
        <ul class="guide-list">
          <li>The cheap uncontested ₿1,000 (~$1) claim path is designed and measured, but not live here yet &mdash; claiming in this demo runs the bonded/contested path end-to-end.</li>
          <li>Transfers still rely on external signer and CLI steps.</li>
          <li>Resolver availability is only partly decentralized in v1.</li>
          <li>The universal-auction launch flow is implemented as a prototype and still not mainnet-ready.</li>
          <li>Mainnet-ready usage is not ready yet.</li>
        </ul>
      </article>
      <article class="guide-card guide-card-wide guide-card-links">
        <h3>Read Next</h3>
        <ul class="guide-list">
          <li><a class="detail-link" href="${DOC_URLS.fromZero}" target="_blank" rel="noreferrer noopener">ONT From Zero</a></li>
          <li><a class="detail-link" href="${DOC_URLS.implementation}" target="_blank" rel="noreferrer noopener">Implementation &amp; Validation</a></li>
          <li><a class="detail-link" href="${DOC_URLS.launchSpec}" target="_blank" rel="noreferrer noopener">Launch Spec v0</a></li>
        </ul>
        <div class="guide-card-actions">
          <a class="action-link secondary" href="${DOC_URLS.fromZero}" target="_blank" rel="noreferrer noopener">Read from zero</a>
          <a class="action-link secondary" href="${DOC_URLS.implementation}" target="_blank" rel="noreferrer noopener">Implementation</a>
          <a class="action-link secondary" href="${DOC_URLS.launchSpec}" target="_blank" rel="noreferrer noopener">Launch spec</a>
        </div>
      </article>
    </div>
  </section>`;
}

function renderUsingOntSection(configuredBasePath: string): string {
  return `<section id="using-ont" class="panel panel-guide">
    ${renderPanelHead(
      "Use The Website",
      "The common path is intentionally short: set up Sparrow, bid on a name, then inspect live ownership."
    )}
    <div class="guide-grid">
      <article class="guide-card">
        <h3>Setup</h3>
        <p>Connect Sparrow to the hosted demo wallet server and fund the wallet you will use for bids.</p>
      </article>
      <article class="guide-card">
        <h3>Claim</h3>
        <p>Check a name, prepare the unsigned PSBT, then review and sign it in Sparrow. A contested name settles by bonded auction.</p>
      </article>
      <article class="guide-card">
        <h3>Explore</h3>
        <p>Inspect only the names and activity currently visible to the resolver.</p>
      </article>
      <article class="guide-card">
        <h3>After You Own A Name</h3>
        <p>Use the detail page to update destinations or prepare a transfer. Those tools are secondary until a name exists.</p>
      </article>
    </div>
    <div class="hero-cta-row section-cta-row">
      <a class="action-link" href="${withBasePath("/setup", configuredBasePath)}">Start setup</a>
      <a class="action-link" href="${withBasePath("/auctions", configuredBasePath)}">Claim a name</a>
      <a class="action-link secondary" href="${withBasePath("/explore", configuredBasePath)}">Open explorer</a>
    </div>
  </section>`;
}

function renderFeatureReferenceSection(configuredBasePath: string): string {
  return `<section id="reference-guides" class="panel panel-guide">
    ${renderPanelHead(
      "Reference Guides",
      "Read these when you want the why, edge cases, or deeper review context behind a tool."
    )}
    <div class="guide-grid guide-grid-balanced">
      <article class="guide-card">
        <h3>Wallet Setup</h3>
        <p>Use the setup tool for the short path. Use the guide for Sparrow network details and wallet compatibility.</p>
        <div class="guide-card-actions">
          <a class="action-link secondary" href="${withBasePath("/setup", configuredBasePath)}">Open setup</a>
          <a class="action-link secondary" href="${DOC_URLS.sparrowPrivateSignet}" target="_blank" rel="noreferrer noopener">Setup guide</a>
        </div>
      </article>
      <article class="guide-card">
        <h3>Auctions</h3>
        <p>Use Auctions to build PSBTs. Use the guide for settlement, ownership, and launch-rule context.</p>
        <div class="guide-card-actions">
          <a class="action-link secondary" href="${withBasePath("/auctions", configuredBasePath)}">Open auctions</a>
          <a class="action-link secondary" href="${DOC_URLS.auctionSettlement}" target="_blank" rel="noreferrer noopener">Auction guide</a>
        </div>
      </article>
      <article class="guide-card">
        <h3>Destinations</h3>
        <p>Use the destinations tool to publish signed records. Use the guide for value-record history and format notes.</p>
        <div class="guide-card-actions">
          <a class="action-link secondary" href="${withBasePath("/values", configuredBasePath)}">Open destinations</a>
          <a class="action-link secondary" href="${DOC_URLS.destinations}" target="_blank" rel="noreferrer noopener">Destination guide</a>
        </div>
      </article>
      <article class="guide-card">
        <h3>Transfers</h3>
        <p>Use Transfer for the current handoff prep. Use the guide for relay limits and safer redesign options.</p>
        <div class="guide-card-actions">
          <a class="action-link secondary" href="${withBasePath("/transfer", configuredBasePath)}">Open transfer</a>
          <a class="action-link secondary" href="${DOC_URLS.transfer}" target="_blank" rel="noreferrer noopener">Transfer guide</a>
        </div>
      </article>
      <article class="guide-card guide-card-wide">
        <h3>Recovery Kits</h3>
        <p>Auction bids create separate name-control recovery material. Read this before reviewing owner-key recovery behavior.</p>
        <div class="guide-card-actions">
          <a class="action-link secondary" href="${DOC_URLS.recovery}" target="_blank" rel="noreferrer noopener">Recovery guide</a>
          <a class="action-link secondary" href="${DOC_URLS.newUser}" target="_blank" rel="noreferrer noopener">Testing guide</a>
        </div>
      </article>
    </div>
  </section>`;
}

function renderOverviewSection(collapsible = false): string {
  const body = `<div class="stats-grid">
      <article class="stat-card">
        <span class="stat-label">Tracked Names</span>
        <strong id="trackedNames">0</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">Settling</span>
        <strong id="immatureNames">0</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">Active</span>
        <strong id="matureNames">0</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">Released</span>
        <strong id="invalidNames">0</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">Current Height</span>
        <strong id="currentHeight">-</strong>
      </article>
    </div>`;

  if (!collapsible) {
    return `<section id="overview" class="panel panel-overview">
    ${renderPanelHead(
      "Live Snapshot",
      "Quick snapshot of the currently visible namespace.",
      `<p>Current tracked names and chain height.</p>
      <ul>
        <li><strong>Tracked Names</strong> are names the resolver currently recognizes.</li>
        <li><strong>Current Height</strong> tells you which block the snapshot is based on.</li>
      </ul>`
    )}
    ${body}
  </section>`;
  }

  return `<details id="overview" class="panel panel-overview panel-collapsible">
    <summary class="panel-summary">
      <div class="panel-summary-copy">
        <h2>Live Snapshot</h2>
        <p>Quick snapshot of the currently visible namespace.</p>
      </div>
      <span class="summary-chip">Open stats</span>
    </summary>
    <div class="collapsible-panel-body">${body}</div>
  </details>`;
}

function renderActivitySection(collapsible = false): string {
  const body = `<div id="activityFilters" class="filter-bar" role="toolbar" aria-label="Recent activity filters"></div>
    <div id="activityHighlights" class="guide-grid"></div>
    <div id="activityState" class="list-status">Loading recent activity...</div>
    <div id="activityList" class="activity-list"></div>`;

  if (!collapsible) {
    return `<section id="activity" class="panel panel-activity">
    ${renderPanelHead(
      "Recent Changes",
      "Latest changes, with the most interesting items surfaced first.",
      `<p>Lifecycle transitions across auctions, transfers, destination updates, bond breaks, and releases.</p>
      <ul>
        <li>Auction bids and settlements</li>
        <li>Transfers between owners</li>
        <li>Destination publications</li>
        <li>Bond breaks and releases when bond continuity fails</li>
      </ul>`
    )}
    ${body}
  </section>`;
  }

  return `<details id="activity" class="panel panel-activity panel-collapsible">
    <summary class="panel-summary">
      <div class="panel-summary-copy">
        <h2>Recent Changes</h2>
        <p>Latest lifecycle changes and notable events in the namespace.</p>
      </div>
      <span class="summary-chip">Open activity</span>
    </summary>
    <div class="collapsible-panel-body">${body}</div>
  </details>`;
}

function renderRecentNamesSection(): string {
  return `<section id="recent-names" class="panel panel-list">
    ${renderPanelHead(
      "Recent Names",
      "Most recently recorded names, ordered by the latest visible state change.",
      `<p>Quick view of the newest names and state changes.</p>
      <ul>
        <li><strong>Owned</strong> means the name currently has a valid owner.</li>
        <li><strong>Transferred</strong> means ownership moved after acquisition.</li>
        <li><strong>Invalidated</strong> means the name later failed continuity.</li>
      </ul>`
    )}
    <div id="recentNamesState" class="list-status">Loading recent names...</div>
    <div id="recentNamesList" class="recent-names-list"></div>
  </section>`;
}

function renderPrivateAuctionSmokeSection(collapsible = false): string {
  const body = `<p id="privateAuctionSmokeMeta" class="helper-text">Checking the latest private signet auction smoke run.</p>
    <div id="privateAuctionSmokeResult" class="result-card empty">Loading the latest private signet auction smoke status...</div>`;

  if (!collapsible) {
    return `<section class="panel panel-live-smoke">
    ${renderPanelHead(
      "Auction Demo Check",
      "Latest status from the hosted private-signet auction walkthrough.",
      `<p>This is the current live-chain proof for the auction slice.</p>
      <ul>
        <li>It starts from a dedicated prototype entry, then opens the auction with a real bonded bid.</li>
        <li>It submits an opening bid, then a higher bid, settles the auction into a live owned name, publishes winner destinations, and later transfers that name after the winner bond matures.</li>
        <li>It still spends the losing bond early to prove the chain-derived feed flags that violation.</li>
        <li>The resulting website feed shows accepted bid history, settlement state, post-settlement handoff, and bond-break consequences.</li>
      </ul>`
    )}
    ${body}
  </section>`;
  }

  return `<details class="panel panel-live-smoke panel-collapsible">
    <summary class="panel-summary">
      <div class="panel-summary-copy">
        <h2>Auction Demo Check</h2>
        <p>Latest status from the hosted private-signet auction walkthrough: bidding, settlement, winner handoff, and bond-break checks.</p>
      </div>
      <span class="summary-chip">Open demo check</span>
    </summary>
    <div class="collapsible-panel-body">${body}</div>
  </details>`;
}

function renderSetupQuickstartSection(configuredBasePath: string, privateSignetElectrumEndpoint: string | null): string {
  const endpoint = parseElectrumEndpoint(privateSignetElectrumEndpoint ?? "opennametags.org:50001:t");
  const transportNote = endpoint.transport === "s" ? "SSL on" : "SSL off";
  return `<section id="setup-start" class="panel panel-guide">
    ${renderPanelHead(
      "Wallet Setup",
      "Connect Sparrow to the hosted demo endpoint, fund that wallet, then use it for auction signing."
    )}
    <p class="tool-handoff-note">Private signet only. Use demo coins, not real bitcoin.</p>
    <div class="guide-grid guide-grid-steps">
      <article class="guide-card">
        <h3>1. Open Sparrow</h3>
        <ul class="guide-list">
          <li>If Sparrow is already open, quit it fully.</li>
          <li>Run <code>open /Applications/Sparrow.app --args -n signet</code>.</li>
          <li>Create or open the wallet you will use for bids.</li>
        </ul>
      </article>
      <article class="guide-card">
        <h3>2. Connect Endpoint</h3>
        <ul class="guide-list">
          <li>Go to <code>Settings</code> then <code>Server</code>.</li>
          <li>Choose <code>Private Electrum</code>.</li>
          <li>Use <code>${escapeHtml(endpoint.serverString)}</code>.</li>
        </ul>
        <p class="field-note">Separate fields: host <code>${escapeHtml(endpoint.host)}</code>, port <code>${escapeHtml(endpoint.port)}</code>, ${escapeHtml(transportNote)}.</p>
      </article>
      <article class="guide-card">
        <h3>3. Fund Wallet</h3>
        <ul class="guide-list">
          <li>Copy a fresh receive address from Sparrow.</li>
          <li>Paste it into the funding tool below.</li>
          <li>Refresh Sparrow, then open Auctions.</li>
        </ul>
      </article>
    </div>
    ${renderLinkStrip("Reference", [
      { href: DOC_URLS.sparrowPrivateSignet, label: "Sparrow guide", external: true },
      { href: DOC_URLS.newUser, label: "Testing guide", external: true }
    ])}
    <div class="hero-cta-row section-cta-row">
      <a class="action-link" href="${withBasePath("/auctions", configuredBasePath)}">Open auctions</a>
      <a class="action-link secondary" href="https://sparrowwallet.com/download/" target="_blank" rel="noreferrer">Download Sparrow</a>
    </div>
  </section>`;
}

function renderSetupFundingSection(privateSignetFundingAmountSats: bigint, privateSignetFundingMaxSats: bigint): string {
  return `<section id="setup-funding" class="panel panel-guide">
    ${renderPanelHead(
      "Fund Wallet",
      "Paste a Sparrow receive address and request demo bitcoin for auction testing."
    )}
    <p class="tool-handoff-note">Default: ${formatBitcoinDisplay(privateSignetFundingAmountSats)}. Max per request: ${formatBitcoinDisplay(privateSignetFundingMaxSats)}. The faucet mines one block after funding.</p>
    <form id="privateFundingForm" class="tool-draft-form">
      <div class="draft-grid">
        <label class="draft-field">
          <span class="field-label">Sparrow Receive Address</span>
          <input
            id="privateFundingAddressInput"
            name="fundingAddress"
            type="text"
            placeholder="Paste a signet receive address from Sparrow"
            autocomplete="off"
          />
          <span class="field-hint">Use an address from the same wallet you plan to spend from for demo auction transactions. If Sparrow cannot see the funds afterward, check that Server Type is Private Electrum and not Public Server.</span>
        </label>
        <label class="draft-field">
          <span class="field-label">Amount</span>
          <input
            id="privateFundingAmountInput"
            name="fundingAmount"
            type="text"
            inputmode="decimal"
            value="${escapeHtml(formatBtcDecimal(privateSignetFundingAmountSats))}"
            placeholder="0.1"
            autocomplete="off"
          />
          <span class="field-hint">BTC amount on the private demo chain. For a ${formatBitcoinDisplay(6_250_000n)} bid, request at least 0.063 BTC to leave room for fees.</span>
        </label>
      </div>
      <div class="draft-actions">
        <button type="submit">Fund this wallet</button>
      </div>
    </form>
    <div id="privateFundingResult" class="result-card empty">
      Paste a Sparrow receive address above to get demo coins on this private signet network.
    </div>
  </section>`;
}

function formatBitcoinDisplay(value: bigint | string | number): string {
  const sats = BigInt(value);
  return `₿${formatBtcDecimal(sats)}`;
}

function formatBtcDecimal(sats: bigint): string {
  const whole = sats / 100_000_000n;
  const fractional = (sats % 100_000_000n).toString().padStart(8, "0").replace(/0+$/g, "");
  return fractional === "" ? whole.toString() : `${whole}.${fractional}`;
}

function renderSetupSupportStrip(configuredBasePath: string): string {
  return `<section id="setup-support" class="panel panel-support-strip">
    ${renderLinkStrip("Related tools", [
      { href: withBasePath("/auctions", configuredBasePath), label: "Open auctions" },
      { href: withBasePath("/explainer", configuredBasePath), label: "Open overview" },
      { href: withBasePath("/explore", configuredBasePath), label: "Open explorer" }
    ])}
  </section>`;
}

function renderValuesToolSection(): string {
  return `<section id="value-publish" class="panel panel-compose panel-compose-minimal">
    <div class="claim-flow value-flow">
      <details id="value-step-inspect" class="claim-flow-step wizard-step" open>
        <summary class="wizard-step-summary">
              <div class="wizard-step-heading">
                <span class="claim-step-badge">Step 1</span>
                <div class="wizard-step-copy">
                  <h3>Load The Name</h3>
                  <p>Start with the owned name you control. The site will load its current owner and any destinations already published.</p>
                </div>
              </div>
              <span id="valueStepInspectState" class="summary-chip wizard-step-state">Start here</span>
        </summary>
        <div class="wizard-step-body">
          <div class="value-intake-grid">
            <form id="valueLookupForm" class="tool-draft-form">
              <div class="draft-grid">
                <label class="draft-field">
                  <span class="field-label">Name</span>
                  <input id="valueNameInput" name="valueName" type="text" maxlength="32" placeholder="alice" autocomplete="off" />
                  <span class="field-hint">Use a name that is already owned and visible in the explorer.</span>
                </label>
              </div>
              <div class="draft-actions">
                <button id="valueInspectButton" type="submit">Load name</button>
              </div>
            </form>
            <article class="guide-card value-intake-callout">
              <h3>What You Need</h3>
              <ul class="guide-list">
                <li>The owner private key saved for this name.</li>
                <li>The destinations you want apps to use now.</li>
                <li>The resolver receives the signed update, not your private key.</li>
              </ul>
            </article>
          </div>
          <div id="valueLookupResult" class="result-card empty">
            Enter an owned name to load its current owner and destinations.
          </div>
        </div>
      </details>
      <details id="value-step-sign" class="claim-flow-step wizard-step">
        <summary class="wizard-step-summary">
              <div class="wizard-step-heading">
                <span class="claim-step-badge">Step 2</span>
                <div class="wizard-step-copy">
                  <h3>Edit Destinations And Sign</h3>
                  <p>Paste the owner private key, update the destination list, and sign the change locally.</p>
                </div>
              </div>
              <span id="valueStepSignState" class="summary-chip wizard-step-state">After step 1</span>
            </summary>
            <div class="wizard-step-body">
          <p class="field-note">Use the owner key for this name. This is the control key you saved when you won the auction or received the name, not the Sparrow funding wallet key unless you intentionally made them the same.</p>
          <form id="valueSignForm" class="tool-draft-form">
            <div class="draft-grid">
              <label class="draft-field">
                <span class="field-label">Owner Private Key</span>
                <input
                  id="valueOwnerPrivateKeyInput"
                  name="valueOwnerPrivateKey"
                  type="password"
                  maxlength="64"
                  placeholder="Paste the 32-byte private key saved for this name"
                  autocomplete="off"
                  spellcheck="false"
                />
                <span id="valueOwnerMatchNote" class="field-hint">After you load a name, this key will be checked against the current owner.</span>
              </label>
              <input id="valueOwnerPubkeyPreview" name="valueOwnerPubkeyPreview" type="hidden" />
              <input id="valueSequenceInput" name="valueSequence" type="hidden" value="1" />
              <input id="valueTypeInput" name="valueType" type="hidden" value="255:bundle" />
              <span id="valueSequenceHint" class="field-hint" hidden>Load the current name first to confirm the next sequence.</span>
              <label id="valuePayloadField" class="draft-field draft-field-full" hidden>
                <span class="field-label">Payload</span>
                <textarea
                  id="valuePayloadInput"
                  name="valuePayload"
                  placeholder="https://example.com"
                  spellcheck="false"
                ></textarea>
                <span id="valuePayloadHint" class="field-hint">Website and payment targets are encoded as normal text. For raw or app-defined binary data, use the CLI.</span>
              </label>
              <div id="valueBundleEditor" class="value-bundle-editor draft-field-full">
                <div class="value-bundle-editor-head">
                  <h4>Destinations</h4>
                  <p>Add the places this name should point right now. Apps can use the entries they understand.</p>
                </div>
                <div id="valueBundleRows" class="value-bundle-rows"></div>
                <div class="draft-actions">
                  <button id="addValueBundleEntryButton" type="button" class="secondary-button">Add Destination</button>
                </div>
                <span class="field-hint">Examples: <span class="mono">btc -&gt; bc1qxy...0wlh</span>, <span class="mono">lightning -&gt; lno1q...9sa</span>, <span class="mono">email -&gt; alice@example.com</span>, <span class="mono">website -&gt; alice.example</span>, <span class="mono">cashapp -&gt; $alice1234</span>.</span>
              </div>
            </div>
            <div class="draft-actions claim-step-actions">
              <button id="valueSignButton" type="submit">Sign Destination Update</button>
              <button id="downloadSignedValueButton" type="button" class="secondary-button" disabled>Download Signed Update (.json)</button>
            </div>
          </form>
          <div id="valueSignResult" class="result-card empty">
            Load an owned name, then sign the destination update locally in this browser.
          </div>
        </div>
      </details>
      <details id="value-step-publish" class="claim-flow-step claim-flow-step-emphasis wizard-step">
        <summary class="wizard-step-summary">
              <div class="wizard-step-heading">
                <span class="claim-step-badge">Step 3</span>
                <div class="wizard-step-copy">
                  <h3>Publish The Update</h3>
                  <p>Send the signed update to the resolver. Ownership stays on-chain; the resolver stores the latest owner-authorized destinations.</p>
                </div>
              </div>
              <span id="valueStepPublishState" class="summary-chip wizard-step-state">After step 2</span>
            </summary>
            <div class="wizard-step-body">
          <p id="valuePublishModeNote" class="field-note">Publishing sends only the signed JSON update. The owner private key never leaves the page.</p>
          <div class="draft-actions claim-step-actions">
            <button id="publishValueButton" type="button" disabled>Publish Destinations</button>
          </div>
          <div id="valuePublishResult" class="result-card empty">
            Sign the update first. Then this step will publish it to the resolver and reload the current destinations.
          </div>
        </div>
      </details>
    </div>
  </section>`;
}

function renderValuesSupportStrip(configuredBasePath: string): string {
  return `<section id="values-support" class="panel panel-support-strip">
    ${renderLinkStrip("Related tools", [
      { href: withBasePath("/auctions", configuredBasePath), label: "Open auctions" },
      { href: withBasePath("/transfer", configuredBasePath), label: "Transfer a name" },
      { href: withBasePath("/explore", configuredBasePath), label: "Open explorer" },
      { href: withBasePath("/explainer", configuredBasePath), label: "Open overview" }
    ])}
    ${renderLinkStrip("Reference", [
      { href: DOC_URLS.destinations, label: "Destination guide", external: true },
      { href: DOC_URLS.fromZero, label: "ONT from zero", external: true }
    ])}
  </section>`;
}

function renderWalletCompatibilityFaqSection(configuredBasePath: string, collapsible = true): string {
  const body = `<div class="guide-grid">
      <article class="guide-card">
        <h3>Do I have to use Sparrow?</h3>
        <p>No, but the hosted private demo is only fully supported and tested end to end with Sparrow right now.</p>
      </article>
      <article class="guide-card">
        <h3>Does Electrum work?</h3>
        <p>Not for this hosted private demo. The official Electrum app reaches the endpoint, but then rejects the chain because this small private signet sits below Electrum’s built-in public signet checkpoint height. Sparrow is still the supported path.</p>
      </article>
      <article class="guide-card">
        <h3>Why do I need the hosted demo endpoint?</h3>
        <p>The hosted demo runs on a private signet chain, not mainnet or shared public signet. Use the endpoint shown above so Sparrow follows the same demo chain as the website.</p>
      </article>
      <article class="guide-card">
        <h3>What about other wallets later?</h3>
        <p>Broader wallet support should still get easier over time, but the website path is intentionally narrowed to Sparrow today. If you want a custom signer workflow, use the CLI and docs.</p>
      </article>
    </div>`;

  if (!collapsible) {
    return `<section id="wallet-compatibility" class="panel panel-guide">
      ${renderPanelHead(
        "Wallet Compatibility",
        "Sparrow is the supported path today. Official Electrum still does not work against this hosted private signet."
      )}
      ${body}
    </section>`;
  }

  return `<details id="wallet-compatibility" class="panel panel-guide panel-collapsible">
    <summary class="panel-summary">
      <div class="panel-summary-copy">
        <h2>Wallet Compatibility</h2>
        <p>Sparrow is the supported path today. Official Electrum still does not work against this hosted private signet.</p>
      </div>
      <span class="summary-chip">FAQ</span>
    </summary>
    <div class="collapsible-panel-body">${body}</div>
  </details>`;
}

function parseElectrumEndpoint(endpoint: string): { host: string, port: string, serverString: string, transport: string } {
  const trimmed = endpoint.trim();
  const hostPortModeMatch = /^(.*):([0-9]+):([a-z])$/i.exec(trimmed);
  if (hostPortModeMatch) {
    const [, host = trimmed, port = "50001", transport = "t"] = hostPortModeMatch;
    return {
      host,
      port,
      transport: transport.toLowerCase(),
      serverString: trimmed
    };
  }

  const tcpMatch = /^tcp:\/\/([^:]+):([0-9]+)$/i.exec(trimmed);
  if (tcpMatch) {
    const [, host = trimmed, port = "50001"] = tcpMatch;
    return {
      host,
      port,
      transport: "t",
      serverString: trimmed
    };
  }

  const sslMatch = /^ssl:\/\/([^:]+):([0-9]+)$/i.exec(trimmed);
  if (sslMatch) {
    const [, host = trimmed, port = "50001"] = sslMatch;
    return {
      host,
      port,
      transport: "s",
      serverString: trimmed
    };
  }

  return {
    host: trimmed,
    port: "50001",
    transport: "t",
    serverString: trimmed
  };
}

function renderTransferPrepSection(): string {
  return `<section id="transfer-prep" class="panel panel-compose panel-compose-minimal">
    ${renderPanelHead(
      "Prepare Handoff",
      "Create the recipient key, choose gift or sale, then download the review package."
    )}
    <div class="transfer-role-workflow transfer-role-workflow-simple">
      <section class="transfer-role-panel transfer-role-panel-receiver">
        <p class="support-strip-label">Receiver</p>
        <div class="result-title">
          <h3>Create Recipient Key</h3>
          <span class="status-pill transfer">new owner</span>
        </div>
        <p class="field-value">Create the key for the next owner. Share only the pubkey.</p>
        <div class="field-actions">
          <button id="generateTransferOwnerKeyLocalButton" type="button">Create Recipient Key</button>
        </div>
        <div id="transferRecipientKeyResult" class="result-card empty">
          No recipient key yet. Create one here, save the private key, then share only the pubkey.
        </div>
      </section>
      <section class="transfer-role-panel transfer-role-panel-sender">
        <p class="support-strip-label">Current owner</p>
        <div class="result-title">
          <h3>Prepare Transfer</h3>
          <span class="status-pill transfer">sender</span>
        </div>
        <p class="field-value">Paste the recipient pubkey and name. The site checks live state and prepares the handoff.</p>
        <form id="transferDraftForm" class="tool-draft-form">
          <div class="draft-grid draft-grid-transfer">
            <label class="draft-field">
              <span class="field-label">Name</span>
              <input id="transferNameInput" name="transferName" type="text" maxlength="32" placeholder="alice" autocomplete="off" />
            </label>
            <label class="draft-field">
              <span class="field-label">Transfer Type</span>
              <select id="transferModeInput" name="transferMode">
                <option value="gift" selected>Gift / no embedded payment</option>
                <option value="sale">Sale / seller gets paid</option>
              </select>
              <span class="field-hint">Choose sale when payment should settle with the ownership change.</span>
            </label>
            <label class="draft-field">
              <span class="field-label">Recipient Pubkey</span>
              <input
                id="transferNewOwnerPubkeyInput"
                name="transferNewOwnerPubkey"
                type="text"
                maxlength="64"
                placeholder="32-byte x-only pubkey in hex"
                autocomplete="off"
              />
              <span class="field-hint">This becomes the new owner key for the name.</span>
            </label>
            <label class="draft-field">
              <span class="field-label">Seller Payout Address</span>
              <input
                id="transferSellerPayoutAddressInput"
                name="transferSellerPayoutAddress"
                type="text"
                placeholder="Required for sale; leave blank for gift"
                autocomplete="off"
              />
              <span class="field-hint">For sale transfers, this is where the seller receives payment.</span>
            </label>
          </div>
          <input id="transferBondAddressInput" name="transferBondAddress" type="hidden" value="" />
          <div class="draft-actions">
            <button type="submit">Prepare Transfer</button>
          </div>
        </form>
      </section>
    </div>
    <div id="transferDraftResult" class="result-card empty transfer-primary-result">
      Enter an owned name and the recipient pubkey. The result will show the current state, bond handling, and next step.
    </div>
    <div class="transfer-primary-actions">
      <button id="downloadTransferPackageButton" type="button" disabled>Download Transfer Handoff</button>
    </div>
    <details class="detail-technical transfer-advanced-tools">
      <summary>Advanced package review and role exports</summary>
      <div class="detail-technical-body">
        <p class="field-note">Use these exports when both sides need to review the same handoff before building the final transaction outside the website.</p>
        <div class="transfer-export-grid">
          <article class="guide-card transfer-export-card">
            <h3>Current Owner Export</h3>
            <p>Checks recipient details, payout expectations, and the recommended transfer mode.</p>
            <div class="transfer-export-actions">
              <button id="downloadTransferSellerPackageButton" type="button" disabled>Download Owner Package</button>
              <button id="downloadTransferSellerNotesButton" type="button" class="secondary-button" disabled>Download Owner Notes</button>
            </div>
          </article>
          <article class="guide-card transfer-export-card">
            <h3>Receiver Export</h3>
            <p>Checks the recipient pubkey, sale path, and transaction details before signing or funding anything.</p>
            <div class="transfer-export-actions">
              <button id="downloadTransferBuyerPackageButton" type="button" disabled>Download Receiver Package</button>
              <button id="downloadTransferBuyerNotesButton" type="button" class="secondary-button" disabled>Download Receiver Notes</button>
            </div>
          </article>
        </div>
        <section class="transfer-package-review-tool">
          <div class="transfer-package-review-head">
            <p class="support-strip-label">Check a package someone sent you</p>
            <h3>Review Transfer Package</h3>
            <p>Upload or paste a package and choose your role. The page will show the checks that matter for that side of the handoff.</p>
          </div>
          <div class="draft-grid">
            <label class="draft-field">
              <span class="field-label">Reviewing As</span>
              <select id="transferReviewRoleInput" name="transferReviewRole">
                <option value="buyer" selected>Receiver</option>
                <option value="seller">Current owner</option>
              </select>
            </label>
            <label class="draft-field">
              <span class="field-label">Package File</span>
              <input id="transferReviewFileInput" name="transferReviewFile" type="file" accept="application/json,.json" />
            </label>
            <label class="draft-field draft-field-full">
              <span class="field-label">Package JSON</span>
              <textarea
                id="transferReviewPackageInput"
                name="transferReviewPackage"
                placeholder="Paste transfer package JSON here"
                spellcheck="false"
              ></textarea>
            </label>
            <div class="draft-actions claim-step-actions">
              <button id="reviewTransferPackageButton" type="button">Review Package</button>
            </div>
          </div>
        </section>
        <div id="transferPackageReviewResult" class="result-card empty">
          Paste or upload a transfer package JSON file to review it.
        </div>
      </div>
    </details>
  </section>`;
}

function renderTransferSupportStrip(configuredBasePath: string): string {
  return `<section id="transfer-support" class="panel panel-support-strip">
    ${renderLinkStrip("Related tools", [
      { href: withBasePath("/auctions", configuredBasePath), label: "Open auctions" },
      { href: withBasePath("/values", configuredBasePath), label: "Update destinations" },
      { href: withBasePath("/explore", configuredBasePath), label: "Open explorer" },
      { href: withBasePath("/explainer", configuredBasePath), label: "Open overview" }
    ])}
    ${renderLinkStrip("Reference", [
      { href: DOC_URLS.transfer, label: "Transfer guide", external: true },
      { href: DOC_URLS.launchSpec, label: "Launch spec", external: true }
    ])}
  </section>`;
}

function renderSiteFooter(configuredBasePath: string): string {
  return `<footer class="site-footer">
    <div class="site-footer-brand">
      <p class="site-footer-kicker">${escapeHtml(PRODUCT_NAME)}</p>
      <p class="site-footer-copy">Names you can actually own: Bitcoin-anchored ownership, off-chain signed records, and bonded public auctions.</p>
    </div>
    <div class="site-footer-grid">
      <section class="site-footer-group">
        <h2>Learn</h2>
        <div class="site-footer-links">
          <a href="${withBasePath("/explainer", configuredBasePath)}">Overview</a>
          <a href="${DOC_URLS.newUser}" target="_blank" rel="noreferrer noopener">Testing Guide</a>
          <a href="${DOC_URLS.sparrowPrivateSignet}" target="_blank" rel="noreferrer noopener">Setup Guide</a>
          <a href="${DOC_URLS.fromZero}" target="_blank" rel="noreferrer noopener">From Zero</a>
        </div>
      </section>
      <section class="site-footer-group">
        <h2>Use</h2>
        <div class="site-footer-links">
          <a href="${withBasePath("/setup", configuredBasePath)}">Setup</a>
          <a href="${withBasePath("/auctions", configuredBasePath)}">Auctions</a>
          <a href="${withBasePath("/explore", configuredBasePath)}">Explore</a>
        </div>
      </section>
      <section class="site-footer-group">
        <h2>Manage</h2>
        <div class="site-footer-links">
          <a href="${withBasePath("/values", configuredBasePath)}">Destinations</a>
          <a href="${withBasePath("/transfer", configuredBasePath)}">Transfer</a>
          <a href="${withBasePath("/advanced", configuredBasePath)}">Advanced</a>
          <a href="${GITHUB_REPO_URL}" target="_blank" rel="noreferrer noopener">GitHub</a>
        </div>
      </section>
    </div>
  </footer>`;
}

function renderLinkStrip(
  label: string,
  links: Array<{ href: string, label: string, external?: boolean }>
): string {
  return `<div class="link-strip">
    <p class="link-strip-label">${escapeHtml(label)}</p>
    <div class="link-strip-actions">
      ${links
        .map((link) => {
          const rel = link.external ? ' target="_blank" rel="noreferrer noopener"' : "";
          return `<a class="link-chip" href="${escapeHtml(link.href)}"${rel}>${escapeHtml(link.label)}</a>`;
        })
        .join("")}
    </div>
  </div>`;
}

function renderNetworkDetailsSection(collapsible: boolean): string {
  const body = `<div class="result-grid">
      <div class="result-item">
        <label>Network</label>
        <p id="networkLabel" class="field-value">Loading...</p>
      </div>
      <div class="result-item">
        <label>Resolver Mode</label>
        <p id="syncMode" class="field-value">Loading...</p>
      </div>
      <div class="result-item">
        <label>Source</label>
        <p id="networkSource" class="field-value">-</p>
      </div>
      <div class="result-item">
        <label>Chain</label>
        <p id="networkChain" class="field-value">-</p>
      </div>
      <div class="result-item">
        <label>Resolver Target</label>
        <p id="networkResolver" class="field-value">Connecting to resolver</p>
      </div>
      <div class="result-item">
        <label>Current Block Hash</label>
        <strong id="currentBlockHash" class="hash-value">-</strong>
      </div>
    </div>`;

  if (!collapsible) {
    return `<section id="network-details" class="panel panel-network">
      ${renderPanelHead("Network Details", "Network, chain source, and resolver target.", `<p>The current resolver snapshot, chain source, and active network.</p>`)}
      ${body}
    </section>`;
  }

  return `<details id="network-details" class="panel panel-network panel-collapsible">
    <summary class="panel-summary">
      <div class="panel-summary-copy">
        <h2>Network Details</h2>
        <p>Resolver mode, chain source, and other lower-level debugging information for people who want it.</p>
      </div>
      <span class="summary-chip">Technical info</span>
    </summary>
    <div class="collapsible-panel-body">${body}</div>
  </details>`;
}

function renderNamesSection(collapsible = false): string {
  const body = `<div id="namesFilters" class="filter-bar" role="toolbar" aria-label="Registry name filters"></div>
    <div id="namesState" class="list-status">Loading tracked names...</div>
    <div id="namesList" class="names-list"></div>`;

  if (!collapsible) {
    return `<section id="claimed" class="panel panel-list">
    ${renderPanelHead(
      "All Names",
      "Grouped by lifecycle state for faster browsing.",
      `<p>Names are grouped so you can focus on what is interesting first.</p>
      <ul>
        <li><strong>Auctioning</strong> names are still in market discovery.</li>
        <li><strong>Settling</strong> names are still bond-sensitive.</li>
        <li><strong>Active</strong> names are settled.</li>
        <li><strong>Released</strong> names lost continuity and should be treated as historical first.</li>
      </ul>`
    )}
    ${body}
  </section>`;
  }

  return `<details id="claimed" class="panel panel-list panel-collapsible">
    <summary class="panel-summary">
      <div class="panel-summary-copy">
        <h2>All Names</h2>
        <p>Grouped by lifecycle state for deeper browsing.</p>
      </div>
      <span class="summary-chip">Open registry</span>
    </summary>
    <div class="collapsible-panel-body">${body}</div>
  </details>`;
}

function withBasePath(pathname: string, basePath: string): string {
  if (!basePath || basePath === "/") {
    return pathname;
  }

  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return normalizedPath === "/" ? basePath : `${basePath}${normalizedPath}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
