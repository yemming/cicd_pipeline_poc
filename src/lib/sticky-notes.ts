/**
 * Sticky Notes — 全站浮層便利貼模組型別與常數
 */

export const STICKY_COLORS = ["yellow", "pink", "blue", "green", "purple"] as const;
export type StickyColor = (typeof STICKY_COLORS)[number];

export type StickyNote = {
  id: string;
  page_path: string;
  page_title: string | null;
  x_px: number;
  y_px: number;
  body: string;
  color: StickyColor;
  resolved_at: string | null;
  created_by: string | null;
  ticket_id: string | null;
  created_at: string;
  updated_at: string;
};

export const STICKY_COLOR_TONE: Record<StickyColor, { bg: string; border: string; text: string; tab: string }> = {
  yellow: { bg: "bg-yellow-200",  border: "border-yellow-400",  text: "text-yellow-950",  tab: "bg-yellow-300" },
  pink:   { bg: "bg-pink-200",    border: "border-pink-400",    text: "text-pink-950",    tab: "bg-pink-300" },
  blue:   { bg: "bg-sky-200",     border: "border-sky-400",     text: "text-sky-950",     tab: "bg-sky-300" },
  green:  { bg: "bg-emerald-200", border: "border-emerald-400", text: "text-emerald-950", tab: "bg-emerald-300" },
  purple: { bg: "bg-purple-200",  border: "border-purple-400",  text: "text-purple-950",  tab: "bg-purple-300" },
};

/** 把任意 URL/href 正規化成只剩 pathname（不含 query/hash），方便依頁面 group。 */
export function normalizePagePath(input: string): string {
  try {
    const u = new URL(input, "http://x");
    return u.pathname || "/";
  } catch {
    return input.split("?")[0].split("#")[0] || "/";
  }
}
