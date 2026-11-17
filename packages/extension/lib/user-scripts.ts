/** Whether chrome.userScripts can be used right now (the user may have switched it off). */
export function userScriptsAvailable(): boolean {
  try {
    void browser.userScripts.getScripts();
    return true;
  } catch {
    return false;
  }
}

function chromeMajorVersion(userAgent: string): number {
  return Number(/Chrome\/(\d+)/.exec(userAgent)?.[1] ?? 0);
}

/** Step-by-step help that matches the user's Chrome version. */
export function userScriptsHelp(extensionId: string, userAgent = navigator.userAgent): string {
  const page = `chrome://extensions/?id=${extensionId}`;
  return chromeMajorVersion(userAgent) >= 138
    ? `To run JavaScript mods, open ${page} and turn on "Allow User Scripts", then try again.`
    : `To run JavaScript mods, open chrome://extensions and turn on "Developer mode" (top right), then try again.`;
}
