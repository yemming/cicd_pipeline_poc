"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { querySerialNo, type SerialTraceResult } from "@/domain/stock";
import type { StockBalanceRow } from "@/domain/stock";

const STATUS_LABEL: Record<string, string> = {
  on_hand: "在庫",
  reserved: "保留",
  issued: "已發",
  damaged: "損壞",
};

const STATUS_OPTIONS = [
  { value: "", label: "全部" },
  { value: "on_hand", label: "在庫" },
  { value: "reserved", label: "保留" },
  { value: "issued", label: "已發" },
  { value: "damaged", label: "損壞" },
];

const CONTROL_OPTIONS = [
  { value: "", label: "全部" },
  { value: "A", label: "A 類" },
  { value: "B", label: "B 類" },
  { value: "C", label: "C 類" },
  { value: "D", label: "D 類" },
];

function controlChipClass(c: string | null): string {
  switch (c) {
    case "A":
      return "bg-[#FDECEA] text-[#CC0000]";
    case "B":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "C":
      return "bg-[#E8F5F0] text-[#0F6E56]";
    case "D":
      return "bg-[#EAF4FB] text-[#185FA5]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

export function StockBalanceBoard({
  rows,
  totalCount,
  warehouses,
  page,
  pageSize,
  initialQ,
  initialWarehouse,
  initialControl,
  initialStatus,
  initialIncludeZero,
}: {
  rows: StockBalanceRow[];
  totalCount: number;
  warehouses: Array<{ id: string; code: string | null; name: string }>;
  page: number;
  pageSize: number;
  initialQ: string;
  initialWarehouse: string;
  initialControl: string;
  initialStatus: string;
  initialIncludeZero: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fQ, setFQ] = useState(initialQ);
  const [fWh, setFWh] = useState(initialWarehouse);
  const [fCtrl, setFCtrl] = useState(initialControl);
  const [fStatus, setFStatus] = useState(initialStatus);
  const [fZero, setFZero] = useState(initialIncludeZero);
  const [serialOpen, setSerialOpen] = useState(false);

  const buildHref = (
    override: Partial<{
      q: string;
      warehouse: string;
      control: string;
      status: string;
      include_zero: boolean;
      page: number;
    }> = {},
  ) => {
    const p = new URLSearchParams();
    const q = override.q ?? fQ.trim();
    const wh = override.warehouse ?? fWh;
    const ctrl = override.control ?? fCtrl;
    const st = override.status ?? fStatus;
    const z = override.include_zero ?? fZero;
    if (q) p.set("q", q);
    if (wh) p.set("warehouse", wh);
    if (ctrl) p.set("control", ctrl);
    if (st) p.set("status", st);
    if (z) p.set("include_zero", "1");
    if (override.page && override.page > 1) p.set("page", String(override.page));
    const qs = p.toString();
    return qs ? `/parts/operations/balance?${qs}` : "/parts/operations/balance";
  };

  const submitFilters = () => {
    startTransition(() => router.push(buildHref({ page: 1 })));
  };
  const resetFilters = () => {
    setFQ("");
    setFWh("");
    setFCtrl("");
    setFStatus("");
    setFZero(false);
    startTransition(() => router.push("/parts/operations/balance"));
  };
  const goToPage = (next: number) => {
    startTransition(() => router.push(buildHref({ page: next })));
  };

  // KPI（基於當前頁的 row、不是 totalCount 全集）
  const distinctItems = new Set(rows.map((r) => r.item_id)).size;
  const total = rows.reduce((sum, r) => sum + r.on_hand_qty, 0);

  const columns: DataGridColumn<StockBalanceRow>[] = [
    {
      id: "item_code",
      header: "料號",
      width: 140,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/parts/setup/items/${r.item_id}`}
          className="font-mono font-semibold text-[#1A3A5C] hover:text-[#185FA5] hover:underline"
        >
          {r.item_code}
        </Link>
      ),
      exportValue: (r) => r.item_code,
      sortValue: (r) => r.item_code,
    },
    {
      id: "item_name",
      header: "品名",
      cell: (r) => <span className="text-[12.5px]">{r.item_name}</span>,
      exportValue: (r) => r.item_name,
      sortValue: (r) => r.item_name,
    },
    {
      id: "control_type",
      header: "管控",
      width: 80,
      cell: (r) =>
        r.control_type ? (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${controlChipClass(r.control_type)}`}
          >
            {r.control_type}類
          </span>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => r.control_type ?? "",
      sortValue: (r) => r.control_type ?? "",
    },
    {
      id: "warehouse_name",
      header: "倉庫",
      width: 140,
      cell: (r) => <span className="text-[12.5px]">{r.warehouse_name ?? "—"}</span>,
      exportValue: (r) => r.warehouse_name ?? "",
      sortValue: (r) => r.warehouse_name ?? "",
    },
    {
      id: "on_hand_qty",
      header: "數量",
      width: 100,
      align: "right",
      cell: (r) => <span className="font-mono text-[12.5px] text-[#2C2C2A]">{r.on_hand_qty}</span>,
      exportValue: (r) => r.on_hand_qty,
      sortValue: (r) => r.on_hand_qty,
    },
    {
      id: "status_breakdown",
      header: "狀態組成",
      width: 260,
      sortable: false,
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {Object.entries(r.status_breakdown).map(([s, q]) => (
            <span
              key={s}
              className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F8F7F4] text-[#5A5955]"
            >
              {STATUS_LABEL[s] ?? s}:<b className="font-mono ml-0.5">{q}</b>
            </span>
          ))}
        </div>
      ),
      exportValue: (r) =>
        Object.entries(r.status_breakdown)
          .map(([s, q]) => `${STATUS_LABEL[s] ?? s}:${q}`)
          .join(" / "),
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">商品庫存查詢</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          7.0
        </span>
        <span className="text-[12px] text-[#9A9890]">即時 stock_items 庫存彙整</span>
      </header>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">不重複料號（本頁）</div>
          <div className="text-[24px] font-semibold font-mono mt-1 text-[#1A3A5C]">{distinctItems}</div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">本頁總件數</div>
          <div className="text-[24px] font-semibold font-mono mt-1 text-[#0F6E56]">{total}</div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">符合條件總筆數</div>
          <div className="text-[24px] font-semibold font-mono mt-1 text-[#854F0B]">{totalCount}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">商品搜尋</label>
            <input
              type="text"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
              placeholder="代碼或名稱..."
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-[200px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">倉庫</label>
            <select
              value={fWh}
              onChange={(e) => setFWh(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
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
            <label className="text-[11px] text-[#9A9890] font-medium">管控等級</label>
            <select
              value={fCtrl}
              onChange={(e) => setFCtrl(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {CONTROL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">狀態</label>
            <select
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-1.5 h-[30px] text-[12px] text-[#5A5955] cursor-pointer">
            <input type="checkbox" checked={fZero} onChange={(e) => setFZero(e.target.checked)} />
            含零庫存
          </label>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={submitFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <button
              type="button"
              onClick={() => setSerialOpen(true)}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#185FA5] hover:border-[#185FA5]"
            >
              🔍 序列號查詢
            </button>
          </div>
        </div>
      </section>

      {/* DataGrid */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => `${r.item_id}::${r.warehouse_id ?? ""}`}
        persistKey="parts/operations/balance"
        exportFileName="stock-balance"
        emptyMessage="沒有符合條件的庫存"
        disabled={isPending}
        pagination={{
          page,
          pageSize,
          totalCount,
          onPageChange: goToPage,
        }}
      />

      {serialOpen && <SerialQueryModal onClose={() => setSerialOpen(false)} />}
    </main>
  );
}

function SerialQueryModal({ onClose }: { onClose: () => void }) {
  const [sn, setSn] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SerialTraceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = sn.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await querySerialNo(trimmed);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-[100]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-[640px] max-w-[92vw] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">序列號查詢</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-[#9A9890] hover:text-[#2C2C2A] text-[16px] leading-none"
          >
            ✕
          </button>
        </header>
        <div className="px-4 py-4 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={sn}
              onChange={(e) => setSn(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="輸入序列號 (SN)..."
              className="flex-1 h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
              autoFocus
            />
            <button
              type="button"
              onClick={submit}
              disabled={loading || !sn.trim()}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {loading ? "查詢中⋯" : "查詢"}
            </button>
          </div>

          {error && (
            <div className="px-3 py-2 rounded bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] text-[12px]">
              {error}
            </div>
          )}

          {result && !result.found && (
            <div className="px-3 py-3 rounded bg-[#F8F7F4] text-[12.5px] text-[#5A5955]">
              查無此序列號 <b className="font-mono">{result.serial_no}</b>
            </div>
          )}

          {result && result.found && (
            <div className="space-y-3">
              <div className="bg-[#F8F7F4] rounded-lg p-3 grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <div className="text-[11px] text-[#9A9890]">序列號</div>
                  <div className="text-[12.5px] font-mono font-semibold text-[#1A3A5C]">
                    {result.serial_no}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#9A9890]">料號 / 品名</div>
                  <div className="text-[12.5px]">
                    <span className="font-mono font-semibold text-[#1A3A5C]">
                      {result.item.code}
                    </span>{" "}
                    {result.item.name}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#9A9890]">當前位置</div>
                  <div className="text-[12.5px]">{result.current.warehouse_name ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#9A9890]">狀態 / 數量</div>
                  <div className="text-[12.5px]">
                    {STATUS_LABEL[result.current.status] ?? result.current.status}{" "}
                    <b className="font-mono">{result.current.qty}</b>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[12px] font-semibold text-[#2C2C2A] mb-1.5">異動軌跡</div>
                {result.history.length === 0 ? (
                  <div className="px-3 py-3 rounded bg-[#F8F7F4] text-[12px] text-[#9A9890]">
                    沒有異動紀錄
                  </div>
                ) : (
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-[#F8F7F4] text-left text-[11px] text-[#9A9890]">
                        <th className="px-2 py-1.5">時間</th>
                        <th className="px-2 py-1.5">類型</th>
                        <th className="px-2 py-1.5">單據</th>
                        <th className="px-2 py-1.5">倉庫</th>
                        <th className="px-2 py-1.5 text-right">數量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.history.map((h, i) => (
                        <tr key={i} className="border-t border-[#EEECE6]">
                          <td className="px-2 py-1.5 font-mono text-[11.5px] text-[#5A5955]">
                            {h.event_time?.slice(0, 19).replace("T", " ")}
                          </td>
                          <td className="px-2 py-1.5">{h.doc_kind}</td>
                          <td className="px-2 py-1.5 font-mono text-[11.5px] text-[#1A3A5C]">
                            {h.doc_no ?? "—"}
                          </td>
                          <td className="px-2 py-1.5">{h.warehouse_name ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{h.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
