// 一次性 / 可重跑 E2E：對正式站 https://dealeros.zeabur.app 驗 P4 損益表 (Income Statement)
// 用 yemming.yu@gmail.com (admin) 登入 → 打 /admin/accounting/reports/income-statement → 斷言
// 跑：node is-e2e-verify.mjs
// exit code: 0=全綠 / 1=部署了但有斷言失敗 / 2=ground truth 失敗（疑似尚未部署/placeholder）
import { chromium } from "playwright";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://dealeros.zeabur.app";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";
const IS_PATH = "/admin/accounting/reports/income-statement";

// 驗證基準（YTD 2026-01-01~05-31 全法人，已 SQL 交叉驗）
const EXPECT_NET_INCOME = 209000; // 本期淨利
const EXPECT_REVENUE = 1002400; // 營業收入
const EXPECT_GROSS = 209000; // 營業毛利（demo 無費用/稅 → =淨利）

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "  ✓" : "  ✗"} ${name}${detail ? " — " + detail : ""}`);
};

/** 解析金額：括號=負、千分位、可選負號 */
function parseMoney(s) {
  if (!s) return NaN;
  const neg = /\(/.test(s) || /-/.test(s);
  const digits = String(s).replace(/[^\d]/g, "");
  if (!digits) return NaN;
  const n = parseInt(digits, 10);
  return neg ? -n : n;
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
let groundTruthFailed = false;

try {
  // ── 1) 登入 ──────────────────────────────────────────
  console.log(`\n[1] 登入 ${BASE}/login as ${EMAIL}`);
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  try {
    await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 25000 });
    ok("登入成功（離開 /login）", true, page.url());
  } catch {
    ok("登入成功（離開 /login）", false, "仍停在 /login，可能帳密錯或非 admin");
    throw new Error("LOGIN_FAILED");
  }
  const cookies = await ctx.cookies();
  ok("取得 sb- auth cookie", cookies.some((c) => c.name.startsWith("sb-")));

  // ── 2) 打 IS 頁 + ground truth（區分新部署 vs 舊 catch-all placeholder）──
  console.log(`\n[2] 打 ${IS_PATH}`);
  await page.goto(`${BASE}${IS_PATH}`, { waitUntil: "networkidle", timeout: 45000 });
  const bodyTxt = await page.locator("body").innerText();

  if (/無權限|請先登入|找不到|僅限管理者/.test(bodyTxt)) {
    ok("頁面非『無權限/未登入/找不到/僅限管理者』", false, bodyTxt.slice(0, 120));
    await page.screenshot({ path: "is-e2e-denied.png", fullPage: true });
    throw new Error("ACCESS_DENIED_OR_404");
  }
  ok("頁面非『無權限/未登入/找不到/僅限管理者』", true);

  // ground truth：真損益表頁有 H1「損益表」+「本期淨利」；舊 placeholder 不會有
  const h1 = await page.locator("h1", { hasText: "損益表" }).first().isVisible().catch(() => false);
  const hasNetIncome = /本期淨利|本期淨損/.test(bodyTxt);
  ok("H1『損益表』可見", h1);
  ok("頁面含『本期淨利』（非 placeholder）", hasNetIncome);
  if (!h1 || !hasNetIncome) {
    groundTruthFailed = true;
    await page.screenshot({ path: "is-e2e-notready.png", fullPage: true });
    throw new Error("NOT_DEPLOYED_OR_PLACEHOLDER");
  }

  // ── 3) 淨利 banner + 階梯 KPI（全法人 YTD）─────────────
  console.log(`\n[3] 本期淨利 banner + 損益階梯（全法人）`);
  const niBanner = await page.getByText(/本期淨利|本期淨損/).first().innerText().catch(() => "");
  const niVal = parseMoney(niBanner.split(/[（(]/)[0]);
  ok(
    `本期淨利 banner = ${EXPECT_NET_INCOME.toLocaleString()}`,
    niVal === EXPECT_NET_INCOME,
    `實際解析 = ${isNaN(niVal) ? "?" : niVal.toLocaleString()}`,
  );

  // 階梯 KPI：營業收入 / 本期淨利
  const ladderTxt = bodyTxt;
  const revMatch = parseMoney((ladderTxt.match(/營業收入\s*([\d,]+)/) || [])[1] || "");
  ok(
    `階梯『營業收入』= ${EXPECT_REVENUE.toLocaleString()}`,
    revMatch === EXPECT_REVENUE,
    `實際 = ${isNaN(revMatch) ? "?" : revMatch.toLocaleString()}`,
  );

  // ── 4) 小計列：營業毛利 / 營業利益 / 稅前淨利 ──────────
  console.log(`\n[4] 小計列存在`);
  for (const label of ["營業毛利", "營業利益", "稅前淨利"]) {
    const seen = await page.getByText(label, { exact: false }).first().isVisible().catch(() => false);
    ok(`小計列『${label}』可見`, seen);
  }
  // 營業毛利金額（demo 應 = 淨利 209,000）— 從表格列抓
  const grossRow = page.locator("tr", { hasText: "營業毛利" }).first();
  const grossTxt = await grossRow.innerText().catch(() => "");
  const grossVal = parseMoney(grossTxt);
  ok(
    `營業毛利 = ${EXPECT_GROSS.toLocaleString()}`,
    grossVal === EXPECT_GROSS,
    `實際 = ${isNaN(grossVal) ? "?" : grossVal.toLocaleString()}`,
  );

  // ── 5) 樹列 + 縮排 + Excel 匯出 ──────────────────────
  console.log(`\n[5] 樹狀列 + 縮排 + 匯出`);
  const rowCount = await page.locator("table tbody tr").count();
  ok("表格列數 > 20", rowCount > 20, `${rowCount} 列`);
  const indented = await page.locator('td span[style*="padding-left"]').count();
  ok("有縮排的科目名稱（樹狀層級）", indented > 0, `${indented} 個縮排 span`);
  const exportBtn = await page.getByRole("button", { name: /匯出|Excel|下載/ }).first().isVisible().catch(() => false);
  ok("Excel 匯出按鈕存在", exportBtn);
  await page.screenshot({ path: "is-e2e-all.png", fullPage: true });

  // ── 6) 法人 filter 切換（軟驗：切換後仍是損益表 + 印淨利）──
  console.log(`\n[6] 法人 filter 切換`);
  const subSelect = page.locator("select").filter({ has: page.locator("option", { hasText: "全法人" }) }).first();
  const optTexts = await subSelect.locator("option").allInnerTexts();
  const subOptions = optTexts.filter((t) => t.trim() && t.trim() !== "全法人");
  console.log("  法人選項:", subOptions.join(" / ") || "(無)");
  for (const subLabel of subOptions) {
    await subSelect.selectOption({ label: subLabel });
    await page.getByRole("button", { name: /查詢/ }).first().click();
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(700);
    const subNi = await page.getByText(/本期淨利|本期淨損/).first().innerText().catch(() => "");
    const subNiVal = parseMoney(subNi.split(/[（(]/)[0]);
    const stillIS = await page.locator("h1", { hasText: "損益表" }).first().isVisible().catch(() => false);
    ok(`法人「${subLabel}」切換後仍正常`, stillIS, `本期淨利 ${isNaN(subNiVal) ? "?" : subNiVal.toLocaleString()}`);
  }
  await page.screenshot({ path: "is-e2e-filtered.png", fullPage: true });
} catch (e) {
  console.log("\n[FATAL]", e.message);
} finally {
  await browser.close();
}

// ── 總結 ──────────────────────────────────────────────
const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass);
console.log(`\n===== 結果：${passed}/${results.length} pass =====`);
if (failed.length) {
  console.log("FAILED:");
  failed.forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`));
  if (groundTruthFailed) {
    console.log("\n⏳ ground truth 失敗：疑似新部署尚未上線（舊 catch-all placeholder）。稍後重跑。");
    process.exit(2);
  }
  process.exit(1);
}
console.log("ALL GREEN ✓");
process.exit(0);
