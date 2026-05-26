"use client";

/**
 * AI 拍駕照 review — 8 欄欄位 + 同名警示 + 建客戶 / 連結既有
 *
 * 若 URL 帶 ?return_token=xxx → 建客戶成功後寫 localStorage[`td_prefill_${token}`]
 * 讓試駕 wizard 那邊 storage event 接收後 prefill；本 tab 自動 close。
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveReviewedDrivingLicense,
  type DrivingLicenseScanResult,
  type DuplicateCustomerCandidate,
  type ReviewedDrivingLicenseValues,
} from "@/domain/ai-driving-licenses";

type Props = {
  result: DrivingLicenseScanResult;
  historicReviewed: ReviewedDrivingLicenseValues | null;
  onClose: () => void;
  returnToken: string | null;
};

type FieldKey = keyof ReviewedDrivingLicenseValues;

const FIELD_LABELS: Record<FieldKey, string> = {
  name: "姓名",
  license_no: "駕照號碼",
  license_class: "駕照種類",
  birthday: "出生日期",
  expires_at: "有效期限",
  gender: "性別",
  address: "戶籍地址",
  issued_by: "發照單位",
};

const FIELD_PLACEHOLDERS: Record<FieldKey, string> = {
  name: "陳大文",
  license_no: "A12-345-678",
  license_class: "大型重型機車 A1",
  birthday: "民國 80/01/15",
  expires_at: "民國 119/01/14",
  gender: "男 / 女",
  address: "台北市信義區⋯",
  issued_by: "臺北市區監理所",
};

function initFromResult(
  result: DrivingLicenseScanResult,
  historic: ReviewedDrivingLicenseValues | null,
): ReviewedDrivingLicenseValues {
  if (historic) return { ...historic };
  const s = result.suggestions;
  return {
    name: s.name?.value ?? "",
    license_no: s.license_no?.value ?? "",
    license_class: s.license_class?.value ?? "",
    birthday: s.birthday?.value ?? "",
    expires_at: s.expires_at?.value ?? "",
    gender: s.gender?.value ?? "",
    address: s.address?.value ?? "",
    issued_by: s.issued_by?.value ?? "",
  };
}

function countFilled(values: ReviewedDrivingLicenseValues): number {
  return (Object.values(values) as string[]).filter((v) => v.trim() !== "").length;
}

export function DrivingLicenseReview({
  result,
  historicReviewed,
  onClose,
  returnToken,
}: Props) {
  const router = useRouter();
  const [values, setValues] = useState<ReviewedDrivingLicenseValues>(() =>
    initFromResult(result, historicReviewed),
  );
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [dupOverride, setDupOverride] = useState(false);

  const filled = useMemo(() => countFilled(values), [values]);
  const hasDup =
    result.duplicateCandidates.length > 0 && !dupOverride && !historicReviewed;

  function setField(k: FieldKey, v: string) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  function handleReturnToWizard(customerId: string) {
    if (!returnToken) return false;
    if (typeof window === "undefined") return false;
    try {
      const payload = {
        customerId,
        name: values.name.trim(),
        license_no: values.license_no.trim(),
        license_class: values.license_class.trim(),
        expires_at: values.expires_at.trim(),
        address: values.address.trim(),
      };
      window.localStorage.setItem(
        `td_prefill_${returnToken}`,
        JSON.stringify(payload),
      );
      setBanner({ ok: true, msg: "✓ 已建立，正在帶回試駕表單⋯" });
      setTimeout(() => {
        try {
          window.close();
        } catch {
          // pop-up 被擋或單 tab 開的情境 fallback
          router.push("/sales/reception/test-rides/wizard");
        }
      }, 1200);
      return true;
    } catch {
      return false;
    }
  }

  function submit() {
    if (!values.name.trim()) {
      setBanner({ ok: false, msg: "客戶姓名必填" });
      return;
    }
    if (hasDup) {
      setBanner({
        ok: false,
        msg: "請先處理「同名客戶」提示（連結到既有，或選擇「強制建立新客戶」）",
      });
      return;
    }
    setBanner(null);
    startTransition(async () => {
      const r = await saveReviewedDrivingLicense(result.scanId, values);
      if (!r.ok) {
        setBanner({ ok: false, msg: r.error });
        return;
      }
      if (handleReturnToWizard(r.data.customerId)) return;
      setBanner({ ok: true, msg: "✓ 客戶已建立" });
      setTimeout(() => {
        router.push(`/admin/master-data/customers/${r.data.customerId}`);
      }, 800);
    });
  }

  function linkToExisting(candidate: DuplicateCustomerCandidate) {
    setBanner(null);
    startTransition(async () => {
      const r = await saveReviewedDrivingLicense(result.scanId, values, {
        linkToExistingCustomerId: candidate.id,
      });
      if (!r.ok) {
        setBanner({ ok: false, msg: r.error });
        return;
      }
      if (handleReturnToWizard(candidate.id)) return;
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
      {/* Top bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-[12px] text-[#9A9890]">
          <span className="material-symbols-outlined text-[14px] align-middle text-[#185FA5]">
            auto_awesome
          </span>{" "}
          AI 抓到{" "}
          <b className="text-[#185FA5]">
            {countFilled(initFromResult(result, null))}
          </b>
          /8 欄 ・延遲 {result.latencyMs} ms ・已填 <b>{filled}</b>/8
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
            alt="駕照"
            className="max-w-full max-h-[180px] rounded-lg border border-[#EEECE6] object-contain"
          />
        </div>
      )}

      {/* 帶回 wizard 提示 */}
      {returnToken && !historicReviewed && (
        <div className="mb-4 rounded-lg border border-[#185FA5]/30 bg-[#EAF4FB] px-3 py-2 text-[12px] text-[#185FA5]">
          📋 建客戶成功後將自動帶回試駕表單、本頁會關閉
        </div>
      )}

      {/* 同名 banner */}
      {hasDup && (
        <div className="mb-4 rounded-lg border border-[#F5AEAD] bg-[#FDECEA] p-3">
          <div className="flex items-start gap-2 mb-2">
            <span className="material-symbols-outlined text-[#CC0000] text-[20px]">
              warning
            </span>
            <div className="text-[12.5px] text-[#CC0000] font-medium leading-snug">
              已有同名客戶，是否要連結到既有？
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
                    {c.phone ? <span>📞 {c.phone}</span> : null}
                    {c.national_id ? (
                      <span className="ml-2">🆔 {c.national_id}</span>
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

      {/* 8 欄 form */}
      <div className="space-y-3">
        {(Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => {
          const sug = result.suggestions[k];
          const hasAi = (sug?.value ?? "").trim() !== "";
          const evidence = sug?.evidence_quote ?? "";
          const conf = sug?.confidence ?? 0;
          const isMultiline = k === "address";
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
                />
              )}
              {evidence && (
                <div className="text-[10.5px] text-[#9A9890] mt-1 italic pl-1">
                  駕照原文：「{evidence}」
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

      {/* 底部 action */}
      <div className="mt-5 sticky bottom-3 flex gap-2">
        {historicReviewed ? (
          <button
            onClick={onClose}
            className="flex-1 h-[44px] rounded-full bg-[#2C2C2A] text-white text-[14px] font-semibold"
          >
            關閉
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={isPending}
            className="flex-1 h-[44px] rounded-full bg-[#1A3A5C] text-white text-[14px] font-semibold shadow active:scale-95 transition-transform disabled:opacity-50"
          >
            {isPending
              ? "儲存中⋯"
              : returnToken
                ? "建客戶並帶回試駕表單"
                : "儲存客戶"}
          </button>
        )}
      </div>
    </div>
  );
}
