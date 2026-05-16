"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  setSurveyTemplateActiveAction,
  deleteSurveyTemplateAction,
} from "@/lib/sales/survey-templates-actions";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type {
  SurveyKind,
  SurveyTemplateRow,
} from "@/domain/sales-survey-templates";

type Banner = { ok: boolean; msg: string } | null;

export type SurveyTemplateFilters = {
  kind: SurveyKind;
  status: string;
  q: string;
};

const KIND_LABEL: Record<SurveyKind, string> = {
  sales: "銷售電訪",
  aftersales: "售後電訪",
};

export function SurveyTemplatesBoard({
  rows,
  totalCount,
  canEdit,
  filters,
  basePath = "/crm/sales/survey-templates",
}: {
  rows: SurveyTemplateRow[];
  totalCount: number;
  canEdit: boolean;
  filters: SurveyTemplateFilters;
  /** 路徑前綴；sales 走預設值、aftersales 傳 "/crm/aftersales/survey-templates" */
  basePath?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [fStatus, setFStatus] = useState(filters.status);
  const [fQ, setFQ] = useState(filters.q);

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
      q: fQ.trim(),
    });
    startTransition(() => router.push(target));
  };

  const resetFilters = () => {
    setFStatus("all");
    setFQ("");
    startTransition(() =>
      router.push(`${basePath}?kind=${filters.kind}`),
    );
  };

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

  const removeRow = (r: SurveyTemplateRow) => {
    if (
      !confirm(
        `確定刪除問卷「${r.code} ${r.name}」？\n此動作不可復原；若已有電訪紀錄引用會失敗，建議改用「停用」保留歷史。`,
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

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  const columns: DataGridColumn<SurveyTemplateRow>[] = [
    {
      id: "code",
      header: "問卷代碼",
      width: 110,
      hideable: false,
      cell: (r) => (
        <Link
          href={`${basePath}/${r.id}`}
          className="font-mono text-[12px] text-[#185FA5] hover:underline"
        >
          {r.code}
        </Link>
      ),
      exportValue: (r) => r.code,
      sortValue: (r) => r.code,
    },
    {
      id: "name",
      header: "問卷名稱",
      cell: (r) => (
        <div>
          <Link
            href={`${basePath}/${r.id}`}
            className="font-semibold text-[12.5px] text-[#185FA5] hover:underline"
          >
            {r.name}
          </Link>
          {r.description ? (
            <div className="text-[11px] text-[#9A9890] truncate max-w-[360px]">
              {r.description}
            </div>
          ) : null}
        </div>
      ),
      exportValue: (r) => r.name,
      sortValue: (r) => r.name,
    },
    {
      id: "target_segment",
      header: "適用客戶",
      width: 130,
      cell: (r) =>
        r.target_segment ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EEF4FB] text-[#185FA5]">
            {r.target_segment}
          </span>
        ) : (
          <span className="text-[#9A9890] text-[12px]">全部</span>
        ),
      exportValue: (r) => r.target_segment ?? "",
      sortValue: (r) => r.target_segment ?? "",
    },
    {
      id: "question_count",
      header: "題數",
      width: 70,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12px] text-[#2C2C2A]">
          {r.questions.length}
        </span>
      ),
      exportValue: (r) => r.questions.length,
      sortValue: (r) => r.questions.length,
    },
    {
      id: "effective_from",
      header: "起算日",
      width: 110,
      cell: (r) =>
        r.effective_from ? (
          <span className="font-mono text-[11.5px]">{r.effective_from}</span>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => r.effective_from ?? "",
      sortValue: (r) => r.effective_from ?? "",
    },
    {
      id: "effective_to",
      header: "終止日",
      width: 110,
      defaultHidden: true,
      cell: (r) =>
        r.effective_to ? (
          <span className="font-mono text-[11.5px]">{r.effective_to}</span>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => r.effective_to ?? "",
      sortValue: (r) => r.effective_to ?? "",
    },
    {
      id: "is_active",
      header: "狀態",
      width: 80,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${
            r.is_active
              ? "bg-[#EAF3DE] text-[#3B6D11]"
              : "bg-[#F2F2F2] text-[#6B6A68]"
          }`}
        >
          {r.is_active ? "啟用" : "停用"}
        </span>
      ),
      exportValue: (r) => (r.is_active ? "啟用" : "停用"),
      sortValue: (r) => r.is_active,
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          {KIND_LABEL[filters.kind]}問卷
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          CRM
        </span>
        <span className="text-[12px] text-[#9A9890]">
          {filters.kind === "sales"
            ? "成交後電訪問卷模板・題目維護・適用區段"
            : "保養回廠後電訪問卷模板・題目維護・適用區段"}
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
              className={`${inputClass} w-[100px]`}
            >
              <option value="all">全部</option>
              <option value="active">啟用</option>
              <option value="inactive">停用</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[240px]">
            <label className={labelClass}>
              代碼 / 名稱 / 適用客戶 / 描述
            </label>
            <input
              type="text"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
              placeholder="輸入關鍵字..."
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
              data-testid="survey-templates-create-link"
              className={`h-[30px] inline-flex items-center px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] ${canEdit ? "" : "opacity-50 pointer-events-none"}`}
            >
              ＋ 新增問卷
            </Link>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount.toLocaleString("en-US")}</b>{" "}
          份問卷（顯示{" "}
          <b className="text-[#2C2C2A]">{rows.length.toLocaleString("en-US")}</b>{" "}
          份）
        </span>
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey={`sales/crm/survey-templates/${filters.kind}`}
        exportFileName={`sales-survey-${filters.kind}-${new Date().toISOString().slice(0, 10)}`}
        disabled={isPending}
        emptyMessage={
          filters.q || filters.status !== "all"
            ? "無符合條件的問卷，請調整篩選條件"
            : "尚無問卷模板，點右上「＋ 新增問卷」開始建檔"
        }
        rowActionsWidth={210}
        rowActions={(r) => (
          <>
            <Link
              href={`${basePath}/${r.id}`}
              className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              編輯
            </Link>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => toggleActive(r)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              {r.is_active ? "停用" : "啟用"}
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
    </main>
  );
}
