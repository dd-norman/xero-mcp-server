import { beforeEach, describe, expect, it, vi } from "vitest";
import { Invoice, Payment } from "xero-node";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  getPayment: vi.fn(),
  deletePayment: vi.fn(),
  getInvoice: vi.fn(),
  updateInvoice: vi.fn(),
}));

vi.mock("../../clients/xero-client.js", () => ({
  xeroClient: {
    tenantId: "test-tenant",
    authenticate: mocks.authenticate,
    accountingApi: {
      getPayment: mocks.getPayment,
      deletePayment: mocks.deletePayment,
      getInvoice: mocks.getInvoice,
      updateInvoice: mocks.updateInvoice,
    },
  },
}));

import { deleteXeroPayment } from "../delete-xero-payment.handler.js";
import { voidXeroInvoice } from "../void-xero-invoice.handler.js";
import { DeleteTools } from "../../tools/delete/index.js";
import { UpdateTools } from "../../tools/update/index.js";

const paymentId = "00000000-0000-4000-8000-000000000010";
const invoiceId = "00000000-0000-4000-8000-000000000020";

const authorisedPayment = {
  paymentID: paymentId,
  status: Payment.StatusEnum.AUTHORISED,
  amount: 125.5,
  date: "2026-10-01",
  isReconciled: false,
  invoice: { invoiceID: invoiceId, invoiceNumber: "BILL-1" },
};

const paidBill = {
  invoiceID: invoiceId,
  invoiceNumber: "BILL-1",
  type: Invoice.TypeEnum.ACCPAY,
  status: Invoice.StatusEnum.PAID,
  amountPaid: 125.5,
  payments: [{ paymentID: paymentId, status: Payment.StatusEnum.AUTHORISED }],
};

const unpaidBill = {
  ...paidBill,
  status: Invoice.StatusEnum.AUTHORISED,
  amountPaid: 0,
  payments: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authenticate.mockResolvedValue(undefined);
});

describe("deleteXeroPayment", () => {
  it("deletes an unreconciled payment and returns before and after", async () => {
    mocks.getPayment
      .mockResolvedValueOnce({ body: { payments: [authorisedPayment] } })
      .mockResolvedValueOnce({
        body: { payments: [{ ...authorisedPayment, status: Payment.StatusEnum.DELETED }] },
      });
    mocks.deletePayment.mockResolvedValue({ body: { payments: [] } });

    const response = await deleteXeroPayment(paymentId);

    expect(response.isError).toBe(false);
    expect(mocks.deletePayment).toHaveBeenCalledWith(
      "test-tenant",
      paymentId,
      { status: "DELETED" },
      undefined,
      expect.anything(),
    );
    expect(response.result?.before.status).toBe(Payment.StatusEnum.AUTHORISED);
    expect(response.result?.after?.status).toBe(Payment.StatusEnum.DELETED);
  });

  it("refuses a reconciled payment without calling delete", async () => {
    mocks.getPayment.mockResolvedValue({
      body: { payments: [{ ...authorisedPayment, isReconciled: true }] },
    });

    const response = await deleteXeroPayment(paymentId);

    expect(response.isError).toBe(true);
    expect(response.error).toMatch(/reconciled/i);
    expect(mocks.deletePayment).not.toHaveBeenCalled();
  });
  it("refuses a payment that is part of a batch payment", async () => {
    mocks.getPayment.mockResolvedValue({
      body: { payments: [{ ...authorisedPayment, batchPaymentID: "batch-1" }] },
    });

    const response = await deleteXeroPayment(paymentId);

    expect(response.isError).toBe(true);
    expect(response.error).toMatch(/batch payment/i);
    expect(mocks.deletePayment).not.toHaveBeenCalled();
  });
});

describe("voidXeroInvoice", () => {
  it("refuses a bill that still has a payment applied", async () => {
    mocks.getInvoice.mockResolvedValue({ body: { invoices: [paidBill] } });

    const response = await voidXeroInvoice(invoiceId);

    expect(response.isError).toBe(true);
    expect(mocks.updateInvoice).not.toHaveBeenCalled();
  });

  it("refuses a draft", async () => {
    mocks.getInvoice.mockResolvedValue({
      body: { invoices: [{ ...unpaidBill, status: Invoice.StatusEnum.DRAFT }] },
    });

    const response = await voidXeroInvoice(invoiceId);

    expect(response.error).toMatch(/draft/i);
    expect(mocks.updateInvoice).not.toHaveBeenCalled();
  });

  it("voids an unpaid approved bill", async () => {
    mocks.getInvoice.mockResolvedValue({ body: { invoices: [unpaidBill] } });
    mocks.updateInvoice.mockResolvedValue({
      body: { invoices: [{ ...unpaidBill, status: Invoice.StatusEnum.VOIDED }] },
    });

    const response = await voidXeroInvoice(invoiceId);

    expect(response.isError).toBe(false);
    expect(mocks.updateInvoice.mock.calls[0][2]).toEqual({
      invoices: [{ status: Invoice.StatusEnum.VOIDED }],
    });
    expect(response.result?.after.status).toBe(Invoice.StatusEnum.VOIDED);
  });

  it("passes Xero's validation error through", async () => {
    mocks.getInvoice.mockResolvedValue({ body: { invoices: [unpaidBill] } });
    mocks.updateInvoice.mockRejectedValue(
      new Error("Invoice cannot be voided as it has payments allocated"),
    );

    const response = await voidXeroInvoice(invoiceId);

    expect(response.isError).toBe(true);
    expect(response.error).toMatch(/payments allocated/);
  });
});

describe("tool registration", () => {
  it("registers delete-payment and void-invoice", () => {
    const names = [...DeleteTools, ...UpdateTools].map((tool) => tool().name);
    expect(names).toContain("delete-payment");
    expect(names).toContain("void-invoice");
  });
});
