import { z } from "zod";
import { bankTransactionDeepLink } from "../../consts/deeplinks.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { createXeroBankTransfer } from "../../handlers/create-xero-bank-transfer.handler.js";

const CreateBankTransferTool = CreateXeroTool(
  "create-bank-transfer",
  `Create a transfer between two Xero bank or credit card accounts. Xero creates an
  account transaction on each side. Both sides are left unreconciled so their
  bank statement lines can be matched later. Use this for credit card payments
  from a bank account, and verify the account IDs before creating it.`,
  {
    fromBankAccountId: z.string().uuid().describe("Account paying the money"),
    toBankAccountId: z.string().uuid().describe("Account receiving the money"),
    amount: z.number().positive().refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
      "Amount must have at most two decimal places",
    ),
    date: z.string().refine((value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    }, "Use a valid date in YYYY-MM-DD format"),
    reference: z.string().optional(),
  },
  async ({ fromBankAccountId, toBankAccountId, amount, date, reference }) => {
    if (fromBankAccountId === toBankAccountId) {
      return {
        content: [{ type: "text" as const, text: "Source and destination accounts must differ." }],
        isError: true,
      };
    }

    const response = await createXeroBankTransfer(
      fromBankAccountId,
      toBankAccountId,
      amount,
      date,
      reference,
    );
    if (response.isError) {
      return {
        content: [{ type: "text" as const, text: `Error creating bank transfer: ${response.error}` }],
        isError: true,
      };
    }

    const transfer = response.result;
    const fromLink = transfer.fromBankTransactionID
      ? bankTransactionDeepLink(fromBankAccountId, transfer.fromBankTransactionID)
      : null;
    const toLink = transfer.toBankTransactionID
      ? bankTransactionDeepLink(toBankAccountId, transfer.toBankTransactionID)
      : null;

    return {
      content: [{
        type: "text" as const,
        text: [
          `Bank transfer created: ${transfer.bankTransferID}`,
          `Date: ${transfer.date ? new Date(transfer.date).toISOString().slice(0, 10) : date}`,
          `Amount: ${transfer.amount}`,
          `From: ${transfer.fromBankAccount.name ?? fromBankAccountId}`,
          `To: ${transfer.toBankAccount.name ?? toBankAccountId}`,
          `From transaction ID: ${transfer.fromBankTransactionID ?? "not returned"}`,
          `To transaction ID: ${transfer.toBankTransactionID ?? "not returned"}`,
          `From reconciled: ${transfer.fromIsReconciled ?? false}`,
          `To reconciled: ${transfer.toIsReconciled ?? false}`,
          fromLink ? `From transaction: ${fromLink}` : null,
          toLink ? `To transaction: ${toLink}` : null,
        ].filter(Boolean).join("\n"),
      }],
    };
  },
);

export default CreateBankTransferTool;
