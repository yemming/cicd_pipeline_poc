"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { lookupItemsByModelYear, type LookupItemRow, type ModelOption } from "@/domain/compatibility";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

export function CompatibilityLookup({ models }: { models: ModelOption[] }) {
  const seriesOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of models) if (m.series) set.add(m.series);
    return Array.from(set).sort();
  }, [models]);

  const [series, setSeries] = useState<string>("");
  const [modelId, setModelId] = useState<string>("");
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [latest, setLatest] = useState<{ key: string; data: LookupItemRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const modelOptions = useMemo(
    () => models.filter((m) => !series || m.series === series),
    [models, series],
  );

  const yearNum = Number(year);
  const queryValid =
    !!modelId && Number.isFinite(yearNum) && yearNum >= 1900 && yearNum <= 2100;
  const queryKey = `${modelId}|${yearNum}`;

  // rows 只在 latest 跟當下 query 對得起來時才顯示；query 一變動就先清空（derived，不存 state）
  const rows = latest && latest.key === queryKey ? latest.data : [];

  // Reactive 重撈：debounce 200ms。setState 放在 setTimeout / startTransition 內，非同步、不算 effect body 同步 setState
  useEffect(() => {
    if (!queryValid) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      startTransition(async () => {
        try {
          const result = await lookupItemsByModelYear(modelId, yearNum);
          setLatest({ key: queryKey, data: result });
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : "反查失敗");
          setLatest({ key: queryKey, data: [] });
        }
      });
    }, 200);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [queryKey, queryValid, modelId, yearNum]);

  const handleSeriesChange = (next: string) => {
    setSeries(next);
    // 切車系 → 同步清掉不屬於新車系的 model；用 handler 處理而非 useEffect，避免 cascading render
    if (modelId && !models.some((m) => m.id === modelId && m.series === next)) {
      setModelId("");
    }
  };

  const columns: DataGridColumn<LookupItemRow>[] = [
    {
      id: "item_image_url",
      header: "圖",
      width: 50,
      sortable: false,
      hideable: false,
      cell: (r) =>
        r.item_image_url ? (
          <Image
            src={r.item_image_url}
            alt={r.item_name}
            width={36}
            height={36}
            unoptimized
            className="w-9 h-9 rounded-md object-cover border border-[#EEECE6]"
          />
        ) : (
          <div className="w-9 h-9 rounded-md border border-dashed border-[#D5D3CB] bg-[#F8F7F4]" />
        ),
      exportValue: (r) => r.item_image_url ?? "",
    },
    {
      id: "item_code",
      header: "備件代碼",
      width: 140,
      cell: (r) => <span className="font-mono text-[12px] text-[#185FA5]">{r.item_code}</span>,
      exportValue: (r) => r.item_code,
      sortValue: (r) => r.item_code,
    },
    {
      id: "item_name",
      header: "備件名稱",
      cell: (r) => <span className="font-semibold text-[12.5px]">{r.item_name}</span>,
      exportValue: (r) => r.item_name,
      sortValue: (r) => r.item_name,
    },
    {
      id: "is_verified",
      header: "驗證狀態",
      width: 90,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${r.is_verified ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#FDF3E3] text-[#854F0B]"}`}
        >
          {r.is_verified ? "已驗證" : "待確認"}
        </span>
      ),
      exportValue: (r) => (r.is_verified ? "已驗證" : "待確認"),
      sortValue: (r) => (r.is_verified ? 1 : 0),
    },
    {
      id: "notes",
      header: "說明",
      cell: (r) => <span className="text-[12px] text-[#5A5955]">{r.notes ?? "—"}</span>,
      exportValue: (r) => r.notes ?? "",
      sortValue: (r) => r.notes ?? "",
    },
  ];

  return (
    <section
      className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
      data-testid="compatibility-lookup"
    >
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">反查：依車型 + 年份查詢可用備件</h2>
      </header>
      <div className="px-4 py-3 flex gap-2 items-end flex-wrap bg-[#FCFBF8]">
        <div className="flex flex-col gap-1">
          <label className={labelClass}>車系</label>
          <select
            value={series}
            onChange={(e) => handleSeriesChange(e.target.value)}
            className={`${inputClass} w-[160px]`}
            data-testid="lookup-series"
          >
            <option value="">— 全部車系 —</option>
            {seriesOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>車型</label>
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className={`${inputClass} w-[220px]`}
            data-testid="lookup-model"
          >
            <option value="">— 請選擇車型 —</option>
            {modelOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name || m.model_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>年份</label>
          <input
            type="number"
            min={1900}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className={`${inputClass} w-[100px] font-mono`}
            data-testid="lookup-year"
          />
        </div>
        <span className="ml-auto text-[11.5px] text-[#9A9890]">
          {isPending
            ? "查詢中⋯"
            : modelId
              ? `命中 ${rows.length} 筆`
              : "請選擇車型後自動反查"}
        </span>
      </div>
      {error ? (
        <div className="px-4 py-2 text-[12px] text-[#CC0000] bg-[#FDECEA] border-t border-[#F5AEAD]">
          ⚠ 反查失敗：{error}
        </div>
      ) : null}
      <div className="px-4 py-3">
        <DataGrid
          columns={columns}
          data={rows}
          rowKey={(r) => r.compat_id}
          persistKey="parts/setup/compatibility-lookup"
          exportFileName={`compat-lookup-${new Date().toISOString().slice(0, 10)}`}
          disabled={isPending}
          emptyMessage={modelId ? "此車型 + 年份組合查無可用備件" : "請先選擇車型"}
        />
      </div>
    </section>
  );
}
