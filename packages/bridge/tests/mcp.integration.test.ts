/**
 * M5 end to end on the bridge side: an agent (the MCP SDK client) starts `claymod-bridge mcp`,
 * which reaches the native host Chrome started, which forwards the call to the extension. This
 * test plays the extension: it answers the host's agentCall messages over native messaging.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentCall } from "@claymod/core/bridge-protocol";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { encodeFrame, FrameDecoder } from "../src/host/framing";

const ID = "abcdefghijklmnopabcdefghijklmnop";
const CLI = join(import.meta.dir, "../src/cli.ts");
let root = "";
let home = "";
const env = () => ({
  HOME: home,
  PATH: "/usr/bin:/bin",
  CLAYMOD_BRIDGE_NO_KEYCHAIN: "1",
  TMPDIR: root,
});

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "claymod-mcp-it-"));
  home = join(root, "home");
  mkdirSync(home);
  const install = Bun.spawnSync([process.execPath, CLI, "install", "--extension-id", ID], {
    env: env(),
  });
  expect(install.exitCode).toBe(0);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** The native host as Chrome starts it, with this test answering as the extension. */
function startExtensionSide(answer: (call: AgentCall) => unknown) {
  const manifest = JSON.parse(
    readFileSync(
      join(home, ".config/google-chrome/NativeMessagingHosts/claymod.bridge.json"),
      "utf8",
    ),
  );
  const host = Bun.spawn([manifest.path, `chrome-extension://${ID}/`], {
    env: env(),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
  });
  const send = (message: unknown) => {
    const encoded = encodeFrame(message);
    if (!encoded.ok) throw new Error("too large");
    host.stdin.write(encoded.frame);
    host.stdin.flush();
  };
  const responses: { id: string; ok: boolean; value?: unknown }[] = [];
  const decoder = new FrameDecoder();
  void (async () => {
    for await (const chunk of host.stdout) {
      for (const frame of decoder.push(chunk)) {
        if (!frame.ok) continue;
        const message = frame.message as AgentCall & { id: string; ok: boolean };
        if (message.type === "agentCall") {
          send({
            type: "agentResult",
            id: `r-${message.callId}`,
            callId: message.callId,
            result: { ok: true, value: answer(message) },
          });
        } else {
          responses.push(message);
        }
      }
    }
  })();
  return {
    send,
    async served() {
      for (let i = 0; i < 200 && !responses.some((r) => r.id === "serve"); i++) await Bun.sleep(20);
      return responses.find((r) => r.id === "serve");
    },
    async close() {
      await host.stdin.end();
      return host.exited;
    },
  };
}

async function agent() {
  const client = new Client({ name: "integration-agent", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [CLI, "mcp"],
      env: env(),
      stderr: "ignore",
    }),
  );
  return client;
}

describe.skipIf(process.platform === "win32")("claymod-bridge mcp", () => {
  test("an agent's tool call reaches the extension through the host and comes back", async () => {
    const seen: AgentCall[] = [];
    const extension = startExtensionSide((call) => {
      seen.push(call);
      return { mods: [{ id: "m1", name: "Hide banner" }] };
    });
    extension.send({ type: "serve", id: "serve" });
    expect(await extension.served()).toMatchObject({ ok: true });
    const socket = join(home, ".config/claymod/mcp.sock");
    expect(statSync(socket).isSocket()).toBe(true);

    const client = await agent();
    const result = await client.callTool({ name: "list_mods", arguments: { site: "example.com" } });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse((result.content as { text: string }[])[0]?.text ?? "")).toEqual({
      mods: [{ id: "m1", name: "Hide banner" }],
    });
    expect(seen[0]).toMatchObject({
      tool: "list_mods",
      args: { site: "example.com" },
      client: "integration-agent",
    });
    await client.close();

    // Chrome closing the port removes the socket and token, and agents get a clear error.
    expect(await extension.close()).toBe(0);
    expect(() => statSync(socket)).toThrow();
    const late = await agent();
    const refused = await late.callTool({ name: "list_mods", arguments: {} });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain("Let agents use Claymod (MCP)");
    await late.close();
  });
});
