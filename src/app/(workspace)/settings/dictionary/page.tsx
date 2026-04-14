"use client";

import { MockShell, MockCard } from "../_mock/mock-shell";

type Dict = {
  key: string;
  label: string;
  count: number;
  items: string[];
};

const dicts: Dict[] = [
  { key: "lead_source", label: "線索來源", count: 9, items: ["官網表單", "FB 廣告", "IG 私訊", "轉介紹", "Ducati 原廠活動", "展間來店", "Line 官方帳號", "Google Ads", "電銷外呼"] },
  { key: "contact_result", label: "電訪結果", count: 6, items: ["有意願", "再聯絡", "已轉銷售", "婉拒", "空號", "暫停追蹤"] },
  { key: "loss_reason", label: "流失原因", count: 7, items: ["價格過高", "選擇他牌", "暫緩購車", "交車時間", "金融條件", "車色缺貨", "其他"] },
  { key: "payment_method", label: "付款方式", count: 4, items: ["全額現金", "Ducati Financial", "銀行分期", "信用卡"] },
  { key: "workshop_issue", label: "維修故障碼", count: 24, items: ["E-01 引擎警示", "E-02 ABS 異常", "E-03 油氣系統", "…（共 24 項）"] },
];

export default function Page() {
  return (
    <MockShell
      title="字典管理"
      breadcrumb={[{ label: "系統設定", href: "/settings/org" }, { label: "字典管理" }]}
      tabs={[{ label: "業務字典", active: true }, { label: "系統字典" }]}
    >
      <MockCard
        title="業務字典清單"
        action={
          <button className="h-9 px-4 rounded-lg bg-[#CC0000] text-white text-sm font-medium hover:bg-[#a80000] flex items-center gap-1">
            <span className="material-symbols-outlined text-base">add</span>
            新增字典
          </button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dicts.map((d) => (
            <div
              key={d.key}
              className="rounded-xl border border-outline-variant/20 p-5 hover:border-[#CC0000]/40 hover:shadow-sm transition-all cursor-pointer bg-white"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-bold text-on-surface font-display">{d.label}</div>
                  <div className="text-[11px] text-on-surface-variant font-mono">{d.key}</div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#CC0000]/10 text-[#CC0000] font-semibold">
                  {d.count} 項
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {d.items.slice(0, 5).map((it) => (
                  <span
                    key={it}
                    className="text-[11px] px-2 py-0.5 rounded bg-surface-container-low text-on-surface-variant"
                  >
                    {it}
                  </span>
                ))}
                {d.items.length > 5 && (
                  <span className="text-[11px] px-2 py-0.5 text-on-surface-variant/60">
                    +{d.items.length - 5}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </MockCard>
    </MockShell>
  );
}
