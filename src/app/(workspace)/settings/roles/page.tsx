"use client";

import { useSetPageHeader } from "@/components/page-header-context";

const ROLES = [
  { name: "集團管理員", type: "system", count: 2, icon: "admin_panel_settings" },
  { name: "門店管理員", type: "admin", count: 4, icon: "manage_accounts" },
  { name: "銷售主管", type: "supervisor", count: 6, icon: "supervisor_account", selected: true },
  { name: "銷售顧問", type: "advisor", count: 18, icon: "person" },
  { name: "前台接待", type: "receptionist", count: 4, icon: "support_agent" },
  { name: "金融專員", type: "finance", count: 3, icon: "account_balance" },
  { name: "保險專員", type: "insurance", count: 2, icon: "shield" },
];

type PermRow = {
  label: string;
  perms: { name: string; on: boolean }[];
};

type PermSection = {
  section: string;
  rows: PermRow[];
};

const PERMISSIONS: PermSection[] = [
  {
    section: "售前管理",
    rows: [
      {
        label: "展廳看板",
        perms: [
          { name: "查看", on: true },
          { name: "編輯", on: true },
        ],
      },
      {
        label: "電子手卡",
        perms: [
          { name: "查看", on: true },
          { name: "編輯", on: true },
          { name: "刪除", on: false },
        ],
      },
      {
        label: "線索管理",
        perms: [
          { name: "查看", on: true },
          { name: "分配", on: true },
          { name: "刪除", on: false },
        ],
      },
      {
        label: "訂單中心",
        perms: [{ name: "簽核", on: true }],
      },
    ],
  },
  {
    section: "交易服務",
    rows: [
      {
        label: "金融服務",
        perms: [
          { name: "查看", on: true },
          { name: "編輯", on: false },
        ],
      },
    ],
  },
  {
    section: "報表分析",
    rows: [
      {
        label: "銷售報表",
        perms: [
          { name: "查看", on: true },
          { name: "匯出", on: true },
        ],
      },
    ],
  },
  {
    section: "管理後台",
    rows: [
      {
        label: "系統設定",
        perms: [],
        disabled: true,
      } as PermRow & { disabled?: boolean },
    ],
  },
];

function Toggle({ on }: { on: boolean }) {
  if (on) {
    return (
      <div className="relative w-10 h-5 bg-[#C9A84C] rounded-full">
        <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-white rounded-full shadow" />
      </div>
    );
  }
  return (
    <div className="relative w-10 h-5 bg-slate-200 rounded-full">
      <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow" />
    </div>
  );
}

export default function RolesPage() {
  useSetPageHeader({
    title: "角色權限",
    breadcrumb: [
      { label: "系統設定" },
      { label: "角色權限" },
    ],
  });

  return (
    <div className="-m-4 md:-m-8 bg-[#FCF8FF] min-h-[calc(100dvh-4rem)] flex gap-8 p-8">
      {/* Left: Role list */}
      <div className="w-1/3 flex flex-col gap-3">
        <h3 className="font-bold text-[#1A1A2E] text-sm px-1">角色清單</h3>

        {ROLES.map((r) => (
          <div
            key={r.name}
            className={`bg-white rounded-2xl p-4 border cursor-pointer transition-all flex items-center gap-3 ${
              r.selected
                ? "border-[#C9A84C] ring-1 ring-[#C9A84C]/30 shadow-sm"
                : "border-[#1A1A2E]/8 hover:border-[#1A1A2E]/20"
            }`}
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                r.selected ? "bg-[#C9A84C]/15" : "bg-[#F5F5F5]"
              }`}
            >
              <span
                className={`material-symbols-outlined text-lg ${
                  r.selected ? "text-[#C9A84C]" : "text-[#1A1A2E]/50"
                }`}
              >
                {r.icon}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[#1A1A2E] text-sm">{r.name}</p>
              <p className="text-xs text-[#1A1A2E]/50 mt-0.5">
                {r.type === "system" ? "系統角色 · " : ""}{r.count} 人
              </p>
            </div>
            {r.selected && (
              <span className="material-symbols-outlined text-[#C9A84C] text-base">
                chevron_right
              </span>
            )}
          </div>
        ))}

        {/* 新增角色 */}
        <button className="border-2 border-dashed border-[#1A1A2E]/20 rounded-2xl p-4 flex items-center justify-center gap-2 text-[#1A1A2E]/40 hover:border-[#CC0000]/40 hover:text-[#CC0000]/60 transition-colors">
          <span className="material-symbols-outlined text-base">add</span>
          <span className="text-sm font-bold">新增角色</span>
        </button>
      </div>

      {/* Right: Permissions panel */}
      <div className="w-2/3 bg-white rounded-3xl shadow-sm border border-[#1A1A2E]/8 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-8 py-6 border-b border-[#1A1A2E]/8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#C9A84C]/15 flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl text-[#C9A84C]">shield</span>
            </div>
            <div>
              <h3 className="font-bold text-[#1A1A2E] text-lg">銷售主管</h3>
              <p className="text-xs text-[#1A1A2E]/50 mt-0.5">權限設定 · 6 位成員</p>
            </div>
          </div>
          <span className="text-[10px] font-bold text-[#C9A84C] bg-[#C9A84C]/10 px-3 py-1 rounded-full">
            已選擇
          </span>
        </div>

        {/* Scrollable permission rows */}
        <div className="flex-1 overflow-y-auto px-8 py-4">
          {PERMISSIONS.map((sec) => (
            <div key={sec.section} className="mb-6">
              <h4 className="text-xs font-bold text-[#1A1A2E]/40 uppercase tracking-widest mb-3">
                {sec.section}
              </h4>
              <div className="space-y-1">
                {sec.rows.map((row) => {
                  const disabled = (row as PermRow & { disabled?: boolean }).disabled;
                  return (
                    <div
                      key={row.label}
                      className={`flex items-center justify-between px-4 py-3 rounded-xl transition-colors ${
                        disabled ? "bg-[#F5F5F5] opacity-50" : "hover:bg-[#FCF8FF]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {disabled && (
                          <span className="material-symbols-outlined text-sm text-[#1A1A2E]/40">
                            lock
                          </span>
                        )}
                        <span className="text-sm font-bold text-[#1A1A2E]">{row.label}</span>
                        {disabled && (
                          <span className="text-[10px] text-[#1A1A2E]/40 bg-[#1A1A2E]/6 px-2 py-0.5 rounded-full">
                            系統保留
                          </span>
                        )}
                      </div>
                      {disabled ? (
                        <span className="text-xs text-[#1A1A2E]/30">不可修改</span>
                      ) : (
                        <div className="flex items-center gap-4">
                          {row.perms.map((p) => (
                            <div key={p.name} className="flex flex-col items-center gap-1">
                              <span className="text-[10px] text-[#1A1A2E]/50">{p.name}</span>
                              <Toggle on={p.on} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Sticky footer */}
        <div className="sticky bottom-0 px-8 py-4 border-t border-[#1A1A2E]/8 bg-white flex items-center justify-between gap-4">
          <button className="border border-[#1A1A2E]/15 hover:border-[#1A1A2E]/30 text-[#1A1A2E]/60 font-bold px-5 py-2.5 rounded-xl text-sm transition-colors">
            重設為預設
          </button>
          <button className="bg-[#CC0000] hover:bg-[#AA0000] text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors flex items-center gap-2">
            <span className="material-symbols-outlined text-base">save</span>
            儲存權限設定
          </button>
        </div>
      </div>
    </div>
  );
}
