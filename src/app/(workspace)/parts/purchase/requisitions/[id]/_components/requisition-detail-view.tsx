"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  approveRequisition,
  convertRequisition,
  createRequisition,
  deleteRequisition,
  rejectRequisition,
  updateRequisition,
  type RequisitionInput,
} from "@/domain/requisitions";

export type DetailRequisition = {
  id: string;
  req_no: string;
  org_id: string | null;
  status: string;
  required_date: string | null;
  notes: string | null;
  source: string;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LineRow = {
  id: string;
  line_no: number;
  item_id: string;
  qty_required: number;
  uom: string | null;
  expected_date: string | null;
  notes: string | null;
};

export type ItemRef = { id: string; code: string; name: string };
export type OrgRef = { id: string; code: string; name: string };

type Banner = { ok: boolean; msg: string } | null;

const STATUS_META: Record<string, { label: string; chip: string; pillBadge: string }> = {
  draft:     { label: "草稿",       chip: "bg-[#F2F2F2] text-[#6B6A68]", pillBadge: "bg-[#F2F2F2] text-[#6B6A68]" },
  submitted: { label: "待審核",     chip: "bg-[#FDF3E3] text-[#854F0B]", pillBadge: "bg-[#FDF3E3] text-[#854F0B]" },
  approved:  { label: "已核准",     chip: "bg-[#EAF3DE] text-[#3B6D11]", pillBadge: "bg-[#EAF3DE] text-[#3B6D11]" },
  converted: { label: "已轉採購單", chip: "bg-[#EAF4FB] text-[#185FA5]", pillBadge: "bg-[#EAF4FB] text-[#185FA5]" },
  cancelled: { label: "已拒絕",     chip: "bg-[#FDECEA] text-[#CC0000]", pillBadge: "bg-[#FDECEA] text-[#CC0000]" },
};

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try { return new Date(s).toISOString().slice(0, 10); } catch { return "—"; }
}

function fmtDateTime(s: string | null): string {
  if (!s) return "—";
  try { return new Date(s).toISOString().slice(0, 16).replace("T", " "); } catch { return "—"; }
}

export function RequisitionDetailView({
  requisition,
  lines: linesProp,
  items,
  orgs,
  canEdit,
  canApprove,
  forceCreating = false,
}: {
  requisition: DetailRequisition;
  lines: LineRow[];
  items: ItemRef[];
  orgs: OrgRef[];
  canEdit: boolean;
  canApprove: boolean;
  forceCreating?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(forceCreating);
  const [confirmModal, setConfirmModal] = useState<
    | null
    | {
        title: string;
        message: React.ReactNode;
        confirmLabel: string;
        confirmTone: "danger" | "primary" | "success";
        onConfirm: () => void;
      }
  >(null);

  // 第一條 line 是 demo 用主行（spec 也只有單行）
  const firstLine: LineRow | null = linesProp[0] ?? null;

  const fromDb = (): RequisitionInput => ({
    org_id: requisition.org_id,
    required_date: requisition.required_date,
    notes: requisition.notes,
    item_id: firstLine?.item_id ?? null,
    qty_required: firstLine?.qty_required ?? 1,
    uom: firstLine?.uom ?? "個",
    expected_date: firstLine?.expected_date ?? null,
  });
  const blankCreate = (): RequisitionInput => ({
    org_id: orgs[0]?.id ?? null,
    required_date: new Date().toISOString().slice(0, 10),
    notes: "",
    item_id: null,
    qty_required: 1,
    uom: "個",
    expected_date: null,
  });

  const [draft, setDraft] = useState<RequisitionInput>(fromDb());
  const [createDraft, setCreateDraft] = useState<RequisitionInput>(blankCreate());

  const lines = creating ? [] : linesProp;
  const showInputs = editing || creating;
  const formDraft = creating ? createDraft : draft;
  const setFormDraft = (next: RequisitionInput) => {
    if (creating) setCreateDraft(next);
    else setDraft(next);
  };

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const status = STATUS_META[requisition.status] ?? STATUS_META.draft;
  const isLocked = requisition.status === "converted" || requisition.status === "cancelled";

  const cancelEdit = () => {
    setDraft(fromDb());
    setEditing(false);
  };

  const save = () => {
    startTransition(async () => {
      const res = await updateRequisition(requisition.id, draft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存變更" });
        setEditing(false);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const openCreate = () => {
    setEditing(false);
    setCreateDraft(blankCreate());
    setCreating(true);
  };
  const cancelCreate = () => {
    if (forceCreating) router.push("/parts/purchase/requisitions");
    else setCreating(false);
  };
  const submitCreate = () => {
    startTransition(async () => {
      const res = await createRequisition(createDraft);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已建立 ${res.data.req_no}，跳轉到新需求單` });
        setCreating(false);
        router.push(`/parts/purchase/requisitions/${res.data.id}`);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const approve = () => {
    startTransition(async () => {
      const res = await approveRequisition(requisition.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已核准，可轉採購單" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };
  const reject = () => {
    setConfirmModal({
      title: "確認拒絕",
      message: (
        <>
          確定拒絕「<b>{requisition.req_no}</b>」？此動作會將狀態切為「已拒絕」，後續不可再核准或轉採購單。
        </>
      ),
      confirmLabel: "確認拒絕",
      confirmTone: "danger",
      onConfirm: () => {
        setConfirmModal(null);
        startTransition(async () => {
          const res = await rejectRequisition(requisition.id);
          if (res.ok) {
            showBanner({ ok: true, msg: "✓ 已拒絕" });
            router.refresh();
          } else showBanner({ ok: false, msg: res.error });
        });
      },
    });
  };
  const convert = () => {
    setConfirmModal({
      title: "確認轉採購單",
      message: (
        <>
          「<b>{requisition.req_no}</b>」轉採購單？
          <div className="text-[11px] text-[#9A9890] mt-1">
            demo 階段：僅切換狀態為「已轉採購單」，未實際建立 PO。
          </div>
        </>
      ),
      confirmLabel: "確認轉採購單",
      confirmTone: "primary",
      onConfirm: () => {
        setConfirmModal(null);
        startTransition(async () => {
          const res = await convertRequisition(requisition.id);
          if (res.ok) {
            showBanner({ ok: true, msg: "✓ 已轉採購單（demo）" });
            router.refresh();
          } else showBanner({ ok: false, msg: res.error });
        });
      },
    });
  };
  const remove = () => {
    setConfirmModal({
      title: "確認刪除",
      message: (
        <>
          確定刪除「<b>{requisition.req_no}</b>」？
          <div className="text-[11px] text-[#9A9890] mt-1">
            此動作會移除單頭與明細，不可復原。
          </div>
        </>
      ),
      confirmLabel: "確認刪除",
      confirmTone: "danger",
      onConfirm: () => {
        setConfirmModal(null);
        startTransition(async () => {
          const res = await deleteRequisition(requisition.id);
          if (res.ok) {
            router.push("/parts/purchase/requisitions");
            router.refresh();
          } else showBanner({ ok: false, msg: res.error });
        });
      },
    });
  };

  const orgMap = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const orgName = requisition.org_id ? orgMap.get(requisition.org_id)?.name ?? null : null;

  const inputClass = "h-[28px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] w-full";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const sectionCard = (title: string, body: React.ReactNode) => (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
      </header>
      <div className="px-4 py-3">{body}</div>
    </section>
  );

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + CRUD pill */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/purchase/requisitions" className="hover:text-[#185FA5]">採購需求處理</Link>
          <span>›</span>
          <span className={`text-[#5A5955] ${creating ? "" : "font-mono"}`}>
            {creating ? "新增需求單" : requisition.req_no}
          </span>
          {editing ? (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-[#FDF3E3] text-[#854F0B] text-[11px]">編輯模式</span>
          ) : creating ? (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-[#FDF3E3] text-[#854F0B] text-[11px]">建立模式</span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {editing ? (
            <>
              <button type="button" onClick={save} disabled={isPending || !canEdit} className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60">
                {isPending ? "儲存中…" : "儲存變更"}
              </button>
              <button type="button" onClick={cancelEdit} className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] shadow-sm hover:border-[#9A9890]">
                取消
              </button>
            </>
          ) : creating ? (
            <>
              <button type="button" onClick={cancelCreate} disabled={isPending} className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] shadow-sm hover:border-[#9A9890] disabled:opacity-60">
                取消
              </button>
              <button type="button" onClick={submitCreate} disabled={isPending || !canEdit} className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60">
                {isPending ? "建立中…" : "建立並開啟"}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/parts/purchase/requisitions"
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
                disabled={!canEdit || isLocked}
                onClick={() => setEditing(true)}
                title={isLocked ? "已轉採購單／已拒絕的單無法修改" : ""}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                disabled={!canEdit || requisition.status === "converted"}
                onClick={remove}
                title={requisition.status === "converted" ? "已轉採購單的單不可刪除" : ""}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                刪除
              </button>
            </>
          )}
        </div>
      </div>

      {banner ? (
        <div className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${banner.ok ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]" : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"}`}>
          {banner.msg}
        </div>
      ) : null}

      {/* Title Card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">採購需求單</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight font-mono">
                {creating ? "（系統自動編號）" : requisition.req_no}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                {creating ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDF3E3] text-[#854F0B]">尚未建立</span>
                ) : (
                  <>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${status.chip}`}>
                      {status.label}
                    </span>
                    {orgName ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C]">{orgName}</span>
                    ) : null}
                    <span className="text-[11.5px] text-[#9A9890]">需求日期 {fmtDate(requisition.required_date)}</span>
                  </>
                )}
              </div>
            </div>

            {/* 狀態相關的快速動作 — 待審核時顯示 [核准] [拒絕]，已核准時顯示 [轉採購單] */}
            {!editing && !creating && requisition.status === "submitted" ? (
              <div className="mt-auto flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  disabled={!canApprove}
                  onClick={approve}
                  className="h-[26px] px-3 rounded-full text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
                >
                  ✓ 核准
                </button>
                <button
                  type="button"
                  disabled={!canApprove}
                  onClick={reject}
                  className="h-[26px] px-3 rounded-full text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
                >
                  ✗ 拒絕
                </button>
              </div>
            ) : null}
            {!editing && !creating && requisition.status === "approved" ? (
              <div className="mt-auto flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  disabled={!canApprove}
                  onClick={convert}
                  className="h-[26px] px-3 rounded-full text-[11.5px] font-medium bg-[#185FA5] text-white hover:bg-[#0F4787] shadow-sm disabled:opacity-50"
                >
                  → 轉採購單
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {/* 基本資料 */}
      <section className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${showInputs ? lockedClass : ""}`}>
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          {!creating ? (
            <Kv label="系統識別碼" value={<span className="font-mono">{requisition.id.slice(0, 8)}</span>} />
          ) : null}
          <Kv label="需求單號" value={creating ? <span className="text-[#9A9890] text-[11.5px]">建立後自動產生</span> : <span className="font-mono font-semibold">{requisition.req_no}</span>} />
          <Kv
            label="申請門店"
            value={
              showInputs ? (
                <select value={formDraft.org_id ?? ""} onChange={(e) => setFormDraft({ ...formDraft, org_id: e.target.value || null })} className={inputClass}>
                  <option value="">— 未指定 —</option>
                  {orgs.map((o) => (<option key={o.id} value={o.id}>{o.code} {o.name}</option>))}
                </select>
              ) : orgName ?? "—"
            }
          />
          <Kv
            label="需求日期"
            value={
              showInputs ? (
                <input type="date" value={formDraft.required_date ?? ""} onChange={(e) => setFormDraft({ ...formDraft, required_date: e.target.value })} className={inputClass} />
              ) : fmtDate(requisition.required_date)
            }
          />
          <Kv
            label="期望交期"
            value={
              showInputs ? (
                <input type="date" value={formDraft.expected_date ?? ""} onChange={(e) => setFormDraft({ ...formDraft, expected_date: e.target.value })} className={inputClass} />
              ) : fmtDate(firstLine?.expected_date ?? null)
            }
          />
          <Kv
            label="狀態"
            value={creating ? "submitted（建立後）" : (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${status.chip}`}>
                {status.label}
              </span>
            )}
          />
          {!creating ? (
            <Kv label="來源" value={requisition.source} mono />
          ) : null}
          {!creating ? (
            <Kv label="核准時間" value={fmtDateTime(requisition.approved_at)} mono small />
          ) : null}
          <div className="md:col-span-3">
            <Kv
              label="需求原因 / 備註"
              value={
                showInputs ? (
                  <textarea value={formDraft.notes ?? ""} onChange={(e) => setFormDraft({ ...formDraft, notes: e.target.value })} placeholder="例：庫存低於安全水位 / 緊急備料 / 活動促銷備料" className={`${inputClass} min-h-[60px] py-1.5`} rows={3} />
                ) : requisition.notes ?? "—"
              }
            />
          </div>
        </div>
      </section>

      {/* 申請項目 */}
      <section className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${showInputs ? lockedClass : ""}`}>
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 申請項目</span>
        </header>
        {showInputs ? (
          <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
            <Kv
              label="料號 / 品名"
              value={
                <select value={formDraft.item_id ?? ""} onChange={(e) => setFormDraft({ ...formDraft, item_id: e.target.value || null })} className={inputClass}>
                  <option value="">— 請選擇商品 —</option>
                  {items.map((i) => (<option key={i.id} value={i.id}>{i.code} {i.name}</option>))}
                </select>
              }
            />
            <Kv
              label="需求數量"
              value={
                <input type="number" min={1} value={formDraft.qty_required} onChange={(e) => setFormDraft({ ...formDraft, qty_required: Number(e.target.value) || 0 })} className={inputClass} />
              }
            />
            <Kv
              label="單位"
              value={
                <input value={formDraft.uom ?? ""} onChange={(e) => setFormDraft({ ...formDraft, uom: e.target.value })} placeholder="例：個 / 條 / 組" className={inputClass} />
              }
            />
          </div>
        ) : lines.length === 0 ? (
          <div className="px-4 py-3 text-[12px] text-[#9A9890]">尚無申請項目</div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[11px] text-[#9A9890] border-b border-[#EEECE6]">
                <th className="text-left font-medium py-2 px-3 w-[40px]">#</th>
                <th className="text-left font-medium py-2 px-3 w-[140px]">料號</th>
                <th className="text-left font-medium py-2 px-3">品名</th>
                <th className="text-right font-medium py-2 px-3 w-[100px]">需求數量</th>
                <th className="text-left font-medium py-2 px-3 w-[80px]">單位</th>
                <th className="text-left font-medium py-2 px-3 w-[120px]">期望交期</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const it = itemMap.get(l.item_id);
                return (
                  <tr key={l.id} className="border-t border-[#F8F7F4]">
                    <td className="py-2 px-3 text-[11.5px] text-[#9A9890]">{l.line_no}</td>
                    <td className="py-2 px-3 font-mono">{it?.code ?? "—"}</td>
                    <td className="py-2 px-3">{it?.name ?? "—"}</td>
                    <td className="py-2 px-3 text-right font-mono">{Number(l.qty_required).toLocaleString("en-US")}</td>
                    <td className="py-2 px-3 text-[11.5px]">{l.uom ?? "—"}</td>
                    <td className="py-2 px-3 font-mono text-[11.5px]">{fmtDate(l.expected_date)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {creating ? (
        <p className="text-[12px] text-[#9A9890] leading-relaxed">
          建立後狀態自動為「待審核」，採購主管核准後即可轉為正式採購單。
        </p>
      ) : null}

      {!creating ? sectionCard("審核資訊", (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="建立時間" value={fmtDateTime(requisition.created_at)} mono small />
          <Kv label="最後更新" value={fmtDateTime(requisition.updated_at)} mono small />
          <Kv label="核准時間" value={fmtDateTime(requisition.approved_at)} mono small />
        </div>
      )) : null}

      {confirmModal ? (
        <div className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[400px]">
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className={`text-[14px] font-semibold ${confirmModal.confirmTone === "danger" ? "text-[#CC0000]" : "text-[#2C2C2A]"}`}>
                {confirmModal.title}
              </h3>
            </header>
            <div className="px-4 py-3 text-[12.5px] text-[#2C2C2A]">{confirmModal.message}</div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                disabled={isPending}
                className={`h-[30px] px-3.5 rounded text-[12.5px] font-medium disabled:opacity-60 ${
                  confirmModal.confirmTone === "danger"
                    ? "bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                    : confirmModal.confirmTone === "success"
                      ? "bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                      : "bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
                }`}
              >
                {confirmModal.confirmLabel}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Kv({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className={`text-[12.5px] ${mono ? "font-mono" : ""} ${small ? "text-[11.5px] text-[#5A5955]" : "text-[#2C2C2A]"}`}>
        {value}
      </div>
    </div>
  );
}
