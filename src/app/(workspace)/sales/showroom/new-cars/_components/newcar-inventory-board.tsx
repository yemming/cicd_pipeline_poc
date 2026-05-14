"use client";

import { useMemo, useState, useEffect } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import type { NewCarInventoryData } from "@/domain/sales-newcar-inventory";
import type { NewCarStatus, NewCarUnit } from "@/domain/sales-newcar-inventory.constants";

const TONE_TEXT: Record<string, string> = {
  teal: "text-[#0F6E56]",
  amber: "text-[#854F0B]",
  navy: "text-[#1A3A5C]",
  red: "text-[#C8001A]",
};

const STATUS_CHIP: Record<NewCarStatus, string> = {
  "現車可售": "bg-[#E1F5EE] text-[#0F6E56] border border-[#5DCAA5]",
  "已保留": "bg-[#FDF3E3] text-[#854F0B] border border-[#F0C97E]",
  "訂車中": "bg-[#EEEDFE] text-[#534AB7] border border-[#C5C0F0]",
  "已售出": "bg-[#FDECEA] text-[#C8001A] border border-[#F5AEAD]",
};

type ViewMode = "card" | "list";

type Banner = { ok: boolean; msg: string } | null;

export default function NewCarInventoryBoard({ data }: { data: NewCarInventoryData }) {
  useSetPageHeader({
    title: "新車庫存看板",
    breadcrumb: [
      { label: "展廳接待" },
      { label: "新車庫存" },
    ],
    hideSearch: true,
  });

  const [series, setSeries] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [color, setColor] = useState<string>("");
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
      if (series && u.series !== series) return false;
      if (status && u.status !== status) return false;
      if (color && u.color !== color) return false;
      if (q && !u.model.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data.units, series, status, color, query]);

  function showToast(unit: NewCarUnit, action: "spec" | "quote") {
    if (action === "spec") {
      setBanner({ ok: true, msg: `📋 ${unit.model} 詳細規格（待 RS04 上線）` });
    } else {
      setBanner({ ok: true, msg: `🏍️ ${unit.model} 報價（待 RS04 上線）` });
    }
  }

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">新車庫存看板</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          銷售模組 / RS03A
        </span>
        <span className="text-[12px] text-[#9A9890]">
          現車、保留、訂車中、本月已售 — 看板統一管理新車庫存與報價接續
        </span>
      </header>

      {/* KPI */}
      <section
        data-testid="newcar-kpi-row"
        className="grid grid-cols-2 md:grid-cols-4 gap-2.5"
      >
        {data.kpis.map((k) => (
          <div
            key={k.key}
            data-testid={`newcar-kpi-${k.key}`}
            className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3"
          >
            <div className="text-[11px] text-[#9A9890]">{k.label}</div>
            <div
              className={
                "text-[24px] font-bold font-mono leading-none mb-0.5 mt-1 " +
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
            value={series}
            onChange={(e) => setSeries(e.target.value)}
            className="h-[30px] px-2 rounded border border-[#D5D3CB] text-[12px] focus:border-[#185FA5] outline-none"
            data-testid="filter-series"
          >
            {data.seriesOptions.map((o) => (
              <option key={o.value || "all-series"} value={o.value}>
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
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-[30px] px-2 rounded border border-[#D5D3CB] text-[12px] focus:border-[#185FA5] outline-none"
            data-testid="filter-color"
          >
            {data.colorOptions.map((o) => (
              <option key={o.value || "all-color"} value={o.value}>
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
        <span className="text-[12px] text-[#9A9890]" data-testid="newcar-count">
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
  units: NewCarUnit[];
  onAction: (u: NewCarUnit, action: "spec" | "quote") => void;
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
      data-testid="newcar-card-grid"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
    >
      {units.map((u) => (
        <article
          key={u.id}
          data-testid={`newcar-card-${u.id}`}
          className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden hover:border-[#85B7EB] hover:shadow-md transition cursor-pointer"
        >
          <div className="h-[110px] bg-gradient-to-br from-[#1A3A5C] to-[#2A5080] flex items-center justify-center relative">
            <span className="text-[40px] opacity-60">🏍️</span>
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
            <div className="text-[11px] text-[#9A9890] mb-1">{u.year} 年款</div>
            <div className="flex items-center gap-1.5 mb-2">
              <span
                className="inline-block w-[14px] h-[14px] rounded-full border border-black/10"
                style={{ background: u.colorHex }}
              />
              <span className="text-[11.5px] text-[#9A9890]">{u.color}</span>
            </div>
            <div className="space-y-0.5 mb-2">
              {u.vin !== "—" && (
                <div className="flex justify-between text-[11.5px]">
                  <span className="text-[#9A9890]">VIN 末 5 碼</span>
                  <span className="font-mono font-semibold">{u.vin.slice(-5)}</span>
                </div>
              )}
              <div className="flex justify-between text-[11.5px]">
                <span className="text-[#9A9890]">到廠 / 預計</span>
                <span className="font-mono">{u.arrived}</span>
              </div>
              {u.days !== null && (
                <div className="flex justify-between text-[11.5px]">
                  <span className="text-[#9A9890]">在庫天數</span>
                  <span
                    className={
                      "font-mono font-semibold " +
                      (u.days > 60
                        ? "text-[#C8001A]"
                        : u.days > 30
                          ? "text-[#854F0B]"
                          : "text-[#0F6E56]")
                    }
                  >
                    {u.days} 天
                  </span>
                </div>
              )}
            </div>
            <div className="text-[15px] font-bold font-mono text-[#1A3A5C] mb-2">
              NT$ {u.msrp.toLocaleString()}
            </div>
            {u.note && (
              <div className="text-[10.5px] text-[#854F0B] mb-2">📌 {u.note}</div>
            )}
            <div className="flex gap-1.5">
              <button
                className="flex-1 h-[28px] rounded text-[11.5px] font-semibold bg-white border border-[#D5D3CB] text-[#4A4A48] hover:bg-[#F4F3F0]"
                onClick={() => onAction(u, "spec")}
                data-testid={`btn-spec-${u.id}`}
              >
                規格
              </button>
              <button
                className="flex-1 h-[28px] rounded text-[11.5px] font-semibold bg-[#1A3A5C] text-white hover:bg-[#142E4A]"
                onClick={() => onAction(u, "quote")}
                data-testid={`btn-quote-${u.id}`}
              >
                報價
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

// ────────────────────────────── List View ──────────────────────────────

function ListView({
  units,
  onAction,
}: {
  units: NewCarUnit[];
  onAction: (u: NewCarUnit, action: "spec" | "quote") => void;
}) {
  if (units.length === 0) {
    return (
      <div className="bg-white border border-[#EEECE6] rounded-lg py-12 text-center text-[12px] text-[#9A9890]">
        沒有符合條件的庫存
      </div>
    );
  }
  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden" data-testid="newcar-list-view">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-[#FAFAF8] text-left">
            <th className="text-[10.5px] font-bold uppercase tracking-wider text-[#9A9890] px-3 py-2 border-b border-[#EEECE6]">車款</th>
            <th className="text-[10.5px] font-bold uppercase tracking-wider text-[#9A9890] px-3 py-2 border-b border-[#EEECE6]">顏色</th>
            <th className="text-[10.5px] font-bold uppercase tracking-wider text-[#9A9890] px-3 py-2 border-b border-[#EEECE6]">VIN 末 5</th>
            <th className="text-[10.5px] font-bold uppercase tracking-wider text-[#9A9890] px-3 py-2 border-b border-[#EEECE6]">到廠 / 預計</th>
            <th className="text-[10.5px] font-bold uppercase tracking-wider text-[#9A9890] px-3 py-2 border-b border-[#EEECE6]">在庫天</th>
            <th className="text-[10.5px] font-bold uppercase tracking-wider text-[#9A9890] px-3 py-2 border-b border-[#EEECE6]">售價</th>
            <th className="text-[10.5px] font-bold uppercase tracking-wider text-[#9A9890] px-3 py-2 border-b border-[#EEECE6]">狀態</th>
            <th className="text-[10.5px] font-bold uppercase tracking-wider text-[#9A9890] px-3 py-2 border-b border-[#EEECE6] text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <tr key={u.id} className="hover:bg-[#FAFAF8] border-b border-[#F4F3F0] last:border-b-0">
              <td className="px-3 py-2 text-[12.5px] font-semibold">{u.model}</td>
              <td className="px-3 py-2 text-[12px]">
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-[12px] h-[12px] rounded-full border border-black/10"
                    style={{ background: u.colorHex }}
                  />
                  {u.color}
                </div>
              </td>
              <td className="px-3 py-2 text-[12px] font-mono">{u.vin === "—" ? "—" : u.vin.slice(-5)}</td>
              <td className="px-3 py-2 text-[11.5px]">{u.arrived}</td>
              <td
                className={
                  "px-3 py-2 text-[12px] font-mono font-semibold " +
                  (u.days === null
                    ? "text-[#9A9890]"
                    : u.days > 60
                      ? "text-[#C8001A]"
                      : u.days > 30
                        ? "text-[#854F0B]"
                        : "text-[#0F6E56]")
                }
              >
                {u.days !== null ? `${u.days} 天` : "—"}
              </td>
              <td className="px-3 py-2 text-[12px] font-mono font-bold">{u.msrp.toLocaleString()}</td>
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
                    onClick={() => onAction(u, "spec")}
                    data-testid={`row-btn-spec-${u.id}`}
                  >
                    規格
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
