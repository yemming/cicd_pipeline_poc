import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { AdminProvider } from "@/components/admin-context";
import { WorkspaceShell } from "@/components/workspace-shell";
import { NavProvider } from "@/components/nav-provider";
import { loadNavTree } from "@/lib/nav/loader";
import { getBrandKey } from "@/lib/brands/current";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin } = await getCurrentUserAndAdmin();
  const modules = await loadNavTree(getBrandKey());
  return (
    <AdminProvider isAdmin={isAdmin}>
      <NavProvider modules={modules}>
        <WorkspaceShell>{children}</WorkspaceShell>
      </NavProvider>
    </AdminProvider>
  );
}
