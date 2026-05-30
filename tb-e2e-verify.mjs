// 一次性 E2E：對正式站 https://dealeros.zeabur.app 驗 P4 試算表
// 用 ccc@ccc.ccc (admin) 登入 → 打 /admin/accounting/reports/trial-balance → 斷言
// 跑：node tb-e2e-verify.mjs   （此檔不進 git，驗完即刪）
import { chromium } from "playwright";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://dealeros.zeabur.app";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";
const TB_PATH = "/admin/accounting/reports/trial-balance";
const EXPECT_TOTAL = 1925695; // handoff: net 口徑 Dr=Cr，全法人

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "  ✓" : "  ✗"} ${name}${detail ? " — " + detail : ""}`);
};

function parseMoney(s) {
  const m = (s || "").replace(/[^\d-]/g, "");
  return m ? parseInt(m, 10) : NaN;
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

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
    const errTxt = await page.locator("body").innerText().catch(() => "");
    ok("登入成功（離開 /login）", false, "仍停在 /login，可能帳密錯或非 admin");
    console.log("  login page text snippet:", errTxt.slice(0, 200));
    throw new Error("LOGIN_FAILED");
  }
  const cookies = await ctx.cookies();
  ok("取得 sb- auth cookie", cookies.some((c) => c.name.startsWith("sb-")));

  // ── 2) 打 TB 頁 ──────────────────────────────────────
  console.log(`\n[2] 打 ${TB_PATH}`);
  await page.goto(`${BASE}${TB_PATH}`, { waitUntil: "networkidle", timeout: 45000 });
  const bodyTxt = await page.locator("body").innerText();

  // 權限 / 404 守門（含 TB 非 admin 的實際措辭「僅限管理者」）
  if (/無權限|請先登入|找不到|僅限管理者/.test(bodyTxt)) {
    ok("頁面非『無權限/未登入/找不到/僅限管理者』", false, bodyTxt.slice(0, 120));
    await page.screenshot({ path: "tb-e2e-denied.png", fullPage: true });
    throw new Error("ACCESS_DENIED_OR_404");
  }
  ok("頁面非『無權限/未登入/找不到/僅限管理者』", true);

  // H1 試算表
  const h1 = await page.locator("h1", { hasText: "試算表" }).first().isVisible().catch(() => false);
  ok("H1『試算表』可見", h1);

  // ── 3) 平衡 banner（全法人）─────────────────────────
  console.log(`\n[3] 平衡 banner + 合計（全法人）`);
  const balancedBanner = page.getByText("借貸平衡");
  const isBalanced = await balancedBanner.first().isVisible().catch(() => false);
  ok("平衡 banner 綠（借貸平衡）", isBalanced);
  const bannerTxt = isBalanced
    ? await balancedBanner.first().innerText()
    : await page.locator("body").innerText();
  const bannerTotal = parseMoney(bannerTxt.split("=").pop());
  ok(
    `全法人合計 = ${EXPECT_TOTAL.toLocaleString()}`,
    bannerTotal === EXPECT_TOTAL,
    `實際 banner 解析 = ${isNaN(bannerTotal) ? "?" : bannerTotal.toLocaleString()}`
  );

  // ── 4) 樹列 + 縮排 ──────────────────────────────────
  console.log(`\n[4] 樹狀列 + 縮排`);
  const rowCount = await page.locator("table tbody tr").count();
  ok("樹列數 > 100", rowCount > 100, `${rowCount} 列`);
  // 縮排：name cell 內 span 有 padding-left inline style
  const indented = await page.locator('td span[style*="padding-left"]').count();
  ok("有縮排的科目名稱（樹狀層級）", indented > 0, `${indented} 個縮排 span`);

  await page.screenshot({ path: "tb-e2e-all.png", fullPage: true });

  // ── 5) Excel 匯出按鈕 ───────────────────────────────
  const exportBtn = await page
    .getByRole("button", { name: /匯出|Excel|下載/ })
    .first()
    .isVisible()
    .catch(() => false);
  ok("Excel 匯出按鈕存在", exportBtn);

  // ── 6) 法人 filter 切換（每個法人仍平衡）────────────
  console.log(`\n[6] 法人 filter 切換`);
  const subSelect = page.locator("select").filter({ has: page.locator('option', { hasText: "全法人" }) }).first();
  const optTexts = await subSelect.locator("option").allInnerTexts();
  const subOptions = optTexts.filter((t) => t.trim() && t.trim() !== "全法人");
  console.log("  法人選項:", subOptions.join(" / ") || "(無，可能單法人 seed)");

  for (const subLabel of subOptions) {
    await subSelect.selectOption({ label: subLabel });
    await page.getByRole("button", { name: /查詢/ }).first().click();
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(800);
    const subBalanced = await page.getByText("借貸平衡").first().isVisible().catch(() => false);
    const subBody = await page.locator("body").innerText();
    const subTotalM = parseMoney((subBody.match(/借貸平衡[^=]*=\s*([\d,]+)/) || [])[1] || "");
    ok(`法人「${subLabel}」仍平衡`, subBalanced, `合計 ${isNaN(subTotalM) ? "?" : subTotalM.toLocaleString()}`);
  }
  await page.screenshot({ path: "tb-e2e-filtered.png", fullPage: true });
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
  process.exit(1);
}
console.log("ALL GREEN ✓");
process.exit(0);
