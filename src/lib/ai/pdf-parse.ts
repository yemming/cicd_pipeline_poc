/**
 * PDF 文字抽取 — 用 pdf-parse（基於 pdfjs-dist）
 *
 * 對純文字 PDF 效果很好；對掃描檔 / 圖片型 PDF 不適用（需 OCR）。
 * 對多欄版面 / 表格 抽出來的文字會擠在一起，第一版接受、retrieval 階段靠
 * embedding 相似度補救；如果手冊類型需要更高品質，Phase 2 切到 Gemini Files API。
 */

/**
 * PDF 文字抽取 — 用 unpdf
 *
 * unpdf 是 pdfjs-dist 的 serverless-friendly wrapper：自動處理 fake worker setup，
 * 避開 Next.js Turbopack 解析 pdf.worker.mjs 路徑的問題。
 *
 * 對純文字 PDF 效果很好；掃描檔 / 圖片型 PDF 需 OCR（POC 版不處理）。
 * 對多欄版面 / 表格 抽出來的文字會擠在一起、retrieval 階段靠 embedding 補救。
 */

export type ExtractedPdf = {
  text: string;
  pageCount: number;
  /** 每頁原始 text（給之後 chunking 帶 page metadata 用） */
  pages: { pageNumber: number; text: string }[];
};

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB，跟 next.config.ts bodySizeLimit 對齊

export async function extractPdfText(buffer: Buffer): Promise<ExtractedPdf> {
  if (buffer.byteLength === 0) throw new Error('PDF buffer 是空的');
  if (buffer.byteLength > MAX_PDF_BYTES) {
    throw new Error(
      `PDF 太大（${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB > 25 MB 上限）`,
    );
  }

  // Dynamic import：build 期不分析整個 pdfjs-dist（~10MB），避免 OOM；只在
  // runtime 真的解 PDF 時才 load
  const { extractText, getDocumentProxy } = await import('unpdf');
  const data = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(data);

  // mergePages: false → text 回 string[]（每頁一筆）
  const { totalPages, text: pageTexts } = await extractText(pdf, {
    mergePages: false,
  });

  const pages = (pageTexts as string[]).map((t, idx) => ({
    pageNumber: idx + 1,
    text: (t ?? '').trim(),
  }));
  const merged = pages.map((p) => p.text).filter(Boolean).join('\n\n').trim();

  if (!merged) {
    throw new Error(
      'PDF 抽不到任何文字（可能是掃描檔 / 圖片型 PDF，需走 OCR；POC 版不支援）',
    );
  }

  return { text: merged, pageCount: totalPages, pages };
}
