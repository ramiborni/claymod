import { type BridgeCall, type BridgeTransport, err, fromBridgeError, ok } from "@claymod/core";
import { BRIDGE_HOST_NAME, bridgeResponseSchema } from "@claymod/core/bridge-protocol";
import { NEEDS_PERMISSION, nativeMessagingError, RELOAD_NEEDED } from "@/lib/bridge-errors";

const network = (message: string) => ({ kind: "network" as const, message });

async function unavailable(): Promise<string> {
  const granted = await browser.permissions.contains({ permissions: ["nativeMessaging"] });
  return granted ? RELOAD_NEEDED : NEEDS_PERMISSION;
}

/**
 * One request over chrome.runtime.connectNative. Each call starts the bridge, which exits when
 * the port closes, so cancelling (or the service worker going away) also stops the agent.
 * An open native port keeps the MV3 service worker alive while the agent works.
 */
export const nativeBridge: BridgeTransport = async (call: BridgeCall, signal) => {
  if (typeof browser.runtime.connectNative !== "function") return err(network(await unavailable()));
  const id = crypto.randomUUID();
  const extensionId = browser.runtime.id;
  return new Promise((resolve) => {
    let settled = false;
    let port: Browser.runtime.Port;
    const finish = (result: Awaited<ReturnType<BridgeTransport>>) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      try {
        port.disconnect();
      } catch {
        // Already closed.
      }
      resolve(result);
    };
    const onAbort = () => {
      try {
        port.postMessage({ type: "cancel", id: `${id}:cancel`, target: id });
      } catch {
        // The bridge is gone; disconnecting below stops it either way.
      }
      finish(err(network("Cancelled.")));
    };
    try {
      port = browser.runtime.connectNative(BRIDGE_HOST_NAME);
    } catch (error) {
      resolve(err(network(nativeMessagingError(String(error), extensionId))));
      return;
    }
    port.onMessage.addListener((message: unknown) => {
      const response = bridgeResponseSchema.safeParse(message);
      if (!response.success || response.data.id !== id) return;
      finish(
        response.data.ok ? ok(response.data.value) : err(fromBridgeError(response.data.error)),
      );
    });
    port.onDisconnect.addListener(() => {
      finish(err(network(nativeMessagingError(browser.runtime.lastError?.message, extensionId))));
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    port.postMessage({ ...call, id });
  });
};
