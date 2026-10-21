# Fork changes

This fork of the official [XeroAPI/xero-mcp-server](https://github.com/XeroAPI/xero-mcp-server) adds bank transaction fixes and features. This file records every change made on top of upstream, and how upstream updates are merged in.

**Current version:** `0.0.17-fork.5`, which is upstream `0.0.17` plus fork patch set 5.

## Base version

| | |
|---|---|
| Upstream commit | [`6d30b75`](https://github.com/XeroAPI/xero-mcp-server/commit/6d30b75) "upgrade dependencies" |
| Upstream branch | `bump-package-to-0.0.17` (not yet merged into upstream `main` or released when this fork was patched) |
| Upstream version | `0.0.17` |
| Upstream `main` merged in | [`f24583c`](https://github.com/XeroAPI/xero-mcp-server/commit/f24583c) (see [change 8](#8-merged-upstream-main-payroll-import-shims-165)) |

## Branches

| Branch | Contents |
|---|---|
| `main` | An exact copy of upstream `main`. Fork changes are never committed here. |
| `main-forked` | Upstream plus the fork changes below. This is the branch to build and run. |

## Summary of changes

| # | Change | Made by | Date |
|---|--------|---------|------|
| 1 | [New tool: `upload-bank-transaction-attachment`](#1-new-tool-upload-bank-transaction-attachment) | Codex | 2026-09-22 |
| 2 | [Upgrade `xero-node` SDK to 20.0.0](#2-upgrade-xero-node-sdk-to-2000) | Codex | 2026-09-23 |
| 3 | [Fix "SubTotal/Total does not agree" when updating bank transactions](#3-fix-subtotaltotal-does-not-agree-when-updating-bank-transactions) | Claude Code | 2026-09-23 |
| 4 | [Tracking category support in `update-bank-transaction`](#4-tracking-category-support-in-update-bank-transaction) | Claude Code | 2026-09-23 |
| 5 | [Keep the original app's "Go to [app]" button after updates](#5-keep-the-original-apps-go-to-app-button-after-updates) | Claude Code | 2026-09-23 |
| 6 | [Descriptive History & Notes entry after each update](#6-descriptive-history--notes-entry-after-each-update) | Claude Code | 2026-09-23 |
| 7 | [Version renamed to `0.0.17-fork.1`](#7-version-renamed-to-0017-fork1) | Claude Code | 2026-09-23 |
| 8 | [Merged upstream `main` (payroll import shims, #165)](#8-merged-upstream-main-payroll-import-shims-165) | Claude Code | 2026-09-23 |
| 9 | [New tool: `create-bank-transfer`](#9-new-tool-create-bank-transfer) | Codex | 2026-09-23 |
| 10 | [Turn tools off per connection with `XERO_DISABLED_TOOLS`](#10-turn-tools-off-per-connection-with-xero_disabled_tools) | Claude Code | 2026-09-25 |
| 11 | [New tool: `upload-invoice-attachment`](#11-new-tool-upload-invoice-attachment) | Claude Code | 2026-10-05 |
| 12 | [`list-payments` shows reconciled status and batch payments](#12-list-payments-shows-reconciled-status-and-batch-payments) | Claude Code | 2026-10-07 |
| 13 | [New tools: `delete-payment` and `void-invoice`](#13-new-tools-delete-payment-and-void-invoice) | Claude Code | 2026-10-13 |
| 14 | [`list-payments` always shows the payment's account](#14-list-payments-always-shows-the-payments-account) | Claude Code | 2026-10-15 |
| 15 | [Tracking categories on manual journals, and visible on every invoice and journal line](#15-tracking-categories-on-manual-journals-and-visible-on-every-invoice-and-journal-line) | Claude Code | 2026-10-20 |

---

## 1. New tool: `upload-bank-transaction-attachment`

**Made by:** Codex, 2026-09-22

Attaches a local PDF or image (a receipt or invoice, for example) to an existing Xero bank transaction.

**How it behaves:**
- Accepts PDF, PNG, JPG, JPEG and GIF files, up to Xero's 10 MB per-file limit.
- Checks the file before contacting Xero: the path must be absolute, the file must not be empty, the filename must be valid for Xero, and the file's contents must match its extension (a `.pdf` must really be a PDF).
- After uploading, downloads the file back from Xero and compares it byte for byte to confirm the upload.
- If a file with the same name is already attached:
  - identical contents: reported as already attached, and nothing is uploaded again;
  - different contents: refused. The existing attachment is never overwritten.

**Files:**
- `src/tools/create/upload-bank-transaction-attachment.tool.ts` (new)
- `src/handlers/upload-xero-bank-transaction-attachment.handler.ts` (new)
- `src/handlers/__tests__/upload-xero-bank-transaction-attachment.test.ts` (new, 4 tests)
- `src/tools/create/index.ts`: registers the tool
- `src/clients/xero-client.ts`: adds the `accounting.attachments` scope to the granular (V2) scope list

**Setup note:** the Xero custom connection needs the `accounting.attachments` scope.

## 2. Upgrade `xero-node` SDK to 20.0.0

**Made by:** Codex, 2026-09-23

`xero-node` was upgraded from `^13.3.0` to `20.0.0` (pinned to that exact version). The new SDK changed some method signatures, so these calls were updated to match:

| File | Change |
|------|--------|
| `src/handlers/create-xero-invoice.handler.ts` | Pass the new `allowBackorders` argument (as `undefined`) |
| `src/handlers/update-xero-invoice.handler.ts` | Pass the new `allowBackorders` argument (as `undefined`) |
| `src/handlers/list-xero-bank-transactions.handler.ts` | Pass the new `references` argument (as `undefined`) |
| `src/tools/list/list-payroll-employee-leave-types.tool.ts` | Field renamed in the SDK: `hoursAccruedAnnually` became `unitsAccruedAnnually` |

Also changed: `package.json`, `package-lock.json`.

## 3. Fix "SubTotal/Total does not agree" when updating bank transactions

**Made by:** Claude Code, 2026-09-23

**Problem:** changing a bank transaction's amounts with `update-bank-transaction` failed with *"SubTotal/Total does not agree"*.

**Cause:** the handler downloads the existing transaction, copies all of its fields, swaps in the new line items and sends everything back. That included the old stored `subTotal`, `totalTax` and `total`, which no longer matched the new line items.

**Fix:** those three calculated totals are left out of the update, so Xero recalculates them from the line items. This follows the [`updateBankTransaction` API documentation](https://xeroapi.github.io/xero-node/accounting/index.html#api-Accounting-updateBankTransaction), which describes them as totals of the transaction.

**Files:** `src/handlers/update-xero-bank-transaction.handler.ts`

**Tested:** live against Xero, by changing a transaction's amount and then changing it back.

## 4. Tracking category support in `update-bank-transaction`

**Made by:** Claude Code, 2026-09-23

**Problem:** the update tool had no way to pass tracking categories. Xero replaces all line items on every update, so updating any line quietly removed its existing tracking.

**Changes:**
- Each line item now accepts an optional `tracking` list: up to 2 entries of `{ name, option, trackingCategoryID }`. This is the same format `create-invoice` and `update-invoice` already use.
- The tool's instructions tell the AI to resend a line's existing tracking unless the user asked to change it.
- `list-bank-transactions` (and other tools that list line items) now show a line's tracking in readable form, for example `Department: Investment Team (trackingCategoryID: ...)`. Before, they printed `[object Object]`, so existing tracking couldn't be read in order to keep it.

**Design note:** existing tracking is not copied over automatically. The tool receives replacement lines by position, with no line IDs, so the server can't reliably tell which new line matches which old one. If lines were reordered or split, automatic copying could put tracking on the wrong line.

**Files:**
- `src/tools/update/update-bank-transaction.tool.ts`
- `src/handlers/update-xero-bank-transaction.handler.ts`
- `src/helpers/format-line-item.ts`

**Tested:** live against Xero, by applying a tracking option and re-reading the transaction.

## 5. Keep the original app's "Go to [app]" button after updates

**Made by:** Claude Code, 2026-09-23

**Problem:** transactions created by another connected app show a button such as **"Go to Expense App"**. After an update through this server, the button changed to **"Go to MCP Server - …"**.

**Cause:** Xero names the button after whichever app last sent the transaction's `url` (its source-document link). Because the update copied every existing field, it re-sent the other app's link, and Xero then credited this server with it.

**Fix:** `url` is left out of the update, so Xero keeps the original link and the original app's name on the button.

**Limitation:** this can't repair a button that was already renamed. Only the original app can claim its link again.

**Files:** `src/handlers/update-xero-bank-transaction.handler.ts`

**Tested:** live against Xero. After updating a transaction created by another connected expense app, its button still read "Go to Expense App".

## 6. Descriptive History & Notes entry after each update

**Made by:** Claude Code, 2026-09-23

**Problem:** in a transaction's History & Notes, API updates only show Xero's generic entry, *"Received through the Xero API from [app]"*, with no detail of what changed. The API can't change the wording of that entry.

**Change:** after each successful update, the server adds a **note** to History & Notes describing what changed, for example:

> Updated via MCP server. Line 1: description changed from Jane Doe " Software subscription (Monthly)" to Software subscription (Monthly).

- The note compares the transaction **before** the update with what Xero **saved**, so it shows contact names rather than IDs, and Xero's final calculated totals.
- It covers type, contact, date, reference, each line's description, quantity, unit amount, account, tax type and tracking, lines added or removed, and the total.
- Line breaks in descriptions are collapsed onto one line, and long notes are cut short to stay within Xero's note length limit.
- If adding the note fails, the update is still reported as saved, with a warning explaining that the note couldn't be added.

**Files:**
- `src/helpers/describe-bank-transaction-changes.ts` (new)
- `src/helpers/__tests__/describe-bank-transaction-changes.test.ts` (new, 4 tests)
- `src/handlers/update-xero-bank-transaction.handler.ts`: posts the note using `createBankTransactionHistoryRecord`
- `src/tools/update/update-bank-transaction.tool.ts`: shows the note, or the warning, in the tool's reply

**Tested:** live against Xero, by confirming the note appears in History & Notes.

## 7. Version renamed to `0.0.17-fork.1`

**Made by:** Claude Code, 2026-09-23

`package.json` version changed from `0.0.17` to `0.0.17-fork.1`. The server reads its version when it starts and sends it to Xero in its user-agent (`xero-mcp-server-0.0.17-fork.1`). The `-fork.1` suffix marks this as a patched copy of upstream 0.0.17, so it won't be confused with a future official `0.0.18`.

## 8. Merged upstream `main` (payroll import shims, #165)

**Made by:** Claude Code, 2026-09-23

Merged upstream `main` at [`f24583c`](https://github.com/XeroAPI/xero-mcp-server/commit/f24583c) "refactor: add import shim layer for payroll types (#165)". This commit was on upstream `main` but not on the `bump-package-to-0.0.17` branch this fork was based on. It moves the payroll type imports into `src/types/payroll-nz-types.ts` and `src/types/payroll-au-types.ts`.

**Conflict:** `src/tools/list/list-payroll-employee-leave-types.tool.ts`. Both sides had renamed "Hours Accrued Annually" to "Units Accrued Annually". Upstream's version also adds "Type of Units" and removes a duplicate "Leave Type ID" line, so upstream's version was kept as is.

**Tested:** `npm run build` and `npm test` (22 tests) pass with `xero-node` 20.0.0.

## 9. New tool: `create-bank-transfer`

**Made by:** Codex, 2026-09-23

Creates a native Xero transfer between two bank or credit card accounts. For a credit card payment, Xero creates a receipt on the card account and a matching payment on the checking account. Bank feed statement lines can then be matched to these account transactions. The tool explicitly leaves both sides unreconciled.

**Inputs:** source and destination account IDs, a positive amount with at most two decimal places, a required date, and an optional reference. The same request uses a stable idempotency key to protect against a retry creating another transfer.

**Output:** the transfer ID, both bank transaction IDs, reconciliation status, and links to both account transactions.

**Files:** `src/handlers/create-xero-bank-transfer.handler.ts`, `src/tools/create/create-bank-transfer.tool.ts`, `src/tools/create/index.ts`, and a focused handler test. The local version is now `0.0.17-fork.2`.

**Tested:** `npm run build`, `npm run lint`, and `npm test` (24 tests) pass. A fresh local MCP server advertises the new tool. Read back an existing reference transfer and a new credit card payment in a live organisation through Xero's transfer and bank transaction APIs. The new card entry is `RECEIVE-TRANSFER`, the checking entry is `SPEND-TRANSFER`, and both are unreconciled.

## 10. Turn tools off per connection with `XERO_DISABLED_TOOLS`

**Made by:** Claude Code, 2026-09-25

Each MCP client connection can now leave out tools it does not need. Set `XERO_DISABLED_TOOLS` in that connection's `env` to a comma-separated list of group names and/or individual tool names, for example `"payroll, quotes, items"` or `"delete-timesheet"`. Matching ignores case and spaces. Unknown entries are skipped with a warning on stderr. If the variable is not set, every tool is registered as before.

**Groups:** `payroll` (the 14 payroll employee, leave and timesheet tools), `quotes` (3 tools), `items` (3 tools).

**Why:** fewer tools means a shorter tool list for the AI to choose from, less context used when tool definitions are loaded, and no accidental use of tools a connection should not touch.

**Files:** new `src/tools/tool-filter.ts` (group table and matching), `src/tools/tool-factory.ts` (filters before registering), and `src/tools/__tests__/tool-filter.test.ts`. No individual tool files changed.

**Tested:** `npm run build`, `npm test` (27 tests) and eslint on the changed files pass. A fresh local server lists 53 tools with the variable unset and 33 with `"payroll, quotes, items"`, with none of the 20 disabled tools remaining.


## 11. New tool: `upload-invoice-attachment`

**Made by:** Claude Code, 2026-10-05

Attaches a local PDF or image to an existing Xero invoice or bill (bills are invoices of type `ACCPAY`), including drafts. This lets an AI client create a draft bill with `create-invoice` and then attach the supplier's invoice to it.

**How it behaves:**
- Same file checks, duplicate handling and download-and-compare verification as `upload-bank-transaction-attachment` (change 1).
- Reads the invoice first, so a wrong ID fails before anything is uploaded, and the result reports the invoice number, type and contact.
- `includeOnline` (whether a customer sees the file on the online invoice) is always off for bills, and off for sales invoices unless explicitly requested.

**Files:**
- `src/helpers/attachment-file.ts` (new): the file checks, moved out of the bank transaction attachment handler so both tools share them. No behaviour change for the bank tool.
- `src/handlers/upload-xero-invoice-attachment.handler.ts` (new)
- `src/tools/create/upload-invoice-attachment.tool.ts` (new)
- `src/handlers/__tests__/upload-xero-invoice-attachment.test.ts` (new, 7 tests)
- `src/handlers/upload-xero-bank-transaction-attachment.handler.ts`: imports the shared checks
- `src/tools/create/index.ts`: registers the tool

No new Xero scope is needed: `accounting.attachments` (change 1) covers invoice attachments. The tool is not in any `XERO_DISABLED_TOOLS` group. Version is now `0.0.17-fork.3`.

**Tested:** `npm run build` and `npm test` (34 tests) pass. Live: attached a PDF to a new draft bill, confirmed it by download; a second upload of the same file was reported as already attached and not duplicated.


## 12. `list-payments` shows reconciled status and batch payments

**Made by:** Claude Code, 2026-10-07

`list-payments` now prints two more things Xero already sends back for each payment:
- `Reconciled: Yes/No` (whether the payment is matched to a bank statement line). This line was already in the working copy, uncommitted, before this entry; it is recorded here so it isn't lost.
- When the payment is part of a Xero **batch payment** (one bank payment that pays several bills): `Batch Payment ID`, `Batch Total` and, when set, `Batch Reference`. Bills paid in the same batch share the same Batch Payment ID.

There is no separate batch payments tool: this is enough to tell which bills one bank payment covered.

**Files:** `src/tools/list/list-payments.tool.ts`

**Tested:** `npm run build` and `npm test` (34 tests) pass. Live: three bills from one supplier, paid together by a single bank wire, each show the same Batch Payment ID, with a Batch Total equal to the wire amount.


## 13. New tools: `delete-payment` and `void-invoice`

**Made by:** Claude Code, 2026-10-13

**Why:** in the expense report workflow, the expense app syncs approved employee expenses into Xero as one bill with a payment already applied. To keep the books consistent, that payment is removed, the bill is voided, and the expenses are recreated as separate supplier bills. `update-invoice` only works on draft bills, and no tool could remove a payment or void a bill, so a scheduled routine couldn't do the first two steps.

**`delete-payment`** (input: `paymentId`)
- Deletes the payment through Xero's Payments endpoint, which works by setting the payment's status to `DELETED`. This removes it from the bill or invoice it paid.
- Reads the payment first and refuses if it is reconciled to a bank statement line (it must be unreconciled in Xero first), already deleted, or part of a batch payment. A batch payment is one bank payment covering several bills; Xero only removes it as a whole batch, which would unpay every bill in it, so that is left to a person in Xero. Nothing is sent to Xero in those cases.
- Reads the payment again afterwards and shows it **before** and **after**: invoice number and ID, contact, amount, date, status, reconciled.

**`void-invoice`** (input: `invoiceId`)
- Sets an invoice or bill's status to `VOIDED`.
- Only for invoices that are Awaiting Approval (`SUBMITTED`) or Awaiting Payment (`AUTHORISED`). Drafts are refused (drafts are deleted, not voided), as are invoices still carrying a payment; the message names the payment ID to remove with `delete-payment`. If Xero rejects the void for another reason, its own error text is shown.
- Returns the status change and a deep link to the bill or invoice in Xero.

**Safety:** both actions are irreversible in Xero. Both tool descriptions tell the AI to show the user the specific payment or bill and get explicit confirmation before **every** call, and never to act on several items with one confirmation. Neither tool is in an `XERO_DISABLED_TOOLS` group; a connection can turn them off by name (change 10).

**Files:**
- `src/handlers/delete-xero-payment.handler.ts` (new)
- `src/handlers/void-xero-invoice.handler.ts` (new)
- `src/tools/delete/delete-payment.tool.ts` (new), registered in `src/tools/delete/index.ts`
- `src/tools/update/void-invoice.tool.ts` (new), registered in `src/tools/update/index.ts`
- `src/handlers/__tests__/delete-payment-and-void-invoice.test.ts` (new, 8 tests)
- `README.md`: version and tool list
- `package.json`, `package-lock.json`: version is now `0.0.17-fork.4`

No new Xero scope is needed: both use the accounting transactions scope that `update-invoice` and `create-payment` already use.

**Tested:** `npm run build`, `npm test` (42 tests) and eslint on the new files pass. A fresh local build lists 56 tools, including both new ones. Not yet tested live against Xero.


## 14. `list-payments` always shows the payment's account

**Made by:** Claude Code, 2026-10-15

**Why:** Xero's Payments endpoint returns the payment's account with only its code and ID (no name), so the existing `Account:` line never printed. The expense report tracker needs to tell a bank payment (which gets reconciled) from one booked to another account, e.g. an intercompany "Due to/from" account, which has no bank line and is never marked reconciled.

**Change:** prints `Account: <name if any>, Code <code> (<accountID>)` whenever Xero sends any of the three.

**Files:** `src/tools/list/list-payments.tool.ts`

**Tested:** `npm run build` and `npm test` (42 tests) pass. Live (2026-10-15, after an app restart): a batch payment booked to an intercompany account prints `Account: Code <code> (<accountID>)`.


## 15. Tracking categories on manual journals, and visible on every invoice and journal line

**Made by:** Claude Code, 2026-10-20

**Why:** manual journals could not carry tracking categories at all (upstream left "tracking can be added here" placeholders). Each Xero organisation has its own tracking categories, and updates replace every line, so the AI also needs to *see* a line's existing tracking before it edits anything, or the tags are silently removed.

**Change:**
- `create-manual-journal` and `update-manual-journal` accept an optional `tracking` list (max 2: `name`, `option`, `trackingCategoryID`) on each journal line and pass it to Xero.
- New helper `formatTracking` prints tracking as `Name: Option (trackingCategoryID: …)`, or `None`. `formatLineItem` (invoices, bank transactions) now uses it, so invoice and journal lines read the same.
- Tracking is printed on every line by `list-manual-journals`, `create-manual-journal` and `update-manual-journal`. `create-invoice` and `update-invoice` now print their line items (with tracking). `list-invoices` already did when `invoiceNumbers` is passed; its description now says so.
- Tool descriptions (`list-tracking-categories`, create/update invoice, create/update manual journal) say categories and IDs differ per organisation, so always look them up on the organisation in use and never reuse an ID from another. The two update tools say to resend each line's existing tracking. `update-invoice` previously said to use tracking "only if prompted", which would drop existing tags on any edit.
- Fixes `create-manual-journal` printing journal lines as `[object Object]`.

**Files:** `src/helpers/format-tracking.ts` (new), `src/helpers/__tests__/format-tracking.test.ts` (new), `src/helpers/format-line-item.ts`, `src/handlers/create-xero-manual-journal.handler.ts`, `src/handlers/update-xero-manual-journal.handler.ts`, `src/tools/create/create-manual-journal.tool.ts`, `src/tools/update/update-manual-journal-tool.ts`, `src/tools/list/list-manual-journals.tool.ts`, `src/tools/create/create-invoice.tool.ts`, `src/tools/update/update-invoice.tool.ts`, `src/tools/list/list-invoices.tool.ts`, `src/tools/list/list-tracking-categories.tool.ts`; `package.json`, `package-lock.json`, `README.md`: version is now `0.0.17-fork.5` (covers changes 14 and 15)

**Tested:** `npm run build`, `npm test` (44 tests) and eslint on the changed files pass. Live, read-only (2026-10-20, after an app restart): `list-tracking-categories` on seven organisations returned each one's own categories (0 to 2 per organisation, with different names); `list-manual-journals` printed each line's tracking (tagged and `None` lines on the same journal); `list-invoices` with `invoiceNumbers` printed `Tracking: None` on an untagged bill. Live write (same day): `create-manual-journal` made a 1.00 draft journal with one tagged and one untagged line; both the create output and a separate `list-manual-journals` read-back showed the tag on the first line and `None` on the second. `update-manual-journal` with tracking not yet tested live.


---

## Upgrading to a newer upstream version

Upstream updates are **merged** into `main-forked`, not rebased, so history that has already been pushed is never rewritten.

1. Fetch upstream: `git fetch upstream`.
2. Bring the fork's `main` up to date with upstream `main` (GitHub's "Sync fork" button, or `gh repo sync <fork> -b main`).
3. Preview conflicts: `git merge-tree --write-tree --name-only main-forked upstream/main`.
4. On `main-forked`, run `git merge --no-ff --no-commit upstream/main` and resolve any conflicts. If upstream has made the same fix as a fork change, keep upstream's version and note the fork change as no longer needed.
5. Run `npm install`, `npm run build` and `npm test`. This fork uses `xero-node` 20.0.0, which is newer than upstream's version, so check that new upstream code still compiles against it.
6. Add an entry to this file: the upstream commit merged, any conflicts and how they were resolved, and test results. Then commit the merge.
7. Restart the MCP clients and test live against Xero before pushing.
8. Push with a normal `git push origin main-forked`. No force-push is needed.
9. If upstream released a new version, bump this fork to `<new upstream version>-fork.1`.
