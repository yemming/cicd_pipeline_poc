import Link from "next/link";
import type { FeedbackTicket } from "@/lib/feedback";
import { StatusBadge } from "./status-badge";

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "剛剛";
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(iso).toLocaleDateString("zh-TW");
}

export function TicketCard({ ticket }: { ticket: FeedbackTicket }) {
  return (
    <Link
      href={`/feedback/tickets/${ticket.id}`}
      className="block bg-white rounded-xl border border-slate-200 p-4 hover:border-violet-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2 flex-1">
          {ticket.title}
        </h3>
        <StatusBadge status={ticket.status} size="sm" />
      </div>
      {ticket.url && (
        <div className="text-[11px] text-slate-500 truncate mb-2 font-mono">
          <span className="material-symbols-outlined text-[11px] align-middle mr-0.5">
            link
          </span>
          {ticket.url}
        </div>
      )}
      {ticket.description && (
        <p className="text-xs text-slate-600 line-clamp-2 mb-3">{ticket.description}</p>
      )}
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>{formatRelative(ticket.updated_at)}</span>
        <span className="font-mono">#{ticket.id.slice(0, 6)}</span>
      </div>
    </Link>
  );
}
