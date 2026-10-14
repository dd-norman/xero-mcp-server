import { z } from "zod";
import { Invoice } from "xero-node";
import { voidXeroInvoice } from "../../handlers/void-xero-invoice.handler.js";
import { DeepLinkType, getDeepLink } from "../../helpers/get-deeplink.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const VoidInvoiceTool = CreateXeroTool(
  "void-invoice",
  "Void an invoice or bill in Xero by setting its status to VOIDED. \
  Only works on invoices or bills that are Awaiting Approval (SUBMITTED) or Awaiting Payment (AUTHORISED) \
  and have no payments applied. If a payment is still applied, remove it first with delete-payment. \
  Draft invoices cannot be voided. \
  This cannot be undone: a voided invoice or bill cannot be reopened. \
  Before EVERY call, show the user the invoice or bill you intend to void (number, contact, total, date, invoice ID) \
  and get their explicit confirmation for that specific invoice. Never void several invoices on one confirmation. \
  The reply includes a deep link to the invoice in Xero; display it to the user.",
  {
    invoiceId: z.string().describe("The ID of the invoice or bill to void. Can be obtained from the list-invoices tool."),
  },
  async ({ invoiceId }: { invoiceId: string }) => {
    const response = await voidXeroInvoice(invoiceId);

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error voiding invoice: ${response.error}`,
          },
        ],
      };
    }

    const { before, after } = response.result;
    const deepLink = await getDeepLink(
      after.type === Invoice.TypeEnum.ACCREC ? DeepLinkType.INVOICE : DeepLinkType.BILL,
      after.invoiceID || invoiceId,
    );

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Invoice voided.`,
            `Invoice Number: ${after.invoiceNumber || "(no number)"}`,
            `Invoice ID: ${after.invoiceID || invoiceId}`,
            `Type: ${after.type}`,
            after.contact?.name ? `Contact: ${after.contact.name}` : null,
            `Total: ${after.total ?? before.total}`,
            `Status: ${before.status} -> ${after.status}`,
            `Link to view: ${deepLink.trim()}`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  },
);

export default VoidInvoiceTool;
