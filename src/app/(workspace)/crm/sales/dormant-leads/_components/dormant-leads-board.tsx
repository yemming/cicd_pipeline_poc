"use client";

/**
 * 休眠戰敗管理 board v2 — CRM04A / CRM04B
 *
 * 3 個 tab：
 *  - 休眠（Tab 1）：4 KPI 分桶 + Filter + DataGrid（90 天+ 紅左邊框）
 *  - 戰敗 / 流失分析（Tab 2）：4 KPI + recharts 2 BarChart + 分析建議框
 *  - 再接觸排程（Tab 3）：amber callout + 本週清單 + 喚醒計畫 3 box + 手動新增 form
 *
 * 寫入走 sales-dormant-leads-actions + sales-recontact-actions。
 * 資料：rows / stats / recontactRows / recontactPending 都從 page server 撈好傳進來。
 */

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  deleteDormantLeadAction,
  reviveDormantLeadAction,
} from "@/lib/sales/sales-dormant-leads-actions";
import {
  createRecontactAction,
  markRecontactDoneAction,
  rescheduleRecontactAction,
} from "@/lib/sales/sales-recontact-actions";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization/KpiCard";
import { DonutChart } from "@/components/charts/DonutChart";
import {
  DORMANCY_STATUS_BADGE,
  DORMANCY_STATUS_LABEL,
  LOST_REASON_B9_LABEL,
  LOST_REASON_BAR_COLOR,
  LOST_REASON_TAG_BADGE,
  competitorInsight,
  dormancyBucket,
  dormancyCopy,
  lostReasonLabel,
  mapDbToLostReasonB9,
  wakeupPlanStages,
  type DormancyStatus,
  type DormantLeadKind,
  type LostReason,
  type LostReasonB9,
} from "@/domain/sales-dormant-leads.constants";
import {
  LOST_REASON_LABEL as AFTERSALES_LOST_REASON_LABEL,
  type AftersalesLostReason,
} from "@/domain/crm-aftersales-dormant.constants";
import type {
  DormantLeadRow,
  DormantLeadFilters,
  DormantLeadStats,
} from "@/domain/sales-dormant-leads";
import type { RecontactRow } from "@/domain/sales-recontact";
import {
  RECONTACT_METHOD_BADGE,
  RECONTACT_METHOD_LABEL,
  contactMethodsFor,
  type RecontactMethod,
} from "@/domain/sales-recontact.constants";

type Banner = { ok: boolean; msg: string } | null;
type TabKey = "dormant" | "lost-analytics" | "recontact";

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

export function DormantLeadsBoard({
  rows,
  totalCount,
  canEdit,
  filters,
  stats,
  recontactRows = [],
  recontactPending = 0,
  basePath = "/crm/sales/dormant-leads",
  kind = "sales",
}: {
  rows: DormantLeadRow[];
  totalCount: number;
  canEdit: boolean;
  filters: DormantLeadFilters;
  stats: DormantLeadStats;
  recontactRows?: RecontactRow[];
  recontactPending?: number;
  basePath?: string;
  kind?: DormantLeadKind;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [tab, setTab] = useState<TabKey>("dormant");
  // pull 模式：勾選的 lead id 集合（放在最上方、避免 TDZ）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 只依賴 prop kind，必須在下方 useState initializer 引用 isAfter 之前宣告（避免 TDZ）
  const copy = dormancyCopy(kind);
  const reasonMap = lostReasonLabel(kind);
  const isAfter = kind === "aftersales";

  const [fStatus, setFStatus] = useState(filters.status);
  const [fHabc, setFHabc] = useState(filters.habc);
  // 輪11-1：sales 版 reason filter state 用 B9 key；初始時把 URL DB 值反查到 B9
  const [fReason, setFReason] = useState<string>(() => {
    if (!isAfter && filters.reason && filters.reason !== "all") {
      return mapDbToLostReasonB9(filters.reason as LostReason);
    }
    return filters.reason;
  });
  const [fQ, setFQ] = useState(filters.q);

  // 手動新增再接觸 form
  const [recLeadId, setRecLeadId] = useState<string>("");
  const [recMethod, setRecMethod] = useState<RecontactMethod>("phone");
  const [recDate, setRecDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [recRs, setRecRs] = useState<string>("");
  const [recNotes, setRecNotes] = useState<string>("");

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const buildHref = (params: Record<string, string>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
    return `${basePath}${u.toString() ? `?${u}` : ""}`;
  };

  const submitFilters = () => {
    // DB 自 2026-06-23 起直接存 8 類值，reason filter key 即 DB 值（identity，不再轉換）
    const reasonParam = fReason !== "all" ? fReason : "";
    const target = buildHref({
      status: fStatus !== "all" ? fStatus : "",
      habc: fHabc !== "all" ? fHabc : "",
      reason: reasonParam,
      q: fQ.trim(),
    });
    startTransition(() => router.push(target));
  };

  const resetFilters = () => {
    setFStatus("all");
    setFHabc("all");
    setFReason("all");
    setFQ("");
    startTransition(() => router.push(basePath));
  };

  const reviveOne = (r: DormantLeadRow) => {
    startTransition(async () => {
      const res = await reviveDormantLeadAction(r.id, kind);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: isAfter
            ? "✓ 已記錄一次喚回，狀態切到「已喚醒」"
            : "✓ 已記錄一次再接觸，狀態切到「已喚醒」",
        });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = (r: DormantLeadRow) => {
    if (
      !confirm(
        `確定刪除 ${isAfter ? "客戶" : "lead"}「${r.code} ${r.name}」？\n此動作不可復原。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteDormantLeadAction(r.id, kind);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const goSchedule = (r: DormantLeadRow) => {
    setTab("recontact");
    setRecLeadId(r.id);
    setRecRs(r.rs_name ?? "");
    setRecNotes(
      `${r.name}（${r.intent_model ?? "—"}）— 休眠 ${r.dormant_days ?? "?"} 天`,
    );
    // 預填 contact_method：休眠 30-60 = line_sms / 60+ = phone
    const days = r.dormant_days ?? 0;
    setRecMethod(days >= 60 ? "phone" : "line_sms");
  };

  const submitRecontact = () => {
    if (!recLeadId) {
      showBanner({ ok: false, msg: "請從 Tab 1 點「排程」選一筆客戶" });
      return;
    }
    if (!recDate) {
      showBanner({ ok: false, msg: "請選擇預定日期" });
      return;
    }
    const lead = rows.find((r) => r.id === recLeadId);
    if (!lead) {
      showBanner({ ok: false, msg: "找不到對應客戶" });
      return;
    }
    startTransition(async () => {
      const res = await createRecontactAction({
        kind,
        leadId: recLeadId,
        displayName: lead.name,
        contactMethod: recMethod,
        scheduledDate: recDate,
        rsName: recRs || lead.rs_name,
        notes: recNotes,
      });
      if (res.ok) {
        showBanner({
          ok: true,
          msg: isAfter
            ? "✓ 再接觸任務已排程\n已加入 CRM03B 電訪工作台"
            : "✓ 再接觸任務已排程",
        });
        setRecLeadId("");
        setRecNotes("");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const cancelRecontactForm = () => {
    setRecLeadId("");
    setRecNotes("");
    setRecRs("");
  };

  const completeRecontact = (taskId: string, displayName: string) => {
    startTransition(async () => {
      const res = await markRecontactDoneAction(taskId);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ ${displayName} 接觸完成` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const rescheduleRecontact = (taskId: string, displayName: string) => {
    const newDate = prompt(`改期到（YYYY-MM-DD），目前任務：${displayName}`);
    if (!newDate) return;
    startTransition(async () => {
      const res = await rescheduleRecontactAction(taskId, newDate);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ ${displayName} 已改期到 ${newDate}` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  // 全選/取消全選（針對目前頁面的 rows）
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        rows.forEach((r) => next.delete(r.id));
      } else {
        rows.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };
  const columns: DataGridColumn<DormantLeadRow>[] = useMemo(
    () => [
      {
        id: "select",
        header: "勾選",
        width: 44,
        hideable: false,
        sortable: false,
        cell: (r) => (
          <input
            type="checkbox"
            checked={selectedIds.has(r.id)}
            onChange={() =>
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(r.id)) next.delete(r.id);
                else next.add(r.id);
                return next;
              })
            }
            onClick={(e) => e.stopPropagation()}
            className="w-[14px] h-[14px] accent-[#1A3A5C] cursor-pointer"
            aria-label={`選取 ${r.name}`}
          />
        ),
      },
      {
        id: "lead",
        header: isAfter ? "客戶 / 車輛" : "Lead",
        width: 220,
        hideable: false,
        cell: (r) => (
          <div>
            <Link
              href={`${basePath}/${r.id}`}
              className="font-semibold text-[12.5px] text-[#185FA5] hover:underline"
            >
              {r.name}
            </Link>
            <div className="font-mono text-[11px] text-[#9A9890]">{r.code}</div>
            {r.intent_model ? (
              <div className="text-[11px] text-[#5A5955] mt-0.5">
                {r.intent_model}
              </div>
            ) : null}
          </div>
        ),
        exportValue: (r) => `${r.code} ${r.name}`,
        sortValue: (r) => r.name,
      },
      {
        id: "status",
        header: "狀態",
        width: 90,
        cell: (r) => {
          const c = DORMANCY_STATUS_BADGE[r.dormancy_status];
          return (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap"
              style={{ backgroundColor: c.bg, color: c.fg }}
            >
              {DORMANCY_STATUS_LABEL[r.dormancy_status]}
            </span>
          );
        },
        exportValue: (r) => DORMANCY_STATUS_LABEL[r.dormancy_status],
        sortValue: (r) => r.dormancy_status,
      },
      {
        id: "habc",
        header: "HABC",
        width: 70,
        cell: (r) =>
          r.habc ? (
            <span className="font-mono text-[12px] font-semibold text-[#1A3A5C]">
              {r.habc}
            </span>
          ) : (
            <span className="text-[#9A9890] text-[12px]">—</span>
          ),
        exportValue: (r) => r.habc ?? "",
        sortValue: (r) => r.habc ?? "",
      },
      {
        id: "lost_reason",
        header: isAfter ? "流失原因" : "戰敗原因",
        width: 140,
        cell: (r) => {
          if (isAfter) {
            // 裁示三：售後用 aftersales_lost_reason 欄 + 6 類 label
            const reason = r.aftersales_lost_reason as AftersalesLostReason | null;
            if (!reason) return <span className="text-[#9A9890] text-[12px]">—</span>;
            return (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-[#FDECEA] text-[#CC0000]">
                {AFTERSALES_LOST_REASON_LABEL[reason]}
              </span>
            );
          }
          if (!r.lost_reason)
            return <span className="text-[#9A9890] text-[12px]">—</span>;
          const c = LOST_REASON_TAG_BADGE[r.lost_reason];
          return (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap"
              style={{ backgroundColor: c.bg, color: c.fg }}
            >
              {reasonMap[r.lost_reason]}
            </span>
          );
        },
        exportValue: (r) => {
          if (isAfter) {
            const reason = r.aftersales_lost_reason as AftersalesLostReason | null;
            return reason ? AFTERSALES_LOST_REASON_LABEL[reason] : "";
          }
          return r.lost_reason ? reasonMap[r.lost_reason] : "";
        },
        sortValue: (r) => (isAfter ? (r.aftersales_lost_reason ?? "") : (r.lost_reason ?? "")),
      },
      {
        id: "competitor",
        header: isAfter ? "流失對象" : "競品",
        width: 140,
        cell: (r) => (
          <span className="text-[12px] text-[#2C2C2A]">
            {r.competitor_brand ?? "—"}
          </span>
        ),
        exportValue: (r) => r.competitor_brand ?? "",
        sortValue: (r) => r.competitor_brand ?? "",
      },
      {
        id: "dormant_days",
        header: isAfter ? "逾期天數" : "休眠天數",
        width: 100,
        align: "right",
        cell: (r) => {
          if (r.dormant_days == null)
            return <span className="text-[#9A9890]">—</span>;
          const bucket = dormancyBucket(r.dormant_days);
          const isUrgent = r.dormant_days >= 90;
          return (
            <div className="text-right">
              <div
                className="font-mono text-[12.5px] font-semibold"
                style={{ color: isUrgent ? "#C8001A" : "#2C2C2A" }}
              >
                {r.dormant_days} 天
              </div>
              <div className="text-[10.5px] text-[#9A9890]">{bucket.label}</div>
            </div>
          );
        },
        exportValue: (r) => r.dormant_days ?? "",
        sortValue: (r) => r.dormant_days ?? -1,
      },
      {
        id: "revive_attempt_count",
        header: "再接觸",
        width: 80,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px] text-[#2C2C2A]">
            {r.revive_attempt_count}
          </span>
        ),
        exportValue: (r) => r.revive_attempt_count,
        sortValue: (r) => r.revive_attempt_count,
      },
      {
        id: "rs_name",
        header: isAfter ? "負責 SA" : "負責 RS",
        width: 100,
        cell: (r) => r.rs_name ?? "—",
        exportValue: (r) => r.rs_name ?? "",
        sortValue: (r) => r.rs_name ?? "",
      },
      {
        id: "lost_at",
        header: isAfter ? "判定流失日" : "戰敗日",
        width: 110,
        defaultHidden: true,
        cell: (r) => fmtDate(r.lost_at),
        exportValue: (r) => fmtDate(r.lost_at),
        sortValue: (r) => r.lost_at ?? "",
      },
    ],
    // setSelectedIds 是穩定引用（React useState），selectedIds 用來 derive checked 狀態
    [basePath, isAfter, reasonMap, selectedIds],
  );

  // Tab 1 顯示用：tab=dormant 時只看 dormant，tab=lost 時只看 lost（但 Tab 2 KPI 走 stats 全集）
  const tab1Rows = useMemo(
    () => rows.filter((r) => r.dormancy_status === "dormant"),
    [rows],
  );

  // Tab 2 戰敗明細 — 全集 lost
  const tab2Rows = useMemo(
    () => rows.filter((r) => r.dormancy_status === "lost"),
    [rows],
  );

  // 通用 label resolver：依 kind 決定用哪個 label map，避免型別錯誤
  const resolveReasonLabel = (reason: string): string => {
    if (isAfter) {
      return (AFTERSALES_LOST_REASON_LABEL as Record<string, string>)[reason] ?? reason;
    }
    return (reasonMap as Record<string, string>)[reason] ?? reason;
  };

  // Recharts data
  const reasonChartData = useMemo(
    () =>
      stats.reasonBreakdown.map((r) => ({
        key: r.reason,
        label: resolveReasonLabel(r.reason),
        count: r.count,
        pct: r.pct,
        fill: (LOST_REASON_BAR_COLOR as Record<string, string>)[r.reason] ?? "#888",
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stats.reasonBreakdown, reasonMap, isAfter],
  );

  const competitorChartData = useMemo(
    () =>
      stats.competitorBreakdown.slice(0, 6).map((r, i) => ({
        label: r.brand,
        count: r.count,
        pct: r.pct,
        fill: ["#1A1A1A", "#C8001A", "#0F3D8C", "#E05000", "#534AB7", "#888"][
          i % 6
        ],
      })),
    [stats.competitorBreakdown],
  );

  // KPI 卡：4 套版本 — Tab 1 用分桶、Tab 2 用戰敗分析
  // 改用 <KpiCard> + tone 規範（A 級對齊 design tokens）
  const tab1Kpis: Array<{
    label: string;
    value: number | string;
    tone: "blue" | "amber" | "red" | "teal" | "green" | "purple" | "gray";
    sub: string;
  }> = [
    {
      label: isAfter ? "逾期未回廠總數" : "休眠總數",
      value: stats.dormantCount,
      tone: "blue",
      sub: isAfter ? "全部逾期客戶" : "超過 30 天未互動",
    },
    {
      label: "30–60 天",
      value: stats.bucket30_60,
      tone: "amber",
      sub: "早期休眠，喚醒機率較高",
    },
    {
      label: isAfter ? "60–120 天" : "60–90 天",
      value: stats.bucket60_90,
      tone: "red",
      sub: "需主動出擊",
    },
    {
      label: isAfter ? "120 天以上（嚴重）" : "90 天以上",
      value: stats.bucket90plus,
      tone: "red",
      sub: "高流失風險，建議活動喚醒",
    },
  ];

  const tab2Kpis: Array<{
    label: string;
    value: number | string;
    tone: "blue" | "amber" | "red" | "teal" | "green" | "purple" | "gray";
    sub: string;
  }> = [
    {
      label: isAfter ? "本月新增流失" : "本月戰敗",
      value: stats.lostThisMonth,
      tone: "red",
      sub: new Date().toISOString().slice(0, 7).replace("-", "年") + "月",
    },
    {
      label: isAfter ? "本季新增流失" : "本季戰敗",
      value: stats.lostThisQuarter,
      tone: "amber",
      sub: `Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()}`,
    },
    {
      label: isAfter ? "主要流失原因" : "最高戰敗原因",
      value: stats.topLostReason.reason
        ? resolveReasonLabel(stats.topLostReason.reason)
        : "—",
      tone: "amber",
      sub: stats.topLostReason.count ? `${stats.topLostReason.count} 件` : "",
    },
    {
      label: isAfter ? "本月喚回" : "最高競品",
      value: isAfter
        ? stats.revivedThisMonth
        : (stats.topCompetitor.brand ?? "—"),
      tone: isAfter ? "green" : "blue",
      sub: isAfter
        ? "已重新預約進廠"
        : stats.topCompetitor.count
          ? `${stats.topCompetitor.count} 件`
          : "",
    },
  ];

  // DonutChart 用：戰敗原因 top 5（spec A 級要求）
  const reasonDonutData = useMemo(() => {
    return stats.reasonBreakdown.slice(0, 5).map((r) => ({
      name: resolveReasonLabel(r.reason),
      value: r.count,
      color: (LOST_REASON_BAR_COLOR as Record<string, string>)[r.reason] ?? "#888",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.reasonBreakdown, reasonMap, isAfter]);

  const reasonDonutTotal = reasonDonutData.reduce((a, b) => a + b.value, 0);

  const insightLine = competitorInsight(stats.topCompetitor.brand);
  const tabBaseClass =
    "flex-1 px-4 h-[42px] text-[12.5px] font-medium whitespace-nowrap transition-all";
  const tabActiveClass = `border-b-[3px] ${isAfter ? "border-[#0F6E56]" : "border-[#C8001A]"} text-[#1A3A5C] font-bold bg-white`;
  const tabInactiveClass =
    "border-b-[3px] border-transparent text-[#9A9890] hover:bg-[#F8F7F4]";

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          {copy.title}
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          {copy.sprintChip}
        </span>
        <span className="text-[12px] text-[#9A9890]">{copy.caption}</span>
      </header>

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 whitespace-pre-line ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* Tab Bar */}
      <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
        <div className="flex border-b border-[#EEECE6]">
          <button
            type="button"
            onClick={() => setTab("dormant")}
            className={`${tabBaseClass} ${tab === "dormant" ? tabActiveClass : tabInactiveClass}`}
            data-testid="dormant-tab-1"
          >
            💤 Tab 1　{isAfter ? "逾期未回廠管理" : "休眠客戶管理"}
          </button>
          <button
            type="button"
            onClick={() => setTab("lost-analytics")}
            className={`${tabBaseClass} ${tab === "lost-analytics" ? tabActiveClass : tabInactiveClass}`}
            data-testid="dormant-tab-2"
          >
            {isAfter ? "📊" : "❌"} Tab 2
            {isAfter ? "流失風險分析" : "戰敗原因分析"}
          </button>
          <button
            type="button"
            onClick={() => setTab("recontact")}
            className={`${tabBaseClass} ${tab === "recontact" ? tabActiveClass : tabInactiveClass}`}
            data-testid="dormant-tab-3"
          >
            🔄 Tab 3　{isAfter ? "喚醒再接觸排程" : "再接觸排程"}
          </button>
        </div>
      </div>

      {/* ========== TAB 1：休眠 / 逾期管理 ========== */}
      {tab === "dormant" ? (
        <>
          {/* KPI Row — A 級 KpiCard 對齊 design tokens */}
          <section
            className="grid grid-cols-2 md:grid-cols-4 gap-2"
            data-testid="tab1-kpi-row"
          >
            {tab1Kpis.map((k) => (
              <KpiCard
                key={k.label}
                label={k.label}
                value={k.value}
                tone={k.tone}
                layout="vertical"
              />
            ))}
          </section>

          {/* Filter Bar */}
          <section
            className={`bg-white border border-[#EEECE6] rounded-lg px-4 py-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}
          >
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex flex-col gap-1">
                <label className={labelClass}>狀態</label>
                <select
                  value={fStatus}
                  onChange={(e) => setFStatus(e.target.value)}
                  className={`${inputClass} w-[110px]`}
                >
                  <option value="all">全部</option>
                  <option value="dormant">休眠</option>
                  <option value="lost">{isAfter ? "流失" : "戰敗"}</option>
                  <option value="revived">已喚醒</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>HABC</label>
                <select
                  value={fHabc}
                  onChange={(e) => setFHabc(e.target.value)}
                  className={`${inputClass} w-[90px]`}
                >
                  <option value="all">全部</option>
                  <option value="H">H</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>
                  {isAfter ? "流失原因" : "戰敗原因（8 類）"}
                </label>
                <select
                  value={fReason}
                  onChange={(e) => setFReason(e.target.value)}
                  className={`${inputClass} w-[170px]`}
                >
                  <option value="all">全部原因</option>
                  {isAfter
                    ? (Object.keys(reasonMap) as LostReason[]).map((k) => (
                        <option key={k} value={k}>
                          {reasonMap[k]}
                        </option>
                      ))
                    : (Object.keys(LOST_REASON_B9_LABEL) as LostReasonB9[]).map((k) => (
                        // 篩選時 value 用 B9 key，query 端做對映（或在 URL param 層對映）
                        <option key={k} value={k}>
                          {LOST_REASON_B9_LABEL[k]}
                        </option>
                      ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                <label className={labelClass}>關鍵字</label>
                <input
                  type="text"
                  value={fQ}
                  onChange={(e) => setFQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitFilters()}
                  placeholder={
                    isAfter ? "姓名 / 車牌 / 電話..." : "姓名 / 代碼 / 電話..."
                  }
                  className={`${inputClass} w-full`}
                />
              </div>
              <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  onClick={submitFilters}
                  disabled={isPending}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
                >
                  {isPending ? "查詢中…" : "查詢"}
                </button>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                >
                  重置
                </button>
                <Link
                  href={`${basePath}/new`}
                  aria-disabled={!canEdit}
                  data-testid="dormant-leads-create-link"
                  className={`h-[30px] inline-flex items-center px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] ${canEdit ? "" : "opacity-50 pointer-events-none"}`}
                >
                  ＋ 新增{copy.noun}
                </Link>
              </div>
            </div>
          </section>

          <div className="flex items-center gap-2 flex-wrap">
            {/* 全選 checkbox */}
            <label className="flex items-center gap-1.5 text-[12px] text-[#5A5955] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="w-[14px] h-[14px] accent-[#1A3A5C]"
                aria-label="全選本頁"
              />
              全選本頁
            </label>
            <span className="text-[12px] text-[#9A9890]">
              共{" "}
              <b className="text-[#2C2C2A]">
                {totalCount.toLocaleString("en-US")}
              </b>{" "}
              筆{isAfter ? "休眠／流失客戶" : "休眠／戰敗 lead"}（顯示{" "}
              <b className="text-[#2C2C2A]">
                {rows.length.toLocaleString("en-US")}
              </b>{" "}
              筆）
            </span>
            <span className="inline-flex items-center px-2 py-0.5 text-[11px] rounded-md bg-[#FDECEA] text-[#C8001A] font-medium">
              90 天+ 紅色邊框優先聯繫
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              {/* pull 模式：以勾選名單建立推播 */}
              {canEdit && selectedIds.size > 0 ? (
                <Link
                  href={`${isAfter ? "/crm/aftersales/push-notifications" : "/crm/sales/push-notifications"}?tab=new&lead_ids=${Array.from(selectedIds).join(",")}`}
                  className="h-[26px] inline-flex items-center gap-1 px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                  title={`以勾選的 ${selectedIds.size} 筆 ${isAfter ? "客戶" : "lead"} 建立推播活動`}
                >
                  <span className="material-symbols-outlined text-[13px]">campaign</span>
                  建立推播任務（已選 {selectedIds.size} 筆）
                </Link>
              ) : null}
              {/* 舊版：全量批次（無勾選時顯示） */}
              {canEdit && rows.length > 0 && selectedIds.size === 0 ? (
                <Link
                  href={`${isAfter ? "/crm/aftersales/push-notifications" : "/crm/sales/push-notifications"}?tab=new&lead_ids=${rows.map((r) => r.id).slice(0, 100).join(",")}`}
                  className="h-[26px] inline-flex items-center gap-1 px-2.5 rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
                  title={`以目前 ${rows.length} 筆${isAfter ? "休眠客戶" : "休眠 lead"}建立推播活動`}
                >
                  <span className="material-symbols-outlined text-[13px]">campaign</span>
                  批次推播（{rows.length} 筆）
                </Link>
              ) : null}
            </div>
          </div>

          {/* Table — 90 天+ 用 outline color 標示 */}
          <DataGrid
            columns={columns}
            data={rows}
            rowKey={(r) => r.id}
            persistKey={
              isAfter
                ? "aftersales/crm/dormant-customers"
                : "sales/crm/dormant-leads"
            }
            exportFileName={`${isAfter ? "aftersales-dormant" : "dormant-leads"}-${new Date().toISOString().slice(0, 10)}`}
            disabled={isPending}
            emptyMessage={
              filters.q !== "" ||
              filters.status !== "all" ||
              filters.habc !== "all" ||
              filters.reason !== "all"
                ? `無符合條件的${copy.noun}，請調整篩選`
                : isAfter
                  ? "尚無休眠／流失客戶，這是好事 🎉"
                  : "尚無休眠／戰敗 lead，這是好事 🎉"
            }
            rowActionsWidth={220}
            rowActions={(r) => (
              <>
                <Link
                  href={
                    isAfter
                      ? "/crm/aftersales/call-tasks/new"
                      : "/crm/sales/call-tasks/new"
                  }
                  className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
                  title={isAfter ? "建立電訪任務" : "建立電訪任務"}
                >
                  電訪
                </Link>
                <button
                  type="button"
                  disabled={!canEdit || r.dormancy_status === "converted"}
                  onClick={() => goSchedule(r)}
                  className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                  title="跳到再接觸排程 Tab 並預填客戶"
                >
                  排程
                </button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => reviveOne(r)}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                  title="記錄一次再接觸（+1）"
                >
                  +1
                </button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => removeRow(r)}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                >
                  刪除
                </button>
              </>
            )}
          />
          {/* 90 天+ 高亮提示（卡片型 list 用 cust-row 才能展示左邊框，DataGrid 整列無法直接動 row style；
              這裡用列出「90 天+ 紅標客戶」附加卡片補完設計意圖。 */}
          {tab1Rows.filter((r) => (r.dormant_days ?? 0) >= 90).length > 0 ? (
            <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FDECEA]">
                <h2 className="text-[13px] font-semibold text-[#C8001A]">
                  🔴 90 天以上高風險客戶（{tab1Rows.filter((r) => (r.dormant_days ?? 0) >= 90).length} 位）— 建議優先聯繫
                </h2>
              </header>
              <div className="px-4 py-3 flex flex-col gap-1.5">
                {tab1Rows
                  .filter((r) => (r.dormant_days ?? 0) >= 90)
                  .slice(0, 10)
                  .map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 bg-[#FDECEA] border-l-4 border-[#C8001A] rounded px-3 py-2 text-[12.5px]"
                    >
                      <span className="font-semibold text-[#2C2C2A]">
                        🔴 {r.name}
                      </span>
                      <span className="text-[11.5px] text-[#9A9890]">
                        {r.code} · {r.intent_model ?? "—"}
                      </span>
                      <span className="ml-auto font-mono text-[12px] text-[#C8001A]">
                        {r.dormant_days} 天
                      </span>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => goSchedule(r)}
                        className="h-[24px] px-2 rounded text-[11px] font-medium bg-[#C8001A] text-white hover:bg-[#A40015] disabled:opacity-50"
                      >
                        立即排程
                      </button>
                    </div>
                  ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {/* ========== TAB 2：戰敗 / 流失分析 ========== */}
      {tab === "lost-analytics" ? (
        <>
          {/* KPI Row — A 級 KpiCard */}
          <section
            className="grid grid-cols-2 md:grid-cols-4 gap-2"
            data-testid="tab2-kpi-row"
          >
            {tab2Kpis.map((k) => (
              <KpiCard
                key={k.label}
                label={k.label}
                value={k.value}
                tone={k.tone}
                layout="vertical"
              />
            ))}
          </section>

          {/* Donut：戰敗原因 Top 5（A 級新增） */}
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
              <span className="w-7 h-7 rounded bg-[#FDF3E3] flex items-center justify-center text-[13px]">
                🍩
              </span>
              <div>
                <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
                  {isAfter ? "流失原因 Top 5" : "戰敗原因 Top 5"}
                </h2>
                <p className="text-[11px] text-[#9A9890]">
                  主要{isAfter ? "流失" : "戰敗"}原因佔比結構
                </p>
              </div>
            </header>
            <div className="px-4 py-3">
              {reasonDonutData.length === 0 ? (
                <div className="text-[12px] text-[#9A9890] py-12 text-center">
                  {isAfter ? "尚無流失紀錄" : "尚無戰敗紀錄"}
                </div>
              ) : (
                <div
                  className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 items-center"
                  data-testid="lost-reason-donut"
                >
                  <DonutChart
                    data={reasonDonutData}
                    size="md"
                    centerLabel={`${reasonDonutTotal}`}
                    centerCaption={isAfter ? "件流失" : "件戰敗"}
                    showTooltip
                  />
                  <ul className="flex flex-col gap-1.5">
                    {reasonDonutData.map((d) => {
                      const pct =
                        reasonDonutTotal === 0
                          ? 0
                          : Math.round((d.value / reasonDonutTotal) * 100);
                      return (
                        <li
                          key={d.name}
                          className="flex items-center gap-2 text-[12px] text-[#2C2C2A]"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: d.color }}
                          />
                          <span className="flex-1 truncate">{d.name}</span>
                          <span className="font-mono text-[12px] text-[#5A5955]">
                            {d.value}
                          </span>
                          <span className="font-mono text-[11px] text-[#9A9890] w-10 text-right">
                            {pct}%
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </section>

          {/* 兩欄圖表 */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* 戰敗原因 BarChart */}
            <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
                <span className="w-7 h-7 rounded bg-[#FDECEA] flex items-center justify-center text-[13px]">
                  📊
                </span>
                <div>
                  <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
                    {isAfter ? "流失風險原因分佈" : "戰敗原因分佈"}
                  </h2>
                  <p className="text-[11px] text-[#9A9890]">
                    {isAfter ? "本季累計（含逾期 + NPS）" : "本季累計"}
                  </p>
                </div>
              </header>
              <div className="px-2 py-3" style={{ height: 280 }}>
                {reasonChartData.length === 0 ? (
                  <div className="text-[12px] text-[#9A9890] py-12 text-center">
                    {isAfter ? "尚無流失紀錄" : "尚無戰敗紀錄"}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={reasonChartData}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 90, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#EEECE6"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: "#9A9890" }}
                      />
                      <YAxis
                        dataKey="label"
                        type="category"
                        tick={{ fontSize: 11, fill: "#5A5955" }}
                        width={85}
                      />
                      <Tooltip
                        contentStyle={{
                          fontSize: 12,
                          borderRadius: 6,
                          border: "1px solid #EEECE6",
                        }}
                        formatter={(value, _name, item) => {
                          const v = typeof value === "number" ? value : 0;
                          const pct =
                            (item as { payload?: { pct?: number } }).payload
                              ?.pct ?? 0;
                          return [`${v} 件（${pct}%）`, "件數"];
                        }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {reasonChartData.map((d) => (
                          <Cell key={d.key} fill={d.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* 競品流向 BarChart + Insight */}
            <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
                <span className="w-7 h-7 rounded bg-[#EAF4FB] flex items-center justify-center text-[13px]">
                  {isAfter ? "⭐" : "🏍️"}
                </span>
                <div>
                  <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
                    {isAfter ? "流失對象分佈" : "競品流向分佈"}
                  </h2>
                  <p className="text-[11px] text-[#9A9890]">
                    {isAfter
                      ? `流失到他廠 / 自行保養的 ${stats.competitorBreakdown.reduce((a, b) => a + b.count, 0)} 件`
                      : `流失至競品的 ${stats.competitorBreakdown.reduce((a, b) => a + b.count, 0)} 件`}
                  </p>
                </div>
              </header>
              <div className="px-2 pt-3" style={{ height: 220 }}>
                {competitorChartData.length === 0 ? (
                  <div className="text-[12px] text-[#9A9890] py-12 text-center">
                    {isAfter ? "尚無流失對象紀錄" : "尚無競品流向紀錄"}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={competitorChartData}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#EEECE6"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: "#9A9890" }}
                      />
                      <YAxis
                        dataKey="label"
                        type="category"
                        tick={{ fontSize: 11, fill: "#5A5955" }}
                        width={95}
                      />
                      <Tooltip
                        contentStyle={{
                          fontSize: 12,
                          borderRadius: 6,
                          border: "1px solid #EEECE6",
                        }}
                        formatter={(value, _name, item) => {
                          const v = typeof value === "number" ? value : 0;
                          const pct =
                            (item as { payload?: { pct?: number } }).payload
                              ?.pct ?? 0;
                          return [`${v} 件（${pct}%）`, "件數"];
                        }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {competitorChartData.map((d) => (
                          <Cell key={d.label} fill={d.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              {insightLine ? (
                <div className="mx-3 my-3 bg-[#F4F3F0] rounded px-3 py-2 text-[12px] text-[#5A5955]">
                  💡 <b className="text-[#2C2C2A]">分析建議：</b>
                  {insightLine}
                </div>
              ) : null}
            </div>
          </section>

          {/* 戰敗 / 流失明細 */}
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
              <span className="w-7 h-7 rounded bg-[#FDECEA] flex items-center justify-center text-[13px]">
                📋
              </span>
              <div>
                <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
                  {isAfter ? "流失記錄明細" : "戰敗記錄明細"}
                </h2>
                <p className="text-[11px] text-[#9A9890]">
                  共 {tab2Rows.length} 件
                </p>
              </div>
            </header>
            <div className="px-2 py-2">
              {tab2Rows.length === 0 ? (
                <div className="text-[12px] text-[#9A9890] py-6 text-center">
                  尚無紀錄
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 px-2">
                  {tab2Rows.slice(0, 20).map((r) => {
                    // 裁示三：依 kind 決定顯示哪個 reason 欄
                    const aftersalesReason = isAfter ? (r.aftersales_lost_reason as AftersalesLostReason | null) : null;
                    const salesReasonColor = !isAfter && r.lost_reason ? LOST_REASON_TAG_BADGE[r.lost_reason] : null;
                    return (
                      <div
                        key={r.id}
                        className="grid grid-cols-[1.5fr_110px_140px_120px_auto] gap-3 items-center px-3 py-2 border border-[#EEECE6] rounded bg-[#FAFAF8] hover:border-[#185FA5]/40 text-[12px]"
                      >
                        <div>
                          <div className="font-semibold text-[#2C2C2A]">
                            {r.name}
                          </div>
                          <div className="text-[11px] text-[#9A9890]">
                            {r.intent_model ?? "—"}
                          </div>
                        </div>
                        <div className="font-mono text-[11.5px] text-[#5A5955]">
                          {fmtDate(r.lost_at)}
                        </div>
                        <div>
                          {isAfter && aftersalesReason ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDECEA] text-[#CC0000]">
                              {AFTERSALES_LOST_REASON_LABEL[aftersalesReason]}
                            </span>
                          ) : salesReasonColor ? (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium"
                              style={{
                                backgroundColor: salesReasonColor.bg,
                                color: salesReasonColor.fg,
                              }}
                            >
                              {reasonMap[r.lost_reason!]}
                            </span>
                          ) : (
                            <span className="text-[#9A9890]">—</span>
                          )}
                        </div>
                        <div className="text-[11.5px] text-[#5A5955]">
                          {r.competitor_brand ?? "—"}
                        </div>
                        <div>
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => goSchedule(r)}
                            className="h-[24px] px-2 rounded text-[11px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                          >
                            再接觸
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}

      {/* ========== TAB 3：再接觸排程 ========== */}
      {tab === "recontact" ? (
        <>
          {/* Amber callout */}
          <div className="bg-[#FDF3E3] border border-[#F0C97E] rounded-lg px-4 py-3 text-[12.5px] text-[#854F0B] leading-relaxed">
            ⚡ <b>{isAfter ? "SA 側喚醒原則：" : "再接觸原則："}</b>
            {isAfter
              ? "逾期 30 天 → CRM03B 自動建立回廠提醒電訪任務；60 天 → SA 主動電話關懷；90 天 → 主管確認後執行最後接觸；120 天以上 → 標記長期休眠，轉入存檔管理，不再主動推送。"
              : "休眠 30 天 → 活動邀請簡訊；60 天 → RS 電話關懷；90 天以上 → 主管確認後最後接觸，無回應轉長期休眠。"}
          </div>

          {/* 本週待再接觸 */}
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
              <span className="w-7 h-7 rounded bg-[#FDF3E3] flex items-center justify-center text-[13px]">
                📅
              </span>
              <div>
                <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
                  本週待再接觸清單
                </h2>
                <p className="text-[11px] text-[#9A9890]">
                  系統依{isAfter ? "逾期" : "休眠"}天數自動排程，urgent 優先
                </p>
              </div>
              <span className="ml-auto inline-flex items-center px-2 py-0.5 text-[11px] rounded-md bg-[#FDECEA] text-[#C8001A] font-medium">
                {recontactPending} 件待處理
              </span>
            </header>
            <div className="px-3 py-3 flex flex-col gap-1.5">
              {recontactRows.length === 0 ? (
                <div className="text-[12px] text-[#9A9890] py-6 text-center">
                  本週尚無再接觸排程，可在下方表單手動新增
                </div>
              ) : (
                recontactRows.map((t) => {
                  const urgent = (t.overdue_days ?? 0) >= 90;
                  const methodBadge = RECONTACT_METHOD_BADGE[t.contact_method];
                  return (
                    <div
                      key={t.id}
                      className={`grid grid-cols-[1.3fr_110px_100px_90px_1.2fr_auto] gap-3 items-center px-3 py-2 border rounded text-[12px] ${urgent ? "border-[#F5AEAD] bg-[#FDECEA]" : "border-[#EEECE6] bg-white"}`}
                    >
                      <div>
                        <div className="font-semibold text-[#2C2C2A]">
                          {urgent ? "🔴 " : ""}
                          {t.display_name}
                        </div>
                        <div className="text-[11px] text-[#9A9890]">
                          {t.overdue_days != null
                            ? `${isAfter ? "逾期" : "休眠"} ${t.overdue_days} 天`
                            : ""}
                        </div>
                      </div>
                      <div>
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] font-medium"
                          style={{
                            backgroundColor: methodBadge.bg,
                            color: methodBadge.fg,
                          }}
                        >
                          {RECONTACT_METHOD_LABEL[t.contact_method]}
                        </span>
                      </div>
                      <div className="font-mono text-[11.5px] text-[#5A5955]">
                        {fmtDate(t.scheduled_at)}
                      </div>
                      <div className="text-[11.5px] text-[#5A5955]">
                        {t.rs_name ?? "—"}
                      </div>
                      <div className="text-[11.5px] text-[#9A9890] truncate">
                        {t.notes ?? "—"}
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => completeRecontact(t.id, t.display_name)}
                          className="h-[24px] px-2 rounded text-[11px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                        >
                          ✅ 完成
                        </button>
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() =>
                            rescheduleRecontact(t.id, t.display_name)
                          }
                          className="h-[24px] px-2 rounded text-[11px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                        >
                          📅 改期
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* 喚醒計畫 3 階段 plan-box */}
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
              <span className="w-7 h-7 rounded bg-[#E1F5EE] flex items-center justify-center text-[13px]">
                📋
              </span>
              <div>
                <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
                  {isAfter ? "SA 喚醒計畫模板" : "再接觸計畫模板"}
                </h2>
                <p className="text-[11px] text-[#9A9890]">
                  依{isAfter ? "逾期" : "休眠"}階段自動建議接觸方式
                </p>
              </div>
            </header>
            <div className="px-4 py-3 flex flex-col gap-2.5">
              {wakeupPlanStages(kind).map((stage) => (
                <div
                  key={stage.key}
                  className="rounded-lg border-[1.5px] px-3.5 py-3"
                  style={{
                    backgroundColor: stage.color.bg,
                    borderColor: stage.color.bd,
                  }}
                >
                  <div
                    className="text-[12.5px] font-bold mb-2"
                    style={{ color: stage.color.fg }}
                  >
                    {stage.title}
                  </div>
                  <ol className="flex flex-col gap-1.5">
                    {stage.steps.map((s, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-[12px] text-[#2C2C2A]"
                      >
                        <span
                          className="w-[18px] h-[18px] rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5"
                          style={{ backgroundColor: stage.color.stepBg }}
                        >
                          {i + 1}
                        </span>
                        <span dangerouslySetInnerHTML={{ __html: s }} />
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>

          {/* 手動新增再接觸 form */}
          <section
            className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${isPending ? "pointer-events-none opacity-60" : ""}`}
          >
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
              <span className="w-7 h-7 rounded bg-[#E1F5EE] flex items-center justify-center text-[13px]">
                ➕
              </span>
              <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
                手動新增再接觸任務
              </h2>
              {recLeadId ? (
                <span className="ml-auto inline-flex items-center px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B] font-medium">
                  已選定：
                  {rows.find((r) => r.id === recLeadId)?.name ?? "—"}
                </span>
              ) : (
                <span className="ml-auto text-[11px] text-[#9A9890]">
                  尚未選定客戶 — 請從 Tab 1 點「排程」
                </span>
              )}
            </header>
            <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className={labelClass}>
                  {isAfter ? "客戶 / 車牌" : "客戶姓名"}
                </label>
                <select
                  value={recLeadId}
                  onChange={(e) => setRecLeadId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">— 請選擇客戶 —</option>
                  {rows
                    .filter((r) =>
                      ["dormant", "lost", "revived"].includes(
                        r.dormancy_status,
                      ),
                    )
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}（{r.code} · {r.intent_model ?? "—"}）
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>接觸方式</label>
                <select
                  value={recMethod}
                  onChange={(e) =>
                    setRecMethod(e.target.value as RecontactMethod)
                  }
                  className={inputClass}
                >
                  {contactMethodsFor(kind).map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>預定接觸日期</label>
                <input
                  type="date"
                  value={recDate}
                  onChange={(e) => setRecDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>
                  {isAfter ? "負責 SA" : "負責 RS"}
                </label>
                <input
                  type="text"
                  value={recRs}
                  onChange={(e) => setRecRs(e.target.value)}
                  placeholder={
                    isAfter ? "例：許明志 / 林雅婷" : "例：陳志明 / 林雅婷"
                  }
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-2 flex flex-col gap-1">
                <label className={labelClass}>
                  {isAfter ? "接觸切入點 / 備注" : "接觸備注 / 切入點"}
                </label>
                <textarea
                  value={recNotes}
                  onChange={(e) => setRecNotes(e.target.value)}
                  rows={3}
                  placeholder={
                    isAfter
                      ? "例：客戶 Desmo 皮帶已超期 2 個月，上次表示近期較忙，請再次提醒風險並協助預約..."
                      : "例：客戶曾對 Panigale V4 S 感興趣但考量價格，可借力新年式發表引導..."
                  }
                  className="border border-[#D5D3CB] rounded px-2 py-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] resize-none"
                />
              </div>
              <div className="md:col-span-2 flex justify-end gap-2 mt-1">
                <button
                  type="button"
                  onClick={cancelRecontactForm}
                  disabled={isPending}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={submitRecontact}
                  disabled={isPending || !canEdit}
                  className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                  data-testid="recontact-submit"
                >
                  {isPending ? "排程中…" : "確認排程"}
                </button>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}

// dormancy enum for column filter narrow
export type { DormancyStatus };
