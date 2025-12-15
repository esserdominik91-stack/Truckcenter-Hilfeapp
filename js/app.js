// ==============================================
// Truckcenter Hilfecenter – Sheet-only Version
// 3-Stufen-System: Kategorie → Thema → Schritte
// Datenquelle: EIN Google Sheet (CSV-Export)
// ==============================================

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQCXjTKGowsZ4NrxhRqueZyKaDA5ny-lSAuxNaxhCOmlk_SAmI9WBGCRnY-yeOzKOvNl_DuD4T49EMK/pub?output=csv";

const STORAGE_KEY = "truckcenter-hilfe-steps-done-v2";

let rows = [];
let categories = []; // { name, order, topicCount }
let topics = []; // alle Themen
let topicsByCategory = new Map(); // catName -> [topicObj]

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
    // Ignorieren (z. B. Private Mode)
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

    const catName = (row[idxCategory] || "Allgemein").trim();
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
      topic: topicName,
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
// Render – linkes Panel
// ---------------------------
function renderCategories() {
  currentCategory = null;
  currentTopic = null;
  categoriesViewEl.style.display = "grid";
  topicsViewEl.style.display = "none";
  searchResultsViewEl.style.display = "none";
  searchHintEl.textContent = "";

  leftPanelTitleEl.textContent = "Kategorien";
  leftPanelSubtitleEl.textContent =
    "Wähle eine Kategorie oder nutze die Suche.";
  leftCounterEl.textContent =
    categories.length === 1
      ? "1 Kategorie"
      : `${categories.length} Kategorien`;

  breadcrumbsEl.innerHTML = "";

  categoriesViewEl.innerHTML = "";
  if (!categories.length) {
    categoriesViewEl.innerHTML =
      '<div class="empty">Keine Kategorien gefunden. Bitte Sheet prüfen.</div>';
    return;
  }

  categories.forEach((cat) => {
    const topicsInCat = topicsByCategory.get(cat.name) || [];
    const doneCount = topicsInCat.reduce(
      (acc, t) => acc + countDoneStepsForTopic(t),
      0
    );
    const totalSteps = topicsInCat.reduce(
      (acc, t) => acc + t.steps.length,
      0
    );

    const card = document.createElement("div");
    card.className = "card";

    card.addEventListener("click", () => {
      renderTopicsForCategory(cat.name);
    });

    const header = document.createElement("div");
    header.className = "card-header";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = cat.name;

    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.textContent = `${topicsInCat.length} Themen`;

    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.flexDirection = "column";
    right.style.alignItems = "flex-end";
    right.style.gap = "4px";

    const badge = document.createElement("div");
    badge.className = "badge-small";
    badge.textContent = `Prio ${cat.order === 9999 ? "∞" : cat.order}`;

    right.appendChild(badge);

    if (totalSteps > 0) {
      const pill = document.createElement("div");
      pill.className = "dot-pill";

      const dot = document.createElement("span");
      pill.appendChild(dot);

      const txt = document.createElement("span");
      txt.textContent = `${doneCount}/${totalSteps} Schritte`;
      pill.appendChild(txt);

      right.appendChild(pill);
    }

    header.appendChild(left);
    header.appendChild(right);

    card.appendChild(header);
    categoriesViewEl.appendChild(card);
  });

  btnBackToCategories.style.display = "none";
  btnBackToTopics.style.display = "none";
  btnResetCurrent.style.display = "none";

  renderDetailEmpty();
}

function renderTopicsForCategory(catName) {
  currentCategory = catName;
  currentTopic = null;
  categoriesViewEl.style.display = "none";
  topicsViewEl.style.display = "flex";
  topicsViewEl.innerHTML = "";
  searchResultsViewEl.style.display = "none";
  searchHintEl.textContent = "";

  leftPanelTitleEl.textContent = "Themen";
  leftPanelSubtitleEl.textContent = `Kategorie: ${catName}`;
  const list = topicsByCategory.get(catName) || [];
  leftCounterEl.textContent =
    list.length === 1 ? "1 Thema" : `${list.length} Themen`;

  breadcrumbsEl.innerHTML = "";
  const homeBtn = document.createElement("button");
  homeBtn.textContent = "Kategorien";
  homeBtn.addEventListener("click", () => renderCategories());

  const sep = document.createElement("span");
  sep.textContent = "›";

  const catStrong = document.createElement("strong");
  catStrong.textContent = catName;

  breadcrumbsEl.appendChild(homeBtn);
  breadcrumbsEl.appendChild(sep);
  breadcrumbsEl.appendChild(catStrong);

  if (!list.length) {
    topicsViewEl.innerHTML =
      '<div class="empty">In dieser Kategorie sind noch keine Themen angelegt.</div>';
  } else {
    list.forEach((t) => {
      const row = document.createElement("div");
      row.className = "topic-row";
      row.addEventListener("click", () => {
        renderTopicDetail(t, { fromSearch: false });
      });

      const main = document.createElement("div");
      main.className = "topic-main";

      const title = document.createElement("div");
      title.className = "topic-title";
      title.textContent = t.topic;

      const sub = document.createElement("div");
      sub.className = "topic-sub";
      sub.textContent = t.subcategory || "Ohne Unterkategorie";

      main.appendChild(title);
      main.appendChild(sub);

      const meta = document.createElement("div");
      meta.className = "topic-meta";

      const stepsInfo = document.createElement("span");
      stepsInfo.className = "topic-steps";
      stepsInfo.textContent = `${t.steps.length || 0} Schritte`;

      const progressPill = document.createElement("div");
      progressPill.className = "topic-progress-pill";

      const bar = document.createElement("span");
      bar.className = "bar";

      const barInner = document.createElement("span");
      barInner.className = "bar-inner";

      const { doneCount, total } = getProgressForTopic(t);
      const ratio = total > 0 ? doneCount / total : 0;
      barInner.style.transform = `scaleX(${ratio})`;

      bar.appendChild(barInner);

      const txt = document.createElement("span");
      txt.textContent =
        total > 0 ? `${Math.round(ratio * 100)}%` : "0%";

      progressPill.appendChild(bar);
      progressPill.appendChild(txt);

      meta.appendChild(stepsInfo);
      meta.appendChild(progressPill);

      row.appendChild(main);
      row.appendChild(meta);

      topicsViewEl.appendChild(row);
    });
  }

  btnBackToCategories.style.display = "inline-flex";
  btnBackToTopics.style.display = "inline-flex";
  btnResetCurrent.style.display = "none";

  renderDetailEmpty();
}

function renderSearchResults(matches, query) {
  currentCategory = null;
  currentTopic = null;
  categoriesViewEl.style.display = "none";
  topicsViewEl.style.display = "none";
  searchResultsViewEl.style.display = "flex";
  searchResultsViewEl.innerHTML = "";

  leftPanelTitleEl.textContent = "Suchergebnisse";
  leftPanelSubtitleEl.textContent = query
    ? `Gefiltert nach: "${query}"`
    : "Suche über alle Themen";
  leftCounterEl.textContent =
    matches.length === 1
      ? "1 Treffer"
      : `${matches.length} Treffer`;

  breadcrumbsEl.innerHTML = "";
  const homeBtn = document.createElement("button");
  homeBtn.textContent = "Kategorien";
  homeBtn.addEventListener("click", () => {
    searchInputEl.value = "";
    renderCategories();
  });

  breadcrumbsEl.appendChild(homeBtn);

  if (!query || query.length < 2) {
    searchResultsViewEl.innerHTML =
      '<div class="empty">Mindestens 2 Zeichen eingeben, um zu suchen.</div>';
    searchHintEl.textContent =
      "Hinweis: Es wird in Kategorie, Thema, Unterkategorie und Schritten gesucht.";
    return;
  }

  if (!matches.length) {
    searchResultsViewEl.innerHTML =
      '<div class="empty">Keine Treffer. Suche anpassen oder Kategorie direkt wählen.</div>';
    searchHintEl.textContent = "";
    return;
  }

  searchHintEl.textContent =
    "Treffer aus allen Kategorien. Klick auf ein Thema öffnet direkt die Schritte.";

  matches.forEach((t) => {
    const row = document.createElement("div");
    row.className = "topic-row";
    row.addEventListener("click", () => {
      renderTopicDetail(t, { fromSearch: true });
    });

    const main = document.createElement("div");
    main.className = "topic-main";

    const title = document.createElement("div");
    title.className = "topic-title";
    title.textContent = t.topic;

    const sub = document.createElement("div");
    sub.className = "topic-sub";
    sub.textContent = `${t.category} · ${
      t.subcategory || "Ohne Unterkategorie"
    }`;

    main.appendChild(title);
    main.appendChild(sub);

    const meta = document.createElement("div");
    meta.className = "topic-meta";

    const stepsInfo = document.createElement("span");
    stepsInfo.className = "topic-steps";
    stepsInfo.textContent = `${t.steps.length || 0} Schritte`;

    const { doneCount, total } = getProgressForTopic(t);
    const ratio = total > 0 ? doneCount / total : 0;

    const progressPill = document.createElement("div");
    progressPill.className = "topic-progress-pill";

    const bar = document.createElement("span");
    bar.className = "bar";

    const barInner = document.createElement("span");
    barInner.className = "bar-inner";
    barInner.style.transform = `scaleX(${ratio})`;

    bar.appendChild(barInner);

    const txt = document.createElement("span");
    txt.textContent =
      total > 0 ? `${Math.round(ratio * 100)}%` : "0%";

    progressPill.appendChild(bar);
    progressPill.appendChild(txt);

    meta.appendChild(stepsInfo);
    meta.appendChild(progressPill);

    row.appendChild(main);
    row.appendChild(meta);

    searchResultsViewEl.appendChild(row);
  });

  btnBackToCategories.style.display = "inline-flex";
  btnBackToTopics.style.display = "none";
  btnResetCurrent.style.display = "none";

  renderDetailEmpty();
}

// ---------------------------
// Detail rechts
// ---------------------------
function renderDetailEmpty() {
  currentTopic = null;
  detailTitleEl.textContent = "Kein Thema ausgewählt";
  detailMetaEl.textContent = "";
  detailDescEl.textContent =
    "Wähle links eine Kategorie und anschließend ein Thema.";
  stepsListEl.innerHTML = "";
  detailEmptyEl.style.display = "block";
  progressRowEl.style.display = "none";
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

function renderTopicDetail(topic, opts = {}) {
  currentTopic = topic;
  currentCategory = topic.category;

  breadcrumbsEl.innerHTML = "";
  const homeBtn = document.createElement("button");
  homeBtn.textContent = "Kategorien";
  homeBtn.addEventListener("click", () => renderCategories());

  const sep1 = document.createElement("span");
  sep1.textContent = "›";

  const catBtn = document.createElement("button");
  catBtn.textContent = topic.category;
  catBtn.addEventListener("click", () =>
    renderTopicsForCategory(topic.category)
  );

  const sep2 = document.createElement("span");
  sep2.textContent = "›";

  const topicStrong = document.createElement("strong");
  topicStrong.textContent = topic.topic;

  breadcrumbsEl.appendChild(homeBtn);
  breadcrumbsEl.appendChild(sep1);
  breadcrumbsEl.appendChild(catBtn);
  breadcrumbsEl.appendChild(sep2);
  breadcrumbsEl.appendChild(topicStrong);

  detailTitleEl.textContent = topic.topic;

  const metaParts = [];
  metaParts.push(`Kategorie: ${topic.category}`);
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
  btnBackToTopics.style.display = opts.fromSearch ? "none" : "inline-flex";
  btnResetCurrent.style.display =
    topic.steps.length > 0 ? "inline-flex" : "none";

  if (!opts.fromSearch) {
    categoriesViewEl.style.display = "none";
    topicsViewEl.style.display = "flex";
    searchResultsViewEl.style.display = "none";
    searchHintEl.textContent = "";
  } else {
    categoriesViewEl.style.display = "none";
    topicsViewEl.style.display = "none";
    searchResultsViewEl.style.display = "flex";
  }
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
// Suche
// ---------------------------
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
// Buttons
// ---------------------------
btnBackToCategories.addEventListener("click", () => {
  searchInputEl.value = "";
  renderCategories();
});

btnBackToTopics.addEventListener("click", () => {
  if (currentCategory) {
    renderTopicsForCategory(currentCategory);
  } else {
    renderCategories();
  }
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
