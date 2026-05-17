"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import {
  setCustomerActiveAction,
  deleteCustomerAction,
  updateSalesCustomerHabcGradeAction,
} from "@/lib/sales/customer-base-actions";
import {
  HABC_GRADES,
  HABC_LABEL,
  type HabcGrade,
  type SalesCustomerCrmFilters,
  type SalesCustomerCrmKpi,
  type SalesCustomerCrmRow,
} from "@/domain/sales-customer-base.constants";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  CrmCustomerCard,
  CrmKpiCard,
  CrmQuickFilterBar,
  CrmSidebar,
  type CrmCustomerCardChip,
  type CrmCustomerCardField,
  type CrmCustomerCardTraffic,
  type CrmQuickFilterChip,
  type CrmSidebarGroup,
} from "@/components/crm";

export type CustomerBaseRow = {
  id: string;
  code: string;
  name: string;
  type: "individual" | "corporate";
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  source_module: string | null;
  is_active: boolean;
  vehicle_count: number;
  contact_count: number;
};

export type CustomerBaseFilters = {
  type: string;
  status: string;
  q: string;
};

type Banner = { ok: boolean; msg: string } | null;
type ViewMode = "card" | "table" | "kanban";

const HABC_PILL_CLS: Record<HabcGrade, string> = {
  H: "bg-[#FDECEA] text-[#C8001A]",
  A: "bg-[#FDF3E3] text-[#854F0B]",
  B: "bg-[#EAF4FB] text-[#185FA5]",
  C: "bg-[#F1EFE8] text-[#5A5955]",
};

const HABC_BORDER_CLS: Record<HabcGrade, string> = {
  H: "border-l-[3px] border-l-[#C8001A]",
  A: "border-l-[3px] border-l-[#F0C97E]",
  B: "border-l-[3px] border-l-[#185FA5]",
  C: "border-l-[3px] border-l-[#9A9890]",
};

const FOLLOW_BADGE_CLS: Record<string, string> = {
  urgent: "bg-[#FDECEA] text-[#C8001A] border border-[#F5AEAD]",
  today: "bg-[#FDF3E3] text-[#854F0B] border border-[#F0C97E]",
  ok: "bg-[#E1F5EE] text-[#0F6E56] border border-[#5DCAA5]",
  none: "bg-[#F1EFE8] text-[#5A5955] border border-[#D5D3CB]",
};

const FOLLOW_BADGE_LABEL: Record<string, string> = {
  urgent: "🔴 逾期未跟進",
  today: "🟡 今日需跟進",
  ok: "🟢 追蹤中",
  none: "⬜ 未排程",
};

function habcToTraffic(g: HabcGrade | null): CrmCustomerCardTraffic {
  if (g === "H") return "red";
  if (g === "A") return "amber";
  return "green";
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

function buildQs(
  base: Record<string, string | undefined>,
  patch: Record<string, string | null>,
): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (v && v !== "all") next.set(k, v);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === "" || v === "all") next.delete(k);
    else next.set(k, v);
  }
  const s = next.toString();
  return s ? `?${s}` : "";
}

// ──────────────────────────────────────────────────────────────────────────
// dnd-kit 小卡片元件（Kanban 用）
// ──────────────────────────────────────────────────────────────────────────

function KanbanCard({
  row,
  pending,
  optimistic,
}: {
  row: SalesCustomerCrmRow;
  pending: boolean;
  optimistic: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: row.id,
    data: { row },
    disabled: pending,
  });
  const grade = row.habc_grade ?? "C";
  const followBadge = row.follow_up_status ?? "none";
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-testid={`kanban-card-${row.code}`}
      className={[
        "bg-white border border-[#EEECE6] rounded-lg p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow",
        HABC_BORDER_CLS[grade],
        isDragging ? "opacity-30" : "",
        optimistic ? "opacity-60" : "",
        pending ? "pointer-events-none" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="text-[12.5px] font-semibold text-[#2C2C2A] truncate">
          {row.name}
        </div>
        <span
          className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold font-mono shrink-0 ${HABC_PILL_CLS[grade]}`}
        >
          {grade}
        </span>
      </div>
      {row.phone ? (
        <div className="text-[10.5px] font-mono text-[#7A7A78] mb-1.5">
          {row.phone}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-1 mt-2">
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${FOLLOW_BADGE_CLS[followBadge]}`}
        >
          {FOLLOW_BADGE_LABEL[followBadge]}
        </span>
        {row.next_follow_up_date ? (
          <span className="text-[10px] font-mono text-[#9A9890]">
            {fmtDate(row.next_follow_up_date)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function KanbanColumn({
  grade,
  rows,
  pending,
  optimisticByRowId,
}: {
  grade: HabcGrade;
  rows: SalesCustomerCrmRow[];
  pending: boolean;
  optimisticByRowId: Record<string, HabcGrade | undefined>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${grade}` });
  return (
    <div
      ref={setNodeRef}
      data-testid={`kanban-col-${grade}`}
      className={[
        "bg-[#F4F3F0] rounded-lg p-3 min-h-[180px] transition-colors",
        isOver ? "ring-2 ring-[#185FA5] bg-[#EAF4FB]" : "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold font-mono ${HABC_PILL_CLS[grade]}`}
          >
            {grade}
          </span>
          <span className="text-[12px] font-semibold text-[#2C2C2A]">
            {HABC_LABEL[grade].replace(`${grade} `, "")}
          </span>
        </div>
        <span className="text-[11px] font-mono font-semibold bg-white px-2 py-0.5 rounded text-[#5A5955]">
          {rows.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <div className="text-[11.5px] text-[#9A9890] text-center py-6">
            拖曳客戶到此欄位
          </div>
        ) : (
          rows.map((r) => (
            <KanbanCard
              key={r.id}
              row={r}
              pending={pending}
              optimistic={optimisticByRowId[r.id] !== undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 主元件
// ──────────────────────────────────────────────────────────────────────────

export function CustomerBaseBoard({
  rows,
  totalCount,
  canEdit,
  filters,
  crmRows,
  crmKpi,
  crmFilters,
  view,
}: {
  rows: CustomerBaseRow[];
  totalCount: number;
  canEdit: boolean;
  filters: CustomerBaseFilters;
  crmRows: SalesCustomerCrmRow[];
  crmKpi: SalesCustomerCrmKpi;
  crmFilters: SalesCustomerCrmFilters;
  view: ViewMode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  // Table-view filters
  const [fType, setFType] = useState(filters.type);
  const [fStatus, setFStatus] = useState(filters.status);
  const [fQ, setFQ] = useState(view === "table" ? filters.q : crmFilters.q);

  // Kanban 樂觀更新狀態：rowId -> 拖過去的目標 grade（覆蓋 server rows）
  const [optimisticGrade, setOptimisticGrade] = useState<
    Record<string, HabcGrade | undefined>
  >({});
  const [draggingRow, setDraggingRow] = useState<SalesCustomerCrmRow | null>(
    null,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const pushUrl = (patch: Record<string, string | null>) => {
    const base: Record<string, string | undefined> = {
      view: view === "card" ? undefined : view,
      ...(view === "table"
        ? { type: filters.type, status: filters.status, q: filters.q }
        : {
            quick: crmFilters.quick,
            follow_status: crmFilters.follow_status,
            q: crmFilters.q,
          }),
    };
    const qs = buildQs(base, patch);
    startTransition(() => {
      router.push(`/crm/sales/customer-base${qs}`);
    });
  };

  const submitFilters = () => {
    if (view === "table") {
      pushUrl({
        type: fType === "all" ? null : fType,
        status: fStatus === "all" ? null : fStatus,
        q: fQ.trim() || null,
      });
    } else {
      pushUrl({ q: fQ.trim() || null });
    }
  };
  const resetFilters = () => {
    setFType("all");
    setFStatus("all");
    setFQ("");
    startTransition(() => {
      router.push(
        view === "card"
          ? "/crm/sales/customer-base"
          : `/crm/sales/customer-base?view=${view}`,
      );
    });
  };

  const toggleActive = (r: { id: string; is_active: boolean }) => {
    setActionPendingId(r.id);
    startTransition(async () => {
      const res = await setCustomerActiveAction(r.id, !r.is_active);
      setActionPendingId(null);
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = (r: { id: string; code: string; name: string }) => {
    if (
      !confirm(
        `確定刪除「${r.code} ${r.name}」？\n此動作不可復原；若有歷史工單／預約／車輛將會失敗，建議改用「停用」保留歷史。`,
      )
    )
      return;
    setActionPendingId(r.id);
    startTransition(async () => {
      const res = await deleteCustomerAction(r.id);
      setActionPendingId(null);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除客戶" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  // ── Kanban dnd-kit handlers ──────────────────────────────────────
  const onDragStart = (e: DragStartEvent) => {
    const row = (e.active.data.current as { row?: SalesCustomerCrmRow } | undefined)
      ?.row;
    setDraggingRow(row ?? null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDraggingRow(null);
    const overId = e.over?.id;
    if (!overId || typeof overId !== "string") return;
    if (!overId.startsWith("col-")) return;
    const targetGrade = overId.slice(4) as HabcGrade;
    if (!HABC_GRADES.includes(targetGrade)) return;
    const row = (e.active.data.current as { row?: SalesCustomerCrmRow } | undefined)
      ?.row;
    if (!row) return;
    const currentGrade = optimisticGrade[row.id] ?? row.habc_grade;
    if (currentGrade === targetGrade) return;

    // 樂觀更新
    setOptimisticGrade((prev) => ({ ...prev, [row.id]: targetGrade }));
    startTransition(async () => {
      const res = await updateSalesCustomerHabcGradeAction(row.id, targetGrade);
      if (res.ok) {
        // 成功 → 等 router.refresh 把 server 真值刷回來再清掉樂觀值
        router.refresh();
        // 用 setTimeout 確保 refresh 後再清，避免 flash 回原色
        setTimeout(() => {
          setOptimisticGrade((prev) => {
            const next = { ...prev };
            delete next[row.id];
            return next;
          });
        }, 400);
      } else {
        // 失敗 rollback
        setOptimisticGrade((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
        showBanner({ ok: false, msg: `✗ 更新失敗：${res.error}` });
      }
    });
  };

  // ── 計算覆蓋樂觀值後的 rows，以及 Kanban 分組 ──
  const effectiveCrmRows = useMemo(
    () =>
      crmRows.map((r) =>
        optimisticGrade[r.id] !== undefined
          ? { ...r, habc_grade: optimisticGrade[r.id]! }
          : r,
      ),
    [crmRows, optimisticGrade],
  );

  const kanbanByGrade: Record<HabcGrade, SalesCustomerCrmRow[]> = {
    H: [],
    A: [],
    B: [],
    C: [],
  };
  for (const r of effectiveCrmRows) {
    if (r.habc_grade && HABC_GRADES.includes(r.habc_grade)) {
      kanbanByGrade[r.habc_grade].push(r);
    }
  }

  // ── Sidebar groups ──────────────────────────────────────────────
  const sidebarGroups: CrmSidebarGroup[] = [
    {
      key: "habc",
      title: "HABC 分級",
      items: [
        {
          key: "all",
          label: "全部潛客",
          count: crmKpi.total,
          active: crmFilters.quick === "all",
          onClick: () => pushUrl({ quick: null }),
        },
        {
          key: "H",
          label: "H 熱潛客",
          count: crmKpi.h,
          active: crmFilters.quick === "H",
          onClick: () => pushUrl({ quick: "H" }),
        },
        {
          key: "A",
          label: "A 積極跟進",
          count: crmKpi.a,
          active: crmFilters.quick === "A",
          onClick: () => pushUrl({ quick: "A" }),
        },
        {
          key: "B",
          label: "B 培養中",
          count: crmKpi.b,
          active: crmFilters.quick === "B",
          onClick: () => pushUrl({ quick: "B" }),
        },
        {
          key: "C",
          label: "C 長期維護",
          count: crmKpi.c,
          active: crmFilters.quick === "C",
          onClick: () => pushUrl({ quick: "C" }),
        },
      ],
    },
    {
      key: "follow",
      title: "跟進狀態",
      items: [
        {
          key: "urgent",
          label: "逾期未跟進",
          count: crmKpi.urgent,
          active: crmFilters.quick === "urgent",
          onClick: () => pushUrl({ quick: "urgent" }),
        },
        {
          key: "today",
          label: "今日需跟進",
          count: crmKpi.today,
          active: crmFilters.quick === "today",
          onClick: () => pushUrl({ quick: "today" }),
        },
      ],
    },
  ];

  const quickChips: CrmQuickFilterChip[] = [
    {
      key: "all",
      label: "全部",
      active: crmFilters.quick === "all",
      onClick: () => pushUrl({ quick: null }),
    },
    {
      key: "H",
      label: "H 熱潛客",
      count: crmKpi.h,
      active: crmFilters.quick === "H",
      onClick: () => pushUrl({ quick: "H" }),
    },
    {
      key: "A",
      label: "A 積極跟進",
      count: crmKpi.a,
      active: crmFilters.quick === "A",
      onClick: () => pushUrl({ quick: "A" }),
    },
    {
      key: "B",
      label: "B 培養中",
      count: crmKpi.b,
      active: crmFilters.quick === "B",
      onClick: () => pushUrl({ quick: "B" }),
    },
    {
      key: "C",
      label: "C 長期維護",
      count: crmKpi.c,
      active: crmFilters.quick === "C",
      onClick: () => pushUrl({ quick: "C" }),
    },
    {
      key: "urgent",
      label: "🔴 逾期未跟進",
      count: crmKpi.urgent,
      active: crmFilters.quick === "urgent",
      onClick: () => pushUrl({ quick: "urgent" }),
    },
    {
      key: "new",
      label: "✨ 本月新進",
      count: crmKpi.this_month_new,
      active: crmFilters.quick === "new",
      onClick: () => pushUrl({ quick: "new" }),
    },
    {
      key: "manage",
      label: "⚙ 管理篩選",
      active: false,
      onClick: () => pushUrl({ quick: null, follow_status: null }),
    },
  ];

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  // ── Table view columns（保留既有） ────────────────────────────────
  const columns: DataGridColumn<CustomerBaseRow>[] = [
    {
      id: "code",
      header: "客戶代碼",
      width: 110,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/crm/sales/customer-base/${r.id}`}
          className="font-mono text-[12px] text-[#185FA5] hover:underline"
        >
          {r.code}
        </Link>
      ),
      exportValue: (r) => r.code,
      sortValue: (r) => r.code,
    },
    {
      id: "name",
      header: "客戶名稱",
      cell: (r) => (
        <div>
          <Link
            href={`/crm/sales/customer-base/${r.id}`}
            className="font-semibold text-[12.5px] text-[#185FA5] hover:underline"
          >
            {r.name}
          </Link>
          {r.address ? (
            <div className="text-[11px] text-[#9A9890] truncate max-w-[280px]">
              {r.address}
            </div>
          ) : null}
        </div>
      ),
      exportValue: (r) => r.name,
      sortValue: (r) => r.name,
    },
    {
      id: "type",
      header: "類型",
      width: 70,
      cell: (r) =>
        r.type === "corporate" ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EEF4FB] text-[#185FA5]">
            公司
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EBF3FF] text-[#1A3A5C]">
            個人
          </span>
        ),
      exportValue: (r) => (r.type === "corporate" ? "公司" : "個人"),
      sortValue: (r) => r.type,
    },
    {
      id: "phone",
      header: "聯絡電話",
      width: 130,
      cell: (r) =>
        r.phone ? (
          <span className="font-mono text-[11.5px]">{r.phone}</span>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => r.phone ?? "",
      sortValue: (r) => r.phone ?? "",
    },
    {
      id: "vehicle_count",
      header: "車輛數",
      width: 80,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12px] text-[#2C2C2A]">
          {r.vehicle_count}
        </span>
      ),
      exportValue: (r) => r.vehicle_count,
      sortValue: (r) => r.vehicle_count,
    },
    {
      id: "is_active",
      header: "狀態",
      width: 80,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${
            r.is_active
              ? "bg-[#EAF3DE] text-[#3B6D11]"
              : "bg-[#F2F2F2] text-[#6B6A68]"
          }`}
        >
          {r.is_active ? "往來中" : "停用"}
        </span>
      ),
      exportValue: (r) => (r.is_active ? "往來中" : "停用"),
      sortValue: (r) => r.is_active,
    },
  ];

  // ── view 切換器（JSX 變數，不是元件） ───────────
  const viewSwitcher = (
    <div className="ml-auto flex items-center gap-1 bg-[#F2F2F2] rounded-full p-0.5">
      {(
        [
          { v: "card", label: "🎴 卡片" },
          { v: "table", label: "📋 列表" },
          { v: "kanban", label: "📊 Kanban" },
        ] as const
      ).map((opt) => (
        <button
          key={opt.v}
          type="button"
          onClick={() => pushUrl({ view: opt.v === "card" ? null : opt.v })}
          aria-pressed={view === opt.v}
          data-testid={`view-toggle-${opt.v}`}
          className={`h-[26px] px-3 rounded-full text-[11.5px] font-medium transition-colors ${
            view === opt.v
              ? "bg-white text-[#1A3A5C] shadow-sm"
              : "text-[#5A5955] hover:text-[#2C2C2A]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  // ── KPI 5 卡（card / kanban 共用） — JSX 變數，避免 react-hooks/static-components 警告 ──
  const kpiRow = (
    <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
      <CrmKpiCard
        icon="groups"
        label="全部潛客"
        value={crmKpi.total.toLocaleString("en-US")}
        sub={`本月新增 ${crmKpi.this_month_new} 位`}
        accent="navy"
        active={crmFilters.quick === "all"}
        onClick={() => pushUrl({ quick: null })}
      />
      <CrmKpiCard
        icon="local_fire_department"
        label="H 熱潛客"
        value={crmKpi.h}
        sub="需本週內跟進"
        accent="red"
        active={crmFilters.quick === "H"}
        onClick={() => pushUrl({ quick: crmFilters.quick === "H" ? null : "H" })}
      />
      <CrmKpiCard
        icon="trending_up"
        label="A 積極跟進"
        value={crmKpi.a}
        sub="3 個月內購買"
        accent="amber"
        active={crmFilters.quick === "A"}
        onClick={() => pushUrl({ quick: crmFilters.quick === "A" ? null : "A" })}
      />
      <CrmKpiCard
        icon="schedule"
        label="B 培養中"
        value={crmKpi.b}
        sub="半年左右"
        accent="blue"
        active={crmFilters.quick === "B"}
        onClick={() => pushUrl({ quick: crmFilters.quick === "B" ? null : "B" })}
      />
      <CrmKpiCard
        icon="ac_unit"
        label="C 長期維護"
        value={crmKpi.c}
        sub="每月維持接觸"
        accent="teal"
        active={crmFilters.quick === "C"}
        onClick={() => pushUrl({ quick: crmFilters.quick === "C" ? null : "C" })}
      />
    </section>
  );

  // ── Render ────────────────────────────────────────────────────────
  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          銷售客戶基盤
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          銷售 CRM
        </span>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#F0EFFE] text-[#534AB7] font-semibold">
          v2
        </span>
        <span className="text-[12px] text-[#9A9890]">
          HABC 4 級分類・跟進狀態・名下車輛
        </span>
        {viewSwitcher}
      </header>

      {banner ? (
        <div
          data-testid="crm01a-banner"
          className={`px-3 py-2 rounded text-[13px] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11]"
              : "bg-[#FDECEA] text-[#CC0000]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {view === "card" ? (
        <>
          {kpiRow}
          <div className="flex gap-3 items-start">
            <CrmSidebar
              groups={sidebarGroups}
              quickTools={[
                {
                  key: "calls",
                  label: "電訪工作台",
                  href: "/crm/sales/call-tasks",
                  icon: "phone_in_talk",
                },
                {
                  key: "funnel",
                  label: "銷售漏斗看板",
                  href: "/sales/showroom/orders",
                  icon: "filter_alt",
                },
                {
                  key: "dormant",
                  label: "休眠戰敗管理",
                  href: "/crm/sales/dormant-leads",
                  icon: "ac_unit",
                },
              ]}
            />

            <div className="flex-1 min-w-0 space-y-3">
              {/* Quick filter + 搜尋 */}
              <section
                className={`bg-white border border-[#EEECE6] rounded-lg px-4 py-3 space-y-2 ${isPending ? "pointer-events-none opacity-60" : ""}`}
              >
                <div className="flex gap-2 items-end flex-wrap">
                  <div className="flex flex-col gap-1 flex-1 min-w-[240px]">
                    <label className={labelClass}>
                      代碼 / 名稱 / 電話 / Email
                    </label>
                    <input
                      type="text"
                      value={fQ}
                      onChange={(e) => setFQ(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && submitFilters()
                      }
                      placeholder="輸入關鍵字..."
                      className={`${inputClass} w-full`}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>跟進狀態</label>
                    <select
                      value={crmFilters.follow_status}
                      onChange={(e) =>
                        pushUrl({
                          follow_status:
                            e.target.value === "all" ? null : e.target.value,
                        })
                      }
                      className={`${inputClass} w-[130px]`}
                    >
                      <option value="all">所有狀態</option>
                      <option value="urgent">🔴 逾期未跟進</option>
                      <option value="today">🟡 今日需跟進</option>
                      <option value="ok">🟢 追蹤中</option>
                      <option value="none">⬜ 未排程</option>
                    </select>
                  </div>
                  <div className="flex gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={submitFilters}
                      disabled={isPending}
                      className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
                    >
                      {isPending ? "查詢中…" : "查詢"}
                    </button>
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                    >
                      重置
                    </button>
                    <Link
                      href="/crm/sales/customer-base/new"
                      aria-disabled={!canEdit}
                      data-testid="customer-base-create-link"
                      className={`h-[30px] inline-flex items-center px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] ${canEdit ? "" : "opacity-50 pointer-events-none"}`}
                    >
                      ＋ 新增潛客
                    </Link>
                  </div>
                </div>

                <CrmQuickFilterBar chips={quickChips} disabled={isPending} />
              </section>

              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[#9A9890]">
                  共{" "}
                  <b className="text-[#2C2C2A]">
                    {crmKpi.total.toLocaleString("en-US")}
                  </b>{" "}
                  筆客戶（顯示{" "}
                  <b className="text-[#2C2C2A]">
                    {crmRows.length.toLocaleString("en-US")}
                  </b>{" "}
                  筆）
                </span>
              </div>

              {crmRows.length === 0 ? (
                <div className="bg-white border border-[#EEECE6] rounded-lg px-6 py-12 text-center text-[12.5px] text-[#9A9890]">
                  無符合條件的客戶，請調整篩選或快篩條件
                </div>
              ) : (
                <div className="space-y-2">
                  {crmRows.map((r) => {
                    const chips: CrmCustomerCardChip[] = [];
                    if (r.habc_grade) {
                      chips.push({
                        key: "habc",
                        label: HABC_LABEL[r.habc_grade],
                        color:
                          r.habc_grade === "H"
                            ? "red"
                            : r.habc_grade === "A"
                              ? "amber"
                              : r.habc_grade === "B"
                                ? "blue"
                                : "gray",
                      });
                    } else {
                      chips.push({ key: "unc", label: "未分級", color: "gray" });
                    }
                    if (r.follow_up_status) {
                      chips.push({
                        key: "follow",
                        label:
                          FOLLOW_BADGE_LABEL[r.follow_up_status] ?? "—",
                        color:
                          r.follow_up_status === "urgent"
                            ? "red"
                            : r.follow_up_status === "today"
                              ? "amber"
                              : r.follow_up_status === "ok"
                                ? "teal"
                                : "gray",
                      });
                    }
                    if (!r.is_active) {
                      chips.push({ key: "off", label: "停用", color: "gray" });
                    }

                    const fields: CrmCustomerCardField[] = [
                      { label: "📞 電話", value: r.phone ?? "—" },
                      { label: "✉️ Email", value: r.email ?? "—" },
                      {
                        label: "📅 下次跟進",
                        value: r.next_follow_up_date
                          ? `${fmtDate(r.next_follow_up_date)}${
                              r.days_until_next_follow_up != null
                                ? r.days_until_next_follow_up < 0
                                  ? ` (逾期 ${Math.abs(r.days_until_next_follow_up)} 天)`
                                  : r.days_until_next_follow_up === 0
                                    ? " (今日)"
                                    : ` (剩 ${r.days_until_next_follow_up} 天)`
                                : ""
                            }`
                          : "—",
                        tone:
                          r.follow_up_status === "urgent"
                            ? "warn"
                            : r.follow_up_status === "today"
                              ? "soon"
                              : "default",
                      },
                      {
                        label: "🏍️ 車輛",
                        value:
                          r.vehicle_count > 0
                            ? `${r.vehicle_count} 台`
                            : "尚未購車",
                      },
                    ];

                    const isThisPending = actionPendingId === r.id;
                    const cardActions = (
                      <>
                        <Link
                          href={`/crm/sales/call-tasks/new?customer_id=${r.id}`}
                          className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#185FA5] hover:border-[#185FA5]"
                        >
                          📞 電訪
                        </Link>
                        <Link
                          href={`/crm/sales/customer-base/${r.id}`}
                          className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
                        >
                          詳情 →
                        </Link>
                      </>
                    );

                    return (
                      <CrmCustomerCard
                        key={r.id}
                        traffic={habcToTraffic(r.habc_grade)}
                        name={r.name}
                        code={`${r.code}${r.phone ? ` · ${r.phone}` : ""}`}
                        chips={chips}
                        fields={fields}
                        actions={cardActions}
                        disabled={isThisPending}
                        onClick={() =>
                          router.push(`/crm/sales/customer-base/${r.id}`)
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      ) : view === "kanban" ? (
        <>
          {kpiRow}
          <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-2.5 flex items-center gap-3 flex-wrap">
            <span className="text-[11px] text-[#185FA5] font-semibold">
              💡 Kanban 提示
            </span>
            <span className="text-[12px] text-[#5A5955]">
              拖曳客戶卡片到不同 HABC 欄位即可調整分級。失敗會自動還原。
            </span>
            <span className="ml-auto text-[11px] text-[#9A9890]">
              共 {effectiveCrmRows.filter((r) => r.habc_grade).length} 筆已分級
              {crmKpi.unclassified > 0
                ? ` ・ ${crmKpi.unclassified} 筆未分級（不顯示於看板）`
                : ""}
            </span>
          </section>

          <DndContext
            sensors={sensors}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            <div
              className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 ${isPending ? "opacity-90" : ""}`}
              data-testid="kanban-wrap"
            >
              {HABC_GRADES.map((g) => (
                <KanbanColumn
                  key={g}
                  grade={g}
                  rows={kanbanByGrade[g]}
                  pending={isPending}
                  optimisticByRowId={optimisticGrade}
                />
              ))}
            </div>
            <DragOverlay>
              {draggingRow ? (
                <div className="w-[240px] bg-white border-2 border-[#185FA5] rounded-lg p-3 shadow-xl rotate-1">
                  <div className="text-[12.5px] font-semibold text-[#2C2C2A]">
                    {draggingRow.name}
                  </div>
                  <div className="text-[10.5px] font-mono text-[#7A7A78] mt-1">
                    {draggingRow.code}
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </>
      ) : (
        <>
          {/* Filter Bar (table) */}
          <section
            className={`bg-white border border-[#EEECE6] rounded-lg px-4 py-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}
          >
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex flex-col gap-1">
                <label className={labelClass}>類型</label>
                <select
                  value={fType}
                  onChange={(e) => setFType(e.target.value)}
                  className={`${inputClass} w-[110px]`}
                >
                  <option value="all">全部</option>
                  <option value="individual">個人</option>
                  <option value="corporate">公司</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>狀態</label>
                <select
                  value={fStatus}
                  onChange={(e) => setFStatus(e.target.value)}
                  className={`${inputClass} w-[100px]`}
                >
                  <option value="all">全部</option>
                  <option value="active">往來中</option>
                  <option value="inactive">停用</option>
                </select>
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[240px]">
                <label className={labelClass}>
                  代碼 / 名稱 / 電話 / 統編 / Email
                </label>
                <input
                  type="text"
                  value={fQ}
                  onChange={(e) => setFQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitFilters()}
                  placeholder="輸入關鍵字..."
                  className={`${inputClass} w-full`}
                />
              </div>
              <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  onClick={submitFilters}
                  disabled={isPending}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
                >
                  {isPending ? "查詢中…" : "查詢"}
                </button>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                >
                  重置
                </button>
                <Link
                  href="/crm/sales/customer-base/new"
                  aria-disabled={!canEdit}
                  className={`h-[30px] inline-flex items-center px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] ${canEdit ? "" : "opacity-50 pointer-events-none"}`}
                >
                  ＋ 新增客戶
                </Link>
              </div>
            </div>
          </section>

          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#9A9890]">
              共{" "}
              <b className="text-[#2C2C2A]">
                {totalCount.toLocaleString("en-US")}
              </b>{" "}
              筆客戶（顯示{" "}
              <b className="text-[#2C2C2A]">
                {rows.length.toLocaleString("en-US")}
              </b>{" "}
              筆）
            </span>
          </div>

          <DataGrid
            columns={columns}
            data={rows}
            rowKey={(r) => r.id}
            persistKey="sales/crm/customer-base"
            exportFileName={`sales-customer-base-${new Date().toISOString().slice(0, 10)}`}
            disabled={isPending}
            emptyMessage={
              filters.q || filters.type !== "all" || filters.status !== "all"
                ? "無符合條件的客戶，請調整篩選條件"
                : "尚無客戶資料，點右上「＋ 新增客戶」開始建檔"
            }
            rowActionsWidth={210}
            rowActions={(r) => (
              <>
                <Link
                  href={`/crm/sales/customer-base/${r.id}`}
                  className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                >
                  編輯
                </Link>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => toggleActive(r)}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                >
                  {r.is_active ? "停用" : "啟用"}
                </button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => removeRow(r)}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                >
                  刪除
                </button>
              </>
            )}
          />
        </>
      )}
    </main>
  );
}
