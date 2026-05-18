"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";
import { EntityImageUploader } from "@/components/image-upload/entity-image-uploader";
import type {
  AftersalesCustomerDetail,
  AftersalesCustomerVehicle,
  AftersalesWorkOrderRow,
  AftersalesRepairOrderRow,
  AftersalesAppointmentRow,
  AftersalesFollowupCaseRow,
  AftersalesOfficialTagRow,
  AftersalesPickupNotifyTemplate,
  ModelRef,
} from "@/domain/aftersales-customer-base";

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
  canEdit,
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
  canEdit: boolean;
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
      summary:
        (r.vehicle_id && vehicleById.get(r.vehicle_id)?.license_plate) ||
        "—",
      raw: r,
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
      summary: w.work_summary ?? w.customer_complaint ?? "—",
      raw: w,
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
            href={`/parts/aftersales/reception?customer=${customer.id}`}
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
          >
            開新工單
          </Link>
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
  summary: string;
};

function HistoryTab({
  rows,
  appointments,
}: {
  rows: HistoryRow[];
  appointments: AftersalesAppointmentRow[];
}) {
  return (
    <div className="space-y-3">
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
                <th className="px-3 py-2 text-left font-medium">開單日</th>
                <th className="px-3 py-2 text-left font-medium">結單日</th>
                <th className="px-3 py-2 text-right font-medium">進廠里程</th>
                <th className="px-3 py-2 text-left font-medium">維修摘要</th>
                <th className="px-3 py-2 text-right font-medium">金額</th>
                <th className="px-3 py-2 text-left font-medium">狀態</th>
                <th className="px-3 py-2 text-left font-medium">來源</th>
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
                  <td className="px-3 py-2 font-mono">{fmtDate(r.date)}</td>
                  <td className="px-3 py-2 font-mono">
                    {fmtDate(r.closed_at)}
                  </td>
                  <td className="px-3 py-2 font-mono text-right">
                    {fmtMileage(r.mileage_in)}
                  </td>
                  <td className="px-3 py-2 text-[#5A5955] max-w-[260px] truncate">
                    {r.summary}
                  </td>
                  <td className="px-3 py-2 font-mono text-right">
                    {fmtNT(r.amount)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium ${roStatusChip(r.status)}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-[#9A9890]">
                    {r.kind === "ro" ? "repair_orders" : "work_orders"}
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
