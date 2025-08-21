// src/server.ts
import http from 'http';
import { URL } from 'url';
import { promises as fs } from 'fs';
import path from 'path';
import { OUTPUT_DIR, TARGET_URL, numOfPagesToScrape } from './config';
import { runScrapeUIControlled } from './index';
import { info, error } from './utils/logger';
import nodemailer from 'nodemailer';

const PORT = 8080;
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const TEMPLATE_PATH = path.join(OUTPUT_DIR, 'email_template.json');
let SMTP_HOST = 'smtp.gmail.com';
let SMTP_PORT = '587';
let SMTP_USER = 'attockofficeworkonly@gmail.com';
let SMTP_PASS = 'qaym tedc odwb gsdk';
let SMTP_FROM = "Your Name <no-reply@gmail.com>";

function contentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.html': return 'text/html; charset=utf-8';
        case '.css': return 'text/css; charset=utf-8';
        case '.js': return 'application/javascript; charset=utf-8';
        case '.svg': return 'image/svg+xml';
        case '.png': return 'image/png';
        case '.ico': return 'image/x-icon';
        case '.json': return 'application/json; charset=utf-8';
        default: return 'text/plain; charset=utf-8';
    }
}

async function ensureDir(dir: string) {
    await fs.mkdir(dir, { recursive: true });
}

async function listCombinedFiles(): Promise<string[]> {
    try {
        await ensureDir(OUTPUT_DIR);
        const files = await fs.readdir(OUTPUT_DIR);
        return files
            .filter((f) => f.endsWith('.json') && !/-\d+\.json$/.test(f))
            .sort()
            .reverse();
    } catch {
        return [];
    }
}

function startingPageFrom(urlStr: string): number {
    try {
        const u = new URL(urlStr);
        const p = parseInt(u.searchParams.get('page') || '1', 10);
        return Number.isFinite(p) && p > 0 ? p : 1;
    } catch {
        return 1;
    }
}

function readJsonBody<T = any>(req: http.IncomingMessage): Promise<T> {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (c) => (data += c));
        req.on('end', () => {
            try {
                resolve(data ? JSON.parse(data) : {});
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
}

function transporterOrNull() {
    const host = SMTP_HOST;
    const port = SMTP_PORT ? parseInt(SMTP_PORT, 10) : undefined;
    const user = SMTP_USER;
    const pass = SMTP_PASS;
    if (!host || !port || !user || !pass) return null;

    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
    });
}

async function readTemplate() {
    try {
        await ensureDir(OUTPUT_DIR);
        const raw = await fs.readFile(TEMPLATE_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return { subject: '', message: '', updatedAt: null as null | string };
    }
}
async function writeTemplate(subject: string, message: string) {
    await ensureDir(OUTPUT_DIR);
    const payload = { subject, message, updatedAt: new Date().toISOString() };
    await fs.writeFile(TEMPLATE_PATH, JSON.stringify(payload, null, 2), 'utf-8');
    return payload;
}

const server = http.createServer(async (req, res) => {
    try {
        const u = new URL(req.url || '/', `http://${req.headers.host}`);

        // ---------- API: defaults ----------
        if (req.method === 'GET' && u.pathname === '/api/defaults') {
            const defaults = {
                targetUrl: TARGET_URL,
                startPage: startingPageFrom(TARGET_URL),
                pageLimit: numOfPagesToScrape,
            };
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(defaults));
            return;
        }

        // ---------- API: run scraper ----------
        if (req.method === 'GET' && u.pathname === '/api/run') {
            const targetUrl = u.searchParams.get('targetUrl') || TARGET_URL;
            const startPage = parseInt(u.searchParams.get('startPage') || '1', 10) || 1;
            const pageLimit =
                parseInt(u.searchParams.get('pageLimit') || String(numOfPagesToScrape), 10) ||
                numOfPagesToScrape;

            info(`UI run: startPage=${startPage}, pageLimit=${pageLimit}`);
            const result = await runScrapeUIControlled({ targetUrl, startPage, pageLimit });
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, ...result }));
            return;
        }

        // ---------- API: list files ----------
        if (req.method === 'GET' && u.pathname === '/api/files') {
            const files = await listCombinedFiles();
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ files }));
            return;
        }

        // ---------- API: download a combined file ----------
        if (req.method === 'GET' && u.pathname === '/download') {
            const f = u.searchParams.get('f');
            if (!f) {
                res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
                res.end('Missing file name');
                return;
            }
            const full = path.join(OUTPUT_DIR, f);
            try {
                const data = await fs.readFile(full);
                res.writeHead(200, {
                    'content-type': 'application/json; charset=utf-8',
                    'content-disposition': `attachment; filename="${path.basename(full)}"`,
                });
                res.end(data);
            } catch {
                res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
                res.end('File not found');
            }
            return;
        }

        // ---------- API: template (save/load composed subject/message) ----------
        if (u.pathname === '/api/template') {
            if (req.method === 'GET') {
                const t = await readTemplate();
                res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true, ...t }));
                return;
            }
            if (req.method === 'POST') {
                try {
                    const body = await readJsonBody<{ subject: string; message: string }>(req);
                    const saved = await writeTemplate(body.subject || '', body.message || '');
                    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ ok: true, ...saved }));
                } catch (e: any) {
                    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ ok: false, error: e?.message || 'template save failed' }));
                }
                return;
            }
        }

        // --- POST /api/send ---
        if (req.method === 'POST' && u.pathname === '/api/send') {
            try {
                const body = await readJsonBody<{
                    subject: string;
                    message: string;
                    recipients: Array<{ name?: string; email?: string }>;
                    latestSelectedFileName?: string;
                }>(req);

                const subject = (body.subject || '').trim();
                const message = (body.message || '').trim();
                const recipients = Array.isArray(body.recipients) ? body.recipients : [];

                if (!subject || !message || recipients.length === 0) {
                    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ ok: false, error: 'Missing subject/message/recipients' }));
                    return;
                }

                // save current template
                await writeTemplate(subject, message);

                const tx = transporterOrNull();
                if (!tx) {
                    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ ok: false, error: 'SMTP not configured' }));
                    return;
                }

                const personalize = (tpl: string, name?: string) =>
                    tpl.replace(/\[\s*USERNAME\s*\]/gi, name ?? '');

                const from = SMTP_FROM || SMTP_USER!;
                const results: Array<{ email: string; ok: boolean; error?: string }> = [];

                console.log('from:', from);
                console.log('Sending emails to:', recipients.map(r => r.email).join(', '));

                for (const r of recipients) {
                    const to = (r.email || '').trim();
                    if (!to) {
                        results.push({ email: '', ok: false, error: 'Missing recipient email' });
                        continue;
                    }
                    try {
                        await tx.sendMail({
                            from,
                            to,
                            subject,
                            text: personalize(message, r.name || ''),
                        });
                        results.push({ email: to, ok: true });
                    } catch (e: any) {
                        results.push({ email: to, ok: false, error: e?.message || 'send failed' });
                    }
                }

                // NEW: persist status back to the selected file as requested
                await persistEmailStatusToFile(body.latestSelectedFileName || '', results);

                console.log('Email sending results:', results);

                res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true, results }));
            } catch (e: any) {
                res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: false, error: e?.message || 'internal error' }));
            }
            return;
        }

        // ---------- API: update a server-side JSON file (if it exists in OUTPUT_DIR) ----------
        if (req.method === 'POST' && u.pathname === '/api/update-file') {
            try {
                const body = await readJsonBody<{ filename: string; data: any }>(req);
                const filename = (body.filename || '').trim();
                if (!filename) {
                    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ ok: false, error: 'Missing filename' }));
                    return;
                }
                const full = path.join(OUTPUT_DIR, filename);
                if (!full.startsWith(path.resolve(OUTPUT_DIR))) {
                    res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ ok: false, error: 'Forbidden' }));
                    return;
                }
                try {
                    await fs.stat(full);
                } catch {
                    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ ok: false, error: 'File not found on server' }));
                    return;
                }
                await fs.writeFile(full, JSON.stringify(body.data ?? [], null, 2), 'utf-8');
                res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true }));
            } catch (e: any) {
                res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: false, error: e?.message || 'internal error' }));
            }
            return;
        }

        // ---------- Static: /public ----------
        let filePath = path.join(
            PUBLIC_DIR,
            u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname.replace(/^\/+/, ''))
        );

        if (!filePath.startsWith(PUBLIC_DIR)) {
            res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('Forbidden');
            return;
        }

        try {
            const stat = await fs.stat(filePath);
            if (stat.isDirectory()) {
                filePath = path.join(filePath, 'index.html');
            }
            const data = await fs.readFile(filePath);
            res.writeHead(200, { 'content-type': contentType(filePath) });
            res.end(data);
            return;
        } catch {
            try {
                const fallback = path.join(PUBLIC_DIR, 'index.html');
                const data = await fs.readFile(fallback);
                res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
                res.end(data);
                return;
            } catch {
                res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
                res.end('Not found');
                return;
            }
        }
    } catch (e: any) {
        error(`Server error: ${e?.message}`);
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Internal server error');
    }

    // helper inside src/server.ts
    async function persistEmailStatusToFile(
        filename: string,
        results: Array<{ email: string; ok: boolean }>
    ) {
        if (!filename) return;
        const safe = path.basename(filename); // prevent traversal
        const full = path.join(OUTPUT_DIR, safe);

        try {
            const raw = await fs.readFile(full, 'utf-8');
            const data = JSON.parse(raw);
            if (!Array.isArray(data)) return;

            const byEmail = new Map(results.map(r => [r.email.trim().toLowerCase(), r.ok]));
            const now = new Date().toISOString();

            const updated = data.map((row: any) => {
                const em = (row?.email || '').trim().toLowerCase();
                if (em && byEmail.has(em)) {
                    return {
                        ...row,
                        emailSent: byEmail.get(em),
                        emailTimeStamp: now,
                    };
                }
                return row;
            });

            await fs.writeFile(full, JSON.stringify(updated, null, 2), 'utf-8');
        } catch (err) {
            console.error('Failed to update file with email status:', err);
        }
    }
});

if (require.main === module) {
    server.listen(PORT, () => {
        info(`UI server listening on http://localhost:${PORT}`);
    });
}

export default server;
