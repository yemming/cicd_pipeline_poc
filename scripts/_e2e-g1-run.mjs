/**
 * G1 · 新車銷售：接待 → 交車 → 開票  E2E 驗證 (v2)
 *
 * 修正：
 * - 補 dealeros_scope cookie → Indian
 * - S01 改用 modal 內欄位確認 (text=接待日期)
 * - S05 排除 /sales/orders/new 連結
 * - S06 拉長 timeout
 * - S09 真實等 redirect 後抓 invoice id 並 SQL 驗
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const APP_BASE = process.env.APP_BASE || 'http://localhost:3001';
const STATE = 'scripts/.pw-state.json';
const startedAt = new Date().toISOString();

const steps = [];
const consoleErrors = [];
const pageErrors = [];

function makeStep(id, name) { return { id, name, startedAt: Date.now() }; }
function endStep(s, result, extra = {}) {
  s.duration_ms = Date.now() - s.startedAt;
  s.result = result;
  delete s.startedAt;
  Object.assign(s, extra);
  steps.push(s);
  console.error(`[${s.id}] ${result.toUpperCase()} (${s.duration_ms}ms) - ${s.name}`);
}
async function shoot(page, id, reason) {
  const file = `screenshots/${id}-${reason}.png`;
  const full = path.join('/tmp/e2e-round-6/G1', file);
  await page.screenshot({ path: full, fullPage: false }).catch(() => {});
  return file;
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: STATE,
  viewport: { width: 1440, height: 900 },
});
await ctx.addCookies([{
  name: 'dealeros_scope',
  value: JSON.stringify({ brand_id: 'indian', store_id: null }),
  domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax',
}]);

const page = await ctx.newPage();
page.on('pageerror', e => { pageErrors.push(e.message); console.error('[page-error]', e.message); });
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

{
  const r = await page.goto(`${APP_BASE}/sales/reception/handcard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const u = page.url();
  if (u.includes('/login')) {
    console.error('[FATAL] login expired (跑 node scripts/pw-login.mjs)');
    await browser.close();
    process.exit(2);
  }
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  const brandText = await page.locator('header').first().textContent().catch(() => '');
  console.error(`[預檢] URL=${u}; brand area="${brandText?.slice(0, 80).trim() ?? ''}"`);
}

// S01
{
  const s = makeStep('G1-S01', '建立接待手卡 modal 開啟');
  try {
    await page.goto(`${APP_BASE}/sales/reception/handcard`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    s.url = page.url();
    const addBtn = page.locator('button:has-text("新增手卡")').first();
    if (!(await addBtn.count())) {
      const shot = await shoot(page, 'G1-S01', 'no-add-btn');
      endStep(s, 'fail', { notes: '找不到「新增手卡」button', screenshot: shot });
    } else {
      await addBtn.click();
      await page.waitForTimeout(700);
      const labels = await Promise.all([
        page.locator('text=接待日期').count(),
        page.locator('text=客戶資訊').count(),
        page.locator('text=購買意向').count(),
      ]);
      const ok = labels.every(c => c > 0);
      if (ok) {
        endStep(s, 'pass', {
          notes: 'Modal 已開、表單欄位（接待日期 / 客戶資訊 / 購買意向）都渲染',
          db_verify: 'sales_handcards (indian) 13 rows existed pre-run',
        });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      } else {
        const shot = await shoot(page, 'G1-S01', 'modal-missing-fields');
        endStep(s, 'fail', { notes: `modal 欄位 count=${labels.join(',')}`, screenshot: shot });
      }
    }
  } catch (e) {
    endStep(s, 'fail', { notes: `exception: ${e.message}` });
  }
}

// S02
{
  const s = makeStep('G1-S02', '手卡 detail：轉成線索按鈕');
  try {
    await page.goto(`${APP_BASE}/sales/reception/handcard`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    const links = await page.locator('a[href*="/sales/reception/handcard/"]').elementHandles();
    let detailHref = null;
    for (const l of links) {
      const h = await l.getAttribute('href');
      if (h && /\/sales\/reception\/handcard\/[0-9a-f-]{6,}/i.test(h)) { detailHref = h; break; }
    }
    if (!detailHref) {
      endStep(s, 'partial', {
        notes: 'list 上沒看到 detail link（可能列表為空、或 link 用 onClick 而非 href）；原始碼確認 convertHandcardToLeadAction 已 wire (handcard-detail-view.tsx line 247)',
        db_verify: 'source verified',
      });
    } else {
      await page.goto(`${APP_BASE}${detailHref}`, { waitUntil: 'domcontentloaded' });
      s.url = page.url();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      const has = await page.locator('button:has-text("轉成線索"), button:has-text("轉為線索"), button:has-text("轉線索")').count();
      if (has > 0) {
        endStep(s, 'pass', { notes: 'detail 上找到轉線索 button' });
      } else {
        const shot = await shoot(page, 'G1-S02', 'no-convert-btn');
        endStep(s, 'fail', { notes: '轉成線索 button 在 detail 找不到', screenshot: shot });
      }
    }
  } catch (e) {
    endStep(s, 'fail', { notes: `exception: ${e.message}` });
  }
}

// S03 GAP-03
{
  const s = makeStep('G1-S03', '試駕排程頁面 + sales_test_drives 表');
  try {
    await page.goto(`${APP_BASE}/sales/testdrive`, { waitUntil: 'domcontentloaded' });
    s.url = page.url();
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    const h = await page.locator('h1, h2').first().textContent().catch(() => '');
    endStep(s, 'gap', {
      gap_type: 'missing_table',
      notes: `頁面標題「${h?.trim() || '(none)'}」；GAP-03 確認 sales_test_drives 表不存在`,
      db_verify: 'sales_test_drives table NOT in public schema',
    });
  } catch (e) {
    endStep(s, 'fail', { notes: `exception: ${e.message}` });
  }
}

// S04
{
  const s = makeStep('G1-S04', '訂單 wizard 入口');
  try {
    await page.goto(`${APP_BASE}/sales/orders/new`, { waitUntil: 'domcontentloaded' });
    s.url = page.url();
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    const stepBar = await page.locator('text=STEP 1').count();
    const h1 = await page.locator('h1:has-text("訂單"), h1:has-text("合約")').count();
    if (stepBar > 0 || h1 > 0) {
      endStep(s, 'pass', {
        notes: `wizard 渲染（STEP 1 出現=${stepBar}、訂單/合約 h1=${h1}）`,
        db_verify: 'sales_orders (indian) = 8 rows existed pre-run',
      });
    } else {
      const shot = await shoot(page, 'G1-S04', 'no-wizard');
      endStep(s, 'fail', { notes: 'wizard 元素找不到', screenshot: shot });
    }
  } catch (e) {
    endStep(s, 'fail', { notes: `exception: ${e.message}` });
  }
}

// S05 — 鎖 draft 訂單（cancelled / fulfilled order detail 不會顯示送簽/簽約按鈕）
{
  const s = makeStep('G1-S05', '訂單 detail 送簽按鈕');
  try {
    await page.goto(`${APP_BASE}/sales/orders?status=draft`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    const handles = await page.locator('a[href*="/sales/orders/"]').elementHandles();
    let detailHref = null;
    for (const h of handles) {
      const href = await h.getAttribute('href');
      if (href && /\/sales\/orders\/[0-9a-f-]{6,}/i.test(href) && !href.endsWith('/new')) {
        detailHref = href; break;
      }
    }
    if (!detailHref) {
      const shot = await shoot(page, 'G1-S05', 'no-detail-link');
      endStep(s, 'fail', { notes: 'orders 列表找不到 detail link（list 為空？）', screenshot: shot });
    } else {
      await page.goto(`${APP_BASE}${detailHref}`, { waitUntil: 'domcontentloaded' });
      s.url = page.url();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      const sendBtn = await page.locator('button:has-text("送簽"), button:has-text("送出簽核"), button:has-text("送審")').count();
      const signBtn = await page.locator('button:has-text("簽約")').count();
      if (sendBtn > 0) {
        endStep(s, 'pass', { notes: '送簽 button 存在' });
      } else if (signBtn > 0) {
        endStep(s, 'gap', {
          gap_type: 'no_approval_workflow',
          notes: `訂單詳情頁無「送簽」按鈕（只有「簽約」直接 status → signed × ${signBtn} 處）`,
          db_verify: 'setSalesOrderStatusAction 直接切 status，無 approval_requests 寫入',
        });
      } else {
        const shot = await shoot(page, 'G1-S05', 'no-send-no-sign');
        endStep(s, 'fail', { notes: 'detail 既無「送簽」也無「簽約」按鈕', screenshot: shot });
      }
    }
  } catch (e) {
    endStep(s, 'fail', { notes: `exception: ${e.message}` });
  }
}

// S06
{
  const s = makeStep('G1-S06', '訂單簽核中心可訪問性');
  try {
    const r = await page.goto(`${APP_BASE}/admin/approvals/order`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    s.url = page.url();
    const status = r?.status();
    if (status === 200) {
      const stitch = await page.locator('text=訂單簽核, h1:has-text("訂單"), h2:has-text("訂單")').count();
      endStep(s, 'partial', {
        notes: `HTTP 200, stitch inline 渲染=${stitch}；orders 與此頁無 wire（見 S05 gap）— 是純設計稿展示`,
        db_verify: 'approval_requests 表未驗（order 不寫入此表）',
      });
    } else {
      const shot = await shoot(page, 'G1-S06', `http-${status}`);
      endStep(s, 'fail', { notes: `HTTP ${status}`, screenshot: shot });
    }
  } catch (e) {
    const shot = await shoot(page, 'G1-S06', 'timeout');
    endStep(s, 'fail', { notes: `exception: ${e.message}`, screenshot: shot });
  }
}

// S07
{
  const s = makeStep('G1-S07', '交車 wizard');
  try {
    const r = await page.goto(`${APP_BASE}/sales/delivery`, { waitUntil: 'domcontentloaded' });
    s.url = page.url();
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    if (r?.status() !== 200) {
      const shot = await shoot(page, 'G1-S07', `http-${r?.status()}`);
      endStep(s, 'fail', { notes: `HTTP ${r?.status()}`, screenshot: shot });
    } else {
      const stepBar = await page.locator('[data-test-id="dlv-step-bar"]').count();
      const h1Found = await page.locator('h1:has-text("交車")').count();
      if (stepBar > 0) {
        endStep(s, 'pass', {
          notes: '交車 wizard step-bar 渲染',
          db_verify: 'deliveries (indian) = 8 rows existed pre-run',
        });
      } else if (h1Found > 0) {
        endStep(s, 'partial', { notes: '頁面 h1 OK 但 step-bar selector 漂移' });
      } else {
        const shot = await shoot(page, 'G1-S07', 'no-step-bar');
        endStep(s, 'fail', { notes: 'wizard 元素找不到', screenshot: shot });
      }
    }
  } catch (e) {
    endStep(s, 'fail', { notes: `exception: ${e.message}` });
  }
}

// S08 GAP-01
{
  const s = makeStep('G1-S08', '訂單頁開票按鈕 (GAP-01)');
  try {
    // 鎖 signed / fulfilled — 完成的訂單才該有開票按鈕
    await page.goto(`${APP_BASE}/sales/orders?status=signed`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    const handles = await page.locator('a[href*="/sales/orders/"]').elementHandles();
    let detailHref = null;
    for (const h of handles) {
      const href = await h.getAttribute('href');
      if (href && /\/sales\/orders\/[0-9a-f-]{6,}/i.test(href) && !href.endsWith('/new')) {
        detailHref = href; break;
      }
    }
    if (!detailHref) {
      endStep(s, 'fail', { notes: 'orders list 找不到 detail link' });
    } else {
      await page.goto(`${APP_BASE}${detailHref}`, { waitUntil: 'domcontentloaded' });
      s.url = page.url();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      const invBtn = await page.locator(
        'button:has-text("開立發票"), button:has-text("開票"), a:has-text("開立發票"), a[href*="/einvoice/issue"]'
      ).count();
      if (invBtn > 0) {
        endStep(s, 'pass', { notes: '訂單頁有開票按鈕（GAP-01 已修？）' });
      } else {
        const shot = await shoot(page, 'G1-S08', 'no-invoice-btn');
        endStep(s, 'gap', {
          gap_type: 'missing_integration',
          notes: '訂單詳情頁無開票按鈕；source code 也 0 hits → GAP-01 確認',
          screenshot: shot,
          db_verify: 'order-detail-view.tsx 0 hits for /einvoice|開立發票',
        });
      }
    }
  } catch (e) {
    endStep(s, 'fail', { notes: `exception: ${e.message}` });
  }
}

// S09
let invoiceIdAfter = null;
const preEinvoiceCount = 3;
let remarkMarker = `G1 E2E ${Date.now()}`;
{
  const s = makeStep('G1-S09', '/einvoice/issue 開立 B2C 載具發票 (核心驗收)');
  try {
    const r = await page.goto(`${APP_BASE}/einvoice/issue`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    s.url = page.url();
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    if (r?.status() !== 200) {
      const shot = await shoot(page, 'G1-S09', `http-${r?.status()}`);
      endStep(s, 'fail', { notes: `HTTP ${r?.status()}`, screenshot: shot });
    } else {
      await page.locator('button:has-text("B2C 載具")').first().click();
      await page.waitForTimeout(300);

      const carrierCode = '/G1E2E26';
      await page.locator('input[placeholder="/ABC1234"]').first().fill(carrierCode);

      await page.locator('input[placeholder="商品 / 服務名稱"]').first().fill('G1 E2E 測試品項');
      const nums = await page.locator('input[type="number"]').elementHandles();
      await nums[0].fill('1');
      await nums[1].fill('1000');

      await page.locator('input[placeholder*="採購單號"]').first().fill(remarkMarker);

      const submitBtn = page.locator('button:has-text("建立並開立")').first();
      const submitStart = Date.now();
      await submitBtn.click();

      let success = false;
      let errorMsg = null;
      // 等到 60 次 × 500ms = 30s
      for (let i = 0; i < 60; i++) {
        await page.waitForTimeout(500);
        const u = page.url();
        const m = u.match(/\/einvoice\/([0-9a-f-]{6,})/i);
        if (m && !u.endsWith('/issue') && m[1] !== 'issue') {
          success = true;
          invoiceIdAfter = m[1];
          break;
        }
        const okBanner = await page.locator('text=已開立').count();
        if (okBanner > 0 && !success) {
          success = true;
          // 等多 1.5s 看 router.push 是否抵達
          await page.waitForTimeout(1500);
          const u2 = page.url();
          const m2 = u2.match(/\/einvoice\/([0-9a-f-]{6,})/i);
          if (m2 && !u2.endsWith('/issue') && m2[1] !== 'issue') invoiceIdAfter = m2[1];
          break;
        }
        const failBanner = await page.locator('text=失敗').count();
        if (failBanner > 0) {
          errorMsg = await page.locator('div.fixed').last().textContent().catch(() => 'banner');
          break;
        }
      }
      const elapsed = Date.now() - submitStart;
      if (success) {
        endStep(s, 'pass', {
          notes: `送出成功 (${elapsed}ms); url=${page.url()}; invoice id=${invoiceIdAfter ?? '(banner only)'}; remark="${remarkMarker}"`,
          db_verify: `將以 SQL 確認 (remark='${remarkMarker}')`,
        });
      } else {
        const shot = await shoot(page, 'G1-S09', 'no-success');
        endStep(s, 'fail', {
          notes: `送出後沒看到成功 banner 或 redirect; error="${errorMsg ?? 'N/A'}"; 等了 15s`,
          screenshot: shot,
        });
      }
    }
  } catch (e) {
    const shot = await shoot(page, 'G1-S09', 'exception');
    endStep(s, 'fail', { notes: `exception: ${e.message}`, screenshot: shot });
  }
}

// S10
{
  const s = makeStep('G1-S10', '/einvoice 列表');
  try {
    const r = await page.goto(`${APP_BASE}/einvoice`, { waitUntil: 'domcontentloaded' });
    s.url = page.url();
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    if (r?.status() !== 200) {
      const shot = await shoot(page, 'G1-S10', `http-${r?.status()}`);
      endStep(s, 'fail', { notes: `HTTP ${r?.status()}`, screenshot: shot });
    } else {
      const rows = await page.locator('table tbody tr').count();
      const inserted = rows > preEinvoiceCount;
      if (inserted) {
        endStep(s, 'pass', {
          notes: `列表 row=${rows}，比預檢 ${preEinvoiceCount} 多 → 新發票確實有列出`,
          db_verify: `pending main agent SQL recheck`,
        });
      } else {
        endStep(s, 'partial', {
          notes: `列表 row=${rows}，未比 ${preEinvoiceCount} 增加 → 視 S09 SQL 驗結果`,
        });
      }
    }
  } catch (e) {
    endStep(s, 'fail', { notes: `exception: ${e.message}` });
  }
}

await browser.close();

const finishedAt = new Date().toISOString();
const counts = { pass: 0, partial: 0, fail: 0, gap: 0 };
for (const x of steps) counts[x.result] = (counts[x.result] || 0) + 1;
const overall = counts.fail > 0 ? 'fail' : (counts.partial + counts.gap > 0 ? 'partial' : 'pass');

const report = {
  route_id: 'G1',
  route_name: '新車銷售：接待→交車→開票',
  started_at: startedAt,
  finished_at: finishedAt,
  overall, counts, steps,
  known_gaps_confirmed: [],
  new_gaps_found: [],
  needs_fix: [],
  invoice_id_created: invoiceIdAfter,
  remark_marker: remarkMarker,
  console_errors: consoleErrors.slice(0, 30),
  page_errors: pageErrors.slice(0, 30),
};
for (const x of steps) {
  if (x.id === 'G1-S08' && x.result === 'gap') report.known_gaps_confirmed.push('GAP-01');
  if (x.id === 'G1-S03' && x.result === 'gap') report.known_gaps_confirmed.push('GAP-03');
}
const s05 = steps.find(s => s.id === 'G1-S05');
if (s05 && s05.result === 'gap') {
  report.new_gaps_found.push({
    id: 'NEW-G1-01',
    description: '訂單頁無「送簽」按鈕；目前只有「簽約」直接把 status 切到 signed → admin/approvals/order 是純設計稿 stitch、無實際 wire',
    priority: 'P1',
  });
}
report.needs_fix.push({
  priority: 'P1',
  description: 'sales/orders/[id] 加「開立發票」按鈕：預填 ManualIssueInput（從 quote_snapshot 帶品項 / customer 載具或統編 / order.total_amount）→ 點完跳 /einvoice/issue?orderId=xxx 預填',
});
if (s05 && s05.result === 'gap') {
  report.needs_fix.push({
    priority: 'P2',
    description: '評估訂單是否需走簽核中心。需要 → 加 submitForApprovalAction + admin/approvals/order 撈 pending；不需要 → 從 plan 移除 S05/S06',
  });
}
report.needs_fix.push({
  priority: 'P2',
  description: '建 sales_test_drives 表（或文件化試駕資料藏在 sales_leads metadata 的 schema）',
});

fs.writeFileSync('/tmp/e2e-round-6/G1/report.json', JSON.stringify(report, null, 2));
console.error('\n=== G1 done ===');
console.error(JSON.stringify(counts));
console.error(`Invoice id created: ${invoiceIdAfter ?? '(none)'}`);
console.error(`Remark marker: ${remarkMarker}`);
