(() => {
  const App = window.PopupApp;
  if (!App) return;

  const { state } = App;
  const POSTHOG_CAPTURE_URL = "https://us.i.posthog.com/capture/";
  const POSTHOG_API_KEY = "phc_vZmdGVVQUUABuSNtodx6PGN4ZIsgBN2z47QhAbRJFMe";
  const ANALYTICS_CLIENT_ID_KEY = "contactPointAnalyticsClientId";
  const APP_VERSION = chrome?.runtime?.getManifest?.().version || "unknown";

  let analyticsClientId = "";
  let analyticsInitPromise = null;

  function makeClientId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `cid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function readLocalStorageValue(key) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (result) => {
          if (chrome.runtime.lastError) {
            resolve("");
            return;
          }
          resolve(String(result?.[key] || ""));
        });
      } catch (_error) {
        resolve("");
      }
    });
  }

  function writeLocalStorageValue(key, value) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [key]: String(value || "") }, () => resolve());
      } catch (_error) {
        resolve();
      }
    });
  }

  async function ensureAnalyticsClientId() {
    if (analyticsClientId) return analyticsClientId;
    const existing = await readLocalStorageValue(ANALYTICS_CLIENT_ID_KEY);
    if (existing) {
      analyticsClientId = existing;
      return analyticsClientId;
    }

    analyticsClientId = makeClientId();
    await writeLocalStorageValue(ANALYTICS_CLIENT_ID_KEY, analyticsClientId);
    return analyticsClientId;
  }

  function getPortalId() {
    return String(state.currentPortalId || "").replace(/\D/g, "");
  }

  function getDistinctId() {
    const portalId = getPortalId();
    if (portalId) return `portal_${portalId}`;
    if (analyticsClientId) return `extension_${analyticsClientId}`;
    return "extension_unknown";
  }

  function sanitizeProperties(input) {
    const source = input && typeof input === "object" ? input : {};
    const output = {};
    for (const [key, value] of Object.entries(source)) {
      if (!key) continue;
      if (typeof value === "boolean") {
        output[key] = value;
        continue;
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        output[key] = value;
        continue;
      }
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) continue;
        output[key] = trimmed.length > 200 ? trimmed.slice(0, 200) : trimmed;
      }
    }
    return output;
  }

  async function initAnalytics() {
    if (!analyticsInitPromise) {
      analyticsInitPromise = ensureAnalyticsClientId()
        .then(() => true)
        .catch(() => false);
    }
    return analyticsInitPromise;
  }

  function sendCapture(payload) {
    const body = JSON.stringify(payload);

    if (typeof navigator.sendBeacon === "function") {
      try {
        const blob = new Blob([body], { type: "application/json" });
        const accepted = navigator.sendBeacon(POSTHOG_CAPTURE_URL, blob);
        if (accepted) return;
      } catch (_error) {
        // Fallback to fetch below.
      }
    }

    void fetch(POSTHOG_CAPTURE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true
    }).catch(() => {});
  }

  function trackEvent(eventName, properties = {}) {
    const event = String(eventName || "").trim();
    if (!event) return;

    const portalId = getPortalId();
    const payload = {
      api_key: POSTHOG_API_KEY,
      event,
      distinct_id: getDistinctId(),
      properties: sanitizeProperties({
        source: "contact_point_extension",
        app_version: APP_VERSION,
        portal_id: portalId || "",
        ...properties
      })
    };

    sendCapture(payload);
  }

  Object.assign(App, {
    initAnalytics,
    trackEvent
  });
})();
