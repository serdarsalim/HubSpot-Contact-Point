(() => {
  const DEFAULT_COUNTRY_CODE = "60";
  const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/;

  function cleanText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function slugify(input) {
    return cleanText(input)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "column";
  }

  function stripOuterNoise(text) {
    return cleanText((text || "").replace(/^[\s\-–—|]+|[\s\-–—|]+$/g, "").replace(/\s*--\s*--\s*/g, " "));
  }

  function removeLeadingInitials(name) {
    const tokens = cleanText(name).split(" ").filter(Boolean);
    if (tokens.length < 2) return cleanText(name);

    const isInitialToken = (token) => {
      const cleaned = token.replace(/[^A-Za-z]/g, "");
      return cleaned.length >= 1 && cleaned.length <= 2 && cleaned === cleaned.toUpperCase();
    };

    while (tokens.length > 1 && isInitialToken(tokens[0])) {
      tokens.shift();
    }

    return cleanText(tokens.join(" "));
  }

  function sanitizeNameValue(rawName) {
    const withoutPreview = cleanText(rawName).replace(/\bpreview\b/gi, " ");
    return removeLeadingInitials(stripOuterNoise(withoutPreview));
  }

  function cleanPhoneCandidate(raw) {
    let text = cleanText(raw || "");
    if (!text) return "";

    // Remove trailing short numeric fragments that can leak from adjacent date cells.
    text = text.replace(/\s+\d{1,3}$/, "");
    return cleanText(text);
  }

  function normalizePhone(raw, countryPrefix = DEFAULT_COUNTRY_CODE) {
    const trimmed = cleanPhoneCandidate(raw);
    const digits = trimmed.replace(/\D/g, "");
    if (!digits) return null;

    const prefix = String(countryPrefix || DEFAULT_COUNTRY_CODE).replace(/\D/g, "") || DEFAULT_COUNTRY_CODE;

    if (trimmed.startsWith("+")) return digits;
    if (digits.startsWith(prefix)) return digits;
    return `${prefix}${digits}`;
  }

  function findHeaderRow() {
    const rows = Array.from(document.querySelectorAll("thead tr, [role='row']"));
    let best = null;
    let bestScore = 0;

    for (const row of rows) {
      const headerCells = Array.from(row.querySelectorAll("th, [role='columnheader']"));
      if (!headerCells.length) continue;

      const labels = headerCells.map((cell) => cleanText(cell.innerText || cell.textContent || ""));
      const score = labels.filter((label) => label && !/^[-|]+$/.test(label)).length;

      if (score > bestScore) {
        bestScore = score;
        best = { row, headerCells, labels };
      }
    }

    return bestScore >= 2 ? best : null;
  }

  function buildColumns(headerInfo) {
    const used = new Set();
    const columns = [];

    headerInfo.headerCells.forEach((cell, sourceIndex) => {
      const rawLabel = cleanText(cell.innerText || cell.textContent || "");
      if (!rawLabel) return;
      if (/^[-|]+$/.test(rawLabel)) return;

      let id = slugify(rawLabel);
      let count = 2;
      while (used.has(id)) {
        id = `${slugify(rawLabel)}_${count}`;
        count += 1;
      }

      used.add(id);
      columns.push({ id, label: rawLabel, sourceIndex });
    });

    return columns;
  }

  function getDataRows(headerInfo) {
    const headerRow = headerInfo.row;
    const table = headerRow.closest("table");

    if (table) {
      const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
      if (bodyRows.length) return bodyRows;
    }

    return Array.from(document.querySelectorAll("[role='row']")).filter((row) => {
      if (row === headerRow) return false;
      const hasHeaderCells = row.querySelectorAll("th, [role='columnheader']").length > 0;
      if (hasHeaderCells) return false;
      const cellCount = row.querySelectorAll("td, [role='gridcell']").length;
      if (!cellCount) return false;
      if (row.offsetParent === null) return false;
      return true;
    });
  }

  function findPhoneColumnId(columns) {
    const phoneCol = columns.find((c) => /phone/i.test(c.label));
    return phoneCol ? phoneCol.id : null;
  }

  function extractTableContacts(countryPrefix = DEFAULT_COUNTRY_CODE, messageText = "") {
    const headerInfo = findHeaderRow();
    if (!headerInfo) {
      return { columns: [], contacts: [], phoneColumnId: null };
    }

    const columns = buildColumns(headerInfo);
    if (!columns.length) {
      return { columns: [], contacts: [], phoneColumnId: null };
    }

    const rows = getDataRows(headerInfo);
    const phoneColumnId = findPhoneColumnId(columns);

    const contacts = [];
    const seen = new Set();

    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("td, [role='gridcell']"));
      if (!cells.length) continue;

      const values = {};
      for (const col of columns) {
        const cell = cells[col.sourceIndex] || null;
        let value = cleanText(cell?.innerText || cell?.textContent || "");

        if (!value) {
          values[col.id] = "";
          continue;
        }

        if (/name/i.test(col.label) || /^name(_\d+)?$/i.test(col.id)) {
          value = sanitizeNameValue(value);
        }

        values[col.id] = value;
      }

      const hasAny = Object.values(values).some(Boolean);
      if (!hasAny) continue;

      let phoneRaw = "";
      if (phoneColumnId) {
        phoneRaw = cleanPhoneCandidate(values[phoneColumnId] || "");
      }

      if (!phoneRaw) {
        const firstPhoneCell = Object.values(values).find((v) => PHONE_PATTERN.test(v));
        phoneRaw = cleanPhoneCandidate(firstPhoneCell || "");
      }

      const phoneDigits = phoneRaw ? normalizePhone(phoneRaw, countryPrefix) || "" : "";
      const baseWaUrl = phoneDigits ? `https://web.whatsapp.com/send/?phone=${phoneDigits}&type=phone_number` : "";
      const text = cleanText(messageText || "");
      const waUrl = baseWaUrl ? (text ? `${baseWaUrl}&text=${encodeURIComponent(text)}` : baseWaUrl) : "";

      const key = columns.map((c) => values[c.id] || "").join("|");
      if (seen.has(key)) continue;
      seen.add(key);

      contacts.push({
        key,
        values,
        phoneDisplay: phoneRaw || values[phoneColumnId || ""] || "",
        phoneDigits,
        waUrl
      });
    }

    return { columns, contacts, phoneColumnId };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "GET_CONTACTS") return;

    try {
      const countryPrefix = String(message.countryPrefix || DEFAULT_COUNTRY_CODE);
      const messageText = String(message.messageText || "");
      const payload = extractTableContacts(countryPrefix, messageText);
      sendResponse({ ok: true, ...payload });
    } catch (error) {
      sendResponse({ ok: false, error: String(error) });
    }
  });
})();
