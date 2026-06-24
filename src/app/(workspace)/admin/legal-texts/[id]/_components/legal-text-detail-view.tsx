"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  upsertLegalText,
  rollbackLegalText,
  type LegalTextRow,
} from "@/domain/legal-texts";
import { LEGAL_DOC_META, LEGAL_DOC_KEYS, type LegalDocKey } from "@/domain/legal-texts.constants";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit" | "create";

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

function Kv({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[#9A9890]">{label}</span>
      <span className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}>
        {value ?? <span className="text-[#9A9890]">—</span>}
      </span>
    </div>
  );
}

export type LegalTextDetailViewProps = {
  row: LegalTextRow | null;
  history: LegalTextRow[];
  initialMode: Mode;
};

export function LegalTextDetailView({
  row,
  history,
  initialMode,
}: LegalTextDetailViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [banner, setBanner] = useState<Banner>(null);
  const [activeTab, setActiveTab] = useState<"content" | "history">("content");

  // Edit form state
  const [eTitle, setETitle] = useState(row?.title ?? "");
  const [eDocKey, setEDocKey] = useState(row?.doc_key ?? "");
  const [eContent, setEContent] = useState(row?.content ?? "");

  // Create form state (separate from edit)
  const [cDocKey, setCDocKey] = useState<LegalDocKey | string>(LEGAL_DOC_KEYS[0]);
  const [cTitle, setCTitle] = useState("");
  const [cContent, setCContent] = useState("");

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const meta = row
    ? LEGAL_DOC_META[row.doc_key as LegalDocKey] ?? null
    : null;

  const enterEdit = () => {
    setETitle(row?.title ?? "");
    setEDocKey(row?.doc_key ?? "");
    setEContent(row?.content ?? "");
    setMode("edit");
  };

  const cancelEdit = () => {
    setMode("view");
  };

  const saveEdit = () => {
    if (!eContent.trim()) {
      showBanner({ ok: false, msg: "合約內容不得為空" });
      return;
    }
    startTransition(async () => {
      const res = await upsertLegalText({
        doc_key: eDocKey,
        title: eTitle.trim() || null,
        content: eContent,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已儲存（v${res.data.version}）` });
        router.refresh();
        setMode("view");
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const saveCreate = () => {
    if (!cDocKey.trim()) {
      showBanner({ ok: false, msg: "文件代碼不得為空" });
      return;
    }
    if (!cContent.trim()) {
      showBanner({ ok: false, msg: "合約內容不得為空" });
      return;
    }
    startTransition(async () => {
      const res = await upsertLegalText({
        doc_key: cDocKey.trim(),
        title: cTitle.trim() || null,
        content: cContent,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已建立（v${res.data.version}）` });
        router.push(`/admin/legal-texts/${res.data.id}`);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const doRollback = (histRow: LegalTextRow) => {
    if (
      !confirm(
        `確定要將「${histRow.doc_key}」回復到 v${histRow.version}？\n將建立新版本 v${(row?.version ?? histRow.version) + 1}，沿用該版內容。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await rollbackLegalText(histRow.id);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已回復至 v${histRow.version}（新建 v${res.data.version}）` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  // ─── CREATE MODE ──────────────────────────────────────────────────────────
  if (mode === "create") {
    return (
      <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
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

        {/* Breadcrumb + pill bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
            <Link href="/admin/legal-texts" className="hover:text-[#185FA5]">
              法律文字範本
            </Link>
            <span>›</span>
            <span className="text-[#5A5955]">新增範本</span>
            <span className="ml-1 px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B] font-medium">
              建立模式
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => router.push("/admin/legal-texts")}
              className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
            >
              取消
            </button>
            <button
              onClick={saveCreate}
              disabled={isPending}
              className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
            >
              {isPending ? "建立中⋯" : "建立範本"}
            </button>
          </div>
        </div>

        {/* Title card (create) */}
        <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
          <div className="flex flex-col gap-1">
            <div className="text-[11px] tracking-wider text-[#9A9890]">新增法律文字範本</div>
            <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
              （未命名範本）
            </h1>
          </div>
        </header>

        {/* Edit form */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 範本內容</span>
          </header>
          <div className="px-4 py-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">
                  文件代碼 <span className="text-[#CC0000]">*</span>
                </label>
                <select
                  value={cDocKey}
                  onChange={(e) => {
                    setCDocKey(e.target.value);
                    const meta = LEGAL_DOC_META[e.target.value as LegalDocKey];
                    if (meta && !cTitle) setCTitle(meta.title);
                  }}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                >
                  {LEGAL_DOC_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                  <option value="__custom__">自訂代碼…</option>
                </select>
                {cDocKey === "__custom__" && (
                  <input
                    type="text"
                    placeholder="輸入自訂 doc_key（英文底線）"
                    className="mt-1 h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] font-mono focus:border-[#185FA5] focus:outline-none"
                    onChange={(e) => setCDocKey(e.target.value)}
                  />
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">標題</label>
                <input
                  type="text"
                  value={cTitle}
                  onChange={(e) => setCTitle(e.target.value)}
                  placeholder="顯示名稱（可留空用代碼預設）"
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">
                合約內容 <span className="text-[#CC0000]">*</span>
                <span className="ml-2 text-[#9A9890] font-normal">（支援純文字，{"{brand}"} 佔位符將替換為品牌名）</span>
              </label>
              <textarea
                value={cContent}
                onChange={(e) => setCContent(e.target.value)}
                rows={16}
                className="border border-[#D5D3CB] rounded px-3 py-2 text-[12.5px] font-mono focus:border-[#185FA5] focus:outline-none resize-y leading-relaxed"
              />
            </div>
          </div>
        </section>
      </main>
    );
  }

  // ─── VIEW / EDIT MODE ─────────────────────────────────────────────────────
  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
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

      {/* Breadcrumb + pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/admin/legal-texts" className="hover:text-[#185FA5]">
            法律文字範本
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{row?.doc_key}</span>
          {mode === "edit" && (
            <span className="ml-1 px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B] font-medium">
              編輯模式
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {mode === "view" && (
            <>
              <Link
                href="/admin/legal-texts"
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <Link
                href="/admin/legal-texts/new"
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
              >
                新增
              </Link>
              <button
                onClick={enterEdit}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm"
              >
                修改
              </button>
            </>
          )}
          {mode === "edit" && (
            <>
              <button
                onClick={cancelEdit}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={saveEdit}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                {isPending ? "儲存中⋯" : "儲存變更"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">
                法律合約文字範本
              </div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {row?.title ?? meta?.title ?? row?.doc_key}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span className="font-mono text-[#5A5955]">{row?.doc_key}</span>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${
                    row?.is_active
                      ? "bg-[#EAF3DE] text-[#3B6D11]"
                      : "bg-[#F2F2F2] text-[#6B6A68]"
                  }`}
                >
                  {row?.is_active ? "✓ 生效中" : "歷史版"}
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-[#EAF4FB] text-[#185FA5]">
                  v{row?.version}
                </span>
              </div>
              {meta && (
                <p className="mt-1 text-[12px] text-[#5A5955]">{meta.description}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Basic Info KV */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="文件代碼" value={row?.doc_key} mono />
          <Kv label="目前版本" value={`v${row?.version}`} />
          <Kv label="最後更新" value={row ? formatDateTime(row.updated_at) : "—"} />
          <Kv
            label="標題"
            value={
              mode === "edit" ? (
                <input
                  type="text"
                  value={eTitle}
                  onChange={(e) => setETitle(e.target.value)}
                  className="h-[28px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                />
              ) : (
                row?.title ?? <span className="text-[#9A9890]">—</span>
              )
            }
          />
          <Kv label="建立時間" value={row ? formatDateTime(row.created_at) : "—"} />
          <Kv label="歷史版本數" value={history.length} />
        </div>
      </section>

      {/* Tabs: 內容 / 版本歷史 */}
      <div>
        <div
          className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto"
          id="tab-content"
        >
          <div className="flex border-b border-[#EEECE6]">
            {(["content", "history"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r last:border-r-0 ${
                  activeTab === tab
                    ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                    : "text-[#5A5955] hover:bg-[#F8F7F4]"
                }`}
              >
                {tab === "content" ? "合約內容" : `版本歷史（${history.length}）`}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4">
          {activeTab === "content" && (
            <div className="flex flex-col gap-2">
              {mode === "edit" ? (
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890] font-medium">
                    合約內容
                    <span className="ml-2 text-[#9A9890] font-normal">
                      （{"{brand}"} 佔位符將在前端渲染時替換為品牌名）
                    </span>
                  </label>
                  <textarea
                    value={eContent}
                    onChange={(e) => setEContent(e.target.value)}
                    rows={20}
                    className="border border-[#D5D3CB] rounded px-3 py-2 text-[12.5px] font-mono focus:border-[#185FA5] focus:outline-none resize-y leading-relaxed"
                  />
                </div>
              ) : (
                <div className="bg-[#F8F7F4] rounded-lg p-4">
                  <pre className="text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap leading-relaxed font-sans">
                    {row?.content}
                  </pre>
                </div>
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div className="space-y-2">
              {history.length === 0 ? (
                <p className="text-[12.5px] text-[#9A9890]">尚無歷史版本</p>
              ) : (
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-[#EEECE6]">
                      <th className="py-2 text-left text-[11px] text-[#9A9890] w-16">版本</th>
                      <th className="py-2 text-left text-[11px] text-[#9A9890] w-24">狀態</th>
                      <th className="py-2 text-left text-[11px] text-[#9A9890] w-40">更新時間</th>
                      <th className="py-2 text-left text-[11px] text-[#9A9890]">內容摘要</th>
                      <th className="py-2 text-right text-[11px] text-[#9A9890] w-28">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="border-b border-[#EEECE6] last:border-0">
                        <td className="py-2.5">
                          <span className="font-mono font-semibold text-[#1A3A5C]">
                            v{h.version}
                          </span>
                        </td>
                        <td className="py-2.5">
                          {h.is_active ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11] whitespace-nowrap">
                              ✓ 生效中
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68] whitespace-nowrap">
                              歷史
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-[#5A5955]">
                          {formatDateTime(h.updated_at)}
                        </td>
                        <td className="py-2.5 text-[#5A5955] max-w-[300px]">
                          <span className="line-clamp-1">
                            {h.content.slice(0, 60)}
                            {h.content.length > 60 ? "…" : ""}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          {!h.is_active && (
                            <button
                              onClick={() => doRollback(h)}
                              disabled={isPending}
                              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#EAF4FB] border border-[#C1D9EF] text-[#185FA5] hover:bg-[#d6ecf8] disabled:opacity-50"
                            >
                              {isPending ? "⋯" : "回復此版"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
