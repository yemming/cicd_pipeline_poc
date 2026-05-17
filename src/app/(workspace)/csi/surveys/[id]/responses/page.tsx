import Link from "next/link";
import { listResponses } from "@/domain/surveys";
import { listCustomers } from "@/lib/master-data/queries";
import { ResponsesBoard } from "./_components/responses-board";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ResponsesPage({ params }: Props) {
  const { id: templateId } = await params;
  const [rows, customers] = await Promise.all([
    listResponses(templateId),
    listCustomers({ activeOnly: true, limit: 500 }),
  ]);
  const customerOptions = customers.map((c) => ({
    id: c.id,
    label: c.name ?? "（無姓名）",
    sublabel: [c.code, c.phone].filter(Boolean).join(" · "),
  }));
  const templateName = rows[0]?.template_name ?? "（未命名問卷）";
  const templateKind = rows[0]?.template_kind ?? "sales";
  const backHref =
    templateKind === "aftersales"
      ? `/crm/aftersales/survey-templates/${templateId}`
      : `/crm/sales/survey-templates/${templateId}`;

  return (
    <main className="px-6 py-5 space-y-3">
      <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
        <Link href={backHref} className="hover:text-[#185FA5]">
          ← 回問卷模板
        </Link>
        <span>›</span>
        <span className="text-[#5A5955]">派發紀錄</span>
      </div>
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">{templateName}</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          P1-#5
        </span>
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆派發
        </span>
      </header>

      <ResponsesBoard templateId={templateId} rows={rows} customers={customerOptions} />
    </main>
  );
}
