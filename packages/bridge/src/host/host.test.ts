import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { MAX_HOST_MESSAGE_BYTES } from "@claymod/core/bridge-protocol";
import { memoryKeyStore } from "../keys";
import { RUNNERS } from "../runners";
import type { Spawn } from "../runners/spawn";
import { createDispatcher } from "./dispatch";
import { encodeFrame, FrameDecoder } from "./framing";
import { runHost } from "./host";

const prompt = { system: "S", messages: [{ role: "user", content: "U" }] };

function frame(message: unknown): Uint8Array {
  const encoded = encodeFrame(message);
  if (!encoded.ok) throw new Error("too large");
  return encoded.frame;
}

/** Feeds frames to the host, then ends the input (Chrome closing the port) when told to. */
function harness(spawn: Spawn, keys = memoryKeyStore()) {
  const dispatch = createDispatcher({
    version: "9.9.9",
    runners: RUNNERS,
    agents: {
      spawn,
      which: (command) => (command === "agy" ? undefined : `/bin/${command}`),
      keys,
      env: { PATH: "/bin" },
      platform: "linux",
      home: "/home/me",
      tmpRoot: tmpdir(),
    },
  });
  const decoder = new FrameDecoder();
  const responses: unknown[] = [];
  let close: () => void = () => {};
  const closed = new Promise<void>((resolve) => {
    close = resolve;
  });
  const queue: Uint8Array[] = [];
  let wake: () => void = () => {};
  async function* input() {
    while (true) {
      const next = queue.shift();
      if (next) {
        yield next;
        continue;
      }
      const woke = new Promise<"more">((resolve) => {
        wake = () => resolve("more");
      });
      if ((await Promise.race([woke, closed.then(() => "closed" as const)])) === "closed") return;
    }
  }
  const done = runHost(
    {
      input: input(),
      write: async (bytes) =>
        void responses.push(...decoder.push(bytes).map((f) => f.ok && f.message)),
      log: () => {},
    },
    dispatch,
  );
  return {
    responses,
    send(message: unknown) {
      queue.push(message instanceof Uint8Array ? message : frame(message));
      wake();
    },
    async until(count: number) {
      while (responses.length < count) await Bun.sleep(5);
    },
    async close() {
      close();
      await done;
    },
  };
}

const claudeAnswer: Spawn = async () => ({
  exitCode: 0,
  stdout: JSON.stringify({ is_error: false, result: "{}", modelUsage: { m: {} } }),
  stderr: "",
});

describe("host", () => {
  test("hello reports the bridge version, agents found and stored keys", async () => {
    const host = harness(claudeAnswer, memoryKeyStore({ codex: "k" }));
    host.send({ type: "hello", id: "h1" });
    await host.until(1);
    await host.close();
    expect(host.responses[0]).toMatchObject({
      id: "h1",
      ok: true,
      value: { bridgeVersion: "9.9.9", protocolVersion: 1, keychain: true },
    });
    const agents = (host.responses[0] as { value: { agents: unknown[] } }).value.agents;
    expect(agents).toContainEqual({
      id: "codex",
      found: true,
      path: "/bin/codex",
      keyStored: true,
    });
    expect(agents).toContainEqual({ id: "antigravity", found: false, keyStored: false });
  });

  test("answers generate requests with the request id", async () => {
    const host = harness(claudeAnswer);
    host.send({ type: "generate", id: "g1", agent: "claude-code", auth: "cli", prompt });
    await host.until(1);
    await host.close();
    expect(host.responses).toEqual([{ id: "g1", ok: true, value: { text: "{}", model: "m" } }]);
  });

  test("answers invalid requests with bad-request and keeps serving", async () => {
    const host = harness(claudeAnswer);
    host.send({ type: "generate", id: "x", agent: "rm -rf", auth: "cli", prompt });
    host.send({ type: "hello", id: "after" });
    await host.until(2);
    await host.close();
    expect(host.responses[0]).toMatchObject({ id: "x", ok: false, error: { kind: "bad-request" } });
    expect(host.responses[1]).toMatchObject({ id: "after", ok: true });
  });

  test("cancel stops a running agent", async () => {
    const slow: Spawn = ({ signal }) =>
      new Promise((resolve) =>
        signal.addEventListener("abort", () => resolve({ exitCode: 143, stdout: "", stderr: "" })),
      );
    const host = harness(slow);
    host.send({ type: "generate", id: "g", agent: "codex", auth: "cli", prompt });
    await Bun.sleep(20);
    host.send({ type: "cancel", id: "c", target: "g" });
    await host.until(2);
    await host.close();
    expect(host.responses).toContainEqual({ id: "c", ok: true, value: null });
    expect(host.responses).toContainEqual({
      id: "g",
      ok: false,
      error: { kind: "cancelled", message: "Cancelled." },
    });
  });

  test("closing the port stops running agents", async () => {
    let killed = false;
    const slow: Spawn = ({ signal }) =>
      new Promise((resolve) =>
        signal.addEventListener("abort", () => {
          killed = true;
          resolve({ exitCode: 143, stdout: "", stderr: "" });
        }),
      );
    const host = harness(slow);
    host.send({ type: "generate", id: "g", agent: "codex", auth: "cli", prompt });
    await Bun.sleep(20);
    await host.close();
    expect(killed).toBe(true);
  });

  test("replaces answers over 1 MiB with a too-large error", async () => {
    const huge: Spawn = async () => ({
      exitCode: 0,
      stdout: JSON.stringify({ is_error: false, result: "x".repeat(MAX_HOST_MESSAGE_BYTES) }),
      stderr: "",
    });
    const host = harness(huge);
    host.send({ type: "generate", id: "big", agent: "claude-code", auth: "cli", prompt });
    await host.until(1);
    await host.close();
    expect(host.responses[0]).toMatchObject({ id: "big", ok: false, error: { kind: "too-large" } });
  });

  test("stores and deletes keys without ever returning them", async () => {
    const keys = memoryKeyStore();
    const host = harness(claudeAnswer, keys);
    host.send({ type: "setKey", id: "s", agent: "gemini", key: "secret" });
    await host.until(1);
    expect(await keys.get("gemini")).toBe("secret");
    host.send({ type: "deleteKey", id: "d", agent: "gemini" });
    await host.until(2);
    await host.close();
    expect(await keys.get("gemini")).toBeUndefined();
    expect(JSON.stringify(host.responses)).not.toContain("secret");
  });

  test("a corrupt length header ends the session after one error", async () => {
    const host = harness(claudeAnswer);
    const header = new Uint8Array(4).fill(0xff);
    host.send(header);
    await host.until(1);
    await host.close();
    expect(host.responses[0]).toMatchObject({ ok: false, error: { kind: "bad-request" } });
  });
});
