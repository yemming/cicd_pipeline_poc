"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  cancelCountSessionAction,
  type CountOpsRow,
  type CountOpsStats,
} from "@/domain/count";
import {
  COUNT_STATUS_CHIP,
  COUNT_TYPE_CHIP,
  fmtDate,
  fmtMoney,
  fmtPct,
  isCountActive,
} from "@/domain/count.constants";

type StatusFilter = "all" | "active" | "pending_approval" | "completed";

export function CountOpsBoard({
  rows,
  stats,
  warehouses,
  canEdit,
  initialStatus,
  initialWarehouseId,
  initialQ,
}: {
  rows: CountOpsRow[];
  stats: CountOpsStats;
  warehouses: { id: string; name: string }[];
  canEdit: boolean;
  initialStatus: StatusFilter;
  initialWarehouseId: string;
  initialQ: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId);
  const [q, setQ] = useState(initialQ);
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  function applyFilter(nextStatus?: StatusFilter) {
    const s = nextStatus ?? status;
    if (nextStatus) setStatus(nextStatus);
    const params = new URLSearchParams();
    if (s !== "all") params.set("status", s);
    if (warehouseId) params.set("warehouse_id", warehouseId);
    if (q.trim()) params.set("q", q.trim());
    startTransition(() =>
      router.push(
        `/parts/operations/count-ops${params.toString() ? "?" + params : ""}`,
      ),
    );
  }

  function resetFilter() {
    setWarehouseId("");
    setQ("");
    setStatus("all");
    startTransition(() => router.push("/parts/operations/count-ops"));
  }

  function showBanner(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function handleCancel(row: CountOpsRow) {
    if (!canEdit) return;
    if (!confirm(`確認取消盤點 ${row.ct_no}？\n明細將被清空。`)) return;
    setBusyId(row.id);
    startTransition(async () => {
      const res = await cancelCountSessionAction(row.id);
      setBusyId(null);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ ${row.ct_no} 已取消` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const columns: DataGridColumn<CountOpsRow>[] = [
    {
      id: "ct_no",
      header: "盤點任務號",
      width: 160,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/parts/operations/count-ops/${r.id}`}
          className="font-mono text-[12px] font-semibold text-[#185FA5] hover:underline"
        >
          {r.ct_no}
        </Link>
      ),
      exportValue: (r) => r.ct_no,
      sortValue: (r) => r.ct_no,
    },
    {
      id: "count_type",
      header: "盤點類型",
      width: 100,
      cell: (r) => {
        const def = COUNT_TYPE_CHIP[r.count_type] ?? COUNT_TYPE_CHIP.manual;
        return (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
          >
            {def.label}
          </span>
        );
      },
      exportValue: (r) =>
        COUNT_TYPE_CHIP[r.count_type]?.label ?? r.count_type,
      sortValue: (r) => r.count_type,
    },
    {
      id: "warehouse",
      header: "盤點範圍",
      width: 150,
      cell: (r) => (
        <span className="text-[12.5px] text-[#5A5955]">
          {r.warehouse_name ?? "—"}
        </span>
      ),
      exportValue: (r) => r.warehouse_name ?? "",
      sortValue: (r) => r.warehouse_name ?? "",
    },
    {
      id: "count_date",
      header: "盤點日期",
      width: 100,
      cell: (r) => (
        <span className="font-mono text-[11.5px]">{fmtDate(r.count_date)}</span>
      ),
      exportValue: (r) => r.count_date,
      sortValue: (r) => r.count_date,
    },
    {
      id: "total_lines",
      header: "應盤點",
      width: 80,
      align: "right",
      cell: (r) => <span className="font-mono">{r.total_lines ?? 0}</span>,
      exportValue: (r) => Number(r.total_lines ?? 0),
      sortValue: (r) => Number(r.total_lines ?? 0),
    },
    {
      id: "counted",
      header: "已盤點",
      width: 80,
      align: "right",
      cell: (r) => <span className="font-mono">{r.counted_lines}</span>,
      exportValue: (r) => r.counted_lines,
      sortValue: (r) => r.counted_lines,
    },
    {
      id: "progress",
      header: "進度",
      width: 140,
      cell: (r) => {
        const total = Number(r.total_lines ?? 0);
        if (total === 0) return <span className="text-[#9A9890]">—</span>;
        const pct = r.progress_pct;
        const fill =
          pct >= 100
            ? "bg-[#0F6E56]"
            : pct >= 50
              ? "bg-[#1A3A5C]"
              : "bg-[#EF9F27]";
        const text =
          pct >= 100
            ? "text-[#0F6E56]"
            : pct >= 50
              ? "text-[#1A3A5C]"
              : "text-[#854F0B]";
        return (
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-[70px] h-[5px] rounded bg-[#EEECE6] overflow-hidden">
              <span
                className={`block h-full rounded ${fill}`}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </span>
            <span
              className={`font-mono text-[11.5px] font-semibold ${text} whitespace-nowrap`}
            >
              {pct.toFixed(0)}%
            </span>
          </div>
        );
      },
      exportValue: (r) => `${r.progress_pct.toFixed(1)}%`,
      sortValue: (r) => r.progress_pct,
    },
    {
      id: "variance_lines",
      header: "差異數",
      width: 80,
      align: "right",
      cell: (r) => {
        const n = Number(r.variance_lines ?? 0);
        if (n === 0)
          return (
            <span className="font-mono text-[#9A9890]">
              {r.status === "completed" || r.status === "pending_approval"
                ? "0"
                : "—"}
            </span>
          );
        return (
          <span className="font-mono font-semibold text-[#854F0B]">{n}</span>
        );
      },
      exportValue: (r) => Number(r.variance_lines ?? 0),
      sortValue: (r) => Number(r.variance_lines ?? 0),
    },
    {
      id: "variance_amount",
      header: "差異金額",
      width: 110,
      align: "right",
      defaultHidden: true,
      cell: (r) => {
        const n = Number(r.variance_amount ?? 0);
        if (n === 0) return <span className="font-mono text-[#9A9890]">—</span>;
        return (
          <span
            className={`font-mono ${n < 0 ? "text-[#CC0000]" : "text-[#0F6E56]"}`}
          >
            {fmtMoney(n)}
          </span>
        );
      },
      exportValue: (r) => Number(r.variance_amount ?? 0),
      sortValue: (r) => Number(r.variance_amount ?? 0),
    },
    {
      id: "status",
      header: "狀態",
      width: 110,
      cell: (r) => {
        const def = COUNT_STATUS_CHIP[r.status] ?? COUNT_STATUS_CHIP.counting;
        return (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
          >
            {def.label}
          </span>
        );
      },
      exportValue: (r) =>
        COUNT_STATUS_CHIP[r.status]?.label ?? r.status,
      sortValue: (r) => r.status,
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          庫存盤點作業
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          7.4
        </span>
        <span className="text-[12px] text-[#9A9890]">
          執行中的盤點任務管理・連結盤點計畫（8.1）與盤點處理（8.2）
        </span>
      </header>

      {/* Stats 5 卡 */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <StatCard
          label="進行中盤點"
          value={stats.in_progress}
          sub="任務執行中"
          color="text-[#1A3A5C]"
        />
        <StatCard
          label="待開始盤點"
          value={stats.pending_plans}
          sub="排程已到期"
          color="text-[#EF9F27]"
        />
        <StatCard
          label="待覆核"
          value={stats.pending_approval}
          sub="完成首盤等待核可"
          color="text-[#854F0B]"
        />
        <StatCard
          label="本月已完成"
          value={stats.completed_this_month}
          sub="盤點任務"
          color="text-[#0F6E56]"
        />
        <StatCard
          label="平均盤點準確率"
          value={stats.accuracy_last_3 == null ? "—" : fmtPct(stats.accuracy_last_3)}
          sub="最近 3 次平均"
          color="text-[#3B6D11]"
        />
      </section>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              倉庫
            </label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-[180px]"
            >
              <option value="">全部</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              盤點任務號
            </label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="輸入 CT..."
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-[200px]"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={() => applyFilter()}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
            >
              重置
            </button>
            {canEdit ? (
              <Link
                href="/parts/operations/count-ops/new"
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] inline-flex items-center"
              >
                ＋ 建立盤點 session
              </Link>
            ) : (
              <button
                type="button"
                disabled
                title="沒有權限"
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white opacity-50"
              >
                ＋ 建立盤點 session
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Pill bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5">
          <Pill
            active={status === "all"}
            onClick={() => applyFilter("all")}
            label={`全部（${rows.length}）`}
            color="default"
          />
          <Pill
            active={status === "active"}
            onClick={() => applyFilter("active")}
            label={`進行中（${rows.filter((r) => isCountActive(r.status)).length}）`}
            color="default"
          />
          <Pill
            active={status === "pending_approval"}
            onClick={() => applyFilter("pending_approval")}
            label={`待覆核（${rows.filter((r) => r.status === "pending_approval").length}）`}
            color="amber"
          />
          <Pill
            active={status === "completed"}
            onClick={() => applyFilter("completed")}
            label={`已完成（${rows.filter((r) => r.status === "completed").length}）`}
            color="green"
          />
        </div>
        <span className="ml-auto text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆
        </span>
      </div>

      {/* Table */}
      <DataGrid<CountOpsRow>
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/operations/count-ops"
        exportFileName="盤點任務清單"
        emptyMessage="沒有符合條件的盤點任務"
        disabled={isPending}
        rowActionsWidth={170}
        rowActions={(r) => {
          const isBusy = busyId === r.id;
          const isActive = isCountActive(r.status);
          const isPendingApproval = r.status === "pending_approval";
          const isCompleted = r.status === "completed";
          return (
            <>
              <Link
                href={`/parts/operations/count-ops/${r.id}`}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] inline-flex items-center"
              >
                {isActive
                  ? "繼續盤點"
                  : isPendingApproval
                    ? "審核"
                    : isCompleted
                      ? "差異報告"
                      : "查看"}
              </Link>
              {canEdit && isActive ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleCancel(r)}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-40"
                >
                  {isBusy ? "處理中⋯" : "取消"}
                </button>
              ) : null}
            </>
          );
        }}
      />

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

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number | string;
  sub: string;
  color: string;
}) {
  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className={`text-[20px] font-semibold font-mono ${color}`}>
        {value}
      </div>
      <div className="text-[11px] text-[#9A9890] mt-0.5">{sub}</div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color: "default" | "red" | "amber" | "green";
}) {
  const baseInactive: Record<typeof color, string> = {
    default:
      "bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]",
    red: "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD] hover:bg-[#fbdcd9]",
    amber:
      "bg-[#FDF3E3] text-[#854F0B] border border-[#FAC775] hover:bg-[#fbe9c8]",
    green:
      "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F] hover:bg-[#dceec4]",
  };
  const activeCls = "bg-[#1A3A5C] text-white border border-[#1A3A5C]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-[26px] px-3 rounded-full text-[11.5px] font-medium transition ${
        active ? activeCls : baseInactive[color]
      }`}
    >
      {label}
    </button>
  );
}
