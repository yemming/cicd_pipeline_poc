'use client';

/**
 * 接待手卡 List View — RS01 手卡管理（/sales/reception/handcard）
 *
 * Design pattern：DataGrid list + inline create/edit Modal
 * handcard-store（in-flight buffer）保留不動；此頁管理已落地到 DB 的手卡歷史記錄。
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { DataGrid, type DataGridColumn } from '@/components/data-grid';
import { KpiCard } from '@/components/visualization/KpiCard';
import { DonutChart } from '@/components/charts/DonutChart';
import {
  createHandcardAction,
  updateHandcardAction,
  deleteHandcardAction,
  setHandcardStatusAction,
  convertHandcardToLeadAction,
} from '@/lib/sales/handcard-actions';
import {
  HANDCARD_STATUS_LABEL,
  HANDCARD_STATUS_BADGE,
  LEAD_GRADE_BADGE,
  IDENTITY_LABEL,
  PURCHASE_TIMING_LABEL,
  RECEPTION_PERIOD_LABEL,
  type HandcardStatus,
  type HandcardLeadGrade,
  type HandcardIdentity,
  type HandcardPurchaseTiming,
  type HandcardTrialStatus,
  type HandcardReceptionPeriod,
} from '@/domain/sales-handcards.constants';
import type {
  HandcardRow,
  HandcardFilters,
  HandcardKpis,
  HandcardSourceDatum,
} from '@/domain/sales-handcards';

type Banner = { ok: boolean; msg: string } | null;

type ModalMode = 'create' | 'edit';

type FormState = {
  reception_date: string;
  reception_period: HandcardReceptionPeriod | '';
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customer_identity: HandcardIdentity | '';
  assigned_rs_name: string;
  lead_grade: HandcardLeadGrade | '';
  intent_level: string;
  purchase_timing: HandcardPurchaseTiming | '';
  intended_models: string;
  trial_status: HandcardTrialStatus | '';
  competitor_brand: string;
  competitor_model: string;
  quoted_amount: string;
  notes: string;
  status: HandcardStatus;
};

const emptyForm: FormState = {
  reception_date: new Date().toISOString().slice(0, 10),
  reception_period: '',
  customer_name: '',
  customer_phone: '',
  customer_email: '',
  customer_identity: '',
  assigned_rs_name: '',
  lead_grade: '',
  intent_level: '',
  purchase_timing: '',
  intended_models: '',
  trial_status: '',
  competitor_brand: '',
  competitor_model: '',
  quoted_amount: '',
  notes: '',
  status: 'open',
};

const inputClass =
  'h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] text-[#2C2C2A] focus:outline-none focus:border-[#185FA5] bg-white w-full';
const labelClass = 'text-[11px] text-[#9A9890] font-medium';
const lockedClass = 'pointer-events-none opacity-60';

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  return s.slice(0, 10);
}

// ── 小元件 ────────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: HandcardStatus }) {
  const { bg, fg } = HANDCARD_STATUS_BADGE[status] ?? { bg: '#F2F2F2', fg: '#6B6A68' };
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap"
      style={{ background: bg, color: fg }}
    >
      {HANDCARD_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function GradeChip({ grade }: { grade: HandcardLeadGrade | null }) {
  if (!grade) return <span className="text-[#9A9890]">—</span>;
  const { bg, fg } = LEAD_GRADE_BADGE[grade] ?? { bg: '#F2F2F2', fg: '#6B6A68' };
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap"
      style={{ background: bg, color: fg }}
    >
      {grade}
    </span>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export function HandcardBoard({
  rows,
  totalCount,
  canEdit,
  filters,
  kpis,
  sourceDist,
}: {
  rows: HandcardRow[];
  totalCount: number;
  canEdit: boolean;
  filters: HandcardFilters;
  kpis: HandcardKpis;
  sourceDist: HandcardSourceDatum[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editTarget, setEditTarget] = useState<HandcardRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formPending, setFormPending] = useState(false);

  // Filter state
  const [localQ, setLocalQ] = useState(filters.q);
  const [localStatus, setLocalStatus] = useState(filters.status);
  const [localGrade, setLocalGrade] = useState(filters.lead_grade);

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function pushFilter(overrides: Partial<{ status: string; lead_grade: string; q: string }>) {
    const sp = new URLSearchParams({
      status: localStatus,
      lead_grade: localGrade,
      q: localQ,
      ...overrides,
    });
    startTransition(() => router.push(`/sales/reception/handcard?${sp}`));
  }

  // 舊版 modal-based create/edit — 已被 /handcard/new + /handcard/[id]?mode=edit wizard 取代。
  // 留著做為 fallback、未來可考慮整段清理。
  /* eslint-disable @typescript-eslint/no-unused-vars */
  function openCreate() {
    setForm({ ...emptyForm, reception_date: new Date().toISOString().slice(0, 10) });
    setEditTarget(null);
    setModalMode('create');
    setModalOpen(true);
  }

  function openEdit(row: HandcardRow) {
    setForm({
      reception_date: row.reception_date,
      reception_period: (row.reception_period ?? '') as HandcardReceptionPeriod | '',
      customer_name: row.customer_name,
      customer_phone: row.customer_phone ?? '',
      customer_email: row.customer_email ?? '',
      customer_identity: (row.customer_identity ?? '') as HandcardIdentity | '',
      assigned_rs_name: row.assigned_rs_name ?? '',
      lead_grade: (row.lead_grade ?? '') as HandcardLeadGrade | '',
      intent_level: row.intent_level != null ? String(row.intent_level) : '',
      purchase_timing: (row.purchase_timing ?? '') as HandcardPurchaseTiming | '',
      intended_models: (row.intended_models ?? []).join('、'),
      trial_status: (row.trial_status ?? '') as HandcardTrialStatus | '',
      competitor_brand: row.competitor_brand ?? '',
      competitor_model: row.competitor_model ?? '',
      quoted_amount: row.quoted_amount != null ? String(row.quoted_amount) : '',
      notes: row.notes ?? '',
      status: row.status,
    });
    setEditTarget(row);
    setModalMode('edit');
    setModalOpen(true);
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */

  async function handleSubmit() {
    setFormPending(true);
    try {
      const input = {
        reception_date: form.reception_date,
        reception_period: (form.reception_period as HandcardReceptionPeriod) || null,
        customer_name: form.customer_name,
        customer_phone: form.customer_phone || null,
        customer_email: form.customer_email || null,
        customer_identity: (form.customer_identity as HandcardIdentity) || null,
        assigned_rs_name: form.assigned_rs_name || null,
        lead_grade: (form.lead_grade as HandcardLeadGrade) || null,
        intent_level: form.intent_level ? Number(form.intent_level) : null,
        purchase_timing: (form.purchase_timing as HandcardPurchaseTiming) || null,
        intended_models: form.intended_models
          ? form.intended_models.split(/[,、，]/).map((s) => s.trim()).filter(Boolean)
          : null,
        trial_status: (form.trial_status as HandcardTrialStatus) || null,
        competitor_brand: form.competitor_brand || null,
        competitor_model: form.competitor_model || null,
        quoted_amount: form.quoted_amount ? Number(form.quoted_amount) : null,
        notes: form.notes || null,
        status: form.status,
      };

      const res =
        modalMode === 'create'
          ? await createHandcardAction(input)
          : await updateHandcardAction(editTarget!.id, input);

      if (res.ok) {
        setModalOpen(false);
        showBanner({ ok: true, msg: modalMode === 'create' ? '✓ 手卡已建立' : '✓ 已儲存' });
        startTransition(() => router.refresh());
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    } finally {
      setFormPending(false);
    }
  }

  async function handleDelete(row: HandcardRow) {
    if (!confirm(`確定要刪除「${row.customer_name}」的手卡？`)) return;
    startTransition(async () => {
      const res = await deleteHandcardAction(row.id);
      if (res.ok) {
        showBanner({ ok: true, msg: '✓ 已刪除' });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  async function handleConvert(row: HandcardRow) {
    if (!confirm(`將「${row.customer_name}」的手卡轉換成 Lead？`)) return;
    startTransition(async () => {
      const res = await convertHandcardToLeadAction(row.id);
      if (res.ok) {
        showBanner({ ok: true, msg: '✓ 已轉成 Lead' });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  // ── 欄位定義 ─────────────────────────────────────────────────────────────
  const columns: DataGridColumn<HandcardRow>[] = [
    {
      id: 'reception_date',
      header: '接待日',
      width: 100,
      hideable: false,
      cell: (r) => <span className="font-mono text-[12px] text-[#2C2C2A]">{fmtDate(r.reception_date)}</span>,
      exportValue: (r) => r.reception_date,
      sortValue: (r) => r.reception_date,
    },
    {
      id: 'reception_period',
      header: '時段',
      width: 70,
      cell: (r) =>
        r.reception_period ? (
          <span className="text-[12px] text-[#5A5955]">
            {RECEPTION_PERIOD_LABEL[r.reception_period]}
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => (r.reception_period ? RECEPTION_PERIOD_LABEL[r.reception_period] : ''),
    },
    {
      id: 'customer_name',
      header: '客戶姓名',
      width: 110,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/sales/reception/handcard/${r.id}`}
          className="text-[12.5px] font-semibold text-[#1A3A5C] hover:underline"
        >
          {r.customer_name}
        </Link>
      ),
      exportValue: (r) => r.customer_name,
      sortValue: (r) => r.customer_name,
    },
    {
      id: 'customer_phone',
      header: '電話',
      width: 120,
      cell: (r) => <span className="text-[12px] font-mono">{r.customer_phone ?? '—'}</span>,
      exportValue: (r) => r.customer_phone ?? '',
    },
    {
      id: 'customer_identity',
      header: '身份',
      width: 90,
      cell: (r) =>
        r.customer_identity ? (
          <span className="text-[12px] text-[#5A5955]">
            {IDENTITY_LABEL[r.customer_identity]}
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => (r.customer_identity ? IDENTITY_LABEL[r.customer_identity] : ''),
    },
    {
      id: 'lead_grade',
      header: 'HABC',
      width: 70,
      cell: (r) => <GradeChip grade={r.lead_grade} />,
      exportValue: (r) => r.lead_grade ?? '',
      sortValue: (r) => r.lead_grade ?? '',
    },
    {
      id: 'purchase_timing',
      header: '購車時機',
      width: 100,
      cell: (r) =>
        r.purchase_timing ? (
          <span className="text-[12px] text-[#5A5955]">
            {PURCHASE_TIMING_LABEL[r.purchase_timing]}
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => (r.purchase_timing ? PURCHASE_TIMING_LABEL[r.purchase_timing] : ''),
    },
    {
      id: 'intended_models',
      header: '意向車款',
      width: 140,
      cell: (r) =>
        r.intended_models?.length ? (
          <span className="text-[12px] text-[#2C2C2A]">{r.intended_models.join('、')}</span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => (r.intended_models ?? []).join('、'),
      sortable: false,
    },
    {
      id: 'assigned_rs_name',
      header: 'RS',
      width: 90,
      cell: (r) => <span className="text-[12px]">{r.assigned_rs_name ?? '—'}</span>,
      exportValue: (r) => r.assigned_rs_name ?? '',
      sortValue: (r) => r.assigned_rs_name ?? '',
    },
    {
      id: 'status',
      header: '狀態',
      width: 100,
      cell: (r) => <StatusChip status={r.status} />,
      exportValue: (r) => HANDCARD_STATUS_LABEL[r.status],
      sortValue: (r) => r.status,
    },
    {
      id: 'notes',
      header: '備註',
      width: 160,
      defaultHidden: true,
      cell: (r) => (
        <span className="text-[12px] text-[#5A5955] truncate max-w-[150px] block">
          {r.notes ?? '—'}
        </span>
      ),
      exportValue: (r) => r.notes ?? '',
      sortable: false,
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? lockedClass : ''}`}>
      {/* 1. Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">接待手卡</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          RS01
        </span>
        <span className="text-[12px] text-[#9A9890]">
          展廳接待紀錄・HABC 等級・意向車款・轉換追蹤
        </span>
      </header>

      {/* 2. Banner */}
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

      {/* 2.5 KPI Row + Source Donut */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <KpiCard
            tone="blue"
            label="本月新增"
            value={kpis.month_total}
            layout="vertical"
          />
          <KpiCard
            tone="amber"
            label="接待中"
            value={kpis.open_count}
            layout="vertical"
          />
          <KpiCard
            tone="purple"
            label="待跟進"
            value={kpis.pending_followup}
            layout="vertical"
          />
          <KpiCard
            tone="green"
            label="本月轉 Lead"
            value={kpis.converted_count}
            layout="vertical"
          />
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg p-3">
          <div className="text-[13px] font-semibold text-[#2C2C2A] mb-2">
            來源分佈 <span className="text-[11px] text-[#9A9890] font-normal">（近 3 個月）</span>
          </div>
          {sourceDist.length === 0 ? (
            <div className="text-[12px] text-[#9A9890] py-8 text-center">尚無接待資料</div>
          ) : (
            <DonutChart
              data={sourceDist}
              showLegend
              size="sm"
              centerLabel={String(sourceDist.reduce((s, d) => s + d.value, 0))}
              centerCaption="筆數"
            />
          )}
        </div>
      </section>

      {/* 3. Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          {/* 狀態 */}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              className={inputClass}
              style={{ width: 110 }}
              value={localStatus}
              onChange={(e) => setLocalStatus(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="open">接待中</option>
              <option value="closed">已結束</option>
              <option value="converted_to_lead">已轉 Lead</option>
              <option value="no_show">未到場</option>
            </select>
          </div>
          {/* HABC */}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>HABC 等級</label>
            <select
              className={inputClass}
              style={{ width: 110 }}
              value={localGrade}
              onChange={(e) => setLocalGrade(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="H">H — 立即</option>
              <option value="A">A — 3 個月</option>
              <option value="B">B — 半年</option>
              <option value="C">C — 觀望</option>
            </select>
          </div>
          {/* 搜尋 */}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>搜尋</label>
            <input
              className={inputClass}
              style={{ width: 180 }}
              placeholder="姓名 / 電話 / RS"
              value={localQ}
              onChange={(e) => setLocalQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && pushFilter({ q: localQ })}
            />
          </div>

          <div className="flex gap-2 ml-auto">
            <button
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
              disabled={isPending}
              onClick={() => pushFilter({ status: localStatus, lead_grade: localGrade, q: localQ })}
            >
              {isPending ? '查詢中⋯' : '查詢'}
            </button>
            <button
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              onClick={() => {
                setLocalStatus('all');
                setLocalGrade('all');
                setLocalQ('');
                pushFilter({ status: 'all', lead_grade: 'all', q: '' });
              }}
            >
              重置
            </button>
            {canEdit && (
              <Link
                href="/sales/reception/handcard/new"
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] inline-flex items-center"
              >
                ＋ 新增手卡
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* 4. Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆接待手卡
        </span>
      </div>

      {/* 5. DataGrid */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="sales/reception/handcard"
        exportFileName="接待手卡"
        emptyMessage="沒有符合條件的手卡記錄"
        disabled={isPending}
        rowActionsWidth={240}
        rowActions={
          canEdit
            ? (r) => (
                <>
                  <Link
                    href={`/sales/reception/handcard/${r.id}?mode=edit`}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] inline-flex items-center"
                  >
                    編輯
                  </Link>
                  {r.status === 'open' && (
                    <button
                      onClick={() => handleConvert(r)}
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#EAF4FB] border border-[#185FA5] text-[#185FA5] hover:bg-[#d7edf7]"
                    >
                      轉 Lead
                    </button>
                  )}
                  {r.status !== 'closed' && (
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          const res = await setHandcardStatusAction(r.id, 'closed');
                          if (res.ok) {
                            showBanner({ ok: true, msg: '✓ 已結束接待' });
                            router.refresh();
                          } else {
                            showBanner({ ok: false, msg: res.error });
                          }
                        })
                      }
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                    >
                      結束
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(r)}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                  >
                    刪除
                  </button>
                </>
              )
            : undefined
        }
      />

      {/* 6. Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEECE6]">
              <h2 className="text-[14px] font-semibold text-[#2C2C2A]">
                {modalMode === 'create' ? '新增手卡' : '編輯手卡'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-[#9A9890] hover:text-[#2C2C2A] text-[18px] leading-none"
              >
                ×
              </button>
            </div>

            <div className={`px-5 py-4 space-y-4 ${formPending ? lockedClass : ''}`}>
              {/* 接待資訊 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>接待日期 <span className="text-[#CC0000]">*</span></label>
                  <input
                    type="date"
                    className={inputClass}
                    value={form.reception_date}
                    onChange={(e) => setForm((f) => ({ ...f, reception_date: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>時段</label>
                  <select
                    className={inputClass}
                    value={form.reception_period}
                    onChange={(e) => setForm((f) => ({ ...f, reception_period: e.target.value as HandcardReceptionPeriod | '' }))}
                  >
                    <option value="">— 選擇時段 —</option>
                    <option value="morning">上午</option>
                    <option value="afternoon">下午</option>
                    <option value="evening">傍晚</option>
                    <option value="full_day">全天</option>
                  </select>
                </div>
              </div>

              {/* 客戶資訊 */}
              <div className="bg-[#F8F7F4] rounded-lg p-3 space-y-3">
                <p className="text-[11px] font-semibold text-[#2C2C2A]">客戶資訊</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>姓名 <span className="text-[#CC0000]">*</span></label>
                    <input
                      className={inputClass}
                      placeholder="客戶姓名"
                      value={form.customer_name}
                      onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>電話</label>
                    <input
                      className={inputClass}
                      placeholder="09xx-xxxxxx"
                      value={form.customer_phone}
                      onChange={(e) => setForm((f) => ({ ...f, customer_phone: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>Email</label>
                    <input
                      className={inputClass}
                      placeholder="xxx@email.com"
                      value={form.customer_email}
                      onChange={(e) => setForm((f) => ({ ...f, customer_email: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>客戶身份</label>
                    <select
                      className={inputClass}
                      value={form.customer_identity}
                      onChange={(e) => setForm((f) => ({ ...f, customer_identity: e.target.value as HandcardIdentity | '' }))}
                    >
                      <option value="">— 選擇 —</option>
                      <option value="new">首次來訪</option>
                      <option value="revisit">潛客再訪</option>
                      <option value="owner">現有車主</option>
                      <option value="switcher">換購客</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 接待 RS */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>接待 RS</label>
                  <input
                    className={inputClass}
                    placeholder="RS 姓名"
                    value={form.assigned_rs_name}
                    onChange={(e) => setForm((f) => ({ ...f, assigned_rs_name: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>手卡狀態</label>
                  <select
                    className={inputClass}
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as HandcardStatus }))}
                  >
                    <option value="open">接待中</option>
                    <option value="closed">已結束</option>
                    <option value="converted_to_lead">已轉 Lead</option>
                    <option value="no_show">未到場</option>
                  </select>
                </div>
              </div>

              {/* 購買意向 */}
              <div className="bg-[#F8F7F4] rounded-lg p-3 space-y-3">
                <p className="text-[11px] font-semibold text-[#2C2C2A]">購買意向</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>HABC 等級</label>
                    <select
                      className={inputClass}
                      value={form.lead_grade}
                      onChange={(e) => setForm((f) => ({ ...f, lead_grade: e.target.value as HandcardLeadGrade | '' }))}
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
                      value={form.purchase_timing}
                      onChange={(e) => setForm((f) => ({ ...f, purchase_timing: e.target.value as HandcardPurchaseTiming | '' }))}
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
                      value={form.intent_level}
                      onChange={(e) => setForm((f) => ({ ...f, intent_level: e.target.value }))}
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
                      value={form.trial_status}
                      onChange={(e) => setForm((f) => ({ ...f, trial_status: e.target.value as HandcardTrialStatus | '' }))}
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
                    value={form.intended_models}
                    onChange={(e) => setForm((f) => ({ ...f, intended_models: e.target.value }))}
                  />
                </div>
              </div>

              {/* 競品 & 報價 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>競品品牌</label>
                  <input
                    className={inputClass}
                    placeholder="例：Harley-Davidson"
                    value={form.competitor_brand}
                    onChange={(e) => setForm((f) => ({ ...f, competitor_brand: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>競品車款</label>
                  <input
                    className={inputClass}
                    placeholder="例：Iron 883"
                    value={form.competitor_model}
                    onChange={(e) => setForm((f) => ({ ...f, competitor_model: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>報價金額（TWD）</label>
                  <input
                    type="number"
                    className={inputClass}
                    placeholder="0"
                    value={form.quoted_amount}
                    onChange={(e) => setForm((f) => ({ ...f, quoted_amount: e.target.value }))}
                  />
                </div>
              </div>

              {/* 備註 */}
              <div className="flex flex-col gap-1">
                <label className={labelClass}>備註</label>
                <textarea
                  className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] text-[#2C2C2A] focus:outline-none focus:border-[#185FA5] bg-white w-full resize-none"
                  rows={3}
                  placeholder="接待重點、特殊需求…"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#EEECE6]">
              <button
                onClick={() => setModalOpen(false)}
                className="h-[30px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={formPending || !form.customer_name.trim()}
                className="h-[30px] px-5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {formPending
                  ? modalMode === 'create'
                    ? '建立中⋯'
                    : '儲存中⋯'
                  : modalMode === 'create'
                  ? '建立手卡'
                  : '儲存變更'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
