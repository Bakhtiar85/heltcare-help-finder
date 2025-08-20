// public/assets/script.js
const statusEl = document.getElementById('status');
const latestEl = document.getElementById('latest');
const runBtn = document.getElementById('runBtn');
const form = document.getElementById('scrape-form');
const targetUrlEl = document.getElementById('targetUrl');
const startPageEl = document.getElementById('startPage');
const pageLimitEl = document.getElementById('pageLimit');

// local JSON loader
const fileInput = document.getElementById('fileInput');
const loadBtn = document.getElementById('loadBtn');
const saveEmailTempBtn = document.getElementById('saveEmailTempBtn');

// compose modal
const composeBtn = document.getElementById('composeBtn');
const modal = document.getElementById('composeModal');
const emailSubjectEl = document.getElementById('emailSubject');
const emailBodyEl = document.getElementById('emailBody');
const sendAllBtn = document.getElementById('sendAllBtn');
const sendOneBtn = document.getElementById('sendOneBtn');
const cancelComposeBtn = document.getElementById('cancelComposeBtn');
const modalNote = document.getElementById('modalNote');

const tbody = document.getElementById('data-body');

let currentData = [];
let currentFilename = '';
let targetedIndex = null;

function setStatus(msg, ok = true) {
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('error', !ok);
}
function basename(p) { return (p || '').split(/[\\/]/).pop(); }
function setLatest(filename) {
    latestEl.innerHTML = filename ? `Last loaded file: <code>${filename}</code>` : '';
}

async function fetchDefaults() {
    try {
        const r = await fetch('/api/defaults');
        if (!r.ok) return;
        const j = await r.json();
        targetUrlEl.value = j.targetUrl || '';
        startPageEl.value = j.startPage || 1;
        pageLimitEl.value = j.pageLimit || 1;
    } catch { /* ignore */ }
}

async function fetchTemplate() {
    try {
        const r = await fetch('/api/template');
        if (!r.ok) return;
        const j = await r.json();
        if (j && j.ok) {
            if (typeof j.subject === 'string') emailSubjectEl.value = j.subject;
            if (typeof j.message === 'string') emailBodyEl.value = j.message;
        }
    } catch { /* ignore */ }
}
async function saveTemplate(subject, message) {
    try {
        await fetch('/api/template', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ subject, message }),
        });
    } catch { /* ignore */ }
}

function openModal(forIndex = null) {
    targetedIndex = forIndex;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    // preload last saved template or default placeholder
    fetchTemplate().then(() => {
        if (!emailBodyEl.value) {
            emailBodyEl.value = 'Hi, [ USERNAME ],\n\n<!== email content ==>\n\ngreetings\nname';
        }
    });
    modalNote.textContent = forIndex === null
        ? 'Send To All will only send to rows that have a valid email.'
        : `This will send only to: ${currentData[forIndex]?.name || ''} (${currentData[forIndex]?.email || 'no email'})`;
    sendOneBtn.disabled = forIndex === null;
}
function closeModal() {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
}

function renderRows(items) {
    currentData = Array.isArray(items) ? items.slice() : [];
    tbody.innerHTML = '';
    if (!Array.isArray(items) || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="muted">No data.</td></tr>';
        return;
    }
    items.forEach((it, idx) => {
        const tr = document.createElement('tr');
        const tdName = document.createElement('td');
        const tdPhone = document.createElement('td');
        const tdEmail = document.createElement('td');
        const tdLang = document.createElement('td');
        const tdSend = document.createElement('td');

        tdName.textContent = it?.name || '-';
        tdPhone.textContent = it?.phone || '-';
        tdEmail.textContent = it?.email || '-';

        let langs = '-';
        if (Array.isArray(it?.languages) && it.languages.length) langs = it.languages.join(', ');
        else if (typeof it?.languages === 'string' && it.languages) langs = it.languages;
        tdLang.textContent = langs;

        const btn = document.createElement('button');
        btn.textContent = 'Send';
        btn.type = 'button';
        btn.addEventListener('click', () => openModal(idx));
        tdSend.appendChild(btn);

        tr.appendChild(tdName);
        tr.appendChild(tdPhone);
        tr.appendChild(tdEmail);
        tr.appendChild(tdLang);
        tr.appendChild(tdSend);
        tbody.appendChild(tr);
    });
}

async function saveUpdatedFileOrDownload() {
    try {
        const r = await fetch('/api/update-file', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ filename: currentFilename, data: currentData }),
        });
        if (r.ok) return true;
    } catch { /* ignore */ }

    try {
        const blob = new Blob([JSON.stringify(currentData, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const name = currentFilename ? currentFilename.replace(/\.json$/i, '.updated.json') : 'updated.json';
        a.download = name;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(a.href);
        a.remove();
        setStatus(`Saved updated data as "${name}" (downloaded).`);
        return false;
    } catch {
        setStatus('Failed to save updated file.', false);
        return false;
    }
}

function personalize(tpl, name) {
    return String(tpl || '').replace(/\[\s*USERNAME\s*\]/gi, name || '');
}

async function sendTo(recipients) {
    const subject = (emailSubjectEl.value || '').trim();
    const message = (emailBodyEl.value || '').trim();
    if (!subject || !message) {
        setStatus('Subject and message are required.', false);
        return;
    }
    if (!recipients.length) {
        setStatus('No recipients with valid email.', false);
        return;
    }

    setStatus('Sending emails…');

    // save composed template
    await saveTemplate(subject, message);

    try {
        const r = await fetch('/api/send', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ subject, message, recipients }),
        });
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j?.error || 'send failed');

        const now = new Date().toISOString();
        const personalizedMap = new Map(
            recipients.map((rcp) => [String(rcp.email || ''), personalize(message, rcp.name)])
        );
        const resultMap = new Map(j.results.map((x) => [x.email, x.ok]));

        currentData = currentData.map((row) => {
            const em = (row?.email || '').trim();
            if (em && resultMap.has(em)) {
                return {
                    ...row,
                    emailSent: resultMap.get(em) === true,
                    emailSentAt: now,
                    emailSubject: subject,
                    emailMessage: personalizedMap.get(em) || message,
                };
            }
            return row;
        });

        renderRows(currentData);
        const savedToServer = await saveUpdatedFileOrDownload();
        setStatus(savedToServer ? 'Emails sent and file updated on server.' : 'Emails sent; updated file downloaded.');
    } catch (e) {
        setStatus('Failed to send emails. Check SMTP settings.', false);
    } finally {
        closeModal();
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
        currentFilename = basename(file.name);
        renderRows(data);
        setLatest(currentFilename);
        setStatus(`Loaded ${Array.isArray(data) ? data.length : 0} record(s) from "${file.name}".`);
    } catch (err) {
        console.error(err);
        setStatus('Invalid JSON file.', false);
        renderRows([]);
    } finally {
        fileInput.value = '';
    }
});

// ---- Compose modal wiring ----
composeBtn.addEventListener('click', () => {
    if (!currentData.length) { setStatus('Load a JSON file first.', false); return; }
    openModal(null);
});
cancelComposeBtn.addEventListener('click', closeModal);
sendAllBtn.addEventListener('click', () => {
    const recipients = currentData
        .filter((r) => r && r.email && String(r.email).includes('@'))
        .map((r) => ({ name: r.name || '', email: String(r.email) }));
    sendTo(recipients);
});
sendOneBtn.addEventListener('click', () => {
    if (targetedIndex === null) return;
    const row = currentData[targetedIndex];
    if (!row || !row.email || !String(row.email).includes('@')) {
        setStatus('Selected row has no valid email.', false);
        return;
    }
    sendTo([{ name: row.name || '', email: String(row.email) }]);
});

// ---- Save Email Template ----
saveEmailTempBtn.addEventListener('click', async () => {
    if (!currentData.length) { setStatus('Load a JSON file first.', false); return; }
    const subject = emailSubjectEl.value;
    const message = emailBodyEl.value;
    if (!subject || !message) { setStatus('Subject and message are required.', false); return; }
    await saveTemplate(subject, message);
});

// ---- Scraper controls (unchanged) ----
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
})();
