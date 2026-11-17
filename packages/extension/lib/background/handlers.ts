import { testConnection } from "@claymod/core";
import type { RpcHandlers } from "@/lib/rpc/server";
import { getProviderConfig } from "@/lib/storage";
import { generate } from "./generate";
import { keep } from "./keep";
import { askPage } from "./page-access";
import { discard, preview } from "./preview";
import { providerFor, providerLabel } from "./provider";

export const handlers: RpcHandlers = {
  async status() {
    const config = await getProviderConfig();
    return {
      ok: true,
      value: { configured: Boolean(config), label: config ? providerLabel(config) : "" },
    };
  },
  async testConnection({ config }, signal) {
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
  keep,
};
