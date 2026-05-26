"use client";

/**
 * AI 拍駕照 — 拍照 / 上傳圖檔 → Gemini Vision 抽 8 欄 → review 後建客戶
 *
 * State machine：idle → captured → uploading → result
 * Mobile-first：手機點按鈕直接開後鏡頭、桌機 fallback 拖曳 / 檔案選擇
 *
 * Return-to-wizard 機制：
 *   URL 帶 ?return_token=xxx → review 建客戶成功後寫 localStorage[`td_prefill_${token}`]
 *   = JSON.stringify({ customerId, name, license_no, license_class, expires_at, address, phone })
 *   → 試駕 wizard tab 的 storage event listener 讀取後 prefill 並 remove key
 *   → 本 tab 自動 window.close()
 */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  scanDrivingLicense,
  type DrivingLicenseScanResult,
  type DrivingLicenseScanListItem,
} from "@/domain/ai-driving-licenses";
import { DrivingLicenseReview } from "./driving-license-review";
import { DrivingLicenseHistoryItem } from "./driving-license-history-item";

type Phase = "idle" | "captured" | "uploading" | "result" | "error";

export function DrivingLicenseApp({
  recent,
}: {
  recent: DrivingLicenseScanListItem[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnToken = searchParams.get("return_token");

  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [result, setResult] = useState<DrivingLicenseScanResult | null>(null);
  const [historicReviewed, setHistoricReviewed] = useState<
    DrivingLicenseScanListItem["reviewed_values"] | null
  >(null);
  const [dragOver, setDragOver] = useState(false);

  const [localRecent, setLocalRecent] =
    useState<DrivingLicenseScanListItem[]>(recent);
  useEffect(() => {
    setLocalRecent(recent);
  }, [recent]);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPhase("idle");
    setErrMsg("");
    setFile(null);
    setPreviewUrl("");
    setResult(null);
    setHistoricReviewed(null);
    router.refresh();
  }

  function loadHistoric(item: DrivingLicenseScanListItem) {
    setResult({
      scanId: item.id,
      suggestions: item.ai_suggestions,
      imageSignedUrl: item.imageSignedUrl,
      latencyMs: item.ai_latency_ms ?? 0,
      sizeBytes: item.size_bytes ?? 0,
      mimeType: item.mime_type,
      tokensIn: 0,
      tokensOut: 0,
      duplicateCandidates: [],
    });
    setHistoricReviewed(item.reviewed_values);
    setPhase("result");
  }

  function acceptFile(f: File) {
    if (!f.type.startsWith("image/")) {
      setErrMsg("請選擇圖片檔（jpg / png / webp / heic）");
      setPhase("error");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setErrMsg("");
    setPhase("captured");
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) acceptFile(f);
  }

  async function uploadAndScan() {
    if (!file) return;
    setPhase("uploading");
    setErrMsg("");

    const fd = new FormData();
    fd.append("image", file);

    try {
      const r = await scanDrivingLicense(fd);
      if (!r.ok) {
        setErrMsg(r.error);
        setPhase("error");
        return;
      }
      setResult(r.data);
      setHistoricReviewed(null);
      setPhase("result");
    } catch (e) {
      setErrMsg(`上傳失敗：${(e as Error).message}`);
      setPhase("error");
    }
  }

  // ─────────────────────── render ───────────────────────

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#EEF4FB] to-[#F8F7F4] -mx-6 -my-5 px-4 py-6 sm:px-6">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <header className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-[24px] text-[#185FA5]">
              drive_eta
            </span>
            <h1 className="text-[20px] font-semibold text-[#2C2C2A]">
              AI 拍駕照
            </h1>
          </div>
          <p className="text-[12.5px] text-[#5A5955]">
            {returnToken
              ? "拍駕照 → AI 抽 8 欄 → 建客戶 → 自動帶回試駕表單"
              : "拍駕照 → AI 抽 8 欄 → 一鍵建客戶 / 登記試駕"}
          </p>
        </header>

        {/* IDLE */}
        {phase === "idle" && (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`bg-white rounded-2xl shadow-sm border-2 p-8 flex flex-col items-center gap-5 transition-colors ${
                dragOver
                  ? "border-[#185FA5] border-dashed bg-[#EAF4FB]"
                  : "border-[#EEECE6]"
              }`}
            >
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="relative w-36 h-36 rounded-full bg-gradient-to-br from-[#185FA5] to-[#1A3A5C] text-white shadow-2xl active:scale-95 transition-transform flex items-center justify-center"
                aria-label="拍駕照"
              >
                <span className="material-symbols-outlined text-[56px]">
                  photo_camera
                </span>
              </button>
              <div className="text-center">
                <div className="text-[15px] font-semibold text-[#2C2C2A] mb-1">
                  點擊拍攝駕照
                </div>
                <div className="text-[12px] text-[#5A5955] leading-relaxed">
                  Gemini 5-15 秒抽出姓名 / 駕照號 / 駕照種類 / 生日 / 有效期 /
                  性別 / 地址 / 發照單位
                </div>
              </div>

              <div className="flex items-center gap-2 w-full text-[11px] text-[#9A9890]">
                <div className="flex-1 h-px bg-[#EEECE6]" />
                <span>或</span>
                <div className="flex-1 h-px bg-[#EEECE6]" />
              </div>

              <button
                onClick={() => galleryInputRef.current?.click()}
                className="h-[36px] px-5 rounded-full bg-white border border-[#D5D3CB] text-[#5A5955] text-[13px] font-medium hover:border-[#185FA5] hover:text-[#185FA5]"
              >
                從相簿 / 檔案選擇
              </button>
              <div className="text-[11px] text-[#9A9890] -mt-3">
                桌機可直接把圖片拖到這
              </div>
            </div>

            {/* 隱藏的 file inputs */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onFileChange}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFileChange}
            />

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
                    <DrivingLicenseHistoryItem
                      key={item.id}
                      item={item}
                      onLoad={loadHistoric}
                      onDeleted={(id) =>
                        setLocalRecent((prev) =>
                          prev.filter((x) => x.id !== id),
                        )
                      }
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* CAPTURED — 預覽 + 確認上傳 */}
        {phase === "captured" && previewUrl && (
          <div className="bg-white rounded-2xl shadow-sm border border-[#EEECE6] p-5 flex flex-col items-center gap-4">
            <div className="text-[12px] text-[#9A9890] uppercase tracking-wider">
              預覽
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="駕照預覽"
              className="max-w-full max-h-[300px] rounded-lg border border-[#EEECE6] object-contain"
            />
            <div className="text-[12px] text-[#5A5955] text-center">
              駕照夠清楚就按「AI 辨識」、否則重拍
              <br />
              <span className="text-[#9A9890]">
                檔案大小：
                {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "—"}
              </span>
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={reset}
                className="flex-1 h-[44px] rounded-full bg-white border border-[#D5D3CB] text-[#5A5955] text-[14px] font-medium hover:border-[#9A9890]"
              >
                重拍
              </button>
              <button
                onClick={uploadAndScan}
                className="flex-1 h-[44px] rounded-full bg-[#185FA5] text-white text-[14px] font-semibold shadow active:scale-95 transition-transform"
              >
                AI 辨識
              </button>
            </div>
          </div>
        )}

        {/* UPLOADING */}
        {phase === "uploading" && (
          <div className="bg-white rounded-2xl shadow-sm border border-[#EEECE6] p-10 flex flex-col items-center gap-5">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border-4 border-[#185FA5]/20" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#185FA5] animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="material-symbols-outlined text-[#185FA5] text-[32px]">
                  drive_eta
                </span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-[15px] font-semibold text-[#2C2C2A] mb-1">
                AI 辨識中⋯
              </div>
              <div className="text-[12px] text-[#5A5955] leading-relaxed">
                上傳影像 + Gemini Vision 抽 8 欄
                <br />
                預估 5-15 秒
              </div>
            </div>
          </div>
        )}

        {/* ERROR */}
        {phase === "error" && (
          <div className="bg-white rounded-2xl shadow-sm border border-[#F5AEAD] p-6 flex flex-col items-center gap-4">
            <div className="text-[#CC0000] text-[36px]">⚠️</div>
            <div className="text-[13px] text-[#CC0000] text-center whitespace-pre-wrap">
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
          <DrivingLicenseReview
            result={result}
            historicReviewed={historicReviewed}
            onClose={reset}
            returnToken={returnToken}
          />
        )}
      </div>
    </main>
  );
}
