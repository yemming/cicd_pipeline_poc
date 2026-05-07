"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function BalanceFilters({
  warehouses,
  currentQ,
  currentWarehouse,
  currentAbc,
}: {
  warehouses: Array<{ id: string; code: string; name: string }>;
  currentQ: string;
  currentWarehouse: string;
  currentAbc: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(currentQ);

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/parts/operations/balance?${params.toString()}`);
  };

  return (
    <div className="bg-white rounded-lg border border-[#EEECE6] p-3 flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-[10px] font-semibold text-[#6B6A68] mb-1 uppercase">
          搜尋料件
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateParam("q", q);
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="料號 / 名稱"
            className="h-7 px-2 border border-[#D8D6CF] rounded text-[12px] w-48"
          />
        </form>
      </div>

      <div>
        <label className="block text-[10px] font-semibold text-[#6B6A68] mb-1 uppercase">倉庫</label>
        <select
          value={currentWarehouse}
          onChange={(e) => updateParam("warehouse", e.target.value)}
          className="h-7 px-2 border border-[#D8D6CF] rounded text-[12px]"
        >
          <option value="">全部</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[10px] font-semibold text-[#6B6A68] mb-1 uppercase">ABC</label>
        <select
          value={currentAbc}
          onChange={(e) => updateParam("abc", e.target.value)}
          className="h-7 px-2 border border-[#D8D6CF] rounded text-[12px]"
        >
          <option value="">全部</option>
          <option value="A">A 類</option>
          <option value="B">B 類</option>
          <option value="C">C 類</option>
        </select>
      </div>

      {(currentQ || currentWarehouse || currentAbc) && (
        <button
          type="button"
          onClick={() => router.push("/parts/operations/balance")}
          className="h-7 px-2 text-[11px] text-[#6B6A68] hover:text-[#1A1917]"
        >
          ✕ 清除篩選
        </button>
      )}
    </div>
  );
}
