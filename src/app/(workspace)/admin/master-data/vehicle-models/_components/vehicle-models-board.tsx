"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  deleteVehicleModelAction,
  setVehicleModelActiveAction,
  bulkImportVehicleModelsAction,
  type VehicleModelInput,
} from "@/lib/master-data/vehicle-model-actions";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { VehicleModelRow } from "@/domain/vehicle-models";

export type VehicleModelFilters = {
  series: string;
  status: string;
  q: string;
};

type Banner = { ok: boolean; msg: string } | null;

function parseVehicleModelTSV(text: string): VehicleModelInput[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(/\t|,/).map((h) => h.trim());
  const idx = (k: string) => header.findIndex((h) => h === k);
  const colSeries = idx("車系") >= 0 ? idx("車系") : idx("series");
  const colModel = idx("型號") >= 0 ? idx("型號") : idx("model_name");
  const colDisplay = idx("顯示名稱") >= 0 ? idx("顯示名稱") : idx("display_name");
  const colYearStart = idx("起始年份") >= 0 ? idx("起始年份") : idx("year_start");
  const colYearEnd = idx("結束年份") >= 0 ? idx("結束年份") : idx("year_end");
  const colCc = idx("排量") >= 0 ? idx("排量") : idx("engine_cc");
  const out: VehicleModelInput[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(/\t|,/).map((c) => c.trim());
    const series = colSeries >= 0 ? cells[colSeries] : cells[0];
    const model_name = colModel >= 0 ? cells[colModel] : cells[1];
    const display_name = colDisplay >= 0 ? cells[colDisplay] : cells[2];
    if (!series || !model_name || !display_name) continue;
    out.push({
      series,
      model_name,
      display_name,
      year_start: colYearStart >= 0 && cells[colYearStart] ? Number(cells[colYearStart]) : null,
      year_end: colYearEnd >= 0 && cells[colYearEnd] ? Number(cells[colYearEnd]) : null,
      engine_cc: colCc >= 0 && cells[colCc] ? Number(cells[colCc]) : null,
    });
  }
  return out;
}

export function VehicleModelsBoard({
  rows,
  totalCount,
  page,
  pageSize,
  seriesOptions,
  filters,
  canEdit,
}: {
  rows: VehicleModelRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  seriesOptions: string[];
  filters: VehicleModelFilters;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  const [fSeries, setFSeries] = useState(filters.series);
  const [fStatus, setFStatus] = useState(filters.status);
  const [fQ, setFQ] = useState(filters.q);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const submitFilters = (overrides?: Partial<{ page: number }>) => {
    const params = new URLSearchParams();
    if (fSeries !== "all") params.set("series", fSeries);
    if (fStatus !== "all") params.set("status", fStatus);
    if (fQ.trim()) params.set("q", fQ.trim());
    if (overrides?.page && overrides.page > 1) params.set("page", String(overrides.page));
    startTransition(() => {
      router.push(`/admin/master-data/vehicle-models${params.toString() ? "?" + params : ""}`);
    });
  };

  const resetFilters = () => {
    setFSeries("all");
    setFStatus("all");
    setFQ("");
    startTransition(() => {
      router.push("/admin/master-data/vehicle-models");
    });
  };

  const goToPage = (nextPage: number) => {
    submitFilters({ page: nextPage });
  };

  const toggleActive = (row: VehicleModelRow) => {
    if (!canEdit) return;
    startTransition(async () => {
      const res = await setVehicleModelActiveAction(row.id, !row.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: row.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const runImport = () => {
    const parsed = parseVehicleModelTSV(importText);
    if (!parsed.length) {
      showBanner({
        ok: false,
        msg: "解析失敗：請貼上含表頭的 TSV/CSV（車系 / 型號 / 顯示名稱 必填）",
      });
      return;
    }
    startTransition(async () => {
      const res = await bulkImportVehicleModelsAction(parsed);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: `✓ 匯入完成：成功 ${res.data.inserted} 筆 / 略過 ${res.data.skipped} 筆${
            res.data.errors.length ? `（${res.data.errors.slice(0, 3).join("；")}…）` : ""
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

  const removeRow = (row: VehicleModelRow) => {
    if (!canEdit) return;
    if (!confirm(`確定刪除「${row.display_name}」？\n（被零件相容性、客戶車輛、維修工單引用的車型無法刪除）`)) {
      return;
    }
    startTransition(async () => {
      const res = await deleteVehicleModelAction(row.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const columns: DataGridColumn<VehicleModelRow>[] = [
    {
      id: "brand",
      header: "品牌",
      width: 78,
      hideable: false,
      cell: (r) => (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#EAF4FB] text-[#185FA5] text-[11px] whitespace-nowrap">
          {r.brand_id}
        </span>
      ),
      exportValue: (r) => r.brand_id,
      sortValue: (r) => r.brand_id,
    },
    {
      id: "series",
      header: "車系",
      width: 130,
      cell: (r) => <span className="font-semibold text-[#2C2C2A]">{r.series}</span>,
      exportValue: (r) => r.series,
      sortValue: (r) => r.series,
    },
    {
      id: "model_name",
      header: "型號",
      width: 160,
      cell: (r) => r.model_name,
      exportValue: (r) => r.model_name,
      sortValue: (r) => r.model_name,
    },
    {
      id: "display_name",
      header: "顯示名稱",
      width: 200,
      cell: (r) => <span className="text-[#5A5955]">{r.display_name}</span>,
      exportValue: (r) => r.display_name,
      sortValue: (r) => r.display_name,
    },
    {
      id: "year",
      header: "年份",
      width: 110,
      cell: (r) =>
        r.year_start || r.year_end ? (
          <span className="font-mono text-[12px] text-[#5A5955]">
            {r.year_start ?? "?"} – {r.year_end ?? "?"}
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => `${r.year_start ?? ""}-${r.year_end ?? ""}`,
      sortValue: (r) => r.year_start ?? 0,
    },
    {
      id: "engine_cc",
      header: "排量",
      width: 80,
      align: "right",
      cell: (r) =>
        r.engine_cc != null ? (
          <span className="font-mono text-[12px]">{r.engine_cc} cc</span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => (r.engine_cc != null ? String(r.engine_cc) : ""),
      sortValue: (r) => r.engine_cc ?? 0,
    },
    {
      id: "engine_kw",
      header: "馬力",
      width: 80,
      align: "right",
      defaultHidden: true,
      cell: (r) =>
        r.engine_kw != null ? (
          <span className="font-mono text-[12px]">{r.engine_kw} kW</span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => (r.engine_kw != null ? String(r.engine_kw) : ""),
      sortValue: (r) => r.engine_kw ?? 0,
    },
    {
      id: "standard_cost",
      header: "標準成本",
      width: 110,
      align: "right",
      defaultHidden: true,
      cell: (r) =>
        r.standard_cost != null ? (
          <span className="font-mono text-[12px]">
            {Number(r.standard_cost).toLocaleString("en-US")}
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => (r.standard_cost != null ? String(r.standard_cost) : ""),
      sortValue: (r) => Number(r.standard_cost) || 0,
    },
    {
      id: "msrp",
      header: "建議售價",
      width: 110,
      align: "right",
      cell: (r) =>
        r.msrp != null ? (
          <span className="font-mono text-[12px] font-semibold text-[#1A3A5C]">
            {Number(r.msrp).toLocaleString("en-US")}
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => (r.msrp != null ? String(r.msrp) : ""),
      sortValue: (r) => Number(r.msrp) || 0,
    },
    {
      id: "gl_status",
      header: "GL 綁定",
      width: 80,
      cell: (r) => {
        const filled =
          (r.gl_inventory_coa_id ? 1 : 0) +
          (r.gl_cogs_coa_id ? 1 : 0) +
          (r.gl_revenue_coa_id ? 1 : 0) +
          (r.default_tax_code_id ? 1 : 0);
        if (filled === 4) {
          return (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#EAF3DE] text-[#3B6D11] text-[11px] whitespace-nowrap">
              ✓ 完整
            </span>
          );
        }
        if (filled === 0) {
          return (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#FDECEA] text-[#CC0000] text-[11px] whitespace-nowrap">
              未設定
            </span>
          );
        }
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#FDF3E3] text-[#854F0B] text-[11px] whitespace-nowrap">
            {filled}/4
          </span>
        );
      },
      exportValue: (r) => {
        const filled =
          (r.gl_inventory_coa_id ? 1 : 0) +
          (r.gl_cogs_coa_id ? 1 : 0) +
          (r.gl_revenue_coa_id ? 1 : 0) +
          (r.default_tax_code_id ? 1 : 0);
        return `${filled}/4`;
      },
      sortValue: (r) =>
        (r.gl_inventory_coa_id ? 1 : 0) +
        (r.gl_cogs_coa_id ? 1 : 0) +
        (r.gl_revenue_coa_id ? 1 : 0) +
        (r.default_tax_code_id ? 1 : 0),
    },
    {
      id: "status",
      header: "狀態",
      width: 70,
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
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">車型主檔</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          ERP 薄底層
        </span>
        <span className="text-[12px] text-[#9A9890]">
          重機 vehicle_models · NetSuite Item-based Accounting 主檔
        </span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">車系</label>
            <select
              value={fSeries}
              onChange={(e) => setFSeries(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white focus:border-[#185FA5] outline-none min-w-[140px]"
            >
              <option value="all">全部車系</option>
              {seriesOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
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
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-[11px] text-[#9A9890] font-medium">搜尋</label>
            <input
              type="text"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              placeholder="車系 / 型號 / 顯示名稱…"
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
            <button
              type="button"
              onClick={() => setShowImport(true)}
              disabled={!canEdit || isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              批次匯入
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin/master-data/vehicle-models/new")}
              disabled={!canEdit || isPending}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增車型
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆車型
          {rows.length > 0 ? <>（顯示 <b>{rows.length}</b> 筆）</> : null}
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="admin/master-data/vehicle-models"
        exportFileName="vehicle-models"
        emptyMessage={isPending ? "載入中…" : "沒有符合條件的車型"}
        disabled={isPending}
        rowActionsWidth={210}
        rowActions={(r) => (
          <>
            <button
              type="button"
              onClick={() => router.push(`/admin/master-data/vehicle-models/${r.id}`)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              編輯
            </button>
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
          </>
        )}
        pagination={{ page, pageSize, totalCount, onPageChange: goToPage }}
      />

      {showImport ? (
        <Modal title="批次匯入車型主檔" onClose={() => setShowImport(false)}>
          <div className={`space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
            <p className="text-[12px] text-[#5A5955] leading-relaxed">
              貼上 Excel / Google Sheet 內容（Tab 分隔）或 CSV，第一列須為表頭。支援欄位：
              <span className="font-mono text-[11.5px] text-[#185FA5]">車系</span>、
              <span className="font-mono text-[11.5px] text-[#185FA5]">型號</span>、
              <span className="font-mono text-[11.5px] text-[#185FA5]">顯示名稱</span>、
              <span className="font-mono text-[11.5px]">起始年份</span>、
              <span className="font-mono text-[11.5px]">結束年份</span>、
              <span className="font-mono text-[11.5px]">排量</span>。品牌×車系×型號×起始年份重複會自動略過。
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={12}
              className="w-full border border-[#D5D3CB] rounded p-2 font-mono text-[12px] outline-none focus:border-[#185FA5]"
              placeholder={`車系\t型號\t顯示名稱\t起始年份\t結束年份\t排量\nIndian\tScout Bobber\tIndian Scout Bobber\t2023\t2025\t1133`}
            />
            {importText.trim() ? (
              <p className="text-[11.5px] text-[#9A9890]">
                解析到約{" "}
                <b className="text-[#2C2C2A]">
                  {Math.max(importText.trim().split("\n").length - 1, 0)}
                </b>{" "}
                筆資料（含表頭列）{isPending ? "，大量資料寫入中，請勿關閉視窗⋯" : ""}
              </p>
            ) : null}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowImport(false)}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] disabled:opacity-60"
            >
              取消
            </button>
            <button
              type="button"
              onClick={runImport}
              disabled={isPending || !importText.trim()}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-[#1A3A5C] text-white disabled:opacity-60"
            >
              {isPending ? "匯入中⋯" : "開始匯入"}
            </button>
          </div>
        </Modal>
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
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-[#EEECE6] flex items-center">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto w-7 h-7 rounded hover:bg-[#F8F7F4] text-[#9A9890] text-[18px] leading-none"
          >
            ×
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
