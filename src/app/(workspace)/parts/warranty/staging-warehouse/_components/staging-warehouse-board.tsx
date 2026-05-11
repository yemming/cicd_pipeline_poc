"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  createStagingWarehouse,
  toggleStagingWarehouseActive,
  updateStagingRules,
  updateStagingWarehouse,
  type StagingItemRow,
  type StagingRulesRow,
  type StagingWarehouseSummary,
} from "@/domain/warranty";

type Banner = { ok: boolean; msg: string } | null;

type FormState = {
  open: boolean;
  mode: "create" | "edit";
  id?: string;
  code: string;
  name: string;
  org_id: string;
  slot_capacity: string;
};

const EMPTY_FORM: FormState = {
  open: false,
  mode: "create",
  code: "",
  name: "",
  org_id: "",
  slot_capacity: "",
};

const DAMAGE_LABEL: Record<string, { text: string; cls: string }> = {
  light: { text: "🟢 輕微磨損", cls: "bg-[#F2F2F2] text-[#6B6A68]" },
  mid: { text: "🟡 明顯損壞", cls: "bg-[#FDF3E3] text-[#854F0B]" },
  high: { text: "🔴 嚴重毀損", cls: "bg-[#FDECEA] text-[#CC0000]" },
  disposed: { text: "⚫ 已銷毀", cls: "bg-[#F2F2F2] text-[#6B6A68]" },
};

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  awaiting: { text: "等待核准", cls: "bg-[#EBF3FF] text-[#1A3A5C]" },
  reviewing: { text: "審核中", cls: "bg-[#FDF3E3] text-[#854F0B]" },
  approved: { text: "核准-待寄回", cls: "bg-[#EAF3DE] text-[#3B6D11]" },
  shipped: { text: "已寄出", cls: "bg-[#E8F5F0] text-[#0F6E56]" },
  disposed: { text: "銷毀完成", cls: "bg-[#F2F2F2] text-[#6B6A68]" },
  overdue: { text: "逾期未結", cls: "bg-[#FDECEA] text-[#CC0000]" },
};

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

export function StagingWarehouseBoard({
  warehouses,
  rules,
  activeWarehouse,
  items,
  orgs,
  canEdit,
}: {
  warehouses: StagingWarehouseSummary[];
  rules: StagingRulesRow;
  activeWarehouse: StagingWarehouseSummary | null;
  items: StagingItemRow[];
  orgs: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // 樂觀 rules state（避免 toggle 後等 round-trip）
  const [localRules, setLocalRules] = useState<StagingRulesRow>(rules);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const patchRules = (patch: Partial<StagingRulesRow>) => {
    const prev = localRules;
    setLocalRules({ ...prev, ...patch });
    startTransition(async () => {
      const res = await updateStagingRules(patch);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        router.refresh();
      } else {
        setLocalRules(prev); // rollback
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const openCreate = () =>
    setForm({ ...EMPTY_FORM, open: true, mode: "create" });

  const openEdit = (w: StagingWarehouseSummary) =>
    setForm({
      open: true,
      mode: "edit",
      id: w.id,
      code: w.code,
      name: w.name,
      org_id: w.org_id ?? "",
      slot_capacity: w.slot_capacity != null ? String(w.slot_capacity) : "",
    });

  const submitForm = () => {
    const slot = form.slot_capacity.trim()
      ? Number(form.slot_capacity)
      : null;
    if (slot != null && (!Number.isFinite(slot) || slot < 0)) {
      showBanner({ ok: false, msg: "庫位格數需為非負整數" });
      return;
    }
    startTransition(async () => {
      const res =
        form.mode === "create"
          ? await createStagingWarehouse({
              code: form.code,
              name: form.name,
              org_id: form.org_id || null,
              slot_capacity: slot,
            })
          : await updateStagingWarehouse(form.id!, {
              name: form.name,
              org_id: form.org_id || null,
              slot_capacity: slot,
            });
      if (res.ok) {
        showBanner({
          ok: true,
          msg: form.mode === "create" ? "✓ 已建立" : "✓ 已更新",
        });
        setForm(EMPTY_FORM);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const toggleActive = (w: StagingWarehouseSummary) => {
    startTransition(async () => {
      const res = await toggleStagingWarehouseActive(w.id, !w.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: w.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const columns: DataGridColumn<StagingItemRow>[] = useMemo(
    () => [
      {
        id: "barcode",
        header: "舊件條碼",
        width: 170,
        hideable: false,
        cell: (r) => (
          <span className="font-mono text-[12px] text-[#1A3A5C]">
            {r.barcode}
          </span>
        ),
        exportValue: (r) => r.barcode,
        sortValue: (r) => r.barcode,
      },
      {
        id: "item_name",
        header: "品名",
        width: 160,
        cell: (r) => r.item_name,
        exportValue: (r) => r.item_name,
        sortValue: (r) => r.item_name,
      },
      {
        id: "damage_level",
        header: "損壞等級",
        width: 130,
        cell: (r) => {
          const info =
            DAMAGE_LABEL[r.damage_level] ?? {
              text: r.damage_label ?? r.damage_level,
              cls: "bg-[#F2F2F2] text-[#6B6A68]",
            };
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${info.cls}`}
            >
              {info.text}
            </span>
          );
        },
        exportValue: (r) =>
          DAMAGE_LABEL[r.damage_level]?.text ?? r.damage_label ?? r.damage_level,
        sortValue: (r) => r.damage_level,
      },
      {
        id: "ro_no",
        header: "RO 號",
        width: 120,
        cell: (r) => (
          <span className="font-mono text-[12px] text-[#5A5955]">
            {r.ro_no ?? "—"}
          </span>
        ),
        exportValue: (r) => r.ro_no ?? "",
        sortValue: (r) => r.ro_no ?? "",
      },
      {
        id: "inbound_date",
        header: "入庫日",
        width: 110,
        cell: (r) => (
          <span className="font-mono text-[12px]">{r.inbound_date ?? "—"}</span>
        ),
        exportValue: (r) => r.inbound_date ?? "",
        sortValue: (r) => r.inbound_date ?? "",
      },
      {
        id: "days",
        header: "存放天數",
        width: 90,
        align: "right",
        cell: (r) => {
          const d = daysSince(r.inbound_date);
          const cls =
            d >= localRules.alert_days_escalate
              ? "text-[#CC0000] font-semibold"
              : d >= localRules.alert_days_first
                ? "text-[#854F0B] font-semibold"
                : "text-[#2C2C2A]";
          return <span className={`font-mono text-[12px] ${cls}`}>{d}</span>;
        },
        exportValue: (r) => String(daysSince(r.inbound_date)),
        sortValue: (r) => daysSince(r.inbound_date),
      },
      {
        id: "status",
        header: "索賠狀態",
        width: 130,
        cell: (r) => {
          const d = daysSince(r.inbound_date);
          const key =
            d >= localRules.alert_days_escalate &&
            r.status !== "shipped" &&
            r.status !== "disposed"
              ? "overdue"
              : r.status;
          const info =
            STATUS_LABEL[key] ?? {
              text: r.status_label ?? r.status,
              cls: "bg-[#F2F2F2] text-[#6B6A68]",
            };
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${info.cls}`}
            >
              {info.text}
            </span>
          );
        },
        exportValue: (r) =>
          STATUS_LABEL[r.status]?.text ?? r.status_label ?? r.status,
        sortValue: (r) => r.status,
      },
    ],
    [localRules.alert_days_first, localRules.alert_days_escalate],
  );

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";
  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* 1. Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          暫存倉設定
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          11.3
        </span>
        <span className="text-[12px] text-[#9A9890]">
          保固暫存倉設定 · 庫存隔離規則 · 超期告警
        </span>
      </header>

      {/* Info banner */}
      <div className="px-4 py-2.5 rounded-lg bg-[#EAF4FB] border border-[#B5D4F4] text-[12px] text-[#1A3A5C]">
        🏗 暫存倉是專門存放保固舊件的隔離倉庫，不計入可售庫存，也不參與盤點差異計算。
      </div>

      {/* 2 + 3. 二欄：暫存倉列表 + 規則設定 */}
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-3 ${lockedClass}`}>
        {/* 暫存倉列表 */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
              🏗 暫存倉列表
            </h2>
            <span className="ml-auto text-[11px] text-[#9A9890]">
              共 <b className="text-[#2C2C2A]">{warehouses.length}</b> 個
            </span>
            <button
              type="button"
              onClick={openCreate}
              disabled={!canEdit || isPending}
              className="ml-2 h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增暫存倉
            </button>
          </header>
          <div className="divide-y divide-[#EEECE6]">
            {warehouses.length === 0 ? (
              <div className="px-4 py-6 text-[12px] text-[#9A9890]">
                目前尚未建立暫存倉。點右上「新增暫存倉」開始建立。
              </div>
            ) : (
              warehouses.map((w) => {
                const isActive = w.id === activeWarehouse?.id;
                return (
                  <div
                    key={w.id}
                    className={`px-4 py-2.5 ${isActive ? "bg-[#F0FAF6]" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const url = new URL(window.location.href);
                          url.searchParams.set("wh", w.id);
                          router.push(url.pathname + url.search);
                        }}
                        className="flex-1 text-left"
                      >
                        <div className="text-[13px] font-semibold text-[#2C2C2A]">
                          {w.name}
                        </div>
                        <div className="text-[11px] text-[#9A9890] mt-0.5">
                          {`所屬門店：${w.org_name ?? "—"}`}
                          {w.slot_capacity != null
                            ? ` ｜ 庫位：${w.slot_capacity}格`
                            : ""}
                          {` ｜ 代碼：${w.code}`}
                        </div>
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                            w.is_active
                              ? "bg-[#EAF3DE] text-[#3B6D11]"
                              : "bg-[#F2F2F2] text-[#6B6A68]"
                          }`}
                        >
                          {w.is_active ? "啟用" : "停用"}
                        </span>
                        <button
                          type="button"
                          onClick={() => openEdit(w)}
                          disabled={!canEdit || isPending}
                          className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                        >
                          編輯
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(w)}
                          disabled={!canEdit || isPending}
                          className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                        >
                          {w.is_active ? "停用" : "啟用"}
                        </button>
                      </div>
                    </div>
                    <div className="mt-1.5 flex gap-3 text-[11px]">
                      <span className="text-[#5A5955]">
                        📦 目前存放：<b>{w.stored_count} 件</b>
                      </span>
                      {w.overdue_count > 0 ? (
                        <span className="text-[#854F0B]">
                          ⏰ 超期（{localRules.alert_days_first}天+）：
                          <b>{w.overdue_count} 件</b>
                        </span>
                      ) : (
                        <span className="text-[#3B6D11]">✅ 無超期件</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* 規則設定 */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
              ⚙️ 暫存倉規則設定
            </h2>
          </header>
          <div className="px-4 py-3 space-y-3 text-[12.5px]">
            <div>
              <div className="text-[11px] font-semibold text-[#9A9890] tracking-wider mb-1.5">
                庫存隔離設定
              </div>
              <div className="flex flex-col gap-1.5">
                {[
                  {
                    k: "isolate_from_sellable" as const,
                    label: "暫存倉庫存不計入門店可售庫存",
                  },
                  {
                    k: "exclude_from_alerts" as const,
                    label: "不參與缺貨告警計算",
                  },
                  {
                    k: "exclude_from_count" as const,
                    label: "不參與定期盤點作業",
                  },
                  {
                    k: "allow_temp_borrow" as const,
                    label: "允許臨時借調至主倉（需主管核准）",
                  },
                ].map((row) => (
                  <label
                    key={row.k}
                    className="flex items-center gap-2 text-[12.5px]"
                  >
                    <input
                      type="checkbox"
                      disabled={!canEdit || isPending}
                      checked={Boolean(localRules[row.k])}
                      onChange={(e) =>
                        patchRules({ [row.k]: e.target.checked } as Partial<StagingRulesRow>)
                      }
                      style={{ accentColor: "#0F6E56" }}
                    />
                    {row.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-[#9A9890] tracking-wider mb-1.5">
                超期告警設定
              </div>
              <div className="flex items-center gap-2 mb-1.5 text-[12px]">
                <span>存放超過</span>
                <input
                  type="number"
                  min={1}
                  disabled={!canEdit || isPending}
                  value={localRules.alert_days_first}
                  onChange={(e) =>
                    patchRules({ alert_days_first: Number(e.target.value) })
                  }
                  className="w-[60px] h-[28px] border border-[#D5D3CB] rounded px-2 text-center text-[12.5px] focus:border-[#185FA5] outline-none"
                />
                <span>天，發送告警</span>
              </div>
              <div className="flex items-center gap-2 text-[12px]">
                <span>超過</span>
                <input
                  type="number"
                  min={1}
                  disabled={!canEdit || isPending}
                  value={localRules.alert_days_escalate}
                  onChange={(e) =>
                    patchRules({ alert_days_escalate: Number(e.target.value) })
                  }
                  className="w-[60px] h-[28px] border border-[#D5D3CB] rounded px-2 text-center text-[12.5px] focus:border-[#185FA5] outline-none"
                />
                <span>天，升級主管告警</span>
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-[#9A9890] tracking-wider mb-1.5">
                庫存成本計算方式
              </div>
              <select
                disabled={!canEdit || isPending}
                value={localRules.cost_calc_method}
                onChange={(e) =>
                  patchRules({ cost_calc_method: e.target.value })
                }
                className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
              >
                <option value="pending_until_approved">
                  暫不計算成本（待原廠核准後沖銷）
                </option>
                <option value="freeze_at_inbound">
                  移入時按進貨成本凍結
                </option>
              </select>
            </div>
          </div>
        </section>
      </div>

      {/* 4. 存放明細表 */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 pt-1">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            📦 {activeWarehouse?.name ?? "—"} · 目前存放明細
          </h2>
          <span className="ml-auto text-[12px] text-[#9A9890]">
            共 <b className="text-[#2C2C2A]">{items.length}</b> 件
          </span>
        </div>
        {activeWarehouse ? (
          <DataGrid
            columns={columns}
            data={items}
            rowKey={(r) => r.id}
            persistKey="parts/warranty/staging-warehouse/items"
            exportFileName={`staging-${activeWarehouse.code}`}
            emptyMessage="該暫存倉目前沒有存放任何舊件"
            disabled={isPending}
          />
        ) : (
          <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-6 text-[12px] text-[#9A9890]">
            尚未選擇暫存倉。
          </div>
        )}
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
      {form.open ? (
        <Modal
          title={form.mode === "create" ? "新增暫存倉" : "編輯暫存倉"}
          onClose={() => setForm(EMPTY_FORM)}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>代碼 *</label>
              <input
                className={inputClass}
                value={form.code}
                disabled={form.mode === "edit" || isPending}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value })
                }
                placeholder="WH-WARRANTY-TPE"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>名稱 *</label>
              <input
                className={inputClass}
                value={form.name}
                disabled={isPending}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
                placeholder="台北直營-保固暫存倉"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>所屬門店</label>
              <select
                className={inputClass}
                value={form.org_id}
                disabled={isPending}
                onChange={(e) =>
                  setForm({ ...form, org_id: e.target.value })
                }
              >
                <option value="">— 未指定 —</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>庫位格數</label>
              <input
                type="number"
                min={0}
                className={inputClass}
                value={form.slot_capacity}
                disabled={isPending}
                onChange={(e) =>
                  setForm({ ...form, slot_capacity: e.target.value })
                }
                placeholder="8"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => setForm(EMPTY_FORM)}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={submitForm}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
            >
              {isPending
                ? form.mode === "create"
                  ? "建立中⋯"
                  : "儲存中⋯"
                : form.mode === "create"
                  ? "建立"
                  : "儲存變更"}
            </button>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-[#EEECE6] flex items-center">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto w-7 h-7 rounded hover:bg-[#F8F7F4] text-[#9A9890] text-[18px] leading-none"
          >
            ×
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
