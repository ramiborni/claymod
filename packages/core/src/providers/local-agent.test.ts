import { describe, expect, test } from "bun:test";
import { bridgeRequestSchema } from "../bridge/protocol";
import { generateModDraft } from "../generate/generate";
import { err, ok } from "../result";
import { providerConfigSchema } from "./config";
import { createProvider } from "./index";
import { type BridgeCall, createLocalAgentProvider, fromBridgeError } from "./local-agent";

const prompt = { system: "sys", messages: [{ role: "user" as const, content: "hi" }] };
const validDraft = {
  name: "Hide banner",
  description: "Hides the banner.",
  matches: ["https://example.com/*"],
  css: "#banner { display: none !important; }",
  runAt: "document_idle",
  checks: [{ selector: "#banner", expect: "exists" }],
};

describe("local agent provider", () => {
  test("sends a generate request that the bridge protocol accepts", async () => {
    const calls: BridgeCall[] = [];
    const provider = createLocalAgentProvider({
      agent: "claude-code",
      auth: "cli",
      model: "opus",
      bridge: async (call) => {
        calls.push(call);
        return ok({ text: "{}", model: "claude-opus-5-5" });
      },
    });
    const result = await provider.complete({ ...prompt, responseSchema: { type: "object" } });
    expect(result).toEqual(ok({ text: "{}", model: "claude-opus-5-5" }));
    expect(calls[0]).toMatchObject({ type: "generate", agent: "claude-code", model: "opus" });
    expect(bridgeRequestSchema.safeParse({ ...calls[0], id: "1" }).success).toBe(true);
  });

  test("explains how to set up the bridge when there is none", async () => {
    const provider = createLocalAgentProvider({ agent: "codex", auth: "cli" });
    const result = await provider.complete(prompt);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("claymod-bridge");
  });

  test("rejects answers that don't match the protocol", async () => {
    const provider = createLocalAgentProvider({
      agent: "codex",
      auth: "cli",
      bridge: async () => ok({ nope: true }),
    });
    const result = await provider.complete(prompt);
    expect(result.ok ? undefined : result.error.kind).toBe("invalid-response");
  });

  test("passes transport errors through unchanged", async () => {
    const error = { kind: "auth" as const, message: "Run codex login." };
    const provider = createLocalAgentProvider({
      agent: "codex",
      auth: "cli",
      bridge: async () => err(error),
    });
    expect(await provider.complete(prompt)).toEqual(err(error));
  });

  test("maps bridge errors to provider error kinds", () => {
    expect(fromBridgeError({ kind: "agent-not-found", message: "m" }).kind).toBe("not-found");
    expect(fromBridgeError({ kind: "timeout", message: "m" }).kind).toBe("network");
    expect(fromBridgeError({ kind: "keychain", message: "m" })).toEqual({
      kind: "auth",
      message: "m",
    });
  });

  test("runs through the same validation graph as other providers", async () => {
    const config = providerConfigSchema.parse({
      kind: "local-agent",
      agent: "gemini",
      auth: "api-key",
    });
    const provider = createProvider(config, {
      bridge: async () => ok({ text: JSON.stringify(validDraft), model: "gemini-pro" }),
    });
    const result = await generateModDraft({ provider, prompt });
    expect(result.ok && result.value.draft.name).toBe("Hide banner");
    expect(result.ok && result.value.model).toBe("gemini-pro");
  });
});

describe("bridge protocol", () => {
  test("rejects unknown agents and fields", () => {
    expect(bridgeRequestSchema.safeParse({ type: "hello", id: "1", extra: 1 }).success).toBe(false);
    expect(
      bridgeRequestSchema.safeParse({
        type: "generate",
        id: "1",
        agent: "bash",
        auth: "cli",
        prompt,
      }).success,
    ).toBe(false);
  });

  test("caps the timeout", () => {
    const base = { type: "generate", id: "1", agent: "codex", auth: "cli", prompt };
    expect(bridgeRequestSchema.safeParse({ ...base, timeoutMs: 60_000 }).success).toBe(true);
    expect(bridgeRequestSchema.safeParse({ ...base, timeoutMs: 3_600_000 }).success).toBe(false);
  });
});
