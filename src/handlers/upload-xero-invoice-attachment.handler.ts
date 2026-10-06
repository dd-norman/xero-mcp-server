import { xeroClient } from "../clients/xero-client.js";
import { prepareAttachment, sha256, validateXeroId } from "../helpers/attachment-file.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { Attachment, Invoice } from "xero-node";

export interface InvoiceAttachmentUploadResult {
  invoiceId: string;
  invoiceNumber?: string;
  invoiceType?: string;
  contactName?: string;
  attachment: Attachment;
  alreadyPresent: boolean;
  includeOnline: boolean;
}

// Decides whether the attachment is shown to the customer on the online
// invoice (Xero's "IncludeOnline" flag). Only sales invoices (ACCREC) have an
// online invoice; bills (ACCPAY) are never sent to the supplier through Xero.
export function decideIncludeOnline(
  invoiceType: Invoice.TypeEnum | undefined,
  requested: boolean | undefined,
): boolean {
  if (invoiceType === Invoice.TypeEnum.ACCPAY) return false;
  // Off unless explicitly asked, so a supporting document never reaches a
  // customer by accident.
  return requested ?? false;
}

export async function uploadXeroInvoiceAttachment(
  invoiceId: string,
  filePath: string,
  includeOnlineRequested?: boolean,
): Promise<XeroClientResponse<InvoiceAttachmentUploadResult>> {
  try {
    validateXeroId(invoiceId, "invoiceId");
    const { fileName, mimeType, data } = await prepareAttachment(filePath);

    await xeroClient.authenticate();

    const headers = getClientHeaders();
    const invoiceResponse = await xeroClient.accountingApi.getInvoice(
      xeroClient.tenantId,
      invoiceId,
      undefined,
      headers,
    );
    const invoice = invoiceResponse.body.invoices?.[0];
    if (!invoice) {
      throw new Error(`No invoice or bill was found with ID ${invoiceId}.`);
    }

    const includeOnline = decideIncludeOnline(invoice.type, includeOnlineRequested);
    const invoiceSummary = {
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      invoiceType: invoice.type?.toString(),
      contactName: invoice.contact?.name,
      includeOnline,
    };

    const currentAttachments = await xeroClient.accountingApi.getInvoiceAttachments(
      xeroClient.tenantId,
      invoiceId,
      headers,
    );
    const sameName = currentAttachments.body.attachments?.find(
      (attachment) => attachment.fileName === fileName,
    );

    if (sameName) {
      const existingFile = await xeroClient.accountingApi.getInvoiceAttachmentByFileName(
        xeroClient.tenantId,
        invoiceId,
        fileName,
        mimeType,
        headers,
      );

      if (sha256(existingFile.body) !== sha256(data)) {
        throw new Error(
          `An attachment named "${fileName}" already exists on this invoice with different contents. It was not replaced. Rename the file if you intend to add another copy.`,
        );
      }

      return {
        result: { ...invoiceSummary, attachment: sameName, alreadyPresent: true },
        isError: false,
        error: null,
      };
    }

    const idempotencyKey = `invoice-attachment-${sha256(Buffer.from(`${invoiceId}:${fileName}:${sha256(data)}`))}`;
    await xeroClient.accountingApi.createInvoiceAttachmentByFileName(
      xeroClient.tenantId,
      invoiceId,
      fileName,
      data,
      includeOnline,
      idempotencyKey,
      {
        headers: {
          ...headers.headers,
          "Content-Type": mimeType,
        },
      },
    );

    const verifiedAttachments = await xeroClient.accountingApi.getInvoiceAttachments(
      xeroClient.tenantId,
      invoiceId,
      headers,
    );
    const verifiedAttachment = verifiedAttachments.body.attachments?.find(
      (attachment) => attachment.fileName === fileName,
    );

    if (!verifiedAttachment || verifiedAttachment.contentLength !== data.length) {
      throw new Error(
        "Xero accepted the upload, but the attachment could not be verified afterward.",
      );
    }

    const verifiedFile = await xeroClient.accountingApi.getInvoiceAttachmentByFileName(
      xeroClient.tenantId,
      invoiceId,
      fileName,
      mimeType,
      headers,
    );
    if (sha256(verifiedFile.body) !== sha256(data)) {
      throw new Error(
        "Xero accepted the upload, but the downloaded attachment did not match the source file.",
      );
    }

    return {
      result: { ...invoiceSummary, attachment: verifiedAttachment, alreadyPresent: false },
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
