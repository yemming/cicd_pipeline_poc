"use client";

/**
 * <CallTaskCard> — CRM 電訪工作台共用任務卡片（CRM03A / CRM03B）。
 *
 * 設計目標：
 *  - 可同時服務銷售電訪（CRM03A）與售後電訪（CRM03B）兩條路徑
 *  - 卡片視覺：左 4px 狀態色條 + 收合 header + 可展開 body
 *  - 收合 header：類型 badge + 客戶名稱 + 預定時間 + 狀態 chip + actions
 *  - 展開 body：話術提示 chip 列 → 歷史記錄 list → 通話結果 5 chip →
 *               下次跟進日 + 競品 input → 備註 textarea → 儲存 button
 *  - 售後專用：透過 `topInfoBar` slot 注入「進廠資訊條」
 *
 * 與 <CrmCustomerCard> 並列，但 props 更專注於「一通電話的填單流程」。
 */

import type { ReactNode } from "react";

export type CallTaskCardStatus =
  | "pending"
  | "overdue"
  | "done"
  | "scheduled";

export type CallTaskCardChipColor =
  | "navy"
  | "amber"
  | "red"
  | "teal"
  | "blue"
  | "purple"
  | "gray";

export type CallTaskCardChip = {
  key: string;
  label: string;
  color?: CallTaskCardChipColor;
};

export type CallTaskCardHistoryItem = {
  /** 日期或時間字串（caller 自行格式化） */
  date: string;
  /** 結果文字（如「已接通」「未接聽」） */
  result: string;
  /** 補充說明 */
  note?: string;
  /** dot 顏色（預設依結果推導，caller 可 override） */
  tone?: "teal" | "blue" | "amber" | "red" | "gray";
};

export type CallTaskCardResultOption = {
  key: string;
  label: string;
  /** 預設樣式由 selected 控制；caller 可指定 tint */
  tint?: "teal" | "amber" | "red" | "navy" | "gray";
};

export type CallTaskCardProps = {
  /** 任務類型 key（純標籤、不影響行為） */
  taskType: string;
  /** 任務類型 badge 顯示文字（如「D+3 跟進」） */
  taskTypeBadge: string;
  /** badge 顏色（對齊 spec：D+3 紅 / D+7 amber / 邀約 blue / 自訂 purple / 售後 teal） */
  taskTypeColor?: CallTaskCardChipColor;
  /** 客戶顯示名稱 */
  customerName: string;
  /** 客戶代碼 / 車牌 */
  customerCode?: string;
  /** 預定撥打時間（YYYY-MM-DD HH:mm 或自訂格式） */
  scheduledLabel?: string;
  /** 狀態（決定左邊框顏色 + 預設 status chip） */
  status: CallTaskCardStatus;
  /** HABC（銷售）/ SA 標籤（售後）chip — 顯示於 header 右側 */
  habcOrSegment?: string;
  /** header 右側額外 chip 列 */
  chips?: CallTaskCardChip[];
  /** header 右側 actions（撥打 / 詳情 button 等） */
  actions?: ReactNode;
  /** 是否展開 */
  expanded?: boolean;
  /** 點 chevron 切展開 */
  onToggle?: () => void;
  /** 整張卡 disable（pending 時用） */
  disabled?: boolean;

  // ── 展開區內容 ────────────────────────────────────────
  /** 售後專用「進廠資訊條」slot（綠色 bar） */
  topInfoBar?: ReactNode;
  /** 話術提示主文（深藍底 white 字） */
  scriptText?: string;
  /** 話術提示標籤（如「話術提示 — D+3 追蹤」） */
  scriptTagLabel?: string;
  /** 話術要點 chip 列 */
  scriptHints?: string[];
  /** 歷史接觸記錄 */
  history?: CallTaskCardHistoryItem[];
  /** 通話結果 5 選 */
  callResults?: CallTaskCardResultOption[];
  /** 當前選中的 result key */
  selectedResult?: string | null;
  /** 點 result chip */
  onSelectResult?: (key: string) => void;
  /** 下次跟進日（YYYY-MM-DD） */
  nextFollowUpDate?: string | null;
  onChangeNextDate?: (date: string) => void;
  /** 競品去向（銷售用） */
  competitorBrand?: string | null;
  onChangeCompetitor?: (brand: string) => void;
  competitorOptions?: { value: string; label: string }[];
  /** 通話備註 */
  note?: string | null;
  onChangeNote?: (note: string) => void;
  /**
   * 額外 form slot（注入位置：通話備註下方、儲存 footer 上方）。
   * 給售後 D+3 / NPS 訪談放「NPS 評分 chip 列」用，不破壞 sales path。
   */
  extraFormBottom?: ReactNode;
  /** 儲存通話記錄 callback（async） */
  onSave?: () => void | Promise<void>;
  /** 跳過 / 結案 callback */
  onSkip?: () => void | Promise<void>;
  /** 儲存中（disable form） */
  saving?: boolean;
  /** 額外 footer slot（如「下次跟進 7 天後自動建單」hint） */
  footerHint?: ReactNode;
};

// ──────────────────────────────────────────────────────────────────────────
// Tokens
// ──────────────────────────────────────────────────────────────────────────

const STATUS_BORDER: Record<CallTaskCardStatus, string> = {
  overdue: "bg-[#CC0000]",
  pending: "bg-[#D4820A]",
  done: "bg-[#0F6E56]",
  scheduled: "bg-[#185FA5]",
};

const STATUS_LABEL: Record<CallTaskCardStatus, string> = {
  overdue: "逾期",
  pending: "待跟進",
  done: "已完成",
  scheduled: "已排程",
};

const STATUS_CHIP_CLS: Record<CallTaskCardStatus, string> = {
  overdue: "bg-[#FDECEA] text-[#CC0000]",
  pending: "bg-[#FDF3E3] text-[#854F0B]",
  done: "bg-[#EAF3DE] text-[#3B6D11]",
  scheduled: "bg-[#EAF4FB] text-[#185FA5]",
};

const CHIP_CLS: Record<CallTaskCardChipColor, string> = {
  navy: "bg-[#EBF3FF] text-[#1A3A5C]",
  amber: "bg-[#FDF3E3] text-[#854F0B]",
  red: "bg-[#FDECEA] text-[#CC0000]",
  teal: "bg-[#E8F5F0] text-[#0F6E56]",
  blue: "bg-[#EAF4FB] text-[#185FA5]",
  purple: "bg-[#F0E8FB] text-[#6A1B9A]",
  gray: "bg-[#F2F2F2] text-[#6B6A68]",
};

const HISTORY_DOT_CLS: Record<
  NonNullable<CallTaskCardHistoryItem["tone"]>,
  string
> = {
  teal: "bg-[#0F6E56]",
  blue: "bg-[#185FA5]",
  amber: "bg-[#854F0B]",
  red: "bg-[#CC0000]",
  gray: "bg-[#9A9890]",
};

const RESULT_TINT_SELECTED: Record<
  NonNullable<CallTaskCardResultOption["tint"]>,
  string
> = {
  teal: "bg-[#0F6E56] text-white border-[#0F6E56]",
  amber: "bg-[#854F0B] text-white border-[#854F0B]",
  red: "bg-[#CC0000] text-white border-[#CC0000]",
  navy: "bg-[#1A3A5C] text-white border-[#1A3A5C]",
  gray: "bg-[#5A5955] text-white border-[#5A5955]",
};

// ──────────────────────────────────────────────────────────────────────────

export function CallTaskCard({
  taskType,
  taskTypeBadge,
  taskTypeColor = "navy",
  customerName,
  customerCode,
  scheduledLabel,
  status,
  habcOrSegment,
  chips,
  actions,
  expanded = false,
  onToggle,
  disabled = false,
  topInfoBar,
  scriptText,
  scriptTagLabel,
  scriptHints,
  history,
  callResults,
  selectedResult,
  onSelectResult,
  nextFollowUpDate,
  onChangeNextDate,
  competitorBrand,
  onChangeCompetitor,
  competitorOptions,
  note,
  onChangeNote,
  extraFormBottom,
  onSave,
  onSkip,
  saving = false,
  footerHint,
}: CallTaskCardProps) {
  const formDisabled = disabled || saving;
  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] disabled:opacity-60";

  return (
    <article
      data-task-type={taskType}
      data-status={status}
      className={`relative bg-white border border-[#EEECE6] rounded-lg overflow-hidden flex ${disabled ? "opacity-60 pointer-events-none" : ""}`}
    >
      {/* 左 4px 狀態色條 */}
      <div className={`shrink-0 w-1 ${STATUS_BORDER[status]}`} aria-hidden />

      <div className="flex-1 min-w-0">
        {/* ── 收合 header ── */}
        <div className="flex items-start gap-3 px-4 py-3">
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            {/* 第 1 行：類型 badge + 客戶 + status chip */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${CHIP_CLS[taskTypeColor]}`}
              >
                {taskTypeBadge}
              </span>
              <h3 className="text-[13px] font-semibold text-[#2C2C2A] leading-tight">
                {customerName}
              </h3>
              {customerCode ? (
                <span className="text-[11.5px] font-mono text-[#5A5955]">
                  {customerCode}
                </span>
              ) : null}
              {habcOrSegment ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C] font-medium">
                  {habcOrSegment}
                </span>
              ) : null}
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${STATUS_CHIP_CLS[status]}`}
              >
                {STATUS_LABEL[status]}
              </span>
              {chips && chips.length > 0
                ? chips.map((chip) => (
                    <span
                      key={chip.key}
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${CHIP_CLS[chip.color ?? "gray"]}`}
                    >
                      {chip.label}
                    </span>
                  ))
                : null}
            </div>

            {/* 第 2 行：預定時間 */}
            {scheduledLabel ? (
              <p className="text-[11.5px] text-[#5A5955]">
                <span className="material-symbols-outlined text-[14px] leading-none align-middle mr-0.5">
                  schedule
                </span>
                <span className="font-mono">{scheduledLabel}</span>
              </p>
            ) : null}
          </div>

          {/* 右側 actions */}
          {actions ? (
            <div className="shrink-0 flex items-center gap-1.5">{actions}</div>
          ) : null}

          {/* 展開 chevron */}
          {onToggle ? (
            <button
              type="button"
              onClick={onToggle}
              aria-label={expanded ? "收合" : "展開"}
              aria-expanded={expanded}
              className="shrink-0 w-6 h-6 rounded text-[#9A9890] hover:bg-[#F2F2F2] hover:text-[#2C2C2A] flex items-center justify-center"
            >
              <span
                className={`material-symbols-outlined text-[20px] leading-none transition-transform ${expanded ? "rotate-180" : ""}`}
                aria-hidden
              >
                expand_more
              </span>
            </button>
          ) : null}
        </div>

        {/* ── 展開 body ── */}
        {expanded ? (
          <div className="border-t border-[#EEECE6] bg-[#F8F7F4] px-4 py-3 space-y-3">
            {/* 售後進廠資訊條（slot） */}
            {topInfoBar ? <div>{topInfoBar}</div> : null}

            {/* 話術提示 box */}
            {scriptText || (scriptHints && scriptHints.length > 0) ? (
              <div className="bg-[#1A3A5C] text-white rounded-lg p-3 space-y-2">
                {scriptTagLabel ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] bg-white/15 text-white font-medium">
                    {scriptTagLabel}
                  </span>
                ) : null}
                {scriptText ? (
                  <p className="text-[12.5px] leading-[1.7] text-white/95 whitespace-pre-wrap">
                    {scriptText}
                  </p>
                ) : null}
                {scriptHints && scriptHints.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {scriptHints.map((hint, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-white/10 text-white border border-white/20"
                      >
                        {hint}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* 歷史接觸記錄 */}
            {history && history.length > 0 ? (
              <div className="bg-white border border-[#EEECE6] rounded-lg p-3 space-y-2">
                <h4 className="text-[12px] font-semibold text-[#2C2C2A]">
                  歷史接觸記錄
                </h4>
                <ul className="space-y-1.5">
                  {history.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span
                        className={`shrink-0 w-2 h-2 mt-1.5 rounded-full ${HISTORY_DOT_CLS[item.tone ?? "gray"]}`}
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0 text-[11.5px] text-[#5A5955] leading-[1.6]">
                        <span className="font-mono text-[#9A9890] mr-1.5">
                          {item.date}
                        </span>
                        <span className="font-medium text-[#2C2C2A] mr-1.5">
                          {item.result}
                        </span>
                        {item.note ? <span>· {item.note}</span> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* 通話結果 5 chip */}
            {callResults && callResults.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[11px] text-[#9A9890] font-medium">通話結果</p>
                <div className="flex flex-wrap gap-1.5">
                  {callResults.map((opt) => {
                    const selected = selectedResult === opt.key;
                    const tint = opt.tint ?? "navy";
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        disabled={formDisabled}
                        aria-pressed={selected}
                        onClick={() => onSelectResult?.(opt.key)}
                        className={`h-[30px] px-3 rounded-full border text-[12px] font-medium transition-colors ${
                          selected
                            ? RESULT_TINT_SELECTED[tint]
                            : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                        } disabled:opacity-60`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* 下次跟進 + 競品 */}
            {(onChangeNextDate || onChangeCompetitor) ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {onChangeNextDate ? (
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#9A9890] font-medium">
                      下次跟進日
                    </label>
                    <input
                      type="date"
                      value={nextFollowUpDate ?? ""}
                      disabled={formDisabled}
                      onChange={(e) => onChangeNextDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                ) : null}
                {onChangeCompetitor ? (
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#9A9890] font-medium">
                      競品去向（若有）
                    </label>
                    <select
                      value={competitorBrand ?? ""}
                      disabled={formDisabled}
                      onChange={(e) => onChangeCompetitor(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">— 無 / 未提及 —</option>
                      {(
                        competitorOptions ?? [
                          { value: "BMW", label: "BMW Motorrad" },
                          { value: "Triumph", label: "Triumph" },
                          { value: "Harley", label: "Harley-Davidson" },
                          { value: "MV Agusta", label: "MV Agusta" },
                          { value: "Kawasaki", label: "Kawasaki" },
                          { value: "Yamaha", label: "Yamaha" },
                          { value: "Honda", label: "Honda" },
                          { value: "Other", label: "其他 / 中古車行" },
                        ]
                      ).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* 通話備註 */}
            {onChangeNote ? (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">
                  通話備註
                </label>
                <textarea
                  rows={3}
                  value={note ?? ""}
                  disabled={formDisabled}
                  onChange={(e) => onChangeNote(e.target.value)}
                  placeholder="記錄客戶反饋、下次跟進重點⋯"
                  className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] bg-white outline-none focus:border-[#185FA5] disabled:opacity-60 resize-y"
                />
              </div>
            ) : null}

            {/* 售後 D+3 / NPS 評分 chip slot（caller 自渲染） */}
            {extraFormBottom ? <div>{extraFormBottom}</div> : null}

            {/* footer：儲存 + 跳過 */}
            {onSave || onSkip ? (
              <div className="flex items-center gap-2 pt-1">
                {footerHint ? (
                  <span className="text-[11px] text-[#9A9890]">
                    {footerHint}
                  </span>
                ) : null}
                <div className="ml-auto flex items-center gap-2">
                  {onSkip ? (
                    <button
                      type="button"
                      disabled={formDisabled}
                      onClick={() => onSkip()}
                      className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
                    >
                      略過（今日不跟進）
                    </button>
                  ) : null}
                  {onSave ? (
                    <button
                      type="button"
                      disabled={formDisabled}
                      onClick={() => onSave()}
                      className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
                    >
                      {saving ? "儲存中⋯" : "💾 儲存通話記錄"}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default CallTaskCard;
