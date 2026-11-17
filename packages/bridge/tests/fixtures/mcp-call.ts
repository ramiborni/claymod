/**
 * A minimal agent for end-to-end tests: starts `claymod-bridge mcp` like Claude Code would,
 * calls one tool and prints { isError, text } as JSON.
 * Usage: bun mcp-call.ts <tool> '<json arguments>'
 */
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [tool = "", rawArgs = "{}"] = process.argv.slice(2);
const client = new Client({ name: "claymod-e2e", version: "1.0.0" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [join(import.meta.dir, "../../src/cli.ts"), "mcp"],
    env: Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
    ),
    stderr: "inherit",
  }),
);
const result = await client.callTool({ name: tool, arguments: JSON.parse(rawArgs) }, undefined, {
  timeout: 200_000,
});
const text = (result.content as { type: string; text?: string }[])
  .map((c) => c.text ?? "")
  .join("\n");
process.stdout.write(JSON.stringify({ isError: Boolean(result.isError), text }));
await client.close();
