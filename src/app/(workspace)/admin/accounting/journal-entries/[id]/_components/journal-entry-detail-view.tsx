"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  addLineAction,
  createDraftEntryAction,
  deleteDraftEntryAction,
  postEntryAction,
  removeLineAction,
  reverseEntryAction,
  updateEntryHeaderAction,
  updateLineAction,
  type LineInput,
} from "@/lib/accounting/journal-entry-actions";
import type {
  DimensionLookupMap,
  JournalEntryLineRow,
  JournalEntryRow,
  PostableCoaOption,
} from "@/lib/accounting/queries";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit" | "create";
type LineDraft = {
  id?: string;
  line_no?: number;
  coa_id: string;
  side: "D" | "C";
  amount: string;
  dimensions: Record<string, string>;
  description: string;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  posted: "已過帳",
  reversed: "已沖銷",
};
const STATUS_CHIP: Record<string, string> = {
  draft: "bg-[#FDF3E3] text-[#854F0B]",
  posted: "bg-[#EAF3DE] text-[#3B6D11]",
  reversed: "bg-[#F2F2F2] text-[#6B6A68]",
};

const fmtAmount = (n: number) =>
  new Intl.NumberFormat("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

const todayISO = () => new Date().toISOString().slice(0, 10);

// dim 中文名（reference 端若無，直接顯示 dim code）
type DimMeta = { code: string; name: string; hasLookup: boolean };

export function JournalEntryDetailView({
  entry,
  lines,
  coaOptions,
  dimensionLookups,
  dimensionsCatalog,
  initialMode = "view",
}: {
  entry: JournalEntryRow | null;
  lines: JournalEntryLineRow[];
  coaOptions: PostableCoaOption[];
  dimensionLookups: DimensionLookupMap;
  dimensionsCatalog: DimMeta[];
  initialMode?: Mode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [mode, setMode] = useState<Mode>(initialMode);

  // Header form state
  const [hEntryNo, setHEntryNo] = useState(entry?.entry_no ?? "");
  const [hEntryDate, setHEntryDate] = useState(entry?.entry_date ?? todayISO());
  const [hDesc, setHDesc] = useState(entry?.description ?? "");

  // Line modal state
  const [lineDraft, setLineDraft] = useState<LineDraft | null>(null);

  const dimMetaByCode = useMemo(() => {
    const m: Record<string, DimMeta> = {};
    for (const d of dimensionsCatalog) m[d.code] = d;
    return m;
  }, [dimensionsCatalog]);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  // ============================================================
  // Sums + balance + post readiness
  // ============================================================
  const sums = useMemo(() => {
    let debit = 0;
    let credit = 0;
    const missingDims: string[] = [];
    for (const l of lines) {
      debit += Number(l.debit) || 0;
      credit += Number(l.credit) || 0;
      const required = l.coa_required_dimensions ?? [];
      const missing = required.filter((d) => !(d in (l.dimensions ?? {})));
      if (missing.length > 0)
        missingDims.push(`第${l.line_no}行 缺 ${missing.join("/")}`);
    }
    const balanced = Math.abs(debit - credit) < 0.005 && debit > 0;
    const canPost = lines.length > 0 && balanced && missingDims.length === 0;
    return { debit, credit, balanced, missingDims, canPost };
  }, [lines]);

  const isPosted = entry?.status === "posted";
  const isDraft = entry?.status === "draft";

  // ============================================================
  // Header handlers
  // ============================================================
  const onCreateDraft = () => {
    if (!hEntryDate) {
      showBanner({ ok: false, msg: "傳票日期必填" });
      return;
    }
    startTransition(async () => {
      const res = await createDraftEntryAction({
        entry_no: hEntryNo.trim() || null,
        entry_date: hEntryDate,
        description: hDesc.trim() || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已建立 ${res.data.entry_no}` });
        router.push(`/admin/accounting/journal-entries/${res.data.id}`);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const onSaveHeader = () => {
    if (!entry) return;
    startTransition(async () => {
      const res = await updateEntryHeaderAction(entry.id, {
        entry_no: hEntryNo.trim() || undefined,
        entry_date: hEntryDate || undefined,
        description: hDesc.trim() || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 表頭已儲存" });
        setMode("view");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const onCancelEdit = () => {
    setHEntryNo(entry?.entry_no ?? "");
    setHEntryDate(entry?.entry_date ?? todayISO());
    setHDesc(entry?.description ?? "");
    setMode("view");
  };

  const onDeleteDraft = () => {
    if (!entry) return;
    if (!confirm(`確定刪除草稿「${entry.entry_no}」？`)) return;
    startTransition(async () => {
      const res = await deleteDraftEntryAction(entry.id);
      if (res.ok) {
        router.push("/admin/accounting/journal-entries");
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const onPost = () => {
    if (!entry) return;
    if (!sums.canPost) {
      const reasons: string[] = [];
      if (lines.length === 0) reasons.push("沒有任何行");
      if (!sums.balanced) reasons.push(`借貸不平（借 ${fmtAmount(sums.debit)} ≠ 貸 ${fmtAmount(sums.credit)}）`);
      if (sums.missingDims.length > 0) reasons.push(sums.missingDims.join("；"));
      showBanner({ ok: false, msg: `無法過帳：${reasons.join(" ・ ")}` });
      return;
    }
    if (!confirm(`確定過帳「${entry.entry_no}」？過帳後無法直接修改，需用反向沖銷。`)) return;
    startTransition(async () => {
      const res = await postEntryAction(entry.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已過帳" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const onReverse = () => {
    if (!entry) return;
    const date = prompt("反向沖銷日期 (YYYY-MM-DD)，留空使用今日：", todayISO());
    if (date === null) return;
    startTransition(async () => {
      const res = await reverseEntryAction(entry.id, date.trim() || undefined);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已建立反向分錄 ${res.data.new_entry_no}` });
        router.push(`/admin/accounting/journal-entries/${res.data.new_id}`);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  // ============================================================
  // Line handlers
  // ============================================================
  const openNewLine = () => {
    setLineDraft({
      coa_id: "",
      side: "D",
      amount: "",
      dimensions: {},
      description: "",
    });
  };
  const openEditLine = (l: JournalEntryLineRow) => {
    setLineDraft({
      id: l.id,
      line_no: l.line_no,
      coa_id: l.coa_id,
      side: Number(l.debit) > 0 ? "D" : "C",
      amount: String(Number(l.debit) > 0 ? l.debit : l.credit),
      dimensions: Object.fromEntries(
        Object.entries(l.dimensions ?? {}).map(([k, v]) => [k, String(v)]),
      ),
      description: l.description ?? "",
    });
  };
  const closeLineModal = () => setLineDraft(null);

  const submitLine = () => {
    if (!entry || !lineDraft) return;
    if (!lineDraft.coa_id) {
      showBanner({ ok: false, msg: "請選擇科目" });
      return;
    }
    const amt = parseFloat(lineDraft.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      showBanner({ ok: false, msg: "金額需 > 0" });
      return;
    }
    const cleanDims: Record<string, string> = {};
    for (const [k, v] of Object.entries(lineDraft.dimensions)) {
      if (v?.trim()) cleanDims[k] = v.trim();
    }
    const payload: LineInput = {
      entry_id: entry.id,
      coa_id: lineDraft.coa_id,
      debit: lineDraft.side === "D" ? amt : 0,
      credit: lineDraft.side === "C" ? amt : 0,
      dimensions: cleanDims,
      description: lineDraft.description.trim() || null,
    };
    startTransition(async () => {
      const res = lineDraft.id
        ? await updateLineAction(lineDraft.id, {
            coa_id: payload.coa_id,
            debit: payload.debit,
            credit: payload.credit,
            dimensions: payload.dimensions,
            description: payload.description,
          })
        : await addLineAction(payload);
      if (res.ok) {
        showBanner({ ok: true, msg: lineDraft.id ? "✓ 已更新行" : "✓ 已新增行" });
        closeLineModal();
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const onRemoveLine = (l: JournalEntryLineRow) => {
    if (!confirm(`確定刪除第 ${l.line_no} 行（${l.coa_account_code} ${l.coa_name_zh_tw}）？`)) return;
    startTransition(async () => {
      const res = await removeLineAction(l.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除行" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  // ============================================================
  // Render helpers
  // ============================================================
  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const selectedCoa = useMemo(
    () => coaOptions.find((c) => c.id === lineDraft?.coa_id) ?? null,
    [lineDraft?.coa_id, coaOptions],
  );

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      {/* 1. Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/admin/accounting/journal-entries" className="hover:text-[#185FA5]">
            會計分錄
          </Link>
          <span>›</span>
          {mode === "create" ? (
            <>
              <span className="text-[#5A5955]">新增分錄</span>
              <span className="px-1.5 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B]">
                建立模式
              </span>
            </>
          ) : (
            <>
              <span className="text-[#5A5955] font-mono">{entry?.entry_no}</span>
              {mode === "edit" && (
                <span className="px-1.5 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B]">
                  編輯模式
                </span>
              )}
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {mode === "view" && entry && (
            <>
              <Link
                href="/admin/accounting/journal-entries"
                className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <button
                onClick={() => router.push("/admin/accounting/journal-entries/new")}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                新增
              </button>
              {isDraft && (
                <button
                  onClick={() => setMode("edit")}
                  disabled={isPending}
                  className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
                >
                  修改表頭
                </button>
              )}
              {isDraft && (
                <button
                  onClick={onPost}
                  disabled={isPending || !sums.canPost}
                  title={
                    sums.canPost
                      ? "過帳後將觸發 DB validator"
                      : `尚未可過帳：${sums.missingDims.length > 0 ? sums.missingDims.join("；") : sums.balanced ? "" : `借貸不平`}`
                  }
                  className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
                >
                  過帳
                </button>
              )}
              {isPosted && (
                <button
                  onClick={onReverse}
                  disabled={isPending}
                  className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
                >
                  反向沖銷
                </button>
              )}
              {isDraft && (
                <button
                  onClick={onDeleteDraft}
                  disabled={isPending}
                  className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
                >
                  刪除
                </button>
              )}
            </>
          )}
          {mode === "edit" && (
            <>
              <button
                onClick={onCancelEdit}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={onSaveHeader}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                {isPending ? "儲存中⋯" : "儲存表頭"}
              </button>
            </>
          )}
          {mode === "create" && (
            <>
              <Link
                href="/admin/accounting/journal-entries"
                className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                取消
              </Link>
              <button
                onClick={onCreateDraft}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                {isPending ? "建立中⋯" : "建立草稿並編輯行"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Banner */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 max-w-md ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}

      {/* 2. Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">會計分錄</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {mode === "create"
                  ? "（建立中草稿）"
                  : entry?.description || `分錄 ${entry?.entry_no ?? ""}`}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                {mode === "create" ? (
                  <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
                    尚未建立
                  </span>
                ) : entry ? (
                  <>
                    <span className="font-mono text-[#5A5955]">{entry.entry_no}</span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${
                        STATUS_CHIP[entry.status] ?? "bg-[#F2F2F2] text-[#6B6A68]"
                      }`}
                    >
                      {STATUS_LABEL[entry.status] ?? entry.status}
                    </span>
                    <span className="text-[#9A9890]">{entry.entry_date}</span>
                    {entry.posted_at && (
                      <span className="text-[#9A9890]">
                        過帳於 {new Date(entry.posted_at).toLocaleString("zh-TW")}
                      </span>
                    )}
                    {entry.reversed_by_entry_id && (
                      <Link
                        href={`/admin/accounting/journal-entries/${entry.reversed_by_entry_id}`}
                        className="text-[#185FA5] hover:underline"
                      >
                        → 已被反向沖銷
                      </Link>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-end justify-center gap-1 text-[12px]">
            <div className="text-[#9A9890]">借方總額 / 貸方總額</div>
            <div className="font-mono text-[14px]">
              <span className="text-[#185FA5]">{fmtAmount(sums.debit)}</span>
              <span className="mx-1.5 text-[#9A9890]">/</span>
              <span className="text-[#854F0B]">{fmtAmount(sums.credit)}</span>
            </div>
            <div className="text-[11px]">
              {sums.balanced ? (
                <span className="text-[#3B6D11]">✓ 借貸平衡</span>
              ) : (
                <span className="text-[#CC0000]">✗ 不平衡（差 {fmtAmount(Math.abs(sums.debit - sums.credit))}）</span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 3. Header KV / edit form */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 表頭資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          {(mode === "edit" || mode === "create") ? (
            <>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>
                  傳票編號 {mode === "create" && <span className="text-[#9A9890]">（留空自動產生）</span>}
                </label>
                <input
                  className={inputClass}
                  value={hEntryNo}
                  onChange={(e) => setHEntryNo(e.target.value)}
                  placeholder="JE-20260510-093015"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>傳票日期 *</label>
                <input
                  type="date"
                  className={inputClass}
                  value={hEntryDate}
                  onChange={(e) => setHEntryDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1 md:col-span-3">
                <label className={labelClass}>摘要說明</label>
                <textarea
                  rows={2}
                  className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                  value={hDesc}
                  onChange={(e) => setHDesc(e.target.value)}
                  placeholder="例：5 月房租；客戶 X 訂單訂金"
                />
              </div>
            </>
          ) : entry ? (
            <>
              <Kv label="傳票編號" value={entry.entry_no} mono />
              <Kv label="傳票日期" value={entry.entry_date} />
              <Kv label="狀態" value={STATUS_LABEL[entry.status] ?? entry.status} />
              <Kv label="摘要" value={entry.description ?? "—"} small />
              {entry.posted_by && (
                <Kv label="過帳人" value={entry.posted_by} mono small />
              )}
              {entry.netsuite_journal_id && (
                <Kv label="NetSuite Journal ID" value={entry.netsuite_journal_id} mono />
              )}
            </>
          ) : null}
        </div>
      </section>

      {/* 4. Lines table — 建立模式時隱藏 */}
      {mode !== "create" && entry && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 分錄行（{lines.length}）</span>
            {sums.missingDims.length > 0 && (
              <span className="text-[11.5px] text-[#CC0000]">
                ⚠ {sums.missingDims.join("；")}
              </span>
            )}
            {isDraft && (
              <button
                onClick={openNewLine}
                disabled={isPending}
                className="ml-auto h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                ＋ 新增行
              </button>
            )}
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="text-[11px] text-[#9A9890] bg-[#FBFAF7]">
                <tr>
                  <th className="text-left font-medium py-2 px-3 w-[50px]">#</th>
                  <th className="text-left font-medium py-2 px-3 w-[100px]">科目代碼</th>
                  <th className="text-left font-medium py-2 px-3">科目</th>
                  <th className="text-right font-medium py-2 px-3 w-[110px]">借</th>
                  <th className="text-right font-medium py-2 px-3 w-[110px]">貸</th>
                  <th className="text-left font-medium py-2 px-3 w-[260px]">維度</th>
                  <th className="text-left font-medium py-2 px-3">摘要</th>
                  {isDraft && <th className="text-right font-medium py-2 px-3 w-[110px]">操作</th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const required = l.coa_required_dimensions ?? [];
                  const missing = required.filter((d) => !(d in (l.dimensions ?? {})));
                  return (
                    <tr key={l.id} className="border-t border-[#F8F7F4] align-top">
                      <td className="py-2 px-3 text-[#9A9890]">{l.line_no}</td>
                      <td className="py-2 px-3 font-mono">{l.coa_account_code}</td>
                      <td className="py-2 px-3">{l.coa_name_zh_tw}</td>
                      <td className="py-2 px-3 text-right font-mono">
                        {l.debit > 0 ? fmtAmount(l.debit) : ""}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {l.credit > 0 ? fmtAmount(l.credit) : ""}
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(l.dimensions ?? {}).map(([k, v]) => (
                            <span
                              key={k}
                              className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5] font-mono"
                              title={`${dimMetaByCode[k]?.name ?? k}=${v}`}
                            >
                              {k}={String(v).slice(0, 12)}
                            </span>
                          ))}
                          {missing.map((d) => (
                            <span
                              key={d}
                              className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDECEA] text-[#CC0000]"
                              title={`必填維度 ${d} 尚未設定`}
                            >
                              缺 {d}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-[#5A5955]">{l.description ?? "—"}</td>
                      {isDraft && (
                        <td className="py-2 px-3 text-right">
                          <div className="inline-flex gap-1">
                            <button
                              onClick={() => openEditLine(l)}
                              disabled={isPending}
                              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                            >
                              編輯
                            </button>
                            <button
                              onClick={() => onRemoveLine(l)}
                              disabled={isPending}
                              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                            >
                              刪除
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={isDraft ? 8 : 7} className="py-12 text-center text-[12px] text-[#9A9890]">
                      尚無分錄行
                      {isDraft && (
                        <button
                          onClick={openNewLine}
                          className="ml-2 text-[#185FA5] hover:underline"
                        >
                          + 新增第一行
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
              {lines.length > 0 && (
                <tfoot className="border-t-2 border-[#EEECE6] bg-[#FBFAF7]">
                  <tr>
                    <td colSpan={3} className="py-2 px-3 text-right text-[11.5px] text-[#5A5955] font-semibold">
                      合計
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-[#185FA5]">
                      {fmtAmount(sums.debit)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-[#854F0B]">
                      {fmtAmount(sums.credit)}
                    </td>
                    <td colSpan={isDraft ? 3 : 2} className="py-2 px-3 text-[11.5px]">
                      {sums.balanced ? (
                        <span className="text-[#3B6D11]">✓ 借貸平衡</span>
                      ) : (
                        <span className="text-[#CC0000]">
                          ✗ 不平衡，差 {fmtAmount(Math.abs(sums.debit - sums.credit))}
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      )}

      {/* 5. Line Modal */}
      {lineDraft && entry && (
        <LineModal
          draft={lineDraft}
          coaOptions={coaOptions}
          dimensionLookups={dimensionLookups}
          dimensionsCatalog={dimensionsCatalog}
          selectedCoa={selectedCoa}
          isPending={isPending}
          onChange={setLineDraft}
          onSubmit={submitLine}
          onClose={closeLineModal}
        />
      )}

      {/* create-mode hint */}
      {mode === "create" && (
        <div className="bg-[#F8F7F4] border border-[#EEECE6] rounded-lg px-4 py-3 text-[12px] text-[#5A5955]">
          建立草稿後將跳轉到該分錄的詳情頁，可進一步加減分錄行、設定維度、檢查借貸平衡，最後點「過帳」交給 DB validator 驗證。
        </div>
      )}
    </main>
  );
}

// ============================================================
// Line Modal — 動態維度表單核心
// ============================================================

function LineModal({
  draft,
  coaOptions,
  dimensionLookups,
  dimensionsCatalog,
  selectedCoa,
  isPending,
  onChange,
  onSubmit,
  onClose,
}: {
  draft: LineDraft;
  coaOptions: PostableCoaOption[];
  dimensionLookups: DimensionLookupMap;
  dimensionsCatalog: DimMeta[];
  selectedCoa: PostableCoaOption | null;
  isPending: boolean;
  onChange: (next: LineDraft) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const [coaQuery, setCoaQuery] = useState("");

  const dimMetaByCode = useMemo(() => {
    const m: Record<string, DimMeta> = {};
    for (const d of dimensionsCatalog) m[d.code] = d;
    return m;
  }, [dimensionsCatalog]);

  const filteredCoa = useMemo(() => {
    const t = coaQuery.trim().toLowerCase();
    if (!t) return coaOptions.slice(0, 100);
    return coaOptions
      .filter(
        (c) =>
          c.account_code.toLowerCase().includes(t) ||
          c.name_zh_tw.toLowerCase().includes(t),
      )
      .slice(0, 100);
  }, [coaQuery, coaOptions]);

  const requiredDims = selectedCoa?.required_dimensions ?? [];

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  return (
    <div
      className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-[760px] max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-[#EEECE6] flex items-center gap-2">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">
            {draft.id ? `編輯第 ${draft.line_no} 行` : "新增分錄行"}
          </h2>
          {selectedCoa && (
            <span className="text-[11.5px] text-[#9A9890]">
              {selectedCoa.account_code} · 正常餘額 {selectedCoa.normal_balance === "D" ? "借" : "貸"}
            </span>
          )}
        </header>

        <div className="px-5 py-4 space-y-4">
          {/* 科目選擇 */}
          <div>
            <label className={labelClass}>科目（僅 L5 可入帳）*</label>
            <input
              className={`${inputClass} w-full mt-1`}
              placeholder="搜尋科目代碼或名稱"
              value={coaQuery}
              onChange={(e) => setCoaQuery(e.target.value)}
            />
            <select
              className="w-full mt-1.5 border border-[#D5D3CB] rounded px-2 py-1 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
              size={6}
              value={draft.coa_id}
              onChange={(e) => onChange({ ...draft, coa_id: e.target.value, dimensions: {} })}
            >
              {filteredCoa.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.account_code} {c.name_zh_tw} · {c.normal_balance === "D" ? "借" : "貸"}
                  {c.required_dimensions.length > 0 ? ` · ${c.required_dimensions.length} dim` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-[#9A9890]">
              共 {coaOptions.length} 筆可入帳科目；輸入關鍵字過濾，最多顯示 100 筆。
            </p>
          </div>

          {/* 借/貸 + 金額 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>方向 *</label>
              <div className="mt-1 inline-flex rounded border border-[#D5D3CB] overflow-hidden">
                <button
                  type="button"
                  onClick={() => onChange({ ...draft, side: "D" })}
                  className={`h-[30px] px-4 text-[12.5px] ${
                    draft.side === "D" ? "bg-[#185FA5] text-white" : "bg-white text-[#5A5955] hover:bg-[#F8F7F4]"
                  }`}
                >
                  借
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...draft, side: "C" })}
                  className={`h-[30px] px-4 text-[12.5px] border-l border-[#D5D3CB] ${
                    draft.side === "C" ? "bg-[#854F0B] text-white" : "bg-white text-[#5A5955] hover:bg-[#F8F7F4]"
                  }`}
                >
                  貸
                </button>
              </div>
            </div>
            <div className="col-span-2">
              <label className={labelClass}>金額 *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className={`${inputClass} w-full mt-1 text-right font-mono`}
                value={draft.amount}
                onChange={(e) => onChange({ ...draft, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
          </div>

          {/* 維度區 */}
          <div>
            <label className={labelClass}>
              維度（依科目自動帶必填，{requiredDims.length} 個必填）
            </label>
            {requiredDims.length === 0 ? (
              <div className="mt-1.5 px-3 py-2.5 bg-[#F8F7F4] border border-[#EEECE6] rounded text-[12px] text-[#9A9890]">
                此科目不要求維度，可直接送出。
              </div>
            ) : (
              <div className="mt-1.5 grid grid-cols-1 md:grid-cols-2 gap-3">
                {requiredDims.map((dimCode) => {
                  const meta = dimMetaByCode[dimCode];
                  const opts = dimensionLookups[dimCode];
                  const value = draft.dimensions[dimCode] ?? "";
                  return (
                    <div key={dimCode} className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium">
                        <span className="text-[#2C2C2A]">{meta?.name ?? dimCode}</span>
                        <span className="ml-1 font-mono text-[#9A9890]">({dimCode})</span>
                        <span className="ml-1 text-[#CC0000]">*</span>
                      </label>
                      {opts && opts.length > 0 ? (
                        <select
                          className={inputClass}
                          value={value}
                          onChange={(e) =>
                            onChange({
                              ...draft,
                              dimensions: { ...draft.dimensions, [dimCode]: e.target.value },
                            })
                          }
                        >
                          <option value="">— 請選擇 —</option>
                          {opts.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className={inputClass}
                          value={value}
                          onChange={(e) =>
                            onChange({
                              ...draft,
                              dimensions: { ...draft.dimensions, [dimCode]: e.target.value },
                            })
                          }
                          placeholder={
                            opts === undefined
                              ? `(${dimCode} 未在系統 dim catalog，純文字)`
                              : `(${dimCode} 暫無選項，純文字)`
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 摘要 */}
          <div>
            <label className={labelClass}>行內摘要（可選）</label>
            <input
              className={`${inputClass} w-full mt-1`}
              value={draft.description}
              onChange={(e) => onChange({ ...draft, description: e.target.value })}
              placeholder="本行特別說明，覆蓋 / 補充表頭摘要"
            />
          </div>
        </div>

        <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isPending}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={onSubmit}
            disabled={isPending}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
          >
            {isPending ? (draft.id ? "更新中⋯" : "新增中⋯") : draft.id ? "更新" : "新增"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ============================================================
// Kv helper
// ============================================================

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
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[#9A9890]">{label}</span>
      <span
        className={`${mono ? "font-mono" : ""} ${small ? "text-[11.5px] text-[#5A5955]" : "text-[12.5px] text-[#2C2C2A]"}`}
      >
        {value}
      </span>
    </div>
  );
}
