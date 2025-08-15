// src/scraper/scraper.ts
import { Page } from "puppeteer";
import { HelpLocation } from "./types";
import { SELECTORS } from "../config";
import { info } from "../utils/logger";
import { sleep } from "../utils/sleep";

type PageBundle = { pageNum: number; data: HelpLocation[] };

/**
 * >>> SET YOUR CAPTURED RESULTS URL HERE <<<
 * You can paste the exact URL from the site for the ZIP/area you want.
 * The scraper will change only the `page` param and the anchor (#).
 */
const TARGET_URL =
  "https://www.healthcare.gov/find-local-help/results?q=ORANGE+PARK%2C+FL+32073&lat=30.17055&lng=-81.7348&city=ORANGE+PARK&state=FL&zip_code=32073&mp=FFM&page=95&coverage=individual&types=agent&types=multistate&name=#95";

/** Build a URL for a specific page number by tweaking only page + hash */
function urlFor(pageNum: number): string {
  const u = new URL(TARGET_URL);
  u.searchParams.set("page", String(pageNum));
  u.hash = `#${pageNum}`;
  return u.toString();
}

/** Try to derive starting page from TARGET_URL; default to 1 */
function startingPage(): number {
  try {
    const u = new URL(TARGET_URL);
    const p = parseInt(u.searchParams.get("page") || "1", 10);
    return Number.isFinite(p) && p > 0 ? p : 1;
  } catch {
    return 1;
  }
}

/** Wait until the results list items are present on the page */
async function waitForResultsList(page: Page) {
  // first, ensure the results container is present (defensive)
  try {
    await page.waitForSelector(SELECTORS.resultsContainer, { timeout: 30000 });
  } catch {
    // continue; some pages render list even if container selector changes
  }
  await page.waitForSelector(SELECTORS.agentListItems, { timeout: 30000 });
}

/** Extract one page of results into HelpLocation[] */
async function extractPage(page: Page): Promise<HelpLocation[]> {
  return page.$$eval(SELECTORS.agentListItems, (items) =>
    items.map((li) => {
      const getText = (el: Element | null) => (el?.textContent || "").trim();

      const name =
        getText(li.querySelector('h3, h2, [data-cy="result-name"]')) || "";

      const addressEl =
        (li.querySelector("address") as Element | null) ||
        (li.querySelector('[itemprop="address"]') as Element | null);

      const addressBlock = (addressEl?.textContent || "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const address = addressBlock[0] || "";

      const cityStateZipLine = addressBlock[1] || "";
      const m =
        cityStateZipLine.match(
          /^(.+?),\s*([A-Z]{2})\s*(\d{5})(?:-\d{4})?$/
        ) || [];
      const city = m[1] || "";
      const state = m[2] || "";
      const zip = m[3] || "";

      const phoneEl = li.querySelector('a[href^="tel:"]') as HTMLElement | null;
      const phone =
        (phoneEl?.textContent || "").trim() ||
        (li.querySelector('[data-cy="phone"]') as HTMLElement | null)?.textContent?.trim() ||
        undefined;

      const websiteEl = li.querySelector('a[href^="http"]') as HTMLAnchorElement | null;
      const website = (websiteEl && (websiteEl.getAttribute("href") || "").trim()) || undefined;

      return { name, address, city, state, zip, phone, website };
    })
  );
}

/** Lightweight signature of the list to detect duplicates across pages */
async function listSignature(page: Page): Promise<string | null> {
  const names: string[] = await page.$$eval(
    SELECTORS.agentListItems,
    (lis) =>
      lis
        .map(
          (li) =>
            (li.querySelector("h3, h2, [data-cy='result-name']")?.textContent || "").trim()
        )
        .filter(Boolean)
  );
  if (!names.length) return null;
  const first = names[0] || "";
  const last = names[names.length - 1] || "";
  return `${first}|${last}|${names.length}`;
}

/**
 * Main entry called by index.ts.
 * `postalCode` is unused in URL-driven mode; kept for signature compatibility.
 */
export async function scrapeAllHelpData(
  page: Page,
  _postalCode: string
): Promise<PageBundle[]> {
  const bundles: PageBundle[] = [];
  let pageNum = startingPage();
  let prevSig: string | null = null;

  while (true) {
    const url = urlFor(pageNum);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    info(`Loaded results page ${pageNum} via TARGET_URL`);
    await sleep(200); // tiny human-ish pause

    try {
      await waitForResultsList(page);
    } catch {
      info(`Results list not found on page ${pageNum}. Stopping.`);
      break;
    }

    const data = await extractPage(page);
    if (!data.length) {
      info(`No items on page ${pageNum}. Stopping.`);
      break;
    }

    const sig = await listSignature(page);
    if (prevSig && sig === prevSig) {
      info(`Page ${pageNum} looks identical to previous. Stopping.`);
      break;
    }

    bundles.push({ pageNum, data });
    prevSig = sig;
    pageNum += 1;
  }

  return bundles;
}
