import { BankTransaction, LineItem } from "xero-node";

// Keep notes within Xero's history note length limit.
const MAX_NOTE_LENGTH = 2500;

const formatDate = (value: unknown): string => {
  if (!value) return "(none)";
  const date = value instanceof Date ? value : new Date(String(value));
  return isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
};

const formatAmount = (value: number | undefined): string =>
  value === undefined ? "(none)" : value.toFixed(2);

// Collapse line breaks and repeated spaces so the note reads as one line.
const formatText = (value: string | undefined): string =>
  value?.trim() ? value.replace(/\s+/g, " ").trim() : "(blank)";

const describeChange = (label: string, oldValue: string, newValue: string): string =>
  `${label} changed from ${oldValue} to ${newValue}`;

const formatTracking = (lineItem: LineItem): string =>
  lineItem.tracking?.length
    ? lineItem.tracking.map((t) => `${t.name}: ${t.option}`).join(", ")
    : "(none)";

const describeLineItem = (lineItem: LineItem): string =>
  [
    formatText(lineItem.description),
    `qty ${lineItem.quantity}`,
    `unit ${formatAmount(lineItem.unitAmount)}`,
    `account ${lineItem.accountCode}`,
    `tax ${lineItem.taxType}`,
    `tracking ${formatTracking(lineItem)}`,
  ].join(", ");

const describeLineItemChanges = (before: LineItem, after: LineItem): string[] => {
  const fields: [string, string, string][] = [
    ["description", formatText(before.description), formatText(after.description)],
    ["quantity", String(before.quantity), String(after.quantity)],
    ["unit amount", formatAmount(before.unitAmount), formatAmount(after.unitAmount)],
    ["account", String(before.accountCode), String(after.accountCode)],
    ["tax type", String(before.taxType), String(after.taxType)],
    ["tracking", formatTracking(before), formatTracking(after)],
  ];

  return fields
    .filter(([, oldValue, newValue]) => oldValue !== newValue)
    .map(([label, oldValue, newValue]) => describeChange(label, oldValue, newValue));
};

/**
 * Builds a plain-English history note describing what an update changed,
 * by comparing the transaction before the update with Xero's response after it.
 */
export const describeBankTransactionChanges = (
  before: BankTransaction,
  after: BankTransaction,
): string => {
  const changes: string[] = [];

  const headerFields: [string, string, string][] = [
    ["Type", String(before.type), String(after.type)],
    ["Contact", before.contact?.name ?? "(none)", after.contact?.name ?? "(none)"],
    ["Date", formatDate(before.date), formatDate(after.date)],
    ["Reference", formatText(before.reference), formatText(after.reference)],
  ];

  for (const [label, oldValue, newValue] of headerFields) {
    if (oldValue !== newValue) changes.push(describeChange(label, oldValue, newValue));
  }

  // Lines are compared by position, since the update tool replaces all lines.
  const beforeLines = before.lineItems ?? [];
  const afterLines = after.lineItems ?? [];
  const lineCount = Math.max(beforeLines.length, afterLines.length);

  for (let i = 0; i < lineCount; i++) {
    const oldLine = beforeLines[i];
    const newLine = afterLines[i];

    if (oldLine && !newLine) {
      changes.push(`Line ${i + 1} removed: ${describeLineItem(oldLine)}`);
    } else if (!oldLine && newLine) {
      changes.push(`Line ${i + 1} added: ${describeLineItem(newLine)}`);
    } else if (oldLine && newLine) {
      const lineChanges = describeLineItemChanges(oldLine, newLine);
      if (lineChanges.length) changes.push(`Line ${i + 1}: ${lineChanges.join("; ")}`);
    }
  }

  if (before.total !== after.total) {
    changes.push(describeChange("Total", formatAmount(before.total), formatAmount(after.total)));
  }

  const note = changes.length
    ? `Updated via MCP server. ${changes.join(". ")}.`
    : "Updated via MCP server. No field values changed.";

  return note.length > MAX_NOTE_LENGTH ? `${note.slice(0, MAX_NOTE_LENGTH - 3)}...` : note;
};
