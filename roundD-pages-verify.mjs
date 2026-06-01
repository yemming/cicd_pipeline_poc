// Round D 新頁冒煙：車型攤提設定（CRUD）+ 補列審核（申請→簽核 round-trip）。打 localhost:3000。
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";
const SHOT_DIR = "docs/test-evidence/round-D";
fs.mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
const ok = (n, p, d = "") => {
  results.push({ n, p, d });
  console.log(`${p ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`);
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
page.on("dialog", (d) => d.accept().catch(() => {}));
const DENY = /無權限|請先登入|僅限管理者|Application error|could not be found/i;

async function login() {
  for (let i = 1; i <= 3; i++) {
    try {
      await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.locator('input[type="email"]').fill(EMAIL);
      await page.locator('input[type="password"]').fill(PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 });
      return;
    } catch (e) {
      if (i === 3) throw e;
      await page.waitForTimeout(1500);
    }
  }
}
const goto = async (p) => {
  await page.goto(`${BASE}${p}`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1200);
};

try {
  await login();
  await ctx.addCookies([{ name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian" }), url: BASE }]);
  ok("登入 + scope", true);

  // ── 車型攤提設定 ──
  await goto("/vehicle-import/model-amortization");
  let body = await page.locator("body").innerText();
  ok("攤提設定頁可見", !DENY.test(body) && /車型攤提設定/.test(body), DENY.test(body) ? body.slice(0, 100) : "");
  // 新增規則
  await page.getByRole("button", { name: /新增攤提規則/ }).first().click();
  await page.waitForTimeout(500);
  const modelSel = page.locator(".inset-0 select").first();
  const optCount = await modelSel.locator("option").count();
  if (optCount > 1) {
    await modelSel.selectOption({ index: 1 });
    const weightInput = page.locator(".inset-0 input").first();
    await weightInput.fill("1.5");
    await page.locator(".inset-0").getByRole("button", { name: /^建立$/ }).first().click();
    await page.waitForTimeout(2500);
    body = await page.locator("body").innerText();
    ok("攤提規則建立成功", /✓ 已建立|1\.5/.test(body));
    await page.screenshot({ path: `${SHOT_DIR}/model-amort.png`, fullPage: true });
  } else ok("攤提 modal 有車型選項", false);

  // ── 補列審核：申請 → 簽核 ──
  await goto("/vehicle-import/cost-additions");
  body = await page.locator("body").innerText();
  ok("補列審核頁可見", !DENY.test(body) && /補列審核/.test(body), DENY.test(body) ? body.slice(0, 100) : "");

  await page.getByRole("button", { name: /申請補列/ }).first().click();
  await page.waitForTimeout(500);
  // modal：批次(select first) / 費用類型(select) / 金額(第一個 input)
  const shipSel = page.locator(".inset-0 select").first();
  const shipOpts = await shipSel.locator("option").count();
  if (shipOpts > 1) {
    await shipSel.selectOption({ index: 1 });
    await page.getByPlaceholder("NT$").fill("5000");
    await page.locator(".inset-0").getByRole("button", { name: /送出申請/ }).first().click();
    await page.waitForTimeout(2500);
    body = await page.locator("body").innerText();
    const created = /待簽核/.test(body);
    ok("補列申請（pending）成功", created);
    await page.screenshot({ path: `${SHOT_DIR}/cost-addition-pending.png`, fullPage: true });

    if (created) {
      // 簽核：核准第一筆 pending
      const approveBtn = page.getByRole("button", { name: /^核准$/ }).first();
      if (await approveBtn.count()) {
        await approveBtn.click();
        await page.waitForTimeout(2500);
        body = await page.locator("body").innerText();
        ok("補列簽核（核准）成功", /已核准/.test(body));
        await page.screenshot({ path: `${SHOT_DIR}/cost-addition-approved.png`, fullPage: true });
      } else ok("補列核准按鈕存在", false);
    }
  } else ok("補列 modal 有批次選項", false);

  ok("無 pageerror", errs.length === 0, errs.slice(0, 2).join(" | "));
} catch (e) {
  ok("執行例外", false, String(e).slice(0, 200));
} finally {
  await browser.close();
}

const pass = results.filter((r) => r.p).length;
console.log(`\n═══ Round D pages：${pass}/${results.length} 通過 ═══`);
fs.writeFileSync(`${SHOT_DIR}/pages-result.json`, JSON.stringify({ pass, total: results.length, results }, null, 2));
process.exit(pass === results.length ? 0 : 1);
