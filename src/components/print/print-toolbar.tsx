"use client";

import { useState } from "react";

/**
 * 螢幕版浮動工具列 — 給 print route 用。@media print 自動隱藏（@see print.css `.no-print`）。
 *
 * 行為：
 * - **下載 PDF**：fetch /api/pdf/{slug}/{id} → 拿 PDF blob → 開新 tab 用瀏覽器 PDF reader 顯示。
 *   走 server-side @sparticuz/chromium 渲染，**沒有 browser chrome（URL / 頁碼 header）**。
 *   user 在 PDF reader 內可以再存檔 / 列印實體機，列印時也不會有 URL header。
 * - **關閉**：window.close()
 *
 * 純客戶端預覽（不下載 PDF）→ 不傳 pdfHref，toolbar 只顯示「關閉」。
 */
export function PrintToolbar({
  pdfHref,
}: {
  /** PDF API endpoint，例：`/api/pdf/purchase-order/${id}`。沒傳就不顯示下載按鈕 */
  pdfHref?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPdf() {
    if (!pdfHref) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(pdfHref);
      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || `HTTP ${resp.status}`);
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // 60 秒後釋放 blob URL — 讓 user 有時間看 PDF
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="print-toolbar no-print">
        <button
          type="button"
          className="print-toolbar-secondary"
          onClick={() => window.close()}
        >
          關閉
        </button>
        {pdfHref && (
          <button type="button" onClick={openPdf} disabled={loading}>
            {loading ? "產生 PDF 中⋯" : "🖨️ 列印 / 下載 PDF"}
          </button>
        )}
      </div>
      {error && (
        <div
          className="no-print"
          style={{
            position: "fixed",
            top: "48pt",
            right: "12pt",
            zIndex: 100,
            background: "#FDECEA",
            color: "#CC0000",
            border: "1pt solid #F5AEAD",
            padding: "8pt 12pt",
            borderRadius: "4pt",
            fontSize: "10pt",
            maxWidth: "320pt",
          }}
        >
          產 PDF 失敗：{error}
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              marginLeft: "8pt",
              background: "none",
              border: "none",
              color: "#CC0000",
              cursor: "pointer",
              fontSize: "12pt",
            }}
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
