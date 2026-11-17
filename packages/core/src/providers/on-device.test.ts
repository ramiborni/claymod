import { describe, expect, test } from "bun:test";
import { buildCreatePrompt } from "../prompts/create";
import { err, ok } from "../result";
import { providerConfigSchema } from "./config";
import { createProvider } from "./index";
import { createOnDeviceProvider, type OnDeviceRequest } from "./on-device";
import {
  ON_DEVICE_CONTEXT_TOKENS,
  ON_DEVICE_MODELS,
  ON_DEVICE_OUTLINE_BYTES,
  vramNeededMB,
  weightsUrl,
} from "./on-device-models";
import { type GpuProfile, suggestOnDeviceModel } from "./on-device-suggest";

const gpu = (overrides: Partial<GpuProfile> = {}): GpuProfile => ({
  webgpu: true,
  fallback: false,
  shaderF16: true,
  vendor: "nvidia",
  architecture: "ampere",
  description: "",
  deviceMemoryGB: 8,
  ...overrides,
});

describe("on-device catalog", () => {
  test("every model is pinned: library, config and tokenizer hashes, weights at a commit", () => {
    for (const model of ON_DEVICE_MODELS) {
      expect(model.lib.integrity).toMatch(/^sha256-[A-Za-z0-9+/]{43}=$/);
      expect(model.integrity.config).toMatch(/^sha256-/);
      expect(Object.keys(model.integrity.tokenizer).sort()).toEqual([
        "merges.txt",
        "tokenizer.json",
        "tokenizer_config.json",
        "vocab.json",
      ]);
      expect(weightsUrl(model)).toMatch(
        /^https:\/\/huggingface\.co\/mlc-ai\/.+\/resolve\/[0-9a-f]{40}\/$/,
      );
    }
  });

  test("memory estimates include the larger context Claymod asks for", () => {
    const small = ON_DEVICE_MODELS[0];
    if (!small) throw new Error("catalog is empty");
    expect(ON_DEVICE_CONTEXT_TOKENS).toBeGreaterThan(4096);
    expect(vramNeededMB(small)).toBeGreaterThan(small.baseVramMB);
  });
});

describe("suggestOnDeviceModel", () => {
  test("a dedicated GPU gets the 3B model, keeping half its memory free", () => {
    const suggestion = suggestOnDeviceModel(gpu());
    expect(suggestion.kind).toBe("discrete");
    expect(suggestion.recommended).toBe("Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC");
    expect(suggestion.budgetMB).toBe(Math.round(suggestion.estimatedMB / 2));
    const seven = suggestion.options.find((o) => o.id.includes("7B"));
    expect(seven?.fit).toBe("too-large");
    expect(suggestion.summary).toContain("keeps about half free");
  });

  test("an integrated GPU with 8 GB shared memory gets the 1.5B model; 3B is marked heavy", () => {
    const suggestion = suggestOnDeviceModel(
      gpu({
        vendor: "intel",
        architecture: "gen-12lp",
        description: "Intel(R) Iris(R) Xe Graphics",
      }),
    );
    expect(suggestion.kind).toBe("integrated");
    expect(suggestion.recommended).toBe("Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC");
    expect(suggestion.options.find((o) => o.id.includes("3B"))?.fit).toBe("heavy");
  });

  test("Apple GPUs share memory; Chrome reports at most 8 GB, so Claymod stays conservative", () => {
    const suggestion = suggestOnDeviceModel(gpu({ vendor: "apple", architecture: "metal-3" }));
    expect(suggestion.kind).toBe("apple");
    expect(suggestion.estimatedMB).toBeGreaterThan(
      suggestOnDeviceModel(gpu({ vendor: "intel" })).estimatedMB,
    );
    expect(suggestion.recommended).toBe("Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC");
    expect(suggestion.options.find((o) => o.id.includes("3B"))?.fit).toBe("heavy");
  });

  test("without shader-f16, only the f32 builds are offered", () => {
    const suggestion = suggestOnDeviceModel(gpu({ shaderF16: false }));
    expect(suggestion.options.every((o) => o.id.includes("q4f32"))).toBe(true);
    // f32 needs more memory: 3B no longer fits in half of a typical dedicated GPU.
    expect(suggestion.recommended).toBe("Qwen2.5-Coder-1.5B-Instruct-q4f32_1-MLC");
    expect(suggestion.options.find((o) => o.id.includes("3B"))?.fit).toBe("heavy");
  });

  test("a small GPU still gets the smallest model, with a warning", () => {
    const suggestion = suggestOnDeviceModel(
      gpu({ vendor: "intel", description: "UHD", deviceMemoryGB: 4 }),
    );
    expect(suggestion.recommended).toBe("Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC");
    expect(suggestion.summary).toContain("may slow your computer");
  });

  test("explains what to do without WebGPU or with a software GPU", () => {
    expect(suggestOnDeviceModel(gpu({ webgpu: false })).unavailable).toContain(
      "Choose another provider",
    );
    const software = suggestOnDeviceModel(gpu({ fallback: true }));
    expect(software.unavailable).toContain("software GPU");
    expect(software.options).toEqual([]);
  });
});

describe("on-device provider", () => {
  test("sends the system prompt, messages and JSON Schema to the engine", async () => {
    const requests: OnDeviceRequest[] = [];
    const provider = createOnDeviceProvider({
      model: "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC",
      engine: async (request) => {
        requests.push(request);
        return ok("{}");
      },
    });
    const result = await provider.complete({
      system: "S",
      messages: [{ role: "user", content: "U" }],
      responseSchema: { type: "object" },
    });
    expect(result).toEqual(ok({ text: "{}", model: "Qwen2.5 Coder 3B" }));
    expect(requests[0]).toMatchObject({
      modelId: "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC",
      messages: [
        { role: "system", content: "S" },
        { role: "user", content: "U" },
      ],
      jsonSchema: '{"type":"object"}',
    });
  });

  test("passes engine errors through and explains a missing engine", async () => {
    const error = { kind: "server" as const, message: "Out of GPU memory. Pick a smaller model." };
    const failing = createOnDeviceProvider({
      model: "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC",
      engine: async () => err(error),
    });
    expect(await failing.complete({ system: "", messages: [] })).toEqual(err(error));
    const none = createProvider(
      providerConfigSchema.parse({
        kind: "on-device",
        model: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
      }),
    );
    const result = await none.complete({ system: "", messages: [] });
    expect(result.ok ? "" : result.error.message).toContain("Choose another provider");
  });

  test("the config only accepts curated models", () => {
    expect(
      providerConfigSchema.safeParse({ kind: "on-device", model: "Some-Other-MLC" }).success,
    ).toBe(false);
  });
});

describe("prompt budget", () => {
  test("on-device prompts cap the page outline", () => {
    const snapshot = { url: "https://a.com/", title: "A", outline: "x".repeat(30_000) };
    const full = buildCreatePrompt({ request: "r", snapshot });
    const small = buildCreatePrompt({
      request: "r",
      snapshot,
      budget: { outlineBytes: ON_DEVICE_OUTLINE_BYTES },
    });
    expect(full.messages[0]?.content.length).toBeGreaterThan(30_000);
    expect(small.messages[0]?.content.length).toBeLessThan(ON_DEVICE_OUTLINE_BYTES + 1_000);
  });
});
