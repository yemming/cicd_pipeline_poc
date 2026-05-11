"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  registerConsignmentAction,
  returnConsignmentAction,
  transferConsignmentInAction,
  type ConsignmentListRow,
  type ConsignmentLookup,
  type ConsignmentStats,
} from "@/domain/consignment";

type Bucket = "all" | "active" | "near" | "expired" | "done";

const STATUS_CHIP: Record<
  string,
  { label: string; chip: string; icon: string }
> = {
  active: {
    label: "寄存中",
    chip: "bg-[#EAF3DE] text-[#3B6D11]",
    icon: "✅",
  },
  partial: {
    label: "部分轉購",
    chip: "bg-[#FDF3E3] text-[#854F0B]",
    icon: "🟡",
  },
  transferred: {
    label: "已轉入",
    chip: "bg-[#EBF3FF] text-[#1A3A5C]",
    icon: "📦",
  },
  returned: {
    label: "已退還",
    chip: "bg-[#F2F2F2] text-[#6B6A68]",
    icon: "↩",
  },
  expired: {
    label: "已過期",
    chip: "bg-[#FDECEA] text-[#CC0000]",
    icon: "🔴",
  },
};

function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

function fmtMoney(n: number): string {
  return "NT$ " + n.toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}

// 寄存期限進度條：用 (剩餘天數 / 總期間天數)，過期 = 0%
function dueRatio(row: ConsignmentListRow): number {
  if (row.due_bucket === "expired") return 0;
  const total = Math.max(
    1,
    Math.round(
      (new Date(row.end_date).getTime() -
        new Date(row.start_date).getTime()) /
        86_400_000,
    ),
  );
  const r = Math.max(0, Math.min(1, row.days_remaining / total));
  return r;
}

export function ConsignmentBoard({
  rows,
  stats,
  lookup,
  canEdit,
  initialBucket,
  initialSupplierId,
  initialDueFrom,
  initialDueTo,
  initialQ,
}: {
  rows: ConsignmentListRow[];
  stats: ConsignmentStats;
  lookup: ConsignmentLookup;
  canEdit: boolean;
  initialBucket: Bucket;
  initialSupplierId: string;
  initialDueFrom: string;
  initialDueTo: string;
  initialQ: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [bucket, setBucket] = useState<Bucket>(initialBucket);
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [dueFrom, setDueFrom] = useState(initialDueFrom);
  const [dueTo, setDueTo] = useState(initialDueTo);
  const [q, setQ] = useState(initialQ);

  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );
  const [registerOpen, setRegisterOpen] = useState(false);
  const [detail, setDetail] = useState<ConsignmentListRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // bucket counts（依規格 pill 列）
  const bucketCounts = useMemo(() => {
    const all = rows.length;
    const active = rows.filter((r) => r.status === "active").length;
    const near = rows.filter((r) => r.due_bucket === "near").length;
    const expired = rows.filter((r) => r.due_bucket === "expired").length;
    const done = rows.filter(
      (r) => r.status === "transferred" || r.status === "partial",
    ).length;
    return { all, active, near, expired, done };
  }, [rows]);

  function applyFilter(nextBucket?: Bucket) {
    const b = nextBucket ?? bucket;
    if (nextBucket) setBucket(nextBucket);
    const params = new URLSearchParams();
    if (b !== "all") params.set("bucket", b);
    if (supplierId) params.set("supplier_id", supplierId);
    if (dueFrom) params.set("due_from", dueFrom);
    if (dueTo) params.set("due_to", dueTo);
    if (q.trim()) params.set("q", q.trim());
    startTransition(() =>
      router.push(
        `/parts/operations/consignment${params.toString() ? "?" + params : ""}`,
      ),
    );
  }

  function resetFilter() {
    setSupplierId("");
    setDueFrom("");
    setDueTo("");
    setQ("");
    setBucket("all");
    startTransition(() => router.push("/parts/operations/consignment"));
  }

  function showBanner(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function handleTransfer(row: ConsignmentListRow) {
    if (!canEdit) return;
    if (!confirm(`確認將 ${row.con_no} 轉入正式庫存？`)) return;
    setBusyId(row.id);
    startTransition(async () => {
      const res = await transferConsignmentInAction(row.id);
      setBusyId(null);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ ${row.con_no} 已轉入正式庫存` });
        setDetail(null);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleReturn(row: ConsignmentListRow) {
    if (!canEdit) return;
    const reason = prompt(`退還 ${row.con_no}（請輸入原因，可空白）`) ?? undefined;
    if (reason === null) return; // user cancel
    setBusyId(row.id);
    startTransition(async () => {
      const res = await returnConsignmentAction(row.id, reason);
      setBusyId(null);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ ${row.con_no} 已退還，記錄保留 90 天` });
        setDetail(null);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const columns: DataGridColumn<ConsignmentListRow>[] = [
    {
      id: "con_no",
      header: "寄存單號",
      width: 140,
      hideable: false,
      cell: (r) => (
        <button
          type="button"
          onClick={() => setDetail(r)}
          className="font-mono text-[12px] font-semibold text-[#185FA5] hover:underline"
        >
          {r.con_no}
        </button>
      ),
      exportValue: (r) => r.con_no,
      sortValue: (r) => r.con_no,
    },
    {
      id: "supplier",
      header: "供應商",
      width: 160,
      cell: (r) => r.supplier_name ?? "—",
      exportValue: (r) => r.supplier_name ?? "",
      sortValue: (r) => r.supplier_name ?? "",
    },
    {
      id: "item_code",
      header: "備件代碼",
      width: 130,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#5A5955]">
          {r.item_code ?? "—"}
        </span>
      ),
      exportValue: (r) => r.item_code ?? "",
      sortValue: (r) => r.item_code ?? "",
    },
    {
      id: "item_name",
      header: "商品名稱",
      cell: (r) => r.item_name ?? "—",
      exportValue: (r) => r.item_name ?? "",
      sortValue: (r) => r.item_name ?? "",
    },
    {
      id: "initial_qty",
      header: "寄存數量",
      width: 90,
      align: "right",
      cell: (r) => (
        <span className="font-mono">{Number(r.initial_qty ?? 0)}</span>
      ),
      exportValue: (r) => Number(r.initial_qty ?? 0),
      sortValue: (r) => Number(r.initial_qty ?? 0),
    },
    {
      id: "remaining_qty",
      header: "剩餘",
      width: 80,
      align: "right",
      cell: (r) => (
        <span className="font-mono">{Number(r.remaining_qty ?? 0)}</span>
      ),
      exportValue: (r) => Number(r.remaining_qty ?? 0),
      sortValue: (r) => Number(r.remaining_qty ?? 0),
    },
    {
      id: "warehouse",
      header: "寄存倉",
      width: 130,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#5A5955]">
          {r.warehouse_name ?? "—"}
        </span>
      ),
      exportValue: (r) => r.warehouse_name ?? "",
      sortValue: (r) => r.warehouse_name ?? "",
    },
    {
      id: "end_date",
      header: "寄存期限",
      width: 110,
      cell: (r) => (
        <span className="font-mono text-[11.5px]">{fmtDate(r.end_date)}</span>
      ),
      exportValue: (r) => r.end_date,
      sortValue: (r) => r.end_date,
    },
    {
      id: "days_remaining",
      header: "剩餘天數",
      width: 140,
      cell: (r) => {
        if (r.due_bucket === "done") {
          return <span className="text-[#9A9890]">—</span>;
        }
        if (r.due_bucket === "expired") {
          return (
            <span className="font-mono text-[12px] font-semibold text-[#CC0000]">
              {r.days_remaining} 天
            </span>
          );
        }
        const ratio = dueRatio(r);
        const fill =
          r.due_bucket === "near" ? "bg-[#EF9F27]" : "bg-[#0F6E56]";
        const text =
          r.due_bucket === "near" ? "text-[#854F0B]" : "text-[#0F6E56]";
        return (
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-[80px] h-[5px] rounded bg-[#EEECE6] overflow-hidden">
              <span
                className={`block h-full rounded ${fill}`}
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </span>
            <span
              className={`font-mono text-[12px] font-semibold ${text} whitespace-nowrap`}
            >
              {r.days_remaining} 天
            </span>
          </div>
        );
      },
      exportValue: (r) =>
        r.due_bucket === "done" ? "—" : `${r.days_remaining}`,
      sortValue: (r) => r.days_remaining,
    },
    {
      id: "status",
      header: "寄存狀態",
      width: 100,
      cell: (r) => {
        const def =
          STATUS_CHIP[r.due_bucket === "expired" ? "expired" : r.status] ??
          STATUS_CHIP.active;
        return (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
          >
            {def.icon} {def.label}
          </span>
        );
      },
      exportValue: (r) =>
        STATUS_CHIP[r.due_bucket === "expired" ? "expired" : r.status]?.label ??
        r.status,
      sortValue: (r) => r.status,
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">寄存管理</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          7.3
        </span>
        <span className="text-[12px] text-[#9A9890]">
          供應商寄存備件管理 · 追蹤寄存期限 · 確認後轉為正式庫存
        </span>
      </header>

      {/* Stats 4 卡 */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <StatCard
          label="寄存中品項"
          value={stats.active_count}
          sub={`共 ${stats.active_suppliers} 家供應商`}
          color="text-[#1A3A5C]"
        />
        <StatCard
          label="即將到期（≤7 天）"
          value={stats.near_due_count}
          sub="需儘速確認或退還"
          color="text-[#854F0B]"
        />
        <StatCard
          label="已過期未處理"
          value={stats.expired_count}
          sub="請立即處理"
          color="text-[#CC0000]"
        />
        <StatCard
          label="本月已轉入正式庫存"
          value={stats.transferred_this_month_count}
          sub={`件 / 共 ${fmtMoney(stats.transferred_this_month_amount)}`}
          color="text-[#0F6E56]"
        />
      </section>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              供應商
            </label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-[180px]"
            >
              <option value="">全部</option>
              {lookup.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              到期日（起）
            </label>
            <input
              type="date"
              value={dueFrom}
              onChange={(e) => setDueFrom(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-[140px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              到期日（迄）
            </label>
            <input
              type="date"
              value={dueTo}
              onChange={(e) => setDueTo(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-[140px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              寄存單 / 備件代碼 / 商品名稱
            </label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="輸入查詢..."
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-[220px]"
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
            <button
              type="button"
              onClick={() => canEdit && setRegisterOpen(true)}
              disabled={!canEdit}
              title={canEdit ? "" : "沒有權限"}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 登錄寄存品項
            </button>
          </div>
        </div>
      </section>

      {/* Pill bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5">
          <Pill
            active={bucket === "all"}
            onClick={() => applyFilter("all")}
            label={`全部（${bucketCounts.all}）`}
            color="default"
          />
          <Pill
            active={bucket === "active"}
            onClick={() => applyFilter("active")}
            label={`寄存中（${bucketCounts.active}）`}
            color="default"
          />
          <Pill
            active={bucket === "expired"}
            onClick={() => applyFilter("expired")}
            label={`已過期（${bucketCounts.expired}）`}
            color="red"
          />
          <Pill
            active={bucket === "near"}
            onClick={() => applyFilter("near")}
            label={`即將到期（${bucketCounts.near}）`}
            color="amber"
          />
          <Pill
            active={bucket === "done"}
            onClick={() => applyFilter("done")}
            label={`已轉入（${bucketCounts.done}）`}
            color="green"
          />
        </div>
        <span className="ml-auto text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆
        </span>
      </div>

      {/* Table */}
      <DataGrid<ConsignmentListRow>
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/operations/consignment"
        exportFileName="寄存清單"
        emptyMessage="沒有符合條件的寄存單"
        disabled={isPending}
        rowActionsWidth={180}
        rowActions={(r) => {
          const canTransfer =
            canEdit &&
            r.status === "active" &&
            Number(r.remaining_qty ?? 0) > 0;
          const canReturn = canEdit && r.status === "active";
          const isBusy = busyId === r.id;
          return (
            <>
              <button
                type="button"
                disabled={!canTransfer || isBusy}
                onClick={() => handleTransfer(r)}
                className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isBusy ? "處理中⋯" : "確認轉入"}
              </button>
              <button
                type="button"
                disabled={!canReturn || isBusy}
                onClick={() => handleReturn(r)}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                退還
              </button>
            </>
          );
        }}
      />

      {/* Register Modal */}
      {registerOpen && (
        <RegisterModal
          lookup={lookup}
          onClose={() => setRegisterOpen(false)}
          onSuccess={(con_no) => {
            showBanner({ ok: true, msg: `✓ ${con_no} 已登錄` });
            setRegisterOpen(false);
            router.refresh();
          }}
          onError={(msg) => showBanner({ ok: false, msg })}
        />
      )}

      {/* Detail Drawer */}
      {detail && (
        <DetailDrawer
          row={detail}
          canEdit={canEdit}
          busyId={busyId}
          onClose={() => setDetail(null)}
          onTransfer={() => handleTransfer(detail)}
          onReturn={() => handleReturn(detail)}
        />
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

// ────────────────────────────────────────────────────────────
// Small helpers
// ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number;
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

function RegisterModal({
  lookup,
  onClose,
  onSuccess,
  onError,
}: {
  lookup: ConsignmentLookup;
  onClose: () => void;
  onSuccess: (con_no: string) => void;
  onError: (msg: string) => void;
}) {
  const [supplierId, setSupplierId] = useState(lookup.suppliers[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(
    lookup.warehouses.find((w) => w.code.includes("CONSIGN"))?.id ??
      lookup.warehouses[0]?.id ??
      "",
  );
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [startDate, setStartDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState(() =>
    new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const canSubmit =
    !pending &&
    !!supplierId &&
    !!warehouseId &&
    !!itemId &&
    qty > 0 &&
    !!startDate &&
    !!endDate;

  function onSubmit() {
    startTransition(async () => {
      const res = await registerConsignmentAction({
        supplier_id: supplierId,
        item_id: itemId,
        warehouse_id: warehouseId,
        initial_qty: Number(qty),
        unit_cost: Number(unitCost) || undefined,
        start_date: startDate,
        end_date: endDate,
        notes: notes || undefined,
      });
      if (res.ok) onSuccess(res.data.con_no);
      else onError(res.error);
    });
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-[rgba(15,30,50,0.45)] flex items-start justify-end"
      onClick={onClose}
    >
      <div
        className="bg-white w-[580px] h-screen border-l border-[#EEECE6] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="bg-[#1A3A5C] px-5 py-3.5 flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="bg-white/10 hover:bg-white/20 text-white text-[12px] px-2.5 py-1 rounded"
          >
            ← 返回
          </button>
          <div>
            <div className="text-[14px] font-semibold text-white">
              登錄寄存品項
            </div>
            <div className="text-[12px] text-white/65">
              登錄後進入寄存倉，到期或確認採購後轉正式庫存
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <section>
            <div className="text-[11px] font-semibold text-[#9A9890] uppercase tracking-wider mb-2.5 flex items-center gap-2">
              寄存來源
              <span className="flex-1 h-px bg-[#EEECE6]" />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="供應商" required>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  disabled={pending}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full"
                >
                  {lookup.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="寄存倉庫" required>
                <select
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  disabled={pending}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full"
                >
                  {lookup.warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} · {w.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="寄存開始日期" required>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={pending}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full"
                />
              </Field>
              <Field label="寄存到期日" required>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={pending}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full"
                />
              </Field>
            </div>
          </section>

          <section>
            <div className="text-[11px] font-semibold text-[#9A9890] uppercase tracking-wider mb-2.5 flex items-center gap-2">
              品項
              <span className="flex-1 h-px bg-[#EEECE6]" />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="備件" required full>
                <select
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  disabled={pending}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full"
                >
                  <option value="">— 選備件 —</option>
                  {lookup.items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.code ?? "(no code)"} · {i.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="數量" required>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={qty}
                  onChange={(e) =>
                    setQty(Math.max(0, Number(e.target.value) || 0))
                  }
                  disabled={pending}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full text-right font-mono"
                />
              </Field>
              <Field label="單價（選填）">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={unitCost}
                  onChange={(e) =>
                    setUnitCost(Math.max(0, Number(e.target.value) || 0))
                  }
                  disabled={pending}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full text-right font-mono"
                />
              </Field>
              <Field label="供應商寄存單號 / 備註" full>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={pending}
                  placeholder="選填：供應商提供的單據號碼"
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full"
                />
              </Field>
            </div>
          </section>

          <div className="bg-[#EAF4FB] border border-[#B5D4F4] rounded-lg px-4 py-3 text-[12px] text-[#5A5955] leading-relaxed">
            <div className="text-[11px] font-semibold text-[#185FA5] mb-1">
              ℹ️ 寄存規則說明
            </div>
            <ul className="list-disc list-inside space-y-0.5">
              <li>
                寄存品項<b>不計入</b>可用庫存，不觸發庫存水位告警
              </li>
              <li>到期前 7 天系統自動發送提醒通知</li>
              <li>「確認轉入」後正式計入庫存，依當時時間點建立入庫記錄</li>
              <li>「退還」後庫存不變，記錄保留 90 天</li>
            </ul>
          </div>
        </div>

        <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2 shrink-0 bg-white">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            {pending ? "登錄中⋯" : "確認登錄"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${full ? "col-span-2" : ""}`}>
      <label className="text-[11px] text-[#9A9890] font-medium">
        {label} {required && <span className="text-[#CC0000]">*</span>}
      </label>
      {children}
    </div>
  );
}

function DetailDrawer({
  row,
  canEdit,
  busyId,
  onClose,
  onTransfer,
  onReturn,
}: {
  row: ConsignmentListRow;
  canEdit: boolean;
  busyId: string | null;
  onClose: () => void;
  onTransfer: () => void;
  onReturn: () => void;
}) {
  const def =
    STATUS_CHIP[row.due_bucket === "expired" ? "expired" : row.status] ??
    STATUS_CHIP.active;
  const isBusy = busyId === row.id;
  const canTransfer =
    canEdit && row.status === "active" && Number(row.remaining_qty ?? 0) > 0;
  const canReturn = canEdit && row.status === "active";

  return (
    <div
      className="fixed inset-0 z-40 bg-[rgba(15,30,50,0.45)] flex items-start justify-end"
      onClick={onClose}
    >
      <div
        className="bg-white w-[580px] h-screen border-l border-[#EEECE6] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="bg-[#1A3A5C] px-5 py-3.5 flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="bg-white/10 hover:bg-white/20 text-white text-[12px] px-2.5 py-1 rounded"
          >
            ← 返回
          </button>
          <div className="flex-1">
            <div className="text-[14px] font-semibold text-white">
              寄存品項詳情
            </div>
            <div className="text-[12px] text-white/65 font-mono">
              {row.con_no}
            </div>
          </div>
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
          >
            {def.icon} {def.label}
          </span>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {row.due_bucket === "expired" && (
            <div className="bg-[#FDECEA] border border-[#F5AEAD] rounded-lg px-3.5 py-2.5 text-[12px] text-[#CC0000] flex items-center gap-2">
              🔴
              <span>
                此寄存品項已<b>逾期 {Math.abs(row.days_remaining)} 天</b>
                ，請儘速決定「確認轉入正式庫存」或「退還給供應商」。
              </span>
            </div>
          )}
          {row.due_bucket === "near" && (
            <div className="bg-[#FDF3E3] border border-[#FAC775] rounded-lg px-3.5 py-2.5 text-[12px] text-[#854F0B] flex items-center gap-2">
              🟠
              <span>
                寄存品項將於 <b>{row.days_remaining} 天</b>後到期，請評估處理方式。
              </span>
            </div>
          )}

          <section>
            <div className="text-[11px] font-semibold text-[#9A9890] uppercase tracking-wider mb-2.5 flex items-center gap-2">
              寄存資訊
              <span className="flex-1 h-px bg-[#EEECE6]" />
            </div>
            <div className="grid grid-cols-3 gap-3 bg-[#F8F7F4] border border-[#EEECE6] rounded-lg p-3.5">
              <KvSm label="寄存單號" value={row.con_no} mono />
              <KvSm label="供應商" value={row.supplier_name ?? "—"} />
              <KvSm label="寄存倉" value={row.warehouse_name ?? "—"} mono />
              <KvSm label="寄存開始" value={fmtDate(row.start_date)} mono />
              <KvSm
                label="寄存到期"
                value={fmtDate(row.end_date)}
                mono
                redValue={row.due_bucket === "expired"}
              />
              <KvSm
                label="單價"
                value={
                  row.unit_cost != null
                    ? `NT$ ${Number(row.unit_cost).toLocaleString()}`
                    : "—"
                }
                mono
              />
            </div>
          </section>

          <section>
            <div className="text-[11px] font-semibold text-[#9A9890] uppercase tracking-wider mb-2.5 flex items-center gap-2">
              品項明細
              <span className="flex-1 h-px bg-[#EEECE6]" />
            </div>
            <div className="border border-[#EEECE6] rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_80px_80px] bg-[#F8F7F4] px-3 py-2 text-[11px] font-semibold text-[#9A9890]">
                <span>備件代碼 / 商品名稱</span>
                <span className="text-center">寄存</span>
                <span className="text-center">剩餘</span>
                <span className="text-center">已轉購</span>
              </div>
              <div className="grid grid-cols-[1fr_80px_80px_80px] border-t border-[#EEECE6] px-3 py-2.5 items-center">
                <div>
                  <div className="font-mono text-[11.5px] text-[#185FA5]">
                    {row.item_code ?? "—"}
                  </div>
                  <div className="text-[11.5px] text-[#5A5955] mt-0.5">
                    {row.item_name ?? "—"}
                  </div>
                </div>
                <div className="text-center font-mono font-semibold text-[12px]">
                  {Number(row.initial_qty ?? 0)}
                </div>
                <div className="text-center font-mono font-semibold text-[12px]">
                  {Number(row.remaining_qty ?? 0)}
                </div>
                <div className="text-center font-mono font-semibold text-[12px]">
                  {Number(row.transferred_qty ?? 0)}
                </div>
              </div>
            </div>
          </section>

          {row.notes && (
            <section>
              <div className="text-[11px] font-semibold text-[#9A9890] uppercase tracking-wider mb-2.5 flex items-center gap-2">
                備註
                <span className="flex-1 h-px bg-[#EEECE6]" />
              </div>
              <div className="text-[12.5px] text-[#5A5955] whitespace-pre-wrap">
                {row.notes}
              </div>
            </section>
          )}

          {(canTransfer || canReturn) && (
            <section className="bg-[#F8F7F4] border border-[#EEECE6] rounded-lg p-3.5">
              <div className="text-[11px] font-semibold text-[#9A9890] uppercase tracking-wider mb-2">
                選擇處理方式
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onTransfer}
                  disabled={!canTransfer || isBusy}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  📦 {isBusy ? "處理中⋯" : "確認轉入正式庫存"}
                </button>
                <button
                  type="button"
                  onClick={onReturn}
                  disabled={!canReturn || isBusy}
                  className="h-[30px] px-3.5 rounded text-[12.5px] bg-[#FDF3E3] border border-[#FAC775] text-[#854F0B] hover:bg-[#fbe9c8] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ↩ 退還給供應商
                </button>
              </div>
              <div className="text-[11px] text-[#9A9890] mt-2">
                轉入後將以今日時間點建立入庫記錄；退還後寄存記錄保留 90 天。
              </div>
            </section>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2 shrink-0 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            關閉
          </button>
        </footer>
      </div>
    </div>
  );
}

function KvSm({
  label,
  value,
  mono,
  redValue,
}: {
  label: string;
  value: string;
  mono?: boolean;
  redValue?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] text-[#9A9890]">{label}</span>
      <span
        className={`text-[12.5px] font-medium ${
          mono ? "font-mono text-[12px]" : ""
        } ${redValue ? "text-[#CC0000]" : "text-[#2C2C2A]"}`}
      >
        {value}
      </span>
    </div>
  );
}
