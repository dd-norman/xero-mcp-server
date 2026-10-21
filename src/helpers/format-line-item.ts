import { LineItem } from "xero-node";
import { formatTracking } from "./format-tracking.js";

export const formatLineItem = (lineItem: LineItem): string => {
  return [
    `Item ID: ${lineItem.item}`,
    `Item Code: ${lineItem.itemCode}`,
    `Description: ${lineItem.description}`,
    `Quantity: ${lineItem.quantity}`,
    `Unit Amount: ${lineItem.unitAmount}`,
    `Account Code: ${lineItem.accountCode}`,
    `Tax Type: ${lineItem.taxType}`,
    `Tracking: ${formatTracking(lineItem.tracking)}`,
    `Line Amount: ${lineItem.lineAmount}`,
  ].join("\n");
};
