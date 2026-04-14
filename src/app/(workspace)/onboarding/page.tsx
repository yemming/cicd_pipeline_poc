"use client";

import { useRouter } from "next/navigation";
import { useSetPageHeader } from "@/components/page-header-context";

export default function OnboardingPage() {
  const router = useRouter();

  useSetPageHeader({
    title: "DealerOS Onboarding",
    tabs: [
      { label: "首頁", onClick: () => router.push("/") },
      { label: "新手導覽", active: true },
    ],
    hideSearch: true,
  });

  return (
    <div className="relative -m-8 min-h-[calc(100dvh-4rem)] bg-surface text-on-surface">
      {/* Canvas Container */}
      <div className="pt-16 pb-12 px-12 max-w-5xl mx-auto">
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
    </div>
  );
}
