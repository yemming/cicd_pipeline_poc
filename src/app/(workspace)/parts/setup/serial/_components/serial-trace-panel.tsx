"use client";

import { useState, useTransition } from "react";

import { querySerialNo, type SerialTraceResult } from "@/domain/stock";

const STATUS_LABEL: Record<string, string> = {
  available: "可用",
  issued: "已出庫",
  reserved: "已預留",
  in_transit: "運送中",
  damaged: "損壞",
  scrapped: "報廢",
};

const EVENT_LABEL: Record<string, { label: string; bg: string; text: string }> = {
  receipt: { label: "入庫", bg: "bg-[#EAF3DE]", text: "text-[#3B6D11]" },
  transfer_in: { label: "調撥入庫", bg: "bg-[#EAF4FB]", text: "text-[#185FA5]" },
  transfer_out: { label: "調撥出庫", bg: "bg-[#FDF3E3]", text: "text-[#854F0B]" },
  issue: { label: "出庫", bg: "bg-[#FDECEA]", text: "text-[#CC0000]" },
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-TW", { hour12: false });
  } catch {
    return iso;
  }
}

export function SerialTracePanel() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SerialTraceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSearch() {
    const trimmed = query.trim();
    if (!trimmed) {
      setError("請輸入序列號");
      setResult(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await querySerialNo(trimmed);
        setResult(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "查詢失敗");
        setResult(null);
      }
    });
  }

  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">序列號查詢</h2>
      </header>
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[11px] text-[#9A9890] font-medium">輸入序列號</label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              placeholder="掃描或輸入序列號..."
              disabled={isPending}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 font-mono text-[12.5px] focus:border-[#185FA5] outline-none disabled:bg-[#F8F7F4]"
            />
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={isPending}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
          >
            {isPending ? "查詢中⋯" : "查詢"}
          </button>
        </div>

        {error ? (
          <div className="text-[12px] text-[#CC0000]">{error}</div>
        ) : null}

        {!result && !error ? (
          <div className="bg-[#F8F7F4] rounded-md px-3 py-2.5 text-[12px] text-[#9A9890] text-center">
            輸入序列號後顯示完整軌跡記錄
          </div>
        ) : null}

        {result && !result.found ? (
          <div className="bg-[#FDF3E3] border border-[#FAC775] rounded-md px-3 py-2.5 text-[12px] text-[#854F0B]">
            找不到序列號 <span className="font-mono font-semibold">{result.serial_no}</span>
          </div>
        ) : null}

        {result && result.found ? (
          <div className="space-y-2.5">
            {/* 當前狀態 */}
            <div className="bg-[#F8F7F4] border border-[#EEECE6] rounded-md px-3 py-2.5 space-y-1">
              <div className="flex items-center justify-between">
                <div className="text-[13px] font-semibold text-[#2C2C2A]">
                  {result.item.name || "—"}
                </div>
                <div className="font-mono text-[11.5px] text-[#5A5955]">{result.item.code}</div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                <div>
                  <span className="text-[#9A9890]">序列號：</span>
                  <span className="font-mono text-[#2C2C2A]">{result.serial_no}</span>
                </div>
                <div>
                  <span className="text-[#9A9890]">目前狀態：</span>
                  <span className="text-[#2C2C2A]">
                    {STATUS_LABEL[result.current.status] ?? result.current.status}
                  </span>
                </div>
                <div>
                  <span className="text-[#9A9890]">所在倉庫：</span>
                  <span className="text-[#2C2C2A]">{result.current.warehouse_name ?? "—"}</span>
                </div>
                <div>
                  <span className="text-[#9A9890]">最後異動：</span>
                  <span className="text-[#2C2C2A]">
                    {formatDate(result.current.last_movement_at)}
                  </span>
                </div>
              </div>
            </div>

            {/* 軌跡 */}
            <div>
              <div className="text-[11px] text-[#9A9890] font-medium mb-1">異動軌跡</div>
              {result.history.length === 0 ? (
                <div className="text-[12px] text-[#9A9890] text-center py-3">無軌跡記錄</div>
              ) : (
                <ol className="space-y-1.5">
                  {result.history.map((ev, idx) => {
                    const evMeta = EVENT_LABEL[ev.event_type] ?? {
                      label: ev.event_type,
                      bg: "bg-[#F2F2F2]",
                      text: "text-[#5A5955]",
                    };
                    return (
                      <li
                        key={`${ev.event_time}-${idx}`}
                        className="flex items-start gap-2 text-[12px]"
                      >
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] shrink-0 ${evMeta.bg} ${evMeta.text}`}
                        >
                          {evMeta.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[#2C2C2A]">
                            {ev.doc_no ? (
                              <span className="font-mono font-semibold">{ev.doc_no}</span>
                            ) : (
                              <span className="text-[#9A9890]">—</span>
                            )}
                            <span className="text-[#9A9890]"> · {ev.doc_kind}</span>
                            {ev.warehouse_name ? (
                              <span className="text-[#9A9890]"> · {ev.warehouse_name}</span>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-[#9A9890]">
                            {formatDate(ev.event_time)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
