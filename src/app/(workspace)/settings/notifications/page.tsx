"use client";

import { MockShell, MockCard, MockToggle, SaveBar } from "../_mock/mock-shell";

type Row = { label: string; desc: string; email: boolean; push: boolean; line: boolean };

const groups: Array<{ group: string; rows: Row[] }> = [
  {
    group: "線索 / 銷售",
    rows: [
      { label: "新線索進線",     desc: "當有新線索透過官網或電銷產生時",  email: true,  push: true,  line: true },
      { label: "試駕預約成立",   desc: "客戶完成試駕預約或顧問代填",      email: false, push: true,  line: true },
      { label: "訂單狀態變更",   desc: "訂單進入簽約、簽核、交車等節點",  email: true,  push: true,  line: false },
    ],
  },
  {
    group: "維修 / 交車",
    rows: [
      { label: "維修完工通知",   desc: "技師完成工單、可請客戶取車",      email: true,  push: true,  line: true },
      { label: "交車提醒",       desc: "預約交車日 T-1 發送",             email: false, push: true,  line: true },
      { label: "保固到期",       desc: "保固到期前 30 天",                email: true,  push: false, line: false },
    ],
  },
  {
    group: "簽核 / 管理",
    rows: [
      { label: "待我簽核",       desc: "有單據指派給我或我的簽核階段",    email: true,  push: true,  line: false },
      { label: "簽核被退回",     desc: "我送出的單據被退回修正",          email: true,  push: true,  line: false },
      { label: "系統公告",       desc: "集團或總部重要公告",              email: true,  push: false, line: false },
    ],
  },
];

export default function Page() {
  return (
    <MockShell
      title="通知設定"
      breadcrumb={[{ label: "系統設定", href: "/settings/org" }, { label: "通知設定" }]}
    >
      <MockCard title="通知管道">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: "mail", name: "Email", status: "已啟用", desc: "使用系統預設 SMTP" },
            { icon: "notifications_active", name: "App Push", status: "已啟用", desc: "顧問 App / Web" },
            { icon: "chat", name: "LINE 官方帳號", status: "已串接", desc: "Ducati Taipei 官方" },
          ].map((c) => (
            <div key={c.name} className="rounded-xl border border-outline-variant/20 p-4 bg-white">
              <div className="flex items-center gap-3 mb-2">
                <span className="w-9 h-9 rounded-lg bg-[#CC0000]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#CC0000]">{c.icon}</span>
                </span>
                <div>
                  <div className="font-bold text-on-surface text-sm">{c.name}</div>
                  <div className="text-[11px] text-green-700 font-semibold">{c.status}</div>
                </div>
              </div>
              <div className="text-xs text-on-surface-variant">{c.desc}</div>
            </div>
          ))}
        </div>
      </MockCard>

      <MockCard title="通知事件">
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.group}>
              <div className="text-xs font-bold text-on-surface-variant mb-2 uppercase tracking-wider">
                {g.group}
              </div>
              <div className="rounded-xl border border-outline-variant/20 overflow-hidden">
                <div className="grid grid-cols-[1fr_80px_80px_80px] text-[11px] text-on-surface-variant bg-surface-container-low px-4 py-2 font-medium">
                  <span>事件</span>
                  <span className="text-center">Email</span>
                  <span className="text-center">Push</span>
                  <span className="text-center">LINE</span>
                </div>
                {g.rows.map((r) => (
                  <div
                    key={r.label}
                    className="grid grid-cols-[1fr_80px_80px_80px] items-center px-4 py-3 border-t border-outline-variant/15 text-sm"
                  >
                    <div>
                      <div className="font-medium text-on-surface">{r.label}</div>
                      <div className="text-xs text-on-surface-variant">{r.desc}</div>
                    </div>
                    <div className="flex justify-center"><MockToggle on={r.email} /></div>
                    <div className="flex justify-center"><MockToggle on={r.push} /></div>
                    <div className="flex justify-center"><MockToggle on={r.line} /></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6"><SaveBar /></div>
      </MockCard>
    </MockShell>
  );
}
