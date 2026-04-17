import { updateTicketStatus } from "@/lib/feedback-actions";
import {
  FEEDBACK_STATUS_LABEL,
  FEEDBACK_STATUS_ORDER,
  FEEDBACK_STATUS_TONE,
  type FeedbackStatus,
} from "@/lib/feedback";

export function StatusActions({
  ticketId,
  current,
  isAdmin,
}: {
  ticketId: string;
  current: FeedbackStatus;
  isAdmin: boolean;
}) {
  if (!isAdmin) {
    return (
      <div className="text-xs text-on-surface-variant">
        只有管理者可以轉換狀態（目前狀態：
        <span className="font-semibold text-on-surface">
          {FEEDBACK_STATUS_LABEL[current]}
        </span>
        ）
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mr-1">
        轉狀態
      </span>
      {FEEDBACK_STATUS_ORDER.map((s) => {
        const isCurrent = s === current;
        const tone = FEEDBACK_STATUS_TONE[s];
        return (
          <form key={s} action={updateTicketStatus.bind(null, ticketId, s)}>
            <button
              type="submit"
              disabled={isCurrent}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                isCurrent
                  ? `${tone.bg} ${tone.text} ring-1 ring-inset ring-tertiary-container/60 cursor-default`
                  : `${tone.bg} ${tone.text} opacity-50 hover:opacity-100 hover:ring-1 hover:ring-inset hover:ring-outline-variant`
              }`}
            >
              {FEEDBACK_STATUS_LABEL[s]}
              {isCurrent && (
                <span className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full ${tone.dot} align-middle`} />
              )}
            </button>
          </form>
        );
      })}
    </div>
  );
}
