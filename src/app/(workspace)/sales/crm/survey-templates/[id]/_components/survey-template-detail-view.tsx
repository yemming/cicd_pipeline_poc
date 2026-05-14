"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createSurveyTemplateAction,
  deleteSurveyTemplateAction,
  setSurveyTemplateActiveAction,
  updateSurveyTemplateAction,
  type SurveyTemplateInput,
} from "@/lib/sales/survey-templates-actions";
import type {
  SurveyKind,
  SurveyQuestion,
  SurveyTemplateRow,
} from "@/domain/sales-survey-templates";

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
});

const newQuestion = (idx: number): SurveyQuestion => ({
  id: `q${idx + 1}`,
  label: "",
  type: "single",
  required: true,
  options: ["選項一", "選項二"],
});

export function SurveyTemplateDetailView({
  survey,
  canEdit,
  initialMode = "view",
  initialKind = "sales",
  basePath = "/sales/crm/survey-templates",
}: {
  survey: SurveyTemplateRow | null;
  canEdit: boolean;
  initialMode?: "view" | "create";
  initialKind?: SurveyKind;
  /** 路徑前綴；sales 走預設值、aftersales 傳 "/aftersales/crm/survey-templates" */
  basePath?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(initialMode === "create");
  const [activeTab, setActiveTab] = useState<TabKey>("questions");

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
  const addQuestion = () => {
    setFormDraft({
      ...formDraft,
      questions: [...formDraft.questions, newQuestion(formDraft.questions.length)],
    });
  };
  const removeQuestion = (idx: number) => {
    const next = [...formDraft.questions];
    next.splice(idx, 1);
    setFormDraft({ ...formDraft, questions: next });
  };
  const moveQuestion = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= formDraft.questions.length) return;
    const next = [...formDraft.questions];
    [next[idx], next[target]] = [next[target], next[idx]];
    setFormDraft({ ...formDraft, questions: next });
  };

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
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${survey.is_active ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#F2F2F2] text-[#6B6A68]"}`}
                    >
                      {survey.is_active ? "啟用" : "停用"}
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EBF3FF] text-[#1A3A5C]">
                      {survey.questions.length} 題
                    </span>
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
              <SectionCard
                title={`題目清單（${formDraft.questions.length}）`}
                right={
                  showInputs ? (
                    <button
                      type="button"
                      onClick={addQuestion}
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                    >
                      ＋ 新增題目
                    </button>
                  ) : null
                }
              >
                {formDraft.questions.length === 0 ? (
                  <div className="text-[12px] text-[#9A9890] py-3">
                    尚無題目。{showInputs ? "點上方「＋ 新增題目」開始建立。" : "點「修改」進入編輯模式建立題目。"}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {formDraft.questions.map((q, idx) => (
                      <QuestionRow
                        key={`${q.id}-${idx}`}
                        idx={idx}
                        q={q}
                        editing={showInputs}
                        onChange={(patch) => updateQuestion(idx, patch)}
                        onRemove={() => removeQuestion(idx)}
                        onMove={(dir) => moveQuestion(idx, dir)}
                      />
                    ))}
                  </div>
                )}
              </SectionCard>
            ) : null}

            {activeTab === "metadata" ? (
              <SectionCard title="進階設定">
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-[12.5px]">
                  <Kv label="問卷 ID" value={<span className="font-mono text-[11.5px]">{survey.id}</span>} small />
                  <Kv label="品牌" value={<span className="font-mono">{survey.brand_id}</span>} small mono />
                  <Kv
                    label="metadata（jsonb）"
                    value={
                      <code className="text-[11px] text-[#5A5955]">
                        （目前無自訂 metadata）
                      </code>
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
              onClick={addQuestion}
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
            <div className="space-y-2">
              {createDraft.questions.map((q, idx) => (
                <QuestionRow
                  key={`new-${q.id}-${idx}`}
                  idx={idx}
                  q={q}
                  editing
                  onChange={(patch) => updateQuestion(idx, patch)}
                  onRemove={() => removeQuestion(idx)}
                  onMove={(dir) => moveQuestion(idx, dir)}
                />
              ))}
            </div>
          )}
        </SectionCard>
      ) : null}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// QuestionRow — 單題編輯 / 顯示
// ──────────────────────────────────────────────────────────────────────────

const QUESTION_TYPE_LABEL: Record<SurveyQuestion["type"], string> = {
  single: "單選",
  multi: "複選",
  rating: "評分",
  text: "文字",
};

function QuestionRow({
  idx,
  q,
  editing,
  onChange,
  onRemove,
  onMove,
}: {
  idx: number;
  q: SurveyQuestion;
  editing: boolean;
  onChange: (patch: Partial<SurveyQuestion>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const hasOptions =
    q.type === "single" || q.type === "multi" || q.type === "rating";

  const optionsText = (q.options ?? []).join("\n");

  if (!editing) {
    return (
      <div className="border border-[#EEECE6] rounded p-3 bg-[#FAFAF8]">
        <div className="flex items-start gap-2">
          <span className="font-mono text-[11px] text-[#9A9890] mt-0.5">
            Q{idx + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] text-[#2C2C2A]">{q.label || "（未命名題目）"}</div>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-[#5A5955]">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#EEF4FB] text-[#185FA5]">
                {QUESTION_TYPE_LABEL[q.type]}
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
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-[#EEECE6] rounded p-3 bg-white">
      <div className="flex items-start gap-2">
        <span className="font-mono text-[11px] text-[#9A9890] mt-2">
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
                  const nextType = e.target.value as SurveyQuestion["type"];
                  const patch: Partial<SurveyQuestion> = { type: nextType };
                  if (nextType === "text") patch.options = undefined;
                  else if (!q.options || q.options.length === 0)
                    patch.options = ["選項一", "選項二"];
                  onChange(patch);
                }}
                className="h-[28px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] outline-none focus:border-[#185FA5]"
              >
                <option value="single">單選</option>
                <option value="multi">複選</option>
                <option value="rating">評分</option>
                <option value="text">文字</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-[#9A9890]">是否必填</label>
              <select
                value={q.required ? "yes" : "no"}
                onChange={(e) =>
                  onChange({ required: e.target.value === "yes" })
                }
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
        </div>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            className="h-[24px] px-2 rounded text-[11px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            aria-label="上移"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            className="h-[24px] px-2 rounded text-[11px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            aria-label="下移"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="h-[24px] px-2 rounded text-[11px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
          >
            刪除
          </button>
        </div>
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
