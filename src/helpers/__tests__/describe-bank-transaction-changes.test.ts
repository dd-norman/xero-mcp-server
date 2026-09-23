import { describe, expect, it } from "vitest";
import { BankTransaction } from "xero-node";
import { describeBankTransactionChanges } from "../describe-bank-transaction-changes.js";

const baseTransaction = (): BankTransaction => ({
  type: BankTransaction.TypeEnum.SPEND,
  bankAccount: { name: "Company Credit Card" },
  contact: { name: "Example Venue Inc." },
  date: "2026-09-18T00:00:00",
  reference: "",
  total: 1751.66,
  lineItems: [
    {
      description: "Conference - Deposit",
      quantity: 1,
      unitAmount: 1751.66,
      accountCode: "400",
      taxType: "INPUT",
    },
  ],
});

describe("describeBankTransactionChanges", () => {
  it("describes description and tracking changes on a line", () => {
    const before = baseTransaction();
    const after = baseTransaction();
    after.lineItems![0].description = "Conference - Final";
    after.lineItems![0].tracking = [{ name: "Department", option: "Investment Team" }];

    expect(describeBankTransactionChanges(before, after)).toBe(
      "Updated via MCP server. Line 1: description changed from Conference - Deposit to " +
        "Conference - Final; tracking changed from (none) to Department: Investment Team.",
    );
  });

  it("collapses line breaks in descriptions onto one line", () => {
    const before = baseTransaction();
    const after = baseTransaction();
    before.lineItems![0].description = "Jane Doe\n\" Software subscription (Monthly)\"";
    after.lineItems![0].description = "Software subscription (Monthly)";

    expect(describeBankTransactionChanges(before, after)).toBe(
      "Updated via MCP server. Line 1: description changed from Jane Doe \" Software subscription (Monthly)\" " +
        "to Software subscription (Monthly).",
    );
  });

  it("describes header, added line and total changes", () => {
    const before = baseTransaction();
    const after = baseTransaction();
    after.reference = "INV-42";
    after.total = 1801.66;
    after.lineItems!.push({
      description: "Parking",
      quantity: 1,
      unitAmount: 50,
      accountCode: "400",
      taxType: "INPUT",
    });

    const note = describeBankTransactionChanges(before, after);
    expect(note).toContain("Reference changed from (blank) to INV-42");
    expect(note).toContain("Line 2 added: Parking, qty 1, unit 50.00");
    expect(note).toContain("Total changed from 1751.66 to 1801.66");
  });

  it("says so when nothing changed", () => {
    expect(describeBankTransactionChanges(baseTransaction(), baseTransaction())).toBe(
      "Updated via MCP server. No field values changed.",
    );
  });
});
