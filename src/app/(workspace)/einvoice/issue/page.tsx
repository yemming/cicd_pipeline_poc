import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getSalesOrderForInvoice, type SalesOrderInvoicePrefill } from "@/domain/sales-orders";
import { fetchRoForInvoice } from "@/domain/ro-checkouts";

import {
  ManualIssueForm,
  type ManualIssuePrefill,
} from "./_components/manual-issue-form";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ orderId?: string; roId?: string }>;
};

export default async function EInvoiceIssuePage({ searchParams }: Props) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.EINVOICE_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有開立電子發票的權限</p>
      </main>
    );
  }

  const sp = await searchParams;

  // 1) P1-#4：?orderId=<sales_order_id> → SalesOrderInvoicePrefill
  if (sp.orderId) {
    const orderPrefill: SalesOrderInvoicePrefill | null =
      await getSalesOrderForInvoice(sp.orderId);
    return <ManualIssueForm prefill={orderPrefill} />;
  }

  // 2) P1-#10（本任務）：?roId=<repair_order_id> → ManualIssuePrefill（source='service'）
  if (sp.roId) {
    const ro = await fetchRoForInvoice(sp.roId);
    if (ro) {
      // ro_checkouts.invoice.kind → ManualIssueForm 的 invoiceType（最佳猜測，可手動切）
      // 注意：實際 invoiceType 在 form 內由 prefill.customer_tax_id 決定初始 tab、
      // 載具 / 捐贈仍要 user 自選 tab 補欄位。我們只負責把可預填的買方資訊 / 品項帶進去。
      const prefill: ManualIssuePrefill = {
        source_module: "service",
        source_id: ro.ro_id,
        source_ref: `${ro.ro_code} · ${ro.checkout_no}`,
        display_title: `為工單 ${ro.ro_code} 開立發票（結帳 ${ro.checkout_no}）`,
        customer_name: ro.customer.name,
        customer_phone: ro.customer.phone,
        customer_email: ro.customer.email,
        customer_tax_id: ro.invoice_tax_id,
        total_amount: ro.total_amount,
        items: ro.items.map((it) => ({
          name: it.name,
          qty: it.qty,
          unitPrice: it.unitPrice,
        })),
        default_remark: `${ro.ro_code} 維修結帳（${ro.checkout_no}）`,
      };
      return <ManualIssueForm prefill={prefill} />;
    }
    // 找不到 RO 就 fallback 走空白表單
  }

  return <ManualIssueForm />;
}
