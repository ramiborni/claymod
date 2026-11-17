import { AGENT_IDS, AGENT_LABELS, type AgentId } from "@claymod/core/bridge-protocol";
import type { Command } from "../context";
import { KEYCHAIN_HELP } from "../keys";
import { RUNNERS } from "../runners";

export const KEYS_HELP = `Usage: claymod-bridge keys <list | set <agent> | delete <agent>>

Manages API keys for agents in API-key mode, stored in the system keychain.
Agents: ${AGENT_IDS.join(", ")}
'set' asks for the key without showing it, or reads it from stdin when piped.`;

const isAgent = (value: string | undefined): value is AgentId =>
  (AGENT_IDS as readonly string[]).includes(value ?? "");

export const keys: Command = async (args, context) => {
  const [action, agent] = args;
  if (action === "list") {
    for (const id of AGENT_IDS) {
      const saved = await context.keys.get(id).catch(() => undefined);
      context.out(`${AGENT_LABELS[id]} (${id}): ${saved ? "saved" : "not saved"}`);
    }
    return 0;
  }
  if ((action !== "set" && action !== "delete") || !isAgent(agent)) {
    context.out(KEYS_HELP);
    return action === undefined || action === "--help" || action === "-h" ? 0 : 2;
  }
  try {
    if (action === "delete") {
      const deleted = await context.keys.delete(agent);
      context.out(deleted ? `✓ Deleted the ${AGENT_LABELS[agent]} key.` : "No key was saved.");
      return 0;
    }
    const key = (
      await context.readSecret(`${AGENT_LABELS[agent]} API key (${RUNNERS[agent].keyEnv}): `)
    ).trim();
    if (!key) {
      context.err("No key entered; nothing saved.");
      return 2;
    }
    await context.keys.set(agent, key);
    context.out(`✓ Saved the ${AGENT_LABELS[agent]} key in the system keychain.`);
    return 0;
  } catch {
    context.err(KEYCHAIN_HELP);
    return 1;
  }
};
