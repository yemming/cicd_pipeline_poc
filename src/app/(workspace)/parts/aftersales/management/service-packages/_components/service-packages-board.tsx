"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type {
  ServicePackage,
  ServicePackageItem,
  LaborRate,
  ServicePackageAuditEntry,
} from "@/domain/service-packages";
import type { PricingPolicySummary } from "@/domain/group-pricing";
import {
  createServicePackageAction,
  updateServicePackageAction,
  setServicePackageActiveAction,
  deleteServicePackageAction,
  upsertLaborRateAction,
  type ServicePackageInput,
} from "@/lib/aftersales/service-package-actions";

type Banner = { ok: boolean; msg: string } | null;
type FormMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; id: string };
type TabKey = "packages" | "rates" | "audit";

/* 6 種業務類型（Tab B 工時費率） */
const BIZ_TYPES: Array<{ code: string; label: string; desc: string }> = [
  { code: "MN", label: "MN 定期保養", desc: "原廠排定的里程保養" },
  { code: "RP", label: "RP 一般維修", desc: "機械故障、零件更換等維修" },
  { code: "WC", label: "WC 保固維修", desc: "保固範圍內，費用由原廠承擔" },
  { code: "AC", label: "AC 事故維修", desc: "事故損傷診斷與修復" },
  { code: "PD", label: "PD 整備", desc: "新車 PDI / 中古車整備" },
  { code: "Desmo", label: "Desmo Service", desc: "Desmodronic 氣門系統專項" },
];

const PKG_TYPE_LABEL: Record<ServicePackage["pkgType"], string> = {
  standard: "原廠標準",
  store_custom: "門店自訂",
  promo: "限時促銷",
};

function pkgTypeChipClass(t: ServicePackage["pkgType"]): string {
  switch (t) {
    case "standard":
      return "bg-[#EBF3FF] text-[#1A3A5C]";
    case "store_custom":
      return "bg-[#E8F5F0] text-[#0F6E56]";
    case "promo":
      return "bg-[#FDF3E3] text-[#854F0B]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

function fmtNT(n: number | null | undefined): string {
  if (n == null) return "—";
  return `NT$ ${Number(n).toLocaleString("en-US")}`;
}

function fmtMileage(n: number | null): string {
  if (n == null) return "—";
  return `${n.toLocaleString("en-US")} km`;
}

function fmtValidity(from: string | null, to: string | null): string {
  if (!from && !to) return "—";
  return `${from ?? "…"} ~ ${to ?? "…"}`;
}

/** ISO timestamp → 台北時間 yyyy-MM-dd HH:mm */
function fmtTaipei(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

const blankInput = (): ServicePackageInput => ({
  code: "",
  name: "",
  pkgType: "standard",
  mileageInterval: null,
  items: [],
  listPrice: null,
  validFrom: null,
  validTo: null,
});

const fromPackage = (p: ServicePackage): ServicePackageInput => ({
  code: p.code,
  name: p.name,
  pkgType: p.pkgType,
  mileageInterval: p.mileageInterval,
  items: p.items.map((it) => ({ ...it })),
  listPrice: p.listPrice,
  validFrom: p.validFrom,
  validTo: p.validTo,
});

export function ServicePackagesBoard({
  brand,
  packages,
  laborRates,
  audit,
  canEdit,
  policyMap,
  hasDesmo,
}: {
  brand: string;
  packages: ServicePackage[];
  laborRates: LaborRate[];
  audit: ServicePackageAuditEntry[];
  canEdit: boolean;
  /** G4：service_packages.pricing_policy_id → 集團定價政策摘要（顯示「受集團定價管控」徽章）。 */
  policyMap: Record<string, PricingPolicySummary>;
  /** brand_config.has_desmo：false（如 Indian）時工時費率表隱藏 Desmo Service 列。 */
  hasDesmo: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [tab, setTab] = useState<TabKey>("packages");

  const [formMode, setFormMode] = useState<FormMode>({ kind: "closed" });
  const [formDraft, setFormDraft] = useState<ServicePackageInput>(blankInput());

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  /* ──────── 套餐 CRUD ──────── */
  const openCreate = () => {
    setFormDraft(blankInput());
    setFormMode({ kind: "create" });
  };
  const openEdit = (p: ServicePackage) => {
    setFormDraft(fromPackage(p));
    setFormMode({ kind: "edit", id: p.id });
  };
  const closeForm = () => setFormMode({ kind: "closed" });

  const submitForm = () => {
    startTransition(async () => {
      const res =
        formMode.kind === "edit"
          ? await updateServicePackageAction(formMode.id, formDraft)
          : formMode.kind === "create"
            ? await createServicePackageAction(formDraft)
            : null;
      if (!res) return;
      if (res.ok) {
        showBanner({
          ok: true,
          msg: formMode.kind === "edit" ? "✓ 已儲存套餐變更" : "✓ 已新增套餐",
        });
        closeForm();
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const toggleActive = (p: ServicePackage) => {
    startTransition(async () => {
      const res = await setServicePackageActiveAction(p.id, !p.isActive);
      if (res.ok) {
        showBanner({ ok: true, msg: p.isActive ? "✓ 已停用套餐" : "✓ 已啟用套餐" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const deletePkg = (p: ServicePackage) => {
    if (
      !confirm(
        `確定刪除套餐「${p.code} ${p.name}」？此動作永久移除，無法復原。\n（一般建議改用「停用」保留歷史。）`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteServicePackageAction(p.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除套餐" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";
  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";

  const stats = useMemo(() => {
    const active = packages.filter((p) => p.isActive).length;
    return {
      total: packages.length,
      active,
      inactive: packages.length - active,
    };
  }, [packages]);

  const columns: DataGridColumn<ServicePackage>[] = [
    {
      id: "code",
      header: "代碼",
      width: 130,
      hideable: false,
      cell: (r) => (
        <span className="font-mono font-semibold text-[12px] text-[#1A3A5C]">{r.code}</span>
      ),
      exportValue: (r) => r.code,
      sortValue: (r) => r.code,
    },
    {
      id: "name",
      header: "名稱",
      cell: (r) => {
        const policy = r.pricingPolicyId ? policyMap[r.pricingPolicyId] : null;
        return (
          <span className="inline-flex items-center gap-1.5 flex-wrap">
            <span className="text-[12.5px] text-[#2C2C2A]">{r.name}</span>
            {r.pricingPolicyId && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5] whitespace-nowrap"
                title={
                  policy
                    ? `售價由集團定價政策「${policy.name}」管控`
                    : "售價由集團定價政策管控"
                }
              >
                🔗 受集團定價管控
              </span>
            )}
          </span>
        );
      },
      exportValue: (r) =>
        r.pricingPolicyId ? `${r.name}（受集團定價管控）` : r.name,
      sortValue: (r) => r.name,
    },
    {
      id: "pkgType",
      header: "類型",
      width: 100,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${pkgTypeChipClass(r.pkgType)}`}
        >
          {PKG_TYPE_LABEL[r.pkgType]}
        </span>
      ),
      exportValue: (r) => PKG_TYPE_LABEL[r.pkgType],
      sortValue: (r) => r.pkgType,
    },
    {
      id: "mileageInterval",
      header: "適用里程",
      width: 110,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12px] text-[#2C2C2A]">{fmtMileage(r.mileageInterval)}</span>
      ),
      exportValue: (r) => r.mileageInterval ?? null,
      sortValue: (r) => r.mileageInterval ?? null,
    },
    {
      id: "listPrice",
      header: "建議售價",
      width: 120,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12px] text-[#2C2C2A]">{fmtNT(r.listPrice)}</span>
      ),
      exportValue: (r) => r.listPrice ?? null,
      sortValue: (r) => r.listPrice ?? null,
    },
    {
      id: "validity",
      header: "有效期",
      width: 200,
      sortable: false,
      cell: (r) => (
        <span className="text-[12px] text-[#5A5955]">{fmtValidity(r.validFrom, r.validTo)}</span>
      ),
      exportValue: (r) => fmtValidity(r.validFrom, r.validTo),
    },
    {
      id: "isActive",
      header: "狀態",
      width: 80,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${
            r.isActive ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#F2F2F2] text-[#6B6A68]"
          }`}
        >
          {r.isActive ? "啟用" : "停用"}
        </span>
      ),
      exportValue: (r) => (r.isActive ? "啟用" : "停用"),
      sortValue: (r) => r.isActive,
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">服務套餐與費率設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">07B</span>
        <span className="text-[12px] text-[#9A9890]">售後主管後台 · 套餐主檔／工時費率／稽核</span>
      </header>

      {/* Tabs */}
      <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
        <div className="flex border-b border-[#EEECE6]">
          {([
            ["packages", "服務套餐主檔"],
            ["rates", "工時費率表"],
            ["audit", "稽核日誌"],
          ] as Array<[TabKey, string]>).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r last:border-r-0 border-[#EEECE6] ${
                tab === k
                  ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                  : "text-[#5A5955] hover:bg-[#F8F7F4]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
        {tab === "packages" && (
          <PackagesTab
            packages={packages}
            columns={columns}
            stats={stats}
            canEdit={canEdit}
            isPending={isPending}
            onCreate={openCreate}
            onEdit={openEdit}
            onToggle={toggleActive}
            onDelete={deletePkg}
          />
        )}
        {tab === "rates" && (
          <RatesTab
            brand={brand}
            laborRates={laborRates}
            canEdit={canEdit}
            isPending={isPending}
            startTransition={startTransition}
            showBanner={showBanner}
            router={router}
            hasDesmo={hasDesmo}
          />
        )}
        {tab === "audit" && <AuditTab audit={audit} />}
      </div>

      {/* Banner */}
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

      {/* Create / Edit Modal */}
      {formMode.kind !== "closed" ? (
        <PackageFormModal
          mode={formMode.kind}
          draft={formDraft}
          setDraft={setFormDraft}
          onClose={closeForm}
          onSubmit={submitForm}
          isPending={isPending}
          canEdit={canEdit}
          inputClass={inputClass}
          lockedClass={lockedClass}
        />
      ) : null}
    </main>
  );
}

/* ════════════════ Tab A：服務套餐主檔 ════════════════ */

function PackagesTab({
  packages,
  columns,
  stats,
  canEdit,
  isPending,
  onCreate,
  onEdit,
  onToggle,
  onDelete,
}: {
  packages: ServicePackage[];
  columns: DataGridColumn<ServicePackage>[];
  stats: { total: number; active: number; inactive: number };
  canEdit: boolean;
  isPending: boolean;
  onCreate: () => void;
  onEdit: (p: ServicePackage) => void;
  onToggle: (p: ServicePackage) => void;
  onDelete: (p: ServicePackage) => void;
}) {
  return (
    <>
      {/* Filter / action bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] text-[#9A9890]">
            共 <b className="text-[#2C2C2A]">{stats.total}</b> 個套餐（啟用{" "}
            <b className="text-[#3B6D11]">{stats.active}</b> · 停用{" "}
            <b className="text-[#6B6A68]">{stats.inactive}</b>）
          </span>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              disabled={!canEdit}
              onClick={onCreate}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增套餐
            </button>
          </div>
        </div>
      </section>

      <DataGrid
        columns={columns}
        data={packages}
        rowKey={(r) => r.id}
        persistKey="aftersales/service-packages"
        exportFileName="service-packages"
        disabled={isPending}
        emptyMessage="尚無服務套餐，點「＋ 新增套餐」建立"
        rowActionsWidth={210}
        rowActions={(r) => (
          <>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => onEdit(r)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              編輯
            </button>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => onToggle(r)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              {r.isActive ? "停用" : "啟用"}
            </button>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => onDelete(r)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
            >
              刪除
            </button>
          </>
        )}
      />
    </>
  );
}

/* ════════════════ Tab B：工時費率表 ════════════════ */

function RatesTab({
  brand,
  laborRates,
  canEdit,
  isPending,
  startTransition,
  showBanner,
  router,
  hasDesmo,
}: {
  brand: string;
  laborRates: LaborRate[];
  canEdit: boolean;
  isPending: boolean;
  startTransition: (cb: () => void) => void;
  showBanner: (b: Banner) => void;
  router: ReturnType<typeof useRouter>;
  hasDesmo: boolean;
}) {
  const rateMap = useMemo(() => {
    const m = new Map<string, LaborRate>();
    for (const r of laborRates) m.set(r.bizType, r);
    return m;
  }, [laborRates]);
  // brand_config.has_desmo=false（如 Indian）時隱藏 Desmo Service 工時費率列。
  const bizTypes = useMemo(
    () => (hasDesmo ? BIZ_TYPES : BIZ_TYPES.filter((bt) => bt.code !== "Desmo")),
    [hasDesmo],
  );

  return (
    <>
      <div className="bg-[#FDF3E3] border border-[#F0C97E] rounded-lg px-4 py-2.5 text-[12px] text-[#854F0B]">
        ⚠️ 費率變更將即時影響 04B 快速報價查詢的報價計算，所有修改都會寫入「稽核日誌」。
        <span className="ml-1">
          目前品牌：<b>{brand}</b>（labor_rates 雙品牌各一套，本頁只管當前 scope brand）。
        </span>
      </div>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 標準工時費率（NT$/LU）</span>
        </header>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#EEECE6]">
              <th className="text-left px-4 py-2 text-[11px] text-[#9A9890] font-medium w-[160px]">業務類型</th>
              <th className="text-left px-4 py-2 text-[11px] text-[#9A9890] font-medium">說明</th>
              <th className="text-right px-4 py-2 text-[11px] text-[#9A9890] font-medium w-[180px]">費率（NT$/LU）</th>
            </tr>
          </thead>
          <tbody>
            {bizTypes.map((bt) => (
              <RateRow
                key={bt.code}
                bizType={bt.code}
                label={bt.label}
                desc={bt.desc}
                current={rateMap.get(bt.code) ?? null}
                canEdit={canEdit}
                isPending={isPending}
                startTransition={startTransition}
                showBanner={showBanner}
                router={router}
              />
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function RateRow({
  bizType,
  label,
  desc,
  current,
  canEdit,
  isPending,
  startTransition,
  showBanner,
  router,
}: {
  bizType: string;
  label: string;
  desc: string;
  current: LaborRate | null;
  canEdit: boolean;
  isPending: boolean;
  startTransition: (cb: () => void) => void;
  showBanner: (b: Banner) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState<string>(current ? String(current.ratePerLu) : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const display = current ? fmtNT(current.ratePerLu) : "— 未設定";

  const start = () => {
    if (!canEdit) return;
    setVal(current ? String(current.ratePerLu) : "");
    setErr(null);
    setEditing(true);
  };

  const save = () => {
    const num = Number(val);
    if (!(num >= 0) || Number.isNaN(num)) {
      setErr("費率需為非負數");
      return;
    }
    // 沒改值直接收掉
    if (current && num === current.ratePerLu) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setErr(null);
    startTransition(async () => {
      const res = await upsertLaborRateAction(bizType, num);
      setSaving(false);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已更新 ${bizType} 費率` });
        setEditing(false);
        router.refresh();
      } else {
        setErr(res.error);
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  return (
    <tr className="border-b border-[#F4F3F0] last:border-b-0 hover:bg-[#FAFAF8]">
      <td className="px-4 py-2.5">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EBF3FF] text-[#1A3A5C]">
          {label}
        </span>
      </td>
      <td className="px-4 py-2.5 text-[12px] text-[#5A5955]">{desc}</td>
      <td className="px-4 py-2.5 text-right align-top">
        {editing ? (
          <div className="inline-flex flex-col items-end gap-1">
            <div className="inline-flex items-center gap-1.5">
              <input
                type="number"
                autoFocus
                value={val}
                disabled={saving}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") setEditing(false);
                }}
                className="h-[28px] w-[110px] border border-[#185FA5] rounded px-2 text-[12.5px] text-right font-mono outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="h-[28px] px-2.5 rounded text-[11.5px] bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                {saving ? "儲存中…" : "存"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="h-[28px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955]"
              >
                取消
              </button>
            </div>
            {err ? <div className="text-[11px] text-[#CC0000]">{err}</div> : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={!canEdit || isPending}
            title={canEdit ? "點擊編輯費率" : "無編輯權限"}
            className={`font-mono text-[12.5px] px-2 py-1 rounded ${
              canEdit
                ? "text-[#1A3A5C] hover:bg-[#EAF4FB] cursor-pointer"
                : "text-[#5A5955] cursor-default"
            } disabled:opacity-60`}
          >
            {display}
          </button>
        )}
      </td>
    </tr>
  );
}

/* ════════════════ Tab C：稽核日誌 ════════════════ */

function AuditTab({ audit }: { audit: ServicePackageAuditEntry[] }) {
  const dotClass = (action: ServicePackageAuditEntry["action"]) => {
    switch (action) {
      case "add":
        return "bg-[#0F6E56]";
      case "modify":
        return "bg-[#185FA5]";
      case "deactivate":
        return "bg-[#9A9890]";
      case "reactivate":
        return "bg-[#3B6D11]";
      default:
        return "bg-[#9A9890]";
    }
  };
  const actionLabel = (action: ServicePackageAuditEntry["action"]) => {
    switch (action) {
      case "add":
        return "新增";
      case "modify":
        return "修改";
      case "deactivate":
        return "停用";
      case "reactivate":
        return "啟用";
      default:
        return action;
    }
  };
  const entityLabel = (e: ServicePackageAuditEntry["entity"]) =>
    e === "labor_rate" ? "工時費率" : "套餐";

  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 費率／套餐變更稽核日誌</span>
      </header>
      <div className="px-4 py-3">
        {audit.length === 0 ? (
          <div className="text-[12px] text-[#9A9890] py-6 text-center">尚無變更紀錄</div>
        ) : (
          <ul className="space-y-0">
            {audit.map((e) => (
              <li key={e.id} className="flex items-start gap-3 py-2.5 border-b border-[#F4F3F0] last:border-b-0">
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dotClass(e.action)}`} />
                <span className="text-[11px] text-[#9A9890] font-mono whitespace-nowrap min-w-[120px] mt-0.5">
                  {fmtTaipei(e.at)}
                </span>
                <div className="text-[12px] text-[#2C2C2A] leading-relaxed">
                  <b>{actionLabel(e.action)}</b>
                  <span className="text-[#5A5955]">
                    {" "}
                    ｜ {entityLabel(e.entity)}：{e.entityName}
                  </span>
                  {e.by ? <span className="text-[#9A9890]"> ｜ 操作人：{e.by}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ════════════════ 新增 / 編輯套餐 Modal ════════════════ */

function PackageFormModal({
  mode,
  draft,
  setDraft,
  onClose,
  onSubmit,
  isPending,
  canEdit,
  inputClass,
  lockedClass,
}: {
  mode: "create" | "edit";
  draft: ServicePackageInput;
  setDraft: (d: ServicePackageInput) => void;
  onClose: () => void;
  onSubmit: () => void;
  isPending: boolean;
  canEdit: boolean;
  inputClass: string;
  lockedClass: string;
}) {
  const items = draft.items ?? [];

  const updateItem = (idx: number, patch: Partial<ServicePackageItem>) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    setDraft({ ...draft, items: next });
  };
  const addItem = (kind: ServicePackageItem["kind"]) => {
    setDraft({
      ...draft,
      items: [...items, { kind, name: "", qty: kind === "part" ? 1 : undefined, lu: kind === "labor" ? undefined : undefined, price: undefined }],
    });
  };
  const removeItem = (idx: number) => {
    setDraft({ ...draft, items: items.filter((_, i) => i !== idx) });
  };

  return (
    <Modal title={mode === "edit" ? "編輯服務套餐" : "新增服務套餐"} onClose={onClose}>
      <div className={`space-y-4 ${lockedClass}`}>
        {/* 基本資訊 */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="套餐代碼 *">
            <input
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              className={inputClass}
              placeholder="例：PKG-MN-10000"
              disabled={mode === "edit"}
            />
          </Field>
          <Field label="套餐名稱 *">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={inputClass}
              placeholder="例：10000km 定期保養套餐"
            />
          </Field>
          <Field label="套餐類型 *">
            <select
              value={draft.pkgType}
              onChange={(e) => setDraft({ ...draft, pkgType: e.target.value as ServicePackageInput["pkgType"] })}
              className={inputClass}
            >
              <option value="standard">原廠標準套餐</option>
              <option value="store_custom">門店自訂套餐</option>
              <option value="promo">限時促銷套餐</option>
            </select>
          </Field>
          <Field label="適用里程 (km)">
            <input
              type="number"
              value={draft.mileageInterval ?? ""}
              onChange={(e) => setDraft({ ...draft, mileageInterval: e.target.value ? Number(e.target.value) : null })}
              className={inputClass}
              placeholder="例：10000"
            />
          </Field>
          <Field label="建議售價 (NT$)">
            <input
              type="number"
              value={draft.listPrice ?? ""}
              onChange={(e) => setDraft({ ...draft, listPrice: e.target.value ? Number(e.target.value) : null })}
              className={inputClass}
              placeholder="例：6800"
            />
          </Field>
          <Field label="有效起日">
            <input
              type="date"
              value={draft.validFrom ?? ""}
              onChange={(e) => setDraft({ ...draft, validFrom: e.target.value || null })}
              className={inputClass}
            />
          </Field>
          <Field label="有效迄日">
            <input
              type="date"
              value={draft.validTo ?? ""}
              onChange={(e) => setDraft({ ...draft, validTo: e.target.value || null })}
              className={inputClass}
            />
          </Field>
        </div>

        {/* 工項 / 零件清單 */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[12px] font-semibold text-[#2C2C2A]">工項 / 零件清單</span>
            <span className="text-[11px] text-[#9A9890]">共 {items.length} 項</span>
            <div className="ml-auto flex gap-1.5">
              <button
                type="button"
                onClick={() => addItem("labor")}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                ＋ 工項
              </button>
              <button
                type="button"
                onClick={() => addItem("part")}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                ＋ 零件
              </button>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="text-[11.5px] text-[#9A9890] border border-dashed border-[#D5D3CB] rounded px-3 py-3 text-center">
              尚無工項／零件，點右上「＋ 工項」或「＋ 零件」加入
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="grid grid-cols-[70px_1fr_70px_90px_28px] gap-2 px-1 text-[10.5px] text-[#9A9890] font-medium">
                <div>類別</div>
                <div>名稱</div>
                <div>數量/LU</div>
                <div className="text-right">單價/工資</div>
                <div></div>
              </div>
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-[70px_1fr_70px_90px_28px] gap-2 items-center">
                  <select
                    value={it.kind}
                    onChange={(e) => updateItem(idx, { kind: e.target.value as ServicePackageItem["kind"] })}
                    className="h-[28px] border border-[#D5D3CB] rounded px-1.5 text-[11.5px] bg-white outline-none focus:border-[#185FA5]"
                  >
                    <option value="labor">工項</option>
                    <option value="part">零件</option>
                  </select>
                  <input
                    value={it.name}
                    onChange={(e) => updateItem(idx, { name: e.target.value })}
                    className="h-[28px] border border-[#D5D3CB] rounded px-2 text-[12px] outline-none focus:border-[#185FA5]"
                    placeholder={it.kind === "labor" ? "工項名稱（如：機油更換）" : "零件名稱"}
                  />
                  <input
                    type="number"
                    value={it.kind === "labor" ? (it.lu ?? "") : (it.qty ?? "")}
                    onChange={(e) => {
                      const v = e.target.value ? Number(e.target.value) : undefined;
                      updateItem(idx, it.kind === "labor" ? { lu: v } : { qty: v });
                    }}
                    className="h-[28px] border border-[#D5D3CB] rounded px-2 text-[12px] text-right font-mono outline-none focus:border-[#185FA5]"
                    placeholder={it.kind === "labor" ? "LU" : "數量"}
                  />
                  <input
                    type="number"
                    value={it.price ?? ""}
                    onChange={(e) => updateItem(idx, { price: e.target.value ? Number(e.target.value) : undefined })}
                    className="h-[28px] border border-[#D5D3CB] rounded px-2 text-[12px] text-right font-mono outline-none focus:border-[#185FA5]"
                    placeholder="NT$"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="h-[28px] w-[28px] rounded text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                    title="移除此列"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955]">
          取消
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isPending || !canEdit}
          className="h-[30px] px-3.5 rounded text-[12.5px] bg-[#0F6E56] text-white disabled:opacity-60"
        >
          {isPending ? (mode === "edit" ? "儲存中…" : "建立中…") : mode === "edit" ? "儲存變更" : "建立"}
        </button>
      </div>
    </Modal>
  );
}

/* ──────── 小元件 ──────── */

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-[#EEECE6] flex items-center">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">{title}</h2>
          <button type="button" onClick={onClose} className="ml-auto w-7 h-7 rounded hover:bg-[#F8F7F4] text-[#9A9890] text-[18px] leading-none">
            ×
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 ${full ? "col-span-2" : ""}`}>
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      {children}
    </div>
  );
}
