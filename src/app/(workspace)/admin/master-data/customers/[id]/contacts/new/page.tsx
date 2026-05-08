import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCustomerById } from "@/lib/master-data/queries";
import { createCustomerContactAction } from "@/lib/master-data/customer-contact-actions";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { ContactForm } from "../_components/contact-form";

export const dynamic = "force-dynamic";

export default async function NewContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有編輯客戶的權限</p>
      </main>
    );
  }

  const customer = await getCustomerById(id);
  if (!customer) notFound();

  return (
    <main className="px-6 py-6 max-w-[900px] space-y-5">
      <nav className="text-[13px] text-[#6B778C]">
        <Link href="/admin/master-data/customers" className="hover:text-[#172B4D]">
          客戶資料
        </Link>
        <span className="mx-2">/</span>
        <Link
          href={`/admin/master-data/customers/${customer.id}`}
          className="hover:text-[#172B4D]"
        >
          {customer.code} ・ {customer.name}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#172B4D]">新增聯絡人</span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">
          新增聯絡人 ・ {customer.name}
        </h1>
        <p className="text-[13px] text-[#6B778C]">
          可一個客戶建多筆聯絡人；通常 primary 一筆但不強制
        </p>
      </header>

      <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
        <ContactForm
          mode="create"
          action={createCustomerContactAction}
          customerId={customer.id}
        />
      </section>
    </main>
  );
}
