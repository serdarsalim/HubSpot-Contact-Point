const ATTACHED_POPUP_PATH = "popup.html";
const DETACHED_POPUP_PATH = "popup.html?mode=detached";
const ATTACHED_POPUP_URL = chrome.runtime.getURL(ATTACHED_POPUP_PATH);
const DETACHED_POPUP_URL = chrome.runtime.getURL(DETACHED_POPUP_PATH);
const SETTINGS_KEY = "popupSettings";
const DEFAULT_LAUNCH_MODE = "attached";
const OPEN_POPUP_WINDOW_MESSAGE = "OPEN_POPUP_WINDOW";
const OPEN_OR_REUSE_WHATSAPP_TAB_MESSAGE = "OPEN_OR_REUSE_WHATSAPP_TAB";

async function openOrFocusPopupWindow() {
  const existingTabs = await chrome.tabs.query({ url: [DETACHED_POPUP_URL, ATTACHED_POPUP_URL] });
  const existingTab = existingTabs.find((tab) => String(tab.url || "").includes("popup.html?mode=detached")) || existingTabs[0];

  if (existingTab && typeof existingTab.windowId === "number") {
    await chrome.windows.update(existingTab.windowId, { focused: true });
    if (typeof existingTab.id === "number") {
      await chrome.tabs.update(existingTab.id, { active: true });
    }
    return;
  }

  await chrome.windows.create({
    url: DETACHED_POPUP_URL,
    type: "popup",
    width: 980,
    height: 760
  });
}

async function openOrReuseWhatsappTab(urlInput, sender = null) {
  const url = String(urlInput || "").trim();
  if (!url) {
    throw new Error("WhatsApp URL is missing.");
  }

  const existingTabs = await chrome.tabs.query({ url: ["https://web.whatsapp.com/*"] });
  const existingTab = [...existingTabs].sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0))[0] || null;

  if (existingTab && typeof existingTab.id === "number") {
    await chrome.tabs.update(existingTab.id, { url, active: true });
    if (typeof existingTab.windowId === "number") {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }
    return;
  }

  const targetWindowId = typeof sender?.tab?.windowId === "number" ? sender.tab.windowId : undefined;
  const createIndex = typeof sender?.tab?.index === "number" ? sender.tab.index + 1 : undefined;
  await chrome.tabs.create({
    url,
    active: true,
    ...(typeof targetWindowId === "number" ? { windowId: targetWindowId } : {}),
    ...(typeof createIndex === "number" ? { index: createIndex } : {})
  });
}

function normalizeLaunchMode(value) {
  return String(value || "").toLowerCase() === "detached" ? "detached" : "attached";
}

async function readLaunchMode() {
  const result = await chrome.storage.sync.get(SETTINGS_KEY);
  return normalizeLaunchMode(result?.[SETTINGS_KEY]?.defaultLaunchMode || DEFAULT_LAUNCH_MODE);
}

async function applyActionPopupByLaunchMode(modeInput) {
  const mode = normalizeLaunchMode(modeInput);
  await chrome.action.setPopup({ popup: mode === "detached" ? "" : ATTACHED_POPUP_PATH });
  return mode;
}

async function syncActionPopupBySettings() {
  const mode = await readLaunchMode();
  await applyActionPopupByLaunchMode(mode);
}

chrome.action.onClicked.addListener(() => {
  openOrFocusPopupWindow().catch((error) => {
    console.error("Could not open extension window", error);
  });
});

chrome.runtime.onInstalled.addListener(() => {
  void syncActionPopupBySettings().catch((error) => {
    console.error("Could not apply launch mode on install", error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  void syncActionPopupBySettings().catch((error) => {
    console.error("Could not apply launch mode on startup", error);
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return;
  const settingsChange = changes?.[SETTINGS_KEY];
  if (!settingsChange) return;
  const nextMode = normalizeLaunchMode(settingsChange.newValue?.defaultLaunchMode || DEFAULT_LAUNCH_MODE);
  void applyActionPopupByLaunchMode(nextMode).catch((error) => {
    console.error("Could not update launch mode from storage change", error);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === OPEN_POPUP_WINDOW_MESSAGE) {
    openOrFocusPopupWindow()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error || "Unknown error") }));
    return true;
  }

  if (message?.type === OPEN_OR_REUSE_WHATSAPP_TAB_MESSAGE) {
    openOrReuseWhatsappTab(message?.url, _sender)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error || "Unknown error") }));
    return true;
  }
});

void syncActionPopupBySettings().catch((error) => {
  console.error("Could not apply launch mode at worker start", error);
});
