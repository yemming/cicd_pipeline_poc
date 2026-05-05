"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSetPageHeader } from "@/components/page-header-context";
import { grantAdminAction, revokeAdminAction } from "@/lib/admin-actions";
import type { AdminRow } from "@/lib/admins";

type Props = {
  rows: AdminRow[];
  currentEmail: string;
  envFallback: string | null;
};

export function AdminsEditor({ rows, currentEmail, envFallback }: Props) {
  useSetPageHeader({
    breadcrumb: [{ label: "系統管理員" }],
  });

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold font-display">系統管理員</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          這個名單決定誰能進 <code className="font-mono text-xs">/admin/*</code> 後台 — 目錄管理、通知中心、簽核設定、意見回饋審批。
          <br />
          名單存在 DB（<code className="font-mono text-xs">app_admins</code>），改動即時生效。
        </p>
      </header>

      <GrantForm currentEmail={currentEmail} />
      <AdminsTable rows={rows} currentEmail={currentEmail} />
      {envFallback && <EnvFallbackNotice raw={envFallback} dbCount={rows.length} />}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 新增
// ──────────────────────────────────────────────────────────

function GrantForm({ currentEmail: _currentEmail }: { currentEmail: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    startTransition(async () => {
      try {
        await grantAdminAction(fd);
        form.reset();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <section className="bg-white rounded-2xl border border-outline-variant/30 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant mb-3">
        授予 admin 權限
      </h2>
      <form
        onSubmit={handleSubmit}
        className={`flex flex-col md:flex-row gap-3 ${pending ? "opacity-60 pointer-events-none" : ""}`}
      >
        <input
          name="email"
          type="email"
          required
          placeholder="russell@example.com"
          autoComplete="off"
          className="flex-1 px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest font-mono text-sm"
        />
        <input
          name="notes"
          type="text"
          placeholder="備註（選填）：例如「Russell｜Cofounder」"
          autoComplete="off"
          className="flex-1 px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2 rounded-lg bg-[color:var(--color-brand-primary)] text-white font-medium hover:bg-[color:var(--color-brand-primary-dark)] disabled:opacity-60 flex items-center gap-2 whitespace-nowrap"
        >
          {pending && <Spinner />}
          {pending ? "授權中…" : "授予 admin"}
        </button>
      </form>
      {error && (
        <p className="mt-3 text-sm text-error bg-error-container/40 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      <p className="mt-3 text-[11px] text-on-surface-variant leading-relaxed">
        💡 對方還沒註冊也可以先授權 — email 加進名單後，他下次用這個 email 登入就自動有 admin 權限。
      </p>
    </section>
  );
}

// ──────────────────────────────────────────────────────────
// 表格
// ──────────────────────────────────────────────────────────

function AdminsTable({
  rows,
  currentEmail,
}: {
  rows: AdminRow[];
  currentEmail: string;
}) {
  return (
    <section className="bg-white rounded-2xl border border-outline-variant/30 overflow-hidden">
      <div className="px-5 py-3 border-b border-outline-variant/30 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant">
          目前 admin 名單（{rows.length}）
        </h2>
      </div>

      {rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-on-surface-variant">
          DB 沒有任何 admin。
          <br />
          目前是吃 <code className="font-mono text-xs">FEEDBACK_ADMIN_EMAILS</code> env fallback。
        </div>
      ) : (
        <ul className="divide-y divide-outline-variant/20">
          {rows.map((row) => (
            <AdminsRow
              key={row.email}
              row={row}
              isSelf={row.email.toLowerCase() === currentEmail.toLowerCase()}
              isLast={rows.length <= 1}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function AdminsRow({
  row,
  isSelf,
  isLast,
}: {
  row: AdminRow;
  isSelf: boolean;
  isLast: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const handleRevoke = () => {
    const confirmMsg = isSelf
      ? `確定要把自己（${row.email}）從 admin 移除？\n移除後你會立刻失去 /admin/* 的存取權。`
      : `確定要把 ${row.email} 從 admin 移除？`;
    if (!confirm(confirmMsg)) return;

    startTransition(async () => {
      try {
        await revokeAdminAction(row.email);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const grantedDate = new Date(row.granted_at).toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Taipei",
  });

  return (
    <li
      className={`flex items-center gap-4 px-5 py-3 ${pending ? "opacity-60 pointer-events-none" : "hover:bg-surface-container-low"}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium truncate">{row.email}</span>
          {isSelf && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[color:var(--color-brand-primary)]/10 text-[color:var(--color-brand-primary)] font-semibold">
              你
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-on-surface-variant">
          <span>授權於 {grantedDate}</span>
          {row.notes && (
            <>
              <span>·</span>
              <span className="truncate">{row.notes}</span>
            </>
          )}
        </div>
      </div>

      <button
        onClick={handleRevoke}
        disabled={pending || isLast}
        title={isLast ? "最後一位 admin 不能移除" : "移除 admin 權限"}
        className="px-3 py-1.5 rounded-lg border border-outline-variant/40 text-sm text-error hover:bg-error-container/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
      >
        {pending && <Spinner />}
        <span className="material-symbols-outlined text-base">person_remove</span>
        {pending ? "移除中…" : "移除"}
      </button>
    </li>
  );
}

// ──────────────────────────────────────────────────────────
// Env fallback notice — 提醒使用者該下架 env
// ──────────────────────────────────────────────────────────

function EnvFallbackNotice({ raw, dbCount }: { raw: string; dbCount: number }) {
  const envEmails = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <section className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-amber-900">
      <h2 className="text-sm font-bold flex items-center gap-2">
        <span className="material-symbols-outlined text-base">info</span>
        env fallback 仍啟用
      </h2>
      <p className="text-sm mt-2 leading-relaxed">
        環境變數 <code className="font-mono text-xs bg-white/60 px-1.5 py-0.5 rounded">FEEDBACK_ADMIN_EMAILS</code> /{" "}
        <code className="font-mono text-xs bg-white/60 px-1.5 py-0.5 rounded">NOTIFICATION_ADMIN_EMAILS</code> 還有設值，
        會與 DB 名單做<strong>聯集</strong>（多重保險，避免 DB 鎖死）。
      </p>
      <ul className="mt-2 text-xs font-mono space-y-0.5">
        {envEmails.map((e) => (
          <li key={e} className="text-amber-800">
            · {e}
          </li>
        ))}
      </ul>
      <p className="text-sm mt-3 leading-relaxed">
        確認 DB 名單（{dbCount} 人）已涵蓋你想要的所有人後，就可以從 <code className="font-mono text-xs bg-white/60 px-1.5 py-0.5 rounded">.env.local</code> 與 Zeabur 環境變數移除這兩條，未來只用後台管理。
      </p>
    </section>
  );
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
