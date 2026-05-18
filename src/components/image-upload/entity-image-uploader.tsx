"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  removeEntityImageAction,
  uploadEntityImageAction,
} from "@/lib/image-upload/actions";
import { BadgeCropperModal } from "@/app/(workspace)/admin/navigation/_components/badge-cropper-modal";

type EntityKey =
  | "item"
  | "new-car"
  | "used-car"
  | "customer"
  | "employee"
  | "repair-order";

export function EntityImageUploader({
  entity,
  entityId,
  imageUrl,
  alt,
  canEdit,
  width = 260,
  height = 120,
  cropRatio = 1,
  cropTitle,
  promptText = "點擊上傳圖片",
  rounded = "lg",
}: {
  entity: EntityKey;
  entityId: string;
  imageUrl: string | null;
  alt: string;
  canEdit: boolean;
  width?: number;
  height?: number;
  /** 預設裁切比例。1 = 方形（avatar），undefined = 自由 */
  cropRatio?: number | undefined;
  cropTitle?: string;
  promptText?: string;
  /** "lg" = rounded-lg, "full" = rounded-full（avatar 圓框） */
  rounded?: "lg" | "full";
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [previewBust, setPreviewBust] = useState(0);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const trigger = () => {
    if (!canEdit || isPending) return;
    setError(null);
    fileRef.current?.click();
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("僅接受圖片檔（JPG / PNG / WebP / GIF）");
      e.target.value = "";
      return;
    }
    setPendingFile(f);
    e.target.value = "";
  };

  const onCropConfirm = (cropped: File) => {
    const fd = new FormData();
    fd.append("file", cropped);
    startTransition(async () => {
      const res = await uploadEntityImageAction(entity, entityId, fd);
      if (res.ok) {
        setPendingFile(null);
        setPreviewBust(Date.now());
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  const onCropCancel = () => {
    if (!isPending) setPendingFile(null);
  };

  const remove = () => {
    if (!confirm("確定移除此圖片？")) return;
    setError(null);
    startTransition(async () => {
      const res = await removeEntityImageAction(entity, entityId);
      if (res.ok) {
        setPreviewBust(Date.now());
        router.refresh();
      } else setError(res.error);
    });
  };

  const displayUrl = imageUrl
    ? previewBust
      ? `${imageUrl}${imageUrl.includes("?") ? "&" : "?"}_=${previewBust}`
      : imageUrl
    : null;

  const roundedClass = rounded === "full" ? "rounded-full" : "rounded-lg";

  return (
    <div className="flex flex-col items-stretch gap-1.5" style={{ width }}>
      <div
        className={`relative group ${roundedClass} border border-[#D5D3CB] bg-white flex items-center justify-center overflow-hidden`}
        style={{ width, height }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={onPick}
        />
        {displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayUrl}
            alt={alt}
            className="w-full h-full object-cover block"
          />
        ) : (
          <button
            type="button"
            disabled={!canEdit || isPending}
            onClick={trigger}
            className="w-full h-full flex flex-col items-center justify-center text-[#9A9890] hover:text-[#0F6E56] hover:bg-[#F8F7F4] disabled:opacity-50"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <div className="text-[11px] mt-1.5">{isPending ? "處理中…" : promptText}</div>
            <div className="text-[10px] mt-0.5 text-[#B8B6AE]">JPG / PNG / WebP，上限 10MB</div>
          </button>
        )}

        {displayUrl && canEdit ? (
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-1.5">
            <button
              type="button"
              onClick={trigger}
              disabled={isPending}
              className="h-[26px] px-3 rounded-full text-[11px] bg-white text-[#1A3A5C] disabled:opacity-60"
            >
              {isPending ? "處理中…" : "更換圖片"}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={isPending}
              className="h-[26px] px-3 rounded-full text-[11px] bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
            >
              移除
            </button>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="bg-[#FDECEA] text-[#CC0000] text-[10.5px] rounded px-2 py-1">
          {error}
        </div>
      ) : null}

      <BadgeCropperModal
        file={pendingFile}
        pending={isPending}
        onCancel={onCropCancel}
        onConfirm={onCropConfirm}
        defaultRatio={cropRatio}
        title={cropTitle ?? "調整圖片"}
        description="拖曳移動、滑鼠滾輪縮放、選擇比例 — 直到右側預覽看起來對。"
        previewLabel="預覽"
        ratioHint="可選 1:1 方形、4:3 橫式或自由比例。"
      />
    </div>
  );
}
