#!/usr/bin/env node
// Smoke test for /parts/warranty/flow (索賠流程說明設定)
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[warranty-flow-smoke]", ...m);

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    log("missing .pw-state.json — run scripts/pw-login.mjs first");
    process.exit(2);
  }
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: STATE_FILE });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`);
  });

  const results = [];

  // 1) Load /parts/warranty/flow
  {
    const resp = await page.goto(`${BASE}/parts/warranty/flow`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({
        ok: false,
        step: "load /flow",
        reason: `status=${status} url=${finalUrl}`,
      });
      await browser.close();
      report(results);
      return;
    }
    results.push({ ok: true, step: "load /flow", status });
  }

  // 2) h1 = 索賠流程說明
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("索賠流程說明")
        ? { ok: true, step: "h1 = 索賠流程說明" }
        : { ok: false, step: "h1 check", reason: `h1="${h1}"` },
    );
  }

  // 3) sprint chip 11.1
  {
    const chip = await page.locator('span:has-text("11.1")').first().count();
    results.push(
      chip > 0
        ? { ok: true, step: "sprint chip 11.1" }
        : { ok: false, step: "sprint chip 11.1", reason: "not found" },
    );
  }

  // 4) 三大 section header — Banner / Flow steps / Claim types / Timing rules
  {
    const expected = ["頂部說明 Banner", "索賠流程步驟", "索賠類型定義", "時效規定"];
    const missing = [];
    for (const h of expected) {
      const c = await page.locator(`h2:has-text("${h}")`).count();
      if (c === 0) missing.push(h);
    }
    results.push(
      missing.length === 0
        ? { ok: true, step: "section headers present" }
        : { ok: false, step: "section headers", reason: `missing: ${missing.join(",")}` },
    );
  }

  // 5) Seed flow steps (6) — DataGrid 1 has rows
  {
    const stepTitles = ["RO 工單建立", "建立索賠申請單", "費用回收結案"];
    let found = 0;
    for (const t of stepTitles) {
      const c = await page.locator(`td:has-text("${t}")`).count();
      if (c > 0) found++;
    }
    results.push(
      found === stepTitles.length
        ? { ok: true, step: "seed flow steps present" }
        : { ok: false, step: "seed flow steps", reason: `found=${found}/${stepTitles.length}` },
    );
  }

  // 6) Seed claim types (4)
  {
    const codes = ["WARRANTY", "EXTENDED", "TSB", "PDI"];
    let found = 0;
    for (const c of codes) {
      const n = await page.locator(`td:has-text("${c}")`).count();
      if (n > 0) found++;
    }
    results.push(
      found === codes.length
        ? { ok: true, step: "seed claim types present" }
        : { ok: false, step: "seed claim types", reason: `found=${found}/${codes.length}` },
    );
  }

  // 7) Seed timing rules — 4 種類型應該有時效設定
  {
    const dayChips = await page.locator('span:has-text("天")').count();
    results.push(
      dayChips >= 4
        ? { ok: true, step: "seed timing rules present", count: dayChips }
        : { ok: false, step: "seed timing rules", reason: `day chips=${dayChips}` },
    );
  }

  // 8) Banner textarea editable
  {
    const ta = await page.locator('[data-testid="banner-text"]').count();
    results.push(
      ta > 0
        ? { ok: true, step: "banner textarea present" }
        : { ok: false, step: "banner textarea", reason: "missing" },
    );
  }

  // 9) 「＋ 新增步驟」 / 「＋ 新增類型」 / 「＋ 新增時效」按鈕
  {
    const addStep = await page.locator('[data-testid="step-create-open"]').count();
    const addType = await page.locator('[data-testid="type-create-open"]').count();
    const addTiming = await page.locator('[data-testid="timing-create-open"]').count();
    results.push(
      addStep > 0 && addType > 0 && addTiming > 0
        ? { ok: true, step: "all 3 add buttons present" }
        : {
            ok: false,
            step: "add buttons",
            reason: `step=${addStep} type=${addType} timing=${addTiming}`,
          },
    );
  }

  // 10) 點 ＋ 新增步驟 → modal 彈出
  {
    await page.locator('[data-testid="step-create-open"]').click();
    await page.waitForTimeout(300);
    const titleInput = await page.locator('[data-testid="step-form-title"]').count();
    results.push(
      titleInput > 0
        ? { ok: true, step: "step modal opens" }
        : { ok: false, step: "step modal", reason: "title input not found" },
    );

    // 11) 建立一筆 smoke step 然後驗 banner / 新增 row
    if (titleInput > 0) {
      const smokeNo = 90 + Math.floor(Math.random() * 9);
      const smokeTitle = `smoke 步驟 ${smokeNo}`;
      await page
        .locator('[data-testid="step-form-step-no"]')
        .fill(String(smokeNo));
      await page.locator('[data-testid="step-form-title"]').fill(smokeTitle);
      await page
        .locator('[data-testid="step-form-description"]')
        .fill("playwright smoke 建的暫時步驟");
      await page.locator('[data-testid="step-form-submit"]').click();

      // 等 banner（樂觀 toast 出現）
      await page
        .locator('[data-testid="warranty-flow-banner"]')
        .waitFor({ state: "visible", timeout: 8000 })
        .catch(() => {});
      const banner = await page
        .locator('[data-testid="warranty-flow-banner"]')
        .innerText()
        .catch(() => "");

      // 等 row 出現（router.refresh 後 SSR 回來、有時要 2-3s）
      await page
        .locator(`td:has-text("${smokeTitle}")`)
        .first()
        .waitFor({ state: "visible", timeout: 10000 })
        .catch(() => {});
      const rowVisible = await page
        .locator(`td:has-text("${smokeTitle}")`)
        .count();
      results.push(
        banner.includes("已建立") && rowVisible > 0
          ? { ok: true, step: "create flow step round-trip", banner }
          : {
              ok: false,
              step: "create flow step",
              reason: `banner="${banner}" rowVisible=${rowVisible}`,
            },
      );

      // 12) 找到剛建的 row 後刪除（cleanup）
      if (rowVisible > 0) {
        page.once("dialog", (d) => d.accept());
        const row = page
          .locator(`tr:has(td:has-text("${smokeTitle}"))`)
          .first();
        const deleteBtn = row.locator('button:has-text("刪除")').first();
        if ((await deleteBtn.count()) > 0) {
          await deleteBtn.click();
          // 等 row 從 DOM 消失（router.refresh 完）
          await page
            .locator(`td:has-text("${smokeTitle}")`)
            .first()
            .waitFor({ state: "detached", timeout: 10000 })
            .catch(() => {});
          const stillThere = await page
            .locator(`td:has-text("${smokeTitle}")`)
            .count();
          results.push(
            stillThere === 0
              ? { ok: true, step: "cleanup: delete smoke step" }
              : {
                  ok: false,
                  step: "cleanup",
                  reason: `row still visible (count=${stillThere})`,
                },
          );
        } else {
          results.push({ ok: false, step: "cleanup", reason: "delete button not found" });
        }
      }
    }
  }

  // 13) 無 console error
  if (consoleErrors.length > 0) {
    results.push({ ok: false, step: "browser console errors", errors: consoleErrors });
  } else {
    results.push({ ok: true, step: "no browser console errors" });
  }

  await browser.close();
  report(results);
}

function report(results) {
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
    console.error(
      r.ok
        ? `[warranty-flow-smoke] ✓ ${r.step}`
        : `[warranty-flow-smoke] ✗ ${r.step} — ${r.reason || JSON.stringify(r)}`,
    );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
