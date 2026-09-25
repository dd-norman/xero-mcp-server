// Lets each MCP client connection turn off tools it doesn't need, via the
// XERO_DISABLED_TOOLS environment variable: a comma-separated list of group
// names and/or individual tool names, e.g. "payroll, quotes, delete-timesheet".

export const TOOL_GROUPS: Record<string, string[]> = {
  payroll: [
    "list-payroll-employees",
    "list-payroll-leave-types",
    "list-payroll-employee-leave",
    "list-payroll-employee-leave-balances",
    "list-payroll-employee-leave-types",
    "list-payroll-leave-periods",
    "list-timesheets",
    "get-timesheet",
    "create-timesheet",
    "add-timesheet-line",
    "update-timesheet-line",
    "approve-timesheet",
    "revert-timesheet",
    "delete-timesheet",
  ],
  quotes: ["list-quotes", "create-quote", "update-quote"],
  items: ["list-items", "create-item", "update-item"],
};

export function getDisabledToolNames(
  setting: string | undefined,
  allToolNames: string[],
): Set<string> {
  const disabled = new Set<string>();
  if (!setting) return disabled;

  const known = new Set(allToolNames);
  for (const entry of setting.split(",")) {
    const name = entry.trim().toLowerCase();
    if (!name) continue;

    if (TOOL_GROUPS[name]) {
      TOOL_GROUPS[name].forEach((tool) => disabled.add(tool));
    } else if (known.has(name)) {
      disabled.add(name);
    } else {
      // stderr, not stdout: stdout carries the MCP protocol messages.
      console.error(
        `XERO_DISABLED_TOOLS: ignoring unknown group or tool "${name}"`,
      );
    }
  }
  return disabled;
}
