import { z } from "zod";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { uploadXeroInvoiceAttachment } from "../../handlers/upload-xero-invoice-attachment.handler.js";

const UploadInvoiceAttachmentTool = CreateXeroTool(
  "upload-invoice-attachment",
  `Upload a local PDF or image file to an existing Xero invoice or bill (bills are invoices of type ACCPAY) and verify the uploaded file by downloading it back from Xero. Works on draft invoices and bills. This sends the file to Xero. Call only when the user explicitly asks to attach that file to that invoice or bill. If a file with the same name already exists, identical content is reported as already attached; different content is not overwritten.`,
  {
    invoiceId: z.string().describe("The Xero invoice ID (also used for bills)."),
    filePath: z.string().describe("Absolute local path to the PDF, PNG, JPG, JPEG, or GIF file to upload."),
    includeOnline: z
      .boolean()
      .optional()
      .describe(
        "Sales invoices only: whether the customer can see this attachment on the online invoice. Ignored for bills.",
      ),
  },
  async ({ invoiceId, filePath, includeOnline }) => {
    const response = await uploadXeroInvoiceAttachment(invoiceId, filePath, includeOnline);
    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error uploading invoice attachment: ${response.error}`,
          },
        ],
      };
    }

    const { attachment, alreadyPresent } = response.result;
    return {
      content: [
        {
          type: "text" as const,
          text: [
            alreadyPresent
              ? "Attachment was already present on the invoice and its contents match the local file."
              : "Attachment uploaded to the invoice and verified by downloading it from Xero.",
            `Invoice ID: ${response.result.invoiceId}`,
            response.result.invoiceNumber ? `Invoice number: ${response.result.invoiceNumber}` : null,
            response.result.invoiceType ? `Invoice type: ${response.result.invoiceType}` : null,
            response.result.contactName ? `Contact: ${response.result.contactName}` : null,
            `File name: ${attachment.fileName}`,
            `Content type: ${attachment.mimeType}`,
            `File size: ${attachment.contentLength} bytes`,
            `Shown on online invoice: ${response.result.includeOnline ? "yes" : "no"}`,
            attachment.attachmentID ? `Attachment ID: ${attachment.attachmentID}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  },
);

export default UploadInvoiceAttachmentTool;
