import { PRODUCT_NAME, PROTOCOL_NAME, TRANSFER_PACKAGE_FORMAT, TRANSFER_PACKAGE_VERSION } from "@ont/protocol";

export function renderClientScript(configuredBasePath: string): string {
  const keyToolsModulePath =
    configuredBasePath === ""
      ? "/key-tools.js"
      : `${configuredBasePath}/key-tools.js`;
  const auctionToolsModulePath =
    configuredBasePath === ""
      ? "/auction-tools.js"
      : `${configuredBasePath}/auction-tools.js`;
  return `
const BASE_PATH = ${JSON.stringify(configuredBasePath)};
const KEY_TOOLS_MODULE_PATH = ${JSON.stringify(keyToolsModulePath)};
const AUCTION_TOOLS_MODULE_PATH = ${JSON.stringify(auctionToolsModulePath)};
const PROTOCOL_ID = ${JSON.stringify(PROTOCOL_NAME)};
const PRODUCT_LABEL = ${JSON.stringify(PRODUCT_NAME)};
const TRANSFER_PACKAGE_FORMAT = ${JSON.stringify(TRANSFER_PACKAGE_FORMAT)};
const TRANSFER_PACKAGE_VERSION = ${JSON.stringify(TRANSFER_PACKAGE_VERSION)};
const TRANSFER_PROGRESS_STORAGE_KEY = "ont.transfer-progress.v1";
const PRIVATE_FUNDING_STORAGE_KEY = "ont.private-funding.v1";
const state = {
  config: null,
  health: null,
  names: [],
  activity: [],
  activeNameActivity: [],
  transferGeneratedOwnerKey: null,
  transferDraft: null,
  privateAuctionSmokeStatus: null,
  auctionLab: null,
  experimentalAuctions: null,
  auctionBidPackages: new Map(),
  auctionBidArtifacts: new Map(),
  auctionGeneratedOwnerKeys: new Map(),
  auctionOwnerKeyConfirmations: new Map(),
  nameFilter: "all",
  activityFilter: "all",
  txCache: new Map()
};

const elements = {
  searchForm: document.getElementById("searchForm"),
  nameInput: document.getElementById("nameInput"),
  searchResult: document.getElementById("searchResult"),
  privateFundingForm: document.getElementById("privateFundingForm"),
  privateFundingAddressInput: document.getElementById("privateFundingAddressInput"),
  privateFundingAmountInput: document.getElementById("privateFundingAmountInput"),
  privateFundingResult: document.getElementById("privateFundingResult"),
  transferDraftForm: document.getElementById("transferDraftForm"),
  transferNameInput: document.getElementById("transferNameInput"),
  transferNewOwnerPubkeyInput: document.getElementById("transferNewOwnerPubkeyInput"),
  generateTransferOwnerKeyLocalButton: document.getElementById("generateTransferOwnerKeyLocalButton"),
  transferReviewRoleInput: document.getElementById("transferReviewRoleInput"),
  transferReviewFileInput: document.getElementById("transferReviewFileInput"),
  transferReviewPackageInput: document.getElementById("transferReviewPackageInput"),
  reviewTransferPackageButton: document.getElementById("reviewTransferPackageButton"),
  transferModeInput: document.getElementById("transferModeInput"),
  transferSellerPayoutAddressInput: document.getElementById("transferSellerPayoutAddressInput"),
  transferBondAddressInput: document.getElementById("transferBondAddressInput"),
  downloadTransferSellerPackageButton: document.getElementById("downloadTransferSellerPackageButton"),
  downloadTransferBuyerPackageButton: document.getElementById("downloadTransferBuyerPackageButton"),
  downloadTransferPackageButton: document.getElementById("downloadTransferPackageButton"),
  downloadTransferSellerNotesButton: document.getElementById("downloadTransferSellerNotesButton"),
  downloadTransferBuyerNotesButton: document.getElementById("downloadTransferBuyerNotesButton"),
  transferDraftResult: document.getElementById("transferDraftResult"),
  transferRecipientKeyResult: document.getElementById("transferRecipientKeyResult"),
  transferPackageReviewResult: document.getElementById("transferPackageReviewResult"),
  trackedNames: document.getElementById("trackedNames"),
  immatureNames: document.getElementById("immatureNames"),
  matureNames: document.getElementById("matureNames"),
  invalidNames: document.getElementById("invalidNames"),
  currentHeight: document.getElementById("currentHeight"),
  currentBlockHash: document.getElementById("currentBlockHash"),
  syncMode: document.getElementById("syncMode"),
  networkLabel: document.getElementById("networkLabel"),
  networkSource: document.getElementById("networkSource"),
  networkChain: document.getElementById("networkChain"),
  networkResolver: document.getElementById("networkResolver"),
  chainSummary: document.getElementById("chainSummary"),
  privateAuctionSmokeMeta: document.getElementById("privateAuctionSmokeMeta"),
  privateAuctionSmokeResult: document.getElementById("privateAuctionSmokeResult"),
  auctionLabMeta: document.getElementById("auctionLabMeta"),
  auctionPolicySummary: document.getElementById("auctionPolicySummary"),
  auctionLabList: document.getElementById("auctionLabList"),
  experimentalAuctionMeta: document.getElementById("experimentalAuctionMeta"),
  experimentalAuctionList: document.getElementById("experimentalAuctionList"),
  recentNamesState: document.getElementById("recentNamesState"),
  recentNamesList: document.getElementById("recentNamesList"),
  activityFilters: document.getElementById("activityFilters"),
  activityHighlights: document.getElementById("activityHighlights"),
  activityState: document.getElementById("activityState"),
  activityList: document.getElementById("activityList"),
  pendingState: document.getElementById("pendingState"),
  pendingList: document.getElementById("pendingList"),
  namesFilters: document.getElementById("namesFilters"),
  namesState: document.getElementById("namesState"),
  namesList: document.getElementById("namesList"),
  exploreEmptyState: document.getElementById("explore-empty-state"),
  exploreEmptyStateMessage: document.getElementById("exploreEmptyStateMessage"),
  exploreEmptyStateDetail: document.getElementById("exploreEmptyStateDetail")
};

function updateTransferActionStates() {
  const hasTransferDraft = state.transferDraft !== null;
  const canExportPackage = hasTransferDraft && state.transferDraft?.kind !== "invalid";

  if (elements.downloadTransferSellerPackageButton instanceof HTMLButtonElement) {
    elements.downloadTransferSellerPackageButton.disabled = !canExportPackage;
  }
  if (elements.downloadTransferBuyerPackageButton instanceof HTMLButtonElement) {
    elements.downloadTransferBuyerPackageButton.disabled = !canExportPackage;
  }
  if (elements.downloadTransferPackageButton instanceof HTMLButtonElement) {
    elements.downloadTransferPackageButton.disabled = !canExportPackage;
  }
  if (elements.downloadTransferSellerNotesButton instanceof HTMLButtonElement) {
    elements.downloadTransferSellerNotesButton.disabled = !hasTransferDraft;
  }
  if (elements.downloadTransferBuyerNotesButton instanceof HTMLButtonElement) {
    elements.downloadTransferBuyerNotesButton.disabled = !hasTransferDraft;
  }
}

function readStoredObject(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredObject(key, payload) {
  try {
    const hasMeaningfulValue = Object.values(payload).some((value) => typeof value === "string" && value.trim() !== "");
    if (!hasMeaningfulValue) {
      window.localStorage.removeItem(key);
      return;
    }

    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Ignore storage failures in the browser-only convenience layer.
  }
}

let keyToolsPromise = null;
let auctionToolsPromise = null;

async function loadKeyTools() {
  if (keyToolsPromise === null) {
    keyToolsPromise = import(KEY_TOOLS_MODULE_PATH);
  }

  return keyToolsPromise;
}

async function loadAuctionTools() {
  if (auctionToolsPromise === null) {
    auctionToolsPromise = import(AUCTION_TOOLS_MODULE_PATH);
  }

  return auctionToolsPromise;
}

async function generateLocalBrowserOwnerKey() {
  const keyTools = await loadKeyTools();
  const generated = keyTools.generateBrowserOwnerKey();

  return {
    ownerPubkey: generated.ownerPubkey,
    privateKeyHex: generated.privateKeyHex,
    source: "browser-local",
    sourceLabel: "local browser",
    warning:
      "Generated locally in this browser. Save this private key if you want to update destinations or authorize transfers later."
  };
}

function applyGeneratedTransferOwnerKey(generated, updateMessage) {
  state.transferGeneratedOwnerKey = generated;
  if (elements.transferNewOwnerPubkeyInput) {
    elements.transferNewOwnerPubkeyInput.value = generated.ownerPubkey;
  }
  persistTransferProgress();
  if (state.transferDraft !== null) {
    state.transferDraft = null;
    renderTransferDraftMessage(updateMessage);
  } else {
    updateTransferActionStates();
  }
  renderTransferRecipientKey(generated);
}

function restoreTransferProgress(initialTransferName) {
  const saved = readStoredObject(TRANSFER_PROGRESS_STORAGE_KEY);
  if (!saved) {
    return false;
  }

  const transferName = typeof saved.transferName === "string" ? saved.transferName : "";
  const newOwnerPubkey = typeof saved.newOwnerPubkey === "string" ? saved.newOwnerPubkey : "";
  const mode = typeof saved.mode === "string" ? saved.mode : "";
  const sellerPayoutAddress = typeof saved.sellerPayoutAddress === "string" ? saved.sellerPayoutAddress : "";
  const bondAddress = typeof saved.bondAddress === "string" ? saved.bondAddress : "";
  let restored = false;

  if (elements.transferNameInput && !elements.transferNameInput.value && !initialTransferName && transferName) {
    elements.transferNameInput.value = transferName;
    restored = true;
  }
  if (elements.transferNewOwnerPubkeyInput && !elements.transferNewOwnerPubkeyInput.value && newOwnerPubkey) {
    elements.transferNewOwnerPubkeyInput.value = newOwnerPubkey;
    restored = true;
  }
  if (elements.transferModeInput && !elements.transferModeInput.value && mode) {
    elements.transferModeInput.value = mode;
    restored = true;
  }
  if (elements.transferSellerPayoutAddressInput && !elements.transferSellerPayoutAddressInput.value && sellerPayoutAddress) {
    elements.transferSellerPayoutAddressInput.value = sellerPayoutAddress;
    restored = true;
  }
  if (elements.transferBondAddressInput && !elements.transferBondAddressInput.value && bondAddress) {
    elements.transferBondAddressInput.value = bondAddress;
    restored = true;
  }

  return restored;
}

function persistTransferProgress() {
  writeStoredObject(TRANSFER_PROGRESS_STORAGE_KEY, {
    transferName: elements.transferNameInput?.value ?? "",
    newOwnerPubkey: elements.transferNewOwnerPubkeyInput?.value ?? "",
    mode: elements.transferModeInput?.value ?? "",
    sellerPayoutAddress: elements.transferSellerPayoutAddressInput?.value ?? "",
    bondAddress: elements.transferBondAddressInput?.value ?? ""
  });
}

void bootstrap();

async function bootstrap() {
  const initialDetailName = getInitialDetailName();
  const initialAuctionName = getInitialAuctionName();
  const initialTransferName = getInitialTransferName();
  const restoredTransferProgress = restoreTransferProgress(initialTransferName);

  if (initialTransferName && elements.transferNameInput && !elements.transferNameInput.value) {
    elements.transferNameInput.value = initialTransferName;
  }

  persistTransferProgress();

  updateTransferActionStates();

  try {
    const shouldLoadAuctionLab = elements.auctionLabList !== null;
    const shouldLoadExperimentalAuctions = elements.experimentalAuctionList !== null || elements.searchResult !== null;
    const [config, health, namesPayload, activityPayload, auctionLabPayload, experimentalAuctionsPayload] = await Promise.all([
      fetchJson(withBasePath("/api/config")),
      fetchJson(withBasePath("/api/health")),
      fetchJson(withBasePath("/api/names")),
      fetchJson(withBasePath("/api/activity?limit=10")),
      shouldLoadAuctionLab ? fetchJson(getAuctionLabApiPath()).catch(() => null) : Promise.resolve(null),
      shouldLoadExperimentalAuctions ? fetchJson(withBasePath("/api/experimental-auctions")).catch(() => null) : Promise.resolve(null)
    ]);
    const privateAuctionSmokeStatus = config.showPrivateAuctionSmoke
      ? await fetchJson(withBasePath("/api/private-auction-smoke-status")).catch(() => null)
      : null;

    state.config = config;
    state.health = health;
    // L1 names + cheap-rail (accumulator) names mapped to the same row shape. Cheap-rail
    // names have no bond, so the bond fields are empty/zero (honest, not fabricated);
    // they resolve as owned (status "mature") and carry acquisitionKind "accumulator".
    const l1Names = Array.isArray(namesPayload.names) ? namesPayload.names : [];
    const accumulatorNames = Array.isArray(namesPayload.accumulatorNames)
      ? namesPayload.accumulatorNames.map((record) => ({
          name: record.name,
          status: "mature",
          currentOwnerPubkey: record.currentOwnerPubkey,
          claimHeight: record.claimHeight,
          maturityHeight: record.claimHeight,
          currentBondTxid: "",
          currentBondVout: 0,
          currentBondValueSats: "0",
          requiredBondSats: "0",
          acquisitionKind: "accumulator"
        }))
      : [];
    state.names = [...l1Names, ...accumulatorNames];
    state.activity = Array.isArray(activityPayload.activity) ? activityPayload.activity : [];
    state.privateAuctionSmokeStatus = privateAuctionSmokeStatus;
    state.auctionLab = auctionLabPayload;
    state.experimentalAuctions = experimentalAuctionsPayload;

    renderHealth();
    renderPrivateAuctionSmokeStatus();
    renderAuctionLab();
    renderExperimentalAuctionFeed();
    renderRecentNames();
    renderActivity();
    renderNames();
    renderExploreEmptyState();

    if (initialDetailName) {
      if (elements.nameInput) {
        elements.nameInput.value = initialDetailName;
      }
      await resolveNameLookup(initialDetailName, {
        updateHistory: false
      });
    } else if (isAuctionsPage() && initialAuctionName) {
      if (elements.nameInput) {
        elements.nameInput.value = initialAuctionName;
      }
      await resolveNameLookup(initialAuctionName, {
        updateHistory: false
      });
    } else if (isTransferPrepPage() && initialTransferName) {
      renderTransferDraftMessage(
        'Ready to prepare a transfer for "' +
          initialTransferName +
          '". Add the recipient pubkey and the site will recommend the right transfer path from the current name state.'
      );
    } else if (isTransferPrepPage() && restoredTransferProgress) {
      renderTransferDraftMessage(
        "Recovered transfer details from this browser. Prepare the transfer again to resume."
      );
    }
  } catch (error) {
    renderBootError(error);
  }

  elements.searchForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const rawName = elements.nameInput?.value?.trim() ?? "";
    if (rawName.length === 0) {
      renderSearchMessage("Enter a name to resolve.");
      return;
    }
    await resolveNameLookup(rawName, {
      updateHistory: true
    });
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const source = target.getAttribute("data-auction-package-source");
    const id =
      target.getAttribute("data-auction-bidder-id")
      ?? target.getAttribute("data-auction-bid-amount")
      ?? target.getAttribute("data-auction-funding-output")
      ?? target.getAttribute("data-auction-rebid-output")
      ?? target.getAttribute("data-auction-owner-pubkey")
      ?? target.getAttribute("data-auction-owner-key-confirm-pubkey")
      ?? target.getAttribute("data-auction-bidder-mirror")
      ?? target.getAttribute("data-auction-owner-mirror");

    if (!source || !id) {
      return;
    }

    if (
      target instanceof HTMLInputElement
      && (target.hasAttribute("data-auction-funding-output") || target.hasAttribute("data-auction-rebid-output"))
    ) {
      const amountInput = document.querySelector('[data-auction-funding-amount="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
      const addressInput = document.querySelector('[data-auction-funding-address="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
      const descriptorInput = document.querySelector('[data-auction-funding-inputs="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
      setAuctionFundingFieldValue(amountInput, "");
      setAuctionFundingAddressDisplay(addressInput, "");
      setAuctionFundingFieldValue(descriptorInput, "");
      window.localStorage.removeItem(PRIVATE_FUNDING_STORAGE_KEY);
      updateAuctionFundingOutputNote(source, id);
    }

    if (target instanceof HTMLInputElement && target.hasAttribute("data-auction-bidder-mirror")) {
      const hiddenBidder = document.querySelector('[data-auction-bidder-id="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
      if (hiddenBidder instanceof HTMLInputElement) {
        hiddenBidder.value = target.value;
      }
    }

    if (target instanceof HTMLInputElement && target.hasAttribute("data-auction-owner-mirror")) {
      const hiddenOwner = document.querySelector('[data-auction-owner-pubkey="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
      if (hiddenOwner instanceof HTMLInputElement) {
        hiddenOwner.value = target.value;
      }
    }

    if (target instanceof HTMLInputElement && target.hasAttribute("data-auction-owner-pubkey")) {
      clearAuctionOwnerKeyConfirmation(buildAuctionPackageDomKey(source, id));
    }

    const domKey = buildAuctionPackageDomKey(source, id);
    state.auctionBidPackages.delete(domKey);
    state.auctionBidArtifacts.delete(domKey);
    setAuctionBidPackagePreview(domKey, "");
    setAuctionArtifactsPreview(domKey, "");
    setAuctionBidPackageMessage(domKey, "Inputs changed. Build the Sparrow PSBT again before signing.");
    setAuctionArtifactsMessage(domKey, "Inputs changed. Download a fresh Sparrow PSBT before signing.");
    updateAuctionPsbtActionState(source, id, domKey);
  });

  document.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (!(target instanceof HTMLInputElement) || !target.hasAttribute("data-auction-owner-key-file")) {
      return;
    }

    const source = target.getAttribute("data-auction-package-source");
    const id = target.getAttribute("data-auction-package-id");
    if (!source || !id) {
      return;
    }

    const domKey = buildAuctionPackageDomKey(source, id);
    const ownerPubkeyInput = document.querySelector(
      '[data-auction-owner-pubkey="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]'
    );
    const generated = getGeneratedAuctionOwnerKeyForBid(
      domKey,
      ownerPubkeyInput instanceof HTMLInputElement ? ownerPubkeyInput.value.trim() : ""
    );
    if (!generated) {
      setAuctionOwnerKeyHelperMessage(domKey, "Create or choose the ONT recovery kit for this bid before confirming it.");
      updateAuctionPsbtActionState(source, id, domKey);
      return;
    }

    const file = target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseGeneratedOwnerKeyBackupText(text);
      if (!parsed.ownerPubkey || !parsed.privateKeyHex) {
        throw new Error("That file does not look like an ONT recovery kit.");
      }
      if (String(parsed.ownerPubkey) !== String(generated.ownerPubkey)) {
        throw new Error("That recovery kit does not match this bid's owner key.");
      }
      applyAuctionOwnerKeyConfirmation(domKey, generated.ownerPubkey, "file upload");
      renderAuctionOwnerKeyHelper(domKey, source, id, target.getAttribute("data-auction-name"), generated);
      setAuctionArtifactsMessage(domKey, "ONT recovery kit confirmed. You can now build the bid transaction.");
      updateAuctionPsbtActionState(source, id, domKey);
    } catch (error) {
      setAuctionArtifactsMessage(domKey, describeError(error));
      updateAuctionPsbtActionState(source, id, domKey);
    }
  });

  elements.generateTransferOwnerKeyLocalButton?.addEventListener("click", async () => {
    renderTransferRecipientKeyMessage("Creating a recipient key in this browser...");

    try {
      const generated = await generateLocalBrowserOwnerKey();
      applyGeneratedTransferOwnerKey(
        generated,
        "Recipient key updated. Prepare the transfer again so the handoff stays in sync."
      );
    } catch (error) {
      renderTransferRecipientKeyError(error);
    }
  });

  elements.transferReviewFileInput?.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    const file = target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      if (elements.transferReviewPackageInput instanceof HTMLTextAreaElement) {
        elements.transferReviewPackageInput.value = text;
      }
      renderTransferPackageReviewMessage(
        "Loaded package file. Choose your role, then review the package."
      );
    } catch (error) {
      renderTransferPackageReviewError(error);
    }
  });

  elements.reviewTransferPackageButton?.addEventListener("click", () => {
    const rawPackage = elements.transferReviewPackageInput?.value?.trim() ?? "";
    const role = elements.transferReviewRoleInput?.value === "seller" ? "seller" : "buyer";

    if (rawPackage.length === 0) {
      renderTransferPackageReviewMessage("Paste or upload a transfer package JSON file first.");
      return;
    }

    try {
      const parsed = parseTransferPackageForReview(JSON.parse(rawPackage));
      renderTransferPackageReview(parsed, role);
    } catch (error) {
      renderTransferPackageReviewError(error);
    }
  });

  elements.privateFundingForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const address = elements.privateFundingAddressInput?.value?.trim() ?? "";
    if (address.length === 0) {
      renderPrivateFundingMessage("Paste a Sparrow receive address first.");
      return;
    }
    const amountBtc = elements.privateFundingAmountInput instanceof HTMLInputElement
      ? elements.privateFundingAmountInput.value.trim()
      : "";

    renderPrivateFundingMessage("Funding your private signet wallet... this can take around 20 seconds while the demo chain mines a block.");

    try {
      const result = await postJson(withBasePath("/api/private-signet-fund"), {
        address,
        ...(amountBtc.length > 0 ? { amountBtc } : {})
      });
      renderPrivateFundingResult(result);
    } catch (error) {
      renderPrivateFundingError(error);
    }
  });

  [
    elements.transferNameInput,
    elements.transferNewOwnerPubkeyInput,
    elements.transferModeInput,
    elements.transferSellerPayoutAddressInput,
    elements.transferBondAddressInput
  ].forEach((input) => {
    const handleTransferMutation = () => {
      persistTransferProgress();

      if (state.transferDraft !== null) {
        state.transferDraft = null;
        renderTransferDraftMessage("Transfer details changed. Prepare the transfer again so the handoff stays in sync.");
        return;
      }

      updateTransferActionStates();
    };

    input?.addEventListener("input", handleTransferMutation);
    input?.addEventListener("change", handleTransferMutation);
  });

  elements.transferDraftForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const rawName = elements.transferNameInput?.value?.trim() ?? "";
    const newOwnerPubkey = elements.transferNewOwnerPubkeyInput?.value?.trim() ?? "";
    const mode = elements.transferModeInput?.value?.trim() ?? "auto";
    const sellerPayoutAddress = elements.transferSellerPayoutAddressInput?.value?.trim() ?? "";
    const bondAddress = elements.transferBondAddressInput?.value?.trim() ?? "";

    if (rawName.length === 0) {
      renderTransferDraftMessage("Enter the name you want to transfer first.");
      return;
    }

    if (newOwnerPubkey.length === 0) {
      renderTransferDraftMessage("Enter the recipient pubkey in 32-byte hex form.");
      return;
    }

    if ((mode === "sale" || mode === "immature-sale") && sellerPayoutAddress.length === 0) {
      renderTransferDraftMessage("Enter a seller payout address for a sale transfer, or switch Transfer Type to gift.");
      return;
    }

    if (mode === "gift" && sellerPayoutAddress.length > 0) {
      renderTransferDraftMessage("Clear the seller payout address for a gift transfer, or switch Transfer Type to sale.");
      return;
    }

    const normalizedName = rawName.toLowerCase();
    if (elements.transferNameInput) {
      elements.transferNameInput.value = normalizedName;
    }

    renderTransferDraftMessage("Preparing transfer...");

    try {
      const [record, activityPayload] = await Promise.all([
        fetchJson(withBasePath("/api/name/" + encodeURIComponent(normalizedName))),
        fetchJson(withBasePath("/api/name/" + encodeURIComponent(normalizedName) + "/activity?limit=6")).catch(() => ({ activity: [] }))
      ]);

      const draft = buildTransferDraft({
        record,
        activity: Array.isArray(activityPayload.activity) ? activityPayload.activity : [],
        newOwnerPubkey,
        mode,
        sellerPayoutAddress,
        bondAddress
      });
      state.transferDraft = draft;
      renderTransferDraft(draft);
      updateTransferActionStates();
    } catch (error) {
      renderTransferDraftError(error, normalizedName);
    }
  });

  elements.downloadTransferSellerPackageButton?.addEventListener("click", () => {
    if (!state.transferDraft) {
      renderTransferDraftMessage("Prepare a transfer before downloading the owner package.");
      return;
    }

    if (state.transferDraft.kind === "invalid") {
      renderTransferDraftMessage("Released names need a fresh auction path, so there is no owner package to export.");
      return;
    }

    downloadJsonFile(
      buildSellerTransferPackage(state.transferDraft),
      "ont-transfer-" + state.transferDraft.name + "-seller-package.json"
    );
  });

  elements.downloadTransferBuyerPackageButton?.addEventListener("click", () => {
    if (!state.transferDraft) {
      renderTransferDraftMessage("Prepare a transfer before downloading the receiver package.");
      return;
    }

    if (state.transferDraft.kind === "invalid") {
      renderTransferDraftMessage("Released names need a fresh auction path, so there is no receiver package to export.");
      return;
    }

    downloadJsonFile(
      buildBuyerTransferPackage(state.transferDraft),
      "ont-transfer-" + state.transferDraft.name + "-buyer-package.json"
    );
  });

  elements.downloadTransferSellerNotesButton?.addEventListener("click", () => {
    if (!state.transferDraft) {
      renderTransferDraftMessage("Prepare a transfer before downloading owner notes.");
      return;
    }

    downloadTextFile(
      buildSellerTransferNotesText(state.transferDraft),
      "ont-transfer-" + state.transferDraft.name + "-seller-notes.txt"
    );
  });

  elements.downloadTransferBuyerNotesButton?.addEventListener("click", () => {
    if (!state.transferDraft) {
      renderTransferDraftMessage("Prepare a transfer before downloading receiver notes.");
      return;
    }

    downloadTextFile(
      buildBuyerTransferNotesText(state.transferDraft),
      "ont-transfer-" + state.transferDraft.name + "-buyer-notes.txt"
    );
  });

  elements.downloadTransferPackageButton?.addEventListener("click", () => {
    if (!state.transferDraft) {
      renderTransferDraftMessage("Prepare a transfer before downloading the handoff.");
      return;
    }

    if (state.transferDraft.kind === "invalid") {
      renderTransferDraftMessage("Released names need a fresh auction path, so there is no transfer package to export.");
      return;
    }

    const transferPackage = buildTransferPackage(state.transferDraft);
    downloadJsonFile(transferPackage, "ont-transfer-" + state.transferDraft.name + "-package.json");
  });

  document.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const namesFilterButton = target.closest("[data-names-filter]");
    if (namesFilterButton instanceof HTMLElement) {
      const nextFilter = namesFilterButton.getAttribute("data-names-filter") ?? "all";
      if (state.nameFilter !== nextFilter) {
        state.nameFilter = nextFilter;
        renderNames();
      }
      return;
    }

    const activityFilterButton = target.closest("[data-activity-filter]");
    if (activityFilterButton instanceof HTMLElement) {
      const nextFilter = activityFilterButton.getAttribute("data-activity-filter") ?? "all";
      if (state.activityFilter !== nextFilter) {
        state.activityFilter = nextFilter;
        renderActivity();
      }
      return;
    }

    const txButton = target.closest("[data-view-tx]");
    if (txButton instanceof HTMLElement) {
      const txid = txButton.getAttribute("data-view-tx");
      const panelId = txButton.getAttribute("data-target-panel");

      if (!txid || !panelId) {
        return;
      }

      await openTxProvenance(txid, panelId, txButton);
      return;
    }

    const transferGeneratedOwnerKeyDownloadButton = target.closest("[data-download-transfer-generated-owner-key]");
    if (transferGeneratedOwnerKeyDownloadButton instanceof HTMLElement) {
      if (!state.transferGeneratedOwnerKey) {
        renderTransferRecipientKeyMessage("Generate a recipient key before downloading it.");
        return;
      }

      const nameHint = elements.transferNameInput?.value?.trim() || null;
      downloadTextFile(
        buildGeneratedOwnerKeyText(state.transferGeneratedOwnerKey, nameHint),
        "ont-" + (nameHint || "recipient") + "-recipient-demo-owner-key.txt"
      );
      return;
    }

    const useTransferGeneratedOwnerKeyButton = target.closest("[data-use-transfer-generated-owner-key]");
    if (useTransferGeneratedOwnerKeyButton instanceof HTMLElement) {
      if (!state.transferGeneratedOwnerKey) {
        renderTransferRecipientKeyMessage("Generate a recipient key first.");
        return;
      }

      if (elements.transferNewOwnerPubkeyInput) {
        elements.transferNewOwnerPubkeyInput.value = state.transferGeneratedOwnerKey.ownerPubkey;
        elements.transferNewOwnerPubkeyInput.focus();
      }
      persistTransferProgress();

      if (state.transferDraft !== null) {
        state.transferDraft = null;
        renderTransferDraftMessage("Recipient pubkey copied into the transfer form. Prepare the transfer again so the handoff stays in sync.");
      } else {
        renderTransferDraftMessage("Recipient pubkey copied into the transfer form. Review the details and prepare the transfer when ready.");
      }
      updateTransferActionStates();
      return;
    }

    const auctionBidPackageActionButton = target.closest("[data-auction-package-action]");
    if (auctionBidPackageActionButton instanceof HTMLElement) {
      const action = auctionBidPackageActionButton.getAttribute("data-auction-package-action");
      const source = auctionBidPackageActionButton.getAttribute("data-auction-package-source");
      const id = auctionBidPackageActionButton.getAttribute("data-auction-package-id");

      if (!action || !source || !id) {
        return;
      }

      const formValues = readAuctionBidPackageFormValues(source, id);
      if (formValues.error) {
        setAuctionBidPackageMessage(formValues.domKey, formValues.error);
        return;
      }
      if (formValues.ownerPubkey.length === 0) {
        setAuctionBidPackageMessage(formValues.domKey, "Create the ONT recovery kit first, or enter an owner pubkey in advanced details.");
        return;
      }

      setAuctionBidPackageMessage(
        formValues.domKey,
        action === "preview" ? "Building bid package preview..." : "Building bid package..."
      );

      try {
        const pkg = await ensureAuctionBidPackageForUi({
          source,
          id,
          domKey: formValues.domKey,
          bidderId: formValues.bidderId,
          ownerPubkey: formValues.ownerPubkey,
          bidAmountSats: formValues.amountSats
        });
        setAuctionBidPackagePreview(
          formValues.domKey,
          renderAuctionBidPackagePreview(pkg, source === "experimental" ? "live auction state" : "simulator state")
        );
        setAuctionBidPackageMessage(
          formValues.domKey,
          String(pkg.previewSummary ?? "Auction bid package ready.")
        );

        if (action === "download") {
          downloadJsonFile(
            pkg,
            "ont-auction-" + String(pkg.auctionId ?? id) + "-" + String(pkg.bidderId ?? formValues.bidderId) + "-bid-package.json"
          );
        }
      } catch (error) {
        state.auctionBidPackages.delete(formValues.domKey);
        state.auctionBidArtifacts.delete(formValues.domKey);
        setAuctionBidPackagePreview(formValues.domKey, "");
        setAuctionBidPackageMessage(formValues.domKey, describeError(error));
      }
      return;
    }

    const auctionArtifactsActionButton = target.closest("[data-auction-artifacts-action]");
    if (auctionArtifactsActionButton instanceof HTMLElement) {
      const action = auctionArtifactsActionButton.getAttribute("data-auction-artifacts-action");
      const source = auctionArtifactsActionButton.getAttribute("data-auction-package-source");
      const id = auctionArtifactsActionButton.getAttribute("data-auction-package-id");

      if (!action || !source || !id) {
        return;
      }

      const formValues = readAuctionBidPackageFormValues(source, id);
      if (formValues.error) {
        setAuctionBidPackageMessage(formValues.domKey, formValues.error);
        return;
      }

      if (formValues.ownerPubkey.length === 0) {
        try {
          setAuctionArtifactsMessage(formValues.domKey, "Creating the ONT recovery kit in this browser...");
          const generated = await generateLocalBrowserOwnerKey();
          state.auctionGeneratedOwnerKeys.set(formValues.domKey, generated);
          clearAuctionOwnerKeyConfirmation(formValues.domKey);
          const ownerPubkeyInput = document.querySelector(
            '[data-auction-owner-pubkey="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]'
          );
          if (ownerPubkeyInput instanceof HTMLInputElement) {
            ownerPubkeyInput.value = generated.ownerPubkey;
          }
          renderAuctionOwnerKeyHelper(formValues.domKey, source, id, auctionArtifactsActionButton.getAttribute("data-auction-name"), generated);
          formValues.ownerPubkey = generated.ownerPubkey;
          setAuctionArtifactsMessage(
            formValues.domKey,
            "ONT recovery kit created. Download and confirm it first; then build the bid transaction."
          );
          updateAuctionPsbtActionState(source, id, formValues.domKey);
          return;
        } catch (error) {
          setAuctionArtifactsMessage(formValues.domKey, describeError(error));
          return;
        }
      }

      const generatedOwnerKey = getGeneratedAuctionOwnerKeyForBid(formValues.domKey, formValues.ownerPubkey);
      if (generatedOwnerKey && !getAuctionOwnerKeyConfirmation(formValues.domKey, formValues.ownerPubkey)) {
        renderAuctionOwnerKeyHelper(formValues.domKey, source, id, auctionArtifactsActionButton.getAttribute("data-auction-name"), generatedOwnerKey);
        setAuctionArtifactsMessage(
          formValues.domKey,
          "Confirm the ONT recovery kit before building the bid transaction."
        );
        updateAuctionPsbtActionState(source, id, formValues.domKey);
        return;
      }

      setAuctionArtifactsMessage(formValues.domKey, "Checking funded Sparrow coin...");
      const expansion = await expandAuctionFundingInputsForUi(source, id);
      if (expansion.error) {
        setAuctionArtifactsMessage(formValues.domKey, expansion.error);
        return;
      }

      const artifactValues = readAuctionArtifactFormValues(source, id, formValues.domKey);
      if (artifactValues.error) {
        setAuctionArtifactsMessage(formValues.domKey, artifactValues.error);
        return;
      }

      setAuctionArtifactsMessage(
        formValues.domKey,
        action === "download-psbt"
          ? "Building Sparrow PSBT..."
          : action === "download-artifacts"
          ? "Building bid artifacts..."
          : "Building Sparrow PSBT preview..."
      );

      try {
        const pkg = await ensureAuctionBidPackageForUi({
          source,
          id,
          domKey: formValues.domKey,
          bidderId: formValues.bidderId,
          ownerPubkey: formValues.ownerPubkey,
          bidAmountSats: formValues.amountSats
        });
	        const artifacts = await buildAuctionBidArtifactsForUi({
	          bidPackage: pkg,
	          fundingInputs: artifactValues.fundingInputs,
	          feeSats: artifactValues.feeSats,
	          bondAddress: artifactValues.bondAddress,
          changeAddress: artifactValues.changeAddress
	        });
	        state.auctionBidArtifacts.set(formValues.domKey, artifacts);
	        setAuctionArtifactsPreview(formValues.domKey, renderAuctionBidArtifactsPreview(artifacts, pkg));
	        updateAuctionPsbtActionState(source, id, formValues.domKey);
	        setAuctionArtifactsMessage(
	          formValues.domKey,
	          artifactValues.usedDefaultReturnAddress
	            ? "Sparrow PSBT ready. After downloading, use Sparrow File -> Open Transaction and review the bond/change outputs before signing."
            : "Sparrow PSBT ready. After downloading, use Sparrow File -> Open Transaction, review the outputs, sign, and broadcast."
        );

        const fileStem = "ont-auction-" + String(pkg.auctionId ?? id) + "-" + String(pkg.bidderId ?? formValues.bidderId);
        if (action === "download-psbt") {
          downloadBase64File(String(artifacts.psbtBase64 ?? ""), fileStem + "-unsigned.psbt", "application/octet-stream");
          const generated = getGeneratedAuctionOwnerKeyForBid(formValues.domKey, formValues.ownerPubkey);
          if (generated) {
            setAuctionArtifactsMessage(
              formValues.domKey,
              "Sparrow PSBT downloaded. In Sparrow, choose File -> Open Transaction, select the .psbt file, review outputs, sign, and broadcast. Keep the ONT recovery kit with your wallet backup."
            );
          }
        } else if (action === "download-artifacts") {
          downloadJsonFile(artifacts, fileStem + "-bid-artifacts.json");
        }
	      } catch (error) {
	        state.auctionBidArtifacts.delete(formValues.domKey);
	        setAuctionArtifactsPreview(formValues.domKey, "");
	        updateAuctionPsbtActionState(source, id, formValues.domKey);
	        const message = describeError(error);
        if (isAuctionFundingInputProblem(message)) {
          clearAuctionFundingInput(source, id);
          window.localStorage.removeItem(PRIVATE_FUNDING_STORAGE_KEY);
          setAuctionArtifactsMessage(
            formValues.domKey,
            message + " I cleared the stale saved coin from this form. Use Get Demo Coins again, or paste a fresh unspent Sparrow coin."
          );
        } else {
          setAuctionArtifactsMessage(formValues.domKey, message);
        }
      }
      return;
    }

    const auctionOwnerKeyActionButton = target.closest("[data-auction-owner-key-action]");
    if (auctionOwnerKeyActionButton instanceof HTMLElement) {
      const action = auctionOwnerKeyActionButton.getAttribute("data-auction-owner-key-action");
      const source = auctionOwnerKeyActionButton.getAttribute("data-auction-package-source");
      const id = auctionOwnerKeyActionButton.getAttribute("data-auction-package-id");
      const name = auctionOwnerKeyActionButton.getAttribute("data-auction-name");

      if (!action || !source || !id) {
        return;
      }

      const domKey = buildAuctionPackageDomKey(source, id);
      const ownerPubkeyInput = document.querySelector(
        '[data-auction-owner-pubkey="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]'
      );

      if (action === "download") {
        const generated = state.auctionGeneratedOwnerKeys.get(domKey);
        if (!generated) {
          setAuctionOwnerKeyHelperMessage(domKey, "Create the ONT recovery kit for this bid before downloading it.");
          return;
        }

        const normalizedName = typeof name === "string" && name.trim().length > 0 ? name.trim().toLowerCase() : null;
        downloadTextFile(
          buildGeneratedOwnerKeyText(generated, normalizedName),
          "ont-" + String(normalizedName ?? "auction-bid") + "-auction-owner-key.txt"
        );
        setAuctionArtifactsMessage(
          domKey,
          "ONT recovery kit downloaded. Upload that file here, or paste the owner pubkey from it, to enable the bid transaction."
        );
        updateAuctionPsbtActionState(source, id, domKey);
        return;
      }

      if (action === "confirm-pubkey") {
        const generated = state.auctionGeneratedOwnerKeys.get(domKey);
        if (!generated) {
          setAuctionOwnerKeyHelperMessage(domKey, "Create the ONT recovery kit for this bid before confirming it.");
          updateAuctionPsbtActionState(source, id, domKey);
          return;
        }

        const confirmationInput = document.querySelector(
          '[data-auction-owner-key-confirm-pubkey="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]'
        );
        const pastedPubkey = confirmationInput instanceof HTMLInputElement ? confirmationInput.value.trim() : "";
        if (pastedPubkey.length === 0) {
          setAuctionArtifactsMessage(domKey, "Paste the owner pubkey from the ONT recovery kit to confirm it.");
          updateAuctionPsbtActionState(source, id, domKey);
          return;
        }
        if (pastedPubkey !== generated.ownerPubkey) {
          setAuctionArtifactsMessage(domKey, "That owner pubkey does not match this bid's generated key.");
          updateAuctionPsbtActionState(source, id, domKey);
          return;
        }

        applyAuctionOwnerKeyConfirmation(domKey, generated.ownerPubkey, "pubkey paste");
        renderAuctionOwnerKeyHelper(domKey, source, id, name, generated);
        setAuctionArtifactsMessage(domKey, "ONT recovery kit confirmed. You can now build the bid transaction.");
        updateAuctionPsbtActionState(source, id, domKey);
        return;
      }

      try {
        setAuctionOwnerKeyHelperMessage(
          domKey,
          action === "generate-local"
            ? "Creating the ONT recovery kit in this browser for this bid..."
            : "Creating the ONT recovery kit in this browser for this bid..."
        );

        const generated = await generateLocalBrowserOwnerKey();

        state.auctionGeneratedOwnerKeys.set(domKey, generated);
        clearAuctionOwnerKeyConfirmation(domKey);
        if (ownerPubkeyInput instanceof HTMLInputElement) {
          ownerPubkeyInput.value = generated.ownerPubkey;
          ownerPubkeyInput.focus();
        }
        const ownerPubkeyMirror = document.querySelector(
          '[data-auction-owner-mirror="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]'
        );
        if (ownerPubkeyMirror instanceof HTMLInputElement) {
          ownerPubkeyMirror.value = generated.ownerPubkey;
        }
        state.auctionBidPackages.delete(domKey);
        setAuctionBidPackagePreview(domKey, "");
        setAuctionBidPackageMessage(domKey, "Owner key updated. Preview the current bid package before downloading it.");
        renderAuctionOwnerKeyHelper(domKey, source, id, name, generated);
        updateAuctionPsbtActionState(source, id, domKey);
      } catch (error) {
        setAuctionOwnerKeyHelperMessage(domKey, describeError(error));
        updateAuctionPsbtActionState(source, id, domKey);
      }
      return;
    }

    const button = target.closest("[data-copy]");
    if (!(button instanceof HTMLElement)) {
      return;
    }

    const copyValue = button.getAttribute("data-copy");
    if (!copyValue) {
      return;
    }

    try {
      await navigator.clipboard.writeText(copyValue);
      const previous = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = previous;
      }, 1200);
    } catch {
      button.textContent = "Copy failed";
    }
  });

  window.addEventListener("popstate", () => {
    const routeName = getInitialDetailName() ?? getInitialAuctionName();
    if (!routeName) {
      hideSearchResult();
      return;
    }

    if (elements.nameInput) {
      elements.nameInput.value = routeName;
    }
    void resolveNameLookup(routeName, {
      updateHistory: false
    });
  });
}

async function resolveNameLookup(rawName, options = {}) {
  const normalizedName = rawName.trim().toLowerCase();

  if (normalizedName.length === 0) {
    renderSearchMessage("Enter a name to resolve.");
    return;
  }

  if (elements.nameInput) {
    elements.nameInput.value = normalizedName;
  }
  if (options.updateHistory !== false) {
    updateLookupHistory(normalizedName);
  }

  renderSearchMessage("Checking name...");
  state.activeNameActivity = [];

  const liveAuction = findVisibleLiveAuctionForName(normalizedName);
  if (liveAuction) {
    renderAuctionSearchResultForLiveAuction(normalizedName, liveAuction);
    return;
  }

  try {
    const [record, valueRecord, nameActivity] = await Promise.all([
      fetchJson(withBasePath("/api/name/" + encodeURIComponent(normalizedName))),
      fetchJson(withBasePath("/api/name/" + encodeURIComponent(normalizedName) + "/value")).catch((error) => {
        if (error instanceof Error && (error.code === "value_not_found" || error.code === "name_not_found")) {
          return null;
        }

        throw error;
      }),
      fetchJson(withBasePath("/api/name/" + encodeURIComponent(normalizedName) + "/activity?limit=6"))
        .then((payload) => (Array.isArray(payload.activity) ? payload.activity : []))
        .catch((error) => {
          if (error instanceof Error && error.code === "name_not_found") {
            return [];
          }

          throw error;
        })
    ]);
    state.activeNameActivity = nameActivity;
    renderSearchRecord(record, valueRecord);
  } catch (error) {
    if (error instanceof Error && error.code === "name_not_found") {
      state.activeNameActivity = [];
      try {
        renderAuctionFirstNameNotFound(normalizedName);
      } catch (renderError) {
        renderSearchError(renderError);
      }
      return;
    }

    renderSearchError(error);
  }
}

function renderHealth() {
  const health = state.health;
  if (!health) {
    return;
  }

  const stats = health.stats ?? {};
  const claimedNames = state.names.length;
  const immatureNames = state.names.filter((record) => record.status === "immature").length;
  const matureNames = state.names.filter((record) => record.status === "mature").length;
  const invalidNames = state.names.filter((record) => record.status === "invalid").length;
  setText(elements.syncMode, formatSyncMode(health.syncMode ?? "unknown"));
  setText(elements.networkLabel, String(state.config?.networkLabel ?? "Unknown Network"));
  setText(elements.networkSource, String(health.source ?? "unknown"));
  setText(elements.networkChain, String(health.rpcChainInfo?.chain ?? "-"));
  setText(elements.networkResolver, String(health.descriptor ?? "Unknown resolver"));
  setText(elements.trackedNames, String(claimedNames));
  setText(elements.immatureNames, String(immatureNames));
  setText(elements.matureNames, String(matureNames));
  setText(elements.invalidNames, String(invalidNames));
  setText(elements.currentHeight, stats.currentHeight == null ? "-" : String(stats.currentHeight));
  setCompactHash(elements.currentBlockHash, stats.currentBlockHash ?? "-");
  setText(
    elements.chainSummary,
    [
      state.config?.networkLabel ?? "Unknown Network",
      "Height " + (stats.currentHeight == null ? "-" : String(stats.currentHeight)),
      String(claimedNames) + " names",
      String(immatureNames) + " settling",
      String(matureNames) + " active"
    ].join(" · ")
  );
}

function renderNames() {
  const list = elements.namesList;
  if (!list) {
    return;
  }

  renderNamesFilters();

  if (state.names.length === 0) {
    const resolverEmpty = !resolverHasVisibleState();
    setText(
      elements.namesState,
      resolverEmpty
        ? "Resolver reachable · waiting for a new demo reseed."
        : "No tracked names are visible from the resolver yet."
    );
    list.innerHTML = resolverEmpty
      ? renderExploreResolverEmptyCard(
          "Registry Waiting For Seed Data",
          "Owned, settling, and released names will appear here after the canonical demo seed or a fresh auction walkthrough lands on this resolver."
        )
      : "";
    return;
  }

  const filteredNames = state.names.filter((record) => matchesNameFilter(record, state.nameFilter));
  const totalLabel = state.names.length + " tracked name" + (state.names.length === 1 ? "" : "s");

  if (filteredNames.length === 0) {
    setText(elements.namesState, totalLabel + " · no names match the current filter");
    list.innerHTML = "";
    return;
  }

  setText(
    elements.namesState,
    totalLabel +
      " · showing " +
      filteredNames.length +
      " " +
      (state.nameFilter === "all" ? "across all states" : "in " + formatNameFilterLabel(state.nameFilter).toLowerCase())
  );
  const groups = buildNameGroups(filteredNames);
  list.innerHTML =
    '<div class="name-groups">' +
    groups
      .map((group) => {
        return \`
          <section class="name-group \${group.compact ? "compact-group" : ""}">
            <div class="name-group-head">
              <div class="name-group-copy">
                <h3>\${escapeHtml(group.title)}</h3>
                <p>\${escapeHtml(group.description)}</p>
              </div>
              <span class="name-group-count">\${escapeHtml(String(group.records.length))}</span>
            </div>
            \${group.compact
              ? '<div class="compact-name-list">' + group.records.map((record) => renderCompactNameCard(record)).join("") + "</div>"
              : '<div class="name-group-list">' + group.records.map((record) => renderNameCard(record)).join("") + "</div>"}
          </section>
        \`;
      })
      .join("") +
    "</div>";
}

function renderExploreEmptyState() {
  const panel = elements.exploreEmptyState;
  if (!(panel instanceof HTMLElement)) {
    return;
  }

  if (resolverHasVisibleState()) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  const networkLabel = String(state.config?.networkLabel ?? "live demo");
  const currentHeight = state.health?.stats?.currentHeight ?? null;

  setText(
    elements.exploreEmptyStateMessage,
    "This " + networkLabel + " resolver is reachable, but it is not showing any seeded names, auction activity, or resolver updates right now."
  );
  setText(
    elements.exploreEmptyStateDetail,
    currentHeight == null
      ? "That usually means the demo chain was reset or has not been reseeded yet."
      : "Current height " + String(currentHeight) + ". That usually means the demo chain was reset or has not been reseeded yet."
  );
}

function renderRecentNames() {
  const list = elements.recentNamesList;
  if (!list) {
    return;
  }

  if (state.names.length === 0) {
    const resolverEmpty = !resolverHasVisibleState();
    setText(
      elements.recentNamesState,
      resolverEmpty
        ? "Resolver reachable · waiting for a new demo reseed."
        : "No tracked names are visible from the resolver yet."
    );
    list.innerHTML = resolverEmpty
      ? renderExploreResolverEmptyCard(
          "No Recorded Names Yet",
          "Once the demo chain is reseeded, newly owned and transferred names will show up here in recency order."
        )
      : "";
    return;
  }

  const recentNames = buildRecentNames(state.names, state.activity).slice(0, 10);
  setText(
    elements.recentNamesState,
    state.names.length +
      " tracked name" +
      (state.names.length === 1 ? "" : "s") +
      " · showing the 10 most recent state changes"
  );
  list.innerHTML = recentNames.map((record) => renderRecentNameRow(record)).join("");
}

function renderActivity() {
  const list = elements.activityList;
  if (!list) {
    return;
  }

  const highlightsContainer = elements.activityHighlights;

  renderActivityFilters();

  if (state.activity.length === 0) {
    const resolverEmpty = !resolverHasVisibleState();
    setText(
      elements.activityState,
      resolverEmpty
        ? "Resolver reachable · waiting for a new demo reseed."
        : "No recent Open Name Tags activity is visible from the resolver yet."
    );
    if (highlightsContainer) {
      highlightsContainer.innerHTML = resolverEmpty
        ? renderExploreResolverEmptyCard(
            "No Recent Activity Yet",
            "Auction bids, transfers, and destination updates will appear here once this resolver has visible chain activity again."
          )
        : "";
    }
    list.innerHTML = "";
    return;
  }

  const filteredActivity = state.activity.filter((record) => matchesActivityFilter(record, state.activityFilter));

  if (filteredActivity.length === 0) {
    setText(
      elements.activityState,
      state.activity.length +
        " recent transaction" +
        (state.activity.length === 1 ? "" : "s") +
        " · none match the current filter"
    );
    if (highlightsContainer) {
      highlightsContainer.innerHTML = "";
    }
    list.innerHTML = "";
    return;
  }

  setText(
    elements.activityState,
    state.activity.length +
      " recent transaction" +
      (state.activity.length === 1 ? "" : "s") +
      " · showing " +
      filteredActivity.length +
      " " +
      (state.activityFilter === "all" ? "across all types" : "in " + formatActivityFilterLabel(state.activityFilter).toLowerCase())
  );

  if (highlightsContainer) {
    const highlightedActivity = buildActivityHighlights(filteredActivity);
    highlightsContainer.innerHTML =
      highlightedActivity.length === 0
        ? ""
        : highlightedActivity.map((record, index) => renderActivityHighlightCard(record, index)).join("");
  }

  list.innerHTML = filteredActivity
    .map((record, index) => renderActivityCard(record, "activity", index))
    .join("");
}

function renderRelatedActivitySection(activity, panelPrefix) {
  if (!Array.isArray(activity) || activity.length === 0) {
    return "";
  }

  return \`
    <div class="step-list">
      <p class="step-list-label">Related Activity</p>
      <div class="activity-list">
        \${activity.map((record, index) => renderActivityCard(record, panelPrefix, index)).join("")}
      </div>
    </div>
  \`;
}

function renderNamesFilters() {
  if (!elements.namesFilters) {
    return;
  }

  const options = [
    { value: "all", label: "All" },
    { value: "immature", label: "Settling" },
    { value: "mature", label: "Active" },
    { value: "invalid", label: "Released" }
  ];

  elements.namesFilters.innerHTML = options
    .map((option) => {
      const count =
        option.value === "all"
          ? state.names.length
          : state.names.filter((record) => String(record.status) === option.value).length;

      return (
        '<button type="button" class="filter-chip' +
        (state.nameFilter === option.value ? " active" : "") +
        '" data-names-filter="' +
        escapeHtml(option.value) +
        '">' +
        escapeHtml(option.label) +
        " · " +
        escapeHtml(String(count)) +
        "</button>"
      );
    })
    .join("");
}

function renderActivityFilters() {
  if (!elements.activityFilters) {
    return;
  }

  const options = [
    { value: "all", label: "All" },
    { value: "acquisitions", label: "Acquisitions" },
    { value: "transfers", label: "Transfers" },
    { value: "invalidated", label: "Invalidations" }
  ];

  elements.activityFilters.innerHTML = options
    .map((option) => {
      const count =
        option.value === "all"
          ? state.activity.length
          : state.activity.filter((record) => matchesActivityFilter(record, option.value)).length;

      return (
        '<button type="button" class="filter-chip' +
        (state.activityFilter === option.value ? " active" : "") +
        '" data-activity-filter="' +
        escapeHtml(option.value) +
        '">' +
        escapeHtml(option.label) +
        " · " +
        escapeHtml(String(count)) +
        "</button>"
      );
    })
    .join("");
}

function renderActivityCard(record, panelPrefix, index) {
  const panelId = panelPrefix + "TxPanel-" + index + "-" + record.txid;
  const affectedNames = summarizeActivityNames(record);
  const eventBadges = summarizeActivityBadges(record);

  return \`
    <article class="activity-card">
      <div class="result-title">
        <h3>\${escapeHtml(summarizeActivityTitle(record))}</h3>
        <span class="status-pill \${escapeHtml(activityStatusPill(record))}">\${escapeHtml(activityStatusLabel(record))}</span>
      </div>
      <p class="pending-meta">\${escapeHtml(summarizeActivityCopy(record))}</p>
      <div class="activity-badge-row">
        \${eventBadges.map((badge) => '<span class="activity-badge' + (badge.kind === "invalidated" ? ' invalidated' : "") + '">' + escapeHtml(badge.label) + "</span>").join("")}
      </div>
      <div class="result-grid">
        <div class="result-item">
          <label>Block Height</label>
          <p class="field-value">\${escapeHtml(String(record.blockHeight))}</p>
        </div>
        <div class="result-item">
          <label>Affected Names</label>
          <p class="field-value">\${escapeHtml(affectedNames.length === 0 ? "None" : affectedNames.join(", "))}</p>
        </div>
        <div class="result-item">
          <label>Txid</label>
          \${renderCopyableCode(record.txid)}
        </div>
        <div class="result-item">
          <label>Inputs / Outputs</label>
          <p class="field-value">\${escapeHtml(String((record.inputs ?? []).length) + " in · " + String((record.outputs ?? []).length) + " out")}</p>
        </div>
      </div>
      <div class="step-list">
        <p class="step-list-label">Transaction Provenance</p>
        <div class="tx-link-list">
          <button type="button" class="tx-inspect-button" data-view-tx="\${escapeHtml(record.txid)}" data-target-panel="\${escapeHtml(panelId)}">Inspect Transaction</button>
        </div>
        <div id="\${escapeHtml(panelId)}" class="tx-provenance-panel empty"></div>
      </div>
    </article>
  \`;
}

function buildActivityHighlights(records) {
  return [...records]
    .filter((record) => activityPriority(record) > 0)
    .sort((left, right) => {
      const priorityDiff = activityPriority(right) - activityPriority(left);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return Number(right.blockHeight ?? 0) - Number(left.blockHeight ?? 0);
    })
    .slice(0, 3);
}

function renderActivityHighlightCard(record, index) {
  const panelId = "activityHighlightTxPanel-" + index + "-" + record.txid;
  const names = summarizeActivityNames(record);
  const primaryName = names[0] ?? null;
  const highlightLabel = activityHighlightLabel(record);

  return \`
    <article class="guide-card">
      <p class="step-list-label">Highlight</p>
      <h3>\${escapeHtml(highlightLabel)}</h3>
      <p class="field-value">\${escapeHtml(summarizeActivityCopy(record))}</p>
      <div class="activity-badge-row">
        \${summarizeActivityBadges(record)
          .map((badge) => '<span class="activity-badge' + (badge.kind === "invalidated" ? ' invalidated' : "") + '">' + escapeHtml(badge.label) + "</span>")
          .join("")}
      </div>
      <div class="result-grid">
        <div class="result-item">
          <label>Block Height</label>
          <p class="field-value">\${escapeHtml(String(record.blockHeight))}</p>
        </div>
        <div class="result-item">
          <label>Affected Names</label>
          <p class="field-value">\${escapeHtml(names.length === 0 ? "None" : names.join(", "))}</p>
        </div>
      </div>
      <div class="hero-cta-row">
        \${primaryName ? '<a class="action-link secondary" href="' + escapeHtml(buildNameDetailPath(primaryName)) + '">Open ' + escapeHtml(primaryName) + '</a>' : ""}
        <button type="button" class="tx-inspect-button" data-view-tx="\${escapeHtml(record.txid)}" data-target-panel="\${escapeHtml(panelId)}">Inspect transaction</button>
      </div>
      <div id="\${escapeHtml(panelId)}" class="tx-provenance-panel empty"></div>
    </article>
  \`;
}

function resolverHasVisibleState() {
  const visibleAuctions = Array.isArray(state.experimentalAuctions?.auctions)
    ? state.experimentalAuctions.auctions.filter((auction) => !shouldHidePublicAuctionEntry(auction))
    : [];
  return state.names.length > 0 || state.activity.length > 0 || visibleAuctions.length > 0;
}

function renderExploreResolverEmptyCard(title, copy) {
  return \`
    <article class="guide-card explore-empty-card">
      <p class="highlight-kicker">Demo resolver waiting for reseed</p>
      <h3>\${escapeHtml(title)}</h3>
      <p>\${escapeHtml(copy)}</p>
      <div class="guide-card-actions">
        <a class="action-link secondary" href="\${escapeHtml(withBasePath("/setup"))}">Open setup</a>
        <a class="action-link secondary" href="\${escapeHtml(withBasePath("/auctions"))}">Open auctions</a>
      </div>
    </article>
  \`;
}

function summarizeActivityTitle(record) {
  const eventTypes = uniqueStrings((record.events ?? []).map((event) => String(event.typeName ?? "")).filter(Boolean));

  if ((record.invalidatedNames ?? []).length > 0 && eventTypes.length === 0) {
    return "Bond Released";
  }

  if (eventTypes.length === 0) {
    return "Recorded Activity";
  }

  return eventTypes.join(" + ");
}

function summarizeActivityCopy(record) {
  const names = summarizeActivityNames(record);

  if ((record.invalidatedNames ?? []).length > 0 && names.length > 0) {
    return "This transaction touched " + names.join(", ") + " and released at least one active name state.";
  }

  if ((record.invalidatedNames ?? []).length > 0) {
    return "This transaction released an active name state.";
  }

  if (names.length > 0) {
    return "This transaction affected " + names.join(", ") + ".";
  }

  return "This transaction contains parsed Open Name Tags activity.";
}

function summarizeActivityNames(record) {
  return uniqueStrings(
    [
      ...(record.events ?? []).map((event) => event.affectedName).filter(Boolean),
      ...((record.invalidatedNames ?? []).filter(Boolean))
    ].map((value) => String(value))
  );
}

function summarizeActivityBadges(record) {
  const badges = [];
  const eventTypes = uniqueStrings((record.events ?? []).map((event) => String(event.typeName ?? "")).filter(Boolean));

  for (const typeName of eventTypes) {
    badges.push({ label: typeName, kind: "event" });
  }

  if ((record.invalidatedNames ?? []).length > 0) {
    badges.push({ label: "RELEASED", kind: "invalidated" });
  }

  return badges;
}

function activityPriority(record) {
  if ((record.invalidatedNames ?? []).length > 0) {
    return 4;
  }

  const eventTypes = uniqueStrings((record.events ?? []).map((event) => String(event.typeName ?? "")).filter(Boolean));

  if (eventTypes.includes("TRANSFER")) {
    return 3;
  }

  if (eventTypes.includes("AUCTION_BID")) {
    return 2;
  }

  return 0;
}

function activityHighlightLabel(record) {
  if ((record.invalidatedNames ?? []).length > 0) {
    return "Release";
  }

  const eventTypes = uniqueStrings((record.events ?? []).map((event) => String(event.typeName ?? "")).filter(Boolean));

  if (eventTypes.includes("TRANSFER")) {
    return "Transfer";
  }

  if (eventTypes.includes("AUCTION_BID")) {
    return "Auction Bid";
  }

  return summarizeActivityTitle(record);
}

function activityStatusLabel(record) {
  if ((record.invalidatedNames ?? []).length > 0) {
    return "released";
  }

  const appliedEvents = (record.events ?? []).filter((event) => event.validationStatus === "applied");
  if (appliedEvents.length === 0) {
    return "ignored";
  }

  const firstType = String(appliedEvents[0]?.typeName ?? "").toUpperCase();

  return String(appliedEvents[0]?.typeName ?? "activity").toLowerCase();
}

function activityStatusPill(record) {
  if ((record.invalidatedNames ?? []).length > 0) {
    return "invalid";
  }

  const appliedEvents = (record.events ?? []).filter((event) => event.validationStatus === "applied");
  const firstType = String(appliedEvents[0]?.typeName ?? "").toUpperCase();

  if (firstType === "TRANSFER") {
    return "mature";
  }

  if (firstType === "AUCTION_BID") {
    return "pending";
  }

  return "available";
}

function renderSearchRecord(record, valueRecord) {
  setDocumentTitle(record.name, record.status);

  if (!elements.searchResult) {
    return;
  }

  const panelId = "searchTxPanel";
  elements.searchResult.hidden = false;
  setHomeLookupHasResult(true);
  setSearchResultVariant(record.status);
  if (isNameDetailPage()) {
    elements.searchResult.innerHTML = renderNameDetailRecord(record, valueRecord, panelId);
    return;
  }

  const isReleasedName = String(record.status) === "invalid";
  const releasedAuctionComposer = isReleasedName && isAuctionsPage()
    ? renderAuctionBidPackageComposer({
        source: "opening",
        id: record.name,
        phase: "awaiting_opening_bid",
        normalizedName: record.name,
        defaultBidAmount: formatBtcDecimal(estimateOpeningBidSatsForName(record.name)),
        defaultBidderId: "operator_" + String(record.name).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase(),
        open: true,
        note:
          "This opens a new auction generation because the prior ownership state was released.",
        fallbackPath: buildAuctionsPath(record.name)
      })
    : "";
  const releasedActionLinks = isAuctionsPage()
    ? '<a class="action-link secondary" href="#experimental-auction-feed">View auction activity</a>'
    : '<a class="action-link" href="' + escapeHtml(buildAuctionsPath(record.name)) + '">Open a new auction</a>';

  elements.searchResult.innerHTML = \`
    <div class="search-state-banner \${escapeHtml(record.status)}">
      <p class="search-state-label">Current State</p>
      <h4 class="search-state-title">\${escapeHtml(searchStateTitle(record))}</h4>
      <p class="search-state-copy">\${escapeHtml(searchOutcomeSummary(record))}</p>
    </div>
    <div class="result-title">
      <h3>\${escapeHtml(record.name)}</h3>
      <span class="status-pill \${escapeHtml(record.status)}">\${escapeHtml(formatStateLabel(record.status))}</span>
    </div>
    <p class="result-meta">\${escapeHtml(renderLookupMeta(record, valueRecord, state.health?.stats?.currentHeight ?? null))}</p>
    <div class="lookup-facts">
      \${renderLookupFact("Settlement", detailSettlementValue(record, state.health?.stats?.currentHeight ?? null))}
      \${renderLookupFact("Required bond", formatSats(record.requiredBondSats))}
      \${renderLookupFact("Destinations", valueRecord ? "Published" : "Not published")}
    </div>
    <p class="lookup-note">\${escapeHtml(primaryLookupNote(record, valueRecord, state.health?.stats?.currentHeight ?? null))}</p>
    \${String(record.status) === "invalid" ? \`<p class="lookup-note lookup-note-warning">\${escapeHtml(invalidLookupWarning())}</p>\` : ""}
    <div class="hero-cta-row lookup-result-actions">
      \${String(record.status) === "invalid"
        ? releasedActionLinks
        : \`<a class="action-link" href="\${escapeHtml(buildValuePublishPath(record.name))}">Update destinations</a>
           <a class="action-link secondary" href="\${escapeHtml(buildTransferPrepPath(record.name))}">Prepare transfer</a>\`}
      <a class="action-link secondary" href="\${escapeHtml(buildNameDetailPath(record.name))}">Open detail page</a>
    </div>
    \${releasedAuctionComposer}
    <details class="detail-technical lookup-technical">
      <summary>More details</summary>
      <div class="detail-technical-body">
        <div class="result-grid">
          <div class="result-item">
            <label>Owner Pubkey</label>
            \${renderCopyableCode(record.currentOwnerPubkey)}
          </div>
          <div class="result-item">
            <label>Acquired Height</label>
            <p class="field-value">\${escapeHtml(String(record.claimHeight))}</p>
          </div>
          <div class="result-item">
            <label>Maturity Height</label>
            <p class="field-value">\${escapeHtml(String(record.maturityHeight))}</p>
          </div>
          <div class="result-item">
            <label>Bond Amount</label>
            <p class="field-value">\${escapeHtml(formatSats(record.currentBondValueSats))}</p>
          </div>
        </div>
      </div>
    </details>
  \`;
  updateAllAuctionBidFlowTimelines();
}

function renderNameDetailRecord(record, valueRecord, panelId) {
  const currentHeight = state.health?.stats?.currentHeight ?? null;

  return \`
    <div class="search-state-banner \${escapeHtml(record.status)}">
      <p class="search-state-label">Current State</p>
      <h4 class="search-state-title">\${escapeHtml(searchStateTitle(record))}</h4>
      <p class="search-state-copy">\${escapeHtml(searchOutcomeSummary(record))}</p>
    </div>
    <div class="result-title">
      <h3>\${escapeHtml(record.name)}</h3>
      <span class="status-pill \${escapeHtml(record.status)}">\${escapeHtml(formatStateLabel(record.status))}</span>
    </div>
    <p class="result-meta detail-meta-row">\${renderDetailPageMeta(record, valueRecord, currentHeight)}</p>
    <div class="detail-actions-row">
      <a class="action-link secondary" href="\${escapeHtml(withBasePath("/"))}">Back to explorer</a>
      \${String(record.status) === "invalid"
        ? \`<a class="action-link" href="\${escapeHtml(buildAuctionsPath(record.name))}">Open auctions</a>\`
        : \`<a class="action-link" href="\${escapeHtml(buildValuePublishPath(record.name))}">Update destinations</a>
           <a class="action-link secondary" href="\${escapeHtml(buildTransferPrepPath(record.name))}">Prepare a transfer</a>
           <a class="action-link secondary" href="\${escapeHtml(withBasePath("/auctions"))}">Open auctions</a>\`}
    </div>
    \${renderInvalidationSummary(record, state.activeNameActivity, panelId)}
    <div class="detail-overview-grid">
      \${renderDetailSummaryCard("Current owner", truncateMiddle(record.currentOwnerPubkey, 16, 10), ownerSummaryCopy(record))}
      \${renderDetailSummaryCard("Settlement", detailSettlementValue(record, currentHeight), detailSettlementCopy(record, currentHeight))}
      \${renderDetailSummaryCard("Destinations", detailValueValue(valueRecord), detailValueCopy(valueRecord))}
    </div>
    \${renderTimelineSummary(record, valueRecord, state.activeNameActivity, currentHeight)}
    \${renderOffChainDataSection(valueRecord)}
    <div class="step-list">
      <p class="step-list-label">What Happens Next</p>
      <p class="field-value">\${escapeHtml(searchOutcomeSummary(record))}</p>
      <ol>
        \${searchOutcomeSteps(record.status, record).map((step) => \`<li>\${escapeHtml(step)}</li>\`).join("")}
      </ol>
    </div>
    \${renderRelatedActivitySection(state.activeNameActivity, "searchRelatedActivity")}
    <details class="step-list detail-technical">
      <summary>Technical details</summary>
      <div class="detail-technical-body">
        <div class="result-grid">
          <div class="result-item">
            <label>Owner Pubkey</label>
            \${renderCopyableCode(record.currentOwnerPubkey)}
          </div>
          <div class="result-item">
            <label>Acquired Height</label>
            <p class="field-value">\${escapeHtml(String(record.claimHeight))}</p>
          </div>
          <div class="result-item">
            <label>Maturity Height</label>
            <p class="field-value">\${escapeHtml(String(record.maturityHeight))}</p>
          </div>
          <div class="result-item">
            <label>Required Bond</label>
            <p class="field-value">\${escapeHtml(formatSats(record.requiredBondSats))}</p>
          </div>
          <div class="result-item">
            <label>\${escapeHtml(isAuctionNameRecord(record) ? "Winning Bid Tx" : "Acquisition Tx")}</label>
            \${renderCopyableCode(isAuctionNameRecord(record) ? (record.acquisitionAuctionBidTxid || record.claimCommitTxid) : record.claimCommitTxid)}
          </div>
          <div class="result-item">
            <label>\${escapeHtml(isAuctionNameRecord(record) ? "Auction Id" : "Visibility Tx")}</label>
            \${isAuctionNameRecord(record)
              ? '<p class="field-value">' + escapeHtml(String(record.acquisitionAuctionId ?? "unknown")) + '</p>'
              : renderCopyableCode(record.claimRevealTxid)}
          </div>
          <div class="result-item">
            <label>Bond Outpoint</label>
            <p class="field-value">\${escapeHtml(record.currentBondTxid)}:\${escapeHtml(String(record.currentBondVout))}</p>
          </div>
          <div class="result-item">
            <label>Bond Amount</label>
            <p class="field-value">\${escapeHtml(formatSats(record.currentBondValueSats))}</p>
          </div>
        </div>
        <div class="step-list">
          <p class="step-list-label">Transaction Provenance</p>
          \${renderTxButtonList(record, panelId, state.activeNameActivity)}
          <div id="\${escapeHtml(panelId)}" class="tx-provenance-panel empty"></div>
        </div>
      </div>
    </details>
  \`;
}

function renderSearchMessage(message) {
  setDocumentTitle(null, null);

  if (!elements.searchResult) {
    return;
  }

  elements.searchResult.hidden = false;
  setHomeLookupHasResult(true);
  setSearchResultVariant(null);
  elements.searchResult.classList.add("empty");
  elements.searchResult.textContent = message;
}

function hideSearchResult() {
  setDocumentTitle(null, null);

  if (!elements.searchResult) {
    return;
  }

  setSearchResultVariant(null);
  elements.searchResult.classList.add("empty");
  elements.searchResult.textContent = "";
  elements.searchResult.hidden = true;
  setHomeLookupHasResult(false);
}

function renderPrivateFundingMessage(message) {
  if (!elements.privateFundingResult) {
    return;
  }

  elements.privateFundingResult.classList.add("empty");
  elements.privateFundingResult.textContent = message;
}

function renderTransferDraftMessage(message) {
  if (!elements.transferDraftResult) {
    return;
  }

  elements.transferDraftResult.classList.add("empty");
  elements.transferDraftResult.textContent = message;
  updateTransferActionStates();
}

function renderTransferPackageReviewMessage(message) {
  if (!elements.transferPackageReviewResult) {
    return;
  }

  elements.transferPackageReviewResult.classList.add("empty");
  elements.transferPackageReviewResult.textContent = message;
}

function renderTransferRecipientKeyMessage(message) {
  if (!elements.transferRecipientKeyResult) {
    return;
  }

  elements.transferRecipientKeyResult.classList.add("empty");
  elements.transferRecipientKeyResult.textContent = message;
}

function renderSearchError(error) {
  const message = error instanceof Error ? error.message : "Unable to resolve the requested name.";
  renderSearchMessage(message);
}

function renderPrivateFundingError(error) {
  const message = error instanceof Error ? error.message : "Unable to fund that private signet address.";
  renderPrivateFundingMessage(message);
}

function renderTransferDraftError(error, name) {
  state.transferDraft = null;

  if (error && typeof error === "object" && "status" in error && error.status === 404) {
    renderTransferDraftMessage(
      'This name is not currently owned in the resolver view. Search it first, then use auctions if you want to bid for "' +
        String(name) +
        '".'
    );
    return;
  }

  const message = error instanceof Error ? error.message : "Unable to prepare the transfer.";
  renderTransferDraftMessage(message);
  updateTransferActionStates();
}

function renderTransferPackageReviewError(error) {
  const message = error instanceof Error ? error.message : "Unable to review the transfer package.";
  renderTransferPackageReviewMessage(message);
}

function renderTransferRecipientKeyError(error) {
  const message = error instanceof Error ? error.message : "Unable to generate a recipient key in the prototype helper.";
  renderTransferRecipientKeyMessage(message);
}

function renderBootError(error) {
  const message =
    error instanceof Error
      ? error.message
      : "Unable to reach the resolver.";

  setText(elements.syncMode, "Unavailable");
  setText(elements.networkSource, "Unavailable");
  setText(elements.networkChain, "Unavailable");
  setText(elements.networkResolver, message);
  setText(elements.pendingState, "Pending commit data could not be loaded.");
  setText(elements.activityState, "Recent activity could not be loaded.");
  setText(elements.namesState, "Resolver data could not be loaded.");
  hideSearchResult();
}

async function fetchJson(path) {
  return requestJson(path);
}

async function postJson(path, body) {
  return requestJson(path, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function requestJson(path, init) {
  const response = await fetch(path, init);
  const payload = await response.json();

  if (!response.ok) {
    const error = new Error(payload.message ?? payload.error ?? "Request failed");
    error.code = payload.error ?? "request_failed";
    error.status = response.status;
    throw error;
  }

  return payload;
}

function describeError(error) {
  return error instanceof Error ? error.message : "Request failed.";
}

function withBasePath(path) {
  if (!BASE_PATH) {
    return path;
  }

  if (path === "/") {
    return BASE_PATH;
  }

  return BASE_PATH + path;
}

function getAuctionLabApiPath() {
  return withBasePath("/api/auctions");
}

async function reloadAuctionLab() {
  state.auctionLab = await fetchJson(getAuctionLabApiPath());
  renderAuctionLab();
}

function cssEscape(value) {
  if (typeof window.CSS !== "undefined" && typeof window.CSS.escape === "function") {
    return window.CSS.escape(String(value));
  }

  return String(value).replace(/["\\\\]/g, "\\\\$&");
}

function getInitialDetailName() {
  const currentUrl = new URL(window.location.href);
  const pathname = stripClientBasePath(currentUrl.pathname);

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 2 || segments[0] !== "names" || !segments[1]) {
    return null;
  }

  try {
    return decodeURIComponent(segments[1]).trim().toLowerCase();
  } catch {
    return null;
  }
}

function getInitialAuctionName() {
  if (!isAuctionsPage()) {
    return null;
  }

  return getInitialNameQueryParam();
}

function getInitialTransferName() {
  return getInitialNameQueryParam();
}

function getInitialNameQueryParam() {
  const currentUrl = new URL(window.location.href);
  const prefill = currentUrl.searchParams.get("name");

  if (!prefill) {
    return null;
  }

  return prefill.trim().toLowerCase() || null;
}

function isAuctionsPage() {
  const currentUrl = new URL(window.location.href);
  const pathname = stripClientBasePath(currentUrl.pathname);
  return pathname === "/auctions" || pathname === "/auctions/";
}

function isTransferPrepPage() {
  const currentUrl = new URL(window.location.href);
  const pathname = stripClientBasePath(currentUrl.pathname);
  return pathname === "/transfer" || pathname === "/transfer/";
}

function isNameDetailPage() {
  return getInitialDetailName() !== null;
}

function stripClientBasePath(pathname) {
  if (!BASE_PATH) {
    return pathname;
  }

  if (pathname === BASE_PATH) {
    return "/";
  }

  if (pathname.startsWith(BASE_PATH + "/")) {
    return pathname.slice(BASE_PATH.length);
  }

  return pathname;
}

function buildNameDetailPath(name, configuredBasePath = BASE_PATH) {
  return withBasePath("/names/" + encodeURIComponent(String(name).trim().toLowerCase()), configuredBasePath);
}

function buildAuctionsPath(name = "", configuredBasePath = BASE_PATH) {
  const normalizedName = String(name ?? "").trim().toLowerCase();
  const baseAuctionsPath = withBasePath("/auctions", configuredBasePath);
  return normalizedName === "" ? baseAuctionsPath : baseAuctionsPath + "?name=" + encodeURIComponent(normalizedName);
}

function buildTransferPrepPath(name, configuredBasePath = BASE_PATH) {
  const normalizedName = String(name ?? "").trim().toLowerCase();
  const baseTransferPath = withBasePath("/transfer", configuredBasePath);
  return normalizedName === "" ? baseTransferPath : baseTransferPath + "?name=" + encodeURIComponent(normalizedName);
}

function buildValuePublishPath(name, configuredBasePath = BASE_PATH) {
  const normalizedName = String(name ?? "").trim().toLowerCase();
  const baseValuesPath = withBasePath("/values", configuredBasePath);
  return normalizedName === "" ? baseValuesPath : baseValuesPath + "?name=" + encodeURIComponent(normalizedName);
}

function updateLookupHistory(name) {
  if (isAuctionsPage()) {
    updateAuctionHistory(name);
    return;
  }

  updateNameDetailHistory(name);
}

function updateNameDetailHistory(name) {
  const targetPath = buildNameDetailPath(name);

  if (window.location.pathname + window.location.search === targetPath) {
    return;
  }

  window.history.pushState({ name }, "", targetPath);
}

function updateAuctionHistory(name) {
  const targetPath = buildAuctionsPath(name);

  if (window.location.pathname + window.location.search === targetPath) {
    return;
  }

  window.history.pushState({ name, page: "auctions" }, "", targetPath);
}

function setDocumentTitle(name, status) {
  if (!name) {
    document.title = PRODUCT_LABEL + " Explorer";
    return;
  }

  const statusSuffix = status ? " · " + formatStateLabel(status) : "";
  document.title = String(name) + statusSuffix + " · " + PRODUCT_LABEL;
}

function setText(node, value) {
  if (node) {
    node.textContent = value;
  }
}

function setCompactHash(node, value) {
  if (!node) {
    return;
  }

  node.textContent = truncateMiddle(value, 14, 8);
  node.title = value;
}

function formatSyncMode(value) {
  switch (value) {
    case "fixture":
      return "Fixture";
    case "rpc-oneshot":
      return "RPC One-Shot";
    case "rpc-polling":
      return "RPC Polling";
    default:
      return String(value);
  }
}

function formatLiveSmokeStatus(value) {
  switch (value) {
    case "awaiting_funds":
      return "Awaiting Funds";
    case "claimed":
      return "Auction Settled";
    case "value_published":
      return "Destinations Published";
    case "transferred":
      return "Transferred";
    case "name_unavailable":
      return "Name Not Owned";
    case "unavailable":
      return "Unavailable";
    case "error":
      return "Error";
    default:
      return String(value).replaceAll("_", " ");
  }
}

function mapLiveSmokeStatusPill(value) {
  switch (value) {
    case "awaiting_funds":
      return "pending";
    case "claimed":
    case "value_published":
      return "immature";
    case "transferred":
      return "mature";
    case "name_unavailable":
    case "error":
      return "invalid";
    case "unavailable":
      return "pending";
    default:
      return "pending";
  }
}

function formatSats(value) {
  const sats = BigInt(value);
  return "₿" + formatBtcDecimal(sats);
}

function formatStateLabel(status) {
  switch (String(status)) {
    case "pending":
      return "Awaiting Reveal";
    case "immature":
      return "Settling";
    case "mature":
      return "Active";
    case "invalid":
      return "Released";
    default:
      return String(status);
  }
}

function formatCompactSats(value) {
  const sats = BigInt(value);
  return "₿" + formatBtcDecimal(sats);
}

function formatBtcDecimal(sats) {
  const whole = sats / 100000000n;
  const fractional = (sats % 100000000n).toString().padStart(8, "0").replace(/0+$/g, "");
  return fractional === "" ? whole.toString() : whole.toString() + "." + fractional;
}

function parseBtcAmountInputToSatsString(value, label) {
  const normalized = String(value).trim();
  if (!/^\\d+(\\.\\d{1,8})?$/.test(normalized)) {
    throw new Error(label + " must be a BTC amount with up to 8 decimal places.");
  }

  const parts = normalized.split(".");
  const wholePart = parts[0] || "0";
  const fractionalPart = parts[1] || "";
  const sats = BigInt(wholePart) * 100000000n + BigInt(fractionalPart.padEnd(8, "0"));
  if (sats <= 0n) {
    throw new Error(label + " must be greater than zero.");
  }

  return sats.toString();
}

function buildNameGroups(names) {
  const orderedNames = [...names].sort((left, right) => {
    const leftOrder = statusSortOrder(left.status);
    const rightOrder = statusSortOrder(right.status);
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return String(left.name).localeCompare(String(right.name));
  });

  const grouped = new Map();
  for (const record of orderedNames) {
    const status = String(record.status);
    const records = grouped.get(status) ?? [];
    records.push(record);
    grouped.set(status, records);
  }

  return Array.from(grouped.entries()).map(([status, records]) => ({
    status,
    records,
    title: statusGroupTitle(status),
    description: statusGroupDescription(status),
    compact: statusGroupCompact(status)
  }));
}

function buildRecentNames(names, activity) {
  return [...names].sort((left, right) => {
    const leftRecency = recentNameRecency(left, activity);
    const rightRecency = recentNameRecency(right, activity);

    if (leftRecency.height !== rightRecency.height) {
      return rightRecency.height - leftRecency.height;
    }

    if (leftRecency.kind !== rightRecency.kind) {
      return leftRecency.kind.localeCompare(rightRecency.kind);
    }

    return String(left.name).localeCompare(String(right.name));
  });
}

function renderNameCard(record) {
  const panelId = "nameTxPanel-" + record.name;

  return \`
    <details class="name-card">
      <summary>
        <div class="name-summary">
          <div class="name-title">
            <h3>\${escapeHtml(record.name)}</h3>
            <span class="status-pill \${escapeHtml(record.status)}">\${escapeHtml(formatStateLabel(record.status))}</span>
          </div>
          <div class="name-summary-meta">
            <span>Owner \${escapeHtml(truncateMiddle(record.currentOwnerPubkey, 10, 6))}</span>
            <span>Acquired height \${escapeHtml(String(record.claimHeight))}</span>
            <span>Bond \${escapeHtml(formatCompactSats(record.requiredBondSats))}</span>
          </div>
        </div>
      </summary>
      <div class="name-card-body">
        <p class="result-meta">
          \${renderDetailLink(record.name, "Open detail page")}
          \${String(record.status) === "invalid" ? "" : " · " + renderValuePublishLink(record.name, "Update destinations") + " · " + renderTransferPrepLink(record.name, "Prepare transfer")}
        </p>
        <div class="name-grid">
          <div class="name-item">
            <label>Owner Pubkey</label>
            \${renderCopyableCode(record.currentOwnerPubkey)}
          </div>
          <div class="name-item">
            <label>Acquired Height</label>
            <p class="field-value">\${escapeHtml(String(record.claimHeight))}</p>
          </div>
          <div class="name-item">
            <label>Maturity Height</label>
            <p class="field-value">\${escapeHtml(String(record.maturityHeight))}</p>
          </div>
          <div class="name-item">
            <label>Required Bond</label>
            <p class="field-value">\${escapeHtml(formatSats(record.requiredBondSats))}</p>
          </div>
          <div class="name-item">
            <label>Bond Outpoint</label>
            <p class="field-value">\${escapeHtml(record.currentBondTxid)}:\${escapeHtml(String(record.currentBondVout))}</p>
          </div>
          <div class="name-item">
            <label>Bond Amount</label>
            <p class="field-value">\${escapeHtml(formatSats(record.currentBondValueSats))}</p>
          </div>
        </div>
        <div class="step-list">
          <p class="step-list-label">What Happens Next</p>
          <p class="field-value">\${escapeHtml(searchOutcomeSummary(record))}</p>
          <ol>
            \${searchOutcomeSteps(record.status, record).map((step) => \`<li>\${escapeHtml(step)}</li>\`).join("")}
          </ol>
        </div>
        <div class="step-list">
          <p class="step-list-label">Transaction Provenance</p>
          \${renderTxButtonList(record, panelId)}
          <div id="\${escapeHtml(panelId)}" class="tx-provenance-panel empty"></div>
        </div>
      </div>
    </details>
  \`;
}

function renderCompactNameCard(record) {
  const panelId = "compactNameTxPanel-" + record.name;

  return \`
    <details class="compact-name-card">
      <summary>
        <div class="compact-name-summary">
          <div class="name-title">
            <h3>\${escapeHtml(record.name)}</h3>
            <span class="status-pill \${escapeHtml(record.status)}">\${escapeHtml(formatStateLabel(record.status))}</span>
          </div>
          <div class="compact-name-meta">
            <span>Owner \${escapeHtml(truncateMiddle(record.currentOwnerPubkey, 10, 6))}</span>
            <span>Acquired \${escapeHtml(String(record.claimHeight))}</span>
            <span>Bond \${escapeHtml(formatCompactSats(record.requiredBondSats))}</span>
          </div>
        </div>
      </summary>
      <div class="name-card-body">
        <p class="result-meta">
          \${renderDetailLink(record.name, "Open detail page")}
          \${String(record.status) === "invalid" ? "" : " · " + renderValuePublishLink(record.name, "Update destinations")}
        </p>
        <div class="name-grid">
          <div class="name-item">
            <label>Owner Pubkey</label>
            \${renderCopyableCode(record.currentOwnerPubkey)}
          </div>
          <div class="name-item">
            <label>Acquired Height</label>
            <p class="field-value">\${escapeHtml(String(record.claimHeight))}</p>
          </div>
          <div class="name-item">
            <label>Maturity Height</label>
            <p class="field-value">\${escapeHtml(String(record.maturityHeight))}</p>
          </div>
          <div class="name-item">
            <label>Required Bond</label>
            <p class="field-value">\${escapeHtml(formatSats(record.requiredBondSats))}</p>
          </div>
        </div>
        <div class="step-list">
          <p class="step-list-label">Transaction Provenance</p>
          \${renderTxButtonList(record, panelId)}
          <div id="\${escapeHtml(panelId)}" class="tx-provenance-panel empty"></div>
        </div>
      </div>
    </details>
  \`;
}

function renderRecentNameRow(record) {
  const recency = recentNameRecency(record, state.activity);
  const panelId = "recentNameTxPanel-" + record.name;
  const eventLabel = recentNameEventLabel(record, recency.kind);

  return \`
    <article class="recent-name-row">
      <div class="recent-name-header">
        <div class="recent-name-title">
          <h3>\${escapeHtml(record.name)}</h3>
          <span class="status-pill \${escapeHtml(record.status)}">\${escapeHtml(formatStateLabel(record.status))}</span>
        </div>
        <div class="recent-name-links result-meta">
          \${renderDetailLink(record.name, "Open detail page")}
          \${String(record.status) === "invalid" ? "" : " · " + renderValuePublishLink(record.name, "Update destinations") + " · " + renderTransferPrepLink(record.name, "Prepare transfer")}
        </div>
      </div>
      <p class="recent-name-meta">
        <span>\${escapeHtml(eventLabel)}</span>
        <span>Height \${escapeHtml(String(recency.height))}</span>
        <span>\${escapeHtml(truncateMiddle(recency.txid, 10, 8))}</span>
        <span>Bond \${escapeHtml(formatCompactSats(record.requiredBondSats))}</span>
      </p>
      <div class="tx-chip-row">
        \${renderTxButtonList(record, panelId, state.activity)}
      </div>
      <div id="\${escapeHtml(panelId)}" class="tx-provenance-panel empty"></div>
    </article>
  \`;
}

function statusGroupTitle(status) {
  switch (String(status)) {
    case "immature":
      return "Settling Names";
    case "mature":
      return "Active Names";
    case "invalid":
      return "Released Names";
    default:
      return "Other Names";
  }
}

function statusGroupDescription(status) {
  switch (String(status)) {
    case "immature":
      return "These names are already owned and are still in the bond-backed settlement period.";
    case "mature":
      return "These names have finished settlement and no longer depend on a live bond UTXO.";
    case "invalid":
      return "These names were released because bond continuity failed before bond maturity, so inspect their history before treating them as available again.";
    default:
      return "Names that do not fit the main lifecycle buckets above.";
  }
}

function statusGroupCompact(status) {
  switch (String(status)) {
    case "mature":
      return true;
    default:
      return false;
  }
}

function recentNameRecency(record, activity) {
  if (String(record.status) === "invalid") {
    const invalidationRecord = findLatestInvalidationActivity(record.name, activity);
    if (invalidationRecord) {
      return {
        height: Number(invalidationRecord.blockHeight ?? record.lastStateHeight ?? record.claimHeight ?? 0),
        txid: String(invalidationRecord.txid),
        kind: "invalidated"
      };
    }
  }

  const fallbackHeight =
    typeof record.lastStateHeight === "number" && Number.isFinite(record.lastStateHeight)
      ? record.lastStateHeight
      : Number(record.claimHeight ?? 0);
  const kind = isAuctionNameRecord(record)
    ? (String(record.lastStateTxid) === String(record.acquisitionAuctionBidTxid ?? record.claimRevealTxid)
        ? "auctioned"
        : "transferred")
    : (String(record.lastStateTxid) === String(record.claimRevealTxid) ? "claimed" : "transferred");

  return {
    height: fallbackHeight,
    txid: String(record.lastStateTxid || record.claimRevealTxid || ""),
    kind
  };
}

function recentNameEventLabel(record, kind) {
  if (kind === "invalidated") {
    return "Released";
  }

  if (kind === "auctioned") {
    return "Auction won";
  }

  if (kind === "transferred") {
    return "Transferred";
  }

  return String(record.status) === "mature" ? "Acquired" : "Acquired";
}

function searchOutcomeSummary(record) {
  const status = String(record?.status ?? "");

  if (isAuctionNameRecord(record)) {
    switch (status) {
      case "immature":
        return "This auction has settled, and the winning bond is still locked in its post-auction holding period.";
      case "mature":
        return "This auction has settled, the winner owns the name, and the winner bond has matured.";
      case "invalid":
        return "This auction-derived name was released because the winning bond continuity failed before the required lock ended.";
      default:
        return "This auction-derived name is in a transitional state.";
    }
  }

  switch (status) {
    case "immature":
      return "This name is already owned and is still in settlement.";
    case "mature":
      return "This name is already owned and active.";
    case "invalid":
      return "This name was released because bond continuity broke before bond maturity.";
    default:
      return "This name is in a transitional state.";
  }
}

function searchStateTitle(record) {
  const status = String(record?.status ?? "");

  if (isAuctionNameRecord(record)) {
    switch (status) {
      case "immature":
        return "Auction Won, Bond Still Maturing";
      case "mature":
        return "Auction Won And Active";
      case "invalid":
        return "Auction Winner Released";
      default:
        return "Auction State In Transition";
    }
  }

  switch (status) {
    case "immature":
      return "Owned And Still Settling";
    case "mature":
      return "Owned And Active";
    case "invalid":
      return "Released Back To The Pool";
    default:
      return "State In Transition";
  }
}

function searchOutcomeSteps(status, record) {
  if (isAuctionNameRecord(record)) {
    switch (String(status)) {
      case "immature":
        return [
          "The winning bid bond must remain continuous until block " + String(record.maturityHeight) + ".",
          "A transfer is still possible, but it must carry the full winning bond amount into the successor bond in the same transaction.",
          "If you are evaluating the name, inspect the winning bid and later state transactions before treating the state as final."
        ];
      case "mature":
        return [
          "The auction has fully settled and the winner bond has matured.",
          "The current owner can now transfer the name or publish new destinations without recreating the original winning bond.",
          "If you want the full path, inspect the winning bid transaction and any later transfer state."
        ];
      case "invalid":
        return [
          "Inspect the invalidation transaction first. That is the clearest explanation for why the auction-derived ownership failed.",
          "The usual cause is an early bond break: the winning bond UTXO was spent before maturity without creating a valid successor bond in the same transaction.",
          "Treat the name as historical until the resolver and transaction history make the next valid owner state clear."
        ];
      default:
        return [
          "Inspect the provenance to understand the current auction-derived state transition.",
          "Use the resolver and transaction history together before acting on the name."
        ];
    }
  }

  switch (String(status)) {
    case "immature":
      return [
        "The current owner must preserve bond continuity until bond maturity at height " + String(record.maturityHeight) + ".",
        "A transfer is still possible, but it must create the successor bond in the same transaction.",
        "If you are evaluating the name, inspect the provenance and current owner rather than assuming the state is final."
      ];
    case "mature":
      return [
        "Ownership is now active and no longer depends on the original bond output remaining live.",
        "The current owner can publish new destinations or transfer the name without successor-bond continuity.",
        "If you want to understand how it got here, inspect the acquisition transaction and any later state transaction."
      ];
    case "invalid":
      return [
        "Inspect the release transaction first. That is the clearest explanation for why the name returned to the pool.",
        "The usual cause is an early bond break: the active bond UTXO was spent before maturity without creating a valid successor bond in the same transaction.",
        "Do not treat the name as safely available until the resolver and transaction history make the next auction path clear."
      ];
    default:
      return [
        "Inspect the provenance to understand the current state transition.",
        "Use the resolver and transaction history together before acting on the name."
      ];
  }
}

function findLatestInvalidationActivity(name, activity) {
  const normalizedName = String(name).trim().toLowerCase();

  return (
    (Array.isArray(activity) ? activity : []).find(
      (record) =>
        Array.isArray(record.invalidatedNames) &&
        record.invalidatedNames.some((candidate) => String(candidate).trim().toLowerCase() === normalizedName)
    ) ?? null
  );
}

function renderInvalidationSummary(record, activity, panelId) {
  if (String(record.status) !== "invalid") {
    return "";
  }

  const invalidationRecord = findLatestInvalidationActivity(record.name, activity);
  const copy =
    invalidationRecord === null
      ? "This name was released because its bonded state failed before bond maturity. Use the related activity and transaction provenance below to inspect what happened."
      : "This name was released when its active bond outpoint was spent before maturity without a valid successor bond in the same transaction.";
  const details =
    invalidationRecord === null
      ? ""
      : '<p class="field-value">Invalidation tx ' +
        escapeHtml(truncateMiddle(invalidationRecord.txid, 12, 10)) +
        " at height " +
        escapeHtml(String(invalidationRecord.blockHeight)) +
        ".</p>";
  const inspectButton =
    invalidationRecord === null
      ? ""
      : '<div class="tx-link-list"><button type="button" class="tx-inspect-button" data-view-tx="' +
        escapeHtml(invalidationRecord.txid) +
        '" data-target-panel="' +
        escapeHtml(panelId) +
        '">Inspect invalidation tx</button></div>';

  return (
    '<div class="step-list">' +
    '<p class="step-list-label">Why It Was Released</p>' +
    '<p class="field-value">' +
    escapeHtml(copy) +
    "</p>" +
    details +
    inspectButton +
    "</div>"
  );
}

function statusSortOrder(status) {
  switch (String(status)) {
    case "immature":
      return 0;
    case "invalid":
      return 1;
    case "mature":
      return 2;
    case "pending":
      return 3;
    default:
      return 9;
  }
}

function isAuctionNameRecord(record) {
  return String(record?.acquisitionKind ?? "") === "auction";
}

function matchesNameFilter(record, filter) {
  if (filter === "all") {
    return true;
  }

  return String(record.status) === String(filter);
}

function formatNameFilterLabel(filter) {
  switch (String(filter)) {
    case "immature":
      return "Settling";
    case "mature":
      return "Active";
    case "invalid":
      return "Released";
    default:
      return "All";
  }
}

function matchesActivityFilter(record, filter) {
  switch (String(filter)) {
    case "acquisitions":
      return (record.events ?? []).some((event) => event.typeName === "AUCTION_BID");
    case "transfers":
      return (record.events ?? []).some((event) => event.typeName === "TRANSFER");
    case "invalidated":
      return Array.isArray(record.invalidatedNames) && record.invalidatedNames.length > 0;
    default:
      return true;
  }
}

function formatActivityFilterLabel(filter) {
  switch (String(filter)) {
    case "acquisitions":
      return "Acquisitions";
    case "transfers":
      return "Transfers";
    case "invalidated":
      return "Invalidations";
    default:
      return "All";
  }
}

function uniqueStrings(values) {
  return [...new Set(values)];
}

function truncateMiddle(value, head = 16, tail = 12) {
  const text = String(value);
  if (text.length <= head + tail + 1) {
    return text;
  }

  return text.slice(0, head) + "…" + text.slice(-tail);
}

function shortenTxid(value) {
  return truncateMiddle(value, 10, 8);
}

function renderCopyableCode(value) {
  const fullValue = String(value);

  return \`
    <div class="code-row">
      <code title="\${escapeHtml(fullValue)}">\${escapeHtml(truncateMiddle(fullValue, 18, 10))}</code>
      <button type="button" class="copy-button" data-copy="\${escapeHtml(fullValue)}">Copy</button>
    </div>
  \`;
}

function renderDetailLink(name, label, configuredBasePath = BASE_PATH) {
  const normalizedName = String(name).trim().toLowerCase();
  return '<a class="detail-link" href="' + escapeHtml(buildNameDetailPath(normalizedName, configuredBasePath)) + '">' + escapeHtml(label) + "</a>";
}

function renderTransferPrepLink(name, label, configuredBasePath = BASE_PATH) {
  const normalizedName = String(name).trim().toLowerCase();
  return '<a class="detail-link" href="' + escapeHtml(buildTransferPrepPath(normalizedName, configuredBasePath)) + '">' + escapeHtml(label) + "</a>";
}

function renderValuePublishLink(name, label, configuredBasePath = BASE_PATH) {
  const normalizedName = String(name).trim().toLowerCase();
  return '<a class="detail-link" href="' + escapeHtml(buildValuePublishPath(normalizedName, configuredBasePath)) + '">' + escapeHtml(label) + "</a>";
}

function renderDetailPageMeta(record, valueRecord, currentHeight) {
  const parts = [
    detailSettlementValue(record, currentHeight),
    valueRecord ? "destinations published" : "no destinations published yet"
  ];

  if (String(record.status) === "invalid") {
    parts.unshift("currently released");
  }

  return parts.join(" · ");
}

function renderLookupMeta(record, valueRecord, currentHeight) {
  const parts = [detailSettlementValue(record, currentHeight)];

  if (String(record.status) === "invalid") {
    parts.unshift("released");
  }

  parts.push(valueRecord ? "destinations published" : "no destinations published yet");
  return parts.join(" · ");
}

function renderLookupFact(label, value) {
  return (
    '<article class="lookup-fact">' +
    '<span class="lookup-fact-label">' +
    escapeHtml(label) +
    "</span>" +
    '<strong class="lookup-fact-value">' +
    escapeHtml(String(value)) +
    "</strong>" +
    "</article>"
  );
}

function renderDetailSummaryCard(label, value, copy) {
  return \`
    <article class="detail-summary-card">
      <label>\${escapeHtml(label)}</label>
      <p class="detail-summary-value">\${escapeHtml(value)}</p>
      <p class="detail-summary-copy">\${escapeHtml(copy)}</p>
    </article>
  \`;
}

function ownerSummaryCopy(record) {
  if (String(record.status) === "invalid") {
    return "This was the last recorded owner before the name was released.";
  }

  return "This is the key currently recognized by the resolver as the controlling owner.";
}

function primaryLookupNote(record, valueRecord, currentHeight) {
  const status = String(record.status);

  if (status === "invalid") {
    return isAuctionNameRecord(record)
      ? "This auction-derived name was released before the winning bond matured. Use the detail page if you want the full bid and bond history before acting on it."
      : "This name was released before bond maturity. Use the detail page if you want the full transaction history before treating it as available again.";
  }

  if (status === "mature") {
    if (isAuctionNameRecord(record)) {
      return valueRecord
        ? "The auction has fully settled and the current owner has published destinations."
        : "The auction has fully settled and the current owner has not published destinations yet.";
    }

    return valueRecord
      ? "The name is active and has current destinations."
      : "The name is active, but the owner has not published destinations yet.";
  }

  if (currentHeight === null) {
    return isAuctionNameRecord(record)
      ? "This auction winner is still inside the bond maturity window under the current resolver snapshot."
      : "This name is still settling under the current resolver snapshot.";
  }

  const blocksLeft = Math.max(0, Number(record.maturityHeight) - Number(currentHeight));
  if (isAuctionNameRecord(record)) {
    return blocksLeft === 0
      ? "This auction winner is at the edge of bond maturity."
      : "This auction winner is still maturing. About " + String(blocksLeft) + " blocks remain before the winner bond matures.";
  }

  return blocksLeft === 0
    ? "This name is at the edge of settlement and should become active once the resolver advances."
    : "This name is still settling. About " + String(blocksLeft) + " blocks remain before it becomes active.";
}

function invalidLookupWarning() {
  return "Treat released names cautiously until you inspect the detail page and confirm why the bond continuity failed.";
}

function detailSettlementValue(record, currentHeight) {
  const status = String(record.status);

  if (status === "invalid") {
    return isAuctionNameRecord(record) ? "Released before bond maturity" : "Released before maturity";
  }

  if (status === "mature") {
    return isAuctionNameRecord(record) ? "Auction active" : "Active";
  }

  if (currentHeight === null) {
    return isAuctionNameRecord(record) ? "Bond still maturing" : "Still settling";
  }

  const blocksLeft = Math.max(0, Number(record.maturityHeight) - Number(currentHeight));
  if (isAuctionNameRecord(record)) {
    return blocksLeft === 0 ? "Bond matures now" : String(blocksLeft) + " blocks to bond maturity";
  }

  return blocksLeft === 0 ? "At maturity" : String(blocksLeft) + " blocks left";
}

function detailSettlementCopy(record, currentHeight) {
  const status = String(record.status);

  if (status === "invalid") {
    return isAuctionNameRecord(record)
      ? "Winning-bid bond continuity broke before maturity, so this auction-derived state should be treated as historical rather than live ownership."
      : "Bond continuity broke before maturity, so this recorded state should be treated as historical rather than live ownership.";
  }

  if (status === "mature") {
    return isAuctionNameRecord(record)
      ? "The auction winner bond has matured, so ownership is now active without depending on the original winning bond staying live."
      : "The name has cleared the bond-backed settlement period and is now active without depending on the original bond output staying live.";
  }

  if (currentHeight === null) {
    return isAuctionNameRecord(record)
      ? "The resolver has not published a current height yet, but this auction winner is still within the bond maturity window."
      : "The resolver has not published a current height yet, but this name is still within the settlement window.";
  }

  const blocksLeft = Math.max(0, Number(record.maturityHeight) - Number(currentHeight));
  if (isAuctionNameRecord(record)) {
    return blocksLeft === 1
      ? "One block remains before the winning bid bond matures."
      : String(blocksLeft) + " blocks remain before the winning bid bond matures.";
  }

  return blocksLeft === 1
    ? "One block remains before this name becomes active."
    : String(blocksLeft) + " blocks remain before this name becomes active.";
}

function detailValueValue(valueRecord) {
  if (!valueRecord) {
    return "No off-chain data";
  }

  const bundle = Number(valueRecord.valueType) === 255
    ? decodeProfileBundlePayloadHex(valueRecord.payloadHex)
    : null;
  if (bundle !== null) {
    return truncateMiddle(listProfileBundleEntries(bundle).map((entry) => entry.key).join(", "), 26, 18);
  }

  const utf8Preview = decodeValuePayloadUtf8(valueRecord.payloadHex);
  if (utf8Preview !== null && utf8Preview.trim() !== "") {
    return truncateMiddle(utf8Preview, 26, 18);
  }

  return formatValueType(valueRecord.valueType, valueRecord.payloadHex);
}

function detailValueCopy(valueRecord) {
  if (!valueRecord) {
    return "The owner has not published destinations yet.";
  }

  const bundle = Number(valueRecord.valueType) === 255
    ? decodeProfileBundlePayloadHex(valueRecord.payloadHex)
    : null;
  if (bundle !== null) {
    const destinationCount = listProfileBundleEntries(bundle).length;
    return (
      "Signed off-chain by the current owner. This destination bundle currently points to " +
      String(destinationCount) +
      " destination" +
      (destinationCount === 1 ? "" : "s") +
      "."
    );
  }

  return (
    "Signed off-chain by the current owner. Latest sequence " +
    String(valueRecord.sequence) +
    " issued " +
    new Date(valueRecord.issuedAt).toLocaleDateString()
  );
}

function renderOffChainDataSection(valueRecord) {
  const typeValue = valueRecord ? formatValueType(valueRecord.valueType, valueRecord.payloadHex) : "Not published";
  const sequenceValue = valueRecord ? String(valueRecord.sequence) : "None yet";
  const publishedValue = valueRecord ? new Date(valueRecord.issuedAt).toLocaleString() : "Not published";
  const recordHashValue = valueRecord?.recordHash ? truncateMiddle(valueRecord.recordHash, 12, 10) : "None yet";
  const predecessorValue = valueRecord?.previousRecordHash
    ? truncateMiddle(valueRecord.previousRecordHash, 12, 10)
    : valueRecord
      ? "None (first in ownership interval)"
      : "None yet";
  const bundle = valueRecord && Number(valueRecord.valueType) === 255
    ? decodeProfileBundlePayloadHex(valueRecord.payloadHex)
    : null;
  const explanatoryCopy = valueRecord
    ? bundle !== null
      ? "This name currently resolves through one signed destination bundle. Ownership stays on-chain; the bundle carries several off-chain destinations at once."
      : "These are the current signed destinations for the name. Ownership stays on-chain; destinations are stored and updated off-chain."
    : "No signed destinations have been published yet. The name exists, but it does not currently point anywhere.";
  const destinationCountValue = bundle !== null ? String(listProfileBundleEntries(bundle).length) : null;

  return (
    '<section class="step-list offchain-data-section">' +
    '<p class="step-list-label">Off-Chain Data</p>' +
    '<p class="field-value">' + escapeHtml(explanatoryCopy) + "</p>" +
    '<div class="result-grid">' +
    '<div class="result-item"><label>Current Resolution</label>' + renderValueRecordPreview(valueRecord) + "</div>" +
    '<div class="result-item"><label>Record Type</label><p class="field-value">' + escapeHtml(typeValue) + "</p></div>" +
    '<div class="result-item"><label>Sequence</label><p class="field-value">' + escapeHtml(sequenceValue) + "</p></div>" +
    '<div class="result-item"><label>Issued At</label><p class="field-value">' + escapeHtml(publishedValue) + "</p></div>" +
    '<div class="result-item"><label>Record Hash</label><p class="field-value">' + escapeHtml(recordHashValue) + "</p></div>" +
    '<div class="result-item"><label>Previous Record</label><p class="field-value">' + escapeHtml(predecessorValue) + "</p></div>" +
    (destinationCountValue === null
      ? ""
      : '<div class="result-item"><label>Destinations</label><p class="field-value">' + escapeHtml(destinationCountValue) + "</p></div>") +
    "</div>" +
    "</section>"
  );
}

function renderTimelineSummary(record, valueRecord, activity, currentHeight) {
  const items = buildTimelineItems(record, valueRecord, activity, currentHeight);

  if (items.length === 0) {
    return "";
  }

  return \`
    <div class="timeline-strip">
      <p class="timeline-strip-label">Lifecycle Timeline</p>
      <div class="timeline-list">
        \${items
          .map((item) => \`
            <article class="timeline-item">
              <p class="timeline-item-label">\${escapeHtml(item.label)}</p>
              <h4 class="timeline-item-title">\${escapeHtml(item.title)}</h4>
              <p class="timeline-item-meta">\${escapeHtml(item.meta)}</p>
            </article>
          \`)
          .join("")}
      </div>
    </div>
  \`;
}

function buildTimelineItems(record, valueRecord, activity, currentHeight) {
  const items = [];
  const activityByTxid = new Map((Array.isArray(activity) ? activity : []).map((entry) => [entry.txid, entry]));

  if (isAuctionNameRecord(record)) {
    items.push({
      label: "Auction",
      title: "Winning bid accepted",
      meta:
        "Height " +
        String(record.winningCommitBlockHeight ?? record.claimHeight) +
        " · " +
        truncateMiddle(record.acquisitionAuctionBidTxid ?? record.claimCommitTxid, 10, 8)
    });

    items.push({
      label: "Settlement",
      title: "Winner became owner",
      meta:
        "Height " +
        String(record.claimHeight) +
        " · " +
        truncateMiddle(record.lastStateTxid, 10, 8)
    });
  } else {
    items.push({
      label: "Acquisition",
      title: "Bonded ownership committed",
      meta:
        "Height " +
        String(record.winningCommitBlockHeight ?? record.claimHeight) +
        " · " +
        truncateMiddle(record.claimCommitTxid, 10, 8)
    });

    items.push({
      label: "Ownership",
      title: "Name became visible",
      meta: "Height " + String(record.claimHeight) + " · " + truncateMiddle(record.claimRevealTxid, 10, 8)
    });
  }

  if (record.lastStateTxid && record.lastStateTxid !== (isAuctionNameRecord(record) ? (record.acquisitionAuctionBidTxid ?? record.claimRevealTxid) : record.claimRevealTxid)) {
    const lastStateRecord = activityByTxid.get(record.lastStateTxid);
    const transferEvent = (lastStateRecord?.events ?? []).find((event) => event.typeName === "TRANSFER");

    items.push({
      label: "State Change",
      title: transferEvent ? "Transfer applied" : "State updated",
      meta:
        "Height " +
        String(lastStateRecord?.blockHeight ?? "unknown") +
        " · " +
        truncateMiddle(record.lastStateTxid, 10, 8)
    });
  }

  const invalidationRecord = findLatestInvalidationActivity(record.name, activity);
  if (String(record.status) === "invalid") {
    items.push({
      label: "Release",
      title: "Bond continuity failed",
      meta:
        invalidationRecord === null
          ? "The active bond was spent before bond maturity without a valid successor bond."
          : "Height " + String(invalidationRecord.blockHeight) + " · " + truncateMiddle(invalidationRecord.txid, 10, 8)
    });
  } else {
    items.push({
      label: "Settlement",
      title: currentHeight !== null && currentHeight >= record.maturityHeight ? "Name is active" : "Bond still settling",
      meta:
        "Maturity height " +
        String(record.maturityHeight) +
        (currentHeight === null ? "" : " · current height " + String(currentHeight))
    });
  }

  if (valueRecord) {
    items.push({
      label: "Value",
      title: "Current destinations published",
      meta:
        "Sequence " +
        String(valueRecord.sequence) +
        " · type 0x" +
        Number(valueRecord.valueType).toString(16).padStart(2, "0") +
        " · " +
        new Date(valueRecord.issuedAt).toLocaleString()
    });
  }

  return items;
}

function renderAuctionFirstNameNotFound(name) {
  setDocumentTitle(name, "not found");

  if (!elements.searchResult) {
    return;
  }

  const liveAuction = findVisibleLiveAuctionForName(name);
  if (liveAuction) {
    renderAuctionSearchResultForLiveAuction(name, liveAuction);
    return;
  }

  const defaultBidderId = "operator_" + String(name).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase();
  const requiredOpeningBond = formatSats(estimateOpeningBidSatsForName(name));
  const actionLinks = isAuctionsPage()
    ? \`
      <a class="action-link secondary" href="#experimental-auction-feed">View live auction activity</a>
    \`
    : \`
      <a class="action-link" href="\${escapeHtml(buildAuctionsPath(name))}">Claim \${escapeHtml(name)}</a>
      <a class="action-link secondary" href="\${escapeHtml(withBasePath("/setup"))}">Set up Sparrow</a>
    \`;
  const openingBidComposer = isAuctionsPage()
    ? renderAuctionBidPackageComposer({
        source: "opening",
        id: name,
        phase: "awaiting_opening_bid",
        normalizedName: name,
        defaultBidAmount: formatBtcDecimal(estimateOpeningBidSatsForName(name)),
        defaultBidderId,
        open: true,
        note:
          "This is an opening bid for the searched name. If Sparrow signs and broadcasts it successfully, the auction clock starts.",
        fallbackPath: buildAuctionsPath(name)
      })
    : "";

  elements.searchResult.hidden = false;
  setHomeLookupHasResult(true);
  setSearchResultVariant("available");
	  elements.searchResult.innerHTML = \`
	    <div class="lookup-availability-result">
      <div class="lookup-result-title-row">
        <p class="search-state-label">Search result</p>
        <span class="status-pill available">not owned</span>
      </div>
      <h3 class="lookup-result-name">\${escapeHtml(name)}</h3>
      <p class="lookup-result-summary">No current owner was found in this resolver &mdash; this name is claimable.</p>
    </div>
    <div class="lookup-next-step">
      <p class="search-state-label">Next step</p>
      <p>Claim it. In ONT's design an uncontested claim costs only a small fixed fee; this prototype runs the contested path, so claiming opens a bonded bid (required bond: \${escapeHtml(requiredOpeningBond)}). A name is not live in Explore until it settles into an owned name.</p>
    </div>
    <div class="hero-cta-row lookup-result-actions">
      \${actionLinks}
    </div>
	    \${openingBidComposer}
	  \`;
  updateAllAuctionBidFlowTimelines();
}

function findVisibleLiveAuctionForName(name) {
  const normalizedName = String(name ?? "").trim().toLowerCase();
  const auctions = state.experimentalAuctions?.auctions;
  if (!normalizedName || !Array.isArray(auctions)) {
    return null;
  }

  return auctions.find((auction) => {
    const auctionName = String(auction?.normalizedName ?? "").trim().toLowerCase();
    return auctionName === normalizedName && !shouldHidePublicAuctionEntry(auction);
  }) ?? null;
}

function renderAuctionSearchResultForLiveAuction(name, auction) {
  setDocumentTitle(name, "auction");

  if (!elements.searchResult) {
    return;
  }

  const phase = String(auction?.phase ?? "unknown");
  const phasePill = mapAuctionPhasePill(phase);
  const phaseLabel = String(auction?.phaseLabel ?? phase);
  const nextBidText = auction?.currentRequiredMinimumBidSats
    ? formatSats(auction.currentRequiredMinimumBidSats)
    : "No next bid available";
  const liveAuctionDetail = isAuctionsPage()
    ? renderExperimentalAuctionCard(auction)
    : [
        '<div class="lookup-next-step">',
        '  <p class="search-state-label">Where to bid</p>',
        "  <p>Active auctions are managed on the Auctions page. Explore shows names after an auction settles into ownership.</p>",
        '  <div class="hero-cta-row lookup-result-actions">',
        '    <a class="action-link" href="' + escapeHtml(buildAuctionsPath(name)) + '">Open auction for ' + escapeHtml(name) + "</a>",
        "  </div>",
        "</div>"
      ].join("");
  const nextBidCopy = isAuctionsPage()
    ? "The bid form below is prefilled from the live auction state: " + nextBidText + "."
    : "This auction is live. The next valid bid is " + nextBidText + ".";

  elements.searchResult.hidden = false;
  setHomeLookupHasResult(true);
  setSearchResultVariant("available");
  elements.searchResult.innerHTML = \`
    <div class="lookup-availability-result">
      <div class="lookup-result-title-row">
        <p class="search-state-label">Search result</p>
        <span class="status-pill \${escapeHtml(phasePill)}">\${escapeHtml(phaseLabel)}</span>
      </div>
      <h3 class="lookup-result-name">\${escapeHtml(name)}</h3>
      <p class="lookup-result-summary">This name is not owned yet, but its auction is already open.</p>
    </div>
    <div class="lookup-next-step">
      <p class="search-state-label">Next valid bid</p>
      <p>\${escapeHtml(nextBidCopy)}</p>
    </div>
    \${liveAuctionDetail}
  \`;
}

function estimateOpeningBidSatsForName(name) {
  const length = String(name ?? "").trim().length;
  if (!Number.isInteger(length) || length < 1 || length > 32) {
    return 50000n;
  }

  const base = 100000000n >> BigInt(length - 1);
  return base > 50000n ? base : 50000n;
}

function setHomeLookupHasResult(hasResult) {
  const lookupPanel = elements.searchResult?.closest?.(".hero-home-lookup");
  if (!lookupPanel) {
    return;
  }

  lookupPanel.classList.toggle("has-search-result", Boolean(hasResult));
}

function setSearchResultVariant(status) {
  if (!elements.searchResult) {
    return;
  }

  elements.searchResult.classList.remove("empty", "available-state", "immature-state", "mature-state", "invalid-state");

  switch (String(status ?? "")) {
    case "available":
      elements.searchResult.classList.add("available-state");
      break;
    case "immature":
      elements.searchResult.classList.add("immature-state");
      break;
    case "mature":
      elements.searchResult.classList.add("mature-state");
      break;
    case "invalid":
      elements.searchResult.classList.add("invalid-state");
      break;
    default:
      break;
  }
}

function renderTransferRecipientKey(generated) {
  if (!elements.transferRecipientKeyResult) {
    return;
  }

  elements.transferRecipientKeyResult.classList.remove("empty");
  elements.transferRecipientKeyResult.innerHTML = \`
    <div class="result-title">
      <h3>Recipient Key Created</h3>
      <span class="status-pill \${escapeHtml(generated.source === "browser-local" ? "mature" : "pending")}">\${escapeHtml(generated.sourceLabel)}</span>
    </div>
    <p class="prototype-warning">\${escapeHtml(generated.warning)}</p>
    <div class="result-grid">
      <div class="result-item result-item-wide">
        <label>Share this pubkey</label>
        \${renderCopyableCode(generated.ownerPubkey)}
      </div>
    </div>
    <div class="hero-cta-row">
      <button type="button" data-download-transfer-generated-owner-key="1">Download Key Backup</button>
      <button type="button" class="secondary-button" data-use-transfer-generated-owner-key="1">Use In Transfer Form</button>
    </div>
    <details class="detail-technical">
      <summary>Show private key</summary>
      <div class="detail-technical-body">
        <p class="field-note">Save this private key before leaving. Whoever controls it can update destinations or authorize the next transfer after the name moves.</p>
        \${renderCopyableCode(generated.privateKeyHex)}
      </div>
    </details>
  \`;
}

function getGeneratedTransferOwnerKeyForDraft(draft) {
  if (!draft || !state.transferGeneratedOwnerKey) {
    return null;
  }

  return String(draft.newOwnerPubkey) === String(state.transferGeneratedOwnerKey.ownerPubkey)
    ? state.transferGeneratedOwnerKey
    : null;
}

function renderPrivateFundingResult(result) {
  if (!elements.privateFundingResult) {
    return;
  }

  elements.privateFundingResult.classList.remove("empty");
  elements.privateFundingResult.innerHTML = \`
    <div class="result-title">
      <h3>Demo Coins Sent</h3>
      <span class="status-pill available">funded</span>
    </div>
    <p class="field-value">
      Sent \${escapeHtml(formatSats(result.fundedSats))} to your Sparrow wallet and mined \${escapeHtml(String(result.minedBlocks))} confirming block immediately.
    </p>
    <div class="result-grid">
      <div class="result-item">
        <label>Receive Address</label>
        \${renderCopyableCode(result.address)}
      </div>
      <div class="result-item">
        <label>Funding Tx</label>
        \${renderCopyableCode(result.txid)}
      </div>
      <div class="result-item">
        <label>Amount</label>
        <p class="field-value">\${escapeHtml(formatSats(result.fundedSats))}</p>
      </div>
      <div class="result-item">
        <label>Cooldown</label>
        <p class="field-value">\${escapeHtml(String(Math.ceil(Number(result.cooldownMs ?? 0) / 1000)))} seconds</p>
      </div>
    </div>
    <div class="step-list">
      <p class="step-list-label">What To Do Next</p>
      <ol>
        <li>Refresh Sparrow so the new confirmed UTXO appears.</li>
        <li>Keep using that same wallet when you prepare auction bid transactions.</li>
        <li>In Sparrow, open the <strong>UTXOs</strong> tab and copy the <strong>Output</strong> value for the coin you want to spend.</li>
        <li>Paste that Output value into the <strong>Funded Sparrow output</strong> field on Auctions.</li>
        <li>Sign and broadcast the PSBT in Sparrow so private keys stay in your wallet.</li>
      </ol>
    </div>
  \`;
}

function downloadJsonFile(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2) + "\\n"], {
    type: "application/json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadTextFile(text, filename) {
  const blob = new Blob([String(text)], {
    type: "text/plain;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadBase64File(base64, filename, type = "application/octet-stream") {
  const cleanBase64 = String(base64 ?? "").replace(/\\s+/g, "");
  const binary = atob(cleanBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildGeneratedOwnerKeyText(generatedOwnerKey, nameHint) {
  return [
    "Open Name Tags generated owner key",
    "===================",
    "",
    "Name: " + String(nameHint ?? "unassigned"),
    "Source: " + String(generatedOwnerKey.sourceLabel ?? "generated helper"),
    "Owner pubkey: " + String(generatedOwnerKey.ownerPubkey),
    "Owner private key: " + String(generatedOwnerKey.privateKeyHex),
    "",
    "Why this matters",
    "----------------",
    "This key controls owner-authorized actions for the name itself.",
    "Keep it if you want to update destinations or authorize transfers later.",
    "",
    "Warning",
    "-------",
    String(generatedOwnerKey.warning)
  ].join("\\n");
}

function buildTransferDraft({ record, activity, newOwnerPubkey, mode, sellerPayoutAddress, bondAddress }) {
  if (String(record.status) === "invalid") {
    return {
      kind: "invalid",
      name: record.name,
      status: record.status,
      record,
      activity,
      newOwnerPubkey,
      summary:
        "This name has been released, so the next move is a fresh auction path rather than a transfer.",
      modes: [],
      recommendedMode: null
    };
  }

  const normalizedMode = normalizeTransferMode(mode, record.status, sellerPayoutAddress);
  const sellerPayout = sellerPayoutAddress || "<seller-payout-address>";
  const successorBondAddress = bondAddress || "<successor-bond-address>";
  const bondInputDescriptor =
    record.currentBondTxid +
    ":" +
    String(record.currentBondVout) +
    ":" +
    String(record.currentBondValueSats) +
    ":<current-bond-address>";
  const feeInputDescriptor = "<fee-input-txid:vout:valueSats:address>";
  const ownerKeyPlaceholder = "<current-owner-private-key-hex>";
  const ownerWifPlaceholder = "<owner-wif>";
  const buyerWifPlaceholder = "<buyer-wif>";
  const giftCommand = [
    "npm run dev:cli -- submit-transfer \\\\",
    "  --prev-state-txid " + String(record.lastStateTxid) + " \\\\",
    "  --new-owner-pubkey " + String(newOwnerPubkey) + " \\\\",
    "  --owner-private-key-hex " + ownerKeyPlaceholder + " \\\\",
    "  --bond-input " + bondInputDescriptor + " \\\\",
    "  --input " + feeInputDescriptor + " \\\\",
    "  --successor-bond-vout 0 \\\\",
    "  --successor-bond-sats " + String(record.currentBondValueSats) + " \\\\",
    "  --fee-sats <fee-sats> \\\\",
    "  --bond-address " + successorBondAddress + " \\\\",
    "  --wif " + ownerWifPlaceholder
  ].join("\\n");
  const immatureSaleCommand = [
    "npm run dev:cli -- submit-immature-sale-transfer \\\\",
    "  --prev-state-txid " + String(record.lastStateTxid) + " \\\\",
    "  --new-owner-pubkey " + String(newOwnerPubkey) + " \\\\",
    "  --owner-private-key-hex " + ownerKeyPlaceholder + " \\\\",
    "  --bond-input " + bondInputDescriptor + " \\\\",
    "  --buyer-input <buyer-input-txid:vout:valueSats:address> \\\\",
    "  --successor-bond-vout 0 \\\\",
    "  --successor-bond-sats " + String(record.currentBondValueSats) + " \\\\",
    "  --sale-price-sats <sale-price-sats> \\\\",
    "  --seller-payout-address " + sellerPayout + " \\\\",
    "  --fee-sats <fee-sats> \\\\",
    "  --bond-address " + successorBondAddress + " \\\\",
    "  --wif " + ownerWifPlaceholder + " \\\\",
    "  --wif " + buyerWifPlaceholder
  ].join("\\n");
  const matureSaleCommand = [
    "npm run dev:cli -- submit-sale-transfer \\\\",
    "  --prev-state-txid " + String(record.lastStateTxid) + " \\\\",
    "  --new-owner-pubkey " + String(newOwnerPubkey) + " \\\\",
    "  --owner-private-key-hex " + ownerKeyPlaceholder + " \\\\",
    "  --seller-input <seller-input-txid:vout:valueSats:address> \\\\",
    "  --buyer-input <buyer-input-txid:vout:valueSats:address> \\\\",
    "  --seller-payment-sats <sale-price-sats> \\\\",
    "  --seller-payment-address " + sellerPayout + " \\\\",
    "  --fee-sats <fee-sats> \\\\",
    "  --wif " + ownerWifPlaceholder + " \\\\",
    "  --wif " + buyerWifPlaceholder
  ].join("\\n");

  const modes = String(record.status) === "immature"
    ? [
        {
          key: "gift",
          title: "Gift / pre-arranged transfer",
          suitability: normalizedMode === "gift" ? "Selected on this page" : "Good default when no sale payment needs to be embedded",
          copy:
            "Use the current bond outpoint plus a successor bond output. The current CLI flow carries the bond forward in the same transfer transaction.",
          command: giftCommand
        },
        {
          key: "immature-sale",
          title: "Receiver-funded settling sale",
          suitability:
            normalizedMode === "immature-sale"
              ? "Selected on this page"
              : "Best sale path while the name is still settling",
          copy:
            "The receiver funds the successor bond and seller payout atomically, so bond continuity and sale settlement happen in one transaction.",
          command: immatureSaleCommand
        }
      ]
    : [
        {
          key: "gift",
          title: "Gift / pre-arranged transfer",
          suitability: normalizedMode === "gift" ? "Selected on this page" : "Available if you want a simple owner handoff",
          copy:
            "The protocol no longer requires bond continuity after maturity, but the current CLI gift flow still carries the recorded bond input forward conservatively.",
          command: giftCommand
        },
        {
          key: "sale",
          title: "Cooperative active sale",
          suitability: normalizedMode === "sale" ? "Selected on this page" : "Best sale path after maturity",
          copy:
            "Use a cooperative payment-plus-transfer transaction so seller payment and name transfer settle together on-chain.",
          command: matureSaleCommand
        }
      ];

  return {
    kind: "transfer",
    name: record.name,
    status: record.status,
    record,
    activity,
    newOwnerPubkey,
    sellerPayoutAddress,
    bondAddress,
    recommendedMode: normalizedMode,
    summary:
      String(record.status) === "immature"
        ? "This name is still settling, so any transfer must respect the live bond state."
        : "This name is active, so the transfer can focus on ownership change and optional seller payment.",
    modes
  };
}

function normalizeTransferMode(mode, status, sellerPayoutAddress) {
  const raw = String(mode ?? "auto");
  if (raw === "gift") {
    return "gift";
  }

  if (raw === "sale" || raw === "immature-sale") {
    return String(status) === "immature" ? "immature-sale" : "sale";
  }

  if (!sellerPayoutAddress || String(sellerPayoutAddress).trim().length === 0) {
    return "gift";
  }

  return String(status) === "immature" ? "immature-sale" : "sale";
}

function buildTransferPackage(draft) {
  if (draft.kind === "invalid") {
    throw new Error("invalid names cannot be exported as transfer packages");
  }

  const recommendedMode = getRecommendedTransferMode(draft);

  return {
    format: TRANSFER_PACKAGE_FORMAT,
    packageVersion: TRANSFER_PACKAGE_VERSION,
    protocol: PROTOCOL_ID,
    exportedAt: new Date().toISOString(),
    name: String(draft.name),
    currentStatus: String(draft.status),
    currentOwnerPubkey: String(draft.record.currentOwnerPubkey),
    newOwnerPubkey: String(draft.newOwnerPubkey),
    lastStateTxid: String(draft.record.lastStateTxid),
    currentBondTxid: String(draft.record.currentBondTxid),
    currentBondVout: Number(draft.record.currentBondVout),
    currentBondValueSats: String(draft.record.currentBondValueSats),
    requiredBondSats: String(draft.record.requiredBondSats),
    recommendedMode: String(draft.recommendedMode),
    settlementExpectation: String(getTransferSettlementExpectation(recommendedMode)),
    prototypeExecutionModel: String(getTransferPrototypeExecutionModel(recommendedMode)),
    sellerPayoutAddress: draft.sellerPayoutAddress || null,
    successorBondAddress: draft.bondAddress || null,
    participantSummary: transferParticipantLines(draft, recommendedMode),
    sharedReviewChecklist: buildTransferSharedReviewChecklist(draft, recommendedMode),
    sellerChecklist: buildTransferRoleChecklist(draft, recommendedMode, "seller"),
    buyerChecklist: buildTransferRoleChecklist(draft, recommendedMode, "buyer"),
    modes: draft.modes.map((mode) => ({
      key: String(mode.key),
      title: String(mode.title),
      suitability: String(mode.suitability),
      summary: String(mode.copy),
      command: String(mode.command)
    }))
  };
}

function buildSellerTransferPackage(draft) {
  if (draft.kind === "invalid") {
    throw new Error("invalid names cannot be exported as seller transfer packages");
  }

  const recommendedMode = getRecommendedTransferMode(draft);

  return {
    format: TRANSFER_PACKAGE_FORMAT,
    packageVersion: TRANSFER_PACKAGE_VERSION,
    protocol: PROTOCOL_ID,
    role: "seller",
    exportedAt: new Date().toISOString(),
    name: String(draft.name),
    currentStatus: String(draft.status),
    currentOwnerPubkey: String(draft.record.currentOwnerPubkey),
    newOwnerPubkey: String(draft.newOwnerPubkey),
    lastStateTxid: String(draft.record.lastStateTxid),
    currentBondTxid: String(draft.record.currentBondTxid),
    currentBondVout: Number(draft.record.currentBondVout),
    currentBondValueSats: String(draft.record.currentBondValueSats),
    requiredBondSats: String(draft.record.requiredBondSats),
    recommendedMode: String(draft.recommendedMode),
    settlementExpectation: String(getTransferSettlementExpectation(recommendedMode)),
    prototypeExecutionModel: String(getTransferPrototypeExecutionModel(recommendedMode)),
    sellerPayoutAddress: draft.sellerPayoutAddress || null,
    successorBondAddress: draft.bondAddress || null,
    sharedReviewChecklist: buildTransferSharedReviewChecklist(draft, recommendedMode),
    roleChecklist: buildTransferRoleChecklist(draft, recommendedMode, "seller"),
    recommendedCommand: String(recommendedMode.command),
    participantSummary: transferParticipantLines(draft, recommendedMode)
  };
}

function buildBuyerTransferPackage(draft) {
  if (draft.kind === "invalid") {
    throw new Error("invalid names cannot be exported as buyer transfer packages");
  }

  const recommendedMode = getRecommendedTransferMode(draft);
  const generatedRecipientKey = getGeneratedTransferOwnerKeyForDraft(draft);

  return {
    format: TRANSFER_PACKAGE_FORMAT,
    packageVersion: TRANSFER_PACKAGE_VERSION,
    protocol: PROTOCOL_ID,
    role: "buyer",
    exportedAt: new Date().toISOString(),
    name: String(draft.name),
    currentStatus: String(draft.status),
    currentOwnerPubkey: String(draft.record.currentOwnerPubkey),
    newOwnerPubkey: String(draft.newOwnerPubkey),
    lastStateTxid: String(draft.record.lastStateTxid),
    currentBondValueSats: String(draft.record.currentBondValueSats),
    requiredBondSats: String(draft.record.requiredBondSats),
    recommendedMode: String(draft.recommendedMode),
    settlementExpectation: String(getTransferSettlementExpectation(recommendedMode)),
    prototypeExecutionModel: String(getTransferPrototypeExecutionModel(recommendedMode)),
    sharedReviewChecklist: buildTransferSharedReviewChecklist(draft, recommendedMode),
    roleChecklist: buildTransferRoleChecklist(draft, recommendedMode, "buyer"),
    participantSummary: transferParticipantLines(draft, recommendedMode),
    ...(generatedRecipientKey
      ? {
          generatedRecipientKey: {
            ownerPubkey: generatedRecipientKey.ownerPubkey,
            privateKeyHex: generatedRecipientKey.privateKeyHex,
            source: generatedRecipientKey.source,
            sourceLabel: generatedRecipientKey.sourceLabel,
            warning: generatedRecipientKey.warning
          }
        }
      : {})
  };
}

function getRecommendedTransferMode(draft) {
  return draft.modes.find((mode) => mode.key === draft.recommendedMode) ?? draft.modes[0];
}

function getAlternativeTransferModes(draft) {
  return draft.modes.filter((mode) => mode.key !== draft.recommendedMode);
}

function transferParticipantLines(draft, mode) {
  if (mode.key === "gift") {
    return [
      "The current owner provides the owner key material and the recorded bond context.",
      String(draft.status) === "immature"
        ? "You still need a successor bond output in the same transaction because the name is still settling."
        : "The current CLI still carries bond details forward conservatively, even though active names no longer require continuity.",
      "A fee input and destination addresses still need to be filled in before signing."
    ];
  }

  if (mode.key === "immature-sale") {
    return [
      "The current owner provides the owner key material and confirms the exact transfer terms.",
      "The receiver provides the funding inputs for the successor bond and the seller payout.",
      "Both sides should review one exact transaction because payment and bond continuity settle together."
    ];
  }

  return [
    "The current owner provides the owner key material and a seller-side input.",
    "The receiver provides payment-side funding inputs for the sale settlement.",
    "Both sides should review one exact transaction so seller payment and ownership move together."
  ];
}

function getTransferSettlementExpectation(mode) {
  return mode.key === "gift"
    ? "gift_or_prearranged_handoff"
    : "atomic_same_transaction_for_sale";
}

function getTransferPrototypeExecutionModel(mode) {
  return mode.key === "gift"
    ? "coordinated_cli_handoff"
    : "coordinated_cli_handoff_pending_two_party_psbt_flow";
}

function buildTransferSharedReviewChecklist(draft, mode) {
  const checklist = [
    "Confirm the exact name, current owner pubkey, recipient pubkey, and last state txid."
  ];

  if (mode.key !== "gift") {
    checklist.push(
      "Confirm the seller payment address, intended payment amount, and every transaction input/output before anyone signs."
    );
    checklist.push(
      "Do not split payment and transfer into separate promises. Both sides should settle against the same exact Bitcoin transaction."
    );
  }

  if (String(draft.status) === "immature") {
    checklist.push(
      "Confirm the successor bond output is present in the same transaction and still meets the required bond."
    );
  }

  return checklist;
}

function buildTransferRoleChecklist(draft, mode, role) {
  if (role === "seller") {
    const checklist = [
      "Confirm the recipient pubkey is the exact receiver key you intend to authorize."
    ];

    if (mode.key === "gift") {
      checklist.push("Confirm the bond details and fee inputs before signing.");
    } else {
      checklist.push("Confirm the seller payout address and payment amount before signing any shared transaction.");
      checklist.push("Do not release owner authorization against a separate promise to pay later.");
    }

    return checklist;
  }

  const checklist = [
    "Confirm the recipient pubkey matches the key whose private half you actually control."
  ];

  if (mode.key === "gift") {
    checklist.push("Confirm the resulting ownership handoff matches the exact name and state txid in this package.");
  } else {
    checklist.push("Confirm the transaction you fund is the same transaction that moves the name to your pubkey.");
    checklist.push("Do not send payment in a separate step against a promise to transfer later.");
  }

  if (String(draft.status) === "immature") {
    checklist.push("Confirm the successor bond output is created for the receiver side in the same transaction.");
  }

  return checklist;
}

function transferPrimarySteps(draft, mode) {
  const steps = [
    "Replace the placeholder keys, funding inputs, payout address, and fee values in the command block.",
    "Keep the current owner pubkey and last state txid exactly as shown in this handoff."
  ];

  if (mode.key === "gift") {
    steps.push("Use the gift transfer command when no buyer payment needs to settle inside the transfer transaction.");
  } else if (mode.key === "immature-sale") {
    steps.push("Use the buyer-funded settling sale command so the successor bond and seller payout happen atomically.");
    steps.push("Both sides should review the same exact transaction details before anyone signs or funds it.");
  } else {
    steps.push("Use the cooperative active sale command so the seller payout and ownership transfer finalize together.");
    steps.push("Both sides should review the same exact transaction details before anyone signs or funds it.");
  }

  if (String(draft.status) === "immature") {
    steps.push("Because this name is still settling, confirm the successor bond output is present and at least meets the required bond.");
  }

  if (mode.key !== "gift") {
    steps.push("Advanced note: this page prepares a coordinated handoff; the full two-party PSBT wizard is still a next step.");
  }

  steps.push("Run the command locally, then return to the explorer to confirm the new owner and state txid.");
  return steps;
}

function transferSimpleNextSteps(draft, mode) {
  const steps = [
    "Download the transfer handoff as a backup for the exact name, current owner, recipient pubkey, and current state.",
    "Build the final Bitcoin transaction using the advanced handoff details."
  ];

  if (mode.key === "gift") {
    steps.push("If this is a gift or pre-arranged transfer, no seller payout is embedded in the transfer transaction.");
  } else {
    steps.push("If this is a sale, the buyer payment and ownership change should be in the same Bitcoin transaction.");
  }

  if (String(draft.status) === "immature") {
    steps.push("Because the name is still settling, confirm the successor bond output is created in that transaction.");
  }

  steps.push("After broadcast, open Explore to confirm the new owner key is visible.");
  return steps;
}

function renderTransferDraft(draft) {
  if (!elements.transferDraftResult) {
    return;
  }

  elements.transferDraftResult.classList.remove("empty");

  if (draft.kind === "invalid") {
    elements.transferDraftResult.innerHTML = \`
      <div class="search-state-banner invalid">
        <p class="search-state-label">Transfer Status</p>
        <h4 class="search-state-title">Auction Path Instead Of Transfer</h4>
        <p class="search-state-copy">\${escapeHtml(draft.summary)}</p>
      </div>
      <div class="result-title">
        <h3>\${escapeHtml(draft.name)}</h3>
        <span class="status-pill invalid">Released</span>
      </div>
      <div class="hero-cta-row">
        <a class="action-link" href="\${escapeHtml(buildAuctionsPath(draft.name))}">Open auctions</a>
        <a class="action-link secondary" href="\${escapeHtml(buildNameDetailPath(draft.name))}">Open detail page</a>
      </div>
    \`;
    return;
  }

  const transferEssentialsText = buildTransferEssentialsText(draft);
  const recommendedMode = getRecommendedTransferMode(draft);
  const alternativeModes = getAlternativeTransferModes(draft);
  const isSale = recommendedMode.key !== "gift";
  const flowTitle = isSale ? "Sale Transfer" : "Gift / Pre-Arranged Transfer";
  const flowCopy = isSale
    ? "Sale was selected, so payment and ownership should settle in the same Bitcoin transaction."
    : "Gift was selected, so this prepares an ownership handoff without embedding a buyer payment.";
  const bondCopy = String(draft.status) === "immature"
    ? "The name is still settling. The final transaction must create a successor bond for the recipient side."
    : "The name is active. Keep the bond context for review, but destination updates and later transfers are controlled by the owner key.";
  elements.transferDraftResult.innerHTML = \`
    <div class="search-state-banner \${escapeHtml(draft.status)}">
      <p class="search-state-label">Transfer Status</p>
      <h4 class="search-state-title">\${escapeHtml(flowTitle)}</h4>
      <p class="search-state-copy">\${escapeHtml(draft.summary)}</p>
    </div>
    <div class="result-title">
      <h3>\${escapeHtml(draft.name)}</h3>
      <span class="status-pill \${escapeHtml(draft.status)}">\${escapeHtml(formatStateLabel(draft.status))}</span>
    </div>
    <p class="result-meta">
      \${renderDetailLink(draft.name, "Open detail page")} · \${renderTransferPrepLink(draft.name, "Stay on transfer prep")}
    </p>
    <div class="result-grid">
      <div class="result-item">
        <label>Current owner</label>
        \${renderCopyableCode(draft.record.currentOwnerPubkey)}
      </div>
      <div class="result-item">
        <label>Recipient pubkey</label>
        \${renderCopyableCode(draft.newOwnerPubkey)}
      </div>
      <div class="result-item">
        <label>Transfer type</label>
        <p class="field-value">\${escapeHtml(flowTitle)}</p>
      </div>
      <div class="result-item">
        <label>Current bond</label>
        <p class="field-value">\${escapeHtml(formatSats(draft.record.currentBondValueSats))}</p>
      </div>
      <div class="result-item">
        <label>Required bond</label>
        <p class="field-value">\${escapeHtml(formatSats(draft.record.requiredBondSats))}</p>
      </div>
    </div>
    <div class="guide-grid">
      <article class="guide-card">
        <h3>Recommended Path</h3>
        <p class="field-value">\${escapeHtml(flowCopy)}</p>
        <p class="inline-note">\${escapeHtml(recommendedMode.copy)}</p>
      </article>
      <article class="guide-card">
        <h3>Bond Handling</h3>
        <p class="field-value">\${escapeHtml(bondCopy)}</p>
      </article>
    </div>
    \${isSale ? \`
      <div class="search-state-banner pending">
        <p class="search-state-label">Sale Safety</p>
        <h4 class="search-state-title">Settle Payment And Transfer Together</h4>
        <p class="search-state-copy">Do not pay in one transaction and trust a later transfer promise. Both sides should check the same exact Bitcoin transaction before signing or funding it.</p>
      </div>
    \` : ""}
    <div class="step-list">
      <p class="step-list-label">What To Do Next</p>
      <ol>
        \${transferSimpleNextSteps(draft, recommendedMode)
          .map((step) => \`<li>\${escapeHtml(step)}</li>\`)
          .join("")}
      </ol>
    </div>
    <details class="step-list detail-technical">
      <summary>Advanced CLI handoff details</summary>
      <div class="detail-technical-body">
        <p class="tx-panel-note">These are low-level CLI fallback commands. Some flag names still use implementation base-unit wording; user-facing amounts in the website are shown in ₿.</p>
        <div class="result-grid">
          <div class="result-item">
            <label>Last state txid</label>
            \${renderCopyableCode(draft.record.lastStateTxid)}
          </div>
          <div class="result-item">
            <label>Current bond input</label>
            <p class="field-value">\${escapeHtml(draft.record.currentBondTxid)}:\${escapeHtml(String(draft.record.currentBondVout))}</p>
          </div>
          <div class="result-item result-item-wide">
            <label>Primary CLI command</label>
            <div class="copy-block">
              <div class="copy-block-head">
                <label>Recommended command</label>
                <button type="button" class="copy-button" data-copy="\${escapeHtml(recommendedMode.command)}">Copy command</button>
              </div>
              <pre>\${escapeHtml(recommendedMode.command)}</pre>
            </div>
          </div>
        </div>
        \${alternativeModes.length === 0 ? "" : \`
          <div class="template-list">
            \${alternativeModes
              .map(
                (mode) => \`
                  <div class="template-row">
                    <strong>\${escapeHtml(mode.title)}</strong>
                    <p class="field-value">\${escapeHtml(mode.suitability)}</p>
                    <p class="inline-note">\${escapeHtml(mode.copy)}</p>
                    <div class="copy-block">
                      <div class="copy-block-head">
                        <label>CLI command</label>
                        <button type="button" class="copy-button" data-copy="\${escapeHtml(mode.command)}">Copy command</button>
                      </div>
                      <pre>\${escapeHtml(mode.command)}</pre>
                    </div>
                  </div>
                \`
              )
              .join("")}
          </div>
        \`}
        <div class="copy-block">
          <div class="copy-block-head">
            <label>Transfer essentials</label>
            <button type="button" class="copy-button" data-copy="\${escapeHtml(transferEssentialsText)}">Copy all essentials</button>
          </div>
          <pre>\${escapeHtml(transferEssentialsText)}</pre>
        </div>
      </div>
    </details>
  \`;
}

function parseTransferPackageForReview(input) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Transfer package JSON must be an object.");
  }

  const record = input;
  const format = typeof record.format === "string" ? record.format : "";
  if (format !== "ont-transfer-package") {
    throw new Error("Transfer package format must be ont-transfer-package.");
  }

  const packageVersion = Number(record.packageVersion);
  if (!Number.isInteger(packageVersion) || packageVersion !== 1) {
    throw new Error("Transfer package version must be 1.");
  }

  const protocol = typeof record.protocol === "string" ? record.protocol : "";
  if (protocol !== PROTOCOL_ID) {
    throw new Error("Transfer package protocol must match ONT.");
  }

  const name = parseTransferPackageString(record.name, "name");
  const currentStatus = parseTransferPackageEnum(record.currentStatus, "currentStatus", ["immature", "mature"]);
  const currentOwnerPubkey = parseTransferPackageHex(record.currentOwnerPubkey, 64, "currentOwnerPubkey");
  const newOwnerPubkey = parseTransferPackageHex(record.newOwnerPubkey, 64, "newOwnerPubkey");
  const lastStateTxid = parseTransferPackageHex(record.lastStateTxid, 64, "lastStateTxid");
  const currentBondTxid = parseTransferPackageHex(record.currentBondTxid, 64, "currentBondTxid");
  const currentBondVout = parseTransferPackageByte(record.currentBondVout, "currentBondVout");
  const currentBondValueSats = parseTransferPackageBigIntString(record.currentBondValueSats, "currentBondValueSats");
  const requiredBondSats = parseTransferPackageBigIntString(record.requiredBondSats, "requiredBondSats");
  const recommendedMode = parseTransferPackageEnum(record.recommendedMode, "recommendedMode", ["gift", "immature-sale", "sale"]);
  const sellerPayoutAddress = parseTransferPackageOptionalString(record.sellerPayoutAddress, "sellerPayoutAddress");
  const successorBondAddress = parseTransferPackageOptionalString(record.successorBondAddress, "successorBondAddress");
  const modes = parseTransferPackageModes(record.modes);

  if (!modes.some((mode) => mode.key === recommendedMode)) {
    throw new Error("Recommended mode must match one of the package modes.");
  }

  return {
    format,
    packageVersion,
    protocol,
    name,
    currentStatus,
    currentOwnerPubkey,
    newOwnerPubkey,
    lastStateTxid,
    currentBondTxid,
    currentBondVout,
    currentBondValueSats,
    requiredBondSats,
    recommendedMode,
    sellerPayoutAddress,
    successorBondAddress,
    modes
  };
}

function renderTransferPackageReview(pkg, role) {
  if (!elements.transferPackageReviewResult) {
    return;
  }

  const recommendedMode = pkg.modes.find((mode) => mode.key === pkg.recommendedMode) ?? null;
  const checklist = buildTransferPackageReviewChecklist(pkg, role);

  elements.transferPackageReviewResult.classList.remove("empty");
  elements.transferPackageReviewResult.innerHTML = \`
    <div class="result-title">
      <h3>\${escapeHtml(role === "buyer" ? "Receiver Package Review" : "Current Owner Package Review")}</h3>
      <span class="status-pill transfer">\${escapeHtml(role === "buyer" ? "receiver" : "current owner")}</span>
    </div>
    <div class="result-grid">
      <div class="result-item">
        <label>Name</label>
        <p class="field-value">\${escapeHtml(pkg.name)}</p>
      </div>
      <div class="result-item">
        <label>Current status</label>
        <p class="field-value">\${escapeHtml(pkg.currentStatus)}</p>
      </div>
      <div class="result-item">
        <label>Current owner</label>
        \${renderCopyableCode(pkg.currentOwnerPubkey)}
      </div>
      <div class="result-item">
        <label>New owner</label>
        \${renderCopyableCode(pkg.newOwnerPubkey)}
      </div>
      <div class="result-item">
        <label>Last state txid</label>
        \${renderCopyableCode(pkg.lastStateTxid)}
      </div>
      <div class="result-item">
        <label>Current bond outpoint</label>
        <p class="field-value">\${escapeHtml(pkg.currentBondTxid)}:\${escapeHtml(String(pkg.currentBondVout))}</p>
      </div>
      <div class="result-item">
        <label>Current bond amount</label>
        <p class="field-value">\${escapeHtml(formatSats(pkg.currentBondValueSats))}</p>
      </div>
      <div class="result-item">
        <label>Required bond</label>
        <p class="field-value">\${escapeHtml(formatSats(pkg.requiredBondSats))}</p>
      </div>
      <div class="result-item">
        <label>Recommended mode</label>
        <p class="field-value">\${escapeHtml(pkg.recommendedMode)}</p>
      </div>
      <div class="result-item">
        <label>Seller payout</label>
        <p class="field-value">\${escapeHtml(pkg.sellerPayoutAddress ?? "(set before signing)")}</p>
      </div>
      <div class="result-item">
        <label>Successor bond address</label>
        <p class="field-value">\${escapeHtml(pkg.successorBondAddress ?? "(set before signing)")}</p>
      </div>
    </div>
    \${recommendedMode ? \`
      <div class="step-list">
        <p class="step-list-label">Recommended path</p>
        <div class="guide-grid">
          <article class="guide-card">
            <h3>\${escapeHtml(recommendedMode.title)}</h3>
            <p class="field-value">\${escapeHtml(recommendedMode.suitability)}</p>
            <p class="inline-note">\${escapeHtml(recommendedMode.summary)}</p>
          </article>
          <article class="guide-card">
            <h3>CLI command</h3>
            <p class="tx-panel-note">Low-level CLI fallback. Some flag names still use implementation base-unit wording; user-facing amounts in the website are shown in ₿.</p>
            <div class="copy-block">
              <div class="copy-block-head">
                <label>Recommended command</label>
                <button type="button" class="copy-button" data-copy="\${escapeHtml(recommendedMode.command)}">Copy command</button>
              </div>
              <pre>\${escapeHtml(recommendedMode.command)}</pre>
            </div>
          </article>
        </div>
      </div>
    \` : ""}
    <div class="step-list">
      <p class="step-list-label">\${escapeHtml(role === "buyer" ? "Receiver checklist" : "Current owner checklist")}</p>
      <ul class="guide-list">
        \${checklist.map((item) => \`<li>\${escapeHtml(item)}</li>\`).join("")}
      </ul>
    </div>
  \`;
}

function buildTransferPackageReviewChecklist(pkg, role) {
  const items = [];
  if (role === "buyer") {
    items.push("Confirm the new owner pubkey is your pubkey before you fund or sign anything.");
    items.push("Confirm the recommended mode matches whether this is a sale or a gift/pre-arranged transfer.");
    if (pkg.recommendedMode !== "gift") {
      items.push("Do not fund a separate payment step against a promise to transfer later.");
      items.push("The Bitcoin transaction you fund should be the same transaction that moves the name to your pubkey.");
      items.push(
        pkg.sellerPayoutAddress
          ? "Confirm the seller payout address matches the agreed destination."
          : "Ask the current owner to finalize and share the expected seller payout address before signing."
      );
    }
    if (pkg.currentStatus === "immature") {
      items.push(
        pkg.successorBondAddress
          ? "Confirm the successor bond address is present for the live bond path."
          : "Ask the current owner to finalize the successor bond address before signing, because bond continuity still matters."
      );
    }
    items.push("Only proceed once the package fields match the exact transaction terms you expect.");
    return items;
  }

  items.push("Confirm the new owner pubkey came from the intended receiver.");
  items.push("Confirm the recommended mode matches the deal you intend to settle.");
  if (pkg.recommendedMode !== "gift") {
    items.push("Do not authorize the transfer against a separate promise to pay later.");
    items.push("Seller payment and name transfer should settle in the same exact Bitcoin transaction.");
    items.push(
      pkg.sellerPayoutAddress
        ? "Confirm the seller payout address is correct."
        : "Set and verify the seller payout address before any signatures happen."
    );
  }
  if (pkg.currentStatus === "immature") {
    items.push(
      pkg.successorBondAddress
        ? "Confirm the successor bond address is correct for the live bond path."
        : "Set and verify the successor bond address before signing, because bond continuity still matters."
    );
  }
  items.push("Only proceed once the package fields match the exact transaction terms you intend to settle.");
  return items;
}

function parseTransferPackageModes(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Transfer package modes must be a non-empty array.");
  }

  return value.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error("Transfer package modes[" + String(index) + "] must be an object.");
    }

    return {
      key: parseTransferPackageEnum(item.key, "modes[" + String(index) + "].key", ["gift", "immature-sale", "sale"]),
      title: parseTransferPackageString(item.title, "modes[" + String(index) + "].title"),
      suitability: parseTransferPackageString(item.suitability, "modes[" + String(index) + "].suitability"),
      summary: parseTransferPackageString(item.summary, "modes[" + String(index) + "].summary"),
      command: parseTransferPackageString(item.command, "modes[" + String(index) + "].command")
    };
  });
}

function parseTransferPackageString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(label + " must be a non-empty string.");
  }

  return value;
}

function parseTransferPackageOptionalString(value, label) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(label + " must be a string when present.");
  }

  return value;
}

function parseTransferPackageEnum(value, label, allowed) {
  const parsed = parseTransferPackageString(value, label);
  if (!allowed.includes(parsed)) {
    throw new Error(label + " must be one of: " + allowed.join(", "));
  }

  return parsed;
}

function parseTransferPackageHex(value, length, label) {
  const parsed = parseTransferPackageString(value, label).toLowerCase();
  if (!/^[0-9a-f]+$/.test(parsed) || parsed.length !== length) {
    throw new Error(label + " must be " + String(length / 2) + " bytes of hex.");
  }

  return parsed;
}

function parseTransferPackageByte(value, label) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(label + " must be an integer between 0 and 255.");
  }

  return value;
}

function parseTransferPackageBigIntString(value, label) {
  const parsed = parseTransferPackageString(value, label);
  const numeric = BigInt(parsed);
  if (numeric < 0n) {
    throw new Error(label + " must be non-negative.");
  }

  return numeric.toString();
}

function buildTransferEssentialsText(draft) {
  if (draft.kind === "invalid") {
    return "This name has been released. Use a fresh auction path instead of transferring it.";
  }

  const recommendedMode = getRecommendedTransferMode(draft);

  const lines = [
    "Open Name Tags transfer essentials",
    "=======================",
    "",
    "Name: " + String(draft.name),
    "Current status: " + formatStateLabel(draft.status),
    "Current owner pubkey: " + String(draft.record.currentOwnerPubkey),
    "New owner pubkey: " + String(draft.newOwnerPubkey),
    "Last state txid: " + String(draft.record.lastStateTxid),
    "Current bond outpoint: " + String(draft.record.currentBondTxid) + ":" + String(draft.record.currentBondVout),
    "Current bond amount: " + formatSats(draft.record.currentBondValueSats),
    "Required bond: " + formatSats(draft.record.requiredBondSats),
    "Recommended mode: " + String(draft.recommendedMode),
    "Settlement expectation: " + getTransferSettlementExpectation(recommendedMode),
    "Prototype execution model: " + getTransferPrototypeExecutionModel(recommendedMode),
    "",
    "Shared review checklist",
    "-----------------------"
  ];

  for (const item of buildTransferSharedReviewChecklist(draft, recommendedMode)) {
    lines.push("- " + item);
  }

  lines.push(
    "",
    "Mode notes",
    "----------"
  );

  for (const mode of draft.modes) {
    lines.push(mode.title + ": " + mode.copy);
  }

  lines.push("", "CLI commands", "------------");
  for (const mode of draft.modes) {
    lines.push("", mode.title, mode.command);
  }

  return lines.join("\\n");
}

function buildSellerTransferNotesText(draft) {
  if (draft.kind === "invalid") {
    return "This name has been released. Use a fresh auction path instead of transferring it.";
  }

  const recommendedMode = getRecommendedTransferMode(draft);
  const lines = [
    "Open Name Tags seller transfer notes",
    "===============================",
    "",
    "Name: " + String(draft.name),
    "Mode: " + recommendedMode.title,
    "Current owner pubkey: " + String(draft.record.currentOwnerPubkey),
    "New owner pubkey: " + String(draft.newOwnerPubkey),
    "Last state txid: " + String(draft.record.lastStateTxid),
    ""
  ];

  if (recommendedMode.key !== "gift") {
    lines.push(
      "Atomic sale reminder",
      "--------------------",
      "Do not authorize the transfer against a separate promise to pay later.",
      "Seller payment and ownership transfer should settle in the same exact Bitcoin transaction.",
      ""
    );
  }

  lines.push("Seller checklist", "----------------");
  for (const item of buildTransferRoleChecklist(draft, recommendedMode, "seller")) {
    lines.push("- " + item);
  }

  lines.push(
    "",
    "Recommended CLI command",
    "-----------------------",
    recommendedMode.command
  );

  return lines.join("\\n");
}

function buildBuyerTransferNotesText(draft) {
  if (draft.kind === "invalid") {
    return "This name has been released. Use a fresh auction path instead of transferring it.";
  }

  const recommendedMode = getRecommendedTransferMode(draft);
  const generatedRecipientKey = getGeneratedTransferOwnerKeyForDraft(draft);
  const lines = [
    "Open Name Tags buyer transfer notes",
    "==============================",
    "",
    "Name: " + String(draft.name),
    "Mode: " + recommendedMode.title,
    "New owner pubkey: " + String(draft.newOwnerPubkey),
    "Last state txid: " + String(draft.record.lastStateTxid),
    ""
  ];

  if (recommendedMode.key !== "gift") {
    lines.push(
      "Atomic sale reminder",
      "--------------------",
      "Do not fund a separate payment step against a promise to transfer later.",
      "The transaction you fund should be the same transaction that moves the name to your pubkey.",
      ""
    );
  }

  lines.push("Buyer checklist", "---------------");
  for (const item of buildTransferRoleChecklist(draft, recommendedMode, "buyer")) {
    lines.push("- " + item);
  }

  if (generatedRecipientKey) {
    lines.push(
      "",
      "Generated recipient key",
      "-----------------------",
      "Source: " + String(generatedRecipientKey.sourceLabel ?? "generated helper"),
      "Owner pubkey: " + String(generatedRecipientKey.ownerPubkey),
      "Owner private key: " + String(generatedRecipientKey.privateKeyHex),
      "Warning: " + String(generatedRecipientKey.warning)
    );
  }

  return lines.join("\\n");
}

function transferOutcomeSteps(draft) {
  if (draft.kind === "invalid") {
    return ["The current state has been released, so use a fresh auction path instead of transferring it."];
  }

  const steps = [
    "Choose the CLI mode that matches whether this is a gift/pre-arranged transfer or a sale.",
    "Replace the placeholder addresses, inputs, WIFs, and fee amounts in the copied command block.",
    "Run the command locally so the CLI can build, sign, and broadcast the transfer transaction."
  ];

  if (String(draft.status) === "immature") {
    steps.push(
      "Because this name is still settling, make sure the chosen flow preserves or recreates a valid successor bond in the same transaction."
    );
  } else {
    steps.push(
      "Because this name is active, you can use the cooperative sale flow directly when seller payment needs to settle atomically."
    );
  }

  steps.push("Return to the explorer afterward to confirm the name record moved to the new owner.");
  return steps;
}

async function openTxProvenance(txid, panelId, buttonNode) {
  const panel = document.getElementById(panelId);
  if (!panel) {
    return;
  }

  for (const candidate of document.querySelectorAll("[data-target-panel]")) {
    if (candidate.getAttribute("data-target-panel") === panelId) {
      candidate.classList.toggle("active", candidate === buttonNode);
    }
  }

  panel.classList.remove("empty");
  panel.innerHTML = '<p class="tx-panel-note">Loading transaction provenance...</p>';

  try {
    const cached = state.txCache.get(txid);
    const payload = cached ?? await fetchJson(withBasePath("/api/tx/" + encodeURIComponent(txid)));
    state.txCache.set(txid, payload);
    panel.innerHTML = renderTxProvenance(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load transaction provenance.";
    panel.innerHTML = '<p class="tx-panel-note">' + escapeHtml(message) + "</p>";
  }
}

function renderTxButtonList(record, panelId, activity = []) {
  const items = [];
  const seen = new Set();

  const txEntries = isAuctionNameRecord(record)
    ? [
        { label: "Winning Bid Tx", txid: record.acquisitionAuctionBidTxid || record.claimCommitTxid },
        { label: "Last State Tx", txid: record.lastStateTxid },
        { label: "Bond Tx", txid: record.currentBondTxid }
      ]
    : [
        { label: "Acquisition Tx", txid: record.claimCommitTxid },
        { label: "Visibility Tx", txid: record.claimRevealTxid },
        { label: "Last State Tx", txid: record.lastStateTxid },
        { label: "Bond Tx", txid: record.currentBondTxid }
      ];

  for (const entry of txEntries) {
    if (!entry.txid || seen.has(entry.txid)) {
      continue;
    }

    seen.add(entry.txid);
    items.push(
      '<button type="button" class="tx-inspect-button" data-view-tx="' +
        escapeHtml(entry.txid) +
        '" data-target-panel="' +
        escapeHtml(panelId) +
        '">' +
        escapeHtml(entry.label) +
        "</button>"
    );
  }

  const invalidationRecord = findLatestInvalidationActivity(record.name, activity);
  if (invalidationRecord && !seen.has(invalidationRecord.txid)) {
    seen.add(invalidationRecord.txid);
    items.push(
      '<button type="button" class="tx-inspect-button" data-view-tx="' +
        escapeHtml(invalidationRecord.txid) +
        '" data-target-panel="' +
        escapeHtml(panelId) +
        '">Invalidation Tx</button>'
    );
  }

  return '<div class="tx-link-list">' + items.join("") + "</div>";
}

function renderTxProvenance(tx) {
  return (
    '<div class="tx-provenance-card">' +
    "<h4>Transaction Provenance</h4>" +
    '<div class="result-grid">' +
    '<div class="result-item"><label>Txid</label>' + renderCopyableCode(tx.txid) + "</div>" +
    '<div class="result-item"><label>Block Height</label><p class="field-value">' + escapeHtml(String(tx.blockHeight)) + "</p></div>" +
    '<div class="result-item"><label>Tx Index</label><p class="field-value">' + escapeHtml(String(tx.txIndex)) + "</p></div>" +
    '<div class="result-item"><label>Inputs / Outputs</label><p class="field-value">' +
      escapeHtml(String((tx.inputs ?? []).length) + " in · " + String((tx.outputs ?? []).length) + " out") +
      "</p></div>" +
    "</div>" +
    ((tx.invalidatedNames ?? []).length > 0
      ? '<p class="tx-panel-note">Released names: ' + escapeHtml(tx.invalidatedNames.join(", ")) + "</p>"
      : '<p class="tx-panel-note">No names were released by this transaction.</p>') +
    renderTxEventList(tx.events ?? []) +
    "</div>"
  );
}

function renderTxEventList(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return '<p class="tx-panel-note">No Open Name Tags events were parsed from this transaction.</p>';
  }

  return (
    '<div class="tx-event-list">' +
    events
      .map((event) => {
        return (
          '<article class="tx-event-card">' +
          '<div class="tx-event-header">' +
          "<strong>" + escapeHtml(String(event.typeName ?? "UNKNOWN")) + "</strong>" +
          '<span class="tx-pill ' + escapeHtml(String(event.validationStatus ?? "ignored")) + '">' +
          escapeHtml(String(event.validationStatus ?? "ignored")) +
          "</span>" +
          '<span class="inline-note">vout ' + escapeHtml(String(event.vout ?? "-")) + "</span>" +
          "</div>" +
          '<p class="tx-event-meta">Reason: ' + escapeHtml(String(event.reason ?? "unknown")) + "</p>" +
          (event.affectedName
            ? '<p class="tx-event-meta">Affected name: ' + escapeHtml(String(event.affectedName)) + "</p>"
            : "") +
          renderTxEventPayload(event.payload ?? {}) +
          "</article>"
        );
      })
      .join("") +
    "</div>"
  );
}

function renderTxEventPayload(payload) {
  const rows = [];

  if (payload.ownerPubkey) {
    rows.push('<div class="result-item"><label>Owner Pubkey</label>' + renderCopyableCode(payload.ownerPubkey) + "</div>");
  }
  if (payload.name) {
    rows.push('<div class="result-item"><label>Name</label><p class="field-value">' + escapeHtml(String(payload.name)) + "</p></div>");
  }
  if (payload.newOwnerPubkey) {
    rows.push('<div class="result-item"><label>New Owner</label>' + renderCopyableCode(payload.newOwnerPubkey) + "</div>");
  }
  if (payload.prevStateTxid) {
    rows.push('<div class="result-item"><label>Prev State Txid</label>' + renderCopyableCode(payload.prevStateTxid) + "</div>");
  }
  if (payload.signature) {
    rows.push('<div class="result-item"><label>Signature</label>' + renderCopyableCode(payload.signature) + "</div>");
  }
  if (payload.bondVout !== undefined) {
    rows.push('<div class="result-item"><label>Bond Vout</label><p class="field-value">' + escapeHtml(String(payload.bondVout)) + "</p></div>");
  }
  if (payload.successorBondVout !== undefined) {
    rows.push('<div class="result-item"><label>Successor Bond Vout</label><p class="field-value">' + escapeHtml(String(payload.successorBondVout)) + "</p></div>");
  }
  if (payload.flags !== undefined) {
    rows.push('<div class="result-item"><label>Flags</label><p class="field-value">' + escapeHtml(String(payload.flags)) + "</p></div>");
  }
  if (payload.name) {
    rows.push('<div class="result-item"><label>Name</label><p class="field-value">' + escapeHtml(String(payload.name)) + "</p></div>");
  }
  if (payload.unlockBlock !== undefined) {
    rows.push('<div class="result-item"><label>Auction eligibility block</label><p class="field-value">' + escapeHtml(String(payload.unlockBlock)) + "</p></div>");
  }
  if (payload.bidAmountSats !== undefined) {
    rows.push('<div class="result-item"><label>Bid Amount</label><p class="field-value">' + escapeHtml(formatSats(payload.bidAmountSats)) + "</p></div>");
  }
  if (payload.settlementLockBlocks !== undefined) {
    rows.push('<div class="result-item"><label>Bond maturity window</label><p class="field-value">' + escapeHtml(formatBlockWindow(payload.settlementLockBlocks)) + "</p></div>");
  }
  if (payload.bidderCommitment) {
    rows.push('<div class="result-item"><label>Bidder Commitment</label>' + renderCopyableCode(payload.bidderCommitment) + "</div>");
  }
  if (payload.auctionLotCommitment) {
    rows.push('<div class="result-item"><label>Auction fingerprint</label>' + renderCopyableCode(payload.auctionLotCommitment) + "</div>");
  }
  if (payload.auctionCommitment) {
    rows.push('<div class="result-item"><label>Auction state fingerprint</label>' + renderCopyableCode(payload.auctionCommitment) + "</div>");
  }
  if (rows.length === 0) {
    return "";
  }

  return '<div class="result-grid">' + rows.join("") + "</div>";
}

function renderValueRecordPreview(valueRecord) {
  if (!valueRecord) {
    return '<p class="field-value">No destinations published yet.</p>';
  }

  if (String(valueRecord.payloadHex ?? "").length === 0 || Number(valueRecord.valueType) === 0) {
    return '<p class="field-value">Null / cleared value</p>';
  }

  const bundle = Number(valueRecord.valueType) === 255
    ? decodeProfileBundlePayloadHex(valueRecord.payloadHex)
    : null;
  if (bundle !== null) {
    return renderProfileBundlePreview(bundle);
  }

  const utf8Preview = decodeValuePayloadUtf8(valueRecord.payloadHex);
  if (utf8Preview !== null) {
    if (Number(valueRecord.valueType) === 2 && /^https?:\\/\\//i.test(utf8Preview)) {
      return (
        '<p class="field-value"><a class="detail-link" href="' +
        escapeHtml(utf8Preview) +
        '" target="_blank" rel="noreferrer noopener">' +
        escapeHtml(utf8Preview) +
        "</a></p>"
      );
    }

    return '<p class="field-value">' + escapeHtml(utf8Preview) + '</p>';
  }

  return renderCopyableCode(valueRecord.payloadHex);
}

function formatValueRecordMeta(valueRecord) {
  if (!valueRecord) {
    return "No destinations";
  }

  return "type " + formatValueType(valueRecord.valueType, valueRecord.payloadHex) + " · sequence " + String(valueRecord.sequence);
}

function formatValueType(valueType, payloadHex) {
  switch (Number(valueType)) {
    case 0:
      return "0x00 (null)";
    case 1:
      return "0x01 (bitcoin payment target)";
    case 2:
      return "0x02 (https target)";
    case 255:
      return decodeProfileBundlePayloadHex(payloadHex) !== null
        ? "0xff (destination bundle)"
        : "0xff (raw/app-defined)";
    default:
      return "0x" + Number(valueType).toString(16).padStart(2, "0");
  }
}

function renderProfileBundlePreview(bundle) {
  const rows = listProfileBundleEntries(bundle)
    .map((entry) => {
      return (
        '<div class="value-bundle-preview-row">' +
        '<label>' + escapeHtml(entry.key) + "</label>" +
        '<p class="field-value">' + renderBundleValue(entry.value) + "</p>" +
        "</div>"
      );
    })
    .join("");

  return '<div class="value-bundle-preview">' + rows + "</div>";
}

function listProfileBundleEntries(bundle) {
  return Array.isArray(bundle.entries)
    ? bundle.entries
        .map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return null;
          }

          const key = typeof entry.key === "string" ? entry.key.trim() : "";
          const value = typeof entry.value === "string" ? entry.value.trim() : "";
          return key !== "" && value !== "" ? { key, value } : null;
        })
        .filter(Boolean)
    : [];
}

function renderBundleValue(value) {
  if (/^https?:\\/\\//i.test(value) || /^bitcoin:/i.test(value)) {
    return (
      '<a class="detail-link" href="' +
      escapeHtml(value) +
      '" target="_blank" rel="noreferrer noopener">' +
      escapeHtml(value) +
      "</a>"
    );
  }

  return escapeHtml(value);
}

function decodeProfileBundlePayloadHex(payloadHex) {
  const text = decodeValuePayloadUtf8(payloadHex);
  if (text === null) {
    return null;
  }

  try {
    const payload = JSON.parse(text);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }

    if (payload.kind !== "ont-key-value-bundle") {
      return null;
    }

    if (payload.version === 1 && Array.isArray(payload.entries)) {
      return {
        kind: payload.kind,
        version: 1,
        entries: listProfileBundleEntries(payload)
      };
    }

    return null;
  } catch {
    return null;
  }
}

function decodeValuePayloadUtf8(payloadHex) {
  try {
    const bytes = hexToBytes(payloadHex);
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);

    if (/^[\\x09\\x0a\\x0d\\x20-\\x7e]*$/.test(decoded)) {
      return decoded;
    }

    return null;
  } catch {
    return null;
  }
}

function hexToBytes(hex) {
  const normalized = String(hex).trim().toLowerCase();
  if (normalized.length % 2 !== 0 || /[^0-9a-f]/.test(normalized)) {
    throw new Error("invalid hex");
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }

  return bytes;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll(String.fromCharCode(34), "&quot;")
    .replaceAll("'", "&#39;");
}

function renderAuctionLab() {
  if (!elements.auctionLabList) {
    return;
  }

  const auctionLab = state.auctionLab;
  if (!auctionLab || !Array.isArray(auctionLab.cases)) {
    elements.auctionLabList.classList.add("empty");
    elements.auctionLabList.innerHTML = '<div class="result-card empty">No auction example payload is available yet.</div>';
    if (elements.auctionPolicySummary) {
      elements.auctionPolicySummary.innerHTML = "";
    }
    setText(
      elements.auctionLabMeta,
      "Waiting for the auction example payload."
    );
    return;
  }

  elements.auctionLabList.classList.remove("empty");
  if (elements.auctionPolicySummary) {
    elements.auctionPolicySummary.innerHTML = renderAuctionPolicySummary(auctionLab.policy ?? null);
  }
  setText(
    elements.auctionLabMeta,
    [
      String(auctionLab.cases.length) + " simulator state" + (auctionLab.cases.length === 1 ? "" : "s"),
      "documentation and review only",
      "not live auctions"
    ].join(" · ")
  );
  elements.auctionLabList.innerHTML = auctionLab.cases
    .map((auctionCase) => renderAuctionCaseCard(auctionCase))
    .join("");
}

function renderExperimentalAuctionFeed() {
  if (!elements.experimentalAuctionList) {
    return;
  }

  const payload = state.experimentalAuctions;
  if (!payload || !Array.isArray(payload.auctions)) {
    elements.experimentalAuctionList.classList.add("empty");
    elements.experimentalAuctionList.innerHTML = '<div class="result-card empty">No live auction activity is available yet.</div>';
    setText(
      elements.experimentalAuctionMeta,
      "Waiting for confirmed auction bids."
    );
    return;
  }

  elements.experimentalAuctionList.classList.remove("empty");
  const visibleAuctions = payload.auctions.filter((auction) => !shouldHidePublicAuctionEntry(auction));
  setText(
    elements.experimentalAuctionMeta,
    [
      String(visibleAuctions.length) + " live auction state" + (visibleAuctions.length === 1 ? "" : "s"),
      payload.currentBlockHeight == null ? "resolver has not reached a current block yet" : "synced at block " + String(payload.currentBlockHeight),
      "confirmed bids open auctions and update leaders automatically"
    ].join(" · ")
  );

  if (visibleAuctions.length === 0) {
    elements.experimentalAuctionList.classList.add("empty");
    elements.experimentalAuctionList.innerHTML = [
      '<div class="result-card empty">',
      "  <h3>No live auctions yet</h3>",
      "  <p>Check a name above to prepare an opening bid. Once the bid confirms, the auction will appear here.</p>",
      "</div>"
    ].join("");
    return;
  }

	  elements.experimentalAuctionList.classList.remove("empty");
	  elements.experimentalAuctionList.innerHTML = visibleAuctions
	    .map((auction) => renderLiveAuctionActivityCard(auction))
	    .join("");
  updateAllAuctionBidFlowTimelines();
}

function shouldHidePublicAuctionEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  const text = [entry.auctionId, entry.title, entry.description]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (text.includes("private-phase-")) {
    return false;
  }

  if (entry.phase === "pending_unlock") {
    return true;
  }

  return text.includes("06-released")
    || text.includes("private-smoke-release")
    || text.includes("pending")
    || text.includes("legacy compatibility")
    || text.includes("no-winner");
}

function renderAuctionPolicySummary(policy) {
  if (!policy || typeof policy !== "object") {
    return "";
  }

  const topRow = [
    {
      title: "Auction window",
      value: formatBlockWindow(policy.auction?.baseWindowBlocks)
    },
    {
      title: "Late bid extends close",
      value: formatBlockWindow(policy.auction?.softCloseExtensionBlocks)
    },
    {
      title: "Normal bid step",
      value:
        formatSats(policy.auction?.minimumIncrementAbsoluteSats ?? "0") +
        " or " +
        String((Number(policy.auction?.minimumIncrementBasisPoints ?? 0) / 100).toFixed(2)) +
        "%"
    },
    {
      title: "Late-bid step",
      value:
        formatSats(policy.auction?.softCloseMinimumIncrementAbsoluteSats ?? "0") +
        " or " +
        String((Number(policy.auction?.softCloseMinimumIncrementBasisPoints ?? 0) / 100).toFixed(2)) +
        "%"
    }
  ];

  return [
    '<article class="guide-card">',
    "  <h3>Current defaults</h3>",
    '  <p class="result-meta">Plain English: a valid bonded opening bid starts the auction clock; late bids can extend the close.</p>',
    '  <div class="result-grid">',
    topRow
      .map((row) => {
        return (
          '<div class="result-item"><label>' +
          escapeHtml(row.title) +
          '</label><p class="field-value">' +
          escapeHtml(row.value) +
          "</p></div>"
        );
      })
      .join(""),
    "  </div>",
    "</article>"
  ].join("");
}

function renderAuctionCaseCard(auctionCase) {
  const stateView = auctionCase.state ?? {};
  const phase = String(stateView.phase ?? "unknown");
  const phasePill = mapAuctionPhasePill(phase);
  const leaderLabel = phase === "settled" ? "Winner" : "Current leader";
  const nextBidLabel =
    phase === "pending_unlock" || phase === "awaiting_opening_bid"
        ? "Opening bid minimum"
      : phase === "soft_close"
        ? "Next valid bid (extends close)"
        : "Next valid bid";
  const closeLabel = phase === "pending_unlock"
    ? "Eligible at block"
    : phase === "awaiting_opening_bid"
      ? "Auction status"
      : "Auction close";
  const closeValue =
    phase === "pending_unlock"
      ? String(stateView.unlockBlock ?? "-")
      : phase === "awaiting_opening_bid"
        ? "Not opened yet"
        : stateView.auctionCloseBlockAfter == null
          ? "-"
          : String(stateView.auctionCloseBlockAfter);
  const nextBidValue =
    stateView.currentRequiredMinimumBidSats
        ? formatSats(stateView.currentRequiredMinimumBidSats)
        : "Auction settled";
  const secondaryTimingLabel =
    phase === "pending_unlock"
      ? "Blocks until eligible"
      : phase === "awaiting_opening_bid"
        ? "Auction clock"
        : "Blocks to close";
  const secondaryTimingValue =
    phase === "pending_unlock"
      ? String(stateView.blocksUntilUnlock ?? 0)
      : phase === "awaiting_opening_bid"
        ? "Starts with a valid opening bid"
        : (stateView.blocksUntilClose == null ? "-" : String(stateView.blocksUntilClose));

  return [
    '<article class="activity-card">',
    '  <div class="result-title">',
    '    <h3>' + escapeHtml(String(auctionCase.title ?? stateView.normalizedName ?? "Auction")) + "</h3>",
    '    <span class="status-pill pending">Simulator state</span>',
    '    <span class="status-pill ' + escapeHtml(phasePill) + '">' + escapeHtml(String(stateView.phaseLabel ?? phase)) + "</span>",
    "  </div>",
    '  <p class="field-value">Documentation example only, not a live auction or live name in Explore. ' + escapeHtml(String(auctionCase.description ?? "")) + "</p>",
    '  <div class="result-grid">',
    '    <div class="result-item"><label>Name</label><p class="field-value">' + escapeHtml(String(stateView.normalizedName ?? "-")) + "</p></div>",
    '    <div class="result-item"><label>Example block</label><p class="field-value">' + escapeHtml(String(stateView.currentBlockHeight ?? "-")) + "</p></div>",
    '    <div class="result-item"><label>' + escapeHtml(closeLabel) + '</label><p class="field-value">' + escapeHtml(closeValue) + "</p></div>",
    '    <div class="result-item"><label>Base floor</label><p class="field-value">' + escapeHtml(formatSats(stateView.baseMinimumBidSats ?? "0")) + "</p></div>",
    '    <div class="result-item"><label>Opening minimum</label><p class="field-value">' + escapeHtml(formatSats(stateView.openingMinimumBidSats ?? "0")) + "</p></div>",
    '    <div class="result-item"><label>' + escapeHtml(leaderLabel) + '</label><p class="field-value">' + escapeHtml(stateView.currentLeaderBidderId ?? "None yet") + "</p></div>",
    '    <div class="result-item"><label>Highest bid</label><p class="field-value">' + escapeHtml(stateView.currentHighestBidSats ? formatSats(stateView.currentHighestBidSats) : "None yet") + "</p></div>",
    '    <div class="result-item"><label>' + escapeHtml(nextBidLabel) + '</label><p class="field-value">' + escapeHtml(nextBidValue) + "</p></div>",
    '    <div class="result-item"><label>Counted / not counted</label><p class="field-value">' + escapeHtml(String(stateView.acceptedBidCount ?? 0) + " / " + String(stateView.rejectedBidCount ?? 0)) + "</p></div>",
    '    <div class="result-item"><label>Bond maturity window</label><p class="field-value">' + escapeHtml(formatBlockWindow(stateView.settlementLockBlocks)) + "</p></div>",
    '    <div class="result-item"><label>Eligibility wait</label><p class="field-value">' + escapeHtml(String(stateView.blocksUntilUnlock ?? 0)) + "</p></div>",
    '    <div class="result-item"><label>' + escapeHtml(secondaryTimingLabel) + '</label><p class="field-value">' + escapeHtml(secondaryTimingValue) + "</p></div>",
    "  </div>",
    '  <p class="result-meta">Simulator states are read-only review fixtures. To build a Sparrow PSBT, use the Auctions page.</p>',
    renderAuctionBidHistory(stateView.visibleBidOutcomes),
    "</article>"
  ].join("");
}

function renderExperimentalAuctionCard(auction) {
  const phase = String(auction.phase ?? "unknown");
  const phasePill = mapAuctionPhasePill(phase);
  const leaderLabel = phase === "settled" ? "Winner" : "Current leader";
  const nextBidLabel =
    phase === "pending_unlock" || phase === "awaiting_opening_bid"
        ? "Opening bid minimum"
      : phase === "soft_close"
        ? "Next valid bid (extends close)"
        : "Next valid bid";
  const nextBidValue =
    auction.currentRequiredMinimumBidSats
        ? formatSats(auction.currentRequiredMinimumBidSats)
        : "Auction settled";
  const settlementLabel =
    phase === "settled"
        ? "Winner bond maturity"
        : "Settlement";
  const settlementValue =
    phase === "settled"
      ? (auction.winnerBondReleaseBlock == null ? "-" : "block " + String(auction.winnerBondReleaseBlock))
      : "Not settled";
  const closeLabel =
    phase === "pending_unlock"
        ? "Blocks until eligible"
        : phase === "awaiting_opening_bid"
          ? "Auction clock"
          : "Blocks to close";
  const closeValue =
    phase === "pending_unlock"
        ? String(auction.blocksUntilUnlock ?? 0)
      : phase === "awaiting_opening_bid"
        ? "Starts with a valid opening bid"
      : (auction.blocksUntilClose == null ? "-" : String(auction.blocksUntilClose));
  const settledHandoff =
    phase === "settled"
      ? renderSettledAuctionHandoff(auction)
      : "";

  return [
    '<article class="activity-card">',
    '  <div class="result-title">',
    '    <h3>' + escapeHtml(String(auction.title ?? auction.normalizedName ?? "Auction")) + "</h3>",
    '    <span class="status-pill ' + escapeHtml(phasePill) + '">' + escapeHtml(String(auction.phaseLabel ?? phase)) + "</span>",
    "  </div>",
    '  <p class="field-value">' + escapeHtml(String(auction.description ?? "")) + "</p>",
    '  <div class="result-grid">',
    '    <div class="result-item"><label>Name</label><p class="field-value">' + escapeHtml(String(auction.normalizedName ?? "-")) + "</p></div>",
    '    <div class="result-item"><label>Current block</label><p class="field-value">' + escapeHtml(String(auction.currentBlockHeight ?? "-")) + "</p></div>",
    '    <div class="result-item"><label>Opening minimum</label><p class="field-value">' + escapeHtml(formatSats(auction.openingMinimumBidSats ?? "0")) + "</p></div>",
    '    <div class="result-item"><label>' + escapeHtml(leaderLabel) + '</label><p class="field-value">' + escapeHtml(formatAuctionCommitment(auction.currentLeaderBidderCommitment)) + "</p></div>",
    '    <div class="result-item"><label>Highest bid</label><p class="field-value">' + escapeHtml(auction.currentHighestBidSats ? formatSats(auction.currentHighestBidSats) : "None yet") + "</p></div>",
    '    <div class="result-item"><label>' + escapeHtml(nextBidLabel) + '</label><p class="field-value">' + escapeHtml(nextBidValue) + "</p></div>",
    '    <div class="result-item"><label>Observed bids</label><p class="field-value">' + escapeHtml(String(auction.totalObservedBidCount ?? 0)) + "</p></div>",
    '    <div class="result-item"><label>' + escapeHtml(closeLabel) + '</label><p class="field-value">' + escapeHtml(closeValue) + "</p></div>",
    '    <div class="result-item"><label>' + escapeHtml(settlementLabel) + '</label><p class="field-value">' + escapeHtml(settlementValue) + "</p></div>",
    '    <div class="result-item"><label>Winner tx</label><p class="field-value">' + escapeHtml(auction.winnerBidTxid ? shortenTxid(auction.winnerBidTxid) : "Not settled") + "</p></div>",
    (auction.winnerOwnerPubkey
      ? '    <div class="result-item"><label>Winner owner</label>' + renderCopyableCode(String(auction.winnerOwnerPubkey)) + "</div>"
      : ""),
    "  </div>",
    settledHandoff,
    renderAuctionBidPackageComposer({
      source: "experimental",
      id: caseIdFromAuctionState(auction.auctionId, auction.normalizedName),
      phase,
      normalizedName: auction.normalizedName,
      defaultBidAmount: formatBtcDecimal(BigInt(
        auction.currentRequiredMinimumBidSats
        ?? auction.openingMinimumBidSats
        ?? auction.currentHighestBidSats
        ?? "0"
      )),
      defaultBidderId: "operator_" + String(auction.auctionId ?? auction.normalizedName ?? "auction")
        .replace(/[^a-z0-9]+/gi, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase(),
      note:
        phase === "awaiting_opening_bid"
          ? "This package is an opening bid. If signed and confirmed, it starts the auction clock."
          : phase === "pending_unlock"
          ? "This pre-eligibility prototype entry is filtered out of public auction views."
          : phase === "soft_close"
          ? "Built from current resolver-derived state. A soft-close extension bid must clear the stronger late increment and may go stale if another bid lands first."
          : "Build a bid from the current live auction state.",
      fallbackPath: buildAuctionsPath(auction.normalizedName ?? "")
    }),
    renderExperimentalAuctionBidHistory(auction.visibleBidOutcomes),
    "</article>"
  ].join("");
}

function renderLiveAuctionActivityCard(auction) {
  const phase = String(auction.phase ?? "unknown");
  const phasePill = mapAuctionPhasePill(phase);
  const name = String(auction.normalizedName ?? "").trim().toLowerCase();
  const title = name || String(auction.title ?? "Auction");
  const phaseLabel = String(auction.phaseLabel ?? phase);
  const highestBid = auction.currentHighestBidSats ? formatSats(auction.currentHighestBidSats) : "None yet";
  const nextBid = auction.currentRequiredMinimumBidSats ? formatSats(auction.currentRequiredMinimumBidSats) : "Auction settled";
  const closeValue =
    phase === "settled"
      ? "Settled"
      : auction.blocksUntilClose == null
        ? "Not available"
        : String(auction.blocksUntilClose) + " blocks";
  const openBlock =
    auction.auctionStartBlock == null
      ? "Unknown"
      : "block " + String(auction.auctionStartBlock);
  const actionLink = name
    ? '<a class="action-link" href="' + escapeHtml(buildAuctionsPath(name)) + '">Bid on ' + escapeHtml(name) + "</a>"
    : "";
  const detailLink = name && phase === "settled"
    ? '<a class="action-link secondary" href="' + escapeHtml(buildNameDetailPath(name)) + '">Open settled name</a>'
    : "";
  const bidSummary =
    Array.isArray(auction.visibleBidOutcomes) && auction.visibleBidOutcomes.length > 0
      ? renderLiveAuctionObservedBidSummary(auction.visibleBidOutcomes)
      : '<p class="tx-panel-note">No confirmed bid transaction details are available yet.</p>';

  return [
    '<article class="activity-card">',
    '  <div class="result-title">',
    '    <h3>Auction · ' + escapeHtml(title) + "</h3>",
    '    <span class="status-pill ' + escapeHtml(phasePill) + '">' + escapeHtml(phaseLabel) + "</span>",
    "  </div>",
    '  <p class="field-value">This auction is live. Use the bid link to prepare the next Sparrow PSBT from the current chain-derived state.</p>',
    '  <div class="result-grid">',
    '    <div class="result-item"><label>Name</label><p class="field-value">' + escapeHtml(title) + "</p></div>",
    '    <div class="result-item"><label>Opened</label><p class="field-value">' + escapeHtml(openBlock) + "</p></div>",
    '    <div class="result-item"><label>Highest bid</label><p class="field-value">' + escapeHtml(highestBid) + "</p></div>",
    '    <div class="result-item"><label>Next valid bid</label><p class="field-value">' + escapeHtml(nextBid) + "</p></div>",
    '    <div class="result-item"><label>Time left</label><p class="field-value">' + escapeHtml(closeValue) + "</p></div>",
    '    <div class="result-item"><label>Observed bids</label><p class="field-value">' + escapeHtml(String(auction.totalObservedBidCount ?? 0)) + "</p></div>",
    "  </div>",
    '  <p class="result-meta">' + [actionLink, detailLink].filter(Boolean).join(" · ") + "</p>",
    bidSummary,
    "</article>"
  ].join("");
}

function renderLiveAuctionObservedBidSummary(outcomes) {
  if (!Array.isArray(outcomes) || outcomes.length === 0) {
    return '<p class="tx-panel-note">No confirmed bid transaction details are available yet.</p>';
  }
  const summary = summarizeAuctionBidOutcomes(outcomes);

  return [
    '<details class="detail-technical">',
    "  <summary>Bid history interpreted by ONT</summary>",
    '  <div class="detail-technical-body">',
    '    <p class="tx-panel-note">' + escapeHtml(summary.counted + " counted, " + summary.notCounted + " not counted in confirmed chain order.") + "</p>",
    '    <div class="tx-event-list">',
    outcomes
      .map((outcome, index) => {
        const statusLabel = formatAuctionBidCountingStatus(outcome);
        const statusClass = formatAuctionBidCountingStatusClass(outcome);
        const outcomeLabel = formatAuctionBidOutcomeReason(outcome.reason);

        return [
          '<article class="tx-event-card">',
          '  <div class="tx-event-header">',
          '    <strong>Bid ' + escapeHtml(String(index + 1)) + "</strong>",
          '    <span class="status-pill ' + escapeHtml(statusClass) + '">' + escapeHtml(statusLabel) + "</span>",
          '    <span class="inline-note">block ' + escapeHtml(String(outcome.blockHeight ?? "-")) + "</span>",
          "  </div>",
          '  <p class="tx-event-meta">' + escapeHtml(formatSats(outcome.amountSats ?? "0") + " · " + outcomeLabel) + "</p>",
          "</article>"
        ].join("");
      })
      .join(""),
    "    </div>",
    "  </div>",
    "</details>"
  ].join("");
}

function renderSettledAuctionHandoff(auction, configuredBasePath = BASE_PATH) {
  const normalizedName =
    typeof auction?.normalizedName === "string" && auction.normalizedName.trim().length > 0
      ? auction.normalizedName.trim().toLowerCase()
      : "";

  if (!normalizedName) {
    return "";
  }

  const currentBlockHeight = Number(auction.currentBlockHeight ?? NaN);
  const winnerBondReleaseBlock = Number(auction.winnerBondReleaseBlock ?? NaN);
  const hasReleaseHeight = Number.isFinite(winnerBondReleaseBlock);
  const blocksUntilRelease =
    Number.isFinite(currentBlockHeight) && hasReleaseHeight
      ? Math.max(0, winnerBondReleaseBlock - currentBlockHeight)
      : null;
  const lockIsActive = blocksUntilRelease !== null && blocksUntilRelease > 0;
  const headline = lockIsActive
    ? "This settled auction is already a live name, but bond maturity is still active."
    : "This settled auction is already a live name with a normal owner workflow.";
  const copy = lockIsActive
    ? "Use the detail page for the current owner-visible state, publish destinations if you want records attached, and only transfer with bond continuity until maturity."
    : "Use the detail page for the current owner-visible state, update destinations, and treat transfer prep the same way you would for any other mature name.";
  const releaseCopy =
    blocksUntilRelease === null
      ? "Winner bond maturity height is not available in this snapshot."
      : blocksUntilRelease === 0
        ? "Bond maturity has cleared."
        : String(blocksUntilRelease) + " blocks remain before bond maturity clears.";
  const actions = [
    renderDetailLink(normalizedName, "Open live name detail page", configuredBasePath),
    renderValuePublishLink(normalizedName, "Publish or update destinations", configuredBasePath),
    renderTransferPrepLink(
      normalizedName,
      lockIsActive ? "Prepare transfer (bond maturity active)" : "Prepare transfer",
      configuredBasePath
    )
  ].join(" · ");

  return [
    '<div class="step-list">',
    '  <p class="step-list-label">After Settlement</p>',
    '  <p class="field-value">' + escapeHtml(headline) + "</p>",
    '  <ol>',
    '    <li>' + escapeHtml(copy) + "</li>",
    '    <li>' + escapeHtml(releaseCopy) + "</li>",
    '  </ol>',
    '  <p class="result-meta">' + actions + "</p>",
    "</div>"
  ].join("");
}

function caseIdFromAuctionState(id, fallbackName) {
  return String(id ?? fallbackName ?? "auction-case");
}

function renderAuctionBidPackageComposer(input) {
  const domKey = buildAuctionPackageDomKey(input.source, input.id);
  const defaultOwnerPubkey = String(input.defaultOwnerPubkey ?? "");

  if (input.phase === "settled") {
    return [
      '<div class="result-card empty">',
      "  <h3>Auction bid unavailable</h3>",
      "  <p>This auction is already settled. Open the name detail page to manage destinations or transfer ownership.</p>",
      "</div>"
    ].join("");
  }

	  return [
	    '<section class="auction-bid-workflow">',
	    '  <div class="result-title auction-bid-workflow-head">',
	    "    <h3>" + escapeHtml(input.source === "opening" ? "Open auction with bonded bid" : "Bid with Sparrow") + "</h3>",
	    '    <span class="status-pill pending">PSBT workflow</span>',
	    "  </div>",
	    '  <div class="draft-grid">',
	    renderAuctionBidFlowTimeline(input.source, input.id, domKey),
	    '    <input id="auction-bidder-' + escapeHtml(domKey) + '" type="hidden" data-auction-bidder-id="' + escapeHtml(input.id) + '" data-auction-package-source="' + escapeHtml(input.source) + '" value="' + escapeHtml(input.defaultBidderId) + '" />',
	    '    <input id="auction-owner-' + escapeHtml(domKey) + '" type="hidden" data-auction-owner-pubkey="' + escapeHtml(input.id) + '" data-auction-package-source="' + escapeHtml(input.source) + '" value="' + escapeHtml(defaultOwnerPubkey) + '" />',
    '    <div class="field draft-field-full"><label class="field-label" for="auction-amount-' + escapeHtml(domKey) + '">' + escapeHtml(input.source === "opening" ? "Required opening bond (BTC)" : "Bid amount (BTC)") + '</label><input id="auction-amount-' + escapeHtml(domKey) + '" type="text" inputmode="decimal" data-auction-bid-amount="' + escapeHtml(input.id) + '" data-auction-package-source="' + escapeHtml(input.source) + '" value="' + escapeHtml(input.defaultBidAmount) + '" /><p class="field-note">This becomes the self-custodied bond for the auction bid. Make sure your Sparrow wallet has at least this amount plus a small network fee.</p></div>',
    '    <div class="draft-field-full">',
    '      <div class="result-card empty" data-auction-owner-key-result="' + escapeHtml(domKey) + '">Create, download, and confirm the ONT recovery kit before building the bid transaction. Sparrow still signs the bitcoin transaction.</div>',
    renderAuctionBidArtifactsComposer(input, domKey),
    '      <details class="detail-technical">',
    "        <summary>Advanced bid package details</summary>",
    '        <div class="detail-technical-body draft-grid">',
    '          <div class="field"><label class="field-label" for="auction-bidder-advanced-' + escapeHtml(domKey) + '">Bidder label</label><input id="auction-bidder-advanced-' + escapeHtml(domKey) + '" type="text" value="' + escapeHtml(input.defaultBidderId) + '" data-auction-bidder-mirror="' + escapeHtml(input.id) + '" data-auction-package-source="' + escapeHtml(input.source) + '" /><p class="field-note">Optional demo label used to derive the bidder commitment.</p></div>',
    '          <div class="field"><label class="field-label" for="auction-owner-advanced-' + escapeHtml(domKey) + '">Owner pubkey</label><input id="auction-owner-advanced-' + escapeHtml(domKey) + '" type="text" value="' + escapeHtml(defaultOwnerPubkey) + '" data-auction-owner-mirror="' + escapeHtml(input.id) + '" data-auction-package-source="' + escapeHtml(input.source) + '" placeholder="32-byte x-only pubkey" /><p class="field-note">Leave blank to let the website create a browser-local owner key.</p></div>',
    '          <div class="field-actions draft-field-full">',
    '            <button type="button" data-auction-owner-key-action="generate-local" data-auction-package-source="' + escapeHtml(input.source) + '" data-auction-package-id="' + escapeHtml(input.id) + '" data-auction-name="' + escapeHtml(input.normalizedName ?? "") + '">Create recovery kit now</button>',
    '            <button type="button" class="secondary-button" data-auction-package-action="preview" data-auction-package-source="' + escapeHtml(input.source) + '" data-auction-package-id="' + escapeHtml(input.id) + '">Preview package JSON</button>',
    '            <button type="button" class="secondary-button" data-auction-package-action="download" data-auction-package-source="' + escapeHtml(input.source) + '" data-auction-package-id="' + escapeHtml(input.id) + '">Download package JSON</button>',
    "          </div>",
    "        </div>",
    "      </details>",
    '      <p class="tx-panel-note" data-auction-package-result="' + escapeHtml(domKey) + '">' + escapeHtml(input.note) + "</p>",
    '      <div data-auction-package-preview="' + escapeHtml(domKey) + '"></div>',
    "    </div>",
	    "  </div>",
	    "</section>"
	  ].join("");
	}

function renderAuctionBidFlowTimeline(source, id, domKey) {
  const steps = [
    ["find", "Find name", "Checked"],
    ["wallet", source === "opening" ? "Prepare wallet" : "Use prior bid coin", source === "opening" ? "Sparrow UTXO" : "Then add funding"],
    ["amount", "Set bid", "Bond amount"],
    ["key", "Save owner key", "Recovery kit"],
    ["psbt", "Download PSBT", "Unsigned tx"],
    ["broadcast", "Broadcast", "In Sparrow"]
  ];

  return [
    '<div class="bid-flow-timeline draft-field-full" data-auction-bid-flow="' + escapeHtml(domKey) + '" data-auction-bid-flow-source="' + escapeHtml(source) + '" data-auction-bid-flow-id="' + escapeHtml(id) + '">',
    '  <p class="step-list-label">Bid Progress</p>',
    '  <ol class="bid-flow-steps">',
    steps
      .map(([id, label, hint], index) => {
        const className = index === 0
          ? "bid-flow-step is-complete"
          : index === 1
          ? "bid-flow-step is-current"
          : "bid-flow-step";
        return [
          '    <li class="' + className + '" data-bid-flow-step="' + escapeHtml(id) + '">',
          '      <span class="bid-flow-marker">' + escapeHtml(String(index + 1)) + "</span>",
          '      <span class="bid-flow-copy"><strong>' + escapeHtml(label) + '</strong><small>' + escapeHtml(hint) + "</small></span>",
          "    </li>"
        ].join("");
      })
      .join(""),
    "  </ol>",
    "</div>"
  ].join("");
}

function renderAuctionBidArtifactsComposer(input, domKey) {
  const source = String(input.source);
  const id = String(input.id);
  const previousBidOutputField = source === "opening"
    ? ""
    : '    <div class="field draft-field-full"><label class="field-label" for="auction-rebid-output-' + escapeHtml(domKey) + '">Previous bid output <span class="inline-note">optional rebid</span></label><input id="auction-rebid-output-' + escapeHtml(domKey) + '" type="text" data-auction-rebid-output="' + escapeHtml(id) + '" data-auction-package-source="' + escapeHtml(source) + '" value="" placeholder="txid:vout from your earlier bid bond" /><p class="field-note">Only use this if you are rebidding after being outbid. Paste your old bid-bond Output from Sparrow; the website will combine it with the funded output below and build one replacement bid for the full new amount.</p></div>';

  return [
    '<article class="guide-card guide-card-wide auction-psbt-builder">',
    '  <div class="result-title">',
    "    <h3>Build Sparrow PSBT</h3>",
    '    <span class="status-pill pending">Unsigned</span>',
    "  </div>",
    '  <p class="field-value">Use Sparrow for the wallet keys. The website builds an unsigned PSBT; Sparrow reviews, signs, and broadcasts it.</p>',
    '  <div class="draft-grid">',
    previousBidOutputField,
    '    <div class="field draft-field-full"><label class="field-label" for="auction-funding-output-' + escapeHtml(domKey) + '">Funded Sparrow output</label><input id="auction-funding-output-' + escapeHtml(domKey) + '" type="text" data-auction-funding-output="' + escapeHtml(id) + '" data-auction-package-source="' + escapeHtml(source) + '" value="" placeholder="txid:vout" /><p class="field-note" data-auction-funding-output-note="' + escapeHtml(domKey) + '">In Sparrow, open the UTXOs tab and copy the Output value for a fresh unspent coin. It should look like txid:vout.</p><input type="hidden" data-auction-funding-inputs="' + escapeHtml(id) + '" data-auction-package-source="' + escapeHtml(source) + '" value="" /></div>',
    '    <div class="field"><label class="field-label">Selected input total</label><p class="field-value" data-auction-funding-amount="' + escapeHtml(id) + '" data-auction-package-source="' + escapeHtml(source) + '">Not loaded yet</p><p class="field-note">Read from the selected Sparrow output' + (source === "opening" ? "" : "s") + '. You do not need to enter this manually.</p></div>',
    '    <div class="field"><label class="field-label">Default return address</label><div class="field-value" data-auction-funding-address="' + escapeHtml(id) + '" data-auction-package-source="' + escapeHtml(source) + '">Not loaded yet</div><p class="field-note">Read from your selected Sparrow output, not an ONT server wallet address. By default, the bond and change return to this wallet unless you paste fresh addresses below.</p></div>',
    '    <div class="field draft-field-full psbt-trust-note"><p class="step-list-label">Trust Check</p><p>Before signing, Sparrow should show the bond and change outputs. Verify they are addresses from your own wallet. If an address looks unfamiliar, do not sign.</p></div>',
    '    <div class="field"><label class="field-label" for="auction-bond-address-' + escapeHtml(domKey) + '">Bid bond address <span class="inline-note">optional</span></label><input id="auction-bond-address-' + escapeHtml(domKey) + '" type="text" data-auction-bond-address="' + escapeHtml(id) + '" data-auction-package-source="' + escapeHtml(source) + '" placeholder="optional fresh Sparrow receive address" /><p class="field-note">Leave blank for the hosted demo to reuse the funded coin address. Paste a fresh address from the same Sparrow wallet if you want cleaner wallet hygiene.</p></div>',
    '    <div class="field"><label class="field-label" for="auction-change-address-' + escapeHtml(domKey) + '">Change address <span class="inline-note">optional</span></label><input id="auction-change-address-' + escapeHtml(domKey) + '" type="text" data-auction-change-address="' + escapeHtml(id) + '" data-auction-package-source="' + escapeHtml(source) + '" placeholder="optional fresh Sparrow change address" /><p class="field-note">Leave blank to send change back to the same address used for the bond output.</p></div>',
    "  </div>",
    '  <details class="detail-technical auction-psbt-advanced">',
    "    <summary>Advanced PSBT options</summary>",
    '    <div class="detail-technical-body draft-grid">',
    '      <div class="field"><label class="field-label" for="auction-fee-' + escapeHtml(domKey) + '">Network fee (BTC)</label><input id="auction-fee-' + escapeHtml(domKey) + '" type="text" inputmode="decimal" data-auction-fee-sats="' + escapeHtml(id) + '" data-auction-package-source="' + escapeHtml(source) + '" value="0.00001" /><p class="field-note">Default is fine for the hosted demo. Adjust only if Sparrow reports the fee is too low.</p></div>',
    '      <p class="field-note">The PSBT is assembled in your browser. The server is used only to read chain/resolver state and verify that the selected coin is still unspent.</p>',
    '      <div class="field-actions draft-field-full">',
    '        <button type="button" class="secondary-button" data-auction-artifacts-action="download-artifacts" data-auction-package-source="' + escapeHtml(source) + '" data-auction-package-id="' + escapeHtml(id) + '" data-auction-name="' + escapeHtml(input.normalizedName ?? "") + '">Download debug artifacts</button>',
    "      </div>",
    "    </div>",
    "  </details>",
    '  <div class="field-actions">',
    '    <button type="button" data-auction-artifacts-action="download-psbt" data-auction-package-source="' + escapeHtml(source) + '" data-auction-package-id="' + escapeHtml(id) + '" data-auction-name="' + escapeHtml(input.normalizedName ?? "") + '">Download Sparrow PSBT</button>',
    '    <button type="button" class="secondary-button" data-auction-artifacts-action="build" data-auction-package-source="' + escapeHtml(source) + '" data-auction-package-id="' + escapeHtml(id) + '" data-auction-name="' + escapeHtml(input.normalizedName ?? "") + '">Preview PSBT</button>',
    "  </div>",
    '  <div class="psbt-handoff-steps">',
    '    <p class="step-list-label">Open In Sparrow</p>',
    '    <ol class="guide-list">',
    "      <li>In Sparrow, choose File -> Open Transaction.</li>",
    "      <li>Select the downloaded .psbt file.</li>",
    "      <li>Review the bond and change outputs. Sign only if those addresses are yours.</li>",
    "      <li>Broadcast from Sparrow.</li>",
    "    </ol>",
    "  </div>",
    '  <p class="tx-panel-note" data-auction-artifacts-result="' + escapeHtml(domKey) + '">Choose a funded Sparrow output' + (source === "opening" ? "" : ", and optionally your previous bid output for a rebid") + ', then download the PSBT for Sparrow. Fresh bond/change addresses are optional for the hosted demo.</p>',
    '  <div data-auction-artifacts-preview="' + escapeHtml(domKey) + '"></div>',
    "</article>"
  ].join("");
}

function parseAuctionFundingInputDescriptorParts(descriptor) {
  const parts = String(descriptor ?? "").trim().split(":");
  const txid = typeof parts[0] === "string" ? parts[0].trim() : "";
  const vout = typeof parts[1] === "string" ? parts[1].trim() : "";
  const valueSats = typeof parts[2] === "string" ? parts[2].trim() : "";
  const address = typeof parts[3] === "string" ? parts[3].trim() : "";
  let amountBtc = "";

  try {
    amountBtc = valueSats.length > 0 ? formatBtcDecimal(BigInt(valueSats)) : "";
  } catch (_error) {
    amountBtc = "";
  }

  return {
    txid,
    vout,
    valueSats,
    address,
    output: txid.length > 0 && vout.length > 0 ? txid + ":" + vout : "",
    amountBtc
  };
}

function buildAuctionPackageDomKey(source, id) {
  return String(source) + ":" + String(id);
}

function setAuctionBidPackageMessage(domKey, message) {
  const node = document.querySelector('[data-auction-package-result="' + cssEscape(domKey) + '"]');
  if (node instanceof HTMLElement) {
    node.textContent = message;
  }
}

function setAuctionBidPackagePreview(domKey, html) {
  const node = document.querySelector('[data-auction-package-preview="' + cssEscape(domKey) + '"]');
  if (node instanceof HTMLElement) {
    node.innerHTML = html;
  }
}

function setAuctionArtifactsMessage(domKey, message) {
  const node = document.querySelector('[data-auction-artifacts-result="' + cssEscape(domKey) + '"]');
  if (node instanceof HTMLElement) {
    node.textContent = message;
  }
}

function getAuctionFieldText(node) {
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
    return node.value.trim();
  }
  if (node instanceof HTMLElement) {
    return node.textContent?.trim() ?? "";
  }
  return "";
}

function setAuctionFieldText(node, value, placeholder = "") {
  const nextValue = String(value ?? "");
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
    node.value = nextValue;
    return;
  }
  if (node instanceof HTMLElement) {
    node.textContent = nextValue.length > 0 ? nextValue : placeholder;
  }
}

function setAuctionFundingAddressDisplay(node, value) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  const nextValue = String(value ?? "").trim();
  if (nextValue.length === 0) {
    node.textContent = "Not loaded yet";
    return;
  }

  node.innerHTML = renderCopyableCode(nextValue);
}

function updateAuctionFundingOutputNote(source, id) {
  const domKey = buildAuctionPackageDomKey(source, id);
  const note = document.querySelector('[data-auction-funding-output-note="' + cssEscape(domKey) + '"]');
  if (!(note instanceof HTMLElement)) {
    return;
  }

  const outputInput = document.querySelector('[data-auction-funding-output="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
  const rebidOutputInput = document.querySelector('[data-auction-rebid-output="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
  const amountInput = document.querySelector('[data-auction-funding-amount="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
  const addressInput = document.querySelector('[data-auction-funding-address="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');

  const outputValue = outputInput instanceof HTMLInputElement ? outputInput.value.trim() : "";
  const rebidOutputValue = rebidOutputInput instanceof HTMLInputElement ? rebidOutputInput.value.trim() : "";
  const amountValue = getAuctionFieldText(amountInput);
  const addressValue = getAuctionFieldText(addressInput);

  if ((outputValue.length > 0 || rebidOutputValue.length > 0) && amountValue.length > 0 && addressValue.length > 0) {
    note.textContent =
      "We found your selected Sparrow output on the demo chain. Each selected output can only be spent once; replace it with another unspent Sparrow output after you broadcast a bid.";
    return;
  }

  note.textContent =
    "In Sparrow, open the UTXOs tab and copy the Output value for a fresh unspent coin. It should look like txid:vout.";
}

function setAuctionArtifactsPreview(domKey, html) {
  const node = document.querySelector('[data-auction-artifacts-preview="' + cssEscape(domKey) + '"]');
  if (node instanceof HTMLElement) {
    node.innerHTML = html;
  }
}

function setAuctionOwnerKeyHelperMessage(domKey, message) {
  const node = document.querySelector('[data-auction-owner-key-result="' + cssEscape(domKey) + '"]');
  if (node instanceof HTMLElement) {
    node.classList.add("empty");
    node.textContent = message;
  }
}

function getAuctionOwnerKeyConfirmation(domKey, ownerPubkey) {
  const confirmation = state.auctionOwnerKeyConfirmations.get(domKey);
  if (!confirmation || String(confirmation.ownerPubkey) !== String(ownerPubkey)) {
    return null;
  }

  return confirmation;
}

function applyAuctionOwnerKeyConfirmation(domKey, ownerPubkey, method) {
  state.auctionOwnerKeyConfirmations.set(domKey, {
    ownerPubkey,
    method,
    confirmedAt: new Date().toISOString()
  });
}

function clearAuctionOwnerKeyConfirmation(domKey) {
  state.auctionOwnerKeyConfirmations.delete(domKey);
}

function parseGeneratedOwnerKeyBackupText(text) {
  const raw = String(text ?? "");
  const ownerPubkeyMatch = raw.match(/^Owner pubkey:\s*([0-9a-fA-F]{64})\s*$/m);
  const ownerPrivateKeyMatch = raw.match(/^Owner private key:\s*([0-9a-fA-F]{64})\s*$/m);
  return {
    ownerPubkey: ownerPubkeyMatch ? ownerPubkeyMatch[1].toLowerCase() : "",
    privateKeyHex: ownerPrivateKeyMatch ? ownerPrivateKeyMatch[1].toLowerCase() : ""
  };
}

function updateAuctionPsbtActionState(source, id, domKey) {
  const ownerPubkeyInput = document.querySelector(
    '[data-auction-owner-pubkey="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]'
  );
  const ownerPubkey = ownerPubkeyInput instanceof HTMLInputElement ? ownerPubkeyInput.value.trim() : "";
  const generated = getGeneratedAuctionOwnerKeyForBid(domKey, ownerPubkey);
  const confirmation = getAuctionOwnerKeyConfirmation(domKey, ownerPubkey);
  const requiresConfirmation = Boolean(generated) && !confirmation;
  const actionButtons = document.querySelectorAll(
    '[data-auction-artifacts-action][data-auction-package-source="' + cssEscape(source) + '"][data-auction-package-id="' + cssEscape(id) + '"]'
  );

  actionButtons.forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      return;
    }
	    node.disabled = requiresConfirmation;
	    node.title = requiresConfirmation
	      ? "Confirm the ONT recovery kit to enable this step."
	      : "";
	  });
  updateAuctionBidFlowTimeline(source, id, domKey);
}

function updateAuctionBidFlowTimeline(source, id, domKey) {
  const timeline = document.querySelector('[data-auction-bid-flow="' + cssEscape(domKey) + '"]');
  if (!(timeline instanceof HTMLElement)) {
    return;
  }

  const ownerPubkeyInput = document.querySelector(
    '[data-auction-owner-pubkey="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]'
  );
  const amountInput = document.querySelector(
    '[data-auction-bid-amount="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]'
  );
  const fundingAmountInput = document.querySelector(
    '[data-auction-funding-amount="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]'
  );
  const fundingAddressInput = document.querySelector(
    '[data-auction-funding-address="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]'
  );

  const ownerPubkey = ownerPubkeyInput instanceof HTMLInputElement ? ownerPubkeyInput.value.trim() : "";
  const generated = getGeneratedAuctionOwnerKeyForBid(domKey, ownerPubkey);
  const ownerKeyConfirmed = ownerPubkey.length > 0
    && (!generated || Boolean(getAuctionOwnerKeyConfirmation(domKey, ownerPubkey)));
  const walletReady =
    fundingAmountInput instanceof HTMLElement
    && fundingAddressInput instanceof HTMLElement
    && getAuctionFieldText(fundingAmountInput).length > 0
    && getAuctionFieldText(fundingAddressInput).length > 0
    && getAuctionFieldText(fundingAmountInput) !== "Not loaded yet"
    && getAuctionFieldText(fundingAddressInput) !== "Not loaded yet";
  const amountReady = amountInput instanceof HTMLInputElement && amountInput.value.trim().length > 0;
  const psbtReady = state.auctionBidArtifacts.has(domKey);

  const rawCompletion = {
    find: true,
    wallet: walletReady,
    amount: amountReady,
    key: ownerKeyConfirmed,
    psbt: psbtReady,
    broadcast: false
  };
  const order = ["find", "wallet", "amount", "key", "psbt", "broadcast"];
  const completion = {};
  let priorStepsComplete = true;
  order.forEach((step) => {
    completion[step] = priorStepsComplete && Boolean(rawCompletion[step]);
    if (step !== "broadcast") {
      priorStepsComplete = completion[step];
    }
  });
  const current = psbtReady
    ? "broadcast"
    : order.find((step) => !completion[step]) ?? "broadcast";

  order.forEach((step) => {
    const node = timeline.querySelector('[data-bid-flow-step="' + cssEscape(step) + '"]');
    if (!(node instanceof HTMLElement)) {
      return;
    }

    node.classList.toggle("is-complete", Boolean(completion[step]));
    node.classList.toggle("is-current", step === current);
    node.classList.toggle("is-pending", !completion[step] && step !== current);
  });
}

function updateAllAuctionBidFlowTimelines() {
  document.querySelectorAll("[data-auction-bid-flow]").forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }

    const source = node.getAttribute("data-auction-bid-flow-source");
    const id = node.getAttribute("data-auction-bid-flow-id");
    const domKey = node.getAttribute("data-auction-bid-flow");
    if (!source || !id || !domKey) {
      return;
    }

    updateAuctionBidFlowTimeline(source, id, domKey);
  });
}

function renderAuctionOwnerKeyHelper(domKey, source, id, name, generated) {
  const node = document.querySelector('[data-auction-owner-key-result="' + cssEscape(domKey) + '"]');
  if (!(node instanceof HTMLElement)) {
    return;
  }

  const confirmation = getAuctionOwnerKeyConfirmation(domKey, generated.ownerPubkey);
  const confirmationStatus = confirmation
    ? 'Confirmed by ' + String(confirmation.method)
    : "Step 1 before bid transaction";
  const confirmationTone = confirmation ? "available" : "pending";

  node.classList.remove("empty");
  node.innerHTML = [
    '<div class="result-title">',
    "  <h3>Download ONT recovery kit</h3>",
    '  <span class="status-pill ' + escapeHtml(confirmationTone) + '">' + escapeHtml(confirmationStatus) + "</span>",
    "</div>",
    '  <p class="prototype-warning">' + escapeHtml(String(generated.warning)) + "</p>",
    '  <div class="step-list">',
    '    <p class="step-list-label">Keep This Recovery Kit</p>',
    "    <ol>",
    "      <li>This recovery kit contains the ONT name-control key for this bid.</li>",
    "      <li>Your wallet signs the bitcoin transaction. This ONT recovery kit controls the name if this bid wins.</li>",
    "      <li>Download the recovery kit, then prove you still have it to enable the bid transaction.</li>",
    "    </ol>",
    '    <div class="hero-cta-row">',
    '      <button type="button" class="secondary-button" data-auction-owner-key-action="download" data-auction-package-source="' + escapeHtml(source) + '" data-auction-package-id="' + escapeHtml(id) + '" data-auction-name="' + escapeHtml(typeof name === "string" ? name : "") + '">Download recovery kit</button>',
    "    </div>",
    "  </div>",
    '  <div class="result-grid">',
    '    <div class="result-item"><label>Owner pubkey</label>' + renderCopyableCode(String(generated.ownerPubkey)) + "</div>",
    '    <div class="result-item"><label>Recovery kit source</label><p class="field-value">' + escapeHtml(String(generated.sourceLabel)) + "</p></div>",
    "  </div>",
    '  <div class="guide-card-actions auction-owner-key-confirmation-row">',
    '    <div class="field auction-owner-key-confirmation-field"><label class="field-label" for="auction-owner-key-file-' + escapeHtml(domKey) + '">Upload recovery kit</label><input id="auction-owner-key-file-' + escapeHtml(domKey) + '" type="file" accept=".txt,text/plain" data-auction-owner-key-file="1" data-auction-package-source="' + escapeHtml(source) + '" data-auction-package-id="' + escapeHtml(id) + '" data-auction-name="' + escapeHtml(typeof name === "string" ? name : "") + '" /><p class="field-note">Use the downloaded ONT recovery kit file.</p></div>',
    '    <div class="field auction-owner-key-confirmation-field"><label class="field-label" for="auction-owner-key-confirm-' + escapeHtml(domKey) + '">Or paste owner pubkey from recovery kit</label><input id="auction-owner-key-confirm-' + escapeHtml(domKey) + '" type="text" data-auction-owner-key-confirm-pubkey="' + escapeHtml(id) + '" data-auction-package-source="' + escapeHtml(source) + '" placeholder="64-hex owner pubkey" /><p class="field-note">If you do not want to upload the file, paste the owner pubkey printed inside it.</p></div>',
    '    <div class="field-actions"><button type="button" class="secondary-button" data-auction-owner-key-action="confirm-pubkey" data-auction-package-source="' + escapeHtml(source) + '" data-auction-package-id="' + escapeHtml(id) + '" data-auction-name="' + escapeHtml(typeof name === "string" ? name : "") + '">Confirm recovery kit</button></div>',
    confirmation
      ? '<p class="tx-panel-note">Recovery kit confirmed. Bid-transaction actions are enabled for this owner key.</p>'
      : '<p class="tx-panel-note">Bid-transaction actions stay disabled until this recovery kit is confirmed.</p>',
    "  </div>"
  ].join("");
  updateAuctionPsbtActionState(source, id, domKey);
}

function getGeneratedAuctionOwnerKeyForBid(domKey, ownerPubkey) {
  const generated = state.auctionGeneratedOwnerKeys.get(domKey);
  if (!generated || String(generated.ownerPubkey) !== String(ownerPubkey)) {
    return null;
  }

  return generated;
}

function readAuctionBidPackageFormValues(source, id) {
  const domKey = buildAuctionPackageDomKey(source, id);
  const bidderInput = document.querySelector('[data-auction-bidder-id="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
  const ownerPubkeyInput = document.querySelector('[data-auction-owner-pubkey="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
  const amountInput = document.querySelector('[data-auction-bid-amount="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
  const bidderId = bidderInput instanceof HTMLInputElement ? bidderInput.value.trim() : "";
  const ownerPubkey = ownerPubkeyInput instanceof HTMLInputElement ? ownerPubkeyInput.value.trim() : "";
  const amountBtc = amountInput instanceof HTMLInputElement ? amountInput.value.trim() : "";

  if (bidderId.length === 0) {
    return { domKey, error: "Enter a bidder label first." };
  }

  if (amountBtc.length === 0) {
    return { domKey, error: "Enter a bid amount first." };
  }

  let amountSats = "";
  try {
    amountSats = parseBtcAmountInputToSatsString(amountBtc, "Bid amount");
  } catch (error) {
    return { domKey, error: describeError(error) };
  }

  return {
    domKey,
    source,
    id,
    bidderId,
    ownerPubkey,
    amountSats,
    error: null
  };
}

async function ensureAuctionBidPackageForUi(input) {
  const cachedPackage = state.auctionBidPackages.get(input.domKey);
  const cachedMatchesInputs = cachedPackage
    && input.source !== "opening"
    && input.source !== "experimental"
    && String(cachedPackage.bidderId ?? "") === input.bidderId
    && String(cachedPackage.ownerPubkey ?? "") === input.ownerPubkey
    && String(cachedPackage.bidAmountSats ?? "") === input.bidAmountSats;

  if (cachedMatchesInputs) {
    return cachedPackage;
  }

  const pkg = await buildAuctionBidPackageForUi({
    source: input.source,
    id: input.id,
    bidderId: input.bidderId,
    ownerPubkey: input.ownerPubkey,
    bidAmountSats: input.bidAmountSats
  });
  state.auctionBidPackages.set(input.domKey, pkg);
  state.auctionBidArtifacts.delete(input.domKey);
  return pkg;
}

async function buildAuctionBidPackageForUi(input) {
  const auctionTools = await loadAuctionTools();
  const body = {
    bidderId: input.bidderId,
    ownerPubkey: input.ownerPubkey,
    bidAmountSats: input.bidAmountSats
  };

  if (input.source === "opening") {
    const [currentBlockHeight, unlockBlock] = await Promise.all([
      fetchCurrentResolverBlockHeightForAuctionBuild(),
      fetchOpeningAuctionUnlockBlockForUi(input.id)
    ]);

    return auctionTools.buildOpeningAuctionBidPackage({
      ...body,
      name: input.id,
      currentBlockHeight,
      unlockBlock
    });
  }

  if (input.source === "experimental") {
    const auction = await fetchVisibleAuctionByIdForUi(input.id);

    return auctionTools.buildLiveAuctionBidPackage({
      ...body,
      auction
    });
  }

  const auctionCase = await fetchAuctionLabCaseByIdForUi(input.id);

  return auctionTools.buildLiveAuctionBidPackage({
    ...body,
    auction: {
      auctionId: auctionCase.id,
      normalizedName: auctionCase.state.normalizedName,
      currentBlockHeight: auctionCase.state.currentBlockHeight,
      phase: auctionCase.state.phase,
      unlockBlock: auctionCase.state.unlockBlock,
      auctionCloseBlockAfter: auctionCase.state.auctionCloseBlockAfter,
      openingMinimumBidSats: auctionCase.state.openingMinimumBidSats,
      currentLeaderBidderId: auctionCase.state.currentLeaderBidderId,
      currentLeaderBidderCommitment: auctionCase.state.currentLeaderBidderCommitment,
      currentHighestBidSats: auctionCase.state.currentHighestBidSats,
      currentRequiredMinimumBidSats: auctionCase.state.currentRequiredMinimumBidSats,
      settlementLockBlocks: auctionCase.state.settlementLockBlocks,
      blocksUntilUnlock: auctionCase.state.blocksUntilUnlock,
      blocksUntilClose: auctionCase.state.blocksUntilClose,
      baseMinimumBidSats: auctionCase.state.baseMinimumBidSats
    }
  });
}

async function fetchAuctionLabCaseByIdForUi(caseId) {
  if (!state.auctionLab || !Array.isArray(state.auctionLab.cases)) {
    state.auctionLab = await fetchJson(getAuctionLabApiPath());
    renderAuctionLab();
  }

  const auctionCase = state.auctionLab?.cases?.find((entry) => String(entry.id ?? "") === String(caseId));
  if (!auctionCase) {
    throw new Error("No auction example with id " + String(caseId) + " is currently loaded.");
  }

  return auctionCase;
}

async function fetchCurrentResolverBlockHeightForAuctionBuild() {
  const health = await fetchJson(withBasePath("/api/health"));
  state.health = health;
  renderHealth();

  const candidate = health?.stats?.currentHeight ?? health?.currentHeight;
  const height = typeof candidate === "number" ? candidate : Number(candidate);

  if (!Number.isSafeInteger(height) || height < 0) {
    throw new Error("Current resolver height is unavailable. Refresh and try again.");
  }

  return height;
}

async function fetchOpeningAuctionUnlockBlockForUi(name) {
  const normalizedName = String(name ?? "").trim().toLowerCase();
  const recordResponse = await fetch(withBasePath("/api/name/" + encodeURIComponent(normalizedName)));

  if (recordResponse.status === 404) {
    return 0;
  }

  if (!recordResponse.ok) {
    throw new Error("Resolver returned " + String(recordResponse.status) + " while checking whether " + normalizedName + " can be opened.");
  }

  const record = await recordResponse.json();
  if (record.status !== "invalid") {
    throw new Error(normalizedName + " already has active ownership. Bidding only starts for names without active ownership.");
  }

  const releaseHeight = await fetchLatestReleaseHeightForNameForUi(normalizedName);
  if (releaseHeight === null) {
    throw new Error("Unable to find the release transaction for " + normalizedName + ".");
  }

  return releaseHeight;
}

async function fetchLatestReleaseHeightForNameForUi(name) {
  const payload = await fetchJson(withBasePath("/api/name/" + encodeURIComponent(name) + "/activity?limit=50"));
  const activity = Array.isArray(payload.activity) ? payload.activity : [];
  let latestReleaseHeight = null;

  for (const entry of activity) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const invalidatedNames = Array.isArray(entry.invalidatedNames) ? entry.invalidatedNames : [];
    const releasedThisName = invalidatedNames.some((candidate) =>
      String(candidate ?? "").trim().toLowerCase() === name
    );

    if (!releasedThisName) {
      continue;
    }

    const height = typeof entry.blockHeight === "number" ? entry.blockHeight : Number(entry.blockHeight);
    if (!Number.isSafeInteger(height) || height < 0) {
      continue;
    }

    latestReleaseHeight = latestReleaseHeight === null ? height : Math.max(latestReleaseHeight, height);
  }

  return latestReleaseHeight;
}

async function fetchVisibleAuctionByIdForUi(auctionId) {
  const payload = await fetchJson(withBasePath("/api/experimental-auctions"));
  state.experimentalAuctions = payload;
  renderExperimentalAuctionFeed();

  const auctions = Array.isArray(payload.auctions) ? payload.auctions : [];
  const auction = auctions.find((candidate) =>
    candidate
    && typeof candidate === "object"
    && !Array.isArray(candidate)
    && String(candidate.auctionId ?? "") === String(auctionId)
  );

  if (!auction) {
    throw new Error("No live auction with id " + String(auctionId) + " is currently visible.");
  }

  return auction;
}

function readAuctionArtifactFormValues(source, id, domKey) {
  const fundingInput = document.querySelector('[data-auction-funding-inputs="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
  const feeInput = document.querySelector('[data-auction-fee-sats="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
  const bondAddressInput = document.querySelector('[data-auction-bond-address="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
  const changeAddressInput = document.querySelector('[data-auction-change-address="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
  const fundingText =
    fundingInput instanceof HTMLTextAreaElement || fundingInput instanceof HTMLInputElement
      ? fundingInput.value
      : "";
  const fundingInputs = fundingText
    .split(/\\n+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const defaultReturnAddress = deriveDefaultReturnAddressFromFundingInputs(fundingInputs);
  const feeBtc = feeInput instanceof HTMLInputElement ? feeInput.value.trim() : "";
  const bondAddress = (bondAddressInput instanceof HTMLInputElement ? bondAddressInput.value.trim() : "") || defaultReturnAddress;
  const changeAddress = (changeAddressInput instanceof HTMLInputElement ? changeAddressInput.value.trim() : "") || bondAddress;

  if (fundingInputs.length === 0) {
    return { domKey, error: "Paste a funded Sparrow output first." };
  }

  if (feeBtc.length === 0) {
    return { domKey, error: "Enter a network fee first." };
  }

  let feeSats = "";
  try {
    feeSats = parseBtcAmountInputToSatsString(feeBtc, "Network fee");
  } catch (error) {
    return { domKey, error: describeError(error) };
  }

  if (bondAddress.length === 0) {
    return {
      domKey,
      error: "Paste a bid bond address, or use a funded Sparrow coin descriptor that includes its address."
    };
  }

  return {
    domKey,
    fundingInputs,
    feeSats,
    bondAddress,
    changeAddress,
    usedDefaultReturnAddress: defaultReturnAddress.length > 0
      && (!(bondAddressInput instanceof HTMLInputElement) || bondAddressInput.value.trim().length === 0),
    error: null
  };
}

function deriveAddressFromFundingInputDescriptor(descriptor) {
  const parts = String(descriptor ?? "").trim().split(":");
  return typeof parts[3] === "string" ? parts[3].trim() : "";
}

function deriveDefaultReturnAddressFromFundingInputs(fundingInputs) {
  for (let index = fundingInputs.length - 1; index >= 0; index -= 1) {
    const address = deriveAddressFromFundingInputDescriptor(fundingInputs[index] ?? "");
    if (address.length > 0) {
      return address;
    }
  }

  return "";
}

function getAuctionFundingFieldValue(node) {
  return node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement
    ? node.value
    : "";
}

function setAuctionFundingFieldValue(node, value) {
  setAuctionFieldText(node, value);
}

function setAuctionFundingSummaryFields(source, id, descriptors) {
  const normalizedDescriptors = Array.isArray(descriptors)
    ? descriptors.map((descriptor) => String(descriptor ?? "").trim()).filter((descriptor) => descriptor.length > 0)
    : String(descriptors ?? "").split(/\\n+/).map((descriptor) => descriptor.trim()).filter((descriptor) => descriptor.length > 0);
  const amountInput = document.querySelector('[data-auction-funding-amount="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
  const addressInput = document.querySelector('[data-auction-funding-address="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
  const descriptorInput = document.querySelector('[data-auction-funding-inputs="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');

  let totalSats = 0n;
  let summaryAddress = "";
  normalizedDescriptors.forEach((descriptor) => {
    const parts = parseAuctionFundingInputDescriptorParts(descriptor);
    if (parts.valueSats.length > 0) {
      try {
        totalSats += BigInt(parts.valueSats);
      } catch (_error) {
        totalSats += 0n;
      }
    }
    if (parts.address.length > 0) {
      summaryAddress = parts.address;
    }
  });

  setAuctionFieldText(amountInput, totalSats > 0n ? formatSats(totalSats.toString()) : "", "Not loaded yet");
  setAuctionFundingAddressDisplay(addressInput, summaryAddress);
  setAuctionFundingFieldValue(descriptorInput, normalizedDescriptors.join("\\n"));
  updateAuctionFundingOutputNote(source, id);
  updateAuctionPsbtActionState(source, id, buildAuctionPackageDomKey(source, id));
}

function setAuctionFundingComponentFields(source, id, descriptor) {
  const parts = parseAuctionFundingInputDescriptorParts(descriptor);
  const outputInput = document.querySelector('[data-auction-funding-output="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
  setAuctionFundingFieldValue(outputInput, parts.output);
  setAuctionFundingSummaryFields(source, id, [descriptor]);
}

function setAuctionFundingOutputFieldFromDescriptor(source, id, attribute, descriptor) {
  const parts = parseAuctionFundingInputDescriptorParts(descriptor);
  const outputInput = document.querySelector(
    "[" + attribute + '="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]'
  );
  setAuctionFundingFieldValue(outputInput, parts.output);
}

async function expandAuctionFundingInputsForUi(source, id) {
  const fundingInput = document.querySelector('[data-auction-funding-inputs="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
  const fundingOutputInput = document.querySelector('[data-auction-funding-output="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
  const rebidOutputInput = document.querySelector('[data-auction-rebid-output="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
  if (
    !(fundingInput instanceof HTMLTextAreaElement || fundingInput instanceof HTMLInputElement)
    && !(fundingOutputInput instanceof HTMLInputElement)
    && !(rebidOutputInput instanceof HTMLInputElement)
  ) {
    return { error: null };
  }

  const outputValue = fundingOutputInput instanceof HTMLInputElement
    ? fundingOutputInput.value.trim()
    : "";
  const rebidOutputValue = rebidOutputInput instanceof HTMLInputElement
    ? rebidOutputInput.value.trim()
    : "";
  if (outputValue.length > 0 || rebidOutputValue.length > 0) {
    const expandedDescriptors = [];

    if (rebidOutputValue.length > 0) {
      const expansion = await expandAuctionFundingOutputValueForUi(
        rebidOutputValue,
        "previous bid output"
      );
      if (expansion.error) {
        return expansion;
      }
      expandedDescriptors.push(expansion.descriptor);
      setAuctionFundingOutputFieldFromDescriptor(source, id, "data-auction-rebid-output", expansion.descriptor);
    }

    if (outputValue.length > 0) {
      const expansion = await expandAuctionFundingOutputValueForUi(
        outputValue,
        "funded Sparrow output"
      );
      if (expansion.error) {
        return expansion;
      }
      expandedDescriptors.push(expansion.descriptor);
      setAuctionFundingOutputFieldFromDescriptor(source, id, "data-auction-funding-output", expansion.descriptor);
    }

    if (expandedDescriptors.length > 0) {
      setAuctionFundingSummaryFields(source, id, expandedDescriptors);
      return { error: null };
    }
  }

  const lines = getAuctionFundingFieldValue(fundingInput)
    .split(/\\n+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (lines.length === 0) {
    return { error: null };
  }

  const expandedLines = [];
  let expandedAny = false;

  for (const line of lines) {
    const shorthandMatch = line.match(/^([0-9a-fA-F]{64}):([0-9]+)$/);
    if (!shorthandMatch) {
      expandedLines.push(line);
      continue;
    }

    const txid = String(shorthandMatch[1]).toLowerCase();
    const vout = String(shorthandMatch[2]);

    try {
      const utxo = await fetchJson(withBasePath("/api/utxo/" + encodeURIComponent(txid) + "/" + encodeURIComponent(vout)));
      const valueSats = String(utxo.valueSats ?? "").trim();
      const address = String(utxo.address ?? "").trim();

      if (valueSats.length === 0 || address.length === 0) {
        return {
          error: "I found that Sparrow output, but the resolver did not return both the amount and address. Paste the full txid:vout:valueSats:address descriptor instead."
        };
      }

      expandedLines.push(txid + ":" + vout + ":" + valueSats + ":" + address);
      expandedAny = true;
    } catch (error) {
      return { error: describeError(error) };
    }
  }

  if (expandedAny) {
    setAuctionFundingFieldValue(fundingInput, expandedLines.join("\\n"));
    setAuctionFundingSummaryFields(source, id, expandedLines);
  }

  return { error: null };
}

async function expandAuctionFundingOutputValueForUi(value, label) {
  const outputValue = String(value ?? "").trim();
  const fullDescriptorMatch = outputValue.match(/^([0-9a-fA-F]{64}):([0-9]+):([0-9]+):([^:\\s]+)(?::(.+))?$/);
  if (fullDescriptorMatch) {
    return { descriptor: outputValue, error: null };
  }

  const shorthandMatch = outputValue.match(/^([0-9a-fA-F]{64}):([0-9]+)$/);
  if (!shorthandMatch) {
    return {
      error: "Paste the " + String(label) + " as txid:vout. In Sparrow, copy the Output value from the UTXOs tab."
    };
  }

  const txid = String(shorthandMatch[1]).toLowerCase();
  const vout = String(shorthandMatch[2]);

  try {
    const utxo = await fetchJson(withBasePath("/api/utxo/" + encodeURIComponent(txid) + "/" + encodeURIComponent(vout)));
    const valueSats = String(utxo.valueSats ?? "").trim();
    const address = String(utxo.address ?? "").trim();

    if (valueSats.length === 0 || address.length === 0) {
      return {
        error: "I found that " + String(label) + ", but the resolver did not return both the amount and address. Try another unspent output from Sparrow."
      };
    }

    return {
      descriptor: txid + ":" + vout + ":" + valueSats + ":" + address,
      error: null
    };
  } catch (error) {
    return { error: describeError(error) };
  }
}

function isAuctionFundingInputProblem(message) {
  const normalized = String(message ?? "").toLowerCase();
  return normalized.includes("funded sparrow coin")
    || normalized.includes("utxo descriptor")
    || normalized.includes("already spent")
    || normalized.includes("not visible on the demo chain");
}

function clearAuctionFundingInput(source, id) {
  const fundingInput = document.querySelector('[data-auction-funding-inputs="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
  const fundingOutputInput = document.querySelector('[data-auction-funding-output="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
  const rebidOutputInput = document.querySelector('[data-auction-rebid-output="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
  const fundingAmountInput = document.querySelector('[data-auction-funding-amount="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');
  const fundingAddressInput = document.querySelector('[data-auction-funding-address="' + cssEscape(id) + '"][data-auction-package-source="' + cssEscape(source) + '"]');

  setAuctionFundingFieldValue(fundingInput, "");
  setAuctionFundingFieldValue(fundingOutputInput, "");
  setAuctionFundingFieldValue(rebidOutputInput, "");
  setAuctionFieldText(fundingAmountInput, "", "Not loaded yet");
  setAuctionFundingAddressDisplay(fundingAddressInput, "");
  updateAuctionFundingOutputNote(source, id);
}

async function buildAuctionBidArtifactsForUi(input) {
  await validateFundingInputsAvailableForUi(input.fundingInputs);
  const auctionTools = await loadAuctionTools();

  return auctionTools.buildBrowserAuctionBidArtifacts({
    bidPackage: input.bidPackage,
    fundingInputs: input.fundingInputs,
    feeSats: input.feeSats,
    network: "signet",
    bondAddress: input.bondAddress,
    changeAddress: input.changeAddress
  });
}

async function validateFundingInputsAvailableForUi(fundingInputs) {
  const seenOutpoints = new Set();
  for (const descriptor of fundingInputs) {
    const input = parseFundingInputDescriptorForUi(descriptor);
    const outpoint = input.txid + ":" + input.vout;
    if (seenOutpoints.has(outpoint)) {
      throw new Error("The same Sparrow output was selected more than once. Choose distinct unspent outputs.");
    }
    seenOutpoints.add(outpoint);

    const utxo = await fetchJson(withBasePath("/api/utxo/" + encodeURIComponent(input.txid) + "/" + encodeURIComponent(input.vout)));
    const actualValueSats = String(utxo.valueSats ?? "").trim();

    if (actualValueSats.length === 0) {
      throw new Error("Unable to verify the amount for funded Sparrow coin " + input.txid + ":" + input.vout + ".");
    }

    if (actualValueSats !== input.valueSats) {
      throw new Error(
        "The funded Sparrow coin " + input.txid + ":" + input.vout + " is unspent, but its amount is " + formatSats(actualValueSats) + ", not " + formatSats(input.valueSats) + ". Refresh the coin from Sparrow and try again."
      );
    }
  }
}

function parseFundingInputDescriptorForUi(descriptor) {
  const parts = String(descriptor ?? "").trim().split(":");
  if (parts.length < 4) {
    throw new Error("Paste a funded Sparrow output first, then let the website load the amount and address.");
  }

  const txid = String(parts[0] ?? "").trim().toLowerCase();
  const vout = String(parts[1] ?? "").trim();
  const valueSats = String(parts[2] ?? "").trim();

  if (!/^[0-9a-f]{64}$/.test(txid) || !/^[0-9]+$/.test(vout) || !/^[0-9]+$/.test(valueSats)) {
    throw new Error("The selected coin is not in the expected txid:vout:value:address form. Paste the Output value from Sparrow and let the website fill the rest.");
  }

  return { txid, vout, valueSats };
}

function renderAuctionBidPackagePreview(pkg, sourceLabel) {
  return [
    '<article class="guide-card">',
    "  <h3>Bid Preview</h3>",
    '  <p class="field-value">' + escapeHtml(String(pkg.previewSummary ?? "Bid package ready.")) + "</p>",
    '  <div class="result-grid">',
    '    <div class="result-item"><label>State source</label><p class="field-value">' + escapeHtml(sourceLabel) + "</p></div>",
    '    <div class="result-item"><label>Preview status</label><p class="field-value">' + escapeHtml(formatAuctionPreviewStatus(pkg.previewStatus)) + "</p></div>",
    '    <div class="result-item"><label>Owner pubkey</label>' + renderCopyableCode(String(pkg.ownerPubkey ?? "")) + "</div>",
    '    <div class="result-item"><label>Bid amount</label><p class="field-value">' + escapeHtml(formatSats(pkg.bidAmountSats ?? "0")) + "</p></div>",
    '    <div class="result-item"><label>Required minimum</label><p class="field-value">' + escapeHtml(pkg.previewRequiredMinimumBidSats ? formatSats(pkg.previewRequiredMinimumBidSats) : "Not applicable") + "</p></div>",
    '    <div class="result-item"><label>Would become leader</label><p class="field-value">' + escapeHtml(pkg.wouldBecomeLeader ? "Yes" : "No") + "</p></div>",
    '    <div class="result-item"><label>Would extend soft close</label><p class="field-value">' + escapeHtml(pkg.wouldExtendSoftClose ? "Yes" : "No") + "</p></div>",
    '    <div class="result-item"><label>Bidder fingerprint</label>' + renderCopyableCode(pkg.bidderCommitment) + "</div>",
    '    <div class="result-item"><label>State fingerprint</label>' + renderCopyableCode(pkg.auctionStateCommitment) + "</div>",
    '    <div class="result-item"><label>Auction fingerprint</label>' + renderCopyableCode(pkg.auctionLotCommitment) + "</div>",
    '    <div class="result-item"><label>Bond maturity window</label><p class="field-value">' + escapeHtml(formatBlockWindow(pkg.settlementLockBlocks)) + "</p></div>",
    "  </div>",
    '  <ul class="guide-list">',
    '    <li>Next website step: build the unsigned Sparrow PSBT, then sign and broadcast in Sparrow.</li>',
    '    <li>If another bid lands first, rebuild the package from the latest state before signing.</li>',
    "  </ul>",
    "</article>"
  ].join("");
}

function renderAuctionBidArtifactsPreview(artifacts, pkg) {
  const outputs = Array.isArray(artifacts.outputs) ? artifacts.outputs : [];

  return [
    '<article class="guide-card">',
    "  <h3>Sparrow PSBT Ready</h3>",
    '  <p class="field-value">After downloading the PSBT, choose File -> Open Transaction in Sparrow, select the .psbt file, review the bond and change outputs, sign with the funding wallet, then broadcast from Sparrow.</p>',
    '  <div class="result-grid">',
    '    <div class="result-item"><label>Name</label><p class="field-value">' + escapeHtml(String(pkg.name ?? "-")) + "</p></div>",
    '    <div class="result-item"><label>Bid amount</label><p class="field-value">' + escapeHtml(formatSats(pkg.bidAmountSats ?? "0")) + "</p></div>",
    '    <div class="result-item"><label>Network fee</label><p class="field-value">' + escapeHtml(formatSats(artifacts.feeSats ?? "0")) + "</p></div>",
    '    <div class="result-item"><label>Change</label><p class="field-value">' + escapeHtml(formatSats(artifacts.changeValueSats ?? "0")) + "</p></div>",
    '    <div class="result-item"><label>Unsigned txid</label>' + renderCopyableCode(String(artifacts.bidTxid ?? "")) + "</div>",
    '    <div class="result-item"><label>PSBT base64</label>' + renderCopyableCode(String(artifacts.psbtBase64 ?? "")) + "</div>",
    "  </div>",
    renderAuctionArtifactOutputList(outputs),
    '  <ul class="guide-list">',
    '    <li>Do not sign if Sparrow shows different outputs than you expect.</li>',
    '    <li>The bid bond output should use your wallet address and match the bid amount.</li>',
    '    <li>The change output, if present, should return to your wallet.</li>',
    '    <li>The zero-value ONT output carries the auction bid payload.</li>',
    "  </ul>",
    "</article>"
  ].join("");
}

function renderAuctionArtifactOutputList(outputs) {
  if (!outputs.length) {
    return "";
  }

  return [
    '<div class="step-list">',
    '  <p class="step-list-label">Transaction Outputs</p>',
    '  <div class="result-grid">',
    ...outputs.map((output) => [
      '    <div class="result-item">',
      "      <label>" + escapeHtml(formatAuctionArtifactOutputRole(output.role)) + "</label>",
      '      <p class="field-value">' + escapeHtml(formatSats(output.valueSats ?? "0")) + "</p>",
      output.address
        ? renderCopyableCode(String(output.address))
        : '<p class="field-value">OP_RETURN payload</p>',
      "    </div>"
    ].join("")),
    "  </div>",
    "</div>"
  ].join("");
}

function formatAuctionArtifactOutputRole(role) {
  switch (role) {
    case "auction_bid_bond":
      return "Bid bond";
    case "ont_auction_bid":
      return "ONT bid payload";
    case "change":
      return "Change";
    default:
      return typeof role === "string" && role.length > 0 ? role : "Output";
  }
}

function formatAuctionPreviewStatus(value) {
  switch (value) {
    case "too_early":
      return "Too early";
    case "below_minimum":
      return "Below minimum";
    case "currently_valid":
      return "Currently valid";
    case "auction_closed":
      return "Auction closed";
    default:
      return typeof value === "string" && value.length > 0 ? value : "Unknown";
  }
}

function renderAuctionBidHistory(outcomes) {
  if (!Array.isArray(outcomes) || outcomes.length === 0) {
    return '<p class="tx-panel-note">No visible bid attempts yet at this block height.</p>';
  }
  const summary = summarizeAuctionBidOutcomes(outcomes);

  return [
    '<details class="detail-technical">',
    "  <summary>Bid history interpreted by ONT</summary>",
    '  <div class="detail-technical-body">',
    '    <p class="tx-panel-note">' + escapeHtml(summary.counted + " counted, " + summary.notCounted + " not counted. The highest-after field shows the auction ladder after each observed attempt.") + "</p>",
    '    <div class="tx-event-list">',
    outcomes
      .map((outcome, index) => {
        const statusLabel = formatAuctionBidCountingStatus(outcome);
        const statusClass = formatAuctionBidCountingStatusClass(outcome);
        const outcomeLabel = formatAuctionBidOutcomeReason(outcome.reason);
        const outcomeNote = describeAuctionBidOutcome(outcome) || describeAcceptedAuctionBidOutcome(outcome);
        return [
          '<article class="tx-event-card">',
          '  <div class="tx-event-header">',
          "    <strong>Bid " + escapeHtml(String(index + 1)) + " · " + escapeHtml(String(outcome.bidderId ?? "unknown")) + "</strong>",
          '    <span class="tx-pill ' + escapeHtml(statusClass) + '">' + escapeHtml(statusLabel) + "</span>",
          '    <span class="inline-note">block ' + escapeHtml(String(outcome.blockHeight ?? "-")) + "</span>",
          "  </div>",
          '  <p class="tx-event-meta">Attempted ' + escapeHtml(formatSats(outcome.amountSats ?? "0")) + " · " + escapeHtml(outcomeLabel) + "</p>",
          outcomeNote.length > 0 ? '  <p class="tx-event-meta">' + escapeHtml(outcomeNote) + "</p>" : "",
          '  <div class="result-grid">',
          '    <div class="result-item"><label>Required minimum</label><p class="field-value">' + escapeHtml(formatSats(outcome.requiredMinimumBidSats ?? "0")) + "</p></div>",
          '    <div class="result-item"><label>Highest after</label><p class="field-value">' + escapeHtml(outcome.highestBidSatsAfter ? formatSats(outcome.highestBidSatsAfter) : "None yet") + "</p></div>",
          '    <div class="result-item"><label>Close after</label><p class="field-value">' + escapeHtml(outcome.auctionCloseBlockAfter == null ? "-" : String(outcome.auctionCloseBlockAfter)) + "</p></div>",
          "  </div>",
          "</article>"
        ].join("");
      })
      .join(""),
    "    </div>",
    "  </div>",
    "</details>"
  ].join("");
}

function renderExperimentalAuctionBidHistory(outcomes) {
  if (!Array.isArray(outcomes) || outcomes.length === 0) {
    return '<p class="tx-panel-note">No confirmed bid transactions have been observed for this auction yet.</p>';
  }
  const summary = summarizeAuctionBidOutcomes(outcomes);

  return [
    '<details class="detail-technical">',
    "  <summary>Bid history interpreted by ONT</summary>",
    '  <div class="detail-technical-body">',
    '    <p class="tx-panel-note">' + escapeHtml(summary.counted + " counted, " + summary.notCounted + " not counted. Each row is the ONT resolver interpretation of confirmed chain data, not wallet-local intent.") + "</p>",
    '    <div class="tx-event-list">',
    outcomes
      .map((outcome, index) => {
        const statusLabel = formatAuctionBidCountingStatus(outcome);
        const statusClass = formatAuctionBidCountingStatusClass(outcome);
        const outcomeLabel = formatAuctionBidOutcomeReason(outcome.reason);
        const outcomeNote = describeAuctionBidOutcome(outcome) || describeAcceptedAuctionBidOutcome(outcome);
        return [
          '<article class="tx-event-card">',
          '  <div class="tx-event-header">',
          '    <strong>Bid ' + escapeHtml(String(index + 1)) + " · " + escapeHtml(formatAuctionCommitment(outcome.bidderCommitment)) + "</strong>",
          '    <span class="status-pill ' + escapeHtml(statusClass) + '">' + escapeHtml(statusLabel) + "</span>",
          "  </div>",
          outcomeNote.length > 0 ? '  <p class="tx-event-meta">' + escapeHtml(outcomeNote) + "</p>" : "",
          '  <div class="result-grid">',
          '    <div class="result-item"><label>Bid</label><p class="field-value">' + escapeHtml(formatSats(outcome.amountSats)) + "</p></div>",
          '    <div class="result-item"><label>Block</label><p class="field-value">' + escapeHtml(String(outcome.blockHeight)) + "</p></div>",
          '    <div class="result-item"><label>Result</label><p class="field-value">' + escapeHtml(outcomeLabel) + "</p></div>",
          '    <div class="result-item"><label>Required minimum</label><p class="field-value">' + escapeHtml(formatSats(outcome.requiredMinimumBidSats)) + "</p></div>",
          '    <div class="result-item"><label>Highest after</label><p class="field-value">' + escapeHtml(outcome.highestBidSatsAfter ? formatSats(outcome.highestBidSatsAfter) : "None yet") + "</p></div>",
          '    <div class="result-item"><label>Tx</label><p class="field-value">' + escapeHtml(shortenTxid(outcome.txid)) + "</p></div>",
          '    <div class="result-item"><label>Close after</label><p class="field-value">' + escapeHtml(outcome.auctionCloseBlockAfter == null ? "-" : String(outcome.auctionCloseBlockAfter)) + "</p></div>",
          '    <div class="result-item"><label>State check</label><p class="field-value">' + escapeHtml(outcome.stateCommitmentMatched ? "Matched auction state" : "Built from old auction state") + "</p></div>",
          '    <div class="result-item"><label>Bond status</label><p class="field-value">' + escapeHtml(formatAuctionBondStatus(outcome.bondStatus)) + "</p></div>",
          '    <div class="result-item"><label>Bond maturity</label><p class="field-value">' + escapeHtml(outcome.bondReleaseBlock == null ? "-" : "block " + String(outcome.bondReleaseBlock)) + "</p></div>",
          '    <div class="result-item"><label>Bond spend</label><p class="field-value">' + escapeHtml(formatAuctionBondSpendStatus(outcome.bondSpendStatus)) + "</p></div>",
          '    <div class="result-item"><label>Spent by tx</label><p class="field-value">' + escapeHtml(outcome.bondSpentTxid ? shortenTxid(outcome.bondSpentTxid) : "-") + "</p></div>",
          '    <div class="result-item"><label>Spent at block</label><p class="field-value">' + escapeHtml(outcome.bondSpentBlockHeight == null ? "-" : String(outcome.bondSpentBlockHeight)) + "</p></div>",
          "  </div>",
          "</article>"
        ].join("");
      })
      .join(""),
    "    </div>",
    "  </div>",
    "</details>"
  ].join("");
}

function formatAuctionCommitment(value) {
  if (typeof value !== "string" || value.length === 0) {
    return "None yet";
  }

  if (value.length <= 16) {
    return value;
  }

  return value.slice(0, 12) + "…" + value.slice(-8);
}

function formatAuctionBidCountingStatus(outcome) {
  return outcome?.status === "accepted" ? "Counted" : "Not counted";
}

function formatAuctionBidCountingStatusClass(outcome) {
  return outcome?.status === "accepted" ? "status-pending" : "status-invalid";
}

function summarizeAuctionBidOutcomes(outcomes) {
  const list = Array.isArray(outcomes) ? outcomes : [];
  const counted = list.filter((outcome) => outcome?.status === "accepted").length;

  return {
    counted,
    notCounted: Math.max(0, list.length - counted)
  };
}

function formatAuctionBidOutcomeReason(reason) {
  switch (reason) {
    case "opening_bid":
      return "Opening bid";
    case "higher_bid":
      return "Higher bid";
    case "higher_bid_soft_close_extended":
      return "Higher bid; close extended";
    case "replacement_bid":
      return "Replacement bid";
    case "replacement_bid_soft_close_extended":
      return "Replacement bid; close extended";
    case "stale_state_commitment":
      return "Not counted: stale auction state";
    case "below_minimum_increment":
      return "Not counted: below required bid";
    case "below_opening_minimum":
      return "Not counted: below opening floor";
    case "before_unlock":
      return "Not counted: before opening";
    case "auction_closed":
      return "Not counted: auction already closed";
    case "invalid_name_commitment":
      return "Not counted: wrong name commitment";
    case "missing_owner_pubkey":
      return "Not counted: missing owner key";
    default:
      return typeof reason === "string" && reason.length > 0 ? reason : "Unknown";
  }
}

function describeAuctionBidOutcome(outcome) {
  if (!outcome || outcome.status === "accepted") {
    return "";
  }

  switch (outcome.reason) {
    case "stale_state_commitment":
      return "This bid was built from an older auction state. It did not count because another valid bid changed the required next bid before this transaction confirmed.";
    case "below_minimum_increment":
      return "This transaction confirmed, but the bonded amount did not clear the required next bid.";
    case "below_opening_minimum":
      return "This transaction confirmed, but the bonded amount did not clear the opening floor.";
    case "auction_closed":
      return "This transaction confirmed after the auction had already closed, so it did not affect the outcome.";
    default:
      return "This transaction confirmed, but it did not count toward the current auction state.";
  }
}

function describeAcceptedAuctionBidOutcome(outcome) {
  switch (outcome?.reason) {
    case "opening_bid":
      return "This bid opened the auction and started the close clock.";
    case "higher_bid":
      return "This bid cleared the normal increment and became the leader.";
    case "higher_bid_soft_close_extended":
      return "This late bid cleared the stronger soft-close increment and moved the close height forward when needed.";
    case "replacement_bid":
      return "This self-rebid spent the bidder's prior bid bond and replaced it with a higher live bond.";
    case "replacement_bid_soft_close_extended":
      return "This self-rebid replaced the prior bid bond during soft close and moved the close height forward when needed.";
    default:
      return "";
  }
}

function formatAuctionBondStatus(value) {
  switch (value) {
    case "rejected_not_tracked":
      return "Not counted by auction";
    case "replaced_by_self_rebid":
      return "Consumed by self-rebid";
    case "leading_locked":
      return "Leading bid bond active";
    case "superseded_locked_until_settlement":
      return "Superseded until auction settles";
    case "losing_bid_releasable":
      return "Losing bid bond releasable";
    case "winner_locked":
      return "Winner bond maturing";
    case "winner_releasable":
      return "Winner bond mature";
    default:
      return typeof value === "string" && value.length > 0 ? value : "Unknown";
  }
}

function formatAuctionBondSpendStatus(value) {
  switch (value) {
    case "not_applicable":
      return "Not tracked";
    case "unspent":
      return "Unspent";
    case "replacement_spend":
      return "Consumed by replacement rebid";
    case "spent_after_allowed_release":
      return "Spent after bond maturity";
    case "spent_before_allowed_release":
      return "Early bond break";
    default:
      return typeof value === "string" && value.length > 0 ? value : "Unknown";
  }
}

function mapAuctionPhasePill(phase) {
  switch (phase) {
    case "pending_unlock":
      return "pending";
    case "awaiting_opening_bid":
      return "available";
    case "live_bidding":
      return "immature";
    case "soft_close":
      return "transfer";
    case "settled":
      return "mature";
    default:
      return "invalid";
  }
}

function formatBlockWindow(value) {
  const blocks = Number(value ?? 0);
  if (!Number.isFinite(blocks) || blocks <= 0) {
    return "0 blocks";
  }

  const days = blocks / 144;
  if (days >= 365) {
    return (days / 365).toFixed(days % 365 === 0 ? 0 : 1) + " years";
  }
  if (days >= 30) {
    return (days / 30).toFixed(days % 30 === 0 ? 0 : 1) + " months";
  }
  if (days >= 1) {
    return days.toFixed(days % 1 === 0 ? 0 : 1) + " days";
  }

  return String(blocks) + " blocks";
}

function getPrivateDemoBasePath() {
  return typeof state.config?.privateDemoBasePath === "string" && state.config.privateDemoBasePath.length > 0
    ? state.config.privateDemoBasePath
    : BASE_PATH;
}

function renderPrivateAuctionSmokeStatus() {
  if (!elements.privateAuctionSmokeResult) {
    return;
  }

  const auctionSmoke = state.privateAuctionSmokeStatus;
  if (!auctionSmoke) {
    elements.privateAuctionSmokeResult.classList.add("empty");
    elements.privateAuctionSmokeResult.textContent = "No private signet auction smoke status is available yet.";
    setText(
      elements.privateAuctionSmokeMeta,
      "Waiting for the first published private signet auction smoke summary."
    );
    return;
  }

  const status = String(auctionSmoke.status ?? "unknown");
  const privateDemoBasePath = getPrivateDemoBasePath();
  const auction = auctionSmoke.auction && typeof auctionSmoke.auction === "object" ? auctionSmoke.auction : {};
  const finalState = auctionSmoke.finalState && typeof auctionSmoke.finalState === "object" ? auctionSmoke.finalState : {};
  const phaseLabel =
    typeof finalState.phaseLabel === "string" && finalState.phaseLabel.length > 0
      ? finalState.phaseLabel
      : typeof finalState.phase === "string" && finalState.phase.length > 0
        ? finalState.phase
        : "State unavailable";
  const acceptedBidCount = Number(finalState.acceptedBidCount ?? 0);
  const totalObservedBidCount = Number(finalState.totalObservedBidCount ?? 0);
  const highestBidText = finalState.currentHighestBidSats ? formatSats(finalState.currentHighestBidSats) : "None yet";
  const nextBidText = finalState.currentRequiredMinimumBidSats ? formatSats(finalState.currentRequiredMinimumBidSats) : "Auction settled";
  const winnerValueSequence =
    auctionSmoke.winnerValue?.currentValue && typeof auctionSmoke.winnerValue.currentValue === "object"
      ? auctionSmoke.winnerValue.currentValue.sequence
      : null;
  const transferredValueSequence =
    auctionSmoke.transferredValue?.currentValue && typeof auctionSmoke.transferredValue.currentValue === "object"
      ? auctionSmoke.transferredValue.currentValue.sequence
      : null;
  const transferTxid =
    auctionSmoke.transfer && typeof auctionSmoke.transfer === "object"
      ? auctionSmoke.transfer.transferTxid
      : null;
  const transferredOwnerPubkey =
    auctionSmoke.transfer?.record?.currentOwnerPubkey
    ?? auctionSmoke.highlight?.transferredOwnerPubkey
    ?? null;
  const winnerBondSpentTxid = auctionSmoke.highlight?.winnerBondSpentTxid ?? null;
  const actionLinks = [
    finalState.phase === "settled" && typeof finalState.normalizedName === "string" && finalState.normalizedName.trim().length > 0
      ? '<a class="action-link" href="' + escapeHtml(buildNameDetailPath(finalState.normalizedName, privateDemoBasePath)) + '">Open settled name</a>'
      : "",
    finalState.phase === "settled" && typeof finalState.normalizedName === "string" && finalState.normalizedName.trim().length > 0
      ? '<a class="action-link secondary" href="' + escapeHtml(buildValuePublishPath(finalState.normalizedName, privateDemoBasePath)) + '">Update destinations</a>'
      : "",
    finalState.phase === "settled" && typeof finalState.normalizedName === "string" && finalState.normalizedName.trim().length > 0
      ? '<a class="action-link secondary" href="' + escapeHtml(buildTransferPrepPath(finalState.normalizedName, privateDemoBasePath)) + '">Prepare transfer</a>'
      : "",
    '<a class="action-link" href="' + escapeHtml(withBasePath("/auctions", privateDemoBasePath)) + '">Open private auctions</a>',
    '<a class="action-link secondary" href="' + escapeHtml(withBasePath("/explore", privateDemoBasePath)) + '">Open private explorer</a>'
  ]
    .filter(Boolean)
    .join("");

  setText(
    elements.privateAuctionSmokeMeta,
    [
      "Status: " + formatLiveSmokeStatus(status),
      auctionSmoke.completedAt
        ? "Updated " + new Date(auctionSmoke.completedAt).toLocaleString()
        : auctionSmoke.startedAt
          ? "Started " + new Date(auctionSmoke.startedAt).toLocaleString()
          : null,
      acceptedBidCount > 0 || totalObservedBidCount > 0
        ? String(acceptedBidCount) + " accepted / " + String(totalObservedBidCount) + " observed bids"
        : null,
    ]
      .filter(Boolean)
      .join(" · ")
  );

  elements.privateAuctionSmokeResult.classList.remove("empty");
  elements.privateAuctionSmokeResult.innerHTML = [
    '<div class="result-title">',
    '  <h3>' + escapeHtml(String(auction.title ?? finalState.title ?? auctionSmoke.kind ?? "Private auction smoke")) + '</h3>',
    '  <span class="status-pill ' + escapeHtml(mapLiveSmokeStatusPill(status)) + '">' + escapeHtml(formatLiveSmokeStatus(status)) + '</span>',
    '</div>',
    '<div class="result-grid">',
    '  <div class="result-item">',
    "    <label>Summary</label>",
    '    <p class="field-value">Opening bid, higher bid, settlement, destination publishing, transfer, and losing-bond violation checks are covered by this smoke run.</p>',
    "  </div>",
    '  <div class="result-item">',
    "    <label>Auction id</label>",
    '    <p class="field-value">' + escapeHtml(String(auction.auctionId ?? finalState.auctionId ?? "Not published")) + '</p>',
    "  </div>",
    '  <div class="result-item">',
    "    <label>Name / path</label>",
    '    <p class="field-value">' + escapeHtml(String(auction.normalizedName ?? finalState.normalizedName ?? "-")) + " · contested auction" + '</p>',
    "  </div>",
    '  <div class="result-item">',
    "    <label>Phase</label>",
    '    <p class="field-value">' + escapeHtml(String(phaseLabel)) + '</p>',
    "  </div>",
    '  <div class="result-item">',
    "    <label>Winner handoff</label>",
    '    <p class="field-value">' + escapeHtml(renderPrivateAuctionWinnerHandoffCopy(finalState)) + '</p>',
    "  </div>",
    '  <div class="result-item">',
    "    <label>Workflow proved</label>",
    '    <p class="field-value">' + escapeHtml(renderPrivateAuctionWorkflowSummary(auctionSmoke)) + '</p>',
    "  </div>",
    '  <div class="result-item">',
    "    <label>Highest / next bid</label>",
    '    <p class="field-value">' + escapeHtml(highestBidText) + " / " + escapeHtml(nextBidText) + '</p>',
    "  </div>",
    '  <div class="result-item">',
    "    <label>Accepted / observed bids</label>",
    '    <p class="field-value">' + escapeHtml(String(acceptedBidCount) + " / " + String(totalObservedBidCount)) + '</p>',
    "  </div>",
    '  <div class="result-item">',
    "    <label>Opening Bid Txid</label>",
    auctionSmoke.alphaBid?.bidTxid ? renderCopyableCode(auctionSmoke.alphaBid.bidTxid) : '<p class="field-value">Not published</p>',
    "  </div>",
    '  <div class="result-item">',
    "    <label>Higher Bid Txid</label>",
    auctionSmoke.betaBid?.bidTxid ? renderCopyableCode(auctionSmoke.betaBid.bidTxid) : '<p class="field-value">Not published</p>',
    "  </div>",
    '  <div class="result-item">',
    "    <label>Early Spend Txid</label>",
    auctionSmoke.earlySpendTxid ? renderCopyableCode(auctionSmoke.earlySpendTxid) : '<p class="field-value">Not published</p>',
    "  </div>",
    '  <div class="result-item">',
    "    <label>Alpha spend status</label>",
    '    <p class="field-value">' + escapeHtml(formatAuctionBondSpendStatus(auctionSmoke.highlight?.alphaBondSpendStatus ?? null)) + '</p>',
    "  </div>",
    '  <div class="result-item">',
    "    <label>Beta bond status</label>",
    '    <p class="field-value">' + escapeHtml(formatAuctionBondStatus(auctionSmoke.highlight?.betaBondStatus ?? null)) + '</p>',
    "  </div>",
    '  <div class="result-item">',
    "    <label>Winner destination sequence</label>",
    '    <p class="field-value">' + escapeHtml(winnerValueSequence === null ? "Not published" : String(winnerValueSequence)) + '</p>',
    "  </div>",
    '  <div class="result-item">',
    "    <label>Winner bond maturity spend</label>",
    winnerBondSpentTxid ? renderCopyableCode(winnerBondSpentTxid) : '<p class="field-value">Not published</p>',
    "  </div>",
    '  <div class="result-item">',
    "    <label>Post-maturity transfer Txid</label>",
    transferTxid ? renderCopyableCode(transferTxid) : '<p class="field-value">Not published</p>',
    "  </div>",
    '  <div class="result-item">',
    "    <label>Transferred owner</label>",
    transferredOwnerPubkey ? renderCopyableCode(transferredOwnerPubkey) : '<p class="field-value">Not published</p>',
    "  </div>",
    '  <div class="result-item">',
    "    <label>Transferred destination sequence</label>",
    '    <p class="field-value">' + escapeHtml(transferredValueSequence === null ? "Not published" : String(transferredValueSequence)) + '</p>',
    "  </div>",
    "</div>",
    actionLinks ? '<div class="result-actions">' + actionLinks + "</div>" : ""
  ].join("");
}

function renderPrivateAuctionWinnerHandoffCopy(finalState) {
  if (String(finalState?.phase ?? "") !== "settled") {
    return "This smoke panel is still focused on the auction state rather than a live owned name.";
  }

  const currentBlockHeight = Number(finalState.currentBlockHeight ?? NaN);
  const winnerBondReleaseBlock = Number(finalState.winnerBondReleaseBlock ?? NaN);
  if (!Number.isFinite(currentBlockHeight) || !Number.isFinite(winnerBondReleaseBlock)) {
    return "The auction has settled and should now appear as a live name record.";
  }

  const blocksUntilRelease = Math.max(0, winnerBondReleaseBlock - currentBlockHeight);
  return blocksUntilRelease > 0
    ? "The auction has settled into a live name record, but bond maturity remains active for about " + String(blocksUntilRelease) + " more blocks."
    : "The auction has settled into a live name record and the winner bond has matured.";
}

function renderPrivateAuctionWorkflowSummary(auctionSmoke) {
  const winnerSequence = auctionSmoke?.winnerValue?.currentValue?.sequence;
  const transferredSequence = auctionSmoke?.transferredValue?.currentValue?.sequence;
  const transferTxid = auctionSmoke?.transfer?.transferTxid;

  if (winnerSequence === 1 && transferredSequence === 1 && typeof transferTxid === "string" && transferTxid.length > 0) {
    return "Bidding, settlement, winner destination publication, post-maturity transfer, and recipient destination publication all succeeded.";
  }

  if (winnerSequence === 1) {
    return "Bidding, settlement, and winner destination publication succeeded; the later mature transfer path is not published in this summary.";
  }

  return "This summary is still focused on bid acceptance and settlement signals.";
}
  `;
}
