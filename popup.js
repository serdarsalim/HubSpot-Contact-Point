const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
let currentContacts = [];
let sortState = { field: null, direction: "asc" };

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderContacts(contacts) {
  listEl.innerHTML = "";

  if (!contacts.length) {
    statusEl.textContent = "No contacts with phone numbers found on this view.";
    return;
  }

  statusEl.textContent = `Found ${contacts.length} contact(s).`;

  const rowsHtml = contacts
    .map((c) => {
      const safeName = escapeHtml(c.name || "Unknown");
      const safeEmail = escapeHtml(c.email || "-");
      const safeDisplay = escapeHtml(c.phoneDisplay || c.phoneDigits);
      const safeUrl = escapeHtml(c.waUrl);

      return `
        <tr>
          <td class="name">${safeName}</td>
          <td class="email">${safeEmail}</td>
          <td class="phone"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeDisplay}</a></td>
          <td class="possibility">${escapeHtml(c.possibility || "-")}</td>
        </tr>
      `;
    })
    .join("");

  function sortIndicator(field) {
    if (sortState.field !== field) return "";
    return sortState.direction === "asc" ? " ▲" : " ▼";
  }

  listEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th class="sortable" data-sort-field="name">Name${sortIndicator("name")}</th>
          <th class="sortable" data-sort-field="email">Email${sortIndicator("email")}</th>
          <th class="sortable" data-sort-field="phoneDigits">Phone Number${sortIndicator("phoneDigits")}</th>
          <th class="sortable" data-sort-field="possibility">Possibility${sortIndicator("possibility")}</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;

  const sortHeaders = listEl.querySelectorAll("th.sortable");
  for (const header of sortHeaders) {
    header.addEventListener("click", () => {
      const field = header.getAttribute("data-sort-field");
      if (!field) return;
      applySort(field);
    });
  }
}

function compareValues(a, b, field) {
  const valueA = String(a[field] || "").trim();
  const valueB = String(b[field] || "").trim();

  if (field === "phoneDigits") {
    const numA = Number(valueA.replace(/\D/g, "")) || 0;
    const numB = Number(valueB.replace(/\D/g, "")) || 0;
    return numA - numB;
  }

  return valueA.localeCompare(valueB, undefined, { sensitivity: "base" });
}

function applySort(field) {
  if (sortState.field === field) {
    sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
  } else {
    sortState.field = field;
    sortState.direction = "asc";
  }

  const sorted = [...currentContacts].sort((a, b) => {
    const result = compareValues(a, b, field);
    return sortState.direction === "asc" ? result : -result;
  });

  renderContacts(sorted);
}

async function loadContacts() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    if (!tab || typeof tab.id !== "number") {
      statusEl.textContent = "No active tab found.";
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_CONTACTS" });

    if (!response || !response.ok) {
      statusEl.textContent = "Open a HubSpot tab (app.hubspot.com), refresh it, and try again.";
      return;
    }

    currentContacts = response.contacts || [];
    sortState = { field: null, direction: "asc" };
    renderContacts(currentContacts);
  } catch (_error) {
    statusEl.textContent = "Could not load contacts. Refresh HubSpot tab and retry.";
  }
}

loadContacts();
