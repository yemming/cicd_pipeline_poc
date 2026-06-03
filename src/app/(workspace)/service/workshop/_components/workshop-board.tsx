"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLeadTechnician } from "@/domain/repair-orders";
import type { RepairOrderListRow, WorkshopTechnicianRow } from "@/domain/repair-orders";
import { priorityDef } from "@/domain/repair-orders.constants";
import { reassignTechnicianRosAction } from "@/lib/aftersales/repair-order-actions";

type Props = {
  activeRos: RepairOrderListRow[];
  technicians: WorkshopTechnicianRow[];
};

export function WorkshopBoard({ activeRos, technicians }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // 包E：技師缺席批次重排 modal
  const [reassign, setReassign] = useState<{ tech: WorkshopTechnicianRow } | null>(null);
  const [reassignTarget, setReassignTarget] = useState<string>("");

  function assign(roId: string, technicianId: string | null) {
    setPendingId(roId);
    startTransition(async () => {
      const res = await setLeadTechnician(roId, technicianId);
      setPendingId(null);
      if (res.ok) {
        setBanner({ ok: true, msg: "✓ 已指派" });
        router.refresh();
        setTimeout(() => setBanner(null), 2200);
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  }

  function doReassign() {
    if (!reassign) return;
    const fromId = reassign.tech.id;
    startTransition(async () => {
      const res = await reassignTechnicianRosAction(fromId, reassignTarget || null);
      if (res.ok) {
        setBanner({
          ok: true,
          msg: `✓ 已將 ${res.data.reassigned} 張工單重排，${reassign.tech.name} 標記缺席`,
        });
        setReassign(null);
        setReassignTarget("");
        router.refresh();
        setTimeout(() => setBanner(null), 2600);
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">維修廠派工看板</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          P1-#11
        </span>
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{activeRos.length}</b> 張進行中工單 ・ <b className="text-[#2C2C2A]">{technicians.length}</b> 位技師
        </span>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* 左 2 欄：active RO 清單 */}
        <section className="lg:col-span-2 bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 進行中工單</span>
          </header>
          <div className={`divide-y divide-[#EEECE6] ${isPending ? "pointer-events-none opacity-60" : ""}`}>
            {activeRos.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12.5px] text-[#9A9890]">
                沒有進行中工單
              </div>
            ) : (
              activeRos.map((ro) => (
                <div key={ro.id} className="px-4 py-3 flex items-center gap-3 hover:bg-[#F8F7F4]">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12.5px] font-semibold text-[#1A3A5C]">{ro.ro_code}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[#EBF3FF] text-[#1A3A5C]">{ro.status}</span>
                      {(() => {
                        const d = priorityDef(ro.priority);
                        return (
                          <span className={`text-[11px] px-1.5 py-0.5 rounded-md whitespace-nowrap font-medium ${d.chip}`}>
                            {d.emoji} {d.label}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="text-[12px] text-[#5A5955] mt-0.5 truncate">
                      {ro.customer_name ?? "—"} ・ {ro.vehicle_license_plate ?? "—"} ・ {ro.vehicle_model_name ?? "—"}
                    </div>
                    <div className="text-[11px] text-[#9A9890] mt-0.5">
                      入廠 {ro.issue_date} ・ SA: {ro.sa_name ?? "—"}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <select
                      className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12px] focus:border-[#185FA5] bg-white"
                      value={ro.lead_technician_id ?? ""}
                      disabled={pendingId === ro.id}
                      onChange={(e) => assign(ro.id, e.target.value || null)}
                    >
                      <option value="">— 未指派 —</option>
                      {technicians.filter((t) => t.is_active).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.code} {t.name}
                        </option>
                      ))}
                    </select>
                    {pendingId === ro.id && (
                      <span className="text-[11px] text-[#9A9890]">指派中⋯</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 右 1 欄：技師看板 */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 技師當前負載</span>
          </header>
          <div className="divide-y divide-[#EEECE6]">
            {technicians.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12.5px] text-[#9A9890]">沒有技師</div>
            ) : (
              technicians.map((t) => (
                <div key={t.id} className="px-4 py-2.5 flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-white"
                    style={{ background: t.avatar_color ?? "#1A3A5C" }}
                  >
                    {t.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] text-[#2C2C2A]">
                      <span className="font-mono text-[#5A5955]">{t.code}</span> {t.name}
                      {t.grade && (
                        <span className="ml-1 text-[11px] text-[#9A9890]">({t.grade})</span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#9A9890] mt-0.5">
                      {t.is_active ? t.status : "停用"}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${
                        t.assigned_ro_count >= 5
                          ? "bg-[#FDECEA] text-[#CC0000]"
                          : t.assigned_ro_count >= 3
                          ? "bg-[#FDF3E3] text-[#854F0B]"
                          : "bg-[#EAF3DE] text-[#3B6D11]"
                      }`}
                    >
                      {t.assigned_ro_count} 張
                    </span>
                    {t.assigned_ro_count > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setReassign({ tech: t });
                          setReassignTarget("");
                        }}
                        className="h-[22px] px-2 rounded text-[10.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                        title="技師缺席 → 把名下工單批次重排給其他技師"
                      >
                        缺席重排
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* 包E：缺席批次重排 modal */}
      {reassign && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => !isPending && setReassign(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl border border-[#EEECE6] w-[440px] max-w-[92vw] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <div className="text-[13px] font-semibold text-[#2C2C2A]">技師缺席批次重排</div>
            </header>
            <div className="px-4 py-4 space-y-3 text-[12.5px] text-[#2C2C2A]">
              <p>
                將 <b>{reassign.tech.name}</b>（{reassign.tech.code}）名下{" "}
                <b className="text-[#CC0000]">{reassign.tech.assigned_ro_count}</b>{" "}
                張進行中工單一次重排，並把該技師標記為<b>缺席（下班）</b>。
              </p>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890]">重新指派給</label>
                <select
                  className="h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] bg-white"
                  value={reassignTarget}
                  onChange={(e) => setReassignTarget(e.target.value)}
                  disabled={isPending}
                >
                  <option value="">— 退回未指派（等候重新派工）—</option>
                  {technicians
                    .filter((t) => t.is_active && t.id !== reassign.tech.id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} {t.name}（目前 {t.assigned_ro_count} 張）
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] bg-[#F8F7F4] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReassign(null)}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={doReassign}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
              >
                {isPending ? "重排中⋯" : "確認重排"}
              </button>
            </footer>
          </div>
        </div>
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
