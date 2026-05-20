'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTransition, useState, useEffect } from 'react';

import { DataGrid, type DataGridColumn } from '@/components/data-grid';
import {
  KpiCard,
  KanbanBoard,
  Timeline,
  type KanbanColumn,
  type KanbanCard,
  type TimelineEvent,
} from '@/components/visualization';
import {
  DELIVERY_STATUS_CHIP,
  DELIVERY_STATUS_LABELS,
  DELIVERY_KANBAN_COLUMNS,
  type DeliveryStatus,
  type DeliveryKanbanCard,
  type DeliveryKpiSummary,
  type DeliveryTimelineEvent,
} from '@/domain/sales-delivery.constants';
import type { DeliveryRow } from '@/lib/deliveries';
import {
  deleteDeliveryAction,
  setDeliveryStatusAction,
  loadDeliveryTimelineAction,
} from '@/lib/delivery/delivery-actions';

const ALL_STATUSES: DeliveryStatus[] = [
  'scheduled', 'pdi_in_progress', 'pdi_complete', 'accessories_complete',
  'delivery_confirmed', 'warranty_signed', 'ceremony_ready', 'delivered', 'cancelled',
];

type Banner = { ok: boolean; msg: string } | null;

type Props = {
  rows: DeliveryRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  filterStatus: string;
  filterQ: string;
  filterDateFrom: string;
  filterDateTo: string;
  viewMode: 'list' | 'kanban';
  kpis: DeliveryKpiSummary;
  kanbanCards: DeliveryKanbanCard[];
  canEdit: boolean;
};

// kanban column → 下一個業務 status（拖卡片時用）
const COLUMN_TARGET_STATUS: Record<string, DeliveryStatus> = {
  scheduled: 'scheduled',
  pdi: 'pdi_in_progress',
  ready: 'accessories_complete',
  ceremony: 'ceremony_ready',
  delivered: 'delivered',
};

export function DeliveryBoard({
  rows, totalCount, page, pageSize,
  filterStatus, filterQ, filterDateFrom, filterDateTo,
  viewMode, kpis, kanbanCards, canEdit,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [localStatus, setLocalStatus] = useState(filterStatus);
  const [localQ, setLocalQ] = useState(filterQ);
  const [localDateFrom, setLocalDateFrom] = useState(filterDateFrom);
  const [localDateTo, setLocalDateTo] = useState(filterDateTo);

  // Detail panel state
  const [detailRow, setDetailRow] = useState<DeliveryRow | DeliveryKanbanCard | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<DeliveryTimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function buildQs(extra: Record<string, string> = {}): string {
    const params = new URLSearchParams();
    if (localStatus) params.set('status', localStatus);
    if (localQ) params.set('q', localQ);
    if (localDateFrom) params.set('date_from', localDateFrom);
    if (localDateTo) params.set('date_to', localDateTo);
    if (viewMode === 'kanban') params.set('view', 'kanban');
    for (const [k, v] of Object.entries(extra)) {
      if (v === '') params.delete(k);
      else params.set(k, v);
    }
    return params.toString();
  }

  function goSearch() {
    startTransition(() => {
      router.push(`/sales/delivery?${buildQs({ page: '1' })}`);
    });
  }

  function goReset() {
    setLocalStatus(''); setLocalQ(''); setLocalDateFrom(''); setLocalDateTo('');
    startTransition(() => {
      router.push(viewMode === 'kanban' ? '/sales/delivery?view=kanban' : '/sales/delivery?page=1');
    });
  }

  function goToPage(p: number) {
    startTransition(() => {
      router.push(`/sales/delivery?${buildQs({ page: String(p) })}`);
    });
  }

  function setViewMode(mode: 'list' | 'kanban') {
    const params = new URLSearchParams();
    if (localStatus) params.set('status', localStatus);
    if (localQ) params.set('q', localQ);
    if (localDateFrom) params.set('date_from', localDateFrom);
    if (localDateTo) params.set('date_to', localDateTo);
    if (mode === 'kanban') params.set('view', 'kanban');
    else params.set('page', '1');
    startTransition(() => {
      router.push(`/sales/delivery?${params.toString()}`);
    });
  }

  async function handleDelete(row: DeliveryRow) {
    if (!confirm(`確定要刪除交車單 ${row.delivery_no}？`)) return;
    startTransition(async () => {
      const res = await deleteDeliveryAction(row.id);
      showBanner(res.ok ? { ok: true, msg: `已刪除 ${row.delivery_no}` } : { ok: false, msg: res.error });
      if (res.ok) router.refresh();
    });
  }

  async function handleCancel(row: DeliveryRow) {
    if (!confirm(`確定要取消交車單 ${row.delivery_no}？`)) return;
    startTransition(async () => {
      const res = await setDeliveryStatusAction(row.id, 'cancelled');
      showBanner(res.ok ? { ok: true, msg: '已取消' } : { ok: false, msg: res.error });
      if (res.ok) router.refresh();
    });
  }

  async function handleKanbanMove(cardId: string, fromCol: string, toCol: string) {
    if (!canEdit) {
      showBanner({ ok: false, msg: '沒有編輯權限，無法移動卡片' });
      return;
    }
    const target = COLUMN_TARGET_STATUS[toCol];
    if (!target) return;
    if (fromCol === toCol) return;
    startTransition(async () => {
      const res = await setDeliveryStatusAction(cardId, target);
      showBanner(
        res.ok
          ? { ok: true, msg: `已移到「${DELIVERY_STATUS_LABELS[target]}」` }
          : { ok: false, msg: res.error },
      );
      if (res.ok) router.refresh();
    });
  }

  async function openDetail(row: DeliveryRow | DeliveryKanbanCard) {
    setDetailRow(row);
    setTimelineEvents([]);
    setTimelineLoading(true);
    const res = await loadDeliveryTimelineAction(row.id);
    setTimelineLoading(false);
    if (res.ok) setTimelineEvents(res.data);
  }

  // Esc 關閉 detail panel
  useEffect(() => {
    if (!detailRow) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDetailRow(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailRow]);

  const labelClass = 'text-[11px] text-[#9A9890] font-medium';
  const selectClass =
    'h-[30px] px-2 rounded border border-[#D5D3CB] text-[12.5px] text-[#2C2C2A] focus:border-[#185FA5] focus:outline-none bg-white';
  const inputClass =
    'h-[30px] px-2 rounded border border-[#D5D3CB] text-[12.5px] text-[#2C2C2A] focus:border-[#185FA5] focus:outline-none bg-white';

  const columns: DataGridColumn<DeliveryRow>[] = [
    {
      id: 'delivery_no',
      header: '交車單號',
      width: 160,
      hideable: false,
      cell: (r) => (
        <button
          type="button"
          onClick={() => openDetail(r)}
          className="font-mono text-[11.5px] text-[#1A3A5C] font-semibold hover:underline"
        >
          {r.delivery_no}
        </button>
      ),
      exportValue: (r) => r.delivery_no,
      sortValue: (r) => r.delivery_no,
    },
    {
      id: 'status',
      header: '狀態',
      width: 120,
      cell: (r) => {
        const chip = DELIVERY_STATUS_CHIP[r.status];
        return (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${chip.bg} ${chip.text}`}
          >
            {DELIVERY_STATUS_LABELS[r.status]}
          </span>
        );
      },
      exportValue: (r) => DELIVERY_STATUS_LABELS[r.status],
      sortValue: (r) => r.status,
    },
    {
      id: 'customer_name',
      header: '客戶',
      width: 110,
      cell: (r) => <span className="text-[12.5px]">{r.customer_name ?? '—'}</span>,
      exportValue: (r) => r.customer_name ?? '',
      sortValue: (r) => r.customer_name ?? '',
    },
    {
      id: 'vehicle_model_name',
      header: '車款',
      width: 160,
      cell: (r) => (
        <span className="text-[12px] text-[#2C2C2A]">
          {r.vehicle_model_name ?? '—'}
          {r.vehicle_color ? (
            <span className="ml-1.5 text-[#9A9890]">/ {r.vehicle_color}</span>
          ) : null}
        </span>
      ),
      exportValue: (r) => `${r.vehicle_model_name ?? ''} ${r.vehicle_color ?? ''}`.trim(),
      sortValue: (r) => r.vehicle_model_name ?? '',
    },
    {
      id: 'vin',
      header: 'VIN',
      width: 160,
      defaultHidden: true,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#5A5955]">{r.vin ?? '—'}</span>
      ),
      exportValue: (r) => r.vin ?? '',
      sortValue: (r) => r.vin ?? '',
    },
    {
      id: 'scheduled_delivery_date',
      header: '預定交車日',
      width: 110,
      cell: (r) => (
        <span className="text-[12px]">{r.scheduled_delivery_date ?? '—'}</span>
      ),
      exportValue: (r) => r.scheduled_delivery_date ?? '',
      sortValue: (r) => r.scheduled_delivery_date ?? '',
    },
    {
      id: 'actual_delivery_date',
      header: '實際交車日',
      width: 110,
      defaultHidden: true,
      cell: (r) => (
        <span className="text-[12px]">{r.actual_delivery_date ?? '—'}</span>
      ),
      exportValue: (r) => r.actual_delivery_date ?? '',
      sortValue: (r) => r.actual_delivery_date ?? '',
    },
    {
      id: 'rs_name',
      header: '銷售顧問',
      width: 100,
      cell: (r) => <span className="text-[12px]">{r.rs_name ?? '—'}</span>,
      exportValue: (r) => r.rs_name ?? '',
      sortValue: (r) => r.rs_name ?? '',
    },
    {
      id: 'created_at',
      header: '建立時間',
      width: 130,
      defaultHidden: true,
      cell: (r) => (
        <span className="text-[11.5px] text-[#9A9890]">
          {new Date(r.created_at).toLocaleDateString('zh-TW')}
        </span>
      ),
      exportValue: (r) => new Date(r.created_at).toLocaleDateString('zh-TW'),
      sortValue: (r) => r.created_at,
    },
  ];

  const btnCls = 'h-[26px] px-2.5 rounded text-[11.5px] font-medium whitespace-nowrap disabled:opacity-50';

  // Kanban data
  const kanbanColumns: KanbanColumn[] = DELIVERY_KANBAN_COLUMNS.map((c) => ({
    id: c.id,
    title: c.title,
    tone: c.tone,
  }));
  const kanbanCardsUi: KanbanCard[] = kanbanCards.map((c) => ({
    id: c.id,
    columnId: c.columnId,
    content: (
      <button
        type="button"
        onClick={(e) => {
          // 點卡片本體開 detail panel；拖曳由父層 KanbanBoard 處理
          e.stopPropagation();
          openDetail(c);
        }}
        className="text-left w-full"
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="font-mono text-[10.5px] text-[#1A3A5C] font-semibold">
            {c.delivery_no.replace(/^DLV-/, '')}
          </span>
          <span
            className={`inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium ${
              DELIVERY_STATUS_CHIP[c.status].bg
            } ${DELIVERY_STATUS_CHIP[c.status].text}`}
          >
            {DELIVERY_STATUS_LABELS[c.status]}
          </span>
        </div>
        <div className="text-[12px] text-[#2C2C2A] font-semibold">{c.customer_name ?? '—'}</div>
        <div className="text-[11.5px] text-[#5A5955] mt-0.5">
          {c.vehicle_model_name ?? '—'}
          {c.vehicle_color ? <span className="text-[#9A9890]"> / {c.vehicle_color}</span> : null}
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[11px] text-[#9A9890]">
            {c.scheduled_delivery_date ?? '未排程'}
          </span>
          {c.rs_name ? (
            <span className="text-[11px] text-[#185FA5]">{c.rs_name}</span>
          ) : null}
        </div>
      </button>
    ),
  }));

  const timelineUi: TimelineEvent[] = timelineEvents.map((e) => ({
    id: e.id,
    time: new Date(e.time).toLocaleString('zh-TW', { hour12: false }),
    title: e.title,
    description: e.description,
    tone: e.tone,
  }));

  const tabBtnCls = (active: boolean) =>
    `h-[30px] px-3 rounded text-[12.5px] font-medium whitespace-nowrap ${
      active
        ? 'bg-[#1A3A5C] text-white'
        : 'bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]'
    }`;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">交車管理</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          RS05
        </span>
        <span className="text-[12px] text-[#9A9890]">
          交車排程 · PDI 整備 · 保固條款 · 交車完成
        </span>
      </header>

      {/* KPI row */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          tone="blue"
          label="今日交車"
          value={kpis.todayCount}
          icon={<span className="text-[18px]">🛵</span>}
        />
        <KpiCard
          tone="amber"
          label="待排程 / 已排程"
          value={kpis.pendingScheduleCount}
          icon={<span className="text-[18px]">📅</span>}
        />
        <KpiCard
          tone="teal"
          label="PDI 待做"
          value={kpis.pdiPendingCount}
          icon={<span className="text-[18px]">🔧</span>}
        />
        <KpiCard
          tone="green"
          label="本月已交"
          value={kpis.monthDeliveredCount}
          icon={<span className="text-[18px]">✓</span>}
        />
      </section>

      {/* Banner */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 border ${
            banner.ok
              ? 'bg-[#EAF3DE] text-[#3B6D11] border-[#C5DC9F]'
              : 'bg-[#FDECEA] text-[#CC0000] border-[#F5AEAD]'
          }`}
        >
          {banner.msg}
        </div>
      )}

      {/* View mode toggle + filter bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3 space-y-3">
        {/* View mode */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={tabBtnCls(viewMode === 'list')}
          >
            📋 列表
          </button>
          <button
            type="button"
            onClick={() => setViewMode('kanban')}
            className={tabBtnCls(viewMode === 'kanban')}
          >
            🗂 看板
          </button>
          <span className="text-[11.5px] text-[#9A9890] ml-2">
            {viewMode === 'list' ? '所有狀態（含已交/已取消），可分頁' : '進行中 + 本月已交，可拖曳卡片變更狀態'}
          </span>
        </div>

        {/* Filter row（list mode 才顯示完整 filter；kanban 只給關鍵字） */}
        <div className="flex gap-2 items-end flex-wrap">
          {viewMode === 'list' && (
            <>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>狀態</label>
                <select
                  className={selectClass}
                  value={localStatus}
                  onChange={(e) => setLocalStatus(e.target.value)}
                >
                  <option value="">全部狀態</option>
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>{DELIVERY_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>預定交車日（起）</label>
                <input
                  type="date"
                  className={inputClass}
                  value={localDateFrom}
                  onChange={(e) => setLocalDateFrom(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>預定交車日（迄）</label>
                <input
                  type="date"
                  className={inputClass}
                  value={localDateTo}
                  onChange={(e) => setLocalDateTo(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>關鍵字（客戶 / 車款 / 單號）</label>
            <input
              type="text"
              className={`${inputClass} w-[180px]`}
              placeholder="搜尋..."
              value={localQ}
              onChange={(e) => setLocalQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && goSearch()}
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={goSearch}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? '查詢中⋯' : '查詢'}
            </button>
            <button
              type="button"
              onClick={goReset}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          {viewMode === 'list' ? (
            <>共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆交車單</>
          ) : (
            <>共 <b className="text-[#2C2C2A]">{kanbanCards.length}</b> 筆在看板上 · 拖曳卡片可變更狀態</>
          )}
        </span>
      </div>

      {/* Main view */}
      {viewMode === 'list' ? (
        rows.length === 0 && totalCount === 0 ? (
          <section className="bg-white border border-[#EEECE6] rounded-lg px-6 py-10 text-center">
            <div className="text-[13px] text-[#5A5955] font-semibold mb-1">目前沒有交車單</div>
            <div className="text-[12px] text-[#9A9890]">
              當銷售訂單簽訂後，會自動建立對應交車單。可至 <Link href="/sales/orders" className="text-[#185FA5] hover:underline">訂單中心</Link> 查看。
            </div>
          </section>
        ) : (
          <DataGrid
            columns={columns}
            data={rows}
            rowKey={(r) => r.id}
            persistKey="sales/delivery"
            exportFileName="delivery-list"
            emptyMessage="沒有符合條件的交車單"
            disabled={isPending}
            pagination={{ page, pageSize, totalCount, onPageChange: goToPage }}
            rowActionsWidth={220}
            rowActions={(r) => (
              <>
                <button
                  type="button"
                  onClick={() => openDetail(r)}
                  className={`${btnCls} bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]`}
                >
                  詳情
                </button>
                {canEdit && (
                  <a
                    href={`/delivery/confirm-1?deliveryId=${r.id}`}
                    className={`${btnCls} bg-[#0F6E56] text-white hover:bg-[#0a5742]`}
                  >
                    進入作業
                  </a>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleCancel(r)}
                    disabled={isPending || r.status === 'cancelled' || r.status === 'delivered'}
                    className={`${btnCls} bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]`}
                  >
                    取消
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleDelete(r)}
                    disabled={isPending}
                    className={`${btnCls} bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]`}
                  >
                    刪除
                  </button>
                )}
              </>
            )}
          />
        )
      ) : (
        kanbanCards.length === 0 ? (
          <section className="bg-white border border-[#EEECE6] rounded-lg px-6 py-10 text-center">
            <div className="text-[13px] text-[#5A5955] font-semibold mb-1">沒有進行中的交車</div>
            <div className="text-[12px] text-[#9A9890]">切到列表模式查看全部交車單（含已交 / 已取消）</div>
          </section>
        ) : (
          <section className={isPending ? 'opacity-60 pointer-events-none' : ''}>
            <KanbanBoard
              columns={kanbanColumns}
              cards={kanbanCardsUi}
              onMove={canEdit ? handleKanbanMove : undefined}
            />
            {!canEdit && (
              <div className="mt-2 text-[11px] text-[#9A9890]">提示：您沒有編輯權限，看板僅供瀏覽</div>
            )}
          </section>
        )
      )}

      {/* Detail Panel */}
      {detailRow && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setDetailRow(null)}
            aria-hidden
          />
          <aside className="fixed right-0 top-0 bottom-0 w-[420px] bg-white border-l border-[#EEECE6] z-50 shadow-2xl overflow-y-auto">
            <header className="px-4 py-3 border-b border-[#EEECE6] flex items-start justify-between gap-2 sticky top-0 bg-white">
              <div className="min-w-0">
                <div className="font-mono text-[11px] text-[#9A9890]">{detailRow.delivery_no}</div>
                <h2 className="text-[14px] font-semibold text-[#2C2C2A] truncate">
                  {detailRow.customer_name ?? '（未填客戶）'}
                </h2>
                <div className="text-[11.5px] text-[#5A5955] mt-0.5">
                  {detailRow.vehicle_model_name ?? '—'}
                  {detailRow.vehicle_color ? <span className="text-[#9A9890]"> / {detailRow.vehicle_color}</span> : null}
                </div>
                <div className="mt-1.5">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                      DELIVERY_STATUS_CHIP[detailRow.status].bg
                    } ${DELIVERY_STATUS_CHIP[detailRow.status].text}`}
                  >
                    {DELIVERY_STATUS_LABELS[detailRow.status]}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailRow(null)}
                className="h-7 w-7 rounded hover:bg-[#F8F7F4] text-[#9A9890] text-[16px] leading-none"
                aria-label="關閉"
              >
                ✕
              </button>
            </header>

            <div className="px-4 py-3 space-y-3">
              {/* KV */}
              <section className="bg-[#F8F7F4] border border-[#EEECE6] rounded px-3 py-2">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
                  <div className="text-[#9A9890]">預定交車日</div>
                  <div className="text-[#2C2C2A]">{detailRow.scheduled_delivery_date ?? '—'}</div>
                  <div className="text-[#9A9890]">銷售顧問</div>
                  <div className="text-[#2C2C2A]">{detailRow.rs_name ?? '—'}</div>
                </div>
              </section>

              {/* Quick actions（看板和列表都有） */}
              {canEdit && detailRow.status !== 'delivered' && detailRow.status !== 'cancelled' && (
                <section>
                  <div className="text-[11px] text-[#9A9890] mb-1.5">快速狀態</div>
                  <div className="flex flex-wrap gap-1.5">
                    {detailRow.status === 'scheduled' && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            const res = await setDeliveryStatusAction(detailRow.id, 'pdi_in_progress');
                            showBanner(res.ok ? { ok: true, msg: '已進 PDI' } : { ok: false, msg: res.error });
                            if (res.ok) {
                              setDetailRow(null);
                              router.refresh();
                            }
                          })
                        }
                        className={`${btnCls} bg-[#FDF3E3] border border-[#F5C97D] text-[#854F0B]`}
                      >
                        進入 PDI
                      </button>
                    )}
                    {detailRow.status === 'pdi_in_progress' && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            const res = await setDeliveryStatusAction(detailRow.id, 'pdi_complete');
                            showBanner(res.ok ? { ok: true, msg: 'PDI 完成' } : { ok: false, msg: res.error });
                            if (res.ok) {
                              setDetailRow(null);
                              router.refresh();
                            }
                          })
                        }
                        className={`${btnCls} bg-[#E8F5F0] border border-[#7FCFA3] text-[#0F6E56]`}
                      >
                        PDI 完成
                      </button>
                    )}
                    <a
                      href={`/delivery/confirm-1?deliveryId=${detailRow.id}`}
                      className={`${btnCls} bg-[#1A3A5C] text-white hover:bg-[#0F2A45]`}
                    >
                      進入交車作業
                    </a>
                  </div>
                </section>
              )}

              {/* Timeline */}
              <section>
                <div className="text-[11px] text-[#9A9890] mb-1.5">時間軸</div>
                {timelineLoading ? (
                  <div className="text-[12px] text-[#9A9890] py-3">載入中⋯</div>
                ) : timelineUi.length === 0 ? (
                  <div className="text-[12px] text-[#9A9890] py-3">尚無事件</div>
                ) : (
                  <Timeline events={timelineUi} />
                )}
              </section>
            </div>
          </aside>
        </>
      )}
    </main>
  );
}
