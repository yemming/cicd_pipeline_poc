"use client";

/**
 * 新車庫存看板（合併版）— 第九輪 BDN Batch A T1
 *
 * 取代：
 *   - `new-cars-board.tsx`（DataGrid only）
 *   - `newcar-inventory-board.tsx`（卡片版、接 mock）
 *
 * 設計：單一 board，view toggle（卡片 / 列表）切換，資料源走真 DB（@/domain/new-car-inventory）。
 * 列表模式保留 DataGrid 既有功能（pagination / column visibility / sort / Excel export）。
 * 卡片模式照 RS03A_新車庫存看板_v1.html 樣板。
 *
 * TODO（cost 欄位待補）：
 *   - vehicle_units / new_car_inventory 已有 `cost_price` 欄位，可直接算利潤%；
 *   - 第八輪 BDN Q4 = B 拍板要新增 `cost_amount` 細項（含進貨、關稅、運費），
 *     等該欄位上 DB 後改為 (list_price - cost_amount) / list_price，預期更精準。
 *   - 目前先用 cost_price + list_price 算粗利潤%，cost_price 為 null 時 chip 顯示「—」。
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  DisplayModeToggle,
  readPersistedMode,
  type DisplayMode,
} from "@/components/inventory/display-mode-toggle";
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
  pdiProgress,
  pdiWorkorderNo,
  grossMargin,
  type NewCarInventoryRow,
  type NewCarInventoryInput,
  type NewCarInventoryStatus,
  type LicensePlateStatus,
  type NewCarKpiSummary,
  type NewCarByModelDatum,
  type NewCarSlowMover,
} from "@/domain/new-car-inventory.constants";
import { useSetPageHeader } from "@/components/page-header-context";
import { KpiCard } from "@/components/visualization/KpiCard";
import { BarChart } from "@/components/charts";

// ── 型別 ──────────────────────────────────────────────────────────────

type VehicleModelOption = { id: string; display_name: string; series: string | null; msrp: number | null };
type OrganizationOption = { id: string; name: string };

type Banner = { ok: boolean; msg: string } | null;
type FormMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; row: NewCarInventoryRow };

const inputClass =
  "w-full h-[30px] px-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] focus:outline-none disabled:bg-[#F8F7F4] disabled:opacity-60";
const labelClass = "text-[11px] text-[#9A9890] font-medium";
const lockedClass = "pointer-events-none opacity-60";

const PERSIST_KEY = "sales/showroom/new-cars";

// ── 衍生計算 helpers ──────────────────────────────────────────────────

/** 在庫天數：arrival_date 到今天（已售出取 sold_date）。 */
function daysInStock(row: NewCarInventoryRow): number | null {
  if (!row.arrival_date) return null;
  const end = row.sold_date ? new Date(row.sold_date) : new Date();
  const start = new Date(row.arrival_date);
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function daysToneClass(days: number | null): string {
  if (days === null) return "text-[#9A9890]";
  if (days > 90) return "text-[#C8001A]";
  if (days > 60) return "text-[#854F0B]";
  if (days > 30) return "text-[#854F0B]";
  return "text-[#0F6E56]";
}

/** 庫齡 > 90 天且尚在展示/保留/到廠 → 視為 slow mover，列表/卡片要 amber highlight */
function isSlowMover(row: NewCarInventoryRow): boolean {
  if (row.status === "sold" || row.status === "delivered" || row.status === "damaged") return false;
  const d = daysInStock(row);
  return d !== null && d > 90;
}

/**
 * 利潤%：(list_price - cost_price) / list_price。
 * TODO Q4=B：等 vehicle_units.cost_amount（含關稅、運費）落地後改用更精準算式。
 * 任一缺 / 0 / 負 → null（chip 顯示「—」）。
 */
function profitRate(row: NewCarInventoryRow): number | null {
  if (row.cost_price == null || row.list_price == null) return null;
  if (row.list_price <= 0) return null;
  return Math.round(((row.list_price - row.cost_price) / row.list_price) * 100);
}

function profitChipClass(rate: number | null): string {
  if (rate === null) return "bg-[#F2F2F2] text-[#6B6A68]";
  if (rate >= 15) return "bg-[#E1F5EE] text-[#0F6E56]";
  if (rate >= 8) return "bg-[#FDF3E3] text-[#854F0B]";
  return "bg-[#FDECEA] text-[#C8001A]";
}

// ── Modal ────────────────────────────────────────────────────────────

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

// ── 主元件 ──────────────────────────────────────────────────────────

/**
 * viewMode:
 *   - 'dealer'（預設）：展廳接待視角，掛 /sales/showroom/new-cars
 *   - 'rs'：銷售接待（Showroom Staff）視角，掛 /sales/showroom/stock（輪3-1a）
 *     RS 視角：隱藏新增/編輯/刪除 CRUD 按鈕（純查詢），page header 加「RS 視角」chip
 */
export type NewCarInventoryViewMode = "dealer" | "rs";

export default function NewCarInventoryBoard({
  initialRows,
  vehicleModels,
  organizations,
  brandId,
  kpi,
  byModel,
  slowMovers,
  canViewCost,
  viewMode = "dealer",
}: {
  initialRows: NewCarInventoryRow[];
  vehicleModels: VehicleModelOption[];
  organizations: OrganizationOption[];
  brandId: string;
  kpi: NewCarKpiSummary;
  byModel: NewCarByModelDatum[];
  slowMovers: NewCarSlowMover[];
  /** 主管才看得到整車成本 / 毛利（permission: sales.cost.view） */
  canViewCost: boolean;
  /** 視角切換（輪3-1a）：dealer=展廳, rs=銷售接待（純查詢，不顯示 CRUD） */
  viewMode?: NewCarInventoryViewMode;
}) {
  const isRs = viewMode === "rs";

  useSetPageHeader({
    title: isRs ? "新車庫存看板（RS 視角）" : "新車庫存",
    breadcrumb: isRs
      ? [{ label: "銷售接待" }, { label: "展廳接待" }, { label: "新車庫存（RS 視角）" }]
      : [{ label: "展廳接待" }, { label: "新車庫存" }],
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<NewCarInventoryRow[]>(initialRows);
  const [banner, setBanner] = useState<Banner>(null);
  const [formMode, setFormMode] = useState<FormMode>({ kind: "closed" });

  // 預設 card 模式（SSR safe — useState lazy initializer，client 端 mount 時讀 localStorage）
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => readPersistedMode(PERSIST_KEY, "card"));

  // filter
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSeries, setFilterSeries] = useState("");
  const [filterColor, setFilterColor] = useState("");
  const [filterLpStatus, setFilterLpStatus] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  // A1：demo 車 filter（"" = 全部 / "demo" = 只看 demo / "non_demo" = 排除 demo）
  const [filterDemoMode, setFilterDemoMode] = useState<"" | "demo" | "non_demo">("");

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

  // ── 派生選項 ──
  const colorOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.color).filter(Boolean))) as string[],
    [rows],
  );
  const seriesOptions = useMemo(
    () => Array.from(new Set(vehicleModels.map((m) => m.series).filter(Boolean))) as string[],
    [vehicleModels],
  );

  // ── 前端過濾 ──
  const filtered = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterSeries && r.model_series !== filterSeries) return false;
      if (filterColor && r.color !== filterColor) return false;
      if (filterLpStatus && r.license_plate_status !== filterLpStatus) return false;
      // A1：demo 車 filter
      if (filterDemoMode === "demo" && !r.is_demo_unit) return false;
      if (filterDemoMode === "non_demo" && r.is_demo_unit) return false;
      if (q) {
        const hay =
          (r.model_display_name ?? "") +
          " " +
          (r.vin ?? "") +
          " " +
          (r.color ?? "");
        if (!hay.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, filterStatus, filterSeries, filterColor, filterLpStatus, filterQuery, filterDemoMode]);

  // ── 開 form ──
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
              : r,
          ),
        );
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  }

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

  // ── DataGrid columns（列表模式）──
  // 整車成本 / 毛利：只主管可見（permission sales.cost.view）
  const costColumns: DataGridColumn<NewCarInventoryRow>[] = canViewCost
    ? [
        {
          id: "total_cost",
          header: "整車成本",
          width: 130,
          align: "right",
          cell: (r) => {
            if (r.status === "pending_pdi") {
              return <span className="text-[#534AB7] text-[11px]">計算中（PDI）</span>;
            }
            return r.total_cost != null && r.total_cost > 0 ? (
              <span className="font-mono text-[12px] text-[#5A5955]">{r.total_cost.toLocaleString()}</span>
            ) : (
              <span className="text-[#9A9890] text-[12px]">—</span>
            );
          },
          exportValue: (r) => (r.total_cost != null ? r.total_cost.toString() : ""),
          sortValue: (r) => r.total_cost ?? -1,
        },
        {
          id: "gross_margin",
          header: "毛利空間",
          width: 120,
          align: "right",
          cell: (r) => {
            const m = grossMargin(r);
            return m != null ? (
              <span className="font-mono text-[12px] font-semibold text-[#0F6E56]">{m.toLocaleString()}</span>
            ) : (
              <span className="text-[#9A9890] text-[12px]">—</span>
            );
          },
          exportValue: (r) => {
            const m = grossMargin(r);
            return m != null ? m.toString() : "";
          },
          sortValue: (r) => grossMargin(r) ?? -1,
        },
      ]
    : [];

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
      id: "demo_unit",
      header: "展示車",
      width: 80,
      defaultHidden: false,
      sortable: false,
      cell: (r) =>
        r.is_demo_unit ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EAF4FB] text-[#185FA5] whitespace-nowrap">
            Demo
          </span>
        ) : null,
      exportValue: (r) => (r.is_demo_unit ? "Demo" : ""),
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
      id: "days_in_stock",
      header: "在庫天",
      width: 100,
      align: "right",
      cell: (r) => {
        const d = daysInStock(r);
        const slow = isSlowMover(r);
        return (
          <span
            data-testid={`days-cell-${r.id}`}
            data-slow={slow ? "true" : "false"}
            className={
              slow
                ? "inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-semibold text-[11.5px] bg-[#FDF3E3] text-[#854F0B] border border-[#F0C97E]"
                : "font-mono font-semibold text-[12px] " + daysToneClass(d)
            }
          >
            {slow ? <span>⚠</span> : null}
            {d === null ? "—" : `${d} 天`}
          </span>
        );
      },
      exportValue: (r) => daysInStock(r)?.toString() ?? "",
      sortValue: (r) => daysInStock(r) ?? -1,
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
      id: "profit_rate",
      header: "利潤%",
      width: 80,
      align: "right",
      sortable: true,
      cell: (r) => {
        const rate = profitRate(r);
        return (
          <span
            className={"inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-semibold " + profitChipClass(rate)}
            data-testid={`profit-rate-${r.id}`}
          >
            {rate === null ? "—" : `${rate}%`}
          </span>
        );
      },
      exportValue: (r) => {
        const rate = profitRate(r);
        return rate === null ? "" : `${rate}%`;
      },
      sortValue: (r) => profitRate(r) ?? -999,
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
    ...costColumns,
  ];

  const isSubmitting = isPending;
  const formOpen = formMode.kind !== "closed";

  return (
    <main
      className={`px-6 py-5 space-y-3 ${isSubmitting ? lockedClass : ""}`}
      data-testid="newcar-inventory-board"
      data-display-mode={displayMode}
    >
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          {isRs ? "新車庫存看板（RS 視角）" : "新車庫存"}
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          {isRs ? "銷售接待 / RS03A" : "展廳接待 / RS03A"}
        </span>
        {isRs && (
          <span
            className="px-2 py-0.5 text-[11px] rounded-full bg-[#E1F5EE] text-[#0F6E56] font-medium"
            data-testid="rs-perspective-chip"
          >
            RS 視角
          </span>
        )}
        <span className="text-[12px] text-[#9A9890]">
          {isRs
            ? "本店可推薦庫存 — 現車、保留、訂車中與本月已售，銷售接待第一現場使用"
            : "展廳現場現貨管理 — 卡片 / 列表雙模式、狀態追蹤、領牌、報價接續"}
        </span>
      </header>

      {/* KPI Row — 庫存節奏一眼讀（依 status 動態統計）*/}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5" data-testid="newcar-kpi-row">
        <KpiCard
          label="現車可售"
          value={kpi.displayed}
          tone="teal"
          layout="vertical"
        />
        <KpiCard
          label="待 PDI"
          value={kpi.pending_pdi}
          tone="purple"
          layout="vertical"
        />
        <KpiCard
          label="已保留"
          value={kpi.reserved}
          tone="amber"
          layout="vertical"
        />
        <KpiCard
          label="在途中"
          value={kpi.in_transit}
          tone="blue"
          layout="vertical"
        />
        <KpiCard
          label="本月已售"
          value={kpi.sold_this_month}
          tone="red"
          layout="vertical"
        />
      </section>

      {/* 入庫入口橫幅 — 引導至 INV02 到港確認（T7 才建頁，先放連結）*/}
      <Link
        href="/sales/inventory/arrival-confirmation"
        data-testid="newcar-arrival-banner"
        className="flex items-center gap-3 flex-wrap rounded-lg border border-[#85B7EB] bg-[#EAF4FB] px-4 py-2.5 hover:bg-[#DCEDFB] transition"
      >
        <span className="flex-1 text-[12.5px] text-[#0C3E70] leading-relaxed">
          <b>新車入庫入口：</b>新車到港後請至 INV02 進行到港確認（逐台掃 VIN），系統將自動建立 PDI 工單。
          <b>PDI 完成後車輛才會顯示為「可售」</b>，業務才可配車報價。
        </span>
        <span className="shrink-0 inline-flex items-center gap-1 h-[30px] px-3.5 rounded-md bg-[#1A3A5C] text-white text-[12px] font-semibold hover:bg-[#0F2A45]">
          📦 前往 INV02 到港確認
        </span>
      </Link>

      {/* BarChart by-model + Slow Movers 並排 */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-white border border-[#EEECE6] rounded-lg overflow-hidden" data-testid="newcar-by-model-chart">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 各車型庫存（依狀態堆疊）</span>
            <span className="text-[11px] text-[#9A9890]">— 看哪些車賣得動、哪些卡在展示</span>
          </header>
          <div className="px-3 py-3">
            {byModel.length === 0 ? (
              <div className="py-10 text-center text-[12px] text-[#9A9890]">尚無庫存資料</div>
            ) : (
              <BarChart
                data={byModel as unknown as Record<string, unknown>[]}
                categoryKey="model"
                valueKey={[
                  { key: "displayed", label: "展示中", color: "#3B6D11" },
                  { key: "pending_pdi", label: "待 PDI", color: "#534AB7" },
                  { key: "reserved", label: "已保留", color: "#854F0B" },
                  { key: "in_transit", label: "在途", color: "#185FA5" },
                  { key: "arrived", label: "已到廠", color: "#6B6A68" },
                  { key: "sold", label: "已售", color: "#C8001A" },
                  { key: "delivered", label: "已交車", color: "#0F6E56" },
                ]}
                stacked
                showLegend
                size="md"
              />
            )}
          </div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden" data-testid="newcar-slow-movers">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[#854F0B]">⚠ 庫齡 &gt; 90 天</span>
            <span className="text-[11px] text-[#9A9890]">老闆要看哪些賣不動</span>
            <span className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#FDF3E3] text-[#854F0B]">
              {slowMovers.length}
            </span>
          </header>
          <div className="max-h-[260px] overflow-y-auto">
            {slowMovers.length === 0 ? (
              <div className="py-10 text-center text-[12px] text-[#9A9890]">✓ 沒有庫齡過長的車</div>
            ) : (
              <ul className="divide-y divide-[#F4F2EC]">
                {slowMovers.slice(0, 10).map((s) => (
                  <li key={s.id} className="px-4 py-2 hover:bg-[#FAFAF8]">
                    <Link href={`/sales/showroom/new-cars/${s.id}`} className="flex items-center gap-2 text-[12px]">
                      <span className="font-semibold text-[#2C2C2A] truncate flex-1">
                        {s.model_display_name ?? s.vin ?? "—"}
                      </span>
                      <span className="text-[10.5px] text-[#9A9890] whitespace-nowrap">{s.color ?? "—"}</span>
                      <span className="font-mono font-bold text-[#C8001A] text-[12px] whitespace-nowrap">
                        {s.days_in_stock} 天
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Filter Bar + View Toggle */}
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
          <div className="flex flex-col gap-1">
            <label className={labelClass}>搜尋</label>
            <input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="車款 / VIN / 顏色"
              className="h-[30px] w-[180px] px-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </div>
          {/* A1：demo 車 filter 切換 */}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>展示車</label>
            <select
              value={filterDemoMode}
              onChange={(e) => setFilterDemoMode(e.target.value as "" | "demo" | "non_demo")}
              className="h-[30px] px-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="">全部</option>
              <option value="demo">僅 Demo 車</option>
              <option value="non_demo">排除 Demo 車</option>
            </select>
          </div>
          <div className="flex gap-2 ml-auto items-end">
            <button
              onClick={() => {
                setFilterStatus(""); setFilterSeries(""); setFilterColor("");
                setFilterLpStatus(""); setFilterQuery(""); setFilterDemoMode("");
              }}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            {!isRs && (
              <button
                onClick={openCreate}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                disabled={isSubmitting}
              >
                ＋ 新增車輛
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Toolbar：count + view toggle */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆庫存（顯示{" "}
          <b>{filtered.length}</b> 筆）
        </span>
        <div className="ml-auto">
          <DisplayModeToggle value={displayMode} onChange={setDisplayMode} persistKey={PERSIST_KEY} />
        </div>
      </div>

      {/* Card / List */}
      {displayMode === "card" ? (
        <CardGrid rows={filtered} onEdit={isRs ? undefined : openEdit} canViewCost={canViewCost} />
      ) : (
        <DataGrid
          columns={columns}
          data={filtered}
          rowKey={(r) => r.id}
          persistKey={isRs ? "sales/showroom/stock-rs" : "sales/showroom/new-cars"}
          exportFileName="new-car-inventory"
          emptyMessage="沒有符合條件的庫存"
          disabled={isSubmitting}
          rowActionsWidth={isRs ? 140 : 300}
          rowActions={(r) => {
            const canQuote = r.status === "displayed" || r.status === "reserved";
            return (
              <>
                <Link
                  href={`/sales/showroom/new-cars/${r.id}`}
                  className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                >
                  詳情
                </Link>
                {canQuote ? (
                  <Link
                    href={`/sales/showroom/new-cars/${r.id}`}
                    className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
                    data-testid={`row-quote-${r.id}`}
                  >
                    報價
                  </Link>
                ) : (
                  <span
                    className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-[#F4F3F0] border border-[#D5D3CB] text-[#B0AEA8] cursor-not-allowed"
                    data-testid={`row-quote-locked-${r.id}`}
                    title={r.status === "pending_pdi" ? "PDI 完成後才可報價" : "此狀態不可報價"}
                  >
                    {r.status === "pending_pdi" ? "PDI 中" : "不可售"}
                  </span>
                )}
                {!isRs && (
                  <>
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
              </>
            );
          }}
        />
      )}

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

// ── Card Grid（卡片模式）─────────────────────────────────────────────

function CardGrid({
  rows,
  onEdit,
  canViewCost,
}: {
  rows: NewCarInventoryRow[];
  /** RS 視角傳 undefined 時隱藏編輯按鈕（輪3-1a）*/
  onEdit?: (row: NewCarInventoryRow) => void;
  canViewCost: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-[#EEECE6] rounded-lg py-12 text-center text-[12px] text-[#9A9890]">
        沒有符合條件的庫存
      </div>
    );
  }
  return (
    <div
      data-testid="newcar-card-grid"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
    >
      {rows.map((r) => {
        const rate = profitRate(r);
        const d = daysInStock(r);
        const slow = isSlowMover(r);
        const statusLabel = NEW_CAR_STATUS_LABELS[r.status];
        const isPdi = r.status === "pending_pdi";
        const canQuote = r.status === "displayed" || r.status === "reserved";
        const progress = pdiProgress(r);
        const woNo = pdiWorkorderNo(r);
        const margin = grossMargin(r);
        return (
          <article
            key={r.id}
            data-testid={`newcar-card-${r.id}`}
            data-slow={slow ? "true" : "false"}
            className={
              "bg-white rounded-lg overflow-hidden hover:shadow-md transition " +
              (slow
                ? "border-2 border-[#F0C97E] ring-1 ring-[#FDF3E3]"
                : "border border-[#EEECE6] hover:border-[#85B7EB]")
            }
          >
            {slow && (
              <div className="px-3 py-1 bg-[#FDF3E3] text-[#854F0B] text-[10.5px] font-semibold flex items-center gap-1 border-b border-[#F0C97E]">
                <span>⚠</span>
                <span>庫齡 {d} 天 — slow mover</span>
              </div>
            )}
            <div
              className="h-[110px] flex items-center justify-center relative overflow-hidden"
              style={{
                background: r.images && r.images.length > 0
                  ? "#F8F7F4"
                  : r.color_hex
                    ? `linear-gradient(135deg, ${r.color_hex} 0%, ${r.color_hex}99 100%)`
                    : "linear-gradient(135deg, #1A3A5C 0%, #2A5080 100%)",
              }}
            >
              {r.images && r.images.length > 0 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.images[0]}
                  alt={r.model_display_name ?? "車輛照片"}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="text-[40px] opacity-60">🏍️</span>
              )}
              <span
                className={
                  "absolute top-2 right-2 text-[10.5px] font-bold px-2 py-0.5 rounded " +
                  NEW_CAR_STATUS_CHIP[r.status]
                }
              >
                {statusLabel}
              </span>
              {/* 待 PDI — 圖片底部綠色進度條 */}
              {isPdi && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-[4px] bg-white/30"
                  data-testid={`pdi-progress-strip-${r.id}`}
                >
                  <div
                    className="h-full bg-[#5DCAA5] transition-[width] duration-300"
                    style={{ width: `${progress}%` }}
                    data-testid={`pdi-progress-fill-${r.id}`}
                    data-progress={progress}
                  />
                </div>
              )}
            </div>
            <div className="p-3">
              <Link
                href={`/sales/showroom/new-cars/${r.id}`}
                className="block text-[13px] font-bold text-[#2C2C2A] hover:text-[#185FA5]"
              >
                {r.model_display_name ?? "（未指定車款）"}
              </Link>
              <div className="text-[11px] text-[#9A9890] mb-2 flex items-center gap-1.5 flex-wrap">
                <span>{r.year ?? "—"} 年 · {r.color ?? "—"}</span>
                {/* A1：demo 車 chip */}
                {r.is_demo_unit && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] font-medium bg-[#EAF4FB] text-[#185FA5] whitespace-nowrap">
                    Demo 展示車
                  </span>
                )}
              </div>
              {/* PDI 狀態提示列 */}
              {isPdi ? (
                <div
                  className="text-[10.5px] px-1.5 py-1 rounded mb-2 bg-[#EEEDFE] text-[#534AB7]"
                  data-testid={`pdi-hint-${r.id}`}
                >
                  🔧 PDI 進行中{woNo ? ` — ${woNo}` : ""} · {progress}%
                </div>
              ) : canQuote && woNo ? (
                <div className="text-[10.5px] px-1.5 py-1 rounded mb-2 bg-[#E1F5EE] text-[#0F6E56]">
                  ✅ PDI 完成 — {woNo}
                </div>
              ) : null}
              <div className="space-y-0.5 mb-2">
                {r.vin && (
                  <div className="flex justify-between text-[11.5px]">
                    <span className="text-[#9A9890]">VIN 末 5</span>
                    <span className="font-mono font-semibold">{r.vin.slice(-5)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[11.5px]">
                  <span className="text-[#9A9890]">到廠日</span>
                  <span className="font-mono">{r.arrival_date ?? "—"}</span>
                </div>
                <div className="flex justify-between text-[11.5px]">
                  <span className="text-[#9A9890]">在庫天數</span>
                  <span className={"font-mono font-semibold " + daysToneClass(d)}>
                    {d === null ? "—" : `${d} 天`}
                  </span>
                </div>
              </div>
              <div className="mb-2">
                <div className="text-[15px] font-bold font-mono text-[#1A3A5C]">
                  {r.list_price != null ? `NT$ ${r.list_price.toLocaleString()}` : "—"}
                </div>
                {/* 整車成本 / 毛利 — 只主管可見（sales.cost.view）*/}
                {canViewCost && (
                  <div
                    className="mt-1 text-[11px] text-[#9A9890]"
                    data-testid={`cost-row-${r.id}`}
                  >
                    {isPdi ? (
                      <span className="text-[#534AB7]">整車成本計算中（PDI 未完成）</span>
                    ) : r.total_cost != null && r.total_cost > 0 ? (
                      <>
                        整車成本：
                        <span className="font-mono text-[#5A5955]">NT$ {r.total_cost.toLocaleString()}</span>
                        {margin != null && (
                          <>
                            {"　毛利空間："}
                            <span className="font-mono font-semibold text-[#0F6E56]">
                              NT$ {margin.toLocaleString()}
                            </span>
                          </>
                        )}
                      </>
                    ) : (
                      <span>整車成本待確認</span>
                    )}
                  </div>
                )}
                {canViewCost && (
                  <div className="mt-0.5 flex items-center gap-1 flex-wrap">
                    <span
                      className={"text-[11px] px-1.5 py-0.5 rounded font-semibold " + profitChipClass(rate)}
                      data-testid={`profit-chip-${r.id}`}
                    >
                      利潤 {rate === null ? "—" : `${rate}%`}
                    </span>
                  </div>
                )}
              </div>
              {r.note && (
                <div className="text-[10.5px] text-[#854F0B] mb-2">📌 {r.note}</div>
              )}
              <div className="flex gap-1.5">
                {onEdit && (
                  <button
                    onClick={() => onEdit(r)}
                    className="flex-1 h-[28px] rounded text-[11.5px] font-semibold bg-white border border-[#D5D3CB] text-[#4A4A48] hover:bg-[#F4F3F0]"
                    data-testid={`btn-edit-${r.id}`}
                  >
                    {isPdi ? "PDI 工單" : "評估 / 編輯"}
                  </button>
                )}
                {canQuote ? (
                  <Link
                    href={`/sales/showroom/new-cars/${r.id}`}
                    className="flex-1 h-[28px] rounded text-[11.5px] font-semibold bg-[#1A3A5C] text-white hover:bg-[#142E4A] inline-flex items-center justify-center"
                    data-testid={`btn-quote-${r.id}`}
                  >
                    配車報價
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="flex-1 h-[28px] rounded text-[11.5px] font-semibold bg-[#F4F3F0] border border-[#D5D3CB] text-[#B0AEA8] cursor-not-allowed"
                    data-testid={`btn-quote-locked-${r.id}`}
                    title={isPdi ? "PDI 完成後才可配車報價" : "此狀態不可報價"}
                  >
                    {isPdi ? "PDI 中暫不可售" : statusLabel}
                  </button>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
