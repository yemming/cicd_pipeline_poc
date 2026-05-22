"use client";

import { useEffect, useRef, useState } from "react";
import { transcribeAndExtract, type SpikeResult } from "./action";

type RecState = "idle" | "permission" | "recording" | "uploading" | "done" | "error";

const TIMING_LABEL: Record<string, string> = {
  now: "當下下訂",
  "3m": "3 個月內",
  "6m": "半年內",
  explore: "純探詢",
};

const FIELD_LABEL: Record<string, string> = {
  customer_summary: "客戶需求摘要",
  intent_level: "意向級別 (1-5)",
  purchase_timing: "預期購車時機",
  competitor_brand: "競品品牌",
  followup_date: "下次追蹤日期",
};

function pickMimeType(): string {
  // iOS Safari → audio/mp4; Android Chrome → audio/webm;codecs=opus
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
  return ""; // 讓瀏覽器自己挑
}

export function VoiceRecorder() {
  const [state, setState] = useState<RecState>("idle");
  const [errMsg, setErrMsg] = useState<string>("");
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<SpikeResult | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef = useRef<string>("");

  // 計時器
  useEffect(() => {
    if (state === "recording") {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state]);

  // 卸載時清 stream
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function startRecording() {
    setErrMsg("");
    setResult(null);
    setSeconds(0);
    setAudioUrl(null);
    setState("permission");

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErrMsg("瀏覽器不支援錄音（getUserMedia 不存在）");
      setState("error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
    } catch (e) {
      const err = e as Error;
      setErrMsg(
        err.name === "NotAllowedError"
          ? "麥克風權限被拒。請到瀏覽器設定打開、或重新整理頁面再試。"
          : `getUserMedia 失敗：${err.message}`,
      );
      setState("error");
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
      setState("error");
      return;
    }
    chunksRef.current = [];
    mr.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    mr.onstop = () => onStop();
    mr.start(1000); // 1 秒一個 chunk
    mediaRecorderRef.current = mr;
    setState("recording");
  }

  function stopRecording() {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  async function onStop() {
    setState("uploading");
    const mime = mimeRef.current || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mime });
    setAudioUrl(URL.createObjectURL(blob));

    const ext = mime.includes("mp4") ? "m4a" : mime.includes("webm") ? "webm" : "audio";
    const file = new File([blob], `recording.${ext}`, { type: mime });

    const fd = new FormData();
    fd.append("audio", file);

    try {
      const r = await transcribeAndExtract(fd);
      setResult(r);
      setState("done");
    } catch (e) {
      setErrMsg(`上傳/Gemini 失敗：${(e as Error).message}`);
      setState("error");
    }
  }

  function reset() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setResult(null);
    setErrMsg("");
    setSeconds(0);
    setState("idle");
  }

  return (
    <div className="min-h-screen bg-[#F8F7F4] px-4 py-6 max-w-2xl mx-auto">
      <h1 className="text-[18px] font-semibold text-[#2C2C2A] mb-1">
        🎙️ 手卡錄音 spike
      </h1>
      <p className="text-[12px] text-[#9A9890] mb-5">
        Gemini 2.5 Flash 轉錄 + 5 欄位抽取。
        <br />
        錄完按停止會自動上傳、~5-30 秒後出結果。
      </p>

      {/* 主要錄音控制 */}
      <div className="bg-white border border-[#EEECE6] rounded-lg p-6 flex flex-col items-center gap-4">
        {state === "idle" && (
          <button
            onClick={startRecording}
            className="w-32 h-32 rounded-full bg-[#CC0000] text-white text-[15px] font-semibold shadow-lg active:scale-95 transition-transform"
          >
            ● 開始錄音
          </button>
        )}

        {state === "permission" && (
          <div className="text-[14px] text-[#9A9890]">請允許麥克風權限⋯</div>
        )}

        {state === "recording" && (
          <>
            <div className="flex items-center gap-2 text-[13px] text-[#CC0000] font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-[#CC0000] animate-pulse" />
              錄音中
            </div>
            <div className="text-[42px] font-mono text-[#2C2C2A] tabular-nums">
              {String(Math.floor(seconds / 60)).padStart(2, "0")}:
              {String(seconds % 60).padStart(2, "0")}
            </div>
            <button
              onClick={stopRecording}
              className="w-32 h-32 rounded-full bg-[#2C2C2A] text-white text-[15px] font-semibold shadow-lg active:scale-95 transition-transform"
            >
              ■ 停止
            </button>
          </>
        )}

        {state === "uploading" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-10 h-10 border-4 border-[#1A3A5C]/30 border-t-[#1A3A5C] rounded-full animate-spin" />
            <div className="text-[13px] text-[#5A5955]">
              上傳 + Gemini 處理中⋯（5-30 秒）
            </div>
          </div>
        )}

        {state === "done" && (
          <button
            onClick={reset}
            className="px-4 py-2 rounded bg-[#1A3A5C] text-white text-[13px]"
          >
            🔁 再錄一次
          </button>
        )}

        {state === "error" && (
          <button
            onClick={reset}
            className="px-4 py-2 rounded bg-white border border-[#D5D3CB] text-[#5A5955] text-[13px]"
          >
            重試
          </button>
        )}
      </div>

      {/* 錯誤訊息 */}
      {errMsg && (
        <div className="mt-4 px-4 py-3 rounded bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] text-[13px]">
          ❌ {errMsg}
        </div>
      )}

      {/* 結果區 */}
      {result?.ok && (
        <div className="mt-5 space-y-4">
          {/* 中繼資料 */}
          <div className="bg-white border border-[#EEECE6] rounded-lg p-4 text-[12px] text-[#5A5955]">
            <div className="grid grid-cols-2 gap-y-1">
              <span className="text-[#9A9890]">latency</span>
              <span className="font-mono">
                {(result.latencyMs / 1000).toFixed(1)} 秒
              </span>
              <span className="text-[#9A9890]">audio size</span>
              <span className="font-mono">
                {(result.sizeBytes / 1024).toFixed(1)} KB
              </span>
              <span className="text-[#9A9890]">mime</span>
              <span className="font-mono">{result.mimeType}</span>
              <span className="text-[#9A9890]">tokens</span>
              <span className="font-mono">
                {result.tokens.prompt} → {result.tokens.output}
              </span>
            </div>
          </div>

          {/* audio playback */}
          {audioUrl && (
            <div className="bg-white border border-[#EEECE6] rounded-lg p-4">
              <div className="text-[11px] text-[#9A9890] mb-2">🔊 你剛錄的音檔</div>
              <audio controls src={audioUrl} className="w-full" />
            </div>
          )}

          {/* transcript */}
          <div className="bg-white border border-[#EEECE6] rounded-lg p-4">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A] mb-2">
              📜 逐字稿
            </h2>
            <p className="text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap leading-relaxed">
              {result.transcript || (
                <span className="text-[#9A9890] italic">
                  （空 — Gemini 沒聽出對話內容）
                </span>
              )}
            </p>
          </div>

          {/* suggestions */}
          <div className="bg-white border border-[#EEECE6] rounded-lg p-4">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A] mb-3">
              🎯 AI 建議（5 欄位）
            </h2>
            <div className="space-y-3">
              {Object.entries(result.suggestions).map(([key, info]) => {
                const conf = Math.round(info.confidence * 100);
                const tone =
                  conf >= 70
                    ? "bg-[#EAF3DE] text-[#3B6D11]"
                    : conf >= 40
                      ? "bg-[#FDF3E3] text-[#854F0B]"
                      : "bg-[#F2F2F2] text-[#6B6A68]";
                const displayValue =
                  key === "purchase_timing" && typeof info.value === "string"
                    ? `${TIMING_LABEL[info.value] ?? info.value}（${info.value}）`
                    : String(info.value || "(空)");
                return (
                  <div
                    key={key}
                    className="border-l-4 border-[#EEECE6] pl-3 py-1"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[12px] text-[#9A9890]">
                        {FIELD_LABEL[key] ?? key}
                      </span>
                      <span
                        className={`text-[10.5px] px-1.5 py-0.5 rounded ${tone}`}
                      >
                        {conf}%
                      </span>
                    </div>
                    <div className="text-[13px] text-[#2C2C2A] font-medium">
                      {displayValue}
                    </div>
                    {info.evidence_quote && (
                      <div className="text-[11.5px] text-[#5A5955] italic mt-1">
                        ⤷ &ldquo;{info.evidence_quote}&rdquo;
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {result && !result.ok && (
        <div className="mt-4 px-4 py-3 rounded bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] text-[13px]">
          ❌ {result.error}
        </div>
      )}
    </div>
  );
}
