// src/server.ts
import http from 'http';
import { URL } from 'url';
import { promises as fs } from 'fs';
import path from 'path';
import { OUTPUT_DIR, TARGET_URL, numOfPagesToScrape } from './config';
import { runScrapeUIControlled } from './index';
import { info, error } from './utils/logger';

const PORT = 8080;

function htmlPage(opts: {
    targetUrl: string;
    startPage: number;
    pageLimit: number;
    files: string[];
    message?: string;
}) {
    const rows = opts.files
        .map(
            (f) => `<tr><td>${f}</td><td><a href="/download?f=${encodeURIComponent(
                f
            )}">Download</a></td></tr>`
        )
        .join('');

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Healthcare Help Finder - Control Panel</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding: 20px; }
  form { display: grid; gap: 8px; max-width: 900px; grid-template-columns: 1fr 1fr 1fr auto; align-items: end; }
  label { display: flex; flex-direction: column; font-size: 12px; color: #333; }
  input[type="text"], input[type="number"] { padding: 8px; font-size: 14px; }
  button { padding: 10px 14px; font-size: 14px; cursor: pointer; }
  table { border-collapse: collapse; margin-top: 24px; width: 100%; max-width: 900px; }
  th, td { border: 1px solid #ddd; padding: 8px; font-size: 14px; }
  th { background: #f8f8f8; text-align: left; }
  .msg { margin: 12px 0; color: #0a0; }
</style>
</head>
<body>
  <h1>Healthcare Help Finder - Control Panel</h1>
  ${opts.message ? `<div class="msg">${opts.message}</div>` : ''}

  <form method="GET" action="/run">
    <label>Target URL
      <input type="text" name="targetUrl" value="${escapeHtml(opts.targetUrl)}" />
    </label>
    <label>Starting Page
      <input type="number" name="startPage" min="1" value="${opts.startPage}" />
    </label>
    <label>Pages To Scrape (limit)
      <input type="number" name="pageLimit" min="1" value="${opts.pageLimit}" />
    </label>
    <button type="submit">Run Scrape</button>
  </form>

  <h2>Combined Output Files</h2>
  <table>
    <thead><tr><th>File</th><th>Action</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="2">No files yet.</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

async function listCombinedFiles(): Promise<string[]> {
    try {
        const dir = OUTPUT_DIR;
        await fs.mkdir(dir, { recursive: true });
        const files = await fs.readdir(dir);
        // combined file has no trailing -<page>.json (page files end with -N.json)
        return files
            .filter((f) => f.endsWith('.json') && !/-\d+\.json$/.test(f))
            .sort()
            .reverse();
    } catch {
        return [];
    }
}

const server = http.createServer(async (req, res) => {
    try {
        const u = new URL(req.url || '/', `http://${req.headers.host}`);
        if (u.pathname === '/') {
            const files = await listCombinedFiles();
            const html = htmlPage({
                targetUrl: TARGET_URL,
                startPage: 1,
                pageLimit: numOfPagesToScrape,
                files
            });
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(html);
            return;
        }

        if (u.pathname === '/run') {
            const targetUrl = u.searchParams.get('targetUrl') || TARGET_URL;
            const startPage = parseInt(u.searchParams.get('startPage') || '1', 10) || 1;
            const pageLimit =
                parseInt(u.searchParams.get('pageLimit') || String(numOfPagesToScrape), 10) ||
                numOfPagesToScrape;

            info(`UI request: run scrape: startPage=${startPage}, pageLimit=${pageLimit}`);

            await runScrapeUIControlled({ targetUrl, startPage, pageLimit });

            const files = await listCombinedFiles();
            const html = htmlPage({
                targetUrl,
                startPage,
                pageLimit,
                files,
                message: 'Scrape completed.'
            });
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(html);
            return;
        }

        if (u.pathname === '/download') {
            const f = u.searchParams.get('f');
            if (!f) {
                res.writeHead(400, { 'content-type': 'text/plain' });
                res.end('Missing file name');
                return;
            }
            const full = path.join(OUTPUT_DIR, f);
            try {
                const data = await fs.readFile(full);
                res.writeHead(200, {
                    'content-type': 'application/json',
                    'content-disposition': `attachment; filename="${path.basename(full)}"`
                });
                res.end(data);
            } catch (e) {
                res.writeHead(404, { 'content-type': 'text/plain' });
                res.end('File not found');
            }
            return;
        }

        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('Not found');
    } catch (e: any) {
        error(`Server error: ${e?.message}`);
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end('Internal server error');
    }
});

if (require.main === module) {
    server.listen(PORT, () => {
        info(`UI server listening on http://localhost:${PORT}`);
    });
}

export default server;
