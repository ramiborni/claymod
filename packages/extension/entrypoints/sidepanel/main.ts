import "@/lib/ui/theme.css";
import { useJitlessZod } from "@claymod/core/zod-config";
import { originsForMatches } from "@/lib/origins";
import { createRpcClient } from "@/lib/rpc/client";
import { initialState, type PanelState } from "./state";
import { targetTabId } from "./target-tab";
import { type Actions, renderScreen } from "./views";

useJitlessZod();
const rpc = createRpcClient();
const root = document.getElementById("app") as HTMLElement;
const content = document.getElementById("content") as HTMLElement;
const providerLabel = document.getElementById("provider") as HTMLElement;
let state: PanelState = initialState;
let generation: AbortController | undefined;
let pickTabId: number | undefined;

function update(patch: Partial<PanelState>) {
  const focusedRequest = document.activeElement?.id === "request";
  state = { ...state, ...patch };
  providerLabel.textContent = state.provider.label || "No provider";
  content.replaceChildren(renderScreen(state, actions));
  if (focusedRequest) document.getElementById("request")?.focus();
}

const fail = (message: string) => update({ screen: { name: "error", message, back: "compose" } });

async function withTab(run: (tabId: number) => Promise<void>) {
  const tabId = await targetTabId();
  if (tabId === undefined) return fail("Open a web page in this window first.");
  await run(tabId);
}

const actions: Actions = {
  setRequest: (value) => {
    state = { ...state, request: value };
    const generate = content.querySelector<HTMLButtonElement>("button.primary");
    if (generate) generate.disabled = !state.provider.configured || !value.trim();
  },
  pick: () =>
    void withTab(async (tabId) => {
      pickTabId = tabId;
      update({ screen: { name: "picking" } });
      const picked = await rpc.call("pick", { tabId });
      if (!picked.ok) return fail(picked.error);
      update({ screen: { name: "compose" }, picked: picked.value ?? state.picked });
    }),
  cancelPick: () => {
    if (pickTabId !== undefined) void rpc.call("cancelPick", { tabId: pickTabId });
  },
  clearPicked: () => update({ picked: null }),
  generate: () =>
    void withTab(async (tabId) => {
      generation = new AbortController();
      update({ screen: { name: "generating" }, keepError: undefined });
      const payload = { tabId, request: state.request, pickedElement: state.picked ?? undefined };
      const generated = await rpc.call("generate", payload, generation.signal);
      if (!generated.ok)
        return generation.signal.aborted
          ? update({ screen: { name: "compose" } })
          : fail(generated.error);
      const preview = await rpc.call("preview", { tabId, draft: generated.value.draft });
      if (!preview.ok) return fail(preview.error);
      update({
        screen: {
          name: "preview",
          tabId,
          generated: generated.value,
          preview: preview.value,
          showCode: false,
          keeping: false,
        },
      });
    }),
  cancelGenerate: () => generation?.abort(),
  keep: () => {
    const screen = state.screen;
    if (screen.name !== "preview") return;
    // permissions.request needs this click's user gesture, so it must be the first call.
    const permission = browser.permissions.request({
      origins: originsForMatches(screen.generated.draft.matches),
    });
    update({ screen: { ...screen, keeping: true }, keepError: undefined });
    void permission.then(async (granted) => {
      const result = granted
        ? await rpc.call("keep", { tabId: screen.tabId, generated: screen.generated })
        : {
            ok: false as const,
            error:
              "Access wasn't granted, so the mod wasn't saved. Click Keep again and choose Allow.",
          };
      if (result.ok)
        return update({
          screen: { name: "saved", modName: result.value.name },
          request: "",
          picked: null,
        });
      update({ screen: { ...screen, keeping: false }, keepError: result.error });
    });
  },
  discard: () => {
    const screen = state.screen;
    if (screen.name !== "preview") return;
    void rpc
      .call("discard", { tabId: screen.tabId })
      .then(() => update({ screen: { name: "compose" }, keepError: undefined }));
  },
  toggleCode: () => {
    if (state.screen.name === "preview")
      update({ screen: { ...state.screen, showCode: !state.screen.showCode } });
  },
  backToCompose: () => update({ screen: { name: "compose" } }),
  openSettings: () => void browser.runtime.openOptionsPage(),
};

async function refreshProvider() {
  const status = await rpc.call("status", {});
  if (status.ok) update({ provider: status.value });
}

document.getElementById("settings")?.addEventListener("click", actions.openSettings);
browser.storage.onChanged.addListener((changes) => {
  if ("providerConfig" in changes) void refreshProvider();
});
root.hidden = false;
update({});
void refreshProvider();
