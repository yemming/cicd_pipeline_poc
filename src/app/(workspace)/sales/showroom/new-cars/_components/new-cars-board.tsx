"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  createNewCarAction,
  updateNewCarAction,
  deleteNewCarAction,
} from "@/lib/sales/new-car-actions";
import {
  NEW_CAR_STATUS_LABELS,
  NEW_CAR_STATUS_CHIP,
  LICENSE_PLATE_STATUS_LABELS,
  ALL_STATUSES,
  ALL_LICENSE_PLATE_STATUSES,
  type NewCarInventoryStatus,
  type LicensePlateStatus,
} from "@/domain/new-car-inventory.constants";
import type { NewCarInventoryRow, NewCarInventoryInput } from "@/domain/new-car-inventory.constants";
import { useSetPageHeader } from "@/components/page-header-context";

// ── 型別 ──────────────────────────────────────────────────────────────

type VehicleModelOption = { id: string; display_name: string; series: string | null; msrp: number | null };
type OrganizationOption = { id: string; name: string };

type Banner = { ok: boolean; msg: string } | null;
type FormMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; row: NewCarInventoryRow };

// ── 輔助元件 ──────────────────────────────────────────────────────────

const inputClass =
  "w-full h-[30px] px-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] focus:outline-none disabled:bg-[#F8F7F4] disabled:opacity-60";
const labelClass = "text-[11px] text-[#9A9890] font-medium";
const lockedClass = "pointer-events-none opacity-60";

function Modal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

// ── 主元件 ──────────────────────────────────────────────────────────────

export default function NewCarsBoard({
  initialRows,
  vehicleModels,
  organizations,
  brandId,
}: {
  initialRows: NewCarInventoryRow[];
  vehicleModels: VehicleModelOption[];
  organizations: OrganizationOption[];
  brandId: string;
}) {
  useSetPageHeader({
    title: "新車庫存",
    breadcrumb: [{ label: "展廳接待" }, { label: "新車庫存" }],
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<NewCarInventoryRow[]>(initialRows);
  const [banner, setBanner] = useState<Banner>(null);
  const [formMode, setFormMode] = useState<FormMode>({ kind: "closed" });

  // filter
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSeries, setFilterSeries] = useState("");
  const [filterColor, setFilterColor] = useState("");
  const [filterLpStatus, setFilterLpStatus] = useState("");

  // form state
  const [fVin, setFVin] = useState("");
  const [fModelId, setFModelId] = useState("");
  const [fColor, setFColor] = useState("");
  const [fColorHex, setFColorHex] = useState("");
  const [fYear, setFYear] = useState(new Date().getFullYear().toString());
  const [fStatus, setFStatus] = useState<NewCarInventoryStatus>("arrived");
  const [fCostPrice, setFCostPrice] = useState("");
  const [fListPrice, setFListPrice] = useState("");
  const [fArrivalDate, setFArrivalDate] = useState("");
  const [fOrgId, setFOrgId] = useState("");
  const [fLpStatus, setFLpStatus] = useState<LicensePlateStatus>("not_applied");
  const [fLpNo, setFLpNo] = useState("");
  const [fNote, setFNote] = useState("");

  useEffect(() => {
    if (banner?.ok) {
      const t = setTimeout(() => setBanner(null), 2200);
      return () => clearTimeout(t);
    }
  }, [banner]);

  // ── 派生唯一顏色選項 ──
  const colorOptions = Array.from(new Set(initialRows.map((r) => r.color).filter(Boolean))) as string[];
  // ── 派生唯一車系選項 ──
  const seriesOptions = Array.from(new Set(vehicleModels.map((m) => m.series).filter(Boolean))) as string[];

  // ── 前端過濾 ──────────────────────────────────────────────────────────
  const filtered = rows.filter((r) => {
    if (filterStatus && r.status !== filterStatus) return false;
    if (filterSeries && r.model_series !== filterSeries) return false;
    if (filterColor && r.color !== filterColor) return false;
    if (filterLpStatus && r.license_plate_status !== filterLpStatus) return false;
    return true;
  });

  // ── 開 form ────────────────────────────────────────────────────────
  function openCreate() {
    setFVin(""); setFModelId(""); setFColor(""); setFColorHex(""); setFYear(new Date().getFullYear().toString());
    setFStatus("arrived"); setFCostPrice(""); setFListPrice(""); setFArrivalDate("");
    setFOrgId(""); setFLpStatus("not_applied"); setFLpNo(""); setFNote("");
    setFormMode({ kind: "create" });
  }

  function openEdit(row: NewCarInventoryRow) {
    setFVin(row.vin ?? ""); setFModelId(row.vehicle_model_id ?? ""); setFColor(row.color ?? "");
    setFColorHex(row.color_hex ?? ""); setFYear(row.year?.toString() ?? "");
    setFStatus(row.status); setFCostPrice(row.cost_price?.toString() ?? "");
    setFListPrice(row.list_price?.toString() ?? ""); setFArrivalDate(row.arrival_date ?? "");
    setFOrgId(row.organization_id ?? ""); setFLpStatus(row.license_plate_status);
    setFLpNo(row.license_plate_no ?? ""); setFNote(row.note ?? "");
    setFormMode({ kind: "edit", row });
  }

  function closeForm() { setFormMode({ kind: "closed" }); }

  function buildInput(): NewCarInventoryInput {
    return {
      brand_id: brandId,
      vin: fVin.trim() || null,
      vehicle_model_id: fModelId || null,
      color: fColor.trim() || null,
      color_hex: fColorHex.trim() || null,
      year: fYear ? parseInt(fYear, 10) : null,
      status: fStatus,
      cost_price: fCostPrice ? parseFloat(fCostPrice) : null,
      list_price: fListPrice ? parseFloat(fListPrice) : null,
      arrival_date: fArrivalDate || null,
      organization_id: fOrgId || null,
      license_plate_status: fLpStatus,
      license_plate_no: fLpNo.trim() || null,
      note: fNote.trim() || null,
    };
  }

  // ── 新增 ──────────────────────────────────────────────────────────
  function handleCreate() {
    startTransition(async () => {
      const res = await createNewCarAction(buildInput());
      if (res.ok) {
        setBanner({ ok: true, msg: "✓ 已新增新車庫存" });
        closeForm();
        router.refresh();
        setRows((prev) => [
          {
            id: res.data.id,
            brand_id: brandId,
            subsidiary_id: null,
            organization_id: fOrgId || null,
            vin: fVin.trim() || null,
            external_id: null,
            vehicle_model_id: fModelId || null,
            color: fColor.trim() || null,
            color_hex: fColorHex.trim() || null,
            config: {},
            year: fYear ? parseInt(fYear, 10) : null,
            engine_no: null,
            build_date: null,
            cost_price: fCostPrice ? parseFloat(fCostPrice) : null,
            list_price: fListPrice ? parseFloat(fListPrice) : null,
            pdi_labor_cost: null,
            pdi_parts_cost: null,
            transfer_freight_cost: null,
            total_cost: fCostPrice ? parseFloat(fCostPrice) : null,
            pdi_workorder_id: null,
            purchase_order_id: null,
            arrival_batch_id: null,
            damage_flag: null,
            damage_notes: null,
            status: fStatus,
            arrival_date: fArrivalDate || null,
            displayed_date: null,
            reserved_date: null,
            sold_date: null,
            delivered_date: null,
            license_plate_status: fLpStatus,
            license_plate_no: fLpNo.trim() || null,
            linked_sales_order_id: null,
            note: fNote.trim() || null,
            images: [],
            metadata: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            created_by: null,
            updated_by: null,
            model_display_name: vehicleModels.find((m) => m.id === fModelId)?.display_name ?? null,
            model_series: vehicleModels.find((m) => m.id === fModelId)?.series ?? null,
            organization_name: organizations.find((o) => o.id === fOrgId)?.name ?? null,
            // A1 demo fields（新建時預設非 demo）
            is_demo_unit: false,
            demo_asset_acquired_at: null,
            demo_retired_at: null,
            converted_to_used_inventory_id: null,
          },
          ...prev,
        ]);
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  }

  // ── 更新 ──────────────────────────────────────────────────────────
  function handleUpdate(id: string) {
    startTransition(async () => {
      const res = await updateNewCarAction(id, buildInput());
      if (res.ok) {
        setBanner({ ok: true, msg: "✓ 已更新" });
        closeForm();
        router.refresh();
        setRows((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  vin: fVin.trim() || null,
                  vehicle_model_id: fModelId || null,
                  color: fColor.trim() || null,
                  color_hex: fColorHex.trim() || null,
                  year: fYear ? parseInt(fYear, 10) : null,
                  status: fStatus,
                  cost_price: fCostPrice ? parseFloat(fCostPrice) : null,
                  list_price: fListPrice ? parseFloat(fListPrice) : null,
                  arrival_date: fArrivalDate || null,
                  organization_id: fOrgId || null,
                  license_plate_status: fLpStatus,
                  license_plate_no: fLpNo.trim() || null,
                  note: fNote.trim() || null,
                  model_display_name: vehicleModels.find((m) => m.id === fModelId)?.display_name ?? r.model_display_name,
                  model_series: vehicleModels.find((m) => m.id === fModelId)?.series ?? r.model_series,
                  organization_name: organizations.find((o) => o.id === fOrgId)?.name ?? r.organization_name,
                }
              : r
          )
        );
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  }

  // ── 刪除 ──────────────────────────────────────────────────────────
  function handleDelete(row: NewCarInventoryRow) {
    if (!confirm(`確定要刪除 ${row.model_display_name ?? row.vin ?? "此筆"} 嗎？`)) return;
    startTransition(async () => {
      const res = await deleteNewCarAction(row.id);
      if (res.ok) {
        setBanner({ ok: true, msg: "✓ 已刪除" });
        setRows((prev) => prev.filter((r) => r.id !== row.id));
        router.refresh();
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  }

  // ── DataGrid columns ──────────────────────────────────────────────
  const columns: DataGridColumn<NewCarInventoryRow>[] = [
    {
      id: "vin",
      header: "VIN",
      width: 160,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/sales/showroom/new-cars/${r.id}`}
          className="font-mono text-[#185FA5] hover:underline text-[12px]"
        >
          {r.vin ?? "—"}
        </Link>
      ),
      exportValue: (r) => r.vin ?? "",
      sortValue: (r) => r.vin ?? "",
    },
    {
      id: "model",
      header: "車款",
      width: 200,
      cell: (r) => (
        <span className="text-[12.5px] font-semibold text-[#2C2C2A]">
          {r.model_display_name ?? "—"}
        </span>
      ),
      exportValue: (r) => r.model_display_name ?? "",
      sortValue: (r) => r.model_display_name ?? "",
    },
    {
      id: "series",
      header: "車系",
      width: 120,
      cell: (r) => (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
          {r.model_series ?? "—"}
        </span>
      ),
      exportValue: (r) => r.model_series ?? "",
      sortValue: (r) => r.model_series ?? "",
    },
    {
      id: "status",
      header: "狀態",
      width: 110,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${NEW_CAR_STATUS_CHIP[r.status]}`}
        >
          {NEW_CAR_STATUS_LABELS[r.status]}
        </span>
      ),
      exportValue: (r) => NEW_CAR_STATUS_LABELS[r.status],
      sortValue: (r) => r.status,
    },
    {
      id: "color",
      header: "顏色",
      width: 100,
      cell: (r) => (
        <div className="flex items-center gap-1.5">
          {r.color_hex && (
            <span
              className="inline-block w-[12px] h-[12px] rounded-full border border-black/10 shrink-0"
              style={{ background: r.color_hex }}
            />
          )}
          <span className="text-[12px]">{r.color ?? "—"}</span>
        </div>
      ),
      exportValue: (r) => r.color ?? "",
      sortValue: (r) => r.color ?? "",
    },
    {
      id: "year",
      header: "年款",
      width: 80,
      align: "right",
      cell: (r) => <span className="font-mono text-[12px]">{r.year ?? "—"}</span>,
      exportValue: (r) => r.year?.toString() ?? "",
      sortValue: (r) => r.year ?? 0,
    },
    {
      id: "list_price",
      header: "售價",
      width: 130,
      align: "right",
      cell: (r) =>
        r.list_price != null ? (
          <span className="font-mono font-bold text-[12px] text-[#1A3A5C]">
            {r.list_price.toLocaleString()}
          </span>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => r.list_price?.toString() ?? "",
      sortValue: (r) => r.list_price ?? 0,
    },
    {
      id: "arrival_date",
      header: "到廠日",
      width: 110,
      cell: (r) => <span className="text-[12px]">{r.arrival_date ?? "—"}</span>,
      exportValue: (r) => r.arrival_date ?? "",
      sortValue: (r) => r.arrival_date ?? "",
    },
    {
      id: "license_plate_status",
      header: "領牌狀態",
      width: 110,
      cell: (r) => (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">
          {LICENSE_PLATE_STATUS_LABELS[r.license_plate_status]}
        </span>
      ),
      exportValue: (r) => LICENSE_PLATE_STATUS_LABELS[r.license_plate_status],
      sortValue: (r) => r.license_plate_status,
    },
    {
      id: "license_plate_no",
      header: "車牌",
      width: 110,
      defaultHidden: true,
      cell: (r) => <span className="font-mono text-[12px]">{r.license_plate_no ?? "—"}</span>,
      exportValue: (r) => r.license_plate_no ?? "",
    },
    {
      id: "organization",
      header: "展廳",
      width: 120,
      defaultHidden: true,
      cell: (r) => <span className="text-[12px]">{r.organization_name ?? "—"}</span>,
      exportValue: (r) => r.organization_name ?? "",
    },
    {
      id: "note",
      header: "備註",
      width: 160,
      defaultHidden: true,
      sortable: false,
      cell: (r) => <span className="text-[12px] text-[#5A5955]">{r.note ?? "—"}</span>,
      exportValue: (r) => r.note ?? "",
    },
  ];

  const isSubmitting = isPending;
  const formOpen = formMode.kind !== "closed";

  return (
    <main className={`px-6 py-5 space-y-3 ${isSubmitting ? lockedClass : ""}`}>
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">新車庫存</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          展廳接待 / A5
        </span>
        <span className="text-[12px] text-[#9A9890]">
          展廳現場現貨管理 — 狀態追蹤、領牌、報價接續
        </span>
      </header>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-[30px] px-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="">全部狀態</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{NEW_CAR_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>車系</label>
            <select
              value={filterSeries}
              onChange={(e) => setFilterSeries(e.target.value)}
              className="h-[30px] px-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="">全部車系</option>
              {seriesOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>顏色</label>
            <select
              value={filterColor}
              onChange={(e) => setFilterColor(e.target.value)}
              className="h-[30px] px-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="">全部顏色</option>
              {colorOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>領牌狀態</label>
            <select
              value={filterLpStatus}
              onChange={(e) => setFilterLpStatus(e.target.value)}
              className="h-[30px] px-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="">全部</option>
              {ALL_LICENSE_PLATE_STATUSES.map((s) => (
                <option key={s} value={s}>{LICENSE_PLATE_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => { setFilterStatus(""); setFilterSeries(""); setFilterColor(""); setFilterLpStatus(""); }}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <button
              onClick={openCreate}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              disabled={isSubmitting}
            >
              ＋ 新增車輛
            </button>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆庫存（顯示{" "}
          <b>{filtered.length}</b> 筆）
        </span>
      </div>

      {/* DataGrid */}
      <DataGrid
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id}
        persistKey="sales/showroom/new-cars"
        exportFileName="new-car-inventory"
        emptyMessage="沒有符合條件的庫存"
        disabled={isSubmitting}
        rowActionsWidth={230}
        rowActions={(r) => (
          <>
            <Link
              href={`/sales/showroom/new-cars/${r.id}`}
              className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              詳情
            </Link>
            <button
              onClick={() => openEdit(r)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              disabled={isSubmitting}
            >
              編輯
            </button>
            <button
              onClick={() => handleDelete(r)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
              disabled={isSubmitting}
            >
              刪除
            </button>
          </>
        )}
      />

      {/* Create / Edit Modal */}
      <Modal open={formOpen} onClose={closeForm}>
        <div className="px-5 py-4 border-b border-[#EEECE6]">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">
            {formMode.kind === "create" ? "新增車輛" : "編輯車輛"}
          </h2>
        </div>
        <div className={`px-5 py-4 space-y-4 ${isSubmitting ? lockedClass : ""}`}>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>VIN</label>
              <input value={fVin} onChange={(e) => setFVin(e.target.value)} className={inputClass} placeholder="ZDM..." disabled={isSubmitting} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>車款</label>
              <select value={fModelId} onChange={(e) => setFModelId(e.target.value)} className={inputClass} disabled={isSubmitting}>
                <option value="">— 選擇車款 —</option>
                {vehicleModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.display_name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>顏色</label>
              <input value={fColor} onChange={(e) => setFColor(e.target.value)} className={inputClass} placeholder="如：紅" disabled={isSubmitting} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>色票 HEX</label>
              <input value={fColorHex} onChange={(e) => setFColorHex(e.target.value)} className={inputClass} placeholder="#C8001A" disabled={isSubmitting} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>年款</label>
              <input type="number" value={fYear} onChange={(e) => setFYear(e.target.value)} className={inputClass} placeholder="2026" disabled={isSubmitting} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>狀態</label>
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value as NewCarInventoryStatus)} className={inputClass} disabled={isSubmitting}>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>{NEW_CAR_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>進貨成本（NT$）</label>
              <input type="number" value={fCostPrice} onChange={(e) => setFCostPrice(e.target.value)} className={inputClass} placeholder="0" disabled={isSubmitting} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>零售售價（NT$）</label>
              <input type="number" value={fListPrice} onChange={(e) => setFListPrice(e.target.value)} className={inputClass} placeholder="0" disabled={isSubmitting} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>到廠日期</label>
              <input type="date" value={fArrivalDate} onChange={(e) => setFArrivalDate(e.target.value)} className={inputClass} disabled={isSubmitting} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>展廳門店</label>
              <select value={fOrgId} onChange={(e) => setFOrgId(e.target.value)} className={inputClass} disabled={isSubmitting}>
                <option value="">— 選擇門店 —</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>領牌狀態</label>
              <select value={fLpStatus} onChange={(e) => setFLpStatus(e.target.value as LicensePlateStatus)} className={inputClass} disabled={isSubmitting}>
                {ALL_LICENSE_PLATE_STATUSES.map((s) => (
                  <option key={s} value={s}>{LICENSE_PLATE_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>車牌號碼</label>
              <input value={fLpNo} onChange={(e) => setFLpNo(e.target.value)} className={inputClass} placeholder="如：ABC-1234" disabled={isSubmitting} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>備註</label>
            <textarea
              value={fNote}
              onChange={(e) => setFNote(e.target.value)}
              rows={2}
              className="w-full px-2 py-1.5 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] focus:outline-none resize-none disabled:opacity-60"
              disabled={isSubmitting}
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button
            onClick={closeForm}
            className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            disabled={isSubmitting}
          >
            取消
          </button>
          <button
            onClick={() =>
              formMode.kind === "create" ? handleCreate() : formMode.kind === "edit" ? handleUpdate(formMode.row.id) : undefined
            }
            className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? formMode.kind === "create"
                ? "建立中⋯"
                : "儲存中⋯"
              : formMode.kind === "create"
                ? "建立車輛"
                : "儲存變更"}
          </button>
        </div>
      </Modal>

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
