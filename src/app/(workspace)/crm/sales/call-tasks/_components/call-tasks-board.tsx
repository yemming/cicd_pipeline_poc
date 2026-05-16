"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  deleteCallTaskAction,
  startCallTaskAction,
} from "@/lib/sales/call-tasks-actions";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  RESULT_LABEL,
  STATUS_BADGE,
  STATUS_LABEL,
} from "@/domain/sales-call-tasks.constants";
import type {
  CallTaskRow,
  CallTaskFilters,
  SurveyLookup,
} from "@/domain/sales-call-tasks";
import type { SurveyKind } from "@/domain/sales-survey-templates";

type Banner = { ok: boolean; msg: string } | null;

const KIND_LABEL: Record<SurveyKind, string> = {
  sales: "銷售電訪",
  aftersales: "售後電訪",
};

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return "—";
  }
}

export function CallTasksBoard({
  rows,
  totalCount,
  canEdit,
  filters,
  currentUserId,
  surveys,
  basePath = "/crm/sales/call-tasks",
}: {
  rows: CallTaskRow[];
  totalCount: number;
  canEdit: boolean;
  filters: CallTaskFilters;
  currentUserId: string | null;
  surveys: SurveyLookup[];
  basePath?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [fStatus, setFStatus] = useState(filters.status);
  const [fAssignee, setFAssignee] = useState(filters.assignee);
  const [fRange, setFRange] = useState(filters.range);
  const [fQ, setFQ] = useState(filters.q);

  // 統計 — 工作檯儀表板用
  const stats = {
    pending: rows.filter((r) => r.status === "pending").length,
    in_progress: rows.filter((r) => r.status === "in_progress").length,
    completed: rows.filter((r) => r.status === "completed").length,
    skipped: rows.filter((r) => r.status === "skipped").length,
    mine:
      currentUserId == null
        ? 0
        : rows.filter((r) => r.assignee_id === currentUserId).length,
  };

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const buildHref = (params: Record<string, string>) => {
    const u = new URLSearchParams();
    u.set("kind", filters.kind);
    for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
    return `${basePath}?${u.toString()}`;
  };

  const submitFilters = () => {
    const target = buildHref({
      status: fStatus !== "all" ? fStatus : "",
      assignee: fAssignee !== "all" ? fAssignee : "",
      range: fRange !== "all" ? fRange : "",
      q: fQ.trim(),
    });
    startTransition(() => router.push(target));
  };

  const resetFilters = () => {
    setFStatus("all");
    setFAssignee("all");
    setFRange("all");
    setFQ("");
    startTransition(() =>
      router.push(`${basePath}?kind=${filters.kind}`),
    );
  };

  const startCall = (r: CallTaskRow) => {
    startTransition(async () => {
      const res = await startCallTaskAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已開始撥打，跳轉到任務詳情" });
        router.push(`${basePath}/${r.id}`);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = (r: CallTaskRow) => {
    if (
      !confirm(
        `確定刪除任務「${r.customer_code ?? "—"} ${r.customer_name ?? ""}」？\n此動作不可復原。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteCallTaskAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除任務" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  const columns: DataGridColumn<CallTaskRow>[] = [
    {
      id: "customer",
      header: "客戶",
      width: 200,
      hideable: false,
      cell: (r) => (
        <div>
          <Link
            href={`${basePath}/${r.id}`}
            className="font-semibold text-[12.5px] text-[#185FA5] hover:underline"
          >
            {r.customer_name ?? "—"}
          </Link>
          <div className="font-mono text-[11px] text-[#9A9890]">
            {r.customer_code ?? ""}
          </div>
        </div>
      ),
      exportValue: (r) => `${r.customer_code ?? ""} ${r.customer_name ?? ""}`,
      sortValue: (r) => r.customer_name ?? "",
    },
    {
      id: "phone",
      header: "聯絡電話",
      width: 130,
      cell: (r) =>
        r.customer_phone ? (
          <a
            href={`tel:${r.customer_phone}`}
            className="font-mono text-[12px] text-[#185FA5] hover:underline"
          >
            {r.customer_phone}
          </a>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => r.customer_phone ?? "",
      sortValue: (r) => r.customer_phone ?? "",
    },
    {
      id: "survey",
      header: "問卷",
      width: 200,
      cell: (r) =>
        r.survey_code ? (
          <div className="flex flex-col">
            <span className="font-mono text-[11px] text-[#185FA5]">
              {r.survey_code}
            </span>
            <span className="text-[12px] text-[#2C2C2A] truncate max-w-[180px]">
              {r.survey_name ?? ""}
            </span>
          </div>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => `${r.survey_code ?? ""} ${r.survey_name ?? ""}`,
      sortValue: (r) => r.survey_code ?? "",
    },
    {
      id: "scheduled_at",
      header: "預定撥打",
      width: 140,
      cell: (r) => (
        <span className="font-mono text-[11.5px]">{fmtDateTime(r.scheduled_at)}</span>
      ),
      exportValue: (r) => fmtDateTime(r.scheduled_at),
      sortValue: (r) => r.scheduled_at ?? "",
    },
    {
      id: "status",
      header: "狀態",
      width: 90,
      cell: (r) => {
        const c = STATUS_BADGE[r.status];
        return (
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap"
            style={{ backgroundColor: c.bg, color: c.fg }}
          >
            {STATUS_LABEL[r.status]}
          </span>
        );
      },
      exportValue: (r) => STATUS_LABEL[r.status],
      sortValue: (r) => r.status,
    },
    {
      id: "call_result",
      header: "通話結果",
      width: 100,
      cell: (r) =>
        r.call_result ? (
          <span className="text-[12px] text-[#2C2C2A]">
            {RESULT_LABEL[r.call_result]}
          </span>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => (r.call_result ? RESULT_LABEL[r.call_result] : ""),
      sortValue: (r) => r.call_result ?? "",
    },
    {
      id: "attempt_count",
      header: "嘗試",
      width: 60,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12px] text-[#2C2C2A]">
          {r.attempt_count}
        </span>
      ),
      exportValue: (r) => r.attempt_count,
      sortValue: (r) => r.attempt_count,
    },
    {
      id: "last_attempt_at",
      header: "最後嘗試",
      width: 140,
      defaultHidden: true,
      cell: (r) => (
        <span className="font-mono text-[11.5px]">
          {fmtDateTime(r.last_attempt_at)}
        </span>
      ),
      exportValue: (r) => fmtDateTime(r.last_attempt_at),
      sortValue: (r) => r.last_attempt_at ?? "",
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          {KIND_LABEL[filters.kind]}工作檯
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          CRM
        </span>
        <span className="text-[12px] text-[#9A9890]">
          {filters.kind === "sales"
            ? "業務人員的撥打任務台・問卷填答・進度追蹤"
            : "保養回訪的撥打任務台・問卷填答・進度追蹤"}
        </span>
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
        {[
          { key: "pending", label: "待撥打", value: stats.pending, bg: "#EAF4FB", fg: "#185FA5" },
          { key: "in_progress", label: "進行中", value: stats.in_progress, bg: "#FDF3E3", fg: "#854F0B" },
          { key: "completed", label: "已完成", value: stats.completed, bg: "#EAF3DE", fg: "#3B6D11" },
          { key: "skipped", label: "已跳過", value: stats.skipped, bg: "#F2F2F2", fg: "#6B6A68" },
          { key: "mine", label: "指派給我", value: stats.mine, bg: "#EBF3FF", fg: "#1A3A5C" },
        ].map((s) => (
          <div
            key={s.key}
            className="bg-white border border-[#EEECE6] rounded-lg px-3 py-2"
          >
            <div className="text-[11px] text-[#9A9890]">{s.label}</div>
            <div
              className="text-[20px] font-semibold"
              style={{ color: s.fg }}
              data-testid={`call-tasks-stat-${s.key}`}
            >
              {s.value}
            </div>
            <div
              className="inline-flex items-center px-1.5 py-0.5 mt-1 rounded-md text-[10.5px] font-medium"
              style={{ backgroundColor: s.bg, color: s.fg }}
            >
              {s.label}
            </div>
          </div>
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
              <option value="pending">待撥打</option>
              <option value="in_progress">進行中</option>
              <option value="completed">已完成</option>
              <option value="skipped">已跳過</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>指派</label>
            <select
              value={fAssignee}
              onChange={(e) => setFAssignee(e.target.value)}
              className={`${inputClass} w-[120px]`}
            >
              <option value="all">全部</option>
              <option value="mine">指派給我</option>
              <option value="unassigned">未指派</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>日期</label>
            <select
              value={fRange}
              onChange={(e) => setFRange(e.target.value)}
              className={`${inputClass} w-[100px]`}
            >
              <option value="all">全部</option>
              <option value="7d">近 7 天</option>
              <option value="30d">近 30 天</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
            <label className={labelClass}>備註關鍵字</label>
            <input
              type="text"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
              placeholder="輸入備註關鍵字..."
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
              href={`${basePath}/new?kind=${filters.kind}`}
              aria-disabled={!canEdit}
              data-testid="call-tasks-create-link"
              className={`h-[30px] inline-flex items-center px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] ${canEdit ? "" : "opacity-50 pointer-events-none"}`}
            >
              ＋ 新增任務
            </Link>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount.toLocaleString("en-US")}</b>{" "}
          筆任務（顯示{" "}
          <b className="text-[#2C2C2A]">{rows.length.toLocaleString("en-US")}</b>{" "}
          筆）
          {surveys.length === 0 ? (
            <span className="ml-2 text-[#CC0000]">
              ⚠ 尚無啟用中問卷，請先到「問卷模板」建立
            </span>
          ) : null}
        </span>
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey={`sales/crm/call-tasks/${filters.kind}`}
        exportFileName={`sales-call-tasks-${filters.kind}-${new Date().toISOString().slice(0, 10)}`}
        disabled={isPending}
        emptyMessage={
          filters.q ||
          filters.status !== "all" ||
          filters.assignee !== "all" ||
          filters.range !== "all"
            ? "無符合條件的任務，請調整篩選條件"
            : "尚無撥打任務，點右上「＋ 新增任務」開始建檔"
        }
        rowActionsWidth={230}
        rowActions={(r) => (
          <>
            <button
              type="button"
              disabled={!canEdit || r.status === "completed"}
              onClick={() => startCall(r)}
              className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
              title="開始撥打（+1 嘗試次數）"
            >
              撥打
            </button>
            <Link
              href={`${basePath}/${r.id}`}
              className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              編輯
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
