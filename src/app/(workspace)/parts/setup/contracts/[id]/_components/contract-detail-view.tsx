"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { KpiCard } from "@/components/visualization";
import { GaugeChart } from "@/components/charts";

import {
  createContract,
  updateContract,
  softDeleteContract,
  extendContract,
  type ContractWithSupplier,
  type ContractHistoryRow,
  type ContractWriteInput,
  type SupplierOption,
} from "@/domain/contracts";

type Mode = "view" | "edit" | "create";
type Banner = { ok: boolean; msg: string } | null;
type TabKey = "history";

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  valid: { label: "有效", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  expiring: { label: "即將到期", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  expired: { label: "已到期", chip: "bg-[#FDECEA] text-[#CC0000]" },
  none: { label: "未生效", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  terminated: { label: "已失效（歷史）", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
};

const TYPE_LABEL: Record<string, { label: string; chip: string }> = {
  annual: { label: "年度合約", chip: "bg-[#EBF3FF] text-[#1A3A5C]" },
  framework: { label: "框架合約", chip: "bg-[#E8F5F0] text-[#0F6E56]" },
  one_off: { label: "單次合約", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
};

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "annual", label: "年度合約" },
  { value: "framework", label: "框架合約" },
  { value: "one_off", label: "單次合約" },
];

function formatDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

function formatAmount(n: number | null): string {
  if (n === null) return "無上限";
  return `NT$ ${n.toLocaleString("en-US")}`;
}

function todayPlusYearsISO(years: number, from?: string | null): string {
  const base = from ? new Date(from) : new Date();
  base.setFullYear(base.getFullYear() + years);
  return base.toISOString().slice(0, 10);
}

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full disabled:bg-[#F8F7F4] disabled:text-[#9A9890]";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

export function ContractDetailView({
  contract,
  history,
  supplierOptions,
  canEdit,
  initialMode,
  preselectedSupplierId,
}: {
  contract: ContractWithSupplier | null;
  history: ContractHistoryRow[];
  supplierOptions: SupplierOption[];
  canEdit: boolean;
  initialMode: Mode;
  preselectedSupplierId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [banner, setBanner] = useState<Banner>(null);
  const [tab, setTab] = useState<TabKey>("history");

  const [form, setForm] = useState<ContractWriteInput>(() => ({
    supplier_id: contract?.supplier_id ?? preselectedSupplierId ?? "",
    contract_no: contract?.contract_no ?? "",
    effective_from: contract?.effective_from ?? new Date().toISOString().slice(0, 10),
    effective_to: contract?.effective_to ?? "",
    contract_type: contract?.contract_type ?? "annual",
    amount_limit: contract?.amount_limit ?? "",
    payment_terms: contract?.payment_terms ?? "",
    min_order_amount: contract?.min_order_amount ?? "",
    document_url: contract?.document_url ?? "",
    notes: contract?.notes ?? "",
  }));

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function patch<K extends keyof ContractWriteInput>(
    key: K,
    value: ContractWriteInput[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function cancelEdit() {
    if (mode === "create") {
      router.push("/parts/setup/contracts");
      return;
    }
    if (contract) {
      setForm({
        supplier_id: contract.supplier_id ?? "",
        contract_no: contract.contract_no ?? "",
        effective_from: contract.effective_from ?? "",
        effective_to: contract.effective_to ?? "",
        contract_type: contract.contract_type,
        amount_limit: contract.amount_limit ?? "",
        payment_terms: contract.payment_terms ?? "",
        min_order_amount: contract.min_order_amount ?? "",
        document_url: contract.document_url ?? "",
        notes: contract.notes ?? "",
      });
    }
    setMode("view");
  }

  function submit() {
    startTransition(async () => {
      if (mode === "create") {
        const res = await createContract(form);
        if (res.ok) {
          showBanner({ ok: true, msg: "✓ 已建立合約" });
          router.push(`/parts/setup/contracts/${res.data.id}`);
        } else {
          showBanner({ ok: false, msg: res.error });
        }
        return;
      }
      if (!contract) return;
      const res = await updateContract(contract.id, form);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存變更" });
        setMode("view");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function doSoftDelete() {
    if (!contract) return;
    startTransition(async () => {
      const res = await softDeleteContract(contract.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已將合約設為失效" });
        setShowDeleteConfirm(false);
        router.push("/parts/setup/contracts");
      } else {
        showBanner({ ok: false, msg: res.error });
        setShowDeleteConfirm(false);
      }
    });
  }

  const supplierMap = useMemo(() => {
    const m = new Map<string, SupplierOption>();
    for (const s of supplierOptions) m.set(s.id, s);
    return m;
  }, [supplierOptions]);

  const selectedSupplier = form.supplier_id ? supplierMap.get(form.supplier_id) : null;

  const isInactive = contract?.status === "terminated";
  const statusKey = isInactive ? "terminated" : contract?.computed_status ?? "none";
  const statusDef = STATUS_LABEL[statusKey] ?? STATUS_LABEL.none;
  const typeDef = TYPE_LABEL[contract?.contract_type ?? "annual"] ?? TYPE_LABEL.annual;

  const breadcrumbLabel =
    mode === "create"
      ? "新合約 [建立模式]"
      : `${contract?.contract_no ?? "—"}${mode === "edit" ? " [編輯模式]" : ""}`;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/setup/contracts" className="hover:text-[#185FA5]">
            採購合約設定
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{breadcrumbLabel}</span>
          {mode !== "view" && (
            <span className="ml-1 px-2 py-0.5 rounded-md bg-[#FDF3E3] text-[#854F0B] text-[11px] font-medium">
              {mode === "create" ? "建立模式" : "編輯模式"}
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {mode === "view" && (
            <>
              <Link
                href="/parts/setup/contracts"
                className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              {canEdit && (
                <>
                  <button
                    type="button"
                    onClick={() => setMode("edit")}
                    disabled={isInactive || isPending}
                    className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
                  >
                    修改
                  </button>
                  {contract?.computed_status === "expiring" && !isInactive && (
                    <button
                      type="button"
                      onClick={() => setShowExtendModal(true)}
                      disabled={isPending}
                      className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
                    >
                      ＋ 展延
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isInactive || isPending}
                    className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
                  >
                    刪除（軟）
                  </button>
                </>
              )}
            </>
          )}
          {(mode === "edit" || mode === "create") && (
            <>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                {isPending
                  ? mode === "create"
                    ? "建立中⋯"
                    : "儲存中⋯"
                  : mode === "create"
                    ? "建立合約"
                    : "儲存變更"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div className="text-[11px] tracking-wider text-[#9A9890]">採購合約</div>
            <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
              {mode === "create"
                ? selectedSupplier
                  ? `${selectedSupplier.name} 的新合約`
                  : "（未選供應商）"
                : contract?.supplier_name ?? "—"}
            </h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
              <span className="font-mono text-[#5A5955]">
                {mode === "create" ? "—" : contract?.contract_no ?? "—"}
              </span>
              {mode !== "create" && (
                <>
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${statusDef.chip}`}
                  >
                    {statusDef.label}
                  </span>
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${typeDef.chip}`}
                  >
                    {typeDef.label}
                  </span>
                  {contract?.days_left !== null && contract?.days_left !== undefined && !isInactive && (
                    <span className="text-[11px] text-[#9A9890]">
                      剩餘 {contract.days_left} 天
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* KPI + Gauge 區（create mode 隱藏） */}
      {mode !== "create" && contract && (
        <ContractInsights contract={contract} isInactive={isInactive} />
      )}

      {/* ▼ 合約基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 合約基本資料</span>
        </header>
        <div
          className={`px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 ${
            isPending ? "pointer-events-none opacity-60" : ""
          }`}
        >
          {/* supplier */}
          <Field label="供應商" required={mode !== "view"}>
            {mode === "view" ? (
              contract?.supplier_id ? (
                <Link
                  href={`/parts/setup/suppliers/${contract.supplier_id}`}
                  className="text-[12.5px] text-[#185FA5] hover:underline"
                >
                  {contract.supplier_name}
                </Link>
              ) : (
                <span className="text-[12.5px] text-[#9A9890]">—</span>
              )
            ) : mode === "create" && preselectedSupplierId ? (
              // create 時 supplier 鎖住（從 URL 帶入）
              <input
                type="text"
                value={selectedSupplier ? `${selectedSupplier.code ?? ""} ${selectedSupplier.name}` : ""}
                disabled
                className={inputClass}
              />
            ) : (
              <select
                value={form.supplier_id}
                onChange={(e) => patch("supplier_id", e.target.value)}
                className={inputClass}
                disabled={mode === "edit"}
              >
                <option value="">請選擇供應商</option>
                {supplierOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code ? `${s.code} · ` : ""}
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="合約編號" required={mode !== "view"}>
            {mode === "view" ? (
              <span className="text-[12.5px] font-mono text-[#2C2C2A]">
                {contract?.contract_no ?? "—"}
              </span>
            ) : (
              <input
                type="text"
                value={form.contract_no}
                onChange={(e) => patch("contract_no", e.target.value)}
                placeholder="如 PC-2026-001"
                className={inputClass}
              />
            )}
          </Field>

          <Field label="合約類型">
            {mode === "view" ? (
              <span className="text-[12.5px] text-[#2C2C2A]">{typeDef.label}</span>
            ) : (
              <select
                value={form.contract_type ?? "annual"}
                onChange={(e) => patch("contract_type", e.target.value)}
                className={inputClass}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="起始日" required={mode !== "view"}>
            {mode === "view" ? (
              <span className="text-[12.5px] font-mono text-[#2C2C2A]">
                {formatDate(contract?.effective_from ?? null)}
              </span>
            ) : (
              <input
                type="date"
                value={form.effective_from}
                onChange={(e) => patch("effective_from", e.target.value)}
                className={inputClass}
              />
            )}
          </Field>

          <Field label="到期日">
            {mode === "view" ? (
              <span className="text-[12.5px] font-mono text-[#2C2C2A]">
                {formatDate(contract?.effective_to ?? null)}
              </span>
            ) : (
              <input
                type="date"
                value={form.effective_to ?? ""}
                onChange={(e) => patch("effective_to", e.target.value)}
                className={inputClass}
              />
            )}
          </Field>

          <Field label="合約金額上限">
            {mode === "view" ? (
              <span className="text-[12.5px] font-mono text-[#2C2C2A]">
                {formatAmount(contract?.amount_limit ?? null)}
              </span>
            ) : (
              <input
                type="number"
                value={form.amount_limit ?? ""}
                onChange={(e) => patch("amount_limit", e.target.value)}
                placeholder="留空表示無上限"
                className={inputClass}
              />
            )}
          </Field>

          <Field label="付款條件">
            {mode === "view" ? (
              <span className="text-[12.5px] text-[#2C2C2A]">
                {contract?.payment_terms ?? "—"}
              </span>
            ) : (
              <input
                type="text"
                value={form.payment_terms ?? ""}
                onChange={(e) => patch("payment_terms", e.target.value)}
                placeholder="如 月結 30 天"
                className={inputClass}
              />
            )}
          </Field>

          <Field label="最低訂購金額">
            {mode === "view" ? (
              <span className="text-[12.5px] font-mono text-[#2C2C2A]">
                {contract?.min_order_amount !== null && contract?.min_order_amount !== undefined
                  ? `NT$ ${Number(contract.min_order_amount).toLocaleString("en-US")}`
                  : "—"}
              </span>
            ) : (
              <input
                type="number"
                value={form.min_order_amount ?? ""}
                onChange={(e) => patch("min_order_amount", e.target.value)}
                className={inputClass}
              />
            )}
          </Field>

          <Field label="附件 URL">
            {mode === "view" ? (
              contract?.document_url ? (
                <a
                  href={contract.document_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12.5px] text-[#185FA5] hover:underline truncate inline-block max-w-full"
                >
                  {contract.document_url}
                </a>
              ) : (
                <span className="text-[12.5px] text-[#9A9890]">—</span>
              )
            ) : (
              <input
                type="url"
                value={form.document_url ?? ""}
                onChange={(e) => patch("document_url", e.target.value)}
                placeholder="https://..."
                className={inputClass}
              />
            )}
          </Field>

          <div className="md:col-span-3">
            <Field label="備註">
              {mode === "view" ? (
                <span className="text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap">
                  {contract?.notes ?? "—"}
                </span>
              ) : (
                <textarea
                  value={form.notes ?? ""}
                  onChange={(e) => patch("notes", e.target.value)}
                  rows={2}
                  className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none w-full disabled:bg-[#F8F7F4]"
                />
              )}
            </Field>
          </div>
        </div>
      </section>

      {/* 變更歷史 tab — create mode 隱藏 */}
      {mode !== "create" && (
        <>
          <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
            <div className="flex border-b border-[#EEECE6]">
              <button
                type="button"
                onClick={() => setTab("history")}
                className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap ${
                  tab === "history"
                    ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                    : "text-[#5A5955] hover:bg-[#F8F7F4]"
                }`}
              >
                變更歷史 ({history.length})
              </button>
            </div>
          </div>
          <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4">
            {tab === "history" && (
              <HistoryTable history={history} currentId={contract?.id ?? null} />
            )}
          </div>
        </>
      )}

      {/* Delete confirm modal */}
      {showDeleteConfirm && contract && (
        <Modal title="確認將合約設為失效" onClose={() => setShowDeleteConfirm(false)}>
          <p className="text-[13px] text-[#2C2C2A]">
            合約 <b>{contract.contract_no}</b>（{contract.supplier_name}）將標為失效，列表不再顯示。
            變更歷史 tab 仍可看到。
          </p>
          <div className="mt-4 flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={doSoftDelete}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
            >
              {isPending ? "處理中⋯" : "確認失效"}
            </button>
          </div>
        </Modal>
      )}

      {/* Extend modal */}
      {showExtendModal && contract && (
        <ExtendModal
          contract={contract}
          onClose={() => setShowExtendModal(false)}
          onDone={(res) => {
            if (res.ok) {
              showBanner({ ok: true, msg: "✓ 合約已展延" });
              setShowExtendModal(false);
              router.push(`/parts/setup/contracts/${res.id}`);
            } else {
              showBanner({ ok: false, msg: res.error });
            }
          }}
        />
      )}

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
    </main>
  );
}

// ─────────── sub-components ───────────

function ContractInsights({
  contract,
  isInactive,
}: {
  contract: ContractWithSupplier;
  isInactive: boolean;
}) {
  // 計算合約進度（effective_from → effective_to）
  const today = new Date();
  const from = contract.effective_from ? new Date(contract.effective_from) : null;
  const to = contract.effective_to ? new Date(contract.effective_to) : null;
  const totalDays =
    from && to
      ? Math.max(1, Math.floor((to.getTime() - from.getTime()) / 86_400_000))
      : 0;
  const elapsedDays =
    from
      ? Math.max(0, Math.floor((today.getTime() - from.getTime()) / 86_400_000))
      : 0;
  const elapsedPct =
    totalDays > 0 ? Math.min(100, Math.round((elapsedDays / totalDays) * 100)) : 0;

  // tone：已失效 = gray / 已到期 = red / 即將到期 = amber / 有效 = green / 未生效 = blue
  const gaugeTone: "gray" | "red" | "amber" | "green" | "blue" = isInactive
    ? "gray"
    : contract.computed_status === "expired"
      ? "red"
      : contract.computed_status === "expiring"
        ? "amber"
        : contract.computed_status === "valid"
          ? "green"
          : "blue";

  const kpiTone: "green" | "amber" | "red" | "gray" =
    isInactive
      ? "gray"
      : contract.computed_status === "expired"
        ? "red"
        : contract.computed_status === "expiring"
          ? "amber"
          : "green";

  const daysLeftDisplay =
    contract.days_left === null
      ? "—"
      : contract.days_left < 0
        ? `-${Math.abs(contract.days_left)}d`
        : `${contract.days_left}d`;

  const amountDisplay =
    contract.amount_limit !== null
      ? `NT$ ${Number(contract.amount_limit).toLocaleString("en-US")}`
      : "無上限";

  const minOrderDisplay =
    contract.min_order_amount !== null && contract.min_order_amount !== undefined
      ? `NT$ ${Number(contract.min_order_amount).toLocaleString("en-US")}`
      : "—";

  const paymentTermsDisplay = contract.payment_terms ?? "—";

  return (
    <section className="grid grid-cols-1 md:grid-cols-[1.4fr,1fr] gap-3">
      <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
        <KpiCard
          label={
            contract.days_left !== null && contract.days_left < 0
              ? "已過期天數"
              : "剩餘天數"
          }
          value={daysLeftDisplay}
          tone={kpiTone}
          icon={<span className="text-[18px]">⏰</span>}
        />
        <KpiCard
          label="合約金額上限"
          value={amountDisplay}
          tone="teal"
          icon={<span className="text-[18px]">💰</span>}
        />
        <KpiCard
          label="付款條件"
          value={paymentTermsDisplay}
          tone="blue"
          icon={<span className="text-[18px]">💳</span>}
        />
        <KpiCard
          label="最低訂購金額"
          value={minOrderDisplay}
          tone="purple"
          icon={<span className="text-[18px]">🛒</span>}
        />
      </div>
      <section className="bg-white border border-[#EEECE6] rounded-md px-3 py-2 flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[12px] font-semibold text-[#2C2C2A]">
            合約效期進度
          </span>
          <span className="text-[11px] text-[#9A9890]">
            {totalDays > 0 ? `共 ${totalDays} 天` : "—"}
          </span>
        </div>
        {totalDays > 0 ? (
          <>
            <GaugeChart
              value={elapsedPct}
              tone={gaugeTone}
              size="sm"
              label={`${elapsedPct}%`}
              caption={
                isInactive
                  ? "已失效"
                  : contract.computed_status === "expired"
                    ? "已到期"
                    : `已過 ${elapsedDays}d`
              }
              isPercent
            />
            <div className="flex items-center justify-between text-[11px] text-[#9A9890] mt-1">
              <span className="font-mono">
                {contract.effective_from?.replace(/-/g, "/") ?? "—"}
              </span>
              <span className="font-mono">
                {contract.effective_to?.replace(/-/g, "/") ?? "—"}
              </span>
            </div>
          </>
        ) : (
          <div className="text-center text-[12px] text-[#9A9890] py-6 flex-1 flex items-center justify-center">
            尚未設定完整生效區間
          </div>
        )}
      </section>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className={labelClass}>
        {label}
        {required && <span className="text-[#CC0000] ml-0.5">*</span>}
      </label>
      <div className="min-h-[30px] flex items-center">{children}</div>
    </div>
  );
}

function HistoryTable({
  history,
  currentId,
}: {
  history: ContractHistoryRow[];
  currentId: string | null;
}) {
  if (history.length === 0) {
    return (
      <p className="text-[12px] text-[#9A9890] text-center py-6">
        尚無變更歷史紀錄
      </p>
    );
  }
  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-left text-[11px] text-[#9A9890] border-b border-[#EEECE6]">
          <th className="py-2 px-2">合約編號</th>
          <th className="py-2 px-2">起始</th>
          <th className="py-2 px-2">到期</th>
          <th className="py-2 px-2">狀態</th>
          <th className="py-2 px-2">類型</th>
        </tr>
      </thead>
      <tbody>
        {history.map((h) => {
          const isCurrent = h.id === currentId;
          const isInactive = h.status === "terminated";
          const statusKey = isInactive ? "terminated" : h.computed_status;
          const def = STATUS_LABEL[statusKey] ?? STATUS_LABEL.none;
          return (
            <tr
              key={h.id}
              className={`border-b border-[#F2F2F2] ${isCurrent ? "bg-[#FDF3E3]" : ""}`}
            >
              <td className="py-2 px-2 font-mono">
                {h.contract_no ?? "—"}
                {isCurrent && (
                  <span className="ml-2 text-[10px] text-[#854F0B]">（目前）</span>
                )}
              </td>
              <td className="py-2 px-2 font-mono">
                {h.effective_from ? h.effective_from.replace(/-/g, "/") : "—"}
              </td>
              <td className="py-2 px-2 font-mono">
                {h.effective_to ? h.effective_to.replace(/-/g, "/") : "—"}
              </td>
              <td className="py-2 px-2">
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${def.chip}`}
                >
                  {def.label}
                </span>
              </td>
              <td className="py-2 px-2 text-[#5A5955]">
                {TYPE_LABEL[h.contract_type]?.label ?? h.contract_type}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-start justify-center pt-24">
      <div className="bg-white rounded-lg shadow-xl w-[460px] max-w-[90vw] border border-[#EEECE6]">
        <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9A9890] hover:text-[#5A5955] text-[14px]"
          >
            ✕
          </button>
        </header>
        <div className="px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

function ExtendModal({
  contract,
  onClose,
  onDone,
}: {
  contract: ContractWithSupplier;
  onClose: () => void;
  onDone: (res: { ok: true; id: string } | { ok: false; error: string }) => void;
}) {
  const [newTo, setNewTo] = useState(() =>
    todayPlusYearsISO(1, contract.effective_to),
  );
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!newTo) return;
    startTransition(async () => {
      const res = await extendContract(contract.id, newTo);
      if (res.ok) onDone({ ok: true, id: res.data.id });
      else onDone({ ok: false, error: res.error });
    });
  }

  const newFromHint = (() => {
    if (!contract.effective_to) return null;
    const d = new Date(contract.effective_to);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <Modal title="展延合約" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[12.5px] text-[#5A5955]">
          舊合約 <b className="font-mono">{contract.contract_no}</b> 將標為失效並加上後綴
          （如 <span className="font-mono">-2</span>）；新合約沿用原編號。
        </p>
        <div className="bg-[#F8F7F4] rounded px-3 py-2 text-[12px] space-y-1">
          <div>
            <span className="text-[#9A9890]">舊到期日：</span>
            <span className="font-mono">{contract.effective_to?.replace(/-/g, "/")}</span>
          </div>
          <div>
            <span className="text-[#9A9890]">新起始日：</span>
            <span className="font-mono">
              {newFromHint?.replace(/-/g, "/") ?? "—"}（舊到期日 + 1 天）
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>新到期日 *</label>
          <input
            type="date"
            value={newTo}
            onChange={(e) => setNewTo(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || !newTo}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            {isPending ? "展延中⋯" : "確認展延"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
