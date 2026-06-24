"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { LegalTextRow } from "@/domain/legal-texts";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { LEGAL_DOC_META } from "@/domain/legal-texts.constants";

type Banner = { ok: boolean; msg: string } | null;

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** 每個 doc_key 只顯示 active 版本（最新）在主列表，version history 在 detail 頁看 */
function deduplicateActive(rows: LegalTextRow[]): LegalTextRow[] {
  const activeMap = new Map<string, LegalTextRow>();
  for (const r of rows) {
    if (r.is_active) {
      activeMap.set(r.doc_key, r);
    }
  }
  // 如果某個 doc_key 全部 is_active=false（不正常狀態），還是顯示最新版
  const allKeys = new Set(rows.map((r) => r.doc_key));
  for (const key of allKeys) {
    if (!activeMap.has(key)) {
      const latest = rows.find((r) => r.doc_key === key);
      if (latest) activeMap.set(key, latest);
    }
  }
  return Array.from(activeMap.values()).sort((a, b) =>
    a.doc_key.localeCompare(b.doc_key),
  );
}

export function LegalTextsBoard({ rows }: { rows: LegalTextRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [fQ, setFQ] = useState("");

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };
  void showBanner; // used later via inline handlers

  const activeRows = deduplicateActive(rows);
  const filtered = fQ.trim()
    ? activeRows.filter(
        (r) =>
          r.doc_key.includes(fQ.toLowerCase()) ||
          (r.title ?? "").toLowerCase().includes(fQ.toLowerCase()),
      )
    : activeRows;

  const columns: DataGridColumn<LegalTextRow>[] = [
    {
      id: "doc_key",
      header: "文件代碼",
      width: 220,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/admin/legal-texts/${r.id}`}
          className="font-mono font-semibold text-[#1A3A5C] hover:underline text-[12.5px]"
        >
          {r.doc_key}
        </Link>
      ),
      exportValue: (r) => r.doc_key,
      sortValue: (r) => r.doc_key,
    },
    {
      id: "title",
      header: "標題",
      cell: (r) => {
        const meta = LEGAL_DOC_META[r.doc_key as keyof typeof LEGAL_DOC_META];
        return (
          <span className="flex flex-col gap-0.5">
            <Link
              href={`/admin/legal-texts/${r.id}`}
              className="text-[#185FA5] hover:underline text-[12.5px]"
            >
              {r.title ?? meta?.title ?? r.doc_key}
            </Link>
            {meta && (
              <span className="text-[11px] text-[#9A9890]">{meta.description}</span>
            )}
          </span>
        );
      },
      exportValue: (r) => r.title ?? r.doc_key,
      sortValue: (r) => r.title ?? r.doc_key,
    },
    {
      id: "version",
      header: "版本",
      width: 70,
      align: "right",
      cell: (r) => (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-[#EAF4FB] text-[#185FA5]">
          v{r.version}
        </span>
      ),
      exportValue: (r) => `v${r.version}`,
      sortValue: (r) => r.version,
    },
    {
      id: "is_active",
      header: "狀態",
      width: 80,
      cell: (r) =>
        r.is_active ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF3DE] text-[#3B6D11]">
            ✓ 生效中
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#F2F2F2] text-[#6B6A68]">
            歷史版
          </span>
        ),
      exportValue: (r) => (r.is_active ? "生效中" : "歷史版"),
      sortValue: (r) => (r.is_active ? 1 : 0),
    },
    {
      id: "content_preview",
      header: "內容預覽",
      sortable: false,
      cell: (r) => (
        <span className="text-[11.5px] text-[#5A5955] line-clamp-2 max-w-[360px]">
          {r.content.slice(0, 80)}
          {r.content.length > 80 ? "…" : ""}
        </span>
      ),
      exportValue: (r) => r.content.slice(0, 100),
    },
    {
      id: "updated_at",
      header: "最後更新",
      width: 150,
      cell: (r) => (
        <span className="text-[11.5px] text-[#5A5955]">{formatDateTime(r.updated_at)}</span>
      ),
      exportValue: (r) => formatDateTime(r.updated_at),
      sortValue: (r) => r.updated_at,
    },
  ];

  const submitFilters = () => {
    startTransition(() => router.refresh());
  };

  const resetFilters = () => {
    setFQ("");
    startTransition(() => router.refresh());
  };

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Banner */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}

      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">法律合約文字範本</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          RS04
        </span>
        <span className="text-[12px] text-[#9A9890]">
          合約條款 / 車況揭露聲明可配置內容管理
        </span>
      </header>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">搜尋</label>
            <input
              type="text"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
              placeholder="文件代碼 / 標題"
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none w-[200px]"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={submitFilters}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
            >
              查詢
            </button>
            <button
              onClick={resetFilters}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <Link
              href="/admin/legal-texts/new"
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] inline-flex items-center"
            >
              ＋ 新增範本
            </Link>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{filtered.length}</b> 個文件類型（顯示最新 active 版）
        </span>
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id}
        persistKey="admin/legal-texts"
        exportFileName="legal-texts"
        emptyMessage="沒有符合條件的法律文字範本"
        rowActionsWidth={100}
        rowActions={(r) => (
          <Link
            href={`/admin/legal-texts/${r.id}`}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] inline-flex items-center"
          >
            編輯
          </Link>
        )}
      />
    </main>
  );
}
