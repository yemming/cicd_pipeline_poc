"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  bulkImportItemsAction,
  createItemAction,
  deleteItemAction,
  setItemActiveAction,
  updateItemAction,
  upsertPriceBookAction,
  type ItemInput,
  type PriceBookRow,
} from "@/lib/parts-setup/item-actions";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { parseXlsx } from "@/components/data-grid/excel-io";


export type ItemRow = {
  id: string;
  code: string;
  name: string;
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
  image_url: string | null;
  is_active: boolean;
  fit_count: number;
};

export type SupplierOption = { id: string; code: string; name: string };

export type ControlLevelOption = {
  code: string;
  label: string;
  accent: string | null;
};

export type ItemFilters = {
  category: string;
  control: string;
  status: string;
  q: string;
};

type Banner = { ok: boolean; msg: string } | null;

type FormMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; id: string };

function accentChipClass(accent: string | null | undefined): string {
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
    case "gray":
      return "bg-[#F2F2F2] text-[#6B6A68]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

function fmtNT(n: number | null): string {
  if (n == null) return "—";
  return `NT$ ${Number(n).toLocaleString("en-US")}`;
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function parseTSV(text: string): ItemInput[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(/\t|,/).map((h) => h.trim());
  const idx = (k: string) => header.findIndex((h) => h === k);
  const colCode = idx("料號") >= 0 ? idx("料號") : idx("code");
  const colName = idx("名稱") >= 0 ? idx("名稱") : idx("name");
  const colCat = idx("品類") >= 0 ? idx("品類") : idx("category");
  const colCtrl = idx("管控") >= 0 ? idx("管控") : idx("control_type");
  const colUom = idx("單位") >= 0 ? idx("單位") : idx("base_uom");
  const colCost = idx("標準成本") >= 0 ? idx("標準成本") : idx("standard_cost");
  const colPrice =
    idx("建議售價") >= 0 ? idx("建議售價") : idx("suggested_price");
  const colSpec = idx("規格") >= 0 ? idx("規格") : idx("spec_description");
  const out: ItemInput[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(/\t|,/).map((c) => c.trim());
    const code = colCode >= 0 ? cells[colCode] : cells[0];
    const name = colName >= 0 ? cells[colName] : cells[1];
    if (!code || !name) continue;
    out.push({
      code,
      name,
      category: colCat >= 0 ? cells[colCat] : undefined,
      control_type: colCtrl >= 0 ? cells[colCtrl] : undefined,
      base_uom: colUom >= 0 ? cells[colUom] : undefined,
      standard_cost: colCost >= 0 && cells[colCost] ? Number(cells[colCost]) : null,
      suggested_price:
        colPrice >= 0 && cells[colPrice] ? Number(cells[colPrice]) : null,
      spec_description: colSpec >= 0 ? cells[colSpec] : undefined,
    });
  }
  return out;
}

const blankInput = (uom: string): ItemInput => ({
  code: "",
  name: "",
  spec_description: "",
  category: "",
  control_type: "",
  base_uom: uom,
  standard_cost: null,
  suggested_price: null,
  default_supplier_id: null,
  serial_tracking_required: false,
  batch_tracking_required: false,
  is_active: true,
});

const fromRow = (r: ItemRow): ItemInput => ({
  code: r.code,
  name: r.name,
  spec_description: r.spec_description ?? "",
  category: r.category ?? "",
  control_type: r.control_type ?? "",
  base_uom: r.base_uom ?? "個",
  standard_cost: r.standard_cost,
  suggested_price: r.suggested_price,
  default_supplier_id: r.default_supplier_id,
  serial_tracking_required: r.serial_tracking_required,
  batch_tracking_required: r.batch_tracking_required,
  is_active: r.is_active,
});

export function ItemsBoard({
  rows,
  suppliers,
  canEdit,
  totalCount,
  categories,
  uoms,
  controlLevels,
  filters,
  autoOpenCreate = false,
}: {
  rows: ItemRow[];
  suppliers: SupplierOption[];
  canEdit: boolean;
  totalCount: number;
  categories: string[];
  uoms: string[];
  controlLevels: ControlLevelOption[];
  filters: ItemFilters;
  autoOpenCreate?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  // Unified form state — used for both 新增 and 編輯
  const [formMode, setFormMode] = useState<FormMode>({ kind: "closed" });
  const [formDraft, setFormDraft] = useState<ItemInput>(blankInput("個"));

  // Auto-open create modal when arriving with ?new=1 (from detail page 新增 button),
  // then strip the param so refresh doesn't keep re-opening it.
  useEffect(() => {
    if (autoOpenCreate && formMode.kind === "closed") {
      setFormDraft(blankInput(uoms[0] ?? "個"));
      setFormMode({ kind: "create" });
      router.replace("/parts/setup/items");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenCreate]);

  // Bulk import
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  // Price Book import
  const [showPriceBook, setShowPriceBook] = useState(false);
  const [priceBookFile, setPriceBookFile] = useState<File | null>(null);
  const [priceBookResult, setPriceBookResult] = useState<{
    created: number;
    updated: number;
    errors: string[];
  } | null>(null);
  const [priceBookErrorsExpanded, setPriceBookErrorsExpanded] = useState(false);

  // Filters (local until 查詢)
  const [fCategory, setFCategory] = useState(filters.category);
  const [fControl, setFControl] = useState(filters.control);
  const [fStatus, setFStatus] = useState(filters.status);
  const [fQ, setFQ] = useState(filters.q);

  const supplierMap = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s])),
    [suppliers],
  );
  const allCategories = useMemo(() => categories, [categories]);
  const allUoms = useMemo(() => (uoms.length ? uoms : ["個"]), [uoms]);
  const controlAccentMap = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const c of controlLevels) m.set(c.code, c.accent);
    return m;
  }, [controlLevels]);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  // Filter handlers
  const submitFilters = () => {
    const params = new URLSearchParams();
    if (fCategory !== "all") params.set("category", fCategory);
    if (fControl !== "all") params.set("control", fControl);
    if (fStatus !== "all") params.set("status", fStatus);
    if (fQ.trim()) params.set("q", fQ.trim());
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/parts/setup/items?${qs}` : "/parts/setup/items");
    });
  };
  const resetFilters = () => {
    setFCategory("all");
    setFControl("all");
    setFStatus("all");
    setFQ("");
    startTransition(() => router.push("/parts/setup/items"));
  };

  // CRUD handlers — single submit, branches on mode
  const openCreate = () => {
    setFormDraft(blankInput(allUoms[0] ?? "個"));
    setFormMode({ kind: "create" });
  };
  const openEdit = (r: ItemRow) => {
    setFormDraft(fromRow(r));
    setFormMode({ kind: "edit", id: r.id });
  };
  const closeForm = () => setFormMode({ kind: "closed" });

  const submitForm = () => {
    startTransition(async () => {
      const res =
        formMode.kind === "edit"
          ? await updateItemAction(formMode.id, formDraft)
          : formMode.kind === "create"
            ? await createItemAction(formDraft)
            : null;
      if (!res) return;
      if (res.ok) {
        showBanner({
          ok: true,
          msg: formMode.kind === "edit" ? "✓ 已儲存變更" : "✓ 已新增料號",
        });
        closeForm();
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const toggleActive = (id: string, next: boolean) => {
    startTransition(async () => {
      const res = await setItemActiveAction(id, next);
      if (res.ok) {
        showBanner({ ok: true, msg: next ? "✓ 已啟用" : "✓ 已停用" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const deleteItem = (r: ItemRow) => {
    if (
      !confirm(
        `確定刪除「${r.code} ${r.name}」？此動作會永久移除商品主檔，且僅在無庫存批次/適配/工單引用時才會成功。\n（一般情況建議改用「停用」保留歷史。）`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteItemAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除料號" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const exportCsv = () => {
    const header = [
      "料號",
      "名稱",
      "規格",
      "品類",
      "管控",
      "單位",
      "標準成本",
      "建議售價",
      "適用車型數",
      "啟用",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.code,
          r.name,
          r.spec_description ?? "",
          r.category ?? "",
          r.control_type ?? "",
          r.base_uom ?? "",
          r.standard_cost ?? "",
          r.suggested_price ?? "",
          r.fit_count,
          r.is_active ? "啟用" : "停用",
        ]
          .map((v) => csvEscape(String(v)))
          .join(","),
      );
    }
    const blob = new Blob(["﻿" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `items-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runImport = () => {
    const parsed = parseTSV(importText);
    if (!parsed.length) {
      showBanner({
        ok: false,
        msg: "解析失敗：請貼上含表頭的 TSV/CSV（料號 / 名稱 必填）",
      });
      return;
    }
    startTransition(async () => {
      const res = await bulkImportItemsAction(parsed);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: `✓ 匯入完成：成功 ${res.data.inserted} 筆 / 略過 ${res.data.skipped} 筆${
            res.data.errors.length
              ? `（${res.data.errors.slice(0, 3).join("；")}…）`
              : ""
          }`,
        });
        setImportText("");
        setShowImport(false);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const runPriceBookImport = () => {
    if (!priceBookFile) return;
    startTransition(async () => {
      try {
        const rawRows = await parseXlsx({
          file: priceBookFile,
          columns: [
            { id: "code", header: "料號" },
            { id: "name", header: "英文名稱" },
            { id: "name_zh", header: "中文名稱" },
            { id: "applicable_models", header: "適用車型" },
            { id: "suggested_price", header: "原廠價格" },
            { id: "category", header: "零件類別" },
          ],
        });
        if (!rawRows.length) {
          showBanner({ ok: false, msg: "解析失敗：請確認 Excel 格式正確且包含必填欄位（料號、英文名稱、原廠價格）" });
          return;
        }
        const priceBookRows: PriceBookRow[] = rawRows.map((r) => ({
          code: String(r.code ?? "").trim(),
          name: String(r.name ?? r.name_zh ?? "").trim(),
          suggested_price: r.suggested_price != null && r.suggested_price !== "" ? Number(r.suggested_price) : null,
          category: r.category != null ? String(r.category).trim() : undefined,
        }));
        const res = await upsertPriceBookAction(priceBookRows);
        if (res.ok) {
          setPriceBookResult(res.data);
          setPriceBookErrorsExpanded(false);
          router.refresh();
        } else {
          showBanner({ ok: false, msg: res.error });
        }
      } catch (e) {
        showBanner({ ok: false, msg: `讀取 Excel 失敗：${e instanceof Error ? e.message : "未知錯誤"}` });
      }
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";
  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  const columns: DataGridColumn<ItemRow>[] = [
    {
      id: "image_url",
      header: "圖",
      width: 44,
      sortable: false,
      hideable: false,
      cell: (r) => <ItemThumb url={r.image_url} alt={r.name} />,
      exportValue: (r) => r.image_url ?? "",
    },
    {
      id: "code",
      header: "備件代碼",
      width: 130,
      cell: (r) => (
        <Link
          href={`/parts/setup/items/${r.id}`}
          className="font-mono text-[12px] text-[#185FA5] hover:underline"
        >
          {r.code}
        </Link>
      ),
      exportValue: (r) => r.code,
      sortValue: (r) => r.code,
    },
    {
      id: "name",
      header: "商品名稱",
      cell: (r) => {
        const subtitle = r.serial_tracking_required
          ? "序列號追蹤"
          : r.batch_tracking_required
            ? "批號追蹤"
            : r.spec_description ?? null;
        return (
          <div>
            <Link
              href={`/parts/setup/items/${r.id}`}
              className="font-semibold text-[12.5px] text-[#185FA5] hover:underline"
            >
              {r.name}
            </Link>
            {subtitle ? (
              <div className="text-[11px] text-[#9A9890] mt-0.5">{subtitle}</div>
            ) : null}
          </div>
        );
      },
      exportValue: (r) => r.name,
      sortValue: (r) => r.name,
    },
    {
      id: "category",
      header: "品類",
      width: 110,
      cell: (r) => <span className="text-[12.5px]">{r.category ?? "—"}</span>,
      exportValue: (r) => r.category ?? "",
      sortValue: (r) => r.category ?? "",
    },
    {
      id: "control_type",
      header: "管控",
      width: 80,
      cell: (r) =>
        r.control_type ? (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${accentChipClass(
              controlAccentMap.get(r.control_type) ?? null,
            )}`}
          >
            {`${r.control_type}類`}
          </span>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => r.control_type ?? "",
      sortValue: (r) => r.control_type ?? "",
    },
    {
      id: "base_uom",
      header: "單位",
      width: 70,
      cell: (r) => <span className="text-[12.5px]">{r.base_uom ?? "—"}</span>,
      exportValue: (r) => r.base_uom ?? "",
      sortValue: (r) => r.base_uom ?? "",
    },
    {
      id: "standard_cost",
      header: "標準成本",
      width: 120,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12px] text-[#2C2C2A]">
          {fmtNT(r.standard_cost)}
        </span>
      ),
      exportValue: (r) => r.standard_cost ?? null,
      sortValue: (r) => r.standard_cost ?? null,
    },
    {
      id: "suggested_price",
      header: "建議售價",
      width: 120,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12px] text-[#2C2C2A]">
          {fmtNT(r.suggested_price)}
        </span>
      ),
      exportValue: (r) => r.suggested_price ?? null,
      sortValue: (r) => r.suggested_price ?? null,
    },
    {
      id: "fit_count",
      header: "適用車型數",
      width: 100,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12px] text-[#2C2C2A]">{r.fit_count}</span>
      ),
      exportValue: (r) => r.fit_count,
      sortValue: (r) => r.fit_count,
    },
    {
      id: "is_active",
      header: "狀態",
      width: 80,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${
            r.is_active
              ? "bg-[#EAF3DE] text-[#3B6D11]"
              : "bg-[#F2F2F2] text-[#6B6A68]"
          }`}
        >
          {r.is_active ? "啟用" : "停用"}
        </span>
      ),
      exportValue: (r) => (r.is_active ? "啟用" : "停用"),
      sortValue: (r) => r.is_active,
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">基礎資料（商品主檔）</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">3.1</span>
        <span className="text-[12px] text-[#9A9890]">備件商品主檔管理・新增、修改、停用備件資料</span>
      </header>

      {banner ? (
        <div
          className={`px-3 py-2 rounded text-[13px] ${
            banner.ok ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#FDECEA] text-[#CC0000]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>品類</label>
            <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} className={`${inputClass} w-[110px]`}>
              <option value="all">全部</option>
              {allCategories.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>管控類型</label>
            <select value={fControl} onChange={(e) => setFControl(e.target.value)} className={`${inputClass} w-[90px]`}>
              <option value="all">全部</option>
              {controlLevels.map((c) => (<option key={c.code} value={c.code}>{c.label}</option>))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={`${inputClass} w-[90px]`}>
              <option value="all">全部</option>
              <option value="active">啟用</option>
              <option value="inactive">停用</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>料號 / 品名</label>
            <input
              type="text"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
              placeholder="輸入料號或品名..."
              className={`${inputClass} w-[200px]`}
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button type="button" onClick={submitFilters} disabled={isPending} className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60">
              {isPending ? "查詢中…" : "查詢"}
            </button>
            <button type="button" onClick={resetFilters} className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]">
              重置
            </button>
            <button
              type="button"
              disabled={!canEdit}
              onClick={openCreate}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增商品
            </button>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount.toLocaleString("en-US")}</b> 筆備件主檔
          （顯示 <b className="text-[#2C2C2A]">{rows.length}</b> 筆）
        </span>
        <div className="ml-auto flex gap-1.5">
          <Link href="/parts/setup/dictionaries" className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]">
            管理下拉選單
          </Link>
          <button type="button" onClick={exportCsv} className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]">
            匯出
          </button>
          <button type="button" disabled={!canEdit} onClick={() => setShowImport(true)} className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50">
            批次匯入
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => { setShowPriceBook(true); setPriceBookFile(null); setPriceBookResult(null); setPriceBookErrorsExpanded(false); }}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
          >
            ⬆ 原廠Price Book匯入
          </button>
        </div>
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/setup/items"
        exportFileName={`items-${new Date().toISOString().slice(0, 10)}`}
        disabled={isPending}
        emptyMessage={
          filters.q || filters.category !== "all" || filters.control !== "all" || filters.status !== "all"
            ? "無符合條件的料號，請調整篩選條件"
            : "尚無料號資料"
        }
        rowActionsWidth={180}
        rowActions={(r) => (
          <>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => openEdit(r)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              編輯
            </button>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => toggleActive(r.id, !r.is_active)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              {r.is_active ? "停用" : "啟用"}
            </button>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => deleteItem(r)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
            >
              刪除
            </button>
          </>
        )}
      />

      {/* Unified Create/Edit Modal */}
      {formMode.kind !== "closed" ? (
        <Modal
          title={formMode.kind === "edit" ? "編輯商品主檔" : "新增商品"}
          onClose={closeForm}
        >
          <div className={`grid grid-cols-2 gap-3 ${lockedClass}`}>
            <Field label="料號 *">
              <input
                value={formDraft.code}
                onChange={(e) => setFormDraft({ ...formDraft, code: e.target.value })}
                className={inputClass}
                placeholder="例：DUC-OIL-002"
                disabled={formMode.kind === "edit" && !canEdit}
              />
            </Field>
            <Field label="名稱 *">
              <input
                value={formDraft.name}
                onChange={(e) => setFormDraft({ ...formDraft, name: e.target.value })}
                className={inputClass}
                placeholder="例：機油濾清器"
              />
            </Field>
            <Field label="規格說明" full>
              <input
                value={formDraft.spec_description ?? ""}
                onChange={(e) => setFormDraft({ ...formDraft, spec_description: e.target.value })}
                className={inputClass}
                placeholder="例：適用全系列"
              />
            </Field>
            <Field label="品類">
              <select value={formDraft.category ?? ""} onChange={(e) => setFormDraft({ ...formDraft, category: e.target.value })} className={inputClass}>
                <option value="">—</option>
                {allCategories.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </Field>
            <Field label="管控類型">
              <select value={formDraft.control_type ?? ""} onChange={(e) => setFormDraft({ ...formDraft, control_type: e.target.value })} className={inputClass}>
                <option value="">—</option>
                {controlLevels.map((c) => (<option key={c.code} value={c.code}>{c.label}</option>))}
              </select>
            </Field>
            <Field label="單位">
              <select value={formDraft.base_uom ?? "個"} onChange={(e) => setFormDraft({ ...formDraft, base_uom: e.target.value })} className={inputClass}>
                {allUoms.map((u) => (<option key={u} value={u}>{u}</option>))}
              </select>
            </Field>
            <Field label="預設供應商">
              <select value={formDraft.default_supplier_id ?? ""} onChange={(e) => setFormDraft({ ...formDraft, default_supplier_id: e.target.value || null })} className={inputClass}>
                <option value="">—</option>
                {suppliers.map((s) => (<option key={s.id} value={s.id}>{`${s.code} ${s.name}`}</option>))}
              </select>
            </Field>
            <Field label="標準成本 (NT$)">
              <input type="number" value={formDraft.standard_cost ?? ""} onChange={(e) => setFormDraft({ ...formDraft, standard_cost: e.target.value ? Number(e.target.value) : null })} className={inputClass} />
            </Field>
            <Field label="建議售價 (NT$)">
              <input type="number" value={formDraft.suggested_price ?? ""} onChange={(e) => setFormDraft({ ...formDraft, suggested_price: e.target.value ? Number(e.target.value) : null })} className={inputClass} />
            </Field>
            <Field label="追蹤模式" full>
              <div className="flex gap-4 text-[12.5px]">
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={formDraft.serial_tracking_required ?? false} onChange={(e) => setFormDraft({ ...formDraft, serial_tracking_required: e.target.checked })} />
                  序列號追蹤
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={formDraft.batch_tracking_required ?? false} onChange={(e) => setFormDraft({ ...formDraft, batch_tracking_required: e.target.checked })} />
                  批號追蹤
                </label>
                <label className="inline-flex items-center gap-1.5 ml-auto">
                  <input type="checkbox" checked={formDraft.is_active ?? true} onChange={(e) => setFormDraft({ ...formDraft, is_active: e.target.checked })} />
                  啟用
                </label>
              </div>
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            {formMode.kind === "edit" ? (
              <button
                type="button"
                onClick={() => {
                  const r = rows.find((x) => x.id === formMode.id);
                  if (!r) return;
                  closeForm();
                  deleteItem(r);
                }}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] disabled:opacity-60 mr-auto"
              >
                刪除此商品
              </button>
            ) : null}
            <button type="button" onClick={closeForm} className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955]">取消</button>
            <button
              type="button"
              onClick={submitForm}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-[#0F6E56] text-white disabled:opacity-60"
            >
              {isPending
                ? formMode.kind === "edit"
                  ? "儲存中…"
                  : "建立中…"
                : formMode.kind === "edit"
                  ? "儲存變更"
                  : "建立"}
            </button>
          </div>
        </Modal>
      ) : null}

      {/* Price Book Import Modal */}
      {showPriceBook ? (
        <Modal
          title="原廠 Price Book 匯入"
          onClose={() => { setShowPriceBook(false); setPriceBookFile(null); setPriceBookResult(null); }}
        >
          <div className={`space-y-3 ${lockedClass}`}>
            <p className="text-[12px] text-[#5A5955] leading-relaxed">
              選取原廠 Excel Price Book 檔案（.xlsx / .xls）。系統會自動比對料號：
              <b className="text-[#2C2C2A]">已存在</b>的料號更新名稱與定價，
              <b className="text-[#2C2C2A]">新料號</b>則自動建立。
              追蹤設定（序列號 / 批號）與庫存資料不會被覆蓋。
            </p>
            <p className="text-[11.5px] text-[#9A9890] leading-relaxed">
              支援欄位（以第一列 header 識別）：
              <span className="font-mono text-[#185FA5]">料號</span>（必填）、
              <span className="font-mono text-[#185FA5]">英文名稱</span>（必填）、
              <span className="font-mono">中文名稱</span>、
              <span className="font-mono">原廠價格</span>、
              <span className="font-mono">零件類別</span>、
              <span className="font-mono">適用車型</span>（僅保存供參考）。
            </p>
            <div className="border border-dashed border-[#D5D3CB] rounded-lg p-4 bg-[#F8F7F4] flex flex-col items-center gap-2">
              <label className="cursor-pointer flex flex-col items-center gap-1.5">
                <span className="text-[13px] text-[#5A5955]">
                  {priceBookFile ? priceBookFile.name : "點擊選取 Excel 檔案"}
                </span>
                <span className="text-[11.5px] text-[#9A9890]">支援 .xlsx / .xls</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setPriceBookFile(f);
                    setPriceBookResult(null);
                  }}
                />
                <span className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] inline-flex items-center">
                  選取檔案
                </span>
              </label>
            </div>
            {priceBookResult ? (
              <div className="rounded-lg border border-[#EEECE6] overflow-hidden text-[12.5px]">
                <div className="px-4 py-3 bg-[#EAF3DE] text-[#3B6D11] font-medium flex items-center gap-2">
                  <span>✓ 匯入完成</span>
                  <span className="ml-auto text-[12px] font-normal">
                    新增 <b>{priceBookResult.created}</b> 筆 / 更新 <b>{priceBookResult.updated}</b> 筆
                    {priceBookResult.errors.length > 0 && (
                      <span className="text-[#854F0B]"> / 錯誤 <b>{priceBookResult.errors.length}</b> 筆</span>
                    )}
                  </span>
                </div>
                {priceBookResult.errors.length > 0 ? (
                  <div className="border-t border-[#EEECE6]">
                    <button
                      type="button"
                      onClick={() => setPriceBookErrorsExpanded((v) => !v)}
                      className="w-full px-4 py-2 text-left text-[12px] text-[#854F0B] bg-[#FDF3E3] hover:bg-[#f9e9cc] flex items-center justify-between"
                    >
                      <span>查看錯誤清單（{priceBookResult.errors.length} 筆）</span>
                      <span>{priceBookErrorsExpanded ? "▲" : "▼"}</span>
                    </button>
                    {priceBookErrorsExpanded ? (
                      <ul className="px-4 py-2 space-y-1 max-h-[160px] overflow-y-auto">
                        {priceBookResult.errors.map((e, i) => (
                          <li key={i} className="text-[11.5px] text-[#CC0000] font-mono">{e}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowPriceBook(false); setPriceBookFile(null); setPriceBookResult(null); }}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955]"
            >
              {priceBookResult ? "關閉" : "取消"}
            </button>
            {!priceBookResult ? (
              <button
                type="button"
                onClick={runPriceBookImport}
                disabled={isPending || !priceBookFile}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-[#1A3A5C] text-white disabled:opacity-60"
              >
                {isPending ? "匯入中…" : "開始匯入"}
              </button>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {/* Bulk Import Modal */}
      {showImport ? (
        <Modal title="批次匯入商品主檔" onClose={() => setShowImport(false)}>
          <div className={`space-y-3 ${lockedClass}`}>
            <p className="text-[12px] text-[#5A5955] leading-relaxed">
              貼上 Excel / Google Sheet 內容（Tab 分隔）或 CSV，第一列須為表頭。支援欄位：
              <span className="font-mono text-[11.5px] text-[#185FA5]">料號</span>、
              <span className="font-mono text-[11.5px] text-[#185FA5]">名稱</span>、
              <span className="font-mono text-[11.5px]">品類</span>、
              <span className="font-mono text-[11.5px]">管控</span>、
              <span className="font-mono text-[11.5px]">單位</span>、
              <span className="font-mono text-[11.5px]">標準成本</span>、
              <span className="font-mono text-[11.5px]">建議售價</span>、
              <span className="font-mono text-[11.5px]">規格</span>。料號重複會自動略過。
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={12}
              className="w-full border border-[#D5D3CB] rounded p-2 font-mono text-[12px] outline-none focus:border-[#185FA5]"
              placeholder={`料號\t名稱\t品類\t管控\t單位\t標準成本\t建議售價\nDUC-NEW-001\t測試件\t耗材\tC\t個\t100\t180`}
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setShowImport(false)} className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955]">取消</button>
            <button
              type="button"
              onClick={runImport}
              disabled={isPending || !importText.trim()}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-[#1A3A5C] text-white disabled:opacity-60"
            >
              {isPending ? "匯入中…" : "開始匯入"}
            </button>
          </div>
        </Modal>
      ) : null}
    </main>
  );

  // Helper kept here so `supplierMap` doesn't dangle (kept exported in render via supplierMap usage above if needed)
  // — referenced previously via subtitle/preview, retained for future inline display.
  void supplierMap;
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

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 ${full ? "col-span-2" : ""}`}>
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      {children}
    </div>
  );
}

function ItemThumb({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    return (
      <div className="w-[36px] h-[36px] rounded-md border border-dashed border-[#D5D3CB] bg-[#F8F7F4] flex items-center justify-center text-[#B8B6AE]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      </div>
    );
  }
  return (
    <div className="relative group inline-block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        className="w-[36px] h-[36px] rounded-md object-cover border border-[#EEECE6] bg-white"
      />
      {/* Hover-zoom popover */}
      <div
        className="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-100 pointer-events-none absolute z-50 left-[44px] top-1/2 -translate-y-1/2 bg-white border border-[#D5D3CB] rounded-lg shadow-xl p-1.5"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          className="w-[200px] h-[200px] object-contain rounded"
        />
        <div className="text-[11px] text-[#5A5955] mt-1 px-1 truncate max-w-[200px]">{alt}</div>
      </div>
    </div>
  );
}
