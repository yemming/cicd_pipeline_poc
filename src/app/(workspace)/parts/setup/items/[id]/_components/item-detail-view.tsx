"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createItemAction,
  deleteItemAction,
  setItemActiveAction,
  updateItemAction,
  type ItemInput,
} from "@/lib/parts-setup/item-actions";
import { createDictionaryAction } from "@/lib/parts-setup/dictionary-actions";
import { createSupplierAction } from "@/lib/parts-setup/supplier-actions";
import { QuickAddSelect } from "@/components/quick-add-select";

import { ItemImageUploader } from "./item-image-uploader";
import { PrintLabelModal } from "./print-label-modal";

export type DetailItem = {
  id: string;
  code: string;
  name: string;
  name_en: string | null;
  spec_description: string | null;
  category: string | null;
  control_type: string | null;
  base_uom: string | null;
  standard_cost: number | null;
  suggested_price: number | null;
  warranty_months: number | null;
  shelf_life_months: number | null;
  default_supplier_id: string | null;
  serial_tracking_required: boolean;
  batch_tracking_required: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
  gl_inventory_account_id: string | null;
  gl_cogs_account_id: string | null;
  gl_revenue_account_id: string | null;
  external_source: string | null;
  external_id: string | null;
  weight_kg: number | null;
  volume_cm3: number | null;
  image_url: string | null;
  image_display_height: number | null;
};

export type StockLot = {
  warehouse_id: string;
  qty: number;
  unit_cost: number;
  serial_no: string | null;
  batch_no: string | null;
  status: string;
  last_movement_at: string;
  warranty_start: string | null;
  warranty_end: string | null;
};

export type WarehouseRef = { id: string; code: string; name: string };
export type FitmentRow = {
  motorcycle_model_id: string;
  year_start: number | null;
  year_end: number | null;
  is_verified: boolean;
};
export type ModelRef = { id: string; name: string };
export type SupplierRef = { id: string; code: string; name: string };
export type ControlLevelOption = { code: string; label: string; accent: string | null };
export type WorkOrderLine = {
  id: string;
  work_order_id: string;
  line_no: number;
  kind: string;
  qty: number;
  unit_price: number;
  amount: number;
  is_warranty: boolean;
  created_at: string;
  work_orders: { ro_no: string; status: string; opened_at: string } | null;
};
export type StorePriceRow = {
  id: string;
  org_id: string;
  price: number;
  pricing_type: string | null;
  is_active: boolean;
  promo_start_date: string | null;
  promo_end_date: string | null;
  notes: string | null;
};
export type OrgRef = { id: string; code: string; name: string; type: string | null };

type Banner = { ok: boolean; msg: string } | null;

type TabKey =
  | "purchasing"
  | "inventory"
  | "sales"
  | "accounting"
  | "revenue"
  | "webstore"
  | "related"
  | "communication"
  | "manufacture";

const TABS: { key: TabKey; label: string }[] = [
  { key: "purchasing", label: "採購" },
  { key: "inventory", label: "庫存" },
  { key: "sales", label: "銷售" },
  { key: "accounting", label: "會計" },
  { key: "revenue", label: "收入認列" },
  { key: "webstore", label: "網路商城" },
  { key: "related", label: "關聯單據" },
  { key: "communication", label: "溝通紀錄" },
  { key: "manufacture", label: "製造管理" },
];

function fmtNT(n: number | null | undefined, frac = 0): string {
  if (n == null) return "—";
  return `NT$ ${Number(n).toLocaleString("en-US", { maximumFractionDigits: frac })}`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return "—";
  }
}

function accentChip(accent: string | null | undefined): string {
  switch (accent) {
    case "red":
      return "bg-[#FDECEA] text-[#CC0000]";
    case "amber":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "teal":
      return "bg-[#E8F5F0] text-[#0F6E56]";
    case "blue":
      return "bg-[#EAF4FB] text-[#185FA5]";
    case "navy":
      return "bg-[#EBF3FF] text-[#1A3A5C]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

export function ItemDetailView({
  item,
  stocks: stocksProp,
  warehouses,
  fitments: fitmentsProp,
  supplier,
  allSuppliers,
  models,
  categories,
  uoms,
  controlLevels,
  woLines: woLinesProp,
  storePrices: storePricesProp,
  orgs,
  canEdit,
}: {
  item: DetailItem;
  stocks: StockLot[];
  warehouses: WarehouseRef[];
  fitments: FitmentRow[];
  supplier: SupplierRef | null;
  allSuppliers: SupplierRef[];
  models: ModelRef[];
  categories: string[];
  uoms: string[];
  controlLevels: ControlLevelOption[];
  woLines: WorkOrderLine[];
  storePrices: StorePriceRow[];
  orgs: OrgRef[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [insightOpen, setInsightOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const blankCreate = (): ItemInput => ({
    code: "",
    name: "",
    spec_description: "",
    category: "",
    control_type: "",
    base_uom: uoms[0] ?? "個",
    standard_cost: null,
    suggested_price: null,
    default_supplier_id: null,
    serial_tracking_required: false,
    batch_tracking_required: false,
    is_active: true,
  });
  const [createDraft, setCreateDraft] = useState<ItemInput>(blankCreate());
  const [activeTab, setActiveTab] = useState<TabKey>("purchasing");

  // 在「新增模式」時，相關附屬資料（庫存批次、工單、適配車型、門市定價）一律當成空的，
  // 避免上一個商品的資料殘留在頁面上。
  const stocks = creating ? [] : stocksProp;
  const fitments = creating ? [] : fitmentsProp;
  const woLines = creating ? [] : woLinesProp;
  const storePrices = creating ? [] : storePricesProp;

  const fromItem = (i: DetailItem): ItemInput => ({
    code: i.code,
    name: i.name,
    spec_description: i.spec_description ?? "",
    category: i.category ?? "",
    control_type: i.control_type ?? "",
    base_uom: i.base_uom ?? "個",
    standard_cost: i.standard_cost,
    suggested_price: i.suggested_price,
    default_supplier_id: i.default_supplier_id,
    serial_tracking_required: i.serial_tracking_required,
    batch_tracking_required: i.batch_tracking_required,
    image_url: i.image_url ?? "",
    is_active: i.is_active,
  });
  const [draft, setDraft] = useState<ItemInput>(fromItem(item));

  // 統一給 JSX 使用的旗標 / draft：editing 與 creating 任一打開就顯示輸入框，
  // 寫回時依模式選擇 createDraft/draft。
  const showInputs = editing || creating;
  const formDraft: ItemInput = creating ? createDraft : draft;
  const setFormDraft = (next: ItemInput) => {
    if (creating) setCreateDraft(next);
    else setDraft(next);
  };

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const save = () => {
    startTransition(async () => {
      const res = await updateItemAction(item.id, draft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存變更" });
        setEditing(false);
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const cancelEdit = () => {
    setDraft(fromItem(item));
    setEditing(false);
  };

  const toggleActive = () => {
    startTransition(async () => {
      const res = await setItemActiveAction(item.id, !item.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: item.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const openCreate = () => {
    setEditing(false);
    setCreateDraft(blankCreate());
    setCreating(true);
  };

  const cancelCreate = () => {
    setCreating(false);
  };

  const submitCreate = () => {
    startTransition(async () => {
      const res = await createItemAction(createDraft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已新增料號，跳轉到新商品" });
        setCreating(false);
        router.push(`/parts/setup/items/${res.data.id}`);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const remove = () => {
    if (
      !confirm(
        `確定刪除「${item.code} ${item.name}」？\n此動作會永久移除商品主檔，且僅在無庫存批次/適配/工單引用時才會成功。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteItemAction(item.id);
      if (res.ok) {
        router.push("/parts/setup/items");
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const printLabel = () => setPrintOpen(true);

  const item360 = () => {
    setActiveTab("related");
    document.querySelector("#tab-content")?.scrollIntoView({ behavior: "smooth", block: "start" });
    showBanner({
      ok: true,
      msg: `商品 360：當前 ${stocks.length} 批庫存・${woLines.length} 筆工單・${fitments.length} 筆適配・${storePrices.length} 筆門市價`,
    });
  };

  // Aggregations for tabs
  const whMap = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);
  const orgMap = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);
  const modelMap = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const supplierMap = useMemo(
    () => new Map(allSuppliers.map((s) => [s.id, s])),
    [allSuppliers],
  );
  const controlAccent = controlLevels.find((c) => c.code === item.control_type)?.accent ?? null;
  const controlLabel =
    controlLevels.find((c) => c.code === item.control_type)?.label ?? item.control_type ?? null;

  const stockByWh = useMemo(() => {
    const m = new Map<string, { qty: number; lots: number; latest: string }>();
    let total = 0;
    for (const s of stocks) {
      const cur = m.get(s.warehouse_id) ?? { qty: 0, lots: 0, latest: s.last_movement_at };
      cur.qty += Number(s.qty) || 0;
      cur.lots += 1;
      if (s.last_movement_at > cur.latest) cur.latest = s.last_movement_at;
      m.set(s.warehouse_id, cur);
      total += Number(s.qty) || 0;
    }
    return { byWh: m, total };
  }, [stocks]);

  const costRollup = useMemo(() => {
    let weightedSum = 0;
    let weightedQty = 0;
    for (const s of stocks) {
      const q = Number(s.qty) || 0;
      const c = Number(s.unit_cost) || 0;
      if (q > 0) {
        weightedSum += q * c;
        weightedQty += q;
      }
    }
    const movingAvg = weightedQty > 0 ? weightedSum / weightedQty : null;
    const latestCost = stocks[0] ? Number(stocks[0].unit_cost) : null;
    const stdCost = item.standard_cost;
    const variance =
      stdCost && movingAvg ? ((movingAvg - stdCost) / stdCost) * 100 : null;
    return { movingAvg, latestCost, stdCost, variance, weightedQty, lots: stocks.filter((s) => s.qty > 0).length };
  }, [stocks, item.standard_cost]);

  const traceableLots = stocks.filter((s) => s.serial_no || s.batch_no).slice(0, 30);

  // Recent purchase history — proxy from stock_items rows with positive qty (incoming)
  const recentInbound = stocks.slice(0, 10);

  // Render helpers
  const sectionCard = (title: string, body: React.ReactNode) => (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
      </header>
      <div className="px-4 py-3">{body}</div>
    </section>
  );

  const inputClass =
    "h-[28px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] w-full";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb (left) + CRUD pill bar (right) on the SAME top row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/setup/items" className="hover:text-[#185FA5]">商品基礎資料</Link>
          <span>›</span>
          <span className={`text-[#5A5955] ${creating ? "" : "font-mono"}`}>
            {creating ? "新增商品" : item.code}
          </span>
          {editing ? (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-[#FDF3E3] text-[#854F0B] text-[11px]">編輯模式</span>
          ) : creating ? (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-[#FDF3E3] text-[#854F0B] text-[11px]">建立模式</span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {editing ? (
            <>
              <button type="button" onClick={save} disabled={isPending || !canEdit} className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60">
                {isPending ? "儲存中…" : "儲存變更"}
              </button>
              <button type="button" onClick={cancelEdit} className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] shadow-sm hover:border-[#9A9890]">
                取消
              </button>
            </>
          ) : creating ? (
            <>
              <button type="button" onClick={cancelCreate} disabled={isPending} className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] shadow-sm hover:border-[#9A9890] disabled:opacity-60">
                取消
              </button>
              <button type="button" onClick={submitCreate} disabled={isPending || !canEdit} className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60">
                {isPending ? "建立中…" : "建立並開啟"}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/parts/setup/items"
                className="h-[30px] inline-flex items-center justify-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <button
                type="button"
                disabled={!canEdit}
                onClick={openCreate}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                新增
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setEditing(true)}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={remove}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                刪除
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={toggleActive}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                {item.is_active ? "停用" : "啟用"}
              </button>
            </>
          )}
        </div>
      </div>

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]" : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* Title card — title+report left, image right (wide rectangle) */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          {/* Left column: title block + report buttons stacked */}
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">商品主檔（庫存品）</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {creating ? "（未命名商品）" : item.name}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                {creating ? (
                  <>
                    <span className="text-[#9A9890]">—</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDF3E3] text-[#854F0B]">尚未建立</span>
                  </>
                ) : (
                  <>
                    <span className="font-mono text-[#5A5955]">{item.code}</span>
                    {item.control_type ? (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${accentChip(controlAccent)}`}>
                        {controlLabel}
                      </span>
                    ) : null}
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${item.is_active ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#F2F2F2] text-[#6B6A68]"}`}>
                      {item.is_active ? "啟用" : "停用"}
                    </span>
                    {item.category ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">{item.category}</span>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            {!editing && !creating ? (
              <div className="mt-auto flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setSnapshotOpen(true)}
                  className="h-[26px] px-3 rounded-full text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm"
                >
                  供應鏈總覽
                </button>
                <button
                  type="button"
                  onClick={() => setInsightOpen(true)}
                  className="h-[26px] px-3 rounded-full text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
                >
                  產生洞察分析
                </button>
                <button
                  type="button"
                  onClick={printLabel}
                  className="h-[26px] px-3 rounded-full text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
                >
                  列印標籤
                </button>
                <button
                  type="button"
                  onClick={item360}
                  className="h-[26px] px-3 rounded-full text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
                >
                  商品 360 儀表板
                </button>
              </div>
            ) : null}
          </div>

          {/* Right column: wide-rectangle image (resizable) */}
          <div className="shrink-0">
            {creating ? (
              <div className="w-[260px] h-[120px] border-2 border-dashed border-[#D5D3CB] rounded-lg bg-[#F8F7F4] flex items-center justify-center text-[12px] text-[#9A9890]">
                建立後可上傳圖片
              </div>
            ) : (
              <ItemImageUploader
                itemId={item.id}
                imageUrl={item.image_url}
                alt={item.name}
                canEdit={canEdit}
                width={260}
                height={120}
              />
            )}
          </div>
        </div>
      </header>

      {/* Primary Information */}
      <section className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${showInputs ? lockedClass : ""}`}>
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          {!creating ? (
            <Kv label="系統識別碼" value={<span className="font-mono">{item.id.slice(0, 8)}</span>} />
          ) : null}
          <Kv
            label="料號 / 編號"
            value={
              showInputs ? (
                <input value={formDraft.code} onChange={(e) => setFormDraft({ ...formDraft, code: e.target.value })} placeholder="例：DUC-OIL-002" className={inputClass} />
              ) : (
                <span className="font-mono font-semibold">{item.code}</span>
              )
            }
          />
          <Kv
            label="顯示名稱"
            value={
              showInputs ? (
                <input value={formDraft.name} onChange={(e) => setFormDraft({ ...formDraft, name: e.target.value })} placeholder="例：機油濾清器" className={inputClass} />
              ) : (
                <span className="font-medium">{item.name}</span>
              )
            }
          />
          {!creating ? (
            <Kv label="條碼（UPC）" value={item.external_id ?? "—"} mono />
          ) : null}
          <Kv
            label="規格 / 描述"
            value={
              showInputs ? (
                <input value={formDraft.spec_description ?? ""} onChange={(e) => setFormDraft({ ...formDraft, spec_description: e.target.value })} placeholder="例：適用全系列" className={inputClass} />
              ) : (
                item.spec_description ?? "—"
              )
            }
          />
          {!creating ? (
            <Kv label="英文品名" value={item.name_en ?? "—"} />
          ) : null}
          <Kv
            label="預設供應商"
            value={
              showInputs ? (
                <QuickAddSelect
                  value={formDraft.default_supplier_id ?? ""}
                  onChange={(v) => setFormDraft({ ...formDraft, default_supplier_id: v || null })}
                  options={allSuppliers.map((s) => ({ value: s.id, label: `${s.code} ${s.name}` }))}
                  inputClass={inputClass}
                  panelTitle="新增供應商"
                  fields={[
                    { key: "code", label: "代碼", required: true, placeholder: "例：SUP-NEW-001" },
                    { key: "name", label: "供應商名稱", required: true, placeholder: "例：金門機車零件商行" },
                  ]}
                  onCreate={async (d) => {
                    const res = await createSupplierAction({
                      code: d.code,
                      name: d.name,
                      is_active: true,
                    });
                    if (res.ok) return { ok: true, value: res.data.id, label: `${d.code.toUpperCase()} ${d.name}` };
                    return { ok: false, error: res.error };
                  }}
                />
              ) : supplier ? (
                <div>
                  <div className="font-medium">{supplier.name}</div>
                  <div className="font-mono text-[11px] text-[#9A9890]">{supplier.code}</div>
                </div>
              ) : "—"
            }
          />
          <Kv
            label="主要單位"
            value={
              showInputs ? (
                <QuickAddSelect
                  value={formDraft.base_uom ?? ""}
                  onChange={(v) => setFormDraft({ ...formDraft, base_uom: v })}
                  options={uoms.map((u) => ({ value: u, label: u }))}
                  inputClass={inputClass}
                  placeholder="—"
                  panelTitle="新增單位"
                  fields={[
                    { key: "label", label: "單位名稱", required: true, placeholder: "例：盒、箱、卷" },
                  ]}
                  onCreate={async (d) => {
                    const v = d.label.trim();
                    if (!v) return { ok: false, error: "單位名稱必填" };
                    const res = await createDictionaryAction({
                      kind: "uom",
                      code: v,
                      label: v,
                      sort_order: 99,
                      is_active: true,
                    });
                    if (res.ok) return { ok: true, value: v, label: v };
                    return { ok: false, error: res.error };
                  }}
                />
              ) : (
                item.base_uom ?? "—"
              )
            }
          />
          {!creating ? (
            <>
              <Kv label="資料來源" value={item.external_source ? <span className="font-mono text-[11px]">{item.external_source}</span> : "—"} />
              <Kv
                label="商品圖片"
                value={
                  item.image_url ? (
                    <a href={item.image_url} target="_blank" rel="noopener noreferrer" className="text-[#185FA5] hover:underline text-[11.5px] font-mono truncate inline-block max-w-[280px] align-middle" title={item.image_url}>
                      {item.image_url.split("/").pop()}
                    </a>
                  ) : <span className="text-[#9A9890] text-[11.5px]">尚未上傳・點右上圖片框上傳</span>
                }
                small
              />
            </>
          ) : null}
        </div>
      </section>

      {/* Classification */}
      <section className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${showInputs ? lockedClass : ""}`}>
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 分類設定</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="品類"
            value={
              showInputs ? (
                <QuickAddSelect
                  value={formDraft.category ?? ""}
                  onChange={(v) => setFormDraft({ ...formDraft, category: v })}
                  options={categories.map((c) => ({ value: c, label: c }))}
                  inputClass={inputClass}
                  panelTitle="新增品類"
                  fields={[{ key: "label", label: "品類名稱", required: true, placeholder: "例：工具、配件、油品" }]}
                  onCreate={async (d) => {
                    const v = d.label.trim();
                    if (!v) return { ok: false, error: "品類名稱必填" };
                    const res = await createDictionaryAction({ kind: "category", code: v, label: v, sort_order: 99, is_active: true });
                    if (res.ok) return { ok: true, value: v, label: v };
                    return { ok: false, error: res.error };
                  }}
                />
              ) : (
                item.category ?? "—"
              )
            }
          />
          <Kv
            label="管控等級"
            value={
              showInputs ? (
                <QuickAddSelect
                  value={formDraft.control_type ?? ""}
                  onChange={(v) => setFormDraft({ ...formDraft, control_type: v })}
                  options={controlLevels.map((c) => ({ value: c.code, label: c.label }))}
                  inputClass={inputClass}
                  panelTitle="新增管控等級"
                  fields={[
                    { key: "code", label: "代碼", required: true, placeholder: "例：D" },
                    { key: "label", label: "顯示名稱", required: true, placeholder: "例：D類" },
                  ]}
                  onCreate={async (d) => {
                    const code = d.code.trim();
                    const label = d.label.trim();
                    if (!code || !label) return { ok: false, error: "代碼與顯示名稱必填" };
                    const res = await createDictionaryAction({ kind: "control_level", code, label, sort_order: 99, is_active: true });
                    if (res.ok) return { ok: true, value: code, label };
                    return { ok: false, error: res.error };
                  }}
                />
              ) : (
                controlLabel ?? "—"
              )
            }
          />
          <Kv
            label="狀態"
            value={
              showInputs ? (
                <label className="inline-flex items-center gap-1.5 text-[12.5px]">
                  <input type="checkbox" checked={formDraft.is_active ?? true} onChange={(e) => setFormDraft({ ...formDraft, is_active: e.target.checked })} />
                  啟用
                </label>
              ) : item.is_active ? "啟用中" : "已停用"
            }
          />
          <Kv
            label="追蹤模式"
            value={
              showInputs ? (
                <div className="flex gap-3 text-[12.5px]">
                  <label className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={formDraft.serial_tracking_required ?? false} onChange={(e) => setFormDraft({ ...formDraft, serial_tracking_required: e.target.checked })} />
                    序列號
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={formDraft.batch_tracking_required ?? false} onChange={(e) => setFormDraft({ ...formDraft, batch_tracking_required: e.target.checked })} />
                    批號
                  </label>
                </div>
              ) : (
                <div className="flex gap-1">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${item.serial_tracking_required ? "bg-[#EAF4FB] text-[#185FA5]" : "bg-[#F2F2F2] text-[#9A9890]"}`}>
                    序列號 {item.serial_tracking_required ? "✓" : "✗"}
                  </span>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${item.batch_tracking_required ? "bg-[#EAF4FB] text-[#185FA5]" : "bg-[#F2F2F2] text-[#9A9890]"}`}>
                    批號 {item.batch_tracking_required ? "✓" : "✗"}
                  </span>
                </div>
              )
            }
          />
          {!creating ? (
            <>
              <Kv label="建立時間" value={fmtDateTime(item.created_at)} mono small />
              <Kv label="最後更新" value={fmtDateTime(item.updated_at)} mono small />
            </>
          ) : null}
        </div>
      </section>

      {creating ? (
        <p className="text-[12px] text-[#9A9890] leading-relaxed">
          建立後將跳轉到該商品的詳情頁，可進一步維護圖片、適配車型、門市定價、會計科目等資訊。
        </p>
      ) : null}

      {/* Tabs row（只在檢視/編輯既有商品時顯示） */}
      {!creating ? (
      <>
      <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto" id="tab-content">
        <div className="flex border-b border-[#EEECE6]">
          {TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] last:border-r-0 ${
                  active
                    ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                    : "text-[#5A5955] hover:bg-[#F8F7F4]"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
        {activeTab === "purchasing" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sectionCard("採購主檔", (
              <>
                <Kv
                  label="標準成本"
                  value={
                    showInputs ? (
                      <input type="number" value={formDraft.standard_cost ?? ""} onChange={(e) => setFormDraft({ ...formDraft, standard_cost: e.target.value ? Number(e.target.value) : null })} className={inputClass} />
                    ) : fmtNT(item.standard_cost)
                  }
                  mono={!showInputs}
                />
                <Kv label="最近採購成本" value={fmtNT(costRollup.latestCost)} mono />
                <Kv label="移動加權平均" value={costRollup.movingAvg != null ? `NT$ ${costRollup.movingAvg.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"} mono />
                <Kv
                  label="預設供應商"
                  value={supplier ? `${supplier.code} ・ ${supplier.name}` : "—"}
                />
                <Kv label="保固月數" value={item.warranty_months ? `${item.warranty_months} 個月` : "—"} small />
                <Kv label="保存月數" value={item.shelf_life_months ? `${item.shelf_life_months} 個月` : "—"} small />
              </>
            ))}
            {sectionCard(`最近進貨紀錄（${recentInbound.length}）`, (
              recentInbound.length === 0 ? (
                <div className="text-[12px] text-[#9A9890] py-2">尚無進貨紀錄</div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[11px] text-[#9A9890]">
                      <th className="text-left font-medium py-1">日期</th>
                      <th className="text-left font-medium py-1">倉庫</th>
                      <th className="text-right font-medium py-1">數量</th>
                      <th className="text-right font-medium py-1">單價</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentInbound.map((s, i) => (
                      <tr key={i} className="border-t border-[#F8F7F4]">
                        <td className="py-1.5 font-mono text-[11.5px]">{fmtDate(s.last_movement_at)}</td>
                        <td className="py-1.5 text-[11.5px]">{whMap.get(s.warehouse_id)?.code ?? "—"}</td>
                        <td className="py-1.5 text-right font-mono">{Number(s.qty).toLocaleString("en-US")}</td>
                        <td className="py-1.5 text-right font-mono">{fmtNT(Number(s.unit_cost))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ))}
          </div>
        ) : null}

        {activeTab === "inventory" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sectionCard(`各倉庫庫存（合計 ${stockByWh.total.toLocaleString("en-US")} ${item.base_uom ?? ""}）`, (
              stockByWh.byWh.size === 0 ? (
                <div className="text-[12px] text-[#9A9890] py-2">尚無庫存紀錄</div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[11px] text-[#9A9890]">
                      <th className="text-left font-medium py-1">倉庫</th>
                      <th className="text-right font-medium py-1">數量</th>
                      <th className="text-right font-medium py-1">批次</th>
                      <th className="text-left font-medium py-1">最近異動</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(stockByWh.byWh.entries()).map(([wid, row]) => {
                      const wh = whMap.get(wid);
                      return (
                        <tr key={wid} className="border-t border-[#F8F7F4]">
                          <td className="py-1.5">
                            <div className="font-mono text-[11.5px]">{wh?.code ?? wid.slice(0, 8)}</div>
                            <div className="text-[11px] text-[#9A9890]">{wh?.name ?? "—"}</div>
                          </td>
                          <td className="py-1.5 text-right font-mono">{row.qty.toLocaleString("en-US")}</td>
                          <td className="py-1.5 text-right font-mono text-[#9A9890]">{row.lots}</td>
                          <td className="py-1.5 font-mono text-[11px] text-[#5A5955]">{fmtDate(row.latest)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            ))}
            {sectionCard(`序批號追蹤（${traceableLots.length}）`, (
              !item.serial_tracking_required && !item.batch_tracking_required ? (
                <div className="text-[12px] text-[#9A9890] py-2">未開啟序列號/批號追蹤</div>
              ) : traceableLots.length === 0 ? (
                <div className="text-[12px] text-[#9A9890] py-2">尚無序批號紀錄</div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[11px] text-[#9A9890]">
                      <th className="text-left font-medium py-1">序列/批號</th>
                      <th className="text-left font-medium py-1">倉庫</th>
                      <th className="text-right font-medium py-1">數量</th>
                      <th className="text-left font-medium py-1">保固迄</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traceableLots.map((s, i) => (
                      <tr key={i} className="border-t border-[#F8F7F4]">
                        <td className="py-1.5 font-mono text-[11px]">{s.serial_no ?? s.batch_no ?? "—"}</td>
                        <td className="py-1.5 text-[11.5px]">{whMap.get(s.warehouse_id)?.code ?? "—"}</td>
                        <td className="py-1.5 text-right font-mono">{Number(s.qty).toLocaleString("en-US")}</td>
                        <td className="py-1.5 text-[11px]">{fmtDate(s.warranty_end)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ))}
          </div>
        ) : null}

        {activeTab === "sales" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sectionCard("售價設定", (
              <>
                <Kv
                  label="建議售價"
                  value={
                    showInputs ? (
                      <input type="number" value={formDraft.suggested_price ?? ""} onChange={(e) => setFormDraft({ ...formDraft, suggested_price: e.target.value ? Number(e.target.value) : null })} className={inputClass} />
                    ) : fmtNT(item.suggested_price)
                  }
                  mono={!showInputs}
                />
                <Kv
                  label="預估毛利 vs 標準成本"
                  value={
                    item.suggested_price && item.standard_cost
                      ? `${(((item.suggested_price - item.standard_cost) / item.suggested_price) * 100).toFixed(1)}%`
                      : "—"
                  }
                  mono
                />
                <Kv label="保固月數" value={item.warranty_months ? `${item.warranty_months} 個月` : "—"} small />
              </>
            ))}
            {sectionCard(`門市定價（${storePrices.length}）`, (
              storePrices.length === 0 ? (
                <div className="text-[12px] text-[#9A9890] py-2">尚未設定門市定價</div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[11px] text-[#9A9890]">
                      <th className="text-left font-medium py-1">門市</th>
                      <th className="text-left font-medium py-1">類型</th>
                      <th className="text-right font-medium py-1">售價</th>
                      <th className="text-left font-medium py-1">狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storePrices.map((p) => (
                      <tr key={p.id} className="border-t border-[#F8F7F4]">
                        <td className="py-1.5">
                          <div className="font-mono text-[11.5px]">{orgMap.get(p.org_id)?.code ?? p.org_id.slice(0, 8)}</div>
                          <div className="text-[11px] text-[#9A9890]">{orgMap.get(p.org_id)?.name ?? "—"}</div>
                        </td>
                        <td className="py-1.5 text-[11.5px]">{p.pricing_type ?? "—"}</td>
                        <td className="py-1.5 text-right font-mono">{fmtNT(Number(p.price))}</td>
                        <td className="py-1.5 text-[11px]">
                          <span className={`inline-flex items-center px-1.5 rounded-md text-[10.5px] ${p.is_active ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#F2F2F2] text-[#6B6A68]"}`}>
                            {p.is_active ? "啟用" : "停用"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ))}
            {sectionCard(`適配車型（${fitments.length}）`, (
              fitments.length === 0 ? (
                <div className="text-[12px] text-[#9A9890] py-2">未綁定任何車型</div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {fitments.map((f, i) => {
                    const m = modelMap.get(f.motorcycle_model_id);
                    const yr = f.year_start && f.year_end ? `${f.year_start}-${f.year_end}` : f.year_start ? `${f.year_start}+` : "";
                    return (
                      <span key={i} className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${f.is_verified ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#FDF3E3] text-[#854F0B]"}`}>
                        {m?.name ?? f.motorcycle_model_id.slice(0, 8)}{yr ? ` ${yr}` : ""}
                      </span>
                    );
                  })}
                </div>
              )
            ))}
          </div>
        ) : null}

        {activeTab === "accounting" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sectionCard("成本明細", (
              <>
                <Kv
                  label="成本計算方式"
                  value="移動加權平均"
                  small
                />
                <Kv label="標準成本" value={fmtNT(costRollup.stdCost)} mono />
                <Kv label="移動加權平均" value={costRollup.movingAvg != null ? `NT$ ${costRollup.movingAvg.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"} mono />
                <Kv label="最新成本" value={fmtNT(costRollup.latestCost)} mono />
                <Kv
                  label="標準與平均差異"
                  value={
                    costRollup.variance == null ? "—" : (
                      <span className={`font-mono ${costRollup.variance > 5 ? "text-[#CC0000]" : costRollup.variance < -5 ? "text-[#3B6D11]" : "text-[#5A5955]"}`}>
                        {costRollup.variance > 0 ? "+" : ""}{costRollup.variance.toFixed(1)}%
                      </span>
                    )
                  }
                />
                <Kv label="計算基礎" value={`${costRollup.lots} 個有量批次・合計 ${costRollup.weightedQty.toLocaleString("en-US")} ${item.base_uom ?? ""}`} small />
              </>
            ))}
            {sectionCard("總帳會計科目", (
              <>
                <Kv label="存貨科目" value={item.gl_inventory_account_id ? <span className="font-mono text-[11px]">{item.gl_inventory_account_id.slice(0, 12)}…</span> : "—"} />
                <Kv label="銷售成本科目" value={item.gl_cogs_account_id ? <span className="font-mono text-[11px]">{item.gl_cogs_account_id.slice(0, 12)}…</span> : "—"} />
                <Kv label="收入認列科目" value={item.gl_revenue_account_id ? <span className="font-mono text-[11px]">{item.gl_revenue_account_id.slice(0, 12)}…</span> : "—"} />
                <Kv label="重量（公斤）" value={item.weight_kg != null ? Number(item.weight_kg).toLocaleString("en-US") : "—"} small />
                <Kv label="體積（立方公分）" value={item.volume_cm3 != null ? Number(item.volume_cm3).toLocaleString("en-US") : "—"} small />
              </>
            ))}
          </div>
        ) : null}

        {activeTab === "revenue" ? (
          <Placeholder
            title="收入認列與攤銷"
            note="收入認列、分期攤銷規則尚未啟用此模組。可規劃：認列計畫、攤銷期數、認列起始事件（出貨／驗收／週期）。"
          />
        ) : null}

        {activeTab === "webstore" ? (
          <Placeholder
            title="網路商城"
            note="電商上架欄位尚未啟用。規劃中：商品圖片、SEO 描述、特色商品旗標、上架／下架時間、官網類別對應。"
          />
        ) : null}

        {activeTab === "related" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <RelatedSummary label="工單明細引用" count={woLines.length} />
              <RelatedSummary label="庫存批次" count={stocks.length} />
              <RelatedSummary label="適配車型" count={fitments.length} />
            </div>
            {sectionCard(`維修工單明細（${woLines.length}）`, (
              woLines.length === 0 ? (
                <div className="text-[12px] text-[#9A9890] py-2">未在任何工單上出現</div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[11px] text-[#9A9890]">
                      <th className="text-left font-medium py-1">工單號</th>
                      <th className="text-left font-medium py-1">類型</th>
                      <th className="text-left font-medium py-1">狀態</th>
                      <th className="text-right font-medium py-1">數量</th>
                      <th className="text-right font-medium py-1">單價</th>
                      <th className="text-right font-medium py-1">小計</th>
                      <th className="text-left font-medium py-1">保固</th>
                      <th className="text-left font-medium py-1">日期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {woLines.map((l) => (
                      <tr key={l.id} className="border-t border-[#F8F7F4]">
                        <td className="py-1.5 font-mono text-[11.5px]">{l.work_orders?.ro_no ?? l.work_order_id.slice(0, 8)}</td>
                        <td className="py-1.5 text-[11.5px]">{l.kind}</td>
                        <td className="py-1.5 text-[11px]">
                          <span className="inline-flex items-center px-1.5 rounded bg-[#EEF4FB] text-[#185FA5]">{l.work_orders?.status ?? "—"}</span>
                        </td>
                        <td className="py-1.5 text-right font-mono">{Number(l.qty).toLocaleString("en-US")}</td>
                        <td className="py-1.5 text-right font-mono">{fmtNT(Number(l.unit_price))}</td>
                        <td className="py-1.5 text-right font-mono">{fmtNT(Number(l.amount))}</td>
                        <td className="py-1.5 text-[11px]">{l.is_warranty ? "✓" : "—"}</td>
                        <td className="py-1.5 font-mono text-[11px]">{fmtDate(l.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ))}
          </div>
        ) : null}

        {activeTab === "communication" ? (
          <Placeholder
            title="溝通紀錄"
            note="留言串、電子郵件、附件、變更日誌尚未啟用。規劃中：與此料號相關的內部討論、客服工單、附加文件。"
          />
        ) : null}

        {activeTab === "manufacture" ? (
          <Placeholder
            title="製造管理"
            note="製造模組尚未啟用。可規劃：用料表（BOM）、工序路線、外包加工、製令、組裝／拆解單。"
          />
        ) : null}
      </div>
      </>
      ) : null}

      {/* 供應鏈總覽 Modal */}
      {snapshotOpen ? (
        <Modal title="供應鏈總覽" onClose={() => setSnapshotOpen(false)}>
          <div className="grid grid-cols-2 gap-4 text-[12.5px]">
            <SnapStat label="目前總庫存" value={`${stockByWh.total.toLocaleString("en-US")} ${item.base_uom ?? ""}`} />
            <SnapStat label="批次數" value={stocks.length.toString()} />
            <SnapStat label="倉庫覆蓋" value={`${stockByWh.byWh.size} 倉`} />
            <SnapStat label="移動平均成本" value={costRollup.movingAvg != null ? `NT$ ${costRollup.movingAvg.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"} />
            <SnapStat label="標準與平均差異" value={costRollup.variance == null ? "—" : `${costRollup.variance > 0 ? "+" : ""}${costRollup.variance.toFixed(1)}%`} />
            <SnapStat label="預設供應商" value={supplier?.name ?? "—"} />
            <SnapStat label="工單引用筆數" value={`${woLines.length} 筆`} />
            <SnapStat label="適配車型款數" value={`${fitments.length} 款`} />
            <SnapStat label="門市定價條數" value={`${storePrices.length} 條`} />
            <SnapStat label="保固政策" value={item.warranty_months ? `${item.warranty_months} 個月` : "未設定"} />
          </div>
        </Modal>
      ) : null}


      {/* 列印標籤 Modal */}
      <PrintLabelModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        data={{
          code: item.code,
          name: item.name,
          spec_description: item.spec_description,
          category: item.category,
          control_type: item.control_type,
          base_uom: item.base_uom,
          suggested_price: item.suggested_price,
          supplier_name: supplier?.name ?? null,
        }}
      />

      {/* 產生洞察分析 Modal — placeholder */}
      {insightOpen ? (
        <Modal title="產生洞察分析" onClose={() => setInsightOpen(false)}>
          <div className="text-[12.5px] text-[#5A5955] leading-relaxed space-y-2">
            <p>此功能規劃中，未來將以 AI 分析此料號的：</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>過去 90／180 天的耗用速率與季節性</li>
              <li>缺料風險評分 + 建議補貨點</li>
              <li>呆滯風險 + 建議調撥／促銷對象門市</li>
              <li>適配車型保有量比對 → 預估需求</li>
              <li>替代料號建議（同分類／規格相近）</li>
            </ul>
            <p className="text-[11px] text-[#9A9890] mt-3">資料來源：庫存批次、工單明細、車型適配、車輛保有資料表</p>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

function Kv({
  label,
  value,
  bold,
  mono,
  small,
}: {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div
        className={`text-[12.5px] ${bold ? "font-semibold" : ""} ${mono ? "font-mono" : ""} ${
          small ? "text-[11.5px] text-[#5A5955]" : "text-[#2C2C2A]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function RelatedSummary({ label, count }: { label: string; count: number }) {
  return (
    <div className="border border-[#EEECE6] rounded-lg p-3 flex flex-col gap-1">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className="font-mono text-[20px] font-semibold text-[#1A3A5C]">{count.toLocaleString("en-US")}</div>
    </div>
  );
}

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="text-center py-10">
      <div className="text-[14px] font-semibold text-[#5A5955] mb-2">{title}</div>
      <div className="text-[12px] text-[#9A9890] max-w-md mx-auto leading-relaxed">{note}</div>
      <div className="mt-3 inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-[#FDF3E3] text-[#854F0B]">尚未啟用此模組</div>
    </div>
  );
}

function FormField({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1 ${full ? "col-span-2" : ""}`}>
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      {children}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-[#EEECE6] flex items-center">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">{title}</h2>
          <button type="button" onClick={onClose} className="ml-auto w-7 h-7 rounded hover:bg-[#F8F7F4] text-[#9A9890] text-[18px] leading-none">×</button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function SnapStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#EEECE6] rounded p-3">
      <div className="text-[11px] text-[#9A9890] mb-1">{label}</div>
      <div className="text-[14px] font-semibold text-[#2C2C2A]">{value}</div>
    </div>
  );
}
