import type { DeliveryStatus } from "@/lib/notifications";

const TONE: Record<DeliveryStatus, { label: string; cls: string }> = {
  pending: { label: "排隊中", cls: "bg-surface-container text-on-surface-variant" },
  sent: { label: "已送達", cls: "bg-success-container text-success" },
  failed: { label: "失敗", cls: "bg-error-container text-error" },
  retrying: { label: "重試中", cls: "bg-warning-container text-warning" },
};

export function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  const t = TONE[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${t.cls}`}
    >
      {t.label}
    </span>
  );
}
