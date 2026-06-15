import Link from "next/link";
import {
  type FeedbackTicket,
  getTicketAcceptance,
  getTicketEvidence,
  TICKET_E2E_TONE,
} from "@/lib/feedback";

/** Extract first path segment as a module chip label */
function urlChip(url: string | null): string | null {
  if (!url) return null;
  try {
    const path = url.startsWith("http") ? new URL(url).pathname : url;
    const seg = path.split("/").filter(Boolean)[0];
    return seg ?? null;
  } catch {
    return null;
  }
}

/** Deterministic color for a chip label */
const CHIP_COLORS: Record<string, string> = {
  sales:     "bg-[#1A1A2E] text-[#C9A84C]",
  service:   "bg-[#0C4A6E] text-[#7DD3FC]",
  delivery:  "bg-[#713F12] text-[#FDE68A]",
  pos:       "bg-[#4C1D95] text-[#DDD6FE]",
  settings:  "bg-[#1F2937] text-[#9CA3AF]",
  csi:       "bg-[#064E3B] text-[#6EE7B7]",
  usedcar:   "bg-[#7F1D1D] text-[#FCA5A5]",
  feedback:  "bg-[#312E81] text-[#A5B4FC]",
};
function chipClass(seg: string): string {
  return CHIP_COLORS[seg] ?? "bg-[#374151] text-[#D1D5DB]";
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export function TicketCard({ ticket, authorName }: { ticket: FeedbackTicket; authorName?: string }) {
  const chip = urlChip(ticket.url);
  const acCount = getTicketAcceptance(ticket.metadata).length;
  const e2eStatus = getTicketEvidence(ticket.metadata)?.e2e?.status ?? "none";
  const e2eTone = TICKET_E2E_TONE[e2eStatus];

  return (
    <Link
      href={`/feedback/tickets/${ticket.id}`}
      className="block bg-white rounded border border-[#DFE1E6] p-3 hover:bg-[#FAFAFA] hover:shadow-sm transition-all cursor-pointer"
    >
      {/* Title */}
      <p className="text-[13px] font-medium text-[#172B4D] leading-snug line-clamp-3 mb-3">
        {ticket.title}
      </p>

      {/* Label chips: URL segment + 驗收條數 + E2E 狀態 */}
      <div className="mb-2.5 flex items-center gap-1.5 flex-wrap">
        {chip && (
          <span className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${chipClass(chip)}`}>
            {chip}
          </span>
        )}
        {acCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#EAF4FB] text-[#185FA5]">
            <span className="material-symbols-outlined text-[12px]">checklist</span>
            {acCount}
          </span>
        )}
        {e2eStatus !== "none" && (
          <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${e2eTone.bg} ${e2eTone.text}`}>
            E2E {e2eTone.label}
          </span>
        )}
      </div>

      {/* Footer: ticket ID + avatar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-[11px] text-[#6B778C]">
          <span className="material-symbols-outlined text-[14px] text-[#C9A84C]">feedback</span>
          <span className="font-mono">#{ticket.id.slice(0, 6)}</span>
        </div>
        {authorName && (
          <div
            className="w-6 h-6 rounded-full bg-[#1A1A2E] flex items-center justify-center"
            title={authorName}
          >
            <span className="text-[9px] font-black text-[#C9A84C] leading-none">
              {getInitials(authorName)}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
