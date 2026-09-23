import { xeroClient } from "../clients/xero-client.js";
import { describeBankTransactionChanges } from "../helpers/describe-bank-transaction-changes.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { BankTransaction, LineItemTracking } from "xero-node";

interface BankTransactionLineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  accountCode: string;
  taxType: string;
  tracking?: LineItemTracking[];
}

type BankTransactionType = "RECEIVE" | "SPEND";

async function getBankTransaction(bankTransactionId: string): Promise<BankTransaction | undefined> {
  await xeroClient.authenticate();

  const response = await xeroClient.accountingApi.getBankTransaction(
    xeroClient.tenantId, // xeroTenantId
    bankTransactionId, // bankTransactionID
    undefined, // unitdp
    getClientHeaders() // options
  );

  return response.body.bankTransactions?.[0];
}

async function updateBankTransaction(
  bankTransactionId: string,
  existingBankTransaction: BankTransaction,
  type?: BankTransactionType,
  contactId?: string,
  lineItems?: BankTransactionLineItem[],
  reference?: string,
  date?: string
): Promise<BankTransaction | undefined> {
  // Drop the stored totals so Xero recalculates them from the line items.
  // Sending the old values alongside new line items fails validation with
  // "SubTotal/Total does not agree".
  // Also drop the source-document url: Xero labels its "Go to [app]" button
  // with whichever app last sent the url, so re-sending it would replace the
  // original app's name (e.g. "Go to Expense App") with this MCP server's name.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { subTotal, totalTax, total, url, ...existingWithoutTotals } = existingBankTransaction;

  const bankTransaction: BankTransaction = {
    ...existingWithoutTotals,
    bankTransactionID: bankTransactionId,
    type: type ? BankTransaction.TypeEnum[type] : existingBankTransaction.type,
    contact: contactId ? { contactID: contactId } : existingBankTransaction.contact,
    lineItems: lineItems ? lineItems : existingBankTransaction.lineItems,
    reference: reference ? reference : existingBankTransaction.reference,
    date: date ? date : existingBankTransaction.date
  };

  const response = await xeroClient.accountingApi.updateBankTransaction(
    xeroClient.tenantId, // xeroTenantId
    bankTransactionId, // bankTransactionID
    { bankTransactions: [bankTransaction] }, // bankTransactions
    undefined, // unitdp
    undefined, // idempotencyKey
    getClientHeaders() // options
  );

  return response.body.bankTransactions?.[0];
}

async function addHistoryNote(bankTransactionId: string, details: string): Promise<void> {
  await xeroClient.accountingApi.createBankTransactionHistoryRecord(
    xeroClient.tenantId, // xeroTenantId
    bankTransactionId, // bankTransactionID
    { historyRecords: [{ details }] }, // historyRecords
    undefined, // idempotencyKey
    getClientHeaders() // options
  );
}

export interface UpdateBankTransactionResult {
  bankTransaction: BankTransaction;
  historyNote: string;
  historyNoteError: string | null;
}

export async function updateXeroBankTransaction(
  bankTransactionId: string,
  type?: BankTransactionType,
  contactId?: string,
  lineItems?: BankTransactionLineItem[],
  reference?: string,
  date?: string
): Promise<XeroClientResponse<UpdateBankTransactionResult>> {
  try {
    const existingBankTransaction = await getBankTransaction(bankTransactionId);

    if (!existingBankTransaction) {
      throw new Error(`Could not find bank transaction`);
    }

    const updatedBankTransaction = await updateBankTransaction(
      bankTransactionId,
      existingBankTransaction,
      type,
      contactId,
      lineItems,
      reference,
      date
    );

    if (!updatedBankTransaction) {
      throw new Error(`Failed to update bank transaction`);
    }

    // The update is already saved at this point, so a failed note is reported
    // as a warning rather than failing the whole call.
    const historyNote = describeBankTransactionChanges(existingBankTransaction, updatedBankTransaction);
    let historyNoteError: string | null = null;
    try {
      await addHistoryNote(bankTransactionId, historyNote);
    } catch (error) {
      historyNoteError = formatError(error);
    }

    return {
      result: { bankTransaction: updatedBankTransaction, historyNote, historyNoteError },
      isError: false,
      error: null
    };
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
}