"use client";

import { useSetPageHeader } from "@/components/page-header-context";

const GOLD = "#C9A84C";
const NAVY = "#1A1A2E";

type Tag = { label: string; active?: boolean };
type TagGroup = { title: string; tags: Tag[] };

const companyTags: TagGroup[] = [
  {
    title: "車型偏好",
    tags: [
      { label: "Panigale V4", active: true },
      { label: "Multistrada V4" },
      { label: "Monster" },
      { label: "Diavel V4", active: true },
      { label: "Streetfighter V4" },
      { label: "Hypermotard" },
      { label: "Scrambler" },
      { label: "DesertX" },
    ],
  },
  {
    title: "騎乘風格",
    tags: [
      { label: "賽道競技", active: true },
      { label: "日常通勤" },
      { label: "週末休閒", active: true },
      { label: "長途旅遊" },
      { label: "越野探險" },
      { label: "街頭穿梭" },
    ],
  },
  {
    title: "消費能力",
    tags: [
      { label: "入門級 ＜50萬" },
      { label: "中階 50–100萬" },
      { label: "旗艦級 100萬+", active: true },
    ],
  },
  {
    title: "購車方式",
    tags: [
      { label: "首購" },
      { label: "增購" },
      { label: "換購", active: true },
      { label: "現金購買" },
      { label: "貸款（已結清）" },
    ],
  },
  {
    title: "主要用途",
    tags: [
      { label: "通勤代步" },
      { label: "週末玩樂", active: true },
      { label: "長途旅行", active: true },
      { label: "收藏展示" },
      { label: "賽事訓練" },
    ],
  },
  {
    title: "接觸來源",
    tags: [
      { label: "品牌官網" },
      { label: "社群媒體", active: true },
      { label: "朋友推薦", active: true },
      { label: "實體展廳" },
      { label: "賽事活動" },
      { label: "試乘活動" },
    ],
  },
  {
    title: "維修 & 改裝偏好",
    tags: [
      { label: "原廠保固優先", active: true },
      { label: "性能改裝愛好者" },
      { label: "DIY 愛好者" },
      { label: "外觀客製化" },
      { label: "電子輔助升級" },
    ],
  },
  {
    title: "配件興趣",
    tags: [
      { label: "防護裝備", active: true },
      { label: "行車記錄器" },
      { label: "行李系統" },
      { label: "碳纖維套件", active: true },
      { label: "音響系統" },
      { label: "手把 / 踏板改裝" },
    ],
  },
  {
    title: "家庭狀況",
    tags: [
      { label: "已婚", active: true },
      { label: "未婚" },
      { label: "有子女", active: true },
      { label: "無子女" },
      { label: "有寵物" },
    ],
  },
  {
    title: "保險到期月",
    tags: Array.from({ length: 12 }, (_, i) => ({
      label: `${i + 1}月`,
      active: i + 1 === 4,
    })),
  },
];

const customTags = ["醫師", "重視操駕性能", "收藏愛好者", "賽道常客", "有兩輛以上機車"];

export default function CustomerTagsPage() {
  useSetPageHeader({
    breadcrumb: [
      { label: "銷售管理", href: "/sales/showroom" },
      { label: "客戶管理", href: "/sales/customers" },
      { label: "客戶標籤" },
    ],
  });

  return (
    <div className="-m-4 md:-m-8 bg-[#F5F2FF] min-h-[calc(100dvh-4rem)] flex flex-col">
      {/* Two-column body */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: Customer Profile ── */}
        <aside className="w-80 shrink-0 bg-[#EFECFF] flex flex-col gap-6 p-8 overflow-y-auto border-r border-[#E2E0FC]">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold font-display text-[#1A1A2E]">客戶標籤管理</h1>
          </div>

          {/* Profile card */}
          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-full overflow-hidden ring-4 ring-[#C9A84C]/20 shrink-0">
                <img src="/bikes/hero/hero-1.jpg" alt="王先生" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base font-bold font-display text-[#1A1A2E]">王先生</span>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ backgroundColor: `${GOLD}1A`, color: GOLD }}
                  >
                    準車主
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-3">男 · +886 912-345-678</p>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 bg-[#EFECFF] rounded-lg text-xs font-bold text-[#1A1A2E] hover:bg-[#E2E0FC] transition-colors">
                    致電
                  </button>
                  <button className="px-3 py-1.5 bg-[#EFECFF] rounded-lg text-xs font-bold text-[#1A1A2E] hover:bg-[#E2E0FC] transition-colors">
                    訊息
                  </button>
                </div>
              </div>
            </div>

            {/* Visit stats */}
            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
              <div className="bg-[#F5F2FF] rounded-xl p-3">
                <div className="text-[10px] text-slate-400 uppercase mb-1">首次來店</div>
                <div className="text-sm font-bold text-[#1A1A2E]">2026/04/10</div>
              </div>
              <div className="bg-[#F5F2FF] rounded-xl p-3">
                <div className="text-[10px] text-slate-400 uppercase mb-1">來店次數</div>
                <div className="text-sm font-bold text-[#1A1A2E]">1 次</div>
              </div>
            </div>

            {/* Interested model */}
            <div>
              <img
                src="/bikes/thumbs/hypermotard-950-sp.png"
                alt="Panigale V4"
                className="w-full h-36 object-cover rounded-xl"
              />
              <p className="text-[10px] mt-1.5 text-center text-slate-400">
                感興趣車款：Panigale V4
              </p>
            </div>
          </div>

          {/* Summary chips */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">已選標籤摘要</p>
            <div className="flex flex-wrap gap-2">
              {companyTags.flatMap((g) => g.tags.filter((t) => t.active)).map((t) => (
                <span
                  key={t.label}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium"
                  style={{ backgroundColor: `${GOLD}1A`, color: GOLD }}
                >
                  {t.label}
                </span>
              ))}
              {customTags.map((t) => (
                <span
                  key={t}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#1A1A2E] text-white"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </aside>

        {/* ── Right: Tag Editor ── */}
        <main className="flex-1 overflow-y-auto p-10">
          {/* Company tags */}
          <section className="mb-12">
            <div className="mb-8">
              <h2 className="text-2xl font-bold font-display text-[#1A1A2E] mb-1">公司定義標籤</h2>
              <p className="text-sm text-slate-500">由行銷部門統一制定，用於客戶分群與精準行銷</p>
            </div>

            <div className="space-y-8">
              {companyTags.map((group) => (
                <div key={group.title}>
                  <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                    {group.title}
                  </h4>
                  <div className="flex flex-wrap gap-2.5">
                    {group.tags.map((tag) =>
                      tag.active ? (
                        <span
                          key={tag.label}
                          className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer shadow-sm transition-all"
                          style={{
                            backgroundColor: GOLD,
                            color: NAVY,
                            boxShadow: `0 2px 8px ${GOLD}33`,
                          }}
                        >
                          {tag.label}
                        </span>
                      ) : (
                        <span
                          key={tag.label}
                          className="px-4 py-2 bg-white rounded-xl text-xs font-medium text-slate-600 cursor-pointer hover:bg-[#EFECFF] border border-transparent hover:border-[#C9A84C]/30 transition-all"
                        >
                          {tag.label}
                        </span>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Custom tags */}
          <section className="pt-10 border-t border-slate-200">
            <div className="mb-6">
              <h2 className="text-2xl font-bold font-display text-[#1A1A2E] mb-1">自行定義標籤</h2>
              <p className="text-sm text-slate-500">銷售顧問可根據對談內容自由新增，用於個人備忘</p>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="relative mb-5">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
                  sell
                </span>
                <input
                  className="w-full pl-11 pr-12 py-3.5 bg-[#F5F2FF] rounded-xl text-sm border border-transparent focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 placeholder:text-slate-400 transition-all"
                  placeholder="輸入標籤後按 Enter，例如：熱血騎士、賽道玩家"
                  type="text"
                />
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 text-lg">
                  add_circle
                </span>
              </div>

              <div className="flex flex-wrap gap-2.5">
                {customTags.map((tag) => (
                  <div
                    key={tag}
                    className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: NAVY }}
                  >
                    {tag}
                    <button className="hover:text-[#C9A84C] transition-colors leading-none">
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Bottom spacer so content isn't hidden behind footer */}
          <div className="h-8" />
        </main>
      </div>

      {/* ── Sticky footer (NOT fixed) ── */}
      <div className="sticky bottom-0 bg-white/80 backdrop-blur-md border-t border-slate-200 px-10 py-4 flex items-center justify-end gap-4">
        <button className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:opacity-70 transition-opacity">
          取消修改
        </button>
        <button
          className="px-10 py-3 rounded-xl text-sm font-bold shadow-lg transition-all hover:scale-[1.02] active:scale-95"
          style={{
            backgroundColor: GOLD,
            color: NAVY,
            boxShadow: `0 4px 16px ${GOLD}33`,
          }}
        >
          儲存標籤
        </button>
      </div>
    </div>
  );
}
