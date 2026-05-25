import { describe, expect, it } from "vitest";

import { renderPageHtml } from "../src/page-shell";

const baseOptions = {
  basePath: "",
  faviconDataUrl: "data:image/svg+xml;base64,AA==",
  includePrivateAuctionSmoke: true,
  networkLabel: "private signet",
  privateSignetElectrumEndpoint: "opennametags.org:50001:t",
  privateSignetFundingAmountSats: 50_000n,
  privateSignetFundingEnabled: true
} as const;

describe("renderPageHtml", () => {
  it("keeps the homepage focused on the core framing and next paths", () => {
    const html = renderPageHtml({
      ...baseOptions,
      pageKind: "home"
    });

    expect(html).toContain("Human-readable names you can actually own");
    expect(html).toContain("Claim a name, set what it points to, and prove you own it");
    expect(html).toContain("ONT tools");
    expect(html).toContain(">Claim<");
    expect(html).toContain(">Own<");
    expect(html).toContain(">Resolve<");
    expect(html).toContain("Check a name");
    expect(html).toContain("See whether it is claimable or already owned, and the next step either way.");
    expect(html).toContain("Claim the name");
    expect(html).toContain("Update or transfer");
    expect(html).toContain("Choose A Workflow");
    expect(html).toContain("Set Up Signing");
    expect(html).toContain("Claim A Name");
    expect(html).toContain("Inspect Live State");
    expect(html).toContain("Update A Name");
    expect(html).toContain("From Zero");
    expect(html).toContain("site-footer");
    expect(html).toContain(">Learn<");
    expect(html).toContain(">Use<");
    expect(html).not.toContain("Offline architect");
    expect(html).toContain("Manage");
    expect(html).not.toContain("More links");
    expect(html).not.toContain("Anchored To Bitcoin");
    expect(html).not.toContain("Bonded, Not Rented");
    expect(html).not.toContain("Costly To Hoard");
    expect(html).not.toContain("Maps To Destinations");
    expect(html).not.toContain("Two ideas shape ONT.");
    expect(html).not.toContain("Eligible names use one auction lane.");
    expect(html).not.toContain("One Name, Many Destinations");
    expect(html).not.toContain("Any valid name can be opened by a bonded public bid.");
    expect(html).not.toContain("Small Bitcoin footprint");
    expect(html).not.toContain("Resolvers store the current owner-signed bundle for <span class=\"mono\">alice</span>");
    expect(html).not.toContain("Current Status");
  });

  it("keeps explore focused on the current private-signet demo surfaces", () => {
    const html = renderPageHtml({
      ...baseOptions,
      pageKind: "explore"
    });

    expect(html).toContain("explore-cluster");
    expect(html).toContain("explore-empty-state");
    expect(html).toContain("No Live State Yet");
    expect(html).toContain("Live Auction Activity");
    expect(html).toContain("experimentalAuctionList");
    expect(html).not.toContain("Legacy Public Signet Smoke");
  });

  it("adds the overview nav entry and keeps overview as the main explanatory page", () => {
    const html = renderPageHtml({
      ...baseOptions,
      pageKind: "explainer"
    });

    expect(html).toContain(">Overview<");
    expect(html).toContain('href="#how-ont-works"');
    expect(html).toContain("Overview sections");
    expect(html).toContain("How it works");
    expect(html).toContain("How It Works");
    expect(html).toContain("Follow one name from a Bitcoin-secured claim to the destinations apps can use.");
    expect(html).toContain("protocol-flow");
    expect(html).toContain("Claim It");
    expect(html).toContain("Claim <span class=\"mono\">alice</span> for a small fixed fee");
    expect(html).toContain("₿1,000 (~$1)");
    expect(html).toContain("Publish Off-Chain");
    expect(html).toContain("Resolvers store that signed record.");
    expect(html).toContain("<strong class=\"mono\">bc1qxy...0wlh</strong>");
    expect(html).toContain("<strong class=\"mono\">alice@example.com</strong>");
    expect(html).toContain("Resolve And Verify");
    expect(html).toContain("website -&gt; alice.example");
    expect(html).toContain("One Name, Many Destinations");
    expect(html).toContain("The chain owns the name. The signed record says what it points to right now.");
    expect(html).toContain("destination-map");
    expect(html).toContain("Bitcoin anchor");
    expect(html).toContain("Latest owner-signed bundle");
    expect(html).toContain("bc1qxy...0wlh");
    expect(html).toContain("Small on-chain footprint, flexible off-chain records");
    expect(html).not.toContain("For example, an on-chain claim can establish:");
    expect(html).not.toContain("One owner-signed bundle can carry entries like:");
    expect(html).toContain("Use The Website");
    expect(html).toContain("Reference Guides");
    expect(html).toContain("Wallet Setup");
    expect(html).toContain("Auction guide");
    expect(html).toContain("Destination guide");
    expect(html).toContain("Transfer guide");
    expect(html).toContain("Recovery Kits");
    expect(html).toContain("Current Status");
    expect(html).toContain("Works Today");
    expect(html).toContain("Read Next");
    expect(html).toContain("Read from zero");
    expect(html).toContain("Launch Spec v0");
    expect(html).not.toContain("What ONT Is");
  });

  it("renders the advanced page as the hub for expert surfaces", () => {
    const html = renderPageHtml({
      ...baseOptions,
      pageKind: "advanced"
    });

    expect(html).toContain("Advanced Tools");
    expect(html).toContain("When To Use This Area");
    expect(html).toContain("Most People Can Ignore This");
    expect(html).toContain("Open auctions");
    expect(html).toContain("Testing guide");
    expect(html).toContain("Launch spec");
    expect(html).toContain(">Advanced<");
    expect(html).toContain("Auction State Gallery");
    expect(html).toContain("Fixture-backed simulator states for documentation and implementation review.");
    expect(html).toContain("Launch Status");
    expect(html).not.toContain("policy controls");
  });

  it("renders the auctions page", () => {
    const html = renderPageHtml({
      ...baseOptions,
      pageKind: "auctions"
    });

    expect(html).toContain("Claim A Name");
    expect(html).toContain(">Claim<");
    expect(html).toContain(">Advanced<");
    expect(html).toContain("claimable or already in a live contest");
    expect(html).toContain("Check name");
    expect(html).toContain("Live Auction Activity");
    expect(html).toContain("Check a name, build the unsigned Sparrow PSBT");
    expect(html).toContain("so claiming here builds an opening bid");
    expect(html).toContain("Website builds; Sparrow signs and broadcasts.");
    expect(html).toContain("experimentalAuctionList");
    expect(html).not.toContain("Auction State Gallery");
    expect(html).not.toContain("Auction Examples");
    expect(html).not.toContain("auctionLabList");
    expect(html).not.toContain("privateAuctionSmokeResult");
    expect(html).not.toContain("Launch Status");
    expect(html).not.toContain("no-winner close");
    expect(html).not.toContain("single-lane launch model");
    expect(html).toContain("Confirmed bid activity and current minimums from the resolver.");
    expect(html).toContain("Auction rules");
    expect(html).not.toContain("AUCTION_BID");
  });

  it("renders the simplified values page", () => {
    const html = renderPageHtml({
      ...baseOptions,
      pageKind: "values"
    });

    expect(html).toContain("value-intake-grid");
    expect(html).toContain("What You Need");
    expect(html).toContain("Update A Name's Destinations");
    expect(html).toContain("Edit Destinations And Sign");
    expect(html).toContain("Sign Destination Update");
    expect(html).toContain("Publish Destinations");
    expect(html).toContain("valuePublishModeNote");
    expect(html).not.toContain("publishValueFanoutButton");
    expect(html).toContain("cashapp -&gt; $alice1234");
    expect(html).not.toContain("Value Format");
    expect(html).not.toContain("Derived Owner Pubkey");
    expect(html).not.toContain("Owner Private Key (32-byte hex)");
    expect(html).not.toContain("How Destination Updates Work");
    expect(html).toContain("Destination guide");
    expect(html).toContain("Related tools");
  });

  it("renders the transfer page with atomic sale framing", () => {
    const html = renderPageHtml({
      ...baseOptions,
      pageKind: "transfer"
    });

    expect(html).toContain("transfer-role-workflow");
    expect(html).toContain("transfer-package-review-tool");
    expect(html).toContain("Transfer Handoff");
    expect(html).toContain("Prepare the current advanced handoff");
    expect(html).toContain("Prepare Handoff");
    expect(html).toContain("Create the recipient key, choose gift or sale");
    expect(html).toContain("Create Recipient Key");
    expect(html).toContain("Transfer Type");
    expect(html).toContain("Gift / no embedded payment");
    expect(html).toContain("Sale / seller gets paid");
    expect(html).toContain("Recipient Pubkey");
    expect(html).toContain("Seller Payout Address");
    expect(html).toContain("Required for sale; leave blank for gift");
    expect(html).toContain("Download Transfer Handoff");
    expect(html).not.toContain("Use Demo Key From Server");
    expect(html).not.toContain("Start With Your Role");
    expect(html).not.toContain("Build The Transfer Handoff");
    expect(html).toContain("Advanced package review and role exports");
    expect(html).toContain("Download Owner Package");
    expect(html).toContain("Download Receiver Package");
    expect(html).not.toContain("Download Shared Package");
    expect(html).toContain("Download Owner Notes");
    expect(html).toContain("Download Receiver Notes");
    expect(html).not.toContain("Shared Transfer Plan");
    expect(html).toContain("Review Transfer Package");
    expect(html).toContain("Package JSON");
    expect(html).toContain("Review Package");
    expect(html).toContain("transferPackageReviewResult");
    expect(html).not.toContain("How Transfers Work");
    expect(html).toContain("Transfer guide");
    expect(html).toContain("Related tools");
  });

});
