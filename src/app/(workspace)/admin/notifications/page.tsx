import Link from "next/link";
import { redirect } from "next/navigation";
import { getNotificationDashboardData } from "@/domain/notifications";
import { NotificationsPageHeader } from "./_parts/page-header";
import { DeliveryStatusBadge } from "./_parts/delivery-status-badge";
import { DashboardTables } from "./_dashboard-tables";

export default async function NotificationsDashboardPage() {
  let data: Awaited<ReturnType<typeof getNotificationDashboardData>>;
  try {
    data = await getNotificationDashboardData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHENTICATED") redirect("/login");
    if (msg.startsWith("FORBIDDEN")) return <AdminForbidden />;
    throw err;
  }
  const { stats7d, stats24h, recentFailed, recent } = data;

  const total7d = stats7d.sent + stats7d.failed + stats7d.pending + stats7d.retrying;
  const total24h = stats24h.sent + stats24h.failed + stats24h.pending + stats24h.retrying;
  const successRate7d = total7d > 0 ? Math.round((stats7d.sent / total7d) * 100) : 100;

  return (
    <div className="min-h-screen bg-white">
      <NotificationsPageHeader
        title="通知儀表板"
        subtitle="IM 通知模組整體運作概況"
        breadcrumb={[
          { label: "通知中心", href: "/admin/notifications" },
          { label: "儀表板" },
        ]}
      />

      <div className="mx-auto max-w-7xl px-6 py-6 space-y-8">
        {/* Stat cards */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard label="過去 24h 送出" value={total24h} />
          <StatCard label="過去 7 天送出" value={total7d} />
          <StatCard
            label="7 天成功率"
            value={`${successRate7d}%`}
            tone={successRate7d >= 95 ? "success" : "warning"}
          />
          <StatCard
            label="近 24h 失敗"
            value={stats24h.failed}
            tone={stats24h.failed > 0 ? "error" : "default"}
          />
        </section>

        {/* 7 天分佈 */}
        <section>
          <h3 className="text-[13px] font-semibold text-[#2C2C2A] mb-3">過去 7 天狀態分佈</h3>
          <div className="grid grid-cols-4 gap-3">
            <MiniStat label="已送達" value={stats7d.sent} tone="success" />
            <MiniStat label="失敗" value={stats7d.failed} tone="error" />
            <MiniStat label="重試中" value={stats7d.retrying} tone="warning" />
            <MiniStat label="排隊中" value={stats7d.pending} tone="info" />
          </div>
        </section>

        <DashboardTables
          recentFailed={recentFailed.map((d) => ({
            id: d.id,
            created_at: d.created_at,
            event_code: d.event_code,
            channel_code: d.channel_code,
            target_ref: d.target_ref,
            last_error: d.last_error,
          }))}
          recent={recent.map((d) => ({
            id: d.id,
            created_at: d.created_at,
            event_code: d.event_code,
            channel_code: d.channel_code,
            target_ref: d.target_ref,
            status: d.status,
          }))}
          renderStatus={(s) => <DeliveryStatusBadge status={s} />}
        />

        {/* Footer link */}
        <div className="text-right">
          <Link
            href="/admin/notifications/deliveries?status=failed"
            className="text-[12.5px] text-[#185FA5] hover:underline"
          >
            查看全部失敗記錄 →
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "success" | "warning" | "error";
}) {
  const bg =
    tone === "success"
      ? "bg-[#EAF3DE] border-[#C5DC9F]"
      : tone === "warning"
        ? "bg-[#FDF3E3] border-[#F5DCA0]"
        : tone === "error"
          ? "bg-[#FDECEA] border-[#F5AEAD]"
          : "bg-white border-[#EEECE6]";
  return (
    <div className={`rounded-xl border p-5 ${bg}`}>
      <div className="text-[11px] text-[#5A5955]">{label}</div>
      <div className="mt-1 text-3xl font-bold text-[#2C2C2A]">{value}</div>
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
  const styles: Record<typeof tone, string> = {
    success: "bg-[#EAF3DE] text-[#3B6D11] border-[#C5DC9F]",
    error: "bg-[#FDECEA] text-[#CC0000] border-[#F5AEAD]",
    warning: "bg-[#FDF3E3] text-[#854F0B] border-[#F5DCA0]",
    info: "bg-[#EAF4FB] text-[#185FA5] border-[#BFD9EE]",
  };
  return (
    <div className={`rounded-lg border p-4 ${styles[tone]}`}>
      <div className="text-[11px] opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function AdminForbidden() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-[#EEECE6] bg-white p-8 text-center">
        <div className="text-4xl mb-3">🚫</div>
        <h2 className="text-[16px] font-semibold text-[#2C2C2A] mb-2">無 Notification 管理權限</h2>
        <p className="text-[12.5px] text-[#5A5955]">
          請聯絡管理員把你的 email 加進 admin allowlist。
        </p>
      </div>
    </div>
  );
}
