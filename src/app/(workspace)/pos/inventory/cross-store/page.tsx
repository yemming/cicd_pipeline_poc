"use client";

import { useState, useMemo } from "react";
import { PosPageShell } from "@/components/pos/page-shell";
import { Card } from "@/components/pos/card";
import { Button, ButtonLink } from "@/components/pos/button";
import { Badge } from "@/components/pos/badge";
import { skus } from "@/lib/pos/pos-mock-skus";
import { inventory } from "@/lib/pos/pos-mock-inventory";
import { stores, getStore } from "@/lib/pos/pos-mock-customers";
import { formatNTD } from "@/lib/pos/format";
import type { StoreCode } from "@/lib/pos/pos-types";

export default function CrossStorePage() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<{ store: StoreCode; skuId: string } | null>(null);

  const filtered = q
    ? skus.filter((s) =>
        s.name.toLowerCase().includes(q.toLowerCase()) ||
        s.code.toLowerCase().includes(q.toLowerCase()),
      ).slice(0, 15)
    : skus.slice(0, 15);

  const matrix = useMemo(() => {
    return filtered.map((s) => {
      const row = stores.map((store) => {
        const inv = inventory.find((i) => i.sku === s.id && i.store === store.code);
        return { store: store.code, stock: inv?.stock ?? 0, avg: inv?.avgDailySales ?? 0 };
      });
      return { sku: s, row };
    });
  }, [filtered]);

  function cellColor(stock: number) {
    if (stock === 0) return "bg-rose-100 text-rose-700 border-rose-200";
    if (stock <= 2) return "bg-amber-100 text-amber-700 border-amber-200";
    if (stock <= 5) return "bg-emerald-50 text-emerald-700 border-emerald-200";
    return "bg-emerald-100 text-emerald-800 border-emerald-300";
  }

  const selectedSku = selected ? skus.find((s) => s.id === selected.skuId) : null;
  const selectedInv = selected
    ? inventory.find((i) => i.sku === selected.skuId && i.store === selected.store)
    : null;

  return (
    <PosPageShell title="跨店即時庫存" subtitle="展廳客戶問哪台有貨，5 秒就知道" preview>
      <Card title="搜尋" icon="search" className="mb-5">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            qr_code_scanner
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="掃碼或輸入品名 (例：Pista、V4 碳纖維、AGV)"
            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                    品名
                  </th>
                  {stores.map((s) => (
                    <th key={s.code} className="px-2 py-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold text-center">
                      {s.shortName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map(({ sku, row }) => (
                  <tr key={sku.id} className="border-b border-slate-100">
                    <td className="px-4 py-2">
                      <p className="font-medium text-sm text-slate-900 leading-tight">{sku.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono tabular-nums">{sku.code}</p>
                    </td>
                    {row.map((cell) => (
                      <td key={cell.store} className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => setSelected({ store: cell.store, skuId: sku.id })}
                          className={`w-full py-2 rounded-lg border font-bold tabular-nums transition-all hover:scale-105 ${cellColor(cell.stock)}`}
                        >
                          {cell.stock}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-3 text-[11px]">
            <span className="text-slate-500">顏色圖例：</span>
            <Legend color="bg-rose-100 border-rose-200" label="缺貨" />
            <Legend color="bg-amber-100 border-amber-200" label="1-2" />
            <Legend color="bg-emerald-50 border-emerald-200" label="3-5" />
            <Legend color="bg-emerald-100 border-emerald-300" label="充足" />
          </div>
        </div>

        {selected && selectedSku && selectedInv ? (
          <Card title={getStore(selected.store).name} icon="store">
            <h3 className="font-bold mb-3">{selectedSku.name}</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Stat label="當前庫存" value={String(selectedInv.stock)} />
              <Stat label="預留" value={String(selectedInv.reserved)} />
              <Stat label="可用" value={String(selectedInv.stock - selectedInv.reserved)} />
              <Stat label="日均銷" value={selectedInv.avgDailySales.toFixed(1)} />
            </div>
            <div className="mb-3 p-3 bg-amber-50 rounded-lg text-xs text-amber-800">
              {selectedInv.stock === 0 ? (
                <><span className="font-bold">已售罄</span>，建議調撥</>
              ) : (
                <><span className="font-bold">預估 {Math.round(selectedInv.stock / Math.max(0.1, selectedInv.avgDailySales))} 天售罄</span>，可提早補貨</>
              )}
            </div>
            <div className="text-xs text-slate-500 mb-4">
              單價 <span className="font-bold tabular-nums">{formatNTD(selectedSku.price)}</span>
            </div>
            <div className="space-y-2">
              <ButtonLink href="/pos/inventory/transfer" fullWidth icon="sync_alt">
                建立調撥單
              </ButtonLink>
              <Button variant="secondary" fullWidth icon="phone">
                通知該門店留貨
              </Button>
            </div>
          </Card>
        ) : (
          <Card title="提示" icon="info">
            <p className="text-sm text-slate-600 leading-relaxed">
              點選矩陣中任一格，查看該門店該品項詳情、建立調撥單或通知留貨。
            </p>
            <div className="mt-4 space-y-2 text-xs text-slate-500">
              <p>✓ 跨 5 店即時庫存同步</p>
              <p>✓ 一鍵發起調撥，司機掃 QR 簽收</p>
              <p>✓ 展廳銷售顧問最愛功能</p>
            </div>
          </Card>
        )}
      </div>
    </PosPageShell>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`w-3 h-3 rounded border ${color}`} />
      <span className="text-slate-600">{label}</span>
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 text-center">
      <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-lg font-display font-bold tabular-nums">{value}</p>
    </div>
  );
}
