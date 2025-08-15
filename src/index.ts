import puppeteer from 'puppeteer';
import path from 'path';
import { scrapeAllHelpData } from './scraper/scraper';
import { OUTPUT_DIR, TARGET_URL } from './config';
import { writeJSON } from './utils/fileUtils';
import { info, error } from './utils/logger';

function mmddyy(d = new Date()) {
  const mm = (d.getMonth() + 1).toString();
  const dd = d.getDate().toString();
  const yy = d.getFullYear().toString().slice(-2);
  return `${mm}-${dd}-${yy}`;
}

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1366, height: 900 }
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    const POSTAL_CODE = new URL(TARGET_URL).searchParams.get("zip_code") || 'no-zip';

    info(`Navigating to ${POSTAL_CODE} search...`);
    const allPages = await scrapeAllHelpData(page, POSTAL_CODE);

    const dateStamp = mmddyy();
    let total = 0;

    for (const { pageNum, data } of allPages) {
      total += data.length;
      const filename = `${dateStamp}-${POSTAL_CODE}-${pageNum}.json`;
      const fullPath = path.join(OUTPUT_DIR, filename);
      await writeJSON(fullPath, data);
      info(`Saved page ${pageNum} (${data.length} records) to ${fullPath}`);
    }

    info(`Done. Collected ${total} records across ${allPages.length} page(s).`);
  } catch (err) {
    error(`Error: ${(err as Error).message}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  error(`Unhandled error: ${(err as Error).message}`);
});
