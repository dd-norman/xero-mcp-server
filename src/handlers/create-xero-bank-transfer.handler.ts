import { createHash } from "node:crypto";
import { BankTransfer } from "xero-node";
import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";

export async function createXeroBankTransfer(
  fromBankAccountId: string,
  toBankAccountId: string,
  amount: number,
  date: string,
  reference?: string,
): Promise<XeroClientResponse<BankTransfer>> {
  try {
    await xeroClient.authenticate();

    const bankTransfer: BankTransfer = {
      fromBankAccount: { accountID: fromBankAccountId },
      toBankAccount: { accountID: toBankAccountId },
      amount,
      date,
      reference,
      fromIsReconciled: false,
      toIsReconciled: false,
    };

    // Make a retry of the same requested transfer safe for this Xero tenant.
    const idempotencyKey = createHash("sha256")
      .update(JSON.stringify([
        xeroClient.tenantId,
        fromBankAccountId,
        toBankAccountId,
        amount.toFixed(2),
        date,
        reference ?? "",
      ]))
      .digest("hex");

    const response = await xeroClient.accountingApi.createBankTransfer(
      xeroClient.tenantId,
      { bankTransfers: [bankTransfer] },
      idempotencyKey,
      getClientHeaders(),
    );

    const createdTransfer = response.body.bankTransfers?.[0];
    if (!createdTransfer?.bankTransferID) {
      throw new Error("Xero did not return a bank transfer ID.");
    }

    return { result: createdTransfer, isError: false, error: null };
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
