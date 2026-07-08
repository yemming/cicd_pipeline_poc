"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  updateResponsibleModelsAction,
  setSalesStaffActiveAction,
  previewStaffTransfer,
  transferDepartingStaffAction,
  type SalesStaffRow,
  type StaffTransferPreview,
} from "@/domain/sales-staff";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

const BASE_PATH = "/sales/manager/staff";

type Banner = { ok: boolean; msg: string } | null;

type Filters = {
  q: string;
  status: "all" | "active" | "inactive" | string;
  series: string;
};

export function SalesStaffBoard({
  rows,
  totalCount,
  page,
  pageSize,
  availableSeries,
  filters,
  canEdit,
  canReassign = false,
}: {
  rows: SalesStaffRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  availableSeries: string[];
  filters: Filters;
  canEdit: boolean;
  canReassign?: boolean;
}) {
  useSetPageHeader({
    title: "RS 人員管理",
    breadcrumb: [
      { label: "銷售管理" },
      { label: "主管工作台" },
      { label: "RS 人員管理" },
    ],
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [fQ, setFQ] = useState(filters.q);
  const [fStatus, setFStatus] = useState(filters.status);
  const [fSeries, setFSeries] = useState(filters.series);

  // Modal — 編輯負責車系
  const [editingRow, setEditingRow] = useState<SalesStaffRow | null>(null);

  // Modal — A-9 離職批次轉移
  const [transferringRow, setTransferringRow] = useState<SalesStaffRow | null>(null);

  useEffect(() => {
    if (banner?.ok) {
      const t = setTimeout(() => setBanner(null), 2200);
      return () => clearTimeout(t);
    }
  }, [banner]);

  const showBanner = (b: Banner) => setBanner(b);

  const submitFilters = (overrides?: Partial<{ page: number }>) => {
    const params = new URLSearchParams();
    if (fStatus !== "all") params.set("status", fStatus);
    if (fSeries !== "all") params.set("series", fSeries);
    if (fQ.trim()) params.set("q", fQ.trim());
    if (overrides?.page && overrides.page > 1)
      params.set("page", String(overrides.page));
    startTransition(() => {
      router.push(`${BASE_PATH}${params.toString() ? "?" + params : ""}`);
    });
  };

  const resetFilters = () => {
    setFQ("");
    setFStatus("all");
    setFSeries("all");
    startTransition(() => {
      router.push(BASE_PATH);
    });
  };

  const goToPage = (next: number) => submitFilters({ page: next });

  const toggleActive = (row: SalesStaffRow) => {
    if (!canEdit) return;
    startTransition(async () => {
      const res = await setSalesStaffActiveAction(row.id, !row.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: row.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const columns: DataGridColumn<SalesStaffRow>[] = [
    {
      id: "emp_code",
      header: "員工編號",
      width: 110,
      hideable: false,
      cell: (r) => (
        <span className="font-mono text-[12px] text-[#5A5955]">{r.emp_code}</span>
      ),
      exportValue: (r) => r.emp_code,
      sortValue: (r) => r.emp_code,
    },
    {
      id: "name",
      header: "姓名",
      width: 110,
      cell: (r) => <strong className="text-[#2C2C2A]">{r.name}</strong>,
      exportValue: (r) => r.name,
      sortValue: (r) => r.name,
    },
    {
      id: "account",
      header: "帳號",
      width: 180,
      cell: (r) =>
        r.account_display ? (
          <span className="font-mono text-[11.5px] text-[#5A5955]">
            {r.account_display}
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => r.account_display ?? "",
      sortValue: (r) => r.account_display ?? "",
    },
    {
      id: "responsible_models",
      header: "負責車系",
      width: 220,
      sortable: false,
      cell: (r) => {
        if (r.responsible_models.length === 0) {
          return (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#F2F2F2] text-[#6B6A68] text-[11px] whitespace-nowrap">
              全車系
            </span>
          );
        }
        return (
          <div className="flex flex-wrap gap-1">
            {r.responsible_models.map((m) => (
              <span
                key={m}
                className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#EEF4FB] text-[#185FA5] text-[11px] whitespace-nowrap"
              >
                {m}
              </span>
            ))}
          </div>
        );
      },
      exportValue: (r) =>
        r.responsible_models.length === 0
          ? "全車系"
          : r.responsible_models.join("、"),
    },
    {
      id: "contacts",
      header: "本月接觸",
      width: 96,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12.5px] text-[#2C2C2A]">
          {r.contacts_this_month}
        </span>
      ),
      exportValue: (r) => String(r.contacts_this_month),
      sortValue: (r) => r.contacts_this_month,
    },
    {
      id: "deals",
      header: "本月成交",
      width: 96,
      align: "right",
      cell: (r) => (
        <span
          className={
            "font-mono text-[12.5px] " +
            (r.deals_this_month > 0 ? "text-[#0F6E56] font-semibold" : "text-[#9A9890]")
          }
        >
          {r.deals_this_month}
        </span>
      ),
      exportValue: (r) => String(r.deals_this_month),
      sortValue: (r) => r.deals_this_month,
    },
    {
      id: "status",
      header: "狀態",
      width: 80,
      cell: (r) =>
        r.is_active ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#EAF3DE] text-[#3B6D11] text-[11px] whitespace-nowrap">
            啟用
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#F2F2F2] text-[#6B6A68] text-[11px] whitespace-nowrap">
            停用
          </span>
        ),
      exportValue: (r) => (r.is_active ? "啟用" : "停用"),
      sortValue: (r) => (r.is_active ? 1 : 0),
    },
    {
      id: "position",
      header: "職稱",
      width: 110,
      defaultHidden: true,
      cell: (r) => r.position ?? "—",
      exportValue: (r) => r.position ?? "",
      sortValue: (r) => r.position ?? "",
    },
    {
      id: "dept",
      header: "部門",
      width: 100,
      defaultHidden: true,
      cell: (r) => r.dept_name ?? "—",
      exportValue: (r) => r.dept_name ?? "",
      sortValue: (r) => r.dept_name ?? "",
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">RS 人員管理</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          RS_M3 Tab3
        </span>
        <span className="text-[12px] text-[#9A9890]">
          指定 RS 負責車系與啟用狀態；員工主檔請至「組織管理 → 用戶管理」。
        </span>
      </header>

      {/* 提示 banner */}
      <section className="rounded-lg border border-[#85B7EB] bg-[#EAF4FB] px-4 py-2.5 text-[11.5px] leading-[1.6] text-[#0C3E70]">
        資料來源：<strong>employees</strong>（業務部）+
        <strong> sales_leads</strong>（本月接觸 / 成交 by rs_name）。負責車系存於
        <code className="px-1 mx-0.5 bg-white rounded text-[10.5px]">metadata.sales.responsible_models</code>
        （空陣列 = 全車系）。
      </section>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">狀態</label>
            <select
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white focus:border-[#185FA5] outline-none min-w-[100px]"
            >
              <option value="all">全部</option>
              <option value="active">啟用</option>
              <option value="inactive">停用</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">負責車系</label>
            <select
              value={fSeries}
              onChange={(e) => setFSeries(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white focus:border-[#185FA5] outline-none min-w-[140px]"
            >
              <option value="all">全部車系</option>
              {availableSeries.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-[11px] text-[#9A9890] font-medium">搜尋</label>
            <input
              type="text"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              placeholder="員工編號 / 姓名 / Email / 職稱⋯"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitFilters();
              }}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white focus:border-[#185FA5] outline-none"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={() => submitFilters()}
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
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 位 RS
          {rows.length > 0 ? (
            <>
              （顯示 <b>{rows.length}</b> 筆）
            </>
          ) : null}
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="sales/manager/staff"
        exportFileName="sales-staff"
        emptyMessage={
          isPending
            ? "載入中⋯"
            : "目前沒有業務部員工。請至「組織管理 → 用戶管理」新增 RS 帳號並指派到業務部。"
        }
        disabled={isPending}
        rowActionsWidth={290}
        rowActions={(r) => (
          <>
            <button
              type="button"
              onClick={() => setEditingRow(r)}
              disabled={!canEdit || isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              指派車系
            </button>
            <button
              type="button"
              onClick={() => toggleActive(r)}
              disabled={!canEdit || isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              {r.is_active ? "停用" : "啟用"}
            </button>
            {canReassign && (
              <button
                type="button"
                onClick={() => setTransferringRow(r)}
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDF3E3] border border-[#F3D9A6] text-[#854F0B] hover:bg-[#fbe9cf] disabled:opacity-50 whitespace-nowrap"
                title="A-9 離職批次轉移：把此人名下所有未結案訂單/任務/手卡一次轉給接手業務員"
              >
                離職轉移
              </button>
            )}
          </>
        )}
        pagination={{ page, pageSize, totalCount, onPageChange: goToPage }}
      />

      {editingRow ? (
        <ResponsibleModelsModal
          row={editingRow}
          availableSeries={availableSeries}
          onClose={() => setEditingRow(null)}
          onSaved={(msg) => {
            setEditingRow(null);
            showBanner({ ok: true, msg });
            router.refresh();
          }}
          onError={(msg) => showBanner({ ok: false, msg })}
        />
      ) : null}

      {transferringRow ? (
        <StaffTransferModal
          row={transferringRow}
          candidates={rows.filter((r) => r.id !== transferringRow.id && r.is_active)}
          onClose={() => setTransferringRow(null)}
          onSaved={(msg) => {
            setTransferringRow(null);
            showBanner({ ok: true, msg });
            router.refresh();
          }}
          onError={(msg) => showBanner({ ok: false, msg })}
        />
      ) : null}

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
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

// ────────────────────────────── Modal ──────────────────────────────

function ResponsibleModelsModal({
  row,
  availableSeries,
  onClose,
  onSaved,
  onError,
}: {
  row: SalesStaffRow;
  availableSeries: string[];
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const initialAllSeries = row.responsible_models.length === 0;
  const [isAll, setIsAll] = useState(initialAllSeries);
  const [selected, setSelected] = useState<string[]>(row.responsible_models);
  const [isPending, startTransition] = useTransition();

  const dirty = useMemo(() => {
    const beforeAll = row.responsible_models.length === 0;
    if (isAll !== beforeAll) return true;
    if (isAll) return false;
    const sortedBefore = [...row.responsible_models].sort().join("|");
    const sortedAfter = [...selected].sort().join("|");
    return sortedBefore !== sortedAfter;
  }, [isAll, selected, row.responsible_models]);

  const toggleSeries = (s: string) => {
    setSelected((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };

  const save = () => {
    if (!dirty || isPending) return;
    if (!isAll && selected.length === 0) {
      onError("請至少勾選一個車系，或勾選「全車系」");
      return;
    }
    const payload = isAll ? [] : selected;
    startTransition(async () => {
      const res = await updateResponsibleModelsAction(row.id, payload);
      if (res.ok) {
        onSaved(
          payload.length === 0
            ? `✓ 已將「${row.name}」設為全車系`
            : `✓ 已更新「${row.name}」負責車系（${payload.length} 個）`,
        );
      } else {
        onError(res.error);
      }
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-[480px] max-w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">指派負責車系</div>
            <div className="text-[11px] text-[#9A9890] mt-0.5">
              {row.name}（{row.emp_code}）
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded hover:bg-[#F8F7F4] text-[#5A5955] text-[16px]"
          >
            ×
          </button>
        </header>
        <div className={"px-4 py-3 overflow-y-auto " + (isPending ? "opacity-60 pointer-events-none" : "")}>
          <label className="flex items-center gap-2 p-2 rounded hover:bg-[#F8F7F4] cursor-pointer">
            <input
              type="checkbox"
              checked={isAll}
              onChange={(e) => setIsAll(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-[12.5px] font-semibold text-[#2C2C2A]">全車系</span>
            <span className="text-[11px] text-[#9A9890]">（不限定特定 series）</span>
          </label>
          {!isAll ? (
            <div className="mt-2 border-t border-[#EEECE6] pt-2">
              <div className="text-[11px] text-[#9A9890] mb-2">
                勾選此 RS 負責的車系（multi-select）：
              </div>
              {availableSeries.length === 0 ? (
                <div className="text-[12px] text-[#9A9890] py-3">
                  當前品牌沒有可用車系。請至「車型主檔」新增。
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1">
                  {availableSeries.map((s) => (
                    <label
                      key={s}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#F8F7F4] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(s)}
                        onChange={() => toggleSeries(s)}
                        className="w-4 h-4"
                      />
                      <span className="text-[12.5px] text-[#2C2C2A]">{s}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
        <footer className="px-4 py-3 border-t border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || isPending}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
          >
            {isPending ? "儲存中⋯" : "儲存"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ────────────────────── A-9 離職批次轉移 Modal ──────────────────────

function StaffTransferModal({
  row,
  candidates,
  onClose,
  onSaved,
  onError,
}: {
  row: SalesStaffRow;
  candidates: SalesStaffRow[];
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [toId, setToId] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<StaffTransferPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, startPreviewTransition] = useTransition();
  const [isConfirming, startConfirmTransition] = useTransition();

  const isPending = isPreviewing || isConfirming;

  const loadPreview = (employeeId: string) => {
    setToId(employeeId);
    setPreview(null);
    setPreviewError(null);
    if (!employeeId) return;
    startPreviewTransition(async () => {
      const res = await previewStaffTransfer(row.id, employeeId);
      if (res.ok) {
        setPreview(res.data);
      } else {
        setPreviewError(res.error);
      }
    });
  };

  const confirm = () => {
    if (!toId || !preview || isPending) return;
    startConfirmTransition(async () => {
      const res = await transferDepartingStaffAction(row.id, toId, reason.trim() || undefined);
      if (res.ok) {
        onSaved(
          `✓ 已將「${row.name}」名下 ${res.data.orders} 筆訂單、${res.data.call_tasks} 筆任務、${res.data.handcards} 筆手卡轉移給「${preview.to_name}」`,
        );
      } else {
        onError(res.error);
      }
    });
  };

  const totalItems = preview
    ? preview.open_orders + preview.open_call_tasks + preview.open_handcards
    : 0;

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-[480px] max-w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">離職批次轉移</div>
            <div className="text-[11px] text-[#9A9890] mt-0.5">
              離職人員：{row.name}（{row.emp_code}）
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded hover:bg-[#F8F7F4] text-[#5A5955] text-[16px]"
          >
            ×
          </button>
        </header>
        <div className={"px-4 py-3 overflow-y-auto space-y-3 " + (isConfirming ? "opacity-60 pointer-events-none" : "")}>
          <div className="rounded-lg border border-[#F3D9A6] bg-[#FDF3E3] px-3 py-2 text-[11.5px] leading-[1.6] text-[#854F0B]">
            將把「{row.name}」名下所有<b>未結案訂單</b>、<b>未完成通話任務</b>、<b>未結案手卡</b>一次全部轉給接手業務員，並寫入異動紀錄。
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">接手業務員</label>
            <select
              value={toId}
              onChange={(e) => loadPreview(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white focus:border-[#185FA5] outline-none"
            >
              <option value="">請選擇⋯</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}（{c.emp_code}）
                </option>
              ))}
            </select>
          </div>

          {isPreviewing ? (
            <div className="text-[12px] text-[#9A9890] py-1">查詢中⋯</div>
          ) : previewError ? (
            <div className="text-[12px] text-[#CC0000] py-1">{previewError}</div>
          ) : preview ? (
            <div className="rounded-lg border border-[#EEECE6] overflow-hidden">
              <div className="px-3 py-2 bg-[#F8F7F4] text-[11.5px] font-semibold text-[#2C2C2A]">
                轉移預覽：{preview.from_name} → {preview.to_name}
              </div>
              <div className="px-3 py-2 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[18px] font-semibold text-[#1A3A5C]">{preview.open_orders}</div>
                  <div className="text-[11px] text-[#9A9890]">未結案訂單</div>
                </div>
                <div>
                  <div className="text-[18px] font-semibold text-[#1A3A5C]">{preview.open_call_tasks}</div>
                  <div className="text-[11px] text-[#9A9890]">未完成任務</div>
                </div>
                <div>
                  <div className="text-[18px] font-semibold text-[#1A3A5C]">{preview.open_handcards}</div>
                  <div className="text-[11px] text-[#9A9890]">未結案手卡</div>
                </div>
              </div>
              {totalItems === 0 ? (
                <div className="px-3 pb-2 text-[11.5px] text-[#9A9890]">
                  此人名下目前沒有未結案項目，仍可執行以留下轉移紀錄。
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">原因（選填）</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="例如：離職交接、調部門⋯"
              className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] bg-white focus:border-[#185FA5] outline-none resize-none"
            />
          </div>
        </div>
        <footer className="px-4 py-3 border-t border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isConfirming}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!toId || !preview || isPending}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#a80000] disabled:opacity-50"
          >
            {isConfirming ? "轉移中⋯" : "確認轉移"}
          </button>
        </footer>
      </div>
    </div>
  );
}
