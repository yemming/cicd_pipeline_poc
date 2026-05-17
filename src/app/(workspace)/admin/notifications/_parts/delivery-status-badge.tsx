import type { DeliveryStatus } from "@/lib/notifications";

const TONE: Record<DeliveryStatus, { label: string; cls: string }> = {
  pending: { label: "排隊中", cls: "bg-[#F2F2F2] text-[#6B6A68]" },
  sent: { label: "已送達", cls: "bg-[#EAF3DE] text-[#3B6D11]" },
  failed: { label: "失敗", cls: "bg-[#FDECEA] text-[#CC0000]" },
  retrying: { label: "重試中", cls: "bg-[#FDF3E3] text-[#854F0B]" },
};

export function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  const t = TONE[status];
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ${t.cls}`}
    >
      {t.label}
    </span>
  );
}
