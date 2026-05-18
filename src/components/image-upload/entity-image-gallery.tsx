"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  removeEntityImageAction,
  uploadEntityImageAction,
} from "@/lib/image-upload/actions";

type EntityKey =
  | "item"
  | "new-car"
  | "used-car"
  | "customer"
  | "employee"
  | "repair-order";

export function EntityImageGallery({
  entity,
  entityId,
  images,
  alt,
  canEdit,
  width = 360,
  height = 240,
  maxImages = 12,
  emptyHint = "尚未上傳圖片",
}: {
  entity: EntityKey;
  entityId: string;
  images: string[];
  alt: string;
  canEdit: boolean;
  width?: number;
  height?: number;
  maxImages?: number;
  emptyHint?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [activeRaw, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const active = images.length === 0 ? 0 : Math.min(activeRaw, images.length - 1);

  const canAdd = canEdit && images.length < maxImages;

  const trigger = () => {
    if (!canAdd || isPending) return;
    setError(null);
    fileRef.current?.click();
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const valid = files.filter((f) => f.type.startsWith("image/"));
    if (valid.length === 0) {
      setError("僅接受圖片檔（JPG / PNG / WebP / GIF）");
      return;
    }
    const slots = maxImages - images.length;
    const queue = valid.slice(0, slots);
    if (valid.length > slots) {
      setError(`已達上限 ${maxImages} 張，僅上傳前 ${slots} 張`);
    } else {
      setError(null);
    }
    uploadBatch(queue);
  };

  const uploadBatch = (files: File[]) => {
    startTransition(async () => {
      for (const f of files) {
        const fd = new FormData();
        fd.append("file", f);
        const res = await uploadEntityImageAction(entity, entityId, fd);
        if (!res.ok) {
          setError(res.error);
          break;
        }
      }
      router.refresh();
    });
  };

  const removeAt = (url: string) => {
    if (!confirm("確定移除此圖片？")) return;
    setError(null);
    startTransition(async () => {
      const res = await removeEntityImageAction(entity, entityId, url);
      if (res.ok) {
        router.refresh();
      } else setError(res.error);
    });
  };

  const go = (delta: number) => {
    if (images.length === 0) return;
    setActive((i) => (i + delta + images.length) % images.length);
  };

  const mainUrl = images[active] ?? null;

  return (
    <div className="flex flex-col gap-1.5" style={{ width }}>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={onPick}
      />

      {/* Main display */}
      <div
        className="relative group rounded-lg border border-[#D5D3CB] bg-white flex items-center justify-center overflow-hidden"
        style={{ width, height }}
      >
        {mainUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mainUrl}
              alt={alt}
              className="w-full h-full object-cover block cursor-zoom-in"
              onClick={() => setLightbox(true)}
            />
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="absolute left-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center hover:bg-black/60"
                  aria-label="上一張"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center hover:bg-black/60"
                  aria-label="下一張"
                >
                  ›
                </button>
              </>
            )}
            <div className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-full bg-black/50 text-white text-[10.5px]">
              {active + 1} / {images.length}
            </div>
          </>
        ) : (
          <button
            type="button"
            disabled={!canAdd || isPending}
            onClick={trigger}
            className="w-full h-full flex flex-col items-center justify-center text-[#9A9890] hover:text-[#0F6E56] hover:bg-[#F8F7F4] disabled:opacity-50"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <div className="text-[11px] mt-1.5">
              {isPending ? "上傳中⋯" : canAdd ? "點擊或拖曳新增圖片" : emptyHint}
            </div>
            <div className="text-[10px] mt-0.5 text-[#B8B6AE]">JPG / PNG / WebP，上限 10MB</div>
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      {(images.length > 0 || canAdd) && (
        <div className="flex gap-1.5 flex-wrap">
          {images.map((url, i) => (
            <div
              key={url}
              className={`relative group/thumb rounded-md overflow-hidden border ${
                i === active
                  ? "border-[#1A3A5C] ring-2 ring-[#1A3A5C]/30"
                  : "border-[#D5D3CB] hover:border-[#9A9890]"
              }`}
              style={{ width: 56, height: 42 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`${alt} 縮圖 ${i + 1}`}
                className="w-full h-full object-cover cursor-pointer block"
                onClick={() => setActive(i)}
              />
              {canEdit && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAt(url);
                  }}
                  disabled={isPending}
                  className="absolute top-0 right-0 h-4 w-4 bg-black/60 text-white text-[10px] leading-none flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 hover:bg-[#CC0000] disabled:opacity-40"
                  aria-label="移除圖片"
                  title="移除"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {canAdd && (
            <button
              type="button"
              onClick={trigger}
              disabled={isPending}
              className="rounded-md border border-dashed border-[#D5D3CB] flex items-center justify-center text-[#9A9890] hover:border-[#0F6E56] hover:text-[#0F6E56] disabled:opacity-50"
              style={{ width: 56, height: 42 }}
              title="新增圖片"
            >
              <span className="text-[16px] leading-none">＋</span>
            </button>
          )}
        </div>
      )}

      {isPending && images.length > 0 && (
        <div className="text-[11px] text-[#9A9890]">上傳中⋯</div>
      )}

      {error && (
        <div className="bg-[#FDECEA] text-[#CC0000] text-[10.5px] rounded px-2 py-1">
          {error}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && mainUrl && (
        <div
          className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-6"
          onClick={() => setLightbox(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mainUrl}
            alt={alt}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(-1);
                }}
                className="absolute left-6 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/15 hover:bg-white/30 text-white text-2xl"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(1);
                }}
                className="absolute right-6 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/15 hover:bg-white/30 text-white text-2xl"
              >
                ›
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setLightbox(false)}
            className="absolute top-4 right-6 h-9 w-9 rounded-full bg-white/15 hover:bg-white/30 text-white text-xl"
            aria-label="關閉"
          >
            ×
          </button>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/15 text-white text-[12px]">
            {active + 1} / {images.length}
          </div>
        </div>
      )}
    </div>
  );
}
