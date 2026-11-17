export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel, which is Claymod's main UI.
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
