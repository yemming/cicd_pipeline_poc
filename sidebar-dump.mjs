// 診斷：登入 yemming（admin）後，實際 dump 側欄（ModuleRail + PagesPanel）看得到什麼
import { chromium } from "playwright";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://dealeros.zeabur.app";
const EMAIL = "yemming.yu@gmail.com", PASSWORD = "yemming.yu@gmail.com";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 25000 });
  console.log("登入後:", page.url());

  // 進會計模組頁，讓「會計財務設定」成為 active module
  await page.goto(`${BASE}/admin/accounting/reports/trial-balance`, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(1200);

  // 1) ModuleRail：所有 module icon 的 title/aria-label
  const railItems = await page.evaluate(() => {
    const rail = document.querySelector('nav, aside, [class*="rail"], [class*="Rail"]');
    const out = [];
    document.querySelectorAll('a[href], button[title], [aria-label]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.left < 70 && r.width < 70 && r.height > 10) { // 左側 56px rail 區
        const t = el.getAttribute('title') || el.getAttribute('aria-label') || el.textContent?.trim() || '';
        const href = el.getAttribute('href') || '';
        if (t || href) out.push({ t: t.slice(0, 30), href });
      }
    });
    return out;
  });
  console.log("\n=== ModuleRail（左 56px）項目 ===");
  railItems.forEach((i) => console.log(`  ${i.t}  ${i.href}`));

  // 2) 全頁所有 sidebar 連結（href + text），抓 /admin/accounting 相關
  const allLinks = await page.$$eval('a[href]', (as) =>
    as.map((a) => ({ href: a.getAttribute('href') || '', text: (a.textContent || '').trim().slice(0, 24) }))
      .filter((x) => x.href.startsWith('/')));
  const accLinks = allLinks.filter((l) => l.href.includes('/admin/accounting'));
  console.log("\n=== 側欄出現的 /admin/accounting 連結 ===");
  if (accLinks.length === 0) console.log("  （一個都沒有！會計模組沒出現在側欄）");
  accLinks.forEach((l) => console.log(`  ${l.text}  →  ${l.href}`));

  // 3) 側欄是否出現「會計財務設定 / 財務報表 / 試算表」文字
  const bodyTxt = await page.locator("body").innerText();
  console.log("\n=== 側欄關鍵字命中 ===");
  for (const kw of ["會計財務設定", "財務報表", "試算表", "會計設定", "會計科目表", "會計分錄"]) {
    console.log(`  ${kw}: ${bodyTxt.includes(kw) ? "✓ 有" : "✗ 無"}`);
  }

  await page.screenshot({ path: "sidebar-dump.png", fullPage: false });
  console.log("\n截圖 → sidebar-dump.png");
} catch (e) {
  console.log("[FATAL]", e.message);
} finally {
  await browser.close();
}
