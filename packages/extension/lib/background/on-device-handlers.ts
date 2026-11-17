import { onDeviceModel, type ProviderConfig, testConnection } from "@claymod/core";
import type { RpcResult } from "@/lib/rpc/protocol";
import type { RpcHandlers } from "@/lib/rpc/server";
import { deleteModel, isModelDownloaded, prepareModel } from "./on-device-engine";
import { providerFor } from "./provider";

const unknownModel = { ok: false as const, error: "Pick one of the models in the list." };

/** Test connection without surprises: never starts a download, loads only a downloaded model. */
export async function testOnDevice(
  config: Extract<ProviderConfig, { kind: "on-device" }>,
  signal: AbortSignal,
): Promise<RpcResult<{ model: string }>> {
  const label = onDeviceModel(config.model)?.label ?? config.model;
  if (!(await isModelDownloaded(config.model))) {
    return { ok: false, error: `Download ${label} first (the Download button above).` };
  }
  const result = await testConnection(providerFor(config), signal);
  return result.ok ? result : { ok: false, error: result.error.message };
}

export const onDeviceHandlers: Pick<
  RpcHandlers,
  "onDeviceStatus" | "onDevicePrepare" | "onDeviceDelete"
> = {
  async onDeviceStatus({ model }) {
    if (!onDeviceModel(model)) return unknownModel;
    return { ok: true, value: { downloaded: await isModelDownloaded(model) } };
  },
  async onDevicePrepare({ model }) {
    if (!onDeviceModel(model)) return unknownModel;
    const result = await prepareModel(model);
    return result.ok ? { ok: true, value: null } : { ok: false, error: result.error.message };
  },
  async onDeviceDelete({ model }) {
    if (!onDeviceModel(model)) return unknownModel;
    await deleteModel(model);
    return { ok: true, value: null };
  },
};
