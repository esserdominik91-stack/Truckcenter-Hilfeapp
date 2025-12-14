// ==========================================================
// Truckcenter / Truckshop Hilfecenter – stabile Vollversion
// Mit vollständiger Kategorie-Reihenfolge (kategorie_reihenfolge)
// Und Themen-Reihenfolge (reihenfolge)
// Abstimmung vollständig auf dein Google Sheet
// ==========================================================

let data = [];
let currentCategory = null;
let currentTopic = null;

const appEl = document.getElementById("app");
const searchInputEl = document.getElementById("searchInput");
const searchResultsEl = document.getElementById("searchResults");

const STORAGE_KEY = "truckcenter-hilfe-steps-v3";
let doneState = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

// ==========================================================
// 1. CSV LADEN
// ==========================================================
async function loadCSV() {
    const csvUrl = "HIER_DEINE_CSV_URL_EINTRAGEN";
    const res = await fetch(csvUrl);
    const text = await res.text();
    data = parseCSV(text);
    renderCategories();
}

// ==========================================================
// 2. CSV PARSEN (angepasst an DEIN Sheet)
// ==========================================================
function parseCSV(str) {
    const lines = str.split("\n").filter(x => x.trim());
    const headers = lines[0].split(",");

    const rows = lines.slice(1).map(line => {
        const parts = line.split(",");
        let obj = {};

        headers.forEach((h, i) => {
            obj[h.trim()] = parts[i] ? parts[i].trim() : "";
        });

        // Schritte sammeln
        const steps = [];
        for (let i = 1; i <= 20; i++) {
            const key = `schritt${i}`;
            if (obj[key] && obj[key].trim() !== "") {
                steps.push({
                    num: i,
                    text: obj[key].trim()
                });
            }
        }

        const aktiv = (obj["aktiv"] || "").toLowerCase();
        const highlight = (obj["highlight"] || "").toLowerCase();

        return {
            kategorie: obj["kategorie"],
            kategorieReihenfolge: obj["kategorie_reihenfolge"] ? Number(obj["kategorie_reihenfolge"]) : 9999,
            titel: obj["titel"],
            inhalt: obj["inhalt"],
            reihenfolge: obj["reihenfolge"] ? Number(obj["reihenfolge"]) : 9999,
            aktiv: aktiv === "" || aktiv === "ja",
            highlight: highlight === "ja",
            steps
        };
    });

    // gültige Zeilen filtern
    return rows.filter(r =>
        r.kategorie &&
        r.titel &&
        r.steps.length > 0 &&
        r.aktiv
    );
}

// ==========================================================
// 3. KATEGORIEN RENDERN (MIT SORTIERUNG)
// ==========================================================
function renderCategories() {
    appEl.innerHTML = "<h2>Wähle eine Kategorie</h2>";

    const categories = [...new Set(data.map(d => d.kategorie))];

    const sortedCategories = categories
        .map(cat => {
            const row = data.find(r => r.kategorie === cat);
            return {
                name: cat,
                order: row.kategorieReihenfolge || 9999
            };
        })
        .sort((a, b) => a.order - b.order);

    sortedCategories.forEach(catObj => {
        const btn = document.createElement("button");
        btn.className = "listBtn";
        btn.textContent = catObj.name;
        btn.onclick = () => openCategory(catObj.name);
        appEl.appendChild(btn);
    });
}

// ==========================================================
// 4. THEMEN SORTIEREN UND ANZEIGEN
// ==========================================================
function openCategory(cat) {
    currentCategory = cat;

    const topics = data
        .filter(r => r.kategorie === cat)
        .sort((a, b) => a.reihenfolge - b.reihenfolge);

    appEl.innerHTML = `
        <button class="backBtn" onclick="renderCategories()">← Zurück</button>
        <h2>${cat}</h2>
    `;

    topics.forEach(row => {
        const btn = document.createElement("button");
        btn.className = "listBtn";
        if (row.highlight) btn.classList.add("highlight");
        btn.textContent = row.titel;
        btn.onclick = () => openTopic(row);
        appEl.appendChild(btn);
    });
}

// ==========================================================
// 5. SCHRITTE ANZEIGEN
// ==========================================================
function openTopic(row) {
    currentCategory = row.kategorie;
    currentTopic = row.titel;

    appEl.innerHTML = `
        <button class="backBtn" onclick="openCategory('${row.kategorie.replace(/'/g,"\\'")}')">← Zurück</button>
        <h2>${row.kategorie} – ${row.titel}</h2>
    `;

    if (row.inhalt) {
        const intro = document.createElement("div");
        intro.className = "topicIntro";
        intro.textContent = row.inhalt;
        appEl.appendChild(intro);
    }

    row.steps.forEach(step => {
        const id = `${row.kategorie}_${row.titel}_${step.num}`;
        const done = doneState[id] === true;

        const div = document.createElement("div");
        div.className = "step";

        div.innerHTML = `
            <div class="stepRow">
                <input type="checkbox" ${done ? "checked" : ""} onclick="toggleDone('${id}')">
                <span>${step.num}. ${step.text}</span>
            </div>
        `;

        appEl.appendChild(div);
    });
}

// ==========================================================
// 6. DONE-STATE
// ==========================================================
function toggleDone(id) {
    doneState[id] = !doneState[id];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doneState));
}

// ==========================================================
// 7. SUCHE
// ==========================================================
searchInputEl.addEventListener("input", () => {
    const q = searchInputEl.value.toLowerCase().trim();
    if (q.length < 2) {
        searchResultsEl.style.display = "none";
        return;
    }

    const results = data.filter(row =>
        row.titel.toLowerCase().includes(q) ||
        (row.inhalt && row.inhalt.toLowerCase().includes(q)) ||
        row.steps.some(s => s.text.toLowerCase().includes(q))
    );

    searchResultsEl.innerHTML = "";
    searchResultsEl.style.display = "block";

    results.slice(0, 50).forEach(row => {
        const div = document.createElement("div");
        div.className = "searchResult";
        div.textContent = `${row.kategorie} → ${row.titel}`;
        div.onclick = () => {
            searchResultsEl.style.display = "none";
            searchInputEl.value = "";
            openTopic(row);
        };
        searchResultsEl.appendChild(div);
    });
});

// ==========================================================
loadCSV();
