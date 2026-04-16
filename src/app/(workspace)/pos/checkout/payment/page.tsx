"use client";

import { useRouter } from "next/navigation";
import { CheckoutShell } from "@/components/pos/checkout-shell";
import { useCart } from "@/components/pos/cart-context";
import { formatNTD } from "@/lib/pos/format";

const methods = [
  { key: "card", title: "信用卡", icon: "credit_card", desc: "VISA / MasterCard / JCB / AE", route: "card-swipe", color: "#4F46E5" },
  { key: "linepay", title: "LINE Pay", icon: "qr_code_2", desc: "QR code 掃碼付款", route: "linepay", color: "#06C755" },
  { key: "applepay", title: "Apple Pay", icon: "contactless", desc: "iPhone Tap to Pay", route: "applepay", color: "#000000" },
  { key: "cash", title: "現金", icon: "payments", desc: "收現找零", route: "cash", color: "#F59E0B" },
  { key: "check", title: "支票", icon: "description", desc: "B2B 常用", route: "check", color: "#64748B" },
  { key: "split", title: "混合付款", icon: "call_split", desc: "多筆組合", route: "split", color: "#EC4899" },
];

export default function PaymentHubPage() {
  const router = useRouter();
  const { due, total } = useCart();

  return (
    <CheckoutShell
      title="付款方式"
      subtitle={`應付 ${formatNTD(due > 0 ? due : total)}`}
      step="payment"
      breadcrumb={[
        { label: "POS 收銀", href: "/pos" },
        { label: "結帳中心", href: "/pos/checkout" },
        { label: "付款方式" },
      ]}
    >
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {methods.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => router.push(`/pos/checkout/${m.route}`)}
            className="group bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-xl hover:-translate-y-1 transition-all text-left"
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"
              style={{ backgroundColor: `${m.color}1A`, color: m.color }}
            >
              <span className="material-symbols-outlined text-[30px]">{m.icon}</span>
            </div>
            <h3 className="font-display font-extrabold text-lg text-slate-900">{m.title}</h3>
            <p className="text-xs text-slate-500 mt-1">{m.desc}</p>
            <div className="mt-4 flex items-center gap-1 text-sm font-medium" style={{ color: m.color }}>
              選擇此方式
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-sm text-amber-800">
        <span className="material-symbols-outlined text-amber-500">info</span>
        <div>
          <p className="font-bold mb-1">組合付款說明</p>
          <p className="text-xs leading-relaxed text-amber-700">
            客戶可以一部分刷卡、一部分 LINE Pay、剩下付現金——選「混合付款」就可以逐筆輸入，
            系統自動追蹤累計已收與剩餘應收。
          </p>
        </div>
      </div>
    </CheckoutShell>
  );
}
