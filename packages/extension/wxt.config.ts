import { defineConfig } from "wxt";

// Install-time permissions grant no site access. Page access comes from activeTab (toolbar click)
// or from per-site optional host permissions requested when a mod is kept.
// The "e2e" build mode alone pre-grants the local fixture server so Playwright, which can't
// click the toolbar icon or accept permission prompts, can drive the real flows.
export default defineConfig({
  manifest: ({ mode }) => ({
    name: "Claymod",
    description: "Change how any website looks and works by describing the change.",
    minimum_chrome_version: "135",
    permissions: ["storage", "sidePanel", "activeTab", "scripting", "userScripts"],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    ...(mode === "e2e" ? { host_permissions: ["http://127.0.0.1/*"] } : {}),
    action: {
      default_title: "Open Claymod",
    },
  }),
});
