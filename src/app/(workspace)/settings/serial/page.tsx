"use client";

import { MockShell, MockCard, Field, MockInput, MockSelect, SaveBar } from "../_mock/mock-shell";

const rules = [
  { name: "接待手卡", code: "NC-YYYYMMDD-NNN", sample: "NC-20260414-001", reset: "每日" },
  { name: "報價單", code: "QT-YYYYMM-NNNN", sample: "QT-202604-0027", reset: "每月" },
  { name: "訂單", code: "ORD-YYYYMMDD-NNN", sample: "ORD-20260414-012", reset: "每日" },
  { name: "維修工單", code: "WO-YYYYMMDD-NNN", sample: "WO-20260414-008", reset: "每日" },
  { name: "PDI 檢查", code: "PDI-YYMM-NNNNN", sample: "PDI-2604-00142", reset: "每月" },
  { name: "退款單", code: "RF-YYYYMM-NNNN", sample: "RF-202604-0003", reset: "每月" },
];

export default function Page() {
  return (
    <MockShell
      title="業務序號"
      breadcrumb={[{ label: "系統設定", href: "/settings/org" }, { label: "業務序號" }]}
    >
      <MockCard title="序號規則">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-on-surface-variant border-b border-outline-variant/30">
                <th className="py-3 px-2 font-medium">單據類型</th>
                <th className="py-3 px-2 font-medium">編碼規則</th>
                <th className="py-3 px-2 font-medium">範例</th>
                <th className="py-3 px-2 font-medium">重設週期</th>
                <th className="py-3 px-2 font-medium w-20 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.name} className="border-b border-outline-variant/15 hover:bg-surface-container-low/40">
                  <td className="py-3 px-2 font-medium text-on-surface">{r.name}</td>
                  <td className="py-3 px-2 font-mono text-xs text-on-surface-variant">{r.code}</td>
                  <td className="py-3 px-2 font-mono text-xs text-[#CC0000]">{r.sample}</td>
                  <td className="py-3 px-2">
                    <span className="text-[11px] px-2 py-0.5 rounded bg-surface-container-low">{r.reset}</span>
                  </td>
                  <td className="py-3 px-2 text-right">
                    <button className="text-xs text-[#CC0000] hover:underline">編輯</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MockCard>

      <MockCard title="新增規則">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="單據名稱">
            <MockInput placeholder="例如：試駕單" />
          </Field>
          <Field label="前綴碼" hint="建議 2–3 個英文大寫字母">
            <MockInput placeholder="TD" />
          </Field>
          <Field label="日期格式">
            <MockSelect value="YYYYMMDD" options={["YYYYMMDD", "YYYYMM", "YYMM", "無"]} />
          </Field>
          <Field label="流水號位數">
            <MockSelect value="3" options={["3", "4", "5", "6"]} />
          </Field>
        </div>
        <div className="mt-6">
          <SaveBar />
        </div>
      </MockCard>
    </MockShell>
  );
}
