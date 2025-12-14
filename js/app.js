// ==============================================
// Truckcenter Hilfecenter – Vollversion
// Kategorie-Reihenfolge steuerbar über Google Sheet
// ==============================================

let data = [];
let currentCategory = null;
let currentTopic = null;

const appEl = document.getElementById("app");
const searchInputEl = document.getElementById("searchInput");
const searchResultsEl = document.getElementById("searchResults");

const STORAGE_KEY = "truckcenter-hilfe-steps-done";
let doneState = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

// ======================================================
// 1. CSV EINLESEN
// ======================================================
async function loadCSV() {
    const csvUrl = "DEIN_CSV_EXPORT_LINK_HIER";
    const res = await fetch(csvUrl);
    const text = await res.text();

    data = parseCSV(text);

    renderCategories();
}

// ======================================================
// 2. CSV → JSON PARSER
// ======================================================
function parseCSV(str) {
    const lines = str.split("\n").filter(l => l.trim().length > 0);
    const headers = lines[0].split(",");

    return lines.slice(1).map(line => {
        const parts = line.split(",");
        let obj = {};

        headers.forEach((h, i) => {
            obj[h.trim()] = parts[i] ? parts[i].trim() : "";
        });

        return {
            kategorie: obj["Kategorie"],
            kategorieReihenfolge: obj["Kategorie_Reihenfolge"] ? Number(obj["Kategorie_Reihenfolge"]) : 9999,
            thema: obj["Thema"],
            schrittNummer: obj["Schritt_Nr"],
            schrittText: obj["Schritt_Text"]
        };
    });
}

// ======================================================
// 3. UI RENDERING – KATEGORIEN (mit Reihenfolge)
// ======================================================
function renderCategories() {
    const categories = [...new Set(data.map(d => d.kategorie))];

    const ordered = categories
        .map(cat => {
            const row = data.find(r => r.kategorie === cat);
            return {
                name: cat,
                order: row.kategorieReihenfolge
            };
        })
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

    appEl.innerHTML = "<h2>Wähle eine Kategorie</h2>";

    ordered.forEach(obj => {
        const btn = document.createElement("button");
        btn.className = "listBtn";
        btn.textContent = obj.name;
        btn.onclick = () => openCategory(obj.name);
        appEl.appendChild(btn);
    });
}

// ======================================================
// 4. UI RENDERING – THEMEN
// ======================================================
function openCategory(cat) {
    currentCategory = cat;

    const topics = [...new Set(data.filter(d => d.kategorie === cat).map(d => d.thema))];

    appEl.innerHTML = `
        <button class="backBtn" onclick="renderCategories()">← Zurück</button>
        <h2>${cat}</h2>
    `;

    topics.forEach(t => {
        const btn = document.createElement("button");
        btn.className = "listBtn";
        btn.textContent = t;
        btn.onclick = () => openTopic(t);

        appEl.appendChild(btn);
    });
}

// ======================================================
// 5. UI RENDERING – SCHRITTE
// ======================================================
function openTopic(topic) {
    currentTopic = topic;

    const steps = data
        .filter(d => d.kategorie === currentCategory && d.thema === topic)
        .sort((a, b) => Number(a.schrittNummer) - Number(b.schrittNummer));

    appEl.innerHTML = `
        <button class="backBtn" onclick="openCategory('${currentCategory}')">← Zurück</button>
        <h2>${currentCategory} – ${topic}</h2>
    `;

    steps.forEach(s => {
        const id = `${currentCategory}_${topic}_${s.schrittNummer}`;
        const done = doneState[id] === true;

        const div = document.createElement("div");
        div.className = "step";

        div.innerHTML = `
            <div class="stepRow">
                <input type="checkbox" ${done ? "checked" : ""} onclick="toggleDone('${id}')">
                <span>${s.schrittNummer}. ${s.schrittText}</span>
            </div>
        `;

        appEl.appendChild(div);
    });
}

// ======================================================
// 6. DONE-STATE
// ======================================================
function toggleDone(id) {
    doneState[id] = !doneState[id];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doneState));
}

// ======================================================
// 7. SUCHFUNKTION
// ======================================================
searchInputEl.addEventListener("input", () => {
    const q = searchInputEl.value.toLowerCase().trim();
    if (q.length < 2) {
        searchResultsEl.style.display = "none";
        return;
    }

    const results = data.filter(row =>
        row.schrittText.toLowerCase().includes(q) ||
        row.thema.toLowerCase().includes(q) ||
        row.kategorie.toLowerCase().includes(q)
    );

    searchResultsEl.innerHTML = "";
    searchResultsEl.style.display = "block";

    results.slice(0, 50).forEach(r => {
        const div = document.createElement("div");
        div.className = "searchResult";
        div.textContent = `${r.kategorie} → ${r.thema} → ${r.schrittNummer}. ${r.schrittText}`;
        div.onclick = () => {
            searchResultsEl.style.display = "none";
            searchInputEl.value = "";
            currentCategory = r.kategorie;
            currentTopic = r.thema;
            openTopic(r.thema);
        };
        searchResultsEl.appendChild(div);
    });
});

// ======================================================
// 8. INIT
// ======================================================
loadCSV();
