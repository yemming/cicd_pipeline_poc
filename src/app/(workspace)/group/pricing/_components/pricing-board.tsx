"use client";

/**
 * GRP14 定價折扣設定 — List View（Design Pattern + DataGrid）
 *
 * 結構：Page Header（+新增導 /new）→ ALERT → 4 KPI → cat-tabs（filter）→ 定價 DataGrid
 *   → 門店成交偏差<D3HBar>+ 偏差明細 → 異動稽核 log（全體彙整）。
 * CRUD 全移到 [id] detail page（view/edit/create 三 mode + 狀態機）；board 只讀 + 導頁。
 *
 * 天條：不直連 supabase；資料由 server page 經 @/domain/group-pricing 注入。
 */

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { D3HBar } from "@/components/charts/d3-hbar";
import type {
  PricingPolicy,
  PricingDeviationRow,
  PricingOverview,
  PricingKind,
  PricingStatus,
} from "@/domain/group-pricing";

type Props = {
  policies: PricingPolicy[];
  deviations: PricingDeviationRow[];
  overview: PricingOverview;
};

type CatFilter = "all" | "vehicle" | "parts" | "accessory" | "pending";

const fmtInt = (n: number | null | undefined): string =>
  n == null || Number.isNaN(n) ? "—" : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const fmtPct = (rate: number | null | undefined, d = 1): string =>
  rate == null || Number.isNaN(rate) ? "—" : `${(rate * 100).toFixed(d)}%`;

const KIND_LABEL: Record<PricingKind, string> = { vehicle: "整車", parts: "零件", accessory: "精品" };
const STATUS_META: Record<PricingStatus, { label: string; cls: string }> = {
  active: { label: "生效中", cls: "bg-[#EAF3DE] text-[#3B6D11]" },
  review: { label: "審核中", cls: "bg-[#FDF3E3] text-[#854F0B]" },
  draft: { label: "草稿", cls: "bg-[#F2F2F2] text-[#6B6A68]" },
};

export function PricingBoard({ policies, deviations, overview }: Props) {
  const router = useRouter();
  const [cat, setCat] = useState<CatFilter>("all");

  useSetPageHeader({
    title: "定價折扣設定",
    breadcrumb: [{ label: "集團管理" }, { label: "定價折扣" }],
    hideSearch: true,
  });

  const filtered = useMemo(() => {
    if (cat === "all") return policies;
    if (cat === "pending") return policies.filter((p) => p.status === "review");
    return policies.filter((p) => p.kind === cat);
  }, [policies, cat]);

  const alerts: string[] = [];
  const badDev = deviations.filter((d) => d.status === "bad");
  for (const d of badDev) {
    alerts.push(`${d.store}店：${d.item} 成交均價低於定價下限（偏差 ${d.dev}%）`);
  }
  if (overview.pendingCount > 0) alerts.push(`${overview.pendingCount} 項定價送審待核准（待通路管理主管確認）`);

  const columns: DataGridColumn<PricingPolicy>[] = [
    {
      id: "name",
      header: "品項",
      width: 220,
      hideable: false,
      cell: (p) => (
        <Link href={`/group/pricing/${p.id}`} className="flex flex-col hover:underline">
          {p.code ? <span className="font-mono text-[11px] text-[#9A9890]">{p.code}</span> : null}
          <span className="font-semibold text-[#1A3A5C]">{p.name}</span>
        </Link>
      ),
      exportValue: (p) => p.name,
      sortValue: (p) => p.name,
    },
    {
      id: "kind",
      header: "類別 / 車系",
      width: 110,
      cell: (p) => (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
          {p.kind === "vehicle" ? p.series ?? KIND_LABEL.vehicle : KIND_LABEL[p.kind]}
        </span>
      ),
      exportValue: (p) => (p.kind === "vehicle" ? p.series ?? KIND_LABEL.vehicle : KIND_LABEL[p.kind]),
      sortValue: (p) => p.kind,
    },
    {
      id: "msrp",
      header: "建議售價",
      width: 110,
      align: "right",
      cell: (p) => <span className="font-bold">NT${fmtInt(p.msrp)}</span>,
      exportValue: (p) => (p.msrp != null ? String(p.msrp) : ""),
      sortValue: (p) => p.msrp ?? null,
    },
    {
      id: "margin",
      header: "毛利率",
      width: 80,
      align: "right",
      cell: (p) => (
        <span className={`font-semibold ${(p.marginRate ?? 0) >= 0.3 ? "text-[#0F6E56]" : "text-[#854F0B]"}`}>
          {fmtPct(p.marginRate)}
        </span>
      ),
      exportValue: (p) => (p.marginRate != null ? fmtPct(p.marginRate) : ""),
      sortValue: (p) => p.marginRate ?? null,
    },
    {
      id: "disc",
      header: "折扣授權範圍",
      width: 150,
      sortable: false,
      cell: (p) => (
        <span className="inline-flex items-center gap-1">
          <span className="px-1.5 py-0.5 rounded bg-[#FDF3E3] border border-[#F0C97E] text-[#854F0B] font-bold text-[11px]">
            {p.discMin ?? "—"}折
          </span>
          <span className="text-[#9A9890] text-[11px]">～</span>
          <span className="px-1.5 py-0.5 rounded bg-[#FDF3E3] border border-[#F0C97E] text-[#854F0B] font-bold text-[11px]">
            {p.discMax ?? "—"}折
          </span>
        </span>
      ),
      exportValue: (p) => `${p.discMin ?? "—"}~${p.discMax ?? "—"}`,
    },
    {
      id: "minPrice",
      header: "最低售價",
      width: 110,
      align: "right",
      cell: (p) => <span className="text-[#CC0000] font-semibold">NT${fmtInt(p.minPrice)}</span>,
      exportValue: (p) => (p.minPrice != null ? String(p.minPrice) : ""),
      sortValue: (p) => p.minPrice ?? null,
    },
    {
      id: "effectiveDate",
      header: "生效日",
      width: 100,
      cell: (p) => <span className="text-[11px] text-[#5A5955]">{p.effectiveDate ?? "—"}</span>,
      exportValue: (p) => p.effectiveDate ?? "",
      sortValue: (p) => p.effectiveDate ?? "",
    },
    {
      id: "status",
      header: "狀態",
      width: 80,
      align: "right",
      cell: (p) => (
        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap ${STATUS_META[p.status].cls}`}>
          {STATUS_META[p.status].label}
        </span>
      ),
      exportValue: (p) => STATUS_META[p.status].label,
      sortValue: (p) => p.status,
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">定價折扣設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#FDF3E3] text-[#854F0B] font-medium">GRP14</span>
        <span className="text-[12px] text-[#9A9890]">長期定價基準 × 折扣授權上下限 × 門店成交偏差監看 × 異動稽核</span>
        <Link
          href="/group/pricing/new"
          className="ml-auto h-[30px] inline-flex items-center px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
        >
          ＋ 新增定價項目
        </Link>
      </header>

      {/* ALERT */}
      {alerts.length > 0 ? (
        <div className="bg-[#FDECEA] border border-[#F5AEAD] border-l-4 border-l-[#C8001A] rounded-lg px-4 py-2.5 flex items-center gap-2.5 text-[13px] text-[#8B0012] flex-wrap">
          <span className="text-[16px]">⚠️</span>
          <strong className="mr-1">定價異常</strong>
          <div className="flex gap-5 flex-wrap">
            {alerts.map((a, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#C8001A] shrink-0" />
                {a}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* 4 KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <Kpi label="📋 現行定價品項" value={`${overview.totalCount}`} unit="項" sub={`整車 ${overview.vehicleCount}｜零件 ${overview.partsCount}｜精品 ${overview.accessoryCount}`} tone="navy" />
        <Kpi label="✅ 建議售價達成率" value={fmtPct(overview.achievementRate)} sub="門店成交均價符合範圍佔比" tone="good" />
        <Kpi label="🚨 偏差警示門店" value={`${overview.deviationStoreCount}`} unit="間" sub={badDev[0] ? `${badDev[0].store} ${badDev[0].item}` : "無"} tone="warn" />
        <Kpi label="⏳ 待審定價項目" value={`${overview.pendingCount}`} unit="項" sub="待通路管理主管確認" tone="amber" />
      </div>

      {/* CAT TABS（filter） */}
      <div className="flex items-center gap-2 flex-wrap pt-1">
        {([
          ["all", "全部品項"],
          ["vehicle", "🏍 整車"],
          ["parts", "🔧 零件"],
          ["accessory", "✨ 精品"],
          ["pending", "⏳ 待審核"],
        ] as Array<[CatFilter, string]>).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setCat(key)}
            className={`px-4 h-[30px] rounded-full text-[12px] font-semibold border transition-colors ${
              cat === key
                ? "bg-[#854F0B] text-white border-[#854F0B]"
                : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#854F0B] hover:text-[#854F0B]"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{policies.length}</b> 項（顯示 <b>{filtered.length}</b> 項）
        </span>
      </div>

      {/* 定價 DataGrid */}
      <DataGrid
        columns={columns}
        data={filtered}
        rowKey={(p) => p.id}
        persistKey="group/pricing"
        exportFileName="pricing-policies"
        emptyMessage="此分類無定價項目"
        rowActionsWidth={120}
        rowActions={(p) => (
          <button
            onClick={() => router.push(`/group/pricing/${p.id}`)}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            檢視 / 編輯
          </button>
        )}
      />

      {/* 門店成交偏差 */}
      {deviations.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title="各門店成交均價偏差率" tag="本季平均">
            <D3HBar
              data={deviations.map((d) => ({ label: d.store, value: d.dev ?? 0 }))}
              height={240}
              valueSuffix="%"
              valueFormat={(v) => v.toFixed(1)}
              domain={[-7, 4]}
              warningZone={{ from: -7, to: -3 }}
              refLines={[{ value: -3, label: "警戒", color: "#C8001A" }]}
              colorFn={(d) => (d.value < -3 ? "#C8001A" : d.value < 0 ? "#854F0B" : "#0F6E56")}
            />
            <div className="text-[11px] text-[#9A9890] mt-2">正值=高於建議售價，負值=低於建議售價。低於授權下限將標紅警示。</div>
          </Card>
          <Card title="偏差明細" tag={`越界 ${badDev.length} 筆`} tagTone="red">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="text-[11px] text-[#5A5A5A]">
                    {["門店", "品項", "建議售價", "成交均價", "偏差", "狀態"].map((h) => (
                      <th key={h} className="text-left font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deviations.map((d, i) => (
                    <tr key={i} className={`hover:bg-[#FDF3E3] ${d.status === "bad" ? "bg-[#FFF8F8]" : ""}`}>
                      <td className="py-2 px-2 border-b border-[#F0EDE8] font-semibold">{d.store}</td>
                      <td className="py-2 px-2 border-b border-[#F0EDE8]">{d.item}</td>
                      <td className="py-2 px-2 border-b border-[#F0EDE8]">NT${fmtInt(d.msrp)}</td>
                      <td className={`py-2 px-2 border-b border-[#F0EDE8] ${d.status === "bad" ? "text-[#C8001A] font-bold" : ""}`}>NT${fmtInt(d.deal)}</td>
                      <td className={`py-2 px-2 border-b border-[#F0EDE8] font-semibold ${(d.dev ?? 0) < 0 ? "text-[#C8001A]" : "text-[#0F6E56]"}`}>
                        {(d.dev ?? 0) > 0 ? "+" : ""}{d.dev}%
                      </td>
                      <td className="py-2 px-2 border-b border-[#F0EDE8]">
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${d.status === "bad" ? "bg-[#FDECEA] text-[#C8001A] border border-[#F5AEAD]" : "bg-[#E1F5EE] text-[#0A5040]"}`}>
                          {d.status === "bad" ? "越界" : "正常"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {/* 異動稽核 log（彙整全部 policy 的 audit_log，依時間倒序，取近 12 筆） */}
      <Card title="近期定價異動 Audit Log" tag="近期">
        <AuditTimeline policies={policies} />
      </Card>
    </main>
  );
}

/* ────────────── 子元件 ────────────── */

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
  tone: "navy" | "good" | "warn" | "amber";
}) {
  const bar = tone === "warn" ? "bg-[#C8001A]" : tone === "good" ? "bg-[#0F6E56]" : tone === "amber" ? "bg-[#854F0B]" : "bg-[#1A3A5C]";
  return (
    <div className="relative bg-white border border-[#E0DDD6] rounded-[10px] px-[18px] py-4 overflow-hidden">
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

function Card({
  title,
  tag,
  tagTone = "amber",
  children,
}: {
  title: string;
  tag?: string;
  tagTone?: "amber" | "red";
  children: ReactNode;
}) {
  const tagCls = tagTone === "red" ? "bg-[#FDECEA] text-[#C8001A] border-[#F5AEAD]" : "bg-[#FDF3E3] text-[#854F0B] border-[#F0C97E]";
  return (
    <section className="bg-white border border-[#E0DDD6] rounded-[10px] overflow-hidden">
      <header className="px-4 py-3 border-b border-[#E0DDD6] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#1A1A1A]">
          <span className="w-2 h-2 rounded-full bg-[#854F0B]" />
          {title}
        </div>
        {tag ? <span className={`text-[11px] px-2 py-0.5 rounded border ${tagCls}`}>{tag}</span> : null}
      </header>
      <div className="px-[18px] py-[18px]">{children}</div>
    </section>
  );
}

function AuditTimeline({ policies }: { policies: PricingPolicy[] }) {
  const entries = useMemo(() => {
    const all: Array<{ name: string; entry: PricingPolicy["auditLog"][number] }> = [];
    for (const p of policies) {
      for (const e of p.auditLog) all.push({ name: p.name, entry: e });
    }
    all.sort((a, b) => (a.entry.at < b.entry.at ? 1 : a.entry.at > b.entry.at ? -1 : 0));
    return all.slice(0, 12);
  }, [policies]);

  if (entries.length === 0) {
    return <div className="text-[12px] text-[#9A9890] py-4 text-center">尚無定價異動紀錄</div>;
  }

  return (
    <div className="flex flex-col">
      {entries.map((x, i) => {
        const isStatus = x.entry.field === "狀態";
        return (
          <div key={i} className="flex gap-3 py-2.5 border-b border-[#F5F5F5] last:border-b-0">
            <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${isStatus ? "bg-[#1A3A5C]" : "bg-[#854F0B]"}`} />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-bold text-[#1A1A1A]">
                {x.name} — {x.entry.field}異動
              </div>
              <div className="text-[11px] text-[#5A5A5A] mt-0.5">
                {x.entry.by}　{x.entry.at}
              </div>
              {x.entry.old || x.entry.new ? (
                <div className="text-[11px] mt-1">
                  {x.entry.old && x.entry.old !== "—" ? <span className="text-[#C8001A] line-through mr-1.5">{x.entry.old}</span> : null}
                  <span className="text-[#0F6E56] font-semibold">{x.entry.new}</span>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
