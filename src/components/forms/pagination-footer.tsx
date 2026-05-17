import Link from "next/link";

/**
 * 簡單的 server-side pagination footer。
 *
 * 設計原則（per CLAUDE.md「不過度工程」）：
 *   - 純 server component，靠 URL ?page=N 推進
 *   - 給 legacy <DataTable> 場景搭配用；DataGrid 已有內建 pagination 不需要
 *   - 顯示「共 N 筆 · 第 X / Y 頁」+ 上一頁 / 下一頁 + 中間頁碼跳轉
 */
export function PaginationFooter({
  page,
  pageSize,
  totalCount,
  basePath,
  searchParams,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  basePath: string;
  searchParams?: Record<string, string | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const buildHref = (p: number) => {
    const sp = new URLSearchParams();
    if (searchParams) {
      for (const [k, v] of Object.entries(searchParams)) {
        if (k === "page") continue;
        if (v != null && v !== "") sp.set(k, v);
      }
    }
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const prevHref = safePage > 1 ? buildHref(safePage - 1) : null;
  const nextHref = safePage < totalPages ? buildHref(safePage + 1) : null;

  const from = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(totalCount, safePage * pageSize);

  const linkClass =
    "inline-flex items-center justify-center px-3 h-[28px] text-[12px] rounded border border-[#DFE1E6] bg-white text-[#172B4D] hover:bg-[#F4F5F7]";
  const disabledClass =
    "inline-flex items-center justify-center px-3 h-[28px] text-[12px] rounded border border-[#DFE1E6] bg-[#F4F5F7] text-[#A5ADBA] cursor-not-allowed";

  return (
    <div className="flex items-center justify-between gap-3 px-1 py-1 text-[12px] text-[#42526E]">
      <span>
        共 <b className="text-[#172B4D]">{totalCount}</b> 筆 · 顯示{" "}
        <b className="text-[#172B4D]">
          {from}–{to}
        </b>{" "}
        · 第 <b className="text-[#172B4D]">{safePage}</b> / {totalPages} 頁
      </span>
      <div className="flex items-center gap-1.5">
        {prevHref ? (
          <Link href={prevHref} className={linkClass}>
            上一頁
          </Link>
        ) : (
          <span className={disabledClass}>上一頁</span>
        )}
        {nextHref ? (
          <Link href={nextHref} className={linkClass}>
            下一頁
          </Link>
        ) : (
          <span className={disabledClass}>下一頁</span>
        )}
      </div>
    </div>
  );
}
