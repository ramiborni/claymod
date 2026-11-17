import { defineConfig } from "wxt";

// Install-time permissions grant no site access. Page access comes from activeTab (toolbar click)
// or from per-site optional host permissions requested when a mod is kept.
// "nativeMessaging" (claymod-bridge) is optional and requested from the settings page.
// The "e2e" build mode alone pre-grants the local fixture server so Playwright, which can't
// click the toolbar icon or accept permission prompts, can drive the real flows.
export default defineConfig({
  manifest: ({ mode }) => ({
    name: "Claymod",
    description: "Change how any website looks and works by describing the change.",
    minimum_chrome_version: "135",
    permissions: [
      "storage",
      "sidePanel",
      "activeTab",
      "scripting",
      "userScripts",
      // Playwright can't accept permission prompts, so the e2e build grants local apps upfront.
      ...(mode === "e2e" ? ["nativeMessaging"] : []),
    ],
    // Asked for only when the user chooses a local agent (claymod-bridge) in settings.
    optional_permissions: mode === "e2e" ? [] : ["nativeMessaging"],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    ...(mode === "e2e" ? { host_permissions: ["http://127.0.0.1/*"] } : {}),
    action: {
      default_title: "Open Claymod",
    },
  }),
});
