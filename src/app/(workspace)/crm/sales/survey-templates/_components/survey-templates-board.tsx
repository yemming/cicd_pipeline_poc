"use client";

/**
 * CRM02A 銷售電訪問卷設定 — 新版 Board（spec: CRM02A_v1）
 *
 * 結構：
 *   1. 頂部 KPI（4 顆：問卷總數 / 啟用中 / 草稿 / 本月修改）
 *   2. 左 sidebar（問卷狀態 / 適用時機 / 快速工具，三段）
 *   3. 主區「篩選列 + 問卷卡片 grid（3 欄）」
 *   4. 新增問卷 modal（精簡版；建立後跳轉到 detail page 進入完整建立流程）
 *
 * 注意：
 *   - client component 嚴禁 import `@/domain/sales-survey-templates`（server-only），
 *     型別與常數一律走 `@/domain/sales-survey-templates.constants`。
 *   - 寫入動作走 server action，並用 useTransition 控 pending。
 */

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  CrmKpiCard,
  CrmSidebar,
  type CrmSidebarGroup,
} from "@/components/crm";
import {
  APPLICABLE_TIMING_LABEL,
  APPLICABLE_TIMING_DOT,
  APPLICABLE_TIMING_ICON,
  SURVEY_HABC_ICON,
  SURVEY_HABC_LABEL,
  SURVEY_STATUS_BADGE_CLS,
  SURVEY_STATUS_DOT,
  SURVEY_STATUS_LABEL,
  readSurveyHabc,
  readSurveyIcon,
  readSurveyStatus,
  readSurveyTiming,
  readSurveyVersions,
  timingOrderFor,
  type ApplicableTiming,
  type SurveyKind,
  type SurveyStatus,
  type SurveyTemplateFilters,
  type SurveyTemplateKpi,
  type SurveyTemplateRow,
} from "@/domain/sales-survey-templates.constants";
import {
  createSurveyTemplateAction,
  deleteSurveyTemplateAction,
  setSurveyTemplateActiveAction,
  updateSurveyMetadataAction,
} from "@/lib/sales/survey-templates-actions";

type Banner = { ok: boolean; msg: string } | null;

const KIND_LABEL: Record<SurveyKind, string> = {
  sales: "銷售電訪",
  aftersales: "售後電訪",
};

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

export function SurveyTemplatesBoard({
  rows,
  kpi,
  totalCount,
  canEdit,
  filters,
  basePath = "/crm/sales/survey-templates",
}: {
  rows: SurveyTemplateRow[];
  kpi: SurveyTemplateKpi;
  totalCount: number;
  canEdit: boolean;
  filters: SurveyTemplateFilters;
  basePath?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [fQ, setFQ] = useState(filters.q);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [versionModalSurvey, setVersionModalSurvey] =
    useState<SurveyTemplateRow | null>(null);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const buildHref = useCallback(
    (params: Record<string, string>) => {
      const u = new URLSearchParams();
      u.set("kind", filters.kind);
      if (filters.meta_status && filters.meta_status !== "all")
        u.set("meta_status", filters.meta_status);
      if (filters.timing && filters.timing !== "all")
        u.set("timing", filters.timing);
      if (filters.q) u.set("q", filters.q);
      for (const [k, v] of Object.entries(params)) {
        if (v && v !== "all") u.set(k, v);
        else u.delete(k);
      }
      return `${basePath}?${u.toString()}`;
    },
    [basePath, filters.kind, filters.meta_status, filters.timing, filters.q],
  );

  const goWith = useCallback(
    (params: Record<string, string>) => {
      startTransition(() => router.push(buildHref(params)));
    },
    [router, buildHref],
  );

  // ── sidebar 群組 ──
  const sidebarGroups: CrmSidebarGroup[] = useMemo(() => {
    const statusItems = [
      {
        key: "all",
        label: "全部問卷",
        count: kpi.total,
        active: filters.meta_status === "all",
        onClick: () => goWith({ meta_status: "all" }),
      },
      {
        key: "active",
        label: "啟用中",
        count: kpi.active,
        active: filters.meta_status === "active",
        onClick: () => goWith({ meta_status: "active" }),
      },
      {
        key: "draft",
        label: "草稿",
        count: kpi.draft,
        active: filters.meta_status === "draft",
        onClick: () => goWith({ meta_status: "draft" }),
      },
      {
        key: "archived",
        label: "已封存",
        count: kpi.archived,
        active: filters.meta_status === "archived",
        onClick: () => goWith({ meta_status: "archived" }),
      },
    ];
    const timingItems = [
      {
        key: "timing-all",
        label: "全部時機",
        active: filters.timing === "all",
        onClick: () => goWith({ timing: "all" }),
      },
      ...timingOrderFor(filters.kind).map((t) => ({
        key: `timing-${t}`,
        label: `${APPLICABLE_TIMING_ICON[t]} ${APPLICABLE_TIMING_LABEL[t]}`,
        count: kpi.by_timing[t],
        active: filters.timing === t,
        onClick: () => goWith({ timing: t }),
      })),
    ];
    return [
      { key: "status", title: "問卷狀態", items: statusItems },
      { key: "timing", title: "適用時機", items: timingItems },
    ];
  }, [
    kpi.total,
    kpi.active,
    kpi.draft,
    kpi.archived,
    kpi.by_timing,
    filters.kind,
    filters.meta_status,
    filters.timing,
    goWith,
  ]);

  const quickTools =
    filters.kind === "aftersales"
      ? [
          {
            key: "workbench",
            label: "電訪工作台",
            href: "/crm/aftersales/call-tasks",
            icon: "call",
          },
          {
            key: "nps",
            label: "NPS 看板",
            href: "/crm/aftersales/nps",
            icon: "trending_up",
          },
          {
            key: "customer-base",
            label: "售後客戶基盤",
            href: "/crm/aftersales/customer-base",
            icon: "groups",
          },
        ]
      : [
          {
            key: "workbench",
            label: "電訪工作台",
            href: "/crm/sales/call-tasks",
            icon: "call",
          },
          {
            key: "dormant",
            label: "休眠戰敗管理",
            href: "/crm/sales/dormant-leads",
            icon: "schedule",
          },
        ];

  const toggleActive = (r: SurveyTemplateRow) => {
    startTransition(async () => {
      const res = await setSurveyTemplateActiveAction(r.id, !r.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const setStatus = (r: SurveyTemplateRow, status: SurveyStatus) => {
    startTransition(async () => {
      const res = await updateSurveyMetadataAction(r.id, { status });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已設為${SURVEY_STATUS_LABEL[status]}` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = (r: SurveyTemplateRow) => {
    if (
      !confirm(
        `確定刪除問卷「${r.code} ${r.name}」？\n此動作不可復原；若已被電訪紀錄引用會失敗，建議改用「封存」保留歷史。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteSurveyTemplateAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除問卷" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const submitFilter = () => {
    goWith({ q: fQ.trim() });
  };

  // ── 視覺常用 class ──
  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          {KIND_LABEL[filters.kind]}問卷設定
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          {filters.kind === "aftersales" ? "CRM02B" : "CRM02A"}
        </span>
        <span className="text-[12px] text-[#9A9890]">
          {filters.kind === "aftersales"
            ? "SA 話術 + 版本控制 · 啟用中的版本自動套用至 CRM03B 電訪工作台"
            : "問卷版本控制 · 啟用中的版本自動套用至 CRM03A 電訪工作台"}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setShowCreateModal(true)}
            data-testid="survey-templates-open-create-modal"
            className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增問卷
          </button>
        </div>
      </header>

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
          role={banner.ok ? "status" : "alert"}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* KPI 列（4 顆） */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
        data-testid="survey-kpi-row"
      >
        <CrmKpiCard
          icon="quiz"
          label="問卷總數"
          value={kpi.total}
          sub={`含 ${kpi.draft} 草稿 / ${kpi.archived} 封存`}
          accent="navy"
        />
        <CrmKpiCard
          icon="check_circle"
          label="啟用中"
          value={kpi.active}
          sub="套用至 CRM03A 電訪工作台"
          accent="teal"
          active={filters.meta_status === "active"}
          onClick={() => goWith({ meta_status: "active" })}
        />
        <CrmKpiCard
          icon="edit_note"
          label="草稿"
          value={kpi.draft}
          sub="未發布 · 不會被電訪工作台使用"
          accent="amber"
          active={filters.meta_status === "draft"}
          onClick={() => goWith({ meta_status: "draft" })}
        />
        <CrmKpiCard
          icon="history"
          label="本月修改"
          value={kpi.this_month_modified}
          sub="近 30 日有編輯動作的問卷數"
          accent="blue"
        />
      </div>

      {/* 主區：左 sidebar + 右內容 */}
      <div className="flex gap-3 items-start">
        <CrmSidebar groups={sidebarGroups} quickTools={quickTools} />

        <div className="flex-1 min-w-0 space-y-3">
          {/* 篩選列 */}
          <section
            className={`bg-white border border-[#EEECE6] rounded-lg px-4 py-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}
          >
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex flex-col gap-1 flex-1 min-w-[240px]">
                <label className="text-[11px] text-[#9A9890] font-medium">
                  代碼 / 名稱 / 適用客戶 / 描述
                </label>
                <input
                  type="text"
                  value={fQ}
                  onChange={(e) => setFQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitFilter()}
                  placeholder="輸入關鍵字..."
                  className={`${inputClass} w-full`}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">
                  狀態（is_active）
                </label>
                <select
                  value={filters.status}
                  onChange={(e) => goWith({ status: e.target.value })}
                  className={`${inputClass} w-[120px]`}
                >
                  <option value="all">全部</option>
                  <option value="active">啟用</option>
                  <option value="inactive">停用</option>
                </select>
              </div>
              <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  onClick={submitFilter}
                  disabled={isPending}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
                >
                  {isPending ? "查詢中…" : "查詢"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    startTransition(() =>
                      router.push(`${basePath}?kind=${filters.kind}`),
                    )
                  }
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                >
                  重置
                </button>
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
              份問卷（顯示{" "}
              <b className="text-[#2C2C2A]">
                {rows.length.toLocaleString("en-US")}
              </b>{" "}
              份）
            </span>
          </div>

          {/* 問卷卡片 grid */}
          {rows.length === 0 ? (
            <section className="bg-white border border-dashed border-[#D5D3CB] rounded-lg px-6 py-10 text-center text-[12.5px] text-[#9A9890]">
              {filters.q || filters.meta_status !== "all" || filters.timing !== "all"
                ? "無符合條件的問卷，請調整 sidebar 或關鍵字"
                : "尚無問卷模板，點右上「＋ 新增問卷」開始建檔"}
            </section>
          ) : (
            <div
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
              data-testid="survey-card-grid"
            >
              {rows.map((r) => (
                <SurveyTemplateCard
                  key={r.id}
                  row={r}
                  basePath={basePath}
                  canEdit={canEdit}
                  disabled={isPending}
                  onOpenVersions={() => setVersionModalSurvey(r)}
                  onToggleActive={() => toggleActive(r)}
                  onSetStatus={(s) => setStatus(r, s)}
                  onRemove={() => removeRow(r)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 新增問卷 modal */}
      {showCreateModal ? (
        <CreateSurveyModal
          kind={filters.kind}
          onClose={() => setShowCreateModal(false)}
          onCreated={(id) => {
            setShowCreateModal(false);
            showBanner({ ok: true, msg: "✓ 已建立問卷，跳轉到編輯頁" });
            router.push(`${basePath}/${id}`);
            router.refresh();
          }}
        />
      ) : null}

      {/* 版本記錄 modal */}
      {versionModalSurvey ? (
        <VersionHistoryModal
          survey={versionModalSurvey}
          onClose={() => setVersionModalSurvey(null)}
        />
      ) : null}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 問卷卡片
// ──────────────────────────────────────────────────────────────────────────

function SurveyTemplateCard({
  row,
  basePath,
  canEdit,
  disabled,
  onOpenVersions,
  onToggleActive,
  onSetStatus,
  onRemove,
}: {
  row: SurveyTemplateRow;
  basePath: string;
  canEdit: boolean;
  disabled: boolean;
  onOpenVersions: () => void;
  onToggleActive: () => void;
  onSetStatus: (s: SurveyStatus) => void;
  onRemove: () => void;
}) {
  const status = readSurveyStatus(row.metadata);
  const timing = readSurveyTiming(row.metadata);
  const habc = readSurveyHabc(row.metadata);
  const versions = readSurveyVersions(row.metadata);
  const icon = readSurveyIcon(row.metadata, row.kind);
  const versionLabel = versions[0]?.ver ?? "v1";
  const isArchived = status === "archived";

  const accentBorder =
    status === "active"
      ? "border-l-[3px] border-l-[#0F6E56]"
      : status === "draft"
        ? "border-l-[3px] border-l-[#854F0B]"
        : "border-l-[3px] border-l-[#9A9890]";

  return (
    <div
      className={`bg-white border border-[#EEECE6] rounded-lg p-3.5 flex flex-col gap-2.5 ${accentBorder} ${disabled ? "opacity-60" : ""} ${isArchived ? "bg-[#FAFAF8]" : ""}`}
      data-testid={`survey-card-${row.code}`}
    >
      {/* 頭：icon + 名稱 + 狀態 chip */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-lg bg-[#EAF4FB] flex items-center justify-center text-[18px]">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <Link
            href={`${basePath}/${row.id}`}
            className="block text-[13.5px] font-semibold text-[#1A3A5C] hover:underline truncate"
          >
            {row.name}
          </Link>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="font-mono text-[11px] text-[#5A5955]">
              {row.code}
            </span>
            <span className="font-mono text-[11px] text-[#9A9890]">
              · {versionLabel}
            </span>
          </div>
        </div>
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${SURVEY_STATUS_BADGE_CLS[status]}`}
        >
          {SURVEY_STATUS_LABEL[status]}
        </span>
      </div>

      {/* meta：適用時機 + HABC */}
      <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
        {timing ? (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium"
            style={{
              backgroundColor: `${APPLICABLE_TIMING_DOT[timing]}1A`,
              color: APPLICABLE_TIMING_DOT[timing],
            }}
          >
            🎯 {APPLICABLE_TIMING_LABEL[timing]}
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#F2F2F2] text-[#6B6A68]">
            尚未指定時機
          </span>
        )}
        {habc.length > 0 ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#EAF4FB] text-[#185FA5] font-medium">
            HABC: {habc.map((h) => SURVEY_HABC_ICON[h]).join("")}
          </span>
        ) : null}
        {row.target_segment ? (
          <span className="text-[#9A9890]">適用：{row.target_segment}</span>
        ) : null}
      </div>

      {/* spec：題數 / 修改日期 */}
      <div className="grid grid-cols-2 gap-2 text-[11.5px] bg-[#F8F7F4] rounded px-2.5 py-2">
        <div>
          <div className="text-[10.5px] text-[#9A9890]">題數</div>
          <div className="font-mono font-semibold text-[#2C2C2A]">
            {row.questions.length}
          </div>
        </div>
        <div>
          <div className="text-[10.5px] text-[#9A9890]">最後修改</div>
          <div className="font-mono text-[#2C2C2A]">
            {fmtDate(row.updated_at)}
          </div>
        </div>
      </div>

      {/* 操作 button row */}
      <div className="flex items-center gap-1.5 flex-wrap pt-1">
        <Link
          href={`${basePath}/${row.id}`}
          className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-[#185FA5] text-white hover:bg-[#0F4A85]"
        >
          ✎ 編輯題目
        </Link>
        <button
          type="button"
          onClick={onOpenVersions}
          className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
        >
          版本記錄
        </button>
        {status === "draft" && canEdit ? (
          <button
            type="button"
            onClick={() => onSetStatus("active")}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#E1F5EE] border border-[#5DCAA5] text-[#0F6E56] hover:bg-[#d0eee2]"
          >
            ✅ 設為啟用
          </button>
        ) : null}
        {status === "active" && canEdit ? (
          <button
            type="button"
            onClick={() => onSetStatus("archived")}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            📦 封存
          </button>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            disabled={!canEdit}
            onClick={onToggleActive}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
          >
            {row.is_active ? "停用" : "啟用"}
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={onRemove}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
          >
            刪除
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 新增問卷 modal（建立後跳轉 detail page 進行完整編輯）
// ──────────────────────────────────────────────────────────────────────────

function CreateSurveyModal({
  kind,
  onClose,
  onCreated,
}: {
  kind: SurveyKind;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [timing, setTiming] = useState<ApplicableTiming>(
    kind === "aftersales" ? "d3_satisfaction" : "deal_followup",
  );
  const [habc, setHabc] = useState<Record<string, boolean>>({
    H: true,
    A: true,
    B: true,
    C: false,
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const timingOptions = timingOrderFor(kind);

  const inputCls =
    "h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] w-full";

  const submit = () => {
    if (!name.trim()) {
      setError("問卷名稱必填");
      return;
    }
    setError(null);
    const selectedHabc = (Object.keys(habc) as Array<"H" | "A" | "B" | "C">).filter(
      (k) => habc[k],
    );
    startTransition(async () => {
      const res = await createSurveyTemplateAction({
        name: name.trim(),
        kind,
        questions: [],
        is_active: false,
        metadata: {
          applicable_timing: timing,
          target_habc: selectedHabc,
          status: "draft",
        },
      });
      if (res.ok) {
        onCreated(res.data.id);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden">
        <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">
            ＋ 新增問卷
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9A9890] hover:text-[#2C2C2A] text-[18px] leading-none"
            aria-label="關閉"
          >
            ×
          </button>
        </header>
        <div className="px-4 py-4 space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              問卷名稱 <span className="text-[#C8001A]">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：成交後回訪問卷 v1"
              className={inputCls}
              autoFocus
              data-testid="survey-create-name-input"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              適用時機
            </label>
            <select
              value={timing}
              onChange={(e) => setTiming(e.target.value as ApplicableTiming)}
              className={inputCls}
            >
              {timingOptions.map((t) => (
                <option key={t} value={t}>
                  {APPLICABLE_TIMING_ICON[t]} {APPLICABLE_TIMING_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] text-[#9A9890] font-medium">
              適用 HABC 對象（可多選）
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {(["H", "A", "B", "C"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setHabc((s) => ({ ...s, [g]: !s[g] }))}
                  className={`h-[36px] px-3 rounded border text-[12px] flex items-center gap-1.5 ${
                    habc[g]
                      ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                      : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                  }`}
                >
                  <span>{SURVEY_HABC_ICON[g]}</span>
                  <span>{SURVEY_HABC_LABEL[g]}</span>
                </button>
              ))}
            </div>
          </div>
          {error ? (
            <div className="px-3 py-2 rounded bg-[#FDECEA] text-[#CC0000] text-[12px]">
              {error}
            </div>
          ) : null}
          <p className="text-[11.5px] text-[#9A9890] leading-relaxed">
            建立後將跳轉到該問卷的詳情頁，可進一步增刪題目、調整生效區間。預設狀態為「草稿」。
          </p>
        </div>
        <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            data-testid="survey-create-submit"
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
          >
            {isPending ? "建立中…" : "✅ 建立問卷"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 版本記錄 modal
// ──────────────────────────────────────────────────────────────────────────

function VersionHistoryModal({
  survey,
  onClose,
}: {
  survey: SurveyTemplateRow;
  onClose: () => void;
}) {
  const versions = readSurveyVersions(survey.metadata);
  const status = readSurveyStatus(survey.metadata);
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full overflow-hidden">
        <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">
            📋 {survey.code} 問卷版本記錄
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9A9890] hover:text-[#2C2C2A] text-[18px] leading-none"
            aria-label="關閉"
          >
            ×
          </button>
        </header>
        <div
          className="px-4 py-4 space-y-2 max-h-[60vh] overflow-y-auto"
          data-testid="survey-version-list"
        >
          {versions.length === 0 ? (
            <div className="text-[12px] text-[#9A9890] py-4 text-center">
              尚無版本記錄。儲存問卷時會自動寫入 v1。
            </div>
          ) : (
            versions.map((v, idx) => {
              const isCurrent = idx === 0 && !v.archived_at;
              return (
                <div
                  key={`${v.ver}-${idx}`}
                  className={`flex items-start gap-3 p-3 rounded border ${
                    isCurrent
                      ? "border-[#5DCAA5] bg-[#F2FAF6]"
                      : "border-[#EEECE6] bg-white"
                  }`}
                >
                  <span className="font-mono font-semibold text-[13px] text-[#1A3A5C] shrink-0">
                    {v.ver}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-[#2C2C2A]">{v.note}</div>
                    <div className="text-[11px] text-[#9A9890] mt-0.5">
                      {v.date}
                      {v.archived_at
                        ? ` · 已於 ${v.archived_at} 封存`
                        : ""}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${
                      isCurrent && status === "active"
                        ? "bg-[#E1F5EE] text-[#0F6E56]"
                        : "bg-[#F1EFE8] text-[#6B6A68]"
                    }`}
                  >
                    {isCurrent && status === "active"
                      ? "啟用中"
                      : v.archived_at
                        ? "封存"
                        : "舊版"}
                  </span>
                </div>
              );
            })
          )}
        </div>
        <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            關閉
          </button>
        </footer>
      </div>
    </div>
  );
}

// Pull in the additional style token used inline above for sidebar dots.
// We don't render this anywhere—just keep type-imports honest.
void SURVEY_STATUS_DOT;
