"use client";

/**
 * AttachmentDropzone — 給新增 ticket 用的 file buffer 上傳區
 *
 * 為何不用 Excalidraw 內建拖檔：Excalidraw 只認圖檔，拖 PDF/txt/zip 直接 "Couldn't load invalid file" error。
 * 這個元件純 client buffer：累積 File[] 在 state，submit 時跟 ticket 一起 POST 給 server action。
 *
 * 規則：
 *   - 上限：5 個檔、單檔 20 MB（跟 FEEDBACK_ATTACHMENT_MAX_COUNT/SIZE 一致）
 *   - 任何 mime 都收（含 image，使用者要丟到附件區而不是畫布的話也行）
 *   - 圖檔顯示 thumbnail；其他顯示檔名 + 大小 + 副檔名 icon
 */

import { useRef, useState } from "react";
import {
  FEEDBACK_ATTACHMENT_MAX_COUNT,
  FEEDBACK_ATTACHMENT_MAX_SIZE,
} from "@/lib/feedback";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

export function AttachmentDropzone({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (next: File[]) => void;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(picked: FileList | File[] | null) {
    if (!picked) return;
    setError(null);
    const incoming = Array.from(picked).filter((f) => f.size > 0);
    if (incoming.length === 0) return;

    const merged = [...files, ...incoming];
    if (merged.length > FEEDBACK_ATTACHMENT_MAX_COUNT) {
      setError(`附件最多 ${FEEDBACK_ATTACHMENT_MAX_COUNT} 個（目前已 ${files.length}，再選了 ${incoming.length}）`);
      return;
    }
    for (const f of incoming) {
      if (f.size > FEEDBACK_ATTACHMENT_MAX_SIZE) {
        setError(`「${f.name}」超過單檔上限 ${(FEEDBACK_ATTACHMENT_MAX_SIZE / 1024 / 1024).toFixed(0)} MB`);
        return;
      }
    }
    onChange(merged);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeAt(idx: number) {
    onChange(files.filter((_, i) => i !== idx));
    setError(null);
  }

  const remaining = FEEDBACK_ATTACHMENT_MAX_COUNT - files.length;
  const canAdd = remaining > 0 && !disabled;

  return (
    <div className="space-y-2">
      {/* Drop zone + 點擊選檔 */}
      <div
        onDragEnter={(e) => { e.preventDefault(); if (canAdd) setDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); if (canAdd) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (canAdd) addFiles(e.dataTransfer.files);
        }}
        onClick={() => canAdd && inputRef.current?.click()}
        role="button"
        tabIndex={canAdd ? 0 : -1}
        aria-disabled={!canAdd}
        className={`flex items-center justify-center gap-2 px-4 py-5 rounded border-2 border-dashed text-[13px] transition-colors ${
          canAdd
            ? dragging
              ? "border-[#0052CC] bg-[#DEEBFF] cursor-pointer"
              : "border-[#DFE1E6] bg-[#FAFBFC] hover:border-[#B3BAC5] hover:bg-[#F4F5F7] cursor-pointer"
            : "border-[#DFE1E6] bg-[#F4F5F7] opacity-60 cursor-not-allowed"
        }`}
      >
        <span className="material-symbols-outlined text-[20px] text-[#6B778C]">attach_file</span>
        <span className="text-[#42526E]">
          {canAdd ? "拖檔到這 / 點擊選檔（PDF、影片、Excel、任何格式都可以）" : "已達附件上限"}
        </span>
        {canAdd && (
          <span className="text-[11px] text-[#6B778C]">
            還可加 {remaining} 個，單檔 ≤ {(FEEDBACK_ATTACHMENT_MAX_SIZE / 1024 / 1024).toFixed(0)} MB
          </span>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          disabled={!canAdd}
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {/* 已選清單 */}
      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 px-3 py-2 rounded border border-[#DFE1E6] bg-white"
            >
              <span className="material-symbols-outlined text-[18px] text-[#6B778C] shrink-0">
                {isImage(f.type) ? "image" : "draft"}
              </span>
              <span className="text-[12.5px] text-[#172B4D] truncate flex-1" title={f.name}>
                {f.name}
              </span>
              <span className="text-[11px] text-[#6B778C] shrink-0">
                {formatBytes(f.size)}
              </span>
              <button
                type="button"
                onClick={() => removeAt(i)}
                disabled={disabled}
                className="text-[#6B778C] hover:text-[#BF2600] disabled:opacity-50 p-0.5"
                title="移除"
                aria-label={`移除 ${f.name}`}
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 錯誤訊息 */}
      {error && (
        <p className="text-[12px] text-[#BF2600]">{error}</p>
      )}
    </div>
  );
}
