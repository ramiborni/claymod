/**
 * Stands in for claude / codex / gemini / agy in integration tests. It records how the bridge
 * started it (arguments, a few environment variables, stdin, files in its folder) next to itself,
 * then answers the way the real CLI's documented headless output looks.
 * Usage: fake-agent.ts <state-dir> <agent> [args…]. Behaviour comes from <state-dir>/mode.txt
 * (ok | auth | slow) and <state-dir>/draft.json (optional); calls go to <state-dir>/calls.jsonl.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [dir = ".", agent = "", ...args] = process.argv.slice(2);
const modeFile = join(dir, "mode.txt");
const mode = existsSync(modeFile) ? readFileSync(modeFile, "utf8").trim() : "ok";
const stdin = await Bun.stdin.text();

const RECORDED_ENV = [
  "HOME",
  "CODEX_HOME",
  "ANTHROPIC_API_KEY",
  "CODEX_API_KEY",
  "GEMINI_API_KEY",
  "LANGSMITH_TRACING",
  "LANGCHAIN_TRACING_V2",
  "SECRET_FROM_SHELL",
];
appendFileSync(
  join(dir, "calls.jsonl"),
  `${JSON.stringify({
    agent,
    args,
    cwd: process.cwd(),
    files: readdirSync(process.cwd(), { recursive: true }),
    env: Object.fromEntries(RECORDED_ENV.map((key) => [key, process.env[key] ?? null])),
    stdin,
  })}\n`,
);

if (mode === "slow") await Bun.sleep(60_000);

const draftFile = join(dir, "draft.json");
const draft = existsSync(draftFile)
  ? JSON.parse(readFileSync(draftFile, "utf8"))
  : {
      name: `From ${agent}`,
      description: "d",
      matches: ["https://example.com/*"],
      css: "a{}",
      runAt: "document_idle",
      checks: [{ selector: "a", expect: "exists" }],
    };

function answer(): number {
  if (agent === "claude") {
    if (args[0] === "auth") return mode === "auth" ? 1 : 0;
    if (mode === "auth") {
      console.log(JSON.stringify({ is_error: true, result: "Not logged in · Please run /login" }));
      return 1;
    }
    console.log(
      JSON.stringify({
        is_error: false,
        result: "",
        structured_output: draft,
        modelUsage: { "claude-fake-1": {} },
      }),
    );
    return 0;
  }
  if (agent === "codex") {
    if (args[0] === "login") return mode === "auth" ? 1 : 0;
    if (mode === "auth") {
      console.error("Error: Not logged in. Run codex login.");
      return 1;
    }
    const out = args[args.indexOf("--output-last-message") + 1] ?? "";
    writeFileSync(out, JSON.stringify({ ...draft, js: null }));
    return 0;
  }
  if (agent === "gemini") {
    console.log(
      JSON.stringify({ response: JSON.stringify(draft), stats: { models: { "gemini-fake": {} } } }),
    );
    return 0;
  }
  if (agent === "agy") {
    console.log(JSON.stringify({ status: "SUCCESS", response: "", structured_output: draft }));
    return 0;
  }
  return 2;
}

process.exit(answer());
