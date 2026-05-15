import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getRoDraftFromAppointment,
  getDefaultDraftCandidate,
} from "@/domain/repair-orders";

import { RepairOrderConfirmView } from "./_components/repair-order-confirm-view";

export const dynamic = "force-dynamic";

export default async function RepairOrderNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_CREATE))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有開立工單的權限</p>
      </main>
    );
  }
  const sp = await searchParams;
  let appointmentId = sp.from || sp.appointment_id || null;

  // POC：若沒帶 from，自動取最近一筆預約 demo
  if (!appointmentId) {
    const candidate = await getDefaultDraftCandidate();
    appointmentId = candidate?.id ?? null;
  }

  if (!appointmentId) {
    return (
      <main className="px-6 py-6 space-y-3">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">無可轉 RO 的來源</h1>
        <p className="text-[12.5px] text-[#5A5955]">
          目前沒有任何預約 / 預檢單可供轉成 RO。請先到{" "}
          <Link href="/parts/aftersales/appointments" className="text-[#185FA5] underline">
            預約管理
          </Link>{" "}
          建立預約。
        </p>
      </main>
    );
  }

  const draft = await getRoDraftFromAppointment(appointmentId);
  if (!draft) {
    return (
      <main className="px-6 py-6 space-y-3">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">查無此預約</h1>
        <p className="text-[12.5px] text-[#5A5955]">appointment_id={appointmentId}</p>
        <Link href="/parts/aftersales/repair-orders" className="text-[#185FA5] underline text-[12.5px]">
          ← 回工單列表
        </Link>
      </main>
    );
  }

  return <RepairOrderConfirmView draft={draft} />;
}
