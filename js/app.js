// ==========================
// Konfiguration: Google Sheet
// ==========================

// Sheet-ID aus deiner URL:
// https://docs.google.com/spreadsheets/d/17Uc_pfVj4d2oPv45HwTaWTeYVHt2dzLaSpk5kziJy1w/edit
const SHEET_ID = "17Uc_pfVj4d2oPv45HwTaWTeYVHt2dzLaSpk5kziJy1w";
const SHEET_NAME = "Tabellenblatt1";

// gviz-API-URL bauen
function buildSheetUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(
    sheetName
  )}`;
}

// gviz → JS-Objekte
async function fetchSheetRows(sheetName) {
  const url = buildSheetUrl(sheetName);
  const res = await fetch(url);
  const text = await res.text();

  // gviz liefert kein reines JSON, daher Wrapper entfernen
  const json = JSON.parse(text.replace(/^[^{]+/, "").replace(/;$/, ""));
  const cols = json.table.cols.map((c) => c.label);
  const rows = json.table.rows;

  return rows.map((row) => {
    const obj = {};
    cols.forEach((colName, index) => {
      const cell = row.c[index];
      obj[colName] = cell ? cell.v : "";
    });
    return obj;
  });
}

// ==========================
// App-Datenmodell
// ==========================

const appData = {
  categories: [], // [{ id, displayName }]
  entries: [], // [{ id, categoryId, title, content, steps[], sortOrder, active, highlight }]
  currentCategoryId: null,
  searchQuery: ""
};

function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
}

function toBool(val) {
  if (val === null || val === undefined) return false;
  const s = String(val).toLowerCase(); // ggf. trim()
  return ["ja", "yes", "true", "1", "wahr", "x"].includes(s.trim());
}

// Sheet-Zeilen in appData mappen
async function loadAppDataFromSheet() {
  const rows = await fetchSheetRows(SHEET_NAME);

  const entries = [];
  const categoryMap = new Map(); // slug -> { id, displayName }

  rows.forEach((row, index) => {
    const hasContent = row.kategorie || row.titel || row.inhalt;
    if (!hasContent) return;

    const categoryName = row.kategorie || "Allgemein";
    const categorySlug = slugify(categoryName);

    if (!categoryMap.has(categorySlug)) {
      categoryMap.set(categorySlug, {
        id: categorySlug,
        displayName: categoryName
      });
    }

    const steps = [];
    Object.keys(row).forEach((key) => {
      if (key.toLowerCase().startsWith("schritt") && row[key]) {
        const parts = String(row[key])
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        steps.push(...parts);
      }
    });

    const sortOrder = row.reihenfolge ? Number(row.reihenfolge) : 9999;
    const active = toBool(row.aktiv);
    const highlight = toBool(row.highlight);
    const entryId = `row_${index + 2}`; // Zeile im Sheet (Header = Zeile 1)

    entries.push({
      id: entryId,
      categoryId: categorySlug,
      title: row.titel || "",
      content: row.inhalt || "",
      steps,
      sortOrder,
      active,
      highlight
    });
  });

  appData.categories = Array.from(categoryMap.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "de")
  );

  appData.entries = entries
    .filter((e) => e.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (appData.categories.length) {
    appData.currentCategoryId = appData.categories[0].id;
  }
}

// ==========================
// UI-Rendering
// ==========================

function renderCategoryNavigation() {
  const nav = document.getElementById("category-nav");
  if (!nav) return;

  nav.innerHTML = "";

  appData.categories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.textContent = cat.displayName;
    btn.classList.add("category-button");
    btn.dataset.categoryId = cat.id;

    if (cat.id === appData.currentCategoryId) {
      btn.classList.add("is-active");
    }

    btn.addEventListener("click", () => {
      appData.currentCategoryId = cat.id;
      appData.searchQuery = "";
      const searchInput = document.getElementById("search-input");
      if (searchInput) searchInput.value = "";
      renderCategoryNavigation();
      renderEntryList();
    });

    nav.appendChild(btn);
  });
}

function getFilteredEntries() {
  let entries = appData.entries;

  if (appData.currentCategoryId) {
    entries = entries.filter((e) => e.categoryId === appData.currentCategoryId);
  }

  const q = appData.searchQuery.trim().toLowerCase();
  if (q) {
    entries = entries.filter((e) => {
      const catName =
        appData.categories.find((c) => c.id === e.categoryId)?.displayName || "";
      const haystack = [e.title, e.content, ...(e.steps || []), catName]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  return entries;
}

function renderEntryList() {
  const container = document.getElementById("entry-list");
  const loadingEl = document.getElementById("loading-indicator");
  if (!container) return;

  container.innerHTML = "";
  if (loadingEl) loadingEl.style.display = "none";

  const entries = getFilteredEntries();

  if (!entries.length) {
    const p = document.createElement("p");
    p.textContent =
      "Für diese Auswahl sind aktuell keine Einträge hinterlegt. Bitte eine andere Kategorie wählen oder das Sheet prüfen.";
    container.appendChild(p);
    return;
  }

  entries.forEach((entry) => {
    const card = document.createElement("article");
    card.classList.add("entry-card");
    if (entry.highlight) {
      card.classList.add("entry-card--highlight");
    }

    if (entry.title) {
      const titleEl = document.createElement("h3");
      titleEl.textContent = entry.title;
      card.appendChild(titleEl);
    }

    if (entry.content) {
      const contentEl = document.createElement("p");
      contentEl.textContent = entry.content;
      card.appendChild(contentEl);
    }

    if (entry.steps && entry.steps.length) {
      const stepsList = document.createElement("ol");
      stepsList.classList.add("entry-steps");
      entry.steps.forEach((step) => {
        const li = document.createElement("li");
        li.textContent = step;
        stepsList.appendChild(li);
      });
      card.appendChild(stepsList);
    }

    container.appendChild(card);
  });
}

// ==========================
// Initialisierung
// ==========================

document.addEventListener("DOMContentLoaded", async () => {
  const loadingEl = document.getElementById("loading-indicator");
  const searchInput = document.getElementById("search-input");

  if (loadingEl) {
    loadingEl.textContent = "Inhalte werden aus dem Truckcenter-Sheet geladen …";
  }

  try {
    await loadAppDataFromSheet();

    if (!appData.categories.length) {
      if (loadingEl) {
        loadingEl.textContent =
          "Keine Inhalte im Sheet gefunden. Bitte das Tabellenblatt 'Tabellenblatt1' prüfen.";
      }
      return;
    }

    renderCategoryNavigation();
    renderEntryList();

    if (loadingEl) loadingEl.style.display = "none";

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        appData.searchQuery = e.target.value || "";
        renderEntryList();
      });
    }
  } catch (err) {
    console.error("Fehler beim Laden der Daten aus dem Sheet:", err);
    if (loadingEl) {
      loadingEl.textContent =
        "Fehler beim Laden der Inhalte. Bitte Internetverbindung und Freigabe des Sheets prüfen.";
    }
  }
});
