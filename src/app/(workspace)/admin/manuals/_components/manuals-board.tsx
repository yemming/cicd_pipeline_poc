"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  uploadManual,
  reindexManual,
  deleteManual,
  type ManualListItem,
  type VehicleModelOption,
} from "@/domain/manuals";
import {
  reindexSource,
  type ReindexProgress,
} from "@/domain/rag-ingest";
import {
  listIngestableSourceMeta,
  resolveIcon,
  resolveLabel,
} from "@/lib/ai/rag-registry";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function statusChip(s: ManualListItem["status"]) {
  const map: Record<ManualListItem["status"], { bg: string; text: string; label: string }> = {
    pending: { bg: "#EEF4FB", text: "#185FA5", label: "排隊中" },
    processing: { bg: "#FDF3E3", text: "#854F0B", label: "處理中⋯" },
    ready: { bg: "#EAF3DE", text: "#3B6D11", label: "✓ 就緒" },
    failed: { bg: "#FDECEA", text: "#CC0000", label: "失敗" },
  };
  const c = map[s];
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {c.label}
    </span>
  );
}

export function ManualsBoard({
  manuals,
  vehicleModels,
}: {
  manuals: ManualListItem[];
  vehicleModels: VehicleModelOption[];
}) {
  const modelMap = new Map(vehicleModels.map((v) => [v.id, v.display_name]));
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showUpload, setShowUpload] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  // 即時進度：source type → 'pending' | 'processing' | { succeeded, failed, total }
  const [reindexProgress, setReindexProgress] = useState<
    Record<string, 'pending' | 'processing' | ReindexProgress> | null
  >(null);

  // 自動 polling：若有 pending / processing 的手冊，每 3 秒 refresh 一次直到全 ready/failed
  useEffect(() => {
    const hasInflight = manuals.some(
      (m) => m.status === "pending" || m.status === "processing",
    );
    if (!hasInflight) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [manuals, router]);

  function showOk(msg: string) {
    setBanner({ ok: true, msg });
    setTimeout(() => setBanner(null), 2400);
  }
  function showErr(msg: string) {
    setBanner({ ok: false, msg });
  }

  function onReindex(id: string) {
    startTransition(async () => {
      const r = await reindexManual(id);
      if (r.ok) {
        showOk("已排入重建索引（背景處理中）");
        router.refresh();
      } else {
        showErr(r.error);
      }
    });
  }

  function onDelete(id: string, title: string) {
    if (!confirm(`確定刪除手冊「${title}」？相關的向量索引也會一併清除。`)) return;
    startTransition(async () => {
      const r = await deleteManual(id);
      if (r.ok) {
        showOk("✓ 已刪除");
        router.refresh();
      } else {
        showErr(r.error);
      }
    });
  }

  function onReindexRecords() {
    if (!confirm("要重建所有業務表的向量索引嗎？（手冊不會動）")) return;
    const sources = listIngestableSourceMeta();
    const initial: Record<string, 'pending' | 'processing' | ReindexProgress> = {};
    for (const s of sources) initial[s.type] = 'pending';

    startTransition(async () => {
      setReindexProgress(initial);
      for (const s of sources) {
        setReindexProgress((prev) => ({ ...(prev ?? {}), [s.type]: 'processing' }));
        const r = await reindexSource(s.type);
        if (r.ok) {
          setReindexProgress((prev) => ({ ...(prev ?? {}), [s.type]: r.data }));
        } else {
          setReindexProgress((prev) => ({
            ...(prev ?? {}),
            [s.type]: { source_type: s.type, total: 0, succeeded: 0, failed: 0 },
          }));
        }
      }
      showOk("✓ 紀錄索引已重建");
      router.refresh();
    });
  }

  const columns: DataGridColumn<ManualListItem>[] = [
    {
      id: "title",
      header: "標題",
      hideable: false,
      cell: (r) => (
        <div className="flex flex-col">
          <a
            href={r.signed_url}
            target="_blank"
            rel="noopener"
            className="text-[#185FA5] hover:underline font-medium"
          >
            {r.title}
          </a>
          {r.description && (
            <span className="text-[11px] text-[#9A9890] truncate">{r.description}</span>
          )}
        </div>
      ),
      exportValue: (r) => r.title,
      sortValue: (r) => r.title,
    },
    {
      id: "size",
      header: "大小",
      width: 90,
      align: "right",
      cell: (r) => <span className="font-mono">{formatSize(r.size_bytes)}</span>,
      sortValue: (r) => r.size_bytes ?? 0,
      exportValue: (r) => formatSize(r.size_bytes),
    },
    {
      id: "page_count",
      header: "頁數",
      width: 70,
      align: "right",
      cell: (r) => <span className="font-mono">{r.page_count ?? "—"}</span>,
      sortValue: (r) => r.page_count ?? 0,
      exportValue: (r) => String(r.page_count ?? ""),
    },
    {
      id: "chunks",
      header: "向量段數",
      width: 90,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[#185FA5] font-semibold">{r.total_chunks}</span>
      ),
      sortValue: (r) => r.total_chunks,
      exportValue: (r) => String(r.total_chunks),
    },
    {
      id: "vehicle_models",
      header: "適用車型",
      width: 180,
      cell: (r) => {
        if (r.vehicle_model_ids.length === 0) {
          return <span className="text-[11px] text-[#9A9890]">— 通用</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {r.vehicle_model_ids.slice(0, 3).map((id) => (
              <span
                key={id}
                className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#EAF4FB] text-[#185FA5] text-[10.5px]"
              >
                {modelMap.get(id) ?? id.slice(0, 8)}
              </span>
            ))}
            {r.vehicle_model_ids.length > 3 && (
              <span className="text-[10.5px] text-[#9A9890]">
                +{r.vehicle_model_ids.length - 3}
              </span>
            )}
          </div>
        );
      },
      sortValue: (r) => r.vehicle_model_ids.length,
      exportValue: (r) =>
        r.vehicle_model_ids.map((id) => modelMap.get(id) ?? id).join("、"),
    },
    {
      id: "status",
      header: "狀態",
      width: 110,
      cell: (r) => (
        <div className="flex flex-col gap-0.5">
          {statusChip(r.status)}
          {r.status === "failed" && r.error_message && (
            <span
              className="text-[10px] text-[#CC0000] truncate max-w-[200px]"
              title={r.error_message}
            >
              {r.error_message}
            </span>
          )}
        </div>
      ),
      sortValue: (r) => r.status,
      exportValue: (r) => r.status,
    },
    {
      id: "ingested_at",
      header: "索引時間",
      width: 130,
      cell: (r) =>
        r.ingested_at ? (
          <span className="text-[11.5px] text-[#5A5955]">
            {new Date(r.ingested_at).toLocaleString("zh-TW", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      sortValue: (r) => r.ingested_at ?? "",
      exportValue: (r) => r.ingested_at ?? "",
    },
    {
      id: "created_at",
      header: "上傳時間",
      width: 130,
      defaultHidden: true,
      cell: (r) =>
        new Date(r.created_at).toLocaleString("zh-TW", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
      sortValue: (r) => r.created_at,
      exportValue: (r) => r.created_at,
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">原廠手冊管理</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          AI / RAG
        </span>
        <span className="text-[12px] text-[#9A9890]">
          上傳手冊 PDF → 自動 chunking + 向量索引；給 /ai-curve/chat 查詢用
        </span>
      </header>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{manuals.length}</b> 份手冊
        </span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={onReindexRecords}
            disabled={isPending}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#185FA5] hover:text-[#185FA5] disabled:opacity-50"
          >
            {isPending ? "處理中⋯" : "重建紀錄索引"}
          </button>
          <button
            onClick={() => setShowUpload(true)}
            disabled={isPending}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 上傳手冊
          </button>
        </div>
      </div>

      {reindexProgress && (
        <div className="bg-white border border-[#EEECE6] rounded-lg p-3">
          <div className="text-[12.5px] font-semibold mb-2 flex items-center gap-2">
            <span>重建進度</span>
            {Object.values(reindexProgress).every(
              (v) => typeof v === 'object',
            ) ? (
              <span className="text-[11px] text-[#3B6D11]">✓ 完成</span>
            ) : (
              <span className="text-[11px] text-[#185FA5] flex items-center gap-1">
                <span className="w-2 h-2 rounded-full border border-[#185FA5] border-t-transparent animate-spin" />
                處理中⋯
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1 text-[11.5px]">
            {Object.entries(reindexProgress).map(([type, state]) => {
              const icon = resolveIcon(type);
              const label = resolveLabel(type);
              const isDone = typeof state === 'object';
              return (
                <div
                  key={type}
                  className={`flex items-center justify-between px-2 py-1 rounded ${
                    state === 'processing'
                      ? 'bg-[#EAF4FB]'
                      : isDone
                        ? ''
                        : 'opacity-50'
                  }`}
                >
                  <span className="flex items-center gap-1 min-w-0">
                    <span>{icon}</span>
                    <span className="text-[#5A5955] truncate">{label}</span>
                  </span>
                  {state === 'pending' && (
                    <span className="text-[#9A9890]">⋯</span>
                  )}
                  {state === 'processing' && (
                    <span className="w-3 h-3 rounded-full border border-[#185FA5] border-t-transparent animate-spin" />
                  )}
                  {isDone && (
                    <span className="font-mono">
                      <span className="text-[#3B6D11]">{state.succeeded}</span>
                      {state.failed > 0 && (
                        <span className="text-[#CC0000]">/{state.failed}失</span>
                      )}
                      <span className="text-[#9A9890]"> / {state.total}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <DataGrid
        columns={columns}
        data={manuals}
        rowKey={(r) => r.id}
        persistKey="admin/manuals"
        exportFileName="manuals"
        emptyMessage="尚未上傳任何手冊"
        disabled={isPending}
        rowActionsWidth={170}
        rowActions={(r) => (
          <>
            <button
              onClick={() => onReindex(r.id)}
              disabled={isPending || r.status === "processing"}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#185FA5] disabled:opacity-50"
            >
              重建
            </button>
            <button
              onClick={() => onDelete(r.id, r.title)}
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
            >
              刪除
            </button>
          </>
        )}
      />

      {showUpload && (
        <UploadModal
          vehicleModels={vehicleModels}
          onClose={() => setShowUpload(false)}
          onSuccess={(msg) => {
            setShowUpload(false);
            showOk(msg);
            router.refresh();
          }}
          onError={(msg) => showErr(msg)}
        />
      )}

      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}
    </main>
  );
}

// ─── Upload modal ──────────────────────────────────────────

function UploadModal({
  vehicleModels,
  onClose,
  onSuccess,
  onError,
}: {
  vehicleModels: VehicleModelOption[];
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function toggleModel(id: string) {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    if (!file) {
      onError("請選檔案（PDF / DOCX / TXT / MD）");
      return;
    }
    if (!title.trim()) {
      onError("標題必填");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title.trim());
    if (description.trim()) fd.append("description", description.trim());
    fd.append("vehicle_model_ids", JSON.stringify([...selectedModels]));

    startTransition(async () => {
      const r = await uploadManual(fd);
      if (r.ok) {
        onSuccess(`✓ 已上傳，AI 正在背景索引中`);
      } else {
        onError(r.error);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5">
        <h2 className="text-[15px] font-semibold mb-4">上傳原廠手冊</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] text-[#9A9890] font-medium mb-1">
              標題 <span className="text-[#CC0000]">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：Ducati Panigale V4 User Manual 2024"
              disabled={isPending}
              className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#9A9890] font-medium mb-1">
              描述（選填）
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="這份手冊涵蓋哪些車型 / 年份 / 主題"
              rows={2}
              disabled={isPending}
              className="w-full border border-[#D5D3CB] rounded px-2 py-1 text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </div>
          {vehicleModels.length > 0 && (
            <div>
              <label className="block text-[11px] text-[#9A9890] font-medium mb-1">
                適用車型（選填、多選；不選 = 通用）
              </label>
              <div className="max-h-32 overflow-y-auto border border-[#D5D3CB] rounded p-2 flex flex-wrap gap-1.5">
                {vehicleModels.map((m) => {
                  const on = selectedModels.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleModel(m.id)}
                      disabled={isPending}
                      className={`px-2 py-0.5 rounded-md text-[11px] border transition-colors ${
                        on
                          ? "bg-[#185FA5] text-white border-[#185FA5]"
                          : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#185FA5]"
                      }`}
                    >
                      {m.display_name}
                    </button>
                  );
                })}
              </div>
              {selectedModels.size > 0 && (
                <div className="text-[10.5px] text-[#185FA5] mt-1">
                  已選 {selectedModels.size} 個車型
                </div>
              )}
            </div>
          )}
          <div>
            <label className="block text-[11px] text-[#9A9890] font-medium mb-1">
              檔案 <span className="text-[#CC0000]">*</span>
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,.pdf,.docx,.txt,.md"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={isPending}
              className="text-[12px]"
            />
            <div className="text-[10.5px] text-[#9A9890] mt-1">
              支援 PDF / DOCX / TXT / MD
            </div>
            {file && (
              <div className="text-[11px] text-[#5A5955] mt-1">
                已選：{file.name}（{(file.size / 1024 / 1024).toFixed(2)} MB）
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <button
            onClick={onClose}
            disabled={isPending}
            className="h-[30px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={isPending}
            className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            {isPending ? "上傳中⋯" : "上傳並索引"}
          </button>
        </div>
      </div>
    </div>
  );
}
