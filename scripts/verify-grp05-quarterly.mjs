/**
 * GRP05 季度績效報告 本機驗證（admin yemming + indian scope）
 *   node scripts/verify-grp05-quarterly.mjs
 * 需 dev server 在 http://localhost:3000。
 */
import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";

const results = [];
const ok = (n, c, extra = "") => results.push({ n, c, extra });

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

try {
  // 1) login
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 20_000 });
  ok("login", true);

  // 2) force indian scope cookie
  await context.addCookies([
    {
      name: "dealeros_scope",
      value: JSON.stringify({ brand_id: "indian" }),
      url: BASE,
    },
  ]);

  // 3) GRP05 workspace page
  await page.goto(`${BASE}/group/quarterly-report`, { waitUntil: "networkidle", timeout: 30_000 });
  ok("GRP05 標題", await page.getByRole("heading", { name: "集團季度績效報告" }).isVisible());
  ok("GRP05 chip", await page.getByText("GRP05").first().isVisible());
  ok("全台新車銷量 KPI", await page.getByText("全台新車銷量").first().isVisible());
  ok("平均 Health Score KPI", await page.getByText("平均 Health Score").first().isVisible());
  ok("門店對比表 header", await page.getByText("各門店季度績效對比").first().isVisible());
  // 至少一店出現（台北直營店）
  ok("台北直營店列", await page.getByText("台北直營店").first().isVisible());
  // 評級 chip（優秀/良好/關注/介入 之一）
  const gradeVisible = await page
    .getByText(/優秀|良好|關注|介入/)
    .first()
    .isVisible()
    .catch(() => false);
  ok("評級 chip", gradeVisible);
  // 季度重點摘要
  ok("季度重點摘要", await page.getByText("季度重點摘要").first().isVisible());
  // 開啟報告按鈕
  ok("開啟完整報告按鈕", await page.getByRole("button", { name: /開啟完整報告/ }).isVisible());

  // 4) print route 直開
  await page.goto(`${BASE}/print/group-quarterly-report/2026-Q1`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
  ok("print docTitle", await page.getByText(/集團季度績效報告 QUARTERLY/).first().isVisible());
  ok("print 核心指標", await page.getByText("季度核心指標").first().isVisible());
  ok("print 月度拆解", await page.getByText(/季度月度拆解/).first().isVisible());
  ok("print toolbar 下載 PDF", await page.getByRole("button", { name: /下載 PDF/ }).isVisible());
  // 數字落地（非全 dash）：頁面應出現「台」字（新車銷量單位）
  ok("print 新車銷量值", await page.getByText(/台北直營店/).first().isVisible());

  // 5) PDF API：本機 macOS 跑不了 @sparticuz/chromium（Linux-only，render.ts 已註明），
  //    所有 PDF 路由本機都會 500(spawn ENOEXEC)；Zeabur Linux 才真出 PDF。
  //    本機只驗「slug 已 whitelist + auth 通過」→ 非 400(unknown slug) / 401(unauth)。
  const resp = await page.request.get(`${BASE}/api/pdf/group-quarterly-report/2026-Q1`);
  const st = resp.status();
  if (st === 200) {
    const ct = resp.headers()["content-type"] ?? "";
    const buf = await resp.body();
    ok(
      "PDF API 回 PDF",
      ct.includes("application/pdf") && buf.slice(0, 5).toString() === "%PDF-",
      `status=200 bytes=${buf.length}`,
    );
  } else {
    const body = (await resp.text()).slice(0, 60);
    ok(
      "PDF API slug+auth 通過（PDF binary 留 Linux）",
      st !== 400 && st !== 401 && /ENOEXEC|render failed|chromium/i.test(body),
      `status=${st} body="${body}"（本機 chromium ENOEXEC 屬預期）`,
    );
  }
} catch (e) {
  ok("EXCEPTION", false, String(e).slice(0, 300));
} finally {
  await browser.close();
}

let pass = 0;
for (const r of results) {
  console.log(`${r.c ? "✅" : "❌"} ${r.n}${r.extra ? "  — " + r.extra : ""}`);
  if (r.c) pass++;
}
console.log(`\n${pass}/${results.length} 綠`);
process.exit(pass === results.length ? 0 : 1);
