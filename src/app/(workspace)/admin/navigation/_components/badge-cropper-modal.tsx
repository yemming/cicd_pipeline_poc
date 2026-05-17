"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

import { AlertDialog } from "@/components/ui/confirm-dialog";

type Ratio = { label: string; value: number | undefined };

const RATIOS: Ratio[] = [
  { label: "4 : 1（寬 banner）", value: 4 },
  { label: "3 : 1", value: 3 },
  { label: "2 : 1", value: 2 },
  { label: "1 : 1（方形）", value: 1 },
  { label: "自由比例", value: undefined },
];

const DEFAULT_RATIO = 4;

export type BadgeCropperModalProps = {
  /** 使用者選的原始檔（File 或 dataURL/objectURL）。null 時不顯示 modal。 */
  file: File | null;
  /** 取消（關 modal、清掉 input 值） */
  onCancel: () => void;
  /** 確認後拿到裁切完成的 File（已轉 PNG），呼叫端負責 upload */
  onConfirm: (croppedFile: File) => void;
  /** 上傳中狀態，按鈕禁用 */
  pending?: boolean;
  /** Modal 標題；預設「調整 Badge 圖檔」 */
  title?: string;
  /** Modal 副標；預設「拖曳移動、滑鼠滾輪縮放、選擇比例 — 直到右側預覽看起來對。」 */
  description?: string;
  /** 預設裁切比例；預設 4（=4:1 寬 banner）。傳 1 = 方形，傳 undefined = 自由比例 */
  defaultRatio?: number | undefined;
  /** 預覽區標題；預設「Topbar 左上預覽（白底模擬）」 */
  previewLabel?: string;
  /** 預覽區比例 hint；預設「建議用 4:1 — Topbar 左上 logo 區可用空間約 192×56，比例對才不會留白或被切。」 */
  ratioHint?: string;
};

export function BadgeCropperModal({
  file,
  onCancel,
  onConfirm,
  pending,
  title = "調整 Badge 圖檔",
  description = "拖曳移動、滑鼠滾輪縮放、選擇比例 — 直到右側預覽看起來對。",
  defaultRatio = DEFAULT_RATIO,
  previewLabel = "Topbar 左上預覽（白底模擬）",
  ratioHint = "建議用 4:1 — Topbar 左上 logo 區可用空間約 192×56，比例對才不會留白或被切。",
}: BadgeCropperModalProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState<number | undefined>(defaultRatio);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [working, setWorking] = useState(false);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  // file → object URL（unmount 時 revoke 避免 leak）
  useEffect(() => {
    if (!file) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleConfirm = async () => {
    if (!imageUrl || !croppedAreaPixels || !file) return;
    setWorking(true);
    try {
      const blob = await renderCroppedBlob(imageUrl, croppedAreaPixels, rotation);
      // 統一輸出 png（保留透明度），檔名 keeping origin stem + -cropped.png
      const stem = file.name.replace(/\.[^.]+$/, "") || "badge";
      const cropped = new File([blob], `${stem}-cropped.png`, { type: "image/png" });
      onConfirm(cropped);
    } catch (err) {
      setAlertMsg(`裁切失敗：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setWorking(false);
    }
  };

  if (!file || !imageUrl) return null;

  const busy = pending || working;

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/30">
          <div>
            <h3 className="text-base font-bold font-display flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-[color:var(--color-brand-primary)]">crop</span>
              {title}
            </h3>
            <p className="text-[11px] text-on-surface-variant mt-0.5">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-low disabled:opacity-60"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Cropper canvas */}
          <div className="relative w-full h-[320px] bg-[#1A1A2E] rounded-xl overflow-hidden">
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
              objectFit="contain"
              showGrid={true}
              restrictPosition={false}
            />
          </div>

          {/* Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                縮放（{zoom.toFixed(2)}×）
              </label>
              <input
                type="range"
                min={0.5}
                max={4}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                disabled={busy}
                className="w-full accent-[color:var(--color-brand-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                旋轉（{rotation}°）
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={rotation}
                  onChange={(e) => setRotation(Number(e.target.value))}
                  disabled={busy}
                  className="flex-1 accent-[color:var(--color-brand-primary)]"
                />
                <button
                  type="button"
                  onClick={() => setRotation(0)}
                  disabled={busy}
                  title="重設旋轉"
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-container-low text-on-surface-variant"
                >
                  <span className="material-symbols-outlined text-base">restart_alt</span>
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">裁切比例</label>
            <div className="flex flex-wrap gap-1.5">
              {RATIOS.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => setAspect(r.value)}
                  disabled={busy}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    aspect === r.value
                      ? "border-[color:var(--color-brand-primary)] bg-[color:var(--color-brand-primary)]/10 text-[color:var(--color-brand-primary)] font-medium"
                      : "border-outline-variant/40 hover:bg-surface-container-low"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-on-surface-variant mt-1.5">
              {ratioHint}
            </p>
          </div>

          {/* Preview — 模擬深色 sidebar 底部 */}
          <PreviewBox imageUrl={imageUrl} crop={croppedAreaPixels} rotation={rotation} label={previewLabel} />
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-outline-variant/30 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-lg border border-outline-variant/40 hover:bg-surface-container-low disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || !croppedAreaPixels}
            className="px-5 py-2 text-sm rounded-lg bg-[color:var(--color-brand-primary)] text-white font-medium hover:bg-[color:var(--color-brand-primary-dark)] disabled:opacity-60 flex items-center gap-2"
          >
            {busy && <Spinner />}
            {busy ? "處理中…" : "確認並上傳"}
          </button>
        </div>
      </div>

      {alertMsg && (
        <AlertDialog
          title="裁切失敗"
          message={alertMsg}
          variant="error"
          onClose={() => setAlertMsg(null)}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Live preview — 用同一份 cropped 區域畫到小 canvas，疊在深色 sidebar 上
// ──────────────────────────────────────────────────────────
function PreviewBox({
  imageUrl,
  crop,
  rotation,
  label,
}: {
  imageUrl: string;
  crop: Area | null;
  rotation: number;
  label: string;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!crop) return;
    renderCroppedBlob(imageUrl, crop, rotation)
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      })
      .catch(() => {
        /* 預覽失敗可忽略 */
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl, crop, rotation]);

  return (
    <div>
      <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
        {label}
      </label>
      <div className="w-full max-w-[192px] bg-white border border-outline-variant/30 rounded-lg p-2 mx-auto">
        <div className="flex items-center justify-center min-h-12">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="preview"
              className="max-h-12 max-w-full object-contain"
            />
          ) : (
            <span className="text-on-surface-variant/50 text-xs">產生預覽中…</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 把 cropper 給的像素座標 + rotation 變成裁切後的 PNG Blob
// 參考 react-easy-crop 官方 demo 的 getCroppedImg 實作。
// ──────────────────────────────────────────────────────────
function renderCroppedBlob(imageUrl: string, pixelCrop: Area, rotation: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onerror = () => reject(new Error("圖檔載入失敗"));
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("瀏覽器不支援 canvas 2d context");

        const rotRad = (rotation * Math.PI) / 180;

        // bounding box 含旋轉後的整張圖大小
        const { width: bBoxW, height: bBoxH } = rotatedSize(img.width, img.height, rotRad);

        // 先在 bbox 大小畫旋轉過的整張圖
        canvas.width = bBoxW;
        canvas.height = bBoxH;
        ctx.translate(bBoxW / 2, bBoxH / 2);
        ctx.rotate(rotRad);
        ctx.translate(-img.width / 2, -img.height / 2);
        ctx.drawImage(img, 0, 0);

        // 把旋轉後的像素資料拿出來
        const data = ctx.getImageData(0, 0, bBoxW, bBoxH);

        // resize canvas 到裁切尺寸
        canvas.width = Math.round(pixelCrop.width);
        canvas.height = Math.round(pixelCrop.height);

        // 把旋轉後的影像放回 canvas，再用 negative 平移到裁切起點
        ctx.putImageData(data, Math.round(-pixelCrop.x), Math.round(-pixelCrop.y));

        canvas.toBlob(
          (blob) => {
            if (!blob) reject(new Error("toBlob 回傳 null"));
            else resolve(blob);
          },
          "image/png",
          1,
        );
      } catch (err) {
        reject(err);
      }
    };
    img.src = imageUrl;
  });
}

function rotatedSize(width: number, height: number, rotation: number) {
  return {
    width: Math.abs(Math.cos(rotation) * width) + Math.abs(Math.sin(rotation) * height),
    height: Math.abs(Math.sin(rotation) * width) + Math.abs(Math.cos(rotation) * height),
  };
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
