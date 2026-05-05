import { redirect } from "next/navigation";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { listAdminRows } from "@/lib/admins";
import { AdminsEditor } from "./_components/admins-editor";

export const dynamic = "force-dynamic";

export default async function AdminsPage() {
  const { userId, email, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto pt-12">
        <div className="bg-white rounded-3xl p-12 shadow-sm border border-slate-100 text-center">
          <h1 className="text-2xl font-bold mb-2">無權限</h1>
          <p className="text-sm text-on-surface-variant">
            目前帳號 ({email}) 不是系統管理員。
          </p>
        </div>
      </div>
    );
  }

  const rows = await listAdminRows();
  const envFallback =
    process.env.NOTIFICATION_ADMIN_EMAILS ?? process.env.FEEDBACK_ADMIN_EMAILS;

  return (
    <AdminsEditor
      rows={rows}
      currentEmail={email ?? ""}
      envFallback={envFallback ?? null}
    />
  );
}
