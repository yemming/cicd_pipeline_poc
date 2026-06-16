"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  deleteDraftEntryAction,
  postEntryAction,
  reverseEntryAction,
  saveDraftEntryAction,
  type DraftLineInput,
} from "@/lib/accounting/journal-entry-actions";
import type {
  DimensionLookupMap,
  JournalEntryLineRow,
  JournalEntryRow,
  PostableCoaOption,
} from "@/lib/accounting/queries";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit" | "create";

// 行內可編輯草稿（金額用字串，方便輸入）
type LineDraft = {
  key: string;
  coaCode: string;
  coa_id: string;
  debit: string;
  credit: string;
  dimensions: Record<string, string>;
  description: string;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿（未過帳）",
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

let keySeq = 0;
const newKey = () => `r${++keySeq}`;
const blankLine = (): LineDraft => ({
  key: newKey(),
  coaCode: "",
  coa_id: "",
  debit: "",
  credit: "",
  dimensions: {},
  description: "",
});

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

  const isPosted = entry?.status === "posted";
  const isReversed = entry?.status === "reversed";
  // 草稿與「建立模式」一律行內可編輯（NetSuite 風格，不再分 view/edit）
  const editable = initialMode === "create" || entry?.status === "draft";

  // ---- 表頭 state ----
  const [hEntryNo, setHEntryNo] = useState(entry?.entry_no ?? "");
  const [hEntryDate, setHEntryDate] = useState(entry?.entry_date ?? todayISO());
  const [hDesc, setHDesc] = useState(entry?.description ?? "");
  const [hSubsidiary, setHSubsidiary] = useState(entry?.subsidiary_id ?? "");

  // ---- 分錄行 state ----
  const coaById = useMemo(() => new Map(coaOptions.map((c) => [c.id, c])), [coaOptions]);
  const coaByCode = useMemo(
    () => new Map(coaOptions.map((c) => [c.account_code, c])),
    [coaOptions],
  );
  const dimMetaByCode = useMemo(() => {
    const m: Record<string, DimMeta> = {};
    for (const d of dimensionsCatalog) m[d.code] = d;
    return m;
  }, [dimensionsCatalog]);

  const initialDrafts = (): LineDraft[] => {
    if (lines.length === 0)
      return editable ? [blankLine()] : [];
    return lines.map((l) => ({
      key: newKey(),
      coaCode: l.coa_account_code ?? coaById.get(l.coa_id)?.account_code ?? "",
      coa_id: l.coa_id,
      debit: Number(l.debit) > 0 ? String(l.debit) : "",
      credit: Number(l.credit) > 0 ? String(l.credit) : "",
      dimensions: Object.fromEntries(
        Object.entries(l.dimensions ?? {}).map(([k, v]) => [k, String(v)]),
      ),
      description: l.description ?? "",
    }));
  };
  const [drafts, setDrafts] = useState<LineDraft[]>(initialDrafts);

  // 哪一行的維度正在編輯（index）
  const [dimEditIdx, setDimEditIdx] = useState<number | null>(null);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  // ---- 即時借貸總額 ----
  const sums = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const d of drafts) {
      debit += parseFloat(d.debit) || 0;
      credit += parseFloat(d.credit) || 0;
    }
    const diff = debit - credit;
    const balanced = Math.abs(diff) < 0.005 && debit > 0;
    return { debit, credit, diff, balanced };
  }, [drafts]);

  // 過帳前缺維度檢查（client 端先給提示，server trigger 才是最終把關）
  const missingDims = useMemo(() => {
    const out: string[] = [];
    drafts.forEach((d, i) => {
      if (!d.coa_id) return;
      const req = coaById.get(d.coa_id)?.required_dimensions ?? [];
      const miss = req.filter((dc) => !(d.dimensions[dc]?.trim()));
      if (miss.length) out.push(`第${i + 1}行缺 ${miss.join("/")}`);
    });
    return out;
  }, [drafts, coaById]);

  // ---- 行操作 ----
  const patchLine = (idx: number, patch: Partial<LineDraft>) => {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };
  const onCoaChange = (idx: number, code: string) => {
    const opt = coaByCode.get(code.trim());
    const patch: Partial<LineDraft> = { coaCode: code, coa_id: opt?.id ?? "" };
    // 自動帶表頭公司別到必填 SUBSIDIARY 維度
    if (opt) {
      const req = opt.required_dimensions ?? [];
      const cur = drafts[idx]?.dimensions ?? {};
      if (req.includes("SUBSIDIARY") && hSubsidiary && !cur.SUBSIDIARY) {
        patch.dimensions = { ...cur, SUBSIDIARY: hSubsidiary };
      }
    }
    patchLine(idx, patch);
  };
  const addRow = () => setDrafts((prev) => [...prev, blankLine()]);
  const removeRow = (idx: number) =>
    setDrafts((prev) => (prev.length <= 1 ? [blankLine()] : prev.filter((_, i) => i !== idx)));

  const toPayloadLines = (): DraftLineInput[] =>
    drafts.map((d) => ({
      coa_id: d.coa_id,
      debit: parseFloat(d.debit) || 0,
      credit: parseFloat(d.credit) || 0,
      dimensions: d.dimensions,
      description: d.description.trim() || null,
    }));

  // ---- 存檔（建立 / 更新草稿）----
  const doSave = (): Promise<{ ok: boolean; id?: string; entry_no?: string }> =>
    new Promise((resolve) => {
      startTransition(async () => {
        const res = await saveDraftEntryAction({
          id: entry?.id ?? null,
          entry_no: hEntryNo.trim() || null,
          entry_date: hEntryDate,
          description: hDesc.trim() || null,
          subsidiary_id: hSubsidiary || null,
          lines: toPayloadLines(),
        });
        if (res.ok) resolve({ ok: true, id: res.data.id, entry_no: res.data.entry_no });
        else {
          showBanner({ ok: false, msg: res.error });
          resolve({ ok: false });
        }
      });
    });

  const onSave = async () => {
    if (!hEntryDate) {
      showBanner({ ok: false, msg: "傳票日期必填" });
      return;
    }
    const r = await doSave();
    if (!r.ok) return;
    if (!entry) {
      showBanner({ ok: true, msg: `✓ 已建立 ${r.entry_no}` });
      router.push(`/admin/accounting/journal-entries/${r.id}`);
    } else {
      showBanner({ ok: true, msg: "✓ 已儲存" });
      router.refresh();
    }
  };

  // ---- 過帳：先存後過 ----
  const onPost = async () => {
    if (!hEntryDate) {
      showBanner({ ok: false, msg: "傳票日期必填" });
      return;
    }
    if (!sums.balanced) {
      showBanner({
        ok: false,
        msg: `借貸不平：借 ${fmtAmount(sums.debit)} ≠ 貸 ${fmtAmount(sums.credit)}`,
      });
      return;
    }
    if (missingDims.length) {
      showBanner({ ok: false, msg: `缺必填維度：${missingDims.join("；")}` });
      return;
    }
    if (!confirm("確定過帳？過帳後無法直接修改，需用反向沖銷。")) return;
    const saved = await doSave();
    if (!saved.ok || !saved.id) return;
    startTransition(async () => {
      const res = await postEntryAction(saved.id as string);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已過帳" });
        if (!entry) router.push(`/admin/accounting/journal-entries/${saved.id}`);
        else router.refresh();
      } else {
        // 已存成草稿但過帳失敗 → 導去草稿讓 user 修
        showBanner({ ok: false, msg: res.error });
        if (!entry) router.push(`/admin/accounting/journal-entries/${saved.id}`);
      }
    });
  };

  const onDelete = () => {
    if (!entry) return;
    if (!confirm(`確定刪除草稿「${entry.entry_no}」？`)) return;
    startTransition(async () => {
      const res = await deleteDraftEntryAction(entry.id);
      if (res.ok) router.push("/admin/accounting/journal-entries");
      else showBanner({ ok: false, msg: res.error });
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

  const subsidiaryOptions = dimensionLookups.SUBSIDIARY ?? [];
  const subsidiaryLabel = subsidiaryOptions.find((o) => o.value === hSubsidiary)?.label ?? "—";

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      {/* 1. Breadcrumb + 動作列 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/admin/accounting/journal-entries" className="hover:text-[#185FA5]">
            會計分錄
          </Link>
          <span>›</span>
          {initialMode === "create" ? (
            <>
              <span className="text-[#5A5955]">新增傳票</span>
              <span className="px-1.5 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B]">
                建立模式
              </span>
            </>
          ) : (
            <span className="text-[#5A5955] font-mono">{entry?.entry_no}</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/admin/accounting/journal-entries"
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回列表
          </Link>
          {!editable && (
            <button
              onClick={() => router.push("/admin/accounting/journal-entries/new")}
              disabled={isPending}
              className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
            >
              新增
            </button>
          )}
          {editable && (
            <>
              <button
                onClick={onSave}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                {isPending ? "儲存中⋯" : "儲存草稿"}
              </button>
              <button
                onClick={onPost}
                disabled={isPending || !sums.balanced || missingDims.length > 0}
                title={
                  !sums.balanced
                    ? "借貸需平衡才可過帳"
                    : missingDims.length
                      ? missingDims.join("；")
                      : "存檔並過帳，交給 DB validator"
                }
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                過帳
              </button>
            </>
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
          {entry?.status === "draft" && (
            <button
              onClick={onDelete}
              disabled={isPending}
              className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
            >
              刪除
            </button>
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

      {/* 2. 表頭卡（NetSuite Primary Information 風格）：欄位左、即時借貸總額右 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 傳票表頭</span>
          {!editable && entry && (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${
                STATUS_CHIP[entry.status] ?? "bg-[#F2F2F2] text-[#6B6A68]"
              }`}
            >
              {STATUS_LABEL[entry.status] ?? entry.status}
            </span>
          )}
        </header>
        <div className="px-4 py-4 flex items-start gap-6 flex-wrap">
          {/* 左：表頭欄位 */}
          <div className="flex-1 min-w-[360px] grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
            {/* 傳票編號 */}
            <div className="flex flex-col gap-1">
              <label className={labelClass}>
                傳票編號 {editable && !entry && <span className="text-[#9A9890]">（留空自動產生）</span>}
              </label>
              {editable && !entry ? (
                <input
                  className={inputClass}
                  value={hEntryNo}
                  onChange={(e) => setHEntryNo(e.target.value)}
                  placeholder="JE-自動"
                />
              ) : (
                <span className="text-[12.5px] font-mono text-[#2C2C2A] h-[30px] flex items-center">
                  {entry?.entry_no}
                </span>
              )}
            </div>
            {/* 傳票日期 */}
            <div className="flex flex-col gap-1">
              <label className={labelClass}>傳票日期 *</label>
              {editable ? (
                <input
                  type="date"
                  className={inputClass}
                  value={hEntryDate}
                  onChange={(e) => setHEntryDate(e.target.value)}
                />
              ) : (
                <span className="text-[12.5px] text-[#2C2C2A] h-[30px] flex items-center">
                  {entry?.entry_date}
                </span>
              )}
            </div>
            {/* 公司別 / Subsidiary */}
            <div className="flex flex-col gap-1">
              <label className={labelClass}>公司別（法人 / Subsidiary）</label>
              {editable ? (
                <select
                  className={inputClass}
                  value={hSubsidiary}
                  onChange={(e) => setHSubsidiary(e.target.value)}
                >
                  <option value="">— 未指定 —</option>
                  {subsidiaryOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-[12.5px] text-[#2C2C2A] h-[30px] flex items-center">
                  {subsidiaryLabel}
                </span>
              )}
            </div>
            {/* 貨幣（POC 單一本位幣） */}
            <div className="flex flex-col gap-1">
              <label className={labelClass}>貨幣</label>
              <span className="text-[12.5px] font-mono text-[#2C2C2A] h-[30px] flex items-center">
                TWD <span className="ml-1 text-[11px] text-[#9A9890]">（本位幣）</span>
              </span>
            </div>
            {/* 摘要 */}
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className={labelClass}>摘要說明</label>
              {editable ? (
                <input
                  className={inputClass}
                  value={hDesc}
                  onChange={(e) => setHDesc(e.target.value)}
                  placeholder="例：5 月房租；客戶 X 訂單訂金"
                />
              ) : (
                <span className="text-[12.5px] text-[#5A5955] h-[30px] flex items-center">
                  {entry?.description ?? "—"}
                </span>
              )}
            </div>
          </div>

          {/* 右：即時借貸總額 */}
          <div className="shrink-0 flex flex-col items-end gap-1 text-[12px] min-w-[200px]">
            <div className="text-[#9A9890]">借方總額 / 貸方總額</div>
            <div className="font-mono text-[15px]">
              <span className="text-[#185FA5]">{fmtAmount(sums.debit)}</span>
              <span className="mx-1.5 text-[#9A9890]">/</span>
              <span className="text-[#854F0B]">{fmtAmount(sums.credit)}</span>
            </div>
            <div className="text-[11.5px]">
              {sums.balanced ? (
                <span className="text-[#3B6D11]">✓ 借貸平衡</span>
              ) : (
                <span className="text-[#CC0000]">
                  ✗ 不平衡（差 {fmtAmount(Math.abs(sums.diff))}）
                </span>
              )}
            </div>
            {entry?.posted_at && (
              <div className="text-[11px] text-[#9A9890]">
                過帳於 {new Date(entry.posted_at).toLocaleString("zh-TW")}
              </div>
            )}
            {entry?.reversed_by_entry_id && (
              <Link
                href={`/admin/accounting/journal-entries/${entry.reversed_by_entry_id}`}
                className="text-[11px] text-[#185FA5] hover:underline"
              >
                → 已被反向沖銷
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* 3. 分錄行 grid（NetSuite Lines 風格：一頁編完、即時加減行） */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 分錄行（{drafts.filter((d) => d.coa_id).length}）
          </span>
          {editable && missingDims.length > 0 && (
            <span className="text-[11.5px] text-[#CC0000]">⚠ {missingDims.join("；")}</span>
          )}
          {editable && (
            <button
              onClick={addRow}
              disabled={isPending}
              className="ml-auto h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增行
            </button>
          )}
        </header>

        {/* 共用 datalist：科目搜尋 */}
        <datalist id="je-coa-options">
          {coaOptions.map((c) => (
            <option key={c.id} value={c.account_code}>
              {c.account_code} {c.name_zh_tw}
            </option>
          ))}
        </datalist>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-[11px] text-[#9A9890] bg-[#FBFAF7]">
              <tr>
                <th className="text-left font-medium py-2 px-3 w-[40px]">#</th>
                <th className="text-left font-medium py-2 px-3 w-[300px]">科目 *</th>
                <th className="text-right font-medium py-2 px-3 w-[120px]">借</th>
                <th className="text-right font-medium py-2 px-3 w-[120px]">貸</th>
                <th className="text-left font-medium py-2 px-3 w-[260px]">維度（統計）</th>
                <th className="text-left font-medium py-2 px-3">摘要</th>
                {editable && <th className="text-right font-medium py-2 px-3 w-[60px]">操作</th>}
              </tr>
            </thead>
            <tbody>
              {drafts.map((d, idx) => {
                const opt = d.coa_id ? coaById.get(d.coa_id) : null;
                const req = opt?.required_dimensions ?? [];
                const miss = req.filter((dc) => !(d.dimensions[dc]?.trim()));
                return (
                  <tr key={d.key} className="border-t border-[#F8F7F4] align-top">
                    <td className="py-1.5 px-3 text-[#9A9890]">{idx + 1}</td>
                    {/* 科目 */}
                    <td className="py-1.5 px-3">
                      {editable ? (
                        <>
                          <input
                            list="je-coa-options"
                            className={`${inputClass} w-full`}
                            value={d.coaCode}
                            onChange={(e) => onCoaChange(idx, e.target.value)}
                            placeholder="輸入代碼或名稱"
                          />
                          <div className="mt-0.5 text-[11px] truncate">
                            {opt ? (
                              <span className="text-[#5A5955]">{opt.name_zh_tw}</span>
                            ) : d.coaCode ? (
                              <span className="text-[#CC0000]">查無此科目代碼</span>
                            ) : (
                              <span className="text-[#9A9890]">僅 L5 可入帳科目</span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div>
                          <span className="font-mono text-[#1A3A5C]">{d.coaCode}</span>{" "}
                          <span className="text-[#5A5955]">{opt?.name_zh_tw ?? ""}</span>
                        </div>
                      )}
                    </td>
                    {/* 借 */}
                    <td className="py-1.5 px-3 text-right">
                      {editable ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={`${inputClass} w-full text-right font-mono`}
                          value={d.debit}
                          onChange={(e) =>
                            patchLine(idx, { debit: e.target.value, credit: "" })
                          }
                          placeholder="0.00"
                        />
                      ) : (
                        <span className="font-mono">
                          {parseFloat(d.debit) > 0 ? fmtAmount(parseFloat(d.debit)) : ""}
                        </span>
                      )}
                    </td>
                    {/* 貸 */}
                    <td className="py-1.5 px-3 text-right">
                      {editable ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={`${inputClass} w-full text-right font-mono`}
                          value={d.credit}
                          onChange={(e) =>
                            patchLine(idx, { credit: e.target.value, debit: "" })
                          }
                          placeholder="0.00"
                        />
                      ) : (
                        <span className="font-mono">
                          {parseFloat(d.credit) > 0 ? fmtAmount(parseFloat(d.credit)) : ""}
                        </span>
                      )}
                    </td>
                    {/* 維度 */}
                    <td className="py-1.5 px-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {Object.entries(d.dimensions)
                          .filter(([, v]) => v?.trim())
                          .map(([k, v]) => {
                            const label =
                              (dimensionLookups[k] ?? []).find((o) => o.value === v)?.label ??
                              String(v);
                            return (
                              <span
                                key={k}
                                className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]"
                                title={`${dimMetaByCode[k]?.name ?? k}=${label}`}
                              >
                                {k}:{label.slice(0, 10)}
                              </span>
                            );
                          })}
                        {miss.map((dc) => (
                          <span
                            key={dc}
                            className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDECEA] text-[#CC0000]"
                          >
                            缺 {dc}
                          </span>
                        ))}
                        {editable && (
                          <button
                            onClick={() => setDimEditIdx(idx)}
                            disabled={!d.coa_id || isPending}
                            className="h-[24px] px-2 rounded text-[11px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-40"
                            title={d.coa_id ? "設定此行維度" : "先選科目"}
                          >
                            設定
                          </button>
                        )}
                        {!editable &&
                          Object.values(d.dimensions).filter((v) => v?.trim()).length === 0 &&
                          miss.length === 0 && <span className="text-[#9A9890]">—</span>}
                      </div>
                    </td>
                    {/* 摘要 */}
                    <td className="py-1.5 px-3">
                      {editable ? (
                        <input
                          className={`${inputClass} w-full`}
                          value={d.description}
                          onChange={(e) => patchLine(idx, { description: e.target.value })}
                          placeholder="行內摘要（可選）"
                        />
                      ) : (
                        <span className="text-[#5A5955]">{d.description || "—"}</span>
                      )}
                    </td>
                    {/* 操作 */}
                    {editable && (
                      <td className="py-1.5 px-3 text-right">
                        <button
                          onClick={() => removeRow(idx)}
                          disabled={isPending}
                          className="h-[26px] w-[26px] rounded text-[13px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                          title="刪除此行"
                        >
                          ×
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {drafts.length === 0 && (
                <tr>
                  <td colSpan={editable ? 7 : 6} className="py-12 text-center text-[12px] text-[#9A9890]">
                    尚無分錄行
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t-2 border-[#EEECE6] bg-[#FBFAF7]">
              <tr>
                <td colSpan={2} className="py-2 px-3 text-right text-[11.5px] text-[#5A5955] font-semibold">
                  合計
                </td>
                <td className="py-2 px-3 text-right font-mono font-semibold text-[#185FA5]">
                  {fmtAmount(sums.debit)}
                </td>
                <td className="py-2 px-3 text-right font-mono font-semibold text-[#854F0B]">
                  {fmtAmount(sums.credit)}
                </td>
                <td colSpan={editable ? 3 : 2} className="py-2 px-3 text-[11.5px]">
                  {sums.balanced ? (
                    <span className="text-[#3B6D11]">✓ 借貸平衡</span>
                  ) : (
                    <span className="text-[#CC0000]">
                      ✗ 不平衡，差 {fmtAmount(Math.abs(sums.diff))}
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {isReversed && (
        <div className="bg-[#F8F7F4] border border-[#EEECE6] rounded-lg px-4 py-3 text-[12px] text-[#5A5955]">
          此分錄已被反向沖銷，僅供檢視。
        </div>
      )}

      {/* 維度設定彈窗（per-line，因維度依科目動態必填） */}
      {dimEditIdx !== null && drafts[dimEditIdx] && (
        <DimensionModal
          line={drafts[dimEditIdx]}
          lineNo={dimEditIdx + 1}
          coa={drafts[dimEditIdx].coa_id ? coaById.get(drafts[dimEditIdx].coa_id) ?? null : null}
          dimensionLookups={dimensionLookups}
          dimMetaByCode={dimMetaByCode}
          onApply={(dims) => {
            patchLine(dimEditIdx, { dimensions: dims });
            setDimEditIdx(null);
          }}
          onClose={() => setDimEditIdx(null)}
        />
      )}
    </main>
  );
}

// ============================================================
// 維度設定彈窗 — 依科目 required_dimensions 動態出欄
// ============================================================

function DimensionModal({
  line,
  lineNo,
  coa,
  dimensionLookups,
  dimMetaByCode,
  onApply,
  onClose,
}: {
  line: LineDraft;
  lineNo: number;
  coa: PostableCoaOption | null;
  dimensionLookups: DimensionLookupMap;
  dimMetaByCode: Record<string, DimMeta>;
  onApply: (dims: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [dims, setDims] = useState<Record<string, string>>(line.dimensions);
  const requiredDims = coa?.required_dimensions ?? [];

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";

  return (
    <div
      className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-[640px] max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-[#EEECE6] flex items-center gap-2">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">第 {lineNo} 行 · 統計維度</h2>
          {coa && (
            <span className="text-[11.5px] text-[#9A9890]">
              {coa.account_code} {coa.name_zh_tw}
            </span>
          )}
        </header>
        <div className="px-5 py-4 space-y-3">
          {requiredDims.length === 0 ? (
            <div className="px-3 py-2.5 bg-[#F8F7F4] border border-[#EEECE6] rounded text-[12px] text-[#9A9890]">
              此科目不要求必填維度。仍可在下方加任意維度（選填）。
            </div>
          ) : (
            <p className="text-[11.5px] text-[#9A9890]">
              此科目必填 {requiredDims.length} 個維度（標 <span className="text-[#CC0000]">*</span>）。
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {requiredDims.map((dimCode) => {
              const meta = dimMetaByCode[dimCode];
              const opts = dimensionLookups[dimCode];
              const value = dims[dimCode] ?? "";
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
                      onChange={(e) => setDims((p) => ({ ...p, [dimCode]: e.target.value }))}
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
                      onChange={(e) => setDims((p) => ({ ...p, [dimCode]: e.target.value }))}
                      placeholder={`(${dimCode} 純文字)`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
          <button
            onClick={() => {
              const clean: Record<string, string> = {};
              for (const [k, v] of Object.entries(dims)) if (v?.trim()) clean[k] = v.trim();
              onApply(clean);
            }}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
          >
            套用
          </button>
        </footer>
      </div>
    </div>
  );
}
