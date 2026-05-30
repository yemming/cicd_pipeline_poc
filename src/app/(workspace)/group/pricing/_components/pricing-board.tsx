"use client";

/**
 * GRP14 定價折扣設定 — client board（真 CRUD + 審核狀態機）
 *
 * 結構（spec GRP14）：4 KPI + cat-tabs（全部/整車/零件/精品/待審）+ 定價表（整車 / 零件精品）
 *   + 門店成交偏差<D3HBar 零線+警戒線>+ 偏差明細表 + 異動稽核 log；右側 side panel 新增/編輯
 *   （售價/成本→自動算毛利、折扣上下限驗證、生效日、備註）+ 狀態機按鈕（送審/核准/退回）。
 *
 * UX（CLAUDE.md §UX）：所有寫入 useTransition pending → 鎖 panel + spinner + 進行式文字；
 *   成功 banner 2.2s 自動關、失敗 banner 留著；成功後 router.refresh() 落地。
 *
 * 天條：不直連 supabase；資料由 server page 經 @/domain/group-pricing 注入，寫入走 server actions。
 */

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";
import { D3HBar } from "@/components/charts/d3-hbar";
import type {
  PricingPolicy,
  PricingDeviationRow,
  PricingOverview,
  PricingKind,
  PricingStatus,
} from "@/domain/group-pricing";
import {
  createPricingPolicyAction,
  updatePricingPolicyAction,
  submitPricingForReviewAction,
  approvePricingPolicyAction,
  rejectPricingPolicyAction,
  deletePricingPolicyAction,
  type PricingPolicyInput,
} from "@/lib/group/pricing-policy-actions";

type Props = {
  policies: PricingPolicy[];
  deviations: PricingDeviationRow[];
  overview: PricingOverview;
};

type CatFilter = "all" | "vehicle" | "parts" | "accessory" | "pending";
type Banner = { ok: boolean; msg: string } | null;

const fmtInt = (n: number | null | undefined): string =>
  n == null || Number.isNaN(n) ? "—" : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const fmtPct = (rate: number | null | undefined, d = 1): string =>
  rate == null || Number.isNaN(rate) ? "—" : `${(rate * 100).toFixed(d)}%`;

const KIND_LABEL: Record<PricingKind, string> = { vehicle: "整車", parts: "零件", accessory: "精品" };
const STATUS_META: Record<PricingStatus, { label: string; cls: string }> = {
  active: { label: "生效中", cls: "bg-[#E1F5EE] text-[#0A5040]" },
  review: { label: "審核中", cls: "bg-[#FDF3E3] text-[#854F0B] border border-[#F0C97E]" },
  draft: { label: "草稿", cls: "bg-[#F5F5F5] text-[#888] border border-[#DDD]" },
};

export function PricingBoard({ policies, deviations, overview }: Props) {
  const router = useRouter();
  const [cat, setCat] = useState<CatFilter>("all");
  const [banner, setBanner] = useState<Banner>(null);
  const [panel, setPanel] = useState<{ mode: "new" | "edit"; policy: PricingPolicy | null } | null>(null);
  const [isPending, startTransition] = useTransition();

  useSetPageHeader({
    title: "定價折扣設定",
    breadcrumb: [{ label: "集團管理" }, { label: "定價折扣" }],
    hideSearch: true,
  });

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const filtered = useMemo(() => {
    if (cat === "all") return policies;
    if (cat === "pending") return policies.filter((p) => p.status === "review");
    return policies.filter((p) => p.kind === cat);
  }, [policies, cat]);

  const vehicles = filtered.filter((p) => p.kind === "vehicle");
  const partsAcc = filtered.filter((p) => p.kind === "parts" || p.kind === "accessory");

  const alerts: string[] = [];
  const badDev = deviations.filter((d) => d.status === "bad");
  for (const d of badDev) {
    alerts.push(`${d.store}店：${d.item} 成交均價低於定價下限（偏差 ${d.dev}%）`);
  }
  if (overview.pendingCount > 0) alerts.push(`${overview.pendingCount} 項定價送審待核准（待通路管理主管確認）`);

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">定價折扣設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#FDF3E3] text-[#854F0B] font-medium">GRP14</span>
        <span className="text-[12px] text-[#9A9890]">長期定價基準 × 折扣授權上下限 × 門店成交偏差監看 × 異動稽核</span>
        <div className="ml-auto">
          <button
            onClick={() => setPanel({ mode: "new", policy: null })}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
          >
            ＋ 新增定價項目
          </button>
        </div>
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

      {/* CAT TABS */}
      <div className="flex gap-2 flex-wrap pt-1">
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
      </div>

      {/* 整車定價表 */}
      {vehicles.length > 0 ? (
        <Card title="各車型建議售價 × 折扣授權範圍" tag="長期生效">
          <PolicyTable
            policies={vehicles}
            kindCol="series"
            onEdit={(p) => setPanel({ mode: "edit", policy: p })}
          />
        </Card>
      ) : null}

      {/* 零件精品定價表 */}
      {partsAcc.length > 0 ? (
        <Card title="零件 × 精品定價基準" tag="品類基準">
          <PolicyTable
            policies={partsAcc}
            kindCol="kind"
            onEdit={(p) => setPanel({ mode: "edit", policy: p })}
          />
        </Card>
      ) : null}

      {filtered.length === 0 ? (
        <div className="text-[13px] text-[#9A9890] py-8 text-center">此分類無定價項目</div>
      ) : null}

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

      {/* SIDE PANEL */}
      {panel ? (
        <PricingPanel
          mode={panel.mode}
          policy={panel.policy}
          isPending={isPending}
          onClose={() => setPanel(null)}
          onSubmit={(input) => {
            startTransition(async () => {
              const res =
                panel.mode === "new"
                  ? await createPricingPolicyAction(input)
                  : await updatePricingPolicyAction(panel.policy!.id, input);
              if (res.ok) {
                showBanner({ ok: true, msg: panel.mode === "new" ? "✓ 已建立定價項目" : "✓ 已更新定價" });
                setPanel(null);
                router.refresh();
              } else {
                showBanner({ ok: false, msg: res.error });
              }
            });
          }}
          onStatusChange={(action) => {
            if (!panel.policy) return;
            startTransition(async () => {
              const id = panel.policy!.id;
              const res =
                action === "review"
                  ? await submitPricingForReviewAction(id)
                  : action === "approve"
                    ? await approvePricingPolicyAction(id)
                    : await rejectPricingPolicyAction(id);
              if (res.ok) {
                showBanner({ ok: true, msg: action === "review" ? "✓ 已送審" : action === "approve" ? "✓ 已核准生效" : "✓ 已退回草稿" });
                setPanel(null);
                router.refresh();
              } else {
                showBanner({ ok: false, msg: res.error });
              }
            });
          }}
          onDelete={() => {
            if (!panel.policy) return;
            startTransition(async () => {
              const res = await deletePricingPolicyAction(panel.policy!.id);
              if (res.ok) {
                showBanner({ ok: true, msg: "✓ 已刪除定價項目" });
                setPanel(null);
                router.refresh();
              } else {
                showBanner({ ok: false, msg: res.error });
              }
            });
          }}
        />
      ) : null}

      {/* BANNER */}
      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-[60] ${
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

function PolicyTable({
  policies,
  kindCol,
  onEdit,
}: {
  policies: PricingPolicy[];
  kindCol: "series" | "kind";
  onEdit: (p: PricingPolicy) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="text-[11px] text-[#5A5A5A]">
            <th className="text-left font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">{kindCol === "series" ? "車型" : "品號 / 品名"}</th>
            <th className="text-left font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">{kindCol === "series" ? "車系" : "類別"}</th>
            <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">建議售價</th>
            {kindCol === "series" ? <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">毛利率</th> : null}
            <th className="text-left font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">折扣授權範圍</th>
            <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">最低售價</th>
            <th className="text-left font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">生效日</th>
            <th className="text-center font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">狀態</th>
            <th className="text-center font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">操作</th>
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => {
            const sm = STATUS_META[p.status];
            return (
              <tr key={p.id} className="hover:bg-[#FDF3E3]">
                <td className="py-2.5 px-2 border-b border-[#F0EDE8]">
                  {kindCol === "kind" && p.code ? (
                    <>
                      <span className="font-mono text-[11px] text-[#5A5A5A]">{p.code}</span>
                      <br />
                    </>
                  ) : null}
                  <strong>{p.name}</strong>
                </td>
                <td className="py-2.5 px-2 border-b border-[#F0EDE8]">
                  <span className="inline-block px-1.5 py-0.5 rounded text-[11px] bg-[#EAF4FB] text-[#1A3A5C]">
                    {kindCol === "series" ? (p.series ?? "—") : KIND_LABEL[p.kind]}
                  </span>
                </td>
                <td className="py-2.5 px-2 border-b border-[#F0EDE8] text-right font-bold">NT${fmtInt(p.msrp)}</td>
                {kindCol === "series" ? (
                  <td className={`py-2.5 px-2 border-b border-[#F0EDE8] text-right font-semibold ${(p.marginRate ?? 0) >= 0.3 ? "text-[#0F6E56]" : "text-[#854F0B]"}`}>
                    {fmtPct(p.marginRate)}
                  </td>
                ) : null}
                <td className="py-2.5 px-2 border-b border-[#F0EDE8]">
                  <span className="inline-flex items-center gap-1">
                    <span className="px-1.5 py-0.5 rounded bg-[#FDF3E3] border border-[#F0C97E] text-[#854F0B] font-bold text-[11px]">{p.discMin ?? "—"}折</span>
                    <span className="text-[#9A9890] text-[11px]">～</span>
                    <span className="px-1.5 py-0.5 rounded bg-[#FDF3E3] border border-[#F0C97E] text-[#854F0B] font-bold text-[11px]">{p.discMax ?? "—"}折</span>
                  </span>
                </td>
                <td className="py-2.5 px-2 border-b border-[#F0EDE8] text-right text-[#C8001A] font-semibold">NT${fmtInt(p.minPrice)}</td>
                <td className="py-2.5 px-2 border-b border-[#F0EDE8] text-[#5A5A5A] text-[11px]">{p.effectiveDate ?? "—"}</td>
                <td className="py-2.5 px-2 border-b border-[#F0EDE8] text-center">
                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap ${sm.cls}`}>{sm.label}</span>
                </td>
                <td className="py-2.5 px-2 border-b border-[#F0EDE8] text-center">
                  <button
                    onClick={() => onEdit(p)}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDF3E3] border border-[#F0C97E] text-[#854F0B] hover:bg-[#854F0B] hover:text-white"
                  >
                    編輯
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AuditTimeline({ policies }: { policies: PricingPolicy[] }) {
  const entries = useMemo(() => {
    const all: Array<{ name: string; entry: PricingPolicy["auditLog"][number] }> = [];
    for (const p of policies) {
      for (const e of p.auditLog) all.push({ name: p.name, entry: e });
    }
    // 依 at 字串倒序（YYYY-MM-DD HH:mm 可字典序比較）
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

/* ────────────── Side panel（新增 / 編輯） ────────────── */

function PricingPanel({
  mode,
  policy,
  isPending,
  onClose,
  onSubmit,
  onStatusChange,
  onDelete,
}: {
  mode: "new" | "edit";
  policy: PricingPolicy | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (input: PricingPolicyInput) => void;
  onStatusChange: (action: "review" | "approve" | "reject") => void;
  onDelete: () => void;
}) {
  const [kind, setKind] = useState<PricingKind>(policy?.kind ?? "parts");
  const [name, setName] = useState(policy?.name ?? "");
  const [code, setCode] = useState(policy?.code ?? "");
  const [series, setSeries] = useState(policy?.series ?? "");
  const [msrp, setMsrp] = useState<string>(policy?.msrp != null ? String(policy.msrp) : "");
  const [cost, setCost] = useState<string>(policy?.cost != null ? String(policy.cost) : "");
  const [discMin, setDiscMin] = useState<string>(policy?.discMin != null ? String(policy.discMin) : "");
  const [discMax, setDiscMax] = useState<string>(policy?.discMax != null ? String(policy.discMax) : "");
  const [effDate, setEffDate] = useState(policy?.effectiveDate ?? "2026-06-01");

  const msrpN = msrp ? Number(msrp) : null;
  const costN = cost ? Number(cost) : null;
  const minN = discMin ? Number(discMin) : null;
  const maxN = discMax ? Number(discMax) : null;
  const margin = msrpN != null && msrpN > 0 && costN != null ? ((msrpN - costN) / msrpN) * 100 : null;
  const discErr = minN != null && maxN != null && minN > maxN ? "折扣下限不得高於上限" : null;

  const status = policy?.status ?? "draft";

  const submit = () =>
    onSubmit({
      kind,
      name,
      code: kind === "vehicle" ? null : code,
      series: kind === "vehicle" ? series : null,
      msrp: msrpN,
      cost: costN,
      disc_min: minN,
      disc_max: maxN,
      effective_date: effDate,
    });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[55]" onClick={isPending ? undefined : onClose} />
      <div className={`fixed top-0 right-0 w-full max-w-[560px] h-screen bg-white z-[56] overflow-y-auto flex flex-col ${isPending ? "pointer-events-none opacity-60" : ""}`}>
        <header className="bg-[#0D2438] px-6 py-4 flex items-center gap-3 border-b-2 border-[#854F0B] shrink-0">
          <div className="text-white text-[16px] font-bold flex-1">
            {mode === "new" ? "新增定價項目" : `編輯定價：${policy?.name ?? ""}`}
          </div>
          <button onClick={onClose} disabled={isPending} className="text-[#8AAABB] text-[20px] hover:text-white">✕</button>
        </header>

        <div className="px-6 py-5 flex-1 space-y-5">
          {/* 狀態列（edit mode）+ 狀態機按鈕 */}
          {mode === "edit" && policy ? (
            <div className="flex items-center gap-2.5 bg-[#FDF3E3] border border-[#F0C97E] rounded-lg px-3.5 py-2.5">
              <div>
                <div className="text-[11px] text-[#5A5A5A]">目前狀態</div>
                <div className="text-[13px] font-bold text-[#854F0B]">{STATUS_META[status].label}</div>
              </div>
              <div className="ml-auto flex gap-1.5">
                {status === "draft" ? (
                  <button onClick={() => onStatusChange("review")} disabled={isPending} className="px-2.5 py-1 rounded text-[11px] font-semibold border bg-[#E1F5EE] text-[#0F6E56] border-[#5DCAA5] hover:bg-[#0F6E56] hover:text-white disabled:opacity-50">送審</button>
                ) : null}
                {status === "review" ? (
                  <>
                    <button onClick={() => onStatusChange("approve")} disabled={isPending} className="px-2.5 py-1 rounded text-[11px] font-semibold border bg-[#E1F5EE] text-[#0F6E56] border-[#5DCAA5] hover:bg-[#0F6E56] hover:text-white disabled:opacity-50">核准生效</button>
                    <button onClick={() => onStatusChange("reject")} disabled={isPending} className="px-2.5 py-1 rounded text-[11px] font-semibold border bg-[#FDECEA] text-[#C8001A] border-[#F5AEAD] hover:bg-[#C8001A] hover:text-white disabled:opacity-50">退回修改</button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* 品項資料 */}
          <FormSection title="品項資料">
            <Field label="品項名稱 *">
              <input value={name} onChange={(e) => setName(e.target.value)} disabled={isPending} placeholder="例：FTR 1200 S / 原廠機油濾心" className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3.5">
              <Field label="品項類別">
                <select value={kind} onChange={(e) => setKind(e.target.value as PricingKind)} disabled={isPending} className={inputCls}>
                  <option value="vehicle">🏍 整車</option>
                  <option value="parts">🔧 零件</option>
                  <option value="accessory">✨ 精品</option>
                </select>
              </Field>
              {kind === "vehicle" ? (
                <Field label="車系">
                  <input value={series} onChange={(e) => setSeries(e.target.value)} disabled={isPending} placeholder="例：FTR" className={inputCls} />
                </Field>
              ) : (
                <Field label="品號">
                  <input value={code} onChange={(e) => setCode(e.target.value)} disabled={isPending} placeholder="例：IM-OIL-FLT-009" className={inputCls} />
                </Field>
              )}
            </div>
          </FormSection>

          {/* 定價設定 */}
          <FormSection title="定價設定">
            <div className="grid grid-cols-2 gap-3.5">
              <Field label="建議售價（NT$）*">
                <input type="number" value={msrp} onChange={(e) => setMsrp(e.target.value)} disabled={isPending} placeholder="例：689000" className={inputCls} />
              </Field>
              <Field label="成本（NT$）">
                <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} disabled={isPending} placeholder="例：480000" className={inputCls} />
              </Field>
            </div>
            <div className="px-3 py-2 bg-[#FAFAF8] border border-[#E0DDD6] rounded text-[13px] font-bold mt-1" style={{ color: margin == null ? "#5A5A5A" : margin >= 30 ? "#0F6E56" : margin >= 20 ? "#854F0B" : "#C8001A" }}>
              標準毛利率：{margin == null ? "— 請輸入售價與成本" : `${margin.toFixed(1)}%`}
            </div>
          </FormSection>

          {/* 折扣授權範圍 */}
          <FormSection title="折扣授權範圍（手動填寫）">
            <div className="grid grid-cols-2 gap-3.5">
              <Field label="折扣下限（門店不得低於）*">
                <input type="number" min={50} max={100} value={discMin} onChange={(e) => setDiscMin(e.target.value)} disabled={isPending} placeholder="例：93" className={`${inputCls} text-center font-bold`} />
              </Field>
              <Field label="折扣上限（定價基準）*">
                <input type="number" min={50} max={100} value={discMax} onChange={(e) => setDiscMax(e.target.value)} disabled={isPending} placeholder="例：100" className={`${inputCls} text-center font-bold`} />
              </Field>
            </div>
            {discErr ? (
              <div className="text-[11px] text-[#C8001A] mt-1.5">❌ {discErr}</div>
            ) : minN != null && maxN != null ? (
              <div className="text-[11px] text-[#0F6E56] mt-1.5">✅ 授權範圍：{minN}折 ～ {maxN}折{msrpN != null ? `（最低 NT$${fmtInt(Math.round((msrpN * minN) / 100))}）` : ""}</div>
            ) : null}
            <div className="text-[11px] text-[#5A5A5A] mt-1.5">⚠️ 門店實際成交均價低於下限時，系統自動標示越界警示供集團監看。</div>
          </FormSection>

          {/* 適用範圍 */}
          <FormSection title="適用範圍">
            <Field label="生效日期">
              <input type="date" value={effDate} onChange={(e) => setEffDate(e.target.value)} disabled={isPending} className={inputCls} />
            </Field>
          </FormSection>
        </div>

        {/* footer */}
        <footer className="px-6 py-4 border-t border-[#E0DDD6] flex gap-2.5 justify-between items-center bg-[#FAFAF8] shrink-0">
          {mode === "edit" ? (
            <button onClick={onDelete} disabled={isPending} className="px-3 py-2 rounded text-[12.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#C8001A] hover:bg-[#fbdcd9] disabled:opacity-50">刪除</button>
          ) : <span />}
          <div className="flex gap-2.5">
            <button onClick={onClose} disabled={isPending} className="px-4 py-2 rounded text-[12.5px] border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50">取消</button>
            <button
              onClick={submit}
              disabled={isPending || !!discErr}
              className="px-5 py-2 rounded text-[12.5px] font-semibold bg-[#854F0B] text-white hover:bg-[#9D5E0D] disabled:opacity-50"
            >
              {isPending ? "儲存中⋯" : mode === "new" ? "建立草稿" : "儲存變更"}
            </button>
          </div>
        </footer>
      </div>
    </>
  );
}

const inputCls =
  "h-[34px] w-full border border-[#E0DDD6] rounded-md px-2.5 text-[13px] bg-white text-[#1A1A1A] focus:outline-none focus:border-[#F5B942] disabled:bg-[#F5F5F5]";

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[12px] font-bold text-[#854F0B] tracking-wider mb-3 pb-1.5 border-b border-[#F0C97E]">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold text-[#5A5A5A]">{label}</label>
      {children}
    </div>
  );
}
