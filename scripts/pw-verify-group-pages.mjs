#!/usr/bin/env node
// 集團模組 18 頁 ground-truth 驗證：實際載入每頁，判斷 真資料 / Stitch假頁 / placeholder / 空 / 錯誤
// 用 scripts/.pw-state.json（yemming admin），scope 強制 indian。產出 tmp/group-verify/*.png + JSON 摘要。
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const STATE = path.join(__dirname, ".pw-state.json");
const OUT = path.join(ROOT, "tmp", "group-verify");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
fs.mkdirSync(OUT, { recursive: true });

// GRP ↔ route 對映（18 頁 + BSC 確認缺）
const PAGES = [
  ["GRP01", "集團總覽", "/group/group-overview"],
  ["GRP02", "BSC計分卡", "/group/bsc"],          // 預期 404/missing
  ["GRP03", "銷售目標Pace", "/group/sales-target"],
  ["GRP04", "集團儀表板", "/group/dashboard"],
  ["GRP05", "季度績效報告", "/group/reports"],
  ["GRP06", "手機版", "/group/dashboard-mobile"],
  ["GRP07", "銷售顧問能效", "/group/sales-efficiency"],
  ["GRP08", "SA能效", "/group/sa-efficiency"],
  ["GRP09", "門店銷售", "/group/store-sales"],
  ["GRP10", "門店售後", "/group/store-service"],
  ["GRP12", "集團零件財務", "/group/parts-financials"],
  ["GRP13", "促銷活動", "/group/promotions"],
  ["GRP14", "定價折扣", "/group/pricing"],
  ["GRP15", "技師效率", "/group/tech-efficiency"],
  ["GRP16", "健康分", "/group/health-score"],
  ["GRP17", "門店四象限", "/group/store-quadrant"],
  ["GRP18", "客戶動態", "/group/customer-dynamics"],
  ["GRP19", "中古車能效", "/group/usedcar-efficiency"],
  ["GRP20", "組織架構", "/group/org-structure"],
];

const STORE_NAMES = ["台北", "台中", "台南", "高雄", "嘉義"];
const PLACEHOLDER = ["敬請期待", "coming soon", "尚未開發", "施工中", "placeholder", "開發中"];

function classify(txt, status, finalUrl, hasStitch, errCount) {
  if (status >= 400 || finalUrl.includes("/login")) return "❌錯誤/需登入";
  if (status === 404 || /找不到|not found|404/i.test(txt.slice(0, 400))) return "➕缺頁(404)";
  if (PLACEHOLDER.some((p) => txt.toLowerCase().includes(p.toLowerCase()))) return "🚧placeholder";
  const stores = STORE_NAMES.filter((s) => txt.includes(s)).length;
  const digits = (txt.match(/\d/g) || []).length;
  const realData = stores >= 2 && digits >= 20;
  if (hasStitch && !realData) return "🟠Stitch假頁";
  if (realData) return "✅真資料";
  if (txt.length < 200) return "⬜空白/極少內容";
  return "🟡有內容待判";
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: STATE, viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([{ name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian", store_id: null }), url: BASE }]);
  const results = [];
  for (const [grp, name, route] of PAGES) {
    const page = await ctx.newPage();
    let errCount = 0;
    page.on("pageerror", () => errCount++);
    page.on("console", (m) => { if (m.type() === "error") errCount++; });
    let status = 0, finalUrl = "", txt = "", hasStitch = false;
    try {
      const resp = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 60000 });
      status = resp?.status() ?? 0;
      await page.waitForTimeout(800);
      finalUrl = page.url();
      txt = await page.evaluate(() => document.body?.innerText || "");
      // Stitch inline 容器偵測（dangerouslySetInnerHTML 注入的設計稿）
      hasStitch = await page.evaluate(() =>
        !!document.querySelector("[data-stitch], .stitch-inline, #stitch-root") ||
        /loadStitchBody|stitch/i.test(document.body?.className || ""));
    } catch (e) {
      finalUrl = page.url(); txt = `EXCEPTION: ${e.message}`;
    }
    const verdict = classify(txt, status, finalUrl, hasStitch, errCount);
    const png = path.join(OUT, `${grp}_${route.split("/").pop()}.png`);
    try { await page.screenshot({ path: png, fullPage: false }); } catch {}
    const stores = STORE_NAMES.filter((s) => txt.includes(s));
    results.push({ grp, name, route, status, verdict, len: txt.length, stores: stores.join("/"), errCount });
    console.error(`[verify] ${grp} ${name} → ${verdict} (status=${status}, len=${txt.length}, stores=${stores.length}, err=${errCount})`);
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "_summary.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
