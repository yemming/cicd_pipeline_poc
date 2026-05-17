"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  archiveSurveyVersionAction,
  createSurveyTemplateAction,
  deleteSurveyTemplateAction,
  reorderQuestionsAction,
  restoreSurveyVersionAction,
  saveAsNewSurveyVersionAction,
  setSurveyTemplateActiveAction,
  updateSurveyMetadataAction,
  updateSurveySaScriptAction,
  updateSurveyTemplateAction,
  type SurveyTemplateInput,
} from "@/lib/sales/survey-templates-actions";
import {
  APPLICABLE_TIMING_ICON,
  APPLICABLE_TIMING_LABEL,
  QUESTION_TYPE_DESC,
  QUESTION_TYPE_ICON,
  QUESTION_TYPE_LABEL,
  QUESTION_TYPES,
  SURVEY_HABC_ICON,
  SURVEY_HABC_LABEL,
  SURVEY_HABC_TARGETS,
  SURVEY_STATUS_BADGE_CLS,
  SURVEY_STATUS_LABEL,
  readSurveyHabc,
  readSurveySaScript,
  readSurveyStatus,
  readSurveyTiming,
  readSurveyVersions,
  timingOrderFor,
  type ApplicableTiming,
  type SurveyHabcTarget,
  type SurveyKind,
  type SurveyMetadata,
  type SurveyQuestion,
  type SurveyQuestionType,
  type SurveyTemplateRow,
} from "@/domain/sales-survey-templates.constants";

type Banner = { ok: boolean; msg: string } | null;
type TabKey = "questions" | "metadata";

const TABS: { key: TabKey; label: string }[] = [
  { key: "questions", label: "題目編輯" },
  { key: "metadata", label: "進階設定" },
];

const KIND_LABEL: Record<SurveyKind, string> = {
  sales: "銷售電訪",
  aftersales: "售後電訪",
};

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return "—";
  }
}

const blankInput = (kind: SurveyKind): SurveyTemplateInput => ({
  code: "",
  name: "",
  kind,
  description: "",
  target_segment: "",
  questions: [],
  effective_from: "",
  effective_to: "",
  is_active: true,
  metadata: {
    applicable_timing:
      kind === "aftersales" ? "d3_satisfaction" : "deal_followup",
    target_habc: ["H", "A", "B"],
    status: "draft",
    sa_script: "",
  },
});

const fromSurvey = (s: SurveyTemplateRow): SurveyTemplateInput => ({
  code: s.code,
  name: s.name,
  kind: s.kind,
  description: s.description ?? "",
  target_segment: s.target_segment ?? "",
  questions: s.questions,
  effective_from: s.effective_from ?? "",
  effective_to: s.effective_to ?? "",
  is_active: s.is_active,
  metadata: s.metadata ?? {},
});

// newQuestion 已被 AddQuestionModal 取代（v2 起所有新題目走 modal）。
// 保留型別 import 給 modal 使用。

export function SurveyTemplateDetailView({
  survey,
  canEdit,
  initialMode = "view",
  initialKind = "sales",
  basePath = "/crm/sales/survey-templates",
}: {
  survey: SurveyTemplateRow | null;
  canEdit: boolean;
  initialMode?: "view" | "create";
  initialKind?: SurveyKind;
  /** 路徑前綴；sales 走預設值、aftersales 傳 "/crm/aftersales/survey-templates" */
  basePath?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(initialMode === "create");
  const [activeTab, setActiveTab] = useState<TabKey>("questions");
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const initialDraft: SurveyTemplateInput = survey
    ? fromSurvey(survey)
    : blankInput(initialKind);

  const [draft, setDraft] = useState<SurveyTemplateInput>(initialDraft);
  const [createDraft, setCreateDraft] = useState<SurveyTemplateInput>(
    blankInput(initialKind),
  );

  const showInputs = editing || creating;
  const formDraft = creating ? createDraft : draft;
  const setFormDraft = (next: SurveyTemplateInput) => {
    if (creating) setCreateDraft(next);
    else setDraft(next);
  };

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const save = () => {
    if (!survey) return;
    startTransition(async () => {
      const res = await updateSurveyTemplateAction(survey.id, draft);
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
    if (survey) setDraft(fromSurvey(survey));
    setEditing(false);
  };

  const toggleActive = () => {
    if (!survey) return;
    startTransition(async () => {
      const res = await setSurveyTemplateActiveAction(
        survey.id,
        !survey.is_active,
      );
      if (res.ok) {
        showBanner({
          ok: true,
          msg: survey.is_active ? "✓ 已停用" : "✓ 已啟用",
        });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const openCreate = () => {
    setEditing(false);
    setCreateDraft(blankInput(survey?.kind ?? initialKind));
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
    startTransition(async () => {
      const res = await createSurveyTemplateAction(createDraft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已新增問卷，跳轉到新模板" });
        setCreating(false);
        router.push(`${basePath}/${res.data.id}`);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const remove = () => {
    if (!survey) return;
    if (
      !confirm(
        `確定刪除「${survey.code} ${survey.name}」？\n此動作不可復原；若已被電訪紀錄引用會失敗，建議改用「停用」保留歷史。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteSurveyTemplateAction(survey.id);
      if (res.ok) {
        router.push(`${basePath}?kind=${survey.kind}`);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const inputClass =
    "h-[28px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] w-full";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const titleName = creating ? "（新增問卷）" : survey?.name ?? "—";
  const titleCode = creating ? "新增問卷" : survey?.code ?? "—";
  const currentKind: SurveyKind = creating
    ? createDraft.kind
    : survey?.kind ?? initialKind;

  // ── 題目操作 helpers ──
  const updateQuestion = (idx: number, patch: Partial<SurveyQuestion>) => {
    const next = [...formDraft.questions];
    next[idx] = { ...next[idx], ...patch };
    setFormDraft({ ...formDraft, questions: next });
  };
  const appendQuestion = (q: SurveyQuestion) => {
    setFormDraft({ ...formDraft, questions: [...formDraft.questions, q] });
  };
  const removeQuestion = (idx: number) => {
    const next = [...formDraft.questions];
    next.splice(idx, 1);
    setFormDraft({ ...formDraft, questions: next });
  };

  // 拖曳重排（dnd-kit）。view 模式也允許拖、立即打 server action 樂觀更新。
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = formDraft.questions.findIndex((q) => q.id === active.id);
    const newIdx = formDraft.questions.findIndex((q) => q.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(formDraft.questions, oldIdx, newIdx);
    setFormDraft({ ...formDraft, questions: reordered });
    // view 模式（非 editing/creating）拖曳：直接寫回後端
    if (!showInputs && survey) {
      startTransition(async () => {
        const res = await reorderQuestionsAction(
          survey.id,
          reordered.map((q) => q.id),
        );
        if (res.ok) {
          showBanner({ ok: true, msg: "✓ 已更新題序" });
          router.refresh();
        } else {
          // rollback
          setFormDraft({ ...formDraft, questions: survey.questions });
          showBanner({ ok: false, msg: res.error });
        }
      });
    }
  };

  // metadata 操作（HABC chip toggle / 適用時機 select）— edit 模式存在 draft；view 模式直接打 action
  const updateMetadata = (patch: Partial<SurveyMetadata>) => {
    const merged: SurveyMetadata = { ...(formDraft.metadata ?? {}), ...patch };
    setFormDraft({ ...formDraft, metadata: merged });
    if (!showInputs && survey) {
      startTransition(async () => {
        const res = await updateSurveyMetadataAction(survey.id, patch);
        if (res.ok) {
          showBanner({ ok: true, msg: "✓ 已更新適用設定" });
          router.refresh();
        } else {
          showBanner({ ok: false, msg: res.error });
        }
      });
    }
  };

  const toggleHabc = (g: SurveyHabcTarget) => {
    const cur = readSurveyHabc(formDraft.metadata);
    const next = cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g];
    updateMetadata({ target_habc: next });
  };

  const archiveVersion = () => {
    if (!survey) return;
    const note = prompt(
      "為新版本寫一段變更說明（會留在版本記錄裡）：",
      "封存當前版本、開啟新草稿",
    );
    if (note === null) return; // 使用者按取消
    startTransition(async () => {
      const res = await archiveSurveyVersionAction(survey.id, note);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已封存版本、新草稿已開啟" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  /** 另存新版（CRM02B spec § 版本記錄 - 另存新版本 button） */
  const saveAsNewVersion = () => {
    if (!survey) return;
    const note = prompt(
      "為新版寫一段變更說明（會留在版本記錄裡）：",
      "另存為新版草稿",
    );
    if (note === null) return;
    startTransition(async () => {
      const res = await saveAsNewSurveyVersionAction(survey.id, note);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已另存為新版草稿" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  /** 還原指定版本（CRM02B spec § 版本記錄 - 還原此版 button） */
  const restoreVersion = (versionLabel: string) => {
    if (!survey) return;
    if (
      !confirm(
        `確定要把問卷還原回 ${versionLabel} 嗎？\n還原後：\n- 題目與 SA 話術會回到 ${versionLabel} 當時的內容\n- 問卷狀態會切回「草稿」（請 review 後再啟用）\n- 當前版本會自動封存、保留快照`,
      )
    )
      return;
    startTransition(async () => {
      const res = await restoreSurveyVersionAction(survey.id, versionLabel);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已還原至 ${versionLabel}（草稿）` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  /** SA 建議話術 - blur 後存（CRM02B spec § script-editor） */
  const [saScriptDraft, setSaScriptDraft] = useState<string>(
    readSurveySaScript(survey?.metadata ?? null),
  );
  const saScriptOriginal = readSurveySaScript(survey?.metadata ?? null);
  const saScriptDirty = saScriptDraft !== saScriptOriginal;
  const saveSaScript = () => {
    if (!survey || !saScriptDirty) return;
    startTransition(async () => {
      const res = await updateSurveySaScriptAction(survey.id, saScriptDraft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存 SA 建議話術" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const currentMetadata = formDraft.metadata ?? survey?.metadata ?? {};
  const currentHabc = readSurveyHabc(currentMetadata);
  const currentTiming = readSurveyTiming(currentMetadata);
  const currentStatus = readSurveyStatus(currentMetadata);
  const currentVersions = readSurveyVersions(currentMetadata);

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link
            href={`${basePath}?kind=${currentKind}`}
            className="hover:text-[#185FA5]"
          >
            {KIND_LABEL[currentKind]}問卷
          </Link>
          <span>›</span>
          <span
            className={`text-[#5A5955] ${creating ? "" : "font-mono"}`}
            data-testid="survey-template-breadcrumb-code"
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
          {editing && survey ? (
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
                data-testid="survey-template-create-submit"
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {isPending ? "建立中…" : "建立並開啟"}
              </button>
            </>
          ) : survey ? (
            <>
              <Link
                href={`${basePath}?kind=${survey.kind}`}
                className="h-[30px] inline-flex items-center justify-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
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
                data-testid="survey-template-edit-button"
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
              <button
                type="button"
                disabled={!canEdit}
                onClick={toggleActive}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                {survey.is_active ? "停用" : "啟用"}
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
                {KIND_LABEL[currentKind]}問卷模板
              </div>
              <h1
                className="text-[18px] font-semibold text-[#2C2C2A] leading-tight"
                data-testid="survey-template-detail-title"
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
                ) : survey ? (
                  <>
                    <span className="font-mono text-[#5A5955]">
                      {survey.code}
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EEF4FB] text-[#185FA5]">
                      {KIND_LABEL[survey.kind]}
                    </span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${SURVEY_STATUS_BADGE_CLS[currentStatus]}`}
                      data-testid="survey-status-chip"
                    >
                      {SURVEY_STATUS_LABEL[currentStatus]}
                    </span>
                    {currentTiming ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EAF4FB] text-[#185FA5]">
                        🎯 {APPLICABLE_TIMING_LABEL[currentTiming]}
                      </span>
                    ) : null}
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${survey.is_active ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#F2F2F2] text-[#6B6A68]"}`}
                    >
                      {survey.is_active ? "is_active=true" : "is_active=false"}
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EBF3FF] text-[#1A3A5C]">
                      {survey.questions.length} 題
                    </span>
                    {currentVersions[0] ? (
                      <span className="font-mono text-[11px] text-[#9A9890]">
                        · {currentVersions[0].ver}
                      </span>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="shrink-0">
            <div className="w-[260px] h-[120px] border-2 border-dashed border-[#D5D3CB] rounded-lg bg-[#F8F7F4] flex items-center justify-center text-[12px] text-[#9A9890] text-center px-3">
              {creating ? "建立後可上傳示意圖" : "（未來：問卷封面 / 示意圖）"}
            </div>
          </div>
        </div>
      </header>

      {/* 基本資料 */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${showInputs ? lockedClass : ""}`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 基本資料
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="問卷代碼"
            value={
              showInputs ? (
                <input
                  value={formDraft.code ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, code: e.target.value })
                  }
                  placeholder={
                    creating ? "留空自動產生 SST001..." : "例：SST001"
                  }
                  className={inputClass}
                  disabled={creating ? false : !canEdit}
                />
              ) : (
                <span className="font-mono font-semibold">{survey?.code}</span>
              )
            }
          />
          <Kv
            label="問卷名稱"
            value={
              showInputs ? (
                <input
                  value={formDraft.name}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, name: e.target.value })
                  }
                  placeholder="例：新車交車後 7 日滿意度"
                  className={inputClass}
                  data-testid="survey-template-name-input"
                />
              ) : (
                <span className="font-medium">{survey?.name}</span>
              )
            }
          />
          <Kv
            label="類型"
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
                  {KIND_LABEL[survey?.kind ?? initialKind]}
                </span>
              )
            }
          />
          <Kv
            label="適用客戶區段"
            value={
              showInputs ? (
                <input
                  value={formDraft.target_segment ?? ""}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      target_segment: e.target.value,
                    })
                  }
                  placeholder="例：新車車主 / VIP / 全部"
                  className={inputClass}
                  data-testid="survey-template-segment-input"
                />
              ) : (
                survey?.target_segment ?? "全部"
              )
            }
          />
          <Kv
            label="生效起算日"
            value={
              showInputs ? (
                <input
                  type="date"
                  value={formDraft.effective_from ?? ""}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      effective_from: e.target.value,
                    })
                  }
                  className={inputClass}
                />
              ) : (
                <span className="font-mono text-[11.5px]">
                  {survey?.effective_from ?? "—"}
                </span>
              )
            }
          />
          <Kv
            label="終止日"
            value={
              showInputs ? (
                <input
                  type="date"
                  value={formDraft.effective_to ?? ""}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      effective_to: e.target.value,
                    })
                  }
                  className={inputClass}
                />
              ) : (
                <span className="font-mono text-[11.5px]">
                  {survey?.effective_to ?? "—"}
                </span>
              )
            }
          />
          {!creating && survey ? (
            <>
              <Kv
                label="建立時間"
                value={fmtDateTime(survey.created_at)}
                mono
                small
              />
              <Kv
                label="最後更新"
                value={fmtDateTime(survey.updated_at)}
                mono
                small
              />
            </>
          ) : null}
        </div>
      </section>

      {/* 描述 */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${showInputs ? lockedClass : ""}`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 問卷說明
          </span>
        </header>
        <div className="px-4 py-3">
          {showInputs ? (
            <textarea
              value={formDraft.description ?? ""}
              onChange={(e) =>
                setFormDraft({ ...formDraft, description: e.target.value })
              }
              rows={3}
              placeholder="這份問卷的用途、撥打時機、注意事項..."
              className="w-full border border-[#D5D3CB] rounded p-2 text-[12.5px] outline-none focus:border-[#185FA5]"
            />
          ) : survey?.description ? (
            <p className="text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap leading-relaxed">
              {survey.description}
            </p>
          ) : (
            <div className="text-[12px] text-[#9A9890]">尚無說明</div>
          )}
        </div>
      </section>

      {creating ? (
        <p className="text-[12px] text-[#9A9890] leading-relaxed">
          建立後將跳轉到該問卷的詳情頁，可進一步增刪題目、調整生效區間。
        </p>
      ) : null}

      {/* Tabs（只在 view / edit 既有問卷時顯示） */}
      {!creating && survey ? (
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
            {activeTab === "questions" ? (
              <>
                {/* SA 建議話術編輯器 — CRM02B spec § script-editor（深藍底）
                    aftersales 才顯示；sales 側暫不需要這個 feature */}
                {currentKind === "aftersales" ? (
                  <SectionCard
                    title="▼ 🎙️ SA 建議話術腳本"
                    right={
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-[#9A9890]">
                          顯示於 CRM03B 電訪工作台
                        </span>
                        <button
                          type="button"
                          onClick={saveSaScript}
                          disabled={!canEdit || isPending || !saScriptDirty}
                          data-testid="survey-sa-script-save"
                          className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                        >
                          {isPending ? "儲存中…" : saScriptDirty ? "💾 儲存話術" : "✓ 已儲存"}
                        </button>
                      </div>
                    }
                  >
                    <div className="rounded-lg bg-[#1A3A5C] p-3.5">
                      <div className="text-[9.5px] font-bold tracking-wider text-white/50 mb-1.5 uppercase">
                        SA 電訪話術腳本
                      </div>
                      <textarea
                        value={saScriptDraft}
                        onChange={(e) => setSaScriptDraft(e.target.value)}
                        onBlur={saveSaScript}
                        disabled={!canEdit || isPending}
                        rows={4}
                        placeholder="輸入建議話術，SA 在 CRM03B 電訪時可直接參照此腳本..."
                        data-testid="survey-sa-script-textarea"
                        className="w-full bg-white/10 border border-white/15 rounded-md px-3 py-2 text-white text-[12.5px] leading-[1.8] outline-none focus:border-white/35 placeholder:text-white/35 resize-y min-h-[80px] disabled:opacity-60 font-mono"
                      />
                      <div className="text-[10.5px] text-white/40 mt-1.5">
                        ＊話術將同步顯示於 CRM03B 電訪工作台的建議話術欄位
                      </div>
                    </div>
                  </SectionCard>
                ) : null}

                {/* HABC 對象 chip grid + 適用時機 + 狀態（題目編輯展開面板 - spec 要求） */}
                <SectionCard title="▼ 適用對象與時機">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-[#9A9890] font-medium">
                        適用時機
                      </label>
                      <select
                        value={currentTiming ?? ""}
                        onChange={(e) =>
                          updateMetadata({
                            applicable_timing:
                              (e.target.value as ApplicableTiming) || null,
                          })
                        }
                        disabled={!canEdit || isPending}
                        className="mt-1 h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] outline-none focus:border-[#185FA5] disabled:opacity-60"
                        data-testid="survey-timing-select"
                      >
                        <option value="">— 未指定 —</option>
                        {timingOrderFor(currentKind).map((t) => (
                          <option key={t} value={t}>
                            {APPLICABLE_TIMING_ICON[t]} {APPLICABLE_TIMING_LABEL[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-[#9A9890] font-medium">
                        問卷狀態
                      </label>
                      <select
                        value={currentStatus}
                        onChange={(e) =>
                          updateMetadata({
                            status: e.target.value as
                              | "active"
                              | "draft"
                              | "archived",
                          })
                        }
                        disabled={!canEdit || isPending}
                        className="mt-1 h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] outline-none focus:border-[#185FA5] disabled:opacity-60"
                        data-testid="survey-status-select"
                      >
                        <option value="draft">草稿</option>
                        <option value="active">啟用中</option>
                        <option value="archived">已封存</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="text-[11px] text-[#9A9890] font-medium">
                      適用 HABC 對象（可多選）
                    </label>
                    <div
                      className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-1.5"
                      data-testid="survey-habc-chip-grid"
                    >
                      {SURVEY_HABC_TARGETS.map((g) => {
                        const selected = currentHabc.includes(g);
                        return (
                          <button
                            key={g}
                            type="button"
                            onClick={() => toggleHabc(g)}
                            disabled={!canEdit || isPending}
                            className={`h-[40px] px-3 rounded border text-[12px] flex items-center gap-1.5 disabled:opacity-60 ${
                              selected
                                ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                                : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                            }`}
                            aria-pressed={selected}
                          >
                            <span>{SURVEY_HABC_ICON[g]}</span>
                            <span>{SURVEY_HABC_LABEL[g]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title={`▼ 題目清單（${formDraft.questions.length}） · 拖曳調整題序`}
                  right={
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowAddQuestion(true)}
                        disabled={!canEdit}
                        data-testid="survey-add-question-button"
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                      >
                        ＋ 新增題目
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowVersions(true)}
                        data-testid="survey-version-panel-open"
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                      >
                        📋 版本記錄
                      </button>
                      <button
                        type="button"
                        onClick={saveAsNewVersion}
                        disabled={!canEdit || isPending}
                        data-testid="survey-save-as-new-version"
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#185FA5] text-white hover:bg-[#0F4A85] disabled:opacity-50"
                      >
                        💾 另存新版
                      </button>
                      <button
                        type="button"
                        onClick={archiveVersion}
                        disabled={!canEdit || isPending}
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                      >
                        📦 封存當前版本
                      </button>
                    </div>
                  }
                >
                  {formDraft.questions.length === 0 ? (
                    <div className="text-[12px] text-[#9A9890] py-3">
                      尚無題目。點右上「＋ 新增題目」開始建立。
                    </div>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={onDragEnd}
                    >
                      <SortableContext
                        items={formDraft.questions.map((q) => q.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {formDraft.questions.map((q, idx) => (
                            <QuestionRow
                              key={q.id}
                              idx={idx}
                              q={q}
                              editing={showInputs}
                              onChange={(patch) => updateQuestion(idx, patch)}
                              onRemove={() => removeQuestion(idx)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </SectionCard>
              </>
            ) : null}

            {activeTab === "metadata" ? (
              <SectionCard title="進階設定">
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-[12.5px]">
                  <Kv label="問卷 ID" value={<span className="font-mono text-[11.5px]">{survey.id}</span>} small />
                  <Kv label="品牌" value={<span className="font-mono">{survey.brand_id}</span>} small mono />
                  <Kv
                    label="metadata（jsonb 鍵列表）"
                    value={
                      <code className="text-[11px] text-[#5A5955]">
                        {Object.keys(survey.metadata ?? {}).length === 0
                          ? "（無自訂 metadata）"
                          : Object.keys(survey.metadata ?? {}).join(" · ")}
                      </code>
                    }
                    small
                  />
                  <Kv
                    label="版本數"
                    value={
                      <span className="font-mono">
                        {currentVersions.length}
                      </span>
                    }
                    small
                  />
                </dl>
              </SectionCard>
            ) : null}
          </div>
        </>
      ) : null}

      {/* 建立模式：題目編輯器同樣顯示在主畫面 */}
      {creating ? (
        <SectionCard
          title={`題目清單（${createDraft.questions.length}）`}
          right={
            <button
              type="button"
              onClick={() => setShowAddQuestion(true)}
              data-testid="survey-add-question-button-create"
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#0F6E56] text-white hover:bg-[#0a5742]"
            >
              ＋ 新增題目
            </button>
          }
        >
          {createDraft.questions.length === 0 ? (
            <div className="text-[12px] text-[#9A9890] py-3">
              尚無題目，點上方「＋ 新增題目」開始建立。也可以先建立問卷主檔、之後再補題目。
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={createDraft.questions.map((q) => q.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {createDraft.questions.map((q, idx) => (
                    <QuestionRow
                      key={q.id}
                      idx={idx}
                      q={q}
                      editing
                      onChange={(patch) => updateQuestion(idx, patch)}
                      onRemove={() => removeQuestion(idx)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </SectionCard>
      ) : null}

      {showAddQuestion ? (
        <AddQuestionModal
          onClose={() => setShowAddQuestion(false)}
          onAdd={(q) => {
            appendQuestion(q);
            setShowAddQuestion(false);
            showBanner({ ok: true, msg: "✓ 已加入新題目（待儲存）" });
          }}
        />
      ) : null}

      {showVersions ? (
        <VersionsModal
          versions={currentVersions}
          status={currentStatus}
          code={survey?.code ?? "（新問卷）"}
          canEdit={canEdit}
          disabled={isPending}
          onRestore={(ver) => {
            restoreVersion(ver);
            setShowVersions(false);
          }}
          onSaveAsNew={() => {
            saveAsNewVersion();
            setShowVersions(false);
          }}
          onClose={() => setShowVersions(false)}
        />
      ) : null}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// QuestionRow — 單題編輯 / 顯示（dnd-kit sortable）
// ──────────────────────────────────────────────────────────────────────────

function QuestionRow({
  idx,
  q,
  editing,
  onChange,
  onRemove,
}: {
  idx: number;
  q: SurveyQuestion;
  editing: boolean;
  onChange: (patch: Partial<SurveyQuestion>) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: q.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const hasOptions =
    q.type === "single" || q.type === "multi" || q.type === "rating";
  const optionsText = (q.options ?? []).join("\n");

  if (!editing) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="border border-[#EEECE6] rounded p-3 bg-[#FAFAF8] flex items-start gap-2"
        data-testid={`survey-question-row-${q.id}`}
      >
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-[#9A9890] hover:text-[#5A5955] select-none mt-0.5"
          aria-label="拖曳排序"
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        <span className="font-mono text-[11px] text-[#9A9890] mt-0.5 shrink-0">
          Q{idx + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] text-[#2C2C2A]">
            {q.label || "（未命名題目）"}
          </div>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-[#5A5955] flex-wrap">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#EEF4FB] text-[#185FA5]">
              {QUESTION_TYPE_ICON[q.type]} {QUESTION_TYPE_LABEL[q.type]}
            </span>
            {q.required ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#FDECEA] text-[#CC0000]">
                必填
              </span>
            ) : (
              <span className="text-[#9A9890]">選填</span>
            )}
            {hasOptions ? (
              <span className="text-[#9A9890]">
                選項：{(q.options ?? []).join(" / ") || "（無）"}
              </span>
            ) : null}
          </div>
          {q.hint ? (
            <div
              className="mt-1.5 text-[11px] text-[#185FA5] bg-[#EAF4FB] rounded px-2 py-1"
              data-testid={`survey-question-hint-display-${q.id}`}
            >
              💬 {q.hint}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border border-[#EEECE6] rounded p-3 bg-white flex items-start gap-2"
      data-testid={`survey-question-row-${q.id}`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-[#9A9890] hover:text-[#5A5955] select-none mt-2"
        aria-label="拖曳排序"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <span className="font-mono text-[11px] text-[#9A9890] mt-2 shrink-0">
        Q{idx + 1}
      </span>
      <div className="flex-1 min-w-0 space-y-2">
        <input
          value={q.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="題目敘述，例如：對銷售顧問的服務您打幾分？"
          className="h-[28px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] outline-none focus:border-[#185FA5]"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <label className="text-[11px] text-[#9A9890]">題型</label>
            <select
              value={q.type}
              onChange={(e) => {
                const nextType = e.target.value as SurveyQuestionType;
                const patch: Partial<SurveyQuestion> = { type: nextType };
                if (nextType === "text") patch.options = undefined;
                else if (!q.options || q.options.length === 0)
                  patch.options = ["選項一", "選項二"];
                onChange(patch);
              }}
              className="h-[28px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] outline-none focus:border-[#185FA5]"
            >
              {QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {QUESTION_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-[#9A9890]">是否必填</label>
            <select
              value={q.required ? "yes" : "no"}
              onChange={(e) => onChange({ required: e.target.value === "yes" })}
              className="h-[28px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] outline-none focus:border-[#185FA5]"
            >
              <option value="yes">必填</option>
              <option value="no">選填</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-[#9A9890]">題目 ID</label>
            <input
              value={q.id}
              onChange={(e) => onChange({ id: e.target.value })}
              placeholder="q1"
              className="h-[28px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] font-mono outline-none focus:border-[#185FA5]"
            />
          </div>
        </div>
        {hasOptions ? (
          <div>
            <label className="text-[11px] text-[#9A9890]">
              選項（每行一個）
            </label>
            <textarea
              value={optionsText}
              onChange={(e) =>
                onChange({
                  options: e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              rows={3}
              placeholder={"選項一\n選項二\n選項三"}
              className="w-full border border-[#D5D3CB] rounded p-2 text-[12.5px] outline-none focus:border-[#185FA5]"
            />
          </div>
        ) : null}
        <div>
          <label className="text-[11px] text-[#9A9890]">
            💬 SA 電訪說明語（選填）
          </label>
          <input
            type="text"
            value={q.hint ?? ""}
            onChange={(e) => onChange({ hint: e.target.value })}
            placeholder="例：請客戶從 0 到 10 分評分，10 分最滿意"
            className="h-[28px] w-full border border-[#D5D3CB] rounded px-2 text-[12px] outline-none focus:border-[#185FA5]"
            data-testid={`survey-question-hint-input-${q.id}`}
          />
          <div className="text-[10.5px] text-[#9A9890] mt-0.5">
            顯示在 CRM03B 電訪工作台題目旁，幫助 SA 詢問
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="h-[24px] px-2 rounded text-[11px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
      >
        刪除
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// AddQuestionModal — 新增題目（題型 grid + 動態選項）
// ──────────────────────────────────────────────────────────────────────────

function AddQuestionModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (q: SurveyQuestion) => void;
}) {
  const [qtype, setQtype] = useState<SurveyQuestionType>("single");
  const [label, setLabel] = useState("");
  const [required, setRequired] = useState(true);
  const [hint, setHint] = useState("");
  const [options, setOptions] = useState<string[]>(["選項一", "選項二"]);
  const [error, setError] = useState<string | null>(null);

  const needOptions = qtype === "single" || qtype === "multi";
  const inputCls =
    "h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] w-full";

  const submit = () => {
    if (!label.trim()) {
      setError("題目內容必填");
      return;
    }
    setError(null);
    const cleanOpts =
      qtype === "text"
        ? undefined
        : qtype === "rating"
          ? ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]
          : options.map((s) => s.trim()).filter(Boolean);
    const q: SurveyQuestion = {
      id: `q${Date.now()}`,
      label: label.trim(),
      type: qtype,
      required,
    };
    if (cleanOpts !== undefined) q.options = cleanOpts;
    if (hint.trim()) q.hint = hint.trim();
    onAdd(q);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full overflow-hidden">
        <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">
            ＋ 新增題目
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9A9890] hover:text-[#2C2C2A] text-[18px] leading-none"
            aria-label="關閉"
          >
            ×
          </button>
        </header>
        <div className="px-4 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="space-y-1.5">
            <label className="text-[11px] text-[#9A9890] font-medium">
              題型選擇
            </label>
            <div
              className="grid grid-cols-2 gap-1.5"
              data-testid="survey-qtype-grid"
            >
              {QUESTION_TYPES.map((t) => {
                const selected = qtype === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setQtype(t)}
                    className={`p-3 rounded border text-left ${
                      selected
                        ? "bg-[#EAF4FB] border-[#185FA5]"
                        : "bg-white border-[#D5D3CB] hover:border-[#9A9890]"
                    }`}
                    aria-pressed={selected}
                  >
                    <div className="text-[14px] leading-none">
                      {QUESTION_TYPE_ICON[t]}
                    </div>
                    <div className="mt-1 text-[12.5px] font-semibold text-[#2C2C2A]">
                      {QUESTION_TYPE_LABEL[t]}
                    </div>
                    <div className="text-[11px] text-[#9A9890]">
                      {QUESTION_TYPE_DESC[t]}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              題目內容 <span className="text-[#C8001A]">*</span>
            </label>
            <textarea
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              rows={2}
              placeholder="例：請問您上次到訪後，對我們的服務整體滿意度如何？"
              className="w-full border border-[#D5D3CB] rounded p-2 text-[12.5px] outline-none focus:border-[#185FA5]"
              autoFocus
              data-testid="survey-question-label-input"
            />
          </div>
          {needOptions ? (
            <div className="space-y-1.5">
              <label className="text-[11px] text-[#9A9890] font-medium">
                選項設定
              </label>
              <div className="space-y-1.5">
                {options.map((opt, i) => (
                  <div key={i} className="flex gap-1.5">
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const next = [...options];
                        next[i] = e.target.value;
                        setOptions(next);
                      }}
                      placeholder={`選項 ${i + 1}`}
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setOptions(options.filter((_, j) => j !== i))
                      }
                      className="h-[32px] px-2 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                      aria-label="移除選項"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setOptions([...options, ""])}
                  className="h-[28px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                >
                  ＋ 新增選項
                </button>
              </div>
            </div>
          ) : null}
          {qtype === "rating" ? (
            <div className="text-[11.5px] text-[#9A9890] bg-[#F8F7F4] rounded px-2.5 py-2">
              評分題自動產生 1–10 共 10 個選項，無需手動設定。
            </div>
          ) : null}
          <div className="space-y-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              💬 SA 電訪說明語（選填）
            </label>
            <input
              type="text"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="例：請客戶從 0 到 10 分評分，10 分最滿意"
              className={inputCls}
              data-testid="survey-add-question-hint-input"
            />
            <div className="text-[10.5px] text-[#9A9890]">
              顯示在 CRM03B 電訪工作台題目旁，幫助 SA 詢問
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              必填
            </label>
            <select
              value={required ? "yes" : "no"}
              onChange={(e) => setRequired(e.target.value === "yes")}
              className={inputCls}
            >
              <option value="yes">必填</option>
              <option value="no">選填</option>
            </select>
          </div>
          {error ? (
            <div className="px-3 py-2 rounded bg-[#FDECEA] text-[#CC0000] text-[12px]">
              {error}
            </div>
          ) : null}
        </div>
        <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            data-testid="survey-add-question-submit"
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
          >
            ✅ 新增此題
          </button>
        </footer>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// VersionsModal — 版本記錄
// ──────────────────────────────────────────────────────────────────────────

function VersionsModal({
  versions,
  status,
  code,
  canEdit,
  disabled,
  onRestore,
  onSaveAsNew,
  onClose,
}: {
  versions: ReturnType<typeof readSurveyVersions>;
  status: ReturnType<typeof readSurveyStatus>;
  code: string;
  canEdit: boolean;
  disabled: boolean;
  onRestore: (ver: string) => void;
  onSaveAsNew: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full overflow-hidden"
        data-testid="survey-version-panel"
      >
        <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">
            📋 {code} 問卷版本記錄
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9A9890] hover:text-[#2C2C2A] text-[18px] leading-none"
            aria-label="關閉"
          >
            ×
          </button>
        </header>
        <div
          className="px-4 py-4 space-y-2 max-h-[60vh] overflow-y-auto"
          data-testid="survey-version-list-detail"
        >
          {versions.length === 0 ? (
            <div className="text-[12px] text-[#9A9890] py-4 text-center">
              尚無版本記錄。點底部「💾 另存新版」或上方「📦 封存當前版本」會寫入第一筆。
            </div>
          ) : (
            versions.map((v, idx) => {
              const isCurrent = idx === 0 && !v.archived_at;
              const hasSnapshot = Boolean(
                v.snapshot && Array.isArray(v.snapshot.questions),
              );
              const restoreDisabled =
                !canEdit || disabled || isCurrent || !hasSnapshot;
              const restoreHint = !hasSnapshot
                ? "舊版無快照，無法還原（CRM02B 之前的版本歷史只有 metadata）"
                : isCurrent
                  ? "這是當前版本"
                  : "把問卷還原回此版";
              return (
                <div
                  key={`${v.ver}-${idx}`}
                  className={`flex items-start gap-3 p-3 rounded border ${
                    isCurrent
                      ? "border-[#5DCAA5] bg-[#F2FAF6]"
                      : "border-[#EEECE6] bg-white"
                  }`}
                  data-testid={`survey-version-item-${v.ver}`}
                >
                  <span className="font-mono font-semibold text-[13px] text-[#1A3A5C] shrink-0">
                    {v.ver}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-[#2C2C2A]">{v.note}</div>
                    <div className="text-[11px] text-[#9A9890] mt-0.5">
                      {v.date}
                      {v.archived_at
                        ? ` · 已於 ${v.archived_at} 封存`
                        : ""}
                      {hasSnapshot ? (
                        <span className="ml-2 text-[#0F6E56]">
                          · 快照 {v.snapshot?.questions?.length ?? 0} 題
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${
                        isCurrent && status === "active"
                          ? "bg-[#E1F5EE] text-[#0F6E56]"
                          : isCurrent
                            ? "bg-[#FDF3E3] text-[#854F0B]"
                            : "bg-[#F1EFE8] text-[#6B6A68]"
                      }`}
                    >
                      {isCurrent && status === "active"
                        ? "啟用中"
                        : isCurrent
                          ? "當前"
                          : v.archived_at
                            ? "封存"
                            : "舊版"}
                    </span>
                    {!isCurrent ? (
                      <button
                        type="button"
                        onClick={() => onRestore(v.ver)}
                        disabled={restoreDisabled}
                        title={restoreHint}
                        data-testid={`survey-version-restore-${v.ver}`}
                        className="h-[24px] px-2 rounded text-[11px] bg-[#E1F5EE] border border-[#5DCAA5] text-[#0F6E56] hover:bg-[#d0eee2] disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        ↩ 還原此版
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-between items-center">
          <button
            type="button"
            onClick={onClose}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            關閉
          </button>
          <button
            type="button"
            onClick={onSaveAsNew}
            disabled={!canEdit || disabled}
            data-testid="survey-save-as-new-version-modal"
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            💾 另存新版本
          </button>
        </footer>
      </div>
    </div>
  );
}

function Kv({
  label,
  value,
  bold,
  mono,
  small,
}: {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div
        className={`text-[12.5px] ${bold ? "font-semibold" : ""} ${mono ? "font-mono" : ""} ${
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
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
        {right ? <div>{right}</div> : null}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}
