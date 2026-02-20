const POPUP_URL = chrome.runtime.getURL("popup.html");

async function openOrFocusPopupWindow() {
  const existingTabs = await chrome.tabs.query({ url: [POPUP_URL] });
  const existingTab = existingTabs[0];

  if (existingTab && typeof existingTab.windowId === "number") {
    await chrome.windows.update(existingTab.windowId, { focused: true });
    if (typeof existingTab.id === "number") {
      await chrome.tabs.update(existingTab.id, { active: true });
    }
    return;
  }

  await chrome.windows.create({
    url: POPUP_URL,
    type: "popup",
    width: 980,
    height: 760
  });
}

chrome.action.onClicked.addListener(() => {
  openOrFocusPopupWindow().catch((error) => {
    console.error("Could not open extension window", error);
  });
});
