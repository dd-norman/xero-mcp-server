import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  createBankTransfer: vi.fn(),
}));

vi.mock("../../clients/xero-client.js", () => ({
  xeroClient: {
    tenantId: "test-tenant",
    authenticate: mocks.authenticate,
    accountingApi: { createBankTransfer: mocks.createBankTransfer },
  },
}));

import { createXeroBankTransfer } from "../create-xero-bank-transfer.handler.js";
import { CreateTools } from "../../tools/create/index.js";

const fromBankAccountId = "11111111-1111-4111-8111-111111111111";
const toBankAccountId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authenticate.mockResolvedValue(undefined);
});

describe("createXeroBankTransfer", () => {
  it("registers the tool and creates an unreconciled transfer with stable retry protection", async () => {
    const bankTransfer = {
      bankTransferID: "33333333-3333-4333-8333-333333333333",
      amount: 6526.45,
      fromBankAccount: { accountID: fromBankAccountId },
      toBankAccount: { accountID: toBankAccountId },
    };
    mocks.createBankTransfer.mockResolvedValue({ body: { bankTransfers: [bankTransfer] } });

    const first = await createXeroBankTransfer(
      fromBankAccountId, toBankAccountId, 6526.45, "2026-09-17",
    );
    const second = await createXeroBankTransfer(
      fromBankAccountId, toBankAccountId, 6526.45, "2026-09-17",
    );

    expect(CreateTools.map((createTool) => createTool().name)).toContain("create-bank-transfer");
    expect(first).toEqual({ result: bankTransfer, isError: false, error: null });
    expect(second).toEqual(first);
    const calls = mocks.createBankTransfer.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe("test-tenant");
    expect(calls[0][1]).toEqual({ bankTransfers: [{
      fromBankAccount: { accountID: fromBankAccountId },
      toBankAccount: { accountID: toBankAccountId },
      amount: 6526.45,
      date: "2026-09-17",
      reference: undefined,
      fromIsReconciled: false,
      toIsReconciled: false,
    }] });
    expect(calls[0][2]).toMatch(/^[0-9a-f]{64}$/);
    expect(calls[1][2]).toBe(calls[0][2]);
  });

  it("reports a missing transfer ID as a failure", async () => {
    mocks.createBankTransfer.mockResolvedValue({ body: { bankTransfers: [{}] } });
    const result = await createXeroBankTransfer(
      fromBankAccountId, toBankAccountId, 6526.45, "2026-09-17",
    );
    expect(result).toEqual({
      result: null,
      isError: true,
      error: "Xero did not return a bank transfer ID.",
    });
  });
});
