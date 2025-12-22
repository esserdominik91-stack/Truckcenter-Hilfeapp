// ==============================================
// Truckcenter Hilfecenter – Sheet-only Version
// 3 Ebenen links:
//
// 1) Kategorie (Kachel, mit Emoji, nur einmal)
// 2) Unterkategorie (Liste, nur einmal je Kategorie)
// 3) Themen/Titel innerhalb der Unterkategorie
//
// Rechts: Detail + Fortschritt + Schritte (BLEIBT)
// Erweiterung:
// - Pro Schritt: Bild/PDF/YouTube via schrittX_bild/pdf/youtube
// - Kategorie "Video": Zeilen-Spalte youtube (Embed)
// ==============================================

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQCXjTKGowsZ4NrxhRqueZyKaDA5ny-lSAuxNaxhCOmlk_SAmI9WBGCRnY-yeOzKOvNl_DuD4T49EMK/pub?output=csv";

const STORAGE_KEY = "truckcenter-hilfe-steps-done-v3";

let rows = [];
let categories = [];           // [{ name, order, topicCount }]
let topics = [];               // alle Themen
let topicsByCategory = new Map();

let currentCategory = null;
let currentSubcategory = null;
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
// Drive / YouTube Helper
// ---------------------------
function toDriveDirectImage(url) {
  if (!url) return "";
  const u = String(url).trim();
  const m = u.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (m && m[1]) return `https://drive.google.com/uc?export=view&id=${m[1]}`;
  return u;
}

function toDrivePreviewPdf(url) {
  if (!url) return "";
  const u = String(url).trim();
  const m = u.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (m && m[1]) return `https://drive.google.com/file/d/${m[1]}/preview`;
  return u;
}

function getYouTubeId(url) {
  if (!url) return "";
  const u = String(url).trim();

  let m = u.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (m) return m[1];

  m = u.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (m) return m[1];

  m = u.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/);
  if (m) return m[1];

  m = u.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/);
  if (m) return m[1];

  return "";
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
  const idxDesc = idx(["beschreibung", "kurzbeschreibung", "description", "info", "inhalt"]);
  const idxCatOrder = idx(["kategorie_reihenfolge", "cat_order", "category_order"]);
  const idxTopicOrder = idx(["thema_reihenfolge", "topic_order", "sort", "reihenfolge"]);
  const idxYouTubeRow = idx(["youtube", "youtube_url", "video"]);

  if (idxCategory === -1 || idxTopic === -1) {
    throw new Error("Spalten 'Kategorie' und/oder 'Thema' nicht gefunden. Bitte im Sheet prüfen.");
  }

  // NUR echte Schrittspalten: schritt1, schritt2, ... (nicht schritt1_bild)
  const stepIndices = [];
  headersNorm.forEach((h, i) => {
    if (/^(schritt|step)\d+$/.test(h)) stepIndices.push(i);
  });

  // Für jede Schrittspalte die optionalen Media-Spalten finden
  const stepMedia = []; // pro StepPos: { imgIdx, pdfIdx, ytIdx }
  stepIndices.forEach((sIdx) => {
    const base = headersNorm[sIdx]; // z.B. "schritt1"
    const imgIdx = headersNorm.findIndex((h) => h === `${base}_bild`);
    const pdfIdx = headersNorm.findIndex((h) => h === `${base}_pdf`);
    const ytIdx = headersNorm.findIndex((h) => h === `${base}_youtube`);
    stepMedia.push({ imgIdx, pdfIdx, ytIdx });
  });

  const topicsTmp = [];
  const categoriesMap = new Map();

  for (let r = 1; r < allRows.length; r++) {
    const row = allRows[r];
    if (!row || row.length === 0) continue;

    const catName = (row[idxCategory] || "Allgemeines").trim();
    const topicName = (row[idxTopic] || "").trim();
    if (!topicName) continue;

    const subName = idxSub >= 0 && row[idxSub] ? String(row[idxSub]).trim() : "";
    const desc = idxDesc >= 0 && row[idxDesc] ? String(row[idxDesc]).trim() : "";

    const catOrder =
      idxCatOrder >= 0 && row[idxCatOrder] ? Number(row[idxCatOrder]) || 9999 : 9999;

    const topicOrder =
      idxTopicOrder >= 0 && row[idxTopicOrder] ? Number(row[idxTopicOrder]) || 9999 : 9999;

    const youtubeRowRaw =
      idxYouTubeRow >= 0 && row[idxYouTubeRow] ? String(row[idxYouTubeRow]).trim() : "";

    const steps = [];
    stepIndices.forEach((sIdx, sPos) => {
      const sText = row[sIdx] ? String(row[sIdx]).trim() : "";
      if (!sText) return;

      const mediaDef = stepMedia[sPos] || {};
      const imgRaw = mediaDef.imgIdx >= 0 && row[mediaDef.imgIdx] ? String(row[mediaDef.imgIdx]).trim() : "";
      const pdfRaw = mediaDef.pdfIdx >= 0 && row[mediaDef.pdfIdx] ? String(row[mediaDef.pdfIdx]).trim() : "";
      const ytRaw  = mediaDef.ytIdx  >= 0 && row[mediaDef.ytIdx]  ? String(row[mediaDef.ytIdx]).trim()  : "";

      steps.push({
        id: `r${r}-s${sPos}`,
        text: sText,
        img: imgRaw ? toDriveDirectImage(imgRaw) : "",
        pdf: pdfRaw ? toDrivePreviewPdf(pdfRaw) : "",
        yt:  ytRaw ? getYouTubeId(ytRaw) : "",
      });
    });

    const topicObj = {
      id: `row-${r}`,
      category: catName,
      topic: topicName,
      subcategory: subName,
      description: desc,
      youtube: youtubeRowRaw ? getYouTubeId(youtubeRowRaw) : "",
      catOrder,
      topicOrder,
      steps,
    };

    topicsTmp.push(topicObj);

    if (!categoriesMap.has(catName)) {
      categoriesMap.set(catName, { name: catName, order: catOrder, topicCount: 0 });
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
    if (!topicsByCategory.has(t.category)) topicsByCategory.set(t.category, []);
    topicsByCategory.get(t.category).push(t);
  }
}

// ---------------------------
// UI-Helfer
// ---------------------------
function getIconForCategory(catName) {
  const c = (catName || "").toLowerCase();
  if (c.includes("video")) return "🎬";
  if (c.includes("problem")) return "⚠️";
  if (c.includes("allgemein")) return "ℹ️";
  if (c.includes("test")) return "🧪";
  return "□";
}

function getIconForSubcategory(subName) {
  const s = (subName || "").toLowerCase();
  if (s.includes("strom")) return "⚡";
  if (s.includes("wasser")) return "💧";
  if (s.includes("handbuch")) return "📘";
  if (s.includes("werkzeug")) return "🛠️";
  return "□";
}

function getIconForTopic(t) {
  if (t.subcategory) return getIconForSubcategory(t.subcategory);
  return getIconForCategory(t.category);
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

// ---------------------------
// Kategorien-Kachel
// ---------------------------
function createCategoryCard(cat) {
  const topicsInCat = topicsByCategory.get(cat.name) || [];

  let totalSteps = 0;
  let doneCount = 0;
  topicsInCat.forEach((t) => {
    totalSteps += t.steps.length;
    doneCount += countDoneStepsForTopic(t);
  });

  const card = document.createElement("div");
  card.className = "card";

  card.addEventListener("click", () => {
    renderSubcategoriesForCategory(cat.name);
  });

  const header = document.createElement("div");
  header.className = "card-header";

  const left = document.createElement("div");
  left.style.display = "flex";
  left.style.flexDirection = "column";
  left.style.gap = "4px";

  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = `${getIconForCategory(cat.name)} ${cat.name}`;

  const meta = document.createElement("div");
  meta.className = "card-meta";
  meta.textContent =
    topicsInCat.length === 1 ? "1 Thema in dieser Kategorie" : `${topicsInCat.length} Themen in dieser Kategorie`;

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

  // Fortschritt-Pill bleibt wie bisher
  if (totalSteps > 0) {
    const progressPill = document.createElement("div");
    progressPill.className = "topic-progress-pill";

    const bar = document.createElement("span");
    bar.className = "bar";

    const barInner = document.createElement("span");
    barInner.className = "bar-inner";
    const ratio = totalSteps > 0 ? doneCount / totalSteps : 0;
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
// Unterkategorie-Zeile (Ebene 2)
// ---------------------------
function createSubcategoryRow(catName, subName, topicsInSub) {
  const row = document.createElement("div");
  row.className = "topic-row";

  row.addEventListener("click", () => {
    renderTopicsForSubcategory(catName, subName);
  });

  const main = document.createElement("div");
  main.className = "topic-main";

  const title = document.createElement("div");
  title.className = "topic-title";

  const iconSpan = document.createElement("span");
  iconSpan.textContent = getIconForSubcategory(subName);

  const titleText = document.createElement("span");
  titleText.textContent = subName || "Allgemein";

  title.appendChild(iconSpan);
  title.appendChild(titleText);

  const desc = document.createElement("div");
  desc.className = "topic-desc";
  desc.textContent =
    topicsInSub.length === 1 ? "1 Thema in dieser Unterkategorie." : `${topicsInSub.length} Themen in dieser Unterkategorie.`;

  main.appendChild(title);
  main.appendChild(desc);

  const meta = document.createElement("div");
  meta.className = "topic-meta";

  let totalSteps = 0;
  let doneCount = 0;
  topicsInSub.forEach((t) => {
    totalSteps += t.steps.length;
    doneCount += countDoneStepsForTopic(t);
  });

  const stepsInfo = document.createElement("span");
  stepsInfo.className = "topic-steps";
  stepsInfo.textContent = totalSteps === 1 ? "1 Schritt insgesamt" : `${totalSteps} Schritte insgesamt`;

  const progressPill = document.createElement("div");
  progressPill.className = "topic-progress-pill";

  const bar = document.createElement("span");
  bar.className = "bar";

  const barInner = document.createElement("span");
  barInner.className = "bar-inner";
  const ratio = totalSteps > 0 ? doneCount / totalSteps : 0;
  barInner.style.transform = `scaleX(${ratio})`;

  bar.appendChild(barInner);

  const txt = document.createElement("span");
  txt.textContent = totalSteps > 0 ? `${Math.round(ratio * 100)}%` : "0%";

  progressPill.appendChild(bar);
  progressPill.appendChild(txt);

  meta.appendChild(stepsInfo);
  meta.appendChild(progressPill);

  row.appendChild(main);
  row.appendChild(meta);

  return row;
}

// ---------------------------
// Themen-Zeile (Ebene 3)
// ---------------------------
function createTopicRow(t) {
  const row = document.createElement("div");
  row.className = "topic-row";

  row.addEventListener("click", () => {
    renderTopicDetail(t);
  });

  const main = document.createElement("div");
  main.className = "topic-main";

  const sub = document.createElement("div");
  sub.className = "topic-sub";
  sub.textContent = t.subcategory || "Ohne Unterkategorie";

  const title = document.createElement("div");
  title.className = "topic-title";

  const iconSpan = document.createElement("span");
  iconSpan.textContent = getIconForTopic(t);

  const titleText = document.createElement("span");
  titleText.textContent = t.topic;

  title.appendChild(iconSpan);
  title.appendChild(titleText);

  const desc = document.createElement("div");
  desc.className = "topic-desc";
  desc.textContent = t.description || "Hinweise und Schritte zur Lösung dieses Themas.";

  main.appendChild(sub);
  main.appendChild(title);
  main.appendChild(desc);

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
  txt.textContent = total > 0 ? `${Math.round(ratio * 100)}%` : "0%";

  progressPill.appendChild(bar);
  progressPill.appendChild(txt);

  meta.appendChild(stepsInfo);
  meta.appendChild(progressPill);

  row.appendChild(main);
  row.appendChild(meta);

  return row;
}

// ---------------------------
// Ebene 1: Kategorien
// ---------------------------
function renderCategories() {
  currentCategory = null;
  currentSubcategory = null;
  currentTopic = null;

  categoriesViewEl.style.display = "grid";
  topicsViewEl.style.display = "none";
  searchResultsViewEl.style.display = "none";
  searchHintEl.textContent = "";

  leftPanelTitleEl.textContent = "Kategorien";
  leftPanelSubtitleEl.textContent = "1. Kategorie wählen · 2. Unterkategorie wählen · 3. Thema wählen.";
  leftCounterEl.textContent = categories.length === 1 ? "1 Kategorie" : `${categories.length} Kategorien`;

  breadcrumbsEl.innerHTML = "";

  categoriesViewEl.innerHTML = "";
  if (!categories.length) {
    categoriesViewEl.innerHTML = '<div class="empty">Keine Kategorien gefunden. Bitte Sheet prüfen.</div>';
    return;
  }

  categories.forEach((cat) => {
    categoriesViewEl.appendChild(createCategoryCard(cat));
  });

  btnBackToCategories.style.display = "none";
  btnBackToTopics.style.display = "none";
  btnResetCurrent.style.display = "none";

  renderDetailEmpty();
}

// ---------------------------
// Ebene 2: Unterkategorien in einer Kategorie
// ---------------------------
function renderSubcategoriesForCategory(catName) {
  currentCategory = catName;
  currentSubcategory = null;
  currentTopic = null;

  const list = topicsByCategory.get(catName) || [];

  const subMap = new Map(); // subName -> { topics: [], order }
  list.forEach((t) => {
    const subName = t.subcategory || "Allgemein";
    if (!subMap.has(subName)) {
      subMap.set(subName, { topics: [], order: t.topicOrder });
    }
    const entry = subMap.get(subName);
    entry.topics.push(t);
    entry.order = Math.min(entry.order, t.topicOrder);
  });

  const subEntries = Array.from(subMap.entries()).sort(
    (a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0])
  );

  categoriesViewEl.style.display = "none";
  topicsViewEl.style.display = "flex";
  topicsViewEl.innerHTML = "";
  searchResultsViewEl.style.display = "none";
  searchHintEl.textContent = "";

  leftPanelTitleEl.textContent = "Unterkategorien";
  leftPanelSubtitleEl.textContent = `Kategorie: ${catName}`;
  leftCounterEl.textContent = subEntries.length === 1 ? "1 Unterkategorie" : `${subEntries.length} Unterkategorien`;

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

  if (!subEntries.length) {
    topicsViewEl.innerHTML = '<div class="empty">In dieser Kategorie sind noch keine Unterkategorien/Themen angelegt.</div>';
  } else {
    subEntries.forEach(([subName, data]) => {
      topicsViewEl.appendChild(createSubcategoryRow(catName, subName, data.topics));
    });
  }

  btnBackToCategories.style.display = "inline-flex";
  btnBackToTopics.style.display = "none";
  btnResetCurrent.style.display = "none";

  renderDetailEmpty();
}

// ---------------------------
// Ebene 3: Themenliste innerhalb einer Unterkategorie
// ---------------------------
function renderTopicsForSubcategory(catName, subName) {
  currentCategory = catName;
  currentSubcategory = subName;
  currentTopic = null;

  const allInCat = topicsByCategory.get(catName) || [];
  const list = allInCat.filter((t) => (t.subcategory || "Allgemein") === subName);

  categoriesViewEl.style.display = "none";
  topicsViewEl.style.display = "flex";
  topicsViewEl.innerHTML = "";
  searchResultsViewEl.style.display = "none";
  searchHintEl.textContent = "";

  leftPanelTitleEl.textContent = "Themen";
  leftPanelSubtitleEl.textContent = `Kategorie: ${catName} · Unterkategorie: ${subName}`;
  leftCounterEl.textContent = list.length === 1 ? "1 Thema" : `${list.length} Themen`;

  breadcrumbsEl.innerHTML = "";
  const homeBtn = document.createElement("button");
  homeBtn.textContent = "Kategorien";
  homeBtn.addEventListener("click", () => renderCategories());

  const sep1 = document.createElement("span");
  sep1.textContent = "›";

  const catBtn = document.createElement("button");
  catBtn.textContent = catName;
  catBtn.addEventListener("click", () => renderSubcategoriesForCategory(catName));

  const sep2 = document.createElement("span");
  sep2.textContent = "›";

  const subStrong = document.createElement("strong");
  subStrong.textContent = subName;

  breadcrumbsEl.appendChild(homeBtn);
  breadcrumbsEl.appendChild(sep1);
  breadcrumbsEl.appendChild(catBtn);
  breadcrumbsEl.appendChild(sep2);
  breadcrumbsEl.appendChild(subStrong);

  if (!list.length) {
    topicsViewEl.innerHTML = '<div class="empty">In dieser Unterkategorie sind noch keine Themen angelegt.</div>';
  } else {
    list.forEach((t) => {
      topicsViewEl.appendChild(createTopicRow(t));
    });
  }

  btnBackToCategories.style.display = "inline-flex";
  btnBackToTopics.style.display = "inline-flex";
  btnResetCurrent.style.display = "none";

  renderDetailEmpty();
}

// ---------------------------
// Suche (arbeitet auf Themen-Ebene)
// ---------------------------
function renderSearchResults(matches, query) {
  currentCategory = null;
  currentSubcategory = null;
  currentTopic = null;

  categoriesViewEl.style.display = "none";
  topicsViewEl.style.display = "flex";
  topicsViewEl.innerHTML = "";
  searchResultsViewEl.style.display = "none";

  leftPanelTitleEl.textContent = "Suchergebnisse";
  leftPanelSubtitleEl.textContent = query ? `Gefiltert nach: "${query}"` : "Suche über alle Themen.";
  leftCounterEl.textContent = matches.length === 1 ? "1 Treffer" : `${matches.length} Treffer`;

  breadcrumbsEl.innerHTML = "";
  const homeBtn = document.createElement("button");
  homeBtn.textContent = "Kategorien";
  homeBtn.addEventListener("click", () => {
    searchInputEl.value = "";
    renderCategories();
  });
  breadcrumbsEl.appendChild(homeBtn);

  if (!query || query.length < 2) {
    topicsViewEl.innerHTML = '<div class="empty">Mindestens 2 Zeichen eingeben, um zu suchen.</div>';
    searchHintEl.textContent = "Hinweis: Es wird in Kategorie, Unterkategorie, Titel und Schritten gesucht.";
    return;
  }

  if (!matches.length) {
    topicsViewEl.innerHTML = '<div class="empty">Keine Treffer. Suche anpassen oder Kategorie direkt wählen.</div>';
    searchHintEl.textContent = "";
    return;
  }

  searchHintEl.textContent = "Treffer aus allen Kategorien. Klick auf ein Thema öffnet die Schritte.";

  matches.forEach((t) => {
    topicsViewEl.appendChild(createTopicRow(t));
  });

  btnBackToCategories.style.display = "inline-flex";
  btnBackToTopics.style.display = "none";
  btnResetCurrent.style.display = "none";

  renderDetailEmpty();
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
      (t.subcategory && t.subcategory.toLowerCase().includes(qLower)) ||
      (t.youtube && t.youtube.toLowerCase().includes(qLower))
    ) {
      return true;
    }
    return t.steps.some((s) => s.text.toLowerCase().includes(qLower));
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
  detailDescEl.textContent = "Wähle links zuerst eine Kategorie, dann eine Unterkategorie und danach ein Thema.";
  stepsListEl.innerHTML = "";
  detailEmptyEl.style.display = "block";
  progressRowEl.style.display = "none";

  const oldVideo = document.getElementById("topicVideoContainer");
  if (oldVideo) oldVideo.remove();
}

function renderTopicDetail(topic) {
  currentTopic = topic;
  currentCategory = topic.category;
  currentSubcategory = topic.subcategory || "Allgemein";

  // Breadcrumbs
  breadcrumbsEl.innerHTML = "";
  const homeBtn = document.createElement("button");
  homeBtn.textContent = "Kategorien";
  homeBtn.addEventListener("click", () => renderCategories());

  const sep1 = document.createElement("span");
  sep1.textContent = "›";

  const catBtn = document.createElement("button");
  catBtn.textContent = topic.category;
  catBtn.addEventListener("click", () => renderSubcategoriesForCategory(topic.category));

  const sep2 = document.createElement("span");
  sep2.textContent = "›";

  const subBtn = document.createElement("button");
  subBtn.textContent = currentSubcategory;
  subBtn.addEventListener("click", () => renderTopicsForSubcategory(topic.category, currentSubcategory));

  const sep3 = document.createElement("span");
  sep3.textContent = "›";

  const topicStrong = document.createElement("strong");
  topicStrong.textContent = topic.topic;

  breadcrumbsEl.appendChild(homeBtn);
  breadcrumbsEl.appendChild(sep1);
  breadcrumbsEl.appendChild(catBtn);
  breadcrumbsEl.appendChild(sep2);
  breadcrumbsEl.appendChild(subBtn);
  breadcrumbsEl.appendChild(sep3);
  breadcrumbsEl.appendChild(topicStrong);

  detailTitleEl.textContent = `${getIconForTopic(topic)} ${topic.topic}`;

  const metaParts = [];
  if (topic.category) metaParts.push(`Kategorie: ${topic.category}`);
  if (topic.subcategory) metaParts.push(`Unterkategorie: ${topic.subcategory}`);
  metaParts.push(`${topic.steps.length} Schritte`);
  detailMetaEl.textContent = metaParts.join(" · ");

  detailDescEl.textContent =
    topic.description || "Für dieses Thema ist keine zusätzliche Beschreibung hinterlegt.";

  // Remove previous video container if exists
  const oldVideo = document.getElementById("topicVideoContainer");
  if (oldVideo) oldVideo.remove();

  // Kategorie "Video" (Zeilenebene)
  if ((topic.category || "").trim().toLowerCase() === "video" && topic.youtube) {
    const videoWrap = document.createElement("div");
    videoWrap.id = "topicVideoContainer";
    videoWrap.style.margin = "12px 0";

    const iframe = document.createElement("iframe");
    iframe.width = "100%";
    iframe.height = "360";
    iframe.src = `https://www.youtube.com/embed/${topic.youtube}`;
    iframe.title = "YouTube video";
    iframe.frameBorder = "0";
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.style.borderRadius = "10px";

    videoWrap.appendChild(iframe);

    // Insert above steps list
    const parent = stepsListEl.parentElement;
    parent.insertBefore(videoWrap, stepsListEl);
  }

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
      if (checkbox.checked) li.classList.add("done");
      else li.classList.remove("done");
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

    // Medien unter dem Schritt
    const mediaWrap = document.createElement("div");
    mediaWrap.style.marginTop = "8px";
    mediaWrap.style.display = "flex";
    mediaWrap.style.flexDirection = "column";
    mediaWrap.style.gap = "8px";

    if (step.img && step.img.startsWith("http")) {
      const img = document.createElement("img");
      img.src = step.img;
      img.loading = "lazy";
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      img.style.borderRadius = "10px";
      mediaWrap.appendChild(img);
    }

    if (step.pdf && step.pdf.startsWith("http")) {
      const a = document.createElement("a");
      a.href = step.pdf;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "PDF öffnen";
      a.style.display = "inline-flex";
      a.style.alignSelf = "flex-start";
      a.style.padding = "8px 10px";
      a.style.borderRadius = "10px";
      a.style.textDecoration = "none";
      a.style.border = "1px solid rgba(0,0,0,.15)";
      mediaWrap.appendChild(a);
    }

    if (step.yt) {
      const iframe = document.createElement("iframe");
      iframe.width = "100%";
      iframe.height = "315";
      iframe.src = `https://www.youtube.com/embed/${step.yt}`;
      iframe.title = "YouTube video";
      iframe.frameBorder = "0";
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.allowFullscreen = true;
      iframe.style.borderRadius = "10px";
      mediaWrap.appendChild(iframe);
    }

    if (mediaWrap.children.length) {
      textWrap.appendChild(mediaWrap);
    }

    li.appendChild(checkbox);
    li.appendChild(textWrap);

    stepsListEl.appendChild(li);
  });

  updateDetailProgress(topic);

  btnBackToCategories.style.display = "inline-flex";
  btnBackToTopics.style.display = "inline-flex";
  btnResetCurrent.style.display = topic.steps.length > 0 ? "inline-flex" : "none";
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

  const lbl = progressRowEl.querySelector("#progressLabel");
  if (lbl) lbl.textContent = `Fortschritt: ${doneCount}/${total} Schritte`;
}

// ---------------------------
// Buttons
// ---------------------------
btnBackToCategories.addEventListener("click", () => {
  searchInputEl.value = "";
  renderCategories();
});

btnBackToTopics.addEventListener("click", () => {
  if (currentCategory && currentSubcategory) {
    renderTopicsForSubcategory(currentCategory, currentSubcategory);
  } else if (currentCategory) {
    renderSubcategoriesForCategory(currentCategory);
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
      throw new Error(`CSV konnte nicht geladen werden (HTTP ${resp.status}).`);
    }
    const text = await resp.text();
    rows = parseCSV(text);

    buildModelFromRows(rows);

    statusTextEl.textContent = "Daten geladen.";
    renderCategories();
  } catch (err) {
    console.error(err);
    statusTextEl.textContent = "Fehler beim Laden der Daten. Bitte URL / Freigabe prüfen.";
    categoriesViewEl.innerHTML =
      '<div class="empty">CSV konnte nicht geladen werden. Bitte Google-Sheet-URL und Veröffentlichung ("Im Web veröffentlichen") prüfen.</div>';
  }
}

searchInputEl.addEventListener("input", handleSearchInput);
init();
