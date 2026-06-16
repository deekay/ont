import type { TransferPackage } from "@ont/protocol";

export type TransferInspectionRole = "buyer" | "seller" | null;

export function parseTransferInspectionRole(value: string | undefined): TransferInspectionRole {
  if (value === undefined) {
    return null;
  }

  if (value === "buyer" || value === "seller") {
    return value;
  }

  throw new Error("role must be buyer or seller");
}

export function renderTransferPackageInspectionReport(input: {
  readonly filePath: string;
  readonly pkg: TransferPackage;
  readonly role: TransferInspectionRole;
  readonly productName: string;
}): string {
  const { filePath, pkg, role, productName } = input;
  const recommendedMode = pkg.modes.find((mode) => mode.key === pkg.recommendedMode) ?? null;
  const lines = [
    `${productName} transfer package is valid.`,
    `File: ${filePath}`,
    `Exported: ${pkg.exportedAt}`,
    "",
    `Name: ${pkg.name}`,
    `Current status: ${pkg.currentStatus}`,
    `Current owner pubkey: ${pkg.currentOwnerPubkey}`,
    `New owner pubkey: ${pkg.newOwnerPubkey}`,
    `Last state txid: ${pkg.lastStateTxid}`,
    `Current bond outpoint: ${pkg.currentBondTxid}:${pkg.currentBondVout}`,
    `Current bond amount: ${formatSats(pkg.currentBondValueSats)}`,
    `Required bond: ${formatSats(pkg.requiredBondSats)}`,
    `Recommended mode: ${pkg.recommendedMode}`,
    `Seller payout address: ${pkg.sellerPayoutAddress ?? "(set before signing)"}`,
    `Successor bond address: ${pkg.successorBondAddress ?? "(set before signing)"}`
  ];

  if (recommendedMode) {
    lines.push("", `${recommendedMode.title}: ${recommendedMode.suitability}`, recommendedMode.summary, recommendedMode.command);
  }

  if (role === "seller") {
    lines.push("", "Seller review", "-------------");
    lines.push("- Confirm the new owner pubkey came from the intended buyer.");
    lines.push("- Confirm the recommended mode matches the deal you intend to settle.");
    if (pkg.recommendedMode !== "gift") {
      lines.push(
        "- Do not authorize the transfer against a separate promise to pay later.",
        "- Seller payment and name transfer should settle in the same exact Bitcoin transaction."
      );
      lines.push(
        pkg.sellerPayoutAddress
          ? `- Confirm the seller payout address is correct: ${pkg.sellerPayoutAddress}`
          : "- Set and verify the seller payout address before any signatures happen."
      );
    }
    if (pkg.currentStatus === "immature") {
      lines.push(
        pkg.successorBondAddress
          ? `- Confirm the successor bond address is correct: ${pkg.successorBondAddress}`
          : "- Set and verify the successor bond address before signing, because bond continuity still matters."
      );
    }
    lines.push("- Use the recommended CLI command only after those exact fields are confirmed.");
  } else if (role === "buyer") {
    lines.push("", "Buyer review", "------------");
    lines.push("- Confirm the new owner pubkey is your pubkey before you fund or sign anything.");
    lines.push("- Confirm the recommended mode matches what you believe you are buying or receiving.");
    if (pkg.recommendedMode !== "gift") {
      lines.push(
        "- Do not fund a separate payment step against a promise to transfer later.",
        "- The Bitcoin transaction you fund should be the same transaction that moves the name to your pubkey."
      );
      lines.push(
        pkg.sellerPayoutAddress
          ? `- Confirm the seller payout address matches the agreed destination: ${pkg.sellerPayoutAddress}`
          : "- Ask the seller to finalize and share the expected seller payout address before signing."
      );
    }
    if (pkg.currentStatus === "immature") {
      lines.push(
        pkg.successorBondAddress
          ? `- Confirm the successor bond address is present for the live bond path: ${pkg.successorBondAddress}`
          : "- Ask the seller to finalize the successor bond address before signing, because bond continuity still matters."
      );
    }
    lines.push("- Use the recommended CLI command only after those exact fields match your expectations.");
  } else {
    lines.push(
      "",
      "Tip",
      "---",
      "Re-run this command with --role buyer or --role seller to get a focused review checklist for that side."
    );
  }

  if (pkg.modes.length > 1) {
    lines.push("", "Available modes", "---------------");
    for (const mode of pkg.modes) {
      lines.push(`${mode.title}: ${mode.suitability}`, mode.summary, mode.command, "");
    }
    while (lines[lines.length - 1] === "") {
      lines.pop();
    }
  }

  return lines.join("\n");
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
