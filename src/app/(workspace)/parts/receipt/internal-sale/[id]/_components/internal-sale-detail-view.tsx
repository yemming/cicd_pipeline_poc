"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createInternalSaleReceipt,
  deleteInternalSaleReceipt,
  postInternalSaleReceipt,
  updateInternalSaleReceipt,
  voidInternalSaleReceipt,
  type CreateInternalSaleReceiptInput,
  type CustomerOption,
  type InternalSaleReceiptDetail,
  type IssueOption,
  type ItemOption,
  type WarehouseOption,
} from "@/domain/internal-sale-receipts";
import {
  fmtDate,
  fmtDateTime,
  fmtNT,
  statusChipClass,
  statusLabel,
} from "@/domain/internal-sale-receipts.constants";

type Mode = "view" | "edit" | "create";
type Banner = { ok: boolean; msg: string } | null;

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none w-full";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

type LineDraft = {
  key: string;
  item_id: string;
  qty_received: number;
  unit_cost: number;
  uom: string;
  notes: string;
};

function newLineDraft(): LineDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    item_id: "",
    qty_received: 1,
    unit_cost: 0,
    uom: "個",
    notes: "",
  };
}

function Kv({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <div className={labelClass}>{label}</div>
      <div className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function SectionCard({
  title,
  children,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ {title}</span>
        {actions ? <div className="ml-auto">{actions}</div> : null}
      </header>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

export function InternalSaleDetailView({
  detail,
  canEdit,
  warehouses,
  customers,
  items,
  issues,
  initialMode = "view",
}: {
  detail: InternalSaleReceiptDetail | null;
  canEdit: boolean;
  warehouses: WarehouseOption[];
  customers: CustomerOption[];
  items: ItemOption[];
  issues: IssueOption[];
  initialMode?: Mode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  // edit form state（已過帳或草稿都可改 receipt_date / notes；明細結構不改）
  const [editDate, setEditDate] = useState(detail?.receipt_date ?? "");
  const [editNotes, setEditNotes] = useState(detail?.notes ?? "");

  // create form state
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [cWarehouseId, setCWarehouseId] = useState("");
  const [cCustomerId, setCCustomerId] = useState("");
  const [cIssueId, setCIssueId] = useState("");
  const [cReceiptDate, setCReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [cNotes, setCNotes] = useState("");
  const [cLines, setCLines] = useState<LineDraft[]>([newLineDraft()]);

  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  }

  function startEdit() {
    if (!detail) return;
    setEditDate(detail.receipt_date);
    setEditNotes(detail.notes ?? "");
    setMode("edit");
  }
  function cancelEdit() {
    if (!detail) return;
    setEditDate(detail.receipt_date);
    setEditNotes(detail.notes ?? "");
    setMode("view");
  }
  function saveEdit() {
    if (!detail) return;
    startTransition(async () => {
      const res = await updateInternalSaleReceipt(detail.id, {
        receipt_date: editDate,
        notes: editNotes.trim() ? editNotes.trim() : null,
      });
      if (res.ok) {
        showBanner(true, "✓ 已儲存");
        setMode("view");
        router.refresh();
      } else {
        showBanner(false, `儲存失敗：${res.error}`);
      }
    });
  }

  function handlePost() {
    if (!detail) return;
    startTransition(async () => {
      const res = await postInternalSaleReceipt(detail.id);
      if (res.ok) {
        showBanner(true, "✓ 已過帳，庫存已寫入");
        router.refresh();
      } else {
        showBanner(false, `過帳失敗：${res.error}`);
      }
    });
  }
  function confirmVoid() {
    if (!detail) return;
    const reason = voidReason;
    startTransition(async () => {
      const res = await voidInternalSaleReceipt(detail.id, reason);
      if (res.ok) {
        showBanner(true, "✓ 已作廢，庫存已沖回");
        setShowVoid(false);
        setVoidReason("");
        router.refresh();
      } else {
        showBanner(false, `作廢失敗：${res.error}`);
      }
    });
  }
  function confirmDelete() {
    if (!detail) return;
    startTransition(async () => {
      const res = await deleteInternalSaleReceipt(detail.id);
      if (res.ok) {
        showBanner(true, "✓ 已刪除，2 秒後返回列表");
        setShowDelete(false);
        setTimeout(() => router.push("/parts/receipt/internal-sale"), 1500);
      } else {
        showBanner(false, `刪除失敗：${res.error}`);
        setShowDelete(false);
      }
    });
  }

  // create
  function addLine() {
    setCLines((ls) => [...ls, newLineDraft()]);
  }
  function removeLine(key: string) {
    setCLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  }
  function updateLine(key: string, patch: Partial<LineDraft>) {
    setCLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        // 自動填 uom
        if (patch.item_id) {
          const it = itemMap.get(patch.item_id);
          if (it?.uom) next.uom = it.uom;
        }
        return next;
      }),
    );
  }
  const cTotalQty = cLines.reduce((s, l) => s + (Number(l.qty_received) || 0), 0);
  const cTotalAmount = cLines.reduce(
    (s, l) => s + (Number(l.qty_received) || 0) * (Number(l.unit_cost) || 0),
    0,
  );

  function submitCreate() {
    if (!cWarehouseId) {
      showBanner(false, "請選擇入庫倉");
      return;
    }
    if (cLines.some((l) => !l.item_id)) {
      showBanner(false, "請為每一行選擇品項");
      return;
    }
    const input: CreateInternalSaleReceiptInput = {
      warehouse_id: cWarehouseId,
      customer_id: cCustomerId || null,
      source_issue_id: cIssueId || null,
      receipt_date: cReceiptDate,
      notes: cNotes.trim() ? cNotes.trim() : null,
      lines: cLines.map((l) => ({
        item_id: l.item_id,
        qty_received: Number(l.qty_received) || 0,
        unit_cost: Number(l.unit_cost) || 0,
        uom: l.uom || "個",
        notes: l.notes.trim() ? l.notes.trim() : null,
      })),
    };
    startTransition(async () => {
      const res = await createInternalSaleReceipt(input);
      if (res.ok) {
        showBanner(true, `✓ ${res.data.doc_no} 已建立（草稿）`);
        setTimeout(() => router.push(`/parts/receipt/internal-sale/${res.data.id}`), 800);
      } else {
        showBanner(false, `建立失敗：${res.error}`);
      }
    });
  }

  const headerDocNo = detail?.doc_no ?? "（未建立）";
  const headerStatus = detail?.status ?? "draft";
  const modeBadge =
    mode === "edit" ? (
      <span className="px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B] font-medium">
        編輯模式
      </span>
    ) : mode === "create" ? (
      <span className="px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B] font-medium">
        建立模式
      </span>
    ) : null;

  return (
    <main className={`px-6 py-5 space-y-3 ${pending ? "pointer-events-none opacity-60" : ""}`}>
      {/* 1. Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/receipt/internal-sale" className="hover:text-[#185FA5]">
            內售入庫
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">
            {mode === "create" ? "新增內售入庫" : headerDocNo}
          </span>
          {modeBadge}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {mode === "view" && detail && (
            <>
              <Link
                href="/parts/receipt/internal-sale"
                className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              {canEdit && (
                <>
                  <Link
                    href="/parts/receipt/internal-sale/new"
                    className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
                  >
                    新增
                  </Link>
                  <button
                    type="button"
                    onClick={startEdit}
                    className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm"
                  >
                    修改
                  </button>
                  {detail.status === "draft" && (
                    <>
                      <button
                        type="button"
                        onClick={handlePost}
                        disabled={pending}
                        className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
                      >
                        {pending ? "過帳中⋯" : "過帳"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDelete(true)}
                        className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm"
                      >
                        刪除
                      </button>
                    </>
                  )}
                  {detail.status === "completed" && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowVoid(true);
                        setVoidReason("");
                      }}
                      className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm"
                    >
                      作廢
                    </button>
                  )}
                </>
              )}
            </>
          )}
          {mode === "edit" && (
            <>
              <button
                type="button"
                onClick={cancelEdit}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={pending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {pending ? "儲存中⋯" : "儲存變更"}
              </button>
            </>
          )}
          {mode === "create" && (
            <>
              <Link
                href="/parts/receipt/internal-sale"
                className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                取消
              </Link>
              <button
                type="button"
                onClick={submitCreate}
                disabled={pending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {pending ? "建立中⋯" : "建立並開啟"}
              </button>
            </>
          )}
        </div>
      </div>

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

      {/* 2. Title Card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">內售入庫單</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight font-mono">
                {mode === "create" ? "（建立中）" : headerDocNo}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                {mode !== "create" && (
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${statusChipClass(
                      headerStatus,
                    )}`}
                  >
                    {statusLabel(headerStatus)}
                  </span>
                )}
                {detail?.source_label && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
                    來源：{detail.source_label}
                  </span>
                )}
                {detail?.warehouse_name && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                    {detail.warehouse_name}
                  </span>
                )}
                {detail && (
                  <>
                    <span className="text-[#9A9890]">·</span>
                    <span className="text-[#5A5955] font-mono">
                      {fmtDate(detail.receipt_date)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="shrink-0 w-[260px] h-[120px] bg-[#F8F7F4] border border-[#EEECE6] rounded-lg flex flex-col items-center justify-center gap-1">
            <div className="text-[11px] text-[#9A9890]">入庫總金額</div>
            <div className="text-[20px] font-semibold text-[#1A3A5C] font-mono">
              {mode === "create" ? fmtNT(cTotalAmount) : fmtNT(detail?.amount_total ?? 0)}
            </div>
            <div className="text-[11px] text-[#9A9890]">
              共 {mode === "create" ? cTotalQty : detail?.qty_total ?? 0} 件
            </div>
          </div>
        </div>
      </header>

      {mode === "view" && detail && (
        <>
          {/* 3. 基本資訊 */}
          <SectionCard title="基本資訊">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv label="入庫單號" value={detail.doc_no} mono />
              <Kv
                label="狀態"
                value={
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${statusChipClass(
                      detail.status,
                    )}`}
                  >
                    {statusLabel(detail.status)}
                  </span>
                }
              />
              <Kv
                label="入庫日期"
                value={<span className="font-mono">{fmtDate(detail.receipt_date)}</span>}
              />
              <Kv label="入庫倉" value={detail.warehouse_name ?? "—"} />
              <Kv label="退貨客戶" value={detail.customer_name ?? "—"} />
              <Kv label="來源單" value={detail.source_label ?? "—"} />
              <Kv
                label="入庫總量"
                value={<span className="font-mono">{detail.qty_total} 件</span>}
              />
              <Kv
                label="入庫金額"
                value={<span className="font-mono">{fmtNT(detail.amount_total)}</span>}
              />
              <Kv label="建立時間" value={fmtDateTime(detail.created_at)} mono />
              {detail.posted_at && (
                <>
                  <Kv label="過帳時間" value={fmtDateTime(detail.posted_at)} mono />
                  <Kv label="過帳人" value={detail.posted_by_name ?? "—"} />
                  <div></div>
                </>
              )}
              {detail.voided_at && (
                <>
                  <Kv label="作廢時間" value={fmtDateTime(detail.voided_at)} mono />
                  <Kv label="作廢人" value={detail.voided_by_name ?? "—"} />
                  <Kv label="作廢原因" value={detail.void_reason ?? "—"} />
                </>
              )}
              <div className="col-span-1 md:col-span-3">
                <div className={`${labelClass} mb-1`}>備註</div>
                <div className="text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap min-h-[20px]">
                  {detail.notes ?? <span className="text-[#9A9890]">—</span>}
                </div>
              </div>
            </div>
          </SectionCard>

          {/* 4. 明細 */}
          <SectionCard title="入庫明細">
            {detail.lines.length === 0 ? (
              <div className="text-[12px] text-[#9A9890] py-2">此單無明細</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-[#EEECE6] text-[11px] text-[#9A9890]">
                      <th className="py-2 text-left px-2 w-10">#</th>
                      <th className="py-2 text-left px-2 w-32">品項代碼</th>
                      <th className="py-2 text-left px-2">品名</th>
                      <th className="py-2 text-right px-2 w-20">數量</th>
                      <th className="py-2 text-left px-2 w-14">單位</th>
                      <th className="py-2 text-right px-2 w-24">單價</th>
                      <th className="py-2 text-right px-2 w-28">小計</th>
                      <th className="py-2 text-left px-2">備註</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l) => (
                      <tr key={l.id} className="border-b border-[#F4F2EC]">
                        <td className="py-2 px-2 text-[#9A9890]">{l.line_no}</td>
                        <td className="py-2 px-2 font-mono text-[#185FA5]">
                          {l.item_code ?? "—"}
                        </td>
                        <td className="py-2 px-2 text-[#2C2C2A]">{l.item_name ?? "—"}</td>
                        <td className="py-2 px-2 text-right font-mono">
                          {l.qty_received.toLocaleString("en-US")}
                        </td>
                        <td className="py-2 px-2 text-[#5A5955]">{l.uom}</td>
                        <td className="py-2 px-2 text-right font-mono">{fmtNT(l.unit_cost)}</td>
                        <td className="py-2 px-2 text-right font-mono">{fmtNT(l.line_amount)}</td>
                        <td className="py-2 px-2 text-[#5A5955]">{l.notes ?? "—"}</td>
                      </tr>
                    ))}
                    <tr className="bg-[#F8F7F4]">
                      <td colSpan={3} className="py-2 px-2 font-semibold text-[#5A5955]">
                        合計
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-semibold">
                        {detail.qty_total.toLocaleString("en-US")}
                      </td>
                      <td></td>
                      <td></td>
                      <td className="py-2 px-2 text-right font-mono font-semibold">
                        {fmtNT(detail.amount_total)}
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}

      {mode === "edit" && detail && (
        <SectionCard title="基本資訊（編輯中）">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
            <Kv label="入庫單號（不可改）" value={detail.doc_no} mono />
            <Kv label="入庫倉（不可改）" value={detail.warehouse_name ?? "—"} />
            <div>
              <div className={labelClass}>入庫日期</div>
              <input
                type="date"
                className={inputClass}
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </div>
            <div className="col-span-1 md:col-span-3">
              <div className={`${labelClass} mb-1`}>備註</div>
              <textarea
                className="w-full border border-[#D5D3CB] rounded p-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                rows={3}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
              />
            </div>
          </div>
          <p className="text-[11px] text-[#9A9890] mt-3">
            提示：明細結構（品項／數量／單價）已過帳後不可修改。如需修改請作廢後重新建立。
          </p>
        </SectionCard>
      )}

      {mode === "create" && (
        <>
          <SectionCard title="基本資訊">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <div>
                <div className={labelClass}>
                  入庫倉 <span className="text-[#CC0000]">*</span>
                </div>
                <select
                  className={inputClass}
                  value={cWarehouseId}
                  onChange={(e) => setCWarehouseId(e.target.value)}
                >
                  <option value="">請選擇</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}（{w.code}）
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className={labelClass}>退貨客戶</div>
                <select
                  className={inputClass}
                  value={cCustomerId}
                  onChange={(e) => setCCustomerId(e.target.value)}
                >
                  <option value="">（選填）</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.code ? `（${c.code}）` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className={labelClass}>來源出貨單</div>
                <select
                  className={inputClass}
                  value={cIssueId}
                  onChange={(e) => setCIssueId(e.target.value)}
                >
                  <option value="">（選填）</option>
                  {issues.map((iss) => (
                    <option key={iss.id} value={iss.id}>
                      {iss.doc_no}
                      {iss.customer_label ? ` · ${iss.customer_label}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className={labelClass}>入庫日期</div>
                <input
                  type="date"
                  className={inputClass}
                  value={cReceiptDate}
                  onChange={(e) => setCReceiptDate(e.target.value)}
                />
              </div>
              <div className="col-span-1 md:col-span-3">
                <div className={`${labelClass} mb-1`}>備註</div>
                <textarea
                  className="w-full border border-[#D5D3CB] rounded p-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                  rows={2}
                  placeholder="（選填）"
                  value={cNotes}
                  onChange={(e) => setCNotes(e.target.value)}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="入庫明細"
            actions={
              <button
                type="button"
                onClick={addLine}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                ＋ 新增一行
              </button>
            }
          >
            {cLines.length === 0 ? (
              <div className="text-[12px] text-[#9A9890] py-2">尚無明細</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-[#EEECE6] text-[11px] text-[#9A9890]">
                      <th className="py-2 text-left px-2 w-10">#</th>
                      <th className="py-2 text-left px-2">
                        品項 <span className="text-[#CC0000]">*</span>
                      </th>
                      <th className="py-2 text-right px-2 w-24">
                        數量 <span className="text-[#CC0000]">*</span>
                      </th>
                      <th className="py-2 text-left px-2 w-16">單位</th>
                      <th className="py-2 text-right px-2 w-28">
                        單價 <span className="text-[#CC0000]">*</span>
                      </th>
                      <th className="py-2 text-right px-2 w-28">小計</th>
                      <th className="py-2 text-left px-2">備註</th>
                      <th className="py-2 px-2 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cLines.map((l, idx) => {
                      const subtotal =
                        (Number(l.qty_received) || 0) * (Number(l.unit_cost) || 0);
                      return (
                        <tr key={l.key} className="border-b border-[#F4F2EC]">
                          <td className="py-2 px-2 text-[#9A9890]">{idx + 1}</td>
                          <td className="py-2 px-2">
                            <select
                              className={inputClass}
                              value={l.item_id}
                              onChange={(e) => updateLine(l.key, { item_id: e.target.value })}
                            >
                              <option value="">請選擇</option>
                              {items.map((it) => (
                                <option key={it.id} value={it.id}>
                                  {it.code} · {it.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              className={`${inputClass} text-right font-mono`}
                              value={l.qty_received}
                              onChange={(e) =>
                                updateLine(l.key, {
                                  qty_received: Number(e.target.value) || 0,
                                })
                              }
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              className={inputClass}
                              value={l.uom}
                              onChange={(e) => updateLine(l.key, { uom: e.target.value })}
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              className={`${inputClass} text-right font-mono`}
                              value={l.unit_cost}
                              onChange={(e) =>
                                updateLine(l.key, {
                                  unit_cost: Number(e.target.value) || 0,
                                })
                              }
                            />
                          </td>
                          <td className="py-2 px-2 text-right font-mono">
                            {fmtNT(subtotal)}
                          </td>
                          <td className="py-2 px-2">
                            <input
                              className={inputClass}
                              placeholder="（選填）"
                              value={l.notes}
                              onChange={(e) => updateLine(l.key, { notes: e.target.value })}
                            />
                          </td>
                          <td className="py-2 px-2">
                            <button
                              type="button"
                              onClick={() => removeLine(l.key)}
                              disabled={cLines.length <= 1}
                              className="h-[26px] px-2 rounded text-[11px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-40"
                            >
                              移除
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-[#F8F7F4]">
                      <td colSpan={2} className="py-2 px-2 font-semibold text-[#5A5955]">
                        合計
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-semibold">
                        {cTotalQty.toLocaleString("en-US")}
                      </td>
                      <td></td>
                      <td></td>
                      <td className="py-2 px-2 text-right font-mono font-semibold">
                        {fmtNT(cTotalAmount)}
                      </td>
                      <td></td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-[#9A9890] mt-3">
              提示：建立後為「草稿」狀態。確認無誤後執行「過帳」才會寫入庫存。
            </p>
          </SectionCard>
        </>
      )}

      {/* Void Modal */}
      {showVoid && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center px-4">
          <div className="bg-white rounded-lg shadow-xl w-[480px] max-w-full">
            <header className="px-5 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">作廢內售入庫單</h3>
            </header>
            <div className="px-5 py-4 space-y-3">
              <p className="text-[12.5px] text-[#5A5955]">
                即將作廢 <span className="font-mono font-semibold">{detail?.doc_no}</span>
                ，已寫入的庫存將沖回。請填寫作廢原因：
              </p>
              <textarea
                className="w-full border border-[#D5D3CB] rounded p-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                rows={3}
                placeholder="例如：客戶要求重新整理單據⋯"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
              />
            </div>
            <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowVoid(false);
                  setVoidReason("");
                }}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmVoid}
                disabled={pending || !voidReason.trim()}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#A30000] disabled:opacity-60"
              >
                {pending ? "作廢中⋯" : "確認作廢"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center px-4">
          <div className="bg-white rounded-lg shadow-xl w-[420px] max-w-full">
            <header className="px-5 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">刪除草稿單</h3>
            </header>
            <div className="px-5 py-4 text-[12.5px] text-[#5A5955]">
              確認刪除草稿{" "}
              <span className="font-mono font-semibold">{detail?.doc_no}</span>？此操作不可復原。
            </div>
            <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={pending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#A30000] disabled:opacity-60"
              >
                {pending ? "刪除中⋯" : "確認刪除"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </main>
  );
}
