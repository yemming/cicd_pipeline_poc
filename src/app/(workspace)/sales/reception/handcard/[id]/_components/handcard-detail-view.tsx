'use client';

/**
 * 接待手卡 Detail View — view / edit / create 三 mode
 * 照 CLAUDE.md §Page View 規格實作。
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  createHandcardAction,
  updateHandcardAction,
  deleteHandcardAction,
  convertHandcardToLeadAction,
} from '@/lib/sales/handcard-actions';
import {
  HANDCARD_STATUS_LABEL,
  HANDCARD_STATUS_BADGE,
  LEAD_GRADE_BADGE,
  IDENTITY_LABEL,
  PURCHASE_TIMING_LABEL,
  TRIAL_STATUS_LABEL,
  RECEPTION_PERIOD_LABEL,
  type HandcardStatus,
  type HandcardLeadGrade,
  type HandcardIdentity,
  type HandcardPurchaseTiming,
  type HandcardTrialStatus,
  type HandcardReceptionPeriod,
} from '@/domain/sales-handcards.constants';
import type { HandcardRow, HandcardInput } from '@/domain/sales-handcards';

type Mode = 'view' | 'edit' | 'create';
type Banner = { ok: boolean; msg: string } | null;

const LIST_PATH = '/sales/reception/handcard';

// ── Small helpers ──────────────────────────────────────────────────────────
function Kv({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[#9A9890]">{label}</span>
      <span className={`text-[12.5px] text-[#2C2C2A] ${mono ? 'font-mono' : ''}`}>
        {value ?? <span className="text-[#9A9890]">—</span>}
      </span>
    </div>
  );
}

function StatusChip({ status }: { status: HandcardStatus }) {
  const { bg, fg } = HANDCARD_STATUS_BADGE[status] ?? { bg: '#F2F2F2', fg: '#6B6A68' };
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium"
      style={{ background: bg, color: fg }}
    >
      {HANDCARD_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function GradeChip({ grade }: { grade: HandcardLeadGrade | null }) {
  if (!grade) return null;
  const { bg, fg } = LEAD_GRADE_BADGE[grade];
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold"
      style={{ background: bg, color: fg }}
    >
      {grade}
    </span>
  );
}

const inputClass =
  'h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] text-[#2C2C2A] focus:outline-none focus:border-[#185FA5] bg-white w-full';
const labelClass = 'text-[11px] text-[#9A9890] font-medium';

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  return s.slice(0, 10);
}

// ── Main Component ─────────────────────────────────────────────────────────
export function HandcardDetailView({
  handcard,
  canEdit,
  initialMode = 'view',
}: {
  handcard: HandcardRow | null;
  canEdit: boolean;
  initialMode?: Mode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [banner, setBanner] = useState<Banner>(null);

  const isCreating = mode === 'create';
  const isEditing = mode === 'edit';

  // Form state
  const [form, setForm] = useState<Partial<HandcardInput>>({
    reception_date: handcard?.reception_date ?? new Date().toISOString().slice(0, 10),
    reception_period: handcard?.reception_period ?? null,
    customer_name: handcard?.customer_name ?? '',
    customer_phone: handcard?.customer_phone ?? null,
    customer_email: handcard?.customer_email ?? null,
    customer_identity: handcard?.customer_identity ?? null,
    assigned_rs_name: handcard?.assigned_rs_name ?? null,
    lead_grade: handcard?.lead_grade ?? null,
    intent_level: handcard?.intent_level ?? null,
    purchase_timing: handcard?.purchase_timing ?? null,
    intended_models: handcard?.intended_models ?? null,
    trial_status: handcard?.trial_status ?? null,
    competitor_brand: handcard?.competitor_brand ?? null,
    competitor_model: handcard?.competitor_model ?? null,
    quoted_amount: handcard?.quoted_amount ?? null,
    notes: handcard?.notes ?? null,
    status: handcard?.status ?? 'open',
  });

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function enterEdit() {
    if (!handcard) return;
    setForm({
      reception_date: handcard.reception_date,
      reception_period: handcard.reception_period,
      customer_name: handcard.customer_name,
      customer_phone: handcard.customer_phone,
      customer_email: handcard.customer_email,
      customer_identity: handcard.customer_identity,
      assigned_rs_name: handcard.assigned_rs_name,
      lead_grade: handcard.lead_grade,
      intent_level: handcard.intent_level,
      purchase_timing: handcard.purchase_timing,
      intended_models: handcard.intended_models,
      trial_status: handcard.trial_status,
      competitor_brand: handcard.competitor_brand,
      competitor_model: handcard.competitor_model,
      quoted_amount: handcard.quoted_amount,
      notes: handcard.notes,
      status: handcard.status,
    });
    setMode('edit');
  }

  function enterCreate() {
    setForm({
      reception_date: new Date().toISOString().slice(0, 10),
      reception_period: null,
      customer_name: '',
      customer_phone: null,
      customer_email: null,
      customer_identity: null,
      assigned_rs_name: null,
      lead_grade: null,
      intent_level: null,
      purchase_timing: null,
      intended_models: null,
      trial_status: null,
      competitor_brand: null,
      competitor_model: null,
      quoted_amount: null,
      notes: null,
      status: 'open',
    });
    setMode('create');
  }

  function cancelEdit() {
    if (isCreating) {
      router.push(LIST_PATH);
    } else {
      setMode('view');
    }
  }

  async function handleSave() {
    startTransition(async () => {
      const input: HandcardInput = {
        reception_date: form.reception_date ?? new Date().toISOString().slice(0, 10),
        reception_period: form.reception_period ?? null,
        customer_name: form.customer_name?.trim() ?? '',
        customer_phone: form.customer_phone?.trim() || null,
        customer_email: form.customer_email?.trim() || null,
        customer_identity: form.customer_identity ?? null,
        assigned_rs_name: form.assigned_rs_name?.trim() || null,
        lead_grade: form.lead_grade ?? null,
        intent_level: form.intent_level ?? null,
        purchase_timing: form.purchase_timing ?? null,
        intended_models: form.intended_models?.length ? form.intended_models : null,
        trial_status: form.trial_status ?? null,
        competitor_brand: form.competitor_brand?.trim() || null,
        competitor_model: form.competitor_model?.trim() || null,
        quoted_amount: form.quoted_amount ?? null,
        notes: form.notes?.trim() || null,
        status: form.status ?? 'open',
      };

      if (!input.customer_name) {
        showBanner({ ok: false, msg: '客戶姓名不可為空' });
        return;
      }

      const res = isCreating
        ? await createHandcardAction(input)
        : await updateHandcardAction(handcard!.id, input);

      if (res.ok) {
        showBanner({ ok: true, msg: isCreating ? '✓ 手卡已建立' : '✓ 已儲存' });
        if (isCreating) {
          router.push(`${LIST_PATH}/${res.data.id}`);
        } else {
          setMode('view');
          router.refresh();
        }
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  async function handleDelete() {
    if (!handcard) return;
    if (!confirm(`確定要刪除「${handcard.customer_name}」的手卡？此動作不可復原。`)) return;
    startTransition(async () => {
      const res = await deleteHandcardAction(handcard.id);
      if (res.ok) {
        router.push(LIST_PATH);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  async function handleConvert() {
    if (!handcard) return;
    if (!confirm(`將「${handcard.customer_name}」的手卡轉換成 Lead？`)) return;
    startTransition(async () => {
      const res = await convertHandcardToLeadAction(handcard.id);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已轉成 Lead（ID: ${res.data.leadId.slice(0, 8)}）` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────
  const pillBase = 'h-[30px] px-4 rounded-full text-[12px] font-medium shadow-sm disabled:opacity-50';

  return (
    <main className={`px-6 py-5 space-y-4 ${isPending ? 'pointer-events-none opacity-60' : ''}`}>
      {/* Banner */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? 'bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]'
              : 'bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]'
          }`}
        >
          {banner.msg}
        </div>
      )}

      {/* 1. Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href={LIST_PATH} className="hover:text-[#185FA5]">
            接待手卡
          </Link>
          <span>›</span>
          {isCreating ? (
            <span className="text-[#5A5955]">新增手卡</span>
          ) : (
            <span className="text-[#5A5955] font-mono">{handcard?.customer_name ?? '—'}</span>
          )}
          {(isEditing || isCreating) && (
            <span className="ml-1 px-2 py-0.5 text-[11px] rounded bg-[#FDF3E3] text-[#854F0B]">
              {isCreating ? '建立模式' : '編輯模式'}
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {mode === 'view' && (
            <>
              <button
                onClick={() => router.push(LIST_PATH)}
                className={`${pillBase} bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]`}
              >
                返回列表
              </button>
              {canEdit && (
                <>
                  <button
                    onClick={enterCreate}
                    className={`${pillBase} bg-[#0F6E56] text-white hover:bg-[#0a5742]`}
                  >
                    新增
                  </button>
                  <button
                    onClick={enterEdit}
                    className={`${pillBase} bg-[#1A3A5C] text-white hover:bg-[#0F2A45]`}
                  >
                    修改
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={isPending}
                    className={`${pillBase} bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]`}
                  >
                    刪除
                  </button>
                  {handcard?.status === 'open' && (
                    <button
                      onClick={handleConvert}
                      disabled={isPending}
                      className={`${pillBase} bg-[#EAF4FB] border border-[#185FA5] text-[#185FA5] hover:bg-[#d7edf7]`}
                    >
                      轉 Lead
                    </button>
                  )}
                </>
              )}
            </>
          )}
          {(mode === 'edit' || mode === 'create') && (
            <>
              <button
                onClick={cancelEdit}
                className={`${pillBase} bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]`}
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={isPending}
                className={`${pillBase} bg-[#0F6E56] text-white hover:bg-[#0a5742]`}
              >
                {isPending
                  ? isCreating
                    ? '建立中⋯'
                    : '儲存中⋯'
                  : isCreating
                  ? '建立並開啟'
                  : '儲存變更'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. Title Card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">接待手卡 · RS01</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {isCreating
                  ? '（新接待手卡）'
                  : (handcard?.customer_name ?? '—')}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                {handcard?.customer_phone && (
                  <span className="font-mono text-[#5A5955]">{handcard.customer_phone}</span>
                )}
                {handcard && <StatusChip status={handcard.status} />}
                {handcard?.lead_grade && <GradeChip grade={handcard.lead_grade} />}
                {handcard?.customer_identity && (
                  <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                    {IDENTITY_LABEL[handcard.customer_identity]}
                  </span>
                )}
                {isCreating && (
                  <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
                    尚未建立
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* 右側日期資訊 */}
          <div className="shrink-0 flex flex-col items-end justify-center gap-1 text-[12px] text-[#9A9890]">
            {!isCreating && handcard && (
              <>
                <span>接待日：{fmtDate(handcard.reception_date)}</span>
                {handcard.reception_period && (
                  <span>{RECEPTION_PERIOD_LABEL[handcard.reception_period]}</span>
                )}
                <span>建立：{fmtDate(handcard.created_at)}</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 3. 基本資料 Section（view mode）*/}
      {mode === 'view' && handcard && (
        <>
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 客戶資訊</span>
            </header>
            <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv label="姓名" value={handcard.customer_name} />
              <Kv label="電話" value={handcard.customer_phone} mono />
              <Kv label="Email" value={handcard.customer_email} mono />
              <Kv
                label="客戶身份"
                value={handcard.customer_identity ? IDENTITY_LABEL[handcard.customer_identity] : null}
              />
              <Kv label="接待 RS" value={handcard.assigned_rs_name} />
              <Kv
                label="接待時段"
                value={handcard.reception_period ? RECEPTION_PERIOD_LABEL[handcard.reception_period] : null}
              />
            </div>
          </section>

          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 購買意向</span>
            </header>
            <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv
                label="HABC 等級"
                value={handcard.lead_grade ? (
                  <GradeChip grade={handcard.lead_grade} />
                ) : null}
              />
              <Kv
                label="購車時機"
                value={handcard.purchase_timing ? PURCHASE_TIMING_LABEL[handcard.purchase_timing] : null}
              />
              <Kv
                label="意向等級"
                value={handcard.intent_level != null ? `${handcard.intent_level} / 5` : null}
              />
              <Kv
                label="試乘狀態"
                value={handcard.trial_status ? TRIAL_STATUS_LABEL[handcard.trial_status] : null}
              />
              <Kv
                label="意向車款"
                value={handcard.intended_models?.length ? handcard.intended_models.join('、') : null}
              />
              <Kv
                label="競品"
                value={handcard.competitor_brand
                  ? `${handcard.competitor_brand}${handcard.competitor_model ? ` · ${handcard.competitor_model}` : ''}`
                  : null}
              />
            </div>
          </section>

          {(handcard.quoted_amount != null || handcard.notes) && (
            <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 報價 / 備註</span>
              </header>
              <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
                <Kv
                  label="報價金額"
                  value={
                    handcard.quoted_amount != null
                      ? `NT$ ${handcard.quoted_amount.toLocaleString()}`
                      : null
                  }
                />
                <div className="md:col-span-2">
                  <Kv label="備註" value={handcard.notes} />
                </div>
              </div>
            </section>
          )}

          {handcard.lead_id && (
            <div className="bg-[#EAF4FB] border border-[#185FA5] rounded-lg px-4 py-3 text-[12.5px] text-[#185FA5]">
              此手卡已轉換為 Lead —{' '}
              <Link
                href={`/crm/sales/dormant-leads`}
                className="underline hover:text-[#0C3E70]"
              >
                查看 Lead 管理
              </Link>
            </div>
          )}
        </>
      )}

      {/* Edit / Create form */}
      {(mode === 'edit' || mode === 'create') && (
        <div className="space-y-4">
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FDF3E3]">
              <span className="text-[13px] font-semibold text-[#854F0B]">
                {isCreating ? '建立模式 — 填寫手卡資訊' : '▼ 編輯基本資料'}
              </span>
            </header>
            <div className="px-4 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>接待日期 <span className="text-[#CC0000]">*</span></label>
                  <input
                    type="date"
                    className={inputClass}
                    value={form.reception_date ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, reception_date: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>時段</label>
                  <select
                    className={inputClass}
                    value={form.reception_period ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, reception_period: (e.target.value as HandcardReceptionPeriod) || null }))}
                  >
                    <option value="">— 選擇時段 —</option>
                    <option value="morning">上午</option>
                    <option value="afternoon">下午</option>
                    <option value="evening">傍晚</option>
                    <option value="full_day">全天</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>姓名 <span className="text-[#CC0000]">*</span></label>
                  <input
                    className={inputClass}
                    placeholder="客戶姓名"
                    value={form.customer_name ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>電話</label>
                  <input
                    className={inputClass}
                    placeholder="09xx-xxxxxx"
                    value={form.customer_phone ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, customer_phone: e.target.value || null }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>Email</label>
                  <input
                    className={inputClass}
                    placeholder="xxx@email.com"
                    value={form.customer_email ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, customer_email: e.target.value || null }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>客戶身份</label>
                  <select
                    className={inputClass}
                    value={form.customer_identity ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, customer_identity: (e.target.value as HandcardIdentity) || null }))}
                  >
                    <option value="">— 選擇 —</option>
                    <option value="new">首次來訪</option>
                    <option value="revisit">潛客再訪</option>
                    <option value="owner">現有車主</option>
                    <option value="switcher">換購客</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>接待 RS</label>
                  <input
                    className={inputClass}
                    placeholder="RS 姓名"
                    value={form.assigned_rs_name ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, assigned_rs_name: e.target.value || null }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>手卡狀態</label>
                  <select
                    className={inputClass}
                    value={form.status ?? 'open'}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as HandcardStatus }))}
                  >
                    <option value="open">接待中</option>
                    <option value="closed">已結束</option>
                    <option value="converted_to_lead">已轉 Lead</option>
                    <option value="no_show">未到場</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>HABC 等級</label>
                  <select
                    className={inputClass}
                    value={form.lead_grade ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, lead_grade: (e.target.value as HandcardLeadGrade) || null }))}
                  >
                    <option value="">— 選擇 —</option>
                    <option value="H">H — 立即決策</option>
                    <option value="A">A — 3 個月內</option>
                    <option value="B">B — 半年左右</option>
                    <option value="C">C — 觀望</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>購車時機</label>
                  <select
                    className={inputClass}
                    value={form.purchase_timing ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, purchase_timing: (e.target.value as HandcardPurchaseTiming) || null }))}
                  >
                    <option value="">— 選擇 —</option>
                    <option value="now">立即決策</option>
                    <option value="3m">3 個月內</option>
                    <option value="6m">半年左右</option>
                    <option value="explore">純粹了解</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>意向等級（1-5）</label>
                  <select
                    className={inputClass}
                    value={form.intent_level != null ? String(form.intent_level) : ''}
                    onChange={(e) => setForm((f) => ({ ...f, intent_level: e.target.value ? Number(e.target.value) : null }))}
                  >
                    <option value="">— 選擇 —</option>
                    <option value="5">5 — 極強</option>
                    <option value="4">4 — 強</option>
                    <option value="3">3 — 中等</option>
                    <option value="2">2 — 偏低</option>
                    <option value="1">1 — 觀望</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>試乘狀態</label>
                  <select
                    className={inputClass}
                    value={form.trial_status ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, trial_status: (e.target.value as HandcardTrialStatus) || null }))}
                  >
                    <option value="">— 選擇 —</option>
                    <option value="none">尚未試駕</option>
                    <option value="done-today">本次已試駕</option>
                    <option value="done-before">之前已試駕</option>
                    <option value="refused">明確拒絕</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className={labelClass}>意向車款（逗號分隔）</label>
                <input
                  className={inputClass}
                  placeholder="例：FTR 1200、Scout Bobber"
                  value={(form.intended_models ?? []).join('、')}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      intended_models: e.target.value
                        ? e.target.value.split(/[,、，]/).map((s) => s.trim()).filter(Boolean)
                        : null,
                    }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>競品品牌</label>
                  <input
                    className={inputClass}
                    placeholder="例：Harley-Davidson"
                    value={form.competitor_brand ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, competitor_brand: e.target.value || null }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>競品車款</label>
                  <input
                    className={inputClass}
                    placeholder="例：Iron 883"
                    value={form.competitor_model ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, competitor_model: e.target.value || null }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>報價金額（TWD）</label>
                  <input
                    type="number"
                    className={inputClass}
                    placeholder="0"
                    value={form.quoted_amount != null ? String(form.quoted_amount) : ''}
                    onChange={(e) => setForm((f) => ({ ...f, quoted_amount: e.target.value ? Number(e.target.value) : null }))}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className={labelClass}>備註</label>
                <textarea
                  className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] text-[#2C2C2A] focus:outline-none focus:border-[#185FA5] bg-white w-full resize-none"
                  rows={3}
                  placeholder="接待重點、特殊需求…"
                  value={form.notes ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value || null }))}
                />
              </div>
            </div>
          </section>

          {isCreating && (
            <p className="text-[12px] text-[#9A9890] px-1">
              建立後將跳轉到手卡詳情頁，可進一步維護資料或轉換為 Lead。
            </p>
          )}
        </div>
      )}
    </main>
  );
}
