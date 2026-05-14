"use client";

import { useMemo, useState, useEffect } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import type { UsedCarInventoryData } from "@/domain/sales-usedcar-inventory";
import {
  inKmRange,
  type UsedCarGrade,
  type UsedCarKmRange,
  type UsedCarStatus,
  type UsedCarUnit,
} from "@/domain/sales-usedcar-inventory.constants";

const TONE_TEXT: Record<string, string> = {
  teal: "text-[#0F6E56]",
  purple: "text-[#534AB7]",
  amber: "text-[#854F0B]",
  navy: "text-[#1A3A5C]",
  red: "text-[#C8001A]",
};

const STATUS_CHIP: Record<UsedCarStatus, string> = {
  "在庫可售": "bg-[#E1F5EE] text-[#0F6E56] border border-[#5DCAA5]",
  "整備中": "bg-[#EEEDFE] text-[#534AB7] border border-[#C5C0F0]",
  "已保留": "bg-[#FDF3E3] text-[#854F0B] border border-[#F0C97E]",
  "已售出": "bg-[#FDECEA] text-[#C8001A] border border-[#F5AEAD]",
};

const GRADE_BADGE: Record<UsedCarGrade, string> = {
  S: "bg-[#7A1010] text-white",
  A: "bg-[#185FA5] text-white",
  B: "bg-[#0F6E56] text-white",
  C: "bg-[#854F0B] text-white",
  D: "bg-[#9A9890] text-white",
};

type ViewMode = "card" | "list";
type Banner = { ok: boolean; msg: string } | null;

function marginRate(margin: number, price: number): number {
  if (price <= 0) return 0;
  return Math.round((margin / price) * 100);
}

function marginChipClass(rate: number): string {
  if (rate >= 15) return "bg-[#E1F5EE] text-[#0F6E56]";
  if (rate >= 8) return "bg-[#FDF3E3] text-[#854F0B]";
  return "bg-[#FDECEA] text-[#C8001A]";
}

function daysToneClass(days: number): string {
  if (days > 45) return "text-[#C8001A]";
  if (days > 30) return "text-[#854F0B]";
  return "text-[#0F6E56]";
}

export default function UsedCarInventoryBoard({ data }: { data: UsedCarInventoryData }) {
  useSetPageHeader({
    title: "中古車庫存看板",
    breadcrumb: [
      { label: "展廳接待" },
      { label: "中古車庫存" },
    ],
    hideSearch: true,
  });

  const [grade, setGrade] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [kmRange, setKmRange] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [banner, setBanner] = useState<Banner>(null);

  useEffect(() => {
    if (banner?.ok) {
      const t = setTimeout(() => setBanner(null), 2200);
      return () => clearTimeout(t);
    }
  }, [banner]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.units.filter((u) => {
      if (grade && u.grade !== grade) return false;
      if (status && u.status !== status) return false;
      if (!inKmRange(u.km, (kmRange as UsedCarKmRange | ""))) return false;
      if (q && !u.model.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data.units, grade, status, kmRange, query]);

  function showToast(unit: UsedCarUnit, action: "appraise" | "quote") {
    if (action === "appraise") {
      setBanner({ ok: true, msg: `📋 ${unit.model} 評估鑑價（待 RS06 上線）` });
    } else {
      setBanner({ ok: true, msg: `🏍️ ${unit.model} 報價（待 RS04 上線）` });
    }
  }

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">中古車庫存看板</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          銷售模組 / RS03B
        </span>
        <span className="text-[12px] text-[#9A9890]">
          等級、整備、保留與在庫天數 — 看板統一管理中古車庫存與報價接續
        </span>
      </header>

      {/* KPI */}
      <section
        data-testid="usedcar-kpi-row"
        className="grid grid-cols-2 md:grid-cols-5 gap-2.5"
      >
        {data.kpis.map((k) => (
          <div
            key={k.key}
            data-testid={`usedcar-kpi-${k.key}`}
            className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3"
          >
            <div className="text-[11px] text-[#9A9890]">{k.label}</div>
            <div
              className={
                "text-[22px] font-bold font-mono leading-none mb-0.5 mt-1 " +
                (TONE_TEXT[k.tone] ?? "text-[#2C2C2A]")
              }
            >
              {k.value}
            </div>
            <div className="text-[10.5px] text-[#9A9890]">{k.subtitle}</div>
          </div>
        ))}
      </section>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-[11.5px] font-semibold text-[#5A5955]">篩選：</span>
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="h-[30px] px-2 rounded border border-[#D5D3CB] text-[12px] focus:border-[#185FA5] outline-none"
            data-testid="filter-grade"
          >
            {data.gradeOptions.map((o) => (
              <option key={o.value || "all-grade"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-[30px] px-2 rounded border border-[#D5D3CB] text-[12px] focus:border-[#185FA5] outline-none"
            data-testid="filter-status"
          >
            {data.statusOptions.map((o) => (
              <option key={o.value || "all-status"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={kmRange}
            onChange={(e) => setKmRange(e.target.value)}
            className="h-[30px] px-2 rounded border border-[#D5D3CB] text-[12px] focus:border-[#185FA5] outline-none"
            data-testid="filter-km"
          >
            {data.kmRangeOptions.map((o) => (
              <option key={o.value || "all-km"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋車款…"
            className="h-[30px] w-[180px] px-2 rounded border border-[#D5D3CB] text-[12px] focus:border-[#185FA5] outline-none"
            data-testid="filter-search"
          />
          <div className="ml-auto flex gap-1" data-testid="view-toggle">
            <button
              className={
                "h-[28px] px-3 rounded text-[12px] border transition " +
                (viewMode === "card"
                  ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                  : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]")
              }
              onClick={() => setViewMode("card")}
              data-testid="view-toggle-card"
            >
              ⊞ 卡片
            </button>
            <button
              className={
                "h-[28px] px-3 rounded text-[12px] border transition " +
                (viewMode === "list"
                  ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                  : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]")
              }
              onClick={() => setViewMode("list")}
              data-testid="view-toggle-list"
            >
              ≡ 列表
            </button>
          </div>
        </div>
      </section>

      {/* Toolbar (count) */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]" data-testid="usedcar-count">
          共 <b className="text-[#2C2C2A]">{data.units.length}</b> 筆庫存（顯示 <b>{filtered.length}</b> 筆）
        </span>
      </div>

      {/* Card / List */}
      {viewMode === "card" ? (
        <CardGrid units={filtered} onAction={showToast} />
      ) : (
        <ListView units={filtered} onAction={showToast} />
      )}

      {banner && (
        <div
          className={
            "fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 " +
            (banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]")
          }
        >
          {banner.msg}
        </div>
      )}
    </main>
  );
}

// ────────────────────────────── Card Grid ──────────────────────────────

function CardGrid({
  units,
  onAction,
}: {
  units: UsedCarUnit[];
  onAction: (u: UsedCarUnit, action: "appraise" | "quote") => void;
}) {
  if (units.length === 0) {
    return (
      <div className="bg-white border border-[#EEECE6] rounded-lg py-12 text-center text-[12px] text-[#9A9890]">
        沒有符合條件的庫存
      </div>
    );
  }
  return (
    <div
      data-testid="usedcar-card-grid"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
    >
      {units.map((u) => {
        const rate = marginRate(u.margin, u.price);
        return (
          <article
            key={u.id}
            data-testid={`usedcar-card-${u.id}`}
            className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden hover:border-[#85B7EB] hover:shadow-md transition cursor-pointer"
          >
            <div
              className="h-[110px] flex items-center justify-center relative"
              style={{ background: `linear-gradient(135deg, ${u.colorHex} 0%, ${u.colorHex}99 100%)` }}
            >
              <span className="text-[40px] opacity-60">🏍️</span>
              <span
                className={
                  "absolute top-2 left-2 w-[28px] h-[28px] rounded-full flex items-center justify-center text-[12px] font-bold " +
                  GRADE_BADGE[u.grade]
                }
              >
                {u.grade}
              </span>
              <span
                className={
                  "absolute top-2 right-2 text-[10.5px] font-bold px-2 py-0.5 rounded " +
                  STATUS_CHIP[u.status]
                }
              >
                {u.status}
              </span>
            </div>
            <div className="p-3">
              <div className="text-[13px] font-bold text-[#2C2C2A]">{u.model}</div>
              <div className="text-[11px] text-[#9A9890] mb-2">
                {u.year} 年 · {u.color}
              </div>
              <div className="space-y-0.5 mb-2">
                <div className="flex justify-between text-[11.5px]">
                  <span className="text-[#9A9890]">里程</span>
                  <span className="font-mono font-semibold">{u.km.toLocaleString()} km</span>
                </div>
                <div className="flex justify-between text-[11.5px]">
                  <span className="text-[#9A9890]">收購成本</span>
                  <span className="font-mono font-semibold">NT$ {u.cost.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[11.5px]">
                  <span className="text-[#9A9890]">在庫天數</span>
                  <span className={"font-mono font-semibold " + daysToneClass(u.daysInStock)}>
                    {u.daysInStock} 天
                  </span>
                </div>
              </div>
              <div className="mb-2">
                <div className="text-[15px] font-bold font-mono text-[#1A3A5C]">
                  NT$ {u.price.toLocaleString()}
                </div>
                <div className="mt-0.5">
                  <span className={"text-[11px] px-1.5 py-0.5 rounded font-semibold " + marginChipClass(rate)}>
                    利潤 {rate}%
                  </span>
                </div>
              </div>
              {u.note && (
                <div className="text-[10.5px] text-[#854F0B] mb-2">📌 {u.note}</div>
              )}
              <div className="flex gap-1.5">
                <button
                  className="flex-1 h-[28px] rounded text-[11.5px] font-semibold bg-white border border-[#D5D3CB] text-[#4A4A48] hover:bg-[#F4F3F0]"
                  onClick={() => onAction(u, "appraise")}
                  data-testid={`btn-appraise-${u.id}`}
                >
                  評估
                </button>
                <button
                  className="flex-1 h-[28px] rounded text-[11.5px] font-semibold bg-[#0F6E56] text-white hover:bg-[#085041]"
                  onClick={() => onAction(u, "quote")}
                  data-testid={`btn-quote-${u.id}`}
                >
                  報價
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ────────────────────────────── List View ──────────────────────────────

function ListView({
  units,
  onAction,
}: {
  units: UsedCarUnit[];
  onAction: (u: UsedCarUnit, action: "appraise" | "quote") => void;
}) {
  if (units.length === 0) {
    return (
      <div className="bg-white border border-[#EEECE6] rounded-lg py-12 text-center text-[12px] text-[#9A9890]">
        沒有符合條件的庫存
      </div>
    );
  }
  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden" data-testid="usedcar-list-view">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-[#FAFAF8] text-left">
            <th className="text-[10.5px] font-bold uppercase tracking-wider text-[#9A9890] px-3 py-2 border-b border-[#EEECE6]">等</th>
            <th className="text-[10.5px] font-bold uppercase tracking-wider text-[#9A9890] px-3 py-2 border-b border-[#EEECE6]">車款</th>
            <th className="text-[10.5px] font-bold uppercase tracking-wider text-[#9A9890] px-3 py-2 border-b border-[#EEECE6]">年份</th>
            <th className="text-[10.5px] font-bold uppercase tracking-wider text-[#9A9890] px-3 py-2 border-b border-[#EEECE6]">里程</th>
            <th className="text-[10.5px] font-bold uppercase tracking-wider text-[#9A9890] px-3 py-2 border-b border-[#EEECE6]">在庫天</th>
            <th className="text-[10.5px] font-bold uppercase tracking-wider text-[#9A9890] px-3 py-2 border-b border-[#EEECE6]">成本</th>
            <th className="text-[10.5px] font-bold uppercase tracking-wider text-[#9A9890] px-3 py-2 border-b border-[#EEECE6]">售價</th>
            <th className="text-[10.5px] font-bold uppercase tracking-wider text-[#9A9890] px-3 py-2 border-b border-[#EEECE6]">利潤</th>
            <th className="text-[10.5px] font-bold uppercase tracking-wider text-[#9A9890] px-3 py-2 border-b border-[#EEECE6]">狀態</th>
            <th className="text-[10.5px] font-bold uppercase tracking-wider text-[#9A9890] px-3 py-2 border-b border-[#EEECE6] text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {units.map((u) => {
            const rate = marginRate(u.margin, u.price);
            return (
              <tr key={u.id} className="hover:bg-[#FAFAF8] border-b border-[#F4F3F0] last:border-b-0">
                <td className="px-3 py-2">
                  <span
                    className={
                      "inline-flex items-center justify-center w-[20px] h-[20px] rounded-full text-[10px] font-bold " +
                      GRADE_BADGE[u.grade]
                    }
                  >
                    {u.grade}
                  </span>
                </td>
                <td className="px-3 py-2 text-[12.5px] font-semibold">{u.model}</td>
                <td className="px-3 py-2 text-[12px]">{u.year}</td>
                <td className="px-3 py-2 text-[12px] font-mono">{u.km.toLocaleString()}</td>
                <td className={"px-3 py-2 text-[12px] font-mono font-bold " + daysToneClass(u.daysInStock)}>
                  {u.daysInStock} 天
                </td>
                <td className="px-3 py-2 text-[11.5px] font-mono">{u.cost.toLocaleString()}</td>
                <td className="px-3 py-2 text-[12px] font-mono font-bold">{u.price.toLocaleString()}</td>
                <td className="px-3 py-2">
                  <span className={"text-[10.5px] px-1.5 py-0.5 rounded font-semibold " + marginChipClass(rate)}>
                    {rate}%
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={
                      "inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold " +
                      STATUS_CHIP[u.status]
                    }
                  >
                    {u.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex gap-1.5 justify-end">
                    <button
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                      onClick={() => onAction(u, "appraise")}
                      data-testid={`row-btn-appraise-${u.id}`}
                    >
                      評估
                    </button>
                    <button
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#142E4A]"
                      onClick={() => onAction(u, "quote")}
                      data-testid={`row-btn-quote-${u.id}`}
                    >
                      報價
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
