import { describe, expect, it } from "vitest";

import type { TransferPackage } from "@ont/protocol";

import { parseTransferInspectionRole, renderTransferPackageInspectionReport } from "./transfer-package-review.js";

function createTransferPackageFixture(overrides: Partial<TransferPackage> = {}): TransferPackage {
  return {
    format: "ont-transfer-package",
    packageVersion: 1,
    protocol: "ONT",
    exportedAt: "2026-04-24T18:20:00.000Z",
    name: "alice",
    currentStatus: "mature",
    currentOwnerPubkey: "11".repeat(32),
    newOwnerPubkey: "22".repeat(32),
    lastStateTxid: "33".repeat(32),
    currentBondTxid: "44".repeat(32),
    currentBondVout: 0,
    currentBondValueSats: "195312",
    requiredBondSats: "195312",
    recommendedMode: "sale",
    sellerPayoutAddress: "bc1qsellerexample",
    successorBondAddress: null,
    modes: [
      {
        key: "gift",
        title: "Gift",
        suitability: "Available",
        summary: "Simple owner handoff.",
        command: "npm run dev:cli -- submit-transfer ..."
      },
      {
        key: "sale",
        title: "Sale",
        suitability: "Selected",
        summary: "Cooperative payment and transfer.",
        command: "npm run dev:cli -- submit-sale-transfer ..."
      }
    ],
    ...overrides
  };
}

describe("parseTransferInspectionRole", () => {
  it("accepts buyer and seller roles", () => {
    expect(parseTransferInspectionRole(undefined)).toBeNull();
    expect(parseTransferInspectionRole("buyer")).toBe("buyer");
    expect(parseTransferInspectionRole("seller")).toBe("seller");
  });

  it("rejects unknown roles", () => {
    expect(() => parseTransferInspectionRole("admin")).toThrow("role must be buyer or seller");
  });
});

describe("renderTransferPackageInspectionReport", () => {
  it("renders a buyer-focused checklist", () => {
    const report = renderTransferPackageInspectionReport({
      filePath: "/tmp/buyer-package.json",
      pkg: createTransferPackageFixture(),
      role: "buyer",
      productName: "Open Name Tags"
    });

    expect(report).toContain("Buyer review");
    expect(report).toContain("Confirm the new owner pubkey is your pubkey");
    expect(report).toContain("The Bitcoin transaction you fund should be the same transaction that moves the name to your pubkey.");
    expect(report).toContain("Confirm the seller payout address matches the agreed destination");
  });

  it("renders a seller-focused checklist", () => {
    const report = renderTransferPackageInspectionReport({
      filePath: "/tmp/seller-package.json",
      pkg: createTransferPackageFixture({
        currentStatus: "immature",
        successorBondAddress: "bc1qsuccessorexample"
      }),
      role: "seller",
      productName: "Open Name Tags"
    });

    expect(report).toContain("Seller review");
    expect(report).toContain("Confirm the new owner pubkey came from the intended buyer.");
    expect(report).toContain("Seller payment and name transfer should settle in the same exact Bitcoin transaction.");
    expect(report).toContain("Confirm the successor bond address is correct");
  });

  it("suggests role-specific review when no role is provided", () => {
    const report = renderTransferPackageInspectionReport({
      filePath: "/tmp/transfer-package.json",
      pkg: createTransferPackageFixture(),
      role: null,
      productName: "Open Name Tags"
    });

    expect(report).toContain("Re-run this command with --role buyer or --role seller");
  });
});
