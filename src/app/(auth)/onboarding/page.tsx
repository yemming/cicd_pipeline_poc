"use client";

import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-dvh bg-surface text-on-surface">
      {/* SideNavBar */}
      <aside className="bg-[#1A1A2E] h-screen w-64 fixed left-0 top-0 shadow-xl flex flex-col z-50">
        <div className="p-8">
          <div className="text-2xl font-bold text-white tracking-widest font-display">
            DealerOS
          </div>
          <div className="text-tertiary-container text-xs font-medium tracking-tight mt-1 opacity-80 uppercase">
            Modern Atelier
          </div>
        </div>
        <nav className="flex-1 mt-4">
          <a className="bg-tertiary-container/10 text-tertiary-container border-r-4 border-tertiary-container px-6 py-4 flex items-center gap-3 font-display font-medium tracking-tight transition-all opacity-90" href="#">
            <span className="material-symbols-outlined">dashboard</span>
            <span>展廳看板</span>
          </a>
          <a className="text-gray-400 hover:text-white px-6 py-4 flex items-center gap-3 font-display font-medium tracking-tight hover:bg-white/5 transition-colors duration-300" href="#">
            <span className="material-symbols-outlined">contact_page</span>
            <span>電子手卡</span>
          </a>
          <a className="text-gray-400 hover:text-white px-6 py-4 flex items-center gap-3 font-display font-medium tracking-tight hover:bg-white/5 transition-colors duration-300" href="#">
            <span className="material-symbols-outlined">settings</span>
            <span>系統設定</span>
          </a>
          <a className="text-gray-400 hover:text-white px-6 py-4 flex items-center gap-3 font-display font-medium tracking-tight hover:bg-white/5 transition-colors duration-300" href="#">
            <span className="material-symbols-outlined">directions_car_filled</span>
            <span>車型規格 (即將啟用)</span>
          </a>
          <a className="text-gray-400 hover:text-white px-6 py-4 flex items-center gap-3 font-display font-medium tracking-tight hover:bg-white/5 transition-colors duration-300" href="#">
            <span className="material-symbols-outlined">group</span>
            <span>客戶管理 (即將啟用)</span>
          </a>
          <a className="text-gray-400 hover:text-white px-6 py-4 flex items-center gap-3 font-display font-medium tracking-tight hover:bg-white/5 transition-colors duration-300" href="#">
            <span className="material-symbols-outlined">analytics</span>
            <span>業績報表 (即將啟用)</span>
          </a>
        </nav>
        <div className="p-6 mt-auto">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-white">person</span>
            </div>
            <div className="flex flex-col">
              <span className="text-white text-sm font-bold">Lexus Taipei</span>
              <span className="text-gray-500 text-xs">Premium Dealer</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="ml-64 min-h-screen flex-1">
        {/* TopNavBar */}
        <header className="fixed top-0 right-0 w-[calc(100%-16rem)] h-16 z-40 bg-white/80 backdrop-blur-xl shadow-sm flex justify-between items-center px-8">
          <div className="flex items-center gap-8">
            <span className="text-lg font-black text-[#1A1A2E] font-display">
              DealerOS Onboarding
            </span>
            <nav className="flex gap-6">
              <button
                onClick={() => router.push("/")}
                className="text-[#1A1A2E]/60 font-display text-sm hover:text-[#1A1A2E] transition-all"
              >
                首頁
              </button>
              <span className="text-tertiary-container font-bold border-b-2 border-tertiary-container pb-1 font-display text-sm">
                新手導覽
              </span>
            </nav>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 text-[#1A1A2E]/60">
              <span className="material-symbols-outlined cursor-pointer hover:text-[#1A1A2E] transition-colors">
                notifications
              </span>
              <span className="material-symbols-outlined cursor-pointer hover:text-[#1A1A2E] transition-colors">
                help_outline
              </span>
            </div>
            <div className="w-8 h-8 rounded-full overflow-hidden border border-outline-variant bg-surface-container flex items-center justify-center">
              <span className="material-symbols-outlined text-sm text-on-surface-variant">person</span>
            </div>
          </div>
        </header>

        {/* Canvas Container */}
        <div className="pt-24 pb-12 px-12 max-w-5xl mx-auto">
          {/* Welcome Header */}
          <div className="text-center mb-16">
            <h1 className="text-4xl font-extrabold font-display text-primary tracking-tight mb-4">
              歡迎使用 DealerOS！
            </h1>
            <p className="text-on-surface-variant text-lg">
              讓我們花 3 分鐘完成基本設定，即可開始使用。
            </p>
          </div>

          {/* Stepper Container */}
          <div className="relative space-y-6 mb-20">
            {/* Step 1: Completed */}
            <div className="bg-surface-container-lowest p-6 rounded-xl flex items-center gap-6 transition-all border border-transparent">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                <span
                  className="material-symbols-outlined text-3xl"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-on-surface">設定門店資訊</h3>
                <p className="text-sm text-on-surface-variant">
                  包含展示間地址、營業時間與品牌識別
                </p>
              </div>
              <div className="text-green-600 font-bold bg-green-50 px-4 py-2 rounded-full text-sm">
                已完成 ✓
              </div>
            </div>

            {/* Step 2: Active */}
            <div className="bg-surface-container-lowest p-6 rounded-xl flex items-center gap-6 transition-all border-2 border-tertiary shadow-lg transform scale-[1.02] z-10 relative">
              <div className="w-12 h-12 rounded-full bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed font-bold text-xl font-display">
                2
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-on-surface">建立人員帳號</h3>
                <p className="text-sm text-on-surface-variant mb-1">
                  邀請您的銷售團隊成員加入系統
                </p>
                <div className="flex items-center gap-2">
                  <div className="h-1 w-32 bg-surface-container-high rounded-full overflow-hidden">
                    <div className="h-full bg-tertiary w-0" />
                  </div>
                  <span className="text-xs font-medium text-tertiary">
                    0/10 人員已建立
                  </span>
                </div>
              </div>
              <button className="bg-gradient-to-br from-primary to-primary-container text-white px-6 py-3 rounded-lg font-bold text-sm shadow-md hover:opacity-90 active:scale-95 transition-all">
                開始設定 →
              </button>
            </div>

            {/* Step 3: Locked */}
            <div className="bg-surface-container-low opacity-60 p-6 rounded-xl flex items-center gap-6 border border-transparent grayscale">
              <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-outline font-bold text-xl font-display">
                3
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-outline">匯入車型資料</h3>
                <p className="text-sm text-on-surface-variant">
                  上傳現有庫存與規格表 (Excel/PDF)
                </p>
              </div>
              <span className="material-symbols-outlined text-outline">lock</span>
            </div>

            {/* Step 4: Locked */}
            <div className="bg-surface-container-low opacity-60 p-6 rounded-xl flex items-center gap-6 border border-transparent grayscale">
              <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-outline font-bold text-xl font-display">
                4
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-outline">設定金融與保險</h3>
                <p className="text-sm text-on-surface-variant">
                  配置貸款試算與保險方案模板
                </p>
              </div>
              <span className="material-symbols-outlined text-outline">lock</span>
            </div>

            {/* Step 5: Locked */}
            <div className="bg-surface-container-low opacity-60 p-6 rounded-xl flex items-center gap-6 border border-transparent grayscale">
              <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-outline font-bold text-xl font-display">
                5
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-outline">開始第一張手卡</h3>
                <p className="text-sm text-on-surface-variant">
                  完成以上設定，開始您的數位轉型之旅
                </p>
              </div>
              <span className="material-symbols-outlined text-outline">stars</span>
            </div>
          </div>

          {/* Explore Section */}
          <div className="mt-12">
            <div className="flex items-center gap-4 mb-8">
              <div className="h-px flex-1 bg-surface-container-high" />
              <h2 className="text-on-surface-variant font-medium">
                或者，先探索看看
              </h2>
              <div className="h-px flex-1 bg-surface-container-high" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Explore Card 1 */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-transparent hover:border-tertiary/20 hover:shadow-md transition-all group cursor-pointer">
                <div className="w-12 h-12 rounded-lg bg-primary-container text-tertiary-fixed flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <span
                    className="material-symbols-outlined text-2xl"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    play_circle
                  </span>
                </div>
                <h4 className="font-bold text-on-surface mb-2">
                  觀看 3 分鐘教學影片
                </h4>
                <p className="text-xs text-on-surface-variant leading-relaxed mb-4">
                  快速瞭解 DealerOS 如何優化您的銷售流程。
                </p>
                <span className="text-tertiary text-xs font-bold inline-flex items-center gap-1">
                  立即觀看{" "}
                  <span className="material-symbols-outlined text-xs">
                    arrow_forward
                  </span>
                </span>
              </div>

              {/* Explore Card 2 */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-transparent hover:border-tertiary/20 hover:shadow-md transition-all group">
                <div className="w-12 h-12 rounded-lg bg-surface-container-high text-primary flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-2xl">
                    database
                  </span>
                </div>
                <h4 className="font-bold text-on-surface mb-2">查看範例資料</h4>
                <p className="text-xs text-on-surface-variant leading-relaxed mb-4">
                  預先填充測試數據，讓您直觀感受系統功能。
                </p>
                <button className="w-full py-2 border border-outline text-on-surface text-xs font-bold rounded-lg hover:bg-surface-container-low transition-colors">
                  載入範例
                </button>
              </div>

              {/* Explore Card 3 */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-transparent hover:border-tertiary/20 hover:shadow-md transition-all group">
                <div className="w-12 h-12 rounded-lg bg-surface-container-high text-primary flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-2xl">
                    support_agent
                  </span>
                </div>
                <h4 className="font-bold text-on-surface mb-2">
                  聯繫客戶成功團隊
                </h4>
                <p className="text-xs text-on-surface-variant leading-relaxed mb-4">
                  一對一協助您完成企業級配置與權限串接。
                </p>
                <button className="w-full py-2 border border-tertiary text-tertiary text-xs font-bold rounded-lg hover:bg-tertiary/5 transition-colors">
                  預約諮詢
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Background Decor */}
        <div className="fixed top-0 right-0 -z-10 w-1/3 h-full overflow-hidden pointer-events-none opacity-20">
          <div className="absolute top-[10%] right-[-10%] w-[600px] h-[600px] bg-tertiary/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-[20%] right-[10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[80px]" />
        </div>
      </main>
    </div>
  );
}
