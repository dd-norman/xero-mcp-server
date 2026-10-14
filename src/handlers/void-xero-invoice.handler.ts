import { xeroClient } from "../clients/xero-client.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { Invoice, Payment } from "xero-node";
import { getClientHeaders } from "../helpers/get-client-headers.js";

export interface VoidInvoiceResult {
  before: Invoice;
  after: Invoice;
}

const VOIDABLE_STATUSES = [
  Invoice.StatusEnum.AUTHORISED,
  Invoice.StatusEnum.SUBMITTED,
];

async function getInvoice(invoiceId: string): Promise<Invoice | undefined> {
  const response = await xeroClient.accountingApi.getInvoice(
    xeroClient.tenantId,
    invoiceId,
    undefined, // unitdp
    getClientHeaders(), // options
  );

  return response.body.invoices?.[0];
}

/**
 * Returns a plain-English reason this invoice can't be voided, or null if it can.
 */
export function voidInvoiceRefusal(invoice: Invoice): string | null {
  if (invoice.status === Invoice.StatusEnum.VOIDED) {
    return "It is already voided.";
  }
  if (invoice.status === Invoice.StatusEnum.DRAFT) {
    return "It is a draft. Drafts are deleted in Xero, not voided.";
  }
  if (!invoice.status || !VOIDABLE_STATUSES.includes(invoice.status)) {
    return `Only Awaiting Approval (SUBMITTED) or Awaiting Payment (AUTHORISED) invoices can be voided. Current status: ${invoice.status}.`;
  }
  // Xero refuses to void an invoice with payments applied. Checking first gives a
  // clearer message; Xero's own error still comes through if this misses a case.
  const activePayments = (invoice.payments ?? []).filter(
    (payment) => payment.status !== Payment.StatusEnum.DELETED,
  );
  if (activePayments.length > 0 || (invoice.amountPaid ?? 0) > 0) {
    const ids = activePayments.map((payment) => payment.paymentID).join(", ");
    return `It still has a payment applied${ids ? ` (payment ID: ${ids})` : ""}. Remove the payment first with delete-payment.`;
  }
  return null;
}

/**
 * Void an approved invoice or bill in Xero by setting its status to VOIDED.
 */
export async function voidXeroInvoice(
  invoiceId: string,
): Promise<XeroClientResponse<VoidInvoiceResult>> {
  try {
    await xeroClient.authenticate();

    const before = await getInvoice(invoiceId);
    if (!before) {
      return {
        result: null,
        isError: true,
        error: `No invoice found with ID ${invoiceId}.`,
      };
    }

    const refusal = voidInvoiceRefusal(before);
    if (refusal) {
      return {
        result: null,
        isError: true,
        error: `Invoice ${before.invoiceNumber || invoiceId} not voided. ${refusal}`,
      };
    }

    const response = await xeroClient.accountingApi.updateInvoice(
      xeroClient.tenantId,
      invoiceId,
      { invoices: [{ status: Invoice.StatusEnum.VOIDED }] },
      undefined, // unitdp
      undefined, // idempotencyKey
      undefined, // allowBackorders
      getClientHeaders(), // options
    );

    const after = response.body.invoices?.[0];
    if (!after) {
      throw new Error("Xero did not return the invoice after voiding it.");
    }

    return {
      result: { before, after },
      isError: false,
      error: null,
    };
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
}
