import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getReplenishmentPolicyById,
  listWarehouses,
} from "@/lib/master-data/queries";
import {
  deleteReplenishmentPolicyAction,
  updateReplenishmentPolicyAction,
} from "@/lib/master-data/replenishment-policy-actions";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { ReplenishmentPolicyForm } from "../_components/replenishment-policy-form";

export const dynamic = "force-dynamic";

export default async function EditReplenishmentPolicyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.REPLENISHMENT_POLICY_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視補貨計畫的權限</p>
      </main>
    );
  }

  const [policy, warehouses] = await Promise.all([
    getReplenishmentPolicyById(id),
    listWarehouses(),
  ]);
  if (!policy) notFound();

  const canEdit = await hasPermission(PERMISSIONS.REPLENISHMENT_POLICY_EDIT);

  return (
    <main className="px-6 py-6 max-w-[900px] space-y-5">
      <nav className="text-[13px] text-[#6B778C]">
        <Link href="/admin/master-data/replenishment-policies" className="hover:text-[#172B4D]">
          補貨計畫設定
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#172B4D]">編輯</span>
      </nav>

      <header className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="text-[20px] font-bold text-[#172B4D]">編輯補貨計畫</h1>
          <p className="text-[13px] text-[#6B778C]">
            最近更新{" "}
            {new Date(policy.updated_at).toLocaleString("zh-TW", {
              timeZone: "Asia/Taipei",
            })}
          </p>
        </div>
        {canEdit && (
          <form action={deleteReplenishmentPolicyAction}>
            <input type="hidden" name="id" value={policy.id} />
            <button
              type="submit"
              className="px-3 py-1.5 text-[13px] text-[#BF2600] border border-[#FFBDAD] rounded hover:bg-[#FFEBE6]"
            >
              刪除這筆計畫
            </button>
          </form>
        )}
      </header>

      <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
        {canEdit ? (
          <ReplenishmentPolicyForm
            mode="edit"
            action={updateReplenishmentPolicyAction}
            policy={policy}
            warehouses={warehouses}
          />
        ) : (
          <p className="text-[14px] text-[#6B778C]">僅可檢視；沒有編輯權限</p>
        )}
      </section>
    </main>
  );
}
