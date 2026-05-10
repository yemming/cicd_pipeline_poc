"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

export type EditableSpec<T> = {
  type: "text" | "textarea";
  getValue: (row: T) => string;
  onSave: (row: T, value: string) => Promise<{ ok: boolean; error?: string }>;
};

export function EditableCell<T>({
  row,
  renderValue,
  editable,
  onSaved,
}: {
  row: T;
  renderValue: (row: T) => React.ReactNode;
  editable: EditableSpec<T>;
  onSaved?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      }
    }
  }, [editing]);

  const startEdit = () => {
    if (pending) return;
    setValue(editable.getValue(row));
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    if (pending) return;
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    const original = editable.getValue(row);
    if (value === original) {
      setEditing(false);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await editable.onSave(row, value);
      if (result.ok) {
        setEditing(false);
        onSaved?.();
      } else {
        setError(result.error ?? "儲存失敗");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setPending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
      return;
    }
    if (e.key === "Enter") {
      if (editable.type === "text") {
        e.preventDefault();
        void save();
      } else if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        void save();
      }
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEdit}
        className="text-left w-full px-1 py-0.5 -mx-1 -my-0.5 rounded hover:bg-[#EEF4FB] focus:bg-[#EEF4FB] focus:outline-none"
        title="點擊編輯"
      >
        {renderValue(row)}
      </button>
    );
  }

  const baseClass =
    "w-full border border-[#185FA5] rounded px-2 text-[12.5px] focus:outline-none disabled:opacity-60";

  return (
    <div className="relative">
      {editable.type === "textarea" ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => void save()}
          disabled={pending}
          rows={2}
          className={`${baseClass} py-1 min-h-[44px] resize-y`}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => void save()}
          disabled={pending}
          className={`${baseClass} h-[28px]`}
        />
      )}
      {pending && (
        <span className="absolute right-2 top-1.5 text-[10px] text-[#9A9890] pointer-events-none">
          儲存中⋯
        </span>
      )}
      {error && (
        <div className="absolute top-full left-0 z-20 mt-1 px-2 py-1 bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] text-[11px] rounded shadow-lg whitespace-nowrap max-w-[280px]">
          {error}
        </div>
      )}
    </div>
  );
}
