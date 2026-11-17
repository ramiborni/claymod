/**
 * The on-device (WebLLM) models Claymod offers. Each model's WebAssembly library ships inside
 * the extension (CLAUDE.md: never fetch code at runtime); weights are data, downloaded once from
 * Hugging Face at a pinned commit. Every library, config and tokenizer file is pinned by SRI hash.
 */

/** Claymod asks for a larger context than WebLLM's default 4096 to fit the page outline. */
export const ON_DEVICE_CONTEXT_TOKENS = 10_240;
const DEFAULT_CONTEXT_TOKENS = 4_096;

/** Page outline budget that fits ON_DEVICE_CONTEXT_TOKENS with the rules, answer and one retry. */
export const ON_DEVICE_OUTLINE_BYTES = 10_000;

/** Where the libraries were taken from at build time (see scripts/webllm-libs.ts). */
export const ON_DEVICE_LIB_SOURCE =
  "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_87/base/";

export interface OnDeviceModel {
  id: string;
  label: string;
  /** Needs the WebGPU "shader-f16" feature (f16) or runs everywhere (f32, more memory). */
  precision: "f16" | "f32";
  /** WebLLM's estimate at its default 4096-token context. */
  baseVramMB: number;
  /** Key/value cache per token of context, which grows with the context we ask for. */
  kvBytesPerToken: number;
  downloadMB: number;
  lib: { file: string; integrity: string };
  repo: string;
  revision: string;
  integrity: { config: string; tokenizer: Record<string, string> };
}

const QWEN_TOKENIZER = {
  "tokenizer.json": "sha256-wDghF+oynN8JcEETL21zWSS2l5JNb2/DlFcT6WzodTk=",
  "vocab.json": "sha256-yhDX6fs+0YV13R4neiV5wW0QjjLydDloSvoOELFECRA=",
  "merges.txt": "sha256-WZurVAdQiHdLFzP96GXVvXR8vMelR8W8EmEOh04m9eM=",
};
const SMALL_TOKENIZER_CONFIG = "sha256-AG2kM83A5w8FdZAI712NgnIePL2VvUgx05T5bFQjBoA=";
const LARGE_TOKENIZER_CONFIG = "sha256-W11PZdCs07LVajW1bTdKNsvByPpc87P+u7+r8i81lYM=";

export const ON_DEVICE_MODELS: readonly OnDeviceModel[] = [
  {
    id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 Coder 1.5B",
    precision: "f16",
    baseVramMB: 1630,
    kvBytesPerToken: 28 * 1024,
    downloadMB: 869,
    lib: {
      file: "Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm",
      integrity: "sha256-FV73NZyFn31kb0xa3FSNd5R12j4xlnAcep1LgoJ1Wag=",
    },
    repo: "mlc-ai/Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
    revision: "30184a4f713a9aaf6c548ace1290615d0ea041ff",
    integrity: {
      config: "sha256-bRB/03OzhzVVjXqLgxVJteYI/mCRfJa0lvxE+c2A4d0=",
      tokenizer: { ...QWEN_TOKENIZER, "tokenizer_config.json": SMALL_TOKENIZER_CONFIG },
    },
  },
  {
    id: "Qwen2.5-Coder-1.5B-Instruct-q4f32_1-MLC",
    label: "Qwen2.5 Coder 1.5B (any GPU)",
    precision: "f32",
    baseVramMB: 1889,
    kvBytesPerToken: 56 * 1024,
    downloadMB: 869,
    lib: {
      file: "Qwen2-1.5B-Instruct-q4f32_1_cs1k-webgpu.wasm",
      integrity: "sha256-jo5he7dldXq4ZVVwVGlnmIDpY22xDCGY0mqg89HujpA=",
    },
    repo: "mlc-ai/Qwen2.5-Coder-1.5B-Instruct-q4f32_1-MLC",
    revision: "0d603ead13079d75115c46fc5429401fd5166509",
    integrity: {
      config: "sha256-mPNeOBTRgCsdqhZFfnpp0/L7QtVnuMaVgxtKAgHNGkM=",
      tokenizer: { ...QWEN_TOKENIZER, "tokenizer_config.json": SMALL_TOKENIZER_CONFIG },
    },
  },
  {
    id: "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 Coder 3B",
    precision: "f16",
    baseVramMB: 2505,
    kvBytesPerToken: 36 * 1024,
    downloadMB: 1736,
    lib: {
      file: "Qwen2.5-3B-Instruct-q4f16_1_cs1k-webgpu.wasm",
      integrity: "sha256-EOqE35gjopJ7UsvfdSvWTapuHbPRYX6+eRvp3CgApx4=",
    },
    repo: "mlc-ai/Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC",
    revision: "5213029e7ae2ad46baf9657aa491186e56cd34d6",
    integrity: {
      config: "sha256-sgrKtcaLVOSnpm0/J8n6Q+kh4oBl+FtBXPHtDjv5VNc=",
      tokenizer: { ...QWEN_TOKENIZER, "tokenizer_config.json": LARGE_TOKENIZER_CONFIG },
    },
  },
  {
    id: "Qwen2.5-Coder-3B-Instruct-q4f32_1-MLC",
    label: "Qwen2.5 Coder 3B (any GPU)",
    precision: "f32",
    baseVramMB: 2894,
    kvBytesPerToken: 72 * 1024,
    downloadMB: 1736,
    lib: {
      file: "Qwen2.5-3B-Instruct-q4f32_1_cs1k-webgpu.wasm",
      integrity: "sha256-izxGn122jajXzcExzOTK7JBodh6aT9SsMWK6SPX/rJw=",
    },
    repo: "mlc-ai/Qwen2.5-Coder-3B-Instruct-q4f32_1-MLC",
    revision: "3b26dc318a9eb407c8adb1077ad6be9c210d3aca",
    integrity: {
      config: "sha256-snQZtdQ83+GgXVDDxyHsftgDiPH+AiP8kHhDnmDbCbM=",
      tokenizer: { ...QWEN_TOKENIZER, "tokenizer_config.json": LARGE_TOKENIZER_CONFIG },
    },
  },
  {
    id: "Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 Coder 7B",
    precision: "f16",
    baseVramMB: 5107,
    kvBytesPerToken: 56 * 1024,
    downloadMB: 4284,
    lib: {
      file: "Qwen2-7B-Instruct-q4f16_1_cs1k-webgpu.wasm",
      integrity: "sha256-7x4D3gSqe9BIbum1OR2QIbDyMNemxO+Wps2CLuvs3Sg=",
    },
    repo: "mlc-ai/Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC",
    revision: "56dea5411b44b2a45cf0ceb16ead4c1f30141f49",
    integrity: {
      config: "sha256-Vj9pduqdBzOJS6uWuvevJK49/mMMZ9lAEd2aYDudlmI=",
      tokenizer: {
        ...QWEN_TOKENIZER,
        "tokenizer_config.json": "sha256-UhRgDuRcoviHzi7t6JEDeKARHqmdZXQovLzpR3jmWpI=",
      },
    },
  },
];

export const ON_DEVICE_MODEL_IDS = ON_DEVICE_MODELS.map((model) => model.id) as [
  string,
  ...string[],
];

export const onDeviceModel = (id: string): OnDeviceModel | undefined =>
  ON_DEVICE_MODELS.find((model) => model.id === id);

/** GPU memory the model needs at Claymod's context size. */
export function vramNeededMB(model: OnDeviceModel): number {
  const extraTokens = ON_DEVICE_CONTEXT_TOKENS - DEFAULT_CONTEXT_TOKENS;
  return Math.round(model.baseVramMB + (extraTokens * model.kvBytesPerToken) / (1024 * 1024));
}

/** Weights URL pinned to one commit, so the files can't change under a saved integrity hash. */
export const weightsUrl = (model: OnDeviceModel) =>
  `https://huggingface.co/${model.repo}/resolve/${model.revision}/`;
