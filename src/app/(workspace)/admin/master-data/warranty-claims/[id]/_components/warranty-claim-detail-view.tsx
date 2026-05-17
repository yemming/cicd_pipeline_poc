"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { deleteWarrantyClaimAction } from "@/lib/master-data/warranty-actions";
import type {
  Customer,
  Item,
  VehicleModel,
  WarrantyClaim,
  WarrantyClaimLine,
  WorkOrder,
} from "@/lib/parts/types";

import { WarrantyForm } from "../../_components/warranty-form";

type Banner = { ok: boolean; msg: string } | null;
type TabKey = "lines" | "amounts" | "audit";

const TABS: { key: TabKey; label: string }[] = [
  { key: "lines", label: "索賠 lines" },
  { key: "amounts", label: "金額明細" },
  { key: "audit", label: "稽核資訊" },
];

const TYPE_LABEL: Record<string, string> = {
  oem_warranty: "OEM 原廠保固",
  extended_warranty: "延長保固",
  tsb: "TSB 技術通報",
  pdi: "PDI 交車前",
  goodwill: "Goodwill",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  submitted: "已送件",
  under_review: "審查中",
  approved: "已核准",
  partial_approved: "部分核准",
  rejected: "拒絕",
  received: "已收款",
  cancelled: "已取消",
};

const STATUS_CLS: Record<string, string> = {
  draft: "bg-[#F2F2F2] text-[#6B6A68]",
  submitted: "bg-[#EAF4FB] text-[#185FA5]",
  under_review: "bg-[#FDF3E3] text-[#854F0B]",
  approved: "bg-[#EAF3DE] text-[#3B6D11]",
  partial_approved: "bg-[#FDF3E3] text-[#854F0B]",
  rejected: "bg-[#FDECEA] text-[#CC0000]",
  received: "bg-[#EAF3DE] text-[#3B6D11]",
  cancelled: "bg-[#F2F2F2] text-[#6B6A68]",
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

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" });
  } catch {
    return "—";
  }
}

export function WarrantyClaimDetailView({
  claim,
  lines,
  customers,
  models,
  workOrders,
  items,
  canEdit,
  initialMode = "view",
}: {
  claim: WarrantyClaim | null;
  lines: WarrantyClaimLine[];
  customers: Customer[];
  models: VehicleModel[];
  workOrders: WorkOrder[];
  items: Item[];
  canEdit: boolean;
  initialMode?: "view" | "create";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(initialMode === "create");
  const [activeTab, setActiveTab] = useState<TabKey>("lines");

  const customerById = new Map(customers.map((c) => [c.id, c]));
  const modelById = new Map(models.map((m) => [m.id, m]));
  const workOrderById = new Map(workOrders.map((w) => [w.id, w]));
  const itemById = new Map(items.map((i) => [i.id, i]));

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const openCreate = () => {
    setEditing(false);
    setCreating(true);
  };
  const cancelCreate = () => {
    if (initialMode === "create") router.push("/admin/master-data/warranty-claims");
    else setCreating(false);
  };

  const remove = () => {
    if (!claim) return;
    if (
      !confirm(
        `確定刪除保固索賠「${claim.cl_no}」？\n相關 lines 與歷史會一併移除，無法復原。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteWarrantyClaimAction(claim.id);
      if (res.ok) {
        router.push("/admin/master-data/warranty-claims");
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
    ? "（未命名索賠）"
    : claim
      ? claim.cl_no
      : "（資料缺失）";

  const customerName = claim?.customer_id
    ? customerById.get(claim.customer_id)?.name ?? "—"
    : "—";
  const modelName = claim?.vehicle_model_id
    ? modelById.get(claim.vehicle_model_id)?.display_name ?? "—"
    : "—";
  const roNo = claim?.ro_id ? workOrderById.get(claim.ro_id)?.ro_no ?? "—" : "—";

  return (
    <main className="px-6 py-5 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/admin/master-data/warranty-claims" className="hover:text-[#185FA5]">
            保固索賠
          </Link>
          <span>›</span>
          <span className={`text-[#5A5955] ${creating ? "" : "font-mono"}`}>
            {creating ? "新增索賠" : headline}
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
                href="/admin/master-data/warranty-claims"
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
                disabled={!canEdit || !claim}
                onClick={() => setEditing(true)}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                disabled={!canEdit || !claim}
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

      {/* 編輯 / 建立模式：直接掛舊 WarrantyForm 處理多 line 子表 */}
      {editing && claim ? (
        <section className="bg-white border border-[#EEECE6] rounded-lg p-5">
          <p className="text-[12px] text-[#854F0B] bg-[#FDF3E3] border border-[#E8D5A6] rounded px-3 py-2 mb-4">
            編輯模式：使用原 form 維護索賠主檔與多筆料號 lines（含金額自動加總）。
          </p>
          <WarrantyForm
            mode="edit"
            claim={claim}
            initialLines={lines}
            customers={customers}
            models={models}
            workOrders={workOrders}
            items={items}
          />
        </section>
      ) : creating ? (
        <section className="bg-white border border-[#EEECE6] rounded-lg p-5">
          <p className="text-[12px] text-[#854F0B] bg-[#FDF3E3] border border-[#E8D5A6] rounded px-3 py-2 mb-4">
            建立模式：類型 / 索賠日期必選；料 / 工成本由 lines 自動加總。建立後將跳轉至詳情頁。
          </p>
          <WarrantyForm
            mode="create"
            customers={customers}
            models={models}
            workOrders={workOrders}
            items={items}
          />
        </section>
      ) : (
        <>
          {/* Title card */}
          <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
            <div className="flex items-stretch gap-4">
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div>
                  <div className="text-[11px] tracking-wider text-[#9A9890]">保固索賠單</div>
                  <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                    {headline}
                  </h1>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                    {claim ? (
                      <>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                            STATUS_CLS[claim.status] ?? "bg-[#EBF3FF] text-[#1A3A5C]"
                          }`}
                        >
                          {STATUS_LABEL[claim.status] ?? claim.status}
                        </span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                          {TYPE_LABEL[claim.claim_type] ?? claim.claim_type}
                        </span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#5A5955]">
                          索賠日 {fmtDate(claim.claim_date)}
                        </span>
                        {claim.vin ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#5A5955] font-mono">
                            VIN {claim.vin}
                          </span>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="shrink-0">
                <div className="w-[260px] h-[120px] rounded-lg flex flex-col items-center justify-center text-[12px] border border-[#EEECE6] bg-[#F8F7F4]">
                  <div className="text-[11px] text-[#9A9890]">申請金額</div>
                  <div className="text-[20px] font-semibold text-[#2C2C2A] font-mono">
                    {NT(claim?.applied_amount)}
                  </div>
                  <div className="text-[11px] text-[#9A9890] mt-1">
                    核准 {NT(claim?.approved_amount)}
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* 基本資料 */}
          {claim ? (
            <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
              </header>
              <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
                <Kv label="索賠單號" value={<span className="font-mono">{claim.cl_no}</span>} />
                <Kv label="類型" value={TYPE_LABEL[claim.claim_type] ?? claim.claim_type} />
                <Kv label="狀態" value={STATUS_LABEL[claim.status] ?? claim.status} />
                <Kv label="索賠日期" value={fmtDate(claim.claim_date)} mono />
                <Kv
                  label="工單"
                  value={
                    claim.ro_id ? (
                      <span className="font-mono">{roNo}</span>
                    ) : (
                      <span className="text-[#9A9890]">未連結</span>
                    )
                  }
                />
                <Kv label="客戶" value={customerName} />
                <Kv label="車型" value={modelName} />
                <Kv
                  label="VIN"
                  value={
                    claim.vin ? (
                      <span className="font-mono">{claim.vin}</span>
                    ) : (
                      <span className="text-[#9A9890]">—</span>
                    )
                  }
                />
                <Kv
                  label="原廠單號"
                  value={
                    claim.oem_reference_no ? (
                      <span className="font-mono">{claim.oem_reference_no}</span>
                    ) : (
                      <span className="text-[#9A9890]">—</span>
                    )
                  }
                />
              </div>
            </section>
          ) : null}

          {/* Tabs */}
          {claim ? (
            <>
              <div
                className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto"
                id="tab-content"
              >
                <div className="flex border-b border-[#EEECE6]">
                  {TABS.map((t) => {
                    const active = activeTab === t.key;
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
                        {t.key === "lines" ? (
                          <span className="ml-1 inline-flex items-center px-1 rounded text-[10px] bg-[#EEF4FB] text-[#185FA5]">
                            {lines.length}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
                {activeTab === "lines" ? (
                  <div>
                    {lines.length === 0 ? (
                      <div className="text-[12.5px] text-[#9A9890] py-6 text-center">
                        本索賠尚無料號 lines。點右上「修改」進入編輯模式新增。
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="text-[11px] text-[#9A9890] border-b border-[#EEECE6]">
                              <th className="text-left px-2 py-1.5 w-10">#</th>
                              <th className="text-left px-2 py-1.5">料號 / 名稱</th>
                              <th className="text-left px-2 py-1.5 w-32">序號</th>
                              <th className="text-right px-2 py-1.5 w-16">數量</th>
                              <th className="text-right px-2 py-1.5 w-24">料</th>
                              <th className="text-right px-2 py-1.5 w-24">工</th>
                              <th className="text-right px-2 py-1.5 w-28">申請</th>
                              <th className="text-right px-2 py-1.5 w-28">核准</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.map((l) => {
                              const itm = itemById.get(l.item_id);
                              return (
                                <tr
                                  key={l.id}
                                  className="border-b border-[#F4F2EC] hover:bg-[#FAF9F5]"
                                >
                                  <td className="px-2 py-1.5 text-[#9A9890]">{l.line_no}</td>
                                  <td className="px-2 py-1.5">
                                    <div className="font-mono text-[11.5px] text-[#5A5955]">
                                      {itm?.code ?? "—"}
                                    </div>
                                    <div className="text-[12px] text-[#2C2C2A]">
                                      {itm?.name ?? "（已停用料號）"}
                                    </div>
                                  </td>
                                  <td className="px-2 py-1.5 font-mono text-[11.5px]">
                                    {l.serial_no ?? "—"}
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono">{l.qty}</td>
                                  <td className="px-2 py-1.5 text-right font-mono">
                                    {NT(l.parts_cost)}
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono">
                                    {NT(l.labor_cost)}
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono">
                                    {NT(l.applied_amount)}
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono">
                                    {NT(l.approved_amount)}
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

                {activeTab === "amounts" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {sectionCard(
                      "金額拆解",
                      <div className="grid grid-cols-2 gap-3">
                        <Kv
                          label="料件成本"
                          value={<span className="font-mono">{NT(claim.parts_cost)}</span>}
                        />
                        <Kv
                          label="工資成本"
                          value={<span className="font-mono">{NT(claim.labor_cost)}</span>}
                        />
                        <Kv
                          label="申請總金額"
                          value={
                            <span className="font-mono font-semibold">
                              {NT(claim.applied_amount)}
                            </span>
                          }
                        />
                        <Kv
                          label="核准總金額"
                          value={
                            <span className="font-mono font-semibold">
                              {NT(claim.approved_amount)}
                            </span>
                          }
                        />
                      </div>,
                    )}
                    {sectionCard(
                      "收款進度",
                      <div className="grid grid-cols-1 gap-3">
                        <Kv
                          label="預計收款日"
                          value={
                            claim.forecast_receipt_date
                              ? fmtDate(claim.forecast_receipt_date)
                              : <span className="text-[#9A9890]">—</span>
                          }
                          mono
                        />
                        <Kv
                          label="實際收款日"
                          value={
                            claim.actual_receipt_date
                              ? fmtDate(claim.actual_receipt_date)
                              : <span className="text-[#9A9890]">—</span>
                          }
                          mono
                        />
                        <Kv
                          label="GL 已過帳"
                          value={
                            claim.gl_posted ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
                                是 {claim.gl_posted_at ? `(${fmtDate(claim.gl_posted_at)})` : ""}
                              </span>
                            ) : (
                              <span className="text-[#9A9890]">否</span>
                            )
                          }
                        />
                      </div>,
                    )}
                    {claim.notes ? (
                      <div className="md:col-span-2">
                        {sectionCard(
                          "備註",
                          <div className="whitespace-pre-wrap text-[12.5px]">{claim.notes}</div>,
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {activeTab === "audit" ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {sectionCard(
                      "識別碼",
                      <>
                        <Kv
                          label="系統識別碼"
                          value={<span className="font-mono">{claim.id}</span>}
                          small
                        />
                        <Kv label="品牌" value={claim.brand_id} mono small />
                        {claim.external_id ? (
                          <Kv
                            label={`外部 ID（${claim.external_source}）`}
                            value={<span className="font-mono">{claim.external_id}</span>}
                            small
                          />
                        ) : null}
                      </>,
                    )}
                    {sectionCard(
                      "時間軸",
                      <>
                        <Kv label="建立" value={fmtDateTime(claim.created_at)} mono small />
                        <Kv label="送件" value={fmtDateTime(claim.submitted_at)} mono small />
                        <Kv label="核准" value={fmtDateTime(claim.approved_at)} mono small />
                        <Kv label="收款" value={fmtDateTime(claim.received_at)} mono small />
                      </>,
                    )}
                    {sectionCard(
                      "更新",
                      <>
                        <Kv label="最後更新" value={fmtDateTime(claim.updated_at)} mono small />
                        <Kv label="同步時間" value={fmtDateTime(claim.synced_at)} mono small />
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
