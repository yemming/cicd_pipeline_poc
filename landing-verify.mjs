// 驗 Landing v3 新版（公開 / 頁，免登入）
// 跑：node landing-verify.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://dealeros.zeabur.app";
const SHOT_DIR = "docs/test-evidence/landing-v3";
fs.mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "  ✓" : "  ✗"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
const page = await ctx.newPage();
const consoleErrors = [];
const asset404 = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));
page.on("response", (r) => { if (r.status() === 404 && /\/landing\//.test(r.url())) asset404.push(r.url()); });

try {
  console.log(`\n[1] 開啟公開 landing ${BASE}/`);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const body = await page.locator("body").innerText();

  ok("HERO 標題（讓系統 / 跟著你走）", /讓系統/.test(body) && /跟著你走/.test(body));
  ok("HERO badge B2B2C", /B2B2C/.test(body));
  ok("影片元素 v0/v1/v2", (await page.locator("#v0, #v1, #v2").count()) === 3);
  ok("影片切換點 .vdot ×3", (await page.locator(".vdot").count()) === 3);
  ok("跑馬燈 ticker", (await page.locator(".ticker-item").count()) > 0);
  ok("PAIN 區（似曾相識）", /似曾相識/.test(body));
  ok("MANIFESTO（DealerOS 懂你）", /DealerOS 懂你/.test(body));
  ok("七維度區", /七個維度/.test(body) && /SEVEN_DIMENSIONS/.test(body));
  ok("集團四層貫通", /四層全貫通/.test(body));
  ok("產品截圖 3 張（hl-card img）", (await page.locator('.hl-card img[src^="/landing/"]').count()) === 3);
  ok("COMPARE 對比表", /傳統 DMS/.test(body));
  ok("TESTIMONIALS 驗證", /真實場景/.test(body));
  ok("DMS 演進時間軸（新區塊）", /DMS_EVOLUTION/.test(body) && /DMS 4\.0/.test(body));
  ok("CTA 區", /真正懂你的系統/.test(body));
  ok("footer 系統登入 → /login", (await page.locator('footer a[href="/login"]').count()) > 0);

  // 影片實際在播（active 影片 currentTime 應 > 0）
  await page.waitForTimeout(3000);
  const playing = await page.evaluate(() => {
    const v = document.querySelector("#v0, #v1, #v2");
    const active = document.querySelector("video.active");
    return { hasActive: !!active, t: active ? active.currentTime : 0 };
  });
  ok("影片輪播播放中（active currentTime>0）", playing.hasActive && playing.t > 0, `t=${playing.t?.toFixed?.(2)}`);

  // 點第二個點切換
  await page.locator(".vdot").nth(1).click().catch(() => {});
  await page.waitForTimeout(1500);
  const switched = await page.evaluate(() => document.querySelectorAll(".vdot")[1]?.classList.contains("active"));
  ok("點 .vdot 可切換影片", !!switched);

  // 資產載入
  ok("public/landing 資產無 404", asset404.length === 0, asset404.slice(0, 3).join(" | "));
  ok("console 無嚴重錯誤", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

  await page.screenshot({ path: `${SHOT_DIR}/landing-01-hero.png` });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT_DIR}/landing-02-full.png`, fullPage: true });
} catch (e) {
  ok("執行例外", false, String(e).slice(0, 200));
} finally {
  const pass = results.filter((r) => r.pass).length;
  console.log(`\n═══ ${pass}/${results.length} 通過 ═══`);
  fs.writeFileSync(`${SHOT_DIR}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
}
