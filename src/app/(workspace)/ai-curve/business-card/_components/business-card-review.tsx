"use client";

/**
 * AI 拍名片 review — 9 欄欄位 + 去重 banner + 儲存 / 順手開商機
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveReviewedBusinessCard,
  type BusinessCardScanResult,
  type DuplicateCustomerCandidate,
  type ReviewedBusinessCardValues,
} from "@/domain/ai-business-cards";

type Props = {
  result: BusinessCardScanResult;
  /** 從歷史紀錄載入時的既有 reviewed 值 */
  historicReviewed: ReviewedBusinessCardValues | null;
  onClose: () => void;
};

type FieldKey = keyof ReviewedBusinessCardValues;

const FIELD_LABELS: Record<FieldKey, string> = {
  name: "姓名",
  company: "公司",
  title: "職稱 / 部門",
  phone_mobile: "行動電話",
  phone_office: "公司電話",
  email: "Email",
  address: "地址",
  line_id: "LINE ID",
  notes: "其他備註",
};

const FIELD_PLACEHOLDERS: Record<FieldKey, string> = {
  name: "陳大文",
  company: "某某股份有限公司",
  title: "業務經理",
  phone_mobile: "0912-345-678",
  phone_office: "02-2345-6789 #123",
  email: "name@example.com",
  address: "台北市信義區⋯",
  line_id: "name123",
  notes: "公司 slogan / 官網 / 社群",
};

function initFromResult(
  result: BusinessCardScanResult,
  historic: ReviewedBusinessCardValues | null,
): ReviewedBusinessCardValues {
  if (historic) return { ...historic };
  const s = result.suggestions;
  return {
    name: s.name?.value ?? "",
    company: s.company?.value ?? "",
    title: s.title?.value ?? "",
    phone_mobile: s.phone_mobile?.value ?? "",
    phone_office: s.phone_office?.value ?? "",
    email: s.email?.value ?? "",
    address: s.address?.value ?? "",
    line_id: s.line_id?.value ?? "",
    notes: s.notes?.value ?? "",
  };
}

function countFilled(values: ReviewedBusinessCardValues): number {
  return (Object.values(values) as string[]).filter((v) => v.trim() !== "").length;
}

export function BusinessCardReview({ result, historicReviewed, onClose }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<ReviewedBusinessCardValues>(() =>
    initFromResult(result, historicReviewed),
  );
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [dupOverride, setDupOverride] = useState(false);

  const filled = useMemo(() => countFilled(values), [values]);
  const hasDup = result.duplicateCandidates.length > 0 && !dupOverride && !historicReviewed;

  function setField(k: FieldKey, v: string) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  function submit(mode: "save" | "save_and_lead") {
    if (!values.name.trim()) {
      setBanner({ ok: false, msg: "客戶姓名必填" });
      return;
    }
    if (hasDup) {
      setBanner({
        ok: false,
        msg: "請先處理「客戶可能已存在」提示（連結到既有，或選擇「強制建立新客戶」）",
      });
      return;
    }
    setBanner(null);
    startTransition(async () => {
      const r = await saveReviewedBusinessCard(result.scanId, values, {
        alsoOpenLead: mode === "save_and_lead",
      });
      if (!r.ok) {
        setBanner({ ok: false, msg: r.error });
        return;
      }
      const msg =
        mode === "save_and_lead" && r.data.leadId
          ? "✓ 客戶 + 商機 已建立"
          : mode === "save_and_lead" && !r.data.leadId
            ? "✓ 客戶已建立（商機建立失敗、可從客戶詳情頁手動補）"
            : "✓ 客戶已建立";
      setBanner({ ok: true, msg });
      setTimeout(() => {
        router.push(`/admin/master-data/customers/${r.data.customerId}`);
      }, 800);
    });
  }

  function linkToExisting(candidate: DuplicateCustomerCandidate) {
    setBanner(null);
    startTransition(async () => {
      const r = await saveReviewedBusinessCard(result.scanId, values, {
        linkToExistingCustomerId: candidate.id,
      });
      if (!r.ok) {
        setBanner({ ok: false, msg: r.error });
        return;
      }
      setBanner({ ok: true, msg: "✓ 已連結到既有客戶" });
      setTimeout(() => {
        router.push(`/admin/master-data/customers/${candidate.id}`);
      }, 800);
    });
  }

  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-[#EEECE6] p-4 sm:p-5 ${
        isPending ? "pointer-events-none opacity-70" : ""
      }`}
    >
      {/* Top bar：filled count + 關閉 */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-[12px] text-[#9A9890]">
          <span className="material-symbols-outlined text-[14px] align-middle text-[#185FA5]">
            auto_awesome
          </span>{" "}
          AI 抓到 <b className="text-[#185FA5]">{countFilled(initFromResult(result, null))}</b>/9 欄
          ・延遲 {result.latencyMs} ms ・已填 <b>{filled}</b>/9
        </div>
        <button
          onClick={onClose}
          className="text-[11px] text-[#9A9890] hover:text-[#2C2C2A] underline"
        >
          重新拍
        </button>
      </div>

      {/* 預覽縮圖 */}
      {result.imageSignedUrl && (
        <div className="mb-4 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.imageSignedUrl}
            alt="名片"
            className="max-w-full max-h-[180px] rounded-lg border border-[#EEECE6] object-contain"
          />
        </div>
      )}

      {/* 去重 banner */}
      {hasDup && (
        <div className="mb-4 rounded-lg border border-[#F5AEAD] bg-[#FDECEA] p-3">
          <div className="flex items-start gap-2 mb-2">
            <span className="material-symbols-outlined text-[#CC0000] text-[20px]">
              warning
            </span>
            <div className="text-[12.5px] text-[#CC0000] font-medium leading-snug">
              此電話 / Email 已建立過客戶，是否要連結到既有？
            </div>
          </div>
          <div className="space-y-2">
            {result.duplicateCandidates.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between bg-white rounded-md border border-[#F5AEAD] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] text-[#2C2C2A] font-medium truncate">
                    {c.name}{" "}
                    <span className="font-mono text-[11px] text-[#9A9890]">
                      {c.code}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#5A5955] truncate">
                    {c.match_field === "phone" || c.match_field === "both" ? (
                      <span>📞 {c.phone}</span>
                    ) : null}
                    {c.match_field === "email" || c.match_field === "both" ? (
                      <span className="ml-2">✉ {c.email}</span>
                    ) : null}
                    <span className="ml-2 text-[#9A9890]">
                      建檔於 {c.created_at.slice(0, 10)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => linkToExisting(c)}
                  className="ml-2 h-[28px] px-3 rounded-full bg-[#185FA5] text-white text-[11.5px] font-medium hover:bg-[#0F2A45] shrink-0"
                >
                  連結到此客戶
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setDupOverride(true)}
            className="mt-2 text-[11px] text-[#5A5955] underline hover:text-[#2C2C2A]"
          >
            這不是同一個人，強制建立新客戶
          </button>
        </div>
      )}

      {/* 9 欄 form */}
      <div className="space-y-3">
        {(Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => {
          const sug = result.suggestions[k];
          const hasAi = (sug?.value ?? "").trim() !== "";
          const evidence = sug?.evidence_quote ?? "";
          const conf = sug?.confidence ?? 0;
          const isMultiline = k === "address" || k === "notes";
          const labelRow = (
            <div className="flex items-baseline justify-between mb-1">
              <label className="text-[11px] text-[#9A9890] font-medium">
                {FIELD_LABELS[k]}
                {k === "name" ? (
                  <span className="text-[#CC0000] ml-0.5">*</span>
                ) : null}
              </label>
              {hasAi && (
                <span className="text-[10px] text-[#185FA5]">
                  AI conf {(conf * 100).toFixed(0)}%
                </span>
              )}
            </div>
          );
          const filledNow = (values[k] ?? "").trim() !== "";
          const inputClass = `w-full px-3 py-2 text-[13px] rounded-md border-2 focus:outline-none focus:border-[#185FA5] ${
            filledNow
              ? "border-[#185FA5]/30 bg-white"
              : "border-dashed border-[#D5D3CB] bg-[#F8F7F4]"
          }`;
          return (
            <div key={k}>
              {labelRow}
              {isMultiline ? (
                <textarea
                  value={values[k]}
                  onChange={(e) => setField(k, e.target.value)}
                  placeholder={FIELD_PLACEHOLDERS[k]}
                  rows={2}
                  className={inputClass}
                />
              ) : (
                <input
                  value={values[k]}
                  onChange={(e) => setField(k, e.target.value)}
                  placeholder={FIELD_PLACEHOLDERS[k]}
                  className={inputClass}
                  inputMode={
                    k === "phone_mobile" || k === "phone_office"
                      ? "tel"
                      : k === "email"
                        ? "email"
                        : undefined
                  }
                />
              )}
              {evidence && (
                <div className="text-[10.5px] text-[#9A9890] mt-1 italic pl-1">
                  名片原文：「{evidence}」
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Banner */}
      {banner && (
        <div
          className={`mt-4 px-3 py-2 rounded-md text-[12.5px] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}

      {/* 底部 action — 已 reviewed 過的歷史紀錄只顯示「關閉」、不重複建客戶 */}
      <div className="mt-5 sticky bottom-3 flex gap-2">
        {historicReviewed ? (
          <button
            onClick={onClose}
            className="flex-1 h-[44px] rounded-full bg-[#2C2C2A] text-white text-[14px] font-semibold"
          >
            關閉
          </button>
        ) : (
          <>
            <button
              onClick={() => submit("save")}
              disabled={isPending}
              className="flex-1 h-[44px] rounded-full bg-[#1A3A5C] text-white text-[14px] font-semibold shadow active:scale-95 transition-transform disabled:opacity-50"
            >
              {isPending ? "儲存中⋯" : "儲存客戶"}
            </button>
            <button
              onClick={() => submit("save_and_lead")}
              disabled={isPending}
              className="flex-1 h-[44px] rounded-full bg-[#0F6E56] text-white text-[14px] font-semibold shadow active:scale-95 transition-transform disabled:opacity-50"
            >
              {isPending ? "儲存中⋯" : "儲存並開商機"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
