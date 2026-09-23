import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { Attachment } from "xero-node";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const supportedMimeTypes: Record<string, string> = {
  ".pdf": "application/pdf",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

const invalidFilenameCharacters = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*", "+"]);

export interface BankTransactionAttachmentUploadResult {
  bankTransactionId: string;
  attachment: Attachment;
  alreadyPresent: boolean;
}

function validateBankTransactionId(bankTransactionId: string): void {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(bankTransactionId)) {
    throw new Error("bankTransactionId must be a valid Xero transaction ID.");
  }
}

function validateFileContent(fileName: string, mimeType: string, data: Buffer): void {
  if (data.length === 0) {
    throw new Error("The attachment file is empty.");
  }

  if (data.length > MAX_ATTACHMENT_BYTES) {
    throw new Error("The attachment exceeds Xero's 10 MB per-file limit.");
  }

  if (
    [...fileName].some((character) => invalidFilenameCharacters.has(character)) ||
    fileName.includes(String.fromCharCode(0))
  ) {
    throw new Error("The filename contains characters that Xero does not allow.");
  }

  const signatures: Record<string, (bytes: Buffer) => boolean> = {
    "application/pdf": (bytes) => bytes.subarray(0, 5).toString("ascii") === "%PDF-",
    "image/gif": (bytes) => ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii")),
    "image/jpeg": (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    "image/png": (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  };

  if (!signatures[mimeType]?.(data)) {
    throw new Error(`The file contents do not match the ${mimeType} filename extension.`);
  }
}

async function prepareAttachment(filePath: string): Promise<{
  fileName: string;
  mimeType: string;
  data: Buffer;
}> {
  if (!path.isAbsolute(filePath)) {
    throw new Error("filePath must be an absolute path to a local attachment.");
  }

  const absolutePath = await realpath(filePath);
  const fileName = path.basename(absolutePath);
  const mimeType = supportedMimeTypes[path.extname(fileName).toLowerCase()];
  if (!mimeType) {
    throw new Error("Only PDF, PNG, JPG, JPEG, and GIF attachments are supported.");
  }

  const fileStats = await stat(absolutePath);
  if (!fileStats.isFile()) {
    throw new Error("filePath must point to a regular file.");
  }

  if (fileStats.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("The attachment exceeds Xero's 10 MB per-file limit.");
  }

  const data = await readFile(absolutePath);
  validateFileContent(fileName, mimeType, data);

  return { fileName, mimeType, data };
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export async function uploadXeroBankTransactionAttachment(
  bankTransactionId: string,
  filePath: string,
): Promise<XeroClientResponse<BankTransactionAttachmentUploadResult>> {
  try {
    validateBankTransactionId(bankTransactionId);
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
