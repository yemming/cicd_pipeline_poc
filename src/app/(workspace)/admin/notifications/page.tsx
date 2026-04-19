import Link from "next/link";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndNotificationAdmin } from "@/lib/notifications";
import {
  countDeliveriesByStatus,
  listDeliveries,
} from "@/lib/notifications/repositories/delivery.repo";
import { NotificationsPageHeader } from "./_parts/page-header";
import { DeliveryStatusBadge } from "./_parts/delivery-status-badge";

export default async function NotificationsDashboardPage() {
  const ctx = await getCurrentUserAndNotificationAdmin();
  if (!ctx.userId) redirect("/login");
  if (!ctx.isAdmin) {
    return <AdminForbidden email={ctx.email} />;
  }

  const supabase = createServiceClient();

  // server component 每個 request 重新執行，Date.now() 是預期行為
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const [stats7d, stats24h, recentFailed, recent] = await Promise.all([
    countDeliveriesByStatus(supabase, since7d),
    countDeliveriesByStatus(supabase, since24h),
    listDeliveries(supabase, { status: "failed", limit: 10 }),
    listDeliveries(supabase, { limit: 10 }),
  ]);

  const total7d = stats7d.sent + stats7d.failed + stats7d.pending + stats7d.retrying;
  const total24h = stats24h.sent + stats24h.failed + stats24h.pending + stats24h.retrying;
  const successRate7d = total7d > 0 ? Math.round((stats7d.sent / total7d) * 100) : 100;

  return (
    <div className="min-h-screen bg-surface">
      <NotificationsPageHeader
        title="通知儀表板"
        subtitle="IM 通知模組整體運作概況"
        breadcrumb={[
          { label: "簽核管理", href: "/admin/approvals" },
          { label: "通知中心" },
        ]}
      />

      <div className="mx-auto max-w-7xl px-6 py-6 space-y-8">
        {/* Stat cards */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard label="過去 24h 送出" value={total24h} accent="bg-surface-container" />
          <StatCard
            label="過去 7 天送出"
            value={total7d}
            accent="bg-surface-container"
          />
          <StatCard
            label="7 天成功率"
            value={`${successRate7d}%`}
            accent={successRate7d >= 95 ? "bg-success-container" : "bg-warning-container"}
          />
          <StatCard
            label="近 24h 失敗"
            value={stats24h.failed}
            accent={stats24h.failed > 0 ? "bg-error-container" : "bg-surface-container"}
          />
        </section>

        {/* 7 天分佈 */}
        <section>
          <h3 className="text-lg font-semibold mb-3">過去 7 天狀態分佈</h3>
          <div className="grid grid-cols-4 gap-3">
            <MiniStat label="已送達" value={stats7d.sent} tone="success" />
            <MiniStat label="失敗" value={stats7d.failed} tone="error" />
            <MiniStat label="重試中" value={stats7d.retrying} tone="warning" />
            <MiniStat label="排隊中" value={stats7d.pending} tone="info" />
          </div>
        </section>

        {/* 最近失敗 */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-lg font-semibold">最近失敗</h3>
            <Link
              href="/admin/notifications/deliveries?status=failed"
              className="text-sm text-primary hover:underline"
            >
              查看全部 →
            </Link>
          </div>
          {recentFailed.length === 0 ? (
            <div className="rounded-lg border border-outline-variant bg-surface-container p-6 text-center text-on-surface-variant">
              近期沒有失敗記錄
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-outline-variant">
              <table className="w-full text-sm">
                <thead className="bg-surface-container text-on-surface-variant">
                  <tr>
                    <th className="px-3 py-2 text-left">時間</th>
                    <th className="px-3 py-2 text-left">事件</th>
                    <th className="px-3 py-2 text-left">通路</th>
                    <th className="px-3 py-2 text-left">目標</th>
                    <th className="px-3 py-2 text-left">錯誤</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant bg-surface">
                  {recentFailed.map((d) => (
                    <tr key={d.id}>
                      <td className="px-3 py-2 whitespace-nowrap text-on-surface-variant">
                        {new Date(d.created_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{d.event_code}</td>
                      <td className="px-3 py-2">{d.channel_code}</td>
                      <td className="px-3 py-2 font-mono text-xs">{maskRef(d.target_ref)}</td>
                      <td className="px-3 py-2 text-error max-w-xs truncate" title={d.last_error ?? ""}>
                        {d.last_error?.slice(0, 80)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 最新 10 筆（不論狀態） */}
        <section>
          <h3 className="text-lg font-semibold mb-3">最近推送（全部狀態）</h3>
          {recent.length === 0 ? (
            <div className="rounded-lg border border-outline-variant bg-surface-container p-6 text-center text-on-surface-variant">
              尚無記錄
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-outline-variant">
              <table className="w-full text-sm">
                <thead className="bg-surface-container text-on-surface-variant">
                  <tr>
                    <th className="px-3 py-2 text-left">時間</th>
                    <th className="px-3 py-2 text-left">事件</th>
                    <th className="px-3 py-2 text-left">通路</th>
                    <th className="px-3 py-2 text-left">目標</th>
                    <th className="px-3 py-2 text-left">狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant bg-surface">
                  {recent.map((d) => (
                    <tr key={d.id}>
                      <td className="px-3 py-2 whitespace-nowrap text-on-surface-variant">
                        {new Date(d.created_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{d.event_code}</td>
                      <td className="px-3 py-2">{d.channel_code}</td>
                      <td className="px-3 py-2 font-mono text-xs">{maskRef(d.target_ref)}</td>
                      <td className="px-3 py-2">
                        <DeliveryStatusBadge status={d.status} />
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

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className={`rounded-xl border border-outline-variant p-5 ${accent ?? "bg-surface-container"}`}>
      <div className="text-xs text-on-surface-variant">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "error" | "warning" | "info";
}) {
  const styles = {
    success: "border-success/30 bg-success-container text-success",
    error: "border-error/30 bg-error-container text-error",
    warning: "border-warning/30 bg-warning-container text-warning",
    info: "border-primary/30 bg-primary-container text-primary",
  };
  return (
    <div className={`rounded-lg border p-4 ${styles[tone]}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function maskRef(ref: string): string {
  if (ref.startsWith("https://chat.googleapis.com/")) {
    return `${ref.slice(0, 45)}…`;
  }
  if (ref.length <= 18) return ref;
  return `${ref.slice(0, 12)}…${ref.slice(-4)}`;
}

function AdminForbidden({ email }: { email: string | null }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-outline-variant bg-surface-container p-8 text-center">
        <div className="text-4xl mb-3">🚫</div>
        <h2 className="text-xl font-semibold mb-2">無 Notification 管理權限</h2>
        <p className="text-sm text-on-surface-variant">
          目前登入為 <span className="font-mono">{email ?? "unknown"}</span>，不在 admin allowlist。
          請聯絡管理員把你的 email 加進 <code className="text-xs">NOTIFICATION_ADMIN_EMAILS</code>。
        </p>
      </div>
    </div>
  );
}
