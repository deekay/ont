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
    expect(html).toContain("Open an auction when a name is eligible.");
    expect(html).toContain("Public auctions");
    expect(html).toContain("Self-custodied bond");
    expect(html).toContain("Owner-signed destinations");
    expect(html).toContain("Check a name");
    expect(html).toContain("Resolve ownership or see whether the next step is the auction flow.");
    expect(html).toContain("Before a bid");
    expect(html).toContain("Eligible or not eligible");
    expect(html).toContain("After a bonded opening bid");
    expect(html).toContain("Auction clock starts");
    expect(html).toContain("The website prepares the bid; Sparrow signs the transaction.");
    expect(html).toContain("Start Here");
    expect(html).toContain("Set Up Sparrow");
    expect(html).toContain("Bid On A Name");
    expect(html).toContain("Inspect Live Names");
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
    expect(html).toContain("Follow one name from Bitcoin ownership to the destinations apps can use.");
    expect(html).toContain("protocol-flow");
    expect(html).toContain("Win At Auction");
    expect(html).toContain("Bitcoin establishes that <span class=\"mono\">alice</span> is controlled by an owner key");
    expect(html).toContain("₿0.0005");
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

    expect(html).toContain("Auctions");
    expect(html).toContain(">Auctions<");
    expect(html).toContain(">Advanced<");
    expect(html).toContain("Bid On A Name");
    expect(html).toContain("Check name");
    expect(html).toContain("Live Auction Activity");
    expect(html).toContain("Check a name, prepare the Sparrow transaction");
    expect(html).toContain("The website builds the unsigned PSBT");
    expect(html).toContain("experimentalAuctionList");
    expect(html).not.toContain("Auction State Gallery");
    expect(html).not.toContain("Auction Examples");
    expect(html).not.toContain("auctionLabList");
    expect(html).not.toContain("privateAuctionSmokeResult");
    expect(html).not.toContain("Launch Status");
    expect(html).toContain("valid bonded bid opens the auction");
    expect(html).not.toContain("no-winner close");
    expect(html).not.toContain("single-lane launch model");
    expect(html).toContain("Late bids can extend the close");
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
    expect(html).toContain("Use the CLI for raw payloads, custom formats, or multi-resolver fanout.");
    expect(html).toContain("cashapp -&gt; $alice1234");
    expect(html).not.toContain("Value Format");
    expect(html).not.toContain("Derived Owner Pubkey");
    expect(html).not.toContain("Owner Private Key (32-byte hex)");
    expect(html).toContain("Find A Live Name First");
    expect(html).toContain("Related tools");
  });

  it("renders the transfer page with atomic sale framing", () => {
    const html = renderPageHtml({
      ...baseOptions,
      pageKind: "transfer"
    });

    expect(html).toContain("transfer-role-workflow");
    expect(html).toContain("transfer-package-review-tool");
    expect(html).toContain("Transfer A Name");
    expect(html).toContain("Move a name to a new owner key.");
    expect(html).toContain("Final transfer signing is still an advanced step.");
    expect(html).toContain("Prepare Transfer");
    expect(html).toContain("Choose whether this is a gift or a sale first.");
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
    expect(html).toContain("Related tools");
  });

});
