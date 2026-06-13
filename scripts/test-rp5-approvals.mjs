/**
 * Playwright E2E 驗證 — RP5 主管授權工作流
 */

import { chromium } from "playwright";

const BASE_URL = "http://localhost:3100";

// Supabase 直連（用 fetch API）
const SUPABASE_URL = "https://bykvtcptbirpxyqkfwfl.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5a3Z0Y3B0YmlycHh5cWtmd2ZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTc5MTYyMSwiZXhwIjoyMDkxMzY3NjIxfQ.QgtpBpj7dLXxV0fn_NetuPlam0iA_Co7apDsPyhnM8k";

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      "apikey": SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  console.log("=== RP5 主管授權工作流 Playwright 驗證 ===\n");

  // ── 1. 找一張 Indian brand 的 RO ──
  console.log("→ 找 Indian brand RO...");
  const ros = await sbFetch("/repair_orders?brand_id=eq.indian&status=neq.已取消&limit=3&select=id,ro_code,brand_id,status");
  if (!ros || ros.length === 0) {
    console.error("✗ 找不到 Indian brand 的 RO");
    process.exit(1);
  }
  const testRo = ros[0];
  console.log(`✓ 測試 RO: ${testRo.ro_code} (id=${testRo.id})\n`);

  // ── 2. Playwright 登入 ──
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("→ 登入 http://localhost:3100/login...");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 20000 });
  await page.fill('input[type="email"]', "yemming.yu@gmail.com");
  await page.fill('input[type="password"]', "yemming.yu@gmail.com");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  console.log(`  登入後 URL: ${page.url()}`);

  // ── 3. 設 Indian brand scope ──
  await context.addCookies([
    {
      name: "dealeros_scope",
      value: encodeURIComponent(JSON.stringify({ brand_id: "indian", store_id: null })),
      domain: "localhost",
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  // ── 4. 訪問 approvals 頁面 ──
  const approvalsUrl = `${BASE_URL}/parts/aftersales/approvals/${testRo.id}`;
  console.log(`\n→ 訪問 ${approvalsUrl}`);
  await page.goto(approvalsUrl, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  const finalUrl = page.url();
  console.log(`  最終 URL: ${finalUrl}`);

  const bodyText = await page.textContent("body");
  // 驗證頁面內容
  const checks = [
    { label: "頁面含「主管授權記錄」", pass: (bodyText ?? "").includes("主管授權記錄") },
    { label: "頁面含「申請保固通融」", pass: (bodyText ?? "").includes("申請保固通融") },
    { label: "頁面含 RP5 chip", pass: (bodyText ?? "").includes("RP5") },
    { label: "未跳回登入頁", pass: !finalUrl.includes("/login") },
  ];

  // 若頁面沒顯示，記錄 debug 資訊
  if (!(bodyText ?? "").includes("主管授權記錄")) {
    console.log("\n  [DEBUG] 頁面前 300 字：");
    console.log("  " + (bodyText ?? "").slice(0, 300).replace(/\n/g, " "));
  }

  // ── 5. 直接在 DB 塞一筆 test approval 記錄 ──
  console.log("\n→ 在 metadata.approvals[] 塞測試記錄...");
  const [roRow] = await sbFetch(`/repair_orders?id=eq.${testRo.id}&select=metadata`);
  const meta = roRow?.metadata ?? {};
  const existingApprovals = Array.isArray(meta.approvals) ? meta.approvals : [];
  const cleanedApprovals = existingApprovals.filter(a => a.notes !== "__playwright_test__");

  const testApprovalId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const testApproval = {
    id: testApprovalId,
    scenario: "warranty_grace",
    requester_id: "test-user",
    requester_name: "Playwright 測試 SA",
    requested_at: new Date().toISOString(),
    notes: "__playwright_test__",
    context: { test: true },
    status: "pending",
    decider_id: null,
    decider_name: null,
    decided_at: null,
    decision_reason: null,
  };

  await sbFetch(`/repair_orders?id=eq.${testRo.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      metadata: { ...meta, approvals: [...cleanedApprovals, testApproval] },
      updated_at: new Date().toISOString(),
    }),
  });
  console.log(`✓ 測試記錄已塞入 DB (id=${testApprovalId})`);

  // ── 6. 刷新頁面驗證 pending 顯示 ──
  await page.reload({ waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(2000);
  const refreshedText = await page.textContent("body");

  checks.push(
    { label: "刷新後顯示保固通融申請", pass: (refreshedText ?? "").includes("保固期限通融") },
    { label: "顯示「待審」chip", pass: (refreshedText ?? "").includes("待審") },
    { label: "主管看到「核准」按鈕", pass: (refreshedText ?? "").includes("核准") },
    { label: "主管看到「拒絕」按鈕", pass: (refreshedText ?? "").includes("拒絕") },
  );

  // ── 7. DB 直接驗證 ──
  const [verifyRo] = await sbFetch(`/repair_orders?id=eq.${testRo.id}&select=metadata`);
  const savedApprovals = verifyRo?.metadata?.approvals ?? [];
  const saved = savedApprovals.find(a => a.id === testApprovalId);
  checks.push({ label: "DB metadata.approvals[] 存在測試記錄", pass: !!saved });

  // ── 8. 清理 ──
  console.log("\n→ 清理測試資料...");
  const [cleanRo] = await sbFetch(`/repair_orders?id=eq.${testRo.id}&select=metadata`);
  const cleanMeta = cleanRo?.metadata ?? {};
  const cleanList = (cleanMeta.approvals ?? []).filter(a => a.notes !== "__playwright_test__");
  await sbFetch(`/repair_orders?id=eq.${testRo.id}`, {
    method: "PATCH",
    body: JSON.stringify({ metadata: { ...cleanMeta, approvals: cleanList }, updated_at: new Date().toISOString() }),
  });
  console.log("✓ 測試資料已清理");

  await browser.close();

  // ── 結果 ──
  console.log("\n=== 驗證結果 ===");
  let allPass = true;
  for (const c of checks) {
    console.log(`${c.pass ? "✅" : "❌"} ${c.label}`);
    if (!c.pass) allPass = false;
  }
  console.log();
  if (allPass) {
    console.log("✅ 全部通過");
  } else {
    console.log("❌ 有項目未通過");
    process.exit(1);
  }
}

main().catch(e => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
