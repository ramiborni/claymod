import { AGENT_APPROVAL_TIMEOUT_MS } from "@claymod/core/bridge-protocol";
import { AGENT_REQUESTS_KEY } from "@/lib/agent-keys";
import type { AgentOutcome, AgentRequestView } from "@/lib/rpc/protocol";

/**
 * Previews and saves agents ask for, waiting for the user in the side panel. The list is
 * mirrored in storage.session so the panel can show it as soon as it opens. The service worker
 * stays alive while the bridge link is open, so the waiting promises survive.
 */
const pending = new Map<
  string,
  { view: AgentRequestView; resolve(outcome: AgentOutcome | "timeout"): void }
>();

async function publish(): Promise<void> {
  const views = [...pending.values()].map((entry) => entry.view);
  await browser.storage.session.set({ [AGENT_REQUESTS_KEY]: views });
}

/** Shows the request in the side panel and resolves with the user's decision, or "timeout". */
export function askUser(
  view: Omit<AgentRequestView, "id" | "createdAt">,
  timeoutMs = AGENT_APPROVAL_TIMEOUT_MS,
): Promise<AgentOutcome | "timeout"> {
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish("timeout"), timeoutMs);
    const finish = (outcome: AgentOutcome | "timeout") => {
      clearTimeout(timer);
      pending.delete(id);
      void publish();
      resolve(outcome);
    };
    pending.set(id, {
      view: { ...view, id, createdAt: new Date().toISOString() },
      resolve: finish,
    });
    void publish();
  });
}

export function decide(requestId: string, outcome: AgentOutcome): boolean {
  const entry = pending.get(requestId);
  entry?.resolve(outcome);
  return Boolean(entry);
}

export const listRequests = (): AgentRequestView[] => [...pending.values()].map((e) => e.view);

/** When the link closes, waiting agents get an answer instead of hanging. */
export function declineAll(): void {
  for (const entry of [...pending.values()]) entry.resolve({ kind: "declined" });
}
