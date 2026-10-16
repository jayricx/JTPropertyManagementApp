import { chromium } from "playwright";

const BASE = "https://jtpropertymanagement.vercel.app";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const out = [];
try {
  const res = await page.goto(`${BASE}/login`, { waitUntil: "load", timeout: 60000 });
  out.push(`GET /login -> ${res?.status()}`);
  await page.waitForSelector('button[type="submit"]', { timeout: 45000 });
  await page.waitForTimeout(1500);
  await page.fill('input[type="email"]', "logo-demo@example.com");
  await page.fill('input[type="password"]', "LogoDemo123!");
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 45000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  out.push(`after login -> ${page.url().replace(BASE, "")}`);

  if (/\/dashboard/.test(page.url())) {
    await page.goto(`${BASE}/settings`, { waitUntil: "load" });
    await page.waitForTimeout(2000);
    const hasCard = (await page.locator("text=Email delivery").count()) > 0;
    out.push(`email card deployed: ${hasCard}`);
    if (hasCard) {
      const text = await page.evaluate(() => document.body.innerText);
      out.push("--- settings text ---");
      out.push(
        text
          .split("\n")
          .filter((l) => /Sending as|Links point to|resend|RESEND|EMAIL_FROM|localhost|vercel\.app/.test(l))
          .join("\n"),
      );
    }
  }
} catch (err) {
  out.push(`ERROR: ${String(err).split("\n")[0].slice(0, 160)}`);
} finally {
  console.log(out.join("\n"));
  await browser.close();
}