import { getMonthlyUsage } from "@/domain/ai-usage";
import { PRICING } from "@/lib/ai/pricing";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

export default async function AdminAiUsagePage() {
  const canView = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!canView) {
    return (
      <main className="px-6 py-5">
        <div className="bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] p-4 rounded">
          沒有權限。需要 master.customer.edit。
        </div>
      </main>
    );
  }

  const u = await getMonthlyUsage();

  const maxDailyTokens = Math.max(...u.daily.map((d) => d.total_tokens), 1);

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">AI 用量 / Cost</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          {u.range_label}
        </span>
        <span className="text-[12px] text-[#9A9890]">
          Gemini 2.5 Flash + embedding-001 試算
        </span>
      </header>

      {/* 大數字卡片 */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          title="本月成本"
          big={`$${u.total_cost_usd.toFixed(4)}`}
          sub={`≈ NT$${u.total_cost_twd.toFixed(2)}`}
          color="#185FA5"
        />
        <KpiCard
          title="總向量段數"
          big={String(u.rag_chunks_total)}
          sub={`其中手冊 ${u.manuals_chunks_total} 段`}
          color="#7C3AED"
        />
        <KpiCard
          title="本月 chat 對話"
          big={String(u.modules.find((m) => m.module === "chat")?.count ?? 0)}
          sub="user + assistant 都計"
          color="#3B6D11"
        />
        <KpiCard
          title="本月 AI 紀錄產生"
          big={String(
            (u.modules.find((m) => m.module === "voice_handcard")?.count ?? 0) +
              (u.modules.find((m) => m.module === "business_card")?.count ?? 0),
          )}
          sub="語音 + 名片"
          color="#854F0B"
        />
      </section>

      {/* 各模組 breakdown */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">模組明細</h2>
        </header>
        <table className="w-full text-[12.5px]">
          <thead className="text-[11px] text-[#9A9890]">
            <tr className="border-b border-[#EEECE6]">
              <th className="text-left px-4 py-2 font-medium">模組</th>
              <th className="text-right px-4 py-2 font-medium">筆數</th>
              <th className="text-right px-4 py-2 font-medium">tokens in</th>
              <th className="text-right px-4 py-2 font-medium">tokens out</th>
              <th className="text-right px-4 py-2 font-medium">成本 USD</th>
              <th className="text-right px-4 py-2 font-medium">≈ TWD</th>
            </tr>
          </thead>
          <tbody>
            {u.modules.map((m) => (
              <tr key={m.module} className="border-b last:border-b-0 border-[#EEECE6]">
                <td className="px-4 py-2 text-[#2C2C2A]">{m.label}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {m.count}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {m.tokens_in.toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {m.tokens_out.toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-[#185FA5] font-semibold">
                  ${m.cost_usd.toFixed(4)}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-[#5A5955]">
                  NT${(m.cost_usd * 32).toFixed(2)}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-[#1A3A5C] bg-[#F8F7F4]">
              <td className="px-4 py-2 font-semibold text-[#2C2C2A]">合計</td>
              <td className="px-4 py-2 text-right" colSpan={3}></td>
              <td className="px-4 py-2 text-right font-mono tabular-nums font-bold text-[#1A3A5C]">
                ${u.total_cost_usd.toFixed(4)}
              </td>
              <td className="px-4 py-2 text-right font-mono tabular-nums font-bold text-[#1A3A5C]">
                NT${u.total_cost_twd.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 日趨勢 — 純 CSS bar chart、不裝套件 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            近 30 天 chat tokens
          </h2>
        </header>
        <div className="p-4">
          <div className="flex items-end gap-0.5 h-32">
            {u.daily.map((d) => {
              const h = (d.total_tokens / maxDailyTokens) * 100;
              return (
                <div
                  key={d.date}
                  className="flex-1 bg-gradient-to-t from-[#185FA5] to-[#7C3AED] rounded-t hover:opacity-80 transition-opacity"
                  style={{ height: `${Math.max(h, 2)}%` }}
                  title={`${d.date}\n${d.chat_count} 對話\n${d.total_tokens.toLocaleString()} tokens\n$${d.cost_usd.toFixed(4)}`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-[#9A9890] mt-1">
            <span>{u.daily[0]?.date}</span>
            <span>{u.daily[u.daily.length - 1]?.date}</span>
          </div>
        </div>
      </section>

      {/* Pricing 揭露 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg p-3 text-[11.5px] text-[#5A5955]">
        <div className="font-semibold mb-1 text-[#2C2C2A]">Pricing（Gemini 2.5 Flash）</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>Text input: ${PRICING.TEXT_INPUT_PER_M} / 1M tokens</div>
          <div>Audio input: ${PRICING.AUDIO_INPUT_PER_M} / 1M tokens</div>
          <div>Output: ${PRICING.OUTPUT_PER_M} / 1M tokens</div>
          <div>Embedding: ${PRICING.EMBEDDING_PER_M} / 1M tokens</div>
        </div>
        <div className="mt-1 text-[10.5px] text-[#9A9890]">
          USD→TWD 試算用 32:1（實際以央行為準）
        </div>
      </section>
    </main>
  );
}

function KpiCard({
  title,
  big,
  sub,
  color,
}: {
  title: string;
  big: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg p-4">
      <div className="text-[11px] text-[#9A9890] uppercase tracking-wider">
        {title}
      </div>
      <div
        className="text-[24px] font-bold tabular-nums mt-1"
        style={{ color }}
      >
        {big}
      </div>
      <div className="text-[11px] text-[#5A5955] mt-0.5">{sub}</div>
    </div>
  );
}
