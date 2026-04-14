"use client";

import { MockShell, MockCard } from "../_mock/mock-shell";

const history = [
  { date: "2026/04/12 14:22", type: "客戶主檔", dir: "匯入", rows: 1284, result: "成功", by: "陳大文" },
  { date: "2026/04/10 09:08", type: "整車庫存", dir: "匯出", rows: 412,  result: "成功", by: "李思穎" },
  { date: "2026/04/08 16:45", type: "報價單",   dir: "匯出", rows: 96,   result: "成功", by: "張家維" },
  { date: "2026/04/05 11:30", type: "線索名單", dir: "匯入", rows: 540,  result: "部分失敗 (3)", by: "陳大文" },
  { date: "2026/04/01 10:05", type: "維修工單", dir: "匯出", rows: 218,  result: "成功", by: "排程任務" },
];

const templates = [
  { name: "客戶主檔",   icon: "group",       desc: "姓名／聯絡方式／標籤／來源" },
  { name: "整車庫存",   icon: "warehouse",   desc: "VIN／車型／配色／成本／售價" },
  { name: "線索名單",   icon: "search",      desc: "來源／意向車型／聯絡方式" },
  { name: "報價與訂單", icon: "assignment",  desc: "單號／客戶／金額／狀態" },
  { name: "維修工單",   icon: "construction",desc: "單號／車主／技師／配件" },
  { name: "人員清單",   icon: "badge",       desc: "帳號／角色／部門" },
];

export default function Page() {
  return (
    <MockShell
      title="數據匯入 / 匯出"
      breadcrumb={[{ label: "系統設定", href: "/settings/org" }, { label: "數據匯入/出" }]}
      tabs={[{ label: "手動操作", active: true }, { label: "排程任務" }, { label: "歷史紀錄" }]}
    >
      <MockCard title="匯入資料">
        <div className="rounded-xl border-2 border-dashed border-outline-variant/40 p-10 text-center bg-surface-container-lowest">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant/50">
            cloud_upload
          </span>
          <div className="mt-3 text-sm font-medium text-on-surface">
            拖曳 CSV / Excel 檔案到此，或點擊選擇
          </div>
          <div className="text-xs text-on-surface-variant mt-1">
            支援 .csv / .xlsx，單檔 ≤ 20MB
          </div>
          <button className="mt-4 h-9 px-4 rounded-lg bg-[#CC0000] text-white text-sm font-medium hover:bg-[#a80000]">
            選擇檔案
          </button>
        </div>
      </MockCard>

      <MockCard title="匯出範本">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((t) => (
            <div
              key={t.name}
              className="rounded-xl border border-outline-variant/20 p-4 bg-white hover:border-[#CC0000]/40 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="w-9 h-9 rounded-lg bg-[#CC0000]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#CC0000]">{t.icon}</span>
                </span>
                <div className="font-bold text-on-surface text-sm">{t.name}</div>
              </div>
              <div className="text-xs text-on-surface-variant mb-3">{t.desc}</div>
              <div className="flex gap-2">
                <button className="flex-1 h-8 rounded-lg border border-outline-variant/30 text-xs font-medium text-on-surface hover:bg-surface-container-low">
                  下載範本
                </button>
                <button className="flex-1 h-8 rounded-lg bg-on-surface/90 text-white text-xs font-medium hover:bg-on-surface">
                  立即匯出
                </button>
              </div>
            </div>
          ))}
        </div>
      </MockCard>

      <MockCard title="近期紀錄">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-on-surface-variant border-b border-outline-variant/30">
                <th className="py-2 px-2 font-medium">時間</th>
                <th className="py-2 px-2 font-medium">類型</th>
                <th className="py-2 px-2 font-medium">方向</th>
                <th className="py-2 px-2 font-medium text-right">筆數</th>
                <th className="py-2 px-2 font-medium">結果</th>
                <th className="py-2 px-2 font-medium">操作人</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i} className="border-b border-outline-variant/15">
                  <td className="py-2 px-2 text-xs font-mono text-on-surface-variant">{h.date}</td>
                  <td className="py-2 px-2 font-medium text-on-surface">{h.type}</td>
                  <td className="py-2 px-2">
                    <span
                      className={
                        h.dir === "匯入"
                          ? "text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold"
                          : "text-[11px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-semibold"
                      }
                    >
                      {h.dir}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-xs">{h.rows.toLocaleString()}</td>
                  <td className="py-2 px-2">
                    <span
                      className={
                        h.result === "成功"
                          ? "text-[11px] text-green-700 font-semibold"
                          : "text-[11px] text-amber-700 font-semibold"
                      }
                    >
                      ● {h.result}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-xs text-on-surface-variant">{h.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MockCard>
    </MockShell>
  );
}
