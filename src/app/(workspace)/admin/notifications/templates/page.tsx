import { redirect } from "next/navigation";
import { getNotificationTemplatesBoardData } from "@/domain/notifications";
import { NotificationsPageHeader } from "../_parts/page-header";
import {
  CodeTemplatesGrid,
  DbTemplatesGrid,
  type CodeTemplateRow,
  type DbTemplateRow,
} from "./_templates-grids";

export default async function TemplatesPage() {
  let data: Awaited<ReturnType<typeof getNotificationTemplatesBoardData>>;
  try {
    data = await getNotificationTemplatesBoardData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHENTICATED") redirect("/login");
    if (msg.startsWith("FORBIDDEN")) {
      return <div className="p-8 text-center text-[#5A5955]">無管理權限</div>;
    }
    throw err;
  }
  const { codeTemplates: codeTpls, dbTemplates: dbTpls } = data;

  const dbByCode = new Map(dbTpls.map((t) => [t.code, t]));

  const codeRows: CodeTemplateRow[] = codeTpls.map((t) => ({
    code: t.code,
    eventCode: t.eventCode,
    channelCode: t.channelCode,
    format: t.format,
    description: t.description ?? null,
    hasOverride: dbByCode.has(t.code),
  }));

  const dbRows: DbTemplateRow[] = dbTpls.map((t) => ({
    id: t.id,
    code: t.code,
    event_code: t.event_code,
    channel_code: t.channel_code,
    format: t.format,
    is_active: t.is_active,
    updated_at: t.updated_at,
  }));

  return (
    <div className="min-h-screen bg-white">
      <NotificationsPageHeader
        title="模板檢視"
        subtitle="程式碼內建模板 + DB 覆寫清單（MVP 只唯讀）"
        breadcrumb={[
          { label: "通知中心", href: "/admin/notifications" },
          { label: "模板檢視" },
        ]}
      />

      <div className="mx-auto max-w-7xl px-6 py-6 space-y-8">
        <section>
          <div className="mb-3 flex items-baseline gap-3">
            <h3 className="text-[13px] font-semibold text-[#2C2C2A]">程式碼內建模板</h3>
            <span className="text-[11px] text-[#9A9890]">
              共 {codeTpls.length} 個（隨 git 版本固定）
            </span>
          </div>
          <CodeTemplatesGrid rows={codeRows} />
        </section>

        {dbTpls.length > 0 && (
          <section>
            <div className="mb-3 flex items-baseline gap-3">
              <h3 className="text-[13px] font-semibold text-[#2C2C2A]">DB 覆寫模板</h3>
              <span className="text-[11px] text-[#9A9890]">共 {dbTpls.length} 個</span>
            </div>
            <DbTemplatesGrid rows={dbRows} />
          </section>
        )}
      </div>
    </div>
  );
}
