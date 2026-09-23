import { z } from "zod";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { uploadXeroBankTransactionAttachment } from "../../handlers/upload-xero-bank-transaction-attachment.handler.js";

const UploadBankTransactionAttachmentTool = CreateXeroTool(
  "upload-bank-transaction-attachment",
  `Upload a local PDF or image file to an existing Xero bank transaction and verify the uploaded file by downloading it back from Xero. This sends the file to Xero. Call only when the user explicitly asks to attach that file to that transaction. If a file with the same name already exists, identical content is reported as already attached; different content is not overwritten.`,
  {
    bankTransactionId: z.string().describe("The Xero bank transaction ID."),
    filePath: z.string().describe("Absolute local path to the PDF, PNG, JPG, JPEG, or GIF file to upload."),
  },
  async ({ bankTransactionId, filePath }) => {
    const response = await uploadXeroBankTransactionAttachment(bankTransactionId, filePath);
    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error uploading bank transaction attachment: ${response.error}`,
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
              ? "Attachment was already present on the bank transaction and its contents match the local file."
              : "Attachment uploaded to the bank transaction and verified by downloading it from Xero.",
            `Bank transaction ID: ${response.result.bankTransactionId}`,
            `File name: ${attachment.fileName}`,
            `Content type: ${attachment.mimeType}`,
            `File size: ${attachment.contentLength} bytes`,
            attachment.attachmentID ? `Attachment ID: ${attachment.attachmentID}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  },
);

export default UploadBankTransactionAttachmentTool;
