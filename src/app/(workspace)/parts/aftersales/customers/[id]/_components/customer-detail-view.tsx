"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";
import { EntityImageUploader } from "@/components/image-upload/entity-image-uploader";
import { KpiCard, Timeline, type TimelineEvent } from "@/components/visualization";
import type {
  AftersalesCustomerDetail,
  AftersalesCustomerVehicle,
  AftersalesWorkOrderRow,
  AftersalesRepairOrderRow,
  AftersalesAppointmentRow,
  AftersalesFollowupCaseRow,
  AftersalesOfficialTagRow,
  AftersalesPickupNotifyTemplate,
  AftersalesCustomerLifetime,
  AftersalesNpsSummary,
  AftersalesCustomerPendingItem,
  AftersalesCustomerComplaintRow,
  ModelRef,
} from "@/domain/aftersales-customer-base";
import { addVehiclePendingItemAction, resolveVehiclePendingItemAction } from "@/lib/aftersales/vehicle-pending-actions";
import { createComplaintAction } from "@/lib/aftersales/complaint-actions";
import { QuickAppointmentButton } from "./quick-appointment-button";

type TabKey = "vehicles" | "history" | "followups" | "pickup";

const TABS: { key: TabKey; label: string }[] = [
  { key: "vehicles", label: "車輛" },
  { key: "history", label: "維修歷史" },
  { key: "followups", label: "跟催" },
  { key: "pickup", label: "取車通知" },
];

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return "—";
  }
}

function fmtMileage(m: number | null): string {
  if (m == null) return "—";
  return `${Number(m).toLocaleString("en-US")} km`;
}

function fmtNT(n: number | null | undefined): string {
  if (n == null) return "—";
  return `NT$ ${Number(n).toLocaleString("en-US")}`;
}

function tagColorChip(color: string): string {
  switch (color) {
    case "red":
      return "bg-[#FDECEA] text-[#CC0000]";
    case "amber":
    case "orange":
    case "yellow":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "green":
    case "teal":
      return "bg-[#EAF3DE] text-[#3B6D11]";
    case "blue":
      return "bg-[#EAF4FB] text-[#185FA5]";
    case "navy":
      return "bg-[#EBF3FF] text-[#1A3A5C]";
    case "purple":
    case "violet":
      return "bg-[#F0EFFE] text-[#534AB7]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

function roStatusChip(s: string): string {
  switch (s) {
    case "closed":
    case "completed":
    case "done":
      return "bg-[#EAF3DE] text-[#3B6D11]";
    case "in_progress":
    case "opened":
    case "wip":
      return "bg-[#EAF4FB] text-[#185FA5]";
    case "draft":
      return "bg-[#F2F2F2] text-[#6B6A68]";
    case "cancelled":
    case "void":
      return "bg-[#FDECEA] text-[#CC0000]";
    default:
      return "bg-[#FDF3E3] text-[#854F0B]";
  }
}

function followupStatusChip(s: string): string {
  switch (s) {
    case "open":
    case "in_progress":
      return "bg-[#EAF4FB] text-[#185FA5]";
    case "recovered":
    case "closed":
      return "bg-[#EAF3DE] text-[#3B6D11]";
    case "lost":
    case "abandoned":
      return "bg-[#FDECEA] text-[#CC0000]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

// 從工單編號解析業務類型前綴（P1）→ 彩色 badge
// repair_orders.ro_code 走 P1-P2-YYMMDD-NNN 慣例（MN-CP-… / WC-WR-… / PD-IN-…）
// work_orders.ro_no 走 RO-2026-A-NNN，無 P1 前綴 → 回 null（顯示中性 badge）
type RoTypeBadge = { code: string; label: string; className: string };

const RO_TYPE_DEFS: Record<
  string,
  { label: string; className: string }
> = {
  PD: { label: "PD", className: "bg-[#F0EFFE] text-[#534AB7]" }, // 紫 — PDI 整備
  WC: { label: "WC", className: "bg-[#EAF3DE] text-[#3B6D11]" }, // 綠 — 保固索賠
  RP: { label: "RP", className: "bg-[#FDF3E3] text-[#854F0B]" }, // 琥珀 — 機修
  AC: { label: "AC", className: "bg-[#FDECEA] text-[#CC0000]" }, // 紅 — 事故
  MN: { label: "MN", className: "bg-[#EBF3FF] text-[#1A3A5C]" }, // 深藍 — 定期保養
  OT: { label: "OT", className: "bg-[#F2F2F2] text-[#6B6A68]" }, // 灰 — 其他業務
};

function roTypeBadge(no: string | null | undefined): RoTypeBadge | null {
  if (!no) return null;
  const p1 = no.split("-")[0]?.toUpperCase() ?? "";
  const def = RO_TYPE_DEFS[p1];
  if (!def) return null;
  return { code: p1, label: def.label, className: def.className };
}

function safetyChip(level: string): string {
  switch (level) {
    case "critical":
    case "high":
      return "bg-[#FDECEA] text-[#CC0000]";
    case "medium":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "low":
      return "bg-[#EAF4FB] text-[#185FA5]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

export function CustomerDetailView({
  customer,
  vehicles,
  workOrders,
  repairOrders,
  appointments,
  followups,
  officialTags,
  pickupNotify,
  models,
  lifetime,
  npsSummary,
  pendingItems,
  complaints,
  canEdit,
  canEditAppointment,
  hasDesmo,
}: {
  customer: AftersalesCustomerDetail;
  vehicles: AftersalesCustomerVehicle[];
  workOrders: AftersalesWorkOrderRow[];
  repairOrders: AftersalesRepairOrderRow[];
  appointments: AftersalesAppointmentRow[];
  followups: AftersalesFollowupCaseRow[];
  officialTags: AftersalesOfficialTagRow[];
  pickupNotify: AftersalesPickupNotifyTemplate;
  models: ModelRef[];
  lifetime: AftersalesCustomerLifetime;
  npsSummary: AftersalesNpsSummary;
  /** 待處理項目（四來源） */
  pendingItems: AftersalesCustomerPendingItem[];
  /** 投訴歷史 */
  complaints: AftersalesCustomerComplaintRow[];
  canEdit: boolean;
  canEditAppointment: boolean;
  /** brand_config.has_desmo：傳給 QuickAppointmentButton 篩服務類型選單。 */
  hasDesmo: boolean;
}) {
  useSetPageHeader({
    title: customer.name,
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "人車檔案", href: "/parts/aftersales/customers" },
      { label: customer.name },
    ],
    hideSearch: false,
  });

  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("vehicles");

  const modelById = useMemo(
    () => new Map(models.map((m) => [m.id, m.display_name])),
    [models],
  );

  // 車輛 ID → 車牌 / 車型 — 給 RO 顯示用
  const vehicleById = useMemo(
    () =>
      new Map(
        vehicles.map((v) => [
          v.id,
          {
            license_plate: v.license_plate,
            model_name: v.model_id
              ? (modelById.get(v.model_id) ?? null)
              : null,
          },
        ]),
      ),
    [vehicles, modelById],
  );

  // 第一台車（最新 created_at）— 拿來秀在 Title card chip 列
  const primaryVehicle = vehicles[0] ?? null;
  const primaryModelName = primaryVehicle?.model_id
    ? (modelById.get(primaryVehicle.model_id) ?? null)
    : null;

  // 維修歷史合併：repair_orders 為主 + work_orders 為輔（兩張表都有資料時並列）
  const mergedHistory = useMemo(() => {
    const ros = repairOrders.map((r) => ({
      kind: "ro" as const,
      id: r.id,
      no: r.ro_code,
      date: r.issue_date ?? r.opened_at ?? r.closed_at ?? "",
      closed_at: r.closed_at,
      status: r.status,
      mileage_in: r.mileage_in,
      amount: r.lines_total ?? r.estimated_subtotal,
      // PD 工單費用歸屬整車成本（fee_allocation='vehicle_cost'）→ 金額欄顯示綠色「整車成本」tag
      is_vehicle_cost: r.fee_allocation === "vehicle_cost",
      summary:
        (r.vehicle_id && vehicleById.get(r.vehicle_id)?.license_plate) ||
        "—",
      sa_name: r.sa_name ?? null,
    }));
    const wos = workOrders.map((w) => ({
      kind: "wo" as const,
      id: w.id,
      no: w.ro_no,
      date: w.opened_at ?? w.closed_at ?? "",
      closed_at: w.closed_at,
      status: w.status,
      mileage_in: w.mileage_in,
      amount: w.total_amount,
      is_vehicle_cost: false,
      summary: w.work_summary ?? w.customer_complaint ?? "—",
      sa_name: w.sa_name ?? null,
    }));
    return [...ros, ...wos].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [repairOrders, workOrders, vehicleById]);

  return (
    <main className="px-6 py-5 space-y-3">
      {/* 1. Breadcrumb + CRUD Pill Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link
            href="/parts/aftersales/customers"
            className="hover:text-[#185FA5]"
          >
            人車檔案
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{customer.code}</span>
          <span className="text-[#9A9890]">·</span>
          <span className="text-[#2C2C2A]">{customer.name}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/aftersales/customers"
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回列表
          </Link>
          <Link
            href={`/admin/master-data/customers/${customer.id}`}
            aria-disabled={!canEdit}
            className={`h-[30px] px-4 rounded-full text-[12px] inline-flex items-center font-medium shadow-sm ${
              canEdit
                ? "bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
                : "bg-[#1A3A5C]/60 text-white pointer-events-none"
            }`}
            title={canEdit ? "前往主檔編輯" : "沒有編輯權限"}
          >
            修改（主檔）
          </Link>
          <Link
            href={`/parts/aftersales/repair-orders/new?customer=${customer.id}`}
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
          >
            開新工單
          </Link>
          <QuickAppointmentButton
            customerId={customer.id}
            customerName={customer.name}
            vehicles={vehicles.map((v) => ({
              id: v.id,
              license_plate: v.license_plate,
              next_service_due_date: v.next_service_due_date,
            }))}
            canEdit={canEditAppointment}
            hasDesmo={hasDesmo}
          />
          <Link
            href={`/crm/aftersales/customer-base/${customer.id}`}
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            CRM 視角 →
          </Link>
        </div>
      </div>

      {/* 2. Title Card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">
                {customer.type === "corporate" ? "企業客戶" : "個人客戶"}
              </div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {customer.name}
                {!customer.is_active && (
                  <span className="ml-2 text-[11px] font-normal text-[#9A9890]">
                    (已停用)
                  </span>
                )}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span className="font-mono text-[#5A5955]">{customer.code}</span>
                {customer.phone && (
                  <span className="font-mono text-[#5A5955]">
                    · {customer.phone}
                  </span>
                )}
                {customer.email && (
                  <span className="text-[#5A5955]">· {customer.email}</span>
                )}
                <span
                  className={`inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                    customer.type === "corporate"
                      ? "bg-[#EAF4FB] text-[#185FA5]"
                      : "bg-[#EBF3FF] text-[#1A3A5C]"
                  }`}
                >
                  {customer.type === "corporate" ? "企業" : "個人"}
                </span>
                <span
                  className={`inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                    customer.is_active
                      ? "bg-[#EAF3DE] text-[#3B6D11]"
                      : "bg-[#F2F2F2] text-[#6B6A68]"
                  }`}
                >
                  {customer.is_active ? "啟用" : "停用"}
                </span>
                {primaryVehicle?.license_plate && (
                  <span className="inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#F0EFFE] text-[#534AB7] font-mono">
                    {primaryVehicle.license_plate}
                    {primaryModelName ? ` · ${primaryModelName}` : ""}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-[#9A9890] mr-1">
                可指派標籤：
              </span>
              {officialTags.length === 0 ? (
                <span className="text-[11px] text-[#9A9890]">
                  （本品牌尚未建立官方標籤字典）
                </span>
              ) : (
                officialTags.slice(0, 12).map((t) => (
                  <span
                    key={t.id}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium ${tagColorChip(t.color)}`}
                    title={t.description ?? undefined}
                  >
                    {t.emoji ? <span>{t.emoji}</span> : null}
                    {t.label}
                  </span>
                ))
              )}
              {officialTags.length > 12 && (
                <span className="text-[11px] text-[#9A9890]">
                  +{officialTags.length - 12}
                </span>
              )}
              {/* 管理標籤按鈕：跳到後台標籤字典設定（架構上客戶標籤為品牌共用字典，SA 視角為參考） */}
              {canEdit && (
                <Link
                  href="/admin/master-data/customer-tags"
                  className="ml-auto h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                  title="管理客戶標籤字典"
                >
                  管理
                </Link>
              )}
            </div>
          </div>

          <div className="shrink-0">
            <EntityImageUploader
              entity="customer"
              entityId={customer.id}
              imageUrl={customer.avatar_url ?? null}
              alt={`${customer.name} 大頭照`}
              canEdit={canEdit}
              width={120}
              height={120}
              cropRatio={1}
              cropTitle="調整客戶大頭照"
              promptText="點擊上傳大頭照"
              rounded="full"
            />
          </div>
        </div>
      </header>

      {/* 2.5 主體：左欄（KPI + 基本資料 + Tabs）+ 右欄（待處理項目 / 投訴歷史 / 到期提醒） */}
      {/* KpiCard 列 — CLV / 上次進廠 / 平均客單 / NPS */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="累計回廠"
          value={`${lifetime.visit_count}`}
          tone="blue"
          icon={<span className="text-[16px]">🛠</span>}
        />
        <KpiCard
          label="累計消費"
          value={
            lifetime.total_amount > 0
              ? `NT$ ${Math.round(lifetime.total_amount).toLocaleString()}`
              : "—"
          }
          tone="green"
          icon={<span className="text-[16px]">💰</span>}
        />
        <KpiCard
          label={
            lifetime.days_since_last_visit == null
              ? "尚未進廠"
              : `上次進廠（${lifetime.days_since_last_visit} 天前）`
          }
          value={
            lifetime.last_visit_at ? fmtDate(lifetime.last_visit_at) : "—"
          }
          tone={
            lifetime.days_since_last_visit == null
              ? "gray"
              : lifetime.days_since_last_visit > 180
                ? "red"
                : lifetime.days_since_last_visit > 90
                  ? "amber"
                  : "teal"
          }
          icon={<span className="text-[16px]">📅</span>}
        />
        <KpiCard
          label={
            npsSummary.total > 0
              ? `NPS 平均（${npsSummary.total} 筆回應）`
              : "NPS 尚無回應"
          }
          value={
            npsSummary.avg != null ? npsSummary.avg.toFixed(1) : "—"
          }
          tone={
            npsSummary.avg == null
              ? "gray"
              : npsSummary.avg >= 9
                ? "green"
                : npsSummary.avg >= 7
                  ? "teal"
                  : "red"
          }
          icon={<span className="text-[16px]">⭐</span>}
          sparkline={
            npsSummary.total > 0 ? (
              <div className="flex gap-1 text-[10.5px]">
                <span className="text-tone-green-700">
                  推薦 {npsSummary.promoter}
                </span>
                <span className="text-tone-gray-500">·</span>
                <span className="text-tone-amber-700">
                  中立 {npsSummary.passive}
                </span>
                <span className="text-tone-gray-500">·</span>
                <span className="text-tone-red-700">
                  批評 {npsSummary.detractor}
                </span>
              </div>
            ) : undefined
          }
          layout={npsSummary.total > 0 ? "with-chart" : "horizontal"}
        />
      </section>

      {/* 右欄三張卡片：待處理項目 / 投訴歷史 / 到期提醒 */}
      <div className="space-y-3">
        <PendingItemsSection
          items={pendingItems}
          vehicles={vehicles}
          customerId={customer.id}
          canEdit={canEdit}
        />
        <ComplaintHistorySection
          complaints={complaints}
          customerId={customer.id}
          vehicles={vehicles}
          repairOrders={repairOrders}
          canEdit={canEdit}
        />
        <ExpiryReminderSection vehicles={vehicles} modelById={new Map(models.map((m) => [m.id, m.display_name]))} />
      </div>

      {/* 3. 區段卡片 — 基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 基本資料
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="姓名" value={customer.name} bold />
          <Kv
            label="電話"
            value={
              customer.phone ? (
                <span className="font-mono">{customer.phone}</span>
              ) : (
                <span className="text-[#9A9890]">—</span>
              )
            }
          />
          <Kv label="Email" value={customer.email ?? "—"} />
          <Kv label="生日" value={fmtDate(customer.birthday)} />
          <Kv
            label="統編 / 身分證"
            value={
              customer.tax_id ?? customer.national_id ? (
                <span className="font-mono">
                  {customer.tax_id ?? customer.national_id}
                </span>
              ) : (
                "—"
              )
            }
          />
          <Kv label="地址" value={customer.address ?? "—"} />
          <Kv label="建立日" value={fmtDate(customer.created_at)} />
          <Kv
            label="來源"
            value={
              customer.source_module === "sales"
                ? "RS05 銷售同步"
                : customer.source_module === "aftersales"
                  ? "SA 接待"
                  : (customer.source_module ?? "—")
            }
          />
          {/* Line ID（存於 metadata.line_id） */}
          <Kv
            label="Line ID"
            value={
              customer.line_id ? (
                <span className="font-mono">{customer.line_id}</span>
              ) : (
                <span className="text-[#9A9890]">—</span>
              )
            }
          />
          <Kv label="備註" value={customer.notes ?? "—"} small />
        </div>
      </section>

      {/* 4. Tabs */}
      <div
        className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto"
        id="tab-content"
      >
        <div className="flex border-b border-[#EEECE6]">
          {TABS.map((t) => {
            const active = t.key === tab;
            const count =
              t.key === "vehicles"
                ? vehicles.length
                : t.key === "history"
                  ? mergedHistory.length
                  : t.key === "followups"
                    ? followups.length
                    : null;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] last:border-r-0 ${
                  active
                    ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                    : "text-[#5A5955] hover:bg-[#F8F7F4]"
                }`}
              >
                {t.label}
                {count != null && (
                  <span className="ml-1.5 text-[10.5px] text-[#9A9890] font-normal">
                    ({count})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
        {tab === "vehicles" && (
          <VehiclesTab vehicles={vehicles} modelById={modelById} />
        )}
        {tab === "history" && (
          <HistoryTab rows={mergedHistory} appointments={appointments} />
        )}
        {tab === "followups" && <FollowupsTab rows={followups} />}
        {tab === "pickup" && (
          <PickupTab
            template={pickupNotify}
            customerPhone={customer.phone}
            customerName={customer.name}
            onGotoSettings={() =>
              router.push("/parts/aftersales/settings/pickup-notify")
            }
          />
        )}
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tab：車輛
// ──────────────────────────────────────────────────────────────────────────
function VehiclesTab({
  vehicles,
  modelById,
}: {
  vehicles: AftersalesCustomerVehicle[];
  modelById: Map<string, string>;
}) {
  if (vehicles.length === 0) {
    return (
      <div className="text-[12px] text-[#9A9890] py-6 text-center">
        此客戶目前沒有名下車輛
      </div>
    );
  }
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
          名下車輛 ({vehicles.length})
        </h2>
      </header>
      <table className="w-full text-[12px]">
        <thead className="bg-[#F8F7F4] text-[11px] text-[#9A9890]">
          <tr>
            <th className="px-3 py-2 text-left font-medium">車牌</th>
            <th className="px-3 py-2 text-left font-medium">車型</th>
            <th className="px-3 py-2 text-left font-medium">VIN</th>
            <th className="px-3 py-2 text-left font-medium">年份</th>
            <th className="px-3 py-2 text-right font-medium">現在里程</th>
            <th className="px-3 py-2 text-left font-medium">上次保養</th>
            <th className="px-3 py-2 text-left font-medium">下次保養</th>
            <th className="px-3 py-2 text-left font-medium">保固到期</th>
            <th className="px-3 py-2 text-left font-medium">狀態</th>
          </tr>
        </thead>
        <tbody>
          {vehicles.map((v) => (
            <tr
              key={v.id}
              className="border-t border-[#EEECE6] hover:bg-[#F8F7F4]"
            >
              <td className="px-3 py-2 font-mono font-semibold text-[#1A3A5C]">
                {v.license_plate ?? "—"}
              </td>
              <td className="px-3 py-2">
                {v.model_id ? (modelById.get(v.model_id) ?? "—") : "—"}
              </td>
              <td className="px-3 py-2 font-mono text-[11.5px] text-[#5A5955]">
                {v.vin ?? "—"}
              </td>
              <td className="px-3 py-2 font-mono">
                {v.manufactured_year ?? "—"}
              </td>
              <td className="px-3 py-2 font-mono text-right">
                {fmtMileage(v.current_mileage)}
              </td>
              <td className="px-3 py-2 font-mono">
                {fmtDate(v.last_service_date)}
              </td>
              <td className="px-3 py-2 font-mono">
                {fmtDate(v.next_service_due_date)}
              </td>
              <td className="px-3 py-2 font-mono">
                {fmtDate(v.warranty_until)}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                    v.is_active
                      ? "bg-[#EAF3DE] text-[#3B6D11]"
                      : "bg-[#F2F2F2] text-[#6B6A68]"
                  }`}
                >
                  {v.is_active ? "啟用" : "停用"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tab：維修歷史（repair_orders + work_orders 並列）
// ──────────────────────────────────────────────────────────────────────────
type HistoryRow = {
  kind: "ro" | "wo";
  id: string;
  no: string;
  date: string;
  closed_at: string | null;
  status: string;
  mileage_in: number | null;
  amount: number | null;
  is_vehicle_cost: boolean;
  summary: string;
  /** 接待 SA 姓名 */
  sa_name: string | null;
};

function HistoryTab({
  rows,
  appointments,
}: {
  rows: HistoryRow[];
  appointments: AftersalesAppointmentRow[];
}) {
  // Timeline 事件 — 最近 12 筆 RO（DESC date）
  const timelineEvents: TimelineEvent[] = rows.slice(0, 12).map((r) => {
    const tone =
      r.status === "closed" || r.status === "completed" || r.status === "done"
        ? "green"
        : r.status === "cancelled" || r.status === "void"
          ? "red"
          : r.status === "draft"
            ? "gray"
            : "blue";
    return {
      id: `${r.kind}-${r.id}`,
      time: r.date ? fmtDate(r.date) : "—",
      title: `${r.no}`,
      description: (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[#5A5955] truncate max-w-[260px]">
            {r.summary}
          </span>
          {r.amount != null && (
            <span className="font-mono text-[11px] text-[#0F6E56]">
              {fmtNT(r.amount)}
            </span>
          )}
          {r.mileage_in != null && (
            <span className="font-mono text-[11px] text-[#9A9890]">
              {fmtMileage(r.mileage_in)}
            </span>
          )}
          <span
            className={`inline-flex px-1.5 py-0.5 rounded-md text-[10.5px] font-medium ${roStatusChip(r.status)}`}
          >
            {r.status}
          </span>
        </div>
      ),
      tone,
    };
  });

  return (
    <div className="space-y-3">
      {timelineEvents.length > 0 && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
              RO 時間軸（最近 {timelineEvents.length} 筆）
            </h2>
          </header>
          <div className="px-4 py-4">
            <Timeline events={timelineEvents} variant="vertical" />
          </div>
        </section>
      )}

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            維修工單 ({rows.length})
          </h2>
        </header>
        {rows.length === 0 ? (
          <div className="text-[12px] text-[#9A9890] py-6 text-center">
            尚無維修歷史
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-[#F8F7F4] text-[11px] text-[#9A9890]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">工單號</th>
                <th className="px-3 py-2 text-left font-medium">類型</th>
                <th className="px-3 py-2 text-left font-medium">開單日</th>
                <th className="px-3 py-2 text-left font-medium">結單日</th>
                <th className="px-3 py-2 text-right font-medium">進廠里程</th>
                <th className="px-3 py-2 text-left font-medium">維修摘要</th>
                <th className="px-3 py-2 text-left font-medium">SA</th>
                <th className="px-3 py-2 text-right font-medium">金額</th>
                <th className="px-3 py-2 text-left font-medium">狀態</th>
                <th className="px-3 py-2 text-left font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.kind}-${r.id}`}
                  className="border-t border-[#EEECE6] hover:bg-[#F8F7F4]"
                >
                  <td className="px-3 py-2 font-mono font-semibold text-[#1A3A5C]">
                    {r.no}
                  </td>
                  <td className="px-3 py-2">
                    {(() => {
                      const t = roTypeBadge(r.no);
                      return t ? (
                        <span
                          className={`inline-flex px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold ${t.className}`}
                        >
                          {t.label}
                        </span>
                      ) : (
                        <span className="text-[11px] text-[#9A9890]">—</span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 font-mono">{fmtDate(r.date)}</td>
                  <td className="px-3 py-2 font-mono">
                    {fmtDate(r.closed_at)}
                  </td>
                  <td className="px-3 py-2 font-mono text-right">
                    {fmtMileage(r.mileage_in)}
                  </td>
                  <td className="px-3 py-2 text-[#5A5955] max-w-[200px] truncate">
                    {r.summary}
                  </td>
                  <td className="px-3 py-2 text-[11.5px] text-[#5A5955]">
                    {r.sa_name ?? <span className="text-[#9A9890]">—</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-right">
                    {r.is_vehicle_cost ? (
                      <span className="inline-flex items-center gap-1 justify-end flex-wrap">
                        <span className="inline-flex px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#EAF3DE] text-[#3B6D11] whitespace-nowrap">
                          整車成本
                        </span>
                        {r.amount != null && (
                          <span className="text-[11px] text-[#3B6D11]">
                            {fmtNT(r.amount)}
                          </span>
                        )}
                      </span>
                    ) : (
                      fmtNT(r.amount)
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium ${roStatusChip(r.status)}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {/* 查看工單詳情連結 */}
                    <Link
                      href={
                        r.kind === "ro"
                          ? `/parts/aftersales/repair-orders/${r.id}`
                          : `/service/workorders/${r.id}`
                      }
                      className="h-[24px] px-2 rounded text-[11px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] whitespace-nowrap"
                    >
                      查看
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            預約紀錄 ({appointments.length})
          </h2>
        </header>
        {appointments.length === 0 ? (
          <div className="text-[12px] text-[#9A9890] py-6 text-center">
            尚無預約
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-[#F8F7F4] text-[11px] text-[#9A9890]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">預約單號</th>
                <th className="px-3 py-2 text-left font-medium">預約時間</th>
                <th className="px-3 py-2 text-left font-medium">服務類型</th>
                <th className="px-3 py-2 text-left font-medium">狀態</th>
                <th className="px-3 py-2 text-left font-medium">備註</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr
                  key={a.id}
                  className="border-t border-[#EEECE6] hover:bg-[#F8F7F4]"
                >
                  <td className="px-3 py-2 font-mono">{a.appt_no}</td>
                  <td className="px-3 py-2 font-mono">
                    {fmtDateTime(a.scheduled_at)}
                  </td>
                  <td className="px-3 py-2">{a.service_type ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium ${roStatusChip(a.status)}`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[#5A5955] max-w-[280px] truncate">
                    {a.notes ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tab：跟催
// ──────────────────────────────────────────────────────────────────────────
function FollowupsTab({ rows }: { rows: AftersalesFollowupCaseRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-[12px] text-[#9A9890] py-6 text-center">
        此客戶目前沒有進行中的跟催案
      </div>
    );
  }
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
          跟催案 ({rows.length})
        </h2>
      </header>
      <table className="w-full text-[12px]">
        <thead className="bg-[#F8F7F4] text-[11px] text-[#9A9890]">
          <tr>
            <th className="px-3 py-2 text-left font-medium">案號</th>
            <th className="px-3 py-2 text-left font-medium">主旨</th>
            <th className="px-3 py-2 text-left font-medium">車輛</th>
            <th className="px-3 py-2 text-left font-medium">安全等級</th>
            <th className="px-3 py-2 text-right font-medium">預估金額</th>
            <th className="px-3 py-2 text-right font-medium">已回收</th>
            <th className="px-3 py-2 text-left font-medium">下次聯絡</th>
            <th className="px-3 py-2 text-left font-medium">狀態</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr
              key={f.id}
              className="border-t border-[#EEECE6] hover:bg-[#F8F7F4]"
            >
              <td className="px-3 py-2 font-mono font-semibold text-[#1A3A5C]">
                {f.case_no}
              </td>
              <td className="px-3 py-2 text-[#2C2C2A] max-w-[240px] truncate">
                {f.title}
              </td>
              <td className="px-3 py-2 font-mono text-[11.5px] text-[#5A5955]">
                {f.vehicle_license_plate ?? "—"}
                {f.vehicle_model ? ` · ${f.vehicle_model}` : ""}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium ${safetyChip(f.safety_level)}`}
                >
                  {f.safety_level}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-right">
                {fmtNT(f.estimated_fee)}
              </td>
              <td className="px-3 py-2 font-mono text-right text-[#3B6D11]">
                {fmtNT(f.recovered_amount)}
              </td>
              <td className="px-3 py-2 font-mono">
                {fmtDate(f.next_contact_at)}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium ${followupStatusChip(f.status)}`}
                >
                  {f.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tab：取車通知
// ──────────────────────────────────────────────────────────────────────────
function PickupTab({
  template,
  customerPhone,
  customerName,
  onGotoSettings,
}: {
  template: AftersalesPickupNotifyTemplate;
  customerPhone: string | null;
  customerName: string;
  onGotoSettings: () => void;
}) {
  return (
    <div className="space-y-3">
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            取車通知設定（品牌共用）
          </h2>
          <button
            type="button"
            onClick={onGotoSettings}
            className="ml-auto h-[26px] px-3 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            前往設定頁 →
          </button>
        </header>
        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 text-[12.5px]">
          <Kv
            label="客戶聯絡電話"
            value={
              customerPhone ? (
                <span className="font-mono">{customerPhone}</span>
              ) : (
                <span className="text-[#CC0000]">未填寫，無法發送 SMS</span>
              )
            }
          />
          <Kv
            label="預設通知方式"
            value={
              <div className="flex gap-1.5 flex-wrap">
                <ChannelChip
                  label="LINE"
                  on={template.default_channels.line}
                />
                <ChannelChip label="SMS" on={template.default_channels.sms} />
                <ChannelChip
                  label="電話"
                  on={template.default_channels.phone}
                />
              </div>
            }
          />
          <Kv
            label="範本最後更新"
            value={
              template.has_template
                ? fmtDateTime(template.updated_at)
                : "尚未設定（使用系統預設）"
            }
          />
        </div>
      </section>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            LINE 範本預覽
          </h2>
        </header>
        <pre className="px-4 py-3 text-[12px] font-mono whitespace-pre-wrap text-[#2C2C2A] leading-relaxed">
          {(template.line_template ?? "（尚未設定 LINE 範本）").replace(
            /\{車主姓名\}/g,
            customerName,
          )}
        </pre>
      </section>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            SMS 範本預覽
          </h2>
        </header>
        <pre className="px-4 py-3 text-[12px] font-mono whitespace-pre-wrap text-[#2C2C2A] leading-relaxed">
          {(template.sms_template ?? "（尚未設定 SMS 範本）").replace(
            /\{車主姓名\}/g,
            customerName,
          )}
        </pre>
      </section>
    </div>
  );
}

function ChannelChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
        on
          ? "bg-[#EAF3DE] text-[#3B6D11]"
          : "bg-[#F2F2F2] text-[#6B6A68]"
      }`}
    >
      {label} {on ? "✓" : "—"}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 待處理項目卡（右欄第2張卡）— 四來源：追加拒絕/暫緩/Quick Quote拒絕/SA手動
// ──────────────────────────────────────────────────────────────────────────
function PendingItemsSection({
  items,
  vehicles,
  canEdit,
}: {
  items: AftersalesCustomerPendingItem[];
  vehicles: AftersalesCustomerVehicle[];
  customerId: string;
  canEdit: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [showAddModal, setShowAddModal] = useState(false);
  const [addVehicleId, setAddVehicleId] = useState(vehicles[0]?.id ?? "");
  const [addDesc, setAddDesc] = useState("");
  const [addLevel, setAddLevel] = useState<"緊急" | "警示" | "建議">("建議");
  const [resolving, setResolving] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  function safetyLevelChip(level: "緊急" | "警示" | "建議"): string {
    if (level === "緊急") return "bg-[#FDECEA] text-[#CC0000]";
    if (level === "警示") return "bg-[#FDF3E3] text-[#854F0B]";
    return "bg-[#EAF4FB] text-[#185FA5]";
  }

  function sourceLabel(src: string): string {
    if (src === "sa_manual") return "SA 手動";
    if (src === "quick_quote_rejected") return "快速報價拒絕";
    if (src === "addon_deferred") return "追加暫緩";
    if (src === "addon_rejected") return "追加拒絕";
    return "追加決策";
  }

  async function handleResolve(itemId: string) {
    setResolving(itemId);
    startTransition(async () => {
      const res = await resolveVehiclePendingItemAction(itemId);
      setResolving(null);
      if (res.ok) {
        setBanner({ ok: true, msg: "✓ 已標記為本次處理" });
        setTimeout(() => setBanner(null), 2200);
        // 觸發頁面重刷（Next.js router.refresh 由父層接管，此處只更新提示）
        window.location.reload();
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  }

  async function handleAddSubmit() {
    if (!addDesc.trim()) return;
    startTransition(async () => {
      const res = await addVehiclePendingItemAction({
        vehicle_id: addVehicleId,
        item_desc: addDesc.trim(),
        safety_level: addLevel,
      });
      if (res.ok) {
        setShowAddModal(false);
        setAddDesc("");
        setAddLevel("建議");
        setBanner({ ok: true, msg: "✓ 已新增待處理項目" });
        setTimeout(() => setBanner(null), 2200);
        window.location.reload();
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
          ⑷ 待處理項目
          {items.length > 0 && (
            <span className="ml-1.5 text-[10.5px] font-normal text-[#9A9890]">
              ({items.length})
            </span>
          )}
        </h2>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="ml-auto h-[26px] px-2.5 rounded text-[11.5px] bg-[#0F6E56] text-white hover:bg-[#0a5742] inline-flex items-center"
          >
            ＋ 手動新增
          </button>
        )}
      </header>

      {banner && (
        <div
          className={`mx-4 mt-2 px-3 py-1.5 rounded text-[12px] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}

      {items.length === 0 ? (
        <div className="px-4 py-4 text-[12px] text-[#9A9890]">
          目前沒有待處理項目
        </div>
      ) : (
        <ul className="divide-y divide-[#EEECE6]">
          {items.map((item) => {
            const vehiclePlate = vehicles.find((v) => v.id === item.vehicle_id)?.license_plate ?? "—";
            return (
              <li key={item.id} className="px-4 py-2.5 flex items-start gap-2.5">
                <span
                  className={`mt-0.5 shrink-0 inline-flex px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold ${safetyLevelChip(item.safety_level)}`}
                >
                  {item.safety_level}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] text-[#2C2C2A] font-medium leading-snug">
                    {item.item_desc}
                  </div>
                  {item.reason && (
                    <div className="text-[11px] text-[#9A9890] mt-0.5">{item.reason}</div>
                  )}
                  <div className="flex gap-1.5 mt-0.5 flex-wrap text-[10.5px] text-[#9A9890]">
                    <span className="font-mono">{vehiclePlate}</span>
                    <span>·</span>
                    <span>{sourceLabel(item.source)}</span>
                    {item.reject_count > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-[#854F0B]">已拒絕 {item.reject_count} 次</span>
                      </>
                    )}
                    <span>·</span>
                    <span>{fmtDate(item.created_at)}</span>
                  </div>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleResolve(item.id)}
                    disabled={isPending && resolving === item.id}
                    className="shrink-0 h-[26px] px-2.5 rounded text-[11px] bg-[#EBF3FF] border border-[#B8D4F0] text-[#1A3A5C] hover:bg-[#D6E8F9] disabled:opacity-60 whitespace-nowrap"
                  >
                    {isPending && resolving === item.id ? "處理中⋯" : "本次處理"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* 手動新增 Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5 space-y-3">
            <h3 className="text-[15px] font-semibold text-[#2C2C2A]">手動新增待處理項目</h3>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">車輛</label>
              <select
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                value={addVehicleId}
                onChange={(e) => setAddVehicleId(e.target.value)}
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.license_plate ?? v.vin ?? v.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">項目說明 *</label>
              <textarea
                className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] focus:outline-none min-h-[72px] resize-none"
                value={addDesc}
                onChange={(e) => setAddDesc(e.target.value)}
                placeholder="例：前煞車來令片磨耗過度，建議下次進廠更換"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">安全等級</label>
              <select
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                value={addLevel}
                onChange={(e) => setAddLevel(e.target.value as "緊急" | "警示" | "建議")}
              >
                <option value="建議">建議</option>
                <option value="警示">警示</option>
                <option value="緊急">緊急</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setShowAddModal(false); setAddDesc(""); }}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleAddSubmit}
                disabled={isPending || !addDesc.trim()}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {isPending ? "新增中⋯" : "新增"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 投訴歷史卡（右欄第3張卡）
// ──────────────────────────────────────────────────────────────────────────
function ComplaintHistorySection({
  complaints,
  customerId,
  repairOrders,
  canEdit,
}: {
  complaints: AftersalesCustomerComplaintRow[];
  customerId: string;
  vehicles: AftersalesCustomerVehicle[];
  repairOrders: AftersalesRepairOrderRow[];
  canEdit: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [showModal, setShowModal] = useState(false);
  const [cType, setCType] = useState("service");
  const [cDesc, setCDesc] = useState("");
  const [cRoId, setCRoId] = useState("");
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  function complaintTypeLabel(t: string | null): string {
    if (t === "service") return "服務態度";
    if (t === "quality") return "維修品質";
    if (t === "pricing") return "費用爭議";
    return "其他";
  }

  function complaintStatusChip(s: string): string {
    if (s === "open" || s === "in_progress") return "bg-[#EAF4FB] text-[#185FA5]";
    if (s === "resolved" || s === "closed") return "bg-[#EAF3DE] text-[#3B6D11]";
    return "bg-[#F2F2F2] text-[#6B6A68]";
  }

  async function handleSubmit() {
    if (!cDesc.trim()) return;
    startTransition(async () => {
      const res = await createComplaintAction({
        customer_id: customerId,
        repair_order_id: cRoId || null,
        complaint_type: cType,
        description: cDesc.trim(),
      });
      if (res.ok) {
        setShowModal(false);
        setCDesc("");
        setCRoId("");
        setBanner({ ok: true, msg: "✓ 已新增投訴記錄" });
        setTimeout(() => setBanner(null), 2200);
        window.location.reload();
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
          📢 投訴歷史
          {complaints.length > 0 && (
            <span className="ml-1.5 text-[10.5px] font-normal text-[#9A9890]">
              ({complaints.length})
            </span>
          )}
        </h2>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="ml-auto h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] inline-flex items-center"
          >
            ＋ 新增取車後投訴記錄
          </button>
        )}
      </header>

      {banner && (
        <div
          className={`mx-4 mt-2 px-3 py-1.5 rounded text-[12px] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}

      {complaints.length === 0 ? (
        <div className="px-4 py-4 text-[12px] text-[#9A9890]">
          尚無投訴記錄
        </div>
      ) : (
        <table className="w-full text-[12px]">
          <thead className="bg-[#F8F7F4] text-[11px] text-[#9A9890]">
            <tr>
              <th className="px-3 py-2 text-left font-medium">日期</th>
              <th className="px-3 py-2 text-left font-medium">工單號</th>
              <th className="px-3 py-2 text-left font-medium">類型</th>
              <th className="px-3 py-2 text-left font-medium">處理結果</th>
              <th className="px-3 py-2 text-left font-medium">狀態</th>
            </tr>
          </thead>
          <tbody>
            {complaints.map((c) => (
              <tr key={c.id} className="border-t border-[#EEECE6] hover:bg-[#F8F7F4]">
                <td className="px-3 py-2 font-mono text-[11.5px]">{fmtDate(c.created_at)}</td>
                <td className="px-3 py-2 font-mono text-[11.5px] text-[#1A3A5C]">
                  {c.ro_code ?? <span className="text-[#9A9890]">—</span>}
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex px-1.5 py-0.5 rounded-md text-[10.5px] font-medium bg-[#FDF3E3] text-[#854F0B]">
                    {complaintTypeLabel(c.complaint_type)}
                  </span>
                </td>
                <td className="px-3 py-2 text-[#5A5955] max-w-[200px] truncate">
                  {c.result ?? c.description ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex px-1.5 py-0.5 rounded-md text-[10.5px] font-medium ${complaintStatusChip(c.status)}`}>
                    {c.status === "open" ? "待處理" : c.status === "resolved" || c.status === "closed" ? "已結案" : c.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 新增取車後投訴記錄 Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5 space-y-3">
            <h3 className="text-[15px] font-semibold text-[#2C2C2A]">新增取車後投訴記錄</h3>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">投訴類型</label>
              <select
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                value={cType}
                onChange={(e) => setCType(e.target.value)}
              >
                <option value="service">服務態度</option>
                <option value="quality">維修品質</option>
                <option value="pricing">費用爭議</option>
                <option value="other">其他</option>
              </select>
            </div>
            {repairOrders.length > 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">關聯工單（選填）</label>
                <select
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                  value={cRoId}
                  onChange={(e) => setCRoId(e.target.value)}
                >
                  <option value="">— 不關聯工單 —</option>
                  {repairOrders.slice(0, 20).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.ro_code} ({fmtDate(r.issue_date)})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">投訴描述 *</label>
              <textarea
                className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] focus:outline-none min-h-[80px] resize-none"
                value={cDesc}
                onChange={(e) => setCDesc(e.target.value)}
                placeholder="請描述投訴內容及客戶反應⋯"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setShowModal(false); setCDesc(""); setCRoId(""); }}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending || !cDesc.trim()}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {isPending ? "儲存中⋯" : "建立投訴記錄"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 到期提醒卡（右欄第4張卡）— 保固/下次保養/大保養/強制險，顏色分級
// ──────────────────────────────────────────────────────────────────────────
function ExpiryReminderSection({
  vehicles,
  modelById,
}: {
  vehicles: AftersalesCustomerVehicle[];
  modelById: Map<string, string>;
}) {
  // 用 lazy state 取單次「現在」時間戳，避免 render 期間呼叫 impure Date.now（react-hooks/purity）
  const [now] = useState(() => Date.now());

  /** 計算剩餘天數（負值為已過期） */
  function daysLeft(d: string | null): number | null {
    if (!d) return null;
    return Math.round((new Date(d).getTime() - now) / 86400000);
  }

  /** 依剩餘天數決定顏色 */
  function expiryColor(days: number | null): string {
    if (days === null) return "text-[#9A9890]";
    if (days < 0) return "text-[#CC0000] font-semibold";
    if (days <= 30) return "text-[#CC0000]";
    if (days <= 90) return "text-[#854F0B]";
    return "text-[#3B6D11]";
  }

  function expiryBadge(days: number | null): string {
    if (days === null) return "—";
    if (days < 0) return `已過期 ${Math.abs(days)} 天`;
    if (days === 0) return "今日到期";
    return `剩 ${days} 天`;
  }

  type ReminderEntry = {
    key: string;
    vehiclePlate: string;
    modelName: string | null;
    label: string;
    expiresAt: string | null;
    days: number | null;
  };

  const entries: ReminderEntry[] = [];
  for (const v of vehicles) {
    const plate = v.license_plate ?? "—";
    const modelName = v.model_id ? (modelById.get(v.model_id) ?? null) : null;
    if (v.warranty_until) {
      entries.push({
        key: `${v.id}-warranty`,
        vehiclePlate: plate,
        modelName,
        label: "保固到期",
        expiresAt: v.warranty_until,
        days: daysLeft(v.warranty_until),
      });
    }
    if (v.next_service_due_date) {
      entries.push({
        key: `${v.id}-service`,
        vehiclePlate: plate,
        modelName,
        label: "下次保養",
        expiresAt: v.next_service_due_date,
        days: daysLeft(v.next_service_due_date),
      });
    }
    // 強制險（insurance_until 存於 vehicle metadata 或擴充欄位）
    const insurance = (v as unknown as { insurance_until?: string | null }).insurance_until ?? null;
    if (insurance) {
      entries.push({
        key: `${v.id}-insurance`,
        vehiclePlate: plate,
        modelName,
        label: "強制險到期",
        expiresAt: insurance,
        days: daysLeft(insurance),
      });
    }
    // 大保養（desmo_service_due_date）
    const desmo = (v as unknown as { desmo_service_due_date?: string | null }).desmo_service_due_date ?? null;
    if (desmo) {
      entries.push({
        key: `${v.id}-desmo`,
        vehiclePlate: plate,
        modelName,
        label: "大保養到期",
        expiresAt: desmo,
        days: daysLeft(desmo),
      });
    }
  }

  // 依剩餘天數升冪排（最緊迫在前；過期的已是負值，也在前）
  entries.sort((a, b) => {
    if (a.days === null && b.days === null) return 0;
    if (a.days === null) return 1;
    if (b.days === null) return -1;
    return a.days - b.days;
  });

  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
          🔔 到期提醒
        </h2>
      </header>
      {entries.length === 0 ? (
        <div className="px-4 py-4 text-[12px] text-[#9A9890]">
          尚無保固 / 保養到期資料（請確認車輛資料有填寫相關日期）
        </div>
      ) : (
        <ul className="divide-y divide-[#EEECE6]">
          {entries.map((e) => (
            <li key={e.key} className="px-4 py-2.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-[#2C2C2A] font-medium">
                  {e.label}
                </div>
                <div className="text-[11px] text-[#9A9890] font-mono">
                  {e.vehiclePlate}
                  {e.modelName ? ` · ${e.modelName}` : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-[12px] text-[#5A5955]">
                  {e.expiresAt ? fmtDate(e.expiresAt) : "—"}
                </div>
                <div className={`text-[11px] font-mono ${expiryColor(e.days)}`}>
                  {expiryBadge(e.days)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 共用 helper
// ──────────────────────────────────────────────────────────────────────────
function Kv({
  label,
  value,
  bold,
  small,
}: {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div
        className={`text-[12.5px] ${bold ? "font-semibold" : ""} ${
          small ? "text-[11.5px] text-[#5A5955]" : "text-[#2C2C2A]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
