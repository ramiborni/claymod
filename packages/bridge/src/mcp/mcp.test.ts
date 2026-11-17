import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentCall } from "@claymod/core/bridge-protocol";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAgentLink } from "../host/agent-link";
import { callLink, NOT_LISTENING } from "./link-client";
import { startLinkServer } from "./link-server";
import { type CallClaymod, createMcpServer } from "./server";

const dirs: string[] = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "claymod-link-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function target(dir: string) {
  return { socket: join(dir, "mcp.sock"), tokenFile: join(dir, "mcp-token"), dir };
}

describe("link socket", () => {
  test("answers calls that carry the token; files are user-only", async () => {
    const dir = tempDir();
    const t = target(dir);
    const server = await startLinkServer({
      ...t,
      platform: "linux",
      onCall: async (tool, args, client) => ({ ok: true, value: { tool, args, client } }),
    });
    const result = await callLink(
      t,
      { tool: "list_mods", args: { site: "a.com" }, client: "test" },
      2_000,
    );
    expect(result).toEqual({
      ok: true,
      value: { tool: "list_mods", args: { site: "a.com" }, client: "test" },
    });
    expect(statSync(t.tokenFile).mode & 0o777).toBe(0o600);
    expect(statSync(t.socket).mode & 0o077).toBe(0);
    expect(statSync(dir).mode & 0o077).toBe(0);
    await server.close();
  });

  test("rejects a wrong token", async () => {
    const t = target(tempDir());
    const server = await startLinkServer({
      ...t,
      platform: "linux",
      onCall: async () => ({ ok: true, value: 1 }),
    });
    writeFileSync(t.tokenFile, "not-the-token");
    const result = await callLink(t, { tool: "list_mods", args: {}, client: "x" }, 2_000);
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.error).toContain("Wrong token");
    await server.close();
  });

  test("says how to turn agent access on when nothing is listening", async () => {
    const t = target(tempDir());
    expect(await callLink(t, { tool: "list_mods", args: {}, client: "x" }, 2_000)).toEqual({
      ok: false,
      error: NOT_LISTENING,
    });
    writeFileSync(t.tokenFile, "stale");
    expect(await callLink(t, { tool: "list_mods", args: {}, client: "x" }, 2_000)).toEqual({
      ok: false,
      error: NOT_LISTENING,
    });
  });

  test("closing removes the socket and the token", async () => {
    const t = target(tempDir());
    const server = await startLinkServer({
      ...t,
      platform: "linux",
      onCall: async () => ({ ok: true, value: 1 }),
    });
    await server.close();
    expect(() => statSync(t.tokenFile)).toThrow();
    expect(() => statSync(t.socket)).toThrow();
  });
});

describe("agent link", () => {
  test("turns socket calls into agentCall messages and results back into answers", async () => {
    const t = target(tempDir());
    const pushed: AgentCall[] = [];
    const link = createAgentLink({
      ...t,
      platform: "linux",
      push: (message) => {
        pushed.push(message);
        queueMicrotask(() => link.resolve(message.callId, { ok: true, value: "done" }));
        return true;
      },
    });
    expect(await link.start()).toEqual({ ok: true, value: { socket: t.socket } });
    const result = await callLink(
      t,
      { tool: "save_mod", args: { mod: {} }, client: "codex" },
      2_000,
    );
    expect(result).toEqual({ ok: true, value: "done" });
    expect(pushed[0]).toMatchObject({ type: "agentCall", tool: "save_mod", client: "codex" });
    await link.close();
  });

  test("times out, and closing answers calls that are still waiting", async () => {
    const t = target(tempDir());
    const link = createAgentLink({ ...t, platform: "linux", push: () => true, timeoutMs: 50 });
    await link.start();
    const timedOut = await callLink(t, { tool: "list_mods", args: {}, client: "x" }, 2_000);
    expect(timedOut.ok ? "" : timedOut.error).toContain("didn't answer in time");
    await link.close();
  });
});

async function connectedClient(call: CallClaymod) {
  const server = createMcpServer(call, "9.9.9");
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-agent", version: "1.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

describe("MCP server", () => {
  test("lists the five tools with instructions that carry the mod rules", async () => {
    const client = await connectedClient(async () => ({ ok: true, value: null }));
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "get_active_page",
      "get_mod_status",
      "list_mods",
      "preview_mod",
      "save_mod",
    ]);
    expect(tools.find((tool) => tool.name === "list_mods")?.annotations?.readOnlyHint).toBe(true);
    expect(client.getInstructions()).toContain("prefer stable selectors");
    expect(client.getInstructions()).toContain('"checks"');
  });

  test("forwards arguments and the client's name", async () => {
    const calls: unknown[] = [];
    const client = await connectedClient(async (tool, args, name) => {
      calls.push({ tool, args, name });
      return { ok: true, value: { status: "declined" } };
    });
    const result = await client.callTool({
      name: "preview_mod",
      arguments: { mod: { name: "x" } },
    });
    expect(calls).toEqual([
      { tool: "preview_mod", args: { mod: { name: "x" } }, name: "test-agent" },
    ]);
    expect(result.content).toEqual([{ type: "text", text: '{\n  "status": "declined"\n}' }]);
  });

  test("shows the page as readable text", async () => {
    const client = await connectedClient(async () => ({
      ok: true,
      value: { tabId: 3, url: "https://a.com/", title: "A", page: "<page_snapshot>…" },
    }));
    const result = await client.callTool({ name: "get_active_page", arguments: {} });
    expect(result.content).toEqual([
      { type: "text", text: "Tab 3: A\nhttps://a.com/\n\n<page_snapshot>…" },
    ]);
  });

  test("returns Claymod's errors as tool errors", async () => {
    const client = await connectedClient(async () => ({ ok: false, error: NOT_LISTENING }));
    const result = await client.callTool({ name: "list_mods", arguments: {} });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: "text", text: NOT_LISTENING }]);
  });

  test("rejects arguments that don't match the tool", async () => {
    const client = await connectedClient(async () => ({ ok: true, value: null }));
    const result = await client.callTool({ name: "get_mod_status", arguments: {} });
    expect(result.isError).toBe(true);
  });
});

describe("agent link start", () => {
  test("two serve requests at once share one socket", async () => {
    const t = target(tempDir());
    const link = createAgentLink({ ...t, platform: "linux", push: () => true });
    const [a, b] = await Promise.all([link.start(), link.start()]);
    expect(a.ok && b.ok).toBe(true);
    await link.close();
  });

  test("a newer host takes over the socket of an older one", async () => {
    const t = target(tempDir());
    const older = createAgentLink({ ...t, platform: "linux", push: () => true });
    const newer = createAgentLink({ ...t, platform: "linux", push: () => true });
    expect((await older.start()).ok).toBe(true);
    expect((await newer.start()).ok).toBe(true);
    // The older host shutting down must not remove the newer host's socket and token.
    await older.close();
    expect(statSync(t.socket).isSocket()).toBe(true);
    const answered = await callLink(t, { tool: "list_mods", args: {}, client: "x" }, 300);
    expect(answered.ok ? "" : answered.error).toContain("didn't answer in time");
    await newer.close();
  });
});
