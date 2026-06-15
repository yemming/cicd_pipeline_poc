"use client";

/**
 * TicketForm — 新增意見單的單頁體驗（ticket #8bc5bad2 / Ming 拍板）
 *
 * 順序：URL → 問題描述（必填、title 由 server 自動 derive 第一行）→ 無限畫布（inline）
 * 「發生什麼事？」標題欄已拿掉 — title 從 description 第一行 derive、感覺像跟 AI 對話一句話就送
 * 畫布 buffer 模式：在 client 累積，submit 時跟 ticket 一起送出（一步、不分頁）
 */

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { createTicket } from "@/lib/feedback-actions";
import { CanvasBuffer } from "./canvas-buffer";
import { AttachmentDropzone } from "./attachment-dropzone";

export function TicketForm({ defaultUrl }: { defaultUrl?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState<string>(defaultUrl ?? "");
  const [description, setDescription] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  // ③ 驗收條件（given-when-then）— 一條 = 一個可 E2E 的原子斷言
  const [acceptance, setAcceptance] = useState<{ given: string; when: string; then: string }[]>([]);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  function addCriterion() {
    setAcceptance((prev) => [...prev, { given: "", when: "", then: "" }]);
  }
  function updateCriterion(idx: number, key: "given" | "when" | "then", value: string) {
    setAcceptance((prev) => prev.map((c, i) => (i === idx ? { ...c, [key]: value } : c)));
  }
  function removeCriterion(idx: number) {
    setAcceptance((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const desc = description.trim();
    if (!desc) {
      setError("請填寫「問題是什麼？你想怎麼改？怎麼修復？」（必填）");
      return;
    }

    // 從 Excalidraw 取目前畫面 snapshot；空白畫布不送（不建 canvas row）
    let snapshot: unknown | null = null;
    const api = excalidrawApiRef.current;
    if (api) {
      const elements = api.getSceneElements();
      if (elements.length > 0) {
        const appState = api.getAppState();
        // collaborators 是 Map / 非可序列化，剔除
        const cleanAppState = { ...appState } as Record<string, unknown>;
        delete cleanAppState.collaborators;
        snapshot = {
          elements,
          appState: cleanAppState,
          files: api.getFiles(),
        };
      }
    }

    // ③ 驗收：清掉三欄全空的列
    const cleanAcceptance = acceptance
      .map((c) => ({ id: "", given: c.given.trim(), when: c.when.trim(), then: c.then.trim() }))
      .filter((c) => c.given || c.when || c.then);

    startTransition(async () => {
      const res = await createTicket({
        url: url.trim() || null,
        description: desc,
        snapshot,
        files,
        // ② 範圍：直接用 url 當 route（一張單一條 route）
        scope: url.trim() ? { route: url.trim() } : null,
        acceptance: cleanAcceptance,
      });
      if (res.ok) {
        router.push(`/feedback/tickets/${res.ticketId}`);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-0">
      {/* RWD：xl+（≥1280px）兩欄 — 左 460px 文字、右 1fr 畫布吃滿；以下單欄堆疊 */}
      <div className="bg-white border border-[#DFE1E6] rounded-md overflow-hidden grid xl:grid-cols-[minmax(400px,460px)_1fr]">

        {/* 左欄：URL + 描述（xl 寬螢幕用右邊框分隔，窄螢幕沒邊框） */}
        <div className="xl:border-r xl:border-[#DFE1E6] flex flex-col">
          {/* 1. URL field（從 topbar ＋ 進來自動帶；可手 key） */}
          <div className="px-4 md:px-6 pt-6 pb-4 border-b border-[#F4F5F7]">
            <label className="block text-[12px] font-bold text-[#172B4D] uppercase tracking-wide mb-2">
              哪一個網址？
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={pending}
              placeholder="/sales/showroom 或 https://..."
              className="w-full px-3 py-2 bg-[#F4F5F7] hover:bg-[#EBECF0] border border-transparent rounded focus:bg-white focus:border-[#C9A84C] focus:shadow-[0_0_0_2px_rgba(201,168,76,0.2)] outline-none text-[13px] font-mono text-[#172B4D] placeholder:text-[#8993A4] transition-all disabled:opacity-60"
            />
            <p className="mt-1.5 text-[12px] text-[#6B778C]">
              發現問題的那一頁，複製完整網址或 path 即可（從右上 ＋ 進來會自動帶）
            </p>
          </div>

          {/* 2. Description（必填、title 由 server 從第一行自動 derive） */}
          <div className="px-4 md:px-6 py-4 flex-1 flex flex-col">
            <label className="block text-[12px] font-bold text-[#172B4D] uppercase tracking-wide mb-2">
              問題是什麼？你想怎麼改？怎麼修復？
              <span className="text-[#BF2600] ml-0.5">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={pending}
              rows={7}
              placeholder={"1. 現況如何...\n2. 期望如何...\n3. 補充：..."}
              className="w-full flex-1 min-h-[180px] xl:min-h-[420px] px-3 py-2 bg-[#F4F5F7] hover:bg-[#EBECF0] border border-transparent rounded focus:bg-white focus:border-[#C9A84C] focus:shadow-[0_0_0_2px_rgba(201,168,76,0.2)] outline-none text-[14px] text-[#172B4D] leading-relaxed placeholder:text-[#8993A4] transition-all resize-none disabled:opacity-60"
            />
            <p className="mt-1.5 text-[12px] text-[#6B778C]">
              第一行會自動成為單據標題；右側（窄螢幕在下方）可以直接畫圖補充
            </p>
          </div>

          {/* 4. 驗收條件（given-when-then）— 一條 = 一個可自動 E2E 的原子斷言 */}
          <div className="px-4 md:px-6 py-4 border-t border-[#F4F5F7]">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[12px] font-bold text-[#172B4D] uppercase tracking-wide">
                驗收條件（選填，建議填）
              </label>
              <button
                type="button"
                onClick={addCriterion}
                disabled={pending}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[12px] font-semibold text-[#0052CC] hover:bg-[#DEEBFF] disabled:opacity-50 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                新增條件
              </button>
            </div>

            {acceptance.length === 0 ? (
              <p className="text-[12px] text-[#6B778C] leading-relaxed bg-[#F4F5F7] rounded px-3 py-2">
                寫「做完長怎樣」就能自動測。每條一個動作：<b>給定</b>(情境) →
                <b> 當</b>(操作) → <b>則</b>(看得到的結果)。例：給定「打開此頁」→當「頁面載入」→則「圖表顯示為圓餅圖」。
              </p>
            ) : (
              <div className="space-y-2">
                {acceptance.map((c, idx) => (
                  <div key={idx} className="flex gap-2 items-start bg-[#F4F5F7] rounded px-2.5 py-2">
                    <span className="text-[11px] font-bold text-[#6B778C] font-mono pt-2 shrink-0 w-7">
                      AC{idx + 1}
                    </span>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {(["given", "when", "then"] as const).map((k) => (
                        <div key={k} className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-[#6B778C] w-9 shrink-0 text-right">
                            {k === "given" ? "給定" : k === "when" ? "當" : "則"}
                          </span>
                          <input
                            value={c[k]}
                            onChange={(e) => updateCriterion(idx, k, e.target.value)}
                            disabled={pending}
                            placeholder={
                              k === "given" ? "什麼情境（如：打開此頁、登入後）" : k === "when" ? "做了什麼（如：點儲存、頁面載入）" : "看得到的結果（如：狀態變已儲存）"
                            }
                            className="w-full px-2.5 py-1.5 bg-white border border-[#DFE1E6] rounded focus:border-[#C9A84C] focus:shadow-[0_0_0_2px_rgba(201,168,76,0.2)] outline-none text-[12.5px] text-[#172B4D] placeholder:text-[#8993A4] transition-all disabled:opacity-60"
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCriterion(idx)}
                      disabled={pending}
                      className="text-[#6B778C] hover:text-[#BF2600] disabled:opacity-50 pt-1.5 shrink-0"
                      title="刪除此條"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右欄：inline canvas + 附件區 — xl+ 跟左欄齊高、窄螢幕在下面堆疊 */}
        <div className="px-4 md:px-6 py-4 xl:py-6 flex flex-col gap-4 border-t xl:border-t-0 border-[#F4F5F7]">
          {/* 3a. Canvas */}
          <div className="flex-1 flex flex-col min-h-[360px] xl:min-h-[480px]">
            <label className="block text-[12px] font-bold text-[#172B4D] uppercase tracking-wide mb-2">
              畫布（選填）
            </label>
            <div className="flex-1 min-h-[320px]">
              <CanvasBuffer onApiReady={(api) => { excalidrawApiRef.current = api; }} />
            </div>
            <p className="mt-1.5 text-[11.5px] text-[#6B778C]">
              直接畫圖、貼截圖、拖圖檔；其他格式檔案請丟到下面附件區
            </p>
          </div>

          {/* 3b. 附件區（非圖檔走這） */}
          <div>
            <label className="block text-[12px] font-bold text-[#172B4D] uppercase tracking-wide mb-2">
              附件（選填）
            </label>
            <AttachmentDropzone files={files} onChange={setFiles} disabled={pending} />
          </div>
        </div>
      </div>

      {/* Banner（錯誤） */}
      {error ? (
        <div className="mt-3 px-3 py-2 rounded text-[13px] bg-[#FFEBE6] text-[#BF2600] border border-[#FFBDAD]">
          {error}
        </div>
      ) : null}

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-3 pt-4">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 px-5 py-2 rounded text-[14px] font-semibold bg-[#0052CC] hover:bg-[#0747A6] active:bg-[#05389E] disabled:bg-[#0747A6]/70 disabled:cursor-wait text-white transition-colors"
        >
          {pending ? (
            <>
              <span
                className="inline-block w-3.5 h-3.5 border-[2px] border-white/40 border-t-white rounded-full animate-spin"
                aria-hidden
              />
              建立中…
            </>
          ) : (
            "建立草稿"
          )}
        </button>
        <Link
          href="/feedback/tickets"
          aria-disabled={pending}
          className={`px-4 py-2 rounded text-[14px] font-semibold transition-colors ${
            pending
              ? "text-[#A5ADBA] pointer-events-none"
              : "text-[#42526E] hover:bg-[#DFE1E6]"
          }`}
        >
          取消
        </Link>
        {/* 底部 hint 已拿掉（ticket #e057bea3）：跟頁面副標重複、且「sub-agent」屬開發者語彙不該洩漏到使用者面前 */}
      </div>
    </form>
  );
}
