/** The command that registers claymod-bridge for this extension. */
export const installCommand = (extensionId: string) =>
  `claymod-bridge install --extension-id ${extensionId}`;

export const NEEDS_PERMISSION =
  "Claymod needs permission to talk to local apps. Open Claymod settings, choose Local agent and click Test connection to allow it.";

export const RELOAD_NEEDED =
  "Chrome hasn't enabled local apps for Claymod yet. Open chrome://extensions, click reload on Claymod, then try again.";

/**
 * Chrome reports native messaging problems as fixed English strings
 * (https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging#native-messaging-debugging).
 * Each one maps to the step that fixes it.
 */
export function nativeMessagingError(
  chromeMessage: string | undefined,
  extensionId: string,
): string {
  const message = chromeMessage ?? "";
  const install = installCommand(extensionId);
  if (/not found/i.test(message)) {
    return `claymod-bridge isn't set up for this browser. Install it, then run in a terminal: ${install}`;
  }
  if (/forbidden/i.test(message)) {
    return `claymod-bridge doesn't allow this copy of Claymod yet. Run in a terminal: ${install}`;
  }
  if (/failed to start/i.test(message)) {
    return `Chrome couldn't start claymod-bridge. Run '${install}' again, then 'claymod-bridge doctor'.`;
  }
  if (/exited|communicating/i.test(message)) {
    return "claymod-bridge stopped unexpectedly. Run 'claymod-bridge doctor' in a terminal to see what's wrong.";
  }
  return `Couldn't reach claymod-bridge${message ? ` (${message})` : ""}. Run 'claymod-bridge doctor' in a terminal.`;
}

export const outdatedBridge = (bridgeVersion: string) =>
  `claymod-bridge ${bridgeVersion} doesn't match this version of Claymod. Install the latest claymod-bridge, then run 'claymod-bridge install' again.`;
