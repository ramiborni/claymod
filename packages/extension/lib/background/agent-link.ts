import {
  agentCallSchema,
  BRIDGE_HOST_NAME,
  bridgeResponseSchema,
} from "@claymod/core/bridge-protocol";
import { AGENT_STATUS_KEY } from "@/lib/agent-keys";
import { NEEDS_PERMISSION, nativeMessagingError, RELOAD_NEEDED } from "@/lib/bridge-errors";
import type { AgentLinkStatus } from "@/lib/rpc/protocol";
import { getAgentAccess } from "@/lib/storage";
import { declineAll } from "./agent-requests";
import { handleAgentCall } from "./agent-tools";

/**
 * M5: while "Let agents use Claymod" is on, one native port stays open to claymod-bridge, which
 * listens for `claymod-bridge mcp` on a user-only socket. An open native port keeps the service
 * worker alive (Chrome 105+). If the bridge goes away, the link retries with backoff.
 */
let port: Browser.runtime.Port | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 2_000;
const MAX_RETRY_DELAY = 60_000;

async function setStatus(status: AgentLinkStatus): Promise<void> {
  await browser.storage.session.set({ [AGENT_STATUS_KEY]: status });
}

export async function agentLinkStatus(): Promise<AgentLinkStatus> {
  const stored = (await browser.storage.session.get(AGENT_STATUS_KEY))[AGENT_STATUS_KEY];
  return (
    (stored as AgentLinkStatus | undefined) ?? { enabled: await getAgentAccess(), state: "off" }
  );
}

function disconnect(): void {
  clearTimeout(retryTimer);
  retryTimer = undefined;
  const open = port;
  port = undefined;
  open?.disconnect();
  declineAll();
}

function scheduleRetry(): void {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void syncAgentLink(), retryDelay);
  retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
}

function connect(): void {
  const serveId = crypto.randomUUID();
  const opened = browser.runtime.connectNative(BRIDGE_HOST_NAME);
  port = opened;
  opened.onMessage.addListener((message: unknown) => {
    const call = agentCallSchema.safeParse(message);
    if (call.success) {
      void handleAgentCall(call.data).then((result) => {
        if (port !== opened) return;
        opened.postMessage({
          type: "agentResult",
          id: crypto.randomUUID(),
          callId: call.data.callId,
          result,
        });
      });
      return;
    }
    const response = bridgeResponseSchema.safeParse(message);
    if (!response.success || response.data.id !== serveId) return;
    if (response.data.ok) {
      retryDelay = 2_000;
      void setStatus({ enabled: true, state: "connected" });
    } else {
      void setStatus({ enabled: true, state: "error", error: response.data.error.message });
    }
  });
  opened.onDisconnect.addListener(() => {
    if (port !== opened) return; // we closed it on purpose
    port = undefined;
    declineAll();
    const error = nativeMessagingError(browser.runtime.lastError?.message, browser.runtime.id);
    void setStatus({ enabled: true, state: "error", error });
    scheduleRetry();
  });
  opened.postMessage({ type: "serve", id: serveId });
}

/** Opens or closes the link to match the setting. Cheap to call often. */
export async function syncAgentLink(): Promise<AgentLinkStatus> {
  if (!(await getAgentAccess())) {
    disconnect();
    const off: AgentLinkStatus = { enabled: false, state: "off" };
    await setStatus(off);
    return off;
  }
  if (port) return agentLinkStatus();
  if (typeof browser.runtime.connectNative !== "function") {
    const granted = await browser.permissions.contains({ permissions: ["nativeMessaging"] });
    const status: AgentLinkStatus = {
      enabled: true,
      state: "error",
      error: granted ? RELOAD_NEEDED : NEEDS_PERMISSION,
    };
    await setStatus(status);
    return status;
  }
  // No await between the `port` check above and connect(): concurrent calls (the settings switch
  // and the storage listener) must not open two links.
  void setStatus({ enabled: true, state: "connecting" });
  connect();
  return agentLinkStatus();
}
