import { createTicket } from "@/lib/feedback-actions";

export function TicketForm({ defaultUrl }: { defaultUrl?: string }) {
  return (
    <form action={createTicket} className="space-y-6 max-w-2xl">
      <Field label="發生什麼事？" name="title" required>
        <input
          name="title"
          required
          placeholder="一句話描述（例如：展廳看板的 KPI chip 在 iPhone 上重疊）"
          className="w-full px-4 py-2.5 bg-white rounded-lg border border-slate-200 focus:border-violet-400 focus:ring-1 focus:ring-violet-200 outline-none text-sm"
        />
      </Field>

      <Field label="哪一個網址？" name="url" hint="發現問題的那一頁，複製完整網址或 path 即可">
        <input
          name="url"
          defaultValue={defaultUrl}
          placeholder="/sales/showroom 或 https://..."
          className="w-full px-4 py-2.5 bg-white rounded-lg border border-slate-200 focus:border-violet-400 focus:ring-1 focus:ring-violet-200 outline-none text-sm font-mono"
        />
      </Field>

      <Field
        label="問題是什麼？你想怎麼改？怎麼修復？"
        name="description"
        hint="越具體越好 — 之後可以在畫布上貼圖、畫流程補充"
      >
        <textarea
          name="description"
          rows={6}
          placeholder="1. 現況如何...&#10;2. 期望如何...&#10;3. 補充：..."
          className="w-full px-4 py-2.5 bg-white rounded-lg border border-slate-200 focus:border-violet-400 focus:ring-1 focus:ring-violet-200 outline-none text-sm leading-relaxed"
        />
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          className="px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold shadow-sm transition-colors"
        >
          建立草稿
        </button>
        <span className="text-xs text-slate-500">
          建立後狀態為「草稿」；管理者檢視後再派工
        </span>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  hint,
  required,
  children,
}: {
  label: string;
  name: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-semibold text-slate-700 mb-1.5">
        {label}
        {required && <span className="text-violet-600 ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}
