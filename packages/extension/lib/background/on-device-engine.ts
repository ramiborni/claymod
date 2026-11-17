import { err, type OnDeviceEngine, ok, type ProviderError, type Result } from "@claymod/core";
import { onDeviceModel } from "@claymod/core/on-device";
import {
  deleteModelAllInfoInCache,
  hasModelInCache,
  type InitProgressReport,
  MLCEngine,
} from "@mlc-ai/web-llm";
import { ON_DEVICE_PROGRESS_KEY } from "@/lib/agent-keys";
import { onDeviceAppConfig, onDeviceErrorMessage } from "@/lib/on-device-config";
import type { OnDeviceProgress } from "@/lib/rpc/protocol";

/**
 * WebLLM in the service worker (WebGPU in workers: Chrome 124+). The model stays loaded while
 * the user works, then is unloaded after a few idle minutes so the GPU memory goes back to
 * their other apps. Pages keep the worker alive during long calls with the RPC heartbeat.
 */
export const IDLE_UNLOAD_MS = 3 * 60_000;
const MAX_ANSWER_TOKENS = 1536;

const appConfig = () => onDeviceAppConfig((path) => browser.runtime.getURL(`/${path}` as "/"));

let engine: MLCEngine | undefined;
let loadedModel: string | undefined;
let queue: Promise<unknown> = Promise.resolve();
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let loadingModel: string | undefined;

const failure = (message: string): ProviderError => ({ kind: "server", message });
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function setProgress(progress: OnDeviceProgress): Promise<void> {
  await browser.storage.session.set({ [ON_DEVICE_PROGRESS_KEY]: progress });
}

/** One load or generation at a time: the GPU can't do two, and switching models must finish. */
function serially<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

function scheduleUnload(): void {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => void unloadOnDevice(), IDLE_UNLOAD_MS);
}

export async function unloadOnDevice(): Promise<void> {
  clearTimeout(idleTimer);
  await serially(async () => {
    await engine?.unload();
    loadedModel = undefined;
  });
}

async function webgpuAvailable(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  return Boolean(gpu && (await gpu.requestAdapter().catch(() => null)));
}

async function load(modelId: string): Promise<Result<MLCEngine, ProviderError>> {
  if (!(await webgpuAvailable())) {
    return err(
      failure(
        "Chrome can't use your GPU here (WebGPU is unavailable). Choose another provider in Claymod settings.",
      ),
    );
  }
  engine ??= new MLCEngine({
    appConfig: appConfig(),
    initProgressCallback: (report: InitProgressReport) =>
      void setProgress({
        model: loadingModel ?? modelId,
        state: "loading",
        progress: report.progress,
        text: report.text,
      }),
  });
  if (loadedModel === modelId) return ok(engine);
  loadingModel = modelId;
  try {
    await engine.reload(modelId);
    loadedModel = modelId;
    await setProgress({ model: modelId, state: "ready", progress: 1, text: "Ready" });
    return ok(engine);
  } catch (error) {
    const message = onDeviceErrorMessage(messageOf(error));
    await setProgress({ model: modelId, state: "error", progress: 0, text: message });
    return err(failure(message));
  } finally {
    loadingModel = undefined;
  }
}

export const isModelDownloaded = (modelId: string) => hasModelInCache(modelId, appConfig());

/** Downloads (first time) and loads a model; progress goes to storage.session for the UI. */
export function prepareModel(modelId: string): Promise<Result<null, ProviderError>> {
  return serially(async () => {
    const loaded = await load(modelId);
    scheduleUnload();
    return loaded.ok ? ok(null) : loaded;
  });
}

export async function deleteModel(modelId: string): Promise<void> {
  if (loadedModel === modelId) await unloadOnDevice();
  await deleteModelAllInfoInCache(modelId, appConfig());
  await setProgress({ model: modelId, state: "idle", progress: 0, text: "" });
}

export const onDeviceEngine: OnDeviceEngine = ({ modelId, messages, jsonSchema, signal }) =>
  serially(async () => {
    clearTimeout(idleTimer);
    try {
      // Never start a multi-gigabyte download from the side panel by surprise.
      if (loadedModel !== modelId && !(await isModelDownloaded(modelId))) {
        const label = onDeviceModel(modelId)?.label ?? modelId;
        return err(
          failure(
            `Download ${label} first: open Claymod settings, choose On-device and click Download.`,
          ),
        );
      }
      const loaded = await load(modelId);
      if (!loaded.ok) return loaded;
      const stop = () => void loaded.value.interruptGenerate();
      signal?.addEventListener("abort", stop, { once: true });
      try {
        const reply = await loaded.value.chat.completions.create({
          messages,
          temperature: 0.2,
          max_tokens: MAX_ANSWER_TOKENS,
          ...(jsonSchema ? { response_format: { type: "json_object", schema: jsonSchema } } : {}),
        });
        const choice = reply.choices[0];
        if (choice?.finish_reason === "length") {
          return err({
            kind: "truncated",
            message: "The model's answer was cut off. Ask for a smaller change and try again.",
          });
        }
        return ok(choice?.message.content ?? "");
      } finally {
        signal?.removeEventListener("abort", stop);
      }
    } catch (error) {
      return err(failure(onDeviceErrorMessage(messageOf(error))));
    } finally {
      scheduleUnload();
    }
  });
