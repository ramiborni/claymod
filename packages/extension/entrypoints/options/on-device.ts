import {
  type GpuProfile,
  type ModelFit,
  type Suggestion,
  suggestOnDeviceModel,
} from "@claymod/core/on-device";
import { ON_DEVICE_PROGRESS_KEY } from "@/lib/agent-keys";
import type { createRpcClient } from "@/lib/rpc/client";
import type { OnDeviceProgress } from "@/lib/rpc/protocol";

type Rpc = ReturnType<typeof createRpcClient>;
type Show = (kind: "ok" | "error" | "info", message: string) => void;

interface GpuAdapterLike {
  features: { has(name: string): boolean };
  info?: {
    vendor?: string;
    architecture?: string;
    description?: string;
    isFallbackAdapter?: boolean;
  };
  isFallbackAdapter?: boolean;
}

/** What WebGPU tells us about the GPU. It never reports memory size, hence the estimates. */
export async function detectGpu(): Promise<GpuProfile> {
  // Typed loosely on purpose: isFallbackAdapter moved from the adapter to adapter.info.
  const nav = navigator as unknown as {
    gpu?: { requestAdapter(): Promise<GpuAdapterLike | null> };
    deviceMemory?: number;
  };
  const adapter = await nav.gpu?.requestAdapter().catch(() => null);
  return {
    webgpu: Boolean(adapter),
    fallback: Boolean(adapter?.info?.isFallbackAdapter ?? adapter?.isFallbackAdapter),
    shaderF16: Boolean(adapter?.features.has("shader-f16")),
    vendor: adapter?.info?.vendor ?? "",
    architecture: adapter?.info?.architecture ?? "",
    description: adapter?.info?.description ?? "",
    deviceMemoryGB: nav.deviceMemory,
  };
}

const gb = (mb: number) => `${(mb / 1024).toFixed(1)} GB`;

const FIT_TEXT: Record<ModelFit, string> = {
  recommended: "suggested for this computer",
  fits: "fits comfortably",
  heavy: "may slow your other apps",
  "too-large": "likely too large for this GPU",
};

/** Wires the On-device section: GPU-aware model list, download with progress, delete. */
export function setUpOnDevice(options: { form: HTMLFormElement; rpc: Rpc; show: Show }) {
  const { form, rpc, show } = options;
  const select = form.elements.namedItem("onDeviceModel") as HTMLSelectElement;
  const summary = document.getElementById("gpu-summary") as HTMLElement;
  const prepare = document.getElementById("on-device-prepare") as HTMLButtonElement;
  const remove = document.getElementById("on-device-delete") as HTMLButtonElement;
  const bar = document.getElementById("on-device-progress") as HTMLProgressElement;
  const state = document.getElementById("on-device-state") as HTMLElement;
  let suggestion: Suggestion | undefined;
  let busy = false;

  const option = () => suggestion?.options.find((o) => o.id === select.value);

  async function refreshFiles() {
    const chosen = option();
    if (!chosen) return;
    const status = await rpc.call("onDeviceStatus", { model: chosen.id });
    const downloaded = status.ok && status.value.downloaded;
    prepare.hidden = downloaded || busy;
    prepare.textContent = `Download (${gb(chosen.downloadMB)})`;
    remove.hidden = !downloaded || busy;
    if (busy) return;
    const fitNote =
      chosen.fit === "heavy" || chosen.fit === "too-large"
        ? ` Heads-up: ${FIT_TEXT[chosen.fit]}.`
        : "";
    state.textContent = downloaded
      ? `Downloaded. Uses about ${gb(chosen.vramMB)} of GPU memory while it runs, freed after a few idle minutes.${fitNote}`
      : `Not downloaded yet. One-time download of ${gb(chosen.downloadMB)} from Hugging Face.${fitNote}`;
  }

  function showProgress(progress: OnDeviceProgress) {
    if (progress.model !== select.value) return;
    busy = progress.state === "loading";
    bar.hidden = !busy;
    bar.value = progress.progress;
    if (progress.state === "error") state.textContent = progress.text;
    else if (busy) state.textContent = progress.text;
    else void refreshFiles();
  }

  prepare.addEventListener("click", async () => {
    busy = true;
    prepare.hidden = true;
    bar.hidden = false;
    state.textContent = "Starting the download…";
    const result = await rpc.call("onDevicePrepare", { model: select.value });
    busy = false;
    bar.hidden = true;
    if (result.ok) show("ok", "Downloaded and ready. Click Save to use it.");
    else show("error", result.error);
    await refreshFiles();
  });
  remove.addEventListener("click", async () => {
    const result = await rpc.call("onDeviceDelete", { model: select.value });
    show(result.ok ? "ok" : "error", result.ok ? "Deleted the downloaded model." : result.error);
    await refreshFiles();
  });
  select.addEventListener("change", () => void refreshFiles());
  browser.storage.onChanged.addListener((changes, area) => {
    const next = changes[ON_DEVICE_PROGRESS_KEY]?.newValue as OnDeviceProgress | undefined;
    if (area === "session" && next) showProgress(next);
  });

  /** Fills the list for this GPU; keeps the saved model, else selects the suggestion. */
  async function load(saved: string) {
    suggestion = suggestOnDeviceModel(await detectGpu());
    summary.textContent = suggestion.summary;
    summary.className = `notice ${suggestion.unavailable ? "error" : "ok"}`;
    select.replaceChildren(
      ...suggestion.options.map((o) => {
        const element = document.createElement("option");
        element.value = o.id;
        element.textContent = `${o.label} · ${gb(o.vramMB)} GPU · ${FIT_TEXT[o.fit]}`;
        return element;
      }),
    );
    select.disabled = Boolean(suggestion.unavailable);
    (document.getElementById("on-device-files") as HTMLElement).hidden = Boolean(
      suggestion.unavailable,
    );
    const keep = suggestion.options.some((o) => o.id === saved);
    select.value = keep ? saved : (suggestion.recommended ?? "");
    await refreshFiles();
  }

  return { load };
}
