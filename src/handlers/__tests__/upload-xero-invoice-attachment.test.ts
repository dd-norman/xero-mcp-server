import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Invoice } from "xero-node";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  getInvoice: vi.fn(),
  listAttachments: vi.fn(),
  getAttachment: vi.fn(),
  createAttachment: vi.fn(),
}));

vi.mock("../../clients/xero-client.js", () => ({
  xeroClient: {
    tenantId: "test-tenant",
    authenticate: mocks.authenticate,
    accountingApi: {
      getInvoice: mocks.getInvoice,
      getInvoiceAttachments: mocks.listAttachments,
      getInvoiceAttachmentByFileName: mocks.getAttachment,
      createInvoiceAttachmentByFileName: mocks.createAttachment,
    },
  },
}));

import {
  decideIncludeOnline,
  uploadXeroInvoiceAttachment,
} from "../upload-xero-invoice-attachment.handler.js";
import { CreateTools } from "../../tools/create/index.js";

const invoiceId = "00000000-0000-4000-8000-000000000002";
const pdfBytes = Buffer.from("%PDF-1.7\nunit-test bill\n%%EOF", "ascii");
const attachment = {
  attachmentID: "attachment-id",
  fileName: "bill.pdf",
  mimeType: "application/pdf",
  contentLength: pdfBytes.length,
};
const draftBill = {
  invoiceID: invoiceId,
  invoiceNumber: "BILL-001",
  type: Invoice.TypeEnum.ACCPAY,
  status: Invoice.StatusEnum.DRAFT,
  contact: { name: "Test Supplier" },
};

let tempDirectory: string;
let pdfPath: string;

beforeEach(async () => {
  vi.resetAllMocks();
  mocks.authenticate.mockResolvedValue(undefined);
  mocks.getInvoice.mockResolvedValue({ body: { invoices: [draftBill] } });
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "xero-invoice-attachment-test-"));
  pdfPath = path.join(tempDirectory, attachment.fileName);
  await writeFile(pdfPath, pdfBytes);
});

afterEach(async () => {
  await rm(tempDirectory, { recursive: true, force: true });
});

describe("decideIncludeOnline", () => {
  it("never shows bill attachments online, even when asked", () => {
    expect(decideIncludeOnline(Invoice.TypeEnum.ACCPAY, true)).toBe(false);
    expect(decideIncludeOnline(Invoice.TypeEnum.ACCPAY, undefined)).toBe(false);
  });

  it("hides sales invoice attachments unless explicitly asked", () => {
    expect(decideIncludeOnline(Invoice.TypeEnum.ACCREC, undefined)).toBe(false);
    expect(decideIncludeOnline(Invoice.TypeEnum.ACCREC, false)).toBe(false);
    expect(decideIncludeOnline(Invoice.TypeEnum.ACCREC, true)).toBe(true);
  });
});

describe("uploadXeroInvoiceAttachment", () => {
  it("is registered and uploads a local PDF to a draft bill, then verifies its downloaded bytes", async () => {
    mocks.listAttachments
      .mockResolvedValueOnce({ body: { attachments: [] } })
      .mockResolvedValueOnce({ body: { attachments: [attachment] } });
    mocks.createAttachment.mockResolvedValue({ body: { attachments: [attachment] } });
    mocks.getAttachment.mockResolvedValue({ body: pdfBytes });

    const result = await uploadXeroInvoiceAttachment(invoiceId, pdfPath, true);

    expect(CreateTools.map((createTool) => createTool().name)).toContain(
      "upload-invoice-attachment",
    );
    expect(result.isError).toBe(false);
    if (result.isError) return;
    expect(result.result).toEqual({
      invoiceId,
      invoiceNumber: "BILL-001",
      invoiceType: "ACCPAY",
      contactName: "Test Supplier",
      attachment,
      alreadyPresent: false,
      includeOnline: false,
    });
    expect(mocks.authenticate).toHaveBeenCalledOnce();
    expect(mocks.createAttachment).toHaveBeenCalledOnce();
    expect(mocks.createAttachment).toHaveBeenCalledWith(
      "test-tenant",
      invoiceId,
      "bill.pdf",
      pdfBytes,
      false,
      expect.stringMatching(/^invoice-attachment-[0-9a-f]{64}$/),
      {
        headers: expect.objectContaining({
          "Content-Type": "application/pdf",
          "user-agent": expect.any(String),
        }),
      },
    );
    expect(mocks.getAttachment).toHaveBeenCalledWith(
      "test-tenant",
      invoiceId,
      "bill.pdf",
      "application/pdf",
      expect.any(Object),
    );
  });

  it("reports an identical existing attachment without uploading it again", async () => {
    mocks.listAttachments.mockResolvedValue({ body: { attachments: [attachment] } });
    mocks.getAttachment.mockResolvedValue({ body: pdfBytes });

    const result = await uploadXeroInvoiceAttachment(invoiceId, pdfPath);

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

    const result = await uploadXeroInvoiceAttachment(invoiceId, pdfPath);

    expect(result.isError).toBe(true);
    if (!result.isError) return;
    expect(result.error).toContain("was not replaced");
    expect(mocks.createAttachment).not.toHaveBeenCalled();
  });

  it("reports a missing invoice without uploading", async () => {
    mocks.getInvoice.mockResolvedValue({ body: { invoices: [] } });

    const result = await uploadXeroInvoiceAttachment(invoiceId, pdfPath);

    expect(result.isError).toBe(true);
    expect(mocks.createAttachment).not.toHaveBeenCalled();
  });

  it("rejects relative paths, unsupported files, and invalid invoice IDs before contacting Xero", async () => {
    await expect(
      uploadXeroInvoiceAttachment(invoiceId, "bill.pdf"),
    ).resolves.toMatchObject({ isError: true });

    const textPath = path.join(tempDirectory, "bill.txt");
    await writeFile(textPath, "not a bill PDF");
    await expect(
      uploadXeroInvoiceAttachment(invoiceId, textPath),
    ).resolves.toMatchObject({ isError: true });

    await expect(
      uploadXeroInvoiceAttachment("not-a-guid", pdfPath),
    ).resolves.toMatchObject({ isError: true });

    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.createAttachment).not.toHaveBeenCalled();
  });
});
