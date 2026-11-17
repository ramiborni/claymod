/** The tab the side panel acts on: the active tab in this window. */
export async function targetTabId(): Promise<number | undefined> {
  // The e2e build opens the panel as a normal page, so tests name the target tab.
  if (import.meta.env.MODE === "e2e") {
    const fromQuery = new URLSearchParams(location.search).get("tabId");
    if (fromQuery) return Number(fromQuery);
  }
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}
