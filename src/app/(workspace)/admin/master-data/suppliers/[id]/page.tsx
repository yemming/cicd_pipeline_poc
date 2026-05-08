import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getSupplierById,
  listAccounts,
} from "@/lib/master-data/queries";
import { updateSupplierAction } from "@/lib/master-data/supplier-actions";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { SupplierForm } from "../_components/supplier-form";

export const dynamic = "force-dynamic";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.SUPPLIER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視供應商的權限</p>
      </main>
    );
  }

  const [supplier, accounts] = await Promise.all([
    getSupplierById(id),
    listAccounts({ acctType: "liability" }),
  ]);
  if (!supplier) notFound();

  const canEdit = await hasPermission(PERMISSIONS.SUPPLIER_EDIT);

  return (
    <main className="px-6 py-6 max-w-[1100px] space-y-5">
      <nav className="text-[13px] text-[#6B778C]">
        <Link href="/admin/master-data/suppliers" className="hover:text-[#172B4D]">
          供應商
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#172B4D]">
          {supplier.code} ・ {supplier.name}
        </span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">
          編輯供應商 ・ {supplier.name}
        </h1>
        <p className="text-[13px] text-[#6B778C]">
          建立於{" "}
          {new Date(supplier.created_at).toLocaleString("zh-TW", {
            timeZone: "Asia/Taipei",
          })}{" "}
          ・ 最近更新{" "}
          {new Date(supplier.updated_at).toLocaleString("zh-TW", {
            timeZone: "Asia/Taipei",
          })}
        </p>
      </header>

      <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
        {canEdit ? (
          <SupplierForm
            mode="edit"
            action={updateSupplierAction}
            supplier={supplier}
            accounts={accounts}
          />
        ) : (
          <p className="text-[14px] text-[#6B778C]">僅可檢視；沒有編輯權限</p>
        )}
      </section>
    </main>
  );
}
