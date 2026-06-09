import {
  deriveOwnerPubkey,
  payloadUtf8ToHex,
  normalizeRawPayloadHex,
  signBrowserValueRecord,
  verifyBrowserValueRecord,
  type BrowserSignedValueRecord
} from "./browser-value-record.js";
import {
  decodeHexUtf8,
  decodeProfileBundlePayloadHex,
  describeProfileBundle,
  emptyProfileBundleDraft,
  encodeProfileBundlePayloadHex,
  listProfileBundleEntries,
  profileBundleDraftFromPayload,
  type ProfileBundleDraft,
  type ProfileBundleEntry
} from "./value-bundle.js";
import { generateBrowserOwnerKey } from "./browser-key-tools.js";
import { claimAvailableName } from "./browser-claim.js";

type NameRecord = {
  readonly name: string;
  readonly status: string;
  readonly currentOwnerPubkey: string;
  readonly lastStateTxid: string;
  readonly claimHeight: number;
  readonly maturityHeight: number;
  readonly requiredBondSats: string | number | bigint;
};

type ValueRecord = {
  readonly name: string;
  readonly ownerPubkey: string;
  readonly ownershipRef: string;
  readonly sequence: number;
  readonly previousRecordHash: string | null;
  readonly valueType: number;
  readonly payloadHex: string;
  readonly issuedAt: string;
  readonly signature: string;
  readonly recordHash: string;
};

type ValueHistory = {
  readonly name: string;
  readonly ownershipRef: string;
  readonly currentRecordHash: string;
  readonly completeFromSequence: number;
  readonly completeToSequence: number;
  readonly hasGaps: boolean;
  readonly hasForks: boolean;
  readonly records: readonly ValueRecord[];
};

type ValueCompareSummary = {
  readonly kind: "ont-multi-resolver-value-history";
  readonly name: string;
  readonly resolverCount: number;
  readonly status: "all_missing" | "consistent" | "lagging" | "conflict";
  readonly canonicalResolverUrl: string | null;
  readonly ownershipRef: string | null;
  readonly currentRecordHash: string | null;
  readonly currentSequence: number | null;
  readonly laggingResolverUrls: readonly string[];
  readonly missingResolverUrls: readonly string[];
  readonly conflictingResolverUrls: readonly string[];
  readonly failedResolverUrls: readonly string[];
};

type ValuePublishFanoutSummary = {
  readonly kind: "ont-multi-resolver-value-publish";
  readonly name: string;
  readonly sequence: number;
  readonly resolverCount: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly results: ReadonlyArray<{
    readonly resolverUrl: string;
    readonly ok: boolean;
    readonly status: number | null;
    readonly code: string | null;
    readonly message: string | null;
  }>;
};

type WebConfig = {
  readonly resolverCandidates?: readonly string[];
  readonly resolverFanoutAvailable?: boolean;
};

const BASE_PATH = document.body.dataset.basePath ?? "";

const elements = {
  lookupStep: document.getElementById("value-step-inspect"),
  lookupStepState: document.getElementById("valueStepInspectState"),
  signStep: document.getElementById("value-step-sign"),
  signStepState: document.getElementById("valueStepSignState"),
  publishStep: document.getElementById("value-step-publish"),
  publishStepState: document.getElementById("valueStepPublishState"),
  lookupForm: document.getElementById("valueLookupForm"),
  nameInput: document.getElementById("valueNameInput") as HTMLInputElement | null,
  lookupResult: document.getElementById("valueLookupResult"),
  signForm: document.getElementById("valueSignForm"),
  ownerPrivateKeyInput: document.getElementById("valueOwnerPrivateKeyInput") as HTMLInputElement | null,
  ownerPubkeyPreview: document.getElementById("valueOwnerPubkeyPreview") as HTMLInputElement | null,
  ownerMatchNote: document.getElementById("valueOwnerMatchNote"),
  sequenceInput: document.getElementById("valueSequenceInput") as HTMLInputElement | null,
  sequenceHint: document.getElementById("valueSequenceHint"),
  valueTypeInput: document.getElementById("valueTypeInput") as HTMLInputElement | HTMLSelectElement | null,
  payloadField: document.getElementById("valuePayloadField"),
  payloadInput: document.getElementById("valuePayloadInput") as HTMLTextAreaElement | null,
  payloadHint: document.getElementById("valuePayloadHint"),
  bundleEditor: document.getElementById("valueBundleEditor"),
  bundleRows: document.getElementById("valueBundleRows"),
  addBundleEntryButton: document.getElementById("addValueBundleEntryButton") as HTMLButtonElement | null,
  signResult: document.getElementById("valueSignResult"),
  publishResult: document.getElementById("valuePublishResult"),
  downloadSignedValueButton: document.getElementById("downloadSignedValueButton") as HTMLButtonElement | null,
  publishValueButton: document.getElementById("publishValueButton") as HTMLButtonElement | null,
  publishValueFanoutButton: document.getElementById("publishValueFanoutButton") as HTMLButtonElement | null,
  publishModeNote: document.getElementById("valuePublishModeNote")
};

const state: {
  currentName: NameRecord | null;
  currentValueRecord: ValueRecord | null;
  currentValueHistory: ValueHistory | null;
  currentValueCompare: ValueCompareSummary | null;
  currentValueCompareError: string | null;
  signedRecord: BrowserSignedValueRecord | null;
  lastSuggestedSequence: number | null;
  resolverCandidates: readonly string[];
  resolverFanoutAvailable: boolean;
} = {
  currentName: null,
  currentValueRecord: null,
  currentValueHistory: null,
  currentValueCompare: null,
  currentValueCompareError: null,
  signedRecord: null,
  lastSuggestedSequence: null,
  resolverCandidates: [],
  resolverFanoutAvailable: false
};

const VALUE_MODE_PROFILE_BUNDLE = "255:bundle";
const VALUE_MODE_RAW = "255:raw";

if (elements.lookupForm && elements.nameInput) {
  void bootstrap();
}

async function bootstrap(): Promise<void> {
  await loadConfig();
  updateResolverFanoutUi();
  syncWizard();
  renderLookupMessage("Enter an owned name to load the current owner and destinations.");
  renderSignMessage("Load an owned name first, then sign the destination update locally.");
  renderPublishMessage(getDefaultPublishMessage());
  updateValueEditorState();

  const initialName = new URL(window.location.href).searchParams.get("name")?.trim().toLowerCase() ?? "";
  if (initialName !== "") {
    if (elements.nameInput) {
      elements.nameInput.value = initialName;
    }
    await loadName(initialName);
  }

  elements.lookupForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const rawName = elements.nameInput?.value?.trim().toLowerCase() ?? "";
    if (rawName === "") {
      renderLookupMessage("Enter an owned name first.");
      return;
    }
    await loadName(rawName);
  });

  elements.signForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    signLocally();
  });

  elements.ownerPrivateKeyInput?.addEventListener("input", () => {
    updateDerivedOwnerState();
    invalidateSignedRecord("Owner key changed. Sign the destination update again before publishing.", { keepSignStepOpen: true });
  });

  elements.sequenceInput?.addEventListener("input", () => {
    invalidateSignedRecord("Name state changed. Sign the destination update again before publishing.", { keepSignStepOpen: true });
  });

  elements.valueTypeInput?.addEventListener("change", () => {
    updateValueEditorState();
    invalidateSignedRecord("Destination format changed. Sign the update again before publishing.", { keepSignStepOpen: true });
  });

  elements.payloadInput?.addEventListener("input", () => {
    invalidateSignedRecord("Destinations changed. Sign the update again before publishing.", { keepSignStepOpen: true });
  });

  elements.bundleRows?.addEventListener("input", (event) => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement &&
      (target.classList.contains("value-bundle-key-input")
        || target.classList.contains("value-bundle-value-input"))
    ) {
      invalidateSignedRecord("Destinations changed. Sign the update again before publishing.", { keepSignStepOpen: true });
    }
  });

  elements.bundleRows?.addEventListener("click", (event) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.classList.contains("value-bundle-remove-button")
    ) {
      const row = target.closest(".value-bundle-row");
      if (row instanceof HTMLElement) {
        row.remove();
        ensureBundleEditorHasRow();
        invalidateSignedRecord("Destinations changed. Sign the update again before publishing.", { keepSignStepOpen: true });
      }
    }
  });

  elements.addBundleEntryButton?.addEventListener("click", () => {
    appendBundleRow({ key: "", value: "" });
    invalidateSignedRecord("Destinations changed. Sign the update again before publishing.", { keepSignStepOpen: true });
  });

  elements.downloadSignedValueButton?.addEventListener("click", () => {
    if (state.signedRecord === null) {
      renderSignMessage("Sign a destination update before downloading it.");
      return;
    }

    downloadJsonFile(
      state.signedRecord,
      `ont-value-${state.signedRecord.name}-sequence-${state.signedRecord.sequence}.json`
    );
  });

  elements.publishValueButton?.addEventListener("click", async () => {
    await publishSignedRecord();
  });

  elements.publishValueFanoutButton?.addEventListener("click", async () => {
    await publishSignedRecord({ fanout: true });
  });
}

async function loadName(rawName: string): Promise<void> {
  const normalizedName = rawName.trim().toLowerCase();
  updateUrl(normalizedName);
  renderLookupMessage("Loading current name state...");

  try {
    const comparePromise = state.resolverFanoutAvailable
      ? fetchJson<ValueCompareSummary>(
          withBasePath(`/api/name/${encodeURIComponent(normalizedName)}/value/compare`)
        ).then((summary) => ({
          summary,
          error: null
        })).catch((error) => ({
          summary: null,
          error: error instanceof Error ? error.message : "Unable to compare configured resolver views."
        }))
      : Promise.resolve({
          summary: null,
          error: null
        });

    const [nameRecord, valueRecord, valueHistory, compare] = await Promise.all([
      fetchJson<NameRecord>(withBasePath(`/api/name/${encodeURIComponent(normalizedName)}`)),
      fetchJson<ValueRecord>(withBasePath(`/api/name/${encodeURIComponent(normalizedName)}/value`)).catch((error) => {
        if (isNotFound(error)) {
          return null;
        }

        throw error;
      }),
      fetchJson<ValueHistory>(withBasePath(`/api/name/${encodeURIComponent(normalizedName)}/value/history`)).catch((error) => {
        if (isNotFound(error)) {
          return null;
        }

        throw error;
      })
      ,
      comparePromise
    ]);

    state.currentName = nameRecord;
    state.currentValueRecord = valueRecord;
    state.currentValueHistory = valueHistory;
    state.currentValueCompare = compare.summary;
    state.currentValueCompareError = compare.error;
    applySuggestedSequence(valueRecord === null ? 1 : valueRecord.sequence + 1);
    applyValueDefaults(valueRecord);
    renderLookupRecord(nameRecord, valueRecord, valueHistory, compare.summary, compare.error);
    updateDerivedOwnerState();
    syncWizard();
  } catch (error) {
    state.currentName = null;
    state.currentValueRecord = null;
    state.currentValueHistory = null;
    state.currentValueCompare = null;
    state.currentValueCompareError = null;
    state.lastSuggestedSequence = null;
    resetValueInputs();
    invalidateSignedRecord("Load an owned name first, then sign the destination update locally.");
    if (isNotFound(error)) {
      // Not a dead end: an unclaimed name is available to claim (one-path model).
      renderClaimable(normalizedName);
    } else {
      renderLookupMessage(error instanceof Error ? error.message : "Unable to load the requested name.");
    }
    syncWizard();
  }
}

/** A claim failure that means the name is actually already owned (not a real error). */
function isAlreadyClaimed(problems: readonly string[]): boolean {
  return problems.some((problem) => /\b(taken|reserved|unavailable|already)\b/i.test(problem));
}

/**
 * An available (not-found) name turns into a claim. A fresh owner key is
 * generated in the browser and the cheap-rail claim runs through the publisher
 * (quote -> stubbed pay -> submit), with the inclusion proof verified locally.
 */
function renderClaimable(name: string): void {
  if (!elements.lookupResult) {
    return;
  }
  elements.lookupResult.classList.remove("empty");
  elements.lookupResult.innerHTML = `
    <div class="claim-available">
      <p class="claim-available-kicker">Available</p>
      <h3><span class="mono">${name}</span> isn't claimed yet</h3>
      <p>You can claim it for a flat <strong>₿1,200</strong> (₿1,000 gate + ₿200 service, ~$1). A fresh
        owner key is generated in your browser &mdash; only you hold it. On this signet the Lightning
        payment is stubbed, so the claim completes end to end.</p>
      <button type="button" id="valueClaimButton">Claim ${name}</button>
      <div id="valueClaimResult" class="claim-available-result" hidden></div>
    </div>`;
  const button = document.getElementById("valueClaimButton") as HTMLButtonElement | null;
  const output = document.getElementById("valueClaimResult");
  button?.addEventListener("click", async () => {
    if (!button || !output) {
      return;
    }
    button.disabled = true;
    button.textContent = "Claiming...";
    output.hidden = false;
    output.textContent = "Generating an owner key and requesting a quote...";
    try {
      const key = generateBrowserOwnerKey();
      const result = await claimAvailableName({ basePath: BASE_PATH, name, ownerPubkey: key.ownerPubkey });
      if (result.ok) {
        output.innerHTML = `
          <p class="claim-ok">&#10003; <strong>${name}</strong> claimed (provisional) &mdash; the inclusion proof verified in your browser.</p>
          <div class="claim-key-box">
            <p><strong>Save your owner private key.</strong> It is the only thing that controls this name, and it is stored nowhere:</p>
            <code class="mono claim-key">${key.privateKeyHex}</code>
          </div>
          ${result.anchorTxid ? `<p class="claim-meta">Anchor txid <span class="mono">${result.anchorTxid}</span></p>` : ""}
          <p class="claim-meta">It finalizes if uncontested through the notice window. Load <span class="mono">${name}</span> again above to set its destinations.</p>`;
      } else if (isAlreadyClaimed(result.problems) && elements.lookupResult) {
        // Reconcile a transient disagreement: the explorer (resolver) said "not found"
        // so we offered to claim, but the publisher reports the name already taken — a
        // just-made claim still propagating (anchor -> mine -> resolve). Replace the
        // whole "Available" card rather than leaving that header above a "taken" error.
        elements.lookupResult.innerHTML = `
          <div class="claim-available">
            <p class="claim-available-kicker">Already claimed</p>
            <h3><span class="mono">${name}</span> is taken</h3>
            <p>The publisher reports this name as claimed; the explorer just hasn't caught up yet
              (a fresh claim takes a moment to anchor and resolve). It isn't available &mdash; reload
              <span class="mono">${name}</span> in a few seconds to see its current owner.</p>
          </div>`;
      } else {
        output.innerHTML = `<p class="claim-err">Claim did not complete: ${result.problems.join("; ") || result.status}</p>`;
        button.disabled = false;
        button.textContent = `Claim ${name}`;
      }
    } catch (error) {
      output.innerHTML = `<p class="claim-err">${error instanceof Error ? error.message : "Claim failed."}</p>`;
      button.disabled = false;
      button.textContent = `Claim ${name}`;
    }
  });
}

function signLocally(): void {
  if (state.currentName === null) {
    renderSignMessage("Load an owned name first.");
    return;
  }

  if (state.currentName.status === "invalid") {
    renderSignMessage("Released names cannot publish new destinations.");
    return;
  }

  try {
    const name = requireInput(elements.nameInput, "Enter an owned name first.").trim().toLowerCase();
    const ownerPrivateKeyHex = requireInput(
      elements.ownerPrivateKeyInput,
      "Paste the owner private key saved for this name."
    );
    const derivedOwnerPubkey = deriveOwnerPubkey(ownerPrivateKeyHex);

    if (derivedOwnerPubkey !== state.currentName.currentOwnerPubkey) {
      throw new Error("This private key does not match the resolver's current owner pubkey.");
    }

    const sequence = parseNonNegativeInteger(
      requireInput(elements.sequenceInput, "Enter the next sequence."),
      "sequence"
    );
    const { valueType, mode } = parseSelectedValueFormat(elements.valueTypeInput?.value ?? "");
    const payloadHex = resolvePayloadHex(mode, valueType, elements.payloadInput?.value ?? "");

    const signedRecord = signBrowserValueRecord({
      name,
      ownerPrivateKeyHex,
      ownershipRef: state.currentName.lastStateTxid,
      sequence,
      previousRecordHash: state.currentValueRecord?.recordHash ?? null,
      valueType,
      payloadHex
    });

    if (!verifyBrowserValueRecord(signedRecord)) {
      throw new Error("Local destination update verification failed.");
    }

    state.signedRecord = signedRecord;
    renderSignedRecord(signedRecord);
    renderPublishMessage("Signed update ready. Publish it to update the resolver's current destinations.");
    syncWizard();
  } catch (error) {
    state.signedRecord = null;
    renderSignMessage(error instanceof Error ? error.message : "Unable to sign the destination update.");
    renderPublishMessage("Fix the destination update first, then publish.");
    syncWizard();
  }
}

async function publishSignedRecord(options: {
  readonly fanout?: boolean;
} = {}): Promise<void> {
  if (state.signedRecord === null) {
    renderPublishMessage("Sign a destination update before publishing it.");
    return;
  }

  renderPublishMessage(
    options.fanout
      ? "Publishing the signed destination update to the configured resolver set..."
      : "Publishing the signed destination update..."
  );

  try {
    const result = await postJson(
      withBasePath(options.fanout ? "/api/values/fanout" : "/api/values"),
      state.signedRecord
    );
    renderPublishResult(result);
    await loadName(state.signedRecord.name);
  } catch (error) {
    renderPublishMessage(error instanceof Error ? error.message : "Unable to publish the signed destination update.");
  }
}

function invalidateSignedRecord(
  message: string,
  options: { keepSignStepOpen?: boolean } = {}
): void {
  state.signedRecord = null;
  if (elements.downloadSignedValueButton) {
    elements.downloadSignedValueButton.disabled = true;
  }
  if (elements.publishValueButton) {
    elements.publishValueButton.disabled = true;
  }
  if (elements.publishValueFanoutButton) {
    elements.publishValueFanoutButton.disabled = true;
  }
  renderSignMessage(message);
  renderPublishMessage(getDefaultPublishMessage());
  updateResolverFanoutUi();
  syncWizard();
  if (options.keepSignStepOpen && state.currentName !== null) {
    setDetailsOpen(elements.signStep, true);
  }
}

function renderLookupMessage(message: string): void {
  if (!elements.lookupResult) {
    return;
  }

  elements.lookupResult.classList.add("empty");
  elements.lookupResult.textContent = message;
}

function renderSignMessage(message: string): void {
  if (!elements.signResult) {
    return;
  }

  elements.signResult.classList.add("empty");
  elements.signResult.textContent = message;
}

function renderPublishMessage(message: string): void {
  if (!elements.publishResult) {
    return;
  }

  elements.publishResult.classList.add("empty");
  elements.publishResult.textContent = message;
}

function renderLookupRecord(
  nameRecord: NameRecord,
  valueRecord: ValueRecord | null,
  valueHistory: ValueHistory | null,
  valueCompare: ValueCompareSummary | null,
  valueCompareError: string | null
): void {
  if (!elements.lookupResult) {
    return;
  }

  elements.lookupResult.classList.remove("empty");
  const currentDestinations = valueRecord === null
    ? '<p class="field-value">No destinations published yet.</p>'
    : renderPayloadPreview(valueRecord.valueType, valueRecord.payloadHex);
  const latestUpdate = valueRecord === null
    ? "First destination update"
    : `Update ${valueRecord.sequence} · ${new Date(valueRecord.issuedAt).toLocaleString()}`;
  const technicalDetails = [
    `<div class="result-item"><label>Next Sequence</label><p class="field-value">${escapeHtml(String(state.lastSuggestedSequence ?? 1))}</p></div>`,
    `<div class="result-item"><label>Ownership Ref</label><p class="field-value">${escapeHtml(truncateMiddle(nameRecord.lastStateTxid, 12, 10))}</p></div>`,
    `<div class="result-item"><label>Bond Requirement</label><p class="field-value">${escapeHtml(formatSats(nameRecord.requiredBondSats))}</p></div>`,
    renderValueHistory(valueHistory),
    renderResolverCompare(valueCompare, valueCompareError)
  ].filter((entry) => entry.trim() !== "").join("");

  elements.lookupResult.innerHTML = `
    <div class="result-title">
      <h3>${escapeHtml(nameRecord.name)}</h3>
      <span class="status-pill ${escapeHtml(nameRecord.status)}">${escapeHtml(formatStateLabel(nameRecord.status))}</span>
    </div>
    <p class="result-meta">${escapeHtml(formatStateLabel(nameRecord.status))} · current owner ${truncateMiddle(nameRecord.currentOwnerPubkey, 12, 10)}</p>
    <div class="result-grid">
      <div class="result-item">
        <label>Current Owner</label>
        <p class="field-value">${escapeHtml(nameRecord.currentOwnerPubkey)}</p>
      </div>
      <div class="result-item result-item-wide">
        <label>Current Destinations</label>
        ${currentDestinations}
      </div>
      <div class="result-item">
        <label>Next Update</label>
        <p class="field-value">${escapeHtml(latestUpdate)}</p>
      </div>
    </div>
    <details class="detail-technical value-technical-details">
      <summary>Show technical details</summary>
      <div class="detail-technical-body result-grid">${technicalDetails}</div>
    </details>
  `;
}

function renderValueHistory(valueHistory: ValueHistory | null): string {
  if (valueHistory === null) {
    return `
      <div class="field-note">
        No destination history exists for this ownership interval yet.
      </div>
    `;
  }

  const rows = valueHistory.records
    .slice(-5)
    .map((record) => {
      return `
        <div class="value-history-row">
          <span>seq ${escapeHtml(String(record.sequence))}</span>
          <span>${escapeHtml(formatValueType(record.valueType, record.payloadHex))}</span>
          <span>${escapeHtml(truncateMiddle(record.recordHash, 12, 10))}</span>
        </div>
      `;
    })
    .join("");

  return `
    <div class="value-history-card">
      <div class="value-history-head">
        <p class="step-list-label">Recent Destination Updates</p>
        <p class="field-value">Complete sequences ${escapeHtml(String(valueHistory.completeFromSequence))}-${escapeHtml(String(valueHistory.completeToSequence))}${valueHistory.hasGaps ? " · gaps detected" : ""}${valueHistory.hasForks ? " · forks detected" : ""}</p>
      </div>
      <div class="value-history-rows">${rows}</div>
    </div>
  `;
}

function renderResolverCompare(
  valueCompare: ValueCompareSummary | null,
  valueCompareError: string | null
): string {
  if (!state.resolverFanoutAvailable) {
    return "";
  }

  if (valueCompareError !== null) {
    return `<div class="field-note">Resolver comparison unavailable: ${escapeHtml(valueCompareError)}</div>`;
  }

  if (valueCompare === null) {
    return `<div class="field-note">Resolver comparison is not available for this name yet.</div>`;
  }

  const statusLabel =
    valueCompare.status === "consistent"
      ? "Consistent"
      : valueCompare.status === "lagging"
        ? "Lagging"
        : valueCompare.status === "conflict"
          ? "Conflict"
          : "No visible value";

  const rows = [
    valueCompare.canonicalResolverUrl === null
      ? null
      : `<p><strong>Canonical resolver:</strong> ${escapeHtml(valueCompare.canonicalResolverUrl)}</p>`,
    valueCompare.currentSequence === null
      ? `<p><strong>Current update:</strong> no resolver currently shows published destinations.</p>`
      : `<p><strong>Current update:</strong> ${escapeHtml(String(valueCompare.currentSequence))}</p>`,
    valueCompare.laggingResolverUrls.length === 0
      ? null
      : `<p><strong>Lagging:</strong> ${escapeHtml(valueCompare.laggingResolverUrls.join(", "))}</p>`,
    valueCompare.missingResolverUrls.length === 0
      ? null
      : `<p><strong>Missing:</strong> ${escapeHtml(valueCompare.missingResolverUrls.join(", "))}</p>`,
    valueCompare.conflictingResolverUrls.length === 0
      ? null
      : `<p><strong>Conflicting:</strong> ${escapeHtml(valueCompare.conflictingResolverUrls.join(", "))}</p>`,
    valueCompare.failedResolverUrls.length === 0
      ? null
      : `<p><strong>Failed:</strong> ${escapeHtml(valueCompare.failedResolverUrls.join(", "))}</p>`
  ].filter((row): row is string => row !== null);

  return `
    <div class="resolver-compare-card">
      <div class="value-history-head">
        <p class="step-list-label">Resolver Comparison</p>
        <p class="field-value">${escapeHtml(statusLabel)} · ${escapeHtml(String(valueCompare.resolverCount))} configured resolvers</p>
      </div>
      <div class="resolver-compare-list">${rows.join("")}</div>
    </div>
  `;
}

function renderSignedRecord(record: BrowserSignedValueRecord): void {
  if (!elements.signResult) {
    return;
  }

  if (elements.downloadSignedValueButton) {
    elements.downloadSignedValueButton.disabled = false;
  }
  if (elements.publishValueButton) {
    elements.publishValueButton.disabled = false;
  }
  if (elements.publishValueFanoutButton) {
    elements.publishValueFanoutButton.disabled = !state.resolverFanoutAvailable;
  }
  updateResolverFanoutUi();

  elements.signResult.classList.remove("empty");
  elements.signResult.innerHTML = `
    <div class="result-title">
      <h3>Signed Update Ready</h3>
      <span class="status-pill mature">Local only</span>
    </div>
    <p class="result-meta">Signed locally in this browser. Only the signed JSON update will be uploaded if you publish.</p>
    <div class="result-grid">
      <div class="result-item">
        <label>Owner</label>
        <p class="field-value">${escapeHtml(record.ownerPubkey)}</p>
      </div>
      <div class="result-item result-item-wide">
        <label>Destinations</label>
        ${renderPayloadPreview(record.valueType, record.payloadHex)}
      </div>
    </div>
    <details class="detail-technical value-technical-details">
      <summary>Show signed JSON</summary>
      <div class="detail-technical-body">
        <div class="result-grid">
          <div class="result-item">
            <label>Sequence</label>
            <p class="field-value">${escapeHtml(String(record.sequence))}</p>
          </div>
          <div class="result-item">
            <label>Previous Record</label>
            <p class="field-value">${escapeHtml(record.previousRecordHash === null ? "None (first in ownership interval)" : truncateMiddle(record.previousRecordHash, 12, 10))}</p>
          </div>
          <div class="result-item">
            <label>Value Type</label>
            <p class="field-value">${escapeHtml(formatValueType(record.valueType, record.payloadHex))}</p>
          </div>
        </div>
        <pre class="value-json-preview">${escapeHtml(JSON.stringify(record, null, 2))}</pre>
      </div>
    </details>
  `;
}

function renderPublishResult(result: unknown): void {
  if (!elements.publishResult) {
    return;
  }

  const record = isRecord(result) ? result : {};
  if (record.kind === "ont-multi-resolver-value-publish") {
    const summary = record as unknown as ValuePublishFanoutSummary;
    const payloadHex = state.signedRecord?.payloadHex ?? "";
    const valueType = state.signedRecord?.valueType ?? 0;
    const failures = summary.results
      .filter((entry) => !entry.ok)
      .map((entry) => `<p><strong>${escapeHtml(entry.resolverUrl)}</strong>: ${escapeHtml(entry.message ?? "publish failed")}</p>`)
      .join("");

    elements.publishResult.classList.remove("empty");
    elements.publishResult.innerHTML = `
      <div class="result-title">
        <h3>Destinations Published To Resolver Set</h3>
        <span class="status-pill mature">${escapeHtml(String(summary.successCount))}/${escapeHtml(String(summary.resolverCount))} accepted</span>
      </div>
      <p class="result-meta">${escapeHtml(summary.name)} · sequence ${escapeHtml(String(summary.sequence))} · ${escapeHtml(formatValueType(valueType, payloadHex))}</p>
      <p class="field-value">The same signed destination update was sent to ${escapeHtml(String(summary.resolverCount))} configured resolvers. ${escapeHtml(String(summary.successCount))} accepted it; ${escapeHtml(String(summary.failureCount))} did not accept or did not respond.</p>
      ${failures === "" ? "" : `<div class="resolver-compare-list">${failures}</div>`}
    `;
    return;
  }

  const name = typeof record.name === "string" ? record.name : state.signedRecord?.name ?? "unknown";
  const sequence = typeof record.sequence === "number" ? record.sequence : state.signedRecord?.sequence ?? 0;
  const valueType = typeof record.valueType === "number" ? record.valueType : state.signedRecord?.valueType ?? 0;
  const recordHash = typeof record.recordHash === "string" ? record.recordHash : "";
  const payloadHex = state.signedRecord?.payloadHex ?? "";

  elements.publishResult.classList.remove("empty");
  elements.publishResult.innerHTML = `
    <div class="result-title">
      <h3>Destinations Published</h3>
      <span class="status-pill mature">Resolver updated</span>
    </div>
    <p class="result-meta">${escapeHtml(name)} · sequence ${escapeHtml(String(sequence))} · ${escapeHtml(formatValueType(valueType, payloadHex))}</p>
    <p class="field-value">The resolver accepted the signed destination update${recordHash === "" ? "." : ` at ${escapeHtml(truncateMiddle(recordHash, 12, 10))}.`}</p>
  `;
}

async function loadConfig(): Promise<void> {
  try {
    const config = await fetchJson<WebConfig>(withBasePath("/api/config"));
    state.resolverCandidates = Array.isArray(config.resolverCandidates)
      ? config.resolverCandidates.filter((entry): entry is string => typeof entry === "string")
      : [];
    state.resolverFanoutAvailable =
      config.resolverFanoutAvailable === true && state.resolverCandidates.length > 1;
  } catch {
    state.resolverCandidates = [];
    state.resolverFanoutAvailable = false;
  }
}

function updateResolverFanoutUi(): void {
  if (elements.publishValueFanoutButton) {
    elements.publishValueFanoutButton.hidden = !state.resolverFanoutAvailable;
    elements.publishValueFanoutButton.disabled = state.signedRecord === null;
  }

  if (elements.publishModeNote) {
    elements.publishModeNote.textContent = state.resolverFanoutAvailable
      ? `The primary publish button updates the hosted resolver. The secondary button sends the same signed JSON to ${state.resolverCandidates.length} configured resolvers. The owner private key never leaves the page.`
      : "Publishing sends only the signed JSON update. The owner private key never leaves the page.";
  }
}

function getDefaultPublishMessage(): string {
  return state.resolverFanoutAvailable
    ? "Sign the destination update first. Then publish the signed JSON to the hosted resolver or configured resolver set."
    : "Sign the destination update first. Then publish the signed JSON to the resolver.";
}

function updateDerivedOwnerState(): void {
  if (!elements.ownerPubkeyPreview) {
    return;
  }

  const privateKey = elements.ownerPrivateKeyInput?.value?.trim() ?? "";
  if (privateKey === "") {
    elements.ownerPubkeyPreview.value = "";
    if (elements.ownerMatchNote) {
      elements.ownerMatchNote.textContent = "Paste the owner private key to derive the current owner pubkey locally.";
    }
    return;
  }

  try {
    const derived = deriveOwnerPubkey(privateKey);
    elements.ownerPubkeyPreview.value = derived;
    if (elements.ownerMatchNote) {
      elements.ownerMatchNote.textContent =
        state.currentName === null
          ? "Owner pubkey derived locally. Load the owned name to compare it against the resolver's current owner."
          : derived === state.currentName.currentOwnerPubkey
            ? "Derived owner matches the resolver's current owner."
            : "Derived owner does not match the resolver's current owner.";
    }
  } catch (error) {
    elements.ownerPubkeyPreview.value = "";
    if (elements.ownerMatchNote) {
      elements.ownerMatchNote.textContent =
        error instanceof Error ? error.message : "Unable to derive the owner pubkey from this private key.";
    }
  }
}

function updateValueEditorState(): void {
  if (!elements.payloadInput || !elements.payloadHint) {
    return;
  }

  const { valueType, mode } = parseSelectedValueFormat(elements.valueTypeInput?.value ?? VALUE_MODE_PROFILE_BUNDLE);

  if (elements.payloadField instanceof HTMLElement) {
    elements.payloadField.hidden = mode === "bundle";
  }
  if (elements.bundleEditor instanceof HTMLElement) {
    elements.bundleEditor.hidden = mode !== "bundle";
  }

  if (mode === "bundle") {
    elements.payloadHint.textContent =
      "List as many ordered destination entries as you want here. Keys are app-defined and repeatable.";
    return;
  }

  if (mode === "raw") {
    elements.payloadInput.placeholder = "68747470733a2f2f6578616d706c652e636f6d";
    elements.payloadHint.textContent = "Raw/app-defined values expect hex. Use even-length hex without a 0x prefix.";
    return;
  }

  if (valueType === 1) {
    elements.payloadInput.placeholder = "bitcoin:tb1q...";
    elements.payloadHint.textContent = "Bitcoin payment targets are encoded as UTF-8 text before signing.";
    return;
  }

  elements.payloadInput.placeholder = "https://example.com";
  elements.payloadHint.textContent = "HTTPS targets are encoded as UTF-8 text before signing.";
}

function applyValueDefaults(valueRecord: ValueRecord | null): void {
  if (valueRecord === null) {
    resetValueInputs();
    return;
  }

  if (valueRecord.valueType === 255) {
    const bundle = decodeProfileBundlePayloadHex(valueRecord.payloadHex);
    if (bundle !== null) {
      if (elements.valueTypeInput) {
        elements.valueTypeInput.value = VALUE_MODE_PROFILE_BUNDLE;
      }
      writeBundleDraft(profileBundleDraftFromPayload(bundle));
      if (elements.payloadInput) {
        elements.payloadInput.value = "";
      }
      updateValueEditorState();
      return;
    }

    if (elements.valueTypeInput) {
      elements.valueTypeInput.value = VALUE_MODE_PROFILE_BUNDLE;
    }
    if (elements.payloadInput) {
      elements.payloadInput.value = "";
    }
    writeBundleDraft(emptyProfileBundleDraft());
    updateValueEditorState();
    return;
  }

  if (elements.valueTypeInput) {
    elements.valueTypeInput.value = VALUE_MODE_PROFILE_BUNDLE;
  }
  if (elements.payloadInput) {
    elements.payloadInput.value = "";
  }
  writeBundleDraft(profileBundleDraftFromSingleValue(valueRecord));
  updateValueEditorState();
}

function resetValueInputs(): void {
  if (elements.valueTypeInput) {
    elements.valueTypeInput.value = VALUE_MODE_PROFILE_BUNDLE;
  }
  if (elements.payloadInput) {
    elements.payloadInput.value = "";
  }
  writeBundleDraft(emptyProfileBundleDraft());
  updateValueEditorState();
}

function writeBundleDraft(draft: ProfileBundleDraft): void {
  if (!(elements.bundleRows instanceof HTMLElement)) {
    return;
  }

  const entries = draft.entries.length === 0 ? emptyProfileBundleDraft().entries : draft.entries;
  elements.bundleRows.innerHTML = entries
    .map((entry, index) => renderBundleRow(entry, index))
    .join("");
}

function readBundleDraft(): ProfileBundleDraft {
  if (!(elements.bundleRows instanceof HTMLElement)) {
    return emptyProfileBundleDraft();
  }

  const rows = Array.from(elements.bundleRows.querySelectorAll(".value-bundle-row"));
  return {
    entries: rows.map((row) => {
      const keyInput = row.querySelector(".value-bundle-key-input");
      const valueInput = row.querySelector(".value-bundle-value-input");

      return {
        key: keyInput instanceof HTMLInputElement ? keyInput.value : "",
        value: valueInput instanceof HTMLInputElement ? valueInput.value : ""
      };
    })
  };
}

function appendBundleRow(entry: ProfileBundleEntry): void {
  if (!(elements.bundleRows instanceof HTMLElement)) {
    return;
  }

  const index = elements.bundleRows.querySelectorAll(".value-bundle-row").length;
  elements.bundleRows.insertAdjacentHTML("beforeend", renderBundleRow(entry, index));
}

function ensureBundleEditorHasRow(): void {
  if (!(elements.bundleRows instanceof HTMLElement)) {
    return;
  }

  if (elements.bundleRows.querySelector(".value-bundle-row") === null) {
    writeBundleDraft(emptyProfileBundleDraft());
  }
}

function renderBundleRow(entry: ProfileBundleEntry, index: number): string {
  return `
    <div class="value-bundle-row" data-index="${index}">
      <label class="draft-field">
        <span class="field-label">Destination Type</span>
        <input
          class="value-bundle-key-input"
          type="text"
          placeholder="btc, lightning, email, website"
          autocomplete="off"
          spellcheck="false"
          value="${escapeHtmlAttribute(entry.key)}"
        />
      </label>
      <label class="draft-field">
        <span class="field-label">Destination</span>
        <input
          class="value-bundle-value-input"
          type="text"
          placeholder="bc1q..., lno1q..., alice@example.com"
          autocomplete="off"
          spellcheck="false"
          value="${escapeHtmlAttribute(entry.value)}"
        />
      </label>
      <div class="value-bundle-row-actions">
        <button type="button" class="secondary-button value-bundle-remove-button">Remove</button>
      </div>
    </div>
  `;
}

function profileBundleDraftFromSingleValue(valueRecord: ValueRecord): ProfileBundleDraft {
  const value = decodeHexUtf8(valueRecord.payloadHex) ?? valueRecord.payloadHex;
  const key = valueRecord.valueType === 1
    ? "btc"
    : valueRecord.valueType === 2
      ? "website"
      : "custom";

  return {
    entries: [{ key, value }]
  };
}

function applySuggestedSequence(nextSequence: number): void {
  const currentValue = elements.sequenceInput?.value?.trim() ?? "";
  const currentSequence =
    currentValue === "" ? null : Number.parseInt(currentValue, 10);
  const shouldReplace =
    currentValue === ""
    || state.lastSuggestedSequence === null
    || currentSequence === state.lastSuggestedSequence;

  state.lastSuggestedSequence = nextSequence;

  if (shouldReplace && elements.sequenceInput) {
    elements.sequenceInput.value = String(nextSequence);
  }

  if (elements.sequenceHint) {
    elements.sequenceHint.textContent = `Resolver-visible next sequence: ${nextSequence}.`;
  }
}

function syncWizard(): void {
  const hasLookup = state.currentName !== null;
  const hasSignedRecord = state.signedRecord !== null;

  setStepChip(elements.lookupStepState, hasLookup ? "Loaded" : "Start here", hasLookup ? "complete" : "current");
  setStepChip(
    elements.signStepState,
    hasSignedRecord ? "Signed" : hasLookup ? "Sign next" : "After step 1",
    hasSignedRecord ? "complete" : hasLookup ? "ready" : "waiting"
  );
  setStepChip(
    elements.publishStepState,
    hasSignedRecord ? "Publish now" : "After step 2",
    hasSignedRecord ? "ready" : "waiting"
  );

  setDetailsOpen(elements.lookupStep, !hasLookup);
  setDetailsOpen(elements.signStep, hasLookup && !hasSignedRecord);
  setDetailsOpen(elements.publishStep, hasSignedRecord);
}

function setStepChip(node: HTMLElement | null, text: string, tone: "waiting" | "current" | "ready" | "complete"): void {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  node.textContent = text;
  node.classList.remove("is-waiting", "is-current", "is-ready", "is-complete");
  node.classList.add(`is-${tone}`);
}

function setDetailsOpen(node: HTMLElement | null, open: boolean): void {
  if (node instanceof HTMLDetailsElement) {
    node.open = open;
  }
}

function requireInput(node: HTMLInputElement | HTMLTextAreaElement | null, message: string): string {
  const value = node?.value?.trim() ?? "";
  if (value === "") {
    throw new Error(message);
  }

  return value;
}

function parseSelectedValueFormat(value: string): { valueType: number; mode: "utf8" | "bundle" | "raw" } {
  if (value === VALUE_MODE_PROFILE_BUNDLE) {
    return { valueType: 255, mode: "bundle" };
  }

  if (value === VALUE_MODE_RAW) {
    return { valueType: 255, mode: "raw" };
  }

  return {
    valueType: parseByte(value, "valueType"),
    mode: "utf8"
  };
}

function resolvePayloadHex(mode: "utf8" | "bundle" | "raw", valueType: number, payloadValue: string): string {
  if (mode === "bundle") {
    return encodeProfileBundlePayloadHex(readBundleDraft());
  }

  const trimmed = payloadValue.trim();

  if (mode === "raw" || valueType === 255) {
    if (trimmed === "") {
      throw new Error("Enter a raw hex payload.");
    }

    return normalizeRawPayloadHex(trimmed);
  }

  if (trimmed === "") {
    throw new Error("Enter a payload value.");
  }

  return payloadUtf8ToHex(trimmed);
}

function parseNonNegativeInteger(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }

  return parsed;
}

function parseByte(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xff) {
    throw new Error(`${label} must fit in one byte`);
  }

  return parsed;
}

async function fetchJson<T>(path: string): Promise<T> {
  return requestJson<T>(path);
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload = await response.json();

  if (!response.ok) {
    const error = new Error(
      typeof payload?.message === "string" ? payload.message : typeof payload?.error === "string" ? payload.error : "Request failed"
    ) as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = typeof payload?.error === "string" ? payload.error : "request_failed";
    throw error;
  }

  return payload as T;
}

function withBasePath(path: string): string {
  if (BASE_PATH === "") {
    return path;
  }

  if (path === "/") {
    return BASE_PATH;
  }

  return `${BASE_PATH}${path}`;
}

function updateUrl(name: string): void {
  const target = withBasePath(`/values?name=${encodeURIComponent(name)}`);
  if (window.location.pathname + window.location.search !== target) {
    window.history.replaceState({ name }, "", target);
  }
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof Error
    && "status" in error
    && (error as Error & { status?: number }).status === 404
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeCurrentValue(valueRecord: ValueRecord | null): string {
  if (valueRecord === null) {
    return "No published value yet";
  }

  return `${formatValueType(valueRecord.valueType, valueRecord.payloadHex)} · sequence ${valueRecord.sequence}`;
}

function renderPayloadPreview(valueType: number, payloadHex: string): string {
  const bundle = Number(valueType) === 255 ? decodeProfileBundlePayloadHex(payloadHex) : null;
  if (bundle !== null) {
    const rows = listProfileBundleEntries(bundle)
      .map((entry) => {
        return `
          <div class="value-bundle-preview-row">
            <label>${escapeHtml(entry.key)}</label>
            <p class="field-value">${renderBundleValue(entry.value)}</p>
          </div>
        `;
      })
      .join("");

    return `<div class="value-bundle-preview">${rows}</div>`;
  }

  const preview = previewPayloadText(valueType, payloadHex);
  return `<p class="field-value">${escapeHtml(preview)}</p>`;
}

function previewPayloadText(valueType: number, payloadHex: string): string {
  if (Number(valueType) === 255) {
    return payloadHex;
  }

  return decodeValuePayloadUtf8(payloadHex) ?? payloadHex;
}

function decodeValuePayloadUtf8(payloadHex: string): string | null {
  try {
    const normalized = payloadHex.trim().toLowerCase();
    if (normalized.length % 2 !== 0 || /[^0-9a-f]/.test(normalized)) {
      return null;
    }

    const bytes = new Uint8Array(normalized.length / 2);
    for (let index = 0; index < normalized.length; index += 2) {
      bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
    }

    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return /^[\x09\x0a\x0d\x20-\x7e]*$/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function formatStateLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Awaiting Reveal";
    case "immature":
      return "Settling";
    case "mature":
      return "Active";
    case "invalid":
      return "Released";
    default:
      return status;
  }
}

function formatValueType(valueType: number, payloadHex = ""): string {
  switch (Number(valueType)) {
    case 1:
      return "0x01 (bitcoin payment target)";
    case 2:
      return "0x02 (https target)";
    case 255:
      return decodeProfileBundlePayloadHex(payloadHex) !== null
        ? "0xff (destination entries)"
        : "0xff (raw/app-defined)";
    default:
      return `0x${Number(valueType).toString(16).padStart(2, "0")}`;
  }
}

function renderBundleValue(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed) || /^bitcoin:/i.test(trimmed)) {
    return `<a class="detail-link" href="${escapeHtml(trimmed)}" target="_blank" rel="noreferrer noopener">${escapeHtml(trimmed)}</a>`;
  }

  return escapeHtml(trimmed);
}

function formatSats(value: string | number | bigint): string {
  const sats = BigInt(value);
  return `₿${formatBtcDecimal(sats)}`;
}

function formatBtcDecimal(sats: bigint): string {
  const whole = sats / 100_000_000n;
  const fractional = (sats % 100_000_000n).toString().padStart(8, "0").replace(/0+$/g, "");
  return fractional === "" ? whole.toString() : `${whole}.${fractional}`;
}

function truncateMiddle(value: string, head = 14, tail = 10): string {
  const text = String(value);
  if (text.length <= head + tail + 1) {
    return text;
  }

  return `${text.slice(0, head)}…${text.slice(-tail)}`;
}

function downloadJsonFile(payload: unknown, filename: string): void {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: "application/json; charset=utf-8"
  });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

function escapeHtml(value: string): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value);
}
