// src/utils/humanType.ts
import { Page } from 'puppeteer';

type HumanTypeOpts = {
  minDelayMs?: number;
  maxDelayMs?: number;
  clearFirst?: boolean;
};

export async function humanType(
  page: Page,
  selector: string,
  text: string,
  opts: HumanTypeOpts = {}
) {
  const { minDelayMs = 40, maxDelayMs = 110, clearFirst = true } = opts;

  await page.waitForSelector(selector, { visible: true });
  const el = await page.$(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);

  await el.click({ clickCount: clearFirst ? 3 : 1 });

  for (const ch of text) {
    const delay =
      minDelayMs + Math.floor(Math.random() * Math.max(1, maxDelayMs - minDelayMs));
    await page.type(selector, ch, { delay });
    if (Math.random() < 0.07) {
      await new Promise((r) => setTimeout(r, 80 + Math.floor(Math.random() * 120)));
    }
  }
}
