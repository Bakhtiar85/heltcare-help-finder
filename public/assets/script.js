// public/assets/script.js
const statusEl = document.getElementById('status');
const latestEl = document.getElementById('latest');
const runBtn = document.getElementById('runBtn');
const form = document.getElementById('scrape-form');
const targetUrlEl = document.getElementById('targetUrl');
const startPageEl = document.getElementById('startPage');
const pageLimitEl = document.getElementById('pageLimit');

// Local file loading elements
const fileInput = document.getElementById('fileInput');
const loadBtn = document.getElementById('loadBtn');

const tbody = document.getElementById('data-body');

function setStatus(msg, ok = true) {
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('error', !ok);
}

function basename(p) {
    return (p || '').split(/[\\/]/).pop();
}

function setLatest(filename) {
    latestEl.innerHTML = filename ? `Last loaded file: <code>${filename}</code>` : '';
}

function renderRows(items) {
    tbody.innerHTML = '';
    if (!Array.isArray(items) || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="muted">No data.</td></tr>';
        return;
    }
    for (const it of items) {
        const tr = document.createElement('tr');
        const tdName = document.createElement('td');
        const tdPhone = document.createElement('td');
        const tdEmail = document.createElement('td');
        const tdLang = document.createElement('td');

        tdName.textContent = it?.name || '-';
        tdPhone.textContent = it?.phone || '-';
        tdEmail.textContent = it?.email || '-';

        let langs = '-';
        if (Array.isArray(it?.languages) && it.languages.length) {
            langs = it.languages.join(', ');
        } else if (typeof it?.languages === 'string' && it.languages) {
            langs = it.languages;
        }
        tdLang.textContent = langs;

        tr.appendChild(tdName);
        tr.appendChild(tdPhone);
        tr.appendChild(tdEmail);
        tr.appendChild(tdLang);
        tbody.appendChild(tr);
    }
}

// ---- Local file loader ----
loadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        renderRows(data);
        setLatest(basename(file.name));
        setStatus(`Loaded ${Array.isArray(data) ? data.length : 0} record(s) from "${file.name}".`);
    } catch (err) {
        console.error(err);
        setStatus('Invalid JSON file.', false);
        renderRows([]);
    } finally {
        // allow selecting the same file again later
        fileInput.value = '';
    }
});

// ---- Scraper controls (unchanged) ----
async function fetchDefaults() {
    try {
        const r = await fetch('/api/defaults');
        if (!r.ok) return;
        const j = await r.json();
        targetUrlEl.value = j.targetUrl || '';
        startPageEl.value = j.startPage || 1;
        pageLimitEl.value = j.pageLimit || 1;
    } catch {
        /* ignore */
    }
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('');
    runBtn.disabled = true;
    runBtn.textContent = 'Running…';
    try {
        const params = new URLSearchParams({
            targetUrl: targetUrlEl.value,
            startPage: String(startPageEl.value || 1),
            pageLimit: String(pageLimitEl.value || 1),
        });
        const r = await fetch('/api/run?' + params.toString());
        if (!r.ok) throw new Error('Request failed');
        const j = await r.json();

        const latest = basename(j.output);
        setLatest(latest);
        setStatus(`Completed: ${j.total} records across ${j.pages} page(s).`);
    } catch {
        setStatus('Error running scrape.', false);
    } finally {
        runBtn.disabled = false;
        runBtn.textContent = 'Run Scrape';
    }
});

(async function init() {
    await fetchDefaults();
    // Table shows a prompt until a file is loaded; nothing else needed here.
})();
