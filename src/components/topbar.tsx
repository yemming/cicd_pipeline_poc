"use client";

interface TopbarProps {
  onOpenSearch: () => void;
}

export function Topbar({ onOpenSearch }: TopbarProps) {
  const today = new Date();
  const weekdays = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")} ${weekdays[today.getDay()]}`;

  return (
    <header className="fixed top-0 right-0 left-64 h-16 z-40 bg-white/80 backdrop-blur-md border-b border-surface-container-high flex justify-between items-center px-8">
      {/* Left: Breadcrumb & Context */}
      <div className="flex items-center gap-4">
        <nav className="flex items-center text-sm font-medium">
          <span className="text-slate-400">銷售管理</span>
          <span className="material-symbols-outlined text-slate-300 mx-2 text-base">
            chevron_right
          </span>
          <span className="text-on-surface font-bold">展廳看板</span>
        </nav>
      </div>

      {/* Center: Search */}
      <div className="flex-1 max-w-md px-12">
        <div className="relative group">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg group-focus-within:text-[#C9A84C]">
            search
          </span>
          <input
            onClick={onOpenSearch}
            readOnly
            className="w-full pl-10 pr-12 py-2 bg-surface-container-low border-none rounded-full text-sm focus:ring-1 focus:ring-[#C9A84C]/40 transition-all placeholder:text-slate-400 cursor-pointer"
            placeholder="搜尋客戶、訂單、車輛... ⌘K"
            type="text"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
            <kbd className="px-1.5 py-0.5 rounded border border-slate-200 text-[10px] text-slate-400 font-sans">
              ⌘
            </kbd>
            <kbd className="px-1.5 py-0.5 rounded border border-slate-200 text-[10px] text-slate-400 font-sans">
              K
            </kbd>
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-1">
          <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-all relative">
            <span className="material-symbols-outlined">notifications</span>
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 rounded-full transition-all group">
            <span className="material-symbols-outlined text-slate-500 group-hover:text-[#C9A84C]">
              task_alt
            </span>
            <span className="text-sm font-medium text-slate-600">今日待辦</span>
            <span className="bg-[#C9A84C]/10 text-[#755B00] px-1.5 py-0.5 rounded text-[10px] font-bold">
              5
            </span>
          </button>
        </div>
        <div className="h-6 w-px bg-slate-200" />
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-slate-500">{dateStr}</span>
          <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden border border-slate-100 cursor-pointer hover:ring-2 hover:ring-[#C9A84C] transition-all flex items-center justify-center">
            <span className="material-symbols-outlined text-slate-500 text-sm">
              person
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
