import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { AdminProvider } from "@/components/admin-context";
import { WorkspaceShell } from "@/components/workspace-shell";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin } = await getCurrentUserAndAdmin();
  return (
    <AdminProvider isAdmin={isAdmin}>
      <WorkspaceShell>{children}</WorkspaceShell>
    </AdminProvider>
  );
}
