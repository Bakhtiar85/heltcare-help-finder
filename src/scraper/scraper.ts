// src/scraper/scraper.ts
import { Page } from "puppeteer";
import { HelpLocation } from "./types";
import { SELECTORS, TARGET_URL, numOfPagesToScrape } from "../config";
import { info } from "../utils/logger";
import { sleep } from "../utils/sleep";

type PageBundle = { pageNum: number; data: HelpLocation[] };

/**
 * >>> SET YOUR CAPTURED RESULTS URL HERE <<<
 * You can paste the exact URL from the site for the ZIP/area you want.
 * The scraper will change only the `page` param and the anchor (#).
 */

type ScrapeOpts = {
  targetUrl?: string;
  startPage?: number;
  pageLimit?: number;
};

/** Build a URL for a specific page number by tweaking only page + hash */
function urlFor(pageNum: number, baseUrl: string): string {
  const u = new URL(baseUrl);
  u.searchParams.set("page", String(pageNum));
  u.hash = `#${pageNum}`;
  return u.toString();
}

/** Try to derive starting page from URL; default to 1 */
function startingPageFrom(urlStr: string): number {
  try {
    const u = new URL(urlStr);
    const p = parseInt(u.searchParams.get("page") || "1", 10);
    return Number.isFinite(p) && p > 0 ? p : 1;
  } catch {
    return 1;
  }
}

/** Wait until the results list items are present on the page */
async function waitForResultsList(page: Page) {
  try {
    await page.waitForSelector(SELECTORS.resultsContainer, { timeout: 30000 });
  } catch { }
  await page.waitForSelector(SELECTORS.agentListItems, { timeout: 30000 });
}

/** Extract one page of results into HelpLocation[] */
async function extractPage(page: Page): Promise<HelpLocation[]> {
  return page.$$eval(SELECTORS.agentListItems, (items) => {
    const norm = (s: string) => s.replace(/\s+/g, " ").trim();
    const visibleText = (el: Element | null): string => {
      if (!el) return "";
      const clone = el.cloneNode(true) as Element;
      clone.querySelectorAll(".ds-u-visibility--screen-reader").forEach((n) => n.remove());
      return norm(clone.textContent || "");
    };

    const findLabeledValue = (li: Element, labelRe: RegExp): string | undefined => {
      const span = Array.from(li.querySelectorAll("span")).find((s) =>
        labelRe.test((s.textContent || "").trim())
      );
      if (!span) return undefined;
      const row = (span.closest(".ds-l-row") as Element | null) || span.parentElement?.parentElement;
      if (!row) return undefined;
      const kids = Array.from(row.children) as Element[];
      const valEl = kids.find((c) => !c.className.includes("ds-u-font-weight--bold")) || kids[1] || row;
      return visibleText(valEl);
    };

    return (items as Element[])
      .map((li) => {
        const name = visibleText(li.querySelector('h3, h2, [data-cy="result-name"]'));
        if (!name) return null;

        const addressEl =
          (li.querySelector("address") as Element | null) ||
          (li.querySelector('[itemprop="address"]') as Element | null);

        const addressLines = (addressEl?.textContent || "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);

        const address = addressLines[0] || "";
        const cityStateZipLine = addressLines[1] || "";
        const m =
          cityStateZipLine.match(/^(.+?),\s*([A-Z]{2})\s*(\d{5})(?:-\d{4})?$/) || [];
        const city = m[1] || "";
        const state = m[2] || "";
        const zip = m[3] || "";

        const phone = visibleText(li.querySelector('a[href^="tel:"]')) || undefined;

        const websiteEl = li.querySelector('a[href^="http"]') as HTMLAnchorElement | null;
        const website = (websiteEl?.getAttribute("href") || "").trim() || undefined;

        const yearsText = visibleText(li.querySelector(".ds-u-font-size--md"));
        const yearsMatch = yearsText.match(/(\d+)\s+year/i);
        const yearsOfService = yearsMatch ? parseInt(yearsMatch[1], 10) : undefined;

        const roles = Array.from(li.querySelectorAll(".ds-c-badge.flh-c-badge"))
          .map((b) => visibleText(b))
          .filter(Boolean);

        const emailEl = li.querySelector('a[href^="mailto:"]') as HTMLAnchorElement | null;
        const email =
          (emailEl?.getAttribute("title") || emailEl?.textContent || "").trim() || undefined;

        const languagesStr = findLabeledValue(li, /^\s*Languages spoken\s*$/i);
        const languages =
          languagesStr?.split(/,|\n/).map((s) => s.trim()).filter(Boolean) || undefined;

        const licensedStr = findLabeledValue(li, /^\s*Licensed in\s*$/i);
        const licensedIn =
          licensedStr?.split(",").map((s) => s.trim()).filter(Boolean) || undefined;

        const hours: Record<string, string> = {};
        const dayAbbr = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const hourRows = Array.from(li.querySelectorAll(".ds-l-row.ds-u-margin-bottom--1"));
        for (const row of hourRows) {
          const day = visibleText(
            row.querySelector('.ds-l-col--2.ds-u-font-weight--bold [aria-hidden="true"]')
          );
          if (!dayAbbr.includes(day)) continue;
          const valEl = row.querySelector(":scope > div:not(.ds-l-col--2)") as Element | null;
          const time = visibleText(valEl || row);
          if (time) hours[day] = time;
        }

        return {
          name,
          address,
          city,
          state,
          zip,
          phone,
          website,
          yearsOfService,
          roles: roles.length ? roles : undefined,
          email,
          languages,
          licensedIn,
          hours: Object.keys(hours).length ? (hours as any) : undefined,
        };
      })
      .filter(Boolean) as any;
  });
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
 * `_postalCode` is unused in URL-driven mode; kept for signature compatibility.
 * Optional `onPage` lets the caller persist each page immediately.
 * Optional `opts` lets the caller override targetUrl/startPage/pageLimit for UI control.
 */
export async function scrapeAllHelpData(
  page: Page,
  _postalCode: string,
  onPage?: (bundle: PageBundle) => Promise<void> | void,
  opts: ScrapeOpts = {}
): Promise<PageBundle[]> {
  const baseUrl = opts.targetUrl || TARGET_URL;
  const limit = typeof opts.pageLimit === "number" ? opts.pageLimit : numOfPagesToScrape;
  let pageNum = typeof opts.startPage === "number" ? opts.startPage : startingPageFrom(baseUrl);

  const bundles: PageBundle[] = [];
  let pageCount = 0;
  let prevSig: string | null = null;

  while (true && pageCount <= limit) {
    const url = urlFor(pageNum, baseUrl);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    info(`Loaded results page ${pageNum} via TARGET_URL`);
    await sleep(200);

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

    const bundle = { pageNum, data };
    if (onPage) await onPage(bundle);

    bundles.push(bundle);
    prevSig = sig;
    pageNum += 1;
    pageCount += 1;
  }

  return bundles;
}
