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
    <div className="max-w-2xl mx-auto">
      {/* Breadcrumb — Jira style */}
      <div className="flex items-center gap-1.5 text-[12px] text-[#6B778C] mb-4">
        <Link href="/feedback/tickets" className="hover:text-[#172B4D] hover:underline transition-colors">
          單據看板
        </Link>
        <span className="text-[#DFE1E6]">/</span>
        <span className="text-[#172B4D] font-medium">新增單據</span>
      </div>

      {/* Page title */}
      <h1 className="text-[22px] font-bold text-[#172B4D] mb-1">新增意見單</h1>
      <p className="text-[13px] text-[#6B778C] mb-6">
        建立後狀態預設為「草稿」；管理者接手後會轉為「工作中」並排入開發序列
      </p>

      <TicketForm defaultUrl={defaultUrl} />
    </div>
  );
}
