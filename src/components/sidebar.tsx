"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navGroups = [
  {
    label: "銷售管理",
    items: [
      { name: "展廳看板", icon: "dashboard", href: "/showroom" },
      { name: "電子手卡", icon: "description", href: "/showroom/cards" },
      { name: "線索管理", icon: "search", href: "/leads" },
      { name: "客戶中心", icon: "group", href: "/customers" },
      { name: "訂單中心", icon: "assignment", href: "/orders" },
    ],
  },
  {
    label: "交易服務",
    items: [
      { name: "金融服務", icon: "payments", href: "/orders/finance" },
      { name: "保險服務", icon: "verified_user", href: "/orders/insurance" },
      { name: "精品管理", icon: "featured_video", href: "/orders/accessories" },
    ],
  },
  {
    label: "售後服務",
    items: [
      { name: "預約管理", icon: "calendar_today", href: "/aftersales" },
      { name: "維修工單", icon: "build", href: "/aftersales/workorders" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="bg-[#1A1A2E] h-screen w-64 fixed left-0 top-0 overflow-y-auto flex flex-col py-6 shadow-xl z-50">
      {/* Brand Section */}
      <div className="px-6 mb-8">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 rounded flex items-center justify-center">
            <span
              className="material-symbols-outlined text-white text-2xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              directions_car
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tighter text-white font-display">
              LEXUS ATELIER
            </span>
            <div className="flex items-center gap-1 cursor-pointer group">
              <span className="text-slate-400 text-xs font-medium">
                台北旗艦店
              </span>
              <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-white transition-colors">
                keyboard_arrow_down
              </span>
            </div>
          </div>
        </Link>
      </div>

      {/* Navigation Clusters */}
      <nav className="flex-1 space-y-6 px-3">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-4 mb-2 text-[10px] uppercase tracking-widest text-slate-500 font-bold">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      isActive
                        ? "flex items-center gap-3 px-4 py-3 text-[#C9A84C] bg-white/5 rounded-lg border-r-4 border-[#C9A84C] font-medium text-sm transition-all"
                        : "flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg text-sm transition-all duration-200"
                    }
                  >
                    <span className="material-symbols-outlined text-lg">
                      {item.icon}
                    </span>
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Onboarding Link */}
      <div className="px-3 mt-auto">
        <Link
          href="/onboarding"
          className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-[#C9A84C] hover:bg-white/5 rounded-lg text-sm transition-all duration-200"
        >
          <span className="material-symbols-outlined text-lg">school</span>
          <span>新手導覽</span>
        </Link>
      </div>

      {/* Footer Actions */}
      <div className="px-4 pt-4 border-t border-white/5">
        <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center overflow-hidden">
              <span className="material-symbols-outlined text-white">
                person
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-white text-sm font-bold">陳顧問</span>
              <span className="text-slate-400 text-[10px]">銷售顧問</span>
            </div>
          </div>
          <div className="flex gap-1">
            <Link
              href="/settings"
              className="p-1.5 text-slate-400 hover:text-[#C9A84C] transition-colors"
            >
              <span className="material-symbols-outlined text-xl">
                settings
              </span>
            </Link>
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="p-1.5 text-slate-400 hover:text-red-400 transition-colors"
                title="登出"
              >
                <span className="material-symbols-outlined text-xl">
                  logout
                </span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
