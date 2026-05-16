"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  CHANNEL_CHIP,
  CHANNEL_LABEL,
  DEFAULT_LINE_TEMPLATE,
  DEFAULT_SMS_TEMPLATE,
  PICKUP_CHANNELS,
  renderPickupTemplate,
  type PickupChannel,
} from "@/domain/pickup-notifications.constants";
import type { PickupListRow, PickupStats } from "@/domain/pickup-notifications";
import { sendPickupNotificationAction } from "@/lib/aftersales/pickup-notification-actions";

type Banner = { ok: boolean; msg: string } | null;
type Filter = { scope: "pending" | "sent" | "all"; q: string };

type Props = {
  rows: PickupListRow[];
  stats: PickupStats;
  filter: Filter;
  canEdit: boolean;
};

const LS_TPL_LINE = "pickup-notify:tpl:line:v1";
const LS_TPL_SMS = "pickup-notify:tpl:sms:v1";
const LS_DEFAULT_CH = "pickup-notify:default-channels:v1";

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PickupNotificationsBoard({ rows, stats, filter, canEdit }: Props) {
  useSetPageHeader({
    title: "取車通知",
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "取車通知" },
    ],
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [scopeLocal, setScopeLocal] = useState<Filter["scope"]>(filter.scope);
  const [qLocal, setQLocal] = useState(filter.q);

  // 範本（localStorage 存）— 收成單一 settings state，避免 useEffect 內多次 setState
  type Settings = {
    tplLine: string;
    tplSms: string;
    defaultChannels: Record<PickupChannel, boolean>;
  };
  const [settings, setSettings] = useState<Settings>({
    tplLine: DEFAULT_LINE_TEMPLATE,
    tplSms: DEFAULT_SMS_TEMPLATE,
    defaultChannels: { line: true, sms: false, phone: false },
  });
  const tplLine = settings.tplLine;
  const tplSms = settings.tplSms;
  const defaultChannels = settings.defaultChannels;
  const setTplLine = (v: string) => setSettings((s) => ({ ...s, tplLine: v }));
  const setTplSms = (v: string) => setSettings((s) => ({ ...s, tplSms: v }));
  const setDefaultChannels = (
    updater: (d: Record<PickupChannel, boolean>) => Record<PickupChannel, boolean>,
  ) => setSettings((s) => ({ ...s, defaultChannels: updater(s.defaultChannels) }));
  const [tplSavedAt, setTplSavedAt] = useState<number | null>(null);

  // 發送 modal
  const [sendingRow, setSendingRow] = useState<PickupListRow | null>(null);
  const [sendingChannel, setSendingChannel] = useState<PickupChannel>("line");
  const [sendingBody, setSendingBody] = useState("");

  // hydrate localStorage（mount 後一次讀 / 一次 setSettings，避開 hydration mismatch）
  useEffect(() => {
    let next: Settings = {
      tplLine: DEFAULT_LINE_TEMPLATE,
      tplSms: DEFAULT_SMS_TEMPLATE,
      defaultChannels: { line: true, sms: false, phone: false },
    };
    try {
      const a = window.localStorage.getItem(LS_TPL_LINE);
      const b = window.localStorage.getItem(LS_TPL_SMS);
      const c = window.localStorage.getItem(LS_DEFAULT_CH);
      if (a) next = { ...next, tplLine: a };
      if (b) next = { ...next, tplSms: b };
      if (c) {
        const parsed = JSON.parse(c) as Partial<Record<PickupChannel, boolean>>;
        next = {
          ...next,
          defaultChannels: {
            line: parsed.line ?? true,
            sms: parsed.sms ?? false,
            phone: parsed.phone ?? false,
          },
        };
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(next);
  }, []);

  function showBanner(b: NonNullable<Banner>) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function applyFilter() {
    const params = new URLSearchParams();
    if (scopeLocal !== "pending") params.set("scope", scopeLocal);
    if (qLocal.trim()) params.set("q", qLocal.trim());
    startTransition(() => {
      router.push(`/parts/aftersales/pickup-notifications?${params.toString()}`);
    });
  }
  function resetFilter() {
    setScopeLocal("pending");
    setQLocal("");
    startTransition(() => {
      router.push(`/parts/aftersales/pickup-notifications`);
    });
  }

  function openSendModal(row: PickupListRow, channel?: PickupChannel) {
    const ch = channel ?? row.preferred_channel;
    const tpl = ch === "sms" ? tplSms : ch === "phone" ? "電話致電車主提醒取車。" : tplLine;
    setSendingRow(row);
    setSendingChannel(ch);
    setSendingBody(
      renderPickupTemplate(tpl, {
        customer_name: row.customer_name,
        vehicle_model: row.vehicle_model_name,
        vehicle_plate: row.vehicle_license_plate,
      }),
    );
  }

  function handleSend() {
    if (!sendingRow) return;
    startTransition(async () => {
      const res = await sendPickupNotificationAction({
        finalInspectionId: sendingRow.final_inspection_id,
        channel: sendingChannel,
        body: sendingBody,
      });
      if (res.ok) {
        showBanner({
          ok: true,
          msg: `✓ 已發送${CHANNEL_LABEL[sendingChannel]}通知給 ${sendingRow.customer_name ?? "車主"}`,
        });
        setSendingRow(null);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function saveTemplates() {
    try {
      localStorage.setItem(LS_TPL_LINE, tplLine);
      localStorage.setItem(LS_TPL_SMS, tplSms);
      localStorage.setItem(LS_DEFAULT_CH, JSON.stringify(defaultChannels));
      setTplSavedAt(Date.now());
      showBanner({ ok: true, msg: "✓ 範本已儲存（保存在本機）" });
    } catch {
      showBanner({ ok: false, msg: "瀏覽器拒絕寫入 localStorage" });
    }
  }

  const columns = useMemo<DataGridColumn<PickupListRow>[]>(
    () => [
      {
        id: "customer",
        header: "車主",
        width: 110,
        hideable: false,
        cell: (r) => (
          <span className="text-[12.5px] font-medium text-[#2C2C2A]">
            {r.customer_name ?? "—"}
          </span>
        ),
        exportValue: (r) => r.customer_name ?? "",
        sortValue: (r) => r.customer_name ?? "",
      },
      {
        id: "ro_code",
        header: "工單號",
        width: 150,
        cell: (r) => (
          <Link
            href={`/parts/aftersales/repair-orders/${r.repair_order_id}/lines`}
            className="font-mono text-[#185FA5] hover:underline"
          >
            {r.ro_code}
          </Link>
        ),
        exportValue: (r) => r.ro_code,
        sortValue: (r) => r.ro_code,
      },
      {
        id: "vehicle",
        header: "車輛",
        width: 200,
        cell: (r) => (
          <span className="text-[12px]">
            {r.vehicle_model_name ?? "—"}{" "}
            <span className="font-mono text-[#5A5955]">
              {r.vehicle_license_plate ?? ""}
            </span>
          </span>
        ),
        exportValue: (r) =>
          [r.vehicle_model_name, r.vehicle_license_plate].filter(Boolean).join(" / "),
      },
      {
        id: "phone",
        header: "聯絡電話",
        width: 120,
        cell: (r) => (
          <span className="font-mono text-[12px] text-[#5A5955]">
            {r.customer_phone ?? "—"}
          </span>
        ),
        exportValue: (r) => r.customer_phone ?? "",
      },
      {
        id: "preferred",
        header: "偏好通道",
        width: 90,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${CHANNEL_CHIP[r.preferred_channel]}`}
          >
            {CHANNEL_LABEL[r.preferred_channel]}
          </span>
        ),
        exportValue: (r) => CHANNEL_LABEL[r.preferred_channel],
        sortValue: (r) => r.preferred_channel,
      },
      {
        id: "signed_at",
        header: "竣工時間",
        width: 90,
        cell: (r) => (
          <span className="font-mono text-[12px] text-[#1A3A5C]">
            {fmtTime(r.signed_at ?? r.closed_at)}
          </span>
        ),
        exportValue: (r) => fmtDateTime(r.signed_at ?? r.closed_at),
        sortValue: (r) => r.signed_at ?? r.closed_at ?? "",
      },
      {
        id: "pickup_status",
        header: "通知狀態",
        width: 130,
        cell: (r) => {
          if (r.pickup_records.length === 0) {
            return (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B] whitespace-nowrap">
                ⏳ 待發送
              </span>
            );
          }
          const last = r.pickup_records[r.pickup_records.length - 1];
          return (
            <span className="text-[11px]">
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md ${CHANNEL_CHIP[last.channel]}`}
              >
                ✓ {CHANNEL_LABEL[last.channel]}
              </span>
              <span className="text-[#9A9890] ml-1">{fmtTime(last.sent_at)}</span>
            </span>
          );
        },
        exportValue: (r) =>
          r.pickup_records.length === 0
            ? "待發送"
            : r.pickup_records
                .map((p) => `${CHANNEL_LABEL[p.channel]} ${fmtDateTime(p.sent_at)}`)
                .join("; "),
        sortValue: (r) => r.last_pickup_at ?? "",
      },
      {
        id: "send_count",
        header: "發送次數",
        width: 70,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px] text-[#5A5955]">
            {r.pickup_records.length}
          </span>
        ),
        exportValue: (r) => String(r.pickup_records.length),
        sortValue: (r) => r.pickup_records.length,
      },
    ],
    [],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">取車通知</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          售後 · 11
        </span>
        <span className="text-[12px] text-[#9A9890]">
          竣工複檢通過 → SA 緩衝後手動發送 Line / 簡訊通知車主取車
        </span>
      </header>

      {/* Info banner — v2 規格緩衝機制說明 */}
      <div className="bg-[#E6F1FB] border border-[#4A90D9] rounded-lg px-4 py-2.5 text-[12.5px] text-[#185FA5]">
        📱 SA 手動確認後才會發送通知，系統不會自動推播。確認按鈕設計為「緩衝機制」，讓 SA 在車輛準備妥當後再通知車主。
      </div>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">篩選範圍</label>
            <select
              value={scopeLocal}
              onChange={(e) => setScopeLocal(e.target.value as Filter["scope"])}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none bg-white"
            >
              <option value="pending">待發送</option>
              <option value="sent">已發送</option>
              <option value="all">全部</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">關鍵字</label>
            <input
              value={qLocal}
              onChange={(e) => setQLocal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilter();
              }}
              placeholder="工單號 / 車主 / 車牌"
              className="h-[30px] w-[220px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={applyFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              onClick={resetFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
          </div>
        </div>
      </section>

      {/* Layout: 左 list / 右 設定 + 統計 */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3">
        {/* 左：list */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#9A9890]">
              共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆
              （{rows.filter((r) => r.pickup_records.length === 0).length} 筆待發送）
            </span>
          </div>

          <DataGrid
            columns={columns}
            data={rows}
            rowKey={(r) => r.final_inspection_id}
            persistKey="parts/aftersales/pickup-notifications"
            exportFileName="pickup-notifications"
            emptyMessage="目前沒有需要通知取車的工單"
            disabled={isPending}
            rowActionsWidth={canEdit ? 220 : 100}
            rowActions={(r) =>
              canEdit ? (
                <>
                  <button
                    onClick={() => openSendModal(r, "line")}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
                    disabled={isPending}
                  >
                    發送 Line
                  </button>
                  <button
                    onClick={() => openSendModal(r, "sms")}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                    disabled={isPending}
                  >
                    簡訊
                  </button>
                  <button
                    onClick={() => openSendModal(r, "phone")}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                    disabled={isPending}
                  >
                    電話
                  </button>
                </>
              ) : (
                <span className="text-[11px] text-[#9A9890]">無權限</span>
              )
            }
          />
        </div>

        {/* 右：範本 + 統計 */}
        <aside className="space-y-3">
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <h2 className="text-[13px] font-semibold text-[#2C2C2A]">⚙️ 通知範本設定</h2>
            </header>
            <div className="px-4 py-3 space-y-3">
              <div>
                <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                  Line 通知範本
                </label>
                <textarea
                  value={tplLine}
                  onChange={(e) => setTplLine(e.target.value)}
                  rows={5}
                  className="w-full border border-[#D5D3CB] rounded p-2 text-[12px] focus:border-[#185FA5] outline-none font-sans resize-none"
                />
                <p className="text-[10.5px] text-[#9A9890] mt-1">
                  可用變數：{"{車主姓名}"}、{"{車型}"}、{"{車牌}"}
                </p>
              </div>
              <div>
                <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                  簡訊通知範本
                </label>
                <textarea
                  value={tplSms}
                  onChange={(e) => setTplSms(e.target.value)}
                  rows={3}
                  className="w-full border border-[#D5D3CB] rounded p-2 text-[12px] focus:border-[#185FA5] outline-none font-sans resize-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                  預設通知方式
                </label>
                <div className="flex gap-3 flex-wrap">
                  {PICKUP_CHANNELS.map((ch) => (
                    <label key={ch} className="flex items-center gap-1.5 text-[12px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={defaultChannels[ch]}
                        onChange={(e) =>
                          setDefaultChannels((d) => ({ ...d, [ch]: e.target.checked }))
                        }
                        className="accent-[#1A3A5C]"
                      />
                      {CHANNEL_LABEL[ch]}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={saveTemplates}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
                >
                  儲存範本
                </button>
                {tplSavedAt && (
                  <span className="text-[11px] text-[#3B6D11]">已儲存於本機</span>
                )}
              </div>
            </div>
          </section>

          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <h2 className="text-[13px] font-semibold text-[#2C2C2A]">📊 今日通知統計</h2>
            </header>
            <div className="px-4 py-3 space-y-2 text-[12.5px]">
              <div className="flex justify-between border-b border-[#F2F2F2] pb-1.5">
                <span className="text-[#9A9890]">已發送通知</span>
                <span className="font-semibold text-[#0F6E56]">{stats.sent_today} 筆</span>
              </div>
              <div className="flex justify-between border-b border-[#F2F2F2] pb-1.5">
                <span className="text-[#9A9890]">待發送</span>
                <span className="font-semibold text-[#854F0B]">{stats.pending} 筆</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9A9890]">平均等候時間</span>
                <span className="font-semibold text-[#2C2C2A]">
                  {stats.avg_wait_minutes != null ? `${stats.avg_wait_minutes} 分鐘` : "—"}
                </span>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {/* Send Modal */}
      {sendingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[520px] overflow-hidden">
            <header className="px-5 py-3 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
              <h3 className="text-[13.5px] font-semibold text-[#2C2C2A]">
                發送取車通知 — {sendingRow.customer_name ?? "車主"}
              </h3>
              <button
                onClick={() => setSendingRow(null)}
                className="text-[#9A9890] hover:text-[#2C2C2A] text-[16px]"
              >
                ✕
              </button>
            </header>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div>
                  <div className="text-[11px] text-[#9A9890]">工單號</div>
                  <div className="font-mono text-[#1A3A5C]">{sendingRow.ro_code}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#9A9890]">車輛</div>
                  <div>
                    {sendingRow.vehicle_model_name ?? "—"}{" "}
                    <span className="font-mono text-[#5A5955]">
                      {sendingRow.vehicle_license_plate ?? ""}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#9A9890]">聯絡電話</div>
                  <div className="font-mono text-[#5A5955]">{sendingRow.customer_phone ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#9A9890]">已發送次數</div>
                  <div className="font-mono">{sendingRow.pickup_records.length}</div>
                </div>
              </div>
              <div>
                <label className="text-[11px] text-[#9A9890] font-medium block mb-1">通道</label>
                <div className="flex gap-2">
                  {PICKUP_CHANNELS.map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => {
                        setSendingChannel(ch);
                        const tpl =
                          ch === "sms"
                            ? tplSms
                            : ch === "phone"
                              ? "電話致電車主提醒取車。"
                              : tplLine;
                        setSendingBody(
                          renderPickupTemplate(tpl, {
                            customer_name: sendingRow.customer_name,
                            vehicle_model: sendingRow.vehicle_model_name,
                            vehicle_plate: sendingRow.vehicle_license_plate,
                          }),
                        );
                      }}
                      className={`h-[30px] px-3 rounded-full text-[12px] border ${
                        sendingChannel === ch
                          ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                          : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]"
                      }`}
                    >
                      {CHANNEL_LABEL[ch]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                  通知內文
                </label>
                <textarea
                  value={sendingBody}
                  onChange={(e) => setSendingBody(e.target.value)}
                  rows={6}
                  className="w-full border border-[#D5D3CB] rounded p-2 text-[12.5px] focus:border-[#185FA5] outline-none resize-none font-sans"
                />
              </div>
            </div>
            <footer className="px-5 py-3 border-t border-[#EEECE6] bg-[#F8F7F4] flex justify-end gap-2">
              <button
                onClick={() => setSendingRow(null)}
                className="h-[30px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                disabled={isPending}
              >
                取消
              </button>
              <button
                onClick={handleSend}
                disabled={isPending || !sendingBody.trim()}
                className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {isPending ? "發送中⋯" : `發送${CHANNEL_LABEL[sendingChannel]}通知`}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Banner */}
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
    </main>
  );
}
