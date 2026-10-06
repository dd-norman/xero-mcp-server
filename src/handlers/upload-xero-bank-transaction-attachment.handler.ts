import { xeroClient } from "../clients/xero-client.js";
import { prepareAttachment, sha256, validateXeroId } from "../helpers/attachment-file.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { Attachment } from "xero-node";

export interface BankTransactionAttachmentUploadResult {
  bankTransactionId: string;
  attachment: Attachment;
  alreadyPresent: boolean;
}

export async function uploadXeroBankTransactionAttachment(
  bankTransactionId: string,
  filePath: string,
): Promise<XeroClientResponse<BankTransactionAttachmentUploadResult>> {
  try {
    validateXeroId(bankTransactionId, "bankTransactionId");
    const { fileName, mimeType, data } = await prepareAttachment(filePath);

    await xeroClient.authenticate();

    const headers = getClientHeaders();
    const currentAttachments = await xeroClient.accountingApi.getBankTransactionAttachments(
      xeroClient.tenantId,
      bankTransactionId,
      headers,
    );
    const sameName = currentAttachments.body.attachments?.find(
      (attachment) => attachment.fileName === fileName,
    );

    if (sameName) {
      const existingFile = await xeroClient.accountingApi.getBankTransactionAttachmentByFileName(
        xeroClient.tenantId,
        bankTransactionId,
        fileName,
        mimeType,
        headers,
      );

      if (sha256(existingFile.body) !== sha256(data)) {
        throw new Error(
          `An attachment named "${fileName}" already exists on this transaction with different contents. It was not replaced. Rename the file if you intend to add another copy.`,
        );
      }

      return {
        result: {
          bankTransactionId,
          attachment: sameName,
          alreadyPresent: true,
        },
        isError: false,
        error: null,
      };
    }

    const idempotencyKey = `bank-attachment-${sha256(Buffer.from(`${bankTransactionId}:${fileName}:${sha256(data)}`))}`;
    await xeroClient.accountingApi.createBankTransactionAttachmentByFileName(
      xeroClient.tenantId,
      bankTransactionId,
      fileName,
      data,
      idempotencyKey,
      {
        headers: {
          ...headers.headers,
          "Content-Type": mimeType,
        },
      },
    );

    const verifiedAttachments = await xeroClient.accountingApi.getBankTransactionAttachments(
      xeroClient.tenantId,
      bankTransactionId,
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

    const verifiedFile = await xeroClient.accountingApi.getBankTransactionAttachmentByFileName(
      xeroClient.tenantId,
      bankTransactionId,
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
      result: {
        bankTransactionId,
        attachment: verifiedAttachment,
        alreadyPresent: false,
      },
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
