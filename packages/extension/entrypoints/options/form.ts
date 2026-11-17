import {
  type AgentAuth,
  type AgentId,
  agentIdSchema,
  SIGN_IN_RISK_AGENTS,
} from "@claymod/core/bridge-protocol";
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
  agent: AgentId;
  auth: AgentAuth;
  /** Google CLIs only: the user read the account-suspension warning for CLI sign-in. */
  riskAccepted: boolean;
}

export const hasSignInRisk = (agent: AgentId) => SIGN_IN_RISK_AGENTS.includes(agent);

/** The CLI's own sign-in, except for Google's CLIs, where an API key is the safe default. */
export const defaultAuth = (agent: AgentId): AgentAuth =>
  hasSignInRisk(agent) ? "api-key" : "cli";

const AGENT_DEFAULTS = { agent: "claude-code", auth: "cli", riskAccepted: false } as const;

export function toFormValues(config: ProviderConfig | undefined): FormValues {
  if (config?.kind === "anthropic") {
    return {
      ...AGENT_DEFAULTS,
      kind: "anthropic",
      baseUrl: config.baseUrl ?? "",
      model: config.model ?? ANTHROPIC_DEFAULT_MODEL,
      apiKey: config.apiKey,
      responseFormat: "json_object",
      structuredOutput: config.structuredOutput ?? true,
    };
  }
  if (config?.kind === "local-agent") {
    return {
      kind: "local-agent",
      baseUrl: "",
      model: config.model ?? "",
      apiKey: "",
      responseFormat: "json_object",
      structuredOutput: true,
      agent: config.agent,
      auth: config.auth,
      riskAccepted: config.auth === "cli" && hasSignInRisk(config.agent),
    };
  }
  return {
    ...AGENT_DEFAULTS,
    kind: "openai-compatible",
    baseUrl: config?.baseUrl ?? OLLAMA_DEFAULT_URL,
    model: config?.model ?? "",
    apiKey: config?.apiKey ?? "",
    responseFormat: config?.responseFormat ?? "json_object",
    structuredOutput: true,
  };
}

function candidate(values: FormValues): unknown {
  if (values.kind === "anthropic") {
    return {
      kind: "anthropic",
      apiKey: values.apiKey.trim(),
      model: values.model.trim() || undefined,
      baseUrl: values.baseUrl.trim() || undefined,
      structuredOutput: values.structuredOutput,
    };
  }
  if (values.kind === "local-agent") {
    return {
      kind: "local-agent",
      agent: agentIdSchema.parse(values.agent),
      auth: values.auth,
      model: values.model.trim() || undefined,
    };
  }
  return {
    kind: "openai-compatible",
    baseUrl: values.baseUrl.trim(),
    model: values.model.trim(),
    apiKey: values.apiKey.trim() || undefined,
    responseFormat: values.responseFormat,
  };
}

const FIELD_MESSAGES: Record<string, string> = {
  apiKey: "Enter your Anthropic API key.",
  baseUrl: "Enter a full base URL, like http://localhost:11434/v1.",
  model: "Enter the model name, like llama3.1:8b.",
};

/** Builds a validated config, or a message saying which field to fix. */
export function toConfig(
  values: FormValues,
): { ok: true; config: ProviderConfig } | { ok: false; error: string } {
  if (
    values.kind === "local-agent" &&
    values.auth === "cli" &&
    hasSignInRisk(values.agent) &&
    !values.riskAccepted
  ) {
    return {
      ok: false,
      error: "Tick “I understand the risk” to use the CLI's Google sign-in, or choose an API key.",
    };
  }
  const parsed = providerConfigSchema.safeParse(JSON.parse(JSON.stringify(candidate(values))));
  if (parsed.success) return { ok: true, config: parsed.data };
  if (values.kind === "local-agent") {
    return {
      ok: false,
      error: "Use a plain model name (letters, digits, . : / @ - _), or leave it empty.",
    };
  }
  const field = String(parsed.error.issues[0]?.path[0] ?? "");
  return { ok: false, error: FIELD_MESSAGES[field] ?? "Check the settings and try again." };
}
