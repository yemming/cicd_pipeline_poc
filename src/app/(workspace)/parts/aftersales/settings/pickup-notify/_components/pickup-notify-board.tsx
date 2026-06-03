"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization";
import { useSetPageHeader } from "@/components/page-header-context";

import {
  upsertTemplate,
  setTemplateActive,
  deleteTemplate,
  previewWithVariables,
  dispatchTestNotification,
  upsertSchedule,
  setScheduleActive,
  deleteSchedule,
  type PickupNotificationTemplate,
  type PickupNotificationSchedule,
  type TemplateVariable,
  type NotifChannel,
  type TriggerEvent,
  type TargetRole,
} from "@/domain/aftersales-pickup-notify";
import {
  type NodeKind,
  type NotifyPolicy,
  NODE_KIND_DEFS,
  POLICY_LABEL,
  nodeKindDef,
} from "@/domain/aftersales-pickup-notify.constants";

type Banner = { ok: boolean; msg: string } | null;
type TabKey = "templates" | "schedules";

type Props = {
  templates: PickupNotificationTemplate[];
  schedules: PickupNotificationSchedule[];
  canEdit: boolean;
};

const CHANNEL_LABEL: Record<NotifChannel, string> = {
  line: "LINE",
  sms: "簡訊",
  email: "Email",
};

const CHANNEL_CHIP: Record<NotifChannel, string> = {
  line: "bg-[#E5F5EE] text-[#084D30] border-[#80CCA8]",
  sms: "bg-[#EAF4FB] text-[#0C3E70] border-[#85B7EB]",
  email: "bg-[#EEEDFE] text-[#534AB7] border-[#C4BEF0]",
};

const TRIGGER_LABEL: Record<TriggerEvent, string> = {
  ro_completed: "工單竣工後",
  pickup_24h_before: "預計取車 24 小時前",
  pickup_2h_before: "預計取車 2 小時前",
  pickup_overdue: "逾時未取車",
};

const ROLE_LABEL: Record<TargetRole, string> = {
  customer: "車主",
  sa: "服務顧問 SA",
  manager: "店長 / 主管",
};

const DEFAULT_PREVIEW_VARS: Record<string, string> = {
  customer_name: "鄭宗勳",
  vehicle_model: "PANIGALE V2",
  plate_no: "LGX-8096",
  pickup_time: "2026-05-20 14:00",
  ro_no: "MN-CP-260519-002",
};

export function PickupNotifyBoard({ templates, schedules, canEdit }: Props) {
  useSetPageHeader({
    title: "取車通知設定",
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales/repair-orders" },
      { label: "設定" },
      { label: "取車通知設定" },
    ],
    hideSearch: true,
  });

  const router = useRouter();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<TabKey>("templates");
  const [banner, setBanner] = useState<Banner>(null);

  const [tplModal, setTplModal] = useState<{
    open: boolean;
    initial: PickupNotificationTemplate | null;
  }>({ open: false, initial: null });
  const [previewModal, setPreviewModal] = useState<{
    open: boolean;
    template: PickupNotificationTemplate | null;
    subject: string | null;
    body: string;
  }>({ open: false, template: null, subject: null, body: "" });
  const [testModal, setTestModal] = useState<{
    open: boolean;
    template: PickupNotificationTemplate | null;
  }>({ open: false, template: null });
  const [schedModal, setSchedModal] = useState<{
    open: boolean;
    initial: PickupNotificationSchedule | null;
  }>({ open: false, initial: null });

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  // ===== KPI（範本管理 tab）=====
  const kpi = useMemo(() => {
    const total = templates.length;
    const active = templates.filter((t) => t.is_active).length;
    const line = templates.filter((t) => t.channel === "line").length;
    const sms = templates.filter((t) => t.channel === "sms").length;
    return { total, active, line, sms };
  }, [templates]);

  // ===== Template DataGrid columns =====
  const tplColumns: DataGridColumn<PickupNotificationTemplate>[] = useMemo(
    () => [
      {
        id: "name",
        header: "範本名稱",
        width: 220,
        hideable: false,
        cell: (r) => <span className="font-medium text-[#1A3A5C]">{r.name}</span>,
        exportValue: (r) => r.name,
        sortValue: (r) => r.name,
      },
      {
        id: "channel",
        header: "通道",
        width: 90,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[11px] font-medium ${CHANNEL_CHIP[r.channel]}`}
          >
            {CHANNEL_LABEL[r.channel]}
          </span>
        ),
        exportValue: (r) => CHANNEL_LABEL[r.channel],
        sortValue: (r) => r.channel,
      },
      {
        id: "subject",
        header: "主旨（Email）",
        width: 220,
        cell: (r) => (
          <span className="text-[#5A5955]">
            {r.subject?.trim() ? r.subject : <span className="text-[#9A9890]">—</span>}
          </span>
        ),
        exportValue: (r) => r.subject ?? "",
      },
      {
        id: "body_preview",
        header: "範本內容（節錄）",
        width: 320,
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955] line-clamp-2">
            {r.body_template.length > 60 ? `${r.body_template.slice(0, 60)}⋯` : r.body_template}
          </span>
        ),
        exportValue: (r) => r.body_template,
        sortable: false,
      },
      {
        id: "variables_count",
        header: "可用變數",
        width: 90,
        align: "right",
        cell: (r) => <span className="font-mono text-[#5A5955]">{r.variables.length}</span>,
        exportValue: (r) => r.variables.length,
        sortValue: (r) => r.variables.length,
      },
      {
        id: "is_active",
        header: "狀態",
        width: 80,
        cell: (r) =>
          r.is_active ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11] whitespace-nowrap">
              啟用
            </span>
          ) : (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68] whitespace-nowrap">
              停用
            </span>
          ),
        exportValue: (r) => (r.is_active ? "啟用" : "停用"),
        sortValue: (r) => (r.is_active ? 1 : 0),
      },
      {
        id: "updated_at",
        header: "最後更新",
        width: 130,
        cell: (r) => <span className="text-[11px] text-[#9A9890]">{formatStableTs(r.updated_at)}</span>,
        exportValue: (r) => formatStableTs(r.updated_at),
        sortValue: (r) => r.updated_at,
      },
    ],
    [],
  );

  // ===== Schedule DataGrid columns =====
  const schedColumns: DataGridColumn<PickupNotificationSchedule>[] = useMemo(
    () => [
      {
        id: "trigger_event",
        header: "觸發事件",
        width: 180,
        hideable: false,
        cell: (r) => (
          <span className="font-medium text-[#1A3A5C]">{TRIGGER_LABEL[r.trigger_event]}</span>
        ),
        exportValue: (r) => TRIGGER_LABEL[r.trigger_event],
        sortValue: (r) => r.trigger_event,
      },
      {
        id: "offset_minutes",
        header: "偏移",
        width: 110,
        align: "right",
        cell: (r) => <span className="font-mono text-[#5A5955]">{formatOffset(r.offset_minutes)}</span>,
        exportValue: (r) => r.offset_minutes,
        sortValue: (r) => r.offset_minutes,
      },
      {
        id: "template",
        header: "使用範本",
        width: 220,
        cell: (r) => (
          <span className="text-[#5A5955]">
            {r.template_name ?? <span className="text-[#9A9890]">（已刪除）</span>}
            {r.template_channel ? (
              <span
                className={`ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-md border text-[10.5px] font-medium ${CHANNEL_CHIP[r.template_channel]}`}
              >
                {CHANNEL_LABEL[r.template_channel]}
              </span>
            ) : null}
          </span>
        ),
        exportValue: (r) => r.template_name ?? "",
        sortValue: (r) => r.template_name ?? "",
      },
      {
        id: "target_role",
        header: "收件對象",
        width: 110,
        cell: (r) =>
          r.target_role ? (
            <span className="text-[#5A5955]">{ROLE_LABEL[r.target_role]}</span>
          ) : (
            <span className="text-[#9A9890]">—</span>
          ),
        exportValue: (r) => (r.target_role ? ROLE_LABEL[r.target_role] : ""),
      },
      {
        id: "quiet_hours",
        header: "安靜時段",
        width: 130,
        cell: (r) => {
          if (!r.quiet_hours_start && !r.quiet_hours_end) {
            return <span className="text-[#9A9890]">—</span>;
          }
          return (
            <span className="font-mono text-[11px] text-[#5A5955]">
              {(r.quiet_hours_start ?? "??:??").slice(0, 5)} ~ {(r.quiet_hours_end ?? "??:??").slice(0, 5)}
            </span>
          );
        },
        exportValue: (r) =>
          r.quiet_hours_start && r.quiet_hours_end
            ? `${r.quiet_hours_start.slice(0, 5)} ~ ${r.quiet_hours_end.slice(0, 5)}`
            : "",
        sortable: false,
      },
      {
        id: "is_active",
        header: "狀態",
        width: 80,
        cell: (r) =>
          r.is_active ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
              啟用
            </span>
          ) : (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">
              停用
            </span>
          ),
        exportValue: (r) => (r.is_active ? "啟用" : "停用"),
      },
    ],
    [],
  );

  // ===== Mutations =====
  function handleSaveTemplate(input: SaveTemplatePayload) {
    if (!canEdit || pending) return;
    start(async () => {
      const res = await upsertTemplate(input);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: input.id ? "✓ 已更新範本" : "✓ 已建立範本",
        });
        setTplModal({ open: false, initial: null });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleToggleTpl(r: PickupNotificationTemplate) {
    if (!canEdit || pending) return;
    start(async () => {
      const res = await setTemplateActive(r.id, !r.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_active ? "✓ 已停用範本" : "✓ 已啟用範本" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleDeleteTpl(r: PickupNotificationTemplate) {
    if (!canEdit || pending) return;
    if (!confirm(`確定要刪除範本「${r.name}」嗎？`)) return;
    start(async () => {
      const res = await deleteTemplate(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除範本" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handlePreview(r: PickupNotificationTemplate) {
    start(async () => {
      const res = await previewWithVariables(r.id, DEFAULT_PREVIEW_VARS);
      if (res.ok) {
        setPreviewModal({
          open: true,
          template: r,
          subject: res.data.subject,
          body: res.data.body,
        });
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleSendTest(r: PickupNotificationTemplate) {
    setTestModal({ open: true, template: r });
  }

  function handleConfirmSendTest(tpl: PickupNotificationTemplate) {
    if (pending) return;
    start(async () => {
      const res = await dispatchTestNotification(tpl.id, DEFAULT_PREVIEW_VARS);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 測試訊息已派送（${res.data.deliveredTo}）` });
        setTestModal({ open: false, template: null });
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleSaveSchedule(input: SaveSchedulePayload) {
    if (!canEdit || pending) return;
    start(async () => {
      const res = await upsertSchedule(input);
      if (res.ok) {
        showBanner({ ok: true, msg: input.id ? "✓ 已更新排程" : "✓ 已建立排程" });
        setSchedModal({ open: false, initial: null });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleToggleSched(r: PickupNotificationSchedule) {
    if (!canEdit || pending) return;
    start(async () => {
      const res = await setScheduleActive(r.id, !r.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_active ? "✓ 已停用排程" : "✓ 已啟用排程" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleDeleteSched(r: PickupNotificationSchedule) {
    if (!canEdit || pending) return;
    if (!confirm("確定要刪除這條排程嗎？")) return;
    start(async () => {
      const res = await deleteSchedule(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除排程" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  // ===== KPI slot =====
  const kpiSlot = (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiCard label="總範本數" value={kpi.total} tone="blue" layout="horizontal" />
      <KpiCard label="啟用中" value={kpi.active} tone="green" layout="horizontal" />
      <KpiCard label="LINE 範本" value={kpi.line} tone="green" layout="horizontal" />
      <KpiCard label="簡訊範本" value={kpi.sms} tone="blue" layout="horizontal" />
    </div>
  );

  // ===== Render =====
  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">取車通知設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          AS-Settings · A 級
        </span>
        <span className="text-[12px] text-[#9A9890]">
          管理 LINE / SMS / Email 取車通知範本與觸發排程
        </span>
      </header>

      {/* Info alert */}
      <div className="bg-[#EAF4FB] border border-[#85B7EB] rounded-lg px-4 py-2.5 text-[12px] text-[#185FA5] leading-relaxed">
        📱 SA 手動確認後才會發送通知，系統不會自動推播。確認按鈕設計為「緩衝機制」，讓 SA
        在車輛準備妥當後再通知車主。排程設定僅控制「提醒 SA 確認」的時機。
      </div>

      {/* Tabs */}
      <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
        <div className="flex border-b border-[#EEECE6]">
          <TabBtn active={tab === "templates"} onClick={() => setTab("templates")}>
            範本管理（{templates.length}）
          </TabBtn>
          <TabBtn active={tab === "schedules"} onClick={() => setTab("schedules")}>
            排程設定（{schedules.length}）
          </TabBtn>
        </div>
      </div>

      <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 -mt-3 space-y-3">
        {tab === "templates" ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#9A9890]">
                共 <b className="text-[#2C2C2A]">{templates.length}</b> 個範本
              </span>
              <button
                disabled={!canEdit || pending}
                onClick={() => setTplModal({ open: true, initial: null })}
                className="ml-auto h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                ＋ 新增範本
              </button>
            </div>

            {templates.length === 0 ? (
              <EmptyState
                msg="目前尚未設定取車通知範本"
                hint="點右上「＋ 新增範本」開始建立 LINE / 簡訊 / Email 通知範本"
              />
            ) : (
              <DataGrid
                columns={tplColumns}
                data={templates}
                rowKey={(r) => r.id}
                persistKey="parts/aftersales/settings/pickup-notify/templates"
                exportFileName="pickup-notification-templates"
                emptyMessage="沒有符合條件的範本"
                disabled={pending}
                kpiSlot={kpiSlot}
                rowActionsWidth={310}
                rowActions={(r) => (
                  <div className="flex gap-1.5">
                    <button
                      disabled={!canEdit || pending}
                      onClick={() => setTplModal({ open: true, initial: r })}
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                    >
                      編輯
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => handlePreview(r)}
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                    >
                      預覽
                    </button>
                    <button
                      disabled={pending || !r.is_active}
                      onClick={() => handleSendTest(r)}
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#EAF4FB] border border-[#85B7EB] text-[#185FA5] hover:bg-[#dbe9f6] disabled:opacity-50"
                      title={r.is_active ? "派送測試訊息" : "範本已停用"}
                    >
                      📤 測試
                    </button>
                    <button
                      disabled={!canEdit || pending}
                      onClick={() => handleToggleTpl(r)}
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                    >
                      {r.is_active ? "停用" : "啟用"}
                    </button>
                    <button
                      disabled={!canEdit || pending}
                      onClick={() => handleDeleteTpl(r)}
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                    >
                      刪除
                    </button>
                  </div>
                )}
              />
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#9A9890]">
                共 <b className="text-[#2C2C2A]">{schedules.length}</b> 條排程
              </span>
              <button
                disabled={!canEdit || pending || templates.filter((t) => t.is_active).length === 0}
                onClick={() => setSchedModal({ open: true, initial: null })}
                className="ml-auto h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                title={
                  templates.filter((t) => t.is_active).length === 0
                    ? "請先建立啟用中的範本"
                    : "新增排程"
                }
              >
                ＋ 新增排程
              </button>
            </div>

            {schedules.length === 0 ? (
              <EmptyState
                msg="目前尚未設定排程"
                hint="排程用於在特定事件（例：工單竣工後）自動提醒 SA 發送取車通知"
              />
            ) : (
              <DataGrid
                columns={schedColumns}
                data={schedules}
                rowKey={(r) => r.id}
                persistKey="parts/aftersales/settings/pickup-notify/schedules"
                exportFileName="pickup-notification-schedules"
                emptyMessage="沒有排程資料"
                disabled={pending}
                rowActionsWidth={210}
                rowActions={(r) => (
                  <div className="flex gap-1.5">
                    <button
                      disabled={!canEdit || pending}
                      onClick={() => setSchedModal({ open: true, initial: r })}
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                    >
                      編輯
                    </button>
                    <button
                      disabled={!canEdit || pending}
                      onClick={() => handleToggleSched(r)}
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                    >
                      {r.is_active ? "停用" : "啟用"}
                    </button>
                    <button
                      disabled={!canEdit || pending}
                      onClick={() => handleDeleteSched(r)}
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                    >
                      刪除
                    </button>
                  </div>
                )}
              />
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {tplModal.open && (
        <TemplateModal
          initial={tplModal.initial}
          pending={pending}
          onClose={() => setTplModal({ open: false, initial: null })}
          onSave={handleSaveTemplate}
        />
      )}

      {previewModal.open && previewModal.template && (
        <PreviewModal
          template={previewModal.template}
          subject={previewModal.subject}
          body={previewModal.body}
          onClose={() =>
            setPreviewModal({ open: false, template: null, subject: null, body: "" })
          }
        />
      )}

      {testModal.open && testModal.template && (
        <TestSendModal
          template={testModal.template}
          pending={pending}
          onClose={() => setTestModal({ open: false, template: null })}
          onConfirm={() => testModal.template && handleConfirmSendTest(testModal.template)}
        />
      )}

      {schedModal.open && (
        <ScheduleModal
          initial={schedModal.initial}
          templates={templates}
          pending={pending}
          onClose={() => setSchedModal({ open: false, initial: null })}
          onSave={handleSaveSchedule}
        />
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

// ============================================================================
// Helpers
// ============================================================================

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] last:border-r-0 ${
        active
          ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
          : "text-[#5A5955] hover:bg-[#F8F7F4]"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ msg, hint }: { msg: string; hint: string }) {
  return (
    <div className="border border-dashed border-[#D5D3CB] rounded-lg bg-[#F8F7F4] px-6 py-10 text-center">
      <div className="text-[24px] mb-2">📭</div>
      <div className="text-[13px] text-[#5A5955] font-medium mb-1">{msg}</div>
      <div className="text-[12px] text-[#9A9890]">{hint}</div>
    </div>
  );
}

function formatStableTs(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const t = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${t.getUTCFullYear()}/${pad(t.getUTCMonth() + 1)}/${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

function formatOffset(min: number): string {
  if (min === 0) return "立即";
  const abs = Math.abs(min);
  const sign = min < 0 ? "前" : "後";
  if (abs >= 1440) {
    const d = Math.floor(abs / 1440);
    const r = abs % 1440;
    return r === 0 ? `${d} 天${sign}` : `${d}d ${Math.floor(r / 60)}h ${sign}`;
  }
  if (abs >= 60) {
    return `${Math.floor(abs / 60)} 小時${sign}`;
  }
  return `${abs} 分${sign}`;
}

// ============================================================================
// Modal: 範本 編輯 / 新增
// ============================================================================

type SaveTemplatePayload = {
  id?: string;
  name: string;
  channel: NotifChannel;
  subject?: string | null;
  body_template: string;
  variables: TemplateVariable[];
  is_active: boolean;
};

const DEFAULT_VARIABLES: TemplateVariable[] = [
  { name: "customer_name", label: "車主姓名", example: "鄭宗勳" },
  { name: "vehicle_model", label: "車型", example: "PANIGALE V2" },
  { name: "plate_no", label: "車牌", example: "LGX-8096" },
  { name: "pickup_time", label: "取車時間", example: "2026-05-20 14:00" },
  { name: "ro_no", label: "工單號", example: "MN-CP-260519-002" },
];

function TemplateModal({
  initial,
  pending,
  onClose,
  onSave,
}: {
  initial: PickupNotificationTemplate | null;
  pending: boolean;
  onClose: () => void;
  onSave: (input: SaveTemplatePayload) => void;
}) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [channel, setChannel] = useState<NotifChannel>(initial?.channel ?? "line");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body_template ?? "");
  const [variables, setVariables] = useState<TemplateVariable[]>(
    initial?.variables?.length ? initial.variables : DEFAULT_VARIABLES,
  );
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function insertVariable(name: string) {
    const ta = textareaRef.current;
    if (!ta) {
      setBody((b) => `${b}{{${name}}}`);
      return;
    }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const next = `${body.slice(0, start)}{{${name}}}${body.slice(end)}`;
    setBody(next);
    setTimeout(() => {
      const pos = start + name.length + 4;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    }, 0);
  }

  function submit() {
    onSave({
      id: initial?.id,
      name: name.trim(),
      channel,
      subject: channel === "email" ? subject.trim() : null,
      body_template: body.trim(),
      variables,
      is_active: isActive,
    });
  }

  const bodyLen = body.length;
  const bodyMax = channel === "sms" ? 70 : channel === "line" ? 1000 : 5000;
  const overLimit = bodyLen > bodyMax;

  return (
    <ModalShell
      title={isEdit ? "編輯範本" : "新增範本"}
      onClose={onClose}
      width="800px"
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="範本名稱" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              placeholder="例：取車通知（LINE）"
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
            />
          </Field>
          <Field label="通道" required>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as NotifChannel)}
              disabled={pending}
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
            >
              <option value="line">LINE</option>
              <option value="sms">簡訊（SMS）</option>
              <option value="email">Email</option>
            </select>
          </Field>
        </div>

        {channel === "email" && (
          <Field label="主旨（Email）" required>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={pending}
              placeholder="例：【DUCATI 台北】您的愛車已完修，歡迎前來取車"
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
            />
          </Field>
        )}

        {/* 變數插入器 */}
        <Field label="可用變數（點擊插入到範本內容游標位置）">
          <div className="flex flex-wrap gap-1.5 p-2 bg-[#F8F7F4] border border-[#EEECE6] rounded">
            {variables.map((v) => (
              <button
                key={v.name}
                type="button"
                onClick={() => insertVariable(v.name)}
                disabled={pending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#85B7EB] text-[#185FA5] hover:bg-[#EAF4FB] disabled:opacity-50"
                title={v.example ? `示範值：${v.example}` : undefined}
              >
                + {`{{${v.name}}}`} {v.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-[#9A9890] mt-1">
            支援自訂變數：在範本內容直接輸入 <code>{`{{your_var}}`}</code> 即可
          </span>
        </Field>

        <Field label="範本內容" required>
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={pending}
            rows={8}
            placeholder="親愛的 {{customer_name}} 您好，您的 {{vehicle_model}}（{{plate_no}}）已完修⋯"
            className="w-full border border-[#D5D3CB] rounded p-2.5 text-[12.5px] font-mono leading-relaxed bg-[#F8F7F4] focus:bg-white focus:border-[#185FA5] focus:outline-none resize-y disabled:opacity-60"
          />
          <div className="flex items-center justify-between mt-1">
            <span className={`text-[11px] ${overLimit ? "text-[#CC0000] font-medium" : "text-[#9A9890]"}`}>
              {bodyLen} / {bodyMax} 字
              {channel === "sms" && "（單則 SMS 上限）"}
            </span>
            <label className="flex items-center gap-1.5 text-[11.5px] text-[#5A5955]">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={pending}
                className="accent-[#1A3A5C]"
              />
              啟用此範本
            </label>
          </div>
        </Field>
      </div>

      <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-[#EEECE6]">
        <button
          disabled={pending}
          onClick={onClose}
          className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
        >
          取消
        </button>
        <button
          disabled={pending || !name.trim() || !body.trim() || overLimit}
          onClick={submit}
          className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
        >
          {pending ? "儲存中⋯" : isEdit ? "儲存變更" : "建立範本"}
        </button>
      </div>
    </ModalShell>
  );
}

// ============================================================================
// Modal: 預覽
// ============================================================================

function PreviewModal({
  template,
  subject,
  body,
  onClose,
}: {
  template: PickupNotificationTemplate;
  subject: string | null;
  body: string;
  onClose: () => void;
}) {
  return (
    <ModalShell title={`預覽：${template.name}`} onClose={onClose} width="640px">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          套用示範變數：
          <span className="font-mono text-[#5A5955]">customer_name=鄭宗勳</span>
          <span className="font-mono text-[#5A5955]">vehicle_model=PANIGALE V2</span>
        </div>

        {subject && (
          <div>
            <div className="text-[11px] text-[#9A9890] mb-1">主旨</div>
            <div className="border border-[#EEECE6] rounded px-3 py-2 text-[12.5px] bg-[#F8F7F4]">
              {subject}
            </div>
          </div>
        )}

        <div>
          <div className="text-[11px] text-[#9A9890] mb-1">內容（{CHANNEL_LABEL[template.channel]}）</div>
          <div className="border border-[#EEECE6] rounded bg-[#F8F7F4] p-3 whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-[#2C2C2A] min-h-[120px]">
            {body}
          </div>
        </div>

        {template.channel === "line" && (
          <div className="bg-[#06C755] text-white text-[10px] px-2 py-0.5 rounded inline-block">
            LINE 預覽
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-[#EEECE6]">
        <button
          onClick={onClose}
          className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
        >
          關閉
        </button>
      </div>
    </ModalShell>
  );
}

// ============================================================================
// Modal: 測試發送
// ============================================================================

function TestSendModal({
  template,
  pending,
  onClose,
  onConfirm,
}: {
  template: PickupNotificationTemplate;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell title="派送測試訊息" onClose={onClose} width="480px">
      <div className="space-y-3 text-[12.5px] text-[#5A5955]">
        <p>
          將透過 <b>Notification Hub</b> 把「{template.name}」的測試訊息送到您目前登入帳號訂閱的
          IM 通道（LINE / Google Chat）。
        </p>
        <ul className="list-disc pl-5 text-[12px] text-[#9A9890] space-y-1">
          <li>事件代碼：<code className="font-mono">pickup_notification.test</code></li>
          <li>套用示範變數渲染後送出</li>
          <li>實際業務派送請由 SA 在工單頁手動觸發</li>
        </ul>
      </div>

      <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-[#EEECE6]">
        <button
          disabled={pending}
          onClick={onClose}
          className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
        >
          取消
        </button>
        <button
          disabled={pending}
          onClick={onConfirm}
          className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#185FA5] text-white hover:bg-[#0e4683] disabled:opacity-50"
        >
          {pending ? "派送中⋯" : "📤 派送測試"}
        </button>
      </div>
    </ModalShell>
  );
}

// ============================================================================
// Modal: 排程 編輯 / 新增
// ============================================================================

type SaveSchedulePayload = {
  id?: string;
  template_id: string;
  trigger_event: TriggerEvent;
  offset_minutes: number;
  target_role: TargetRole | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  is_active: boolean;
  node_kind: NodeKind | null;
  policy: NotifyPolicy;
};

function ScheduleModal({
  initial,
  templates,
  pending,
  onClose,
  onSave,
}: {
  initial: PickupNotificationSchedule | null;
  templates: PickupNotificationTemplate[];
  pending: boolean;
  onClose: () => void;
  onSave: (input: SaveSchedulePayload) => void;
}) {
  const isEdit = !!initial;
  const activeTemplates = templates.filter((t) => t.is_active);
  const [templateId, setTemplateId] = useState(initial?.template_id ?? activeTemplates[0]?.id ?? "");
  const [triggerEvent, setTriggerEvent] = useState<TriggerEvent>(
    initial?.trigger_event ?? "ro_completed",
  );
  const [offsetMinutes, setOffsetMinutes] = useState<number>(initial?.offset_minutes ?? 0);
  const [nodeKind, setNodeKind] = useState<NodeKind | "">(initial?.node_kind ?? "");
  const [policy, setPolicy] = useState<NotifyPolicy>(initial?.policy ?? "sa_decide");
  // 節點 2（安全相關追加）強制發送：policy 鎖 mandatory
  const nodeForced = nodeKindDef(nodeKind || null)?.forced ?? false;
  const effectivePolicy: NotifyPolicy = nodeForced ? "mandatory" : policy;
  const [targetRole, setTargetRole] = useState<TargetRole | "">(
    initial?.target_role ?? "customer",
  );
  const [quietStart, setQuietStart] = useState(initial?.quiet_hours_start?.slice(0, 5) ?? "22:00");
  const [quietEnd, setQuietEnd] = useState(initial?.quiet_hours_end?.slice(0, 5) ?? "08:00");
  const [useQuietHours, setUseQuietHours] = useState<boolean>(
    !!(initial?.quiet_hours_start && initial?.quiet_hours_end),
  );
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  function submit() {
    onSave({
      id: initial?.id,
      template_id: templateId,
      trigger_event: triggerEvent,
      offset_minutes: Number(offsetMinutes) || 0,
      target_role: (targetRole || null) as TargetRole | null,
      quiet_hours_start: useQuietHours ? `${quietStart}:00` : null,
      quiet_hours_end: useQuietHours ? `${quietEnd}:00` : null,
      is_active: isActive,
      node_kind: (nodeKind || null) as NodeKind | null,
      policy: effectivePolicy,
    });
  }

  return (
    <ModalShell title={isEdit ? "編輯排程" : "新增排程"} onClose={onClose} width="640px">
      <div className="space-y-3">
        <Field label="使用範本" required>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            disabled={pending}
            className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
          >
            {activeTemplates.length === 0 && <option value="">（尚無啟用中的範本）</option>}
            {activeTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {CHANNEL_LABEL[t.channel]} · {t.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="觸發事件" required>
            <select
              value={triggerEvent}
              onChange={(e) => setTriggerEvent(e.target.value as TriggerEvent)}
              disabled={pending}
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
            >
              <option value="ro_completed">{TRIGGER_LABEL.ro_completed}</option>
              <option value="pickup_24h_before">{TRIGGER_LABEL.pickup_24h_before}</option>
              <option value="pickup_2h_before">{TRIGGER_LABEL.pickup_2h_before}</option>
              <option value="pickup_overdue">{TRIGGER_LABEL.pickup_overdue}</option>
            </select>
          </Field>
          <Field label="偏移分鐘（負數=事件前）">
            <input
              type="number"
              step={1}
              value={offsetMinutes}
              onChange={(e) => setOffsetMinutes(Number(e.target.value))}
              disabled={pending}
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="維修流程節點">
            <select
              value={nodeKind}
              onChange={(e) => {
                const nk = e.target.value as NodeKind | "";
                setNodeKind(nk);
                // 切到強制節點 → policy 鎖 mandatory；切離 → 還原 sa_decide
                if (nodeKindDef(nk || null)?.forced) setPolicy("mandatory");
              }}
              disabled={pending}
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
            >
              <option value="">（不綁定流程節點）</option>
              {NODE_KIND_DEFS.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
            </select>
            {nodeKind && (
              <p className="text-[11px] text-[#9A9890] mt-1">{nodeKindDef(nodeKind)?.desc}</p>
            )}
          </Field>
          <Field label="發送政策（三態）">
            <select
              value={effectivePolicy}
              onChange={(e) => setPolicy(e.target.value as NotifyPolicy)}
              disabled={pending || nodeForced}
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none disabled:bg-[#F2F2F2]"
            >
              <option value="sa_decide">{POLICY_LABEL.sa_decide}</option>
              <option value="mandatory">{POLICY_LABEL.mandatory}</option>
              <option value="off">{POLICY_LABEL.off}</option>
            </select>
            {nodeForced && (
              <p className="text-[11px] text-[#CC0000] mt-1">
                ⚠️ 安全相關追加為強制發送，不可關閉。
              </p>
            )}
          </Field>
        </div>

        <Field label="收件對象">
          <select
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value as TargetRole | "")}
            disabled={pending}
            className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
          >
            <option value="">（未指定）</option>
            <option value="customer">車主</option>
            <option value="sa">服務顧問 SA</option>
            <option value="manager">店長 / 主管</option>
          </select>
        </Field>

        <Field label="安靜時段（此區間不發送）">
          <label className="flex items-center gap-1.5 text-[12px] text-[#5A5955]">
            <input
              type="checkbox"
              checked={useQuietHours}
              onChange={(e) => setUseQuietHours(e.target.checked)}
              disabled={pending}
              className="accent-[#1A3A5C]"
            />
            啟用安靜時段
          </label>
          {useQuietHours && (
            <div className="flex items-center gap-2 mt-1.5">
              <input
                type="time"
                value={quietStart}
                onChange={(e) => setQuietStart(e.target.value)}
                disabled={pending}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
              />
              <span className="text-[12px] text-[#9A9890]">~</span>
              <input
                type="time"
                value={quietEnd}
                onChange={(e) => setQuietEnd(e.target.value)}
                disabled={pending}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
              />
            </div>
          )}
        </Field>

        <label className="flex items-center gap-1.5 text-[12px] text-[#5A5955] pt-1">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={pending}
            className="accent-[#1A3A5C]"
          />
          啟用此排程
        </label>
      </div>

      <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-[#EEECE6]">
        <button
          disabled={pending}
          onClick={onClose}
          className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
        >
          取消
        </button>
        <button
          disabled={pending || !templateId}
          onClick={submit}
          className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
        >
          {pending ? "儲存中⋯" : isEdit ? "儲存變更" : "建立排程"}
        </button>
      </div>
    </ModalShell>
  );
}

// ============================================================================
// Modal shell + Field helper
// ============================================================================

function ModalShell({
  title,
  onClose,
  width = "640px",
  children,
}: {
  title: string;
  onClose: () => void;
  width?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center pt-[6vh] px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-h-[88vh] overflow-y-auto"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">{title}</h2>
          <button
            onClick={onClose}
            className="text-[#9A9890] hover:text-[#2C2C2A] text-[18px] leading-none"
            aria-label="關閉"
          >
            ×
          </button>
        </header>
        <div className="px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#9A9890] font-medium">
        {label} {required && <span className="text-[#CC0000]">*</span>}
      </label>
      {children}
    </div>
  );
}
