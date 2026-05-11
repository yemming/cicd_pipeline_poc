"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { saveCountToleranceRule } from "@/domain/rules";
import type {
  BusinessRuleRow,
  CountToleranceConfig,
  CountWorkflowConfig,
} from "@/domain/rules";

type Banner = { ok: boolean; msg: string } | null;

function parsePct(input: string): number | null {
  const trimmed = input.trim().replace(/%/g, "");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : NaN;
}

function formatPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "0%";
  return `${n}%`;
}

export function CountRulesBoard({
  toleranceRule,
  workflowRules,
  canEdit,
}: {
  toleranceRule: BusinessRuleRow | null;
  workflowRules: BusinessRuleRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const initial = (toleranceRule?.config ?? {
    abc_tolerance_pcts: { A: 0, B: 2, C: 5 },
  }) as CountToleranceConfig;

  const [pcts, setPcts] = useState({
    A: formatPct(initial.abc_tolerance_pcts?.A),
    B: formatPct(initial.abc_tolerance_pcts?.B),
    C: formatPct(initial.abc_tolerance_pcts?.C),
  });

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function handleSave() {
    setBanner(null);
    const a = parsePct(pcts.A);
    const b = parsePct(pcts.B);
    const c = parsePct(pcts.C);
    if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c)) {
      showBanner({ ok: false, msg: "容許率必須是 0–100 之間的數字（可加 %）" });
      return;
    }
    startTransition(async () => {
      const res = await saveCountToleranceRule({
        abc_tolerance_pcts: { A: a ?? 0, B: b ?? 0, C: c ?? 0 },
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存容許率設定" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <main className="px-6 py-5 space-y-3">
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

      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">盤點回傳規則</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          1.4
        </span>
        <span className="text-[12px] text-[#9A9890]">
          設定盤點差異的審核流程與自動回傳規則
        </span>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 左卡：差異容許區間 */}
        <section
          className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
            isPending ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">差異容許區間設定</h2>
            {canEdit && (
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
              >
                {isPending ? "儲存中⋯" : "儲存"}
              </button>
            )}
          </header>
          <div className="px-4 py-4 flex flex-col gap-3">
            {(["A", "B", "C"] as const).map((cls) => {
              const labelMap: Record<typeof cls, string> = {
                A: "A 類商品（高價）差異容許率",
                B: "B 類商品（中價）差異容許率",
                C: "C 類商品（耗材）差異容許率",
              };
              return (
                <div key={cls} className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890] font-medium">
                    {labelMap[cls]}
                  </label>
                  <input
                    type="text"
                    value={pcts[cls]}
                    onChange={(e) =>
                      setPcts((prev) => ({ ...prev, [cls]: e.target.value }))
                    }
                    disabled={!canEdit}
                    className="h-[30px] border border-[#D5D3CB] rounded px-2.5 font-mono text-[12.5px] focus:border-[#185FA5] outline-none"
                  />
                </div>
              );
            })}
            <div className="px-3 py-2.5 bg-[#FDF3E3] rounded-md text-[12px] text-[#854F0B]">
              ⚠ 超過容許率的差異項目將進入審核流程，不會自動回傳
            </div>
          </div>
        </section>

        {/* 右卡：審核流程 readonly */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">審核流程設定</h2>
          </header>
          <div className="px-4 py-3 flex flex-col gap-2.5">
            {workflowRules.length === 0 ? (
              <div className="text-[12px] text-[#9A9890] py-4 text-center">
                尚無流程設定（Phase 1 由系統 seed）
              </div>
            ) : (
              workflowRules.map((rule) => {
                const cfg = (rule.config ?? {}) as Partial<CountWorkflowConfig>;
                const tone = cfg.tone ?? "neutral";
                const card =
                  tone === "amber"
                    ? "bg-[#FDF3E3] border border-[#FAC775]"
                    : tone === "red"
                      ? "bg-[#FDECEA] border border-[#F5AEAD]"
                      : "bg-[#F8F7F4] border border-[#EEECE6]";
                const titleColor =
                  tone === "amber"
                    ? "text-[#854F0B]"
                    : tone === "red"
                      ? "text-[#CC0000]"
                      : "text-[#2C2C2A]";
                const badge = cfg.badge;
                const badgeClass = badge
                  ? badge.kind === "teal"
                    ? "bg-[#E8F5F0] text-[#0F6E56]"
                    : badge.kind === "pend"
                      ? "bg-[#FDF3E3] text-[#854F0B]"
                      : "bg-[#FDECEA] text-[#CC0000]"
                  : "";
                return (
                  <div key={rule.id} className={`px-3 py-2.5 rounded-md ${card}`}>
                    <div className={`text-[12.5px] font-semibold mb-1 ${titleColor}`}>
                      {cfg.label ?? "（未命名）"}
                    </div>
                    <div className="text-[12px] text-[#5A5955]">
                      {cfg.description ?? "—"}
                    </div>
                    {badge && (
                      <div className="mt-2">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${badgeClass}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
