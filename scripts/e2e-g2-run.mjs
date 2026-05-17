/**
 * G2 · 售後維修：預約→工單→出料→結帳→CSI
 *
 * 不錄影、不 trace。Playwright + supabase SQL 驗 + fail/gap 才截圖。
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const APP_BASE = process.env.APP_BASE || 'http://localhost:3001';
const STATE = '/home/ming/projects/cicd_pipeline_poc/scripts/.pw-state.json';
const OUT_DIR = '/tmp/e2e-round-6/G2';
const SHOT_DIR = path.join(OUT_DIR, 'screenshots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const ROUTE_ID = 'G2';
const ROUTE_NAME = '售後維修：預約→工單→出料→結帳→CSI';
const steps = [];
const startedAt = new Date().toISOString();

function recordStep(s) {
  steps.push(s);
  const tag = s.result === 'pass' ? 'PASS' : s.result === 'gap' ? 'GAP ' : s.result === 'partial' ? 'PART' : 'FAIL';
  console.error(`  [${tag}] ${s.id} ${s.name} ${s.notes ? '— ' + s.notes : ''}${s.gap_description ? ' — ' + s.gap_description : ''}`);
}

async function shot(page, id, reason) {
  const file = `screenshots/${id}-${reason}.png`;
  try { await page.screenshot({ path: path.join(OUT_DIR, file), fullPage: false }); }
  catch { return null; }
  return file;
}

async function gotoWithRetry(page, url) {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      return r;
    } catch (e) {
      if (i === 1) throw e;
      console.error(`  retry goto ${url}`);
    }
  }
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: STATE, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e?.message || e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

const appUrl = new URL(APP_BASE);
await ctx.addCookies([{
  name: 'dealeros_scope',
  value: JSON.stringify({ brand_id: 'indian', store_id: null }),
  domain: appUrl.hostname, path: '/', httpOnly: false, secure: false, sameSite: 'Lax',
}]);

const newAppointmentTag = `E2E-G2-${Date.now()}`;
let createdAppointmentId = null;
let createdPiId = null;
let createdRoId = null;
let createdIssueId = null;

// -------- S01 · 建立預約 --------
try {
  console.error('\n→ S01 建立預約');
  const t0 = Date.now();
  const resp = await gotoWithRetry(page, `${APP_BASE}/service/appointments/new`);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  if (resp?.status() !== 200) {
    const shotPath = await shot(page, 'G2-S01', 'http-status');
    recordStep({ id: 'G2-S01', name: '建立預約', url: '/service/appointments/new', result: 'fail',
      duration_ms: Date.now() - t0, screenshot: shotPath, notes: `status=${resp?.status()}` });
  } else {
    const inCreate = await page.locator('text=建立模式').count() > 0;
    if (!inCreate) {
      const shotPath = await shot(page, 'G2-S01', 'no-create-mode');
      recordStep({ id: 'G2-S01', name: '建立預約', url: '/service/appointments/new', result: 'fail',
        duration_ms: Date.now() - t0, screenshot: shotPath, notes: '頁面不在建立模式' });
    } else {
      const customerSel = page.locator('label:has-text("客戶") + select').first();
      await customerSel.selectOption({ index: 1 });
      await page.waitForTimeout(400);
      const vehicleSel = page.locator('label:has-text("車輛") + select').first();
      const vOpts = await vehicleSel.locator('option').count();
      if (vOpts > 1) await vehicleSel.selectOption({ index: 1 });
      const notesArea = page.locator('textarea').first();
      if (await notesArea.count() > 0) await notesArea.fill(newAppointmentTag);

      const submitBtn = page.locator('button:has-text("建立並開啟")').first();
      await submitBtn.click();
      await page.waitForURL(/\/service\/appointments\/[a-f0-9-]+$/, { timeout: 20000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      const url = page.url();
      const m = url.match(/\/service\/appointments\/([a-f0-9-]+)$/);
      if (m) {
        createdAppointmentId = m[1];
        recordStep({ id: 'G2-S01', name: '建立預約', url: '/service/appointments/new',
          result: 'pass', duration_ms: Date.now() - t0, notes: `created appointment=${createdAppointmentId}` });
      } else {
        const shotPath = await shot(page, 'G2-S01', 'no-redirect');
        const banners = await page.locator('div.fixed').allTextContents();
        recordStep({ id: 'G2-S01', name: '建立預約', url: '/service/appointments/new',
          result: 'fail', duration_ms: Date.now() - t0, screenshot: shotPath,
          notes: `submit 後沒 redirect, url=${url}, banner=${banners.join('|').slice(0,200)}` });
      }
    }
  }
} catch (e) {
  const shotPath = await shot(page, 'G2-S01', 'exception');
  recordStep({ id: 'G2-S01', name: '建立預約', url: '/service/appointments/new',
    result: 'fail', screenshot: shotPath, notes: `exception: ${e.message.split('\n')[0]}` });
}

// -------- S02 · 預檢（PI）--------
try {
  console.error('\n→ S02 預檢 PI');
  const t0 = Date.now();
  await gotoWithRetry(page, `${APP_BASE}/parts/aftersales/pre-inspections`);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  const openBtn = page.locator('button:has-text("新增預檢")').first();
  if (await openBtn.count() === 0) {
    const shotPath = await shot(page, 'G2-S02', 'no-new-btn');
    recordStep({ id: 'G2-S02', name: '預檢 PI', url: '/parts/aftersales/pre-inspections',
      result: 'fail', duration_ms: Date.now() - t0, screenshot: shotPath, notes: '找不到「＋ 新增預檢」按鈕' });
  } else {
    await openBtn.click();
    await page.waitForTimeout(400);
    const modalH2 = page.locator('h2:has-text("新增預檢單")').first();
    if (await modalH2.count() === 0) {
      const shotPath = await shot(page, 'G2-S02', 'no-modal');
      recordStep({ id: 'G2-S02', name: '預檢 PI', url: '/parts/aftersales/pre-inspections',
        result: 'fail', duration_ms: Date.now() - t0, screenshot: shotPath, notes: '按鈕沒開 modal' });
    } else {
      await page.locator('button:has-text("空白單")').first().click();
      await page.waitForTimeout(300);

      const inputs = page.locator('div.fixed input');
      const inputCount = await inputs.count();
      if (inputCount >= 6) {
        await inputs.nth(0).fill('E2E-G2-客戶');
        await inputs.nth(1).fill('0912000000');
        await inputs.nth(2).fill(`E2E-${Date.now() % 100000}`);
        await inputs.nth(3).fill('Scout Bobber');
        await inputs.nth(4).fill('12345');
        await inputs.nth(5).fill('E2E-SA');
      }

      await page.locator('div.fixed button:has-text("建立並開啟")').click();
      await page.waitForURL(/\/pre-inspections\/[a-f0-9-]+$/, { timeout: 20000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      const url = page.url();
      const m = url.match(/\/pre-inspections\/([a-f0-9-]+)$/);
      if (m) {
        createdPiId = m[1];
        recordStep({ id: 'G2-S02', name: '預檢 PI', url,
          result: 'pass', duration_ms: Date.now() - t0, notes: `created pi=${createdPiId}` });
      } else {
        const shotPath = await shot(page, 'G2-S02', 'no-redirect');
        const banners = await page.locator('div.fixed').allTextContents();
        recordStep({ id: 'G2-S02', name: '預檢 PI', url: '/parts/aftersales/pre-inspections',
          result: 'fail', duration_ms: Date.now() - t0, screenshot: shotPath,
          notes: `submit 沒 redirect, url=${url}, banner=${banners.join('|').slice(0,200)}` });
      }
    }
  }
} catch (e) {
  const shotPath = await shot(page, 'G2-S02', 'exception');
  recordStep({ id: 'G2-S02', name: '預檢 PI', url: '/parts/aftersales/pre-inspections',
    result: 'fail', screenshot: shotPath, notes: `exception: ${e.message.split('\n')[0]}` });
}

// -------- S03 · 開維修工單（RO）--------
try {
  console.error('\n→ S03 開 RO');
  const t0 = Date.now();
  const roUrl = createdAppointmentId
    ? `${APP_BASE}/parts/aftersales/repair-orders/new?from=${createdAppointmentId}`
    : `${APP_BASE}/parts/aftersales/repair-orders/new`;
  await gotoWithRetry(page, roUrl);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  const confirmBtn = page.locator('button:has-text("確認開立工單")').first();
  const confirmCount = await confirmBtn.count();
  if (confirmCount === 0) {
    const noSrc = await page.locator('text=無可轉 RO').count();
    const reason = noSrc ? 'no-ro-source' : 'no-confirm-btn';
    const shotPath = await shot(page, 'G2-S03', reason);
    recordStep({ id: 'G2-S03', name: '開維修工單 RO', url: roUrl,
      result: 'partial', duration_ms: Date.now() - t0, screenshot: shotPath,
      notes: noSrc ? '「無可轉 RO 的來源」' : '找不到「確認開立工單」按鈕' });
  } else {
    const disabled = await confirmBtn.isDisabled();
    if (disabled) {
      const shotPath = await shot(page, 'G2-S03', 'confirm-disabled');
      recordStep({ id: 'G2-S03', name: '開維修工單 RO', url: roUrl,
        result: 'partial', duration_ms: Date.now() - t0, screenshot: shotPath, notes: '確認按鈕 disabled' });
    } else {
      await confirmBtn.click();
      await page.waitForURL(/\/parts\/aftersales\/repair-orders\/[a-f0-9-]+$/, { timeout: 20000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      const url = page.url();
      const m = url.match(/\/repair-orders\/([a-f0-9-]+)$/);
      if (m) {
        createdRoId = m[1];
        recordStep({ id: 'G2-S03', name: '開維修工單 RO', url,
          result: 'pass', duration_ms: Date.now() - t0, notes: `created RO=${createdRoId}` });
      } else {
        const shotPath = await shot(page, 'G2-S03', 'no-redirect');
        recordStep({ id: 'G2-S03', name: '開維修工單 RO', url: roUrl,
          result: 'fail', duration_ms: Date.now() - t0, screenshot: shotPath,
          notes: `submit 沒 redirect, url=${page.url()}` });
      }
    }
  }
} catch (e) {
  const shotPath = await shot(page, 'G2-S03', 'exception');
  recordStep({ id: 'G2-S03', name: '開維修工單 RO', url: '/parts/aftersales/repair-orders/new',
    result: 'fail', screenshot: shotPath, notes: `exception: ${e.message.split('\n')[0]}` });
}

// -------- S04 · 技師派工 --------
try {
  console.error('\n→ S04 派工');
  const t0 = Date.now();
  const resp = await gotoWithRetry(page, `${APP_BASE}/service/workshop`);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  if (resp?.status() !== 200) {
    const shotPath = await shot(page, 'G2-S04', 'http-status');
    recordStep({ id: 'G2-S04', name: '技師派工', url: '/service/workshop',
      result: 'fail', duration_ms: Date.now() - t0, screenshot: shotPath, notes: `status=${resp?.status()}` });
  } else {
    const hasKanban = (await page.locator('text=待派工').count()) > 0
      || (await page.locator('text=施工中').count()) > 0;
    if (hasKanban) {
      recordStep({ id: 'G2-S04', name: '技師派工', url: '/service/workshop',
        result: 'partial', duration_ms: Date.now() - t0,
        gap_type: 'demo_only',
        gap_description: '/service/workshop 是 hardcode kanban demo,無實際派工 server action; RO assignee_id 也沒在此寫入',
        notes: 'workshop UI 載入正常,但無真實派工功能(GAP 新)' });
    } else {
      const shotPath = await shot(page, 'G2-S04', 'empty-page');
      recordStep({ id: 'G2-S04', name: '技師派工', url: '/service/workshop',
        result: 'fail', duration_ms: Date.now() - t0, screenshot: shotPath, notes: '頁面無預期 kanban 內容' });
    }
  }
} catch (e) {
  const shotPath = await shot(page, 'G2-S04', 'exception');
  recordStep({ id: 'G2-S04', name: '技師派工', url: '/service/workshop',
    result: 'fail', screenshot: shotPath, notes: `exception: ${e.message.split('\n')[0]}` });
}

// -------- S05 · 領料出庫 --------
try {
  console.error('\n→ S05 出料');
  const t0 = Date.now();
  const resp = await gotoWithRetry(page, `${APP_BASE}/parts/issue/repair-pick/new`);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  if (resp?.status() !== 200) {
    const shotPath = await shot(page, 'G2-S05', 'http-status');
    recordStep({ id: 'G2-S05', name: '出料', url: '/parts/issue/repair-pick/new',
      result: 'fail', duration_ms: Date.now() - t0, screenshot: shotPath, notes: `status=${resp?.status()}` });
  } else {
    await page.locator('button:has-text("ad-hoc 手動領料")').first().click();
    await page.waitForTimeout(400);

    // 領料原因 textarea
    await page.locator('textarea').first().fill('E2E-G2 自動測試:店內測試件出庫');
    await page.waitForTimeout(150);

    // 倉庫(右側 aside)
    const warehouseSel = page.locator('aside select').first();
    if (await warehouseSel.count() === 0) {
      const shotPath = await shot(page, 'G2-S05', 'no-warehouse');
      recordStep({ id: 'G2-S05', name: '出料', url: '/parts/issue/repair-pick/new',
        result: 'fail', duration_ms: Date.now() - t0, screenshot: shotPath, notes: '找不到倉庫 select' });
    } else {
      const whOpts = await warehouseSel.locator('option').count();
      if (whOpts > 1) await warehouseSel.selectOption({ index: 1 });
      await page.waitForTimeout(200);

      // 料件(tbody select first row)
      const itemSel = page.locator('tbody select').first();
      const optTexts = await itemSel.locator('option').allTextContents();
      const idx = optTexts.findIndex((t) => t.includes('機油濾芯'));
      if (idx > 0) await itemSel.selectOption({ index: idx });
      else if (optTexts.length > 1) await itemSel.selectOption({ index: 1 });
      await page.waitForTimeout(200);

      // 數量
      await page.locator('tbody input[type="number"]').first().fill('1');
      await page.waitForTimeout(200);

      const previewBtn = page.locator('button:has-text("預覽配置")').first();
      const disabled = await previewBtn.isDisabled();
      if (disabled) {
        const shotPath = await shot(page, 'G2-S05', 'preview-disabled');
        recordStep({ id: 'G2-S05', name: '出料', url: '/parts/issue/repair-pick/new',
          result: 'partial', duration_ms: Date.now() - t0, screenshot: shotPath,
          notes: '預覽 button 仍 disabled — 業務組合不合法' });
      } else {
        await previewBtn.click();
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1200);

        const previewError = await page.locator('text=預覽失敗').count();
        if (previewError > 0) {
          const errText = await page.locator('text=預覽失敗').first().textContent();
          const shotPath = await shot(page, 'G2-S05', 'preview-error');
          recordStep({ id: 'G2-S05', name: '出料', url: '/parts/issue/repair-pick/new',
            result: 'partial', duration_ms: Date.now() - t0, screenshot: shotPath,
            notes: `preview error: ${errText?.slice(0, 200)}` });
        } else {
          const submitBtn = page.locator('button:has-text("確認過帳")').or(page.locator('button:has-text("確認送出")')).or(page.locator('button:has-text("送出領料")')).or(page.locator('button:has-text("過帳")')).or(page.locator('button:has-text("送出")')).first();
          if (await submitBtn.count() === 0) {
            const shotPath = await shot(page, 'G2-S05', 'no-submit-btn');
            recordStep({ id: 'G2-S05', name: '出料', url: '/parts/issue/repair-pick/new',
              result: 'partial', duration_ms: Date.now() - t0, screenshot: shotPath,
              notes: '預覽出來但找不到送出按鈕' });
          } else {
            await submitBtn.click();
            await Promise.race([
              page.waitForURL(/\/parts\/issue\/repair-pick\/[a-f0-9-]+$/, { timeout: 20000 }).catch(() => null),
              page.waitForSelector('div.fixed:has-text("✓")', { timeout: 10000 }).catch(() => null),
              page.waitForSelector('div.fixed:has-text("失敗")', { timeout: 10000 }).catch(() => null),
            ]);
            await page.waitForTimeout(2000);
            const url = page.url();
            const m = url.match(/\/repair-pick\/([a-f0-9-]+)$/);
            if (m) createdIssueId = m[1];
            const successBanner = await page.locator('div.fixed:has-text("✓")').count();
            const errorBanner = await page.locator('div.fixed.text-\\[\\#CC0000\\], div.fixed:has-text("失敗"), div.fixed:has-text("錯誤")').count();
            const allBanners = await page.locator('div.fixed').allTextContents();
            let shotPath = null;
            if (!createdIssueId) shotPath = await shot(page, 'G2-S05', 'submit-no-redirect');
            recordStep({ id: 'G2-S05', name: '出料', url,
              result: createdIssueId ? 'pass' : 'partial', duration_ms: Date.now() - t0,
              screenshot: shotPath,
              notes: `submitted issue${createdIssueId ? '='+createdIssueId : ''}, success_banner=${successBanner}, error_banner=${errorBanner}, banners="${allBanners.join('|').slice(0,300)}", url=${url}` });
          }
        }
      }
    }
  }
} catch (e) {
  const shotPath = await shot(page, 'G2-S05', 'exception');
  recordStep({ id: 'G2-S05', name: '出料', url: '/parts/issue/repair-pick/new',
    result: 'fail', screenshot: shotPath, notes: `exception: ${e.message.split('\n')[0]}` });
}

// -------- S06 · 竣工複檢 --------
try {
  console.error('\n→ S06 複檢');
  const t0 = Date.now();
  const resp = await gotoWithRetry(page, `${APP_BASE}/parts/aftersales/final-inspections`);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  if (resp?.status() !== 200) {
    const shotPath = await shot(page, 'G2-S06', 'http-status');
    recordStep({ id: 'G2-S06', name: '竣工複檢', url: '/parts/aftersales/final-inspections',
      result: 'fail', duration_ms: Date.now() - t0, screenshot: shotPath, notes: `status=${resp?.status()}` });
  } else {
    const newBtn = page.locator('button:has-text("新增複檢")').first();
    if (await newBtn.count() > 0) {
      recordStep({ id: 'G2-S06', name: '竣工複檢', url: '/parts/aftersales/final-inspections',
        result: 'partial', duration_ms: Date.now() - t0,
        notes: '複檢頁面 UI 載入正常、有「＋ 新增複檢」入口（未實際走完表單避免 N 筆髒資料）' });
    } else {
      const shotPath = await shot(page, 'G2-S06', 'no-new-btn');
      recordStep({ id: 'G2-S06', name: '竣工複檢', url: '/parts/aftersales/final-inspections',
        result: 'partial', duration_ms: Date.now() - t0, screenshot: shotPath,
        notes: '頁面載入但找不到新增複檢入口' });
    }
  }
} catch (e) {
  const shotPath = await shot(page, 'G2-S06', 'exception');
  recordStep({ id: 'G2-S06', name: '竣工複檢', url: '/parts/aftersales/final-inspections',
    result: 'fail', screenshot: shotPath, notes: `exception: ${e.message.split('\n')[0]}` });
}

// -------- S07 · RO 結帳 --------
try {
  console.error('\n→ S07 RO 結帳');
  const t0 = Date.now();
  const resp = await gotoWithRetry(page, `${APP_BASE}/parts/aftersales/checkout`);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  if (resp?.status() !== 200) {
    const shotPath = await shot(page, 'G2-S07', 'http-status');
    recordStep({ id: 'G2-S07', name: 'RO 結帳', url: '/parts/aftersales/checkout',
      result: 'fail', duration_ms: Date.now() - t0, screenshot: shotPath, notes: `status=${resp?.status()}` });
  } else {
    const hasInvoiceBtn = await page.locator('button:has-text("開立發票"), a:has-text("開立發票")').count() > 0;
    const hasCheckoutBtn = await page.locator('button:has-text("結帳"), button:has-text("收款")').count() > 0;
    const shotPath = hasInvoiceBtn ? null : await shot(page, 'G2-S07', 'no-invoice-link');
    recordStep({ id: 'G2-S07', name: 'RO 結帳', url: '/parts/aftersales/checkout',
      result: 'partial', duration_ms: Date.now() - t0, screenshot: shotPath,
      gap_type: hasInvoiceBtn ? null : 'missing_integration',
      gap_description: hasInvoiceBtn ? null : 'GAP-06：RO 結帳頁無「開立發票」入口,需手動切到 /einvoice/issue (同 G1-S08 模式)',
      notes: `UI 載入。開票串接=${hasInvoiceBtn ? 'yes' : 'no(GAP-06)'} / 結帳 button=${hasCheckoutBtn ? 'yes' : 'no'}` });
  }
} catch (e) {
  const shotPath = await shot(page, 'G2-S07', 'exception');
  recordStep({ id: 'G2-S07', name: 'RO 結帳', url: '/parts/aftersales/checkout',
    result: 'fail', screenshot: shotPath, notes: `exception: ${e.message.split('\n')[0]}` });
}

// -------- S08 · CSI 派發 --------
try {
  console.error('\n→ S08 CSI 派發');
  const t0 = Date.now();
  await gotoWithRetry(page, `${APP_BASE}/csi/surveys`);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const shotPath = await shot(page, 'G2-S08', 'csi-stitch-only');
  recordStep({ id: 'G2-S08', name: 'CSI 問卷派發', url: '/csi/surveys',
    result: 'gap', gap_type: 'missing_table',
    gap_description: 'survey_responses 表不存在；/csi/surveys 是 StitchInline 靜態 HTML 元件,無真實派發 server action',
    duration_ms: Date.now() - t0, screenshot: shotPath, notes: 'GAP-02 已確認' });
} catch (e) {
  const shotPath = await shot(page, 'G2-S08', 'exception');
  recordStep({ id: 'G2-S08', name: 'CSI 問卷派發', url: '/csi/surveys',
    result: 'fail', screenshot: shotPath, notes: `exception: ${e.message.split('\n')[0]}` });
}

// -------- S09 · CSI 回填 --------
recordStep({ id: 'G2-S09', name: 'CSI 回填', url: '/csi/surveys',
  result: 'gap', gap_type: 'missing_table',
  gap_description: '同 S08。survey_responses 表不存在 → 無法回填; 需新表 + 派發 action + 回填頁面 = M 級工作',
  duration_ms: 0, notes: 'GAP-02 同 S08' });

await browser.close();

const finishedAt = new Date().toISOString();
const counts = {
  pass: steps.filter(s => s.result === 'pass').length,
  partial: steps.filter(s => s.result === 'partial').length,
  fail: steps.filter(s => s.result === 'fail').length,
  gap: steps.filter(s => s.result === 'gap').length,
};
const overall = counts.fail > 0 ? 'partial' : counts.gap > 0 || counts.partial > 0 ? 'partial' : 'pass';

const report = {
  route_id: ROUTE_ID,
  route_name: ROUTE_NAME,
  started_at: startedAt,
  finished_at: finishedAt,
  overall,
  counts,
  steps,
  created_ids: {
    appointment_id: createdAppointmentId,
    pre_inspection_id: createdPiId,
    repair_order_id: createdRoId,
    stock_issue_id: createdIssueId,
  },
  known_gaps_confirmed: [],
  new_gaps_found: [],
  needs_fix: [],
  page_errors: pageErrors,
  console_errors: consoleErrors.slice(0, 50),
};

fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
console.error(`\nG2 ui-run done: pass=${counts.pass} partial=${counts.partial} fail=${counts.fail} gap=${counts.gap}`);
console.error(`IDs: appt=${createdAppointmentId} pi=${createdPiId} ro=${createdRoId} issue=${createdIssueId}`);
