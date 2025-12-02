// ==============================================
// Truck Center Hilfe – App-Logik (Sheet-only)
// Lädt ALLE Inhalte aus EINEM Google Sheet (CSV)
// ==============================================

let data = [];
let currentCategory = null;
let currentTopic = null;

const appEl = document.getElementById("app");
const searchInputEl = document.getElementById("searchInput");
const searchResultsEl = document.getElementById("searchResults");

const STORAGE_KEY = "truckcenter-hilfe-steps-done";
let doneState = {};

// 👉 DIESE URL ist die einzige Datenquelle
// CSV-Export für dein Sheet (Tab 1 / gid=0)
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/17Uc_pfVj4d2oPv45HwTaWTeYVHt2dzLaSpk5kziJy1w/export?format=csv&id=17Uc_pfVj4d2oPv45HwTaWTeYVHt2dzLaSpk5kziJy1w&gid=0";

// Max. Anzahl Schrittspalten im Sheet
const MAX_SHEET_STEPS = 20;

// Icons pro Kategorie-Slug
const categoryIconMap = {
  "handbuch-einfuehrung": "📘",
  "wartung-pflege": "🔧",
  "problem-loesung-reparaturen": "🧰",
  "reise-unterwegs": "🚐",
  "saisonales": "🌦️",
  "service-kontakt": "📞",
  "schnelle-hilfe": "⚡",
  "faq-beispiele": "❓"
};

// ----------------------------------------------
// Initialisierung
// ----------------------------------------------
document.addEventListener("DOMContentLoaded", function () {
  loadDoneState();
  loadDataFromSheet();
});

// ==============================================
// DATEN AUS DEM SHEET LADEN & STRUKTUR AUFBAUEN
// ==============================================
function loadDataFromSheet() {
  if (!SHEET_CSV_URL) {
    appEl.innerHTML =
      "<p>Es ist keine Datenquelle (SHEET_CSV_URL) konfiguriert.</p>";
    return;
  }

  fetch(SHEET_CSV_URL, { cache: "no-cache" })
    .then(function (res) {
      if (!res.ok) {
        throw new Error("Fehler beim Laden der CSV-Daten aus dem Sheet");
      }
      return res.text();
    })
    .then(function (csvText) {
      const rows = parseCsv(csvText);
      if (!rows || rows.length < 2) {
        throw new Error("Sheet enthält keine Daten");
      }

      const header = rows[0].map(function (h) {
        return (h || "").trim().toLowerCase();
      });
      const dataRows = rows.slice(1);

      data = buildDataStructureFromRows(header, dataRows);
      renderCategories();
      setupSearch();
    })
    .catch(function (err) {
      console.error(err);
      appEl.innerHTML =
        "<p>Die Inhalte konnten nicht geladen werden. Bitte später erneut versuchen.</p>";
    });
}

// Baut aus flacher Sheet-Struktur ein categories -> topics -> steps Objekt
function buildDataStructureFromRows(header, dataRows) {
  const idx = name => header.indexOf(name);

  const idxKategorie = idx("kategorie");
  const idxTitel = idx("titel");
  const idxIntro = idx("intro");
  const idxInhalt = idx("inhalt");
  const idxReihenfolge = idx("reihenfolge");
  const idxAktiv = idx("aktiv");
  const idxHighlight = idx("highlight");

  // Schritt-Spalten finden: schritt1 … schrittN
  const stepIndices = [];
  for (let i = 1; i <= MAX_SHEET_STEPS; i++) {
    const name = "schritt" + i;
    const pos = idx(name);
    if (pos !== -1) {
      stepIndices.push({ colIndex: pos, stepNumber: i });
    }
  }

  const categoriesBySlug = {};

  dataRows.forEach(function (row) {
    // Zeile zu Objekt
    const getCell = function (idx) {
      if (idx === -1) return "";
      return (row[idx] || "").trim();
    };

    const kat = getCell(idxKategorie);
    const titel = getCell(idxTitel);
    if (!kat || !titel) {
      // Ohne Kategorie oder Titel ignorieren wir die Zeile
      return;
    }

    const aktivVal = getCell(idxAktiv);
    if (aktivVal && aktivVal.toLowerCase() !== "ja") {
      // Nur aktive Themen anzeigen; leere "aktiv" = auch ok
      return;
    }

    const introRaw =
      getCell(idxIntro) ||
      getCell(idxInhalt) ||
      ""; // intro oder inhalt als Fallback

    const reihenfolgeStr = getCell(idxReihenfolge);
    const orderNum = parseInt(reihenfolgeStr, 10);
    const hasOrder = !isNaN(orderNum);

    const highlightVal = getCell(idxHighlight);
    const isHighlighted =
      (highlightVal || "").trim().toLowerCase() === "ja";

    // Kategorie anlegen / wiederverwenden
    const catSlug = slugify(kat);
    let category = categoriesBySlug[catSlug];
    if (!category) {
      category = {
        category: kat,
        slug: catSlug,
        subtitle: "",
        cta: "Anzeigen",
        topics: []
      };
      categoriesBySlug[catSlug] = category;
    }

    // Topic-Slug innerhalb der Kategorie eindeutig machen
    const baseTopicSlug = slugify(titel) || "thema";
    let topicSlug = baseTopicSlug;
    let counter = 2;
    while (
      category.topics.some(function (t) {
        return t.slug === topicSlug;
      })
    ) {
      topicSlug = baseTopicSlug + "-" + counter;
      counter++;
    }

    // Schritte aus den schrittX-Spalten aufbauen
    const steps = [];
    stepIndices.forEach(function (info) {
      const cellValue = getCell(info.colIndex);
      if (!cellValue) return;

      const step = parseStepCell(cellValue, info.stepNumber);
      if (step) {
        steps.push(step);
      }
    });

    const topic = {
      slug: topicSlug,
      title: titel,
      intro: introRaw,
      order: hasOrder ? orderNum : undefined,
      highlight: isHighlighted,
      steps: steps
    };

    category.topics.push(topic);
  });

  // Kategorien in ein Array umwandeln
  const categories = Object.keys(categoriesBySlug).map(function (key) {
    return categoriesBySlug[key];
  });

  // Sortierung: Kategorien alphabetisch, Topics nach highlight / order / Titel
  categories.sort(function (a, b) {
    const aName = (a.category || "").toLowerCase();
    const bName = (b.category || "").toLowerCase();
    if (aName < bName) return -1;
    if (aName > bName) return 1;
    return 0;
  });

  categories.forEach(function (category) {
    category.topics.sort(function (a, b) {
      const aHighlight = !!a.highlight;
      const bHighlight = !!b.highlight;
      if (aHighlight !== bHighlight) {
        return aHighlight ? -1 : 1;
      }

      const aOrder = typeof a.order === "number" ? a.order : 9999;
      const bOrder = typeof b.order === "number" ? b.order : 9999;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }

      const aTitle = (a.title || "").toLowerCase();
      const bTitle = (b.title || "").toLowerCase();
      if (aTitle < bTitle) return -1;
      if (aTitle > bTitle) return 1;
      return 0;
    });
  });

  return categories;
}

// Zerlegt einen Schritt-Text aus dem Sheet in Titel + Beschreibung
// Erwartetes Format im Sheet (empfohlen): "Titel – Beschreibung"
function parseStepCell(cellValue, stepNumber) {
  if (!cellValue) return null;

  let title = "Schritt " + stepNumber;
  let description = cellValue.trim();

  // 1. Versuch: Trenner mit Gedankenstrich „ – “
  const split1 = cellValue.split(" – ");
  if (split1.length >= 2) {
    title = split1[0].trim();
    description = split1.slice(1).join(" – ").trim();
  } else {
    // 2. Fallback: normales " - "
    const split2 = cellValue.split(" - ");
    if (split2.length >= 2) {
      title = split2[0].trim();
      description = split2.slice(1).join(" - ").trim();
    }
  }

  return {
    title: title || "Schritt " + stepNumber,
    description: description,
    actionType: "checklist"
  };
}

// ==============================================
// LocalStorage für erledigte Schritte
// ==============================================
function loadDoneState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      doneState = JSON.parse(raw) || {};
    }
  } catch (e) {
    doneState = {};
  }
}

function saveDoneState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doneState));
  } catch (e) {
    // ignorieren (z. B. Storage voll)
  }
}

function stepKey(categorySlug, topicSlug, index) {
  return categorySlug + "__" + topicSlug + "__" + index;
}

// ==============================================
// Hilfsfunktionen zum Finden von Datenobjekten
// ==============================================
function findCategory(slug) {
  return data.find(function (c) {
    return c.slug === slug;
  });
}

function findTopic(category, topicSlug) {
  if (!category) return null;
  return (category.topics || []).find(function (t) {
    return t.slug === topicSlug;
  });
}

// ==============================================
// Startansicht: Kategorien anzeigen
// ==============================================
function renderCategories() {
  currentCategory = null;
  currentTopic = null;

  const html =
    '<h2 class="section-title">Bereiche</h2>' +
    '<div class="grid">' +
    data
      .map(function (cat) {
        const icon = categoryIconMap[cat.slug] || "📚";
        const subtitle =
          cat.subtitle ||
          (cat.topics ? cat.topics.length + " Themen" : "");
        const cta = cat.cta || "Anzeigen";

        return (
          '<article class="card js-category" data-slug="' +
          cat.slug +
          '">' +
          '<div class="card-header">' +
          '<div class="card-icon">' +
          icon +
          "</div>" +
          "<div>" +
          "<h3>" +
          escapeHtml(cat.category) +
          "</h3>" +
          "<p>" +
          escapeHtml(subtitle) +
          "</p>" +
          "</div>" +
          "</div>" +
          '<div class="card-cta">' +
          escapeHtml(cta) +
          "</div>" +
          "</article>"
        );
      })
      .join("") +
    "</div>";

  appEl.innerHTML = html;

  Array.prototype.forEach.call(
    document.querySelectorAll(".js-category"),
    function (el) {
      el.addEventListener("click", function () {
        const slug = el.getAttribute("data-slug");
        openCategory(slug);
      });
    }
  );
}

// ==============================================
// Kategorie öffnen → Topics anzeigen
// ==============================================
function openCategory(slug) {
  const category = findCategory(slug);
  if (!category) return;

  currentCategory = category;
  currentTopic = null;

  const topics = category.topics || [];
  const icon = categoryIconMap[category.slug] || "📚";

  const html =
    '<button class="back-btn js-back-home" type="button">‹ Zur Übersicht</button>' +
    '<div class="topic-header">' +
    "<h2>" +
    escapeHtml(category.category) +
    "</h2>" +
    "</div>" +
    (category.subtitle
      ? '<p class="topic-intro">' + escapeHtml(category.subtitle) + "</p>"
      : "") +
    '<div class="grid">' +
    topics
      .map(function (topic) {
        let subtitle = topic.intro
          ? shortenText(topic.intro, 110)
          : "Details öffnen";

        if (topic.highlight) {
          subtitle = "⭐ " + subtitle;
        }

        return (
          '<article class="card js-topic" data-cat="' +
          category.slug +
          '" data-slug="' +
          topic.slug +
          '">' +
          '<div class="card-header">' +
          '<div class="card-icon">' +
          icon +
          "</div>" +
          "<div>" +
          "<h3>" +
          escapeHtml(topic.title) +
          "</h3>" +
          "<p>" +
          escapeHtml(subtitle) +
          "</p>" +
          "</div>" +
          "</div>" +
          '<div class="card-cta">Details anzeigen</div>' +
          "</article>"
        );
      })
      .join("") +
    "</div>";

  appEl.innerHTML = html;

  const backBtn = document.querySelector(".js-back-home");
  if (backBtn) {
    backBtn.addEventListener("click", function () {
      renderCategories();
    });
  }

  Array.prototype.forEach.call(
    document.querySelectorAll(".js-topic"),
    function (el) {
      el.addEventListener("click", function () {
        const tSlug = el.getAttribute("data-slug");
        openTopic(category.slug, tSlug);
      });
    }
  );
}

// ==============================================
// Topic öffnen → Steps anzeigen
// ==============================================
function openTopic(categorySlug, topicSlug) {
  const category = findCategory(categorySlug);
  if (!category) return;
  const topic = findTopic(category, topicSlug);
  if (!topic) return;

  currentCategory = category;
  currentTopic = topic;

  const steps = topic.steps || [];
  const htmlParts = [];

  htmlParts.push(
    '<button class="back-btn js-back-category" type="button">‹ ' +
      escapeHtml(category.category) +
      "</button>"
  );

  htmlParts.push(
    '<div class="topic-header">' +
      "<h2>" +
      escapeHtml(topic.title) +
      "</h2>" +
      "</div>"
  );

  if (topic.intro) {
    htmlParts.push(
      '<p class="topic-intro">' + escapeHtml(topic.intro) + "</p>"
    );
  }

  if (!steps.length) {
    htmlParts.push(
      "<p>Für dieses Thema sind noch keine Schritte hinterlegt.</p>"
    );
  } else {
    htmlParts.push('<ul class="steps">');

    steps.forEach(function (step, index) {
      const key = stepKey(category.slug, topic.slug, index);
      const isDone = !!doneState[key];
      const actionType = step.actionType || "checklist";

      htmlParts.push(
        '<li class="step" id="step-' +
          category.slug +
          "-" +
          topic.slug +
          "-" +
          index +
          '">'
      );

      // Header
      htmlParts.push('<div class="step-header">');
      htmlParts.push(
        '<div class="step-title">' + escapeHtml(step.title) + "</div>"
      );

      htmlParts.push('<div class="step-badges">');
      htmlParts.push(
        '<span class="badge">' + actionTypeLabel(actionType) + "</span>"
      );
      htmlParts.push("</div>"); // step-badges
      htmlParts.push("</div>"); // step-header

      // Beschreibung
      if (step.description) {
        htmlParts.push(
          '<div class="step-body">' +
            escapeHtml(step.description) +
            "</div>"
        );
      }

      // Aktionen
      htmlParts.push('<div class="step-actions">');

      // Alle Schritte sind Checklisten → Erledigt-Button
      const label = isDone
        ? "Erledigt"
        : "Als erledigt markieren";
      const btnClass = isDone
        ? "btn btn-done btn-small"
        : "btn btn-primary btn-small";
      htmlParts.push(
        '<button class="' +
          btnClass +
          ' js-step-done" type="button" ' +
          'data-cat="' +
          category.slug +
          '" data-topic="' +
          topic.slug +
          '" data-index="' +
          index +
          '">' +
          escapeHtml(label) +
          "</button>"
      );

      htmlParts.push("</div>"); // step-actions
      htmlParts.push("</li>"); // step
    });

    htmlParts.push("</ul>");
  }

  appEl.innerHTML = htmlParts.join("");

  const backBtn = document.querySelector(".js-back-category");
  if (backBtn) {
    backBtn.addEventListener("click", function () {
      openCategory(category.slug);
    });
  }

  Array.prototype.forEach.call(
    document.querySelectorAll(".js-step-done"),
    function (btn) {
      btn.addEventListener("click", onToggleStepDone);
    }
  );
}

// ==============================================
// Schritt als erledigt markieren / umschalten
// ==============================================
function onToggleStepDone(event) {
  const btn = event.currentTarget;
  const catSlug = btn.getAttribute("data-cat");
  const topicSlug = btn.getAttribute("data-topic");
  const index = parseInt(btn.getAttribute("data-index"), 10);

  const key = stepKey(catSlug, topicSlug, index);
  const isDone = !!doneState[key];

  if (isDone) {
    delete doneState[key];
  } else {
    doneState[key] = true;
  }
  saveDoneState();

  const nowDone = !!doneState[key];
  btn.textContent = nowDone ? "Erledigt" : "Als erledigt markieren";
  btn.className = nowDone
    ? "btn btn-done btn-small js-step-done"
    : "btn btn-primary btn-small js-step-done";
}

// ==============================================
// Suche
// ==============================================
function setupSearch() {
  if (!searchInputEl) return;

  searchInputEl.addEventListener("input", function () {
    const term = searchInputEl.value.trim().toLowerCase();
    if (!term) {
      hideSearchResults();
      return;
    }
    const results = searchAll(term);
    renderSearchResults(results);
  });

  searchInputEl.addEventListener("blur", function () {
    setTimeout(hideSearchResults, 200);
  });
}

function searchAll(term) {
  const results = [];

  data.forEach(function (cat) {
    const catName = cat.category || "";
    const topics = cat.topics || [];

    if (catName.toLowerCase().indexOf(term) !== -1) {
      results.push({
        type: "category",
        categorySlug: cat.slug,
        title: cat.category,
        subtitle: "Kategorie"
      });
    }

    topics.forEach(function (topic) {
      const tTitle = topic.title || "";
      const tIntro = topic.intro || "";
      const inTitle = tTitle.toLowerCase().indexOf(term) !== -1;
      const inIntro = tIntro.toLowerCase().indexOf(term) !== -1;

      if (inTitle || inIntro) {
        results.push({
          type: "topic",
          categorySlug: cat.slug,
          topicSlug: topic.slug,
          title: topic.title,
          subtitle: cat.category
        });
      }

      (topic.steps || []).forEach(function (step, index) {
        const sTitle = step.title || "";
        const sDesc = step.description || "";
        if (
          sTitle.toLowerCase().indexOf(term) !== -1 ||
          sDesc.toLowerCase().indexOf(term) !== -1
        ) {
          results.push({
            type: "step",
            categorySlug: cat.slug,
            topicSlug: topic.slug,
            stepIndex: index,
            title: step.title,
            subtitle: topic.title + " · " + cat.category
          });
        }
      });
    });
  });

  return results.slice(0, 25);
}

function renderSearchResults(results) {
  if (!searchResultsEl) return;

  if (!results.length) {
    searchResultsEl.innerHTML = "<li>Keine Treffer</li>";
    searchResultsEl.style.display = "block";
    return;
  }

  const html = results
    .map(function (r, idx) {
      return (
        '<li class="js-search-result" data-index="' +
        idx +
        '">' +
        "<strong>" +
        escapeHtml(r.title) +
        "</strong>" +
        "<small>" +
        escapeHtml(r.subtitle || "") +
        "</small>" +
        "</li>"
      );
    })
    .join("");

  searchResultsEl.innerHTML = html;
  searchResultsEl.style.display = "block";

  const items = searchResultsEl.querySelectorAll(".js-search-result");
  Array.prototype.forEach.call(items, function (el) {
    el.addEventListener("mousedown", function (evt) {
      evt.preventDefault();
      const idx = parseInt(el.getAttribute("data-index"), 10);
      const item = results[idx];
      handleSearchSelection(item);
    });
  });
}

function hideSearchResults() {
  if (!searchResultsEl) return;
  searchResultsEl.style.display = "none";
}

function handleSearchSelection(item) {
  if (!item) return;
  hideSearchResults();

  if (item.type === "category") {
    openCategory(item.categorySlug);
    return;
  }

  if (item.type === "topic") {
    openCategory(item.categorySlug);
    setTimeout(function () {
      openTopic(item.categorySlug, item.topicSlug);
    }, 0);
    return;
  }

  if (item.type === "step") {
    openCategory(item.categorySlug);
    setTimeout(function () {
      openTopic(item.categorySlug, item.topicSlug);
      setTimeout(function () {
        const stepId =
          "step-" +
          item.categorySlug +
          "-" +
          item.topicSlug +
          "-" +
          item.stepIndex;
        const el = document.getElementById(stepId);
        if (el && typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 50);
    }, 0);
  }
}

// ==============================================
// Generelle Hilfsfunktionen
// ==============================================
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortenText(str, maxLen) {
  if (!str) return "";
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}

function actionTypeLabel(type) {
  switch (type) {
    case "diagnosis":
      return "Diagnose";
    case "contact":
      return "Kontakt";
    case "link":
      return "Link";
    case "checklist":
    default:
      return "Checkliste";
  }
}

// Slug aus Text
function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

// CSV-Parser inkl. Anführungszeichen
function parseCsv(text) {
  const rows = [];
  let currentRow = [];
  let currentValue = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      currentValue += '"';
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (currentValue !== "" || currentRow.length > 0) {
        currentRow.push(currentValue);
        rows.push(currentRow);
        currentRow = [];
        currentValue = "";
      }
      continue;
    }

    currentValue += char;
  }

  if (currentValue !== "" || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows;
}
