"use client";

import { PosPageShell } from "@/components/pos/page-shell";
import { Card, KpiCard } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { Button } from "@/components/pos/button";
import { CustomerAvatar, VipBadge } from "@/components/pos/customer-chip";
import { customers, birthdayCustomersThisMonth } from "@/lib/pos/pos-mock-customers";
import { formatNTD, formatTaiwanDate, maskPhone } from "@/lib/pos/format";

const tiers = [
  { tier: "Platinum", spend: 3000000, color: "#3730A3", perks: ["全部優惠", "賽道 VIP 席次", "免費保養套餐 (年)", "新車優先預訂"] },
  { tier: "Gold", spend: 1000000, color: "#B45309", perks: ["95 折", "優先預約", "生日禮物", "尊榮獻禮"] },
  { tier: "Silver", spend: 500000, color: "#475569", perks: ["97 折", "生日禮券 NT$3,000", "雙倍點數月"] },
  { tier: "Bronze", spend: 200000, color: "#B45309", perks: ["98 折", "生日禮券 NT$1,000"] },
];

export default function VipCenterPage() {
  const vipCustomers = customers.filter((c) => c.tier !== "None");
  const byTier = (t: string) => vipCustomers.filter((c) => c.tier === t).length;
  const birthdays = birthdayCustomersThisMonth(4);
  const topSpenders = [...vipCustomers].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 5);

  return (
    <PosPageShell title="VIP 會員中心" subtitle="分級 · 壽星 · 消費時間軸" preview>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="VIP 總數" value={vipCustomers.length} icon="workspace_premium" tone="indigo" />
        <KpiCard label="本月壽星" value={birthdays.length} icon="cake" tone="rose" />
        <KpiCard label="VIP 消費占比" value="68%" icon="pie_chart" tone="emerald" delta="業界約 42%" deltaTone="positive" />
        <KpiCard label="本月轉化" value="4 人" icon="trending_up" tone="amber" subtitle="普通 → Bronze" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="會員分級規則" icon="shield">
          <div className="space-y-3">
            {tiers.map((t) => (
              <div
                key={t.tier}
                className="rounded-xl p-4 border"
                style={{ borderColor: `${t.color}40`, backgroundColor: `${t.color}08` }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="material-symbols-outlined" style={{ color: t.color }}>workspace_premium</span>
                    <span className="font-display font-bold text-lg" style={{ color: t.color }}>{t.tier}</span>
                    <Badge tone="neutral">{byTier(t.tier)} 位</Badge>
                  </span>
                  <span className="text-xs text-slate-500">累消 ≥ {formatNTD(t.spend)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {t.perks.map((p) => (
                    <span key={p} className="text-[10px] px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="🎂 本月壽星" icon="cake" action={
            <Button size="sm" icon="send">一鍵發生日券</Button>
          }>
            <div className="space-y-2">
              {birthdays.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">本月無壽星</p>
              ) : birthdays.map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-3 bg-rose-50 rounded-lg border border-rose-100">
                  <CustomerAvatar customer={c} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{c.name}</span>
                      <VipBadge tier={c.tier} />
                    </div>
                    <p className="text-[10px] text-slate-500">
                      生日 {c.birthday?.slice(5).replace("-", "/")} · {maskPhone(c.phone)}
                    </p>
                  </div>
                  <Badge tone="danger" icon="card_giftcard">{formatNTD(c.tier === "Platinum" ? 5000 : c.tier === "Gold" ? 3000 : 1000)}</Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card title="累消榜" icon="leaderboard">
            <div className="space-y-2">
              {topSpenders.map((c, i) => (
                <div key={c.id} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">{i + 1}</span>
                  <CustomerAvatar customer={c} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-[10px] text-slate-400">{formatTaiwanDate(c.lastPurchase ?? c.joinDate)}</p>
                  </div>
                  <span className="font-display font-extrabold tabular-nums text-indigo-600">{formatNTD(c.totalSpent)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </PosPageShell>
  );
}
