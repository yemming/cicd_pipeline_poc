'use client';

/**
 * 接待手卡 Detail Wizard — 對應老闆設計稿 RS01 v8（docs/DUCATI_v2_output/01_銷售接待/02_展廳接待/RS01_電子手卡_v8.html）
 * Steps 1-8 wizard layout + 4 身份脈絡分支 + chip 池 + HABC 推薦 + CRM01A 同步提示。
 *
 * 資料層：手卡欄位用既有 typed columns；Wizard 額外欄位塞 handcards.metadata：
 *   metadata.tags             : string[]                          chip pool 勾選
 *   metadata.arrival_time     : 'HH:mm'                           Step 1 到店時間
 *   metadata.arrival_source   : string                            Step 1 來店管道
 *   metadata.age_group        : '<25' | '25-35' | ...             Step 1 年齡層
 *   metadata.quote_status     : 'none|draft|issued|revised'       Step 6
 *   metadata.followup_date    : 'yyyy-mm-dd'                      Step 6
 *   metadata.followup_method  : string                            Step 6
 *   metadata.competitor2      : string                            Step 8 第二競品
 *   metadata.customer_summary : string                            Step 8 主要需求摘要
 *   metadata.visit_result     : string                            Step 8 接待結果
 *   metadata.visit_result_reason: string                          Step 8 未成交原因
 *   metadata.switcher         : {brand, model, reason, disposal}  他牌換購
 *   metadata.revisit_source_handcard_id : string                  潛客再訪：上次手卡
 *   metadata.owner_customer_id : string                           老車主：對映 customers.id
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

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
  RECEPTION_PERIOD_LABEL,
  type HandcardStatus,
  type HandcardLeadGrade,
  type HandcardPurchaseTiming,
  type HandcardTrialStatus,
  type HandcardReceptionPeriod,
} from '@/domain/sales-handcards.constants';
import type {
  HandcardRow,
  HandcardInput,
  RevisitCandidate,
  OwnerCandidate,
} from '@/domain/sales-handcards';
import { IdentitySelector } from '@/components/sales/identity-selector';
import { HandcardChipPool } from '@/components/sales/handcard-chip-pool';
import { HandcardStepBar, type WizardStep } from '@/components/sales/handcard-step-bar';
import { HandcardPickerModal } from '@/components/sales/handcard-picker-modal';
import { recommendHabc } from '@/domain/handcard-tag-dictionary';
import { Timeline, type TimelineEvent } from '@/components/visualization/Timeline';

type Mode = 'view' | 'edit' | 'create';
type Banner = { ok: boolean; msg: string } | null;
type Metadata = Record<string, unknown>;

const LIST_PATH = '/sales/reception/handcard';

type VehicleModelOption = { id: string; display_name: string };

// ── Tiny helpers ──────────────────────────────────────────────────────────
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

function StepHeader({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
      <span className="inline-flex items-center justify-center w-[20px] h-[20px] rounded-full bg-[#1A3A5C] text-white text-[11px] font-bold">
        {n}
      </span>
      <span className="text-[13px] font-semibold text-[#2C2C2A]">{title}</span>
      {hint && <span className="text-[11px] text-[#9A9890]">{hint}</span>}
    </header>
  );
}

const inputClass =
  'h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] text-[#2C2C2A] focus:outline-none focus:border-[#185FA5] bg-white w-full';
const labelClass = 'text-[11px] text-[#9A9890] font-medium';

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  return s.slice(0, 10);
}

function shortCardNo(id: string | null): string {
  if (!id) return '';
  return `#RC-${id.slice(0, 8).toUpperCase()}`;
}

function extractMeta<T = unknown>(metadata: Metadata | null | undefined, key: string): T | null {
  const v = metadata && (metadata as Record<string, unknown>)[key];
  return (v ?? null) as T | null;
}

function extractTags(metadata: Metadata | null | undefined): string[] {
  const t = metadata && (metadata as { tags?: unknown }).tags;
  return Array.isArray(t) ? t.filter((x): x is string => typeof x === 'string') : [];
}

// ── Constants from boss template ──────────────────────────────────────────
const ARRIVAL_SOURCES = [
  '展廳到訪',
  '車展活動',
  'FB / IG 廣告',
  '老車主轉介',
  'DSPOT 預約',
  'DRE 學院',
  '騎士節',
  'Track Day',
];

const AGE_GROUPS: { value: string; label: string }[] = [
  { value: '<25', label: '25 歲以下' },
  { value: '25-35', label: '25–35' },
  { value: '36-45', label: '36–45' },
  { value: '46-55', label: '46–55' },
  { value: '55+', label: '55 歲以上' },
];

const TIMING_CARDS: {
  key: HandcardPurchaseTiming;
  emoji: string;
  label: string;
  hint: string;
  accent: string;
}[] = [
  { key: 'now', emoji: '🔥', label: '立即決策', hint: '本月內有意向、資金已備妥', accent: '#CC0000' },
  { key: '3m', emoji: '⏰', label: '3 個月內', hint: '有明確計畫、仍在比較方案', accent: '#854F0B' },
  { key: '6m', emoji: '📅', label: '半年左右', hint: '初步了解、預算待確認', accent: '#185FA5' },
  { key: 'explore', emoji: '🔍', label: '純粹了解', hint: '無明確時機、探詢行情', accent: '#6B6A68' },
];

const INTENT_LEVELS: { value: number; label: string; emoji: string }[] = [
  { value: 5, label: '極強', emoji: '🔥🔥' },
  { value: 4, label: '強', emoji: '🔥' },
  { value: 3, label: '中等', emoji: '✳️' },
  { value: 2, label: '偏低', emoji: '❄️' },
  { value: 1, label: '觀望', emoji: '💤' },
];

const TRIAL_OPTIONS: { value: HandcardTrialStatus; label: string }[] = [
  { value: 'none', label: '尚未試駕' },
  { value: 'done-today', label: '本次已試駕' },
  { value: 'done-before', label: '之前已試駕' },
  { value: 'refused', label: '明確拒絕試駕' },
];

const HABC_GRADES: { value: HandcardLeadGrade; label: string; color: string }[] = [
  { value: 'H', label: 'H — 最高優先', color: '#CC0000' },
  { value: 'A', label: 'A — 積極跟進', color: '#854F0B' },
  { value: 'B', label: 'B — 定期維持', color: '#185FA5' },
  { value: 'C', label: 'C — 長期維護', color: '#6B6A68' },
];

const QUOTE_STATUSES = [
  { value: 'none', label: '尚未開立' },
  { value: 'draft', label: '草稿中' },
  { value: 'issued', label: '已開立' },
  { value: 'revised', label: '已修訂' },
];

const FOLLOWUP_METHODS = ['LINE 訊息', '電話', '邀請再訪', '邀請活動'];

const VISIT_RESULTS = [
  '當場成交',
  '已試駕、待追蹤',
  '已報價、待回覆',
  '後續追蹤',
  '未成交',
  '純粹了解',
];

const NO_DEAL_REASONS = [
  '預算不符',
  '決策者未到',
  '選擇他牌',
  '時機未到',
  '其他需求未滿足',
];

const SWITCHER_REASONS = [
  '想換更高階',
  '想換更輕巧',
  '原車老舊',
  '保固到期',
  '想嘗試新品牌',
];

const SWITCHER_DISPOSALS = ['抵換折抵', '自行賣出', '保留', '尚未決定'];

// ──────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────
export function HandcardDetailView({
  handcard,
  canEdit,
  vehicleModels,
  revisitCandidates,
  ownerCandidates,
  initialMode = 'view',
}: {
  handcard: HandcardRow | null;
  canEdit: boolean;
  vehicleModels: VehicleModelOption[];
  revisitCandidates: RevisitCandidate[];
  ownerCandidates: OwnerCandidate[];
  initialMode?: Mode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [banner, setBanner] = useState<Banner>(null);

  // Picker modal state
  const [openPicker, setOpenPicker] = useState<'revisit' | 'owner' | null>(null);

  // Form state (典型欄位)
  const [form, setForm] = useState<Partial<HandcardInput>>(() => seedForm(handcard));

  // metadata state（顯式拿出來方便操作）
  const [meta, setMeta] = useState<Metadata>(() => (handcard?.metadata ?? {}) as Metadata);

  // tags (subset of meta.tags but tracked separately for chip pool)
  const [tags, setTags] = useState<string[]>(extractTags(handcard?.metadata));

  const isCreating = mode === 'create';
  const isEditing = mode === 'edit';
  const editable = isCreating || isEditing;
  const isView = mode === 'view';

  // HABC 推薦（auto suggest）
  const habcSuggest = useMemo(
    () =>
      recommendHabc({
        timing: form.purchase_timing ?? null,
        intentLevel: form.intent_level ?? null,
        trialStatus: form.trial_status ?? null,
      }),
    [form.purchase_timing, form.intent_level, form.trial_status],
  );

  // 5 步進度
  const steps = useMemo<WizardStep[]>(() => {
    const hasBasic = !!form.customer_name?.trim() && !!form.customer_identity;
    const hasIntent = (form.intended_models?.length ?? 0) > 0;
    const hasTrialOrQuote = !!form.trial_status || (form.quoted_amount ?? 0) > 0;
    const hasQuote =
      (form.quoted_amount ?? 0) > 0 ||
      ['draft', 'issued', 'revised'].includes(String(meta.quote_status ?? ''));
    const hasResult = !!meta.visit_result || handcard?.status === 'converted_to_lead' || handcard?.status === 'closed';

    function status(done: boolean, isActive: boolean): WizardStep['status'] {
      if (done) return 'done';
      if (isActive) return 'active';
      return 'todo';
    }

    const active1 = !hasBasic;
    const active2 = hasBasic && !hasIntent;
    const active3 = hasIntent && !hasTrialOrQuote;
    const active4 = hasTrialOrQuote && !hasQuote;
    const active5 = hasQuote && !hasResult;

    return [
      { key: 'reception', label: '接待建檔', status: status(hasBasic, active1) },
      { key: 'intent', label: '意向確認', status: status(hasIntent, active2) },
      { key: 'trial', label: '試駕鑑價', status: status(hasTrialOrQuote, active3) },
      { key: 'quote', label: '報價追蹤', status: status(hasQuote, active4) },
      { key: 'close', label: '成交交車', status: status(hasResult, active5) },
    ];
  }, [
    form.customer_name,
    form.customer_identity,
    form.intended_models,
    form.trial_status,
    form.quoted_amount,
    meta.quote_status,
    meta.visit_result,
    handcard?.status,
  ]);

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function setMetaKey(key: string, value: unknown) {
    setMeta((m) => ({ ...m, [key]: value }));
  }

  function setSwitcherKey(key: 'brand' | 'model' | 'reason' | 'disposal', value: string | null) {
    const cur = (meta.switcher as Record<string, unknown> | undefined) ?? {};
    setMeta((m) => ({ ...m, switcher: { ...cur, [key]: value } }));
  }

  function enterEdit() {
    if (!handcard) return;
    setForm(seedForm(handcard));
    setMeta((handcard.metadata ?? {}) as Metadata);
    setTags(extractTags(handcard.metadata));
    setMode('edit');
  }

  function enterCreate() {
    setForm(seedForm(null));
    setMeta({});
    setTags([]);
    setMode('create');
  }

  function cancelEdit() {
    if (isCreating) {
      router.push(LIST_PATH);
    } else {
      // restore
      setForm(seedForm(handcard));
      setMeta((handcard?.metadata ?? {}) as Metadata);
      setTags(extractTags(handcard?.metadata));
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
        metadata: { ...meta, tags },
      };

      if (!input.customer_name) {
        showBanner({ ok: false, msg: '請填寫客戶姓名' });
        return;
      }
      if (!input.customer_identity) {
        showBanner({ ok: false, msg: '請先選擇來客身份' });
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
      if (res.ok) router.push(LIST_PATH);
      else showBanner({ ok: false, msg: res.error });
    });
  }

  async function handleConvert() {
    if (!handcard) return;
    if (!confirm(`將「${handcard.customer_name}」的手卡轉換成 Lead？`)) return;
    startTransition(async () => {
      const res = await convertHandcardToLeadAction(handcard.id);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已轉成 Lead（${res.data.leadId.slice(0, 8)}…）` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  // 身份切換 hook —— revisit / owner 開 picker；其他直接設值
  function onIdentityChange(next: HandcardRow['customer_identity']) {
    setForm((f) => ({ ...f, customer_identity: next }));
    if (next === 'revisit') setOpenPicker('revisit');
    else if (next === 'owner') setOpenPicker('owner');
  }

  function applyRevisitPick(r: RevisitCandidate) {
    setForm((f) => ({
      ...f,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone ?? null,
      lead_grade: r.lead_grade ?? f.lead_grade ?? null,
      assigned_rs_name: r.assigned_rs_name ?? f.assigned_rs_name ?? null,
      intended_models: r.intended_models ?? f.intended_models ?? null,
    }));
    setMetaKey('revisit_source_handcard_id', r.id);
    setOpenPicker(null);
    showBanner({ ok: true, msg: `✓ 已帶出 ${r.customer_name} 的上次接待資訊` });
  }

  function applyOwnerPick(o: OwnerCandidate) {
    setForm((f) => ({
      ...f,
      customer_name: o.name,
      customer_phone: o.phone ?? null,
    }));
    setMeta((m) => ({
      ...m,
      owner_customer_id: o.id,
      owner_vehicle: o.primary_vehicle ?? null,
    }));
    setOpenPicker(null);
    showBanner({ ok: true, msg: `✓ 已帶出 ${o.name} 的車輛資料` });
  }

  // 提供給 picker 使用
  const revisitPickerData = useMemo(
    () => revisitCandidates.filter((r) => !handcard || r.id !== handcard.id),
    [revisitCandidates, handcard],
  );

  const pillBase = 'h-[30px] px-4 rounded-full text-[12px] font-medium shadow-sm disabled:opacity-50';

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────
  const cardNo = handcard ? shortCardNo(handcard.id) : null;
  const rsName = form.assigned_rs_name ?? handcard?.assigned_rs_name ?? null;

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? 'pointer-events-none opacity-60' : ''}`}>
      {/* Banner */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-[200] ${
            banner.ok
              ? 'bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]'
              : 'bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]'
          }`}
        >
          {banner.msg}
        </div>
      )}

      {/* ─── Top: Step bar + Breadcrumb + CRUD ─── */}
      <HandcardStepBar
        identity={form.customer_identity ?? null}
        steps={steps}
        rsName={rsName}
        cardNo={cardNo}
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href={LIST_PATH} className="hover:text-[#185FA5]">
            接待手卡
          </Link>
          <span>›</span>
          {isCreating ? (
            <span className="text-[#5A5955]">新增手卡</span>
          ) : (
            <span className="text-[#5A5955] font-mono">
              {handcard?.customer_name ?? '—'}
            </span>
          )}
          {(isEditing || isCreating) && (
            <span className="ml-1 px-2 py-0.5 text-[11px] rounded bg-[#FDF3E3] text-[#854F0B]">
              {isCreating ? '建立模式' : '編輯模式'}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {isView && (
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
          {editable && (
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

      {/* ─── Title card ─── */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">接待手卡 · RS01</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {isCreating ? '（新接待手卡）' : (form.customer_name?.trim() || handcard?.customer_name || '（未命名）')}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                {handcard?.customer_phone && (
                  <span className="font-mono text-[#5A5955]">{handcard.customer_phone}</span>
                )}
                {handcard && <StatusChip status={handcard.status} />}
                {form.lead_grade && <GradeChip grade={form.lead_grade} />}
                {form.customer_identity && (
                  <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                    {IDENTITY_LABEL[form.customer_identity]}
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

      {/* ─── Step 0：來客身份 ─── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <StepHeader n={0} title="來客身份確認" hint="決定後續表單邏輯，可在儲存前修改" />
        <div className="px-4 py-3 space-y-3">
          <IdentitySelector
            value={form.customer_identity ?? null}
            onChange={editable ? onIdentityChange : undefined}
            editable={editable}
          />
          {/* 條件性子區塊 */}
          {form.customer_identity === 'revisit' && (
            <RevisitHistoryBlock
              meta={meta}
              candidates={revisitCandidates}
              onOpenPicker={editable ? () => setOpenPicker('revisit') : undefined}
            />
          )}
          {form.customer_identity === 'owner' && (
            <OwnerVehicleBlock
              meta={meta}
              candidates={ownerCandidates}
              onOpenPicker={editable ? () => setOpenPicker('owner') : undefined}
            />
          )}
          {form.customer_identity === 'switcher' && (
            <SwitcherInfoBlock
              meta={meta}
              editable={editable}
              onChange={setSwitcherKey}
            />
          )}
        </div>
      </section>

      {/* ─── Step 1：接待建檔 ─── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <StepHeader n={1} title="基本接待資訊" />
        <div className="px-4 py-4">
          <Step1Form form={form} meta={meta} setForm={setForm} setMetaKey={setMetaKey} editable={editable} />
        </div>
      </section>

      {/* ─── Step 2：意向車款 ─── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <StepHeader n={2} title="意向車款" hint="可複選；尚未確定可留空" />
        <div className="px-4 py-4">
          <VehicleIntentPicker
            value={form.intended_models ?? []}
            options={vehicleModels}
            editable={editable}
            onChange={(v) => setForm((f) => ({ ...f, intended_models: v.length ? v : null }))}
          />
        </div>
      </section>

      {/* ─── Step 3：購買時機 × 意向 × 試駕 × HABC ─── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <StepHeader n={3} title="購買時機 × 意向強度 × HABC" />
        <div className="px-4 py-4 space-y-4">
          <Step3TimingIntent form={form} setForm={setForm} editable={editable} />
          <HabcRecommendBlock
            suggestion={habcSuggest}
            manualGrade={form.lead_grade ?? null}
            editable={editable}
            onPick={(g) => setForm((f) => ({ ...f, lead_grade: g }))}
          />
        </div>
      </section>

      {/* ─── Step 4：試乘試駕（外連 RS02） ─── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <StepHeader n={4} title="試乘試駕" />
        <div className="px-4 py-4 space-y-3">
          <JumpButton
            emoji="🏁"
            title="前往試乘試駕排程 (RS02)"
            hint="安排試駕車款 / 時間 / 隨車教練；完成後系統自動帶回結果"
            badge={
              form.trial_status === 'done-today'
                ? { text: '本次已試駕', color: '#3B6D11', bg: '#EAF3DE' }
                : form.trial_status === 'done-before'
                  ? { text: '之前已試駕', color: '#185FA5', bg: '#EAF4FB' }
                  : form.trial_status === 'refused'
                    ? { text: '已拒絕', color: '#CC0000', bg: '#FDECEA' }
                    : { text: '尚未安排', color: '#854F0B', bg: '#FDF3E3' }
            }
            href="/sales/reception/test-rides"
            disabled={!handcard}
          />
          {form.trial_status === 'done-today' && (
            <div className="bg-[#FDF3E3] border border-[#E5C57B] rounded-md px-3 py-2 text-[12.5px] text-[#854F0B]">
              ⭐ <b>黃金時刻！</b>客戶剛完成試駕、滿意度高，建議現在立即開立報價單（往下 Step 6）
            </div>
          )}
        </div>
      </section>

      {/* ─── Step 5：中古鑑價（外連 RS06） ─── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <StepHeader n={5} title="中古鑑價（如有換車需求）" />
        <div className="px-4 py-4">
          <JumpButton
            emoji="🔧"
            title="前往中古車鑑價系統 (RS06)"
            hint="評估客戶舊車價值、認證等級；完成後可作為折抵依據"
            badge={{ text: '可選步驟', color: '#9A9890', bg: '#F2F2F2' }}
            href="/sales/showroom/used-cars"
            disabled={!handcard}
          />
        </div>
      </section>

      {/* ─── Step 6：報價 & 追蹤 ─── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <StepHeader n={6} title="報價 & 追蹤" />
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="報價單狀態" editable={editable}>
            <select
              className={inputClass}
              value={String(meta.quote_status ?? 'none')}
              onChange={(e) => setMetaKey('quote_status', e.target.value)}
              disabled={!editable}
            >
              {QUOTE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="報價金額 (NT$)" editable={editable}>
            <input
              type="number"
              className={inputClass}
              placeholder="0"
              value={form.quoted_amount != null ? String(form.quoted_amount) : ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, quoted_amount: e.target.value ? Number(e.target.value) : null }))
              }
              disabled={!editable}
            />
          </Field>
          <Field label="下次追蹤日期" editable={editable}>
            <input
              type="date"
              className={inputClass}
              value={String(meta.followup_date ?? '')}
              onChange={(e) => setMetaKey('followup_date', e.target.value || null)}
              disabled={!editable}
            />
          </Field>
          <Field label="追蹤方式" editable={editable}>
            <select
              className={inputClass}
              value={String(meta.followup_method ?? '')}
              onChange={(e) => setMetaKey('followup_method', e.target.value || null)}
              disabled={!editable}
            >
              <option value="">— 選擇 —</option>
              {FOLLOWUP_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      {/* ─── Step 7：客戶觀察標籤 ─── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <StepHeader n={7} title="客戶觀察標籤" hint={`已選 ${tags.length} 個`} />
        <div className="px-4 py-3">
          <HandcardChipPool value={tags} onChange={setTags} editable={editable} />
        </div>
      </section>

      {/* ─── Step 8：備註 & 競品 & 結果 ─── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <StepHeader n={8} title="備註與競品" />
        <div className="px-4 py-4 space-y-3">
          <Field label="接待備註" editable={editable}>
            <textarea
              rows={3}
              className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:outline-none focus:border-[#185FA5] resize-none bg-white"
              placeholder="客戶提問、特殊需求、互動重點…"
              value={form.notes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value || null }))}
              disabled={!editable}
            />
          </Field>
          <Field label="主要需求摘要（1–3 點最在意的）" editable={editable}>
            <textarea
              rows={2}
              className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:outline-none focus:border-[#185FA5] resize-none bg-white"
              placeholder="如：1) 操控感、2) 外型、3) 保固"
              value={String(meta.customer_summary ?? '')}
              onChange={(e) => setMetaKey('customer_summary', e.target.value || null)}
              disabled={!editable}
            />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="競品 1（品牌 / 車款）" editable={editable}>
              <input
                className={inputClass}
                placeholder="例：Harley-Davidson Iron 883"
                value={[form.competitor_brand, form.competitor_model].filter(Boolean).join(' · ')}
                onChange={(e) => {
                  const v = e.target.value;
                  const [brand, model] = v.split(/[·,/／]/).map((s) => s.trim());
                  setForm((f) => ({
                    ...f,
                    competitor_brand: brand || null,
                    competitor_model: model || null,
                  }));
                }}
                disabled={!editable}
              />
            </Field>
            <Field label="競品 2" editable={editable}>
              <input
                className={inputClass}
                placeholder="例：BMW R 18"
                value={String(meta.competitor2 ?? '')}
                onChange={(e) => setMetaKey('competitor2', e.target.value || null)}
                disabled={!editable}
              />
            </Field>
            <Field label="本次接待結果" editable={editable}>
              <select
                className={inputClass}
                value={String(meta.visit_result ?? '')}
                onChange={(e) => setMetaKey('visit_result', e.target.value || null)}
                disabled={!editable}
              >
                <option value="">— 選擇 —</option>
                {VISIT_RESULTS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            {meta.visit_result === '未成交' && (
              <Field label="未成交原因" editable={editable}>
                <select
                  className={inputClass}
                  value={String(meta.visit_result_reason ?? '')}
                  onChange={(e) => setMetaKey('visit_result_reason', e.target.value || null)}
                  disabled={!editable}
                >
                  <option value="">— 選擇 —</option>
                  {NO_DEAL_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        </div>
      </section>

      {/* ─── 建立 / 編輯模式：後續自動流程 Timeline 預覽 ─── */}
      {editable && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-[20px] h-[20px] rounded-full bg-[#0F6E56] text-white text-[11px] font-bold">
              ✓
            </span>
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              {isCreating ? '送出後將自動執行' : '儲存後將觸發'}
            </span>
            <span className="text-[11px] text-[#9A9890]">含 CRM / 試駕 / 後續追蹤連動</span>
          </header>
          <div className="px-4 py-4">
            <Timeline
              variant="vertical"
              events={(() => {
                const events: TimelineEvent[] = [
                  {
                    id: 'create',
                    time: isCreating ? '立即' : '本次儲存',
                    title: isCreating ? '建立接待手卡' : '更新接待手卡',
                    description: `客戶：${form.customer_name?.trim() || '（未填）'} · 身份：${form.customer_identity ? IDENTITY_LABEL[form.customer_identity] : '（未選）'}`,
                    tone: 'blue',
                  },
                ];
                if (form.intended_models?.length) {
                  events.push({
                    id: 'lead',
                    time: '同步',
                    title: '建立 / 更新 CRM01A 潛客紀錄',
                    description: `意向車款：${form.intended_models.join('、')} · HABC：${form.lead_grade ?? '待判定'}`,
                    tone: 'purple',
                  });
                }
                if (form.trial_status && form.trial_status !== 'none' && form.trial_status !== 'refused') {
                  events.push({
                    id: 'trial',
                    time: 'T+0',
                    title: '同步試乘紀錄',
                    description: '帶出於 RS02 試乘試駕模組（如有預約則更新狀態）',
                    tone: 'amber',
                  });
                }
                const fd = typeof meta.followup_date === 'string' ? meta.followup_date : null;
                if (fd) {
                  events.push({
                    id: 'followup',
                    time: fd,
                    title: '排程後續追蹤',
                    description: `方式：${typeof meta.followup_method === 'string' && meta.followup_method ? meta.followup_method : '電訪'}`,
                    tone: 'teal',
                  });
                }
                if (meta.visit_result === '訂單成立' || form.status === 'converted_to_lead') {
                  events.push({
                    id: 'order',
                    time: 'T+1',
                    title: '轉訂單 / 走 RS04 報價成交流程',
                    description: '可由列表「轉 Lead」或詳情頁右上動作觸發',
                    tone: 'green',
                  });
                }
                return events;
              })()}
            />
          </div>
        </section>
      )}

      {/* ─── CRM01A 同步提示卡 ─── */}
      <section className="bg-[#EAF4FB] border border-[#9DC4E4] rounded-lg px-4 py-3 flex items-start gap-3">
        <span className="text-[20px] leading-none mt-0.5">⇅</span>
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-[#185FA5]">
            儲存後同步至 CRM01A 銷售客戶基盤
          </div>
          <div className="text-[12px] text-[#0C3E70] mt-0.5">
            建立潛客記錄、自動排程 D+3 / D+7 電訪提醒。
            {handcard?.lead_id && (
              <> 已同步 Lead：<Link href="/crm/sales/dormant-leads" className="underline">查看</Link></>
            )}
          </div>
        </div>
        {handcard && !handcard.lead_id && handcard.status === 'open' && canEdit && (
          <button
            type="button"
            onClick={handleConvert}
            className="h-[28px] px-3 rounded text-[12px] bg-[#185FA5] text-white hover:bg-[#0C3E70] shadow-sm whitespace-nowrap"
          >
            轉成 Lead
          </button>
        )}
      </section>

      {/* ─── Pickers ─── */}
      <HandcardPickerModal<RevisitCandidate>
        open={openPicker === 'revisit'}
        title="選擇潛客再訪記錄"
        description="從歷史接待手卡中選一筆，系統會帶出對應的客戶資料 + 上次意向"
        rows={revisitPickerData}
        rowKey={(r) => r.id}
        searchableText={(r) => `${r.customer_name} ${r.customer_phone ?? ''}`}
        onPick={applyRevisitPick}
        onClose={() => setOpenPicker(null)}
        columns={[
          { header: '接待日', cell: (r) => <span className="font-mono">{r.reception_date}</span>, width: 110 },
          {
            header: '客戶',
            cell: (r) => (
              <div>
                <div className="font-medium">{r.customer_name}</div>
                {r.customer_phone && (
                  <div className="text-[11px] text-[#9A9890] font-mono">{r.customer_phone}</div>
                )}
              </div>
            ),
            width: 180,
          },
          {
            header: 'HABC / 車款',
            cell: (r) => (
              <div className="flex flex-col gap-0.5">
                {r.lead_grade && <GradeChip grade={r.lead_grade} />}
                {r.intended_models?.length ? (
                  <span className="text-[11px] text-[#5A5955]">{r.intended_models.join('、')}</span>
                ) : null}
              </div>
            ),
          },
          {
            header: '狀態',
            cell: (r) => <StatusChip status={r.status} />,
            width: 100,
          },
        ]}
      />

      <HandcardPickerModal<OwnerCandidate>
        open={openPicker === 'owner'}
        title="選擇 DUCATI / Indian 老車主"
        description="挑選現有客戶，系統會帶出基本資料與主要車輛"
        rows={ownerCandidates}
        rowKey={(o) => o.id}
        searchableText={(o) => `${o.name} ${o.phone ?? ''} ${o.code}`}
        onPick={applyOwnerPick}
        onClose={() => setOpenPicker(null)}
        columns={[
          { header: '客戶編號', cell: (o) => <span className="font-mono text-[#1A3A5C]">{o.code}</span>, width: 120 },
          {
            header: '客戶',
            cell: (o) => (
              <div>
                <div className="font-medium">{o.name}</div>
                {o.phone && (
                  <div className="text-[11px] text-[#9A9890] font-mono">{o.phone}</div>
                )}
              </div>
            ),
            width: 180,
          },
          {
            header: '主要車輛',
            cell: (o) =>
              o.primary_vehicle ? (
                <div className="text-[11.5px]">
                  <div>{o.primary_vehicle.model_name ?? '—'}</div>
                  <div className="text-[#9A9890] font-mono">
                    {o.primary_vehicle.license_plate ?? '—'}
                  </div>
                </div>
              ) : (
                <span className="text-[#9A9890]">無車輛</span>
              ),
          },
        ]}
      />
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Sub-components (inline)
// ──────────────────────────────────────────────────────────────────────────

function Field({
  label,
  children,
  editable,
}: {
  label: string;
  children: React.ReactNode;
  editable: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className={labelClass}>{label}</label>
      <div className={editable ? '' : 'opacity-90'}>{children}</div>
    </div>
  );
}

function seedForm(handcard: HandcardRow | null): Partial<HandcardInput> {
  return {
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
  };
}

// ── 身份條件區塊 ──────────────────────────────────────────────────────────

function RevisitHistoryBlock({
  meta,
  candidates,
  onOpenPicker,
}: {
  meta: Metadata;
  candidates: RevisitCandidate[];
  onOpenPicker?: () => void;
}) {
  const sourceId = extractMeta<string>(meta, 'revisit_source_handcard_id');
  const source = sourceId ? candidates.find((c) => c.id === sourceId) : null;

  return (
    <div className="bg-[#EAF4FB] border border-[#9DC4E4] rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[13px] font-semibold text-[#185FA5]">🔄 潛客再訪記錄</span>
        {onOpenPicker && (
          <button
            type="button"
            onClick={onOpenPicker}
            className="ml-auto h-[24px] px-2.5 rounded text-[11px] bg-white border border-[#185FA5] text-[#185FA5] hover:bg-[#d7edf7]"
          >
            {source ? '更換上次接待記錄' : '選擇上次接待記錄'}
          </button>
        )}
      </div>
      {source ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-1.5 text-[12px]">
          <Kv label="上次到訪日" value={source.reception_date} />
          <Kv label="接待 RS" value={source.assigned_rs_name} />
          <Kv label="當時 HABC" value={source.lead_grade ? `${source.lead_grade} 級` : null} />
          <div className="md:col-span-3">
            <Kv
              label="上次意向車款"
              value={source.intended_models?.length ? source.intended_models.join('、') : null}
            />
          </div>
        </div>
      ) : (
        <p className="text-[11.5px] text-[#5A5955]">尚未選擇上次接待記錄。</p>
      )}
    </div>
  );
}

function OwnerVehicleBlock({
  meta,
  candidates,
  onOpenPicker,
}: {
  meta: Metadata;
  candidates: OwnerCandidate[];
  onOpenPicker?: () => void;
}) {
  const customerId = extractMeta<string>(meta, 'owner_customer_id');
  const owner = customerId ? candidates.find((c) => c.id === customerId) : null;
  const v = owner?.primary_vehicle ?? null;

  return (
    <div className="bg-[#FDF3E3] border border-[#E5C57B] rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[13px] font-semibold text-[#854F0B]">🏍️ DUCATI / Indian 老車主資料</span>
        {onOpenPicker && (
          <button
            type="button"
            onClick={onOpenPicker}
            className="ml-auto h-[24px] px-2.5 rounded text-[11px] bg-white border border-[#854F0B] text-[#854F0B] hover:bg-[#fbeac2]"
          >
            {owner ? '更換老車主' : '選擇老車主'}
          </button>
        )}
      </div>
      {owner ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-1.5 text-[12px]">
          <Kv label="客戶編號" value={<span className="font-mono">{owner.code}</span>} />
          <Kv label="姓名" value={owner.name} />
          <Kv label="電話" value={owner.phone} mono />
          <Kv label="主要車款" value={v?.model_name} />
          <Kv label="車牌" value={v?.license_plate} mono />
          <Kv label="目前里程" value={v?.current_mileage != null ? `${v.current_mileage.toLocaleString()} km` : null} mono />
        </div>
      ) : (
        <p className="text-[11.5px] text-[#5A5955]">尚未選擇老車主。</p>
      )}
    </div>
  );
}

function SwitcherInfoBlock({
  meta,
  editable,
  onChange,
}: {
  meta: Metadata;
  editable: boolean;
  onChange: (key: 'brand' | 'model' | 'reason' | 'disposal', value: string | null) => void;
}) {
  const switcher = (meta.switcher as Record<string, string | null | undefined> | undefined) ?? {};
  return (
    <div className="bg-[#FDECEA] border border-[#F5AEAD] rounded-lg p-3">
      <div className="text-[13px] font-semibold text-[#CC0000] mb-2">🔀 他牌換購資訊</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="現有品牌" editable={editable}>
          <input
            className={inputClass}
            placeholder="例：Harley-Davidson"
            value={switcher.brand ?? ''}
            onChange={(e) => onChange('brand', e.target.value || null)}
            disabled={!editable}
          />
        </Field>
        <Field label="現有車款" editable={editable}>
          <input
            className={inputClass}
            placeholder="例：Iron 883"
            value={switcher.model ?? ''}
            onChange={(e) => onChange('model', e.target.value || null)}
            disabled={!editable}
          />
        </Field>
        <Field label="換購原因" editable={editable}>
          <select
            className={inputClass}
            value={switcher.reason ?? ''}
            onChange={(e) => onChange('reason', e.target.value || null)}
            disabled={!editable}
          >
            <option value="">— 選擇 —</option>
            {SWITCHER_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field label="舊車處理方式" editable={editable}>
          <select
            className={inputClass}
            value={switcher.disposal ?? ''}
            onChange={(e) => onChange('disposal', e.target.value || null)}
            disabled={!editable}
          >
            <option value="">— 選擇 —</option>
            {SWITCHER_DISPOSALS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}

// ── Step 1 form ──────────────────────────────────────────────────────────

function Step1Form({
  form,
  meta,
  setForm,
  setMetaKey,
  editable,
}: {
  form: Partial<HandcardInput>;
  meta: Metadata;
  setForm: React.Dispatch<React.SetStateAction<Partial<HandcardInput>>>;
  setMetaKey: (key: string, value: unknown) => void;
  editable: boolean;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Field label="客戶姓名 *" editable={editable}>
        <input
          className={inputClass}
          placeholder="客戶姓名"
          value={form.customer_name ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
          disabled={!editable}
        />
      </Field>
      <Field label="聯絡電話" editable={editable}>
        <input
          className={inputClass}
          placeholder="09xx-xxxxxx"
          value={form.customer_phone ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, customer_phone: e.target.value || null }))}
          disabled={!editable}
        />
      </Field>
      <Field label="Email" editable={editable}>
        <input
          type="email"
          className={inputClass}
          placeholder="xxx@email.com"
          value={form.customer_email ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, customer_email: e.target.value || null }))}
          disabled={!editable}
        />
      </Field>
      <Field label="年齡層" editable={editable}>
        <select
          className={inputClass}
          value={String(meta.age_group ?? '')}
          onChange={(e) => setMetaKey('age_group', e.target.value || null)}
          disabled={!editable}
        >
          <option value="">— 選擇 —</option>
          {AGE_GROUPS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="到店日期 *" editable={editable}>
        <input
          type="date"
          className={inputClass}
          value={form.reception_date ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, reception_date: e.target.value }))}
          disabled={!editable}
        />
      </Field>
      <Field label="到店時段 / 時間" editable={editable}>
        <div className="grid grid-cols-2 gap-2">
          <select
            className={inputClass}
            value={form.reception_period ?? ''}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                reception_period: (e.target.value as HandcardReceptionPeriod) || null,
              }))
            }
            disabled={!editable}
          >
            <option value="">— 時段 —</option>
            <option value="morning">上午</option>
            <option value="afternoon">下午</option>
            <option value="evening">傍晚</option>
            <option value="full_day">全天</option>
          </select>
          <input
            type="time"
            className={inputClass}
            value={String(meta.arrival_time ?? '')}
            onChange={(e) => setMetaKey('arrival_time', e.target.value || null)}
            disabled={!editable}
          />
        </div>
      </Field>
      <Field label="來店管道" editable={editable}>
        <select
          className={inputClass}
          value={String(meta.arrival_source ?? '')}
          onChange={(e) => setMetaKey('arrival_source', e.target.value || null)}
          disabled={!editable}
        >
          <option value="">— 選擇 —</option>
          {ARRIVAL_SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="接待 RS" editable={editable}>
        <input
          className={inputClass}
          placeholder="RS 姓名"
          value={form.assigned_rs_name ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, assigned_rs_name: e.target.value || null }))}
          disabled={!editable}
        />
      </Field>
      <Field label="手卡狀態" editable={editable}>
        <select
          className={inputClass}
          value={form.status ?? 'open'}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as HandcardStatus }))}
          disabled={!editable}
        >
          <option value="open">接待中</option>
          <option value="closed">已結束</option>
          <option value="converted_to_lead">已轉 Lead</option>
          <option value="no_show">未到場</option>
        </select>
      </Field>
    </div>
  );
}

// ── Step 2: vehicle multi-select chips ───────────────────────────────────

function VehicleIntentPicker({
  value,
  options,
  editable,
  onChange,
}: {
  value: string[];
  options: VehicleModelOption[];
  editable: boolean;
  onChange: (v: string[]) => void;
}) {
  const selectedSet = new Set(value);

  function toggle(name: string) {
    if (!editable) return;
    onChange(selectedSet.has(name) ? value.filter((x) => x !== name) : [...value, name]);
  }

  if (options.length === 0) {
    return (
      <p className="text-[12px] text-[#9A9890]">
        本品牌尚未建立車款字典。請至「車款主檔」維護後再來勾選。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = selectedSet.has(o.display_name);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.display_name)}
              disabled={!editable}
              className={`inline-flex items-center gap-1.5 h-[32px] px-3 rounded-full text-[12px] transition ${
                active
                  ? 'bg-[#1A3A5C] text-white border border-[#1A3A5C]'
                  : 'bg-white border border-[#D5D3CB] text-[#2C2C2A] hover:border-[#9A9890]'
              } ${!editable ? 'opacity-80' : ''}`}
              aria-pressed={active}
            >
              {active && <span>✓</span>}
              <span>{o.display_name}</span>
            </button>
          );
        })}
      </div>
      {value.length > 0 && (
        <p className="text-[11px] text-[#9A9890]">
          已選 {value.length} 項：{value.join('、')}
        </p>
      )}
    </div>
  );
}

// ── Step 3: timing + intent + trial ──────────────────────────────────────

function Step3TimingIntent({
  form,
  setForm,
  editable,
}: {
  form: Partial<HandcardInput>;
  setForm: React.Dispatch<React.SetStateAction<Partial<HandcardInput>>>;
  editable: boolean;
}) {
  return (
    <div className="space-y-3">
      {/* Timing 4 cards */}
      <div>
        <div className={labelClass + ' mb-1.5'}>購買時機</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {TIMING_CARDS.map((t) => {
            const active = form.purchase_timing === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    purchase_timing: active ? null : t.key,
                  }))
                }
                disabled={!editable}
                className={`text-left px-3 py-2 rounded-lg border-2 transition ${
                  active ? 'shadow-sm bg-white' : 'bg-white border-[#EEECE6] hover:border-[#D5D3CB]'
                } ${!editable ? 'opacity-80' : ''}`}
                style={active ? { borderColor: t.accent } : undefined}
                aria-pressed={active}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[15px]">{t.emoji}</span>
                  <span
                    className="text-[12.5px] font-semibold"
                    style={{ color: active ? t.accent : '#2C2C2A' }}
                  >
                    {t.label}
                  </span>
                </div>
                <div className="text-[11px] text-[#5A5955] mt-0.5">{t.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Intent level 5 buttons + Trial select */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className={labelClass + ' mb-1.5'}>意向強度</div>
          <div className="flex flex-wrap gap-1.5">
            {INTENT_LEVELS.map((lv) => {
              const active = form.intent_level === lv.value;
              return (
                <button
                  key={lv.value}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({ ...f, intent_level: active ? null : lv.value }))
                  }
                  disabled={!editable}
                  className={`inline-flex items-center gap-1 h-[30px] px-3 rounded-full text-[11.5px] border transition ${
                    active
                      ? 'bg-[#1A3A5C] text-white border-[#1A3A5C]'
                      : 'bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]'
                  }`}
                >
                  <span>{lv.emoji}</span>
                  <span>{lv.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <Field label="試乘狀態" editable={editable}>
          <select
            className={inputClass}
            value={form.trial_status ?? ''}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                trial_status: (e.target.value as HandcardTrialStatus) || null,
              }))
            }
            disabled={!editable}
          >
            <option value="">— 選擇 —</option>
            {TRIAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}

// ── HABC recommendation + manual override ────────────────────────────────

function HabcRecommendBlock({
  suggestion,
  manualGrade,
  editable,
  onPick,
}: {
  suggestion: ReturnType<typeof recommendHabc>;
  manualGrade: HandcardLeadGrade | null;
  editable: boolean;
  onPick: (g: HandcardLeadGrade | null) => void;
}) {
  return (
    <div className="bg-[#F8F7F4] border border-[#EEECE6] rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold text-[#2C2C2A]">HABC 系統推薦</span>
        {suggestion ? (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-md text-[11.5px] font-semibold border"
            style={{
              backgroundColor: suggestion.bg,
              color: suggestion.fg,
              borderColor: suggestion.border,
            }}
          >
            {suggestion.grade}
          </span>
        ) : (
          <span className="text-[11px] text-[#9A9890]">填完購買時機 / 意向強度後系統會自動推薦</span>
        )}
      </div>
      {suggestion && (
        <>
          <div className="text-[11.5px] text-[#5A5955]">
            <b>原因：</b>
            {suggestion.reason}
          </div>
          <div className="text-[11.5px] text-[#5A5955]">
            <b>建議跟進：</b>
            {suggestion.followup}
          </div>
        </>
      )}
      <div className="flex items-center gap-2 pt-1">
        <span className={labelClass}>RS 手動指定：</span>
        {HABC_GRADES.map((g) => {
          const active = manualGrade === g.value;
          return (
            <button
              key={g.value}
              type="button"
              onClick={() => editable && onPick(active ? null : g.value)}
              disabled={!editable}
              className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11.5px] font-semibold border ${
                active
                  ? 'bg-white shadow-sm'
                  : 'bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]'
              }`}
              style={
                active
                  ? { borderColor: g.color, color: g.color }
                  : undefined
              }
              aria-pressed={active}
            >
              {g.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Jump button (RS02 / RS06) ────────────────────────────────────────────

function JumpButton({
  emoji,
  title,
  hint,
  badge,
  href,
  disabled,
}: {
  emoji: string;
  title: string;
  hint: string;
  badge: { text: string; color: string; bg: string };
  href: string;
  disabled?: boolean;
}) {
  const body = (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${
        disabled
          ? 'border-[#EEECE6] bg-[#F8F7F4] opacity-60 cursor-not-allowed'
          : 'border-[#D5D3CB] bg-white hover:border-[#1A3A5C] hover:shadow-sm'
      } transition`}
    >
      <span className="text-[26px]">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-[#2C2C2A]">{title}</div>
        <div className="text-[11.5px] text-[#5A5955] mt-0.5">{hint}</div>
      </div>
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium"
        style={{ backgroundColor: badge.bg, color: badge.color }}
      >
        {badge.text}
      </span>
      <span className="text-[#9A9890]">→</span>
    </div>
  );
  if (disabled) return body;
  return (
    <Link href={href} className="block">
      {body}
    </Link>
  );
}
