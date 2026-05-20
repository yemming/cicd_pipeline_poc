"use client";

/**
 * 試駕記錄 List View — RS02（/sales/reception/test-rides）
 *
 * Design pattern：KPI 4 顆 + filter bar + DataGrid + Modal create。
 * 走 server actions（不直接接觸 supabase）；單頁同步 wizard 入口 button。
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization";
import {
  TEST_DRIVE_STATUS_LABELS,
  TEST_DRIVE_STATUS_CHIP,
  type ListTestDrivesFilter,
  type TestDriveRow,
  type TestDriveStatus,
  type TestDriveLookups,
} from "@/domain/sales-test-drives.constants";
import {
  createTestDriveAction,
  deleteTestDriveAction,
  setTestDriveStatusAction,
} from "@/lib/sales/test-drives-actions";
import type { TestDriveStats } from "@/domain/sales-test-drives";

type Banner = { ok: boolean; msg: string } | null;

type CreateForm = {
  scheduled_date: string;
  scheduled_time: string;
  customer_id: string;
  vehicle_model_id: string;
  sales_consultant_id: string;
  notes: string;
};

const emptyForm: CreateForm = {
  scheduled_date: new Date().toISOString().slice(0, 10),
  scheduled_time: "14:00",
  customer_id: "",
  vehicle_model_id: "",
  sales_consultant_id: "",
  notes: "",
};

export function TestRidesBoard({
  rows,
  totalCount,
  stats,
  filters,
  lookups,
  canEdit,
  page,
  pageSize,
}: {
  rows: TestDriveRow[];
  totalCount: number;
  stats: TestDriveStats;
  filters: ListTestDrivesFilter;
  lookups: TestDriveLookups;
  canEdit: boolean;
  page: number;
  pageSize: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  // ── filter local state ──
  const [statusFilter, setStatusFilter] = useState<string>(filters.status ?? "all");
  const [saFilter, setSaFilter] = useState<string>(filters.sales_consultant_id ?? "");
  const [dateFrom, setDateFrom] = useState<string>(filters.date_from ?? "");
  const [dateTo, setDateTo] = useState<string>(filters.date_to ?? "");
  const [q, setQ] = useState<string>(filters.q ?? "");

  // ── modal ──
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyForm);

  function showBanner(b: Exclude<Banner, null>) {
    setBanner(b);
    if (b.ok) {
      setTimeout(() => setBanner(null), 2200);
    }
  }

  function applyFilters(reset = false) {
    const sp = new URLSearchParams();
    if (!reset) {
      if (statusFilter && statusFilter !== "all") sp.set("status", statusFilter);
      if (saFilter) sp.set("sa", saFilter);
      if (dateFrom) sp.set("from", dateFrom);
      if (dateTo) sp.set("to", dateTo);
      if (q.trim()) sp.set("q", q.trim());
    }
    startTransition(() => router.push(`/sales/reception/test-rides?${sp.toString()}`));
  }

  function resetFilters() {
    setStatusFilter("all");
    setSaFilter("");
    setDateFrom("");
    setDateTo("");
    setQ("");
    applyFilters(true);
  }

  function goToPage(next: number) {
    const sp = new URLSearchParams();
    if (statusFilter && statusFilter !== "all") sp.set("status", statusFilter);
    if (saFilter) sp.set("sa", saFilter);
    if (dateFrom) sp.set("from", dateFrom);
    if (dateTo) sp.set("to", dateTo);
    if (q.trim()) sp.set("q", q.trim());
    sp.set("page", String(next));
    startTransition(() => router.push(`/sales/reception/test-rides?${sp.toString()}`));
  }

  function submitCreate() {
    if (!form.scheduled_date) {
      showBanner({ ok: false, msg: "請選擇試駕日期" });
      return;
    }
    const scheduled_at = new Date(`${form.scheduled_date}T${form.scheduled_time || "00:00"}:00`).toISOString();
    startTransition(async () => {
      const res = await createTestDriveAction({
        scheduled_at,
        customer_id: form.customer_id || null,
        vehicle_model_id: form.vehicle_model_id || null,
        sales_consultant_id: form.sales_consultant_id || null,
        notes: form.notes || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 試駕已建立" });
        setModalOpen(false);
        setForm(emptyForm);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: `建立失敗：${res.error}` });
      }
    });
  }

  function changeStatus(row: TestDriveRow, next: TestDriveStatus) {
    startTransition(async () => {
      const res = await setTestDriveStatusAction(row.id, next);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已切換為「${TEST_DRIVE_STATUS_LABELS[next]}」` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: `切換失敗：${res.error}` });
      }
    });
  }

  function removeRow(row: TestDriveRow) {
    if (!window.confirm(`確認刪除這筆試駕記錄？(${row.customer_name ?? "未指定客戶"})`)) return;
    startTransition(async () => {
      const res = await deleteTestDriveAction(row.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: `刪除失敗：${res.error}` });
      }
    });
  }

  // ── columns ──
  const columns = useMemo<DataGridColumn<TestDriveRow>[]>(
    () => [
      {
        id: "scheduled_at",
        header: "預約時間",
        width: 160,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/sales/reception/test-rides/${r.id}`}
            className="font-mono text-[12.5px] text-[#185FA5] hover:underline"
          >
            {new Date(r.scheduled_at).toLocaleString("zh-TW", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Link>
        ),
        exportValue: (r) => r.scheduled_at,
        sortValue: (r) => r.scheduled_at,
      },
      {
        id: "customer_name",
        header: "客戶",
        width: 130,
        cell: (r) => r.customer_name ?? <span className="text-[#9A9890]">—</span>,
        exportValue: (r) => r.customer_name ?? "",
      },
      {
        id: "vehicle_model_name",
        header: "車款",
        width: 180,
        cell: (r) => r.vehicle_model_name ?? <span className="text-[#9A9890]">—</span>,
        exportValue: (r) => r.vehicle_model_name ?? "",
      },
      {
        id: "consultant_name",
        header: "銷售顧問",
        width: 110,
        cell: (r) => r.consultant_name ?? <span className="text-[#9A9890]">—</span>,
        exportValue: (r) => r.consultant_name ?? "",
      },
      {
        id: "status",
        header: "狀態",
        width: 100,
        cell: (r) => {
          const c = TEST_DRIVE_STATUS_CHIP[r.status];
          return (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${c.bg} ${c.text} whitespace-nowrap`}>
              {TEST_DRIVE_STATUS_LABELS[r.status]}
            </span>
          );
        },
        exportValue: (r) => TEST_DRIVE_STATUS_LABELS[r.status],
        sortValue: (r) => r.status,
      },
      {
        id: "rating",
        header: "評分",
        width: 70,
        cell: (r) => {
          const rating = (r.metadata?.rating as number | undefined) ?? null;
          if (rating == null) return <span className="text-[#9A9890]">—</span>;
          return (
            <span className="font-mono text-[12px] text-[#854F0B]">{"★".repeat(rating)}{rating}/5</span>
          );
        },
        exportValue: (r) => (r.metadata?.rating as number | undefined) ?? "",
        sortValue: (r) => (r.metadata?.rating as number | undefined) ?? null,
      },
      {
        id: "notes",
        header: "備註",
        width: 260,
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955] truncate block max-w-[260px]" title={r.notes ?? ""}>
            {r.notes ?? "—"}
          </span>
        ),
        exportValue: (r) => r.notes ?? "",
      },
    ],
    [],
  );

  // ── KPI slot ──
  const kpiSlot = (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
      <KpiCard
        label="今日試駕"
        value={stats.todayCount}
        tone="blue"
        layout="horizontal"
        icon={<span className="text-[20px]">📅</span>}
      />
      <KpiCard
        label="本週完成"
        value={stats.weekCompleted}
        tone="green"
        layout="horizontal"
        icon={<span className="text-[20px]">✅</span>}
      />
      <KpiCard
        label="平均評分"
        value={stats.avgRating != null ? `${stats.avgRating} / 5` : "—"}
        tone="amber"
        layout="horizontal"
        icon={<span className="text-[20px]">⭐</span>}
      />
      <KpiCard
        label="待安排"
        value={stats.scheduledCount}
        tone="purple"
        layout="horizontal"
        icon={<span className="text-[20px]">⏳</span>}
      />
    </div>
  );

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">試乘試駕</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">RS02</span>
        <span className="text-[12px] text-[#9A9890]">預約・現場・完成・黃金時刻</span>
        <div className="ml-auto">
          <Link
            href="/sales/reception/test-rides/wizard"
            className="inline-flex items-center h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
          >
            ▶ 開始試駕 Wizard
          </Link>
        </div>
      </header>

      {/* Filter bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">狀態</label>
            <select
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">全部</option>
              {Object.entries(TEST_DRIVE_STATUS_LABELS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">銷售顧問</label>
            <select
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white min-w-[140px]"
              value={saFilter}
              onChange={(e) => setSaFilter(e.target.value)}
            >
              <option value="">— 全部 —</option>
              {lookups.consultants.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">起始日</label>
            <input
              type="date"
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">結束日</label>
            <input
              type="date"
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-[11px] text-[#9A9890] font-medium">關鍵字（備註）</label>
            <input
              type="text"
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white"
              placeholder="搜尋備註..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={() => applyFilters()}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setForm(emptyForm);
                  setModalOpen(true);
                }}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
              >
                ＋ 新增試駕
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆試駕記錄
        </span>
      </div>

      {/* KPI + Table */}
      <DataGrid<TestDriveRow>
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="sales/reception/test-rides"
        exportFileName="test-rides"
        emptyMessage="沒有符合條件的試駕記錄"
        disabled={isPending}
        kpiSlot={kpiSlot}
        pagination={{
          page,
          pageSize,
          totalCount,
          onPageChange: goToPage,
        }}
        rowActions={canEdit ? (r) => (
          <>
            <Link
              href={`/sales/reception/test-rides/${r.id}`}
              className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              查看
            </Link>
            {r.status === "scheduled" && (
              <button
                type="button"
                onClick={() => changeStatus(r, "in_progress")}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDF3E3] border border-[#F0C97E] text-[#854F0B] hover:bg-[#F9E4B7]"
              >
                開始
              </button>
            )}
            {r.status === "in_progress" && (
              <Link
                href={`/sales/reception/test-rides/${r.id}?complete=1`}
                className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-[#0F6E56] border border-[#0F6E56] text-white hover:bg-[#0a5742]"
              >
                完成
              </Link>
            )}
            {r.status !== "cancelled" && r.status !== "completed" && (
              <button
                type="button"
                onClick={() => changeStatus(r, "cancelled")}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
            )}
            <button
              type="button"
              onClick={() => removeRow(r)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
            >
              刪除
            </button>
          </>
        ) : undefined}
        rowActionsWidth={260}
      />

      {/* Create Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => !isPending && setModalOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl w-[480px] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h2 className="text-[14px] font-semibold text-[#2C2C2A]">新增試駕預約</h2>
            </header>
            <div className="px-4 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-[#9A9890] font-medium">日期 *</label>
                  <input
                    type="date"
                    className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white"
                    value={form.scheduled_date}
                    onChange={(e) => setForm((f) => ({ ...f, scheduled_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#9A9890] font-medium">時段</label>
                  <input
                    type="time"
                    className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white"
                    value={form.scheduled_time}
                    onChange={(e) => setForm((f) => ({ ...f, scheduled_time: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-[#9A9890] font-medium">客戶</label>
                <select
                  className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white"
                  value={form.customer_id}
                  onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value }))}
                >
                  <option value="">— 未指定 —</option>
                  {lookups.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-[#9A9890] font-medium">車款</label>
                <select
                  className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white"
                  value={form.vehicle_model_id}
                  onChange={(e) => setForm((f) => ({ ...f, vehicle_model_id: e.target.value }))}
                >
                  <option value="">— 未指定 —</option>
                  {lookups.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-[#9A9890] font-medium">銷售顧問</label>
                <select
                  className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white"
                  value={form.sales_consultant_id}
                  onChange={(e) => setForm((f) => ({ ...f, sales_consultant_id: e.target.value }))}
                >
                  <option value="">— 未指定 —</option>
                  {lookups.consultants.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-[#9A9890] font-medium">備註</label>
                <textarea
                  className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] bg-white"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="意向、車牌、路線、特殊需求…"
                />
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitCreate}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                {isPending ? "建立中⋯" : "建立"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Banner */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}
    </main>
  );
}
