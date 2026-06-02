import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import {
  createAuctionBidPackage,
  parseAuctionBidPackage,
  parseTransferPackage,
  PRODUCT_NAME,
  PROTOCOL_NAME
} from "@ont/protocol";

import {
  buildAuctionBidArtifacts,
  buildImmatureSaleTransferArtifacts,
  buildSaleTransferArtifacts,
  buildTransferArtifacts,
  maybeWriteJsonFile,
  parseFundingInputDescriptor,
  type OntCliNetwork,
  type WalletDerivationDescriptor
} from "./builder.js";
import {
  parseLaunchAuctionMarketScenario,
  parseSponsoredFlatIssuanceScenario,
  serializeLaunchAuctionMarketSimulationResult,
  serializeSponsoredFlatIssuanceSimulationResult,
  simulateLaunchAuctionMarket,
  simulateSponsoredFlatIssuance,
  createDefaultLaunchAuctionPolicy,
  parseLaunchAuctionPolicy,
  parseLaunchAuctionScenario,
  serializeLaunchAuctionPolicy,
  serializeLaunchAuctionSimulationResult,
  simulateLaunchAuction,
  simulateLaunchAuctionStateAtBlock,
  verifyProofBundle,
  type SerializedLaunchAuctionPolicy
} from "@ont/core";
import {
  broadcastSignedArtifacts,
  checkEsploraAddress,
  checkEsploraConnection,
  checkRpcConnection,
  parseSignedArtifactsFile,
  resolveEsploraConfig,
  resolveRemoteChainTarget,
  resolveRpcConfig
} from "./rpc-actions.js";
import {
  fetchNameActivity,
  fetchNameRecoveryDescriptor,
  fetchNameRecoveryDescriptorHistory,
  fetchRecentActivity,
  fetchNameRecord,
  fetchNameValueHistoryFromResolvers,
  fetchNameValueHistory,
  fetchTransactionProvenance,
  fetchNameValueRecord,
  resolveResolverUrls,
  ResolverHttpError
} from "./resolver-actions.js";
import { generateLiveAccount } from "./keygen.js";
import { parseBuiltArtifactsEnvelope, signArtifacts } from "./signer.js";
import { submitImmatureSaleTransfer } from "./submit-immature-sale-transfer.js";
import { submitSaleTransfer } from "./submit-sale-transfer.js";
import { submitTransfer } from "./submit-transfer.js";
import { parseTransferInspectionRole, renderTransferPackageInspectionReport } from "./transfer-package-review.js";
import {
  createSignedValueRecord,
  loadSignedValueRecord,
  publishValueRecord,
  publishValueRecordToResolvers
} from "./value-records.js";
import {
  createRecoveryWalletProofEnvelope,
  createRecoveryWalletProofMessageForDescriptor,
  createSignedRecoveryDescriptor,
  loadRecoveryWalletProof,
  loadSignedRecoveryDescriptor,
  publishRecoveryDescriptor,
  publishRecoveryWalletProof,
  verifyRecoveryWalletProofEnvelope
} from "./recovery-descriptors.js";

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case undefined:
      printUsage();
      return;
    case "inspect-auction-bid-package":
      await inspectAuctionBidPackage(args[0]);
      return;
    case "inspect-transfer-package":
      await inspectTransferPackage(args);
      return;
    case "generate-live-account":
      await generateLiveAccountCommand(args);
      return;
    case "build-auction-bid-artifacts":
      await buildAuctionBidArtifactsCommand(args);
      return;
    case "print-auction-policy":
      await printLaunchAuctionPolicyCommand(args);
      return;
    case "simulate-auction":
      await simulateLaunchAuctionCommand(args);
      return;
    case "simulate-auction-market":
      await simulateLaunchAuctionMarketCommand(args);
      return;
    case "simulate-sponsored-issuance":
      await simulateSponsoredFlatIssuanceCommand(args);
      return;
    case "inspect-proof-bundle":
      await inspectProofBundleCommand(args);
      return;
    case "create-auction-bid-package":
      await createAuctionBidPackageCommand(args);
      return;
    case "build-transfer-artifacts":
      await buildTransferArtifactsCommand(args);
      return;
    case "build-immature-sale-transfer-artifacts":
      await buildImmatureSaleTransferArtifactsCommand(args);
      return;
    case "build-sale-transfer-artifacts":
      await buildSaleTransferArtifactsCommand(args);
      return;
    case "sign-artifacts":
      await signArtifactsCommand(args);
      return;
    case "broadcast-transaction":
      await broadcastTransactionCommand(args);
      return;
    case "check-rpc":
      await checkRpcCommand(args);
      return;
    case "check-esplora":
      await checkEsploraCommand(args);
      return;
    case "check-address":
      await checkAddressCommand(args);
      return;
    case "submit-transfer":
      await submitTransferCommand(args);
      return;
    case "submit-immature-sale-transfer":
      await submitImmatureSaleTransferCommand(args);
      return;
    case "submit-sale-transfer":
      await submitSaleTransferCommand(args);
      return;
    case "sign-value-record":
      await signValueRecordCommand(args);
      return;
    case "publish-value-record":
      await publishValueRecordCommand(args);
      return;
    case "sign-recovery-descriptor":
      await signRecoveryDescriptorCommand(args);
      return;
    case "publish-recovery-descriptor":
      await publishRecoveryDescriptorCommand(args);
      return;
    case "publish-recovery-wallet-proof":
      await publishRecoveryWalletProofCommand(args);
      return;
    case "print-recovery-wallet-proof-message":
      await printRecoveryWalletProofMessageCommand(args);
      return;
    case "build-recovery-wallet-proof":
      await buildRecoveryWalletProofCommand(args);
      return;
    case "verify-recovery-wallet-proof":
      await verifyRecoveryWalletProofCommand(args);
      return;
    case "get-name":
      await getNameCommand(args);
      return;
    case "get-name-activity":
      await getNameActivityCommand(args);
      return;
    case "get-value":
      await getValueCommand(args);
      return;
    case "get-value-history":
      await getValueHistoryCommand(args);
      return;
    case "get-recovery-descriptor":
      await getRecoveryDescriptorCommand(args);
      return;
    case "get-recovery-descriptor-history":
      await getRecoveryDescriptorHistoryCommand(args);
      return;
    case "list-activity":
      await listActivityCommand(args);
      return;
    case "get-tx":
      await getTxCommand(args);
      return;
    default:
      console.error(`Unknown ${PRODUCT_NAME} CLI command: ${command}`);
      console.error("");
      printUsage();
      process.exitCode = 1;
  }
}

async function inspectAuctionBidPackage(filePath: string | undefined): Promise<void> {
  if (!filePath) {
    throw new Error("inspect-auction-bid-package requires a path to an auction bid package JSON file");
  }

  const resolvedPath = resolve(process.cwd(), filePath);
  const raw = await readFile(resolvedPath, "utf8");
  const parsed = parseAuctionBidPackage(JSON.parse(raw));

  console.log(`${PRODUCT_NAME} auction bid package is valid.`);
  console.log(`File: ${resolvedPath}`);
  console.log(`Exported: ${parsed.exportedAt}`);
  console.log("");
  console.log(`Auction: ${parsed.auctionId}`);
  console.log(`Name: ${parsed.name}`);
  console.log(`Path: contested auction`);
  console.log(`Observed phase: ${parsed.phase}`);
  console.log(`Observed block: ${parsed.currentBlockHeight}`);
  console.log(`Eligible to open at block: ${parsed.unlockBlock}`);
  console.log(`Close after: ${parsed.auctionCloseBlockAfter ?? "(not started yet)"}`);
  console.log(`Settlement lock: ${parsed.settlementLockBlocks.toLocaleString("en-US")} blocks`);
  console.log("");
  console.log(`Opening minimum: ${formatSats(parsed.openingMinimumBidSats)}`);
  console.log(`Current leader: ${parsed.currentLeaderBidderId ?? "None yet"}`);
  console.log(`Current highest: ${parsed.currentHighestBidSats ? formatSats(parsed.currentHighestBidSats) : "None yet"}`);
  console.log(`Current required minimum: ${parsed.currentRequiredMinimumBidSats ? formatSats(parsed.currentRequiredMinimumBidSats) : "Auction settled"}`);
  console.log("");
  console.log(`Bidder: ${parsed.bidderId}`);
  console.log(`Bid amount: ${formatSats(parsed.bidAmountSats)}`);
  console.log(`Preview: ${parsed.previewStatus}`);
  console.log(`Would become leader: ${parsed.wouldBecomeLeader ? "yes" : "no"}`);
  console.log(`Would extend soft close: ${parsed.wouldExtendSoftClose ? "yes" : "no"}`);
  console.log(parsed.previewSummary);
  console.log("");
  console.log(
    "If this bidder already has a standing bid for the same name, the replacement bid should spend the prior bid bond outpoint as one of the funding inputs."
  );
}

async function inspectTransferPackage(args: readonly string[]): Promise<void> {
  const parsedArgs = parseOptions(args);
  const filePath = parsedArgs.positionals[0];
  if (!filePath) {
    throw new Error("inspect-transfer-package requires a path to a transfer package JSON file");
  }

  const role = parseTransferInspectionRole(parsedArgs.options.get("role"));
  const resolvedPath = resolve(process.cwd(), filePath);
  const raw = await readFile(resolvedPath, "utf8");
  const parsed = parseTransferPackage(JSON.parse(raw));
  console.log(
    renderTransferPackageInspectionReport({
      filePath: resolvedPath,
      pkg: parsed,
      role,
      productName: PRODUCT_NAME
    })
  );
}

async function printLaunchAuctionPolicyCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const serializedPolicy = serializeLaunchAuctionPolicy(createDefaultLaunchAuctionPolicy());

  await maybeWriteJsonFile(parsed.options.get("write"), serializedPolicy);
  console.log(JSON.stringify(serializedPolicy, null, 2));
}

async function simulateLaunchAuctionCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const scenarioPath = parsed.positionals[0];

  if (!scenarioPath) {
    throw new Error("simulate-auction requires a path to an auction scenario JSON file");
  }

  const scenario = parseLaunchAuctionScenario(
    extractLaunchAuctionScenarioInput(await loadJsonFile(scenarioPath))
  );
  const serializedPolicy = parsed.options.has("policy")
    ? await loadLaunchAuctionPolicy(parsed.options.get("policy"))
    : serializeLaunchAuctionPolicy(createDefaultLaunchAuctionPolicy());
  const policy = parseLaunchAuctionPolicy(serializedPolicy);
  const result = simulateLaunchAuction({
    policy,
    scenario
  });
  const serializedResult = serializeLaunchAuctionSimulationResult(result);

  await maybeWriteJsonFile(parsed.options.get("write"), serializedResult);
  console.log(JSON.stringify(serializedResult, null, 2));
}

async function simulateLaunchAuctionMarketCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const scenarioPath = parsed.positionals[0];

  if (!scenarioPath) {
    throw new Error("simulate-auction-market requires a path to an auction market scenario JSON file");
  }

  const scenario = parseLaunchAuctionMarketScenario(
    extractLaunchAuctionScenarioInput(await loadJsonFile(scenarioPath))
  );
  const serializedPolicy = parsed.options.has("policy")
    ? await loadLaunchAuctionPolicy(parsed.options.get("policy"))
    : serializeLaunchAuctionPolicy(createDefaultLaunchAuctionPolicy());
  const policy = parseLaunchAuctionPolicy(serializedPolicy);
  const result = simulateLaunchAuctionMarket({
    policy,
    scenario
  });
  const serializedResult = serializeLaunchAuctionMarketSimulationResult(result);

  await maybeWriteJsonFile(parsed.options.get("write"), serializedResult);
  console.log(JSON.stringify(serializedResult, null, 2));
}

async function simulateSponsoredFlatIssuanceCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const scenarioPath = parsed.positionals[0];

  if (!scenarioPath) {
    throw new Error("simulate-sponsored-issuance requires a path to a sponsored issuance scenario JSON file");
  }

  const scenario = parseSponsoredFlatIssuanceScenario(
    extractLaunchAuctionScenarioInput(await loadJsonFile(scenarioPath))
  );
  const result = simulateSponsoredFlatIssuance(scenario);
  const serializedResult = serializeSponsoredFlatIssuanceSimulationResult(result);

  await maybeWriteJsonFile(parsed.options.get("write"), serializedResult);
  console.log(JSON.stringify(serializedResult, null, 2));
}

async function inspectProofBundleCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const bundlePath = parsed.positionals[0];

  if (!bundlePath) {
    throw new Error("inspect-proof-bundle requires a path to a proof bundle JSON file");
  }

  const report = verifyProofBundle(await loadJsonFile(bundlePath));
  const failedChecks = report.checks.filter((check) => check.status === "failed");

  console.log(report.summary);
  console.log(`Source: ${report.proofSource}`);
  console.log(`Name: ${report.normalizedName || report.name || "(unknown)"}`);
  console.log(`Assurance: ${report.assuranceTier || "(unknown)"}`);
  console.log(`Checks: ${report.passedCheckCount} passed, ${report.failedCheckCount} failed`);

  if (failedChecks.length > 0) {
    console.log("");
    console.log("Failed checks:");
    for (const check of failedChecks) {
      console.log(`  - ${check.id}: ${check.message}`);
    }

    process.exitCode = 1;
  }
}

async function createAuctionBidPackageCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const scenarioPath = parsed.positionals[0];

  if (!scenarioPath) {
    throw new Error("create-auction-bid-package requires a path to an auction scenario or lab fixture JSON file");
  }

  const bidderId = parsed.options.get("bidder-id");
  if (!bidderId) {
    throw new Error("--bidder-id is required");
  }

  const ownerPubkey = parsed.options.get("owner-pubkey");
  if (!ownerPubkey) {
    throw new Error("--owner-pubkey is required");
  }

  const bidAmountSats = parseRequiredBigInt(parsed.options.get("amount-sats"), "amount-sats");
  const rawInput = await loadJsonFile(scenarioPath);
  const scenario = parseLaunchAuctionScenario(extractLaunchAuctionScenarioInput(rawInput));
  const serializedPolicy = parsed.options.has("policy")
    ? await loadLaunchAuctionPolicy(parsed.options.get("policy"))
    : serializeLaunchAuctionPolicy(createDefaultLaunchAuctionPolicy());
  const policy = parseLaunchAuctionPolicy(serializedPolicy);
  const currentBlockHeight = parsed.options.has("current-block-height")
    ? parseRequiredInteger(parsed.options.get("current-block-height"), "current-block-height")
    : extractLaunchAuctionCurrentBlockHeight(rawInput);

  if (currentBlockHeight === null) {
    throw new Error(
      "create-auction-bid-package requires --current-block-height unless the input fixture already includes currentBlockHeight"
    );
  }

  const state = simulateLaunchAuctionStateAtBlock({
    policy,
    scenario,
    currentBlockHeight
  });
  const auctionBidPackage = createAuctionBidPackage({
    auctionId:
      parsed.options.get("auction-id")
      ?? basename(scenarioPath).replace(/\.json$/u, ""),
    name: state.normalizedName,
    currentBlockHeight: state.currentBlockHeight,
    phase: state.phase,
    unlockBlock: state.unlockBlock,
    auctionCloseBlockAfter: state.auctionCloseBlockAfter,
    openingMinimumBidSats: state.openingMinimumBidSats,
    currentLeaderBidderId: state.currentLeaderBidderId,
    currentHighestBidSats: state.currentHighestBidSats,
    currentRequiredMinimumBidSats: state.currentRequiredMinimumBidSats,
    settlementLockBlocks: state.settlementLockBlocks,
    blocksUntilUnlock: state.blocksUntilUnlock,
    blocksUntilClose: state.blocksUntilClose,
    bidderId,
    ownerPubkey,
    bidAmountSats
  });

  await maybeWriteJsonFile(parsed.options.get("write"), auctionBidPackage);
  console.log(JSON.stringify(auctionBidPackage, null, 2));
}

async function generateLiveAccountCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const generated = generateLiveAccount(parseNetwork(parsed.options.get("network")));

  await maybeWriteJsonFile(parsed.options.get("write"), generated);
  console.log(JSON.stringify(generated, null, 2));
}

async function buildAuctionBidArtifactsCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const bidPackagePath = parsed.positionals[0];

  if (!bidPackagePath) {
    throw new Error("build-auction-bid-artifacts requires a path to an auction bid package JSON file");
  }

  const bidPackage = await loadAuctionBidPackage(bidPackagePath);
  const network = parseNetwork(parsed.options.get("network"));
  const feeSats = parseRequiredBigInt(parsed.options.get("fee-sats"), "fee-sats");
  const bondAddress = parsed.options.get("bond-address");

  if (!bondAddress) {
    throw new Error("--bond-address is required");
  }

  const inputSpecs = parsed.multiOptions.get("input") ?? [];
  const walletDerivation = parseWalletDerivationOptions(parsed);
  const artifacts = buildAuctionBidArtifacts({
    bidPackage,
    fundingInputs: inputSpecs.map(parseFundingInputDescriptor),
    feeSats,
    network,
    bondAddress,
    ...(walletDerivation !== null ? { walletDerivation } : {}),
    ...(parsed.options.has("change-address")
      ? { changeAddress: parsed.options.get("change-address") as string }
      : {}),
    ...(parsed.options.has("bond-vout")
      ? { bondVout: parseRequiredByte(parsed.options.get("bond-vout"), "bond-vout") }
      : {}),
    ...(parsed.options.has("flags")
      ? { flags: parseRequiredByte(parsed.options.get("flags"), "flags") }
      : {})
  });

  await maybeWriteJsonFile(parsed.options.get("write"), artifacts);
  console.log(JSON.stringify(artifacts, null, 2));
}

async function buildTransferArtifactsCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const bondInputSpec = parsed.options.get("bond-input");

  if (!bondInputSpec) {
    throw new Error("--bond-input is required");
  }

  const prevStateTxid = parsed.options.get("prev-state-txid");
  if (!prevStateTxid) {
    throw new Error("--prev-state-txid is required");
  }

  const newOwnerPubkey = parsed.options.get("new-owner-pubkey");
  if (!newOwnerPubkey) {
    throw new Error("--new-owner-pubkey is required");
  }

  const ownerPrivateKeyHex = parsed.options.get("owner-private-key-hex");
  if (!ownerPrivateKeyHex) {
    throw new Error("--owner-private-key-hex is required");
  }

  const bondAddress = parsed.options.get("bond-address");
  if (!bondAddress) {
    throw new Error("--bond-address is required");
  }

  const artifacts = buildTransferArtifacts({
    prevStateTxid,
    ownerPrivateKeyHex,
    newOwnerPubkey,
    successorBondVout: parseRequiredByte(
      parsed.options.get("successor-bond-vout"),
      "successor-bond-vout"
    ),
    successorBondSats: parseRequiredBigInt(
      parsed.options.get("successor-bond-sats"),
      "successor-bond-sats"
    ),
    currentBondInput: parseFundingInputDescriptor(bondInputSpec),
    additionalFundingInputs: (parsed.multiOptions.get("input") ?? []).map(parseFundingInputDescriptor),
    feeSats: parseRequiredBigInt(parsed.options.get("fee-sats"), "fee-sats"),
    network: parseNetwork(parsed.options.get("network")),
    bondAddress,
    ...(parsed.options.has("change-address")
      ? { changeAddress: parsed.options.get("change-address") as string }
      : {}),
    ...(parsed.options.has("flags")
      ? { flags: parseRequiredByte(parsed.options.get("flags"), "flags") }
      : {})
  });

  await maybeWriteJsonFile(parsed.options.get("write"), artifacts);
  console.log(JSON.stringify(artifacts, null, 2));
}

async function buildSaleTransferArtifactsCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const prevStateTxid = parsed.options.get("prev-state-txid");
  const newOwnerPubkey = parsed.options.get("new-owner-pubkey");
  const ownerPrivateKeyHex = parsed.options.get("owner-private-key-hex");
  const sellerPaymentAddress = parsed.options.get("seller-payment-address");
  const sellerInputs = (parsed.multiOptions.get("seller-input") ?? []).map(parseFundingInputDescriptor);
  const buyerInputs = (parsed.multiOptions.get("buyer-input") ?? []).map(parseFundingInputDescriptor);

  if (!prevStateTxid) {
    throw new Error("--prev-state-txid is required");
  }

  if (!newOwnerPubkey) {
    throw new Error("--new-owner-pubkey is required");
  }

  if (!ownerPrivateKeyHex) {
    throw new Error("--owner-private-key-hex is required");
  }

  if (!sellerPaymentAddress) {
    throw new Error("--seller-payment-address is required");
  }

  if (sellerInputs.length === 0) {
    throw new Error("at least one --seller-input is required");
  }

  if (buyerInputs.length === 0) {
    throw new Error("at least one --buyer-input is required");
  }

  const artifacts = buildSaleTransferArtifacts({
    prevStateTxid,
    ownerPrivateKeyHex,
    newOwnerPubkey,
    sellerInputs,
    buyerInputs,
    sellerPaymentSats: parseRequiredBigInt(
      parsed.options.get("seller-payment-sats"),
      "seller-payment-sats"
    ),
    sellerPaymentAddress,
    feeSats: parseRequiredBigInt(parsed.options.get("fee-sats"), "fee-sats"),
    network: parseNetwork(parsed.options.get("network")),
    ...(parsed.options.has("seller-change-address")
      ? { sellerChangeAddress: parsed.options.get("seller-change-address") as string }
      : {}),
    ...(parsed.options.has("buyer-change-address")
      ? { buyerChangeAddress: parsed.options.get("buyer-change-address") as string }
      : {}),
    ...(parsed.options.has("flags")
      ? { flags: parseRequiredByte(parsed.options.get("flags"), "flags") }
      : {})
  });

  await maybeWriteJsonFile(parsed.options.get("write"), artifacts);
  console.log(JSON.stringify(artifacts, null, 2));
}

async function buildImmatureSaleTransferArtifactsCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const bondInputSpec = parsed.options.get("bond-input");
  const prevStateTxid = parsed.options.get("prev-state-txid");
  const newOwnerPubkey = parsed.options.get("new-owner-pubkey");
  const ownerPrivateKeyHex = parsed.options.get("owner-private-key-hex");
  const sellerPayoutAddress = parsed.options.get("seller-payout-address");
  const bondAddress = parsed.options.get("bond-address");
  const sellerInputs = (parsed.multiOptions.get("seller-input") ?? []).map(parseFundingInputDescriptor);
  const buyerInputs = (parsed.multiOptions.get("buyer-input") ?? []).map(parseFundingInputDescriptor);

  if (!bondInputSpec) {
    throw new Error("--bond-input is required");
  }

  if (!prevStateTxid) {
    throw new Error("--prev-state-txid is required");
  }

  if (!newOwnerPubkey) {
    throw new Error("--new-owner-pubkey is required");
  }

  if (!ownerPrivateKeyHex) {
    throw new Error("--owner-private-key-hex is required");
  }

  if (!sellerPayoutAddress) {
    throw new Error("--seller-payout-address is required");
  }

  if (!bondAddress) {
    throw new Error("--bond-address is required");
  }

  if (buyerInputs.length === 0) {
    throw new Error("at least one --buyer-input is required");
  }

  const artifacts = buildImmatureSaleTransferArtifacts({
    prevStateTxid,
    ownerPrivateKeyHex,
    newOwnerPubkey,
    successorBondVout: parseRequiredByte(
      parsed.options.get("successor-bond-vout"),
      "successor-bond-vout"
    ),
    successorBondSats: parseRequiredBigInt(
      parsed.options.get("successor-bond-sats"),
      "successor-bond-sats"
    ),
    currentBondInput: parseFundingInputDescriptor(bondInputSpec),
    ...(sellerInputs.length === 0 ? {} : { sellerInputs }),
    buyerInputs,
    salePriceSats: parseRequiredBigInt(parsed.options.get("sale-price-sats"), "sale-price-sats"),
    sellerPayoutAddress,
    feeSats: parseRequiredBigInt(parsed.options.get("fee-sats"), "fee-sats"),
    network: parseNetwork(parsed.options.get("network")),
    bondAddress,
    ...(parsed.options.has("buyer-change-address")
      ? { buyerChangeAddress: parsed.options.get("buyer-change-address") as string }
      : {}),
    ...(parsed.options.has("flags")
      ? { flags: parseRequiredByte(parsed.options.get("flags"), "flags") }
      : {})
  });

  await maybeWriteJsonFile(parsed.options.get("write"), artifacts);
  console.log(JSON.stringify(artifacts, null, 2));
}

async function signArtifactsCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const artifactsPath = parsed.positionals[0];

  if (!artifactsPath) {
    throw new Error("sign-artifacts requires a path to a built artifacts JSON file");
  }

  const resolvedPath = resolve(process.cwd(), artifactsPath);
  const raw = await readFile(resolvedPath, "utf8");
  const artifacts = parseBuiltArtifactsEnvelope(JSON.parse(raw));
  const wifs = parsed.multiOptions.get("wif") ?? [];

  const signed = signArtifacts({
    artifacts,
    wifs
  });

  await maybeWriteJsonFile(parsed.options.get("write"), signed);
  console.log(JSON.stringify(signed, null, 2));
}

async function broadcastTransactionCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const artifactsPath = parsed.positionals[0];

  if (!artifactsPath) {
    throw new Error("broadcast-transaction requires a path to a signed artifacts JSON file");
  }

  const signedArtifacts = await loadSignedArtifacts(artifactsPath);
  const expectedChain = parseNetwork(parsed.options.get("expected-chain"));
  const target = resolveRemoteChainTarget({
    rpcUrl: parsed.options.get("rpc-url"),
    rpcUsername: parsed.options.get("rpc-username"),
    rpcPassword: parsed.options.get("rpc-password"),
    esploraBaseUrl: parsed.options.get("base-url"),
    expectedChain
  });

  const result = await broadcastSignedArtifacts({
    rpc: target.rpc,
    esplora: target.esplora,
    expectedChain,
    signedArtifacts
  });

  console.log(JSON.stringify(result, null, 2));
}

async function checkRpcCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const expectedChain = parseNetwork(parsed.options.get("expected-chain"));
  const rpc = resolveRpcConfig({
    url: parsed.options.get("rpc-url"),
    username: parsed.options.get("rpc-username"),
    password: parsed.options.get("rpc-password"),
    expectedChain
  });

  const result = await checkRpcConnection({
    rpc,
    expectedChain
  });

  console.log(JSON.stringify(result, null, 2));
}

async function checkEsploraCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const expectedChain = parseNetwork(parsed.options.get("expected-chain"));
  const esplora = resolveEsploraConfig({
    baseUrl: parsed.options.get("base-url"),
    expectedChain
  });

  const result = await checkEsploraConnection({
    esplora,
    expectedChain
  });

  console.log(JSON.stringify(result, null, 2));
}

async function checkAddressCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const address = parsed.options.get("address");

  if (!address) {
    throw new Error("--address is required");
  }

  const esplora = resolveEsploraConfig({
    baseUrl: parsed.options.get("base-url"),
    expectedChain: "signet"
  });
  const result = await checkEsploraAddress({
    esplora,
    address
  });

  console.log(JSON.stringify(result, null, 2));
}

async function submitTransferCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const bondInputSpec = parsed.options.get("bond-input");

  if (!bondInputSpec) {
    throw new Error("submit-transfer requires --bond-input");
  }

  const prevStateTxid = parsed.options.get("prev-state-txid");
  if (!prevStateTxid) {
    throw new Error("submit-transfer requires --prev-state-txid");
  }

  const newOwnerPubkey = parsed.options.get("new-owner-pubkey");
  if (!newOwnerPubkey) {
    throw new Error("submit-transfer requires --new-owner-pubkey");
  }

  const ownerPrivateKeyHex = parsed.options.get("owner-private-key-hex");
  if (!ownerPrivateKeyHex) {
    throw new Error("submit-transfer requires --owner-private-key-hex");
  }

  const bondAddress = parsed.options.get("bond-address");
  if (!bondAddress) {
    throw new Error("submit-transfer requires --bond-address");
  }

  const wifs = parsed.multiOptions.get("wif") ?? [];
  if (wifs.length === 0) {
    throw new Error("submit-transfer requires at least one --wif");
  }

  const network = parseNetwork(parsed.options.get("network"));
  const expectedChain = parseNetwork(parsed.options.get("expected-chain"));
  const target = resolveRemoteChainTarget({
    rpcUrl: parsed.options.get("rpc-url"),
    rpcUsername: parsed.options.get("rpc-username"),
    rpcPassword: parsed.options.get("rpc-password"),
    esploraBaseUrl: parsed.options.get("base-url"),
    expectedChain
  });

  const result = await submitTransfer({
    prevStateTxid,
    ownerPrivateKeyHex,
    newOwnerPubkey,
    successorBondVout: parseRequiredByte(
      parsed.options.get("successor-bond-vout"),
      "successor-bond-vout"
    ),
    successorBondSats: parseRequiredBigInt(
      parsed.options.get("successor-bond-sats"),
      "successor-bond-sats"
    ),
    currentBondInput: parseFundingInputDescriptor(bondInputSpec),
    additionalFundingInputs: (parsed.multiOptions.get("input") ?? []).map(parseFundingInputDescriptor),
    feeSats: parseRequiredBigInt(parsed.options.get("fee-sats"), "fee-sats"),
    network,
    expectedChain,
    rpc: target.rpc,
    esplora: target.esplora,
    wifs,
    bondAddress,
    ...(parsed.options.has("change-address")
      ? { changeAddress: parsed.options.get("change-address") as string }
      : {}),
    ...(parsed.options.has("flags")
      ? { flags: parseRequiredByte(parsed.options.get("flags"), "flags") }
      : {}),
    ...(parsed.options.has("out-dir") ? { outDir: parsed.options.get("out-dir") as string } : {})
  });

  console.log(JSON.stringify(result, null, 2));
}

async function submitSaleTransferCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const prevStateTxid = parsed.options.get("prev-state-txid");
  const newOwnerPubkey = parsed.options.get("new-owner-pubkey");
  const ownerPrivateKeyHex = parsed.options.get("owner-private-key-hex");
  const sellerPaymentAddress = parsed.options.get("seller-payment-address");
  const sellerInputs = (parsed.multiOptions.get("seller-input") ?? []).map(parseFundingInputDescriptor);
  const buyerInputs = (parsed.multiOptions.get("buyer-input") ?? []).map(parseFundingInputDescriptor);
  const wifs = parsed.multiOptions.get("wif") ?? [];

  if (!prevStateTxid) {
    throw new Error("submit-sale-transfer requires --prev-state-txid");
  }

  if (!newOwnerPubkey) {
    throw new Error("submit-sale-transfer requires --new-owner-pubkey");
  }

  if (!ownerPrivateKeyHex) {
    throw new Error("submit-sale-transfer requires --owner-private-key-hex");
  }

  if (!sellerPaymentAddress) {
    throw new Error("submit-sale-transfer requires --seller-payment-address");
  }

  if (sellerInputs.length === 0) {
    throw new Error("submit-sale-transfer requires at least one --seller-input");
  }

  if (buyerInputs.length === 0) {
    throw new Error("submit-sale-transfer requires at least one --buyer-input");
  }

  if (wifs.length === 0) {
    throw new Error("submit-sale-transfer requires at least one --wif");
  }

  const network = parseNetwork(parsed.options.get("network"));
  const expectedChain = parseNetwork(parsed.options.get("expected-chain"));
  const target = resolveRemoteChainTarget({
    rpcUrl: parsed.options.get("rpc-url"),
    rpcUsername: parsed.options.get("rpc-username"),
    rpcPassword: parsed.options.get("rpc-password"),
    esploraBaseUrl: parsed.options.get("base-url"),
    expectedChain
  });

  const result = await submitSaleTransfer({
    prevStateTxid,
    ownerPrivateKeyHex,
    newOwnerPubkey,
    sellerInputs,
    buyerInputs,
    sellerPaymentSats: parseRequiredBigInt(
      parsed.options.get("seller-payment-sats"),
      "seller-payment-sats"
    ),
    sellerPaymentAddress,
    feeSats: parseRequiredBigInt(parsed.options.get("fee-sats"), "fee-sats"),
    network,
    expectedChain,
    rpc: target.rpc,
    esplora: target.esplora,
    wifs,
    ...(parsed.options.has("seller-change-address")
      ? { sellerChangeAddress: parsed.options.get("seller-change-address") as string }
      : {}),
    ...(parsed.options.has("buyer-change-address")
      ? { buyerChangeAddress: parsed.options.get("buyer-change-address") as string }
      : {}),
    ...(parsed.options.has("flags")
      ? { flags: parseRequiredByte(parsed.options.get("flags"), "flags") }
      : {}),
    ...(parsed.options.has("out-dir") ? { outDir: parsed.options.get("out-dir") as string } : {})
  });

  console.log(JSON.stringify(result, null, 2));
}

async function submitImmatureSaleTransferCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const bondInputSpec = parsed.options.get("bond-input");
  const prevStateTxid = parsed.options.get("prev-state-txid");
  const newOwnerPubkey = parsed.options.get("new-owner-pubkey");
  const ownerPrivateKeyHex = parsed.options.get("owner-private-key-hex");
  const sellerPayoutAddress = parsed.options.get("seller-payout-address");
  const bondAddress = parsed.options.get("bond-address");
  const sellerInputs = (parsed.multiOptions.get("seller-input") ?? []).map(parseFundingInputDescriptor);
  const buyerInputs = (parsed.multiOptions.get("buyer-input") ?? []).map(parseFundingInputDescriptor);
  const wifs = parsed.multiOptions.get("wif") ?? [];

  if (!bondInputSpec) {
    throw new Error("submit-immature-sale-transfer requires --bond-input");
  }

  if (!prevStateTxid) {
    throw new Error("submit-immature-sale-transfer requires --prev-state-txid");
  }

  if (!newOwnerPubkey) {
    throw new Error("submit-immature-sale-transfer requires --new-owner-pubkey");
  }

  if (!ownerPrivateKeyHex) {
    throw new Error("submit-immature-sale-transfer requires --owner-private-key-hex");
  }

  if (!sellerPayoutAddress) {
    throw new Error("submit-immature-sale-transfer requires --seller-payout-address");
  }

  if (!bondAddress) {
    throw new Error("submit-immature-sale-transfer requires --bond-address");
  }

  if (buyerInputs.length === 0) {
    throw new Error("submit-immature-sale-transfer requires at least one --buyer-input");
  }

  if (wifs.length === 0) {
    throw new Error("submit-immature-sale-transfer requires at least one --wif");
  }

  const network = parseNetwork(parsed.options.get("network"));
  const expectedChain = parseNetwork(parsed.options.get("expected-chain"));
  const target = resolveRemoteChainTarget({
    rpcUrl: parsed.options.get("rpc-url"),
    rpcUsername: parsed.options.get("rpc-username"),
    rpcPassword: parsed.options.get("rpc-password"),
    esploraBaseUrl: parsed.options.get("base-url"),
    expectedChain
  });

  const result = await submitImmatureSaleTransfer({
    prevStateTxid,
    ownerPrivateKeyHex,
    newOwnerPubkey,
    successorBondVout: parseRequiredByte(
      parsed.options.get("successor-bond-vout"),
      "successor-bond-vout"
    ),
    successorBondSats: parseRequiredBigInt(
      parsed.options.get("successor-bond-sats"),
      "successor-bond-sats"
    ),
    currentBondInput: parseFundingInputDescriptor(bondInputSpec),
    ...(sellerInputs.length === 0 ? {} : { sellerInputs }),
    buyerInputs,
    salePriceSats: parseRequiredBigInt(parsed.options.get("sale-price-sats"), "sale-price-sats"),
    sellerPayoutAddress,
    feeSats: parseRequiredBigInt(parsed.options.get("fee-sats"), "fee-sats"),
    network,
    expectedChain,
    rpc: target.rpc,
    esplora: target.esplora,
    wifs,
    bondAddress,
    ...(parsed.options.has("buyer-change-address")
      ? { buyerChangeAddress: parsed.options.get("buyer-change-address") as string }
      : {}),
    ...(parsed.options.has("flags")
      ? { flags: parseRequiredByte(parsed.options.get("flags"), "flags") }
      : {}),
    ...(parsed.options.has("out-dir") ? { outDir: parsed.options.get("out-dir") as string } : {})
  });

  console.log(JSON.stringify(result, null, 2));
}

async function signValueRecordCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const name = parsed.options.get("name");
  const ownerPrivateKeyHex = parsed.options.get("owner-private-key-hex");

  if (!name) {
    throw new Error("sign-value-record requires --name");
  }

  if (!ownerPrivateKeyHex) {
    throw new Error("sign-value-record requires --owner-private-key-hex");
  }

  const resolverUrl = resolveSingleResolverUrlOption(parsed, {
    command: "sign-value-record",
    multiResolverMessage:
      "sign-value-record automatic chain field lookup still uses one resolver at a time; use --resolver-url for a single source, or pass explicit --ownership-ref, --previous-record-hash, and --sequence"
  });
  let ownershipRef = parsed.options.get("ownership-ref");
  const previousRecordHashProvided = parsed.options.has("previous-record-hash");
  let previousRecordHash = previousRecordHashProvided
    ? parseNullableHashOption(parsed.options.get("previous-record-hash"))
    : undefined;
  let sequence = parsed.options.has("sequence")
    ? parseRequiredInteger(parsed.options.get("sequence"), "sequence")
    : undefined;

  if (ownershipRef === undefined || previousRecordHash === undefined || sequence === undefined) {
    if (resolverUrl === undefined) {
      throw new Error(
        "sign-value-record requires either --resolver-url for automatic chain fields or explicit --ownership-ref, --previous-record-hash, and --sequence"
      );
    }

    const [nameRecord, currentValueRecord] = await Promise.all([
      fetchNameRecord({ name, resolverUrl }),
      fetchNameValueRecord({ name, resolverUrl }).catch((error) => {
        if (error instanceof ResolverHttpError && error.code === "value_not_found") {
          return null;
        }

        throw error;
      })
    ]);

    ownershipRef ??= nameRecord.lastStateTxid;
    if (!previousRecordHashProvided) {
      previousRecordHash = currentValueRecord?.recordHash ?? null;
    }
    sequence ??= currentValueRecord === null ? 1 : currentValueRecord.sequence + 1;
  }

  if (ownershipRef === undefined || previousRecordHash === undefined || sequence === undefined) {
    throw new Error("unable to resolve value-record chain fields");
  }

  const record = createSignedValueRecord({
    name,
    ownerPrivateKeyHex,
    ownershipRef,
    sequence,
    previousRecordHash,
    valueType: parseRequiredByte(parsed.options.get("value-type"), "value-type"),
    ...(parsed.options.has("issued-at")
      ? { issuedAt: parsed.options.get("issued-at") as string }
      : {}),
    ...(parsed.options.has("payload-utf8")
      ? { payloadUtf8: parsed.options.get("payload-utf8") as string }
      : {}),
    ...(parsed.options.has("payload-hex")
      ? { payloadHex: parsed.options.get("payload-hex") as string }
      : {})
  });

  await maybeWriteJsonFile(parsed.options.get("write"), record);
  console.log(JSON.stringify(record, null, 2));
}

async function publishValueRecordCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const recordPath = parsed.positionals[0];

  if (!recordPath) {
    throw new Error("publish-value-record requires a path to a signed value record JSON file");
  }

  const valueRecord = await loadSignedValueRecord(recordPath);
  const resolverUrls = resolveCliResolverUrls(parsed);
  const result =
    resolverUrls.length > 1
      ? await publishValueRecordToResolvers({
          valueRecord,
          resolverUrls
        })
      : await publishValueRecord({
          valueRecord,
          ...(resolverUrls[0] === undefined ? {} : { resolverUrl: resolverUrls[0] })
        });

  console.log(JSON.stringify(result, null, 2));
}

async function signRecoveryDescriptorCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const name = parsed.options.get("name");
  const ownerPrivateKeyHex = parsed.options.get("owner-private-key-hex");
  const recoveryAddress = parsed.options.get("recovery-address");

  if (!name) {
    throw new Error("sign-recovery-descriptor requires --name");
  }

  if (!ownerPrivateKeyHex) {
    throw new Error("sign-recovery-descriptor requires --owner-private-key-hex");
  }

  if (!recoveryAddress) {
    throw new Error("sign-recovery-descriptor requires --recovery-address");
  }

  const resolverUrl = resolveSingleResolverUrlOption(parsed, {
    command: "sign-recovery-descriptor",
    multiResolverMessage:
      "sign-recovery-descriptor automatic chain field lookup uses one resolver at a time; use --resolver-url for a single source, or pass explicit --ownership-ref, --previous-descriptor-hash, and --sequence"
  });
  let ownershipRef = parsed.options.get("ownership-ref");
  const previousDescriptorHashProvided = parsed.options.has("previous-descriptor-hash");
  let previousDescriptorHash = previousDescriptorHashProvided
    ? parseNullableDescriptorHashOption(parsed.options.get("previous-descriptor-hash"))
    : undefined;
  let sequence = parsed.options.has("sequence")
    ? parseRequiredInteger(parsed.options.get("sequence"), "sequence")
    : undefined;

  if (ownershipRef === undefined || previousDescriptorHash === undefined || sequence === undefined) {
    if (resolverUrl === undefined) {
      throw new Error(
        "sign-recovery-descriptor requires either --resolver-url for automatic chain fields or explicit --ownership-ref, --previous-descriptor-hash, and --sequence"
      );
    }

    const [nameRecord, currentRecoveryDescriptor] = await Promise.all([
      fetchNameRecord({ name, resolverUrl }),
      fetchNameRecoveryDescriptor({ name, resolverUrl }).catch((error) => {
        if (error instanceof ResolverHttpError && error.code === "recovery_descriptor_not_found") {
          return null;
        }

        throw error;
      })
    ]);

    ownershipRef ??= nameRecord.lastStateTxid;
    if (!previousDescriptorHashProvided) {
      previousDescriptorHash = currentRecoveryDescriptor?.descriptorHash ?? null;
    }
    sequence ??= currentRecoveryDescriptor === null ? 1 : currentRecoveryDescriptor.sequence + 1;
  }

  if (ownershipRef === undefined || previousDescriptorHash === undefined || sequence === undefined) {
    throw new Error("unable to resolve recovery-descriptor chain fields");
  }

  const descriptor = createSignedRecoveryDescriptor({
    name,
    ownerPrivateKeyHex,
    ownershipRef,
    sequence,
    previousDescriptorHash,
    recoveryAddress,
    ...(parsed.options.has("signing-profile")
      ? { signingProfile: parsed.options.get("signing-profile") as string }
      : {}),
    ...(parsed.options.has("challenge-window-blocks")
      ? {
          challengeWindowBlocks: parseRequiredInteger(
            parsed.options.get("challenge-window-blocks"),
            "challenge-window-blocks"
          )
        }
      : {}),
    ...(parsed.options.has("issued-at")
      ? { issuedAt: parsed.options.get("issued-at") as string }
      : {})
  });

  await maybeWriteJsonFile(parsed.options.get("write"), descriptor);
  console.log(JSON.stringify(descriptor, null, 2));
}

async function publishRecoveryDescriptorCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const descriptorPath = parsed.positionals[0];

  if (!descriptorPath) {
    throw new Error("publish-recovery-descriptor requires a path to a signed recovery descriptor JSON file");
  }

  const recoveryDescriptor = await loadSignedRecoveryDescriptor(descriptorPath);
  const resolverUrl = resolveSingleResolverUrlOption(parsed, {
    command: "publish-recovery-descriptor"
  });
  const result = await publishRecoveryDescriptor({
    recoveryDescriptor,
    ...(resolverUrl === undefined ? {} : { resolverUrl })
  });

  console.log(JSON.stringify(result, null, 2));
}

async function publishRecoveryWalletProofCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const proofPath = parsed.positionals[0];

  if (!proofPath) {
    throw new Error("publish-recovery-wallet-proof requires a path to a recovery wallet-proof JSON file");
  }

  const recoveryWalletProof = await loadRecoveryWalletProof(proofPath);
  const resolverUrl = resolveSingleResolverUrlOption(parsed, {
    command: "publish-recovery-wallet-proof"
  });
  const result = await publishRecoveryWalletProof({
    recoveryWalletProof,
    ...(resolverUrl === undefined ? {} : { resolverUrl })
  });

  console.log(JSON.stringify(result, null, 2));
}

async function printRecoveryWalletProofMessageCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const descriptorPath = parsed.positionals[0];

  if (!descriptorPath) {
    throw new Error("print-recovery-wallet-proof-message requires a recovery descriptor JSON file");
  }

  const descriptor = await loadSignedRecoveryDescriptor(descriptorPath);
  const prevStateTxid = parsed.options.get("prev-state-txid");
  const newOwnerPubkey = parsed.options.get("new-owner-pubkey");

  if (!prevStateTxid) {
    throw new Error("print-recovery-wallet-proof-message requires --prev-state-txid");
  }

  if (!newOwnerPubkey) {
    throw new Error("print-recovery-wallet-proof-message requires --new-owner-pubkey");
  }

  console.log(
    createRecoveryWalletProofMessageForDescriptor({
      descriptor,
      prevStateTxid,
      newOwnerPubkey,
      successorBondVout: parseRequiredByte(parsed.options.get("successor-bond-vout"), "successor-bond-vout"),
      ...(parsed.options.has("chain-tip-block-hash")
        ? { chainTipBlockHash: parsed.options.get("chain-tip-block-hash") as string }
        : {}),
      ...(parsed.options.has("chain-tip-height")
        ? { chainTipHeight: parseRequiredInteger(parsed.options.get("chain-tip-height"), "chain-tip-height") }
        : {})
    })
  );
}

async function buildRecoveryWalletProofCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const descriptorPath = parsed.positionals[0];

  if (!descriptorPath) {
    throw new Error("build-recovery-wallet-proof requires a recovery descriptor JSON file");
  }

  const descriptor = await loadSignedRecoveryDescriptor(descriptorPath);
  const prevStateTxid = parsed.options.get("prev-state-txid");
  const newOwnerPubkey = parsed.options.get("new-owner-pubkey");
  const signatureBase64 = parsed.options.get("signature-base64");

  if (!prevStateTxid) {
    throw new Error("build-recovery-wallet-proof requires --prev-state-txid");
  }

  if (!newOwnerPubkey) {
    throw new Error("build-recovery-wallet-proof requires --new-owner-pubkey");
  }

  if (!signatureBase64) {
    throw new Error("build-recovery-wallet-proof requires --signature-base64");
  }

  const proof = createRecoveryWalletProofEnvelope({
    descriptor,
    prevStateTxid,
    newOwnerPubkey,
    successorBondVout: parseRequiredByte(parsed.options.get("successor-bond-vout"), "successor-bond-vout"),
    signatureBase64,
    ...(parsed.options.has("chain-tip-block-hash")
      ? { chainTipBlockHash: parsed.options.get("chain-tip-block-hash") as string }
      : {}),
    ...(parsed.options.has("chain-tip-height")
      ? { chainTipHeight: parseRequiredInteger(parsed.options.get("chain-tip-height"), "chain-tip-height") }
      : {})
  });

  await maybeWriteJsonFile(parsed.options.get("write"), proof);
  console.log(JSON.stringify(proof, null, 2));
}

async function verifyRecoveryWalletProofCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const descriptorPath = parsed.positionals[0];
  const proofPath = parsed.positionals[1];

  if (!descriptorPath || !proofPath) {
    throw new Error("verify-recovery-wallet-proof requires <recovery-descriptor-json> <recovery-wallet-proof-json>");
  }

  const descriptor = await loadSignedRecoveryDescriptor(descriptorPath);
  const proof = await loadRecoveryWalletProof(proofPath);
  const result = verifyRecoveryWalletProofEnvelope({
    descriptor,
    proof,
    ...(parsed.options.has("prev-state-txid")
      ? { prevStateTxid: parsed.options.get("prev-state-txid") as string }
      : {}),
    ...(parsed.options.has("new-owner-pubkey")
      ? { newOwnerPubkey: parsed.options.get("new-owner-pubkey") as string }
      : {}),
    ...(parsed.options.has("successor-bond-vout")
      ? { successorBondVout: parseRequiredByte(parsed.options.get("successor-bond-vout"), "successor-bond-vout") }
      : {})
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function getNameCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const name = parsed.positionals[0] ?? parsed.options.get("name");

  if (!name) {
    throw new Error("get-name requires a name");
  }

  try {
    const resolverUrl = resolveSingleResolverUrlOption(parsed, {
      command: "get-name"
    });
    const result = await fetchNameRecord({
      name,
      ...(resolverUrl === undefined ? {} : { resolverUrl })
    });

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error instanceof ResolverHttpError) {
      console.log(JSON.stringify(error.payload, null, 2));
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

async function getNameActivityCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const name = parsed.positionals[0] ?? parsed.options.get("name");

  if (!name) {
    throw new Error("get-name-activity requires a name");
  }

  try {
    const resolverUrl = resolveSingleResolverUrlOption(parsed, {
      command: "get-name-activity"
    });
    const result = await fetchNameActivity({
      name,
      ...(resolverUrl === undefined ? {} : { resolverUrl }),
      ...(parsed.options.has("limit")
        ? { limit: parseRequiredInteger(parsed.options.get("limit"), "limit") }
        : {})
    });

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error instanceof ResolverHttpError) {
      console.log(JSON.stringify(error.payload, null, 2));
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

async function getValueCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const name = parsed.positionals[0] ?? parsed.options.get("name");

  if (!name) {
    throw new Error("get-value requires a name");
  }

  try {
    const resolverUrls = resolveCliResolverUrls(parsed);
    const result =
      resolverUrls.length > 1
        ? await fetchNameValueHistoryFromResolvers({
            name,
            resolverUrls
          })
        : await fetchNameValueRecord({
            name,
            ...(resolverUrls[0] === undefined ? {} : { resolverUrl: resolverUrls[0] })
          });

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error instanceof ResolverHttpError) {
      console.log(JSON.stringify(error.payload, null, 2));
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

async function getValueHistoryCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const name = parsed.positionals[0] ?? parsed.options.get("name");

  if (!name) {
    throw new Error("get-value-history requires a name");
  }

  try {
    const resolverUrls = resolveCliResolverUrls(parsed);
    const result =
      resolverUrls.length > 1
        ? await fetchNameValueHistoryFromResolvers({
            name,
            resolverUrls
          })
        : await fetchNameValueHistory({
            name,
            ...(resolverUrls[0] === undefined ? {} : { resolverUrl: resolverUrls[0] })
          });

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error instanceof ResolverHttpError) {
      console.log(JSON.stringify(error.payload, null, 2));
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

async function getRecoveryDescriptorCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const name = parsed.positionals[0] ?? parsed.options.get("name");

  if (!name) {
    throw new Error("get-recovery-descriptor requires a name");
  }

  try {
    const resolverUrl = resolveSingleResolverUrlOption(parsed, {
      command: "get-recovery-descriptor"
    });
    const result = await fetchNameRecoveryDescriptor({
      name,
      ...(resolverUrl === undefined ? {} : { resolverUrl })
    });

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error instanceof ResolverHttpError) {
      console.log(JSON.stringify(error.payload, null, 2));
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

async function getRecoveryDescriptorHistoryCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const name = parsed.positionals[0] ?? parsed.options.get("name");

  if (!name) {
    throw new Error("get-recovery-descriptor-history requires a name");
  }

  try {
    const resolverUrl = resolveSingleResolverUrlOption(parsed, {
      command: "get-recovery-descriptor-history"
    });
    const result = await fetchNameRecoveryDescriptorHistory({
      name,
      ...(resolverUrl === undefined ? {} : { resolverUrl })
    });

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error instanceof ResolverHttpError) {
      console.log(JSON.stringify(error.payload, null, 2));
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

async function getTxCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);
  const txid = parsed.positionals[0] ?? parsed.options.get("txid");

  if (!txid) {
    throw new Error("get-tx requires a txid");
  }

  try {
    const resolverUrl = resolveSingleResolverUrlOption(parsed, {
      command: "get-tx"
    });
    const result = await fetchTransactionProvenance({
      txid,
      ...(resolverUrl === undefined ? {} : { resolverUrl })
    });

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error instanceof ResolverHttpError) {
      console.log(JSON.stringify(error.payload, null, 2));
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

async function listActivityCommand(args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args);

  try {
    const resolverUrl = resolveSingleResolverUrlOption(parsed, {
      command: "list-activity"
    });
    const result = await fetchRecentActivity({
      ...(resolverUrl === undefined ? {} : { resolverUrl }),
      ...(parsed.options.has("limit")
        ? { limit: parseRequiredInteger(parsed.options.get("limit"), "limit") }
        : {})
    });

    console.log(JSON.stringify({ activity: result }, null, 2));
  } catch (error) {
    if (error instanceof ResolverHttpError) {
      console.log(JSON.stringify(error.payload, null, 2));
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

async function loadAuctionBidPackage(
  filePath: string
): Promise<ReturnType<typeof parseAuctionBidPackage>> {
  const resolvedPath = resolve(process.cwd(), filePath);
  const raw = await readFile(resolvedPath, "utf8");
  return parseAuctionBidPackage(JSON.parse(raw));
}

async function loadSignedArtifacts(filePath: string) {
  const resolvedPath = resolve(process.cwd(), filePath);
  const raw = await readFile(resolvedPath, "utf8");
  return parseSignedArtifactsFile(JSON.parse(raw));
}

async function loadJsonFile(filePath: string): Promise<unknown> {
  const primaryPath = resolve(process.cwd(), filePath);

  try {
    const raw = await readFile(primaryPath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    const initCwd = process.env.INIT_CWD;

    if (
      !(error instanceof Error && "code" in error && error.code === "ENOENT") ||
      !initCwd ||
      resolve(initCwd) === process.cwd()
    ) {
      throw error;
    }

    const fallbackPath = resolve(initCwd, filePath);
    const raw = await readFile(fallbackPath, "utf8");
    return JSON.parse(raw);
  }
}

async function loadLaunchAuctionPolicy(filePath: string | undefined): Promise<SerializedLaunchAuctionPolicy> {
  if (!filePath) {
    throw new Error("--policy requires a path to an auction policy JSON file");
  }

  return loadJsonFile(filePath) as Promise<SerializedLaunchAuctionPolicy>;
}

function extractLaunchAuctionScenarioInput(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return input;
  }

  const record = input as Record<string, unknown>;
  return "scenario" in record ? record.scenario : input;
}

function extractLaunchAuctionCurrentBlockHeight(input: unknown): number | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;
  const currentBlockHeight = record.currentBlockHeight;
  if (typeof currentBlockHeight !== "number" || !Number.isSafeInteger(currentBlockHeight) || currentBlockHeight < 0) {
    return null;
  }

  return currentBlockHeight;
}

function parseOptions(args: readonly string[]): {
  readonly positionals: string[];
  readonly options: Map<string, string>;
  readonly multiOptions: Map<string, string[]>;
} {
  const positionals: string[] = [];
  const options = new Map<string, string>();
  const multiOptions = new Map<string, string[]>();

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    if (!current?.startsWith("--")) {
      positionals.push(current ?? "");
      continue;
    }

    const key = current.slice(2);
    const value = args[index + 1];

    if (!value || value.startsWith("--")) {
      if (key === "once") {
        options.set(key, "true");
        continue;
      }

      throw new Error(`missing value for --${key}`);
    }

    if (
      key === "input" ||
      key === "wif" ||
      key === "seller-input" ||
      key === "buyer-input"
    ) {
      multiOptions.set(key, [...(multiOptions.get(key) ?? []), value]);
    } else {
      options.set(key, value);
    }

    index += 1;
  }

  return {
    positionals,
    options,
    multiOptions
  };
}

function parseResolverUrlList(value: string): readonly string[] {
  return value
    .split(/[\s,]+/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseRequiredBigInt(value: string | undefined, label: string): bigint {
  if (!value) {
    throw new Error(`--${label} is required`);
  }

  const parsed = BigInt(value);
  if (parsed < 0n) {
    throw new Error(`--${label} must be non-negative`);
  }

  return parsed;
}

function parseRequiredByte(value: string | undefined, label: string): number {
  if (!value) {
    throw new Error(`--${label} is required`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xff) {
    throw new Error(`--${label} must be an integer between 0 and 255`);
  }

  return parsed;
}

function parseRequiredInteger(value: string | undefined, label: string): number {
  if (value === undefined) {
    throw new Error(`--${label} is required`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`--${label} must be a non-negative safe integer`);
  }

  return parsed;
}

function parseNullableHashOption(value: string | undefined): string | null {
  if (value === undefined || value.toLowerCase() === "null" || value === "") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("--previous-record-hash must be 64 hex characters or null");
  }

  return normalized;
}

function parseNullableDescriptorHashOption(value: string | undefined): string | null {
  if (value === undefined || value.toLowerCase() === "null" || value === "") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("--previous-descriptor-hash must be 64 hex characters or null");
  }

  return normalized;
}

function parseNetwork(value: string | undefined): OntCliNetwork {
  if (value === undefined) {
    return "signet";
  }

  if (value === "main" || value === "signet" || value === "testnet" || value === "regtest") {
    return value;
  }

  throw new Error("--network must be one of main, signet, testnet, regtest");
}

function parseWalletDerivationOptions(parsed: {
  readonly options: Map<string, string>;
}): WalletDerivationDescriptor | null {
  const masterFingerprint = parsed.options.get("wallet-master-fingerprint");
  const accountXpub = parsed.options.get("wallet-account-xpub");
  const accountDerivationPath = parsed.options.get("wallet-account-path");

  if (!masterFingerprint && !accountXpub && !accountDerivationPath) {
    return null;
  }

  if (!masterFingerprint || !accountXpub || !accountDerivationPath) {
    throw new Error(
      "--wallet-master-fingerprint, --wallet-account-xpub, and --wallet-account-path must be provided together"
    );
  }

  if (!/^[0-9a-fA-F]{8}$/.test(masterFingerprint)) {
    throw new Error("--wallet-master-fingerprint must be 4-byte hex");
  }

  return {
    masterFingerprint: masterFingerprint.toLowerCase(),
    accountXpub,
    accountDerivationPath,
    ...(parsed.options.has("wallet-scan-limit")
      ? { scanLimit: parseRequiredInteger(parsed.options.get("wallet-scan-limit"), "wallet-scan-limit") }
      : {})
  };
}

function formatSats(value: string): string {
  const sats = BigInt(value);
  return `₿${sats.toLocaleString("en-US")} (${formatBtcDecimal(sats)} BTC)`;
}

function formatBtcDecimal(sats: bigint): string {
  const whole = sats / 100_000_000n;
  const fractional = (sats % 100_000_000n).toString().padStart(8, "0").replace(/0+$/g, "");
  return fractional === "" ? whole.toString() : `${whole}.${fractional}`;
}

function printUsage(): void {
  console.log(`${PRODUCT_NAME} CLI`);
  console.log("");
  console.log("The model: you claim a human-readable name on Bitcoin for a small fixed fee. If no one");
  console.log("else claims it, it's simply yours; if it's contested, it escalates to a bonded auction.");
  console.log("Either way you end up with a name controlled by one owner key.");
  console.log("");
  console.log("This CLI operates the live prototype mechanics: building, signing, and broadcasting");
  console.log("bonded bids (the contested-name path), transfers, off-chain value records, and recovery.");
  console.log("The cheap uncontested-claim path is prototyped separately and not wired into these");
  console.log("commands yet, so claiming a name here goes through the auction-bid commands.");
  console.log("");
  console.log("Human-facing amounts use integer bitcoin notation alongside the conventional BTC equivalent here; for example, ₿50,000 (0.0005 BTC).");
  console.log("Legacy amount flags keep their *-sats names for compatibility.");
  console.log("");
  console.log("Commands:");
  console.log("  inspect-auction-bid-package <path>");
  console.log("    Validate and summarize an auction bid package JSON file");
  console.log("");
  console.log("  inspect-transfer-package <path> [--role buyer|seller]");
  console.log("    Validate and summarize a downloaded transfer package JSON file, optionally with a buyer or seller review checklist");
  console.log("");
  console.log("  generate-live-account [--network signet|testnet|regtest|main] [--write <path>]");
  console.log("    Generate a fresh owner key plus a witnesspubkeyhash funding address for live prototype testing");
  console.log("");
  console.log("  create-auction-bid-package <scenario-or-lab-fixture> --bidder-id <id> --amount-sats <amount> [--current-block-height <height>] [--policy <path>] [--auction-id <id>] [--write <path>]");
  console.log("    Create an auction bid package from the current simulator state");
  console.log("");
  console.log("  build-auction-bid-artifacts <auction-bid-package> --input <txid:vout:valueSats:address[:derivationPath]> [--input ...] --fee-sats <amount> --bond-address <addr> [--bond-vout <0|1>] [--flags <0-255>] [--network signet|testnet|regtest|main] [--change-address <addr>] [--wallet-master-fingerprint <hex8> --wallet-account-xpub <xpub> --wallet-account-path <path> [--wallet-scan-limit <n>]] [--write <path>]");
  console.log("    same-bidder rebids should include the prior bid bond outpoint as one of the --input entries");
  console.log("    Build unsigned auction bid artifacts from an auction bid package");
  console.log("");
  console.log("  print-auction-policy [--write <path>]");
  console.log("    Emit the current temporary auction policy JSON so floors, durations, and timing can be edited outside the code");
  console.log("");
  console.log("  simulate-auction <scenario-json> [--policy <policy-json>] [--write <path>]");
  console.log("    Run one auction scenario against the temporary policy defaults or a supplied override file");
  console.log("");
  console.log("  simulate-auction-market <scenario-json> [--policy <policy-json>] [--write <path>]");
  console.log("    Run a multi-auction market scenario with bidder budget constraints and capital lock carryover");
  console.log("");
  console.log("  simulate-sponsored-issuance <scenario-json> [--write <path>]  (research model)");
  console.log("    Numerical model from the superseded sponsor-credit exploration; kept for research only");
  console.log("");
  console.log("  inspect-proof-bundle <proof-bundle-json>");
  console.log("    Run structural checks against a mock/research ONT ownership proof bundle");
  console.log("");
  console.log("  build-transfer-artifacts --prev-state-txid <txid> --new-owner-pubkey <hex32> --owner-private-key-hex <hex32> --bond-input <txid:vout:valueSats:address> [--input ...] --successor-bond-vout <0-255> --successor-bond-sats <amount> --fee-sats <amount> --bond-address <addr> [--change-address <addr>] [--flags <0-255>] [--network signet|testnet|regtest|main] [--write <path>]");
  console.log("    Build unsigned gift-transfer artifacts with embedded owner authorization and successor bond output");
  console.log("");
  console.log("  build-immature-sale-transfer-artifacts --prev-state-txid <txid> --new-owner-pubkey <hex32> --owner-private-key-hex <hex32> --bond-input <txid:vout:valueSats:address> [--seller-input <txid:vout:valueSats:address> ...] --buyer-input <txid:vout:valueSats:address> [--buyer-input ...] --successor-bond-vout <0-255> --successor-bond-sats <amount> --sale-price-sats <amount> --seller-payout-address <addr> --fee-sats <amount> --bond-address <addr> [--buyer-change-address <addr>] [--flags <0-255>] [--network signet|testnet|regtest|main] [--write <path>]");
  console.log("    Build unsigned immature-sale transfer artifacts where the buyer funds the successor bond, seller payout, and fee");
  console.log("");
  console.log("  build-sale-transfer-artifacts --prev-state-txid <txid> --new-owner-pubkey <hex32> --owner-private-key-hex <hex32> --seller-input <txid:vout:valueSats:address> [--seller-input ...] --buyer-input <txid:vout:valueSats:address> [--buyer-input ...] --seller-payment-sats <amount> --seller-payment-address <addr> --fee-sats <amount> [--seller-change-address <addr>] [--buyer-change-address <addr>] [--flags <0-255>] [--network signet|testnet|regtest|main] [--write <path>]");
  console.log("    Build unsigned cooperative mature-sale transfer artifacts with explicit seller payment output");
  console.log("");
  console.log("  sign-artifacts <artifacts-json> --wif <wif> [--wif ...] [--write <path>]");
  console.log("    Sign witnesspubkeyhash artifact PSBTs and emit a signed transaction hex payload");
  console.log("");
  console.log("  check-rpc [--rpc-url <url>] [--rpc-username <user>] [--rpc-password <pass>] [--expected-chain signet|testnet|regtest|main]");
  console.log("    Verify that a Bitcoin Core RPC endpoint is reachable and on the expected chain");
  console.log("");
  console.log("  check-esplora [--base-url <url>] [--expected-chain signet]");
  console.log("    Verify that a public Esplora endpoint is reachable and report the current tip");
  console.log("");
  console.log("  check-address --address <addr> [--base-url <url>]");
  console.log("    Inspect one signet address through Esplora and list any visible UTXOs");
  console.log("");
  console.log("  broadcast-transaction <signed-artifacts-json> [--rpc-url <url> --rpc-username <user> --rpc-password <pass> | --base-url <url>] [--expected-chain signet|testnet|regtest|main]");
  console.log("    Broadcast a signed transaction through Bitcoin Core RPC or a compatible Esplora backend");
  console.log("");
  console.log("  submit-transfer --prev-state-txid <txid> --new-owner-pubkey <hex32> --owner-private-key-hex <hex32> --bond-input <txid:vout:valueSats:address> [--input ...] --successor-bond-vout <0-255> --successor-bond-sats <amount> --fee-sats <amount> --bond-address <addr> --wif <wif> [--wif ...] [--change-address <addr>] [--flags <0-255>] [--network signet|testnet|regtest|main] [--expected-chain signet|testnet|regtest|main] [--rpc-url <url> --rpc-username <user> --rpc-password <pass> | --base-url <url>] [--out-dir <dir>]");
  console.log("    Build, sign, and broadcast a prototype gift/pre-arranged transfer transaction with a successor bond output");
  console.log("");
  console.log("  submit-immature-sale-transfer --prev-state-txid <txid> --new-owner-pubkey <hex32> --owner-private-key-hex <hex32> --bond-input <txid:vout:valueSats:address> [--seller-input <txid:vout:valueSats:address> ...] --buyer-input <txid:vout:valueSats:address> [--buyer-input ...] --successor-bond-vout <0-255> --successor-bond-sats <amount> --sale-price-sats <amount> --seller-payout-address <addr> --fee-sats <amount> --bond-address <addr> --wif <wif> [--wif ...] [--buyer-change-address <addr>] [--flags <0-255>] [--network signet|testnet|regtest|main] [--expected-chain signet|testnet|regtest|main] [--rpc-url <url> --rpc-username <user> --rpc-password <pass> | --base-url <url>] [--out-dir <dir>]");
  console.log("    Build, sign, and broadcast an immature sale where the buyer funds the successor bond and the seller receives their bond value plus sale price atomically");
  console.log("");
  console.log("  submit-sale-transfer --prev-state-txid <txid> --new-owner-pubkey <hex32> --owner-private-key-hex <hex32> --seller-input <txid:vout:valueSats:address> [--seller-input ...] --buyer-input <txid:vout:valueSats:address> [--buyer-input ...] --seller-payment-sats <amount> --seller-payment-address <addr> --fee-sats <amount> --wif <wif> [--wif ...] [--seller-change-address <addr>] [--buyer-change-address <addr>] [--flags <0-255>] [--network signet|testnet|regtest|main] [--expected-chain signet|testnet|regtest|main] [--rpc-url <url> --rpc-username <user> --rpc-password <pass> | --base-url <url>] [--out-dir <dir>]");
  console.log("    Build, sign, and broadcast a prototype cooperative mature-sale transfer with explicit seller payment output");
  console.log("");
  console.log("  sign-value-record --name <name> --owner-private-key-hex <hex32> --resolver-url <url> --value-type <0-255> [--payload-utf8 <text> | --payload-hex <hex>] [--write <path>]");
  console.log("    Sign the exact next off-chain value record using resolver-derived ownershipRef and predecessor hash");
  console.log("");
  console.log("  sign-value-record --name <name> --owner-private-key-hex <hex32> --ownership-ref <txid> --previous-record-hash <hash|null> --sequence <n> --value-type <0-255> [--payload-utf8 <text> | --payload-hex <hex>] [--issued-at <iso>] [--write <path>]");
  console.log("    Sign an off-chain value record using explicit value-chain fields");
  console.log("");
  console.log("  publish-value-record <value-record-json> [--resolver-url <url> | --resolver-urls <url1,url2,...>]");
  console.log("    Publish one signed value record to one resolver or fan it out across several resolvers");
  console.log("");
  console.log("  sign-recovery-descriptor --name <name> --owner-private-key-hex <hex32> --resolver-url <url> --recovery-address <addr> [--signing-profile bip322] [--challenge-window-blocks <n>] [--write <path>]");
  console.log("    Sign the exact next recovery descriptor using resolver-derived ownershipRef and predecessor hash");
  console.log("");
  console.log("  sign-recovery-descriptor --name <name> --owner-private-key-hex <hex32> --ownership-ref <txid> --previous-descriptor-hash <hash|null> --sequence <n> --recovery-address <addr> [--signing-profile bip322] [--challenge-window-blocks <n>] [--issued-at <iso>] [--write <path>]");
  console.log("    Sign a recovery descriptor using explicit recovery-chain fields");
  console.log("");
  console.log("  publish-recovery-descriptor <recovery-descriptor-json> [--resolver-url <url>]");
  console.log("    Publish one signed recovery descriptor to one resolver");
  console.log("");
  console.log("  publish-recovery-wallet-proof <recovery-wallet-proof-json> [--resolver-url <url>]");
  console.log("    Publish one verified recovery wallet-proof envelope to one resolver before broadcasting recovery");
  console.log("");
  console.log("  print-recovery-wallet-proof-message <recovery-descriptor-json> --prev-state-txid <txid> --new-owner-pubkey <hex32> --successor-bond-vout <0-255> [--chain-tip-block-hash <hash> --chain-tip-height <n>]");
  console.log("    Print the exact ONT recovery message for the recovery wallet to sign");
  console.log("");
  console.log("  build-recovery-wallet-proof <recovery-descriptor-json> --prev-state-txid <txid> --new-owner-pubkey <hex32> --successor-bond-vout <0-255> --signature-base64 <wallet-signature> [--write <path>]");
  console.log("    Wrap a wallet-produced BIP322 signature into an ONT recovery wallet-proof JSON envelope");
  console.log("");
  console.log("  verify-recovery-wallet-proof <recovery-descriptor-json> <recovery-wallet-proof-json> [--prev-state-txid <txid>] [--new-owner-pubkey <hex32>] [--successor-bond-vout <0-255>]");
  console.log("    Verify a recovery wallet-proof JSON envelope against its descriptor and optional expected recovery event fields");
  console.log("");
  console.log("  get-name <name> [--resolver-url <url>]");
  console.log("    Fetch the resolver's current ownership record for one name");
  console.log("");
  console.log("  get-name-activity <name> [--resolver-url <url>] [--limit <n>]");
  console.log("    Fetch recent resolver activity related to one name");
  console.log("");
  console.log("  get-value <name> [--resolver-url <url> | --resolver-urls <url1,url2,...>]");
  console.log("    Fetch the current signed off-chain value record, or compare value visibility across several resolvers");
  console.log("");
  console.log("  get-value-history <name> [--resolver-url <url> | --resolver-urls <url1,url2,...>]");
  console.log("    Fetch one resolver's current value-record history chain, or compare history agreement across several resolvers");
  console.log("");
  console.log("  get-recovery-descriptor <name> [--resolver-url <url>]");
  console.log("    Fetch the resolver's current signed wallet-backed recovery descriptor");
  console.log("");
  console.log("  get-recovery-descriptor-history <name> [--resolver-url <url>]");
  console.log("    Fetch one resolver's recovery descriptor history chain");
  console.log("");
  console.log("  list-activity [--resolver-url <url>] [--limit <n>]");
  console.log("    Fetch recent chain activity with parsed Open Name Tags events and invalidation outcomes");
  console.log("");
  console.log("  get-tx <txid> [--resolver-url <url>]");
  console.log("    Fetch the resolver's stored provenance record for one transaction");
}

function resolveCliResolverUrls(parsed: {
  readonly options: Map<string, string>;
}): readonly string[] {
  const singular = parsed.options.get("resolver-url");
  const plural = parsed.options.get("resolver-urls");

  if (singular !== undefined && plural !== undefined) {
    throw new Error("use either --resolver-url or --resolver-urls, not both");
  }

  if (plural !== undefined) {
    const resolverUrls = parseResolverUrlList(plural);
    if (resolverUrls.length === 0) {
      throw new Error("--resolver-urls must include at least one resolver URL");
    }
    return resolverUrls;
  }

  return resolveResolverUrls(singular === undefined ? undefined : [singular]);
}

function resolveSingleResolverUrlOption(
  parsed: {
    readonly options: Map<string, string>;
  },
  input: {
    readonly command: string;
    readonly multiResolverMessage?: string;
  }
): string | undefined {
  const resolverUrls = resolveCliResolverUrls(parsed);

  if (resolverUrls.length > 1) {
    throw new Error(
      input.multiResolverMessage
      ?? `${input.command} accepts one resolver at a time; use --resolver-url or a single-item --resolver-urls value`
    );
  }

  return resolverUrls[0];
}
