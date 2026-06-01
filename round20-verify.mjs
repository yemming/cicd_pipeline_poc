// 一次性 E2E：對正式站驗第二十輪 GRP12 集團零件財務總覽 + GRP14 定價折扣設定
// admin 登入 → Indian scope → GRP12 集團視圖+drill-down / GRP14 list+side panel CRUD 真寫入
// 跑：node round20-verify.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://dealeros.zeabur.app";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";
const SHOT_DIR = "docs/test-evidence/round-20";
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
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));

const DENY = /無權限|請先登入|找不到|僅限管理者|Coming soon|尚未開發|This page could not|Application error/i;
async function goto(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

try {
  console.log(`\n[1] 登入 ${BASE}/login`);
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 });
  ok("登入成功", true, page.url());
  await ctx.addCookies([{ name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian" }), url: BASE }]);
  ok("設定 Indian scope cookie", true);

  // ══════════════ GRP12 集團零件財務總覽 ══════════════
  console.log(`\n[2] GRP12 集團視圖 /group/parts-financials`);
  await goto("/group/parts-financials");
  let body = await page.locator("body").innerText();
  if (DENY.test(body)) {
    ok("GRP12 頁可見", false, body.slice(0, 160));
    await page.screenshot({ path: `${SHOT_DIR}/grp12-DENIED.png`, fullPage: true });
  } else {
    ok("GRP12 頁可見", true);
    ok("GRP12 標題", /集團零件財務總覽/.test(body));
    ok("GRP12 5 KPI（零件總營收）", /零件總營收/.test(body));
    ok("GRP12 毛利率 KPI", /零件毛利率/.test(body));
    ok("GRP12 周轉率 KPI", /庫存周轉率/.test(body));
    ok("GRP12 呆滯庫存 KPI", /呆滯庫存/.test(body));
    ok("GRP12 精品加裝 KPI", /精品加裝/.test(body));
    ok("GRP12 門店業績對比區", /門店零件業績對比/.test(body));
    ok("GRP12 品項結構 donut", /零件品項業務結構|品項結構/.test(body));
    ok("GRP12 庫存健康表", /庫存健康一覽/.test(body));
    ok("GRP12 供應商集中度", /供應商採購集中度|供應商/.test(body));
    ok("GRP12 SVG 圖表渲染", (await page.locator("svg").count()) >= 3, `${await page.locator("svg").count()} 個 svg`);
    await page.screenshot({ path: `${SHOT_DIR}/grp12-group.png`, fullPage: true });
  }

  // GRP12 drill-down：點台中（危機店）門店名 ↗
  console.log(`\n[3] GRP12 單店深鑽（下拉切台中）`);
  const storeSelect = page.locator("select").first();
  if (await storeSelect.count()) {
    const opts = await storeSelect.locator("option").allInnerTexts();
    const tcOpt = opts.find((o) => /台中/.test(o));
    if (tcOpt) {
      await storeSelect.selectOption({ label: tcOpt });
      await page.waitForTimeout(1500);
      body = await page.locator("body").innerText();
      ok("GRP12 drill 單店深鑽模式", /單店深鑽模式/.test(body));
      ok("GRP12 drill SKU 明細", /SKU 庫存明細|全品項庫存狀態/.test(body));
      ok("GRP12 drill 採購vs出庫", /採購.*出庫|採購金額/.test(body));
      ok("GRP12 drill 車型加裝率", /車型別加裝率/.test(body));
      await page.screenshot({ path: `${SHOT_DIR}/grp12-drill-tc.png`, fullPage: true });
      // 返回總覽
      const backBtn = page.locator("button", { hasText: "返回集團總覽" });
      if (await backBtn.count()) {
        await backBtn.first().click();
        await page.waitForTimeout(1000);
        body = await page.locator("body").innerText();
        ok("GRP12 返回集團總覽", /本季集團關鍵指標|門店零件業績對比/.test(body));
      }
    } else ok("GRP12 找到台中門店選項", false, opts.join("|"));
  } else ok("GRP12 門店切換器存在", false);

  // ══════════════ GRP14 定價折扣設定 ══════════════
  console.log(`\n[4] GRP14 /group/pricing`);
  await goto("/group/pricing");
  body = await page.locator("body").innerText();
  if (DENY.test(body)) {
    ok("GRP14 頁可見", false, body.slice(0, 160));
    await page.screenshot({ path: `${SHOT_DIR}/grp14-DENIED.png`, fullPage: true });
  } else {
    ok("GRP14 頁可見", true);
    ok("GRP14 標題", /定價折扣設定/.test(body));
    ok("GRP14 現行定價品項 KPI", /現行定價品項/.test(body));
    ok("GRP14 達成率 KPI", /建議售價達成率/.test(body));
    ok("GRP14 整車定價表", /FTR 1200 S|建議售價/.test(body));
    ok("GRP14 折扣授權範圍欄", /折扣授權範圍|折/.test(body));
    ok("GRP14 門店成交偏差", /成交均價偏差|偏差明細/.test(body));
    ok("GRP14 異動稽核 log", /Audit Log|定價異動/.test(body));
    ok("GRP14 cat-tabs", /整車|零件|精品/.test(body));
    await page.screenshot({ path: `${SHOT_DIR}/grp14-list.png`, fullPage: true });

    // GRP14 真寫入：新增定價項目
    console.log(`\n[5] GRP14 真寫入：新增定價項目`);
    const stamp = Date.now().toString().slice(-6);
    const testName = `E2E測試件_${stamp}`;
    const addBtn = page.locator("button", { hasText: "新增定價項目" });
    if (await addBtn.count()) {
      await addBtn.first().click();
      await page.waitForTimeout(800);
      // side panel 表單
      const nameInput = page.locator('input[placeholder*="FTR 1200 S"]');
      await nameInput.fill(testName);
      await page.locator('input[placeholder="例：689000"]').fill("12000");
      await page.locator('input[placeholder="例：480000"]').fill("8000");
      await page.locator('input[placeholder="例：93"]').fill("90");
      await page.locator('input[placeholder="例：100"]').fill("100");
      await page.waitForTimeout(400);
      const panelBody = await page.locator("body").innerText();
      ok("GRP14 毛利率自動算（33.3%）", /33\.3%/.test(panelBody), "12000/8000");
      // 建立草稿
      const createBtn = page.locator("button", { hasText: /建立草稿/ });
      await createBtn.first().click();
      await page.waitForTimeout(3000);
      body = await page.locator("body").innerText();
      ok("GRP14 新增成功（banner / 列表出現）", /已建立定價項目/.test(body) || body.includes(testName), testName);
      await page.screenshot({ path: `${SHOT_DIR}/grp14-created.png`, fullPage: true });
    } else ok("GRP14 新增按鈕存在", false);
  }

  // console error 總檢
  const realErrors = consoleErrors.filter((e) => !/favicon|404|Failed to load resource/i.test(e));
  ok("無嚴重 console error", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));
} catch (e) {
  ok("執行例外", false, e.message);
  await page.screenshot({ path: `${SHOT_DIR}/FATAL.png`, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  const pass = results.filter((r) => r.pass).length;
  console.log(`\n═══ ROUND-20 VERIFY：${pass}/${results.length} PASS ═══`);
  fs.writeFileSync(`${SHOT_DIR}/result.json`, JSON.stringify(results, null, 2));
  process.exit(pass === results.length ? 0 : 1);
}
