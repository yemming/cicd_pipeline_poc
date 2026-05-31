"use client";

/**
 * GRP13 促銷活動管理 — List View（Design Pattern + DataGrid）
 *
 * 結構：Page Header（+新增導 /new）→ 越界 banner → 4 KPI → status tabs（filter）
 *   → 活動 DataGrid → 門店折扣執行監看 → 活動效益分析。
 * CRUD + 海報產生器全移到 [id] detail page（view/edit/create 三 mode + 狀態機）；board 只讀 + 導頁。
 *
 * 天條：不直連 supabase；資料由 server page 經 @/domain/group-promotions 注入。
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  PROMO_STATUS_META,
  PROMO_STATUS_TABS,
  type PromoStatus,
} from "@/domain/group-analytics-labels";
import type {
  PromoCampaign,
  PromoStoreExec,
  PromoEffect,
  PromoOverview,
} from "@/domain/group-promotions";

const fmtNT = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : "NT$" + Math.round(n).toLocaleString("en-US");
const fmtM = (n: number) => "NT$" + (n / 1_000_000).toFixed(2) + "M";

export function PromotionsBoard({
  campaigns,
  storeExec,
  effect,
  overview,
  canEdit,
}: {
  campaigns: PromoCampaign[];
  storeExec: PromoStoreExec[];
  effect: PromoEffect[];
  overview: PromoOverview;
  canEdit: boolean;
}) {
  useSetPageHeader({ title: "促銷活動管理", hideSearch: true });
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"all" | PromoStatus>("all");

  const filtered = useMemo(
    () => (activeTab === "all" ? campaigns : campaigns.filter((c) => c.status === activeTab)),
    [campaigns, activeTab],
  );

  const tabCount = (key: "all" | PromoStatus) =>
    key === "all" ? campaigns.length : campaigns.filter((c) => c.status === key).length;

  const violations = storeExec.filter((s) => s.exec_status === "越界" || s.exec_status === "待確認");

  const columns: DataGridColumn<PromoCampaign>[] = [
    {
      id: "name",
      header: "活動名稱",
      width: 240,
      hideable: false,
      cell: (c) => {
        const m = PROMO_STATUS_META[c.status] ?? PROMO_STATUS_META.draft;
        return (
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: m.dot }} />
            <span className="font-semibold text-[#2C2C2A]">{c.name}</span>
          </div>
        );
      },
      exportValue: (c) => c.name,
      sortValue: (c) => c.name,
    },
    {
      id: "status",
      header: "狀態",
      width: 90,
      cell: (c) => {
        const m = PROMO_STATUS_META[c.status] ?? PROMO_STATUS_META.draft;
        return <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${m.chip}`}>{m.label}</span>;
      },
      exportValue: (c) => (PROMO_STATUS_META[c.status] ?? PROMO_STATUS_META.draft).label,
      sortValue: (c) => c.status,
    },
    {
      id: "promo_type",
      header: "類型",
      width: 110,
      cell: (c) => (
        <span className="px-2 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B] whitespace-nowrap">{c.promo_type}</span>
      ),
      exportValue: (c) => c.promo_type,
      sortValue: (c) => c.promo_type,
    },
    {
      id: "dates",
      header: "活動期間",
      width: 180,
      sortable: false,
      cell: (c) => (
        <span className="text-[11.5px] text-[#5A5955] whitespace-nowrap">
          {c.start_date ?? "—"} ～ {c.end_date ?? "—"}
        </span>
      ),
      exportValue: (c) => `${c.start_date ?? "—"} ~ ${c.end_date ?? "—"}`,
    },
    {
      id: "disc",
      header: "折扣授權",
      width: 130,
      sortable: false,
      cell: (c) => (
        <span className="inline-flex items-center gap-1">
          <span className="px-1.5 py-0.5 rounded bg-[#FDF3E3] border border-[#F0C97E] text-[#854F0B] font-bold text-[11px]">
            {c.disc_min ?? "—"}折
          </span>
          <span className="text-[#9A9890] text-[11px]">～</span>
          <span className="px-1.5 py-0.5 rounded bg-[#FDF3E3] border border-[#F0C97E] text-[#854F0B] font-bold text-[11px]">
            {c.disc_max ?? "—"}折
          </span>
        </span>
      ),
      exportValue: (c) => `${c.disc_min ?? "—"}~${c.disc_max ?? "—"}`,
    },
    {
      id: "stores",
      header: "適用門店",
      width: 160,
      sortable: false,
      cell: (c) => <span className="text-[11.5px] text-[#2C2C2A]">{c.stores.join("、") || "—"}</span>,
      exportValue: (c) => c.stores.join("、"),
    },
    {
      id: "contrib",
      header: "業績貢獻",
      width: 110,
      align: "right",
      cell: (c) => <span className={c.contrib_nt ? "text-[#0F6E56] font-medium" : "text-[#9A9890]"}>{c.contrib_nt ? fmtNT(c.contrib_nt) : "—"}</span>,
      exportValue: (c) => (c.contrib_nt != null ? String(c.contrib_nt) : ""),
      sortValue: (c) => c.contrib_nt ?? null,
    },
    {
      id: "exec",
      header: "執行單數",
      width: 90,
      align: "right",
      cell: (c) => <span className="text-[#2C2C2A]">{c.exec_count ? c.exec_count + " 單" : "—"}</span>,
      exportValue: (c) => (c.exec_count != null ? String(c.exec_count) : ""),
      sortValue: (c) => c.exec_count ?? null,
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">促銷活動管理</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#FDF3E3] text-[#854F0B] font-medium">GRP13</span>
        <span className="text-[12px] text-[#9A9890]">活動建立 × 折扣授權範圍 × 門店執行監看 × 海報產出</span>
        {canEdit && (
          <Link
            href="/group/promotions/new"
            className="ml-auto h-[30px] inline-flex items-center px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
          >
            ＋ 新增活動
          </Link>
        )}
      </header>

      {/* 越界警示 banner */}
      {violations.length > 0 && (
        <div className="bg-[#FDECEA] border border-[#F5AEAD] border-l-4 border-l-[#CC0000] rounded-lg px-4 py-2.5 flex items-start gap-2.5">
          <span className="text-[15px]">⚠️</span>
          <div className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold text-[#8B0012]">折扣越界警示</span>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {violations.map((v, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[12px] text-[#8B0012]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#CC0000]" />
                  {v.exec_status === "越界"
                    ? `${v.store_short}：「${v.campaign}」實際 ${v.actual_discount}折，低於授權下限 ${v.auth_min}折`
                    : `${v.store_short}：「${v.campaign}」尚未回報執行狀況`}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* KPI */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="✅ 進行中活動" value={String(overview.active)} unit="個" sub={`另有 ${overview.scheduled} 個已排程`} tone="good" />
        <Kpi label="💰 進行中業績貢獻" value={fmtM(overview.contribNt)} sub="進行中活動加總" tone="navy" />
        <Kpi label="📉 平均實際折扣" value={overview.avgDiscount !== null ? overview.avgDiscount + "折" : "—"} sub="門店執行監看加權" tone="info" />
        <Kpi label="🚨 折扣越界 / 待確認" value={String(overview.violationCount)} unit="筆" sub="需通路管理經理確認" tone="warn" />
      </section>

      {/* Status tabs（filter） */}
      <div className="flex border border-[#EEECE6] rounded-lg overflow-hidden bg-white">
        {PROMO_STATUS_TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 py-2.5 text-[12px] font-semibold border-r border-[#EEECE6] last:border-r-0 transition-colors ${
                active ? "bg-[#FDF3E3] text-[#854F0B]" : "text-[#5A5955] hover:bg-[#F8F7F4]"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 inline-block px-1.5 rounded-full text-[10px] ${active ? "bg-[#F0C97E] text-[#854F0B]" : "bg-[#EEECE6] text-[#9A9890]"}`}>
                {tabCount(t.key)}
              </span>
            </button>
          );
        })}
      </div>

      {/* 活動 DataGrid */}
      <DataGrid
        columns={columns}
        data={filtered}
        rowKey={(c) => c.id}
        persistKey="group/promotions"
        exportFileName="promo-campaigns"
        emptyMessage="沒有符合條件的活動"
        rowActionsWidth={120}
        rowActions={(c) => (
          <button
            onClick={() => router.push(`/group/promotions/${c.id}`)}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            {canEdit ? "檢視 / 編輯" : "檢視"}
          </button>
        )}
      />

      {/* 門店折扣執行監看 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">🏪 門店折扣執行監看 — 各門店實際折扣 vs 集團授權範圍</span>
          {violations.length > 0 && (
            <span className="px-2 py-0.5 rounded text-[11px] bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]">
              越界 / 待確認 {violations.length} 筆 ⚠️
            </span>
          )}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[11px] text-[#9A9890]">
                <th className="text-left px-3 py-2 font-medium">門店</th>
                <th className="text-left px-3 py-2 font-medium">活動名稱</th>
                <th className="text-left px-3 py-2 font-medium">集團授權範圍</th>
                <th className="text-right px-3 py-2 font-medium">門店實際折扣</th>
                <th className="text-right px-3 py-2 font-medium">執行單數</th>
                <th className="text-right px-3 py-2 font-medium">業績貢獻</th>
                <th className="text-left px-3 py-2 font-medium">狀態</th>
              </tr>
            </thead>
            <tbody>
              {storeExec.map((s, i) => {
                const warn = s.exec_status !== "正常";
                return (
                  <tr key={i} className={`border-t border-[#F0EDE8] ${warn ? "bg-[#FFF8F8]" : ""}`}>
                    <td className="px-3 py-2 font-semibold text-[#2C2C2A]">{s.store_short}</td>
                    <td className="px-3 py-2 text-[#5A5955]">{s.campaign}</td>
                    <td className="px-3 py-2 text-[#9A9890]">
                      {s.auth_min}折 ～ {s.auth_max}折
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-bold ${
                        s.exec_status === "越界" ? "text-[#CC0000]" : s.actual_discount === null ? "text-[#9A9890]" : "text-[#0F6E56]"
                      }`}
                    >
                      {s.actual_discount !== null ? `${s.actual_discount}折${s.exec_status === "越界" ? " ⚠️" : ""}` : "— 未回報"}
                    </td>
                    <td className="px-3 py-2 text-right text-[#5A5955]">{s.exec_count !== null ? s.exec_count + " 單" : "—"}</td>
                    <td className="px-3 py-2 text-right text-[#5A5955]">{s.contrib_nt !== null ? fmtNT(s.contrib_nt) : "—"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] whitespace-nowrap ${
                          s.exec_status === "正常" ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
                        }`}
                      >
                        {s.exec_status === "正常" ? "正常" : s.exec_status === "越界" ? "越界警示" : "待確認"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 活動效益分析 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">📊 活動效益分析 — 活動期間 vs 非活動期間（本季已結束活動）</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {effect.map((e, i) => {
            const color = e.accent === "teal" ? "#0F6E56" : e.accent === "amber" ? "#854F0B" : "#1A3A5C";
            const deltaColor = e.dir === "up" ? "#0F6E56" : e.dir === "down" ? "#CC0000" : "#9A9890";
            return (
              <div key={i} className="bg-[#F8F7F4] border border-[#EEECE6] rounded-lg px-4 py-3">
                <div className="text-[11px] text-[#9A9890] mb-1.5">{e.label}</div>
                <div className="text-[20px] font-bold mb-1" style={{ color }}>
                  {e.value_text}
                </div>
                <div className="text-[12px]" style={{ color: deltaColor }}>
                  {e.delta}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function Kpi({
  label,
  value,
  unit,
  sub,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tone: "navy" | "good" | "warn" | "info";
}) {
  const bar =
    tone === "warn" ? "bg-[#C8001A]" : tone === "good" ? "bg-[#0F6E56]" : tone === "info" ? "bg-[#185FA5]" : "bg-[#854F0B]";
  return (
    <div className="relative bg-white border border-[#EEECE6] rounded-[10px] px-[18px] py-4 overflow-hidden">
      <span className={`absolute top-0 left-0 right-0 h-[3px] ${bar}`} />
      <div className="text-[11px] text-[#5A5A5A] mb-2">{label}</div>
      <div className="text-[24px] font-bold text-[#1A1A1A] leading-none mb-1.5">
        {value}
        {unit ? <span className="text-[13px] font-normal text-[#5A5A5A]"> {unit}</span> : null}
      </div>
      {sub ? <div className="text-[11px] text-[#5A5A5A]">{sub}</div> : null}
    </div>
  );
}
