const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");

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
        </tr>
      `;
    })
    .join("");

  listEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Phone Number</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
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

    renderContacts(response.contacts || []);
  } catch (_error) {
    statusEl.textContent = "Could not load contacts. Refresh HubSpot tab and retry.";
  }
}

loadContacts();
