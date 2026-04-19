import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndNotificationAdmin } from "@/lib/notifications";
import { listCodeTemplates } from "@/lib/notifications/templates";
import { listTemplates } from "@/lib/notifications/repositories/template.repo";
import { NotificationsPageHeader } from "../_parts/page-header";

export default async function TemplatesPage() {
  const ctx = await getCurrentUserAndNotificationAdmin();
  if (!ctx.userId) redirect("/login");
  if (!ctx.isAdmin) {
    return (
      <div className="p-8 text-center text-on-surface-variant">
        無管理權限（登入為 {ctx.email ?? "unknown"}）
      </div>
    );
  }

  const supabase = createServiceClient();
  const [codeTpls, dbTpls] = await Promise.all([
    Promise.resolve(listCodeTemplates()),
    listTemplates(supabase),
  ]);

  const dbByCode = new Map(dbTpls.map((t) => [t.code, t]));

  return (
    <div className="min-h-screen bg-surface">
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
            <h3 className="text-lg font-semibold">程式碼內建模板</h3>
            <span className="text-xs text-on-surface-variant">
              共 {codeTpls.length} 個（隨 git 版本固定）
            </span>
          </div>
          <div className="overflow-hidden rounded-lg border border-outline-variant">
            <table className="w-full text-sm">
              <thead className="bg-surface-container text-on-surface-variant">
                <tr>
                  <th className="px-3 py-2 text-left">事件</th>
                  <th className="px-3 py-2 text-left">通路</th>
                  <th className="px-3 py-2 text-left">格式</th>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">描述</th>
                  <th className="px-3 py-2 text-left">DB 覆寫</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant bg-surface">
                {codeTpls.map((t) => {
                  const override = dbByCode.get(t.code);
                  return (
                    <tr key={t.code}>
                      <td className="px-3 py-2 font-mono text-xs">{t.eventCode}</td>
                      <td className="px-3 py-2">{t.channelCode}</td>
                      <td className="px-3 py-2">
                        <span className="rounded bg-surface-container px-2 py-0.5 text-xs">
                          {t.format}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{t.code}</td>
                      <td className="px-3 py-2 text-on-surface-variant">{t.description ?? "—"}</td>
                      <td className="px-3 py-2">
                        {override ? (
                          <span className="rounded bg-warning-container px-2 py-0.5 text-xs text-warning">
                            已覆寫
                          </span>
                        ) : (
                          <span className="text-on-surface-variant">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {dbTpls.length > 0 && (
          <section>
            <div className="mb-3 flex items-baseline gap-3">
              <h3 className="text-lg font-semibold">DB 覆寫模板</h3>
              <span className="text-xs text-on-surface-variant">共 {dbTpls.length} 個</span>
            </div>
            <div className="overflow-hidden rounded-lg border border-outline-variant">
              <table className="w-full text-sm">
                <thead className="bg-surface-container text-on-surface-variant">
                  <tr>
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">事件</th>
                    <th className="px-3 py-2 text-left">通路</th>
                    <th className="px-3 py-2 text-left">格式</th>
                    <th className="px-3 py-2 text-left">啟用</th>
                    <th className="px-3 py-2 text-left">更新時間</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant bg-surface">
                  {dbTpls.map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2 font-mono text-xs">{t.code}</td>
                      <td className="px-3 py-2">{t.event_code}</td>
                      <td className="px-3 py-2">{t.channel_code}</td>
                      <td className="px-3 py-2">{t.format}</td>
                      <td className="px-3 py-2">{t.is_active ? "✓" : "—"}</td>
                      <td className="px-3 py-2 text-on-surface-variant">
                        {new Date(t.updated_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
