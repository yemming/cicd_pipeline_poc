"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  deleteTariffAction,
  setTariffActiveAction,
} from "@/lib/vehicle-import/tariff-actions";
import type { HsCodeTariffRow, HsCodeTariffFilters } from "@/domain/hs-code-tariffs";
import { PLATE_CLASSES } from "@/domain/import-tax.constants";

type Banner = { ok: boolean; msg: string } | null;

const PLATE_LABEL: Record<string, string> = Object.fromEntries(
  PLATE_CLASSES.map((p) => [p.value, p.label]),
);
const PLATE_CHIP: Record<string, string> = {
  white: "bg-[#F2F2F2] text-[#6B6A68]",
  yellow: "bg-[#FDF3E3] text-[#854F0B]",
  red: "bg-[#FDECEA] text-[#CC0000]",
};

const pct = (v: number) => `${(v * 100).toFixed(2).replace(/\.00$/, "")}%`;

export function TariffsBoard({
  rows,
  years,
  filters,
}: {
  rows: HsCodeTariffRow[];
  years: number[];
  filters: HsCodeTariffFilters;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [fQ, setFQ] = useState(filters.q ?? "");
  const [fYear, setFYear] = useState(filters.year ?? "all");
  const [fPlate, setFPlate] = useState(filters.plate_class ?? "all");
  const [fStatus, setFStatus] = useState(filters.status ?? "all");

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const buildHref = (override: Partial<HsCodeTariffFilters> = {}) => {
    const p = new URLSearchParams();
    const q = override.q ?? fQ.trim();
    const year = override.year ?? fYear;
    const plate = override.plate_class ?? fPlate;
    const status = override.status ?? fStatus;
    if (q && q.trim()) p.set("q", q.trim());
    if (year !== "all") p.set("year", year);
    if (plate !== "all") p.set("plate_class", plate);
    if (status !== "all") p.set("status", status);
    const qs = p.toString();
    return qs ? `/vehicle-import/tariffs?${qs}` : "/vehicle-import/tariffs";
  };

  const submitFilters = () => startTransition(() => router.push(buildHref()));
  const resetFilters = () => {
    setFQ("");
    setFYear("all");
    setFPlate("all");
    setFStatus("all");
    startTransition(() => router.push("/vehicle-import/tariffs"));
  };

  const toggleActive = (r: HsCodeTariffRow) => {
    startTransition(async () => {
      const res = await setTariffActiveAction(r.id, !r.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const removeRow = (r: HsCodeTariffRow) => {
    if (!confirm(`確定刪除稅則「${r.hs_code} / ${r.effective_year}」？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deleteTariffAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const columns: DataGridColumn<HsCodeTariffRow>[] = [
    {
      id: "hs_code",
      header: "HS Code",
      width: 110,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/vehicle-import/tariffs/${r.id}`}
          className="font-mono font-semibold text-[#1A3A5C] hover:underline"
        >
          {r.hs_code}
        </Link>
      ),
      exportValue: (r) => r.hs_code,
      sortValue: (r) => r.hs_code,
    },
    {
      id: "effective_year",
      header: "年度版本",
      width: 90,
      cell: (r) => <span className="font-mono">{r.effective_year}</span>,
      exportValue: (r) => String(r.effective_year),
      sortValue: (r) => r.effective_year,
    },
    {
      id: "plate_class",
      header: "牌照級距",
      width: 130,
      cell: (r) =>
        r.plate_class ? (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${
              PLATE_CHIP[r.plate_class] ?? "bg-[#EBF3FF] text-[#1A3A5C]"
            }`}
          >
            {PLATE_LABEL[r.plate_class] ?? r.plate_class}
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => (r.plate_class ? PLATE_LABEL[r.plate_class] ?? r.plate_class : ""),
      sortValue: (r) => r.plate_class ?? "",
    },
    {
      id: "displacement",
      header: "排氣量 (cc)",
      width: 110,
      sortable: false,
      cell: (r) => (
        <span className="text-[12px] text-[#5A5955]">
          {r.displacement_min ?? "—"} ~ {r.displacement_max ?? "∞"}
        </span>
      ),
      exportValue: (r) => `${r.displacement_min ?? ""}-${r.displacement_max ?? ""}`,
    },
    {
      id: "customs_rate",
      header: "關稅率",
      width: 80,
      align: "right",
      cell: (r) => <span className="font-mono text-[12px]">{pct(r.customs_rate)}</span>,
      exportValue: (r) => pct(r.customs_rate),
      sortValue: (r) => r.customs_rate,
    },
    {
      id: "commodity_tax_rate",
      header: "貨物稅率",
      width: 90,
      align: "right",
      cell: (r) => <span className="font-mono text-[12px]">{pct(r.commodity_tax_rate)}</span>,
      exportValue: (r) => pct(r.commodity_tax_rate),
      sortValue: (r) => r.commodity_tax_rate,
    },
    {
      id: "trade_promotion_rate",
      header: "推貿費率",
      width: 90,
      align: "right",
      cell: (r) => <span className="font-mono text-[12px]">{pct(r.trade_promotion_rate)}</span>,
      exportValue: (r) => pct(r.trade_promotion_rate),
      sortValue: (r) => r.trade_promotion_rate,
    },
    {
      id: "vat_rate",
      header: "營業稅率",
      width: 90,
      align: "right",
      cell: (r) => <span className="font-mono text-[12px]">{pct(r.vat_rate)}</span>,
      exportValue: (r) => pct(r.vat_rate),
      sortValue: (r) => r.vat_rate,
    },
    {
      id: "is_active",
      header: "狀態",
      width: 70,
      cell: (r) =>
        r.is_active ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF3DE] text-[#3B6D11]">
            啟用
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#F2F2F2] text-[#6B6A68]">
            停用
          </span>
        ),
      exportValue: (r) => (r.is_active ? "啟用" : "停用"),
      sortValue: (r) => r.is_active,
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">進口稅則 master</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          P2P · HS 8711
        </span>
        <span className="text-[12px] text-[#9A9890]">
          HS Code + 年度版本・關稅／貨物稅／推貿／營業稅率（每年初由報關行確認 GC411 更新）
        </span>
      </header>

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

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>關鍵字</label>
            <input
              className={inputClass}
              placeholder="HS Code / 備註"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>年度</label>
            <select className={inputClass} value={fYear} onChange={(e) => setFYear(e.target.value)}>
              <option value="all">全部</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>牌照級距</label>
            <select className={inputClass} value={fPlate} onChange={(e) => setFPlate(e.target.value)}>
              <option value="all">全部</option>
              {PLATE_CLASSES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select className={inputClass} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="all">全部</option>
              <option value="active">啟用</option>
              <option value="inactive">停用</option>
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={submitFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              onClick={resetFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <button
              onClick={() => router.push("/vehicle-import/tariffs/new")}
              disabled={isPending}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增稅則
            </button>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length.toLocaleString("en-US")}</b> 筆稅則
        </span>
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="vehicle-import/tariffs"
        exportFileName="hs-code-tariffs"
        emptyMessage="沒有符合條件的稅則（點右上「新增稅則」建立 8711.x 年度版本）"
        disabled={isPending}
        rowActions={(r) => (
          <>
            <button
              onClick={() => router.push(`/vehicle-import/tariffs/${r.id}`)}
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              編輯
            </button>
            <button
              onClick={() => toggleActive(r)}
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              {r.is_active ? "停用" : "啟用"}
            </button>
            <button
              onClick={() => removeRow(r)}
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-40"
            >
              刪除
            </button>
          </>
        )}
      />
    </main>
  );
}
