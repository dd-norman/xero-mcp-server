import { z } from "zod";
import { Payment } from "xero-node";
import { deleteXeroPayment } from "../../handlers/delete-xero-payment.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

function describePayment(label: string, payment: Payment | undefined): string {
  if (!payment) {
    return `${label}: Xero did not return the payment.`;
  }
  return [
    `${label}:`,
    `  Payment ID: ${payment.paymentID || "Unknown"}`,
    `  Status: ${payment.status || "Unknown"}`,
    `  Date: ${payment.date || "Unknown date"}`,
    `  Amount: ${payment.amount ?? 0}`,
    `  Reconciled: ${payment.isReconciled ? "Yes" : "No"}`,
    payment.reference ? `  Reference: ${payment.reference}` : null,
    payment.account?.name ? `  Account: ${payment.account.name}` : null,
    payment.invoice
      ? `  Invoice: ${payment.invoice.invoiceNumber || "(no number)"} (${payment.invoice.invoiceID || "Unknown ID"})` +
        (payment.invoice.contact?.name ? `, ${payment.invoice.contact.name}` : "")
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

const DeletePaymentTool = CreateXeroTool(
  "delete-payment",
  "Delete a payment in Xero (Xero sets the payment's status to DELETED), which removes it from the invoice or bill it paid. \
  This cannot be undone: Xero has no way to restore a deleted payment. \
  Before EVERY call, show the user the payment you intend to delete (invoice number, contact, amount, date, payment ID, \
  for example from list-payments) and get their explicit confirmation for that specific payment. \
  Never delete several payments on one confirmation. \
  Reconciled payments are refused (they must be unreconciled in Xero first), and so are payments that are part of a batch payment \
  (one bank payment covering several bills); tell the user to handle those in Xero by hand. \
  The reply shows the payment before and after deletion; show it to the user.",
  {
    paymentId: z.string().describe("The ID of the payment to delete. Can be obtained from the list-payments tool."),
  },
  async ({ paymentId }: { paymentId: string }) => {
    const response = await deleteXeroPayment(paymentId);

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error deleting payment: ${response.error}`,
          },
        ],
      };
    }

    const { before, after } = response.result;
    const deleted = after?.status === Payment.StatusEnum.DELETED;

    return {
      content: [
        {
          type: "text" as const,
          text: deleted
            ? "Payment deleted."
            : `Xero accepted the request, but the payment's status is now ${after?.status ?? "unknown"}, not DELETED. Check it in Xero.`,
        },
        { type: "text" as const, text: describePayment("Before", before) },
        { type: "text" as const, text: describePayment("After", after) },
      ],
    };
  },
);

export default DeletePaymentTool;
