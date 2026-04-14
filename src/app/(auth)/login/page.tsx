"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style jsx global>{`
        .luxury-gradient {
          background: linear-gradient(135deg, #00000b 0%, #1a1a2e 100%);
        }
        .gold-border {
          border-bottom: 2px solid #c9a84c;
        }
      `}</style>

      <main className="flex min-h-screen">
        {/* Left Side: Brand Experience */}
        <section className="hidden lg:flex w-[40%] luxury-gradient flex-col justify-between p-16 relative overflow-hidden">
          {/* Decorative Elements */}
          <div className="absolute top-0 right-0 w-full h-full opacity-10 pointer-events-none">
            <div className="w-full h-full bg-gradient-to-br from-primary-container/20 to-transparent" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-4">
              <h1 className="font-display font-extrabold text-4xl tracking-tighter text-white">
                DealerOS
              </h1>
            </div>
            <div className="w-12 gold-border mb-8" />
            <p className="font-display text-xl text-primary-fixed-dim tracking-[0.15em] font-light leading-relaxed">
              現場商務智慧營運平台
            </p>
          </div>
          <div className="relative z-10 space-y-10 max-w-sm">
            <div className="flex gap-5 items-start">
              <div className="bg-white/5 p-3 rounded-xl backdrop-blur-sm border border-white/10 shrink-0">
                <span className="material-symbols-outlined text-tertiary-fixed-dim text-2xl">
                  dashboard
                </span>
              </div>
              <div>
                <h3 className="text-white font-display text-lg font-semibold mb-1">
                  展廳數位化
                </h3>
                <p className="text-on-primary-container text-sm leading-relaxed opacity-80">
                  提供沉浸式的虛擬展間體驗，將實體空間轉化為無限的數位可能。
                </p>
              </div>
            </div>
            <div className="flex gap-5 items-start">
              <div className="bg-white/5 p-3 rounded-xl backdrop-blur-sm border border-white/10 shrink-0">
                <span className="material-symbols-outlined text-tertiary-fixed-dim text-2xl">
                  account_tree
                </span>
              </div>
              <div>
                <h3 className="text-white font-display text-lg font-semibold mb-1">
                  全流程管理
                </h3>
                <p className="text-on-primary-container text-sm leading-relaxed opacity-80">
                  從客源開發到售後維修，一站式整合經銷商所有營運核心環節。
                </p>
              </div>
            </div>
            <div className="flex gap-5 items-start">
              <div className="bg-white/5 p-3 rounded-xl backdrop-blur-sm border border-white/10 shrink-0">
                <span className="material-symbols-outlined text-tertiary-fixed-dim text-2xl">
                  insights
                </span>
              </div>
              <div>
                <h3 className="text-white font-display text-lg font-semibold mb-1">
                  集團級洞察
                </h3>
                <p className="text-on-primary-container text-sm leading-relaxed opacity-80">
                  多維度數據分析報表，即時掌握各據點績效，輔助高層決策擬定。
                </p>
              </div>
            </div>
          </div>
          <div className="relative z-10">
            <p className="text-on-primary-container/60 text-[10px] tracking-widest uppercase font-medium">
              Powered by Omotenashi Digital Framework
            </p>
          </div>
        </section>

        {/* Right Side: Login Canvas */}
        <section className="w-full lg:w-[60%] flex flex-col items-center justify-center p-8 bg-surface-container-lowest">
          <div className="w-full max-w-[420px]">
            <div className="mb-10">
              {/* Mobile Logo Only */}
              <div className="lg:hidden mb-8">
                <h1 className="font-display font-extrabold text-3xl tracking-tighter text-primary">
                  DealerOS
                </h1>
                <div className="w-10 gold-border mt-2" />
              </div>
              {error ? (
                <>
                  <h2 className="font-display text-3xl font-bold text-error mb-3 tracking-tight">
                    登入失敗
                  </h2>
                  <p className="text-on-error-container text-base font-light bg-error-container px-4 py-3 rounded-xl">
                    {error === "Invalid login credentials"
                      ? "電子郵件或密碼錯誤，請重新輸入"
                      : error}
                  </p>
                </>
              ) : (
                <>
                  <h2 className="font-display text-3xl font-bold text-on-surface mb-3 tracking-tight">
                    歡迎回來
                  </h2>
                  <p className="text-outline text-base font-light">
                    請登入您的帳號以進入管理後台
                  </p>
                </>
              )}
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider ml-1">
                  電子郵件
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-xl">
                    mail
                  </span>
                  <input
                    type="email"
                    placeholder="example@dealer.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    required
                    className="w-full pl-12 pr-4 py-3.5 bg-surface-container-low border-transparent border focus:border-tertiary/30 rounded-xl focus:ring-4 focus:ring-tertiary/5 focus:bg-surface-container-lowest transition-all placeholder:text-outline-variant text-sm"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider ml-1">
                  密碼
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-xl">
                    lock
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="請輸入密碼"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    required
                    className="w-full pl-12 pr-12 py-3.5 bg-surface-container-low border-transparent border focus:border-tertiary/30 rounded-xl focus:ring-4 focus:ring-tertiary/5 focus:bg-surface-container-lowest transition-all placeholder:text-outline-variant text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors"
                  >
                    <span className="material-symbols-outlined text-xl">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center group cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-offset-0 focus:ring-primary/20 cursor-pointer"
                  />
                  <span className="ml-2.5 text-sm text-on-surface-variant group-hover:text-on-surface transition-colors">
                    記住我
                  </span>
                </label>
                <a
                  className="text-sm font-medium text-tertiary hover:underline underline-offset-4 decoration-tertiary/30 transition-all"
                  href="#"
                >
                  忘記密碼？
                </a>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 px-6 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/10 hover:shadow-xl hover:shadow-primary/20 hover:bg-on-surface active:scale-[0.98] transition-all flex justify-center items-center gap-3 mt-4 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5 text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    <span className="tracking-widest">驗證中...</span>
                  </>
                ) : (
                  <>
                    <span className="tracking-widest">登入系統</span>
                    <span className="material-symbols-outlined text-lg">
                      arrow_forward
                    </span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 flex items-center gap-4">
              <div className="h-px bg-outline-variant/30 flex-grow" />
              <span className="text-[10px] text-outline-variant uppercase tracking-widest font-bold">
                第三方 SSO 單一登入
              </span>
              <div className="h-px bg-outline-variant/30 flex-grow" />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4">
              <button className="flex items-center justify-center gap-3 py-3 border border-outline-variant/50 rounded-xl hover:bg-surface-container-low transition-all bg-white shadow-sm hover:shadow-md">
                <span className="text-xs font-bold text-on-surface-variant">
                  Google
                </span>
              </button>
              <button className="flex items-center justify-center gap-3 py-3 border border-outline-variant/50 rounded-xl hover:bg-surface-container-low transition-all bg-white shadow-sm hover:shadow-md">
                <span className="text-xs font-bold text-on-surface-variant">
                  Microsoft
                </span>
              </button>
            </div>
            <footer className="mt-12 text-center space-y-3">
              <p className="text-sm text-outline">
                首次使用？{" "}
                <a
                  className="text-tertiary font-semibold hover:text-on-surface transition-colors border-b border-tertiary/30"
                  href="/onboarding"
                >
                  新手導覽
                </a>
              </p>
              <p className="text-sm text-outline">
                需要協助？{" "}
                <a
                  className="text-on-surface font-semibold hover:text-tertiary transition-colors border-b border-outline-variant"
                  href="#"
                >
                  聯繫系統管理員
                </a>
              </p>
            </footer>
          </div>
        </section>
      </main>

      {/* Global Fixed Footer */}
      <div className="fixed bottom-6 w-full lg:w-[60%] right-0 px-12 flex justify-between items-center pointer-events-none">
        <span className="text-[10px] text-outline/60 uppercase tracking-[0.2em] pointer-events-auto">
          &copy; 2026 DealerOS DIGITAL ATELIER. 版權所有.
        </span>
        <div className="flex gap-6 pointer-events-auto">
          <a
            className="text-[10px] text-outline/60 hover:text-tertiary transition-all uppercase tracking-widest font-medium"
            href="#"
          >
            隱私權政策
          </a>
          <a
            className="text-[10px] text-outline/60 hover:text-tertiary transition-all uppercase tracking-widest font-medium"
            href="#"
          >
            使用條款
          </a>
        </div>
      </div>
    </>
  );
}
