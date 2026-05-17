import { redirect } from "next/navigation";
import { getNotificationTargetsBoardData } from "@/domain/notifications";
import { NotificationsPageHeader } from "../_parts/page-header";
import { CreateTargetForm } from "./_create-form";
import { CandidatesSection } from "./_candidates-section";
import { TargetsGrid, type TargetRow } from "./_targets-grid";

export default async function TargetsPage() {
  let data: Awaited<ReturnType<typeof getNotificationTargetsBoardData>>;
  try {
    data = await getNotificationTargetsBoardData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHENTICATED") redirect("/login");
    if (msg.startsWith("FORBIDDEN")) {
      return <div className="p-8 text-center text-[#5A5955]">無管理權限</div>;
    }
    throw err;
  }
  const { channels, targets, candidates } = data;

  const rows: TargetRow[] = targets.map((t) => ({
    id: t.id,
    channel_code: t.channel_code,
    target_type: t.target_type,
    display_name: t.display_name,
    target_ref: t.target_ref,
    is_active: t.is_active,
  }));

  return (
    <div className="min-h-screen bg-white">
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
          <h3 className="text-[13px] font-semibold text-[#2C2C2A] mb-3">
            新發現的對話
            {candidates.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#854F0B] text-white text-[11px] font-bold align-middle">
                {candidates.length}
              </span>
            )}
          </h3>
          <CandidatesSection
            candidates={candidates.map((c) => ({
              id: c.id,
              channel_code: c.channel_code,
              target_type: c.target_type,
              target_ref: c.target_ref,
              discovered_via: c.discovered_via,
              display_name: c.display_name,
              source_user_id: c.source_user_id,
              last_message_text: c.last_message_text,
              last_seen_at: c.last_seen_at,
              message_count: c.message_count,
            }))}
          />
        </section>

        <section>
          <h3 className="text-[13px] font-semibold text-[#2C2C2A] mb-3">手動新增目標</h3>
          <CreateTargetForm
            channels={channels.map((c) => ({ id: c.id, code: c.code, displayName: c.display_name }))}
          />
        </section>

        <section>
          <h3 className="text-[13px] font-semibold text-[#2C2C2A] mb-3">現有目標（{targets.length}）</h3>
          <TargetsGrid rows={rows} />
        </section>
      </div>
    </div>
  );
}
