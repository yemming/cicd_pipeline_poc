"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { dispatchSurveyAction } from "@/lib/csi/survey-actions";
import {
  SURVEY_RESPONSE_STATUS_BADGE_CLS,
  SURVEY_RESPONSE_STATUS_LABEL,
  SURVEY_RESPONSE_SOURCE_LABEL,
  type SurveyResponseListRow,
} from "@/domain/surveys.constants";

export type DispatchCustomerOption = {
  id: string;
  label: string;
  sublabel: string;
};

type Props = {
  templateId: string;
  rows: SurveyResponseListRow[];
  customers: DispatchCustomerOption[];
};

export function ResponsesBoard({ templateId, rows, customers }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const filteredCustomers = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return customers;
    return customers.filter(
      (c) =>
        c.label.toLowerCase().includes(t) || c.sublabel.toLowerCase().includes(t),
    );
  }, [customers, search]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function openDispatch() {
    setSelectedIds(new Set());
    setSearch("");
    setDispatchOpen(true);
  }

  function dispatchNow() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setBanner({ ok: false, msg: "請至少勾選一位客戶" });
      return;
    }
    startTransition(async () => {
      const res = await dispatchSurveyAction(
        templateId,
        ids.map((cid) => ({ customer_id: cid, source_module: "manual" as const })),
      );
      if (res.ok) {
        setBanner({ ok: true, msg: `✓ 已派發 ${res.data.inserted} 筆，已推 LINE 通知` });
        setDispatchOpen(false);
        clearSelection();
        router.refresh();
        setTimeout(() => setBanner(null), 3200);
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  }

  const columns: DataGridColumn<SurveyResponseListRow>[] = [
    {
      id: "customer",
      header: "派發對象",
      width: 200,
      hideable: false,
      cell: (r) => (
        <div className="min-w-0">
          <div className="text-[12.5px] text-[#2C2C2A]">{r.customer_name ?? "（無姓名）"}</div>
          {r.customer_phone && (
            <div className="text-[11px] text-[#9A9890]">{r.customer_phone}</div>
          )}
        </div>
      ),
      exportValue: (r) => r.customer_name ?? "",
    },
    {
      id: "status",
      header: "狀態",
      width: 90,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${SURVEY_RESPONSE_STATUS_BADGE_CLS[r.status]}`}
        >
          {SURVEY_RESPONSE_STATUS_LABEL[r.status]}
        </span>
      ),
      exportValue: (r) => SURVEY_RESPONSE_STATUS_LABEL[r.status],
    },
    {
      id: "source",
      header: "來源",
      width: 90,
      cell: (r) => (r.source_module ? SURVEY_RESPONSE_SOURCE_LABEL[r.source_module] : "—"),
      exportValue: (r) => (r.source_module ? SURVEY_RESPONSE_SOURCE_LABEL[r.source_module] : ""),
    },
    {
      id: "sent_at",
      header: "派發時間",
      width: 140,
      cell: (r) => (r.sent_at ? r.sent_at.slice(0, 16).replace("T", " ") : "—"),
      exportValue: (r) => r.sent_at?.slice(0, 16) ?? "",
    },
    {
      id: "responded_at",
      header: "回填時間",
      width: 140,
      cell: (r) =>
        r.responded_at ? r.responded_at.slice(0, 16).replace("T", " ") : "—",
      exportValue: (r) => r.responded_at?.slice(0, 16) ?? "",
    },
    {
      id: "link",
      header: "回填連結",
      width: 110,
      sortable: false,
      cell: (r) => (
        <a
          href={`/csi/surveys/respond/${r.token}`}
          target="_blank"
          rel="noreferrer"
          className="text-[12px] text-[#185FA5] hover:underline"
        >
          開啟連結 ↗
        </a>
      ),
      exportValue: (r) => `/csi/surveys/respond/${r.token}`,
    },
  ];

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆派發紀錄
        </span>
        <div className="ml-auto flex gap-1.5">
          <button
            onClick={openDispatch}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
          >
            ＋ 派發給客戶
          </button>
        </div>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey={`csi/surveys/${templateId}/responses`}
        exportFileName="survey-responses"
        emptyMessage="尚未派發任何問卷"
        disabled={isPending}
      />

      {dispatchOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center px-4">
          <div className="bg-white rounded-lg shadow-xl border border-[#EEECE6] max-w-xl w-full max-h-[85vh] flex flex-col">
            <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center">
              <h2 className="text-[14px] font-semibold text-[#2C2C2A]">派發問卷</h2>
              <button
                onClick={() => setDispatchOpen(false)}
                className="ml-auto text-[#9A9890] hover:text-[#2C2C2A]"
                aria-label="關閉"
              >
                ✕
              </button>
            </header>
            <div className="px-4 py-3 space-y-2 flex flex-col min-h-0">
              <div className="flex items-center gap-2">
                <input
                  type="search"
                  placeholder="搜尋姓名 / 客戶代碼 / 電話…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  disabled={isPending}
                  className="flex-1 h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                />
                <span className="text-[11px] text-[#9A9890] whitespace-nowrap">
                  已選 <b className="text-[#2C2C2A]">{selectedIds.size}</b> 位
                </span>
                {selectedIds.size > 0 && (
                  <button
                    onClick={clearSelection}
                    disabled={isPending}
                    className="text-[11px] text-[#185FA5] hover:underline"
                  >
                    清空
                  </button>
                )}
              </div>
              <div className="border border-[#EEECE6] rounded overflow-y-auto flex-1 max-h-[360px] min-h-[200px]">
                {filteredCustomers.length === 0 ? (
                  <div className="p-4 text-[12px] text-[#9A9890] text-center">
                    {customers.length === 0
                      ? "本品牌尚無啟用中的客戶。請先到客戶主檔建立資料。"
                      : "找不到符合條件的客戶"}
                  </div>
                ) : (
                  <ul className="divide-y divide-[#EEECE6]">
                    {filteredCustomers.map((c) => {
                      const checked = selectedIds.has(c.id);
                      return (
                        <li key={c.id}>
                          <label
                            className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#F8F7F4] ${checked ? "bg-[#EAF4FB]" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSelected(c.id)}
                              disabled={isPending}
                              className="accent-[#1A3A5C]"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-[12.5px] text-[#2C2C2A] truncate">
                                {c.label}
                              </div>
                              {c.sublabel && (
                                <div className="text-[11px] text-[#9A9890] truncate">
                                  {c.sublabel}
                                </div>
                              )}
                            </div>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <p className="text-[11px] text-[#9A9890]">
                送出後會：(1) 寫入 survey_responses (2) 推 LINE 通知 (3) 客戶收到回填連結
              </p>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex items-center justify-end gap-2">
              <button
                onClick={() => setDispatchOpen(false)}
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                onClick={dispatchNow}
                disabled={isPending || selectedIds.size === 0}
                className="h-[30px] px-4 rounded text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                {isPending ? "派發中⋯" : `確認派發 (${selectedIds.size})`}
              </button>
            </footer>
          </div>
        </div>
      )}

      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}
    </>
  );
}
