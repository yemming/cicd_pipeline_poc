"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createP1Action,
  updateP1Action,
  setP1ActiveAction,
  deleteP1Action,
  createP2Action,
  updateP2Action,
  setP2ActiveAction,
  deleteP2Action,
  type P1Input,
  type P2Input,
} from "@/lib/aftersales/ro-numbering-actions";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { PrefixP1Row, PrefixP2Row } from "@/domain/ro-numbering";
import {
  ACCT_TYPE_LABELS,
  ACCT_TYPE_OPTIONS,
  acctChipStyle,
  COMMON_COMBOS,
  validatePrefixCode,
  type AcctType,
} from "@/domain/ro-numbering.constants";

type Banner = { ok: boolean; msg: string } | null;
type ModalState =
  | { kind: "p1"; mode: "create" | "edit"; row: PrefixP1Row | null }
  | { kind: "p2"; mode: "create" | "edit"; row: PrefixP2Row | null }
  | null;

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

export type RoNumberingPageHeader = {
  title?: string;
  caption?: string;
  sprintChip?: string;
};

export function RoNumberingBoard({
  p1Rows,
  p2Rows,
  canEdit,
  pageHeader,
}: {
  p1Rows: PrefixP1Row[];
  p2Rows: PrefixP2Row[];
  canEdit: boolean;
  pageHeader?: RoNumberingPageHeader;
}) {
  const h1Text = pageHeader?.title ?? "工單編號規則";
  const captionText =
    pageHeader?.caption ?? "維護 P1 業務類型 + P2 付款性質前綴碼，組合產生工單編號";
  const sprintText = pageHeader?.sprintChip ?? "售後管理";
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [modal, setModal] = useState<ModalState>(null);

  // 即時預覽：選中的 P1/P2 → 拼字串
  const [previewP1, setPreviewP1] = useState<string>(p1Rows[0]?.code ?? "MN");
  const [previewP2, setPreviewP2] = useState<string>(p2Rows[0]?.code ?? "CP");

  // 今天的日期：mounted 後才有真值（避免 SSR / client mismatch）
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  const todayStr = useMemo(() => {
    if (!mounted) return "------";
    const d = new Date();
    return `${pad(d.getFullYear() % 100)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  }, [mounted]);

  const previewFull = useMemo(() => {
    if (!mounted) return `${previewP1}-${previewP2}-------001`;
    return `${previewP1}-${previewP2}-${todayStr}-001`;
  }, [previewP1, previewP2, todayStr, mounted]);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  /* ───── P1 操作 ───── */
  const toggleP1Active = (r: PrefixP1Row) => {
    if (!canEdit) return;
    startTransition(async () => {
      const res = await setP1ActiveAction(r.id, !r.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };
  const removeP1 = (r: PrefixP1Row) => {
    if (!canEdit) return;
    if (!confirm(`確定刪除「${r.code} ${r.name}」？\n（已被工單引用無法刪除，建議改成停用）`))
      return;
    startTransition(async () => {
      const res = await deleteP1Action(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  /* ───── P2 操作 ───── */
  const toggleP2Active = (r: PrefixP2Row) => {
    if (!canEdit) return;
    startTransition(async () => {
      const res = await setP2ActiveAction(r.id, !r.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };
  const removeP2 = (r: PrefixP2Row) => {
    if (!canEdit) return;
    if (!confirm(`確定刪除「${r.code} ${r.name}」？\n（已被工單引用無法刪除，建議改成停用）`))
      return;
    startTransition(async () => {
      const res = await deleteP2Action(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  /* ───── DataGrid columns ───── */
  const p1Columns: DataGridColumn<PrefixP1Row>[] = [
    {
      id: "code",
      header: "代碼",
      width: 90,
      hideable: false,
      cell: (r) => (
        <span className="font-mono text-[12.5px] font-bold bg-[#1A1A1A] text-[#7FFFD4] px-2 py-0.5 rounded">
          {r.code}
        </span>
      ),
      exportValue: (r) => r.code,
      sortValue: (r) => r.code,
    },
    {
      id: "name",
      header: "業務類型",
      cell: (r) => <span className="text-[12.5px] text-[#2C2C2A]">{r.name}</span>,
      exportValue: (r) => r.name,
    },
    {
      id: "acct_type",
      header: "財會性質",
      width: 130,
      cell: (r) => {
        const s = acctChipStyle(r.acct_type);
        return (
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap"
            style={{ background: s.bg, color: s.fg }}
          >
            {ACCT_TYPE_LABELS[r.acct_type]}
          </span>
        );
      },
      exportValue: (r) => ACCT_TYPE_LABELS[r.acct_type],
      sortValue: (r) => r.acct_type,
    },
    {
      id: "acct_label",
      header: "會計說明",
      cell: (r) => <span className="text-[11.5px] text-[#5A5955]">{r.acct_label}</span>,
      exportValue: (r) => r.acct_label,
    },
    {
      id: "note",
      header: "備註",
      cell: (r) => <span className="text-[11px] text-[#9A9890]">{r.note}</span>,
      exportValue: (r) => r.note,
    },
    {
      id: "is_active",
      header: "狀態",
      width: 70,
      cell: (r) =>
        r.is_active ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11] whitespace-nowrap">
            啟用
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68] whitespace-nowrap">
            停用
          </span>
        ),
      sortValue: (r) => (r.is_active ? 1 : 0),
      exportValue: (r) => (r.is_active ? "啟用" : "停用"),
    },
  ];

  const p2Columns: DataGridColumn<PrefixP2Row>[] = [
    {
      id: "code",
      header: "代碼",
      width: 90,
      hideable: false,
      cell: (r) => (
        <span className="font-mono text-[12.5px] font-bold bg-[#2C1A00] text-[#FFD580] px-2 py-0.5 rounded">
          {r.code}
        </span>
      ),
      exportValue: (r) => r.code,
      sortValue: (r) => r.code,
    },
    {
      id: "name",
      header: "付款性質",
      cell: (r) => <span className="text-[12.5px] text-[#2C2C2A]">{r.name}</span>,
      exportValue: (r) => r.name,
    },
    {
      id: "target",
      header: "適用對象",
      cell: (r) => <span className="text-[11.5px] text-[#5A5955]">{r.target}</span>,
      exportValue: (r) => r.target,
    },
    {
      id: "note",
      header: "備註",
      cell: (r) => <span className="text-[11px] text-[#9A9890]">{r.note}</span>,
      exportValue: (r) => r.note,
    },
    {
      id: "is_active",
      header: "狀態",
      width: 70,
      cell: (r) =>
        r.is_active ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11] whitespace-nowrap">
            啟用
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68] whitespace-nowrap">
            停用
          </span>
        ),
      sortValue: (r) => (r.is_active ? 1 : 0),
      exportValue: (r) => (r.is_active ? "啟用" : "停用"),
    },
  ];

  const rowActionsP1 = (r: PrefixP1Row) => (
    <div className="flex gap-1">
      <button
        type="button"
        disabled={!canEdit || isPending}
        onClick={() => setModal({ kind: "p1", mode: "edit", row: r })}
        className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
      >
        編輯
      </button>
      <button
        type="button"
        disabled={!canEdit || isPending}
        onClick={() => toggleP1Active(r)}
        className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
      >
        {r.is_active ? "停用" : "啟用"}
      </button>
      <button
        type="button"
        disabled={!canEdit || isPending}
        onClick={() => removeP1(r)}
        className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
      >
        刪除
      </button>
    </div>
  );

  const rowActionsP2 = (r: PrefixP2Row) => (
    <div className="flex gap-1">
      <button
        type="button"
        disabled={!canEdit || isPending}
        onClick={() => setModal({ kind: "p2", mode: "edit", row: r })}
        className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
      >
        編輯
      </button>
      <button
        type="button"
        disabled={!canEdit || isPending}
        onClick={() => toggleP2Active(r)}
        className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
      >
        {r.is_active ? "停用" : "啟用"}
      </button>
      <button
        type="button"
        disabled={!canEdit || isPending}
        onClick={() => removeP2(r)}
        className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
      >
        刪除
      </button>
    </div>
  );

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">{h1Text}</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          {sprintText}
        </span>
        <span className="text-[12px] text-[#9A9890]">{captionText}</span>
      </header>

      {/* 警告提示 */}
      <div className="bg-[#FAEEDA] border border-[#BA7517] rounded-lg px-3.5 py-2.5 text-[12px] text-[#412402] leading-relaxed">
        <strong>⚠️ 重要：</strong>前綴碼一經使用即不建議修改，以免影響歷史統計分析。建議系統上線前完整設定，日後僅新增。已被工單引用的代碼無法刪除，請改成「停用」。
      </div>

      {/* 即時預覽 + 組合範例 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 工單編號格式即時預覽</span>
          <span className="text-[11px] text-[#9A9890]">流水號每日自動歸零 ｜ 年月日格式：YYMMDD</span>
        </header>
        <div className="px-4 py-3.5">
          <div className="bg-[#1A1A1A] rounded-lg px-5 py-4 flex items-center gap-2 flex-wrap">
            <PreviewSeg label="前綴碼1（業務類型）">
              <select
                value={previewP1}
                onChange={(e) => setPreviewP1(e.target.value)}
                className="bg-transparent text-[#7FFFD4] font-mono text-[16px] font-bold border-none outline-none cursor-pointer"
              >
                {p1Rows.filter((r) => r.is_active).map((r) => (
                  <option key={r.id} value={r.code} style={{ color: "#000" }}>
                    {r.code}
                  </option>
                ))}
              </select>
            </PreviewSeg>
            <span className="text-[20px] text-white/25 mt-3.5 font-light">-</span>
            <PreviewSeg label="前綴碼2（付款性質）">
              <select
                value={previewP2}
                onChange={(e) => setPreviewP2(e.target.value)}
                className="bg-transparent text-[#FFD580] font-mono text-[16px] font-bold border-none outline-none cursor-pointer"
              >
                {p2Rows.filter((r) => r.is_active).map((r) => (
                  <option key={r.id} value={r.code} style={{ color: "#000" }}>
                    {r.code}
                  </option>
                ))}
              </select>
            </PreviewSeg>
            <span className="text-[20px] text-white/25 mt-3.5 font-light">-</span>
            <PreviewSeg label="年月日（自動）">
              <span className="text-[16px] font-bold font-mono">{todayStr}</span>
            </PreviewSeg>
            <span className="text-[20px] text-white/25 mt-3.5 font-light">-</span>
            <PreviewSeg label="流水號（自動）">
              <span className="text-[16px] font-bold font-mono">001</span>
            </PreviewSeg>
          </div>
          <div className="text-[12px] text-[#5A5955] mt-2.5">
            完整範例：<strong className="font-mono text-[13px] text-[#2C2C2A]">{previewFull}</strong>
          </div>

          {/* 常用組合範例 */}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {COMMON_COMBOS.map((c) => (
              <div
                key={`${c.p1}-${c.p2}`}
                className="flex items-center gap-2.5 px-2.5 py-1.5 bg-[#F8F7F4] rounded border border-[#EEECE6]"
              >
                <span
                  className="font-mono text-[13px] font-bold min-w-[68px]"
                  style={{ color: c.color }}
                >
                  {c.p1}-{c.p2}
                </span>
                <span className="text-[11.5px] text-[#2C2C2A]">{c.desc}</span>
                <span className="ml-auto font-mono text-[11px] text-[#9A9890]">
                  {c.p1}-{c.p2}-{todayStr}-001
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 雙表並排 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {/* P1 */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 前綴碼 P1　業務類型</span>
            <button
              type="button"
              disabled={!canEdit || isPending}
              onClick={() => setModal({ kind: "p1", mode: "create", row: null })}
              className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增業務類型
            </button>
          </header>
          <div className="p-3">
            <div className="text-[11.5px] text-[#9A9890] mb-2">
              共 <b className="text-[#2C2C2A]">{p1Rows.length}</b> 筆
            </div>
            <DataGrid<PrefixP1Row>
              columns={p1Columns}
              data={p1Rows}
              rowKey={(r) => r.id}
              persistKey="aftersales/management/ro-numbering/p1"
              exportFileName="ro-prefix-p1"
              emptyMessage="尚未維護任何業務類型前綴碼"
              disabled={isPending}
              rowActions={rowActionsP1}
              rowActionsWidth={210}
            />
          </div>
        </section>

        {/* P2 */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 前綴碼 P2　付款性質</span>
            <button
              type="button"
              disabled={!canEdit || isPending}
              onClick={() => setModal({ kind: "p2", mode: "create", row: null })}
              className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增付款性質
            </button>
          </header>
          <div className="p-3">
            <div className="text-[11.5px] text-[#9A9890] mb-2">
              共 <b className="text-[#2C2C2A]">{p2Rows.length}</b> 筆
            </div>
            <DataGrid<PrefixP2Row>
              columns={p2Columns}
              data={p2Rows}
              rowKey={(r) => r.id}
              persistKey="aftersales/management/ro-numbering/p2"
              exportFileName="ro-prefix-p2"
              emptyMessage="尚未維護任何付款性質前綴碼"
              disabled={isPending}
              rowActions={rowActionsP2}
              rowActionsWidth={210}
            />
          </div>
        </section>
      </div>

      {/* Modal */}
      {modal?.kind === "p1" && (
        <P1Modal
          mode={modal.mode}
          row={modal.row}
          onClose={() => setModal(null)}
          onDone={(b) => {
            setModal(null);
            showBanner(b);
            if (b?.ok) router.refresh();
          }}
        />
      )}
      {modal?.kind === "p2" && (
        <P2Modal
          mode={modal.mode}
          row={modal.row}
          onClose={() => setModal(null)}
          onDone={(b) => {
            setModal(null);
            showBanner(b);
            if (b?.ok) router.refresh();
          }}
        />
      )}

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
    </main>
  );
}

function PreviewSeg({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center">
      <label className="text-[9px] text-white/50 mb-1 tracking-wider uppercase">{label}</label>
      <div>{children}</div>
    </div>
  );
}

/* ───────── P1 Modal ───────── */
function P1Modal({
  mode,
  row,
  onClose,
  onDone,
}: {
  mode: "create" | "edit";
  row: PrefixP1Row | null;
  onClose: () => void;
  onDone: (b: Banner) => void;
}) {
  const [code, setCode] = useState(row?.code ?? "");
  const [name, setName] = useState(row?.name ?? "");
  const [acctType, setAcctType] = useState<AcctType>(row?.acct_type ?? "income");
  const [acctLabel, setAcctLabel] = useState(row?.acct_label ?? "客付收入");
  const [note, setNote] = useState(row?.note ?? "");
  const [sortOrder, setSortOrder] = useState(row?.sort_order ?? 99);
  const [isActive, setIsActive] = useState(row?.is_active ?? true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const codeErr = validatePrefixCode(code);
    if (codeErr) {
      setError(codeErr);
      return;
    }
    if (!name.trim()) {
      setError("業務類型名稱必填");
      return;
    }
    const input: P1Input = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      acct_type: acctType,
      acct_label: acctLabel.trim(),
      note: note.trim(),
      sort_order: Number(sortOrder) || 99,
      is_active: isActive,
    };
    startTransition(async () => {
      const res = mode === "create"
        ? await createP1Action(input)
        : await updateP1Action(row!.id, input);
      if (res.ok) {
        onDone({ ok: true, msg: mode === "create" ? "✓ 已新增" : "✓ 已更新" });
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl w-[480px] max-w-[92vw] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 bg-[#1A1A1A] text-white text-[13px] font-semibold">
          {mode === "create" ? "新增 P1 業務類型前綴碼" : `編輯 P1 業務類型前綴碼 — ${row?.code}`}
        </header>
        <div
          className={`px-4 py-4 space-y-3 ${pending ? "pointer-events-none opacity-60" : ""}`}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>代碼（2–3 碼大寫）</label>
              <input
                className={inputClass + " font-mono uppercase"}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="MN"
                maxLength={3}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>排序</label>
              <input
                type="number"
                className={inputClass}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>業務類型名稱</label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="定保 Maintenance"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>財會性質</label>
              <select
                className={inputClass}
                value={acctType}
                onChange={(e) => setAcctType(e.target.value as AcctType)}
              >
                {ACCT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>會計說明（顯示用）</label>
              <input
                className={inputClass}
                value={acctLabel}
                onChange={(e) => setAcctLabel(e.target.value)}
                placeholder="客付收入"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>備註</label>
            <input
              className={inputClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="定期保養、里程保養、Desmo保養"
            />
          </div>
          <label className="flex items-center gap-2 text-[12px] text-[#5A5955]">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            啟用（停用後不會出現在新建工單的選單）
          </label>
          {error && (
            <div className="text-[12px] text-[#CC0000] bg-[#FDECEA] border border-[#F5AEAD] rounded px-2 py-1.5">
              {error}
            </div>
          )}
        </div>
        <footer className="px-4 py-3 border-t border-[#EEECE6] bg-[#F8F7F4] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
          >
            {pending ? (mode === "create" ? "建立中⋯" : "儲存中⋯") : mode === "create" ? "建立" : "儲存變更"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ───────── P2 Modal ───────── */
function P2Modal({
  mode,
  row,
  onClose,
  onDone,
}: {
  mode: "create" | "edit";
  row: PrefixP2Row | null;
  onClose: () => void;
  onDone: (b: Banner) => void;
}) {
  const [code, setCode] = useState(row?.code ?? "");
  const [name, setName] = useState(row?.name ?? "");
  const [target, setTarget] = useState(row?.target ?? "");
  const [note, setNote] = useState(row?.note ?? "");
  const [sortOrder, setSortOrder] = useState(row?.sort_order ?? 99);
  const [isActive, setIsActive] = useState(row?.is_active ?? true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const codeErr = validatePrefixCode(code);
    if (codeErr) {
      setError(codeErr);
      return;
    }
    if (!name.trim()) {
      setError("付款性質名稱必填");
      return;
    }
    const input: P2Input = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      target: target.trim(),
      note: note.trim(),
      sort_order: Number(sortOrder) || 99,
      is_active: isActive,
    };
    startTransition(async () => {
      const res = mode === "create"
        ? await createP2Action(input)
        : await updateP2Action(row!.id, input);
      if (res.ok) {
        onDone({ ok: true, msg: mode === "create" ? "✓ 已新增" : "✓ 已更新" });
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl w-[480px] max-w-[92vw] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 bg-[#1A1A1A] text-white text-[13px] font-semibold">
          {mode === "create" ? "新增 P2 付款性質前綴碼" : `編輯 P2 付款性質前綴碼 — ${row?.code}`}
        </header>
        <div
          className={`px-4 py-4 space-y-3 ${pending ? "pointer-events-none opacity-60" : ""}`}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>代碼（2 碼大寫）</label>
              <input
                className={inputClass + " font-mono uppercase"}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="CP"
                maxLength={3}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>排序</label>
              <input
                type="number"
                className={inputClass}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>付款性質名稱</label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer Pay 客付"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>適用對象</label>
            <input
              className={inputClass}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="一般客戶自費"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>備註</label>
            <input
              className={inputClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="正常收費"
            />
          </div>
          <label className="flex items-center gap-2 text-[12px] text-[#5A5955]">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            啟用（停用後不會出現在新建工單的選單）
          </label>
          {error && (
            <div className="text-[12px] text-[#CC0000] bg-[#FDECEA] border border-[#F5AEAD] rounded px-2 py-1.5">
              {error}
            </div>
          )}
        </div>
        <footer className="px-4 py-3 border-t border-[#EEECE6] bg-[#F8F7F4] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
          >
            {pending ? (mode === "create" ? "建立中⋯" : "儲存中⋯") : mode === "create" ? "建立" : "儲存變更"}
          </button>
        </footer>
      </div>
    </div>
  );
}
