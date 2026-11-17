import { testConnection } from "@claymod/core";
import type { RpcHandlers } from "@/lib/rpc/server";
import { getProviderConfig } from "@/lib/storage";
import { agentHandlers } from "./agent-handlers";
import { bridgeHandlers, testLocalAgent } from "./bridge-handlers";
import { approveJs, deleteMod, rename, setEnabled, setSitePaused, undo } from "./edit";
import { generate } from "./generate";
import { keep } from "./keep";
import { listMods } from "./list";
import { onDeviceHandlers, testOnDevice } from "./on-device-handlers";
import { askPage } from "./page-access";
import { discard, preview, showPreview } from "./preview";
import { providerFor, providerLabel } from "./provider";
import { repair, saveRepair } from "./repair";
import { exportMods, importMods } from "./transfer";

export const handlers: RpcHandlers = {
  async status() {
    const config = await getProviderConfig();
    return {
      ok: true,
      value: { configured: Boolean(config), label: config ? providerLabel(config) : "" },
    };
  },
  async testConnection({ config }, signal) {
    if (config.kind === "local-agent") return testLocalAgent(config, signal);
    if (config.kind === "on-device") return testOnDevice(config, signal);
    const result = await testConnection(providerFor(config), signal);
    return result.ok ? result : { ok: false, error: result.error.message };
  },
  pick: ({ tabId }) => askPage(tabId, { type: "claymod:pick" }),
  async cancelPick({ tabId }) {
    await browser.tabs.sendMessage(tabId, { type: "claymod:cancelPick" }).catch(() => {});
    return { ok: true, value: null };
  },
  generate,
  preview,
  discard,
  showPreview,
  keep,
  listMods,
  setEnabled,
  rename,
  deleteMod,
  undo,
  approveJs,
  setSitePaused,
  exportMods,
  importMods,
  repair,
  saveRepair,
  ...bridgeHandlers,
  ...agentHandlers,
  ...onDeviceHandlers,
};
