// src/server.ts
import http from 'http';
import { URL } from 'url';
import { promises as fs } from 'fs';
import path from 'path';
import { OUTPUT_DIR, TARGET_URL, numOfPagesToScrape } from './config';
import { runScrapeUIControlled } from './index';
import { info, error } from './utils/logger';

const PORT = 8080;
const PUBLIC_DIR = path.join(process.cwd(), 'public');

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

const server = http.createServer(async (req, res) => {
    try {
        const u = new URL(req.url || '/', `http://${req.headers.host}`);

        // -------- API routes --------
        if (u.pathname === '/api/defaults') {
            const defaults = {
                targetUrl: TARGET_URL,
                startPage: startingPageFrom(TARGET_URL),
                pageLimit: numOfPagesToScrape,
            };
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(defaults));
            return;
        }

        if (u.pathname === '/api/files') {
            const files = await listCombinedFiles();
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ files }));
            return;
        }

        if (u.pathname === '/api/run') {
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

        if (u.pathname === '/download') {
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

        // -------- Static files from /public --------
        let filePath = path.join(
            PUBLIC_DIR,
            u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname.replace(/^\/+/, ''))
        );

        // prevent path traversal
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
            // fallback to index.html for unknown routes
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
});

if (require.main === module) {
    server.listen(PORT, () => {
        info(`UI server listening on http://localhost:${PORT}`);
    });
}

export default server;
