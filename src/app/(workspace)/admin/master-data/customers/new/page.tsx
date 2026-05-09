import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import {
  CustomerDetailView,
  type DetailCustomer,
  type AccountRef,
} from "../[id]/_components/customer-detail-view";

export const dynamic = "force-dynamic";

// /customers/new 直接 reuse detail view，走 forceCreating 模式：
// 標題顯示「（未命名客戶）」、CRUD pill 顯示 [取消 / 建立並開啟]、Tabs 隱藏。
const PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000";

const placeholderCustomer: DetailCustomer = {
  id: PLACEHOLDER_ID,
  code: "",
  name: "",
  type: "individual",
  tax_id: null,
  national_id: null,
  phone: null,
  email: null,
  address: null,
  birthday: null,
  source_module: null,
  gl_receivable_account_id: null,
  notes: null,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  external_source: null,
  external_id: null,
};

export default async function NewCustomerPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有建立客戶的權限</p>
      </main>
    );
  }

  const supabase = await createClient();
  const brand = getBrandKey();
  const { data: accountsData } = await supabase
    .from("accounts")
    .select("id, acct_code, acct_name")
    .eq("brand_id", brand)
    .eq("is_active", true)
    .order("acct_code");
  const accounts = (accountsData ?? []) as unknown as AccountRef[];

  return (
    <CustomerDetailView
      customer={placeholderCustomer}
      contacts={[]}
      vehicles={[]}
      workOrders={[]}
      models={[]}
      accounts={accounts}
      canEdit={true}
      forceCreating={true}
    />
  );
}
