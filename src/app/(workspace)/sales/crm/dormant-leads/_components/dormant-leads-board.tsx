"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  deleteDormantLeadAction,
  reviveDormantLeadAction,
} from "@/lib/sales/sales-dormant-leads-actions";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  DORMANCY_STATUS_BADGE,
  DORMANCY_STATUS_LABEL,
  dormancyBucket,
  dormancyCopy,
  lostReasonLabel,
  type DormancyStatus,
  type DormantLeadKind,
  type LostReason,
} from "@/domain/sales-dormant-leads.constants";
import type {
  DormantLeadRow,
  DormantLeadFilters,
  DormantLeadStats,
} from "@/domain/sales-dormant-leads";

type Banner = { ok: boolean; msg: string } | null;

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
  basePath = "/sales/crm/dormant-leads",
  kind = "sales",
}: {
  rows: DormantLeadRow[];
  totalCount: number;
  canEdit: boolean;
  filters: DormantLeadFilters;
  stats: DormantLeadStats;
  basePath?: string;
  kind?: DormantLeadKind;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [fStatus, setFStatus] = useState(filters.status);
  const [fHabc, setFHabc] = useState(filters.habc);
  const [fReason, setFReason] = useState(filters.reason);
  const [fQ, setFQ] = useState(filters.q);

  const copy = dormancyCopy(kind);
  const reasonMap = lostReasonLabel(kind);

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
    const target = buildHref({
      status: fStatus !== "all" ? fStatus : "",
      habc: fHabc !== "all" ? fHabc : "",
      reason: fReason !== "all" ? fReason : "",
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
      const res = await reviveDormantLeadAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已記錄一次再接觸，狀態切到「已喚醒」" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = (r: DormantLeadRow) => {
    if (
      !confirm(
        `確定刪除 lead「${r.code} ${r.name}」？\n此動作不可復原。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteDormantLeadAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  const columns: DataGridColumn<DormantLeadRow>[] = [
    {
      id: "lead",
      header: "Lead",
      width: 200,
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
      id: "intent_model",
      header: kind === "aftersales" ? "保養車型" : "意向車型",
      width: 150,
      cell: (r) => (
        <span className="text-[12px] text-[#2C2C2A]">
          {r.intent_model ?? "—"}
        </span>
      ),
      exportValue: (r) => r.intent_model ?? "",
      sortValue: (r) => r.intent_model ?? "",
    },
    {
      id: "lost_reason",
      header: kind === "aftersales" ? "流失原因" : "戰敗原因",
      width: 130,
      cell: (r) =>
        r.lost_reason ? (
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-[#FDECEA] text-[#CC0000]"
          >
            {reasonMap[r.lost_reason]}
          </span>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => (r.lost_reason ? reasonMap[r.lost_reason] : ""),
      sortValue: (r) => r.lost_reason ?? "",
    },
    {
      id: "competitor",
      header: kind === "aftersales" ? "流失對象" : "競品",
      width: 130,
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
      header: "休眠天數",
      width: 100,
      align: "right",
      cell: (r) => {
        if (r.dormant_days == null)
          return <span className="text-[#9A9890]">—</span>;
        const bucket = dormancyBucket(r.dormant_days);
        return (
          <div className="text-right">
            <div className="font-mono text-[12.5px] font-semibold text-[#2C2C2A]">
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
      id: "next_revive_at",
      header: "下次接觸",
      width: 110,
      cell: (r) => (
        <span className="font-mono text-[11.5px]">{fmtDate(r.next_revive_at)}</span>
      ),
      exportValue: (r) => fmtDate(r.next_revive_at),
      sortValue: (r) => r.next_revive_at ?? "",
    },
    {
      id: "rs_name",
      header: kind === "aftersales" ? "負責 SA" : "負責 RS",
      width: 100,
      defaultHidden: true,
      cell: (r) => r.rs_name ?? "—",
      exportValue: (r) => r.rs_name ?? "",
      sortValue: (r) => r.rs_name ?? "",
    },
    {
      id: "lost_at",
      header: kind === "aftersales" ? "判定流失日" : "戰敗日",
      width: 110,
      defaultHidden: true,
      cell: (r) => fmtDate(r.lost_at),
      exportValue: (r) => fmtDate(r.lost_at),
      sortValue: (r) => r.lost_at ?? "",
    },
  ];

  const isAfter = kind === "aftersales";
  const STATS = [
    {
      key: "total",
      label: isAfter ? "休眠+流失總數" : "休眠+戰敗總數",
      value: stats.totalDormantOrLost,
      bg: "#FDF3E3",
      fg: "#854F0B",
    },
    {
      key: "dormant",
      label: "休眠中",
      value: stats.dormantCount,
      bg: "#FDF3E3",
      fg: "#854F0B",
    },
    {
      key: "lost",
      label: isAfter ? "流失" : "戰敗",
      value: stats.lostCount,
      bg: "#FDECEA",
      fg: "#CC0000",
    },
    {
      key: "revived",
      label: isAfter ? "本月喚回" : "本月喚醒",
      value: stats.revivedThisMonth,
      bg: "#EAF4FB",
      fg: "#185FA5",
    },
    {
      key: "topReason",
      label: isAfter ? "最高流失原因" : "最高戰敗原因",
      value: stats.topLostReason.reason
        ? reasonMap[stats.topLostReason.reason]
        : "—",
      sub: stats.topLostReason.reason
        ? `${stats.topLostReason.count} 件`
        : "",
      bg: "#F2F2F2",
      fg: "#5A5955",
    },
  ] as const;

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
          className={`px-3 py-2 rounded text-[13px] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11]"
              : "bg-[#FDECEA] text-[#CC0000]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* 統計卡 */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {STATS.map((s) => (
          <div
            key={s.key}
            className="bg-white border border-[#EEECE6] rounded-lg px-3 py-2"
          >
            <div className="text-[11px] text-[#9A9890]">{s.label}</div>
            <div
              className="text-[20px] font-semibold"
              style={{ color: s.fg }}
              data-testid={`dormant-leads-stat-${s.key}`}
            >
              {s.value}
            </div>
            {"sub" in s && s.sub ? (
              <div className="text-[10.5px] text-[#9A9890]">{s.sub}</div>
            ) : (
              <div
                className="inline-flex items-center px-1.5 py-0.5 mt-1 rounded-md text-[10.5px] font-medium"
                style={{ backgroundColor: s.bg, color: s.fg }}
              >
                {s.label}
              </div>
            )}
          </div>
        ))}
      </section>

      {/* 兩欄圖表：原因分佈 + 流向分佈 */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <BreakdownCard
          title={isAfter ? "流失原因分佈" : "戰敗原因分佈"}
          rows={stats.reasonBreakdown.map((r) => ({
            key: r.reason,
            label: reasonMap[r.reason],
            count: r.count,
            pct: r.pct,
          }))}
          emptyMessage={isAfter ? "尚無流失紀錄" : "尚無戰敗紀錄"}
        />
        <BreakdownCard
          title={isAfter ? "流失對象分佈" : "競品流向分佈"}
          rows={stats.competitorBreakdown.map((r) => ({
            key: r.brand,
            label: r.brand,
            count: r.count,
            pct: r.pct,
          }))}
          emptyMessage={isAfter ? "尚無流失對象紀錄" : "尚無競品流向紀錄"}
        />
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
              <option value="lost">戰敗</option>
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
              {isAfter ? "流失原因" : "戰敗原因"}
            </label>
            <select
              value={fReason}
              onChange={(e) => setFReason(e.target.value)}
              className={`${inputClass} w-[150px]`}
            >
              <option value="all">全部原因</option>
              {(Object.keys(reasonMap) as LostReason[]).map((k) => (
                <option key={k} value={k}>
                  {reasonMap[k]}
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
              placeholder="姓名 / 代碼 / 電話..."
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

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共{" "}
          <b className="text-[#2C2C2A]">
            {totalCount.toLocaleString("en-US")}
          </b>{" "}
          筆{isAfter ? "休眠／流失客戶" : "休眠／戰敗 lead"}（顯示{" "}
          <b className="text-[#2C2C2A]">{rows.length.toLocaleString("en-US")}</b>{" "}
          筆）
        </span>
      </div>

      {/* Table */}
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
        rowActionsWidth={230}
        rowActions={(r) => (
          <>
            <button
              type="button"
              disabled={!canEdit || r.dormancy_status === "converted"}
              onClick={() => reviveOne(r)}
              className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
              title={isAfter ? "喚回一次（+1 嘗試）" : "再接觸一次（+1 嘗試）"}
            >
              {isAfter ? "喚回" : "再接觸"}
            </button>
            <Link
              href={`${basePath}/${r.id}`}
              className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              詳情
            </Link>
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
    </main>
  );
}

// 簡單橫條圖 — 戰敗原因 / 競品流向 分佈卡
function BreakdownCard({
  title,
  rows,
  emptyMessage,
}: {
  title: string;
  rows: Array<{ key: string | null; label: string; count: number; pct: number }>;
  emptyMessage: string;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
      </header>
      <div className="px-4 py-3">
        {rows.length === 0 ? (
          <div className="text-[12px] text-[#9A9890] py-2">{emptyMessage}</div>
        ) : (
          <ul className="space-y-2">
            {rows.slice(0, 6).map((r) => (
              <li key={r.key ?? r.label} className="flex items-center gap-2">
                <span className="text-[11.5px] text-[#5A5955] w-[120px] shrink-0 truncate">
                  {r.label}
                </span>
                <div className="flex-1 h-[10px] bg-[#F2F2F2] rounded">
                  <div
                    className="h-full rounded bg-[#1A3A5C]"
                    style={{ width: `${Math.max(2, r.pct)}%` }}
                  />
                </div>
                <span className="font-mono text-[11.5px] text-[#2C2C2A] w-[60px] text-right shrink-0">
                  {r.count} ({r.pct}%)
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// dormancy enum for column filter narrow
export type { DormancyStatus };
