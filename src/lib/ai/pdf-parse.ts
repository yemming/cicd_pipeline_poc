/**
 * PDF 文字抽取 — 用 pdf-parse（基於 pdfjs-dist）
 *
 * 對純文字 PDF 效果很好；對掃描檔 / 圖片型 PDF 不適用（需 OCR）。
 * 對多欄版面 / 表格 抽出來的文字會擠在一起，第一版接受、retrieval 階段靠
 * embedding 相似度補救；如果手冊類型需要更高品質，Phase 2 切到 Gemini Files API。
 */

/**
 * 文件文字抽取 — PDF / DOCX / TXT
 *
 * - PDF: unpdf（pdfjs-dist serverless-friendly wrapper、避開 Turbopack worker 坑）
 * - DOCX: mammoth（Word .docx → 純文字）
 * - TXT: 直接 UTF-8 decode
 *
 * 對純文字 input 效果好；PDF 掃描檔 / 圖片型需 OCR（POC 不處理）。
 * 多欄版面 / 表格 抽出文字會擠在一起、retrieval 階段靠 embedding 補救。
 */

export type ExtractedPdf = {
  text: string;
  pageCount: number;
  /** 每頁原始 text（給之後 chunking 帶 page metadata 用），TXT/DOCX 只有 1 頁 */
  pages: { pageNumber: number; text: string }[];
};

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB，跟 next.config.ts bodySizeLimit 對齊

/** Dispatch by mime type — 統一 caller 介面 */
export async function extractDocText(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractedPdf> {
  if (mimeType.includes('pdf')) return extractPdfText(buffer);
  if (
    mimeType.includes('wordprocessingml') ||
    mimeType.includes('msword') ||
    mimeType === 'application/octet-stream' // .docx 有時被偵測為這個
  ) {
    return extractDocxText(buffer);
  }
  if (mimeType.includes('text/plain') || mimeType.includes('text/markdown')) {
    return extractTxtText(buffer);
  }
  throw new Error(`不支援的檔案類型：${mimeType}（僅接受 PDF / DOCX / TXT）`);
}

export async function extractDocxText(buffer: Buffer): Promise<ExtractedPdf> {
  if (buffer.byteLength === 0) throw new Error('DOCX buffer 是空的');
  if (buffer.byteLength > MAX_PDF_BYTES) {
    throw new Error(`DOCX 太大（${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB > 25 MB）`);
  }
  const { default: mammoth } = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  const text = (result.value ?? '').trim();
  if (!text) throw new Error('DOCX 抽不到任何文字');
  return { text, pageCount: 1, pages: [{ pageNumber: 1, text }] };
}

export async function extractTxtText(buffer: Buffer): Promise<ExtractedPdf> {
  if (buffer.byteLength === 0) throw new Error('TXT buffer 是空的');
  if (buffer.byteLength > MAX_PDF_BYTES) {
    throw new Error(`TXT 太大（${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB > 25 MB）`);
  }
  const text = buffer.toString('utf8').trim();
  if (!text) throw new Error('TXT 是空的');
  return { text, pageCount: 1, pages: [{ pageNumber: 1, text }] };
}

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
