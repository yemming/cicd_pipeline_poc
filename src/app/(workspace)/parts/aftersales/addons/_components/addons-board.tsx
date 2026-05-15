"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  type AddonsListFilter,
  type AddonsSummary,
  type CustomerDecision,
  type RepairOrderAddonWithRo,
  type SafetyLevel,
} from "@/domain/repair-order-addons";
import {
  cancelAddonAction,
  createAddonAction,
  decideAddonAction,
  type AddonInput,
  type ConfirmMethod,
} from "@/lib/aftersales/repair-order-addon-actions";

type Banner = { ok: boolean; msg: string } | null;

const decisionLabel: Record<string, string> = {
  pending: "待確認",
  agreed: "車主同意",
  deferred: "暫緩",
  rejected: "拒絕",
  cancelled: "已取消",
};

const decisionChip: Record<string, string> = {
  pending: "bg-[#FDF3E3] text-[#854F0B]",
  agreed: "bg-[#EAF3DE] text-[#3B6D11]",
  deferred: "bg-[#EAF4FB] text-[#185FA5]",
  rejected: "bg-[#FDECEA] text-[#CC0000]",
  cancelled: "bg-[#F2F2F2] text-[#6B6A68]",
};

const safetyLabel: Record<SafetyLevel, string> = {
  normal: "一般建議",
  safety_related: "⚠️ 安全相關",
  safety_critical: "🔴 安全警示",
};

const safetyChip: Record<SafetyLevel, string> = {
  normal: "bg-[#F2F2F2] text-[#6B6A68]",
  safety_related: "bg-[#FDF3E3] text-[#854F0B]",
  safety_critical: "bg-[#FDECEA] text-[#CC0000]",
};

const typeLabel: Record<string, string> = {
  labor: "工項",
  parts: "零件",
  labor_and_parts: "零件+工",
};

const confirmLabel: Record<string, string> = {
  phone: "電話口頭",
  onsite: "現場本人",
  line: "Line 文字",
};

type RoOption = {
  id: string;
  ro_code: string;
  status: string;
  customer_name: string | null;
};

export function AddonsBoard({
  rows,
  summary,
  filter,
  canEdit,
  roOptions,
}: {
  rows: RepairOrderAddonWithRo[];
  summary: AddonsSummary;
  filter: AddonsListFilter;
  canEdit: boolean;
  roOptions: RoOption[];
}) {
  useSetPageHeader({
    title: "追加項目記錄",
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "追加項目記錄" },
    ],
    hideSearch: true,
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [decideTarget, setDecideTarget] = useState<RepairOrderAddonWithRo | null>(null);
  const [creating, setCreating] = useState(false);

  // filter inputs（local state，按「查詢」才推 URL）
  const [decisionLocal, setDecisionLocal] = useState<CustomerDecision | "all">(
    (filter.decision as CustomerDecision | "all" | undefined) ?? "all",
  );
  const [safetyLocal, setSafetyLocal] = useState<SafetyLevel | "all">(
    (filter.safetyLevel as SafetyLevel | "all" | undefined) ?? "all",
  );
  const [roIdLocal, setRoIdLocal] = useState(filter.roId ?? "");
  const [qLocal, setQLocal] = useState(filter.q ?? "");

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const submitFilter = () => {
    const sp = new URLSearchParams();
    if (decisionLocal && decisionLocal !== "all") sp.set("decision", String(decisionLocal));
    if (safetyLocal && safetyLocal !== "all") sp.set("safety", String(safetyLocal));
    if (roIdLocal) sp.set("ro_id", roIdLocal);
    if (qLocal) sp.set("q", qLocal);
    startTransition(() => router.push(`/parts/aftersales/addons?${sp.toString()}`));
  };

  const resetFilter = () => {
    setDecisionLocal("all");
    setSafetyLocal("all");
    setRoIdLocal("");
    setQLocal("");
    startTransition(() => router.push("/parts/aftersales/addons"));
  };

  const handleCancel = (id: string) => {
    if (!confirm("確認取消此追加項目？只有待確認的可取消。")) return;
    startTransition(async () => {
      const r = await cancelAddonAction(id);
      if (r.ok) {
        showBanner({ ok: true, msg: "✓ 已取消" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: r.error });
      }
    });
  };

  const columns: DataGridColumn<RepairOrderAddonWithRo>[] = useMemo(
    () => [
      {
        id: "ro",
        header: "工單",
        width: 160,
        hideable: false,
        cell: (r) => (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono font-semibold text-[#1A3A5C] text-[12px]">
              {r.ro?.ro_code ?? "—"}
            </span>
            <span className="text-[11px] text-[#9A9890]">
              {r.ro?.customer_name ?? ""} {r.ro?.vehicle_license_plate ?? ""}
            </span>
          </div>
        ),
        exportValue: (r) => r.ro?.ro_code ?? "",
        sortValue: (r) => r.ro?.ro_code ?? "",
      },
      {
        id: "addon_no",
        header: "#",
        width: 50,
        cell: (r) => <span className="font-mono text-[#5A5955]">#{r.addon_no}</span>,
        exportValue: (r) => `#${r.addon_no}`,
        sortValue: (r) => r.addon_no,
      },
      {
        id: "name",
        header: "項目名稱",
        width: 220,
        cell: (r) => (
          <div className="flex flex-col">
            <span className="text-[#2C2C2A]">{r.name}</span>
            {r.tech_reason && (
              <span className="text-[11px] text-[#9A9890] line-clamp-1">{r.tech_reason}</span>
            )}
          </div>
        ),
        exportValue: (r) => r.name,
      },
      {
        id: "addon_type",
        header: "類型",
        width: 90,
        cell: (r) => (
          <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
            {typeLabel[r.addon_type] ?? r.addon_type}
          </span>
        ),
        exportValue: (r) => typeLabel[r.addon_type] ?? r.addon_type,
      },
      {
        id: "safety_level",
        header: "安全等級",
        width: 120,
        cell: (r) => (
          <span
            className={`px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${safetyChip[r.safety_level]}`}
          >
            {safetyLabel[r.safety_level]}
          </span>
        ),
        exportValue: (r) => safetyLabel[r.safety_level],
      },
      {
        id: "estimated_fee",
        header: "估計費用",
        width: 100,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[#2C2C2A]">
            NT$ {Number(r.estimated_fee).toLocaleString()}
          </span>
        ),
        exportValue: (r) => Number(r.estimated_fee),
        sortValue: (r) => Number(r.estimated_fee),
      },
      {
        id: "confirm_method",
        header: "確認方式",
        width: 90,
        cell: (r) =>
          r.confirm_method ? (
            <span className="text-[11.5px] text-[#5A5955]">{confirmLabel[r.confirm_method]}</span>
          ) : (
            <span className="text-[11.5px] text-[#9A9890]">—</span>
          ),
        exportValue: (r) => (r.confirm_method ? confirmLabel[r.confirm_method] : ""),
      },
      {
        id: "customer_decision",
        header: "決策",
        width: 90,
        cell: (r) => (
          <span
            className={`px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${decisionChip[r.customer_decision]}`}
          >
            {decisionLabel[r.customer_decision] ?? r.customer_decision}
          </span>
        ),
        exportValue: (r) => decisionLabel[r.customer_decision] ?? r.customer_decision,
      },
      {
        id: "followup",
        header: "閉環",
        width: 70,
        sortable: false,
        cell: (r) => {
          const meta = (r.metadata ?? {}) as Record<string, unknown>;
          return meta.requires_followup ? (
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDECEA] text-[#CC0000]">
              待追蹤
            </span>
          ) : (
            <span className="text-[11px] text-[#9A9890]">—</span>
          );
        },
        exportValue: (r) =>
          ((r.metadata ?? {}) as Record<string, unknown>).requires_followup ? "待追蹤" : "",
      },
      {
        id: "proposed_at",
        header: "提議時間",
        width: 130,
        cell: (r) => (
          <span className="text-[11.5px] text-[#5A5955]">
            {new Date(r.proposed_at).toLocaleString("zh-TW", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        ),
        exportValue: (r) => new Date(r.proposed_at).toLocaleString("zh-TW"),
        sortValue: (r) => new Date(r.proposed_at).getTime(),
      },
    ],
    [],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">追加項目記錄</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          售後・Phase 4.5
        </span>
        <span className="text-[12px] text-[#9A9890]">
          技師發現 → 車主決策 → 同意寫進 RO，拒絕/暫緩+安全 → 增項閉環
        </span>
      </header>

      {/* KPI summary */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3 grid grid-cols-2 md:grid-cols-6 gap-x-4 gap-y-2">
        <Kpi label="總筆數" value={summary.total} />
        <Kpi label="待確認" value={summary.pending} accent="amber" />
        <Kpi label="已同意" value={summary.agreed} accent="green" />
        <Kpi label="已拒絕" value={summary.rejected} accent="red" />
        <Kpi label="同意金額" value={`NT$ ${summary.agreedAmount.toLocaleString()}`} />
        <Kpi label="待追蹤" value={summary.followupNeeded} accent="red" />
      </section>

      {/* Banner */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">決策狀態</label>
            <select
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
              value={decisionLocal ?? "all"}
              onChange={(e) => setDecisionLocal(e.target.value as CustomerDecision | "all")}
            >
              <option value="all">全部</option>
              <option value="pending">待確認</option>
              <option value="agreed">車主同意</option>
              <option value="deferred">暫緩</option>
              <option value="rejected">拒絕</option>
              <option value="cancelled">已取消</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">安全等級</label>
            <select
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
              value={safetyLocal ?? "all"}
              onChange={(e) => setSafetyLocal(e.target.value as SafetyLevel | "all")}
            >
              <option value="all">全部</option>
              <option value="normal">一般建議</option>
              <option value="safety_related">⚠️ 安全相關</option>
              <option value="safety_critical">🔴 安全警示</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">指定工單</label>
            <select
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] min-w-[200px]"
              value={roIdLocal}
              onChange={(e) => setRoIdLocal(e.target.value)}
            >
              <option value="">全部工單</option>
              {roOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.ro_code} ({r.status}) {r.customer_name ?? ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">搜尋項目名稱</label>
            <input
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
              value={qLocal}
              onChange={(e) => setQLocal(e.target.value)}
              placeholder="例：避震 / 煞車"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={submitFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                ＋ 新增追加項目
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆追加項目
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/aftersales/addons"
        exportFileName="repair-order-addons"
        emptyMessage="目前沒有符合條件的追加項目"
        disabled={isPending}
        rowActionsWidth={canEdit ? 250 : 130}
        rowActions={(r) => (
          <>
            <Link
              href={`/parts/aftersales/repair-orders/${r.ro_id}/lines`}
              className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              查工單
            </Link>
            {canEdit && r.customer_decision === "pending" && (
              <>
                <button
                  type="button"
                  onClick={() => setDecideTarget(r)}
                  disabled={isPending}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
                >
                  決策
                </button>
                <button
                  type="button"
                  onClick={() => handleCancel(r.id)}
                  disabled={isPending}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                >
                  取消
                </button>
              </>
            )}
          </>
        )}
      />

      {/* Decide Modal */}
      {decideTarget && (
        <DecideModal
          target={decideTarget}
          onClose={() => setDecideTarget(null)}
          onDone={(b) => {
            showBanner(b);
            setDecideTarget(null);
            router.refresh();
          }}
        />
      )}

      {/* Create Modal */}
      {creating && (
        <CreateModal
          roOptions={roOptions}
          onClose={() => setCreating(false)}
          onDone={(b) => {
            showBanner(b);
            setCreating(false);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "amber" | "green" | "red";
}) {
  const color =
    accent === "amber"
      ? "text-[#854F0B]"
      : accent === "green"
        ? "text-[#3B6D11]"
        : accent === "red"
          ? "text-[#CC0000]"
          : "text-[#2C2C2A]";
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-[#9A9890]">{label}</span>
      <span className={`text-[15px] font-semibold ${color}`}>{value}</span>
    </div>
  );
}

function CreateModal({
  roOptions,
  onClose,
  onDone,
}: {
  roOptions: RoOption[];
  onClose: () => void;
  onDone: (b: { ok: boolean; msg: string }) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<AddonInput>({
    ro_id: roOptions[0]?.id ?? "",
    name: "",
    addon_type: "labor_and_parts",
    safety_level: "normal",
    estimated_fee: 0,
    tech_reason: "",
    confirm_method: "phone",
  });

  const submit = () => {
    startTransition(async () => {
      const r = await createAddonAction(form);
      onDone(r.ok ? { ok: true, msg: "✓ 已新增追加項目" } : { ok: false, msg: r.error });
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-[640px] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[14px] font-semibold text-[#2C2C2A] mb-3">＋ 新增追加項目</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="工單" full>
            <select
              className={inputClass}
              value={form.ro_id}
              onChange={(e) => setForm({ ...form, ro_id: e.target.value })}
              disabled={pending}
            >
              {roOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.ro_code} ({r.status}) {r.customer_name ?? ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="項目名稱" full>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例：後避震器油封更換"
              disabled={pending}
            />
          </Field>
          <Field label="類型">
            <select
              className={inputClass}
              value={form.addon_type}
              onChange={(e) => setForm({ ...form, addon_type: e.target.value as AddonInput["addon_type"] })}
              disabled={pending}
            >
              <option value="labor">工項</option>
              <option value="parts">零件</option>
              <option value="labor_and_parts">零件+工</option>
            </select>
          </Field>
          <Field label="安全等級">
            <select
              className={inputClass}
              value={form.safety_level}
              onChange={(e) =>
                setForm({ ...form, safety_level: e.target.value as AddonInput["safety_level"] })
              }
              disabled={pending}
            >
              <option value="normal">一般建議</option>
              <option value="safety_related">⚠️ 安全相關</option>
              <option value="safety_critical">🔴 安全警示</option>
            </select>
          </Field>
          <Field label="估計費用 (NT$)">
            <input
              type="number"
              className={inputClass}
              value={form.estimated_fee}
              onChange={(e) => setForm({ ...form, estimated_fee: Number(e.target.value) })}
              disabled={pending}
            />
          </Field>
          <Field label="預設確認方式">
            <select
              className={inputClass}
              value={form.confirm_method ?? ""}
              onChange={(e) =>
                setForm({ ...form, confirm_method: (e.target.value || null) as ConfirmMethod | null })
              }
              disabled={pending}
            >
              <option value="phone">電話口頭</option>
              <option value="onsite">現場本人</option>
              <option value="line">Line 文字</option>
            </select>
          </Field>
          <Field label="技師說明" full>
            <textarea
              className={`${inputClass} h-[60px] py-1.5`}
              value={form.tech_reason ?? ""}
              onChange={(e) => setForm({ ...form, tech_reason: e.target.value })}
              placeholder="簡短說明原因"
              disabled={pending}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !form.ro_id || !form.name.trim()}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            {pending ? "建立中⋯" : "送出追加項目"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DecideModal({
  target,
  onClose,
  onDone,
}: {
  target: RepairOrderAddonWithRo;
  onClose: () => void;
  onDone: (b: { ok: boolean; msg: string }) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [decision, setDecision] = useState<"agreed" | "deferred" | "rejected">("agreed");
  const [confirmMethod, setConfirmMethod] = useState<ConfirmMethod>(
    target.confirm_method ?? "phone",
  );
  const [note, setNote] = useState("");

  const submit = () => {
    startTransition(async () => {
      const r = await decideAddonAction(target.id, {
        customer_decision: decision,
        confirm_method: confirmMethod,
        decision_note: note,
      });
      const msg =
        decision === "agreed"
          ? "✓ 車主已同意，已寫入維修明細"
          : decision === "deferred"
            ? "✓ 已標記為暫緩"
            : "✓ 已標記為拒絕";
      onDone(r.ok ? { ok: true, msg } : { ok: false, msg: r.error });
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-[560px] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[14px] font-semibold text-[#2C2C2A] mb-1">
          車主決策 — {target.name}
        </h2>
        <p className="text-[11.5px] text-[#9A9890] mb-3">
          工單 {target.ro?.ro_code ?? "—"} ・ {typeLabel[target.addon_type]} ・{" "}
          {safetyLabel[target.safety_level]} ・ 估價 NT$ {Number(target.estimated_fee).toLocaleString()}
        </p>

        <div className="mb-3">
          <label className="text-[11px] text-[#9A9890] font-medium block mb-1.5">決策</label>
          <div className="flex gap-2 flex-wrap">
            <DecideRadio
              cur={decision}
              val="agreed"
              onChange={setDecision}
              label="✅ 車主同意"
              activeClass="bg-[#0F6E56] text-white border-[#0F6E56]"
            />
            <DecideRadio
              cur={decision}
              val="deferred"
              onChange={setDecision}
              label="⏸ 暫緩"
              activeClass="bg-[#854F0B] text-white border-[#854F0B]"
            />
            <DecideRadio
              cur={decision}
              val="rejected"
              onChange={setDecision}
              label="❌ 拒絕（→ 增項閉環）"
              activeClass="bg-[#CC0000] text-white border-[#CC0000]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="確認方式">
            <select
              className={inputClass}
              value={confirmMethod}
              onChange={(e) => setConfirmMethod(e.target.value as ConfirmMethod)}
              disabled={pending}
            >
              <option value="phone">電話口頭</option>
              <option value="onsite">現場本人</option>
              <option value="line">Line 文字</option>
            </select>
          </Field>
          <Field label="決策備註" full>
            <input
              className={inputClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例：車主表示下次再處理"
              disabled={pending}
            />
          </Field>
        </div>

        {decision === "agreed" && (
          <p className="mt-3 text-[11.5px] text-[#3B6D11] bg-[#EAF3DE] border border-[#C5DC9F] rounded px-2.5 py-1.5">
            同意後將自動寫入工單明細（{typeLabel[target.addon_type]}），可至「維修明細」頁查看。
          </p>
        )}
        {decision !== "agreed" && target.safety_level !== "normal" && (
          <p className="mt-3 text-[11.5px] text-[#CC0000] bg-[#FDECEA] border border-[#F5AEAD] rounded px-2.5 py-1.5">
            此項屬「{safetyLabel[target.safety_level]}」，將自動標記為「待追蹤」進入增項閉環看板。
          </p>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
          >
            {pending ? "送出中⋯" : "送出決策"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DecideRadio({
  cur,
  val,
  onChange,
  label,
  activeClass,
}: {
  cur: string;
  val: "agreed" | "deferred" | "rejected";
  onChange: (v: "agreed" | "deferred" | "rejected") => void;
  label: string;
  activeClass: string;
}) {
  const active = cur === val;
  return (
    <button
      type="button"
      onClick={() => onChange(val)}
      className={`h-[30px] px-3 rounded-full text-[12px] border ${
        active ? activeClass : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
      }`}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${full ? "col-span-2" : ""}`}>
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none disabled:bg-[#F8F7F4]";
