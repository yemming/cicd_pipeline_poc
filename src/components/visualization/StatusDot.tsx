/**
 * StatusDot — 狀態小圓點，可選 pulse 動畫與 label。
 *
 * size 對應：sm = 6px / md = 10px / lg = 14px。
 */

import { TONE_CLASSES, cn, type ToneKey } from "./tone";

type DotTone = Extract<ToneKey, "green" | "amber" | "red" | "gray" | "blue" | "purple">;

export interface StatusDotProps {
  tone: DotTone;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  label?: string;
  className?: string;
}

const SIZE_PX: Record<NonNullable<StatusDotProps["size"]>, number> = {
  sm: 6,
  md: 10,
  lg: 14,
};

export function StatusDot({ tone, size = "md", pulse = false, label, className }: StatusDotProps) {
  const t = TONE_CLASSES[tone];
  const px = SIZE_PX[size];

  const dot = (
    <span className="relative inline-flex shrink-0" style={{ width: px, height: px }}>
      {pulse ? (
        <span
          className={cn("absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping", t.bg500)}
        />
      ) : null}
      <span
        className={cn("relative inline-flex rounded-full", t.bg500)}
        style={{ width: px, height: px }}
      />
    </span>
  );

  if (!label) {
    return <span className={cn("inline-flex items-center", className)}>{dot}</span>;
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {dot}
      <span className="text-[12px] text-tone-gray-700">{label}</span>
    </span>
  );
}

export default StatusDot;
