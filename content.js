(() => {
  const DEFAULT_COUNTRY_CODE = "60";
  const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/g;
  const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  function normalizePhone(raw) {
    const trimmed = (raw || "").trim();
    const digits = trimmed.replace(/\D/g, "");
    if (!digits) return null;

    if (trimmed.startsWith("+")) return digits;
    if (digits.startsWith(DEFAULT_COUNTRY_CODE)) return digits;
    return `${DEFAULT_COUNTRY_CODE}${digits}`;
  }

  function cleanText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function getRowLikeElements() {
    const rows = new Set();

    document.querySelectorAll("tr, [role='row'], .private-table__row, .private-table-row").forEach((el) => {
      rows.add(el);
    });

    // Fallback for card/list layouts.
    document.querySelectorAll("li, article, [data-test-id*='record'], [class*='record']").forEach((el) => {
      if (el.textContent && PHONE_PATTERN.test(el.textContent)) rows.add(el);
      PHONE_PATTERN.lastIndex = 0;
    });

    return Array.from(rows);
  }

  function extractFromElement(element) {
    const text = cleanText(element.innerText || element.textContent || "");
    if (!text) return [];

    const emails = Array.from(text.matchAll(EMAIL_PATTERN)).map((m) => m[0]);
    const phonesRaw = Array.from(text.matchAll(PHONE_PATTERN)).map((m) => m[0]);

    if (!phonesRaw.length) return [];

    const phones = [];
    const seenPhones = new Set();
    for (const p of phonesRaw) {
      const normalized = normalizePhone(p);
      if (!normalized || seenPhones.has(normalized)) continue;
      seenPhones.add(normalized);
      phones.push({ raw: p.trim(), normalized });
    }

    if (!phones.length) return [];

    const parts = text.split(/\n|\||•|,/).map(cleanText).filter(Boolean);
    let name = "";

    for (const part of parts) {
      const looksEmail = EMAIL_PATTERN.test(part);
      EMAIL_PATTERN.lastIndex = 0;
      const looksPhone = PHONE_PATTERN.test(part);
      PHONE_PATTERN.lastIndex = 0;

      if (!looksEmail && !looksPhone && part.length >= 2 && part.length <= 80) {
        name = part;
        break;
      }
    }

    if (!name) {
      name = cleanText(text.replace(EMAIL_PATTERN, "").replace(PHONE_PATTERN, "")).slice(0, 80) || "Unknown";
    }

    const primaryEmail = emails[0] || "";

    return phones.map((phone) => ({
      name,
      email: primaryEmail,
      phoneDisplay: phone.raw,
      phoneDigits: phone.normalized,
      waUrl: `https://wa.me/${phone.normalized}`
    }));
  }

  function dedupeContacts(contacts) {
    const out = [];
    const seen = new Set();

    for (const c of contacts) {
      const key = `${c.name}|${c.email}|${c.phoneDigits}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }

    return out;
  }

  function collectContacts() {
    const rows = getRowLikeElements();
    const all = [];

    for (const row of rows) {
      all.push(...extractFromElement(row));
    }

    // Fallback: collect phone links directly if row parsing misses some.
    document.querySelectorAll("a[href^='tel:'], a[href*='wa.me/']").forEach((a) => {
      const raw = cleanText(a.textContent || a.getAttribute("href") || "");
      const normalized = normalizePhone(raw);
      if (!normalized) return;

      const container = a.closest("tr, [role='row'], li, article, div") || a.parentElement;
      const context = cleanText(container?.innerText || "");
      const emailMatch = context.match(EMAIL_PATTERN);
      const email = emailMatch ? emailMatch[0] : "";
      const name = cleanText(context.replace(EMAIL_PATTERN, "").replace(PHONE_PATTERN, "")).slice(0, 80) || "Unknown";

      all.push({
        name,
        email,
        phoneDisplay: raw,
        phoneDigits: normalized,
        waUrl: `https://wa.me/${normalized}`
      });
    });

    return dedupeContacts(all);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "GET_CONTACTS") return;

    try {
      const contacts = collectContacts();
      sendResponse({ ok: true, contacts });
    } catch (error) {
      sendResponse({ ok: false, error: String(error) });
    }
  });
})();
