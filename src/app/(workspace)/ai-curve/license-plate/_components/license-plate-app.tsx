"use client";

/**
 * 車辨 Phase A — 拍 / 上傳機車照片 → Gemini Vision OCR 車牌 → 查 customer_vehicles
 * → 跳出客戶卡片（姓名 / 上次回廠 / 保固保險 / 近 3 筆工單）
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  scanLicensePlate,
  type ScanLicensePlateResult,
  type LicensePlateScanListItem,
} from "@/domain/license-plate";

type Phase = "idle" | "captured" | "uploading" | "result" | "error";

export function LicensePlateApp({
  recent,
}: {
  recent: LicensePlateScanListItem[];
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [result, setResult] = useState<ScanLicensePlateResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [localRecent, setLocalRecent] =
    useState<LicensePlateScanListItem[]>(recent);
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
  }

  function acceptFile(f: File) {
    if (!f.type.startsWith("image/")) {
      setErrMsg("請選擇圖片檔");
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

  async function recognize() {
    if (!file) return;
    setPhase("uploading");
    setErrMsg("");
    const fd = new FormData();
    fd.append("image", file);
    try {
      const r = await scanLicensePlate(fd);
      if (!r.ok) {
        setErrMsg(r.error);
        setPhase("error");
        return;
      }
      setResult(r.data);
      setPhase("result");
    } catch (e) {
      setErrMsg(`辨識失敗：${(e as Error).message}`);
      setPhase("error");
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#FFF7E6] to-[#F8F7F4] -mx-6 -my-5 px-4 py-6 sm:px-6">
      <div className="max-w-md mx-auto">
        <header className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-[24px] text-[#854F0B]">
              directions_bike
            </span>
            <h1 className="text-[20px] font-semibold text-[#2C2C2A]">
              AI 車牌辨識
            </h1>
          </div>
          <p className="text-[12.5px] text-[#5A5955]">
            拍車牌 → 秒查客戶 / 上次回廠 / 待保養
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
                  ? "border-[#854F0B] border-dashed bg-[#FDF3E3]"
                  : "border-[#EEECE6]"
              }`}
            >
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="relative w-36 h-36 rounded-full bg-gradient-to-br from-[#854F0B] to-[#5B3505] text-white shadow-2xl active:scale-95 transition-transform flex items-center justify-center"
                aria-label="拍車牌"
              >
                <span className="material-symbols-outlined text-[56px]">
                  photo_camera
                </span>
              </button>
              <div className="text-center">
                <div className="text-[15px] font-semibold text-[#2C2C2A] mb-1">
                  拍機車照片
                </div>
                <div className="text-[12px] text-[#5A5955] leading-relaxed">
                  Gemini 3-5 秒 OCR 車牌 → 自動比對 customer_vehicles
                </div>
              </div>

              <div className="flex items-center gap-2 w-full text-[11px] text-[#9A9890]">
                <div className="flex-1 h-px bg-[#EEECE6]" />
                <span>或</span>
                <div className="flex-1 h-px bg-[#EEECE6]" />
              </div>

              <button
                onClick={() => galleryInputRef.current?.click()}
                className="h-[36px] px-5 rounded-full bg-white border border-[#D5D3CB] text-[#5A5955] text-[13px] font-medium hover:border-[#854F0B] hover:text-[#854F0B]"
              >
                從相簿 / 檔案選擇
              </button>
              <div className="text-[11px] text-[#9A9890] -mt-3">
                桌機可拖圖進來
              </div>
            </div>

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
                <h2 className="text-[12px] text-[#9A9890] font-medium uppercase tracking-wider mb-2 px-1">
                  最近辨識
                </h2>
                <div className="space-y-2">
                  {localRecent.map((item) => (
                    <RecentScanItem key={item.id} item={item} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* CAPTURED */}
        {phase === "captured" && previewUrl && (
          <div className="bg-white rounded-2xl shadow-sm border border-[#EEECE6] p-5 flex flex-col items-center gap-4">
            <div className="text-[12px] text-[#9A9890] uppercase tracking-wider">
              預覽
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="預覽"
              className="max-w-full max-h-[300px] rounded-lg border border-[#EEECE6] object-contain"
            />
            <div className="text-[12px] text-[#5A5955] text-center">
              車牌清楚就按「AI 辨識」、否則重拍
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={reset}
                className="flex-1 h-[44px] rounded-full bg-white border border-[#D5D3CB] text-[#5A5955] text-[14px] font-medium hover:border-[#9A9890]"
              >
                重拍
              </button>
              <button
                onClick={recognize}
                className="flex-1 h-[44px] rounded-full bg-[#854F0B] text-white text-[14px] font-semibold shadow active:scale-95 transition-transform"
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
              <div className="absolute inset-0 rounded-full border-4 border-[#854F0B]/20" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#854F0B] animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="material-symbols-outlined text-[#854F0B] text-[32px]">
                  directions_bike
                </span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-[15px] font-semibold text-[#2C2C2A] mb-1">
                辨識中⋯
              </div>
              <div className="text-[12px] text-[#5A5955]">
                上傳 + Gemini OCR + DB lookup
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
          <ResultCard result={result} onReset={reset} />
        )}
      </div>
    </main>
  );
}

// ─── Result card ────────────────────────────────────────

function ResultCard({
  result,
  onReset,
}: {
  result: ScanLicensePlateResult;
  onReset: () => void;
}) {
  const conf = Math.round(result.confidence * 100);
  const confColor =
    conf >= 80
      ? "#3B6D11"
      : conf >= 50
        ? "#854F0B"
        : "#CC0000";

  return (
    <div className="space-y-3">
      {/* 上半：辨識結果 */}
      <div className="bg-white rounded-2xl shadow-sm border border-[#EEECE6] p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-[11px] text-[#9A9890] uppercase tracking-wider mb-1">
              辨識車牌
            </div>
            {result.plate ? (
              <div className="text-[32px] font-mono font-bold text-[#2C2C2A] tracking-wider">
                {result.plate}
              </div>
            ) : (
              <div className="text-[18px] text-[#9A9890]">（看不清車牌）</div>
            )}
          </div>
          <span
            className="px-2 py-1 rounded-md text-[11.5px] font-semibold"
            style={{
              backgroundColor: `${confColor}15`,
              color: confColor,
            }}
          >
            信心 {conf}%
          </span>
        </div>
        {result.evidence && (
          <div className="text-[11px] text-[#9A9890] italic border-t border-[#EEECE6] pt-2 mt-2">
            「{result.evidence}」
          </div>
        )}
        {result.imageSignedUrl && (
          <div className="mt-3 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.imageSignedUrl}
              alt="原圖"
              className="max-w-full max-h-[160px] rounded border border-[#EEECE6] object-contain"
            />
          </div>
        )}
        <div className="text-[10.5px] text-[#9A9890] tabular-nums mt-2 text-right">
          {result.latencyMs} ms
        </div>
      </div>

      {/* 下半：match 結果 */}
      {result.matched ? (
        <MatchedCustomerCard matched={result.matched} />
      ) : result.plate ? (
        <NoMatchCard plate={result.plate} />
      ) : null}

      {/* Ambiguous 警告 */}
      {result.ambiguous.length > 0 && (
        <div className="bg-[#FDF3E3] border border-[#F5C977] rounded-2xl p-4">
          <div className="text-[12.5px] text-[#854F0B] font-medium mb-1">
            ⚠️ 找到 {result.ambiguous.length + 1} 筆同車牌、列在上方的是預設
          </div>
        </div>
      )}

      <button
        onClick={onReset}
        className="w-full h-[44px] rounded-full bg-white border border-[#D5D3CB] text-[#5A5955] text-[14px] font-medium hover:border-[#9A9890]"
      >
        重新拍
      </button>
    </div>
  );
}

function MatchedCustomerCard({
  matched,
}: {
  matched: NonNullable<ScanLicensePlateResult["matched"]>;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border-2 border-[#3B6D11]/30 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[20px] text-[#3B6D11]">
          check_circle
        </span>
        <span className="text-[12px] text-[#3B6D11] font-semibold uppercase tracking-wider">
          已建檔客戶
        </span>
      </div>

      <div>
        <div className="text-[20px] font-semibold text-[#2C2C2A]">
          {matched.customer_name}
        </div>
        {matched.customer_phone && (
          <a
            href={`tel:${matched.customer_phone}`}
            className="text-[12.5px] text-[#185FA5] hover:underline"
          >
            📞 {matched.customer_phone}
          </a>
        )}
      </div>

      {/* 車輛資訊 */}
      <div className="bg-[#F8F7F4] rounded-lg p-3 text-[12px] space-y-1">
        <div className="flex justify-between">
          <span className="text-[#9A9890]">車型</span>
          <span className="text-[#2C2C2A] font-medium">
            {matched.vehicle_model_name ?? "—"}
            {matched.manufactured_year ? `（${matched.manufactured_year} 年式）` : ""}
          </span>
        </div>
        {matched.current_mileage != null && (
          <div className="flex justify-between">
            <span className="text-[#9A9890]">里程</span>
            <span className="font-mono">{matched.current_mileage} km</span>
          </div>
        )}
        {matched.last_service_date && (
          <div className="flex justify-between">
            <span className="text-[#9A9890]">上次保養</span>
            <span>{matched.last_service_date}</span>
          </div>
        )}
        {matched.next_service_due_date && (
          <div className="flex justify-between">
            <span className="text-[#9A9890]">下次保養</span>
            <span className="text-[#854F0B] font-medium">
              {matched.next_service_due_date}
            </span>
          </div>
        )}
        {matched.warranty_until && (
          <div className="flex justify-between">
            <span className="text-[#9A9890]">保固至</span>
            <span>{matched.warranty_until}</span>
          </div>
        )}
        {matched.insurance_until && (
          <div className="flex justify-between">
            <span className="text-[#9A9890]">保險至</span>
            <span>{matched.insurance_until}</span>
          </div>
        )}
        {matched.vin && (
          <div className="flex justify-between">
            <span className="text-[#9A9890]">VIN</span>
            <span className="font-mono text-[11px]">{matched.vin}</span>
          </div>
        )}
      </div>

      {/* 近 3 筆工單 */}
      {matched.recent_ros.length > 0 && (
        <div>
          <div className="text-[11.5px] text-[#9A9890] font-medium mb-1.5">
            近 3 筆工單
          </div>
          <div className="space-y-1">
            {matched.recent_ros.map((r) => (
              <div
                key={r.ro_code}
                className="flex items-center justify-between text-[12px] bg-white border border-[#EEECE6] rounded px-2 py-1"
              >
                <div>
                  <span className="font-mono text-[#185FA5] font-medium">
                    {r.ro_code}
                  </span>
                  <span className="text-[#9A9890] ml-2">{r.issue_date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10.5px] px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor:
                        r.status === "已關單" ? "#EAF3DE" : "#FDF3E3",
                      color: r.status === "已關單" ? "#3B6D11" : "#854F0B",
                    }}
                  >
                    {r.status}
                  </span>
                  {r.total != null && (
                    <span className="font-mono text-[#5A5955]">
                      NT${r.total}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Link
          href={`/admin/master-data/customers/${matched.customer_id}`}
          className="h-[40px] rounded-full bg-[#1A3A5C] text-white text-[12.5px] font-semibold flex items-center justify-center hover:bg-[#0F2A45]"
        >
          開啟客戶詳情
        </Link>
        <Link
          href={`/service/appointments/new?customer_id=${matched.customer_id}&vehicle_id=${matched.vehicle_id}`}
          className="h-[40px] rounded-full bg-[#0F6E56] text-white text-[12.5px] font-semibold flex items-center justify-center hover:bg-[#0a5742]"
        >
          開維修預約
        </Link>
      </div>
    </div>
  );
}

function NoMatchCard({ plate }: { plate: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border-2 border-[#F5C977] p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[20px] text-[#854F0B]">
          help
        </span>
        <span className="text-[12px] text-[#854F0B] font-semibold uppercase tracking-wider">
          系統內查無此車
        </span>
      </div>
      <div className="text-[13px] text-[#5A5955]">
        車牌「
        <span className="font-mono font-bold text-[#2C2C2A]">{plate}</span>
        」可能是新客戶 / 路人車 / 同行車輛。
      </div>
      <Link
        href={`/admin/master-data/customers/new`}
        className="block w-full h-[40px] rounded-full bg-[#0F6E56] text-white text-[12.5px] font-semibold flex items-center justify-center hover:bg-[#0a5742]"
      >
        ＋ 建立新客戶
      </Link>
    </div>
  );
}

function RecentScanItem({ item }: { item: LicensePlateScanListItem }) {
  const conf = Math.round((item.ai_confidence ?? 0) * 100);
  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg px-3 py-2 flex items-center gap-3">
      {item.imageSignedUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageSignedUrl}
          alt=""
          className="w-12 h-12 rounded object-cover border border-[#EEECE6] shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded bg-[#F2F2F2] flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[#9A9890] text-[20px]">
            directions_bike
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono text-[13px] font-semibold text-[#2C2C2A]">
            {item.ai_plate || "—"}
          </span>
          <span className="text-[10.5px] text-[#9A9890]">{conf}%</span>
        </div>
        <div className="text-[11px] text-[#5A5955] truncate">
          {item.matched_customer_name
            ? `→ ${item.matched_customer_name}`
            : "（未匹配）"}
        </div>
      </div>
      <span className="text-[10.5px] text-[#9A9890] shrink-0">
        {new Date(item.created_at).toLocaleString("zh-TW", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    </div>
  );
}
