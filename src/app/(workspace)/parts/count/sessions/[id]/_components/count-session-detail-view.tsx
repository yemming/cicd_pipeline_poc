"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ScanInput } from "./scan-input";
import type { CountOpsRow, CountSessionLine } from "@/domain/count";
import {
  startCountSessionAction,
  submitCountSessionAction,
  approveCountAdjustmentAction,
  cancelCountSessionAction,
} from "@/domain/count";
import {
  COUNT_STATUS_CHIP,
  COUNT_TYPE_CHIP,
  COUNT_TYPE_OPTIONS,
  fmtDate,
  fmtMoney,
  fmtPct,
  isCountActive,
} from "@/domain/count.constants";

type WarehouseOption = { id: string; name: string };
type Mode = "view" | "create";

type CreateDraft = {
  warehouse_id: string;
  plan_id: string;
  count_date: string;
  count_type: string;
  freeze_warehouse: boolean;
  notes: string;
};

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full";

export function CountSessionDetailView({
  ct,
  lines,
  warehouses,
  canEdit,
  initialMode,
}: {
  ct: CountOpsRow | null;
  lines: CountSessionLine[];
  warehouses: WarehouseOption[];
  canEdit: boolean;
  initialMode: Mode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );
  const [formError, setFormError] = useState<string | null>(null);

  // create-mode state
  const [draft, setDraft] = useState<CreateDraft>({
    warehouse_id: warehouses[0]?.id ?? "",
    plan_id: "",
    count_date: new Date().toISOString().slice(0, 10),
    count_type: "manual",
    freeze_warehouse: false,
    notes: "",
  });

  // line-edit modal state
  const [editLinesOpen, setEditLinesOpen] = useState(false);
  const [lineDraft, setLineDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.id,
        l.qty_final != null
          ? String(l.qty_final)
          : l.qty_first_count != null
            ? String(l.qty_first_count)
            : String(l.qty_system),
      ]),
    ),
  );

  function showBanner(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  // ── Create-mode actions
  function submitCreate() {
    setFormError(null);
    if (!draft.warehouse_id) {
      setFormError("倉庫必選");
      return;
    }
    startTransition(async () => {
      const res = await startCountSessionAction({
        warehouse_id: draft.warehouse_id,
        plan_id: draft.plan_id || undefined,
        count_date: draft.count_date || undefined,
        count_type: draft.count_type || undefined,
        freeze_warehouse: draft.freeze_warehouse,
        notes: draft.notes || undefined,
      });
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      router.push(`/parts/count/sessions/${res.data.ct_id}`);
    });
  }

  // ── View-mode actions
  function submitLines() {
    if (!ct) return;
    const payload = Object.entries(lineDraft)
      .filter(([, v]) => v !== "")
      .map(([line_id, v]) => ({ line_id, qty_final: Number(v) }))
      .filter((l) => Number.isFinite(l.qty_final));
    if (payload.length === 0) {
      showBanner({ ok: false, msg: "至少要填一行實盤數" });
      return;
    }
    startTransition(async () => {
      const res = await submitCountSessionAction({
        ct_id: ct.id,
        lines: payload,
      });
      if (res.ok) {
        showBanner({
          ok: true,
          msg: `✓ 提交完成 ・ ${res.data.variance_lines} 行差異 ・ 金額 ${fmtMoney(res.data.variance_amount)}`,
        });
        setEditLinesOpen(false);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function approveCount() {
    if (!ct) return;
    if (
      !confirm(
        `確認核准 ${ct.ct_no}？差異會 post 成 inventory_adjustments + 修 stock_items.qty + 自動產出 journal_entries。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await approveCountAdjustmentAction(ct.id);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: res.data.adj_no
            ? `✓ ${res.data.adj_no} 已過帳（${res.data.adjusted_lines} 行）`
            : "✓ 無差異，直接結案",
        });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function cancelCount() {
    if (!ct) return;
    if (!confirm(`確定取消盤點 ${ct.ct_no}？明細會被清空，動作無法復原。`)) return;
    startTransition(async () => {
      const res = await cancelCountSessionAction(ct.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已取消" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  // Mode = create
  if (initialMode === "create") {
    return (
      <main className="px-6 py-5 space-y-3">
        {/* Breadcrumb + CRUD pills */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
            <Link
              href="/parts/count/sessions"
              className="hover:text-[#185FA5]"
            >
              盤點作業
            </Link>
            <span>›</span>
            <span className="text-[#5A5955]">啟動新盤點</span>
            <span className="px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B] font-medium">
              建立模式
            </span>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <Link
              href="/parts/count/sessions"
              className="inline-flex items-center h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
            >
              取消
            </Link>
            <button
              type="button"
              onClick={submitCreate}
              disabled={isPending || !draft.warehouse_id}
              className="inline-flex items-center h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
            >
              {isPending ? "啟動中⋯" : "啟動並開啟"}
            </button>
          </div>
        </div>

        {/* Title card */}
        <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
          <div className="flex flex-col gap-2">
            <div className="text-[11px] tracking-wider text-[#9A9890]">
              INVENTORY COUNT SESSION
            </div>
            <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
              （未啟動盤點）
            </h1>
            <div className="flex items-center gap-1.5 text-[12px]">
              <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
                尚未建立
              </span>
              <span className="text-[#9A9890]">
                建立後將會立即拍當下倉庫的庫存快照、進入「進行中」狀態
              </span>
            </div>
          </div>
        </header>

        {/* 基本資料 */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              ▼ 啟動設定
            </span>
          </header>
          <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
            <KvEdit label="倉庫 *">
              <select
                value={draft.warehouse_id}
                onChange={(e) =>
                  setDraft({ ...draft, warehouse_id: e.target.value })
                }
                disabled={isPending}
                className={inputClass}
              >
                {warehouses.length === 0 && (
                  <option value="">（無啟用中倉庫）</option>
                )}
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </KvEdit>
            <KvEdit label="盤點類型">
              <select
                value={draft.count_type}
                onChange={(e) =>
                  setDraft({ ...draft, count_type: e.target.value })
                }
                disabled={isPending}
                className={inputClass}
              >
                {COUNT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </KvEdit>
            <KvEdit label="盤點日期">
              <input
                type="date"
                value={draft.count_date}
                onChange={(e) =>
                  setDraft({ ...draft, count_date: e.target.value })
                }
                disabled={isPending}
                className={inputClass}
              />
            </KvEdit>
            <KvEdit label="凍結倉庫">
              <label className="flex items-center gap-2 h-[30px] text-[12.5px]">
                <input
                  type="checkbox"
                  checked={draft.freeze_warehouse}
                  onChange={(e) =>
                    setDraft({ ...draft, freeze_warehouse: e.target.checked })
                  }
                  disabled={isPending}
                />
                <span>盤點期間禁止出入庫</span>
              </label>
            </KvEdit>
          </div>
        </section>

        {/* 備註 */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              ▼ 備註
            </span>
          </header>
          <div className="px-4 py-4">
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              disabled={isPending}
              rows={3}
              placeholder="盤點重點、人員、注意事項…"
              className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </div>
        </section>

        {formError && (
          <div className="rounded border border-[#F5AEAD] bg-[#FDECEA] text-[#CC0000] text-[12px] px-3 py-2">
            {formError}
          </div>
        )}

        <p className="text-[12px] text-[#9A9890]">
          啟動會把該倉當下 status=&apos;available&apos; 的庫存拍 snapshot
          為 qty_system，建立 inventory_counts(status=&apos;counting&apos;) +
          所有 lines 等實盤輸入。
        </p>

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

  // Mode = view
  if (!ct) return null;
  const statusDef = COUNT_STATUS_CHIP[ct.status ?? ""] ?? null;
  const typeDef = COUNT_TYPE_CHIP[ct.count_type ?? ""] ?? null;
  const isActive = isCountActive(ct.status ?? "");
  const isPendingApproval = ct.status === "pending_approval";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + CRUD pills */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/count/sessions" className="hover:text-[#185FA5]">
            盤點作業
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{ct.ct_no ?? "—"}</span>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/count/sessions"
            className="inline-flex items-center h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回列表
          </Link>
          <Link
            href="/parts/count/sessions/new"
            aria-disabled={!canEdit}
            tabIndex={canEdit ? undefined : -1}
            className={`inline-flex items-center h-[30px] px-4 rounded-full text-[12px] font-medium shadow-sm ${
              canEdit
                ? "bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                : "bg-[#0F6E56] text-white opacity-50 pointer-events-none"
            }`}
          >
            新增
          </Link>
          {isActive && (
            <>
              <button
                type="button"
                onClick={() => setEditLinesOpen(true)}
                disabled={!canEdit || isPending}
                className="inline-flex items-center h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                填實盤數
              </button>
              <button
                type="button"
                onClick={cancelCount}
                disabled={!canEdit || isPending}
                className="inline-flex items-center h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                取消盤點
              </button>
            </>
          )}
          {isPendingApproval && (
            <button
              type="button"
              onClick={approveCount}
              disabled={!canEdit || isPending}
              className="inline-flex items-center h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
            >
              {isPending ? "覆核中⋯" : "覆核並過帳"}
            </button>
          )}
        </div>
      </div>

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex flex-col gap-2">
          <div className="text-[11px] tracking-wider text-[#9A9890]">
            INVENTORY COUNT SESSION
          </div>
          <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight font-mono">
            {ct.ct_no ?? "—"}
          </h1>
          <div className="flex items-center gap-1.5 flex-wrap text-[12px]">
            <span className="text-[#5A5955]">{ct.warehouse_name ?? "—"}</span>
            {statusDef && (
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${statusDef.chip}`}
              >
                {statusDef.label}
              </span>
            )}
            {typeDef && (
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${typeDef.chip}`}
              >
                {typeDef.label}
              </span>
            )}
            {ct.freeze_warehouse && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDECEA] text-[#CC0000]">
                凍結倉庫
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ▼ 進度與差異 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 進度與差異
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
          <Kv label="總筆數" value={String(ct.total_lines ?? 0)} mono />
          <Kv
            label="已盤點 / 進度"
            value={`${ct.counted_lines ?? 0} ・ ${fmtPct(ct.progress_pct)}`}
            mono
          />
          <Kv
            label="差異筆數"
            value={String(ct.variance_lines ?? 0)}
            mono
          />
          <Kv label="差異金額" value={fmtMoney(ct.variance_amount)} mono />
        </div>
      </section>

      {/* ▼ 基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 基本資料
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="盤點單號" value={ct.ct_no ?? "—"} mono />
          <Kv label="倉庫" value={ct.warehouse_name ?? "—"} />
          <Kv label="盤點日期" value={fmtDate(ct.count_date)} mono />
          <Kv
            label="盤點類型"
            value={
              COUNT_TYPE_CHIP[ct.count_type ?? ""]?.label ??
              ct.count_type ??
              "—"
            }
          />
          <Kv
            label="狀態"
            value={
              COUNT_STATUS_CHIP[ct.status ?? ""]?.label ?? ct.status ?? "—"
            }
          />
          <Kv label="凍結倉" value={ct.freeze_warehouse ? "是" : "否"} />
          <Kv
            label="建立時間"
            value={
              ct.created_at
                ? ct.created_at.slice(0, 16).replace("T", " ")
                : "—"
            }
            mono
          />
          <Kv
            label="覆核時間"
            value={
              ct.approved_at
                ? ct.approved_at.slice(0, 16).replace("T", " ")
                : "—"
            }
            mono
          />
        </div>
      </section>

      {/* ▼ 盤點明細 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 盤點明細
          </span>
          <span className="text-[11px] text-[#9A9890]">
            共 {lines.length} 行
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F8F7F4]">
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold w-[60px]">
                  #
                </th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">
                  料件
                </th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold w-[100px]">
                  Bin
                </th>
                <th className="px-3 py-2 text-right text-[11px] text-[#9A9890] font-semibold w-[100px]">
                  系統數
                </th>
                <th className="px-3 py-2 text-right text-[11px] text-[#9A9890] font-semibold w-[100px]">
                  實盤數
                </th>
                <th className="px-3 py-2 text-right text-[11px] text-[#9A9890] font-semibold w-[80px]">
                  差異
                </th>
                <th className="px-3 py-2 text-right text-[11px] text-[#9A9890] font-semibold w-[120px]">
                  差異金額
                </th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold w-[100px]">
                  狀態
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-10 text-center text-[12px] text-[#9A9890]"
                  >
                    無明細
                  </td>
                </tr>
              ) : (
                lines.map((l) => (
                  <tr
                    key={l.id}
                    className="border-t border-[#EEECE6] hover:bg-[#F8F7F4]"
                  >
                    <td className="px-3 py-2 text-[12px] text-[#9A9890] font-mono">
                      {l.line_no}
                    </td>
                    <td className="px-3 py-2 text-[12.5px]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[#1A3A5C] font-semibold">
                          {l.item_code ?? "—"}
                        </span>
                        <span className="text-[#5A5955]">
                          {l.item_name ?? ""}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[12px] font-mono">
                      {l.bin_label ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-[12px] font-mono">
                      {l.qty_system.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-[12px] font-mono">
                      {l.qty_final == null
                        ? "—"
                        : Number(l.qty_final).toLocaleString()}
                    </td>
                    <td
                      className={`px-3 py-2 text-right text-[12px] font-mono ${
                        l.variance == null
                          ? "text-[#9A9890]"
                          : l.variance > 0
                            ? "text-[#3B6D11]"
                            : l.variance < 0
                              ? "text-[#CC0000]"
                              : "text-[#9A9890]"
                      }`}
                    >
                      {l.variance == null
                        ? "—"
                        : l.variance > 0
                          ? `+${l.variance}`
                          : l.variance}
                    </td>
                    <td className="px-3 py-2 text-right text-[12px] font-mono">
                      {l.variance_amount == null
                        ? "—"
                        : fmtMoney(l.variance_amount)}
                    </td>
                    <td className="px-3 py-2 text-[12px]">
                      <LineStatusChip status={l.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ▼ 備註 */}
      {ct.notes && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              ▼ 備註
            </span>
          </header>
          <div className="px-4 py-4">
            <p className="text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap">
              {ct.notes}
            </p>
          </div>
        </section>
      )}

      {/* Line edit modal */}
      {editLinesOpen && (
        <LineEditModal
          ctNo={ct.ct_no ?? ct.id}
          lines={lines}
          draft={lineDraft}
          setDraft={setLineDraft}
          onSubmit={submitLines}
          onClose={() => (isPending ? null : setEditLinesOpen(false))}
          pending={isPending}
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

function Kv({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[#9A9890]">{label}</span>
      <span
        className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function KvEdit({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-[#9A9890] font-medium">{label}</span>
      {children}
    </div>
  );
}

function LineStatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; chip: string }> = {
    pending: { label: "待盤", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
    first_done: { label: "首盤", chip: "bg-[#EBF3FF] text-[#1A3A5C]" },
    reconciled: { label: "已對帳", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
    second_done: { label: "複盤", chip: "bg-[#EBF3FF] text-[#1A3A5C]" },
    adjusted: { label: "已調整", chip: "bg-[#E8F5F0] text-[#0F6E56]" },
  };
  const def =
    map[status] ?? { label: status, chip: "bg-[#F2F2F2] text-[#6B6A68]" };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
    >
      {def.label}
    </span>
  );
}

function LineEditModal({
  ctNo,
  lines,
  draft,
  setDraft,
  onSubmit,
  onClose,
  pending,
}: {
  ctNo: string;
  lines: CountSessionLine[];
  draft: Record<string, string>;
  setDraft: (d: Record<string, string>) => void;
  onSubmit: () => void;
  onClose: () => void;
  pending: boolean;
}) {
  // 掃描 vs 手動 切換
  const [scanMode, setScanMode] = useState(false);
  // 累計掃描成功次數
  const [scanCount, setScanCount] = useState(0);
  // 掃描即時回饋（命中料號 / 查無）
  const [scanMsg, setScanMsg] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  // 最近命中的 line，視覺高亮一下
  const [hitLineId, setHitLineId] = useState<string | null>(null);
  const hitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 掃描碼 → line：以 item_code 比對（line 無 barcode 欄；見 schema CountSessionLine）。
  // 同時建大寫索引，掃進來的碼大小寫不敏感。
  const codeIndex = useMemo(() => {
    const m = new Map<string, CountSessionLine>();
    for (const l of lines) {
      if (l.item_code) m.set(l.item_code.trim().toUpperCase(), l);
    }
    return m;
  }, [lines]);

  // 用 ref 拿最新 draft，避免 onScan 因 draft 變動而重建（重建會重啟相機）
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const handleScan = useCallback(
    (raw: string) => {
      const code = raw.trim().toUpperCase();
      const hit = codeIndex.get(code);
      if (!hit) {
        setScanMsg({ ok: false, text: `查無此料號：${raw}` });
        return;
      }
      const cur = draftRef.current;
      // 命中 +1（沒填過就以系統數為基準 +1）
      const base =
        cur[hit.id] != null && cur[hit.id] !== ""
          ? Number(cur[hit.id])
          : hit.qty_system;
      const next = (Number.isFinite(base) ? base : hit.qty_system) + 1;
      setDraft({ ...cur, [hit.id]: String(next) });
      setScanCount((c) => c + 1);
      setScanMsg({
        ok: true,
        text: `✓ ${hit.item_code} ${hit.item_name ?? ""} → 實盤 ${next}`,
      });
      setHitLineId(hit.id);
      if (hitTimerRef.current) clearTimeout(hitTimerRef.current);
      hitTimerRef.current = setTimeout(() => setHitLineId(null), 1500);
    },
    [codeIndex, setDraft],
  );

  const closeScan = useCallback(() => setScanMode(false), []);

  // unmount 時清掉高亮 timer，避免 setState on unmounted
  useEffect(() => {
    return () => {
      if (hitTimerRef.current) clearTimeout(hitTimerRef.current);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-[#EEECE6] flex items-center gap-2">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">
            填實盤數 ・ <span className="font-mono">{ctNo}</span>
          </h2>
          {/* 掃描 / 手動 切換 */}
          <div className="ml-3 inline-flex rounded-md border border-[#D5D3CB] overflow-hidden">
            <button
              type="button"
              onClick={() => setScanMode(false)}
              disabled={pending}
              className={`h-[26px] px-2.5 text-[11.5px] inline-flex items-center gap-1 disabled:opacity-50 ${
                !scanMode
                  ? "bg-[#1A3A5C] text-white"
                  : "bg-white text-[#5A5955] hover:bg-[#F8F7F4]"
              }`}
            >
              ⌨️ 手動
            </button>
            <button
              type="button"
              onClick={() => setScanMode(true)}
              disabled={pending}
              className={`h-[26px] px-2.5 text-[11.5px] inline-flex items-center gap-1 border-l border-[#D5D3CB] disabled:opacity-50 ${
                scanMode
                  ? "bg-[#0F6E56] text-white"
                  : "bg-white text-[#5A5955] hover:bg-[#F8F7F4]"
              }`}
            >
              📷 掃描盤點
            </button>
          </div>
          {scanMode && (
            <span className="text-[11px] text-[#9A9890]">
              累計掃描 <b className="text-[#2C2C2A]">{scanCount}</b> 次
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="ml-auto w-7 h-7 rounded hover:bg-[#F8F7F4] text-[#9A9890] text-[18px] leading-none disabled:opacity-50"
          >
            ×
          </button>
        </div>
        {/* 掃描區（掃描模式時顯示在表格上方） */}
        {scanMode && (
          <div className="px-5 pt-4">
            <ScanInput onScan={handleScan} onClose={closeScan} />
            {scanMsg && (
              <div
                className={`mt-2 rounded px-3 py-2 text-[12px] border ${
                  scanMsg.ok
                    ? "bg-[#EAF3DE] text-[#3B6D11] border-[#C5DC9F]"
                    : "bg-[#FDECEA] text-[#CC0000] border-[#F5AEAD]"
                }`}
              >
                {scanMsg.text}
              </div>
            )}
          </div>
        )}
        <div className="px-5 py-4">
          <p className="text-[12px] text-[#9A9890] mb-2">
            {scanMode
              ? "比對碼用「料號 item_code」（line 無條碼欄）；掃到命中的料號實盤數自動 +1，下方表格仍可手改。"
              : "預設帶入系統數量；若實盤不同就改寫。提交後算 variance + 進 pending_approval。"}
          </p>
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#F8F7F4] text-[#9A9890]">
              <tr>
                <th className="text-left px-3 py-2 text-[11px] font-semibold">
                  料件
                </th>
                <th className="text-right px-3 py-2 w-[100px] text-[11px] font-semibold">
                  系統
                </th>
                <th className="text-right px-3 py-2 w-[120px] text-[11px] font-semibold">
                  實盤
                </th>
                <th className="text-right px-3 py-2 w-[80px] text-[11px] font-semibold">
                  差異
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const v = draft[l.id] ?? "";
                const final = v === "" ? l.qty_system : Number(v);
                const variance = final - l.qty_system;
                return (
                  <tr
                    key={l.id}
                    className={`border-t border-[#EEECE6] transition-colors ${
                      hitLineId === l.id ? "bg-[#EAF3DE]" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12px] text-[#1A3A5C] font-semibold">
                          {l.item_code ?? "—"}
                        </span>
                        <span className="text-[#5A5955]">
                          {l.item_name ?? ""}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[12px]">
                      {Number(l.qty_system).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="any"
                        value={v}
                        onChange={(e) =>
                          setDraft({ ...draft, [l.id]: e.target.value })
                        }
                        disabled={pending}
                        className="w-24 h-[28px] px-2 border border-[#D5D3CB] rounded text-[12px] text-right focus:outline-none focus:border-[#185FA5]"
                      />
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono text-[12px] ${
                        variance === 0
                          ? "text-[#9A9890]"
                          : variance > 0
                            ? "text-[#3B6D11]"
                            : "text-[#CC0000]"
                      }`}
                    >
                      {variance === 0
                        ? "—"
                        : variance > 0
                          ? `+${variance}`
                          : variance}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-[#EEECE6] flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            {pending ? "提交中⋯" : "提交盤點結果"}
          </button>
        </div>
      </div>
    </div>
  );
}
