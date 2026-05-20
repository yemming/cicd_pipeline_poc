export const BALANCE_PAGE_SIZE_DEFAULT = 50;

// ──────────────────────────────────────────────────────────────────────────
// 序列號生命週期型別（M04U-10 升級）
//
// types + 純函式放這裡，stock.ts (server module) 只 import 用、不在那裡 export。
// ──────────────────────────────────────────────────────────────────────────

export type SerialLifecycleStageKey =
  | "receipt"
  | "in_stock"
  | "reserved"
  | "issued"
  | "warranty";

export type SerialLifecycleStage = {
  key: SerialLifecycleStageKey;
  label: string;
  icon: string;
  state: "done" | "active" | "pending" | "skipped";
  caption: string | null;
  event_time: string | null;
};

export type WarrantyStatus = "none" | "active" | "expiring_soon" | "expired";

export type WarrantyClassification = {
  status: WarrantyStatus;
  start: string | null;
  end: string | null;
  days_remaining: number | null;
};

export function classifyWarranty(
  start: string | null,
  end: string | null,
): WarrantyClassification {
  if (!end) return { status: "none", start, end, days_remaining: null };
  const endDate = new Date(end);
  const now = new Date();
  const diffMs = endDate.getTime() - now.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) return { status: "expired", start, end, days_remaining: days };
  if (days <= 60) return { status: "expiring_soon", start, end, days_remaining: days };
  return { status: "active", start, end, days_remaining: days };
}

// 給生命週期判讀用的最小化資料介面 — 避免循環 import stock.ts 的 server-only types
export type LifecycleHistoryEvent = {
  event_time: string;
  event_type: "receipt" | "transfer_out" | "transfer_in" | "issue";
  doc_no: string | null;
  doc_kind: string;
};

export type LifecycleCurrent = {
  warehouse_name: string | null;
  status: string;
  last_movement_at: string;
};

export function deriveLifecycleStages(
  history: LifecycleHistoryEvent[],
  current: LifecycleCurrent,
  warranty: { status: WarrantyStatus; end: string | null },
): SerialLifecycleStage[] {
  const receiptEvent = [...history]
    .reverse()
    .find((h) => h.event_type === "receipt" || h.event_type === "transfer_in");
  const issueEvent = history.find((h) => h.event_type === "issue");

  const status = current.status;
  const isIssued = status === "issued";
  const isReserved = status === "reserved";
  const isAvailable = status === "available";

  function fmtTime(t: string | null | undefined): string | null {
    if (!t) return null;
    try {
      return new Date(t).toLocaleString("zh-TW", { hour12: false });
    } catch {
      return null;
    }
  }

  return [
    {
      key: "receipt",
      label: "入庫",
      icon: "input",
      state: receiptEvent ? "done" : "pending",
      caption: receiptEvent
        ? `${receiptEvent.doc_kind}${receiptEvent.doc_no ? " · " + receiptEvent.doc_no : ""}`
        : "尚未入庫",
      event_time: receiptEvent ? fmtTime(receiptEvent.event_time) : null,
    },
    {
      key: "in_stock",
      label: "庫存中",
      icon: "inventory_2",
      state: isAvailable ? "active" : isReserved || isIssued ? "done" : "pending",
      caption: current.warehouse_name ?? null,
      event_time: isAvailable ? fmtTime(current.last_movement_at) : null,
    },
    {
      key: "reserved",
      label: "已預留",
      icon: "bookmark",
      state: isReserved ? "active" : isIssued ? "skipped" : "pending",
      caption: isReserved
        ? "已預留給工單"
        : isIssued
          ? "未經預留直接出庫"
          : "尚未預留",
      event_time: isReserved ? fmtTime(current.last_movement_at) : null,
    },
    {
      key: "issued",
      label: "出庫 / 領料",
      icon: "logout",
      state: isIssued ? "done" : "pending",
      caption: issueEvent
        ? `${issueEvent.doc_kind}${issueEvent.doc_no ? " · " + issueEvent.doc_no : ""}`
        : isIssued
          ? "已出庫"
          : "尚未出庫",
      event_time: issueEvent
        ? fmtTime(issueEvent.event_time)
        : isIssued
          ? fmtTime(current.last_movement_at)
          : null,
    },
    {
      key: "warranty",
      label: "保固期",
      icon: "shield",
      state:
        warranty.status === "none"
          ? "pending"
          : warranty.status === "expired"
            ? "done"
            : isIssued
              ? "active"
              : "pending",
      caption:
        warranty.status === "none"
          ? "尚未登記保固"
          : warranty.status === "expired"
            ? `已逾保固（${warranty.end}）`
            : warranty.status === "expiring_soon"
              ? `保固即將到期 ${warranty.end}`
              : `保固至 ${warranty.end}`,
      event_time: warranty.end,
    },
  ];
}
