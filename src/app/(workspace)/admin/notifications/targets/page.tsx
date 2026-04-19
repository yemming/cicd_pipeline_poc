import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndNotificationAdmin } from "@/lib/notifications";
import { listActiveChannels } from "@/lib/notifications/repositories/channel.repo";
import { listTargets } from "@/lib/notifications/repositories/target.repo";
import { NotificationsPageHeader } from "../_parts/page-header";
import { CreateTargetForm } from "./_create-form";
import { TargetRowActions } from "./_row-actions";

export default async function TargetsPage() {
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
  const [channels, targets] = await Promise.all([
    listActiveChannels(supabase),
    listTargets(supabase, { onlyActive: false }),
  ]);

  return (
    <div className="min-h-screen bg-surface">
      <NotificationsPageHeader
        title="通路與目標"
        subtitle="管理 LINE 群組／個人 userId 與 Google Chat webhook"
        breadcrumb={[
          { label: "通知中心", href: "/admin/notifications" },
          { label: "通路與目標" },
        ]}
      />

      <div className="mx-auto max-w-7xl px-6 py-6 space-y-8">
        <section>
          <h3 className="text-lg font-semibold mb-3">新增目標</h3>
          <CreateTargetForm channels={channels.map((c) => ({ id: c.id, code: c.code, displayName: c.display_name }))} />
        </section>

        <section>
          <h3 className="text-lg font-semibold mb-3">現有目標（{targets.length}）</h3>
          {targets.length === 0 ? (
            <div className="rounded-lg border border-outline-variant bg-surface-container p-6 text-center text-on-surface-variant">
              尚無目標。
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-outline-variant">
              <table className="w-full text-sm">
                <thead className="bg-surface-container text-on-surface-variant">
                  <tr>
                    <th className="px-3 py-2 text-left">通路</th>
                    <th className="px-3 py-2 text-left">類型</th>
                    <th className="px-3 py-2 text-left">名稱</th>
                    <th className="px-3 py-2 text-left">Target ref</th>
                    <th className="px-3 py-2 text-left">啟用</th>
                    <th className="px-3 py-2 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant bg-surface">
                  {targets.map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2 font-mono text-xs">{t.channel_code}</td>
                      <td className="px-3 py-2">{t.target_type}</td>
                      <td className="px-3 py-2">{t.display_name}</td>
                      <td
                        className="px-3 py-2 font-mono text-xs text-on-surface-variant max-w-[320px] truncate"
                        title={t.target_ref}
                      >
                        {maskRef(t.target_ref)}
                      </td>
                      <td className="px-3 py-2">
                        <TargetRowActions id={t.id} isActive={t.is_active} action="toggle" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <TargetRowActions id={t.id} isActive={t.is_active} action="delete" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function maskRef(ref: string): string {
  if (ref.startsWith("https://chat.googleapis.com/")) {
    return `${ref.slice(0, 45)}…（已遮罩）`;
  }
  return ref;
}
