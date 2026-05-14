"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createAdjustment } from "@/domain/adjustments";
import type { NewAdjustmentFormData, CreateAdjustmentInput } from "@/domain/adjustments";

type AdjType = CreateAdjustmentInput["type"];

const TYPE_OPTIONS: Array<{ value: AdjType; label: string; hint: string; direction: "in" | "out" | "both" }> = [
  { value: "exception_in", label: "例外進貨", hint: "正數=入庫；不走 PO 的補庫存", direction: "in" },
  { value: "exception_out", label: "例外出貨", hint: "負數=出庫；不走 RO 的出庫", direction: "out" },
  { value: "damage", label: "損耗報廢", hint: "負數=出庫；損壞 / 過期 / 報廢", direction: "out" },
  { value: "manual", label: "手動調整", hint: "正負皆可；手動修整盤點誤差", direction: "both" },
  { value: "other", label: "其他", hint: "正負皆可", direction: "both" },
];

type FormLine = {
  item_id: string;
  qty_delta: string;          // user input, parse on submit
  unit_cost: string;
  serial_no: string;
  batch_no: string;
  notes: string;
};

function emptyLine(): FormLine {
  return { item_id: "", qty_delta: "", unit_cost: "0", serial_no: "", batch_no: "", notes: "" };
}

type Banner = { ok: boolean; msg: string } | null;

const VALID_TYPES: AdjType[] = ["exception_in", "exception_out", "damage", "manual", "other"];

export function NewExceptionForm({
  data,
  initialType,
}: {
  data: NewAdjustmentFormData;
  initialType?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const seedType: AdjType =
    initialType && (VALID_TYPES as string[]).includes(initialType)
      ? (initialType as AdjType)
      : "exception_in";
  const [type, setType] = useState<AdjType>(seedType);
  const [warehouseId, setWarehouseId] = useState(data.warehouses[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);

  const typeDef = TYPE_OPTIONS.find((t) => t.value === type)!;

  const previewTotal = useMemo(() => {
    return lines.reduce((s, l) => {
      const q = Math.abs(Number(l.qty_delta) || 0);
      const c = Number(l.unit_cost) || 0;
      return s + q * c;
    }, 0);
  }, [lines]);

  const flash = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const updateLine = (idx: number, patch: Partial<FormLine>) =>
    setLines((p) => p.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const addLine = () => setLines((p) => [...p, emptyLine()]);
  const removeLine = (idx: number) => setLines((p) => p.filter((_, i) => i !== idx));

  const submit = () => {
    if (!warehouseId) {
      flash({ ok: false, msg: "請選倉庫" });
      return;
    }
    if (!reason.trim()) {
      flash({ ok: false, msg: "請填原因" });
      return;
    }
    const parsed: CreateAdjustmentInput["lines"] = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.item_id) continue;
      let q = Number(l.qty_delta);
      if (!Number.isFinite(q) || q === 0) {
        flash({ ok: false, msg: `第 ${i + 1} 行：數量需為非零數字` });
        return;
      }
      // 方向自動正負化（如果使用者填了正號但類型是 out → 自動轉負）
      if (typeDef.direction === "in" && q < 0) q = Math.abs(q);
      if (typeDef.direction === "out" && q > 0) q = -Math.abs(q);
      parsed.push({
        item_id: l.item_id,
        qty_delta: q,
        unit_cost: Number(l.unit_cost) || 0,
        serial_no: l.serial_no.trim() || null,
        batch_no: l.batch_no.trim() || null,
        notes: l.notes.trim() || null,
      });
    }
    if (parsed.length === 0) {
      flash({ ok: false, msg: "至少需要一筆有效明細" });
      return;
    }

    startTransition(async () => {
      const res = await createAdjustment({
        type,
        warehouse_id: warehouseId,
        reason: reason.trim(),
        notes: notes.trim() || null,
        lines: parsed,
      });
      if (res.ok) {
        flash({ ok: true, msg: `✓ 已建立 ${res.data.adj_no}` });
        router.push(`/parts/operations/exceptions/${res.data.id}`);
      } else {
        flash({ ok: false, msg: res.error });
      }
    });
  };

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/operations/exceptions" className="hover:text-[#185FA5]">
            例外出入庫
          </Link>
          <span>›</span>
          <span className="text-[#5A5955]">新增調整單</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
            建立模式
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/operations/exceptions"
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            取消
          </Link>
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50 shadow-sm"
          >
            {isPending ? "建立中⋯" : "建立並過帳"}
          </button>
        </div>
      </div>

      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <h1 className="text-[18px] font-semibold text-[#2C2C2A]">新增例外調整單</h1>
        <p className="text-[12px] text-[#9A9890] mt-1">
          建立後即過帳並影響庫存。出庫類型可省略序列號／批號（走 FIFO）。
        </p>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              類型 <span className="text-[#CC0000]">*</span>
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as AdjType)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-[#9A9890] mt-0.5">{typeDef.hint}</p>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              倉庫 <span className="text-[#CC0000]">*</span>
            </label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {data.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code ? `${w.code} ` : ""}
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              原因 <span className="text-[#CC0000]">*</span>
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例：客退處理 / 損壞報廢 / 盤點修正"
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </div>
          <div className="flex flex-col gap-1 md:col-span-3">
            <label className="text-[11px] text-[#9A9890] font-medium">備註</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="補充說明（選填）"
              className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </div>
        </div>
      </section>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 明細（{lines.length}）
          </span>
          <button
            type="button"
            onClick={addLine}
            disabled={isPending}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            ＋ 加一行
          </button>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-[#F8F7F4] text-left text-[11px] text-[#9A9890]">
                <th className="px-3 py-2 w-[40px]">#</th>
                <th className="px-3 py-2 min-w-[260px]">料件</th>
                <th className="px-3 py-2 w-[140px]">序列號（選填）</th>
                <th className="px-3 py-2 w-[140px]">批號（選填）</th>
                <th className="px-3 py-2 text-right w-[110px]">數量</th>
                <th className="px-3 py-2 text-right w-[110px]">單價</th>
                <th className="px-3 py-2 min-w-[140px]">備註</th>
                <th className="px-3 py-2 w-[60px]"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={idx} className="border-t border-[#EEECE6]">
                  <td className="px-3 py-2 font-mono text-[#5A5955]">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <select
                      value={l.item_id}
                      onChange={(e) => updateLine(idx, { item_id: e.target.value })}
                      className="w-full h-[26px] border border-[#D5D3CB] rounded px-2 text-[12px] focus:border-[#185FA5] outline-none"
                    >
                      <option value="">— 選料件 —</option>
                      {data.items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.code} · {i.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={l.serial_no}
                      onChange={(e) => updateLine(idx, { serial_no: e.target.value })}
                      placeholder="SN"
                      className="w-full h-[26px] border border-[#D5D3CB] rounded px-2 text-[12px] focus:border-[#185FA5] outline-none"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={l.batch_no}
                      onChange={(e) => updateLine(idx, { batch_no: e.target.value })}
                      placeholder="批號"
                      className="w-full h-[26px] border border-[#D5D3CB] rounded px-2 text-[12px] focus:border-[#185FA5] outline-none"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="any"
                      value={l.qty_delta}
                      onChange={(e) => updateLine(idx, { qty_delta: e.target.value })}
                      placeholder={typeDef.direction === "out" ? "(自動轉負)" : "qty"}
                      className="w-full h-[26px] border border-[#D5D3CB] rounded px-2 text-[12px] text-right font-mono focus:border-[#185FA5] outline-none"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={l.unit_cost}
                      onChange={(e) => updateLine(idx, { unit_cost: e.target.value })}
                      className="w-full h-[26px] border border-[#D5D3CB] rounded px-2 text-[12px] text-right font-mono focus:border-[#185FA5] outline-none"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={l.notes}
                      onChange={(e) => updateLine(idx, { notes: e.target.value })}
                      placeholder="備註"
                      className="w-full h-[26px] border border-[#D5D3CB] rounded px-2 text-[12px] focus:border-[#185FA5] outline-none"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      disabled={lines.length === 1}
                      className="text-[#CC0000] disabled:opacity-30 text-[14px]"
                      title="刪除"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="px-4 py-2.5 border-t border-[#EEECE6] bg-[#F8F7F4] flex items-center">
          <span className="text-[11px] text-[#9A9890]">預估影響金額</span>
          <span className="ml-2 font-mono text-[13px] text-[#2C2C2A]">
            NT$ {previewTotal.toLocaleString("en-US")}
          </span>
        </footer>
      </section>

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
    </main>
  );
}
