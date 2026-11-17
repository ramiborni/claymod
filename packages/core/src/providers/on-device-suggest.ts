import { ON_DEVICE_MODELS, type OnDeviceModel, vramNeededMB } from "./on-device-models";

/** What a page can learn about the GPU through WebGPU (no exact memory size is exposed). */
export interface GpuProfile {
  webgpu: boolean;
  /** A software adapter: far too slow for language models. */
  fallback: boolean;
  shaderF16: boolean;
  vendor: string;
  architecture: string;
  description: string;
  /** navigator.deviceMemory in GB; Chrome rounds it and caps it. */
  deviceMemoryGB?: number | undefined;
}

export type GpuKind = "apple" | "integrated" | "discrete" | "unknown";
export type ModelFit = "recommended" | "fits" | "heavy" | "too-large";

export interface ModelOption {
  id: string;
  label: string;
  vramMB: number;
  downloadMB: number;
  fit: ModelFit;
}

export interface Suggestion {
  /** Set when on-device models can't run here; says what to do instead. */
  unavailable?: string;
  kind: GpuKind;
  /** Estimated GPU memory Chrome can use, and the share Claymod plans to use (about half). */
  estimatedMB: number;
  budgetMB: number;
  recommended?: string;
  options: ModelOption[];
  summary: string;
}

/** Claymod plans to use at most this share, leaving the rest for the user's other apps. */
export const HEADROOM_SHARE = 0.5;
/** Above this share, models are likely to fail to load or make the computer unresponsive. */
const HARD_LIMIT_SHARE = 0.8;

const INTEGRATED = /intel|uhd|iris|integrated|adreno|mali|radeon\(tm\) graphics|vega \d+ graphics/i;

export function gpuKind(gpu: GpuProfile): GpuKind {
  const text = `${gpu.vendor} ${gpu.architecture} ${gpu.description}`;
  if (/apple/i.test(text)) return "apple";
  if (INTEGRATED.test(text)) return "integrated";
  if (/nvidia|amd|ati/i.test(text)) return "discrete";
  return "unknown";
}

/**
 * WebGPU doesn't report memory, so this is deliberately conservative: shared-memory GPUs get a
 * share of system memory, discrete GPUs a typical mid-range size.
 */
export function estimateGpuMemoryMB(gpu: GpuProfile): number {
  const systemMB = (gpu.deviceMemoryGB ?? 8) * 1024;
  switch (gpuKind(gpu)) {
    case "apple":
      return systemMB * 0.65;
    case "integrated":
      return systemMB * 0.5;
    case "discrete":
      return 6 * 1024;
    case "unknown":
      return systemMB * 0.4;
  }
}

const KIND_TEXT: Record<GpuKind, string> = {
  apple: "Apple GPU (shared memory)",
  integrated: "Integrated GPU (shared memory)",
  discrete: "Dedicated GPU",
  unknown: "GPU",
};

function fitOf(vram: number, budget: number, estimated: number): ModelFit {
  if (vram <= budget) return "fits";
  if (vram <= estimated * HARD_LIMIT_SHARE) return "heavy";
  return "too-large";
}

/** Usable models for this GPU, smallest first: f16 when supported (less memory), else f32. */
function candidates(gpu: GpuProfile): OnDeviceModel[] {
  const precision = gpu.shaderF16 ? "f16" : "f32";
  return ON_DEVICE_MODELS.filter((model) => model.precision === precision);
}

/** Picks the largest model that leaves about half of the GPU's memory for other apps. */
export function suggestOnDeviceModel(gpu: GpuProfile): Suggestion {
  const kind = gpuKind(gpu);
  const estimatedMB = Math.round(estimateGpuMemoryMB(gpu));
  const budgetMB = Math.round(estimatedMB * HEADROOM_SHARE);
  const empty = { kind, estimatedMB, budgetMB, options: [] };
  if (!gpu.webgpu) {
    const message =
      "Chrome can't use your GPU here (WebGPU is off or unsupported), so on-device models can't run. Choose another provider.";
    return { ...empty, unavailable: message, summary: message };
  }
  if (gpu.fallback) {
    const message =
      "Chrome only has a slow software GPU here, so on-device models would be far too slow. Choose another provider.";
    return { ...empty, unavailable: message, summary: message };
  }
  const options: ModelOption[] = candidates(gpu).map((model) => {
    const vramMB = vramNeededMB(model);
    return {
      id: model.id,
      label: model.label,
      vramMB,
      downloadMB: model.downloadMB,
      fit: fitOf(vramMB, budgetMB, estimatedMB),
    };
  });
  const fitting = options.filter((option) => option.fit === "fits");
  const pick = fitting.at(-1) ?? options[0];
  if (pick) pick.fit = "recommended";
  const gb = (mb: number) => `${(mb / 1024).toFixed(1)} GB`;
  const summary = pick
    ? fitting.length > 0
      ? `${KIND_TEXT[kind]}, about ${gb(estimatedMB)} usable. Suggested: ${pick.label}, which keeps about half free for your other apps.`
      : `${KIND_TEXT[kind]}, about ${gb(estimatedMB)} usable. Even ${pick.label} may slow your computer while it runs.`
    : "No on-device model matches this GPU. Choose another provider.";
  return {
    kind,
    estimatedMB,
    budgetMB,
    ...(pick ? { recommended: pick.id } : {}),
    options,
    summary,
  };
}
