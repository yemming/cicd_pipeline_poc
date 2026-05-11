"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  testRoLinkConnection,
  updateRoLinkConfig,
  verifyRoLinkRecord,
  type RoLinkConfigPatch,
  type RoLinkConfigRow,
  type RoLinkRecordRow,
} from "@/domain/warranty";

type Banner = { ok: boolean; msg: string } | null;

// 規格 §Design Pattern 標準 chip
const STATUS_CHIP: Record<string, string> = {
  done: "bg-[#EAF3DE] text-[#3B6D11]",
  pending: "bg-[#FDF3E3] text-[#854F0B]",
  customer: "bg-[#F2F2F2] text-[#6B6A68]",
};

const WARRANTY_CHIP: Record<string, string> = {
  原廠保固: "bg-[#EBF3FF] text-[#1A3A5C]",
  延伸保固: "bg-[#E8F5F0] text-[#0F6E56]",
  判斷中: "bg-[#F2F2F2] text-[#6B6A68]",
  不符保固: "bg-[#FDECEA] text-[#CC0000]",
};

const SYNC_FIELDS: { key: keyof RoLinkConfigPatch; label: string }[] = [
  { key: "sync_ro_to_issue", label: "RO 工單號 → 庫存出庫單號自動帶入" },
  { key: "sync_vin_check", label: "車輛序列號（VIN）→ 自動比對保固資格" },
  { key: "sync_warranty_label", label: "保固類型 → 自動標記索賠類別" },
  { key: "sync_technician", label: "技師 ID → 自動記錄負責人" },
  { key: "sync_estimate", label: "估價明細 → 同步至費用回收模組" },
];

const RULES: { t: string; d: string }[] = [
  {
    t: "條件 1：VIN 保固有效",
    d: "車輛出廠日 + 2 年 ≤ 今日，且里程 ≤ 20,000 km",
  },
  { t: "條件 2：零件屬保固範圍", d: "料號在原廠保固零件清單內（自動對照）" },
  {
    t: "條件 3：非人為損壞",
    d: "技師需勾選「非人為/改裝造成」，方可啟動保固",
  },
];

export function RoLinkBoard({
  config,
  records,
  canEdit,
}: {
  config: RoLinkConfigRow | null;
  records: RoLinkRecordRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  // 暫存表單 state（避免每個 checkbox 改動都單獨 server action — 用「儲存設定」一次送）
  const [draft, setDraft] = useState<RoLinkConfigRow | null>(config);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const setField = <K extends keyof RoLinkConfigRow>(
    key: K,
    val: RoLinkConfigRow[K],
  ) => {
    if (!draft) return;
    setDraft({ ...draft, [key]: val });
  };

  const dirty = useMemo(() => {
    if (!draft || !config) return false;
    return (
      draft.sync_ro_to_issue !== config.sync_ro_to_issue ||
      draft.sync_vin_check !== config.sync_vin_check ||
      draft.sync_warranty_label !== config.sync_warranty_label ||
      draft.sync_technician !== config.sync_technician ||
      draft.sync_estimate !== config.sync_estimate ||
      draft.sync_frequency !== config.sync_frequency ||
      draft.fallback_action !== config.fallback_action ||
      draft.expiry_alert_days !== config.expiry_alert_days
    );
  }, [draft, config]);

  const saveAll = () => {
    if (!draft) return;
    const patch: RoLinkConfigPatch = {
      sync_ro_to_issue: draft.sync_ro_to_issue,
      sync_vin_check: draft.sync_vin_check,
      sync_warranty_label: draft.sync_warranty_label,
      sync_technician: draft.sync_technician,
      sync_estimate: draft.sync_estimate,
      sync_frequency: draft.sync_frequency,
      fallback_action: draft.fallback_action,
      expiry_alert_days: draft.expiry_alert_days,
    };
    startTransition(async () => {
      const res = await updateRoLinkConfig(patch);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存串接設定" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const testConn = () => {
    startTransition(async () => {
      const res = await testRoLinkConnection();
      if (res.ok)
        showBanner({
          ok: true,
          msg: `✓ DMS 連線正常（延遲 ${res.data.latencyMs}ms）`,
        });
      else showBanner({ ok: false, msg: res.error });
    });
  };

  const verify = (id: string, ro: string) => {
    startTransition(async () => {
      const res = await verifyRoLinkRecord(id);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ ${ro} 已驗證並同步` });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  // 表格欄位
  const columns: DataGridColumn<RoLinkRecordRow>[] = [
    {
      id: "ro_no",
      header: "RO 工單號",
      width: 140,
      hideable: false,
      cell: (r) => (
        <span className="font-mono font-semibold text-[#1A3A5C]">{r.ro_no}</span>
      ),
      exportValue: (r) => r.ro_no,
      sortValue: (r) => r.ro_no,
    },
    {
      id: "vin",
      header: "VIN / 車型",
      width: 230,
      cell: (r) => (
        <div className="leading-tight">
          <div className="font-mono">{r.vin ?? "—"}</div>
          {r.model ? (
            <div className="text-[11px] text-[#9A9890] mt-0.5">{r.model}</div>
          ) : null}
        </div>
      ),
      exportValue: (r) => `${r.vin ?? ""}${r.model ? ` (${r.model})` : ""}`,
      sortValue: (r) => r.vin ?? "",
    },
    {
      id: "warranty_type",
      header: "保固類型",
      width: 110,
      cell: (r) => {
        const label = r.warranty_type ?? "—";
        const cls = WARRANTY_CHIP[label] ?? "bg-[#EBF3FF] text-[#1A3A5C]";
        return r.warranty_type ? (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${cls}`}
          >
            {label}
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        );
      },
      exportValue: (r) => r.warranty_type ?? "",
      sortValue: (r) => r.warranty_type ?? "",
    },
    {
      id: "sync_status",
      header: "串接狀態",
      width: 130,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
            STATUS_CHIP[r.sync_status] ?? STATUS_CHIP.pending
          }`}
        >
          {r.sync_status_label ?? r.sync_status}
        </span>
      ),
      exportValue: (r) => r.sync_status_label ?? r.sync_status,
      sortValue: (r) => r.sync_status,
    },
    {
      id: "out_no",
      header: "出庫單",
      width: 130,
      cell: (r) =>
        r.out_no ? (
          <span className="font-mono">{r.out_no}</span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => r.out_no ?? "",
      sortValue: (r) => r.out_no ?? "",
    },
    {
      id: "claim_no",
      header: "索賠單",
      width: 140,
      cell: (r) =>
        r.claim_no ? (
          <span className="font-mono">{r.claim_no}</span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => r.claim_no ?? "",
      sortValue: (r) => r.claim_no ?? "",
    },
  ];

  if (!draft) {
    return (
      <main className="px-6 py-5">
        <p className="text-[14px] text-[#9A9890]">尚未初始化串接設定</p>
      </main>
    );
  }

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          與 RO 工單串接設定
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          11.5
        </span>
        <span className="text-[12px] text-[#9A9890]">
          DMS 串接設定 · 保固自動判斷規則 · 同步記錄查詢
        </span>
      </header>

      <div className="px-3 py-2 rounded bg-[#EAF4FB] border border-[#B5D4F4] text-[12px] text-[#1A3A5C]">
        🔗 RO 工單（Repair Order）與庫存系統的串接設定，確保保固零件出入庫與維修工單自動同步，無需人工重複輸入。
      </div>

      <div
        className={`grid grid-cols-1 lg:grid-cols-2 gap-3 ${lockedClass}`}
      >
        {/* 左卡：串接系統設定 */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              🔌 串接系統設定
            </span>
          </header>
          <div className="px-4 py-3 flex flex-col gap-2.5 text-[12.5px]">
            <div className="text-[11px] font-semibold text-[#9A9890] tracking-wider">
              DMS 系統連線
            </div>
            <div className="px-3 py-2.5 rounded-md bg-[#EAF3DE] border border-[#C5DC9F] flex items-center justify-between">
              <div>
                <div className="text-[12px] font-semibold text-[#3B6D11]">
                  ✅ {draft.dms_label ?? "DMS"} 已連線
                </div>
                <div className="text-[11px] text-[#5A5955] mt-0.5">
                  API 端點：{draft.dms_endpoint ?? "—"}
                </div>
              </div>
              <button
                type="button"
                onClick={testConn}
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                {isPending ? "測試中⋯" : "測試連線"}
              </button>
            </div>

            <div className="text-[11px] font-semibold text-[#9A9890] tracking-wider mt-1">
              同步欄位設定
            </div>
            <div className="flex flex-col gap-1.5">
              {SYNC_FIELDS.map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-2 text-[12.5px] text-[#2C2C2A]"
                >
                  <input
                    type="checkbox"
                    disabled={!canEdit || isPending}
                    checked={Boolean(draft[key as keyof RoLinkConfigRow])}
                    onChange={(e) =>
                      setField(
                        key as keyof RoLinkConfigRow,
                        e.target.checked as never,
                      )
                    }
                    style={{ accentColor: "#0F6E56" }}
                  />
                  {label}
                </label>
              ))}
            </div>

            <div className="text-[11px] font-semibold text-[#9A9890] tracking-wider mt-1">
              同步頻率
            </div>
            <select
              disabled={!canEdit || isPending}
              value={draft.sync_frequency}
              onChange={(e) => setField("sync_frequency", e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="realtime">即時同步（Webhook 推送）</option>
              <option value="poll5">每 5 分鐘輪詢</option>
              <option value="poll60">每小時同步</option>
            </select>
          </div>
        </section>

        {/* 右卡：保固觸發規則 */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              ⚙️ 保固觸發規則
            </span>
          </header>
          <div className="px-4 py-3 flex flex-col gap-2.5 text-[12.5px]">
            <div className="text-[11px] font-semibold text-[#9A9890] tracking-wider">
              自動保固判斷
            </div>
            <div className="flex flex-col gap-1.5">
              {RULES.map((c) => (
                <div
                  key={c.t}
                  className="px-3 py-2 rounded-md bg-[#F8F7F4] border border-[#EEECE6]"
                >
                  <div className="font-semibold text-[#2C2C2A] mb-0.5">
                    {c.t}
                  </div>
                  <div className="text-[#5A5955]">{c.d}</div>
                </div>
              ))}
            </div>

            <div className="text-[11px] font-semibold text-[#9A9890] tracking-wider mt-1">
              不符合保固時的處理
            </div>
            <select
              disabled={!canEdit || isPending}
              value={draft.fallback_action}
              onChange={(e) => setField("fallback_action", e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="customer_pay">改走一般維修出庫（客付）</option>
              <option value="prompt_tech">提示技師確認並手動選擇</option>
            </select>

            <div className="text-[11px] font-semibold text-[#9A9890] tracking-wider mt-1">
              保固到期告警（提前天數）
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#2C2C2A]">保固到期前</span>
              <input
                type="number"
                min={0}
                disabled={!canEdit || isPending}
                value={draft.expiry_alert_days}
                onChange={(e) =>
                  setField(
                    "expiry_alert_days",
                    Math.max(0, Math.floor(Number(e.target.value) || 0)),
                  )
                }
                className="w-[70px] h-[28px] border border-[#D5D3CB] rounded px-2 text-[12px] text-center focus:border-[#185FA5] outline-none"
              />
              <span className="text-[12px] text-[#2C2C2A]">天，通知服務顧問</span>
            </div>

            <button
              type="button"
              onClick={saveAll}
              disabled={!canEdit || !dirty || isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50 mt-2 self-start"
            >
              {isPending ? "儲存中⋯" : "儲存設定"}
            </button>
          </div>
        </section>
      </div>

      {/* 表格：近期 RO-保固串接記錄 */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${lockedClass}`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            📋 近期 RO 工單-保固串接記錄
          </span>
        </header>
        <div className="px-4 py-3">
          <DataGrid
            columns={columns}
            data={records}
            rowKey={(r) => r.id}
            persistKey="parts/warranty/ro-link"
            exportFileName="ro-link-records"
            emptyMessage="尚無 RO 工單串接記錄"
            disabled={isPending}
            rowActionsWidth={150}
            rowActionsHeader="操作"
            rowActions={(r) =>
              r.sync_status === "pending" ? (
                <button
                  type="button"
                  disabled={!canEdit || isPending}
                  onClick={() => verify(r.id, r.ro_no)}
                  className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                >
                  手動驗證
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#9A9890]"
                  title="僅 demo，無詳情頁"
                >
                  查看
                </button>
              )
            }
          />
        </div>
      </section>

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}
    </main>
  );
}
