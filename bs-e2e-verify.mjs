// 可重跑 E2E：對正式站 https://dealeros.zeabur.app 驗 P4 資產負債表 (Balance Sheet)
// 用 yemming.yu@gmail.com (admin) email/password 表單登入 → 打 /admin/accounting/reports/balance-sheet → 斷言
// 跑：node bs-e2e-verify.mjs
// exit code: 0=全綠 / 1=部署了但有斷言失敗 / 2=ground truth 失敗（疑似尚未部署/placeholder）
//
// 主斷言「資產總計 === 負債及權益總計」不寫死金額（demo 資料會變）；
// 三視圖（全法人/Ducati/Indian）的合計只印出做輔助比對，非硬斷言。
import { chromium } from "playwright";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://dealeros.zeabur.app";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";
const BS_PATH = "/admin/accounting/reports/balance-sheet";

// 部署延遲保護
const MAX_RETRY = 5;
const RETRY_SLEEP_MS = 30000;

// 輔助比對基準（印出即可、非硬斷言）
const HINTS = {
  全法人: 123295,
  Ducati: 118045,
  Indian: 5250,
  netIncome全法人Ducati: 209000,
};

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "  ✓" : "  ✗"} ${name}${detail ? " — " + detail : ""}`);
};

/** 解析金額：括號=負、千分位、可選負號；抓字串中第一段連續數字（含逗號） */
function parseMoney(s) {
  if (s == null) return NaN;
  const str = String(s);
  const m = str.match(/\(?\s*-?\s*[\d,]+\)?/);
  if (!m) return NaN;
  const chunk = m[0];
  const neg = /\(/.test(chunk) || /-/.test(chunk);
  const digits = chunk.replace(/[^\d]/g, "");
  if (!digits) return NaN;
  const n = parseInt(digits, 10);
  return neg ? -n : n;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 從某個含「總計」字樣的表格小計列抓金額 */
async function grabSubtotalAmount(page, label) {
  const row = page.locator("tr", { hasText: label }).first();
  const txt = await row.innerText().catch(() => "");
  if (!txt) return NaN;
  // 小計列文字像「資產總計\t123,295」；抓最後一段數字
  const matches = txt.match(/\(?\s*-?\s*[\d,]+\)?/g) || [];
  if (!matches.length) return NaN;
  return parseMoney(matches[matches.length - 1]);
}

/** 抓 KPI 卡片裡某 label 的數字（卡片結構：label div + value div） */
async function grabKpi(page, label) {
  // KPI 卡片：text-[11px] label + 緊接的 font-mono value
  const labelEl = page.getByText(label, { exact: true }).first();
  const seen = await labelEl.isVisible().catch(() => false);
  if (!seen) return NaN;
  // 取父卡片整段文字解析
  const cardTxt = await labelEl
    .locator("xpath=..")
    .innerText()
    .catch(() => "");
  // cardTxt 像「資產總計\n123,295」→ 取 label 後面那段
  const after = cardTxt.replace(label, "");
  return parseMoney(after);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
let groundTruthFailed = false;
const viewNumbers = {}; // { 全法人: {assets, liabEquity, netIncome, balanced}, ... }

try {
  // ── 1) email/password 表單登入（非 OAuth）─────────────
  console.log(`\n[1] 登入 ${BASE}/login as ${EMAIL}`);
  await page.goto(`${BASE}/login`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  try {
    await page.waitForURL((u) => !u.pathname.endsWith("/login"), {
      timeout: 25000,
    });
    ok("登入成功（離開 /login）", true, page.url());
  } catch {
    ok("登入成功（離開 /login）", false, "仍停在 /login，可能帳密錯或非 admin");
    throw new Error("LOGIN_FAILED");
  }
  const cookies = await ctx.cookies();
  ok(
    "取得 sb- auth cookie",
    cookies.some((c) => c.name.startsWith("sb-")),
  );

  // ── 2) 打 BS 頁 + 部署延遲保護（最多 5 次、每次 sleep 30s）──
  console.log(`\n[2] 打 ${BS_PATH}（含部署延遲重試）`);
  let bodyTxt = "";
  let h1Seen = false;
  let hasNetIncome = false;
  let ready = false;
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    await page.goto(`${BASE}${BS_PATH}`, {
      waitUntil: "networkidle",
      timeout: 45000,
    });
    bodyTxt = await page.locator("body").innerText();

    // 被導回 login = session 沒帶上
    if (page.url().endsWith("/login")) {
      console.log(`  [try ${attempt}] 被導回 /login，稍後重試`);
    } else if (/無權限|請先登入|找不到|僅限管理者/.test(bodyTxt)) {
      console.log(
        `  [try ${attempt}] 命中守門字樣（無權限/找不到/僅限管理者），稍後重試`,
      );
    } else {
      // ground truth：真 BS 頁有 H1「資產負債表」+「本期淨利」；舊 placeholder 沒有
      h1Seen = await page
        .locator("h1", { hasText: "資產負債表" })
        .first()
        .isVisible()
        .catch(() => false);
      hasNetIncome = /本期淨利/.test(bodyTxt);
      if (h1Seen && hasNetIncome) {
        ready = true;
        console.log(`  [try ${attempt}] 打到新部署 ✓`);
        break;
      }
      console.log(
        `  [try ${attempt}] 尚未 ready（H1=${h1Seen} 本期淨利=${hasNetIncome}），疑似舊 catch-all placeholder`,
      );
    }
    if (attempt < MAX_RETRY) {
      console.log(`  sleep ${RETRY_SLEEP_MS / 1000}s 後重試…`);
      await sleep(RETRY_SLEEP_MS);
    }
  }

  if (page.url().endsWith("/login")) {
    ok("頁面未被導回 /login", false, "登入 session 未生效");
    groundTruthFailed = true;
    await page.screenshot({
      path: "bs-e2e-fail-login-redirect.png",
      fullPage: true,
    });
    throw new Error("REDIRECTED_TO_LOGIN");
  }
  if (/無權限|請先登入|找不到|僅限管理者/.test(bodyTxt)) {
    ok("頁面非『無權限/未登入/找不到/僅限管理者』", false, bodyTxt.slice(0, 120));
    await page.screenshot({ path: "bs-e2e-fail-denied.png", fullPage: true });
    throw new Error("ACCESS_DENIED_OR_404");
  }
  ok("頁面非『無權限/未登入/找不到/僅限管理者』", true);

  // 斷言 1：H1 含「資產負債表」（非 placeholder / 非 /login）
  ok("H1『資產負債表』可見（非 placeholder/login）", h1Seen);
  ok("頁面含『本期淨利』列（非 placeholder）", hasNetIncome);
  if (!ready) {
    groundTruthFailed = true;
    await page.screenshot({ path: "bs-e2e-fail-notready.png", fullPage: true });
    throw new Error("NOT_DEPLOYED_OR_PLACEHOLDER");
  }

  // ── 3) 三視圖逐一驗（全法人 / Ducati / Indian）────────
  // 法人 select：含 option「全法人」的那個
  const subSelect = page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: "全法人" }) })
    .first();
  const optTexts = await subSelect.locator("option").allInnerTexts();
  const optClean = optTexts.map((t) => t.trim()).filter(Boolean);
  console.log(`\n[3] 法人 filter 選項: ${optClean.join(" / ")}`);

  // 視圖清單：全法人 + 每個子法人。以 select 的 option label 為準（含全法人）
  const viewLabels = optClean; // ['全法人', 'Ducati ...', 'Indian ...'] 之類

  for (let i = 0; i < viewLabels.length; i++) {
    const label = viewLabels[i];
    console.log(`\n  ── 視圖：${label} ──`);
    // 切換並查詢（全法人通常已是初始值，仍重選 + 查詢確保重抓）
    await subSelect.selectOption({ label });
    await page
      .getByRole("button", { name: /查詢/ })
      .first()
      .click();
    await page.waitForLoadState("networkidle", { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(900);

    const vBody = await page.locator("body").innerText();

    // banner 綠（含「借貸平衡」）— 綠 banner 用 bg-[#EAF3DE]；不平衡用 bg-[#FDECEA]
    const balancedBanner = page.getByText("借貸平衡");
    const bannerGreen = await balancedBanner
      .first()
      .isVisible()
      .catch(() => false);
    // 確認那段 banner 真的是綠底（class 含 #EAF3DE）
    let bannerIsGreenClass = false;
    if (bannerGreen) {
      const cls = await balancedBanner
        .first()
        .evaluate((el) => {
          // 往上找帶背景 class 的祖先
          let n = el;
          for (let d = 0; d < 4 && n; d++) {
            const c = n.getAttribute && n.getAttribute("class");
            if (c && /EAF3DE|FDECEA/.test(c)) return c;
            n = n.parentElement;
          }
          return el.getAttribute("class") || "";
        })
        .catch(() => "");
      bannerIsGreenClass = /EAF3DE/.test(cls);
    }
    // 也偵測不平衡紅 banner 是否出現
    const redBanner = await page
      .getByText("不平衡")
      .first()
      .isVisible()
      .catch(() => false);

    ok(
      `[${label}] 平衡 banner 綠（借貸平衡 ✓）`,
      bannerGreen && bannerIsGreenClass && !redBanner,
      bannerGreen
        ? bannerIsGreenClass
          ? "綠底確認"
          : "找到借貸平衡字樣但未確認綠底 class"
        : "未見借貸平衡字樣",
    );

    // 抓「資產總計」與「負債及權益總計」兩個 grand total 列
    const assets = await grabSubtotalAmount(page, "資產總計");
    const liabEquity = await grabSubtotalAmount(page, "負債及權益總計");
    // 本期淨利：優先抓 KPI 卡（label 精確「本期淨利」），fallback 表格列
    let netIncome = await grabKpi(page, "本期淨利");
    if (isNaN(netIncome)) {
      netIncome = await grabSubtotalAmount(page, "本期淨利（當期損益）");
    }

    const eq = !isNaN(assets) && !isNaN(liabEquity) && assets === liabEquity;
    ok(
      `[${label}] 資產總計 === 負債及權益總計`,
      eq,
      `資產=${isNaN(assets) ? "?" : assets.toLocaleString()} / 負債及權益=${isNaN(liabEquity) ? "?" : liabEquity.toLocaleString()}`,
    );

    // 記錄供回報；對 hint 做輔助比對（印出）
    const hintKey = /全法人/.test(label)
      ? "全法人"
      : /ducati/i.test(label)
        ? "Ducati"
        : /indian/i.test(label)
          ? "Indian"
          : label;
    const hint = HINTS[hintKey];
    viewNumbers[label] = {
      assets,
      liabEquity,
      netIncome,
      equal: eq,
      bannerGreen: bannerGreen && bannerIsGreenClass && !redBanner,
    };
    console.log(
      `    本期淨利=${isNaN(netIncome) ? "?" : netIncome.toLocaleString()}` +
        (hint != null
          ? `（輔助比對基準≈${hint.toLocaleString()}，差 ${isNaN(assets) ? "?" : (assets - hint).toLocaleString()}）`
          : ""),
    );

    // 全法人 / Ducati 應有本期淨利 209,000（軟斷言：印出，並做硬斷言「本期淨利列存在且為數字」）
    ok(
      `[${label}] 本期淨利列存在且可解析為數字`,
      !isNaN(netIncome),
      isNaN(netIncome) ? "解析失敗" : netIncome.toLocaleString(),
    );

    await page.screenshot({
      path: `bs-e2e-view-${hintKey}.png`,
      fullPage: true,
    });
  }

  // ── 4) 本期淨利 209,000 軟驗（全法人/Ducati）──────────
  console.log(`\n[4] 本期淨利 209,000 比對（全法人/Ducati，軟斷言）`);
  for (const [label, v] of Object.entries(viewNumbers)) {
    if (/全法人/.test(label) || /ducati/i.test(label)) {
      const hit = v.netIncome === HINTS.netIncome全法人Ducati;
      console.log(
        `  ${hit ? "✓" : "≈"} [${label}] 本期淨利 ${isNaN(v.netIncome) ? "?" : v.netIncome.toLocaleString()}（期望 ${HINTS.netIncome全法人Ducati.toLocaleString()}）`,
      );
    }
  }
} catch (e) {
  console.log("\n[FATAL]", e.message);
} finally {
  await browser.close();
}

// ── 總結 ──────────────────────────────────────────────
const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass);
console.log(`\n===== 結果：${passed}/${results.length} pass =====`);
console.log("\n三視圖實際數字：");
for (const [label, v] of Object.entries(viewNumbers)) {
  console.log(
    `  ${label}: 資產=${isNaN(v.assets) ? "?" : v.assets.toLocaleString()} | 負債及權益=${isNaN(v.liabEquity) ? "?" : v.liabEquity.toLocaleString()} | 相等=${v.equal} | banner綠=${v.bannerGreen} | 本期淨利=${isNaN(v.netIncome) ? "?" : v.netIncome.toLocaleString()}`,
  );
}
if (failed.length) {
  console.log("\nFAILED:");
  failed.forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`));
  if (groundTruthFailed) {
    console.log(
      "\n⏳ ground truth 失敗：疑似新部署尚未上線（舊 catch-all placeholder / 導回 login）。已重試上限。",
    );
    process.exit(2);
  }
  process.exit(1);
}
console.log("\nALL GREEN ✓");
process.exit(0);
