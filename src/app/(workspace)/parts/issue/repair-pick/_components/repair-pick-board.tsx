"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { StockIssueListRow } from "@/domain/issues";
import { voidIssue } from "@/domain/issues";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

type Banner = { ok: boolean; msg: string } | null;

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  draft:     { label: "草稿",   chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  posted:    { label: "已過帳", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  cancelled: { label: "已作廢", chip: "bg-[#FDECEA] text-[#CC0000]" },
};

const STATUS_OPTIONS = [
  { value: "", label: "全部" },
  { value: "posted", label: "已過帳" },
  { value: "cancelled", label: "已作廢" },
];

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `NT$ ${Number(n).toLocaleString("en-US")}`;
}

function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

export function RepairPickBoard({
  rows,
  canEdit,
  warehouses,
  initialStatus,
  initialQ,
  initialWarehouse,
}: {
  rows: StockIssueListRow[];
  canEdit: boolean;
  warehouses: Array<{ id: string; code: string | null; name: string }>;
  initialStatus: string;
  initialQ: string;
  initialWarehouse: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState(initialQ);
  const [warehouseId, setWarehouseId] = useState(initialWarehouse);
  const [banner, setBanner] = useState<Banner>(null);
  const [voidModal, setVoidModal] = useState<{ id: string; gi_no: string } | null>(null);
  const [voidReason, setVoidReason] = useState("");

  function flash(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function applyFilter() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    if (warehouseId) params.set("warehouse_id", warehouseId);
    startTransition(() =>
      router.push(
        `/parts/issue/repair-pick${params.toString() ? "?" + params : ""}`,
      ),
    );
  }

  function resetFilter() {
    setStatus("");
    setQ("");
    setWarehouseId("");
    startTransition(() => router.push("/parts/issue/repair-pick"));
  }

  function confirmVoid() {
    if (!voidModal) return;
    const reason = voidReason.trim();
    if (!reason) {
      flash({ ok: false, msg: "請填寫作廢原因" });
      return;
    }
    startTransition(async () => {
      const res = await voidIssue(voidModal.id, reason);
      if (res.ok) {
        flash({ ok: true, msg: `✓ 已作廢 ${voidModal.gi_no}` });
        setVoidModal(null);
        setVoidReason("");
        router.refresh();
      } else {
        flash({ ok: false, msg: `作廢失敗：${res.error}` });
      }
    });
  }

  const totalAmount = useMemo(
    () => rows.reduce((s, r) => s + Number(r.amount_total ?? 0), 0),
    [rows],
  );

  const columns: DataGridColumn<StockIssueListRow>[] = useMemo(
    () => [
      {
        id: "gi_no",
        header: "領料單號",
        width: 150,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/issue/repair-pick/${r.id}`}
            className="font-mono font-semibold text-[12px] text-[#1A3A5C] hover:underline"
          >
            {r.gi_no ?? "—"}
          </Link>
        ),
        exportValue: (r) => r.gi_no ?? "",
        sortValue: (r) => r.gi_no ?? "",
      },
      {
        id: "ro_no",
        header: "RO 工單",
        width: 140,
        cell: (r) =>
          r.ro_no ? (
            <span className="font-mono text-[12px] text-[#185FA5]">{r.ro_no}</span>
          ) : (
            <span className="text-[11px] text-[#9A9890]">ad-hoc</span>
          ),
        exportValue: (r) => r.ro_no ?? "ad-hoc",
        sortValue: (r) => r.ro_no ?? "",
      },
      {
        id: "customer_name",
        header: "車主",
        width: 140,
        cell: (r) => <span className="text-[12.5px]">{r.customer_name ?? "—"}</span>,
        exportValue: (r) => r.customer_name ?? "",
        sortValue: (r) => r.customer_name ?? "",
      },
      {
        id: "warehouse_name",
        header: "出庫倉",
        width: 140,
        cell: (r) => <span className="text-[12.5px]">{r.warehouse_name ?? "—"}</span>,
        exportValue: (r) => r.warehouse_name ?? "",
        sortValue: (r) => r.warehouse_name ?? "",
      },
      {
        id: "issue_date",
        header: "出庫日",
        width: 110,
        cell: (r) => <span className="font-mono text-[12px]">{fmtDate(r.issue_date)}</span>,
        exportValue: (r) => r.issue_date ?? "",
        sortValue: (r) => r.issue_date ?? "",
      },
      {
        id: "qty_issued_total",
        header: "出庫數",
        width: 90,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px]">{r.qty_issued_total ?? 0}</span>
        ),
        exportValue: (r) => r.qty_issued_total ?? 0,
        sortValue: (r) => Number(r.qty_issued_total ?? 0),
      },
      {
        id: "amount_total",
        header: "出庫金額",
        width: 130,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px]">{fmtMoney(r.amount_total)}</span>
        ),
        exportValue: (r) => r.amount_total ?? 0,
        sortValue: (r) => Number(r.amount_total ?? 0),
      },
      {
        id: "status",
        header: "狀態",
        width: 100,
        hideable: false,
        cell: (r) => {
          const def = STATUS_LABEL[r.status ?? ""] ?? STATUS_LABEL.posted;
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
            >
              {def.label}
            </span>
          );
        },
        exportValue: (r) => (STATUS_LABEL[r.status ?? ""] ?? STATUS_LABEL.posted).label,
        sortValue: (r) => r.status ?? "",
      },
      {
        id: "notes",
        header: "備註",
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955] truncate inline-block max-w-[260px]">
            {r.notes ?? "—"}
          </span>
        ),
        exportValue: (r) => r.notes ?? "",
        sortValue: (r) => r.notes ?? "",
        defaultHidden: false,
      },
    ],
    [],
  );

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">維修領料（RO 工單串接）</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          6.1 ★1
        </span>
        <span className="text-[12px] text-[#9A9890]">
          依 RO 工單查詢 · 倉管執行正式出庫 · 出庫後自動觸發庫存告警檢查
        </span>
      </header>

      {/* v2 RO 串接說明 banner */}
      <section className="bg-[#EAF4FB] border border-[#85B7EB] rounded-lg px-4 py-2.5 text-[12px] text-[#185FA5] leading-relaxed">
        <p className="font-medium">🔗 與 RO 工單串接 · 觸發增項閉環</p>
        <p className="text-[11.5px] text-[#0C3E70] mt-0.5">
          技師持 RO 工單至零件庫房領料後，倉管在此執行正式出庫，出庫數量即時反映至庫存並自動觸發補貨告警檢查。缺料項目可通知售後 SA 啟動 D+3 / D+10 追蹤提醒。
        </p>
      </section>

      {/* v2 狀態 KPI pill row */}
      <section className="flex flex-wrap gap-2 text-[12px]">
        {[
          { label: "已過帳", count: rows.filter((r) => r.status === "posted").length, chip: "bg-[#EAF3DE] text-[#3B6D11] border-[#80CCA8]" },
          { label: "已作廢", count: rows.filter((r) => r.status === "cancelled").length, chip: "bg-[#FDECEA] text-[#CC0000] border-[#F5AEAD]" },
          { label: "草稿", count: rows.filter((r) => r.status === "draft").length, chip: "bg-[#F2F2F2] text-[#6B6A68] border-[#D5D3CB]" },
        ].map((s) => (
          <span key={s.label} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11.5px] ${s.chip}`}>
            <b className="font-mono">{s.count}</b>
            <span>{s.label}</span>
          </span>
        ))}
      </section>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">出庫倉</label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="">全部</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code ? `${w.code} ` : ""}
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">領料單號搜尋</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="搜尋 ISS 編號..."
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-[200px]"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={applyFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <Link
              href="/parts/issue/repair-pick/new"
              className={`h-[30px] px-3 rounded text-[12.5px] font-medium inline-flex items-center ${
                canEdit
                  ? "bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                  : "bg-[#0F6E56] text-white opacity-60 pointer-events-none"
              }`}
            >
              ＋ 新增領料
            </Link>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆領料單
        </span>
        <span className="text-[12px] text-[#9A9890]">
          總金額 <b className="text-[#2C2C2A] font-mono">{fmtMoney(totalAmount)}</b>
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/issue/repair-pick"
        exportFileName="repair-picks"
        emptyMessage="沒有符合條件的領料單"
        disabled={isPending}
        rowActionsWidth={170}
        rowActions={(r) => (
          <>
            <Link
              href={`/parts/issue/repair-pick/${r.id}`}
              className="h-[26px] px-2.5 rounded bg-white border border-[#D5D3CB] text-[11.5px] text-[#5A5955] inline-flex items-center hover:border-[#9A9890]"
            >
              詳細
            </Link>
            {canEdit && r.status === "posted" ? (
              <button
                type="button"
                onClick={() => {
                  setVoidModal({ id: r.id, gi_no: r.gi_no ?? "—" });
                  setVoidReason("");
                }}
                className="h-[26px] px-2.5 rounded bg-[#FDECEA] border border-[#F5AEAD] text-[11.5px] text-[#CC0000] hover:bg-[#fbdcd9]"
              >
                作廢
              </button>
            ) : null}
          </>
        )}
      />

      {!canEdit ? (
        <div className="text-[11px] text-[#9A9890]">
          💡 你目前沒有領料建立 / 作廢權限（parts.issue.create），僅能檢視
        </div>
      ) : null}

      {/* Void Modal */}
      {voidModal ? (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]"
          onClick={() => !isPending && setVoidModal(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-[440px] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">
                作廢領料單 {voidModal.gi_no}
              </h3>
            </header>
            <div className="px-4 py-4 space-y-3">
              <p className="text-[12.5px] text-[#5A5955] leading-relaxed">
                作廢後會自動把出庫的庫存以 <b>available</b> 狀態建回出庫倉。
              </p>
              <div>
                <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                  作廢原因 <span className="text-[#CC0000]">*</span>
                </label>
                <textarea
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  rows={3}
                  placeholder="例如：技師領錯料、工單取消⋯"
                  className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
                  autoFocus
                />
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVoidModal(null)}
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmVoid}
                disabled={isPending || !voidReason.trim()}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#A30000] disabled:opacity-50"
              >
                {isPending ? "作廢中⋯" : "確認作廢"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {/* Banner */}
      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-[110] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}
    </main>
  );
}
