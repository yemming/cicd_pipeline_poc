"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { deleteWorkOrderAction } from "@/lib/master-data/workorder-actions";
import type {
  Customer,
  CustomerVehicle,
  Employee,
  Item,
  ServiceAppointment,
  Warehouse,
  WorkOrder,
  WorkOrderItem,
} from "@/lib/parts/types";
import type { WorkOrderIssueSummary } from "@/domain/work-orders";

import { IssuePickButton } from "../../_components/issue-pick-button";
import { WorkOrderForm } from "../../_components/work-order-form";

type Banner = { ok: boolean; msg: string } | null;
type TabKey = "items" | "issues" | "audit";

const TABS: { key: TabKey; label: string }[] = [
  { key: "items", label: "工單明細" },
  { key: "issues", label: "領料單" },
  { key: "audit", label: "稽核資訊" },
];

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  dispatched: "已派工",
  in_progress: "施工中",
  qc: "品檢",
  done: "已完成",
  closed: "已結案",
  cancelled: "已取消",
};

const STATUS_CLS: Record<string, string> = {
  draft: "bg-[#F2F2F2] text-[#6B6A68]",
  dispatched: "bg-[#EAF4FB] text-[#185FA5]",
  in_progress: "bg-[#FDF3E3] text-[#854F0B]",
  qc: "bg-[#FDF3E3] text-[#854F0B]",
  done: "bg-[#EAF3DE] text-[#3B6D11]",
  closed: "bg-[#F2F2F2] text-[#5A5955]",
  cancelled: "bg-[#FDECEA] text-[#CC0000]",
};

const ITEM_KIND_LABEL: Record<string, string> = {
  parts: "料件",
  labor: "工資",
  external: "外包",
  discount: "折扣",
};

const NT = (n: number | null | undefined) =>
  n != null ? `NT$ ${Math.round(Number(n)).toLocaleString()}` : "—";

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  } catch {
    return "—";
  }
}

export function WorkOrderDetailView({
  workOrder,
  initialItems,
  customers,
  vehicles,
  appointments,
  employees,
  parts,
  warehouses,
  issues,
  canEdit,
  canIssue,
  initialMode = "view",
}: {
  workOrder: WorkOrder | null;
  initialItems: WorkOrderItem[];
  customers: Customer[];
  vehicles: CustomerVehicle[];
  appointments: ServiceAppointment[];
  employees: Employee[];
  parts: Item[];
  warehouses: Warehouse[];
  issues: WorkOrderIssueSummary[];
  canEdit: boolean;
  canIssue: boolean;
  initialMode?: "view" | "create";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(initialMode === "create");
  const [activeTab, setActiveTab] = useState<TabKey>("items");

  const customerById = new Map(customers.map((c) => [c.id, c]));
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const empById = new Map(employees.map((e) => [e.id, e]));
  const partsById = new Map(parts.map((p) => [p.id, p]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const openCreate = () => {
    setEditing(false);
    setCreating(true);
  };
  const cancelCreate = () => {
    if (initialMode === "create") router.push("/admin/master-data/work-orders");
    else setCreating(false);
  };

  const remove = () => {
    if (!workOrder) return;
    if (
      !confirm(
        `確定刪除工單「${workOrder.ro_no}」？\n相關 items / 領料單會一併移除，無法復原。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteWorkOrderAction(workOrder.id);
      if (res.ok) {
        router.push("/admin/master-data/work-orders");
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const sectionCard = (title: string, body: React.ReactNode) => (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
      </header>
      <div className="px-4 py-3">{body}</div>
    </section>
  );

  const headline = creating
    ? "（未命名工單）"
    : workOrder
      ? workOrder.ro_no
      : "（資料缺失）";

  const customerName = workOrder?.customer_id
    ? customerById.get(workOrder.customer_id)?.name ?? "—"
    : "—";
  const vehicle = workOrder?.vehicle_id ? vehicleById.get(workOrder.vehicle_id) : null;
  const advisorName = workOrder?.advisor_id
    ? empById.get(workOrder.advisor_id)?.name ?? "—"
    : "—";
  const techName = workOrder?.lead_technician_id
    ? empById.get(workOrder.lead_technician_id)?.name ?? "—"
    : "—";

  return (
    <main className="px-6 py-5 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/admin/master-data/work-orders" className="hover:text-[#185FA5]">
            維修工單
          </Link>
          <span>›</span>
          <span className={`text-[#5A5955] ${creating ? "" : "font-mono"}`}>
            {creating ? "新增工單" : headline}
          </span>
          {editing ? (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-[#FDF3E3] text-[#854F0B] text-[11px]">
              編輯模式
            </span>
          ) : creating ? (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-[#FDF3E3] text-[#854F0B] text-[11px]">
              建立模式
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {editing ? (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] shadow-sm hover:border-[#9A9890]"
            >
              結束編輯
            </button>
          ) : creating ? (
            <button
              type="button"
              onClick={cancelCreate}
              disabled={isPending}
              className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] shadow-sm hover:border-[#9A9890] disabled:opacity-60"
            >
              取消
            </button>
          ) : (
            <>
              <Link
                href="/admin/master-data/work-orders"
                className="h-[30px] inline-flex items-center justify-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <button
                type="button"
                disabled={!canEdit}
                onClick={openCreate}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                新增
              </button>
              <button
                type="button"
                disabled={!canEdit || !workOrder}
                onClick={() => setEditing(true)}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                disabled={!canEdit || !workOrder}
                onClick={remove}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                刪除
              </button>
            </>
          )}
        </div>
      </div>

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {editing && workOrder ? (
        <section className="bg-white border border-[#EEECE6] rounded-lg p-5">
          <p className="text-[12px] text-[#854F0B] bg-[#FDF3E3] border border-[#E8D5A6] rounded px-3 py-2 mb-4">
            編輯模式：工單為跨多表 wizard（parts / labor / external 子表 + 領料），使用原 form
            維護以保留既有商業邏輯。
          </p>
          <WorkOrderForm
            mode="edit"
            workOrder={workOrder}
            initialItems={initialItems}
            customers={customers}
            vehicles={vehicles}
            appointments={appointments}
            advisors={employees}
            technicians={employees}
            parts={parts}
          />
        </section>
      ) : creating ? (
        <section className="bg-white border border-[#EEECE6] rounded-lg p-5">
          <p className="text-[12px] text-[#854F0B] bg-[#FDF3E3] border border-[#E8D5A6] rounded px-3 py-2 mb-4">
            建立模式：車主與車輛必選；工單號留空會自動產生 RO-{"{YYYYMMDD}"}-{"{6碼}"}。建立後將跳轉至詳情頁。
          </p>
          <WorkOrderForm
            mode="create"
            customers={customers}
            vehicles={vehicles}
            appointments={appointments}
            advisors={employees}
            technicians={employees}
            parts={parts}
          />
        </section>
      ) : (
        <>
          {/* Title card */}
          <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
            <div className="flex items-stretch gap-4">
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div>
                  <div className="text-[11px] tracking-wider text-[#9A9890]">維修工單</div>
                  <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                    {headline}
                  </h1>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                    {workOrder ? (
                      <>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                            STATUS_CLS[workOrder.status] ?? "bg-[#EBF3FF] text-[#1A3A5C]"
                          }`}
                        >
                          {STATUS_LABEL[workOrder.status] ?? workOrder.status}
                        </span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#5A5955]">
                          開單 {fmtDateTime(workOrder.opened_at)}
                        </span>
                        {vehicle?.license_plate ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5] font-mono">
                            {vehicle.license_plate}
                          </span>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="shrink-0">
                <div className="w-[260px] h-[120px] rounded-lg flex flex-col items-center justify-center text-[12px] border border-[#EEECE6] bg-[#F8F7F4]">
                  <div className="text-[11px] text-[#9A9890]">合計</div>
                  <div className="text-[20px] font-semibold text-[#2C2C2A] font-mono">
                    {NT(workOrder?.total_amount)}
                  </div>
                  <div className="text-[11px] text-[#9A9890] mt-1">
                    料 {NT(workOrder?.parts_amount)} ・ 工 {NT(workOrder?.labor_amount)}
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* 基本資料 */}
          {workOrder ? (
            <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
              </header>
              <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
                <Kv
                  label="工單號"
                  value={<span className="font-mono">{workOrder.ro_no}</span>}
                />
                <Kv label="客戶" value={customerName} />
                <Kv
                  label="車輛"
                  value={
                    vehicle ? (
                      <div>
                        <div className="font-mono">{vehicle.license_plate ?? "（無牌）"}</div>
                        {vehicle.vin ? (
                          <div className="text-[11px] text-[#9A9890] font-mono">
                            VIN {vehicle.vin}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      "—"
                    )
                  }
                />
                <Kv label="服務顧問" value={advisorName} />
                <Kv label="主技師" value={techName} />
                <Kv label="狀態" value={STATUS_LABEL[workOrder.status] ?? workOrder.status} />
                <Kv
                  label="進場里程"
                  value={
                    workOrder.mileage_in != null ? (
                      <span className="font-mono">
                        {workOrder.mileage_in.toLocaleString()} km
                      </span>
                    ) : (
                      <span className="text-[#9A9890]">—</span>
                    )
                  }
                />
                <Kv
                  label="出場里程"
                  value={
                    workOrder.mileage_out != null ? (
                      <span className="font-mono">
                        {workOrder.mileage_out.toLocaleString()} km
                      </span>
                    ) : (
                      <span className="text-[#9A9890]">—</span>
                    )
                  }
                />
                <Kv
                  label="預約"
                  value={
                    workOrder.appointment_id ? (
                      <span className="font-mono text-[11.5px]">已連結</span>
                    ) : (
                      <span className="text-[#9A9890]">—</span>
                    )
                  }
                />
                {workOrder.customer_complaint ? (
                  <div className="md:col-span-3">
                    <Kv
                      label="客戶反映"
                      value={
                        <div className="whitespace-pre-wrap text-[12.5px]">
                          {workOrder.customer_complaint}
                        </div>
                      }
                    />
                  </div>
                ) : null}
                {workOrder.diagnosis ? (
                  <div className="md:col-span-3">
                    <Kv
                      label="技師診斷"
                      value={
                        <div className="whitespace-pre-wrap text-[12.5px]">
                          {workOrder.diagnosis}
                        </div>
                      }
                    />
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* Tabs */}
          {workOrder ? (
            <>
              <div
                className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto"
                id="tab-content"
              >
                <div className="flex border-b border-[#EEECE6]">
                  {TABS.map((t) => {
                    const active = activeTab === t.key;
                    const count =
                      t.key === "items"
                        ? initialItems.length
                        : t.key === "issues"
                          ? issues.length
                          : null;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setActiveTab(t.key)}
                        className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] last:border-r-0 ${
                          active
                            ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                            : "text-[#5A5955] hover:bg-[#F8F7F4]"
                        }`}
                      >
                        {t.label}
                        {count != null ? (
                          <span className="ml-1 inline-flex items-center px-1 rounded text-[10px] bg-[#EEF4FB] text-[#185FA5]">
                            {count}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
                {activeTab === "items" ? (
                  initialItems.length === 0 ? (
                    <div className="text-[12.5px] text-[#9A9890] py-6 text-center">
                      尚無工單明細。點右上「修改」進入編輯模式新增 parts / labor / external lines。
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="text-[11px] text-[#9A9890] border-b border-[#EEECE6]">
                            <th className="text-left px-2 py-1.5 w-10">#</th>
                            <th className="text-left px-2 py-1.5 w-16">類型</th>
                            <th className="text-left px-2 py-1.5">說明 / 料號</th>
                            <th className="text-right px-2 py-1.5 w-16">數量</th>
                            <th className="text-right px-2 py-1.5 w-24">單價</th>
                            <th className="text-right px-2 py-1.5 w-28">小計</th>
                          </tr>
                        </thead>
                        <tbody>
                          {initialItems.map((it) => {
                            const partName = it.item_id ? partsById.get(it.item_id)?.name : null;
                            const partCode = it.item_id ? partsById.get(it.item_id)?.code : null;
                            return (
                              <tr
                                key={it.id}
                                className="border-b border-[#F4F2EC] hover:bg-[#FAF9F5]"
                              >
                                <td className="px-2 py-1.5 text-[#9A9890]">{it.line_no}</td>
                                <td className="px-2 py-1.5">
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                                    {ITEM_KIND_LABEL[it.kind] ?? it.kind}
                                  </span>
                                </td>
                                <td className="px-2 py-1.5">
                                  {partCode ? (
                                    <div className="font-mono text-[11.5px] text-[#5A5955]">
                                      {partCode}
                                    </div>
                                  ) : null}
                                  <div className="text-[12px] text-[#2C2C2A]">
                                    {it.description ?? partName ?? "—"}
                                  </div>
                                </td>
                                <td className="px-2 py-1.5 text-right font-mono">{it.qty}</td>
                                <td className="px-2 py-1.5 text-right font-mono">
                                  {NT(it.unit_price)}
                                </td>
                                <td className="px-2 py-1.5 text-right font-mono">
                                  {NT(it.amount)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : null}

                {activeTab === "issues" ? (
                  <div className="space-y-3">
                    {canIssue ? (
                      <div className="bg-[#F8F7F4] border border-[#EEECE6] rounded-lg p-3">
                        <IssuePickButton
                          workOrderId={workOrder.id}
                          warehouses={warehouses}
                          existingIssues={issues}
                        />
                      </div>
                    ) : null}
                    {issues.length === 0 ? (
                      <div className="text-[12.5px] text-[#9A9890] py-6 text-center">
                        本工單尚無領料單。
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="text-[11px] text-[#9A9890] border-b border-[#EEECE6]">
                              <th className="text-left px-2 py-1.5">領料單號</th>
                              <th className="text-left px-2 py-1.5 w-20">狀態</th>
                              <th className="text-left px-2 py-1.5 w-32">領料倉</th>
                              <th className="text-left px-2 py-1.5 w-28">領料日</th>
                              <th className="text-right px-2 py-1.5 w-20">總量</th>
                              <th className="text-right px-2 py-1.5 w-28">總金額</th>
                            </tr>
                          </thead>
                          <tbody>
                            {issues.map((iss) => {
                              const w = iss.warehouse_id
                                ? warehouseById.get(iss.warehouse_id)
                                : null;
                              return (
                                <tr
                                  key={iss.id}
                                  className="border-b border-[#F4F2EC] hover:bg-[#FAF9F5]"
                                >
                                  <td className="px-2 py-1.5 font-mono">{iss.gi_no}</td>
                                  <td className="px-2 py-1.5">{iss.status}</td>
                                  <td className="px-2 py-1.5">
                                    {w ? `${w.code} ・ ${w.name}` : "—"}
                                  </td>
                                  <td className="px-2 py-1.5 font-mono">
                                    {iss.issue_date ?? "—"}
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono">
                                    {iss.qty_issued_total ?? 0}
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono">
                                    {NT(iss.amount_total)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : null}

                {activeTab === "audit" ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {sectionCard(
                      "識別碼",
                      <>
                        <Kv
                          label="系統識別碼"
                          value={<span className="font-mono">{workOrder.id}</span>}
                          small
                        />
                        <Kv label="品牌" value={workOrder.brand_id} mono small />
                        {workOrder.external_id ? (
                          <Kv
                            label={`外部 ID（${workOrder.external_source}）`}
                            value={<span className="font-mono">{workOrder.external_id}</span>}
                            small
                          />
                        ) : null}
                      </>,
                    )}
                    {sectionCard(
                      "時間軸",
                      <>
                        <Kv label="開單" value={fmtDateTime(workOrder.opened_at)} mono small />
                        <Kv
                          label="派工"
                          value={fmtDateTime(workOrder.dispatched_at)}
                          mono
                          small
                        />
                        <Kv label="品檢" value={fmtDateTime(workOrder.qc_at)} mono small />
                        <Kv label="結案" value={fmtDateTime(workOrder.closed_at)} mono small />
                      </>,
                    )}
                    {sectionCard(
                      "更新",
                      <>
                        <Kv
                          label="最後更新"
                          value={fmtDateTime(workOrder.updated_at)}
                          mono
                          small
                        />
                        <Kv
                          label="同步時間"
                          value={fmtDateTime(workOrder.synced_at)}
                          mono
                          small
                        />
                      </>,
                    )}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </>
      )}
    </main>
  );
}

function Kv({
  label,
  value,
  bold,
  mono,
  small,
}: {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div
        className={`text-[12.5px] ${bold ? "font-semibold" : ""} ${mono ? "font-mono" : ""} ${
          small ? "text-[11.5px] text-[#5A5955]" : "text-[#2C2C2A]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
