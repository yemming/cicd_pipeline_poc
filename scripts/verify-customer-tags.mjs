#!/usr/bin/env node
// Verify smoke test for /sales/customers/tags (DUCATI v2 A6 — RS_SET2)
// - load page, status=200, no console errors
// - assert key v2 UI elements present (header, tabs, color sections, filter bar)
// - screenshot /tmp/customer-tags-verify.png
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3008";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 60_000);
const SCREENSHOT = "/tmp/customer-tags-verify.png";

const log = (...m) => console.error("[customer-tags-verify]", ...m);

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    log("[FAIL] missing .pw-state.json — copy from main first");
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1440, height: 900 },
  });
  // 鎖定 brand=indian (seed 都塞 indian)
  await ctx.addCookies([
    {
      name: "dealeros_scope",
      value: encodeURIComponent(JSON.stringify({ brand_id: "indian" })),
      url: BASE,
      sameSite: "Lax",
    },
  ]);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`);
  });

  const results = [];

  // 1) Load page
  let resp;
  try {
    resp = await page.goto(`${BASE}/sales/customers/tags`, {
      waitUntil: "networkidle",
      timeout: NAV_TIMEOUT,
    });
  } catch (e) {
    results.push({ ok: false, step: "page load", reason: e.message });
  }
  const status = resp?.status() ?? 0;
  const finalUrl = page.url();
  if (status === 200 && !finalUrl.includes("/login")) {
    results.push({ ok: true, step: "page load (status=200)", status });
  } else {
    results.push({
      ok: false,
      step: "page load",
      reason: `status=${status} url=${finalUrl}`,
    });
  }

  // 2) Header h1
  const h1 = await page.locator("h1").first().innerText().catch(() => "");
  results.push(
    h1.includes("客戶標籤管理")
      ? { ok: true, step: "h1 客戶標籤管理" }
      : { ok: false, step: "h1 客戶標籤管理", reason: `h1="${h1}"` },
  );

  // 3) RS_SET2 chip
  const setChip = await page.locator('text="RS_SET2"').count();
  results.push(
    setChip > 0
      ? { ok: true, step: "RS_SET2 sprint chip" }
      : { ok: false, step: "RS_SET2 sprint chip", reason: "not found" },
  );

  // 4) Four tabs
  const tabLabels = ["標籤庫總覽", "我的自訂標籤", "使用統計", "主管觀察視角"];
  for (const t of tabLabels) {
    const c = await page.locator(`button:has-text("${t}")`).count();
    results.push(
      c > 0
        ? { ok: true, step: `tab: ${t}` }
        : { ok: false, step: `tab: ${t}`, reason: "not found" },
    );
  }

  // 5) 4 color sections in default Lib tab
  const colorSections = [
    "注意事項",
    "偏好特質",
    "服務備忘",
    "談判協商",
  ];
  for (const c of colorSections) {
    const cnt = await page.locator(`text=${c}`).count();
    results.push(
      cnt > 0
        ? { ok: true, step: `color section: ${c}` }
        : { ok: false, step: `color section: ${c}`, reason: "not found" },
    );
  }

  // 6) Official tag locks present (seed = 22 official tags)
  const lockCount = await page.locator('text="🔒"').count();
  results.push(
    lockCount >= 1
      ? { ok: true, step: "official lock indicators", count: lockCount }
      : { ok: false, step: "official lock indicators", reason: "no 🔒 found" },
  );

  // 7) Filter bar: 顏色 / 來源 / 搜尋
  const colorFilterLabel = await page.locator('label:has-text("顏色")').count();
  const sourceFilterLabel = await page.locator('label:has-text("來源")').count();
  const searchFilterLabel = await page.locator('label:has-text("搜尋")').count();
  results.push(
    colorFilterLabel > 0 && sourceFilterLabel > 0 && searchFilterLabel > 0
      ? { ok: true, step: "filter bar labels (顏色/來源/搜尋)" }
      : {
          ok: false,
          step: "filter bar labels",
          reason: `顏色=${colorFilterLabel} 來源=${sourceFilterLabel} 搜尋=${searchFilterLabel}`,
        },
  );

  // 8) ＋ 新增自訂標籤 button
  const addBtn = await page.locator('button:has-text("新增自訂標籤")').count();
  results.push(
    addBtn > 0
      ? { ok: true, step: "+ 新增自訂標籤 button" }
      : { ok: false, step: "+ 新增自訂標籤 button", reason: "not found" },
  );

  // 9) Switch to 我的自訂標籤 tab
  await page.locator('button:has-text("我的自訂標籤")').first().click();
  await page.waitForTimeout(300);
  const limitBar = await page
    .locator("text=已使用")
    .first()
    .innerText()
    .catch(() => "");
  results.push(
    limitBar.includes("已使用")
      ? { ok: true, step: "custom tab limit bar", text: limitBar }
      : { ok: false, step: "custom tab limit bar", reason: "no '已使用' text" },
  );

  // 10) Switch to 主管觀察視角 tab
  await page.locator('button:has-text("主管觀察視角")').first().click();
  await page.waitForTimeout(300);
  const obsBanner = await page
    .locator("text=主管觀察視角")
    .count();
  results.push(
    obsBanner > 0
      ? { ok: true, step: "obs tab banner" }
      : { ok: false, step: "obs tab banner", reason: "not found" },
  );

  // Screenshot (go back to lib tab for canonical view)
  await page.locator('button:has-text("標籤庫總覽")').first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: SCREENSHOT, fullPage: true });
  log(`screenshot → ${SCREENSHOT}`);

  // Console errors
  const realErrors = consoleErrors.filter(
    (e) => !e.includes("hydration") && !e.includes("favicon"),
  );
  results.push(
    realErrors.length === 0
      ? { ok: true, step: "no console errors", ignored: consoleErrors.length }
      : { ok: false, step: "console errors", errors: realErrors },
  );

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(
    JSON.stringify(
      {
        total: results.length,
        passed: results.length - failed.length,
        failed: failed.length,
        details: results,
      },
      null,
      2,
    ),
  );
  for (const r of results)
    log(
      r.ok
        ? `[OK] ${r.step}`
        : `[FAIL] ${r.step} — ${r.reason || JSON.stringify(r)}`,
    );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("[customer-tags-verify] [FAIL]", e);
  process.exit(2);
});
