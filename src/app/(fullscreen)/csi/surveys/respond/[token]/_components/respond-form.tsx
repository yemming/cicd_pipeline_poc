"use client";

import { useState, useTransition } from "react";
import { submitResponseAction } from "@/lib/csi/survey-actions";
import type { SurveyResponseStatus } from "@/domain/surveys.constants";

type Question = {
  id: string;
  type: "rating" | "text" | "single" | "multi";
  label: string;
  options?: string[];
  required?: boolean;
  hint?: string;
};

type Props = {
  token: string;
  status: SurveyResponseStatus;
  questions: Question[];
  initial: Record<string, unknown>;
};

export function RespondForm({ token, status, questions, initial }: Props) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(initial ?? {});
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [submitted, setSubmitted] = useState(status === "responded");

  function setAnswer(qid: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  }

  function toggleMulti(qid: string, option: string) {
    const cur = Array.isArray(answers[qid]) ? (answers[qid] as string[]) : [];
    const next = cur.includes(option) ? cur.filter((o) => o !== option) : [...cur, option];
    setAnswer(qid, next);
  }

  function submit() {
    for (const q of questions) {
      if (!q.required) continue;
      const v = answers[q.id];
      const empty =
        v === undefined ||
        v === null ||
        v === "" ||
        (Array.isArray(v) && v.length === 0);
      if (empty) {
        setBanner({ ok: false, msg: `「${q.label}」為必填` });
        return;
      }
    }

    setBanner(null);
    startTransition(async () => {
      const res = await submitResponseAction(token, answers);
      if (res.ok) {
        setSubmitted(true);
        setBanner({ ok: true, msg: "✓ 已送出，感謝您的回覆！" });
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  }

  if (submitted) {
    return (
      <section className="bg-white border border-[#EEECE6] rounded-lg p-8 text-center">
        <div className="text-[36px] mb-2">✅</div>
        <h2 className="text-[15px] font-semibold text-[#2C2C2A]">問卷已完成</h2>
        <p className="text-[12.5px] text-[#5A5955] mt-2">
          感謝您的寶貴回饋，我們會持續改善服務品質。
        </p>
      </section>
    );
  }

  const locked = isPending;

  return (
    <section
      className={`bg-white border border-[#EEECE6] rounded-lg p-5 space-y-5 ${
        locked ? "pointer-events-none opacity-60" : ""
      }`}
    >
      {questions.map((q, idx) => (
        <div key={q.id} className="space-y-2">
          <label className="block text-[13px] font-semibold text-[#2C2C2A]">
            {idx + 1}. {q.label}
            {q.required && <span className="text-[#CC0000] ml-1">*</span>}
          </label>
          {q.hint && <p className="text-[11px] text-[#9A9890]">{q.hint}</p>}

          {q.type === "text" && (
            <textarea
              rows={3}
              className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
              value={(answers[q.id] as string) ?? ""}
              onChange={(e) => setAnswer(q.id, e.target.value)}
              placeholder="請輸入您的回答⋯"
            />
          )}

          {q.type === "rating" && (
            <div className="flex flex-wrap gap-1.5">
              {(q.options ?? []).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setAnswer(q.id, opt)}
                  className={`w-9 h-9 rounded text-[12.5px] font-medium border transition ${
                    answers[q.id] === opt
                      ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                      : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#185FA5]"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {q.type === "single" && (
            <div className="space-y-1.5">
              {(q.options ?? []).map((opt) => (
                <label
                  key={opt}
                  className="flex items-center gap-2 text-[12.5px] text-[#2C2C2A] cursor-pointer"
                >
                  <input
                    type="radio"
                    name={q.id}
                    checked={answers[q.id] === opt}
                    onChange={() => setAnswer(q.id, opt)}
                  />
                  {opt}
                </label>
              ))}
            </div>
          )}

          {q.type === "multi" && (
            <div className="space-y-1.5">
              {(q.options ?? []).map((opt) => {
                const cur = Array.isArray(answers[q.id])
                  ? (answers[q.id] as string[])
                  : [];
                return (
                  <label
                    key={opt}
                    className="flex items-center gap-2 text-[12.5px] text-[#2C2C2A] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={cur.includes(opt)}
                      onChange={() => toggleMulti(q.id, opt)}
                    />
                    {opt}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EEECE6]">
        {banner && !banner.ok && (
          <span className="text-[12px] text-[#CC0000] mr-auto">{banner.msg}</span>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={locked}
          className="h-[34px] px-5 rounded-full text-[13px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
        >
          {isPending ? "送出中⋯" : "送出問卷"}
        </button>
      </div>

      {banner && banner.ok && (
        <div className="fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]">
          {banner.msg}
        </div>
      )}
    </section>
  );
}
