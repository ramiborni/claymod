import type { AgentId } from "@claymod/core/bridge-protocol";

/**
 * API keys for local agents, kept in the operating system's credential store (macOS Keychain,
 * libsecret on Linux, Windows Credential Manager) through Bun.secrets. Never written to a file
 * and never sent back to the extension.
 */
export interface KeyStore {
  get(agent: AgentId): Promise<string | undefined>;
  set(agent: AgentId, key: string): Promise<void>;
  delete(agent: AgentId): Promise<boolean>;
  /** False when no credential store is reachable (e.g. Linux without a secret service). */
  available(): Promise<boolean>;
}

export const KEYCHAIN_SERVICE = "claymod-bridge";

export const osKeyStore: KeyStore = {
  async get(agent) {
    return (await Bun.secrets.get({ service: KEYCHAIN_SERVICE, name: agent })) ?? undefined;
  },
  async set(agent, key) {
    await Bun.secrets.set({ service: KEYCHAIN_SERVICE, name: agent, value: key });
  },
  async delete(agent) {
    return Bun.secrets.delete({ service: KEYCHAIN_SERVICE, name: agent });
  },
  async available() {
    try {
      await Bun.secrets.get({ service: KEYCHAIN_SERVICE, name: "availability-check" });
      return true;
    } catch {
      return false;
    }
  },
};

/**
 * CLAYMOD_BRIDGE_NO_KEYCHAIN=1: never touch the keychain; API keys come only from environment
 * variables. For machines without a keyring, and for tests that must not read the real one.
 */
export const envOnlyKeyStore: KeyStore = {
  get: async () => undefined,
  set: async () => Promise.reject(new Error("keychain disabled")),
  delete: async () => false,
  available: async () => false,
};

/** For tests: the same contract, in memory. */
export function memoryKeyStore(initial: Partial<Record<AgentId, string>> = {}): KeyStore {
  const keys = new Map(Object.entries(initial) as [AgentId, string][]);
  return {
    get: async (agent) => keys.get(agent),
    set: async (agent, key) => void keys.set(agent, key),
    delete: async (agent) => keys.delete(agent),
    available: async () => true,
  };
}

export const KEYCHAIN_HELP =
  "Claymod couldn't use the system keychain. On Linux, install and unlock a Secret Service keyring (GNOME Keyring or KWallet). Or set the agent's API key variable in the environment Chrome starts with.";
