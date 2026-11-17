import { MOD_RULES, modDraftJsonSchema } from "@claymod/core";
import { type AgentResult, type AgentToolName, agentToolArgs } from "@claymod/core/bridge-protocol";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type CallClaymod = (
  tool: AgentToolName,
  args: unknown,
  client: string,
) => Promise<AgentResult>;

const INTRO = `Claymod changes how websites look and work with small "mods" (CSS and/or JavaScript) that the Claymod Chrome extension re-applies on every visit, with no AI calls.

How to use these tools:
1. get_active_page: the page the user has open in Chrome (URL and a DOM outline).
2. Write a mod for what the user asked, following the rules below.
3. preview_mod: the user sees your request in Claymod's side panel and decides. If they haven't opened it, ask them to click the Claymod icon in Chrome's toolbar.
4. save_mod: keeps the mod; the user reviews and approves it again. Pass "replaces" with a mod's id to update an existing mod (it becomes the next version).
Use list_mods and get_mod_status to see existing mods and whether their checks still match the page.`;

export function serverInstructions(): string {
  return `${INTRO}\n\n${MOD_RULES}\n\nJSON Schema of a mod:\n${JSON.stringify(modDraftJsonSchema())}`;
}

function toToolResult(tool: AgentToolName, result: AgentResult): CallToolResult {
  if (!result.ok) return { isError: true, content: [{ type: "text", text: result.error }] };
  const value = result.value as Record<string, unknown> | null;
  if (tool === "get_active_page" && value && typeof value.page === "string") {
    const header = `Tab ${String(value.tabId)}: ${String(value.title)}\n${String(value.url)}`;
    return { content: [{ type: "text", text: `${header}\n\n${value.page}` }] };
  }
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

const TOOLS: Record<AgentToolName, { title: string; description: string; readOnly: boolean }> = {
  get_active_page: {
    title: "Get the active page",
    description:
      "Returns the URL, title and a DOM outline of the page open in the user's active Chrome tab. Claymod can read a page after the user clicks its toolbar icon on it, or on sites where they kept a mod.",
    readOnly: true,
  },
  list_mods: {
    title: "List mods",
    description:
      "Lists the user's mods (id, name, sites, enabled, health), optionally for one site.",
    readOnly: true,
  },
  get_mod_status: {
    title: "Get a mod's status",
    description:
      "Returns one mod's code, whether it's enabled, and its health: needs-repair means its check selectors stopped matching the site.",
    readOnly: true,
  },
  preview_mod: {
    title: "Preview a mod",
    description:
      "Asks the user to preview a mod on their active tab. Waits for them to accept or decline in Claymod's side panel, then returns their choice. Invalid mods come back with the issues to fix.",
    readOnly: false,
  },
  save_mod: {
    title: "Save a mod",
    description:
      "Asks the user to review and keep a mod (or a new version of an existing one). Waits for their decision in Claymod's side panel and returns it, with the saved mod's id.",
    readOnly: false,
  },
};

/** The MCP server agents start with `claymod-bridge mcp`; every tool goes to the extension. */
export function createMcpServer(call: CallClaymod, version: string): McpServer {
  const server = new McpServer(
    { name: "claymod", version },
    { instructions: serverInstructions() },
  );
  for (const [name, tool] of Object.entries(TOOLS) as [
    AgentToolName,
    (typeof TOOLS)[AgentToolName],
  ][]) {
    server.registerTool(
      name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: agentToolArgs[name],
        annotations: { readOnlyHint: tool.readOnly, destructiveHint: false, openWorldHint: false },
      },
      async (args: unknown) => {
        const client = server.server.getClientVersion()?.name ?? "An agent";
        return toToolResult(name, await call(name, args, client));
      },
    );
  }
  return server;
}
