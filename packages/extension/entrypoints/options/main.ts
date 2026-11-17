import "@/lib/ui/theme.css";
import type { AgentAuth, AgentId } from "@claymod/core/bridge-protocol";
import { useJitlessZod } from "@claymod/core/zod-config";
import { createRpcClient } from "@/lib/rpc/client";
import { getProviderConfig, setProviderConfig } from "@/lib/storage";
import { defaultAuth, type FormValues, toConfig, toFormValues } from "./form";
import { allowLocalApps, setUpLocalAgent, syncLocalAgent } from "./local-agent";

useJitlessZod();
const rpc = createRpcClient();
const form = document.getElementById("provider-form") as HTMLFormElement;
const status = document.getElementById("status") as HTMLElement;
const field = <T extends HTMLElement>(name: string) =>
  form.elements.namedItem(name) as unknown as T;
const select = (name: string) => field<HTMLSelectElement>(name);
const input = (name: string) => field<HTMLInputElement>(name);

function read(): FormValues {
  return {
    kind: select("kind").value as FormValues["kind"],
    baseUrl: input("baseUrl").value,
    model: input("model").value,
    apiKey: input("apiKey").value,
    responseFormat: select("responseFormat").value as FormValues["responseFormat"],
    structuredOutput: input("structuredOutput").checked,
    agent: select("agent").value as AgentId,
    auth: select("auth").value as AgentAuth,
    riskAccepted: input("riskAccepted").checked,
  };
}

function write(values: FormValues) {
  select("kind").value = values.kind;
  input("baseUrl").value = values.baseUrl;
  input("model").value = values.model;
  input("apiKey").value = values.apiKey;
  select("responseFormat").value = values.responseFormat;
  input("structuredOutput").checked = values.structuredOutput;
  select("agent").value = values.agent;
  select("auth").value = values.auth;
  input("riskAccepted").checked = values.riskAccepted;
  syncVisibility();
}

const PLACEHOLDERS: Record<FormValues["kind"], { baseUrl: string; model: string }> = {
  "openai-compatible": { baseUrl: "http://localhost:11434/v1", model: "llama3.1:8b" },
  anthropic: { baseUrl: "https://api.anthropic.com (default)", model: "claude-opus-5-5" },
  "local-agent": { baseUrl: "", model: "CLI default" },
};

/** Shows only the fields that apply to the chosen provider (data-for lists the kinds). */
function syncVisibility() {
  const kind = select("kind").value as FormValues["kind"];
  for (const element of form.querySelectorAll<HTMLElement>("[data-for]")) {
    element.hidden = !(element.dataset.for ?? "").split(" ").includes(kind);
  }
  input("baseUrl").placeholder = PLACEHOLDERS[kind].baseUrl;
  input("model").placeholder = PLACEHOLDERS[kind].model;
  syncLocalAgent(form, select("agent").value as AgentId, select("auth").value);
}

function show(kind: "ok" | "error" | "info", message: string) {
  status.className = `notice ${kind === "info" ? "warn" : kind}`;
  status.textContent = message;
  status.hidden = false;
}

select("kind").addEventListener("change", () => {
  const kind = select("kind").value as FormValues["kind"];
  if (kind === "anthropic") write(toFormValues({ kind, apiKey: "" }));
  else if (kind === "local-agent") write(toFormValues({ kind, agent: "claude-code", auth: "cli" }));
  else write(toFormValues(undefined));
});
select("agent").addEventListener("change", () => {
  select("auth").value = defaultAuth(select("agent").value as AgentId);
  input("model").value = ""; // Model names belong to one agent.
  input("riskAccepted").checked = false;
  syncVisibility();
});
select("auth").addEventListener("change", syncVisibility);

/** Validates the form, and for local agents asks Chrome to allow talking to claymod-bridge. */
async function validated() {
  const built = toConfig(read());
  if (!built.ok) {
    show("error", built.error);
    return undefined;
  }
  if (built.config.kind === "local-agent" && !(await allowLocalApps(show))) return undefined;
  return built.config;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const config = await validated();
  if (!config) return;
  await setProviderConfig(config);
  show("ok", "Saved.");
});

document.getElementById("test")?.addEventListener("click", async () => {
  const config = await validated();
  if (!config) return;
  show(
    "info",
    config.kind === "local-agent" ? "Testing… a local agent can take up to a minute." : "Testing…",
  );
  const result = await rpc.call("testConnection", { config });
  if (result.ok) return show("ok", `Connected. ${result.value.model} answered.`);
  show("error", result.error);
  if (config.kind === "local-agent" && result.error.includes("claymod-bridge install")) {
    (document.getElementById("bridge-setup") as HTMLDetailsElement).open = true;
  }
});

document.getElementById("toggle-key")?.addEventListener("click", (event) => {
  const key = input("apiKey");
  key.type = key.type === "password" ? "text" : "password";
  (event.target as HTMLButtonElement).textContent = key.type === "password" ? "Show" : "Hide";
});

setUpLocalAgent({ form, rpc, show, agent: () => select("agent").value as AgentId });
write(toFormValues(await getProviderConfig()));
