import { xeroClient } from "../clients/xero-client.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { Payment } from "xero-node";
import { getClientHeaders } from "../helpers/get-client-headers.js";

export interface DeletePaymentResult {
  before: Payment;
  after: Payment | undefined;
}

async function getPayment(paymentId: string): Promise<Payment | undefined> {
  const response = await xeroClient.accountingApi.getPayment(
    xeroClient.tenantId,
    paymentId,
    getClientHeaders(), // options
  );

  return response.body.payments?.[0];
}

/**
 * Returns a plain-English reason this payment must not be deleted, or null if it may be.
 */
export function deletePaymentRefusal(payment: Payment): string | null {
  if (payment.status === Payment.StatusEnum.DELETED) {
    return "This payment is already deleted.";
  }

  // A reconciled payment is matched to a bank statement line. Deleting it would
  // break the bank reconciliation, so it has to be unreconciled in Xero first.
  if (payment.isReconciled) {
    return "This payment is reconciled to a bank statement line. Unreconcile it in Xero first, then try again.";
  }

  // One bank payment covering several bills. Xero only removes these as a whole
  // batch, and doing so would unpay every bill in it, so leave it to a person.
  const batchPaymentId = payment.batchPaymentID || payment.batchPayment?.batchPaymentID;
  if (batchPaymentId) {
    return `This payment is part of a batch payment (Batch Payment ID: ${batchPaymentId}) that pays several bills at once. Remove it in Xero by hand, not with this tool.`;
  }

  return null;
}

/**
 * Delete a payment in Xero (Xero's equivalent is setting its status to DELETED).
 * Reads the payment before and after, so the caller can show what changed.
 */
export async function deleteXeroPayment(
  paymentId: string,
): Promise<XeroClientResponse<DeletePaymentResult>> {
  try {
    await xeroClient.authenticate();

    const before = await getPayment(paymentId);
    if (!before) {
      return {
        result: null,
        isError: true,
        error: `No payment found with ID ${paymentId}.`,
      };
    }

    const refusal = deletePaymentRefusal(before);
    if (refusal) {
      return {
        result: null,
        isError: true,
        error: `Payment not deleted. ${refusal}`,
      };
    }

    await xeroClient.accountingApi.deletePayment(
      xeroClient.tenantId,
      paymentId,
      { status: Payment.StatusEnum.DELETED.toString() },
      undefined, // idempotencyKey
      getClientHeaders(), // options
    );

    const after = await getPayment(paymentId);

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
