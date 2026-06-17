import { describe, expect, it } from "vitest";

import { renderClientScript } from "../src/client-script";

describe("renderClientScript", () => {
  it("emits syntactically valid browser javascript", () => {
    const script = renderClientScript("");

    expect(script).toContain('elements.searchForm?.addEventListener("submit"');
    expect(script).toContain('window.addEventListener("popstate"');
    expect(() => new Function(script)).not.toThrow();
  });

  it("carries searched names into the auction page route", () => {
    const script = renderClientScript("");

    expect(script).toContain("const initialAuctionName = getInitialAuctionName();");
    expect(script).toContain("isAuctionsPage() && initialAuctionName");
    expect(script).toContain("function getInitialAuctionName()");
    expect(script).toContain("return getInitialNameQueryParam();");
    expect(script).toContain('baseAuctionsPath + "?name=" + encodeURIComponent(normalizedName)');
    expect(script).toContain("updateAuctionHistory(name)");
    expect(script).toContain('href="${escapeHtml(buildAuctionsPath(name))}">Claim ${escapeHtml(name)}</a>');
    expect(script).toContain('href="#experimental-auction-feed">View live auction activity</a>');
    expect(script).toContain('source: "opening"');
    expect(script).toContain("findVisibleLiveAuctionForName");
    expect(script).toContain("renderAuctionSearchResultForLiveAuction");
    expect(script).toContain("The bid form below is prefilled from the live auction state");
  });

  it("includes private signet auction smoke status handling", () => {
    const script = renderClientScript("");

    expect(script).toContain('/api/private-auction-smoke-status');
    expect(script).toContain("privateAuctionSmokeStatus");
    expect(script).toContain("renderPrivateAuctionSmokeStatus");
    expect(script).toContain("Opening Bid Txid");
    expect(script).toContain("Higher Bid Txid");
    expect(script).not.toContain("Late Bid Txid");
    expect(script).not.toContain("Late Bid Outcome");
    expect(script).toContain("Winner handoff");
    expect(script).toContain("Workflow proved");
    expect(script).toContain("Winner destination sequence");
    expect(script).toContain("Winner bond maturity spend");
    expect(script).toContain("Post-maturity transfer Txid");
    expect(script).toContain("Transferred owner");
    expect(script).toContain("Transferred destination sequence");
    expect(script).toContain("Open settled name");
    expect(script).toContain("renderPrivateAuctionWorkflowSummary");
    expect(script).toContain("renderPrivateAuctionWinnerHandoffCopy");
    expect(script).toContain("Open private auctions");
    expect(script).toContain("getPrivateDemoBasePath");
  });

  it("includes explicit cooperative sale-transfer guidance", () => {
    const script = renderClientScript("");

    expect(script).toContain("atomic_same_transaction_for_sale");
    expect(script).toContain("coordinated_cli_handoff_pending_two_party_psbt_flow");
    expect(script).toContain("Do not split payment and transfer into separate promises.");
    expect(script).toContain("Do not pay in one transaction and trust a later transfer promise.");
    expect(script).toContain("Advanced note: this page prepares a coordinated handoff; the full two-party PSBT wizard is still a next step.");
    expect(script).toContain("Enter a seller payout address for a sale transfer, or switch Transfer Type to gift.");
    expect(script).toContain("Clear the seller payout address for a gift transfer, or switch Transfer Type to sale.");
    expect(script).toContain("Sale was selected, so payment and ownership should settle in the same Bitcoin transaction.");
    expect(script).toContain("Gift was selected, so this prepares an ownership handoff without embedding a buyer payment.");
    expect(script).toContain("Creating a recipient key in this browser...");
    expect(script).toContain("buildSellerTransferNotesText");
    expect(script).toContain("buildBuyerTransferNotesText");
    expect(script).toContain("buildSellerTransferPackage");
    expect(script).toContain("buildBuyerTransferPackage");
    expect(script).toContain("Recipient Key Created");
    expect(script).toContain("data-download-transfer-generated-owner-key");
    expect(script).toContain("data-use-transfer-generated-owner-key");
    expect(script).toContain("Current owner");
    expect(script).toContain("Receiver");
    expect(script).toContain("parseTransferPackageForReview");
    expect(script).toContain("renderTransferPackageReview");
    expect(script).toContain("buildTransferPackageReviewChecklist");
    expect(script).toContain("reviewTransferPackageButton");
    expect(script).toContain("return \"gift\";");
  });

  it("includes browser-local key generation without a server-side owner key helper", () => {
    const script = renderClientScript("");

    expect(script).toContain('KEY_TOOLS_MODULE_PATH');
    expect(script).toContain('import(KEY_TOOLS_MODULE_PATH)');
    expect(script).toContain("generateLocalBrowserOwnerKey");
    expect(script).not.toContain("generateHostedDemoOwnerKey");
    expect(script).toContain("Creating a recipient key in this browser...");
    expect(script).toContain("Creating the ONT recovery kit in this browser for this bid...");
    expect(script).toContain("sourceLabel: \"local browser\"");
    expect(script).not.toContain("sourceLabel: \"hosted demo\"");
    expect(script).not.toContain("claimDraft");
  });

  it("shows a clear empty-state when the resolver is empty", () => {
    const script = renderClientScript("");

    expect(script).toContain("renderExploreEmptyState");
    expect(script).toContain("renderExploreResolverEmptyCard");
    expect(script).toContain("exploreEmptyStateMessage");
    expect(script).toContain("visibleAuctions.length > 0");
    expect(script).toContain("resolverHasVisibleState");
    expect(script).toContain("Demo resolver waiting for reseed");
    expect(script).toContain("Registry Waiting For Seed Data");
    expect(script).toContain("canonical demo seed or a fresh auction walkthrough");
    expect(script).toContain("Resolver reachable · waiting for a new demo reseed.");
  });

  it("includes auction lab handling", () => {
    const script = renderClientScript("");

    expect(script).toContain('/api/auctions');
    expect(script).toContain('/api/experimental-auctions');
    expect(script).not.toContain('/api/auction-bid-package');
    expect(script).toContain('AUCTION_TOOLS_MODULE_PATH');
    expect(script).toContain('loadAuctionTools');
    expect(script).toContain('buildOpeningAuctionBidPackage');
    expect(script).toContain('buildLiveAuctionBidPackage');
    expect(script).toContain('buildBrowserAuctionBidArtifacts');
    expect(script).not.toContain('/api/auction-opening-bid-package');
    expect(script).not.toContain('/api/experimental-auction-bid-package');
    expect(script).not.toContain('/api/auction-bid-artifacts');
    expect(script).toContain("reloadAuctionLab");
    expect(script).not.toContain("getAuctionLabPolicyOverridesFromLocation");
    expect(script).toContain("renderAuctionLab");
    expect(script).toContain("renderExperimentalAuctionFeed");
    expect(script).toContain("renderAuctionPolicySummary");
    expect(script).toContain("renderExperimentalAuctionCard");
    expect(script).toContain("Simulator state");
    expect(script).toContain("documentation and review only");
    expect(script).toContain("not live auctions");
    expect(script).toContain("Bid with Sparrow");
    expect(script).toContain("Bid Progress");
    expect(script).toContain("Prepare wallet");
    expect(script).toContain("Save owner key");
    expect(script).toContain("updateAuctionBidFlowTimeline");
    expect(script).toContain("Advanced bid package details");
    expect(script).toContain("Preview package JSON");
    expect(script).toContain("Download package JSON");
    expect(script).toContain("Bidder label");
    expect(script).toContain("Optional demo label used to derive the bidder commitment.");
    expect(script).toContain("Owner pubkey");
    expect(script).toContain("Leave blank to let the website create a browser-local owner key.");
    expect(script).toContain("renderAuctionBidPackagePreview");
    expect(script).toContain("renderAuctionBidArtifactsPreview");
    expect(script).toContain("Build Sparrow PSBT");
    expect(script).toContain("Download Sparrow PSBT");
    expect(script).not.toContain("Download Sparrow PSBT + Backup Key");
    expect(script).toContain("Funded Sparrow output");
    expect(script).toContain("Previous bid output");
    expect(script).toContain("data-auction-rebid-output");
    expect(script).toContain("optionally your previous bid output for a rebid");
    expect(script).toContain("data-auction-funding-output");
    expect(script).toContain("Selected input total");
    expect(script).toContain("Default return address");
    expect(script).toContain("Read from the selected Sparrow output");
    expect(script).toContain("Read from your selected Sparrow output, not an ONT server wallet address.");
    expect(script).toContain("Verify they are addresses from your own wallet.");
    expect(script).toContain("Sign only if those addresses are yours.");
    expect(script).toContain("Paste a funded Sparrow output first.");
    expect(script).not.toContain("Funded Sparrow coin");
    expect(script).toContain("Create, download, and confirm the ONT recovery kit before building the bid transaction.");
    expect(script).toContain("Confirm the ONT recovery kit before building the bid transaction.");
    expect(script).toContain("Download debug artifacts");
    expect(script).not.toContain("Master fingerprint");
    expect(script).not.toContain("Account xpub");
    expect(script).not.toContain("Account path");
    expect(script).toContain("downloadBase64File");
    expect(script).toContain('"application/octet-stream"');
    expect(script).toContain("deriveAddressFromFundingInputDescriptor");
    expect(script).toContain("deriveDefaultReturnAddressFromFundingInputs");
    expect(script).toContain("Leave blank for the hosted demo to reuse the funded coin address.");
    expect(script).toContain("Sparrow PSBT ready. After downloading, use Sparrow File -> Open Transaction");
    expect(script).toContain("Open In Sparrow");
    expect(script).toContain("Select the downloaded .psbt file.");
    expect(script).toContain("data-auction-artifacts-action");
    expect(script).toContain("buildAuctionBidArtifactsForUi");
    expect(script).toContain("buildAuctionBidPackageForUi");
    expect(script).toContain("resolver-derived state");
    expect(script).toContain("formatAuctionBondStatus");
    expect(script).toContain("formatAuctionBondSpendStatus");
    expect(script).toContain("renderAuctionBidPackageComposer");
    expect(script).toContain("data-auction-package-preview");
    expect(script).toContain("data-auction-owner-key-action");
    expect(script).toContain("data-auction-owner-key-result");
    expect(script).toContain("setAuctionBidPackageMessage");
    expect(script).toContain("setAuctionOwnerKeyHelperMessage");
    expect(script).toContain("renderAuctionOwnerKeyHelper");
    expect(script).toContain("Download ONT recovery kit");
    expect(script).toContain("Confirm recovery kit");
    expect(script).toContain("data-auction-owner-key-file");
    expect(script).toContain("data-auction-owner-key-confirm-pubkey");
    expect(script).toContain("parseGeneratedOwnerKeyBackupText");
    expect(script).toContain("updateAuctionPsbtActionState");
    expect(script).toContain("Creating the ONT recovery kit in this browser for this bid...");
    expect(script).not.toContain("Requesting the ONT recovery kit from the demo server for this bid...");
    expect(script).toContain("Create recovery kit now");
    expect(script).not.toContain("Use demo server recovery kit");
    expect(script).not.toContain("We found a funded Sparrow output from your earlier step.");
    expect(script).toContain("In Sparrow, open the UTXOs tab and copy the Output value");
    expect(script).toContain("We found your selected Sparrow output on the demo chain.");
    expect(script).not.toContain("Closed without winner");
    expect(script).toContain("Base floor");
    expect(script).toContain("Bid with Sparrow");
    expect(script).toContain("Late-bid step");
    expect(script).toContain("Next valid bid (extends close)");
    expect(script).toContain("Counted / not counted");
    expect(script).toContain("Bid history interpreted by ONT");
    expect(script).toContain("Each row is the ONT resolver interpretation of confirmed chain data");
    expect(script).toContain("The highest-after field shows the auction ladder after each observed attempt.");
    expect(script).toContain("This late bid cleared the stronger soft-close increment");
    expect(script).toContain("Not counted: stale auction state");
    expect(script).toContain("Built from old auction state");
    expect(script).toContain("This bid was built from an older auction state.");
    expect(script).toContain("Not counted by auction");
    expect(script).not.toContain("Accepted capital locked");
    expect(script).toContain("State fingerprint");
    expect(script).toContain("Bond spend");
    expect(script).toContain("After Settlement");
    expect(script).toContain("Open live name detail page");
    expect(script).toContain("Publish or update destinations");
    expect(script).toContain("Prepare transfer (bond maturity active)");
    expect(script).toContain("renderSettledAuctionHandoff");
    expect(script).toContain("isAuctionsPage");
  });
});
