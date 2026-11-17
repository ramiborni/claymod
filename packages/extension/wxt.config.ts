import { defineConfig } from "wxt";

// Permissions stay minimal on purpose. Host access is requested per site when a mod is
// kept (optional_host_permissions, added in M2), never <all_urls> at install time.
export default defineConfig({
  manifest: {
    name: "Claymod",
    description: "Change how any website looks and works by describing the change.",
    minimum_chrome_version: "120",
    permissions: ["storage", "sidePanel"],
    action: {
      default_title: "Open Claymod",
    },
  },
});
