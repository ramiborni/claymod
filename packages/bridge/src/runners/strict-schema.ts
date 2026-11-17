type Json = Record<string, unknown>;

const UNSUPPORTED = ["$schema", "minLength", "maxLength"];

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Codex's --output-schema uses OpenAI strict structured outputs, where every property must be
 * listed in "required". Optional properties become nullable instead; stripNulls() undoes that
 * on the answer so Claymod's own schema sees the original shape.
 */
export function toStrictSchema(schema: Json): Json {
  const out: Json = { ...schema };
  // Not accepted by every strict-mode model; Claymod validates lengths itself afterwards.
  for (const key of UNSUPPORTED) delete out[key];
  if (isObject(schema.properties)) {
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    const properties: Json = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      const strict = isObject(value) ? toStrictSchema(value) : value;
      properties[key] = required.has(key) || !isObject(strict) ? strict : nullable(strict);
    }
    out.properties = properties;
    out.required = Object.keys(properties);
    out.additionalProperties = false;
  }
  if (isObject(schema.items)) out.items = toStrictSchema(schema.items);
  return out;
}

function nullable(schema: Json): Json {
  if (typeof schema.type === "string") {
    const withNull: Json = { ...schema, type: [schema.type, "null"] };
    if (Array.isArray(schema.enum)) withNull.enum = [...schema.enum, null];
    return withNull;
  }
  return { anyOf: [schema, { type: "null" }] };
}

/** Removes top-level null fields from a JSON object answer; other text is returned unchanged. */
export function stripNulls(text: string): string {
  try {
    const value: unknown = JSON.parse(text);
    if (!isObject(value)) return text;
    const kept = Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null));
    return JSON.stringify(kept);
  } catch {
    return text;
  }
}
