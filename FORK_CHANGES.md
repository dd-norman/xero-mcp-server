# Fork changes

This fork of the official [XeroAPI/xero-mcp-server](https://github.com/XeroAPI/xero-mcp-server) adds bank transaction fixes and features. This file records every change made on top of upstream, so the changes can be re-applied when upgrading to a newer upstream release.

**Current version:** `0.0.17-fork.1`, which is upstream `0.0.17` plus fork patch set 1.

## Base version

| | |
|---|---|
| Upstream commit | [`6d30b75`](https://github.com/XeroAPI/xero-mcp-server/commit/6d30b75) "upgrade dependencies" |
| Upstream branch | `bump-package-to-0.0.17` (not yet merged into upstream `main` or released when this fork was patched) |
| Upstream version | `0.0.17` |

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

---

## Upgrading to a newer upstream version

1. Fetch the new upstream release from `XeroAPI/xero-mcp-server`.
2. Re-apply the changes above. Changes 3–6 all live in the bank transaction update handler and tool, plus the two helper files.
3. Check whether upstream has fixed any of the same issues. If it has, drop that patch rather than applying it twice.
4. Run `npm install`, `npm run build` and `npm test`.
5. Bump the version to `<new upstream version>-fork.1`, and add an entry to this file.
