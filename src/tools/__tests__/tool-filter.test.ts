import { describe, expect, it, vi } from "vitest";

import { getDisabledToolNames, TOOL_GROUPS } from "../tool-filter.js";

const allTools = [
  ...Object.values(TOOL_GROUPS).flat(),
  "list-invoices",
  "create-invoice",
];

describe("getDisabledToolNames", () => {
  it("disables nothing when the setting is missing or empty", () => {
    expect(getDisabledToolNames(undefined, allTools).size).toBe(0);
    expect(getDisabledToolNames("", allTools).size).toBe(0);
  });

  it("expands group names and accepts single tool names", () => {
    const disabled = getDisabledToolNames(" Quotes , create-invoice ", allTools);
    expect([...disabled].sort()).toEqual(
      ["create-invoice", "create-quote", "list-quotes", "update-quote"],
    );
  });

  it("ignores unknown entries with a warning on stderr", () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const disabled = getDisabledToolNames("payrol", allTools);
    expect(disabled.size).toBe(0);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
