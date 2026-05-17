/**
 * DemoBanner — 「Demo 用、未接 DB」標記
 *
 * 用於 mock / placeholder / localStorage 假流程頁，避免 demo 時客戶誤以為功能上線。
 * 兩種 tone：
 *   - "danger"（紅）：強烈警示，操作不會儲存
 *   - "info"（amber）：示範模式提示（例：未綁訂單的 wizard）
 *
 * 用法：
 *   <DemoBanner href="/admin/master-data/vehicle-models" hrefLabel="改前往真實版本" />
 *   <DemoBanner message="Demo 模擬資料、數字皆為示意" />
 */

import Link from "next/link";

export type DemoBannerProps = {
  tone?: "danger" | "info";
  message?: string;
  href?: string;
  hrefLabel?: string;
};

export function DemoBanner({
  tone = "danger",
  message,
  href,
  hrefLabel = "改前往真實版本",
}: DemoBannerProps) {
  const isDanger = tone === "danger";
  const wrap = isDanger
    ? "bg-[#FDECEA] border-[#F5AEAD] text-[#CC0000]"
    : "bg-[#FDF3E3] border-[#E8C97A] text-[#854F0B]";
  const icon = isDanger ? "⚠️" : "ℹ️";
  const defaultMsg = isDanger
    ? "Demo 用、未接 DB — 本頁為示範畫面、操作不會儲存。"
    : "目前為示範模式，完成資料不會寫入 DB。";

  return (
    <div
      className={`px-6 py-2.5 border-b text-[12.5px] flex items-center gap-2 ${wrap}`}
      data-testid="demo-banner"
    >
      <span aria-hidden>{icon}</span>
      <span>
        <strong>{message ?? defaultMsg}</strong>
        {href && (
          <>
            {" "}
            <Link href={href} className="underline">
              {hrefLabel}
            </Link>
            。
          </>
        )}
      </span>
    </div>
  );
}
