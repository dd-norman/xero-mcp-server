import { LineItem } from "xero-node";

export const formatLineItem = (lineItem: LineItem): string => {
  return [
    `Item ID: ${lineItem.item}`,
    `Item Code: ${lineItem.itemCode}`,
    `Description: ${lineItem.description}`,
    `Quantity: ${lineItem.quantity}`,
    `Unit Amount: ${lineItem.unitAmount}`,
    `Account Code: ${lineItem.accountCode}`,
    `Tax Type: ${lineItem.taxType}`,
    `Tracking: ${lineItem.tracking?.length
      ? lineItem.tracking
        .map((t) => `${t.name}: ${t.option} (trackingCategoryID: ${t.trackingCategoryID})`)
        .join("; ")
      : "None"}`,
    `Line Amount: ${lineItem.lineAmount}`,
  ].join("\n");
};
