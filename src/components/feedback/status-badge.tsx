import type { FeedbackStatus } from "@/lib/feedback";
import { FEEDBACK_STATUS_LABEL, FEEDBACK_STATUS_TONE } from "@/lib/feedback";

export function StatusBadge({ status, size = "md" }: { status: FeedbackStatus; size?: "sm" | "md" }) {
  const tone = FEEDBACK_STATUS_TONE[status];
  const label = FEEDBACK_STATUS_LABEL[status];
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${tone.bg} ${tone.text} ${pad}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
      {label}
    </span>
  );
}
