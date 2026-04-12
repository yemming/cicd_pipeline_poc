export default function DashboardPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="grid grid-cols-12 gap-6">
        {/* Large Card (Metrics) */}
        <div className="col-span-8 bg-white rounded-3xl p-8 shadow-sm border border-slate-100 flex flex-col justify-center min-h-[320px] relative overflow-hidden">
          <div className="absolute -right-16 -top-16 w-64 h-64 bg-[#C9A84C]/5 rounded-full blur-3xl" />
          <h2 className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-6">
            今日展廳轉化率
          </h2>
          <div className="flex items-baseline gap-4 mb-2">
            <span className="text-6xl font-display font-extrabold text-on-surface">
              64.8%
            </span>
            <span className="text-green-500 font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">
                trending_up
              </span>
              12%
            </span>
          </div>
          <p className="text-slate-500 max-w-md">
            當前到店訪客轉化率優於上週同期，預計今日成交訂單量將突破 15 筆。
          </p>
          <div className="mt-8 flex gap-4">
            <button className="bg-primary-container text-white px-6 py-3 rounded-xl font-bold text-sm hover:opacity-90 transition-all flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">
                analytics
              </span>
              查看詳細報表
            </button>
            <button className="bg-surface-container-low text-on-surface px-6 py-3 rounded-xl font-bold text-sm hover:bg-surface-container transition-all">
              歷史數據比對
            </button>
          </div>
        </div>

        {/* Small Card (Quick Action) */}
        <div className="col-span-4 bg-primary-container rounded-3xl p-8 shadow-xl flex flex-col justify-between text-white overflow-hidden relative group min-h-[320px]">
          <div className="absolute inset-0 opacity-10 group-hover:scale-110 transition-transform duration-700 bg-gradient-to-br from-tertiary-container/20 to-transparent" />
          <div className="relative z-10">
            <h3 className="text-xl font-display font-bold mb-2">預約試駕</h3>
            <p className="text-slate-400 text-sm">
              目前有 3 位客戶正在等待安排試駕...
            </p>
          </div>
          <button className="relative z-10 w-full py-4 bg-[#C9A84C] text-on-tertiary-fixed font-bold rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2">
            <span className="material-symbols-outlined">event_available</span>
            即刻安排
          </button>
        </div>
      </div>

      {/* Main Content Placeholder */}
      <div className="w-full h-96 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-4 bg-white/40 backdrop-blur-sm">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
          <span className="material-symbols-outlined text-slate-300 text-3xl">
            grid_view
          </span>
        </div>
        <span className="text-slate-400 font-medium font-display text-lg">
          頁面內容區域
        </span>
      </div>
    </div>
  );
}
