import "@/lib/ui/theme.css";
import { useJitlessZod } from "@claymod/core/zod-config";
import { createRpcClient } from "@/lib/rpc/client";
import { getProviderConfig, setProviderConfig } from "@/lib/storage";
import { type FormValues, toConfig, toFormValues } from "./form";

useJitlessZod();
const rpc = createRpcClient();
const form = document.getElementById("provider-form") as HTMLFormElement;
const status = document.getElementById("status") as HTMLElement;
const field = <T extends HTMLElement>(name: string) =>
  form.elements.namedItem(name) as unknown as T;

function read(): FormValues {
  return {
    kind: field<HTMLSelectElement>("kind").value as FormValues["kind"],
    baseUrl: field<HTMLInputElement>("baseUrl").value,
    model: field<HTMLInputElement>("model").value,
    apiKey: field<HTMLInputElement>("apiKey").value,
    responseFormat: field<HTMLSelectElement>("responseFormat")
      .value as FormValues["responseFormat"],
    structuredOutput: field<HTMLInputElement>("structuredOutput").checked,
  };
}

function write(values: FormValues) {
  field<HTMLSelectElement>("kind").value = values.kind;
  field<HTMLInputElement>("baseUrl").value = values.baseUrl;
  field<HTMLInputElement>("model").value = values.model;
  field<HTMLInputElement>("apiKey").value = values.apiKey;
  field<HTMLSelectElement>("responseFormat").value = values.responseFormat;
  field<HTMLInputElement>("structuredOutput").checked = values.structuredOutput;
  syncVisibility();
}

/** Shows only the fields that apply to the chosen provider. */
function syncVisibility() {
  const anthropic = field<HTMLSelectElement>("kind").value === "anthropic";
  for (const element of form.querySelectorAll<HTMLElement>("[data-for]")) {
    element.hidden = element.dataset.for !== (anthropic ? "anthropic" : "openai-compatible");
  }
  field<HTMLInputElement>("baseUrl").placeholder = anthropic
    ? "https://api.anthropic.com (default)"
    : "http://localhost:11434/v1";
  field<HTMLInputElement>("model").placeholder = anthropic ? "claude-opus-5-5" : "llama3.1:8b";
}

function show(kind: "ok" | "error" | "info", message: string) {
  status.className = `notice ${kind === "info" ? "warn" : kind}`;
  status.textContent = message;
  status.hidden = false;
}

field<HTMLSelectElement>("kind").addEventListener("change", () => {
  const kind = field<HTMLSelectElement>("kind").value as FormValues["kind"];
  write(toFormValues(kind === "anthropic" ? { kind, apiKey: "" } : undefined));
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const built = toConfig(read());
  if (!built.ok) return show("error", built.error);
  await setProviderConfig(built.config);
  show("ok", "Saved.");
});

document.getElementById("test")?.addEventListener("click", async () => {
  const built = toConfig(read());
  if (!built.ok) return show("error", built.error);
  show("info", "Testing…");
  const result = await rpc.call("testConnection", { config: built.config });
  if (result.ok) show("ok", `Connected. ${result.value.model} answered.`);
  else show("error", result.error);
});

document.getElementById("toggle-key")?.addEventListener("click", (event) => {
  const input = field<HTMLInputElement>("apiKey");
  input.type = input.type === "password" ? "text" : "password";
  (event.target as HTMLButtonElement).textContent = input.type === "password" ? "Show" : "Hide";
});

write(toFormValues(await getProviderConfig()));
