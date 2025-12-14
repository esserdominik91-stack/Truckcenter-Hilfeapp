// ==========================================================
// Truckcenter Hilfecenter – stabile Vollversion (V5)
// - Daten aus Google Sheet (CSV)
// - Kategorien sortiert über kategorie_reihenfolge
// - Themen sortiert über reihenfolge
// - Schritte aus schritt1..schritt20
// - aktiv / highlight
// - Suche + Done-Status
// ==========================================================

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/17Uc_pfVj4d2oPv45HwTaWTeYVHt2dzLaSpk5kziJy1w/export?format=csv&gid=0";

let data = [];
let currentCategory = null;
let currentTopicRow = null;

const appEl = document.getElementById("app");
const categoryListEl = document.getElementById("categoryList");
const searchInputEl = document.getElementById("searchInput");
const searchResultsEl = document.getElementById("searchResults");

const STORAGE_KEY = "truckcenter-hilfe-steps-v5";
let doneState = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

// ---------------- CSV-Parsen (robust, mit Quotes) ----------------

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(text) {
  const lines = text
    .split("\n")
    .map(l => l.replace(/\r$/, ""))
    .filter(l => l.trim().length > 0);

  if (!lines.length) return [];

  const headerCells = parseCSVLine(lines[0]).map(h => h.trim());

  const rows = lines.slice(1).map(line => {
    const cells = parseCSVLine(line);
    const obj = {};
    headerCells.forEach((h, idx) => {
      obj[h] = (cells[idx] || "").trim();
    });

    // zusätzlich lowercase-Map
    const lowerObj = {};
    for (const key in obj) {
      lowerObj[key.toLowerCase()] = obj[key];
    }

    const steps = [];
    for (let i = 1; i <= 20; i++) {
      const key = "schritt" + i;
      const val =
        lowerObj[key] ||
        lowerObj[key.toLowerCase()];
      if (val && val.trim() !== "") {
        steps.push({ num: i, text: val.trim() });
      }
    }
    steps.sort((a, b) => a.num - b.num);

    const aktivRaw = (lowerObj["aktiv"] || "").toLowerCase();
    const highlightRaw = (lowerObj["highlight"] || "").toLowerCase();

    const kategorie =
      lowerObj["kategorie"] || lowerObj["kategorie "] || "";
    const titel =
      lowerObj["titel"] ||
      lowerObj["thema"] ||
      "";

    return {
      kategorie,
      kategorieReihenfolge: lowerObj["kategorie_reihenfolge"]
        ? Number(lowerObj["kategorie_reihenfolge"])
        : 9999,
      titel,
      inhalt: lowerObj["inhalt"] || "",
      reihenfolge: lowerObj["reihenfolge"]
        ? Number(lowerObj["reihenfolge"])
        : 9999,
      aktiv: aktivRaw === "" || aktivRaw === "ja" || aktivRaw === "1",
      highlight: highlightRaw === "ja" || highlightRaw === "1",
      steps
    };
  });

  // WICHTIG: NICHT MEHR ALLES WEGFILTERN – nur Zeilen ohne Kategorie/Titel fliegen raus
  const cleaned = rows.filter(r => r.kategorie && r.titel);

  console.log("[Hilfecenter] CSV-Zeilen gesamt:", rows.length);
  console.log("[Hilfecenter] Verwendete Zeilen:", cleaned.length);

  return cleaned;
}

// ---------------- Laden & Initialisieren ----------------

async function loadData() {
  try {
    const res = await fetch(CSV_URL);
    if (!res.ok) {
      throw new Error("CSV konnte nicht geladen werden: " + res.status);
    }
    const text = await res.text();
    data = parseCSV(text);

    if (!data.length) {
      appEl.innerHTML =
        '<div class="empty-hint">Es wurden keine Datensätze aus dem Sheet gelesen. Bitte prüfe: 1) Freigabe, 2) Kopfzeile, 3) ob mindestens Kategorie + Titel pro Zeile vorhanden sind.</div>';
      return;
    }

    renderCategories();
    renderEmptyMain();
  } catch (err) {
    console.error(err);
    appEl.innerHTML =
      '<div class="empty-hint">Fehler beim Laden des Hilfecenters. Bitte CSV-Freigabe und URL prüfen.</div>';
  }
}

// ---------------- Kategorien ----------------

function renderCategories() {
  categoryListEl.innerHTML = "";

  if (!data.length) {
    categoryListEl.innerHTML =
      '<div class="empty-hint">Keine Hilfecenter-Daten gefunden.</div>';
    return;
  }

  const categories = [...new Set(data.map(r => r.kategorie))];

  const ordered = categories
    .map(cat => {
      const row = data.find(r => r.kategorie === cat);
      const order =
        row && typeof row.kategorieReihenfolge === "number"
          ? row.kategorieReihenfolge
          : 9999;
      const topicCount = data.filter(r => r.kategorie === cat).length;
      return { name: cat, order, topicCount };
    })
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.name.localeCompare(b.name);
    });

  ordered.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = "category-btn";
    if (currentCategory === cat.name) {
      btn.classList.add("active");
    }

    const labelSpan = document.createElement("span");
    labelSpan.className = "label";
    labelSpan.textContent = cat.name;

    const countSpan = document.createElement("span");
    countSpan.className = "count";
    countSpan.textContent = cat.topicCount + " Themen";

    btn.appendChild(labelSpan);
    btn.appendChild(countSpan);

    btn.addEventListener("click", () => {
      currentCategory = cat.name;
      currentTopicRow = null;
      renderCategories();
      renderCategoryTopics(cat.name);
    });

    categoryListEl.appendChild(btn);
  });
}

// ---------------- Main-Bereich: leere Ansicht ----------------

function renderEmptyMain() {
  appEl.innerHTML =
    '<div class="empty-hint">Wähle links eine Kategorie oder nutze die Suche, um eine Anleitung zu öffnen.</div>';
}

// ---------------- Themen innerhalb einer Kategorie ----------------

function renderCategoryTopics(catName) {
  const topics = data
    .filter(r => r.kategorie === catName)
    .sort((a, b) => {
      if (a.reihenfolge !== b.reihenfolge) return a.reihenfolge - b.reihenfolge;
      return a.titel.localeCompare(b.titel);
    });

  if (!topics.length) {
    appEl.innerHTML =
      '<div class="empty-hint">Für diese Kategorie sind aktuell keine Themen hinterlegt.</div>';
    return;
  }

  const wrapper = document.createElement("div");

  const breadcrumb = document.createElement("div");
  breadcrumb.className = "breadcrumb";
  breadcrumb.innerHTML = `<button type="button" id="crumbRoot">Übersicht</button><span class="sep">›</span><span>${catName}</span>`;
  wrapper.appendChild(breadcrumb);

  const heading = document.createElement("h2");
  heading.textContent = catName;
  wrapper.appendChild(heading);

  const list = document.createElement("div");
  list.className = "topic-list";

  topics.forEach(row => {
    const btn = document.createElement("button");
    btn.className = "topic-btn";
    if (row.highlight) btn.classList.add("highlight");

    const titleSpan = document.createElement("span");
    titleSpan.className = "t-title";
    titleSpan.textContent = row.titel;

    const infoSpan = document.createElement("span");
    infoSpan.className = "t-sub";
    infoSpan.textContent =
      (row.inhalt || "").slice(0, 80) +
      (row.inhalt && row.inhalt.length > 80 ? " …" : "");

    btn.appendChild(titleSpan);
    if (row.inhalt) btn.appendChild(infoSpan);

    btn.addEventListener("click", () => {
      currentTopicRow = row;
      renderTopic(row);
    });

    list.appendChild(btn);
  });

  wrapper.appendChild(list);

  appEl.innerHTML = "";
  appEl.appendChild(wrapper);

  const crumbRoot = document.getElementById("crumbRoot");
  if (crumbRoot) {
    crumbRoot.addEventListener("click", () => {
      currentCategory = null;
      currentTopicRow = null;
      renderCategories();
      renderEmptyMain();
    });
  }
}

// ---------------- Einzelnes Thema + Schritte ----------------

function renderTopic(row) {
  const wrapper = document.createElement("div");

  const breadcrumb = document.createElement("div");
  breadcrumb.className = "breadcrumb";
  breadcrumb.innerHTML = `<button type="button" id="crumbRoot">Übersicht</button><span class="sep">›</span><button type="button" id="crumbCat">${row.kategorie}</button><span class="sep">›</span><span>${row.titel}</span>`;
  wrapper.appendChild(breadcrumb);

  const heading = document.createElement("h2");
  heading.textContent = row.titel;
  wrapper.appendChild(heading);

  if (row.inhalt) {
    const intro = document.createElement("div");
    intro.className = "topicIntro";
    intro.textContent = row.inhalt;
    wrapper.appendChild(intro);
  }

  const stepsContainer = document.createElement("div");
  stepsContainer.className = "steps";

  row.steps.forEach(step => {
    const id = `${row.kategorie}__${row.titel}__${step.num}`;
    const done = !!doneState[id];

    const stepDiv = document.createElement("div");
    stepDiv.className = "step";

    const rowDiv = document.createElement("div");
    rowDiv.className = "stepRow";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = done;
    checkbox.addEventListener("change", () => {
      toggleDone(id);
      renderTopic(row); // neu rendern, damit durchgestrichen
    });

    const span = document.createElement("span");
    span.className = "txt" + (done ? " done" : "");
    span.textContent = step.num + ". " + step.text;

    rowDiv.appendChild(checkbox);
    rowDiv.appendChild(span);
    stepDiv.appendChild(rowDiv);
    stepsContainer.appendChild(stepDiv);
  });

  wrapper.appendChild(stepsContainer);

  appEl.innerHTML = "";
  appEl.appendChild(wrapper);

  const crumbRoot = document.getElementById("crumbRoot");
  const crumbCat = document.getElementById("crumbCat");

  if (crumbRoot) {
    crumbRoot.addEventListener("click", () => {
      currentCategory = null;
      currentTopicRow = null;
      renderCategories();
      renderEmptyMain();
    });
  }
  if (crumbCat) {
    crumbCat.addEventListener("click", () => {
      currentTopicRow = null;
      currentCategory = row.kategorie;
      renderCategories();
      renderCategoryTopics(row.kategorie);
    });
  }
}

// ---------------- Done-State ----------------

function toggleDone(id) {
  doneState[id] = !doneState[id];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(doneState));
}

// ---------------- Suche ----------------

searchInputEl.addEventListener("input", () => {
  const q = searchInputEl.value.toLowerCase().trim();
  if (!q || q.length < 2) {
    searchResultsEl.style.display = "none";
    searchResultsEl.innerHTML = "";
    return;
  }

  const results = [];

  data.forEach(row => {
    let match = false;
    if (row.titel.toLowerCase().includes(q)) match = true;
    if (row.inhalt && row.inhalt.toLowerCase().includes(q)) match = true;
    if (row.steps.some(s => s.text.toLowerCase().includes(q))) {
      match = true;
    }

    if (match) results.push(row);
  });

  searchResultsEl.innerHTML = "";
  if (!results.length) {
    searchResultsEl.style.display = "block";
    searchResultsEl.innerHTML =
      '<div class="searchResult"><span class="k">Keine Treffer.</span></div>';
    return;
  }

  results.slice(0, 50).forEach(row => {
    const div = document.createElement("div");
    div.className = "searchResult";

    const spanK = document.createElement("span");
    spanK.className = "k";
    spanK.textContent = row.kategorie + " → ";

    const spanT = document.createElement("span");
    spanT.className = "t";
    spanT.textContent = row.titel;

    div.appendChild(spanK);
    div.appendChild(spanT);

    div.addEventListener("click", () => {
      searchResultsEl.style.display = "none";
      searchResultsEl.innerHTML = "";
      searchInputEl.value = "";
      currentCategory = row.kategorie;
      currentTopicRow = row;
      renderCategories();
      renderTopic(row);
    });

    searchResultsEl.appendChild(div);
  });

  searchResultsEl.style.display = "block";
});

// ---------------- Start ----------------

loadData();
