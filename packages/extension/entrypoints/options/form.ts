import {
  ANTHROPIC_DEFAULT_MODEL,
  type ProviderConfig,
  providerConfigSchema,
} from "@claymod/core/provider-config";

export const OLLAMA_DEFAULT_URL = "http://localhost:11434/v1";

export interface FormValues {
  kind: ProviderConfig["kind"];
  baseUrl: string;
  model: string;
  apiKey: string;
  responseFormat: "json_object" | "json_schema" | "none";
  structuredOutput: boolean;
}

export function toFormValues(config: ProviderConfig | undefined): FormValues {
  if (config?.kind === "anthropic") {
    return {
      kind: "anthropic",
      baseUrl: config.baseUrl ?? "",
      model: config.model ?? ANTHROPIC_DEFAULT_MODEL,
      apiKey: config.apiKey,
      responseFormat: "json_object",
      structuredOutput: config.structuredOutput ?? true,
    };
  }
  return {
    kind: "openai-compatible",
    baseUrl: config?.baseUrl ?? OLLAMA_DEFAULT_URL,
    model: config?.model ?? "",
    apiKey: config?.apiKey ?? "",
    responseFormat: config?.responseFormat ?? "json_object",
    structuredOutput: true,
  };
}

/** Builds a validated config, or a message saying which field to fix. */
export function toConfig(
  values: FormValues,
): { ok: true; config: ProviderConfig } | { ok: false; error: string } {
  const candidate =
    values.kind === "anthropic"
      ? {
          kind: "anthropic",
          apiKey: values.apiKey.trim(),
          model: values.model.trim() || undefined,
          baseUrl: values.baseUrl.trim() || undefined,
          structuredOutput: values.structuredOutput,
        }
      : {
          kind: "openai-compatible",
          baseUrl: values.baseUrl.trim(),
          model: values.model.trim(),
          apiKey: values.apiKey.trim() || undefined,
          responseFormat: values.responseFormat,
        };
  const parsed = providerConfigSchema.safeParse(JSON.parse(JSON.stringify(candidate)));
  if (parsed.success) return { ok: true, config: parsed.data };
  const field = String(parsed.error.issues[0]?.path[0] ?? "");
  const messages: Record<string, string> = {
    apiKey: "Enter your Anthropic API key.",
    baseUrl: "Enter a full base URL, like http://localhost:11434/v1.",
    model: "Enter the model name, like llama3.1:8b.",
  };
  return { ok: false, error: messages[field] ?? "Check the settings and try again." };
}
