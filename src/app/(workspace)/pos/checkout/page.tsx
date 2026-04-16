"use client";

import { useRouter } from "next/navigation";
import { PosPageShell } from "@/components/pos/page-shell";
import { useCart } from "@/components/pos/cart-context";
import type { CheckoutMode } from "@/lib/pos/pos-types";

const modes: {
  mode: CheckoutMode;
  title: string;
  subtitle: string;
  icon: string;
  accent: string;
  desc: string;
  flow: string[];
}[] = [
  {
    mode: "vehicle",
    title: "車輛銷售",
    subtitle: "整車 + 配件 + 代辦費用",
    icon: "two_wheeler",
    accent: "#4F46E5",
    desc: "選車、加配件、勾代辦費（規費/保險/領牌）、B2B 統編、發票收據雙開",
    flow: ["選車+配件", "客戶識別", "代辦費用", "結帳", "發票+收據"],
  },
  {
    mode: "service",
    title: "維修保養",
    subtitle: "工時 + 料件 + 保固切換",
    icon: "build",
    accent: "#0EA5E9",
    desc: "加工項、加料號、保固內自動免收工資、套餐卡扣抵",
    flow: ["加工項", "加料號", "保固/套餐", "結帳", "發票"],
  },
  {
    mode: "retail",
    title: "精品零售",
    subtitle: "掃碼 · 快速結帳",
    icon: "shopping_bag",
    accent: "#EC4899",
    desc: "條碼快掃、分類瀏覽、會員帶入、LINE Pay/Apple Pay 秒結",
    flow: ["掃碼加品", "會員帶入", "結帳", "電子發票"],
  },
];

export default function CheckoutHubPage() {
  const router = useRouter();
  const { setMode, clear } = useCart();

  function startMode(mode: CheckoutMode) {
    clear();
    setMode(mode);
    router.push(`/pos/checkout/${mode}`);
  }

  return (
    <PosPageShell title="結帳中心" subtitle="選擇本次交易類型">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
        {modes.map((m) => (
          <button
            key={m.mode}
            type="button"
            onClick={() => startMode(m.mode)}
            className="text-left bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all overflow-hidden group"
          >
            <div
              className="h-32 flex items-center justify-center relative overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${m.accent} 0%, ${m.accent}CC 100%)` }}
            >
              <span className="material-symbols-outlined text-white text-[88px] opacity-90 group-hover:scale-110 transition-transform">
                {m.icon}
              </span>
              <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur text-white text-[10px] uppercase tracking-widest">
                {m.mode}
              </div>
            </div>
            <div className="p-5">
              <h3 className="font-display font-extrabold text-xl text-slate-900">{m.title}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{m.subtitle}</p>
              <p className="mt-3 text-sm text-slate-700 leading-relaxed">{m.desc}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {m.flow.map((step, i) => (
                  <span
                    key={step}
                    className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600"
                  >
                    <span className="tabular-nums text-slate-400">{i + 1}</span>
                    {step}
                  </span>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between pt-4 border-t border-slate-100">
                <span className="text-xs text-slate-500">按此開始</span>
                <span
                  className="inline-flex items-center gap-1 text-sm font-bold"
                  style={{ color: m.accent }}
                >
                  啟動結帳
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-10 bg-indigo-50/50 border border-indigo-100 rounded-2xl p-6 flex items-start gap-4">
        <span className="material-symbols-outlined text-indigo-500 text-[32px]">info</span>
        <div className="flex-1">
          <p className="font-bold text-slate-800 mb-1">跨模式混合結帳</p>
          <p className="text-sm text-slate-600 leading-relaxed">
            車輛結帳時可**同時**加入精品（例：交車當天加購安全帽），系統會自動拆成「電子發票」+「代辦費收據」兩張印出。
            這是我們做 POS 最重要的差異化——別家 POS 都要分兩次刷卡，我們一次搞定。
          </p>
        </div>
      </div>
    </PosPageShell>
  );
}
