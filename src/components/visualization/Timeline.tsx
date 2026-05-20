/**
 * Timeline — 事件時間軸。
 *
 * 垂直版：左 dot + 連線、右 event card。
 * 水平版：頂 dot row + 下 card row、scroll-x。
 */

import type { ReactNode } from "react";
import { TONE_CLASSES, cn, type ToneKey } from "./tone";

export interface TimelineEvent {
  id: string;
  time: string | Date;
  title: string;
  description?: ReactNode;
  tone?: ToneKey;
  icon?: ReactNode;
}

export interface TimelineProps {
  events: TimelineEvent[];
  variant?: "vertical" | "horizontal";
  className?: string;
}

function formatTime(t: string | Date): string {
  if (t instanceof Date) {
    return t.toLocaleString("zh-TW", { hour12: false });
  }
  return t;
}

export function Timeline({ events, variant = "vertical", className }: TimelineProps) {
  if (variant === "horizontal") {
    return (
      <div className={cn("overflow-x-auto", className)}>
        <div className="flex gap-4 min-w-max relative pt-2 pb-2">
          {/* 水平連線 */}
          <div
            className="absolute left-4 right-4 top-[18px] h-[2px] bg-tone-gray-100"
            aria-hidden
          />
          {events.map((e) => {
            const tone = e.tone ?? "blue";
            const t = TONE_CLASSES[tone];
            return (
              <div key={e.id} className="flex flex-col items-center w-[180px] shrink-0 relative">
                <span
                  className={cn(
                    "relative z-10 w-[14px] h-[14px] rounded-full border-2 border-white",
                    t.bg500,
                  )}
                />
                <div className="mt-2 bg-white rounded-md border border-tone-gray-100 px-3 py-2 w-full">
                  <div className="text-[11px] text-tone-gray-500">{formatTime(e.time)}</div>
                  <div className={cn("text-[12.5px] font-semibold mt-0.5", t.text700)}>{e.title}</div>
                  {e.description ? (
                    <div className="text-[11.5px] text-tone-gray-700 mt-1">{e.description}</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // vertical
  return (
    <ol className={cn("relative", className)}>
      {events.map((e, idx) => {
        const tone = e.tone ?? "blue";
        const t = TONE_CLASSES[tone];
        const isLast = idx === events.length - 1;
        return (
          <li key={e.id} className="relative pl-8 pb-4">
            {!isLast ? (
              <span
                className="absolute left-[7px] top-3 bottom-0 w-[2px] bg-tone-gray-100"
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                "absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center",
                t.bg500,
              )}
            >
              {e.icon ? <span className="text-white text-[8px]">{e.icon}</span> : null}
            </span>
            <div className="bg-white rounded-md border border-tone-gray-100 px-3 py-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className={cn("text-[12.5px] font-semibold", t.text700)}>{e.title}</span>
                <span className="text-[11px] text-tone-gray-500">{formatTime(e.time)}</span>
              </div>
              {e.description ? (
                <div className="text-[11.5px] text-tone-gray-700 mt-1">{e.description}</div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default Timeline;
