"use client";

/**
 * AI Curve — 接待錄音 → AI 抽 8 欄位 → 12 欄手卡式回填預覽
 *
 * State machine：idle → recording → uploading → result
 * 完全 mobile-first：單欄、大觸控、不依賴 sidebar 視覺。
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  recordAiCurveNote,
  type AiCurveNoteResult,
  type AiCurveNoteListItem,
} from "@/domain/ai-curve-notes";
import { ResultCards } from "./result-cards";
import { DemoScriptPanel } from "./demo-script-panel";
import { HistoryItem } from "./history-item";

type Phase = "idle" | "recording" | "uploading" | "result" | "error";

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) {
      return m;
    }
  }
  return "";
}

function formatRelTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMin = Math.floor((now - d.getTime()) / 60000);
  if (diffMin < 1) return "剛剛";
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)} 小時前`;
  return d.toLocaleDateString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds} 秒`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function AiCurveApp({ recent }: { recent: AiCurveNoteListItem[] }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [errMsg, setErrMsg] = useState("");
  const [result, setResult] = useState<AiCurveNoteResult | null>(null);

  // 本地維護的最近紀錄列表（樂觀刪除用、避免每次刪都跑一次 router.refresh）
  const [localRecent, setLocalRecent] = useState<AiCurveNoteListItem[]>(recent);
  // server props 變化（router.refresh 後）時同步
  useEffect(() => {
    setLocalRecent(recent);
  }, [recent]);

  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef = useRef<string>("");

  useEffect(() => {
    if (phase === "recording") {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  function reset() {
    setPhase("idle");
    setSeconds(0);
    setErrMsg("");
    setResult(null);
    router.refresh();
  }

  function loadHistoric(item: AiCurveNoteListItem) {
    setResult({
      noteId: item.id,
      transcript: item.transcript,
      suggestions: item.ai_suggestions,
      reviewedValues: item.reviewed_values,
      latencyMs: item.ai_latency_ms ?? 0,
      sizeBytes: item.size_bytes ?? 0,
      durationSeconds: item.duration_seconds ?? 0,
      mimeType: item.mime_type,
      tokensIn: 0,
      tokensOut: 0,
    });
    setPhase("result");
  }

  async function startRecording() {
    setErrMsg("");
    setSeconds(0);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErrMsg("瀏覽器不支援錄音（getUserMedia 不存在）");
      setPhase("error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
    } catch (e) {
      const err = e as Error;
      setErrMsg(
        err.name === "NotAllowedError"
          ? "麥克風權限被拒。請到瀏覽器設定打開、重新整理頁面再試。"
          : `getUserMedia 失敗：${err.message}`,
      );
      setPhase("error");
      return;
    }

    const mime = pickMimeType();
    mimeRef.current = mime;
    let mr: MediaRecorder;
    try {
      mr = mime
        ? new MediaRecorder(streamRef.current!, { mimeType: mime })
        : new MediaRecorder(streamRef.current!);
    } catch (e) {
      setErrMsg(`MediaRecorder 建構失敗：${(e as Error).message}`);
      setPhase("error");
      return;
    }
    chunksRef.current = [];
    mr.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    mr.onstop = () => onStop();
    mr.start(1000);
    mrRef.current = mr;
    setPhase("recording");
  }

  function stopRecording() {
    const mr = mrRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  async function onStop() {
    setPhase("uploading");
    const mime = mimeRef.current || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mime });

    const ext = mime.includes("mp4")
      ? "m4a"
      : mime.includes("webm")
        ? "webm"
        : "audio";
    const file = new File([blob], `ai-curve-${Date.now()}.${ext}`, { type: mime });

    const fd = new FormData();
    fd.append("audio", file);
    fd.append("duration_seconds", String(seconds));

    try {
      const r = await recordAiCurveNote(fd);
      if (!r.ok) {
        setErrMsg(r.error);
        setPhase("error");
        return;
      }
      setResult(r.data);
      setPhase("result");
    } catch (e) {
      setErrMsg(`上傳失敗：${(e as Error).message}`);
      setPhase("error");
    }
  }

  // ─────────────────────── render ───────────────────────

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#F4F2FA] to-[#F8F7F4] -mx-6 -my-5 px-4 py-6 sm:px-6">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <header className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-[24px] text-[#7C3AED]">
              auto_awesome
            </span>
            <h1 className="text-[20px] font-semibold text-[#2C2C2A]">
              AI Curve
            </h1>
          </div>
          <p className="text-[12.5px] text-[#5A5955]">
            接待錄音 → AI 自動整理手卡
          </p>
        </header>

        {/* IDLE */}
        {phase === "idle" && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-[#EEECE6] p-8 flex flex-col items-center gap-5">
              <button
                onClick={startRecording}
                className="relative w-36 h-36 rounded-full bg-gradient-to-br from-[#CC0000] to-[#7C3AED] text-white shadow-2xl active:scale-95 transition-transform flex items-center justify-center"
                aria-label="開始錄音"
              >
                <span className="material-symbols-outlined text-[56px]">
                  mic
                </span>
              </button>
              <div className="text-center">
                <div className="text-[15px] font-semibold text-[#2C2C2A] mb-1">
                  點擊開始接待錄音
                </div>
                <div className="text-[12px] text-[#5A5955] leading-relaxed">
                  錄完按停止 → AI 5-30 秒生成手卡欄位建議
                </div>
              </div>
            </div>

            {localRecent.length > 0 && (
              <section className="mt-6">
                <div className="flex items-baseline justify-between mb-2 px-1">
                  <h2 className="text-[12px] text-[#9A9890] font-medium uppercase tracking-wider">
                    最近紀錄
                  </h2>
                  <span className="text-[10px] text-[#9A9890] italic">
                    ← 滑動可刪除
                  </span>
                </div>
                <div className="space-y-2">
                  {localRecent.map((item) => (
                    <HistoryItem
                      key={item.id}
                      item={item}
                      onLoad={loadHistoric}
                      onDeleted={(id) =>
                        setLocalRecent((prev) => prev.filter((x) => x.id !== id))
                      }
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* RECORDING */}
        {phase === "recording" && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-[#EEECE6] p-6 flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 text-[12px] text-[#CC0000] font-medium uppercase tracking-wider">
                <span className="w-2.5 h-2.5 rounded-full bg-[#CC0000] animate-pulse" />
                錄音中
              </div>
              <div className="text-[48px] font-mono text-[#2C2C2A] tabular-nums leading-none">
                {String(Math.floor(seconds / 60)).padStart(2, "0")}:
                {String(seconds % 60).padStart(2, "0")}
              </div>
              <button
                onClick={stopRecording}
                className="w-24 h-24 rounded-full bg-[#2C2C2A] text-white shadow-xl active:scale-95 transition-transform flex flex-col items-center justify-center gap-0.5"
                aria-label="停止錄音"
              >
                <span className="material-symbols-outlined text-[34px]">
                  stop
                </span>
                <span className="text-[12px] font-semibold">停止</span>
              </button>
            </div>

            {/* 範例腳本：業務照唸用 */}
            <div className="mt-4">
              <DemoScriptPanel />
            </div>
          </>
        )}

        {/* UPLOADING */}
        {phase === "uploading" && (
          <div className="bg-white rounded-2xl shadow-sm border border-[#EEECE6] p-10 flex flex-col items-center gap-5">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border-4 border-[#7C3AED]/20" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#7C3AED] animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="material-symbols-outlined text-[#7C3AED] text-[32px]">
                  auto_awesome
                </span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-[15px] font-semibold text-[#2C2C2A] mb-1">
                AI 處理中⋯
              </div>
              <div className="text-[12px] text-[#5A5955] leading-relaxed">
                上傳錄音 + Gemini 轉錄 + 抽取 8 個欄位
                <br />
                預估 5-30 秒
              </div>
            </div>
          </div>
        )}

        {/* ERROR */}
        {phase === "error" && (
          <div className="bg-white rounded-2xl shadow-sm border border-[#F5AEAD] p-6 flex flex-col items-center gap-4">
            <div className="text-[#CC0000] text-[36px]">⚠️</div>
            <div className="text-[13px] text-[#CC0000] text-center">
              {errMsg}
            </div>
            <button
              onClick={reset}
              className="h-[36px] px-4 rounded-full bg-[#2C2C2A] text-white text-[13px] font-medium"
            >
              重試
            </button>
          </div>
        )}

        {/* RESULT */}
        {phase === "result" && result && (
          <ResultCards result={result} onClose={reset} />
        )}
      </div>
    </main>
  );
}
