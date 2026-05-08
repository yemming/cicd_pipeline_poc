"use client";

import { useState, useTransition } from "react";

import { createAlertRuleAction } from "@/lib/parts/actions";

type AlertType =
  | "stock_level"
  | "ro_shortage"
  | "transfer_overdue"
  | "consignment_expire"
  | "dead_stock"
  | "warranty_expire"
  | "custom";

const ALERT_TYPES: { v: AlertType; l: string }[] = [
  { v: "stock_level", l: "stock_level 庫存水位" },
  { v: "ro_shortage", l: "ro_shortage 工單缺料" },
  { v: "transfer_overdue", l: "transfer_overdue 調撥逾期" },
  { v: "consignment_expire", l: "consignment_expire 寄存到期" },
  { v: "dead_stock", l: "dead_stock 呆滯" },
  { v: "warranty_expire", l: "warranty_expire 保固到期" },
  { v: "custom", l: "custom 自訂" },
];

export function RuleForm() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AlertType>("stock_level");
  const [severity, setSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [autoAction, setAutoAction] = useState<"notify" | "create_requisition" | "create_transfer" | "none">("notify");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function onSubmit() {
    setResult(null);
    startTransition(async () => {
      const res = await createAlertRuleAction({
        code, name, alert_type: type, severity, auto_action: autoAction,
      });
      if (res.ok) {
        setResult({ ok: true, msg: "✓ 已建立" });
        setOpen(false);
        setCode("");
        setName("");
      } else {
        setResult({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div className="space-y-2">
      {!open && (
        <button type="button" onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] text-white text-[13px] font-semibold rounded">
          <span className="material-symbols-outlined text-[16px]">notifications_active</span>
          新增告警規則
        </button>
      )}
      {result && (
        <div className={`rounded-md border px-3 py-1.5 text-[13px] ${result.ok ? "border-[#79F2C0] bg-[#E3FCEF] text-[#006644]" : "border-[#FFBDAD] bg-[#FFEBE6] text-[#BF2600]"}`}>
          {result.msg}
        </div>
      )}
      {open && (
        <section className="border border-[#DFE1E6] rounded-md p-4 bg-[#FAFBFC] space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">code *</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} disabled={pending}
                placeholder="例：STOCK_LOW"
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]" />
            </div>
            <div className="col-span-2">
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">名稱 *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} disabled={pending}
                placeholder="例：庫存低於最低水位"
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]" />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">類型 *</label>
              <select value={type} onChange={(e) => setType(e.target.value as AlertType)} disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]">
                {ALERT_TYPES.map((t) => (<option key={t.v} value={t.v}>{t.l}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">嚴重度</label>
              <select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)} disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]">
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">自動動作</label>
              <select value={autoAction} onChange={(e) => setAutoAction(e.target.value as typeof autoAction)} disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px]">
                <option value="notify">notify 通知</option>
                <option value="create_requisition">create_requisition 建請購</option>
                <option value="create_transfer">create_transfer 建調撥</option>
                <option value="none">none 不動作</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-2 border-t border-[#DFE1E6]">
            <button type="button" onClick={onSubmit} disabled={pending || !code || !name}
              className="px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-50 text-white text-[13px] font-semibold rounded">
              {pending ? "建立中…" : "建立規則"}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={pending}
              className="px-4 py-2 text-[13px] text-[#42526E]">取消</button>
          </div>
        </section>
      )}
    </div>
  );
}
