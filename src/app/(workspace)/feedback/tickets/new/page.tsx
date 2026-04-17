import Link from "next/link";
import { TicketForm } from "@/components/feedback/ticket-form";

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const sp = await searchParams;
  const defaultUrl = typeof sp.url === "string" ? sp.url : undefined;

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link
          href="/feedback/tickets"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-violet-600 transition-colors mb-3"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          回看板
        </Link>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">新增意見單</h1>
        <p className="text-sm text-slate-500 mt-1">
          建立後狀態預設為「草稿」；管理者接手後會轉為「工作中」並排入開發序列
        </p>
      </div>

      <TicketForm defaultUrl={defaultUrl} />
    </div>
  );
}
