"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { ThresholdListRow, WarehouseLookup } from "@/domain/alerts";
import {
  setThresholdActiveAction,
  deleteThresholdAction,
  updateThresholdAction,
} from "@/domain/alerts";
import {
  ABC_CHIP,
  ALERT_PRIORITY_CHIP,
  ALERT_PRIORITY_OPTIONS,
} from "@/domain/alerts.constants";

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

export function ThresholdsBoard({
  rows,
  warehouses,
  canEdit,
  initialAbc,
  initialQ,
  initialWarehouseId,
  initialPriority,
  initialIsActive,
}: {
  rows: ThresholdListRow[];
  warehouses: WarehouseLookup[];
  canEdit: boolean;
  initialAbc: string;
  initialQ: string;
  initialWarehouseId: string;
  initialPriority: string;
  initialIsActive: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [abc, setAbc] = useState(initialAbc);
  const [q, setQ] = useState(initialQ);
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId);
  const [priority, setPriority] = useState(initialPriority);
  const [isActive, setIsActive] = useState(initialIsActive);
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  function buildHref(extra: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      abc_class: abc || undefined,
      q: q || undefined,
      warehouse_id: warehouseId || undefined,
      priority: priority || undefined,
      is_active: isActive || undefined,
      ...extra,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === "" || v === null) continue;
      params.set(k, v);
    }
    const qs = params.toString();
    return `/parts/alerts/thresholds${qs ? "?" + qs : ""}`;
  }

  function applyFilter() {
    startTransition(() => router.push(buildHref({})));
  }

  function resetFilter() {
    setAbc("");
    setQ("");
    setWarehouseId("");
    setPriority("");
    setIsActive("");
    startTransition(() => router.push("/parts/alerts/thresholds"));
  }

  function showBanner(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function toggleActive(r: ThresholdListRow) {
    startTransition(async () => {
      const res = await setThresholdActiveAction(r.id, !r.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function removeRow(r: ThresholdListRow) {
    if (
      !confirm(
        `確定刪除「${r.item_code ?? r.item_id} @ ${r.warehouse_name ?? r.warehouse_id}」的水位設定？此動作無法復原。`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await deleteThresholdAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const columns = useMemo<DataGridColumn<ThresholdListRow>[]>(() => {
    const numberEdit = (field: "min_stock" | "safety_stock" | "reorder_point" | "max_stock") =>
      canEdit
        ? {
            type: "text" as const,
            getValue: (r: ThresholdListRow) => {
              const v = r[field];
              return v == null ? "" : String(v);
            },
            onSave: async (r: ThresholdListRow, value: string) => {
              const trimmed = value.trim();
              const num = trimmed === "" ? null : Number(trimmed);
              if (trimmed !== "" && (Number.isNaN(num) || num! < 0)) {
                return { ok: false as const, error: "請輸入 ≥ 0 的數字" };
              }
              if (field === "max_stock") {
                const res = await updateThresholdAction(r.id, { max_stock: num });
                if (res.ok) {
                  showBanner({ ok: true, msg: "✓ 已更新" });
                  router.refresh();
                  return { ok: true as const };
                }
                return { ok: false as const, error: res.error };
              }
              if (num == null) {
                return { ok: false as const, error: "此欄不可為空" };
              }
              const patch: Record<string, number> = {};
              patch[field] = num;
              const res = await updateThresholdAction(r.id, patch);
              if (res.ok) {
                showBanner({ ok: true, msg: "✓ 已更新" });
                router.refresh();
                return { ok: true as const };
              }
              return { ok: false as const, error: res.error };
            },
          }
        : undefined;

    return [
      {
        id: "item_code",
        header: "料號",
        width: 140,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/alerts/thresholds/${r.id}`}
            className="font-mono font-semibold text-[#1A3A5C] hover:text-[#185FA5] hover:underline"
          >
            {r.item_code ?? "—"}
          </Link>
        ),
        exportValue: (r) => r.item_code ?? "",
        sortValue: (r) => r.item_code ?? "",
      },
      {
        id: "item_name",
        header: "品名",
        width: 200,
        cell: (r) => r.item_name ?? "—",
        exportValue: (r) => r.item_name ?? "",
        sortValue: (r) => r.item_name ?? "",
      },
      {
        id: "warehouse_name",
        header: "倉庫",
        width: 130,
        cell: (r) => r.warehouse_name ?? "—",
        exportValue: (r) => r.warehouse_name ?? "",
        sortValue: (r) => r.warehouse_name ?? "",
      },
      {
        id: "abc_class",
        header: "ABC",
        width: 70,
        cell: (r) =>
          r.abc_class ? (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                ABC_CHIP[r.abc_class] ?? "bg-[#F2F2F2] text-[#6B6A68]"
              }`}
            >
              {r.abc_class}
            </span>
          ) : (
            "—"
          ),
        exportValue: (r) => r.abc_class ?? "",
        sortValue: (r) => r.abc_class ?? "",
      },
      {
        id: "min_stock",
        header: "最低",
        width: 70,
        align: "right",
        cell: (r) => <span className="font-mono text-[12px]">{r.min_stock ?? "—"}</span>,
        exportValue: (r) => (r.min_stock ?? "").toString(),
        sortValue: (r) => r.min_stock ?? 0,
        editable: numberEdit("min_stock"),
      },
      {
        id: "safety_stock",
        header: "安全",
        width: 70,
        align: "right",
        cell: (r) => <span className="font-mono text-[12px]">{r.safety_stock ?? "—"}</span>,
        exportValue: (r) => (r.safety_stock ?? "").toString(),
        sortValue: (r) => r.safety_stock ?? 0,
        editable: numberEdit("safety_stock"),
      },
      {
        id: "reorder_point",
        header: "再訂購",
        width: 80,
        align: "right",
        cell: (r) => <span className="font-mono text-[12px]">{r.reorder_point ?? "—"}</span>,
        exportValue: (r) => (r.reorder_point ?? "").toString(),
        sortValue: (r) => r.reorder_point ?? 0,
        editable: numberEdit("reorder_point"),
      },
      {
        id: "max_stock",
        header: "最高",
        width: 70,
        align: "right",
        cell: (r) => <span className="font-mono text-[12px]">{r.max_stock ?? "—"}</span>,
        exportValue: (r) => (r.max_stock ?? "").toString(),
        sortValue: (r) => r.max_stock ?? 0,
        editable: numberEdit("max_stock"),
      },
      {
        id: "alert_priority",
        header: "告警等級",
        width: 100,
        cell: (r) => {
          const def =
            ALERT_PRIORITY_CHIP[r.alert_priority ?? ""] ??
            ALERT_PRIORITY_CHIP.normal;
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
            >
              {def.label}
            </span>
          );
        },
        exportValue: (r) =>
          ALERT_PRIORITY_CHIP[r.alert_priority ?? ""]?.label ?? r.alert_priority ?? "",
        sortValue: (r) => r.alert_priority ?? "",
      },
      {
        id: "is_active",
        header: "啟用",
        width: 70,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
              r.is_active
                ? "bg-[#EAF3DE] text-[#3B6D11]"
                : "bg-[#F2F2F2] text-[#6B6A68]"
            }`}
          >
            {r.is_active ? "啟用" : "停用"}
          </span>
        ),
        exportValue: (r) => (r.is_active ? "啟用" : "停用"),
        sortValue: (r) => (r.is_active ? 1 : 0),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">庫存水位設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          10.1
        </span>
        <span className="text-[12px] text-[#9A9890]">
          設定每個料號的安全庫存、再訂購點、最大水位
        </span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>商品搜尋</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="代碼或名稱..."
              className={`${inputClass} w-[200px]`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>倉庫</label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className={`${inputClass} w-[160px]`}
            >
              <option value="">全部</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} ・ {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>ABC 類別</label>
            <select
              value={abc}
              onChange={(e) => setAbc(e.target.value)}
              className={`${inputClass} w-[100px]`}
            >
              <option value="">全部</option>
              <option value="A">A 類</option>
              <option value="B">B 類</option>
              <option value="C">C 類</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>告警等級</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className={`${inputClass} w-[110px]`}
            >
              <option value="">全部</option>
              {ALERT_PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>啟用狀態</label>
            <select
              value={isActive}
              onChange={(e) => setIsActive(e.target.value)}
              className={`${inputClass} w-[100px]`}
            >
              <option value="">全部</option>
              <option value="true">啟用</option>
              <option value="false">停用</option>
            </select>
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
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
            >
              重置
            </button>
            <Link
              href="/parts/alerts/thresholds/new"
              aria-disabled={!canEdit}
              tabIndex={!canEdit ? -1 : 0}
              title={canEdit ? "" : "沒有編輯權限"}
              className={`h-[30px] px-3 rounded text-[12.5px] font-medium inline-flex items-center bg-[#0F6E56] text-white hover:bg-[#0a5742] ${
                !canEdit ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              ＋ 新增水位
            </Link>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆水位設定
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/alerts/thresholds"
        exportFileName="stock-thresholds"
        emptyMessage="沒有符合條件的水位設定"
        disabled={isPending}
        rowActionsWidth={220}
        rowActions={(r) => (
          <div className="flex gap-1.5">
            <Link
              href={`/parts/alerts/thresholds/${r.id}`}
              className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              編輯
            </Link>
            <button
              type="button"
              onClick={() => toggleActive(r)}
              disabled={!canEdit || isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              {r.is_active ? "停用" : "啟用"}
            </button>
            <button
              type="button"
              onClick={() => removeRow(r)}
              disabled={!canEdit || isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
            >
              刪除
            </button>
          </div>
        )}
      />

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

