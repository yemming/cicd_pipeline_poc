"use client";

/**
 * 螢幕版浮動工具列 — 列印 / 關閉。@media print 時自動隱藏。
 * 給 print page 用：使用者預覽 → 點「列印」走 OS dialog、點「關閉」回 detail page。
 */
export function PrintToolbar({
  onPrint = () => window.print(),
}: {
  onPrint?: () => void;
}) {
  return (
    <div className="print-toolbar no-print">
      <button
        type="button"
        className="print-toolbar-secondary"
        onClick={() => window.close()}
      >
        關閉
      </button>
      <button type="button" onClick={onPrint}>
        🖨️ 列印 / 另存 PDF
      </button>
    </div>
  );
}
