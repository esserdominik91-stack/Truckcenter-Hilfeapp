// ==============================================
// Truck Center Hilfecenter – 3-Stufen-System
// Kategorie → Unterkategorie → Thema → Schritte
// ==============================================

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQCXjTKGowsZ4NrxhRqueZyKaDA5ny-lSAuxNaxhCOmlk_SAmI9WBGCRnY-yeOzKOvNl_DuD4T49EMK/pub?output=csv";

let data = [];
let currentCategory = null;
let currentSubcategory = null;
let currentTopicRow = null;

const appEl = document.getElementById("app");
const categoryListEl = document.getElementById("categoryList");
const searchInputEl = document.getElementById("searchInput");
const searchResultsEl = document.getElementById("searchResults");

const STORAGE_KEY = "truckcenter-hilfe-steps-v3";
let doneState = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

// ----------------------------------------------------------
// 1. CSV parsen (Delimiter automatisch)
// ----------------------------------------------------------
function parseCSV(text) {
  const lines = text
    .split("\n")
    .map(l => l.replace(/\r$/, ""))
    .filter(l => l.trim().length > 0);

  if (lines.length === 0) {
    console.warn("[Hilfecenter] Keine Zeilen im CSV");
    return { rows: [], header: [], delimiter: "," };
  }

  const firstLine = lines[0];

  const delimiter =
    (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length
      ? ";"
      : ",";

  const header = firstLine.split(delimiter).map(h => h.trim());
  console.log("[Hilfecenter] Header:", header, "Delimiter:", delimiter);

  const rows = lines.slice(1).map(line => {
    const parts = line.split(delimiter);
    const obj = {};

    header.forEach((h, i) => {
      obj[h] = (parts[i] || "").trim();
    });

    return obj;
  });

  console.log("[Hilfecenter] Roh-Zeilen:", rows.length);
  return { rows, header, delimiter };
}

// ----------------------------------------------------------
// 2. Aus Rohdaten nutzbare Datensätze machen
//    inkl. robuster Erkennung von unterkategorie / Kategorie
// ----------------------------------------------------------
function buildData(parsed) {
  const { rows } = parsed;

  const cleaned = rows.map(obj => {
    const steps = [];
    for (let i = 1; i <= 20; i++) {
      const key = "schritt" + i;
      if (obj[key] && obj[key].trim() !== "") {
        steps.push({ num: i, text: obj[key].trim() });
      }
    }

    const aktivRaw = (obj["aktiv"] || "").toLowerCase();
    const highlightRaw = (obj["highlight"] || "").toLowerCase();

    // Kategorie robust lesen
    const kat =
      obj["kategorie"] ||
      obj["Kategorie"] ||
      obj["kategorie "] ||
      "";

    // Unterkategorie robust lesen
    const unter =
      obj["unterkategorie"] ||
      obj["Unterkategorie"] ||
      obj["unterKategorie"] ||
      obj["Subkategorie"] ||
      obj["subkategorie"] ||
      obj["unterkategorie "] ||
      "";

    // Kategorie-Reihenfolge robust
    const katReihRaw =
      obj["kategorie_reihenfolge"] ||
      obj["kategorie Reihenfolge"] ||
      obj["kategorie-reihenfolge"] ||
      obj["Kategorie_Reihenfolge"] ||
      "";

    return {
      kategorie: kat || "",
      unterkategorie: unter || "",
      kategorieReihenfolge: katReihRaw ? Number(katReihRaw) : 9999,
      titel: obj["titel"] || obj["Titel"] || "",
      inhalt: obj["inhalt"] || obj["Inhalt"] || "",
      reihenfolge: obj["reihenfolge"]
        ? Number(obj["reihenfolge"])
        : 9999,
      aktiv: aktivRaw === "" || aktivRaw === "ja" || aktivRaw === "1",
      highlight: highlightRaw === "ja" || highlightRaw === "1",
      steps
    };
  });

  const used = cleaned.filter(r => r.kategorie && r.titel && r.aktiv);
  console.log(
    "[Hilfecenter] Verwendete Zeilen (kategorie + titel gesetzt + aktiv):",
    used.length
  );

  // Debug: Zeige alle Kategorien + Unterkategorien
  const debugMap = {};
  used.forEach(r => {
    if (!debugMap[r.kategorie]) debugMap[r.kategorie] = new Set();
    debugMap[r.kategorie].add(r.unterkategorie || "");
  });
  Object.keys(debugMap).forEach(k => {
    console.log(
      "[Hilfecenter] Kategorie:",
      k,
      "Unterkategorien:",
      Array.from(debugMap[k])
    );
  });

  return used;
}

// ----------------------------------------------------------
// 3. Laden
// ----------------------------------------------------------
async function loadData() {
  try {
    console.log("[Hilfecenter] Lade CSV:", CSV_URL);
    const res = await fetch(CSV_URL + "&t=" + Date.now(), {
      cache: "no-store"
    });

    if (!res.ok) {
      console.error("[Hilfecenter] CSV HTTP-Fehler:", res.status, res.statusText);
      if (appEl) {
        appEl.innerHTML =
          '<div class="empty-hint">Fehler beim Laden des Hilfecenters (Status ' +
          res.status +
          '). Bitte CSV-Link und Freigabe prüfen.</div>';
      }
      return;
    }

    const text = await res.text();
    console.log("[Hilfecenter] CSV-Preview:", text.slice(0, 200));

    const parsed = parseCSV(text);
    data = buildData(parsed);

    if (!data.length) {
      appEl.innerHTML =
        "<div class='empty-hint'>Das Sheet wurde geladen, aber es wurden keine Zeilen mit " +
        "gefüllter Spalte 'kategorie' und 'titel' erkannt.</div>";
      return;
    }

    renderCategories();
    renderHome();
  } catch (err) {
    console.error("[Hilfecenter] Fehler beim Laden:", err);
    if (appEl) {
      appEl.innerHTML =
        '<div class="empty-hint">Fehler beim Laden des Hilfecenters. Bitte CSV-Freigabe und URL prüfen.</div>';
    }
  }
}

// ----------------------------------------------------------
// 4. Sidebar-Kategorien (links)
// ----------------------------------------------------------
function renderCategories() {
  if (!categoryListEl) {
    console.error("Element #categoryList nicht gefunden.");
    return;
  }

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
      currentSubcategory = null;
      currentTopicRow = null;
      renderCategories();
      renderSubcategories(cat.name);
    });

    categoryListEl.appendChild(btn);
  });
}

// ----------------------------------------------------------
// 5. Startseite – Kategorien als große Kacheln
// ----------------------------------------------------------
function renderHome() {
  if (!appEl) return;

  currentCategory = null;
  currentSubcategory = null;
  currentTopicRow = null;

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

  const wrapper = document.createElement("div");

  const intro = document.createElement("div");
  intro.className = "empty-hint";
  intro.textContent =
    "Wähle eine Kategorie, um die passenden Unterbereiche und Anleitungen zu öffnen.";
  wrapper.appendChild(intro);

  const list = document.createElement("div");
  list.className = "topic-list";

  ordered.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = "topic-btn highlight";

    const titleSpan = document.createElement("span");
    titleSpan.className = "t-title";
    titleSpan.textContent = cat.name;

    const subSpan = document.createElement("span");
    subSpan.className = "t-sub";
    subSpan.textContent = cat.topicCount + " Anleitungen";

    btn.appendChild(titleSpan);
    btn.appendChild(subSpan);

    btn.addEventListener("click", () => {
      currentCategory = cat.name;
      currentSubcategory = null;
      currentTopicRow = null;
      renderCategories();
      renderSubcategories(cat.name);
    });

    list.appendChild(btn);
  });

  wrapper.appendChild(list);

  appEl.innerHTML = "";
  appEl.appendChild(wrapper);
}

// ----------------------------------------------------------
// 6. Stufe 2 – Unterkategorien innerhalb einer Kategorie
// ----------------------------------------------------------
function renderSubcategories(catName) {
  if (!appEl) return;

  const topics = data.filter(r => r.kategorie === catName);

  if (!topics.length) {
    appEl.innerHTML =
      '<div class="empty-hint">Für diese Kategorie sind aktuell keine Themen hinterlegt.</div>';
    return;
  }

  // Debug: welche Unterkategorien sieht die App?
  console.log(
    "[Subcategory-Debug]",
    catName,
    topics.map(t => t.unterkategorie || "")
  );

  const wrapper = document.createElement("div");

  const breadcrumb = document.createElement("div");
  breadcrumb.className = "breadcrumb";
  breadcrumb.innerHTML =
    `<button type="button" id="crumbRoot">Übersicht</button>` +
    `<span class="sep">›</span>` +
    `<span>${catName}</span>`;
  wrapper.appendChild(breadcrumb);

  const heading = document.createElement("h2");
  heading.textContent = catName;
  wrapper.appendChild(heading);

  // Unterkategorien ermitteln
  const groups = {};
  topics.forEach(row => {
    const key = row.unterkategorie || "_ohne";
    if (!groups[key]) groups[key] = 0;
    groups[key] += 1;
  });

  const subcats = Object.keys(groups).sort((a, b) => {
    if (a === "_ohne") return -1;
    if (b === "_ohne") return 1;
    return a.localeCompare(b);
  });

  const list = document.createElement("div");
  list.className = "topic-list";

  // Falls es effektiv keine Unterkategorien gibt (nur "_ohne"):
  if (subcats.length === 1 && subcats[0] === "_ohne") {
    const hint = document.createElement("div");
    hint.className = "empty-hint";
    hint.innerHTML =
      "Für diese Kategorie wurden keine Unterkategorien gefunden.<br>" +
      "Prüfe im Sheet die Spalte <code>unterkategorie</code> (z. B.: Strom, Wasser, ...).";
    wrapper.appendChild(hint);

    // Direkt die Themen anzeigen (Fallback)
    topics
      .sort((a, b) => {
        if (a.reihenfolge !== b.reihenfolge) return a.reihenfolge - b.reihenfolge;
        return a.titel.localeCompare(b.titel);
      })
      .forEach(row => {
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
        renderCategories();
        renderHome();
      });
    }
    return;
  }

  // Normale Unterkategorie-Kacheln
  subcats.forEach(sub => {
    const btn = document.createElement("button");
    btn.className = "topic-btn";

    const titleSpan = document.createElement("span");
    titleSpan.className = "t-title";
    titleSpan.textContent = sub === "_ohne" ? "Allgemein" : sub;

    const subSpan = document.createElement("span");
    subSpan.className = "t-sub";
    subSpan.textContent = groups[sub] + " Themen";

    btn.appendChild(titleSpan);
    btn.appendChild(subSpan);

    btn.addEventListener("click", () => {
      currentCategory = catName;
      currentSubcategory = sub === "_ohne" ? "" : sub;
      currentTopicRow = null;
      renderProblems(catName, currentSubcategory);
    });

    list.appendChild(btn);
  });

  wrapper.appendChild(list);

  appEl.innerHTML = "";
  appEl.appendChild(wrapper);

  const crumbRoot = document.getElementById("crumbRoot");
  if (crumbRoot) {
    crumbRoot.addEventListener("click", () => {
      renderCategories();
      renderHome();
    });
  }
}

// ----------------------------------------------------------
// 7. Stufe 3 – Probleme/Anleitungen innerhalb der Unterkategorie
// ----------------------------------------------------------
function renderProblems(catName, subcatName) {
  if (!appEl) return;

  const topics = data.filter(r => {
    if (r.kategorie !== catName) return false;
    const uk = r.unterkategorie || "";
    const target = subcatName || "";
    return uk === target;
  });

  if (!topics.length) {
    appEl.innerHTML =
      '<div class="empty-hint">Für diese Unterkategorie sind aktuell keine Themen hinterlegt.</div>';
    return;
  }

  const wrapper = document.createElement("div");

  const breadcrumb = document.createElement("div");
  breadcrumb.className = "breadcrumb";

  let trail =
    `<button type="button" id="crumbRoot">Übersicht</button>` +
    `<span class="sep">›</span>` +
    `<button type="button" id="crumbCat">${catName}</button>`;

  if (subcatName) {
    trail += `<span class="sep">›</span><span>${subcatName}</span>`;
  } else {
    trail += `<span class="sep">›</span><span>Allgemein</span>`;
  }

  breadcrumb.innerHTML = trail;
  wrapper.appendChild(breadcrumb);

  const heading = document.createElement("h2");
  heading.textContent = subcatName || "Allgemein";
  wrapper.appendChild(heading);

  const list = document.createElement("div");
  list.className = "topic-list";

  topics
    .sort((a, b) => {
      if (a.reihenfolge !== b.reihenfolge) return a.reihenfolge - b.reihenfolge;
      return a.titel.localeCompare(b.titel);
    })
    .forEach(row => {
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
  const crumbCat = document.getElementById("crumbCat");

  if (crumbRoot) {
    crumbRoot.addEventListener("click", () => {
      renderCategories();
      renderHome();
    });
  }
  if (crumbCat) {
    crumbCat.addEventListener("click", () => {
      currentCategory = catName;
      currentSubcategory = null;
      currentTopicRow = null;
      renderCategories();
      renderSubcategories(catName);
    });
  }
}

// ----------------------------------------------------------
// 8. Detailansicht mit Schritten
// ----------------------------------------------------------
function renderTopic(row) {
  if (!appEl) return;

  const wrapper = document.createElement("div");

  const breadcrumb = document.createElement("div");
  breadcrumb.className = "breadcrumb";

  let trail =
    `<button type="button" id="crumbRoot">Übersicht</button>` +
    `<span class="sep">›</span>` +
    `<button type="button" id="crumbCat">${row.kategorie}</button>`;

  if (row.unterkategorie) {
    trail +=
      `<span class="sep">›</span>` +
      `<button type="button" id="crumbSubcat">${row.unterkategorie}</button>`;
  }

  trail += `<span class="sep">›</span><span>${row.titel}</span>`;
  breadcrumb.innerHTML = trail;

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
    const id = `${row.kategorie}__${row.unterkategorie || ""}__${row.titel}__${step.num}`;
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
      renderTopic(row);
    });

    const span = document.createElement("span");
    span.className = "txt" + (done ? " done" : "");
    span.textContent = `${step.num}. ${step.text}`;

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
  const crumbSubcat = document.getElementById("crumbSubcat");

  if (crumbRoot) {
    crumbRoot.addEventListener("click", () => {
      renderCategories();
      renderHome();
    });
  }
  if (crumbCat) {
    crumbCat.addEventListener("click", () => {
      currentCategory = row.kategorie;
      currentSubcategory = null;
      currentTopicRow = null;
      renderCategories();
      renderSubcategories(row.kategorie);
    });
  }
  if (crumbSubcat) {
    crumbSubcat.addEventListener("click", () => {
      currentCategory = row.kategorie;
      currentSubcategory = row.unterkategorie || "";
      currentTopicRow = null;
      renderCategories();
      renderProblems(row.kategorie, currentSubcategory);
    });
  }
}

// ----------------------------------------------------------
// 9. Done-State
// ----------------------------------------------------------
function toggleDone(id) {
  doneState[id] = !doneState[id];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(doneState));
}

// ----------------------------------------------------------
// 10. Suche
// ----------------------------------------------------------
if (searchInputEl && searchResultsEl) {
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
      if (row.kategorie && row.kategorie.toLowerCase().includes(q)) match = true;
      if (row.unterkategorie && row.unterkategorie.toLowerCase().includes(q)) match = true;
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
      spanK.textContent =
        (row.kategorie || "") +
        (row.unterkategorie ? " → " + row.unterkategorie : "") +
        " → ";

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
        currentSubcategory = row.unterkategorie || "";
        currentTopicRow = row;
        renderCategories();
        renderTopic(row);
      });

      searchResultsEl.appendChild(div);
    });

    searchResultsEl.style.display = "block";
  });
}

// ----------------------------------------------------------
// 11. Start
// ----------------------------------------------------------
loadData();
