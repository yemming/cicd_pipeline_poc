import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getIssueForReturn,
  listReturnableIssues,
} from "@/domain/parts-return-in";

import { ReturnInNewForm } from "./_components/return-in-new-form";

export const dynamic = "force-dynamic";

export default async function NewReturnInPage({
  searchParams,
}: {
  searchParams: Promise<{ issue_id?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有建立退入單的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const issueId = sp.issue_id;

  const [issues, picked] = await Promise.all([
    listReturnableIssues(),
    issueId ? getIssueForReturn(issueId) : Promise.resolve(null),
  ]);

  return <ReturnInNewForm issues={issues} initialPick={picked} />;
}
