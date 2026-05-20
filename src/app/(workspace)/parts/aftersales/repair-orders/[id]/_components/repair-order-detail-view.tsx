"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { EntityImageGallery } from "@/components/image-upload/entity-image-gallery";
import {
  cancelRepairOrderAction,
  updateRepairOrderStatusAction,
} from "@/lib/aftersales/repair-order-actions";
import { RO_STATUS_OPTIONS } from "@/domain/repair-orders.constants";
import type { RepairOrderListRow } from "@/domain/repair-orders";

// 純算數格式化 Asia/Taipei wall-clock（避開 toLocaleString 在 Node ICU / browser ICU
// 對 dayPeriod / narrow nbsp 不一致造成的 SSR / CSR hydration mismatch）
function fmtTaipeiDateTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t + 8 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function statusBadge(status: string): string {
  switch (status) {
    case "進行中":
      return "bg-[#EAF4FB] text-[#185FA5]";
    case "維修中":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "待結帳":
      return "bg-[#EBF3FF] text-[#1A3A5C]";
    case "已關單":
      return "bg-[#EAF3DE] text-[#3B6D11]";
    case "已取消":
      return "bg-[#F2F2F2] text-[#6B6A68]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

function Kv({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div
        className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}
      >
        {value ?? <span className="text-[#9A9890]">—</span>}
      </div>
    </div>
  );
}

export function RepairOrderDetailView({
  ro,
  canEdit,
}: {
  ro: RepairOrderListRow;
  canEdit: boolean;
}) {
  useSetPageHeader({
    title: ro.ro_code,
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "正式工單 RO", href: "/parts/aftersales/repair-orders" },
      { label: ro.ro_code },
    ],
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  /** 狀態切換確認 modal — 為 null 時關閉 */
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  function showBanner(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function askStatus(next: string) {
    if (!canEdit || isPending) return;
    if (next === ro.status) return;
    setPendingStatus(next);
  }

  function confirmStatus() {
    const next = pendingStatus;
    if (!next) return;
    startTransition(async () => {
      const res = await updateRepairOrderStatusAction(ro.id, next);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已切換為「${next}」` });
        setPendingStatus(null);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
        setPendingStatus(null);
      }
    });
  }

  function doCancel() {
    if (!canEdit || isPending) return;
    if (!confirm(`確認取消工單 ${ro.ro_code}？`)) return;
    const reason = prompt("取消原因（可留白）") ?? "";
    startTransition(async () => {
      const res = await cancelRepairOrderAction(ro.id, reason);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 工單已取消" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const meta = (ro.metadata ?? {}) as Record<string, unknown>;
  const accountingCategory =
    typeof meta.accounting_category_resolved === "string"
      ? (meta.accounting_category_resolved as string)
      : null;
  const verdict =
    typeof meta.verdict === "string" ? (meta.verdict as string) : null;
  const supervisorApproval = meta.supervisor_approval as
    | { required: boolean; approved_at?: string | null; approver_id?: string | null }
    | undefined;

  const warranty = (ro.warranty_status_snapshot ?? {}) as Record<string, unknown>;
  const warrantyValid = warranty.is_valid === true;

  return (
    <main className="px-6 py-5 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/aftersales/repair-orders" className="hover:text-[#185FA5]">
            正式工單 RO
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{ro.ro_code}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/aftersales/repair-orders"
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回列表
          </Link>
          {canEdit && (
            <Link
              href="/parts/aftersales/repair-orders/new"
              className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
            >
              新增 RO
            </Link>
          )}
          {canEdit && ro.status !== "已取消" && ro.status !== "已關單" && (
            <button
              type="button"
              onClick={doCancel}
              disabled={isPending}
              className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
            >
              取消工單
            </button>
          )}
        </div>
      </div>

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">
                正式維修工單 (Repair Order)
              </div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight font-mono">
                {ro.ro_code}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span
                  className={`inline-flex whitespace-nowrap px-1.5 py-0.5 rounded-md text-[11px] font-medium ${statusBadge(ro.status)}`}
                >
                  {ro.status}
                </span>
                <span className="inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EBF3FF] text-[#1A3A5C]">
                  {ro.prefix_p1}-{ro.prefix_p2}
                </span>
                {accountingCategory && (
                  <span className="inline-flex px-1.5 py-0.5 rounded-md text-[11px] bg-[#F0EFFE] text-[#534AB7]">
                    {accountingCategory}
                  </span>
                )}
                {verdict === "needs_supervisor" && (
                  <span className="inline-flex px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
                    需主管確認
                  </span>
                )}
              </div>
            </div>
            {canEdit && ro.status !== "已取消" && (
              <div className="flex flex-wrap gap-1.5">
                {RO_STATUS_OPTIONS.filter((s) => s !== "已取消" && s !== ro.status).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => askStatus(s)}
                    disabled={isPending}
                    className="h-[26px] px-3 rounded-full text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                  >
                    切「{s}」
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="shrink-0 w-[260px] h-[120px] rounded-lg bg-[#F8F7F4] border border-[#EEECE6] flex flex-col items-center justify-center text-center">
            <div className="text-[11px] text-[#9A9890]">預估金額（含稅）</div>
            <div className="text-[24px] font-semibold text-[#1A3A5C] font-mono">
              NT${Number(ro.estimated_subtotal ?? 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-[#9A9890] mt-1">
              預估 LU {Number(ro.estimated_labor_units ?? 0).toFixed(1)}
            </div>
          </div>
        </div>
      </header>

      {/* 主/側二欄：左主資訊 / 右側 SA 狀態時程（M03-3 spec） */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr,320px] gap-3">
        <div className="space-y-3 min-w-0">
      {/* 基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="車主姓名" value={ro.customer_name} />
          <Kv label="聯絡電話" value={ro.customer_phone} mono />
          <Kv label="開單日期" value={ro.issue_date} />
          <Kv label="車型" value={ro.vehicle_model_name} />
          <Kv label="車牌號碼" value={ro.vehicle_license_plate} mono />
          <Kv
            label="進廠里程"
            value={ro.mileage_in != null ? `${ro.mileage_in.toLocaleString()} km` : null}
            mono
          />
        </div>
      </section>

      {/* 事故 / 維修現場照片 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 維修現場照片</span>
          <span className="text-[11px] text-[#9A9890] ml-2">最多 20 張，建議拍車體損傷、零件異常、保固爭議現場存證</span>
        </header>
        <div className="px-4 py-4">
          <EntityImageGallery
            entity="repair-order"
            entityId={ro.id}
            images={ro.images ?? []}
            alt={`${ro.ro_code} 維修現場照片`}
            canEdit={canEdit}
            width={420}
            height={280}
            maxImages={20}
            emptyHint="尚未上傳照片"
          />
        </div>
      </section>

      {/* 保固狀態 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 保固快照（開單時點）</span>
        </header>
        <div className="px-4 py-3">
          <div
            className={`rounded px-3 py-2 text-[12px] ${
              warrantyValid
                ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
                : "bg-[#F2F2F2] text-[#6B6A68] border border-[#E0DFDB]"
            }`}
          >
            🛡 保固狀態：
            <b>{warrantyValid ? "有效" : "無 / 已過期"}</b>
            {warranty.expires_at ? <span> · 到期：{String(warranty.expires_at)}</span> : null}
            {warranty.mileage_limit ? <span> · 里程限制：{String(warranty.mileage_limit)}</span> : null}
          </div>
        </div>
      </section>

      {/* 工單分類 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 工單分類 / 會計軸</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="業務類型 (P1)" value={ro.prefix_p1} />
          <Kv label="付款性質 (P2)" value={ro.prefix_p2} />
          <Kv label="會計類別" value={accountingCategory ?? "—"} />
          <Kv label="驗證結論" value={verdict ?? "—"} />
          <Kv
            label="主管簽核"
            value={
              supervisorApproval?.required
                ? supervisorApproval.approved_at
                  ? `已核准 ${supervisorApproval.approved_at}`
                  : "尚未核准"
                : "免簽"
            }
          />
          <Kv label="開單時間" value={ro.opened_at ? fmtTaipeiDateTime(ro.opened_at) : null} />
        </div>
      </section>

      {/* 串接資訊 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 上下游串接</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="來源預約"
            value={
              ro.appointment_id ? (
                <Link
                  className="text-[#185FA5] hover:underline"
                  href={`/parts/aftersales/appointments/${ro.appointment_id}`}
                >
                  appointment {ro.appointment_id.slice(0, 8)}…
                </Link>
              ) : null
            }
          />
          <Kv label="來源預檢單" value={ro.pre_inspection_id ? ro.pre_inspection_id.slice(0, 8) + "…" : null} />
          <Kv label="關單時間" value={ro.closed_at ? fmtTaipeiDateTime(ro.closed_at) : null} />
        </div>
      </section>

      {/* 子模組入口 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 子模組</span>
        </header>
        <div className="px-4 py-3 flex flex-wrap gap-2">
          <Link
            href={`/parts/aftersales/repair-orders/${ro.id}/lines`}
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm"
          >
            🔧 維修項目／零件明細 →
          </Link>
          <span className="text-[11px] text-[#9A9890] inline-flex items-center">
            04 追加項目・05 增項閉環・06 竣工複檢・08 結帳收款 待落地
          </span>
        </div>
      </section>
        </div>

        {/* 右側欄：SA / 狀態時程 / 派工資訊 */}
        <aside className="space-y-3">
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 服務顧問 (SA)</span>
            </header>
            <div className="px-4 py-3 space-y-2 text-[12.5px]">
              <Kv label="SA 名" value={ro.sa_name} />
              <Kv label="主修技師" value={ro.lead_technician_name} />
            </div>
          </section>

          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 狀態時程</span>
            </header>
            <div className="px-4 py-3">
              <ol className="relative border-l-2 border-[#EEECE6] ml-2 space-y-3">
                <TimelineStep
                  done={!!ro.opened_at}
                  label="開單"
                  time={ro.opened_at ? fmtTaipeiDateTime(ro.opened_at) : null}
                />
                <TimelineStep
                  done={ro.status === "維修中" || ro.status === "待結帳" || ro.status === "已關單"}
                  label="維修中"
                  time={null}
                />
                <TimelineStep
                  done={ro.status === "待結帳" || ro.status === "已關單"}
                  label="待結帳"
                  time={null}
                />
                <TimelineStep
                  done={ro.status === "已關單"}
                  label="關單"
                  time={ro.closed_at ? fmtTaipeiDateTime(ro.closed_at) : null}
                  cancelled={ro.status === "已取消"}
                />
              </ol>
            </div>
          </section>

          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 金額快覽</span>
            </header>
            <div className="px-4 py-3 space-y-2 text-[12.5px]">
              <div className="flex justify-between">
                <span className="text-[#5A5955]">明細小計</span>
                <span className="font-mono">NT${Number(ro.lines_subtotal ?? 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5A5955]">含稅總計</span>
                <span className="font-mono font-semibold text-[#1A3A5C]">
                  NT${Number(ro.lines_total ?? 0).toLocaleString()}
                </span>
              </div>
              <Link
                href={`/parts/aftersales/repair-orders/${ro.id}/lines`}
                className="block text-center mt-2 h-[28px] leading-[28px] rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                查看明細 →
              </Link>
            </div>
          </section>
        </aside>
      </div>

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

      {/* 狀態切換確認 modal（M03-3 spec：狀態變更需確認） */}
      {pendingStatus && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => !isPending && setPendingStatus(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl border border-[#EEECE6] w-[420px] max-w-[90vw] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <div className="text-[13px] font-semibold text-[#2C2C2A]">確認狀態變更</div>
            </header>
            <div className="px-4 py-4 space-y-3 text-[12.5px] text-[#2C2C2A]">
              <p>
                即將把工單{" "}
                <span className="font-mono font-semibold text-[#1A3A5C]">{ro.ro_code}</span>{" "}
                狀態切換為：
              </p>
              <div className="flex items-center gap-2 justify-center py-2">
                <span
                  className={`inline-flex px-2.5 py-1 rounded-md text-[12px] font-medium ${statusBadge(ro.status)}`}
                >
                  {ro.status}
                </span>
                <span className="text-[#9A9890]">→</span>
                <span
                  className={`inline-flex px-2.5 py-1 rounded-md text-[12px] font-medium ${statusBadge(pendingStatus)}`}
                >
                  {pendingStatus}
                </span>
              </div>
              {pendingStatus === "待結帳" && (
                <p className="text-[11.5px] text-[#854F0B] bg-[#FDF3E3] border border-[#F0C97E] rounded px-2 py-1.5">
                  ⚠️ 切到「待結帳」代表維修已完成，請先確認工項 / 零件明細齊全。
                </p>
              )}
              {pendingStatus === "已關單" && (
                <p className="text-[11.5px] text-[#3B6D11] bg-[#EAF3DE] border border-[#C5DC9F] rounded px-2 py-1.5">
                  關單後僅可查閱，金額與項目將無法再修改。
                </p>
              )}
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] bg-[#F8F7F4] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingStatus(null)}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmStatus}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
              >
                {isPending ? "切換中⋯" : "確認切換"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </main>
  );
}

function TimelineStep({
  done,
  label,
  time,
  cancelled,
}: {
  done: boolean;
  label: string;
  time: string | null;
  cancelled?: boolean;
}) {
  const dotCls = cancelled
    ? "bg-[#F2F2F2] border-[#9A9890]"
    : done
      ? "bg-[#3B6D11] border-[#3B6D11]"
      : "bg-white border-[#D5D3CB]";
  const labelCls = cancelled
    ? "text-[#9A9890] line-through"
    : done
      ? "text-[#2C2C2A] font-medium"
      : "text-[#9A9890]";
  return (
    <li className="ml-3 pl-3 relative">
      <span
        className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full border-2 ${dotCls}`}
      />
      <div className={`text-[12.5px] ${labelCls}`}>{label}</div>
      {time && <div className="text-[11px] text-[#9A9890] font-mono">{time}</div>}
    </li>
  );
}
