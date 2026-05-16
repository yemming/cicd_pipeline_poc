"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createCallTaskAction,
  deleteCallTaskAction,
  startCallTaskAction,
  updateCallTaskAction,
  type CallTaskInput,
} from "@/lib/sales/call-tasks-actions";
import {
  RESULT_LABEL,
  STATUS_BADGE,
  STATUS_LABEL,
  type CallTaskResult,
  type CallTaskStatus,
} from "@/domain/sales-call-tasks.constants";
import type {
  CallTaskDetail,
  CustomerLookup,
  SurveyLookup,
} from "@/domain/sales-call-tasks";
import type {
  SurveyKind,
  SurveyQuestion,
} from "@/domain/sales-survey-templates";

type Banner = { ok: boolean; msg: string } | null;
type TabKey = "survey" | "result" | "metadata";

const TABS: { key: TabKey; label: string }[] = [
  { key: "survey", label: "問卷填答" },
  { key: "result", label: "通話結果 / 備註" },
  { key: "metadata", label: "進階資訊" },
];

const KIND_LABEL: Record<SurveyKind, string> = {
  sales: "銷售電訪",
  aftersales: "售後電訪",
};

const STATUS_OPTIONS: { value: CallTaskStatus; label: string }[] = [
  { value: "pending", label: "待撥打" },
  { value: "in_progress", label: "進行中" },
  { value: "completed", label: "已完成" },
  { value: "skipped", label: "已跳過" },
];

const RESULT_OPTIONS: { value: CallTaskResult; label: string }[] = [
  { value: "answered", label: "接通" },
  { value: "no_answer", label: "未接" },
  { value: "refused", label: "拒絕" },
  { value: "wrong_number", label: "號碼錯誤" },
  { value: "callback_later", label: "稍後再撥" },
];

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return "—";
  }
}

function toLocalInput(s: string | null | undefined): string {
  if (!s) return "";
  // 轉成 yyyy-MM-ddTHH:mm 給 datetime-local
  try {
    const d = new Date(s);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function fromLocalInput(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const blankInput = (kind: SurveyKind): CallTaskInput => ({
  kind,
  customer_id: "",
  survey_template_id: null,
  assignee_id: null,
  scheduled_at: null,
  status: "pending",
  call_result: null,
  attempt_count: 0,
  last_attempt_at: null,
  answers: {},
  notes: null,
});

const fromTask = (t: CallTaskDetail): CallTaskInput => ({
  kind: t.kind,
  customer_id: t.customer_id,
  survey_template_id: t.survey_template_id,
  assignee_id: t.assignee_id,
  scheduled_at: t.scheduled_at,
  status: t.status,
  call_result: t.call_result,
  attempt_count: t.attempt_count,
  last_attempt_at: t.last_attempt_at,
  answers: t.answers,
  notes: t.notes,
});

export function CallTaskDetailView({
  task,
  canEdit,
  initialMode = "view",
  initialKind = "sales",
  customers,
  surveys,
  basePath = "/crm/sales/call-tasks",
}: {
  task: CallTaskDetail | null;
  canEdit: boolean;
  initialMode?: "view" | "create";
  initialKind?: SurveyKind;
  customers: CustomerLookup[];
  surveys: SurveyLookup[];
  basePath?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(initialMode === "create");
  const [activeTab, setActiveTab] = useState<TabKey>("survey");

  const [draft, setDraft] = useState<CallTaskInput>(
    task ? fromTask(task) : blankInput(initialKind),
  );
  const [createDraft, setCreateDraft] = useState<CallTaskInput>(
    blankInput(initialKind),
  );

  const showInputs = editing || creating;
  const formDraft = creating ? createDraft : draft;
  const setFormDraft = (next: CallTaskInput) => {
    if (creating) setCreateDraft(next);
    else setDraft(next);
  };

  const currentKind: SurveyKind = creating
    ? createDraft.kind
    : task?.kind ?? initialKind;

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  // ─── 顯示用 derived ───
  const customerLabel = useMemo(() => {
    if (!task) return "—";
    return task.customer_name ?? task.customer_code ?? "—";
  }, [task]);

  const filteredSurveys = useMemo(
    () => surveys, // 已經是當前 kind 的 active surveys
    [surveys],
  );

  // ─── handlers ───
  const save = () => {
    if (!task) return;
    startTransition(async () => {
      const res = await updateCallTaskAction(task.id, draft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存變更" });
        setEditing(false);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const cancelEdit = () => {
    if (task) setDraft(fromTask(task));
    setEditing(false);
  };

  const openCreate = () => {
    setEditing(false);
    setCreateDraft(blankInput(task?.kind ?? initialKind));
    setCreating(true);
  };

  const cancelCreate = () => {
    if (initialMode === "create") {
      router.push(
        `${basePath}?kind=${createDraft.kind ?? initialKind}`,
      );
    } else {
      setCreating(false);
    }
  };

  const submitCreate = () => {
    if (!createDraft.customer_id) {
      showBanner({ ok: false, msg: "請選擇客戶" });
      return;
    }
    startTransition(async () => {
      const res = await createCallTaskAction(createDraft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已新增任務，跳轉到任務詳情" });
        setCreating(false);
        router.push(`${basePath}/${res.data.id}`);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const startCall = () => {
    if (!task) return;
    startTransition(async () => {
      const res = await startCallTaskAction(task.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已開始撥打（+1 嘗試）" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const remove = () => {
    if (!task) return;
    if (
      !confirm(
        `確定刪除「${task.customer_code ?? "—"} ${task.customer_name ?? ""}」的電訪任務？\n此動作不可復原。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteCallTaskAction(task.id);
      if (res.ok) {
        router.push(`${basePath}?kind=${task.kind}`);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const inputClass =
    "h-[28px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] w-full";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const titleName = creating ? "（新增電訪任務）" : customerLabel;
  const titleCode = creating
    ? "新增任務"
    : task?.customer_code ?? task?.id.slice(0, 8) ?? "—";

  // ─── answer helpers（問卷填答） ───
  const answers = (formDraft.answers ?? {}) as Record<string, unknown>;
  const setAnswer = (qid: string, value: unknown) => {
    setFormDraft({
      ...formDraft,
      answers: { ...answers, [qid]: value },
    });
  };

  // 建立模式下 questions 從 createDraft.survey_template_id 對應的問卷取（但我們此時拿不到 questions 全文）→ 留待建立後到 detail 再填答
  const surveyQuestions: SurveyQuestion[] = !creating && task
    ? task.survey_questions
    : [];

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link
            href={`${basePath}?kind=${currentKind}`}
            className="hover:text-[#185FA5]"
          >
            {KIND_LABEL[currentKind]}工作檯
          </Link>
          <span>›</span>
          <span
            className="text-[#5A5955] font-mono"
            data-testid="call-task-breadcrumb-code"
          >
            {titleCode}
          </span>
          {editing ? (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-[#FDF3E3] text-[#854F0B] text-[11px]">
              編輯模式
            </span>
          ) : creating ? (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-[#FDF3E3] text-[#854F0B] text-[11px]">
              建立模式
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {editing && task ? (
            <>
              <button
                type="button"
                onClick={save}
                disabled={isPending || !canEdit}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {isPending ? "儲存中…" : "儲存變更"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] shadow-sm hover:border-[#9A9890]"
              >
                取消
              </button>
            </>
          ) : creating ? (
            <>
              <button
                type="button"
                onClick={cancelCreate}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] shadow-sm hover:border-[#9A9890] disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitCreate}
                disabled={isPending || !canEdit}
                data-testid="call-task-create-submit"
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {isPending ? "建立中…" : "建立並開啟"}
              </button>
            </>
          ) : task ? (
            <>
              <Link
                href={`${basePath}?kind=${task.kind}`}
                className="h-[30px] inline-flex items-center justify-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <button
                type="button"
                disabled={!canEdit || task.status === "completed"}
                onClick={startCall}
                data-testid="call-task-start-call-button"
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
                title="開始撥打（狀態改為進行中、+1 嘗試次數）"
              >
                撥打
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={openCreate}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                新增
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setEditing(true)}
                data-testid="call-task-edit-button"
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={remove}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                刪除
              </button>
            </>
          ) : null}
        </div>
      </div>

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
          role={banner.ok ? "status" : "alert"}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">
                {KIND_LABEL[currentKind]}任務
              </div>
              <h1
                className="text-[18px] font-semibold text-[#2C2C2A] leading-tight"
                data-testid="call-task-detail-title"
              >
                {titleName}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                {creating ? (
                  <>
                    <span className="text-[#9A9890]">—</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDF3E3] text-[#854F0B]">
                      尚未建立
                    </span>
                  </>
                ) : task ? (
                  <>
                    <span className="font-mono text-[#5A5955]">
                      {task.customer_code ?? "—"}
                    </span>
                    {task.customer_phone ? (
                      <a
                        href={`tel:${task.customer_phone}`}
                        className="font-mono text-[#185FA5] hover:underline"
                      >
                        {task.customer_phone}
                      </a>
                    ) : null}
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium"
                      style={{
                        backgroundColor: STATUS_BADGE[task.status].bg,
                        color: STATUS_BADGE[task.status].fg,
                      }}
                    >
                      {STATUS_LABEL[task.status]}
                    </span>
                    {task.call_result ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EEF4FB] text-[#185FA5]">
                        {RESULT_LABEL[task.call_result]}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EBF3FF] text-[#1A3A5C]">
                      已嘗試 {task.attempt_count} 次
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="shrink-0">
            <div className="w-[260px] h-[120px] border-2 border-dashed border-[#D5D3CB] rounded-lg bg-[#F8F7F4] flex items-center justify-center text-[12px] text-[#9A9890] text-center px-3">
              {creating
                ? "建立後可記錄通話備忘 / 客戶意向"
                : "（未來：通話錄音 / 客戶意向總結）"}
            </div>
          </div>
        </div>
      </header>

      {/* 基本資料 / 排程 */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${showInputs ? lockedClass : ""}`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 任務排程
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="客戶"
            value={
              showInputs ? (
                <select
                  value={formDraft.customer_id}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, customer_id: e.target.value })
                  }
                  className={inputClass}
                  data-testid="call-task-customer-select"
                >
                  <option value="">— 請選擇客戶 —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-medium">{customerLabel}</span>
              )
            }
          />
          <Kv
            label="問卷模板"
            value={
              showInputs ? (
                <select
                  value={formDraft.survey_template_id ?? ""}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      survey_template_id: e.target.value || null,
                    })
                  }
                  className={inputClass}
                  data-testid="call-task-survey-select"
                >
                  <option value="">— 不指定問卷 —</option>
                  {filteredSurveys.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span>
                  {task?.survey_code ? (
                    <>
                      <span className="font-mono text-[11.5px] text-[#185FA5] mr-1">
                        {task.survey_code}
                      </span>
                      <span>{task.survey_name}</span>
                    </>
                  ) : (
                    <span className="text-[#9A9890]">未指定</span>
                  )}
                </span>
              )
            }
          />
          <Kv
            label="任務類型"
            value={
              creating ? (
                <select
                  value={formDraft.kind}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      kind: e.target.value as SurveyKind,
                    })
                  }
                  className={inputClass}
                >
                  <option value="sales">銷售電訪</option>
                  <option value="aftersales">售後電訪</option>
                </select>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EEF4FB] text-[#185FA5]">
                  {KIND_LABEL[task?.kind ?? initialKind]}
                </span>
              )
            }
          />
          <Kv
            label="預定撥打時間"
            value={
              showInputs ? (
                <input
                  type="datetime-local"
                  value={toLocalInput(formDraft.scheduled_at)}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      scheduled_at: fromLocalInput(e.target.value),
                    })
                  }
                  className={inputClass}
                  data-testid="call-task-scheduled-input"
                />
              ) : (
                <span className="font-mono text-[11.5px]">
                  {fmtDateTime(task?.scheduled_at)}
                </span>
              )
            }
          />
          <Kv
            label="狀態"
            value={
              showInputs ? (
                <select
                  value={formDraft.status ?? "pending"}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      status: e.target.value as CallTaskStatus,
                    })
                  }
                  className={inputClass}
                  data-testid="call-task-status-select"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : task ? (
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium"
                  style={{
                    backgroundColor: STATUS_BADGE[task.status].bg,
                    color: STATUS_BADGE[task.status].fg,
                  }}
                >
                  {STATUS_LABEL[task.status]}
                </span>
              ) : (
                "—"
              )
            }
          />
          <Kv
            label="嘗試次數"
            value={
              showInputs ? (
                <input
                  type="number"
                  min={0}
                  value={formDraft.attempt_count ?? 0}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      attempt_count: Math.max(
                        0,
                        Number.parseInt(e.target.value, 10) || 0,
                      ),
                    })
                  }
                  className={inputClass}
                />
              ) : (
                <span className="font-mono">{task?.attempt_count ?? 0}</span>
              )
            }
          />
          {!creating && task ? (
            <>
              <Kv
                label="最後嘗試"
                value={fmtDateTime(task.last_attempt_at)}
                mono
                small
              />
              <Kv
                label="建立時間"
                value={fmtDateTime(task.created_at)}
                mono
                small
              />
              <Kv
                label="最後更新"
                value={fmtDateTime(task.updated_at)}
                mono
                small
              />
            </>
          ) : null}
        </div>
      </section>

      {creating ? (
        <p className="text-[12px] text-[#9A9890] leading-relaxed">
          建立後將跳轉到該任務的詳情頁，可填問卷答案、記錄通話結果與備註。
        </p>
      ) : null}

      {/* Tabs（view / edit 顯示） */}
      {!creating && task ? (
        <>
          <div
            className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto"
            id="tab-content"
          >
            <div className="flex border-b border-[#EEECE6]">
              {TABS.map((t) => {
                const active = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                    className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] last:border-r-0 ${
                      active
                        ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                        : "text-[#5A5955] hover:bg-[#F8F7F4]"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
            {activeTab === "survey" ? (
              <SectionCard title={`問卷填答（${surveyQuestions.length} 題）`}>
                {!task.survey_template_id ? (
                  <div className="text-[12px] text-[#9A9890] py-3">
                    本任務尚未指定問卷模板。點上方「修改」可選擇要套用的問卷。
                  </div>
                ) : surveyQuestions.length === 0 ? (
                  <div className="text-[12px] text-[#9A9890] py-3">
                    此問卷模板尚無題目。請先到「
                    <Link
                      href={`/crm/sales/survey-templates/${task.survey_template_id}`}
                      className="text-[#185FA5] hover:underline"
                    >
                      問卷編輯
                    </Link>
                    」補題。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {surveyQuestions.map((q, idx) => (
                      <AnswerRow
                        key={q.id}
                        idx={idx}
                        q={q}
                        value={answers[q.id]}
                        editing={editing}
                        onChange={(v) => setAnswer(q.id, v)}
                      />
                    ))}
                  </div>
                )}
              </SectionCard>
            ) : null}

            {activeTab === "result" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SectionCard title="通話結果">
                  <div className="grid grid-cols-1 gap-3">
                    <Kv
                      label="撥打結果"
                      value={
                        showInputs ? (
                          <select
                            value={formDraft.call_result ?? ""}
                            onChange={(e) =>
                              setFormDraft({
                                ...formDraft,
                                call_result:
                                  (e.target.value as CallTaskResult) || null,
                              })
                            }
                            className={inputClass}
                            data-testid="call-task-result-select"
                          >
                            <option value="">— 尚未設定 —</option>
                            {RESULT_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : task.call_result ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EEF4FB] text-[#185FA5]">
                            {RESULT_LABEL[task.call_result]}
                          </span>
                        ) : (
                          <span className="text-[#9A9890]">尚未設定</span>
                        )
                      }
                    />
                    <Kv
                      label="最後嘗試時間"
                      value={
                        showInputs ? (
                          <input
                            type="datetime-local"
                            value={toLocalInput(formDraft.last_attempt_at)}
                            onChange={(e) =>
                              setFormDraft({
                                ...formDraft,
                                last_attempt_at: fromLocalInput(e.target.value),
                              })
                            }
                            className={inputClass}
                          />
                        ) : (
                          <span className="font-mono text-[11.5px]">
                            {fmtDateTime(task.last_attempt_at)}
                          </span>
                        )
                      }
                    />
                  </div>
                </SectionCard>
                <SectionCard title="備註">
                  {showInputs ? (
                    <textarea
                      value={formDraft.notes ?? ""}
                      onChange={(e) =>
                        setFormDraft({ ...formDraft, notes: e.target.value })
                      }
                      rows={5}
                      placeholder="撥打時的觀察、客戶語氣、後續追蹤事項..."
                      className="w-full border border-[#D5D3CB] rounded p-2 text-[12.5px] outline-none focus:border-[#185FA5]"
                      data-testid="call-task-notes-input"
                    />
                  ) : task.notes ? (
                    <p className="text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap leading-relaxed">
                      {task.notes}
                    </p>
                  ) : (
                    <div className="text-[12px] text-[#9A9890]">尚無備註</div>
                  )}
                </SectionCard>
              </div>
            ) : null}

            {activeTab === "metadata" ? (
              <SectionCard title="進階資訊">
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-[12.5px]">
                  <Kv
                    label="任務 ID"
                    value={
                      <span className="font-mono text-[11.5px]">{task.id}</span>
                    }
                    small
                  />
                  <Kv
                    label="品牌"
                    value={<span className="font-mono">{task.brand_id}</span>}
                    small
                    mono
                  />
                  <Kv
                    label="客戶 email"
                    value={task.customer_email ?? "—"}
                    small
                  />
                  <Kv
                    label="客戶類型"
                    value={task.customer_type ?? "—"}
                    small
                  />
                </dl>
              </SectionCard>
            ) : null}
          </div>
        </>
      ) : null}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// AnswerRow — 單題答題
// ──────────────────────────────────────────────────────────────────────────

const QUESTION_TYPE_LABEL: Record<SurveyQuestion["type"], string> = {
  single: "單選",
  multi: "複選",
  rating: "評分",
  text: "文字",
};

function AnswerRow({
  idx,
  q,
  value,
  editing,
  onChange,
}: {
  idx: number;
  q: SurveyQuestion;
  value: unknown;
  editing: boolean;
  onChange: (v: unknown) => void;
}) {
  const options = q.options ?? [];

  const renderAnswerView = () => {
    if (q.type === "multi") {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return arr.length > 0 ? arr.join(" / ") : "—";
    }
    if (value == null || value === "") return "—";
    return String(value);
  };

  return (
    <div className="border border-[#EEECE6] rounded p-3 bg-[#FAFAF8]">
      <div className="flex items-start gap-2">
        <span className="font-mono text-[11px] text-[#9A9890] mt-0.5">
          Q{idx + 1}
        </span>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="text-[12.5px] text-[#2C2C2A]">
            {q.label || "（未命名題目）"}
            <span className="inline-flex items-center ml-2 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EEF4FB] text-[#185FA5]">
              {QUESTION_TYPE_LABEL[q.type]}
            </span>
            {q.required ? (
              <span className="inline-flex items-center ml-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDECEA] text-[#CC0000]">
                必填
              </span>
            ) : null}
          </div>

          {editing ? (
            q.type === "single" ? (
              <div className="flex flex-wrap gap-2">
                {options.map((opt) => (
                  <label
                    key={opt}
                    className="inline-flex items-center gap-1 text-[12.5px]"
                  >
                    <input
                      type="radio"
                      name={q.id}
                      value={opt}
                      checked={value === opt}
                      onChange={() => onChange(opt)}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            ) : q.type === "multi" ? (
              <div className="flex flex-wrap gap-2">
                {options.map((opt) => {
                  const arr = Array.isArray(value) ? (value as string[]) : [];
                  const checked = arr.includes(opt);
                  return (
                    <label
                      key={opt}
                      className="inline-flex items-center gap-1 text-[12.5px]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? arr.filter((x) => x !== opt)
                            : [...arr, opt];
                          onChange(next);
                        }}
                      />
                      {opt}
                    </label>
                  );
                })}
              </div>
            ) : q.type === "rating" ? (
              <div className="flex flex-wrap gap-1">
                {options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onChange(opt)}
                    className={`h-[28px] px-3 rounded border text-[12px] ${
                      value === opt
                        ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                        : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <textarea
                value={typeof value === "string" ? value : ""}
                onChange={(e) => onChange(e.target.value)}
                rows={2}
                placeholder="輸入客戶回答..."
                className="w-full border border-[#D5D3CB] rounded p-2 text-[12.5px] outline-none focus:border-[#185FA5]"
              />
            )
          ) : (
            <div className="text-[12.5px] text-[#5A5955]">
              <span className="text-[#9A9890]">答案：</span>
              <span className="font-medium text-[#2C2C2A]">
                {renderAnswerView()}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kv({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div
        className={`text-[12.5px] ${mono ? "font-mono" : ""} ${
          small ? "text-[11.5px] text-[#5A5955]" : "text-[#2C2C2A]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}
