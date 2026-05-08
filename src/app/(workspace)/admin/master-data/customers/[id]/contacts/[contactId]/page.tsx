import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getCustomerById,
  getCustomerContactById,
} from "@/lib/master-data/queries";
import { updateCustomerContactAction } from "@/lib/master-data/customer-contact-actions";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { ContactForm } from "../_components/contact-form";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  primary: "主要聯絡人",
  emergency: "緊急聯絡人",
  family: "家屬",
  secretary: "秘書 / 助理",
  other: "其他",
};

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string; contactId: string }>;
}) {
  const { id, contactId } = await params;

  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視客戶的權限</p>
      </main>
    );
  }

  const [customer, contact] = await Promise.all([
    getCustomerById(id),
    getCustomerContactById(contactId),
  ]);
  if (!customer || !contact) notFound();
  if (contact.customer_id !== customer.id) notFound();

  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);

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
        <span className="text-[#172B4D]">
          {ROLE_LABEL[contact.role] ?? contact.role} ・ {contact.name}
        </span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">
          編輯聯絡人 ・ {contact.name}
        </h1>
        <p className="text-[13px] text-[#6B778C]">
          建立於{" "}
          {new Date(contact.created_at).toLocaleString("zh-TW", {
            timeZone: "Asia/Taipei",
          })}
        </p>
      </header>

      <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
        {canEdit ? (
          <ContactForm
            mode="edit"
            action={updateCustomerContactAction}
            customerId={customer.id}
            contact={contact}
          />
        ) : (
          <p className="text-[14px] text-[#6B778C]">僅可檢視；沒有編輯權限</p>
        )}
      </section>
    </main>
  );
}
