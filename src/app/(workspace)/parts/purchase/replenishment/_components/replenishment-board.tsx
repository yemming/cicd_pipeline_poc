"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  convertLinesToPRs,
  ignoreReplenishmentLines,
  runReplenishment,
  updateSuggestedQty,
} from "@/domain/replenishment";

export type ReplenishLine = {
  id: string;
  item_code: string;
  item_name: string;
  abc_class: string | null;
  on_hand_qty: number;
  on_order_qty: number;
  gross_demand_qty: number;
  reorder_point: number;
  safety_stock: number;
  net_demand_qty: number;
  suggested_qty: number;
  unit_price: number;
  est_amount: number;
  supplier_id: string | null;
  supplier_name: string | null;
  lead_time_days: number | null;
  required_date: string | null;
  latest_order_date: string | null;
  priority: "urgent" | "normal" | "low";
  status: "open" | "converted" | "ignored";
};

export type RunMeta = {
  id: string;
  created_at: string;
  created_label: string;
  horizon_days: number;
  total_lines: number;
  total_amount: number;
  status: string;
};

export type WarehouseOption = { id: string; code: string; name: string };

type Banner = { ok: boolean; msg: string } | null;

const PRIORITY_BADGE: Record<string, string> = {
  urgent: "bg-[#FDECEA] text-[#CC0000]",
  normal: "bg-[#FDF3E3] text-[#854F0B]",
  low: "bg-[#F2F2F2] text-[#6B6A68]",
};
const PRIORITY_LABEL: Record<string, string> = {
  urgent: "緊急",
  normal: "一般",
  low: "低",
};
const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  normal: 1,
  low: 2,
};
const ABC_BADGE: Record<string, string> = {
  A: "bg-[#FDECEA] text-[#CC0000]",
  B: "bg-[#FDF3E3] text-[#854F0B]",
  C: "bg-[#E8F5F0] text-[#0F6E56]",
  D: "bg-[#EAF4FB] text-[#185FA5]",
};

export function ReplenishmentBoard({
  run,
  lines: initialLines,
  warehouses,
  policy,
  canRun,
  canCreatePR,
}: {
  run: RunMeta | null;
  lines: ReplenishLine[];
  warehouses: WarehouseOption[];
  policy: {
    horizon_days: number;
    frequency: string;
    auto_create_pr_for_urgent: boolean;
  } | null;
  canRun: boolean;
  canCreatePR: boolean;
}) {
  const router = useRouter();
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterAbc, setFilterAbc] = useState<string>("all");
  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [horizonDays, setHorizonDays] = useState<number>(policy?.horizon_days ?? 7);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<Banner>(null);
  const [isPending, startTransition] = useTransition();

  const supplierOptions = useMemo(() => {
    const s = new Map<string, string>();
    for (const l of initialLines) {
      if (l.supplier_id && l.supplier_name) s.set(l.supplier_id, l.supplier_name);
    }
    return Array.from(s.entries()).map(([id, name]) => ({ id, name }));
  }, [initialLines]);

  const filtered = useMemo(() => {
    return initialLines.filter((l) => {
      if (l.status !== "open") return false;
      if (filterPriority !== "all" && l.priority !== filterPriority) return false;
      if (filterAbc !== "all" && (l.abc_class ?? "") !== filterAbc) return false;
      if (filterSupplier !== "all" && (l.supplier_id ?? "") !== filterSupplier) return false;
      return true;
    });
  }, [initialLines, filterPriority, filterAbc, filterSupplier]);

  const allSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));
  const totalSelectedAmt = filtered
    .filter((l) => selected.has(l.id))
    .reduce((s, l) => s + Number(l.est_amount), 0);

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((l) => l.id)));
  }
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleRun() {
    setBanner(null);
    startTransition(async () => {
      const res = await runReplenishment({
        warehouseId: selectedWarehouse || null,
        horizonDays,
      });
      if (!res.ok) {
        setBanner({ ok: false, msg: `計算失敗：${res.error}` });
        return;
      }
      setBanner({
        ok: true,
        msg: `已計算 ${res.lines} 項建議（預估 NT$ ${Number(res.amount).toLocaleString("en-US")}）`,
      });
      setSelected(new Set());
      router.refresh();
    });
  }

  function handleIgnore(ids: string[]) {
    if (ids.length === 0) return;
    setBanner(null);
    startTransition(async () => {
      const res = await ignoreReplenishmentLines(ids);
      if (!res.ok) setBanner({ ok: false, msg: `忽略失敗：${res.error}` });
      else {
        setBanner({ ok: true, msg: `已忽略 ${ids.length} 項建議` });
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  function handleConvert() {
    if (!run) return;
    const ids = Array.from(selected);
    if (ids.length === 0) {
      setBanner({ ok: false, msg: "請至少勾選一項建議" });
      return;
    }
    setBanner(null);
    startTransition(async () => {
      const res = await convertLinesToPRs({ runId: run.id, lineIds: ids });
      if (!res.ok) {
        setBanner({ ok: false, msg: `建單失敗：${res.error}` });
        return;
      }
      const summary = res.createdPRs
        .map((p) => `${p.req_no}（${p.lines} 行）`)
        .join("、");
      setBanner({
        ok: true,
        msg: `已建立 ${res.createdPRs.length} 張採購申請：${summary}`,
      });
      setSelected(new Set());
      router.refresh();
    });
  }

  function setQtyDraft(id: string, v: string) {
    setDrafts((d) => ({ ...d, [id]: v }));
  }
  function saveQty(id: string) {
    const raw = drafts[id];
    if (raw === undefined) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      setBanner({ ok: false, msg: "建議量需為 0 或正數" });
      return;
    }
    startTransition(async () => {
      const res = await updateSuggestedQty(id, n);
      if (!res.ok) setBanner({ ok: false, msg: `更新建議量失敗：${res.error}` });
      else {
        setDrafts((d) => {
          const nd = { ...d };
          delete nd[id];
          return nd;
        });
        router.refresh();
      }
    });
  }

  // ── DataGrid columns ──
  // 注意：urgent row 高亮（紅字粗體）內嵌在 cell 內 conditional className；
  //       checkbox 多選用外部 selected set + cell render；
  //       qty inline edit 用受控 input + 失焦/Enter saveQty（draft 模式），
  //       不走 DataGrid 內建 editable（因為要保 draft + numeric 校驗 + Enter 行為）。
  const columns: DataGridColumn<ReplenishLine>[] = [
    {
      id: "select",
      header: "",
      width: 36,
      hideable: false,
      sortable: false,
      cell: (l) => (
        <input
          type="checkbox"
          checked={selected.has(l.id)}
          onChange={() => toggle(l.id)}
          aria-label={`選取 ${l.item_code}`}
        />
      ),
    },
    {
      id: "item_code",
      header: "料號",
      cell: (l) => <span className="font-mono">{l.item_code}</span>,
      exportValue: (l) => l.item_code,
      sortValue: (l) => l.item_code,
    },
    {
      id: "item_name",
      header: "品名",
      cell: (l) => l.item_name,
      exportValue: (l) => l.item_name,
      sortValue: (l) => l.item_name,
    },
    {
      id: "abc_class",
      header: "ABC",
      width: 60,
      cell: (l) =>
        l.abc_class ? (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${
              ABC_BADGE[l.abc_class] ?? "bg-[#EBF3FF] text-[#1A3A5C]"
            }`}
          >
            {l.abc_class}
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (l) => l.abc_class ?? "",
      sortValue: (l) => l.abc_class ?? "",
    },
    {
      id: "on_hand_qty",
      header: "在手",
      align: "right",
      cell: (l) => (
        <span
          className={`font-mono ${
            l.priority === "urgent" ? "text-[#CC0000] font-semibold" : ""
          }`}
        >
          {l.on_hand_qty}
        </span>
      ),
      exportValue: (l) => l.on_hand_qty,
      sortValue: (l) => l.on_hand_qty,
    },
    {
      id: "on_order_qty",
      header: "在途",
      align: "right",
      cell: (l) => <span className="font-mono text-[#9A9890]">{l.on_order_qty}</span>,
      exportValue: (l) => l.on_order_qty,
      sortValue: (l) => l.on_order_qty,
    },
    {
      id: "gross_demand_qty",
      header: "需求(視野)",
      align: "right",
      cell: (l) => <span className="font-mono">{l.gross_demand_qty}</span>,
      exportValue: (l) => l.gross_demand_qty,
      sortValue: (l) => l.gross_demand_qty,
    },
    {
      id: "reorder_point",
      header: "ROP",
      align: "right",
      defaultHidden: true,
      cell: (l) => <span className="font-mono">{l.reorder_point}</span>,
      exportValue: (l) => l.reorder_point,
      sortValue: (l) => l.reorder_point,
    },
    {
      id: "safety_stock",
      header: "SS",
      align: "right",
      defaultHidden: true,
      cell: (l) => <span className="font-mono">{l.safety_stock}</span>,
      exportValue: (l) => l.safety_stock,
      sortValue: (l) => l.safety_stock,
    },
    {
      id: "suggested_qty",
      header: "建議量",
      align: "right",
      cell: (l) => {
        const draft = drafts[l.id];
        const inputValue = draft !== undefined ? draft : String(l.suggested_qty);
        return (
          <input
            type="number"
            min={0}
            value={inputValue}
            onChange={(e) => setQtyDraft(l.id, e.target.value)}
            onBlur={() => draft !== undefined && saveQty(l.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            className={`w-20 px-2 py-0.5 text-right font-mono text-[12px] border rounded ${
              draft !== undefined
                ? "border-[#FFC400] bg-[#FFFAE6]"
                : "border-[#EEECE6]"
            } focus:outline-none focus:border-[#185FA5]`}
          />
        );
      },
      exportValue: (l) => l.suggested_qty,
      sortValue: (l) => l.suggested_qty,
    },
    {
      id: "supplier_name",
      header: "供應商",
      cell: (l) =>
        l.supplier_name ? (
          <span className="text-[12px]">{l.supplier_name}</span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (l) => l.supplier_name ?? "",
      sortValue: (l) => l.supplier_name ?? "",
    },
    {
      id: "lead_time_days",
      header: "前置",
      align: "right",
      cell: (l) => (
        <span className="font-mono text-[#9A9890]">{l.lead_time_days ?? "—"}</span>
      ),
      exportValue: (l) => l.lead_time_days ?? "",
      sortValue: (l) => l.lead_time_days ?? null,
    },
    {
      id: "est_amount",
      header: "預估金額",
      align: "right",
      cell: (l) => (
        <span className="font-mono">{`NT$${Number(l.est_amount).toLocaleString("en-US")}`}</span>
      ),
      exportValue: (l) => Number(l.est_amount),
      sortValue: (l) => Number(l.est_amount),
    },
    {
      id: "priority",
      header: "優先度",
      width: 60,
      cell: (l) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${PRIORITY_BADGE[l.priority]}`}
        >
          {PRIORITY_LABEL[l.priority]}
        </span>
      ),
      exportValue: (l) => PRIORITY_LABEL[l.priority],
      sortValue: (l) => PRIORITY_ORDER[l.priority] ?? 99,
    },
  ];

  return (
    <div className="flex gap-4 items-start">
      {/* 主欄 */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Banner */}
        {banner && (
          <div
            className={`px-3 py-2 rounded text-[12.5px] border ${
              banner.ok
                ? "bg-[#EAF3DE] text-[#3B6D11] border-[#C5DC9F]"
                : "bg-[#FDECEA] text-[#CC0000] border-[#F5AEAD]"
            }`}
          >
            {banner.msg}
          </div>
        )}

        {/* Filter Bar */}
        <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">優先度</label>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5]"
              >
                <option value="all">全部</option>
                <option value="urgent">緊急</option>
                <option value="normal">一般</option>
                <option value="low">低</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">ABC 等級</label>
              <select
                value={filterAbc}
                onChange={(e) => setFilterAbc(e.target.value)}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5]"
              >
                <option value="all">全部</option>
                {["A", "B", "C", "D"].map((c) => (
                  <option key={c} value={c}>{`${c} 類`}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">供應商</label>
              <select
                value={filterSupplier}
                onChange={(e) => setFilterSupplier(e.target.value)}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] min-w-[180px]"
              >
                <option value="all">全部</option>
                {supplierOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">適用倉庫</label>
              <select
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5]"
              >
                <option value="">全部倉庫</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{`${w.code} ${w.name}`}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">需求視野（天）</label>
              <input
                type="number"
                value={horizonDays}
                onChange={(e) => setHorizonDays(Math.max(1, parseInt(e.target.value || "7", 10)))}
                className="h-[30px] w-20 border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5]"
              />
            </div>
            <div className="flex gap-2 ml-auto">
              <button
                type="button"
                disabled={!canRun || isPending}
                onClick={handleRun}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
              >
                {isPending ? "計算中⋯" : "重新計算建議"}
              </button>
            </div>
          </div>
        </section>

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          {run ? (
            <span className="text-[12px] text-[#9A9890]">
              {`本批次 `}<b className="text-[#2C2C2A]">{run.total_lines}</b>{` 項 ・ 預估 `}
              <b className="text-[#2C2C2A]">{`NT$ ${Number(run.total_amount).toLocaleString("en-US")}`}</b>
              {` ・ 視野 ${run.horizon_days} 天 ・ 建立於 `}
              {run.created_label}
              {selected.size > 0 && (
                <>
                  {` ・ 已選 `}
                  <b className="text-[#185FA5]">{selected.size}</b>
                  {` 項（合計 `}
                  <b className="text-[#185FA5]">{`NT$ ${Number(totalSelectedAmt).toLocaleString("en-US")}`}</b>
                  {`）`}
                </>
              )}
            </span>
          ) : (
            <span className="text-[12px] text-[#9A9890]">尚未計算過任何建議</span>
          )}
          <div className="ml-auto flex gap-1.5">
            <button
              type="button"
              onClick={toggleAll}
              disabled={filtered.length === 0}
              className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              {allSelected ? "全部取消" : "全選"}
            </button>
            <button
              type="button"
              disabled={selected.size === 0 || isPending}
              onClick={() => handleIgnore(Array.from(selected))}
              className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              忽略選取（{selected.size}）
            </button>
            <button
              type="button"
              disabled={!canCreatePR || selected.size === 0 || !run || isPending}
              onClick={handleConvert}
              className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              {isPending ? "建單中⋯" : `一鍵建立採購申請（${selected.size}）`}
            </button>
          </div>
        </div>

        {/* Table */}
        <DataGrid
          columns={columns}
          data={filtered}
          rowKey={(l) => l.id}
          persistKey="parts/purchase/replenishment"
          exportFileName="replenishment-suggestions"
          emptyMessage={
            run
              ? "目前篩選條件下沒有可顯示的建議"
              : "點右上角「重新計算建議」開始 MRP"
          }
          disabled={isPending}
        />
      </div>

      {/* 右側 policy panel */}
      <aside className="w-[200px] shrink-0">
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">補貨計畫設定</span>
          </header>
          <div className="px-4 py-3 space-y-2.5 text-[12px]">
            {policy ? (
              <>
                <div>
                  <div className="text-[11px] text-[#9A9890]">執行頻率</div>
                  <div className="text-[12.5px]">
                    {{
                      weekly_mon: "每週一",
                      biweekly: "每兩週",
                      monthly_1: "每月一日",
                      manual: "手動觸發",
                    }[policy.frequency] ?? policy.frequency}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#9A9890]">需求視野</div>
                  <div className="text-[12.5px]">{`${policy.horizon_days} 天`}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#9A9890]">緊急自動建單</div>
                  <div className="text-[12.5px]">
                    {policy.auto_create_pr_for_urgent ? "啟用" : "關閉"}
                  </div>
                </div>
                <Link
                  href="/admin/master-data/replenishment-policies"
                  className="inline-block text-[11.5px] text-[#185FA5] hover:underline"
                >
                  編輯設定 →
                </Link>
              </>
            ) : (
              <div className="text-[#9A9890]">
                尚未建立補貨計畫設定
                <Link
                  href="/admin/master-data/replenishment-policies/new"
                  className="block mt-2 text-[11.5px] text-[#185FA5] hover:underline"
                >
                  立即建立 →
                </Link>
              </div>
            )}
          </div>
        </section>

        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden mt-3">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">資料來源</span>
          </header>
          <div className="px-4 py-3 space-y-1.5 text-[11.5px] text-[#5A5955]">
            <Link
              href="/admin/master-data/supplier-pricing"
              className="block hover:text-[#185FA5]"
            >
              · 供應商定價（價/MOQ/lead time）
            </Link>
            <Link
              href="/admin/master-data/item-lead-times"
              className="block hover:text-[#185FA5]"
            >
              · 料號預設前置時間
            </Link>
            <Link href="/parts/alerts/thresholds" className="block hover:text-[#185FA5]">
              · 庫存水位（ROP/SS/min/max）
            </Link>
            <Link href="/parts/purchase/requisitions" className="block hover:text-[#185FA5]">
              · 採購申請看板 →
            </Link>
          </div>
        </section>
      </aside>
    </div>
  );
}
