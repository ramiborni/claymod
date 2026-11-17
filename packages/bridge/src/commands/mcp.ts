import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Command } from "../context";
import { AGENT_CALL_TIMEOUT_MS } from "../host/agent-link";
import { callLink } from "../mcp/link-client";
import { linkPaths } from "../mcp/link-paths";
import { createMcpServer } from "../mcp/server";

export const MCP_HELP = `Usage: claymod-bridge mcp

An MCP server (stdio) that lets an agent read the page open in Chrome, list mods, and ask you to
preview or save a mod. Turn on “Let agents use Claymod (MCP)” in Claymod settings first.

  Claude Code:  claude mcp add claymod -- claymod-bridge mcp
  Codex:        codex mcp add claymod -- claymod-bridge mcp
  OpenCode:     see docs/mcp.md`;

/** Runs until the agent closes stdin. stdout carries MCP messages only; logs go to stderr. */
export const mcp: Command = async (args, context) => {
  if (args.includes("--help") || args.includes("-h")) {
    context.out(MCP_HELP);
    return 0;
  }
  const paths = linkPaths(context);
  const server = createMcpServer(
    (tool, toolArgs, client) =>
      callLink(
        { socket: paths.socket, tokenFile: paths.token },
        { tool, args: toolArgs, client },
        AGENT_CALL_TIMEOUT_MS,
      ),
    context.version,
  );
  const transport = new StdioServerTransport();
  const closed = new Promise<void>((resolve) => {
    transport.onclose = resolve;
  });
  await server.connect(transport);
  await closed;
  return 0;
};
