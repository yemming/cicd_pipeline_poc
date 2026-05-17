"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createVehicleAction,
  deleteVehicleAction,
  updateVehicleAction,
  type VehicleInput,
} from "@/lib/master-data/vehicle-actions";
import type { VehicleFieldKey } from "@/lib/master-data/vehicle-form-types";
import type {
  Customer,
  CustomerVehicle,
  Employee,
  VehicleAcquiredFrom,
  VehicleModel,
} from "@/lib/parts/types";

type Banner = { ok: boolean; msg: string } | null;
type TabKey = "service" | "warranty" | "links" | "audit";

const TABS: { key: TabKey; label: string }[] = [
  { key: "service", label: "里程與保養" },
  { key: "warranty", label: "保固與保險" },
  { key: "links", label: "服務歷史" },
  { key: "audit", label: "稽核資訊" },
];

const ACQUIRED_FROM_OPTIONS: { value: VehicleAcquiredFrom; label: string }[] = [
  { value: "new", label: "新車購入" },
  { value: "transfer", label: "車主轉讓" },
  { value: "used", label: "中古車" },
  { value: "import", label: "灰色進口" },
  { value: "other", label: "其他" },
];
const ACQUIRED_LABEL = new Map(ACQUIRED_FROM_OPTIONS.map((o) => [o.value, o.label]));

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
  // 已是 YYYY-MM-DD 就直接用
  return s.slice(0, 10);
}

const blankInput = (): VehicleInput => ({
  customer_id: "",
  model_id: null,
  vin: null,
  license_plate: null,
  engine_no: null,
  color: null,
  manufactured_year: null,
  acquired_from: "new",
  purchase_date: null,
  purchase_amount: null,
  current_mileage: null,
  last_service_date: null,
  last_service_mileage: null,
  next_service_due_date: null,
  next_service_due_mileage: null,
  warranty_until: null,
  insurance_company: null,
  insurance_policy_no: null,
  insurance_until: null,
  preferred_technician_id: null,
  notes: null,
  is_active: true,
});

const fromRow = (r: CustomerVehicle): VehicleInput => ({
  customer_id: r.customer_id,
  model_id: r.model_id,
  vin: r.vin,
  license_plate: r.license_plate,
  engine_no: r.engine_no,
  color: r.color,
  manufactured_year: r.manufactured_year,
  acquired_from: (r.acquired_from as VehicleAcquiredFrom) ?? "new",
  purchase_date: r.purchase_date,
  purchase_amount: r.purchase_amount,
  current_mileage: r.current_mileage,
  last_service_date: r.last_service_date,
  last_service_mileage: r.last_service_mileage,
  next_service_due_date: r.next_service_due_date,
  next_service_due_mileage: r.next_service_due_mileage,
  warranty_until: r.warranty_until,
  insurance_company: r.insurance_company,
  insurance_policy_no: r.insurance_policy_no,
  insurance_until: r.insurance_until,
  preferred_technician_id: r.preferred_technician_id,
  notes: r.notes,
  is_active: r.is_active,
});

export function VehicleDetailView({
  vehicle,
  customers,
  models,
  technicians,
  canEdit,
  initialMode = "view",
}: {
  vehicle: CustomerVehicle | null;
  customers: Customer[];
  models: VehicleModel[];
  technicians: Employee[];
  canEdit: boolean;
  initialMode?: "view" | "create";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(initialMode === "create");
  const [activeTab, setActiveTab] = useState<TabKey>("service");
  const [draft, setDraft] = useState<VehicleInput>(
    vehicle ? fromRow(vehicle) : blankInput(),
  );
  const [createDraft, setCreateDraft] = useState<VehicleInput>(blankInput());
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<VehicleFieldKey, string>>>({});

  const showInputs = editing || creating;
  const formDraft: VehicleInput = creating ? createDraft : draft;
  const setFormDraft = (next: VehicleInput) => {
    if (creating) setCreateDraft(next);
    else setDraft(next);
  };

  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const modelMap = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const techMap = useMemo(() => new Map(technicians.map((t) => [t.id, t])), [technicians]);
  const owner = vehicle?.customer_id ? customerMap.get(vehicle.customer_id) ?? null : null;
  const model = vehicle?.model_id ? modelMap.get(vehicle.model_id) ?? null : null;
  const technician = vehicle?.preferred_technician_id
    ? techMap.get(vehicle.preferred_technician_id) ?? null
    : null;

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const save = () => {
    if (!vehicle) return;
    startTransition(async () => {
      setFieldErrors({});
      const res = await updateVehicleAction(vehicle.id, draft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存變更" });
        setEditing(false);
        router.refresh();
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const cancelEdit = () => {
    if (vehicle) setDraft(fromRow(vehicle));
    setFieldErrors({});
    setEditing(false);
  };

  const toggleActive = () => {
    if (!vehicle) return;
    startTransition(async () => {
      const res = await updateVehicleAction(vehicle.id, {
        ...fromRow(vehicle),
        is_active: !vehicle.is_active,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: vehicle.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const openCreate = () => {
    setEditing(false);
    setCreateDraft(blankInput());
    setFieldErrors({});
    setCreating(true);
  };

  const cancelCreate = () => {
    setFieldErrors({});
    if (initialMode === "create") router.push("/admin/master-data/vehicles");
    else setCreating(false);
  };

  const submitCreate = () => {
    startTransition(async () => {
      setFieldErrors({});
      const res = await createVehicleAction(createDraft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已建立車輛，跳轉中…" });
        setCreating(false);
        router.push(`/admin/master-data/vehicles/${res.data.id}`);
        router.refresh();
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const remove = () => {
    if (!vehicle) return;
    if (
      !confirm(
        `確定刪除車輛「${vehicle.license_plate ?? vehicle.vin ?? vehicle.id.slice(0, 8)}」？\n若已有預約、工單、檢驗、保固參照會擋下；建議改用停用保留歷史。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteVehicleAction(vehicle.id);
      if (res.ok) {
        router.push("/admin/master-data/vehicles");
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

  const inputClass =
    "h-[28px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] w-full";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const plate = vehicle?.license_plate ?? vehicle?.vin ?? "—";
  const headlineLabel = creating
    ? "（未建車輛）"
    : vehicle
      ? plate
      : "（資料缺失）";

  const intInput = (
    val: number | null | undefined,
    setter: (n: number | null) => void,
    placeholder?: string,
  ) => (
    <input
      type="number"
      inputMode="numeric"
      value={val ?? ""}
      onChange={(e) => {
        const v = e.target.value.trim();
        setter(v === "" ? null : Number(v));
      }}
      placeholder={placeholder}
      className={inputClass}
    />
  );

  return (
    <main className="px-6 py-5 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/admin/master-data/vehicles" className="hover:text-[#185FA5]">
            客戶車輛
          </Link>
          <span>›</span>
          <span className={`text-[#5A5955] ${creating ? "" : "font-mono"}`}>
            {creating ? "新增車輛" : plate}
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
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {isPending ? "建立中…" : "建立並開啟"}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/admin/master-data/vehicles"
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
                disabled={!canEdit || !vehicle}
                onClick={() => setEditing(true)}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                disabled={!canEdit || !vehicle}
                onClick={remove}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                刪除
              </button>
              <button
                type="button"
                disabled={!canEdit || !vehicle}
                onClick={toggleActive}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                {vehicle?.is_active ? "停用" : "啟用"}
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

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">客戶車輛</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight font-mono tracking-wide">
                {headlineLabel}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                {creating ? (
                  <>
                    <span className="text-[#9A9890]">—</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDF3E3] text-[#854F0B]">
                      尚未建立
                    </span>
                  </>
                ) : vehicle ? (
                  <>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                        vehicle.is_active
                          ? "bg-[#EAF3DE] text-[#3B6D11]"
                          : "bg-[#F2F2F2] text-[#6B6A68]"
                      }`}
                    >
                      {vehicle.is_active ? "在用中" : "已停用"}
                    </span>
                    {model ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                        {model.display_name}
                      </span>
                    ) : null}
                    {vehicle.color ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#5A5955]">
                        {vehicle.color}
                      </span>
                    ) : null}
                    {vehicle.manufactured_year ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#5A5955]">
                        {vehicle.manufactured_year} 年式
                      </span>
                    ) : null}
                    {owner ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
                        車主 {owner.name}
                      </span>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="shrink-0">
            <div
              className={`w-[260px] h-[120px] rounded-lg flex flex-col items-center justify-center text-[12px] ${
                creating
                  ? "border-2 border-dashed border-[#D5D3CB] bg-[#F8F7F4] text-[#9A9890]"
                  : "border border-[#EEECE6] bg-[#F8F7F4]"
              }`}
            >
              {creating ? (
                <span>建立後顯示目前里程</span>
              ) : (
                <>
                  <div className="text-[11px] text-[#9A9890]">目前里程</div>
                  <div className="text-[26px] font-semibold text-[#2C2C2A] font-mono">
                    {vehicle?.current_mileage ?? "—"}
                  </div>
                  <div className="text-[11px] text-[#9A9890] mt-1">km</div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 基本資料 */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
          showInputs ? lockedClass : ""
        }`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 車輛識別</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="車主*"
            value={
              showInputs ? (
                <select
                  value={formDraft.customer_id}
                  onChange={(e) => setFormDraft({ ...formDraft, customer_id: e.target.value })}
                  className={inputClass}
                >
                  <option value="">— 請選擇 —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{`${c.name} (${c.code ?? "—"})`}</option>
                  ))}
                </select>
              ) : owner ? (
                <div>
                  <div className="font-medium">{owner.name}</div>
                  <div className="font-mono text-[11px] text-[#9A9890]">
                    {[owner.code, owner.phone].filter(Boolean).join(" · ")}
                  </div>
                </div>
              ) : (
                <span className="text-[#9A9890]">未指定</span>
              )
            }
          />
          <Kv
            label="車型"
            value={
              showInputs ? (
                <select
                  value={formDraft.model_id ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, model_id: e.target.value || null })
                  }
                  className={inputClass}
                >
                  <option value="">— 未指定 —</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{`${m.display_name}`}</option>
                  ))}
                </select>
              ) : model ? (
                <div>
                  <div>{model.display_name}</div>
                  <div className="text-[11px] text-[#9A9890]">{model.series}</div>
                </div>
              ) : (
                <span className="text-[#9A9890]">未指定</span>
              )
            }
          />
          <Kv
            label="車牌"
            value={
              showInputs ? (
                <input
                  value={formDraft.license_plate ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, license_plate: e.target.value || null })
                  }
                  placeholder="ABC-1234"
                  className={inputClass}
                />
              ) : vehicle?.license_plate ? (
                <span className="font-mono">{vehicle.license_plate}</span>
              ) : (
                <span className="text-[#9A9890]">—</span>
              )
            }
          />
          <Kv
            label="VIN"
            value={
              showInputs ? (
                <input
                  value={formDraft.vin ?? ""}
                  onChange={(e) => setFormDraft({ ...formDraft, vin: e.target.value || null })}
                  placeholder="17 字元"
                  className={inputClass}
                />
              ) : vehicle?.vin ? (
                <span className="font-mono">{vehicle.vin}</span>
              ) : (
                <span className="text-[#9A9890]">—</span>
              )
            }
          />
          <Kv
            label="引擎號碼"
            value={
              showInputs ? (
                <input
                  value={formDraft.engine_no ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, engine_no: e.target.value || null })
                  }
                  className={inputClass}
                />
              ) : vehicle?.engine_no ? (
                <span className="font-mono">{vehicle.engine_no}</span>
              ) : (
                <span className="text-[#9A9890]">—</span>
              )
            }
          />
          <Kv
            label="顏色"
            value={
              showInputs ? (
                <input
                  value={formDraft.color ?? ""}
                  onChange={(e) => setFormDraft({ ...formDraft, color: e.target.value || null })}
                  placeholder="例：Ducati Red"
                  className={inputClass}
                />
              ) : vehicle?.color ?? <span className="text-[#9A9890]">—</span>
            }
          />
          <Kv
            label="出廠年份"
            value={
              showInputs
                ? intInput(formDraft.manufactured_year, (n) =>
                    setFormDraft({ ...formDraft, manufactured_year: n }),
                  "例：2024")
                : vehicle?.manufactured_year ?? <span className="text-[#9A9890]">—</span>
            }
          />
          <Kv
            label="取得來源*"
            value={
              showInputs ? (
                <select
                  value={formDraft.acquired_from ?? "new"}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      acquired_from: e.target.value as VehicleAcquiredFrom,
                    })
                  }
                  className={inputClass}
                >
                  {ACQUIRED_FROM_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                ACQUIRED_LABEL.get(vehicle?.acquired_from as VehicleAcquiredFrom) ??
                vehicle?.acquired_from ?? <span className="text-[#9A9890]">—</span>
              )
            }
          />
          <Kv
            label="購入日"
            value={
              showInputs ? (
                <input
                  type="date"
                  value={formDraft.purchase_date ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, purchase_date: e.target.value || null })
                  }
                  className={inputClass}
                />
              ) : (
                fmtDate(vehicle?.purchase_date)
              )
            }
          />
        </div>
        {Object.values(fieldErrors).some(Boolean) ? (
          <div className="px-4 pb-3 text-[11.5px] text-[#CC0000]">
            {Object.entries(fieldErrors)
              .filter(([, v]) => v)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          </div>
        ) : null}
      </section>

      {creating ? (
        <p className="text-[12px] text-[#9A9890] leading-relaxed">
          建立後將跳轉到該車輛的詳情頁，可繼續維護里程 / 保固 / 保險。
        </p>
      ) : null}

      {/* Tabs */}
      {!creating && vehicle ? (
        <>
          <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto" id="tab-content">
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
            {activeTab === "service" ? (
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${showInputs ? lockedClass : ""}`}>
                {sectionCard(
                  "里程紀錄",
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Kv
                      label="目前里程"
                      value={
                        showInputs
                          ? intInput(formDraft.current_mileage, (n) =>
                              setFormDraft({ ...formDraft, current_mileage: n }),
                            )
                          : vehicle.current_mileage != null ? (
                              <span className="font-mono">{vehicle.current_mileage} km</span>
                            ) : (
                              <span className="text-[#9A9890]">—</span>
                            )
                      }
                    />
                    <Kv
                      label="上次保養日"
                      value={
                        showInputs ? (
                          <input
                            type="date"
                            value={formDraft.last_service_date ?? ""}
                            onChange={(e) =>
                              setFormDraft({ ...formDraft, last_service_date: e.target.value || null })
                            }
                            className={inputClass}
                          />
                        ) : (
                          fmtDate(vehicle.last_service_date)
                        )
                      }
                    />
                    <Kv
                      label="上次保養里程"
                      value={
                        showInputs
                          ? intInput(formDraft.last_service_mileage, (n) =>
                              setFormDraft({ ...formDraft, last_service_mileage: n }),
                            )
                          : vehicle.last_service_mileage != null ? (
                              <span className="font-mono">{vehicle.last_service_mileage} km</span>
                            ) : (
                              <span className="text-[#9A9890]">—</span>
                            )
                      }
                    />
                    <Kv
                      label="下次保養期限"
                      value={
                        showInputs ? (
                          <input
                            type="date"
                            value={formDraft.next_service_due_date ?? ""}
                            onChange={(e) =>
                              setFormDraft({
                                ...formDraft,
                                next_service_due_date: e.target.value || null,
                              })
                            }
                            className={inputClass}
                          />
                        ) : (
                          fmtDate(vehicle.next_service_due_date)
                        )
                      }
                    />
                    <Kv
                      label="下次保養里程"
                      value={
                        showInputs
                          ? intInput(formDraft.next_service_due_mileage, (n) =>
                              setFormDraft({ ...formDraft, next_service_due_mileage: n }),
                            )
                          : vehicle.next_service_due_mileage != null ? (
                              <span className="font-mono">{vehicle.next_service_due_mileage} km</span>
                            ) : (
                              <span className="text-[#9A9890]">—</span>
                            )
                      }
                    />
                    <Kv
                      label="專任技師"
                      value={
                        showInputs ? (
                          <select
                            value={formDraft.preferred_technician_id ?? ""}
                            onChange={(e) =>
                              setFormDraft({
                                ...formDraft,
                                preferred_technician_id: e.target.value || null,
                              })
                            }
                            className={inputClass}
                          >
                            <option value="">— 未指定 —</option>
                            {technicians.map((t) => (
                              <option key={t.id} value={t.id}>{`${t.name} (${t.emp_code})`}</option>
                            ))}
                          </select>
                        ) : technician ? (
                          <div>
                            <div className="font-medium">{technician.name}</div>
                            <div className="font-mono text-[11px] text-[#9A9890]">{technician.emp_code}</div>
                          </div>
                        ) : (
                          <span className="text-[#9A9890]">未指定</span>
                        )
                      }
                    />
                  </div>,
                )}
                {sectionCard(
                  "備註",
                  showInputs ? (
                    <textarea
                      value={formDraft.notes ?? ""}
                      onChange={(e) =>
                        setFormDraft({ ...formDraft, notes: e.target.value || null })
                      }
                      rows={6}
                      placeholder="改裝項目、車況特殊事項…"
                      className="border border-[#D5D3CB] rounded px-2 py-1 text-[12.5px] bg-white outline-none focus:border-[#185FA5] w-full"
                    />
                  ) : vehicle.notes ? (
                    <div className="whitespace-pre-wrap text-[12.5px]">{vehicle.notes}</div>
                  ) : (
                    <span className="text-[12.5px] text-[#9A9890]">—</span>
                  ),
                )}
              </div>
            ) : null}

            {activeTab === "warranty" ? (
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${showInputs ? lockedClass : ""}`}>
                {sectionCard(
                  "原廠保固",
                  <div className="grid grid-cols-1 gap-3">
                    <Kv
                      label="保固到期日"
                      value={
                        showInputs ? (
                          <input
                            type="date"
                            value={formDraft.warranty_until ?? ""}
                            onChange={(e) =>
                              setFormDraft({ ...formDraft, warranty_until: e.target.value || null })
                            }
                            className={inputClass}
                          />
                        ) : (
                          fmtDate(vehicle.warranty_until)
                        )
                      }
                    />
                    <Kv
                      label="購入金額"
                      value={
                        showInputs ? (
                          <input
                            type="number"
                            inputMode="decimal"
                            value={formDraft.purchase_amount ?? ""}
                            onChange={(e) => {
                              const v = e.target.value.trim();
                              setFormDraft({
                                ...formDraft,
                                purchase_amount: v === "" ? null : Number(v),
                              });
                            }}
                            placeholder="0.00"
                            className={inputClass}
                          />
                        ) : vehicle.purchase_amount != null ? (
                          <span className="font-mono">NT$ {vehicle.purchase_amount}</span>
                        ) : (
                          <span className="text-[#9A9890]">—</span>
                        )
                      }
                    />
                  </div>,
                )}
                {sectionCard(
                  "保險資訊",
                  <div className="grid grid-cols-1 gap-3">
                    <Kv
                      label="保險公司"
                      value={
                        showInputs ? (
                          <input
                            value={formDraft.insurance_company ?? ""}
                            onChange={(e) =>
                              setFormDraft({
                                ...formDraft,
                                insurance_company: e.target.value || null,
                              })
                            }
                            className={inputClass}
                          />
                        ) : vehicle.insurance_company ?? <span className="text-[#9A9890]">—</span>
                      }
                    />
                    <Kv
                      label="保單號"
                      value={
                        showInputs ? (
                          <input
                            value={formDraft.insurance_policy_no ?? ""}
                            onChange={(e) =>
                              setFormDraft({
                                ...formDraft,
                                insurance_policy_no: e.target.value || null,
                              })
                            }
                            className={inputClass}
                          />
                        ) : vehicle.insurance_policy_no ? (
                          <span className="font-mono">{vehicle.insurance_policy_no}</span>
                        ) : (
                          <span className="text-[#9A9890]">—</span>
                        )
                      }
                    />
                    <Kv
                      label="保險到期"
                      value={
                        showInputs ? (
                          <input
                            type="date"
                            value={formDraft.insurance_until ?? ""}
                            onChange={(e) =>
                              setFormDraft({
                                ...formDraft,
                                insurance_until: e.target.value || null,
                              })
                            }
                            className={inputClass}
                          />
                        ) : (
                          fmtDate(vehicle.insurance_until)
                        )
                      }
                    />
                  </div>,
                )}
              </div>
            ) : null}

            {activeTab === "links" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sectionCard(
                  "服務歷史",
                  <div className="space-y-2 text-[12.5px]">
                    <Kv
                      label="工單"
                      value={
                        <Link
                          href={`/admin/master-data/work-orders?vehicle=${vehicle.id}`}
                          className="text-[#185FA5] hover:underline"
                        >
                          查看本車工單 →
                        </Link>
                      }
                      small
                    />
                    <Kv
                      label="預約"
                      value={
                        <Link
                          href={`/admin/master-data/appointments?vehicle=${vehicle.id}`}
                          className="text-[#185FA5] hover:underline"
                        >
                          查看本車預約 →
                        </Link>
                      }
                      small
                    />
                    <Kv
                      label="PI / PDI 檢驗"
                      value={
                        <Link
                          href={`/admin/master-data/inspections?vehicle=${vehicle.id}`}
                          className="text-[#185FA5] hover:underline"
                        >
                          查看本車檢驗 →
                        </Link>
                      }
                      small
                    />
                    <Kv
                      label="保固申請"
                      value={
                        <Link
                          href={`/admin/master-data/warranty-claims?vehicle=${vehicle.id}`}
                          className="text-[#185FA5] hover:underline"
                        >
                          查看本車保固 →
                        </Link>
                      }
                      small
                    />
                  </div>,
                )}
                {sectionCard(
                  "提示",
                  <div className="text-[12px] text-[#5A5955] leading-relaxed">
                    若該車已轉手或報廢，請停用本筆並由新車主重新建立；歷史單據仍維持引用。
                  </div>,
                )}
              </div>
            ) : null}

            {activeTab === "audit" ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {sectionCard(
                  "識別碼",
                  <>
                    <Kv label="系統識別碼" value={<span className="font-mono">{vehicle.id}</span>} small />
                    <Kv label="品牌" value={vehicle.brand_id} mono small />
                  </>,
                )}
                {sectionCard("建立", <Kv label="建立時間" value={fmtDateTime(vehicle.created_at)} mono small />)}
                {sectionCard("更新", <Kv label="最後更新" value={fmtDateTime(vehicle.updated_at)} mono small />)}
              </div>
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
