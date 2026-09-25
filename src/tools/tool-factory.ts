import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { CreateTools } from "./create/index.js";
import { DeleteTools } from "./delete/index.js";
import { GetTools } from "./get/index.js";
import { ListTools } from "./list/index.js";
import { UpdateTools } from "./update/index.js";
import { getDisabledToolNames } from "./tool-filter.js";

export function ToolFactory(server: McpServer) {
  const tools = [
    ...DeleteTools,
    ...GetTools,
    ...CreateTools,
    ...ListTools,
    ...UpdateTools,
  ].map((tool) => tool());

  const disabled = getDisabledToolNames(
    process.env.XERO_DISABLED_TOOLS,
    tools.map((tool) => tool.name),
  );

  tools
    .filter((tool) => !disabled.has(tool.name))
    .forEach((tool) =>
      server.tool(tool.name, tool.description, tool.schema, tool.handler),
    );
}
