// ==============================================
// Truckcenter Hilfecenter – Sheet-only Version
// UI: Einfache Problem-Kacheln links,
// rechts Detail + Fortschritt + Schritte
// Kachel-Aufbau:
//   Kategorie → Unterkategorie → Titel → Inhalt
// ==============================================

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQCXjTKGowsZ4NrxhRqueZyKaDA5ny-lSAuxNaxhCOmlk_SAmI9WBGCRnY-yeOzKOvNl_DuD4T49EMK/pub?output=csv";

const STORAGE_KEY = "truckcenter-hilfe-steps-done-v2";

let rows = [];
let categories = [];
let topics = [];
let topicsByCategory = new Map();

let currentCategory = null;
let currentTopic = null;
let doneSteps = {};

// DOM-Refs
const searchInputEl = document.getElementById("searchInput");
const statusTextEl = document.getElementById("statusText");

const leftPanelTitleEl = document.getElementById("leftPanelTitle");
const leftPanelSubtitleEl = document.getElementById("leftPanelSubtitle");
const leftCounterEl = document.getElementById("leftCounter");
const breadcrumbsEl = document.getElementById("breadcrumbs");

const categoriesViewEl = document.getElementById("categoriesView");
const topicsViewEl = document.getElementById("topicsView");
const searchResultsViewEl = document.getElementById("searchResultsView");
const searchHintEl = document.getElementById("searchHint");

const detailTitleEl = document.getElementById("detailTitle");
const detailMetaEl = document.getElementById("detailMeta");
const detailDescEl = document.getElementById("detailDesc");
const progressRowEl = document.getElementById("progressRow");
const progressBarInnerEl = document.getElementById("progressBarInner");
const progressPercentEl = document.getElementById("progressPercent");
const stepsListEl = document.getElementById("stepsList");
const detailEmptyEl = document.getElementById("detailEmpty");

const btnBackToCategories = document.getElementById("btnBackToCategories");
const btnBackToTopics = document.getElementById("btnBackToTopics");
const btnResetCurrent = document.getElementById("btnResetCurrent");

// ---------------------------
// CSV-Parser
// ---------------------------
function parseCSV(text) {
  const result = [];
  let row = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      const next = text[i + 1];
      if (insideQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (ch === "," && !insideQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((ch === "\n" || ch === "\r") && !insideQuotes) {
      if (current !== "" || row.length > 0) {
        row.push(current.trim());
        result.push(row);
        row = [];
        current = "";
      }
    } else {
      current += ch;
    }
  }

  if (current !== "" || row.length > 0) {
    row.push(current.trim());
    result.push(row);
  }

  return result;
}

function normHeader(h) {
  return (h || "").toString().trim().toLowerCase();
}

// ---------------------------
// LocalStorage für Häkchen
// ---------------------------
function loadDoneSteps() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    doneSteps = raw ? JSON.parse(raw) : {};
  } catch {
    doneSteps = {};
  }
}

function saveDoneSteps() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doneSteps));
  } catch {
    // Ignorieren
  }
}

function isStepDone(globalId) {
  return !!doneSteps[globalId];
}

function setStepDone(globalId, done) {
  if (done) {
    doneSteps[globalId] = true;
  } else {
    delete doneSteps[globalId];
  }
  saveDoneSteps();
}

// ---------------------------
// Datenmodell aus dem CSV
// ---------------------------
function buildModelFromRows(allRows) {
  if (!allRows || allRows.length < 2) {
    throw new Error("Keine Datenzeilen im CSV gefunden.");
  }

  const headerRow = allRows[0];
  const headersNorm = headerRow.map(normHeader);

  function idx(candidates) {
    return headersNorm.findIndex((h) => candidates.includes(h));
  }

  const idxCategory = idx(["kategorie", "category", "bereich"]);
  const idxTopic = idx(["thema", "topic", "titel", "title"]);
  const idxSub = idx(["unterkategorie", "sub", "bereich2"]);
  const idxDesc = idx([
    "beschreibung",
    "kurzbeschreibung",
    "description",
    "info",
    "inhalt",
  ]);
  const idxCatOrder = idx([
    "kategorie_reihenfolge",
    "cat_order",
    "category_order",
  ]);
  const idxTopicOrder = idx([
    "thema_reihenfolge",
    "topic_order",
    "sort",
    "reihenfolge",
  ]);

  if (idxCategory === -1 || idxTopic === -1) {
    throw new Error(
      "Spalten 'Kategorie' und/oder 'Thema' nicht gefunden. Bitte im Sheet prüfen."
    );
  }

  // Spalten „Schritt 1 … Schritt 20“ / „Step 1 …“
  const stepIndices = [];
  headersNorm.forEach((h, i) => {
    if (h.startsWith("schritt") || h.startsWith("step")) {
      stepIndices.push(i);
    }
  });

  const topicsTmp = [];
  const categoriesMap = new Map();

  for (let r = 1; r < allRows.length; r++) {
    const row = allRows[r];
    if (!row || row.length === 0) continue;

    const catName = (row[idxCategory] || "Allgemeines").trim();
    const topicName = (row[idxTopic] || "").trim();
    if (!topicName) continue;

    const subName =
      idxSub >= 0 && row[idxSub] ? String(row[idxSub]).trim() : "";
    const desc =
      idxDesc >= 0 && row[idxDesc] ? String(row[idxDesc]).trim() : "";

    const catOrder =
      idxCatOrder >= 0 && row[idxCatOrder]
        ? Number(row[idxCatOrder]) || 9999
        : 9999;
    const topicOrder =
      idxTopicOrder >= 0 && row[idxTopicOrder]
        ? Number(row[idxTopicOrder]) || 9999
        : 9999;

    const steps = [];
    stepIndices.forEach((sIdx, sPos) => {
      const sText = row[sIdx] ? String(row[sIdx]).trim() : "";
      if (sText) {
        steps.push({
          id: `r${r}-s${sPos}`,
          text: sText,
        });
      }
    });

    const topicObj = {
      id: `row-${r}`,
      category: catName,
      topic: topicName,        // = Titel
      subcategory: subName,
      description: desc,
      catOrder,
      topicOrder,
      steps,
    };

    topicsTmp.push(topicObj);

    if (!categoriesMap.has(catName)) {
      categoriesMap.set(catName, {
        name: catName,
        order: catOrder,
        topicCount: 0,
      });
    }
    const catObj = categoriesMap.get(catName);
    catObj.topicCount += 1;
    catObj.order = Math.min(catObj.order, catOrder);
  }

  categories = Array.from(categoriesMap.values()).sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name)
  );

  topics = topicsTmp.sort(
    (a, b) =>
      a.catOrder - b.catOrder ||
      a.category.localeCompare(b.category) ||
      a.topicOrder - b.topicOrder ||
      a.topic.localeCompare(b.topic)
  );

  topicsByCategory = new Map();
  for (const t of topics) {
    if (!topicsByCategory.has(t.category)) {
      topicsByCategory.set(t.category, []);
    }
    topicsByCategory.get(t.category).push(t);
  }
}

// ---------------------------
// UI-Helfer
// ---------------------------

function getIconForTopic(t) {
  const cat = (t.category || "").toLowerCase();
  const sub = (t.subcategory || "").toLowerCase();

  if (sub.includes("strom") || cat.includes("strom")) return "⚡";
  if (sub.includes("wasser") || cat.includes("wasser")) return "💧";
  if (cat.includes("allgemein")) return "ℹ️";
  return "□";
}

function countDoneStepsForTopic(topic) {
  let c = 0;
  for (let i = 0; i < topic.steps.length; i++) {
    const globalId = `${topic.id}::${i}`;
    if (isStepDone(globalId)) c++;
  }
  return c;
}

function getProgressForTopic(topic) {
  const total = topic.steps.length;
  const doneCount = countDoneStepsForTopic(topic);
  return { doneCount, total };
}

// Kachel-Aufbau: Kategorie → Unterkategorie → Titel → Inhalt
function createTopicCard(topic) {
  const { doneCount, total } = getProgressForTopic(topic);
  const ratio = total > 0 ? doneCount / total : 0;

  const card = document.createElement("div");
  card.className = "card";

  card.addEventListener("click", () => {
    renderTopicDetail(topic, { fromSearch: false });
  });

  const header = document.createElement("div");
  header.className = "card-header";

  // LINKER Bereich: Texte
  const left = document.createElement("div");
  left.style.display = "flex";
  left.style.flexDirection = "column";
  left.style.gap = "3px";
  left.style.minWidth = "0";

  // 1) Kategorie (Hauptthema)
  const catLabel = document.createElement("div");
  catLabel.style.fontSize = "11px";
  catLabel.style.textTransform = "uppercase";
  catLabel.style.letterSpacing = "0.12em";
  catLabel.style.color = "#9ca3af";
  catLabel.textContent = topic.category || "Allgemeines";

  // 2) Unterkategorie (falls vorhanden)
  const subLabel = document.createElement("div");
  subLabel.style.fontSize = "12px";
  subLabel.style.color = "#e5e7eb";
  subLabel.style.fontWeight = "500";
  subLabel.textContent = topic.subcategory || "Ohne Unterkategorie";

  // 3) Titel (Thema)
  const titleLabel = document.createElement("div");
  titleLabel.style.fontSize = "13px";
  titleLabel.style.fontWeight = "600";
  titleLabel.style.display = "flex";
  titleLabel.style.alignItems = "center";
  titleLabel.style.gap = "6px";

  const iconSpan = document.createElement("span");
  iconSpan.textContent = getIconForTopic(topic);

  const titleText = document.createElement("span");
  titleText.textContent = topic.topic;

  titleLabel.appendChild(iconSpan);
  titleLabel.appendChild(titleText);

  // 4) Inhalt / Beschreibung (Kurztext)
  const descLabel = document.createElement("div");
  descLabel.style.fontSize = "11px";
  descLabel.style.color = "#9ca3af";
  descLabel.style.marginTop = "2px";
  descLabel.style.overflow = "hidden";
  descLabel.style.textOverflow = "ellipsis";
  descLabel.style.display = "-webkit-box";
  descLabel.style.webkitLineClamp = "2";
  descLabel.style.webkitBoxOrient = "vertical";
  descLabel.textContent =
    topic.description ||
    "Hinweise und Schritte zur Lösung dieses Themas.";

  left.appendChild(catLabel);
  left.appendChild(subLabel);
  left.appendChild(titleLabel);
  left.appendChild(descLabel);

  // RECHTS: Fortschritt
  const right = document.createElement("div");
  right.style.display = "flex";
  right.style.flexDirection = "column";
  right.style.alignItems = "flex-end";
  right.style.gap = "4px";

  if (total > 0) {
    const progressPill = document.createElement("div");
    progressPill.className = "topic-progress-pill";

    const bar = document.createElement("span");
    bar.className = "bar";

    const barInner = document.createElement("span");
    barInner.className = "bar-inner";
    barInner.style.transform = `scaleX(${ratio})`;

    bar.appendChild(barInner);

    const txt = document.createElement("span");
    txt.textContent = `${Math.round(ratio * 100)}%`;

    progressPill.appendChild(bar);
    progressPill.appendChild(txt);

    right.appendChild(progressPill);
  }

  header.appendChild(left);
  header.appendChild(right);

  card.appendChild(header);
  return card;
}

// ---------------------------
// Linkes Panel: Kachel-Übersicht
// ---------------------------
function renderOverview(list, modeLabel, subtitle) {
  currentCategory = null;
  currentTopic = null;

  categoriesViewEl.style.display = "grid";
  topicsViewEl.style.display = "none";
  searchResultsViewEl.style.display = "none";

  leftPanelTitleEl.textContent = modeLabel || "Themen & Probleme";
  leftPanelSubtitleEl.textContent =
    subtitle ||
    "Wähle ein Hauptthema (Kategorie) mit Unterkategorie und Titel.";
  leftCounterEl.textContent =
    list.length === 1 ? "1 Thema" : `${list.length} Themen`;

  breadcrumbsEl.innerHTML = "";
  searchHintEl.textContent = "";

  categoriesViewEl.innerHTML = "";
  if (!list.length) {
    categoriesViewEl.innerHTML =
      '<div class="empty">Keine Themen gefunden. Bitte Sheet prüfen.</div>';
    return;
  }

  list.forEach((t) => {
    categoriesViewEl.appendChild(createTopicCard(t));
  });

  btnBackToCategories.style.display = "none";
  btnBackToTopics.style.display = "none";
  btnResetCurrent.style.display = "none";

  renderDetailEmpty();
}

function renderCategories() {
  renderOverview(
    topics,
    "Themen & Probleme",
    "1. Kategorie · 2. Unterkategorie · 3. Titel lesen – dann tippen, um die Schritte zu sehen."
  );
}

// ---------------------------
// Suche
// ---------------------------
function renderSearchResults(matches, query) {
  if (!query || query.length < 2) {
    renderOverview(
      topics,
      "Themen & Probleme",
      "Mindestens 2 Zeichen eingeben, um zu suchen."
    );
    searchHintEl.textContent =
      "Hinweis: Es wird in Kategorie, Titel, Unterkategorie und Schritten gesucht.";
    return;
  }

  if (!matches.length) {
    renderOverview(
      [],
      "Suchergebnisse",
      `Keine Treffer für "${query}".`
    );
    searchHintEl.textContent = "";
    return;
  }

  renderOverview(
    matches,
    "Suchergebnisse",
    `Gefiltert nach: "${query}".`
  );
  searchHintEl.textContent =
    "Treffer aus allen Themen. Tippe auf eine Kachel, um die Schritte zu sehen.";
}

function handleSearchInput() {
  const q = searchInputEl.value.trim();
  if (!q) {
    renderCategories();
    return;
  }

  const qLower = q.toLowerCase();
  const matches = topics.filter((t) => {
    if (
      t.topic.toLowerCase().includes(qLower) ||
      t.category.toLowerCase().includes(qLower) ||
      (t.subcategory && t.subcategory.toLowerCase().includes(qLower))
    ) {
      return true;
    }
    return t.steps.some((s) =>
      s.text.toLowerCase().includes(qLower)
    );
  });

  renderSearchResults(matches, q);
}

// ---------------------------
// Detail rechts
// ---------------------------
function renderDetailEmpty() {
  currentTopic = null;
  detailTitleEl.textContent = "Kein Thema ausgewählt";
  detailMetaEl.textContent = "";
  detailDescEl.textContent =
    "Wähle links ein Thema aus, um die Schritt-für-Schritt-Anleitung zu sehen.";
  stepsListEl.innerHTML = "";
  detailEmptyEl.style.display = "block";
  progressRowEl.style.display = "none";
}

function renderTopicDetail(topic, opts = {}) {
  currentTopic = topic;
  currentCategory = topic.category;

  breadcrumbsEl.innerHTML = "";
  const homeBtn = document.createElement("button");
  homeBtn.textContent = "Übersicht";
  homeBtn.addEventListener("click", () => renderCategories());
  breadcrumbsEl.appendChild(homeBtn);

  detailTitleEl.textContent = `${getIconForTopic(topic)} ${topic.topic}`;

  const metaParts = [];
  if (topic.category) metaParts.push(`Kategorie: ${topic.category}`);
  if (topic.subcategory) metaParts.push(`Unterkategorie: ${topic.subcategory}`);
  metaParts.push(`${topic.steps.length} Schritte`);

  detailMetaEl.textContent = metaParts.join(" · ");
  detailDescEl.textContent =
    topic.description ||
    "Für dieses Thema ist keine zusätzliche Beschreibung hinterlegt.";

  stepsListEl.innerHTML = "";
  detailEmptyEl.style.display = topic.steps.length ? "none" : "block";

  topic.steps.forEach((step, index) => {
    const globalId = `${topic.id}::${index}`;
    const li = document.createElement("li");
    li.className = "step-item";

    const done = isStepDone(globalId);
    if (done) li.classList.add("done");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "step-checkbox";
    checkbox.checked = done;

    checkbox.addEventListener("change", () => {
      setStepDone(globalId, checkbox.checked);
      if (checkbox.checked) {
        li.classList.add("done");
      } else {
        li.classList.remove("done");
      }
      updateDetailProgress(topic);
    });

    const textWrap = document.createElement("div");
    textWrap.className = "step-text";

    const idxLabel = document.createElement("div");
    idxLabel.className = "step-index";
    idxLabel.textContent = `Schritt ${index + 1}`;

    const mainTxt = document.createElement("div");
    mainTxt.className = "step-main";
    mainTxt.textContent = step.text;

    textWrap.appendChild(idxLabel);
    textWrap.appendChild(mainTxt);

    li.appendChild(checkbox);
    li.appendChild(textWrap);

    stepsListEl.appendChild(li);
  });

  updateDetailProgress(topic);

  btnBackToCategories.style.display = "inline-flex";
  btnBackToTopics.style.display = "none";
  btnResetCurrent.style.display =
    topic.steps.length > 0 ? "inline-flex" : "none";
}

function updateDetailProgress(topic) {
  const { doneCount, total } = getProgressForTopic(topic);
  if (!total) {
    progressRowEl.style.display = "none";
    return;
  }
  progressRowEl.style.display = "flex";

  const ratio = doneCount / total;
  progressBarInnerEl.style.transform = `scaleX(${ratio})`;
  progressPercentEl.textContent = `${Math.round(ratio * 100)}%`;

  progressRowEl.querySelector(
    "#progressLabel"
  ).textContent = `Fortschritt: ${doneCount}/${total} Schritte`;
}

// ---------------------------
// Buttons
// ---------------------------
btnBackToCategories.addEventListener("click", () => {
  searchInputEl.value = "";
  renderCategories();
});

btnBackToTopics.addEventListener("click", () => {
  searchInputEl.value = "";
  renderCategories();
});

btnResetCurrent.addEventListener("click", () => {
  if (!currentTopic) return;
  if (!confirm("Alle Häkchen für dieses Thema zurücksetzen?")) return;

  currentTopic.steps.forEach((_, index) => {
    const globalId = `${currentTopic.id}::${index}`;
    delete doneSteps[globalId];
  });
  saveDoneSteps();
  renderTopicDetail(currentTopic);
});

// ---------------------------
// Initialisierung
// ---------------------------
async function init() {
  loadDoneSteps();

  statusTextEl.textContent = "Lade CSV aus Google Sheets…";

  try {
    const resp = await fetch(CSV_URL);
    if (!resp.ok) {
      throw new Error(
        `CSV konnte nicht geladen werden (HTTP ${resp.status}).`
      );
    }
    const text = await resp.text();
    rows = parseCSV(text);

    buildModelFromRows(rows);

    statusTextEl.textContent = "Daten geladen.";
    renderCategories();
  } catch (err) {
    console.error(err);
    statusTextEl.textContent =
      "Fehler beim Laden der Daten. Bitte URL / Freigabe prüfen.";
    categoriesViewEl.innerHTML =
      '<div class="empty">CSV konnte nicht geladen werden. Bitte Google-Sheet-URL und Veröffentlichung ("Im Web veröffentlichen") prüfen.</div>';
  }
}

searchInputEl.addEventListener("input", handleSearchInput);
init();
