'use client';

import { useRouter } from 'next/navigation';
import { useTransition, useState } from 'react';

import { DataGrid, type DataGridColumn } from '@/components/data-grid';
import {
  DELIVERY_STATUS_CHIP,
  DELIVERY_STATUS_LABELS,
  type DeliveryStatus,
} from '@/lib/deliveries.constants';
import type { DeliveryRow } from '@/lib/deliveries';
import {
  deleteDeliveryAction,
  setDeliveryStatusAction,
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
};

export function DeliveryBoard({
  rows, totalCount, page, pageSize,
  filterStatus, filterQ, filterDateFrom, filterDateTo,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [localStatus, setLocalStatus] = useState(filterStatus);
  const [localQ, setLocalQ] = useState(filterQ);
  const [localDateFrom, setLocalDateFrom] = useState(filterDateFrom);
  const [localDateTo, setLocalDateTo] = useState(filterDateTo);

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function goSearch() {
    const params = new URLSearchParams();
    if (localStatus) params.set('status', localStatus);
    if (localQ) params.set('q', localQ);
    if (localDateFrom) params.set('date_from', localDateFrom);
    if (localDateTo) params.set('date_to', localDateTo);
    params.set('page', '1');
    startTransition(() => { router.push(`/sales/delivery?${params}`); });
  }

  function goReset() {
    setLocalStatus(''); setLocalQ(''); setLocalDateFrom(''); setLocalDateTo('');
    startTransition(() => { router.push('/sales/delivery?page=1'); });
  }

  function goToPage(p: number) {
    const params = new URLSearchParams();
    if (localStatus) params.set('status', localStatus);
    if (localQ) params.set('q', localQ);
    if (localDateFrom) params.set('date_from', localDateFrom);
    if (localDateTo) params.set('date_to', localDateTo);
    params.set('page', String(p));
    startTransition(() => { router.push(`/sales/delivery?${params}`); });
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
        <span className="font-mono text-[11.5px] text-[#1A3A5C] font-semibold">
          {r.delivery_no}
        </span>
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

      {/* Filter bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
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
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆交車單
        </span>
      </div>

      {/* Table */}
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
            <a
              href={`/delivery/confirm-1?deliveryId=${r.id}`}
              className={`${btnCls} bg-[#0F6E56] text-white hover:bg-[#0a5742]`}
            >
              進入作業
            </a>
            <button
              type="button"
              onClick={() => handleCancel(r)}
              disabled={isPending || r.status === 'cancelled' || r.status === 'delivered'}
              className={`${btnCls} bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]`}
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => handleDelete(r)}
              disabled={isPending}
              className={`${btnCls} bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]`}
            >
              刪除
            </button>
          </>
        )}
      />
    </main>
  );
}
