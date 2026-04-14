"use client";

import { useSetPageHeader } from "@/components/page-header-context";
import { getModelById } from "@/lib/ducati-models";

const funnelClip = "polygon(0% 0%, 90% 0%, 100% 50%, 90% 100%, 0% 100%, 10% 50%)";
const funnelClipFirst = "polygon(0% 0%, 90% 0%, 100% 50%, 90% 100%, 0% 100%)";

const panigale = getModelById("panigale-v4-s")!;
const multistrada = getModelById("multistrada-v4-s")!;
const monsterSP = getModelById("monster-sp")!;
const streetfighter = getModelById("streetfighter-v4-sp2")!;

export default function ShowroomPage() {
  useSetPageHeader({
    title: "展廳看板",
    tabs: [
      { label: "當前總覽", active: true },
      { label: "數據報表" },
    ],
  });

  return (
    <div className="-m-8 p-8 space-y-8 bg-background text-on-surface min-h-[calc(100dvh-4rem)]">
      {/* KPI Summary Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-on-surface-variant text-sm font-label mb-2">新增線索</p>
          <div className="flex items-end justify-between">
            <span className="text-4xl font-extrabold text-primary">12</span>
            <span className="flex items-center text-green-600 font-bold text-sm mb-1">
              <span className="material-symbols-outlined text-sm mr-1">trending_up</span>
              2
            </span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-on-surface-variant text-sm font-label mb-2">今日預約</p>
          <div className="flex items-end justify-between">
            <span className="text-4xl font-extrabold text-primary">8</span>
            <span className="flex items-center text-error font-bold text-sm mb-1">
              <span className="material-symbols-outlined text-sm mr-1">trending_down</span>
              1
            </span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/10">
          <div className="flex justify-between items-center mb-2">
            <p className="text-on-surface-variant text-sm font-label">本月成交</p>
            <span className="text-xs font-bold text-tertiary">40%</span>
          </div>
          <div className="flex items-end gap-2 mb-3">
            <span className="text-4xl font-extrabold text-primary">4</span>
            <span className="text-on-surface-variant mb-1 font-label">/ 10</span>
          </div>
          <div className="h-2 w-full bg-surface-container-high rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-container to-tertiary-container"
              style={{ width: "40%" }}
            />
          </div>
        </div>

        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-on-surface-variant text-sm font-label mb-2">待處理事項</p>
          <div className="flex items-center gap-4">
            <span className="text-4xl font-extrabold text-primary">6</span>
            <span className="bg-error-container text-on-error-container text-[10px] px-2 py-0.5 rounded font-bold uppercase">
              Critical
            </span>
          </div>
        </div>
      </section>

      {/* Middle: Funnel + Schedule */}
      <section className="grid grid-cols-1 lg:grid-cols-10 gap-8">
        <div className="lg:col-span-6 bg-surface-container-low p-8 rounded-xl">
          <div className="flex justify-between items-center mb-10">
            <h3 className="font-display text-xl font-bold text-primary">銷售漏斗概覽</h3>
            <button className="text-tertiary text-sm font-medium hover:underline">
              查看詳細分析
            </button>
          </div>
          <div className="flex items-stretch h-40">
            <FunnelStep bg="bg-primary-container" text="text-white" count="128" label="線索" first />
            <FunnelStep bg="bg-[#2D2D44]" text="text-white" count="64" label="邀約" zIndex={10} />
            <FunnelStep bg="bg-[#41415E]" text="text-white" count="32" label="到店" zIndex={20} />
            <FunnelStep bg="bg-[#57577A]" text="text-white" count="18" label="試駕" zIndex={30} />
            <FunnelStep
              bg="bg-tertiary-container"
              text="text-primary-container"
              count="4"
              label="成交"
              zIndex={40}
              bold
            />
          </div>
          <div className="mt-8 grid grid-cols-5 gap-2 text-center">
            <div className="text-[11px] text-on-surface-variant font-medium">轉化率 50%</div>
            <div className="text-[11px] text-on-surface-variant font-medium">轉化率 50%</div>
            <div className="text-[11px] text-on-surface-variant font-medium">轉化率 56%</div>
            <div className="text-[11px] text-on-surface-variant font-medium">轉化率 22%</div>
            <div className="text-[11px] text-on-surface-variant font-medium" />
          </div>
        </div>

        <div className="lg:col-span-4 bg-surface-container-lowest p-8 rounded-xl shadow-sm border border-outline-variant/10">
          <h3 className="font-display text-xl font-bold text-primary mb-6">今日行程</h3>
          <div className="space-y-6">
            <Appointment
              time="10:30"
              period="AM"
              customer="王先生"
              kind="試駕"
              kindTone="tertiary"
              model="Panigale V4 S · Ducati 紅"
            />
            <Appointment
              time="14:00"
              period="PM"
              customer="李小姐"
              kind="簽約"
              kindTone="neutral"
              model="Monster SP · SP 塗裝"
            />
            <Appointment
              time="16:30"
              period="PM"
              customer="張先生"
              kind="交車"
              kindTone="tertiary"
              model="Multistrada V4 S · 飛行灰"
            />
          </div>
        </div>
      </section>

      {/* Bottom: Inventory Alerts */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-display text-xl font-bold text-primary">庫存快訊</h3>
          <div className="flex gap-2">
            <button className="p-2 hover:bg-surface-container-high rounded-full transition-colors">
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <button className="p-2 hover:bg-surface-container-high rounded-full transition-colors">
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <InventoryCard
            name={panigale.name}
            img={panigale.thumb}
            badge={{ label: "熱銷車型", bg: "bg-error", fg: "text-white" }}
            stock="在庫：2 輛"
            note="現車供應"
            noteTone="tertiary"
          />
          <InventoryCard
            name={multistrada.name}
            img={multistrada.thumb}
            badge={{ label: "在庫過久", bg: "bg-primary-container", fg: "text-white" }}
            stock="在庫：1 輛"
            note="庫齡 > 60 天"
            noteTone="error"
          />
          <InventoryCard
            name={monsterSP.name}
            img={monsterSP.thumb}
            badge={{
              label: "活動促銷",
              bg: "bg-tertiary-container",
              fg: "text-primary-container",
            }}
            stock="在庫：5 輛"
            note="低利貸款中"
            noteTone="tertiary"
          />
          <InventoryCard
            name={streetfighter.name}
            img={streetfighter.thumb}
            stock="在庫：1 輛"
            note="即將到店"
            noteTone="neutral"
          />
        </div>
      </section>
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────

function FunnelStep({
  bg,
  text,
  count,
  label,
  first,
  zIndex,
  bold,
}: {
  bg: string;
  text: string;
  count: string;
  label: string;
  first?: boolean;
  zIndex?: number;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex-1 ${bg} flex flex-col items-center justify-center ${text} relative group cursor-help ${
        first ? "" : "-ml-4"
      }`}
      style={{
        clipPath: first ? funnelClipFirst : funnelClip,
        zIndex,
      }}
    >
      <span className="text-2xl font-black mb-1">{count}</span>
      <span className={`text-[10px] font-label opacity-70 ${bold ? "font-bold opacity-100" : ""}`}>
        {label}
      </span>
    </div>
  );
}

function Appointment({
  time,
  period,
  customer,
  kind,
  kindTone,
  model,
}: {
  time: string;
  period: string;
  customer: string;
  kind: string;
  kindTone: "tertiary" | "neutral";
  model: string;
}) {
  return (
    <div className="flex items-start gap-4 p-3 hover:bg-surface-container-low rounded-lg transition-colors group">
      <div className="text-center min-w-[50px]">
        <p className="text-lg font-black text-primary">{time}</p>
        <p className="text-[10px] text-on-surface-variant font-label">{period}</p>
      </div>
      <div className="flex-1">
        <div className="flex justify-between">
          <h4 className="font-bold text-on-surface">{customer}</h4>
          <span
            className={
              kindTone === "tertiary"
                ? "text-[10px] px-2 py-0.5 bg-tertiary-container/20 text-tertiary font-bold rounded"
                : "text-[10px] px-2 py-0.5 bg-surface-container-high text-on-surface-variant font-bold rounded"
            }
          >
            {kind}
          </span>
        </div>
        <p className="text-xs text-on-surface-variant mt-1">{model}</p>
      </div>
    </div>
  );
}

function InventoryCard({
  name,
  img,
  badge,
  stock,
  note,
  noteTone,
}: {
  name: string;
  img: string;
  badge?: { label: string; bg: string; fg: string };
  stock: string;
  note: string;
  noteTone: "tertiary" | "error" | "neutral";
}) {
  return (
    <div className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm border border-outline-variant/10 group hover:shadow-md transition-shadow">
      <div className="h-40 bg-gradient-to-br from-[#1A1A2E] to-[#0F0F1F] relative overflow-hidden flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={name}
          className="max-w-[90%] max-h-[90%] object-contain group-hover:scale-105 transition-transform duration-500"
          src={img}
        />
        {badge && (
          <span
            className={`absolute top-2 right-2 px-2 py-1 ${badge.bg} ${badge.fg} text-[10px] font-bold rounded`}
          >
            {badge.label}
          </span>
        )}
      </div>
      <div className="p-4">
        <h4 className="font-bold text-primary">{name}</h4>
        <div className="flex justify-between items-center mt-3">
          <span className="text-xs text-on-surface-variant">{stock}</span>
          <span
            className={
              noteTone === "tertiary"
                ? "text-tertiary font-bold text-sm"
                : noteTone === "error"
                ? "text-error font-bold text-sm"
                : "text-on-surface-variant font-bold text-sm"
            }
          >
            {note}
          </span>
        </div>
      </div>
    </div>
  );
}
