/**
 * 共用 ToneKey + 工具 — Visualization 元件統一吃這份。
 *
 * tone 對應 design-tokens.css 的 7 色 palette；任何元件需要 chip / accent / shadow
 * 都 import 這裡的常量映射，避免各自硬寫一份不同步的 class。
 */

export type ToneKey =
  | "blue"
  | "teal"
  | "amber"
  | "red"
  | "purple"
  | "green"
  | "gray";

/** Tone → 主要文字 + 邊框 + 50 wash class，給 dot / chip / 卡頭使用 */
export const TONE_CLASSES: Record<
  ToneKey,
  {
    bg50: string;
    bg100: string;
    bg500: string;
    text700: string;
    border100: string;
    border500: string;
    shadowTone: string;
  }
> = {
  blue: {
    bg50: "bg-tone-blue-50",
    bg100: "bg-tone-blue-100",
    bg500: "bg-tone-blue-500",
    text700: "text-tone-blue-700",
    border100: "border-tone-blue-100",
    border500: "border-tone-blue-500",
    shadowTone: "shadow-tone-blue",
  },
  teal: {
    bg50: "bg-tone-teal-50",
    bg100: "bg-tone-teal-100",
    bg500: "bg-tone-teal-500",
    text700: "text-tone-teal-700",
    border100: "border-tone-teal-100",
    border500: "border-tone-teal-500",
    shadowTone: "shadow-tone-teal",
  },
  amber: {
    bg50: "bg-tone-amber-50",
    bg100: "bg-tone-amber-100",
    bg500: "bg-tone-amber-500",
    text700: "text-tone-amber-700",
    border100: "border-tone-amber-100",
    border500: "border-tone-amber-500",
    shadowTone: "shadow-tone-amber",
  },
  red: {
    bg50: "bg-tone-red-50",
    bg100: "bg-tone-red-100",
    bg500: "bg-tone-red-500",
    text700: "text-tone-red-700",
    border100: "border-tone-red-100",
    border500: "border-tone-red-500",
    shadowTone: "shadow-tone-red",
  },
  purple: {
    bg50: "bg-tone-purple-50",
    bg100: "bg-tone-purple-100",
    bg500: "bg-tone-purple-500",
    text700: "text-tone-purple-700",
    border100: "border-tone-purple-100",
    border500: "border-tone-purple-500",
    shadowTone: "shadow-tone-purple",
  },
  green: {
    bg50: "bg-tone-green-50",
    bg100: "bg-tone-green-100",
    bg500: "bg-tone-green-500",
    text700: "text-tone-green-700",
    border100: "border-tone-green-100",
    border500: "border-tone-green-500",
    shadowTone: "shadow-tone-green",
  },
  gray: {
    bg50: "bg-tone-gray-50",
    bg100: "bg-tone-gray-100",
    bg500: "bg-tone-gray-500",
    text700: "text-tone-gray-700",
    border100: "border-tone-gray-100",
    border500: "border-tone-gray-500",
    shadowTone: "",
  },
};

/** Tone → CSS var hex（給 SVG / inline style 用，stroke / fill 等場景） */
export const TONE_HEX: Record<
  ToneKey,
  { v50: string; v100: string; v500: string; v700: string; v900: string }
> = {
  blue: { v50: "#EFF6FF", v100: "#DBEAFE", v500: "#3B82F6", v700: "#1D4ED8", v900: "#1E3A8A" },
  teal: { v50: "#ECFDF5", v100: "#D1FAE5", v500: "#14B8A6", v700: "#0F766E", v900: "#134E4A" },
  amber: { v50: "#FFFBEB", v100: "#FEF3C7", v500: "#F59E0B", v700: "#B45309", v900: "#78350F" },
  red: { v50: "#FEF2F2", v100: "#FEE2E2", v500: "#EF4444", v700: "#B91C1C", v900: "#7F1D1D" },
  purple: { v50: "#F5F3FF", v100: "#EDE9FE", v500: "#8B5CF6", v700: "#6D28D9", v900: "#4C1D95" },
  green: { v50: "#F0FDF4", v100: "#DCFCE7", v500: "#22C55E", v700: "#15803D", v900: "#14532D" },
  gray: { v50: "#F9FAFB", v100: "#F3F4F6", v500: "#6B7280", v700: "#374151", v900: "#111827" },
};

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
