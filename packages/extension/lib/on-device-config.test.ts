import { describe, expect, test } from "bun:test";
import { ON_DEVICE_CONTEXT_TOKENS, ON_DEVICE_MODELS } from "@claymod/core/on-device";
import { onDeviceAppConfig, onDeviceErrorMessage } from "./on-device-config";

describe("onDeviceAppConfig", () => {
  const config = onDeviceAppConfig((path) => `chrome-extension://id/${path}`);

  test("loads every library from the extension package, never from the network", () => {
    expect(config.model_list).toHaveLength(ON_DEVICE_MODELS.length);
    for (const record of config.model_list) {
      expect(record.model_lib).toMatch(/^chrome-extension:\/\/id\/webllm\/.+\.wasm$/);
    }
  });

  test("pins weights to a commit and checks code, config and tokenizer hashes", () => {
    for (const record of config.model_list) {
      expect(record.model).toMatch(/\/resolve\/[0-9a-f]{40}\/$/);
      expect(record.integrity?.model_lib).toMatch(/^sha256-/);
      expect(record.integrity?.config).toMatch(/^sha256-/);
      expect(record.integrity?.onFailure).toBe("error");
      expect(record.overrides?.context_window_size).toBe(ON_DEVICE_CONTEXT_TOKENS);
    }
  });

  test("f16 builds require shader-f16 so WebLLM fails early on GPUs without it", () => {
    const f16 = config.model_list.find((r) => r.model_id.includes("q4f16"));
    const f32 = config.model_list.find((r) => r.model_id.includes("q4f32"));
    expect(f16?.required_features).toEqual(["shader-f16"]);
    expect(f32?.required_features).toBeUndefined();
  });
});

describe("onDeviceErrorMessage", () => {
  test("each failure says what to do next", () => {
    expect(onDeviceErrorMessage("GPUOutOfMemoryError: out of memory")).toContain("smaller model");
    expect(onDeviceErrorMessage("Device was lost")).toContain("smaller model");
    expect(onDeviceErrorMessage("IntegrityError: hash mismatch")).toContain("Delete the download");
    expect(onDeviceErrorMessage("This model requires feature shader-f16")).toContain("any GPU");
    expect(onDeviceErrorMessage("TypeError: Failed to fetch")).toContain("connection");
    expect(onDeviceErrorMessage("weird")).toContain("Try again");
  });
});
