"use client";

/**
 * Tab B — 售後退料確認看板
 *
 * 倉管確認每一筆「退料待確認」記錄（parts_return_requests.status='pending'/'overdue'）：
 *  - 輸入實收數量、選擇零件狀態（full_return / damage_writeoff）
 *  - 差額自動浮現核銷區塊
 *  - 呼叫 confirmReturnRequestAction → 庫存回補或損耗核銷
 */

import { useMemo, useRef, useState, useTransition } from "react";

import { KpiCard } from "@/components/visualization/KpiCard";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { confirmReturnRequestAction } from "@/lib/parts-return/return-actions";
import {
  type ReturnRequestRow,
  type ReturnSourceType,
  type ReturnRequestsSummary,
} from "@/domain/parts-return-requests";
import { fmtDate } from "@/domain/parts-return-in.constants";

// ─────────────────────────────── 類型 ────────────────────────────────

type Banner = { ok: boolean; msg: string } | null;

type ConfirmState = {
  requestId: string;
  row: ReturnRequestRow;
  confirmedQty: string;          // input 字串
  returnType: "full_return" | "damage_writeoff";
  warehouseNote: string;
  shortfallMode: "writeoff" | "ignore";
  shortfallReason: string;
};

// ─────────────────────────────── 常數 ────────────────────────────────

const SOURCE_TYPE_OPTIONS: ReadonlyArray<{ value: ReturnSourceType | ""; label: string }> = [
  { value: "", label: "全部來源" },
  { value: "addon_cancel", label: "追加取消" },
  { value: "ro_cancel", label: "工單取消" },
  { value: "tech_unused", label: "技師退料" },
  { value: "tl_return", label: "TL 歸還" },
  { value: "addon_partial", label: "追加部分取消" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "全部狀態" },
  { value: "pending", label: "待確認" },
  { value: "overdue", label: "已逾期" },
];

// source_type 中文標籤
function sourceTypeLabel(t: string): string {
  return (
    {
      addon_cancel: "追加取消",
      addon_partial: "部分取消",
      ro_cancel: "工單取消",
      tech_unused: "技師退料",
      tl_return: "TL 歸還",
    }[t] ?? t
  );
}

// source_type chip 顏色（各類型對應 token）
function sourceTypeChipClass(t: string): string {
  switch (t) {
    case "ro_cancel":
      return "bg-[#FDF3E3] text-[#854F0B]";   // amber
    case "addon_cancel":
    case "addon_partial":
      return "bg-[#EBF3FF] text-[#1A3A5C]";   // navy blue
    case "tech_unused":
      return "bg-[#EAF4FB] text-[#185FA5]";   // info blue
    case "tl_return":
      return "bg-[#E8F5F0] text-[#0F6E56]";   // teal
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";   // gray
  }
}

// 逾期顯示紅色，否則顯示剩餘天數
function renderDueBy(dueby: string, status: string): React.ReactNode {
  const isOverdue = status === "overdue";
  const due = new Date(dueby);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (isOverdue || diffDays < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[#CC0000] font-medium text-[12px]">
        <span className="material-symbols-outlined text-[14px]">warning</span>
        逾期
      </span>
    );
  }
  if (diffDays === 0) {
    return <span className="text-[#854F0B] font-medium text-[12px]">今日到期</span>;
  }
  return (
    <span className="text-[12px] text-[#5A5955]">
      {fmtDate(dueby)}
      <span className="text-[#9A9890] ml-1">（剩 {diffDays} 天）</span>
    </span>
  );
}

// ─────────────────────────────── 元件 ────────────────────────────────

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

export function ReturnConfirmationBoard({
  rows: initialRows,
  summary,
  canEdit,
}: {
  rows: ReturnRequestRow[];
  summary: ReturnRequestsSummary;
  canEdit: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 篩選 state
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // 確認表單展開（每筆 requestId → ConfirmState）
  const [confirmOpen, setConfirmOpen] = useState<string | null>(null);
  const [confirmForm, setConfirmForm] = useState<ConfirmState | null>(null);

  // 過濾後資料（pending + overdue 才需確認，已確認的排除）
  const displayRows = useMemo(() => {
    return initialRows.filter((r) => {
      if (r.status === "confirmed") return false;
      if (sourceTypeFilter && r.source_type !== sourceTypeFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      return true;
    });
  }, [initialRows, sourceTypeFilter, statusFilter]);

  const overdueRows = useMemo(
    () => displayRows.filter((r) => r.status === "overdue"),
    [displayRows],
  );

  // ─── Banner helper ───
  function showBanner(ok: boolean, msg: string) {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setBanner({ ok, msg });
    if (ok) {
      bannerTimerRef.current = setTimeout(() => setBanner(null), 2200);
    }
  }

  // ─── 展開/收起確認表單 ───
  function openConfirm(row: ReturnRequestRow) {
    setConfirmOpen(row.id);
    setConfirmForm({
      requestId: row.id,
      row,
      confirmedQty: String(row.qty_requested),
      returnType: "full_return",
      warehouseNote: "",
      shortfallMode: "writeoff",
      shortfallReason: "",
    });
  }

  function closeConfirm() {
    setConfirmOpen(null);
    setConfirmForm(null);
  }

  // ─── 提交確認 ───
  function submitConfirm() {
    if (!confirmForm) return;
    const { requestId, confirmedQty, returnType, warehouseNote, shortfallMode, shortfallReason } =
      confirmForm;
    const qty = Number(confirmedQty);
    if (!Number.isFinite(qty) || qty < 0) {
      showBanner(false, "實收數量格式不正確");
      return;
    }
    const shortfall =
      qty < confirmForm.row.qty_requested
        ? { mode: shortfallMode, reason: shortfallReason.trim() || undefined }
        : undefined;

    startTransition(async () => {
      const res = await confirmReturnRequestAction(
        requestId,
        qty,
        returnType,
        warehouseNote.trim() || undefined,
        shortfall,
      );
      if (res.ok) {
        const parts: string[] = [];
        if (res.data.restocked > 0) parts.push(`回補 ${res.data.restocked} 件`);
        if (res.data.writeoff_qty > 0) parts.push(`核銷 ${res.data.writeoff_qty} 件`);
        showBanner(
          true,
          `✓ 已確認${parts.length > 0 ? "（" + parts.join("、") + "）" : ""}`,
        );
        closeConfirm();
      } else {
        showBanner(false, `確認失敗：${res.error}`);
      }
    });
  }

  // ─── DataGrid columns ───
  const columns: DataGridColumn<ReturnRequestRow>[] = useMemo(
    () => [
      {
        id: "source_type",
        header: "來源類型",
        width: 110,
        hideable: false,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${sourceTypeChipClass(r.source_type)}`}
          >
            {sourceTypeLabel(r.source_type)}
          </span>
        ),
        exportValue: (r) => sourceTypeLabel(r.source_type),
        sortValue: (r) => r.source_type,
      },
      {
        id: "source_ro_code",
        header: "來源工單",
        width: 150,
        cell: (r) =>
          r.source_ro_code ? (
            <span className="font-mono text-[12px] text-[#1A3A5C]">{r.source_ro_code}</span>
          ) : (
            <span className="text-[#9A9890]">—</span>
          ),
        exportValue: (r) => r.source_ro_code ?? "",
        sortValue: (r) => r.source_ro_code ?? "",
      },
      {
        id: "part_name",
        header: "零件名稱",
        cell: (r) => (
          <div className="flex flex-col">
            <span className="text-[12.5px] text-[#2C2C2A] font-medium">{r.part_name}</span>
            {r.part_code && (
              <span className="font-mono text-[11px] text-[#9A9890]">{r.part_code}</span>
            )}
          </div>
        ),
        exportValue: (r) => r.part_name,
        sortValue: (r) => r.part_name,
      },
      {
        id: "qty_requested",
        header: "申請數量",
        width: 90,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12.5px] text-[#2C2C2A]">
            {r.qty_requested.toLocaleString("en-US")}
          </span>
        ),
        exportValue: (r) => r.qty_requested,
        sortValue: (r) => r.qty_requested,
      },
      {
        id: "requested_by_name",
        header: "申請人",
        width: 100,
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955]">{r.requested_by_name ?? "—"}</span>
        ),
        exportValue: (r) => r.requested_by_name ?? "",
        sortValue: (r) => r.requested_by_name ?? "",
      },
      {
        id: "requested_at",
        header: "申請時間",
        width: 120,
        cell: (r) => (
          <span className="font-mono text-[12px] text-[#5A5955]">
            {r.requested_at ? fmtDate(r.requested_at.slice(0, 10)) : "—"}
          </span>
        ),
        exportValue: (r) => r.requested_at,
        sortValue: (r) => r.requested_at,
      },
      {
        id: "due_by",
        header: "截止時間",
        width: 160,
        cell: (r) => renderDueBy(r.due_by, r.status),
        exportValue: (r) => r.due_by,
        sortValue: (r) => r.due_by,
      },
      {
        id: "return_reason",
        header: "退料原因",
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955]">{r.return_reason ?? "—"}</span>
        ),
        exportValue: (r) => r.return_reason ?? "",
        sortValue: (r) => r.return_reason ?? "",
      },
    ],
    [],
  );

  // ─── 確認表單內容（inline expand row） ───
  function renderConfirmForm(row: ReturnRequestRow): React.ReactNode {
    if (confirmOpen !== row.id || !confirmForm) return null;

    const qtyNum = Number(confirmForm.confirmedQty);
    const hasShortfall =
      Number.isFinite(qtyNum) && qtyNum >= 0 && qtyNum < row.qty_requested;

    return (
      <div
        className={`px-4 py-4 bg-[#F8F7F4] border-t border-[#EEECE6] space-y-3 ${
          isPending ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <div className="text-[12.5px] font-semibold text-[#2C2C2A] mb-1">
          確認退料收件 — {row.part_name}
          {row.part_code && (
            <span className="ml-2 font-mono font-normal text-[#9A9890]">{row.part_code}</span>
          )}
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          {/* 實收數量 */}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>
              實收數量（申請 {row.qty_requested}）
            </label>
            <input
              data-testid="confirmed-qty-input"
              type="number"
              min={0}
              max={row.qty_requested * 2}
              className={`${inputClass} w-[120px]`}
              value={confirmForm.confirmedQty}
              onChange={(e) =>
                setConfirmForm((f) => f && { ...f, confirmedQty: e.target.value })
              }
              disabled={isPending}
            />
          </div>

          {/* 零件狀態 */}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>零件狀態</label>
            <div className="flex gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  data-testid="return-type-full-return"
                  type="radio"
                  name={`return-type-${row.id}`}
                  value="full_return"
                  checked={confirmForm.returnType === "full_return"}
                  onChange={() =>
                    setConfirmForm((f) => f && { ...f, returnType: "full_return" })
                  }
                  disabled={isPending}
                  className="accent-[#1A3A5C]"
                />
                <span className="text-[12px] text-[#2C2C2A]">完整可入庫</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  data-testid="return-type-damage-writeoff"
                  type="radio"
                  name={`return-type-${row.id}`}
                  value="damage_writeoff"
                  checked={confirmForm.returnType === "damage_writeoff"}
                  onChange={() =>
                    setConfirmForm((f) => f && { ...f, returnType: "damage_writeoff" })
                  }
                  disabled={isPending}
                  className="accent-[#CC0000]"
                />
                <span className="text-[12px] text-[#2C2C2A]">損耗需核銷</span>
              </label>
            </div>
          </div>

          {/* 備註 */}
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className={labelClass}>備註（倉管）</label>
            <input
              data-testid="warehouse-note-input"
              type="text"
              className={`${inputClass} w-full`}
              placeholder="選填"
              value={confirmForm.warehouseNote}
              onChange={(e) =>
                setConfirmForm((f) => f && { ...f, warehouseNote: e.target.value })
              }
              disabled={isPending}
            />
          </div>
        </div>

        {/* 差額警示 + 核銷選項 */}
        {hasShortfall && (
          <div
            data-testid="qty-mismatch-warning"
            className="p-3 rounded-lg bg-[#FDF3E3] border border-[#F5D8A0] space-y-2"
          >
            <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#854F0B]">
              <span className="material-symbols-outlined text-[15px]">warning</span>
              差額警示：實收 {qtyNum} 件，申請 {row.qty_requested} 件，差額{" "}
              {row.qty_requested - qtyNum} 件
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className={labelClass}>差額處理方式</label>
                <div className="flex gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      data-testid="shortfall-writeoff"
                      type="radio"
                      name={`shortfall-${row.id}`}
                      value="writeoff"
                      checked={confirmForm.shortfallMode === "writeoff"}
                      onChange={() =>
                        setConfirmForm((f) => f && { ...f, shortfallMode: "writeoff" })
                      }
                      disabled={isPending}
                      className="accent-[#CC0000]"
                    />
                    <span className="text-[12px] text-[#2C2C2A]">差額核銷</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`shortfall-${row.id}`}
                      value="ignore"
                      checked={confirmForm.shortfallMode === "ignore"}
                      onChange={() =>
                        setConfirmForm((f) => f && { ...f, shortfallMode: "ignore" })
                      }
                      disabled={isPending}
                      className="accent-[#9A9890]"
                    />
                    <span className="text-[12px] text-[#2C2C2A]">忽略差額</span>
                  </label>
                </div>
              </div>
              {confirmForm.shortfallMode === "writeoff" && (
                <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                  <label className={labelClass}>差額核銷原因</label>
                  <input
                    data-testid="shortfall-reason"
                    type="text"
                    className={`${inputClass} w-full`}
                    placeholder="例：零件遺失、運送損耗⋯"
                    value={confirmForm.shortfallReason}
                    onChange={(e) =>
                      setConfirmForm((f) => f && { ...f, shortfallReason: e.target.value })
                    }
                    disabled={isPending}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* 操作按鈕 */}
        <div className="flex gap-2 pt-1">
          <button
            data-testid="confirm-return-btn"
            type="button"
            onClick={submitConfirm}
            disabled={isPending}
            className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {isPending ? (
              <>
                <svg
                  className="animate-spin h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                確認中⋯
              </>
            ) : (
              "確認退料"
            )}
          </button>
          <button
            type="button"
            onClick={closeConfirm}
            disabled={isPending}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  // ─── render ───
  return (
    <div className="space-y-3">
      {/* Banner（固定右下） */}
      {banner && (
        <div
          data-testid={banner.ok ? "confirm-success-toast" : undefined}
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}

      {/* 1. KPI 列 */}
      <div className="grid grid-cols-3 gap-2.5">
        <KpiCard label="待確認" value={summary.pending} tone="amber" layout="vertical" />
        <KpiCard label="已逾期" value={summary.overdue} tone="red" layout="vertical" />
        <KpiCard label="今日已確認" value={summary.confirmed_today} tone="teal" layout="vertical" />
      </div>

      {/* 2. 篩選 Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>來源類型</label>
            <select
              data-testid="source-type-filter"
              className={inputClass}
              style={{ minWidth: 150 }}
              value={sourceTypeFilter}
              onChange={(e) => setSourceTypeFilter(e.target.value)}
            >
              {SOURCE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              className={inputClass}
              style={{ minWidth: 120 }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="ml-auto flex items-center">
            <span className="text-[12px] text-[#9A9890]">
              顯示{" "}
              <b className="text-[#2C2C2A]">{displayRows.length}</b> 筆待確認
              {overdueRows.length > 0 && (
                <span className="ml-1 text-[#CC0000] font-medium">
                  （含逾期 {overdueRows.length} 筆）
                </span>
              )}
            </span>
          </div>
        </div>
      </section>

      {/* 3. 逾期區塊（有逾期才顯示） */}
      {overdueRows.length > 0 && (
        <section
          data-testid="overdue-section"
          className="bg-[#FDECEA] border border-[#F5AEAD] rounded-lg px-4 py-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-[#CC0000] text-[18px]">
              warning
            </span>
            <span className="text-[13px] font-semibold text-[#CC0000]">
              逾期待確認（{overdueRows.length} 筆）
            </span>
          </div>
          <div data-testid="return-request-list" className="space-y-1.5">
            {overdueRows.map((row) => (
              <div
                key={row.id}
                data-testid="return-request-item"
                className="bg-white border border-[#F5AEAD] rounded-lg overflow-hidden"
              >
                <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${sourceTypeChipClass(row.source_type)}`}
                  >
                    {sourceTypeLabel(row.source_type)}
                  </span>
                  {row.source_ro_code && (
                    <span className="font-mono text-[12px] text-[#1A3A5C]">
                      {row.source_ro_code}
                    </span>
                  )}
                  <span className="text-[12.5px] font-medium text-[#2C2C2A]">
                    {row.part_name}
                  </span>
                  <span className="text-[12px] text-[#5A5955]">
                    × {row.qty_requested}
                  </span>
                  <span className="text-[12px] text-[#9A9890]">
                    申請人：{row.requested_by_name ?? "—"}
                  </span>
                  <span className="ml-auto flex items-center gap-1 text-[#CC0000] text-[12px] font-medium">
                    <span className="material-symbols-outlined text-[14px]">warning</span>
                    已逾期（{fmtDate(row.due_by.slice(0, 10))}）
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => openConfirm(row)}
                      disabled={isPending}
                      className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
                    >
                      確認
                    </button>
                  )}
                </div>
                {confirmOpen === row.id && renderConfirmForm(row)}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. 全部待確認清單（DataGrid），外層加 testid 供 E2E 定位 */}
      <div data-testid="return-request-list">
        <DataGrid
          columns={columns}
          data={displayRows}
          rowKey={(r) => r.id}
          persistKey="parts/receipt/return-confirmation"
          exportFileName="return-confirmation"
          emptyMessage="目前沒有待確認的退料記錄"
          disabled={isPending}
          rowActionsWidth={canEdit ? 90 : 0}
          rowActions={
            canEdit
              ? (r) => (
                  <button
                    type="button"
                    data-testid="return-request-item"
                    onClick={() =>
                      confirmOpen === r.id ? closeConfirm() : openConfirm(r)
                    }
                    disabled={isPending}
                    className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
                  >
                    {confirmOpen === r.id ? "收起" : "確認"}
                  </button>
                )
              : undefined
          }
          rowExtraBelow={(r) => renderConfirmForm(r)}
        />
      </div>
    </div>
  );
}
