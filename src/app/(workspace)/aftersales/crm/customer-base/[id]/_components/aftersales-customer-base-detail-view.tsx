"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createAftersalesCustomerAction,
  deleteAftersalesCustomerAction,
  setAftersalesCustomerActiveAction,
  updateAftersalesCustomerAction,
  type AftersalesCustomerInput,
} from "@/lib/aftersales/customer-base-actions";

export type DetailCustomer = {
  id: string;
  code: string;
  name: string;
  type: "individual" | "corporate";
  tax_id: string | null;
  national_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  birthday: string | null;
  source_module: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type VehicleRow = {
  id: string;
  license_plate: string | null;
  vin: string | null;
  color: string | null;
  manufactured_year: number | null;
  current_mileage: number | null;
  last_service_date: string | null;
  last_service_mileage: number | null;
  next_service_due_date: string | null;
  next_service_due_mileage: number | null;
  warranty_until: string | null;
  is_active: boolean;
  model_id: string | null;
};

export type WorkOrderRow = {
  id: string;
  ro_no: string;
  status: string;
  opened_at: string | null;
  closed_at: string | null;
  mileage_in: number | null;
  customer_complaint: string | null;
  work_summary: string | null;
  total_amount: number | null;
};

export type AppointmentRow = {
  id: string;
  appt_no: string;
  scheduled_at: string;
  service_type: string | null;
  status: string;
  notes: string | null;
};

export type ModelRef = { id: string; display_name: string };

type Banner = { ok: boolean; msg: string } | null;
type TabKey = "vehicles" | "service_history" | "notes";

const TABS: { key: TabKey; label: string }[] = [
  { key: "vehicles", label: "名下車輛" },
  { key: "service_history", label: "服務歷程" },
  { key: "notes", label: "業務備註" },
];

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return "—";
  }
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

const blankInput = (): AftersalesCustomerInput => ({
  code: "",
  name: "",
  type: "individual",
  tax_id: "",
  national_id: "",
  phone: "",
  email: "",
  address: "",
  birthday: "",
  source_module: "aftersales",
  notes: "",
  is_active: true,
});

const fromCustomer = (c: DetailCustomer): AftersalesCustomerInput => ({
  code: c.code,
  name: c.name,
  type: c.type,
  tax_id: c.tax_id ?? "",
  national_id: c.national_id ?? "",
  phone: c.phone ?? "",
  email: c.email ?? "",
  address: c.address ?? "",
  birthday: c.birthday ?? "",
  source_module: c.source_module ?? "",
  notes: c.notes ?? "",
  is_active: c.is_active,
});

const WO_STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  dispatched: "已派工",
  in_progress: "施工中",
  qc: "品檢",
  done: "完工",
  closed: "結案",
  cancelled: "取消",
};
const APT_STATUS_LABEL: Record<string, string> = {
  booked: "已預約",
  checked_in: "已報到",
  in_progress: "進行中",
  done: "完成",
  cancelled: "已取消",
  no_show: "未到",
};

export function AftersalesCustomerBaseDetailView({
  customer,
  vehicles,
  workOrders,
  appointments,
  models,
  canEdit,
  initialMode = "view",
}: {
  customer: DetailCustomer | null;
  vehicles: VehicleRow[];
  workOrders: WorkOrderRow[];
  appointments: AppointmentRow[];
  models: ModelRef[];
  canEdit: boolean;
  initialMode?: "view" | "create";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(initialMode === "create");
  const [activeTab, setActiveTab] = useState<TabKey>("vehicles");

  const [draft, setDraft] = useState<AftersalesCustomerInput>(
    customer ? fromCustomer(customer) : blankInput(),
  );
  const [createDraft, setCreateDraft] = useState<AftersalesCustomerInput>(
    blankInput(),
  );

  const showInputs = editing || creating;
  const formDraft = creating ? createDraft : draft;
  const setFormDraft = (next: AftersalesCustomerInput) => {
    if (creating) setCreateDraft(next);
    else setDraft(next);
  };

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const save = () => {
    if (!customer) return;
    startTransition(async () => {
      const res = await updateAftersalesCustomerAction(customer.id, draft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存變更" });
        setEditing(false);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const cancelEdit = () => {
    if (customer) setDraft(fromCustomer(customer));
    setEditing(false);
  };

  const toggleActive = () => {
    if (!customer) return;
    startTransition(async () => {
      const res = await setAftersalesCustomerActiveAction(
        customer.id,
        !customer.is_active,
      );
      if (res.ok) {
        showBanner({
          ok: true,
          msg: customer.is_active ? "✓ 已停用" : "✓ 已啟用",
        });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const openCreate = () => {
    setEditing(false);
    setCreateDraft(blankInput());
    setCreating(true);
  };

  const cancelCreate = () => {
    if (initialMode === "create") {
      router.push("/aftersales/crm/customer-base");
    } else {
      setCreating(false);
    }
  };

  const submitCreate = () => {
    startTransition(async () => {
      const res = await createAftersalesCustomerAction(createDraft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已新增客戶，跳轉到新資料" });
        setCreating(false);
        router.push(`/aftersales/crm/customer-base/${res.data.id}`);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const remove = () => {
    if (!customer) return;
    if (
      !confirm(
        `確定刪除「${customer.code} ${customer.name}」？\n此動作不可復原；若有歷史車輛／工單／預約引用會失敗。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteAftersalesCustomerAction(customer.id);
      if (res.ok) {
        router.push("/aftersales/crm/customer-base");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const modelMap = new Map(models.map((m) => [m.id, m]));

  const inputClass =
    "h-[28px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] w-full";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const titleName = creating ? "（新增客戶）" : (customer?.name ?? "—");
  const titleCode = creating ? "新增客戶" : (customer?.code ?? "—");

  // 售後 KPI 計算
  const totalVisits = workOrders.length;
  const lastVisitAt = workOrders[0]?.opened_at ?? null;
  const lastRoNo = workOrders[0]?.ro_no ?? null;
  const totalAmount = workOrders.reduce(
    (sum, w) => sum + (w.total_amount == null ? 0 : Number(w.total_amount)),
    0,
  );

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link
            href="/aftersales/crm/customer-base"
            className="hover:text-[#185FA5]"
          >
            售後客戶基盤
          </Link>
          <span>›</span>
          <span
            className={`text-[#5A5955] ${creating ? "" : "font-mono"}`}
            data-testid="aftersales-customer-base-breadcrumb-code"
          >
            {titleCode}
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
          {editing && customer ? (
            <>
              <button
                type="button"
                onClick={save}
                disabled={isPending || !canEdit}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {isPending ? "儲存中…" : "儲存變更"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] shadow-sm hover:border-[#9A9890]"
              >
                取消
              </button>
            </>
          ) : creating ? (
            <>
              <button
                type="button"
                onClick={cancelCreate}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] shadow-sm hover:border-[#9A9890] disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitCreate}
                disabled={isPending || !canEdit}
                data-testid="aftersales-customer-base-create-submit"
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {isPending ? "建立中…" : "建立並開啟"}
              </button>
            </>
          ) : customer ? (
            <>
              <Link
                href="/aftersales/crm/customer-base"
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
                disabled={!canEdit}
                onClick={() => setEditing(true)}
                data-testid="aftersales-customer-base-edit-button"
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={remove}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                刪除
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={toggleActive}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                {customer.is_active ? "停用" : "啟用"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
          role={banner.ok ? "status" : "alert"}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">
                售後客戶基盤
              </div>
              <h1
                className="text-[18px] font-semibold text-[#2C2C2A] leading-tight"
                data-testid="aftersales-customer-base-detail-title"
              >
                {titleName}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                {creating ? (
                  <>
                    <span className="text-[#9A9890]">—</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDF3E3] text-[#854F0B]">
                      尚未建立
                    </span>
                  </>
                ) : customer ? (
                  <>
                    <span className="font-mono text-[#5A5955]">
                      {customer.code}
                    </span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                        customer.type === "corporate"
                          ? "bg-[#EEF4FB] text-[#185FA5]"
                          : "bg-[#EBF3FF] text-[#1A3A5C]"
                      }`}
                    >
                      {customer.type === "corporate" ? "公司" : "個人"}
                    </span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${customer.is_active ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#F2F2F2] text-[#6B6A68]"}`}
                    >
                      {customer.is_active ? "往來中" : "停用"}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="shrink-0">
            {creating ? (
              <div className="w-[260px] h-[120px] border-2 border-dashed border-[#D5D3CB] rounded-lg bg-[#F8F7F4] flex items-center justify-center text-[12px] text-[#9A9890] text-center px-3">
                建立後可上傳照片
              </div>
            ) : (
              <div className="w-[260px] h-[120px] border border-[#EEECE6] rounded-lg bg-[#F8F7F4] flex flex-col justify-center px-4 gap-1">
                <div className="text-[11px] text-[#9A9890]">服務廠 KPI</div>
                <div className="flex items-baseline gap-3">
                  <div>
                    <div className="text-[10.5px] text-[#9A9890]">累積入廠</div>
                    <div className="text-[16px] font-semibold text-[#1A3A5C]">
                      {totalVisits}
                      <span className="text-[11px] font-normal ml-0.5">次</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10.5px] text-[#9A9890]">累積消費</div>
                    <div className="text-[14px] font-semibold text-[#0F6E56]">
                      ${totalAmount.toLocaleString("en-US")}
                    </div>
                  </div>
                </div>
                <div className="text-[10.5px] text-[#9A9890] mt-1">
                  上次入廠：
                  <span className="font-mono">
                    {fmtDate(lastVisitAt)}
                  </span>
                  {lastRoNo ? <span className="ml-1">({lastRoNo})</span> : null}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 基本資料 */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${showInputs ? lockedClass : ""}`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 基本資料
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="客戶代碼"
            value={
              showInputs ? (
                <input
                  value={formDraft.code ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, code: e.target.value })
                  }
                  placeholder={creating ? "留空自動產生 C00001..." : "例：C00001"}
                  className={inputClass}
                />
              ) : (
                <span className="font-mono font-semibold">{customer?.code}</span>
              )
            }
          />
          <Kv
            label="客戶名稱"
            value={
              showInputs ? (
                <input
                  value={formDraft.name}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, name: e.target.value })
                  }
                  placeholder="例：陳大明 / 神鬼車隊有限公司"
                  className={inputClass}
                  data-testid="aftersales-customer-base-name-input"
                />
              ) : (
                <span className="font-medium">{customer?.name}</span>
              )
            }
          />
          <Kv
            label="類型"
            value={
              showInputs ? (
                <select
                  value={formDraft.type}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      type: e.target.value as "individual" | "corporate",
                    })
                  }
                  className={inputClass}
                >
                  <option value="individual">個人</option>
                  <option value="corporate">公司</option>
                </select>
              ) : customer?.type === "corporate" ? (
                "公司戶"
              ) : (
                "個人戶"
              )
            }
          />
          <Kv
            label="聯絡電話"
            value={
              showInputs ? (
                <input
                  value={formDraft.phone ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, phone: e.target.value })
                  }
                  placeholder="例：0912-345-678"
                  className={inputClass}
                  data-testid="aftersales-customer-base-phone-input"
                />
              ) : (
                <span className="font-mono">{customer?.phone ?? "—"}</span>
              )
            }
          />
          <Kv
            label="Email"
            value={
              showInputs ? (
                <input
                  value={formDraft.email ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, email: e.target.value })
                  }
                  placeholder="example@mail.com"
                  className={inputClass}
                />
              ) : (
                (customer?.email ?? "—")
              )
            }
          />
          <Kv
            label={formDraft.type === "corporate" ? "統一編號" : "身分證號"}
            value={
              showInputs ? (
                formDraft.type === "corporate" ? (
                  <input
                    value={formDraft.tax_id ?? ""}
                    onChange={(e) =>
                      setFormDraft({ ...formDraft, tax_id: e.target.value })
                    }
                    placeholder="8 碼統編"
                    className={inputClass}
                  />
                ) : (
                  <input
                    value={formDraft.national_id ?? ""}
                    onChange={(e) =>
                      setFormDraft({
                        ...formDraft,
                        national_id: e.target.value,
                      })
                    }
                    placeholder="A123456789"
                    className={inputClass}
                  />
                )
              ) : customer?.type === "corporate" ? (
                <span className="font-mono">{customer?.tax_id ?? "—"}</span>
              ) : (
                <span className="font-mono">
                  {customer?.national_id ?? "—"}
                </span>
              )
            }
          />
          <Kv
            label="地址"
            value={
              showInputs ? (
                <input
                  value={formDraft.address ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, address: e.target.value })
                  }
                  placeholder="完整地址"
                  className={inputClass}
                />
              ) : (
                (customer?.address ?? "—")
              )
            }
          />
          <Kv
            label="生日"
            value={
              showInputs ? (
                <input
                  type="date"
                  value={formDraft.birthday ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, birthday: e.target.value })
                  }
                  className={inputClass}
                />
              ) : (
                <span className="font-mono">{fmtDate(customer?.birthday)}</span>
              )
            }
          />
          <Kv
            label="建立來源"
            value={
              showInputs ? (
                <input
                  value={formDraft.source_module ?? ""}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      source_module: e.target.value,
                    })
                  }
                  placeholder="aftersales / sales / walkin..."
                  className={inputClass}
                />
              ) : (
                <span className="font-mono text-[11.5px]">
                  {customer?.source_module ?? "—"}
                </span>
              )
            }
            small={!showInputs}
          />
          {!creating && customer ? (
            <>
              <Kv
                label="建立時間"
                value={fmtDateTime(customer.created_at)}
                mono
                small
              />
              <Kv
                label="最後更新"
                value={fmtDateTime(customer.updated_at)}
                mono
                small
              />
            </>
          ) : null}
        </div>
      </section>

      {creating ? (
        <p className="text-[12px] text-[#9A9890] leading-relaxed">
          建立後將跳轉到該客戶的詳情頁，可進一步維護車輛、服務歷程與業務備註。
        </p>
      ) : null}

      {/* Tabs（view / edit 既有客戶時顯示） */}
      {!creating && customer ? (
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
                  </button>
                );
              })}
            </div>
          </div>
          <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
            {activeTab === "vehicles" ? (
              <SectionCard title={`名下車輛（${vehicles.length}）`}>
                {vehicles.length === 0 ? (
                  <div className="text-[12px] text-[#9A9890] py-3">
                    此客戶尚未登錄任何車輛
                  </div>
                ) : (
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="text-[11px] text-[#9A9890]">
                        <th className="text-left font-medium py-1">車牌</th>
                        <th className="text-left font-medium py-1">車型 / 年式</th>
                        <th className="text-right font-medium py-1">目前里程</th>
                        <th className="text-left font-medium py-1">上次保養</th>
                        <th className="text-right font-medium py-1">上次里程</th>
                        <th className="text-left font-medium py-1">下次預定保養</th>
                        <th className="text-right font-medium py-1">下次預定里程</th>
                        <th className="text-left font-medium py-1">保固至</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vehicles.map((v) => (
                        <tr key={v.id} className="border-t border-[#F8F7F4]">
                          <td className="py-1.5 font-mono font-semibold text-[#1A3A5C]">
                            {v.license_plate ?? "—"}
                          </td>
                          <td className="py-1.5">
                            <div>
                              {v.model_id
                                ? (modelMap.get(v.model_id)?.display_name ??
                                  v.model_id.slice(0, 8))
                                : "—"}
                            </div>
                            <div className="text-[10.5px] text-[#9A9890]">
                              {v.manufactured_year ?? ""}
                              {v.color ? ` ・ ${v.color}` : ""}
                            </div>
                          </td>
                          <td className="py-1.5 text-right font-mono">
                            {v.current_mileage != null
                              ? `${Number(v.current_mileage).toLocaleString("en-US")} km`
                              : "—"}
                          </td>
                          <td className="py-1.5 font-mono text-[11px]">
                            {fmtDate(v.last_service_date)}
                          </td>
                          <td className="py-1.5 text-right font-mono text-[11px]">
                            {v.last_service_mileage != null
                              ? Number(v.last_service_mileage).toLocaleString(
                                  "en-US",
                                )
                              : "—"}
                          </td>
                          <td className="py-1.5 font-mono text-[11px]">
                            {fmtDate(v.next_service_due_date)}
                          </td>
                          <td className="py-1.5 text-right font-mono text-[11px]">
                            {v.next_service_due_mileage != null
                              ? Number(
                                  v.next_service_due_mileage,
                                ).toLocaleString("en-US")
                              : "—"}
                          </td>
                          <td className="py-1.5 font-mono text-[11px]">
                            {fmtDate(v.warranty_until)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </SectionCard>
            ) : null}

            {activeTab === "service_history" ? (
              <div className="space-y-3">
                <SectionCard title={`歷史工單（${workOrders.length}）`}>
                  {workOrders.length === 0 ? (
                    <div className="text-[12px] text-[#9A9890] py-3">
                      此客戶尚無工單紀錄
                    </div>
                  ) : (
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="text-[11px] text-[#9A9890]">
                          <th className="text-left font-medium py-1">工單號</th>
                          <th className="text-left font-medium py-1">狀態</th>
                          <th className="text-left font-medium py-1">進廠日</th>
                          <th className="text-right font-medium py-1">進廠里程</th>
                          <th className="text-left font-medium py-1">客訴</th>
                          <th className="text-left font-medium py-1">維修摘要</th>
                          <th className="text-right font-medium py-1">金額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workOrders.map((w) => (
                          <tr key={w.id} className="border-t border-[#F8F7F4]">
                            <td className="py-1.5 font-mono font-semibold text-[#1A3A5C]">
                              {w.ro_no}
                            </td>
                            <td className="py-1.5">
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                                  w.status === "closed" || w.status === "done"
                                    ? "bg-[#EAF3DE] text-[#3B6D11]"
                                    : w.status === "in_progress" ||
                                        w.status === "dispatched" ||
                                        w.status === "qc"
                                      ? "bg-[#FDF3E3] text-[#854F0B]"
                                      : w.status === "cancelled"
                                        ? "bg-[#FDECEA] text-[#CC0000]"
                                        : "bg-[#F2F2F2] text-[#6B6A68]"
                                }`}
                              >
                                {WO_STATUS_LABEL[w.status] ?? w.status}
                              </span>
                            </td>
                            <td className="py-1.5 font-mono text-[11px]">
                              {fmtDate(w.opened_at)}
                            </td>
                            <td className="py-1.5 text-right font-mono text-[11px]">
                              {w.mileage_in != null
                                ? `${Number(w.mileage_in).toLocaleString("en-US")}`
                                : "—"}
                            </td>
                            <td className="py-1.5 max-w-[180px] truncate">
                              {w.customer_complaint ?? "—"}
                            </td>
                            <td className="py-1.5 max-w-[220px] truncate text-[11.5px]">
                              {w.work_summary ?? "—"}
                            </td>
                            <td className="py-1.5 text-right font-mono">
                              {w.total_amount != null
                                ? `$${Number(w.total_amount).toLocaleString("en-US")}`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </SectionCard>

                <SectionCard title={`預約 / 排程（${appointments.length}）`}>
                  {appointments.length === 0 ? (
                    <div className="text-[12px] text-[#9A9890] py-3">
                      此客戶目前沒有預約紀錄
                    </div>
                  ) : (
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="text-[11px] text-[#9A9890]">
                          <th className="text-left font-medium py-1">預約單號</th>
                          <th className="text-left font-medium py-1">預約時間</th>
                          <th className="text-left font-medium py-1">服務類型</th>
                          <th className="text-left font-medium py-1">狀態</th>
                          <th className="text-left font-medium py-1">備註</th>
                        </tr>
                      </thead>
                      <tbody>
                        {appointments.map((a) => (
                          <tr key={a.id} className="border-t border-[#F8F7F4]">
                            <td className="py-1.5 font-mono font-semibold text-[#1A3A5C]">
                              {a.appt_no}
                            </td>
                            <td className="py-1.5 font-mono text-[11px]">
                              {fmtDateTime(a.scheduled_at)}
                            </td>
                            <td className="py-1.5 text-[11.5px]">
                              {a.service_type ?? "—"}
                            </td>
                            <td className="py-1.5">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
                                {APT_STATUS_LABEL[a.status] ?? a.status}
                              </span>
                            </td>
                            <td className="py-1.5 text-[11.5px] text-[#5A5955] max-w-[260px] truncate">
                              {a.notes ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </SectionCard>
              </div>
            ) : null}

            {activeTab === "notes" ? (
              <SectionCard title="業務備註">
                {showInputs ? (
                  <textarea
                    value={formDraft.notes ?? ""}
                    onChange={(e) =>
                      setFormDraft({ ...formDraft, notes: e.target.value })
                    }
                    rows={6}
                    placeholder="記錄客戶偏好、跟進事項、SLA 敏感點…"
                    className="w-full border border-[#D5D3CB] rounded p-2 text-[12.5px] outline-none focus:border-[#185FA5]"
                  />
                ) : customer?.notes ? (
                  <p className="text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap leading-relaxed">
                    {customer.notes}
                  </p>
                ) : (
                  <div className="text-[12px] text-[#9A9890] py-2">
                    尚無業務備註。點「修改」可在此寫入跟進紀錄。
                  </div>
                )}
              </SectionCard>
            ) : null}
          </div>
        </>
      ) : null}
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

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}
