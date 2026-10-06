import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

// Shared by the attachment upload handlers: checks a local file before it is
// sent to Xero, and compares uploaded bytes when verifying.

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const supportedMimeTypes: Record<string, string> = {
  ".pdf": "application/pdf",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

const invalidFilenameCharacters = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*", "+"]);

export function validateXeroId(id: string, fieldName: string): void {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`${fieldName} must be a valid Xero ID.`);
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

export async function prepareAttachment(filePath: string): Promise<{
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

export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
