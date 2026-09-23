import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  listAttachments: vi.fn(),
  getAttachment: vi.fn(),
  createAttachment: vi.fn(),
}));

vi.mock("../../clients/xero-client.js", () => ({
  xeroClient: {
    tenantId: "test-tenant",
    authenticate: mocks.authenticate,
    accountingApi: {
      getBankTransactionAttachments: mocks.listAttachments,
      getBankTransactionAttachmentByFileName: mocks.getAttachment,
      createBankTransactionAttachmentByFileName: mocks.createAttachment,
    },
  },
}));

import { uploadXeroBankTransactionAttachment } from "../upload-xero-bank-transaction-attachment.handler.js";
import { CreateTools } from "../../tools/create/index.js";

const bankTransactionId = "00000000-0000-4000-8000-000000000001";
const pdfBytes = Buffer.from("%PDF-1.7\nunit-test receipt\n%%EOF", "ascii");
const attachment = {
  attachmentID: "attachment-id",
  fileName: "receipt.pdf",
  mimeType: "application/pdf",
  contentLength: pdfBytes.length,
};

let tempDirectory: string;
let pdfPath: string;

beforeEach(async () => {
  vi.resetAllMocks();
  mocks.authenticate.mockResolvedValue(undefined);
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "xero-attachment-test-"));
  pdfPath = path.join(tempDirectory, attachment.fileName);
  await writeFile(pdfPath, pdfBytes);
});

afterEach(async () => {
  await rm(tempDirectory, { recursive: true, force: true });
});

describe("uploadXeroBankTransactionAttachment", () => {
  it("is registered and uploads a local PDF, then verifies its downloaded bytes", async () => {
    mocks.listAttachments
      .mockResolvedValueOnce({ body: { attachments: [] } })
      .mockResolvedValueOnce({ body: { attachments: [attachment] } });
    mocks.createAttachment.mockResolvedValue({ body: { attachments: [attachment] } });
    mocks.getAttachment.mockResolvedValue({ body: pdfBytes });

    const result = await uploadXeroBankTransactionAttachment(bankTransactionId, pdfPath);

    expect(CreateTools.map((createTool) => createTool().name)).toContain(
      "upload-bank-transaction-attachment",
    );
    expect(result.isError).toBe(false);
    if (result.isError) return;
    expect(result.result).toEqual({
      bankTransactionId,
      attachment,
      alreadyPresent: false,
    });
    expect(mocks.authenticate).toHaveBeenCalledOnce();
    expect(mocks.createAttachment).toHaveBeenCalledOnce();
    expect(mocks.createAttachment).toHaveBeenCalledWith(
      "test-tenant",
      bankTransactionId,
      "receipt.pdf",
      pdfBytes,
      expect.stringMatching(/^bank-attachment-[0-9a-f]{64}$/),
      {
        headers: expect.objectContaining({
          "Content-Type": "application/pdf",
          "user-agent": expect.any(String),
        }),
      },
    );
    expect(mocks.getAttachment).toHaveBeenCalledWith(
      "test-tenant",
      bankTransactionId,
      "receipt.pdf",
      "application/pdf",
      expect.any(Object),
    );
  });

  it("reports an identical existing attachment without uploading it again", async () => {
    mocks.listAttachments.mockResolvedValue({ body: { attachments: [attachment] } });
    mocks.getAttachment.mockResolvedValue({ body: pdfBytes });

    const result = await uploadXeroBankTransactionAttachment(bankTransactionId, pdfPath);

    expect(result.isError).toBe(false);
    if (result.isError) return;
    expect(result.result.alreadyPresent).toBe(true);
    expect(mocks.createAttachment).not.toHaveBeenCalled();
  });

  it("refuses to replace a same-named attachment with different content", async () => {
    mocks.listAttachments.mockResolvedValue({ body: { attachments: [attachment] } });
    mocks.getAttachment.mockResolvedValue({
      body: Buffer.from("%PDF-1.7\nother content\n%%EOF", "ascii"),
    });

    const result = await uploadXeroBankTransactionAttachment(bankTransactionId, pdfPath);

    expect(result.isError).toBe(true);
    if (!result.isError) return;
    expect(result.error).toContain("was not replaced");
    expect(mocks.createAttachment).not.toHaveBeenCalled();
  });

  it("rejects relative paths, unsupported files, and invalid transaction IDs before contacting Xero", async () => {
    await expect(
      uploadXeroBankTransactionAttachment(bankTransactionId, "receipt.pdf"),
    ).resolves.toMatchObject({ isError: true });

    const textPath = path.join(tempDirectory, "receipt.txt");
    await writeFile(textPath, "not a receipt PDF");
    await expect(
      uploadXeroBankTransactionAttachment(bankTransactionId, textPath),
    ).resolves.toMatchObject({ isError: true });

    await expect(
      uploadXeroBankTransactionAttachment("not-a-guid", pdfPath),
    ).resolves.toMatchObject({ isError: true });

    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.createAttachment).not.toHaveBeenCalled();
  });
});
