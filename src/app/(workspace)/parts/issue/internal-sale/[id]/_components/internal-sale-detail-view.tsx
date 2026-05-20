"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateIssue, voidIssue } from "@/domain/issues";
import {
  setDeliveryStatus,
  updateInternalSaleDelivery,
  type InternalSaleIssueDetail,
  type InternalSaleIssueLine,
  type StoreOption,
} from "@/domain/internal-sale-issues";
import {
  deliveryStatusChipClass,
  deliveryStatusLabel,
  estimateDeliveryEta,
  fmtDate,
  fmtDateTime,
  fmtEtaDelta,
  fmtMoney,
  issueStatusChipClass,
  issueStatusLabel,
} from "@/domain/internal-sale-issues.constants";
import { KpiCard } from "@/components/visualization/KpiCard";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit";

export function InternalSaleDetailView({
  issue,
  destinationStores,
  canEdit,
}: {
  issue: InternalSaleIssueDetail;
  destinationStores: StoreOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("view");
  const [banner, setBanner] = useState<Banner>(null);
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  // edit-mode fields
  const [editNotes, setEditNotes] = useState(issue.notes ?? "");
  const [editLineNotes, setEditLineNotes] = useState<Record<string, string>>(
    Object.fromEntries(issue.lines.map((l) => [l.id, l.notes ?? ""])),
  );
  const [editDestStoreId, setEditDestStoreId] = useState(issue.destination_store_id ?? "");
  const [editEtaAt, setEditEtaAt] = useState(toDatetimeLocal(issue.delivery_eta_at));
  const [editAddress, setEditAddress] = useState(issue.delivery_address ?? "");
  const [editRecipientName, setEditRecipientName] = useState(issue.recipient_name ?? "");
  const [editRecipientPhone, setEditRecipientPhone] = useState(issue.recipient_phone ?? "");
  const [editDeliveryStatus, setEditDeliveryStatus] = useState(issue.delivery_status ?? "");

  const isCancelled = issue.status === "cancelled";

  function showBanner(b: Banner, autoCloseMs?: number) {
    setBanner(b);
    if (b?.ok && autoCloseMs) window.setTimeout(() => setBanner(null), autoCloseMs);
  }

  function enterEdit() {
    setEditNotes(issue.notes ?? "");
    setEditLineNotes(Object.fromEntries(issue.lines.map((l) => [l.id, l.notes ?? ""])));
    setEditDestStoreId(issue.destination_store_id ?? "");
    setEditEtaAt(toDatetimeLocal(issue.delivery_eta_at));
    setEditAddress(issue.delivery_address ?? "");
    setEditRecipientName(issue.recipient_name ?? "");
    setEditRecipientPhone(issue.recipient_phone ?? "");
    setEditDeliveryStatus(issue.delivery_status ?? "");
    setMode("edit");
  }
  function cancelEdit() {
    setMode("view");
    setBanner(null);
  }

  function saveEdit() {
    // 1) 收集 notes / line_notes 變動
    const changedLines = issue.lines
      .map((l) => ({
        id: l.id,
        notes: (editLineNotes[l.id] ?? "").trim() || null,
        original: (l.notes ?? "").trim() || null,
      }))
      .filter((l) => l.notes !== l.original)
      .map((l) => ({ id: l.id, notes: l.notes }));
    const headerChanged =
      (editNotes.trim() || null) !== ((issue.notes ?? "").trim() || null);

    // 2) 收集 delivery 變動
    const deliveryPatch: Parameters<typeof updateInternalSaleDelivery>[1] = {};
    if ((editDestStoreId || null) !== (issue.destination_store_id || null)) {
      deliveryPatch.destination_store_id = editDestStoreId || null;
    }
    const etaIso = fromDatetimeLocal(editEtaAt);
    if ((etaIso || null) !== (issue.delivery_eta_at || null)) {
      deliveryPatch.delivery_eta_at = etaIso;
    }
    if ((editAddress.trim() || null) !== ((issue.delivery_address ?? "").trim() || null)) {
      deliveryPatch.delivery_address = editAddress.trim() || null;
    }
    if (
      (editRecipientName.trim() || null) !== ((issue.recipient_name ?? "").trim() || null)
    ) {
      deliveryPatch.recipient_name = editRecipientName.trim() || null;
    }
    if (
      (editRecipientPhone.trim() || null) !== ((issue.recipient_phone ?? "").trim() || null)
    ) {
      deliveryPatch.recipient_phone = editRecipientPhone.trim() || null;
    }
    if ((editDeliveryStatus || null) !== (issue.delivery_status || null)) {
      deliveryPatch.delivery_status = editDeliveryStatus || null;
    }

    const hasNotesChange = headerChanged || changedLines.length > 0;
    const hasDeliveryChange = Object.keys(deliveryPatch).length > 0;
    if (!hasNotesChange && !hasDeliveryChange) {
      showBanner({ ok: true, msg: "沒有變更" }, 1800);
      setMode("view");
      return;
    }

    startTransition(async () => {
      // notes / line_notes 走既有 updateIssue
      if (hasNotesChange) {
        const patch: { notes?: string | null; line_notes?: typeof changedLines } = {};
        if (headerChanged) patch.notes = editNotes.trim() || null;
        if (changedLines.length > 0) patch.line_notes = changedLines;
        const res = await updateIssue(issue.id, patch);
        if (!res.ok) {
          showBanner({ ok: false, msg: `備註儲存失敗：${res.error}` });
          return;
        }
      }
      // delivery 走新 helper
      if (hasDeliveryChange) {
        const res = await updateInternalSaleDelivery(issue.id, deliveryPatch);
        if (!res.ok) {
          showBanner({ ok: false, msg: `配送資訊儲存失敗：${res.error}` });
          return;
        }
      }
      showBanner({ ok: true, msg: "✓ 已儲存" }, 2200);
      setMode("view");
      router.refresh();
    });
  }

  function confirmVoid() {
    const reason = voidReason.trim();
    if (!reason) {
      showBanner({ ok: false, msg: "請填寫取消原因" });
      return;
    }
    startTransition(async () => {
      const res = await voidIssue(issue.id, reason);
      if (res.ok) {
        // 一併把 delivery_status 標為 cancelled
        await setDeliveryStatus(issue.id, "cancelled");
        setVoidModalOpen(false);
        setVoidReason("");
        showBanner({ ok: true, msg: "✓ 已取消出庫、配送狀態已同步" }, 2200);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: `取消失敗：${res.error}` });
      }
    });
  }

  function quickEstimateEta() {
    const dest = destinationStores.find((s) => s.id === editDestStoreId);
    const { eta_at, hours, rule } = estimateDeliveryEta({
      warehouse_code: issue.warehouse_code,
      destination_store_code: dest?.code ?? null,
    });
    setEditEtaAt(toDatetimeLocal(eta_at));
    showBanner(
      { ok: true, msg: `已估算：${rule} → ${hours}h（可手動微調）` },
      2200,
    );
  }

  const totalQty = issue.lines.reduce((s, l) => s + Number(l.qty_issued ?? 0), 0);
  const totalAmount = issue.lines.reduce((s, l) => s + Number(l.line_amount ?? 0), 0);
  const lineCount = issue.lines.length;

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      {/* Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/issue/internal-sale" className="hover:text-[#185FA5]">
            內售出貨
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{issue.gi_no}</span>
          {mode === "edit" ? (
            <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
              編輯模式
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {mode === "view" ? (
            <>
              <Link
                href="/parts/issue/internal-sale"
                className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <Link
                href="/parts/issue/internal-sale/new"
                className={`h-[30px] px-4 rounded-full text-[12px] font-medium inline-flex items-center shadow-sm ${
                  canEdit
                    ? "bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                    : "bg-[#0F6E56] text-white opacity-50 pointer-events-none"
                }`}
              >
                ＋ 新增內售出貨
              </Link>
              <button
                type="button"
                onClick={enterEdit}
                disabled={!canEdit || isCancelled}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                onClick={() => setVoidModalOpen(true)}
                disabled={!canEdit || isCancelled}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                取消出庫
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={saveEdit}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {isPending ? "儲存中⋯" : "儲存變更"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                取消
              </button>
            </>
          )}
        </div>
      </div>

      {/* Title Card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">內售出貨單</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight font-mono">
                {issue.gi_no}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${issueStatusChipClass(
                    issue.status,
                  )}`}
                >
                  {issueStatusLabel(issue.status)}
                </span>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${deliveryStatusChipClass(
                    issue.delivery_status,
                  )}`}
                >
                  {deliveryStatusLabel(issue.delivery_status)}
                </span>
                {issue.destination_store_name ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
                    收貨：{issue.destination_store_name}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">
                    未指定門店
                  </span>
                )}
                <span className="text-[#9A9890]">·</span>
                <span className="text-[#5A5955]">{issue.warehouse_name ?? "—"}</span>
                <span className="text-[#9A9890]">·</span>
                <span className="text-[#5A5955] font-mono">{fmtDate(issue.issue_date)}</span>
              </div>
            </div>
          </div>
          <div className="shrink-0 w-[260px] h-[120px] bg-[#F8F7F4] border border-[#EEECE6] rounded-lg flex flex-col items-center justify-center gap-1">
            <div className="text-[11px] text-[#9A9890]">結算總金額</div>
            <div className="text-[20px] font-semibold text-[#1A3A5C] font-mono">
              {fmtMoney(totalAmount)}
            </div>
            <div className="text-[11px] text-[#9A9890]">
              共 {lineCount} 筆明細 / {totalQty} 件
            </div>
          </div>
        </div>
      </header>

      {/* KPI Strip — 配送進度視覺 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiCard
          label="預估送達"
          value={fmtEtaDelta(issue.delivery_eta_at)}
          tone={
            issue.delivery_status === "delivered"
              ? "green"
              : issue.delivery_status === "in_transit"
              ? "blue"
              : "gray"
          }
          layout="vertical"
        />
        <KpiCard
          label="配送狀態"
          value={deliveryStatusLabel(issue.delivery_status)}
          tone={
            issue.delivery_status === "delivered"
              ? "green"
              : issue.delivery_status === "in_transit"
              ? "blue"
              : issue.delivery_status === "cancelled"
              ? "red"
              : "amber"
          }
          layout="vertical"
        />
        <KpiCard
          label="明細筆數"
          value={lineCount}
          tone="purple"
          layout="vertical"
        />
        <KpiCard
          label="GL 過帳"
          value={issue.gl_posted ? "已過帳" : "未過帳"}
          tone={issue.gl_posted ? "teal" : "gray"}
          layout="vertical"
        />
      </div>

      {/* 基本資訊 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資訊</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="出貨單號" value={issue.gi_no} mono />
          <Kv
            label="單據狀態"
            value={
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${issueStatusChipClass(
                  issue.status,
                )}`}
              >
                {issueStatusLabel(issue.status)}
              </span>
            }
          />
          <Kv label="出庫日" value={fmtDate(issue.issue_date)} mono />
          <Kv label="買方" value={issue.customer_name ?? <span className="text-[#9A9890]">未指定</span>} />
          <Kv label="出庫倉" value={issue.warehouse_name ?? "—"} />
          <div />
          <Kv label="過帳時間" value={fmtDateTime(issue.posted_at)} mono />
          <Kv label="過帳人員" value={issue.posted_by_name ?? "—"} />
          <Kv label="GL 過帳狀態" value={issue.gl_posted ? "已過帳" : "未過帳"} />
          {isCancelled ? (
            <>
              <Kv label="取消時間" value={fmtDateTime(issue.voided_at)} mono />
              <Kv label="取消人員" value={issue.voided_by_name ?? "—"} />
              <Kv label="取消原因" value={issue.void_reason ?? "—"} />
            </>
          ) : null}
          <div className="col-span-1 md:col-span-3">
            <div className="text-[11px] text-[#9A9890] font-medium mb-1">用途備註</div>
            {mode === "edit" ? (
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
                className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
              />
            ) : (
              <div className="text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap min-h-[20px]">
                {issue.notes ?? <span className="text-[#9A9890]">—</span>}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 配送資訊（M04U-20 新增） */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 配送資訊</span>
          {mode === "view" && issue.delivery_eta_at ? (
            <span className="text-[11px] text-[#9A9890]">
              · {fmtEtaDelta(issue.delivery_eta_at)}
            </span>
          ) : null}
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            {mode === "edit" ? (
              <>
                <EditField label="收貨門店">
                  <select
                    value={editDestStoreId}
                    onChange={(e) => setEditDestStoreId(e.target.value)}
                    className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                  >
                    <option value="">— 不指定 —</option>
                    {destinationStores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code ? `${s.code} ` : ""}
                        {s.name}
                      </option>
                    ))}
                  </select>
                </EditField>
                <EditField
                  label="預估送達"
                  trailing={
                    <button
                      type="button"
                      onClick={quickEstimateEta}
                      className="h-[26px] px-2 rounded text-[11px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                    >
                      估算 →
                    </button>
                  }
                >
                  <input
                    type="datetime-local"
                    value={editEtaAt}
                    onChange={(e) => setEditEtaAt(e.target.value)}
                    className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                  />
                </EditField>
                <EditField label="收件人姓名">
                  <input
                    type="text"
                    value={editRecipientName}
                    onChange={(e) => setEditRecipientName(e.target.value)}
                    placeholder="—"
                    className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                  />
                </EditField>
                <EditField label="收件人電話">
                  <input
                    type="tel"
                    value={editRecipientPhone}
                    onChange={(e) => setEditRecipientPhone(e.target.value)}
                    placeholder="0912-345-678"
                    className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] font-mono focus:border-[#185FA5] outline-none"
                  />
                </EditField>
                <EditField label="配送地址" wide>
                  <input
                    type="text"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    placeholder="—"
                    className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                  />
                </EditField>
                <EditField label="配送狀態">
                  <select
                    value={editDeliveryStatus}
                    onChange={(e) => setEditDeliveryStatus(e.target.value)}
                    className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                  >
                    <option value="">— 未指定 —</option>
                    <option value="pending">待出貨</option>
                    <option value="in_transit">查收中</option>
                    <option value="delivered">已送達</option>
                    <option value="cancelled">已取消</option>
                  </select>
                </EditField>
              </>
            ) : (
              <>
                <Kv
                  label="收貨門店"
                  value={
                    issue.destination_store_name ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
                        {issue.destination_store_name}
                      </span>
                    ) : (
                      <span className="text-[#9A9890]">未指定</span>
                    )
                  }
                />
                <Kv
                  label="預估送達"
                  value={
                    issue.delivery_eta_at ? (
                      <span className="font-mono">
                        {fmtDateTime(issue.delivery_eta_at)}{" "}
                        <span className="text-[#9A9890]">
                          （{fmtEtaDelta(issue.delivery_eta_at)}）
                        </span>
                      </span>
                    ) : (
                      <span className="text-[#9A9890]">未排定</span>
                    )
                  }
                />
                <Kv
                  label="收件人姓名"
                  value={issue.recipient_name ?? <span className="text-[#9A9890]">—</span>}
                />
                <Kv
                  label="收件人電話"
                  value={
                    issue.recipient_phone ? (
                      <span className="font-mono">{issue.recipient_phone}</span>
                    ) : (
                      <span className="text-[#9A9890]">—</span>
                    )
                  }
                />
                <div className="col-span-1 md:col-span-2">
                  <Kv
                    label="配送地址"
                    value={
                      issue.delivery_address ?? <span className="text-[#9A9890]">—</span>
                    }
                  />
                </div>
                <Kv
                  label="配送狀態"
                  value={
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${deliveryStatusChipClass(
                        issue.delivery_status,
                      )}`}
                    >
                      {deliveryStatusLabel(issue.delivery_status)}
                    </span>
                  }
                />
              </>
            )}
          </div>

          {/* 配送門店地圖 placeholder（POC：純 SVG 模擬，未串 Google Maps） */}
          <MapPlaceholder
            destinationName={issue.destination_store_name}
            destinationAddress={issue.delivery_address}
            etaLabel={fmtEtaDelta(issue.delivery_eta_at)}
            deliveryStatus={issue.delivery_status}
          />
        </div>
      </section>

      {/* Tabs */}
      <Tabs
        lines={issue.lines}
        mode={mode}
        editLineNotes={editLineNotes}
        setEditLineNotes={setEditLineNotes}
        totalQty={totalQty}
        totalAmount={totalAmount}
      />

      {/* Banner */}
      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-[110] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* Void Modal */}
      {voidModalOpen ? (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]"
          onClick={() => !isPending && setVoidModalOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-[440px] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">取消出庫</h3>
            </header>
            <div className="px-4 py-4 space-y-3">
              <p className="text-[12.5px] text-[#5A5955] leading-relaxed">
                取消後將：
              </p>
              <ul className="text-[12.5px] text-[#5A5955] list-disc list-inside space-y-1 ml-2">
                <li>把 <b>{lineCount} 筆明細</b>（共 {totalQty} 件）以 available 狀態建回出庫倉</li>
                <li>配送狀態同步標為「已取消」</li>
                <li>單據狀態變為「已作廢」、不可再修改</li>
              </ul>
              <div>
                <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                  取消原因 <span className="text-[#CC0000]">*</span>
                </label>
                <textarea
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  rows={3}
                  placeholder="例如：員工退回、誤出貨⋯"
                  className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
                  autoFocus
                />
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVoidModalOpen(false)}
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                返回
              </button>
              <button
                type="button"
                onClick={confirmVoid}
                disabled={isPending || !voidReason.trim()}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#A30000] disabled:opacity-50"
              >
                {isPending ? "取消中⋯" : "確認取消出庫"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// 子元件
// ─────────────────────────────────────────────────────────────
function Tabs({
  lines,
  mode,
  editLineNotes,
  setEditLineNotes,
  totalQty,
  totalAmount,
}: {
  lines: InternalSaleIssueLine[];
  mode: Mode;
  editLineNotes: Record<string, string>;
  setEditLineNotes: (next: Record<string, string>) => void;
  totalQty: number;
  totalAmount: number;
}) {
  const [tab, setTab] = useState<"lines" | "audit">("lines");
  return (
    <>
      <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
        <div className="flex border-b border-[#EEECE6]">
          <button
            type="button"
            onClick={() => setTab("lines")}
            className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] ${
              tab === "lines"
                ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                : "text-[#5A5955] hover:bg-[#F8F7F4]"
            }`}
          >
            出貨明細（{lines.length}）
          </button>
          <button
            type="button"
            onClick={() => setTab("audit")}
            className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap ${
              tab === "audit"
                ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                : "text-[#5A5955] hover:bg-[#F8F7F4]"
            }`}
          >
            異動紀錄
          </button>
        </div>
      </div>
      <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
        {tab === "lines" ? (
          <LinesTable
            lines={lines}
            mode={mode}
            editLineNotes={editLineNotes}
            setEditLineNotes={setEditLineNotes}
            totalQty={totalQty}
            totalAmount={totalAmount}
          />
        ) : (
          <div className="text-[12px] text-[#9A9890] py-8 text-center">
            異動紀錄功能待開發
          </div>
        )}
      </div>
    </>
  );
}

function LinesTable({
  lines,
  mode,
  editLineNotes,
  setEditLineNotes,
  totalQty,
  totalAmount,
}: {
  lines: InternalSaleIssueLine[];
  mode: Mode;
  editLineNotes: Record<string, string>;
  setEditLineNotes: (next: Record<string, string>) => void;
  totalQty: number;
  totalAmount: number;
}) {
  if (lines.length === 0) {
    return <div className="text-[12px] text-[#9A9890] py-8 text-center">無明細</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="border-b border-[#EEECE6] bg-[#F8F7F4]">
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[50px]">行號</th>
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[120px]">品項代碼</th>
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium">品項名稱</th>
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[100px]">倉位</th>
            <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[80px]">出貨數</th>
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[60px]">單位</th>
            <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[100px]">原價（成本）</th>
            <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[100px]">結算單價</th>
            <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[120px]">金額</th>
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium">備註</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-[#EEECE6] hover:bg-[#F8F7F4]/60">
              <td className="px-2 py-2 font-mono text-[#9A9890]">{l.line_no}</td>
              <td className="px-2 py-2 font-mono font-semibold text-[#1A3A5C]">{l.item_code ?? "—"}</td>
              <td className="px-2 py-2">{l.item_name ?? "—"}</td>
              <td className="px-2 py-2 font-mono text-[#5A5955]">{l.bin_label ?? "—"}</td>
              <td className="px-2 py-2 text-right font-mono">{l.qty_issued}</td>
              <td className="px-2 py-2 text-[#5A5955]">{l.uom}</td>
              <td className="px-2 py-2 text-right font-mono text-[#9A9890]">
                {l.unit_cost === null ? "—" : Number(l.unit_cost).toLocaleString("en-US")}
              </td>
              <td className="px-2 py-2 text-right font-mono">
                {l.unit_price === null ? "—" : Number(l.unit_price).toLocaleString("en-US")}
              </td>
              <td className="px-2 py-2 text-right font-mono">
                {l.line_amount === null ? "—" : Number(l.line_amount).toLocaleString("en-US")}
              </td>
              <td className="px-2 py-2">
                {mode === "edit" ? (
                  <input
                    type="text"
                    value={editLineNotes[l.id] ?? ""}
                    onChange={(e) =>
                      setEditLineNotes({ ...editLineNotes, [l.id]: e.target.value })
                    }
                    className="w-full h-[26px] border border-[#D5D3CB] rounded px-2 text-[11.5px] focus:border-[#185FA5] outline-none"
                    placeholder="—"
                  />
                ) : (
                  <span className="text-[#5A5955]">{l.notes ?? "—"}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[#1A3A5C] bg-[#F8F7F4]">
            <td colSpan={4} className="px-2 py-2 text-[11px] text-[#9A9890]">合計</td>
            <td className="px-2 py-2 text-right font-mono font-semibold text-[#2C2C2A]">{totalQty}</td>
            <td colSpan={3}></td>
            <td className="px-2 py-2 text-right font-mono font-semibold text-[#2C2C2A]">
              NT$ {totalAmount.toLocaleString("en-US")}
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function MapPlaceholder({
  destinationName,
  destinationAddress,
  etaLabel,
  deliveryStatus,
}: {
  destinationName: string | null;
  destinationAddress: string | null;
  etaLabel: string;
  deliveryStatus: string | null;
}) {
  const isDelivered = deliveryStatus === "delivered";
  const isInTransit = deliveryStatus === "in_transit";
  return (
    <div className="bg-gradient-to-br from-[#F8F7F4] to-[#EAF4FB] border border-[#EEECE6] rounded-lg p-3 flex flex-col gap-2 min-h-[200px]">
      <div className="text-[11px] text-[#9A9890] font-medium">配送門店地圖</div>
      <div className="flex-1 relative bg-white/60 border border-dashed border-[#D5D3CB] rounded-md flex items-center justify-center overflow-hidden">
        {/* SVG 模擬地圖路徑（POC） */}
        <svg
          viewBox="0 0 240 120"
          className="w-full h-full"
          aria-label="配送路徑示意"
        >
          {/* 道路網格 */}
          <g stroke="#E5E7EB" strokeWidth="0.5" fill="none">
            <path d="M0 30 L240 30" />
            <path d="M0 60 L240 60" />
            <path d="M0 90 L240 90" />
            <path d="M40 0 L40 120" />
            <path d="M120 0 L120 120" />
            <path d="M200 0 L200 120" />
          </g>
          {/* 出庫倉 dot */}
          <circle cx="40" cy="90" r="6" fill="#1A3A5C" />
          <text x="48" y="94" fontSize="8" fill="#1A3A5C" fontWeight="600">
            出庫倉
          </text>
          {/* 路徑 dash */}
          <path
            d="M40 90 Q 120 60 200 30"
            stroke={isDelivered ? "#0F6E56" : isInTransit ? "#185FA5" : "#9A9890"}
            strokeWidth="2"
            fill="none"
            strokeDasharray={isDelivered ? "0" : "4 3"}
          />
          {/* 配送中車輛 icon */}
          {isInTransit && (
            <g transform="translate(120, 60)">
              <circle cx="0" cy="0" r="5" fill="#185FA5" />
              <circle cx="0" cy="0" r="2" fill="#fff" />
            </g>
          )}
          {/* 目的地 pin */}
          <g transform="translate(200, 30)">
            <circle
              cx="0"
              cy="0"
              r="7"
              fill={isDelivered ? "#0F6E56" : "#CC0000"}
            />
            <circle cx="0" cy="0" r="3" fill="#fff" />
          </g>
          <text
            x="192"
            y="22"
            fontSize="8"
            fill={isDelivered ? "#0F6E56" : "#CC0000"}
            fontWeight="600"
          >
            收貨點
          </text>
        </svg>
      </div>
      <div className="space-y-0.5">
        <div className="text-[11px] text-[#9A9890]">
          <b className="text-[#2C2C2A] font-semibold">
            {destinationName ?? "—"}
          </b>
        </div>
        {destinationAddress ? (
          <div className="text-[11px] text-[#5A5955] leading-snug truncate">
            {destinationAddress}
          </div>
        ) : null}
        <div className="text-[11px] text-[#185FA5] font-medium font-mono">
          {etaLabel}
        </div>
      </div>
    </div>
  );
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
      <div className="text-[11px] text-[#9A9890] font-medium">{label}</div>
      <div className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function EditField({
  label,
  children,
  trailing,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  trailing?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${wide ? "col-span-1 md:col-span-2" : ""}`}>
      <div className="flex items-center gap-2">
        <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
        {trailing ? <span className="ml-auto">{trailing}</span> : null}
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// utils
// ─────────────────────────────────────────────────────────────
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  // local datetime-local format: YYYY-MM-DDTHH:mm（無秒）
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function fromDatetimeLocal(s: string): string | null {
  if (!s) return null;
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}
