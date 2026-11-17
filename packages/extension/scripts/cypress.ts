// Serves the built extension's pages over http and runs Cypress against them.
// Usage: bun scripts/cypress.ts [open]
import path from "node:path";

const root = path.resolve(import.meta.dir, "../.output/chrome-mv3");
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 4310,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const file = Bun.file(path.join(root, path.normalize(pathname).replace(/^(\.\.[/\\])+/, "")));
    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
  },
});

const mode = Bun.argv[2] === "open" ? "open" : "run";
// CYPRESS_BROWSER: "chrome", "chromium" or a path to a Chromium binary. Cypress's bundled
// Electron browser is deprecated, so CI sets this.
const browser = process.env.CYPRESS_BROWSER ? ["--browser", process.env.CYPRESS_BROWSER] : [];
const cypress = Bun.spawn(["bunx", "cypress", mode, ...browser], {
  stdio: ["inherit", "inherit", "inherit"],
  env: { ...process.env, CYPRESS_BASE_URL: `http://127.0.0.1:${server.port}` },
});
const exitCode = await cypress.exited;
server.stop(true);
process.exit(exitCode);
