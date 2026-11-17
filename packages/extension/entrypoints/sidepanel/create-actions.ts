import { originsForMatches } from "@/lib/origins";
import type { GeneratedDraft } from "@/lib/rpc/protocol";
import type { PanelContext } from "./context";
import type { PreviewScreen, Purpose } from "./state";
import { targetTabId } from "./target-tab";
import type { CreateActions } from "./views";

export function createActions(ctx: PanelContext): CreateActions & {
  startRepair(modId: string, modName: string): void;
} {
  let generation: AbortController | undefined;
  let pickTabId: number | undefined;
  const fail = (message: string) =>
    ctx.update({ tab: "create", screen: { name: "error", message } });

  async function withTab(run: (tabId: number) => Promise<void>) {
    const tabId = await targetTabId();
    if (tabId === undefined) return fail("Open a web page in this window first.");
    await run(tabId);
  }

  function showPreview(
    purpose: Purpose,
    tabId: number,
    generated: GeneratedDraft,
    preview: PreviewScreen["preview"],
  ) {
    ctx.update({
      tab: "create",
      saveError: undefined,
      screen: {
        name: "preview",
        purpose,
        tabId,
        generated,
        preview,
        showCode: false,
        jsReviewed: preview.js === "ran",
        saving: false,
      },
    });
  }

  async function save(screen: PreviewScreen, granted: boolean) {
    if (!granted) {
      return ctx.update({
        screen: { ...screen, saving: false },
        saveError: "Access wasn't granted, so the mod wasn't saved. Click again and choose Allow.",
      });
    }
    const common = {
      tabId: screen.tabId,
      generated: screen.generated,
      jsReviewed: screen.jsReviewed,
    };
    const message =
      screen.purpose.kind === "repair"
        ? await ctx.rpc.call("saveRepair", { ...common, modId: screen.purpose.modId }).then((r) =>
            r.ok
              ? {
                  ok: true as const,
                  text: `Repaired “${r.value.name}” (now version ${r.value.version}).`,
                }
              : r,
          )
        : await ctx.rpc
            .call("keep", common)
            .then((r) => (r.ok ? { ok: true as const, text: `Saved “${r.value.name}”.` } : r));
    if (!message.ok)
      return ctx.update({ screen: { ...screen, saving: false }, saveError: message.error });
    ctx.update({ screen: { name: "saved", message: message.text }, request: "", picked: null });
    void ctx.refreshMods();
  }

  return {
    setRequest: (value) => {
      ctx.get().request = value;
      const button = document.getElementById("generate") as HTMLButtonElement | null;
      if (button) button.disabled = !ctx.get().provider.configured || !value.trim();
    },
    pick: () =>
      void withTab(async (tabId) => {
        pickTabId = tabId;
        ctx.update({ screen: { name: "picking" } });
        const picked = await ctx.rpc.call("pick", { tabId });
        if (!picked.ok) return fail(picked.error);
        ctx.update({ screen: { name: "compose" }, picked: picked.value ?? ctx.get().picked });
      }),
    cancelPick: () => {
      if (pickTabId !== undefined) void ctx.rpc.call("cancelPick", { tabId: pickTabId });
    },
    clearPicked: () => ctx.update({ picked: null }),
    generate: () =>
      void withTab(async (tabId) => {
        generation = new AbortController();
        ctx.update({
          screen: { name: "generating", label: "Writing your mod…" },
          saveError: undefined,
        });
        const { request, picked } = ctx.get();
        const generated = await ctx.rpc.call(
          "generate",
          { tabId, request, pickedElement: picked ?? undefined },
          generation.signal,
        );
        if (!generated.ok)
          return generation.signal.aborted
            ? ctx.update({ screen: { name: "compose" } })
            : fail(generated.error);
        const preview = await ctx.rpc.call("preview", { tabId, draft: generated.value.draft });
        if (!preview.ok) return fail(preview.error);
        showPreview({ kind: "create" }, tabId, generated.value, preview.value);
      }),
    startRepair: (modId, modName) =>
      void withTab(async (tabId) => {
        generation = new AbortController();
        ctx.update({
          tab: "create",
          screen: { name: "generating", label: `Repairing “${modName}”…` },
        });
        const result = await ctx.rpc.call("repair", { tabId, modId }, generation.signal);
        if (!result.ok)
          return generation.signal.aborted
            ? ctx.update({ screen: { name: "compose" } })
            : fail(result.error);
        showPreview(
          { kind: "repair", modId, modName },
          tabId,
          result.value.generated,
          result.value.preview,
        );
      }),
    cancelGenerate: () => generation?.abort(),
    save: () => {
      const screen = ctx.get().screen;
      if (screen.name !== "preview") return;
      // permissions.request needs this click's user gesture, so it must be the first call.
      const permission = browser.permissions.request({
        origins: originsForMatches(screen.generated.draft.matches),
      });
      ctx.update({ screen: { ...screen, saving: true }, saveError: undefined });
      void permission.then(
        (granted) => save(screen, granted),
        () => save(screen, false),
      );
    },
    discard: () => {
      const screen = ctx.get().screen;
      if (screen.name !== "preview") return;
      void ctx.rpc
        .call("discard", { tabId: screen.tabId })
        .then(() => ctx.update({ screen: { name: "compose" }, saveError: undefined }));
    },
    toggleCode: () => {
      const screen = ctx.get().screen;
      if (screen.name !== "preview") return;
      ctx.update({ screen: { ...screen, showCode: !screen.showCode, jsReviewed: true } });
    },
    backToCompose: () => ctx.update({ screen: { name: "compose" } }),
    openSettings: () => void browser.runtime.openOptionsPage(),
  };
}
