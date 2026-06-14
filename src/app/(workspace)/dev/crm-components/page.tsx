/**
 * CRM 共用元件 sandbox 預覽頁（dev only）
 *
 * 路徑：/dev/crm-components
 * 用途：第四輪 BDN Batch 1 Step 0 抽出的 4 個 CRM 共用元件視覺驗收。
 *      Playwright 子 agent 進這頁截圖、驗各種 state（active/inactive、
 *      5 種 accent、3 種 traffic、有/無 chip、展開/收合）。
 *
 * 不接 DB、不接 nav_nodes、不走 RBAC — 純 hardcode demo data。
 */

"use client";

import { useState } from "react";

import {
  CallTaskCard,
  CrmCustomerCard,
  CrmKpiCard,
  CrmQuickFilterBar,
  CrmSidebar,
  type CrmKpiAccent,
} from "@/components/crm";

const SECTION_TITLE_CLS = "text-[16px] font-semibold text-[#2C2C2A]";
const SECTION_SUB_CLS = "text-[12px] text-[#9A9890]";
const SECTION_CAPTION_CLS = "text-[13px] font-semibold text-[#5A5955]";

export default function CrmComponentsSandboxPage() {
  // ── KPI 5 種 accent active state demo ──
  const [activeAccent, setActiveAccent] = useState<CrmKpiAccent | null>("red");

  // ── QuickFilterBar active chip demo ──
  const [activeChipKey, setActiveChipKey] = useState<string>("all");

  // ── Sidebar active item demo ──
  const [activeSideKey, setActiveSideKey] = useState<string>("status:all");

  // ── CustomerCard expanded demo ──
  const [expandedKey, setExpandedKey] = useState<string | null>("alex");

  // ── CallTaskCard demo state ──
  const [taskExpanded, setTaskExpanded] = useState<string | null>("t-pending");
  const [taskResult, setTaskResult] = useState<string | null>("answered");
  const [taskNote, setTaskNote] = useState<string>("");
  const [taskNextDate, setTaskNextDate] = useState<string>("");
  const [taskCompetitor, setTaskCompetitor] = useState<string>("");

  return (
    <main className="px-6 py-5 space-y-8 bg-[#FAFAF7] min-h-screen">
      <header className="space-y-1">
        <h1 className={SECTION_TITLE_CLS}>CRM 共用元件 sandbox</h1>
        <p className={SECTION_SUB_CLS}>
          第四輪 BDN Batch 1 Step 0 · 4 個共用元件視覺驗收
          ·{" "}
          <code className="font-mono text-[#185FA5]">/dev/crm-components</code>
        </p>
      </header>

      {/* ============================================================== */}
      {/* 1. CrmKpiCard                                                   */}
      {/* ============================================================== */}
      <section className="space-y-3">
        <div>
          <h2 className={SECTION_CAPTION_CLS}>1. CrmKpiCard — 5 種 accent</h2>
          <p className={SECTION_SUB_CLS}>
            點擊任一卡片切 active state（邊框加粗 + ARIA pressed）
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <CrmKpiCard
            icon="groups"
            label="售後客戶總數"
            value={156}
            sub="本月新增 12 位"
            accent="navy"
            active={activeAccent === "navy"}
            onClick={() => setActiveAccent("navy")}
          />
          <CrmKpiCard
            icon="schedule"
            label="30 天內到期保養"
            value={23}
            sub="建議主動提醒"
            accent="amber"
            active={activeAccent === "amber"}
            onClick={() => setActiveAccent("amber")}
          />
          <CrmKpiCard
            icon="warning"
            label="逾期未回廠"
            value={8}
            sub="需立即聯繫"
            accent="red"
            active={activeAccent === "red"}
            onClick={() => setActiveAccent("red")}
          />
          <CrmKpiCard
            icon="check_circle"
            label="本月進廠台次"
            value={45}
            sub="平均消費 NT$ 8,200"
            accent="teal"
            active={activeAccent === "teal"}
            onClick={() => setActiveAccent("teal")}
          />
          <CrmKpiCard
            icon="sync"
            label="RS05 交車同步"
            value={12}
            sub="D+3 回訪已完成 9 件"
            accent="blue"
            active={activeAccent === "blue"}
            onClick={() => setActiveAccent("blue")}
          />
        </div>

        <div>
          <h3 className={`${SECTION_SUB_CLS} mt-4`}>非互動 / disabled state</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
            <CrmKpiCard
              icon="info"
              label="純展示（無 onClick）"
              value="—"
              sub="不可點"
              accent="navy"
            />
            <CrmKpiCard
              icon="block"
              label="disabled"
              value={99}
              sub="點不到"
              accent="amber"
              onClick={() => undefined}
              disabled
            />
            <CrmKpiCard
              icon="percent"
              label="字串 value"
              value="87.5%"
              accent="teal"
            />
          </div>
        </div>
      </section>

      {/* ============================================================== */}
      {/* 2. CrmQuickFilterBar                                            */}
      {/* ============================================================== */}
      <section className="space-y-3">
        <div>
          <h2 className={SECTION_CAPTION_CLS}>
            2. CrmQuickFilterBar — 7 顆 pill + 管理篩選
          </h2>
          <p className={SECTION_SUB_CLS}>
            active chip 深藍底白字、inactive 白底灰邊；右側選用「⚙ 管理篩選」
          </p>
        </div>
        <CrmQuickFilterBar
          onManage={() => alert("開啟管理篩選 modal（demo）")}
          chips={[
            { key: "all", label: "全部", count: 156 },
            { key: "overdue", label: "🔴 逾期未回廠", count: 8 },
            { key: "soon", label: "⏰ 30 天內到期", count: 23 },
            { key: "warranty", label: "🛡️ 保固即將到期", count: 15 },
            { key: "desmo", label: "⚙️ Desmo 到期提醒", count: 5 },
            { key: "vip", label: "💰 高消費客戶", count: 12 },
            { key: "rs05", label: "🔗 RS05 交車同步", count: 12 },
          ].map((chip) => ({
            ...chip,
            active: chip.key === activeChipKey,
            onClick: () => setActiveChipKey(chip.key),
          }))}
        />

        <div>
          <h3 className={`${SECTION_SUB_CLS} mt-4`}>不帶 count / 不帶管理鈕</h3>
          <div className="mt-2">
            <CrmQuickFilterBar
              chips={[
                { key: "a", label: "全部", active: true, onClick: () => undefined },
                { key: "b", label: "進行中", onClick: () => undefined },
                { key: "c", label: "已完成", onClick: () => undefined },
                { key: "d", label: "已取消", onClick: () => undefined },
              ]}
            />
          </div>
        </div>
      </section>

      {/* ============================================================== */}
      {/* 3. CrmSidebar                                                   */}
      {/* ============================================================== */}
      <section className="space-y-3">
        <div>
          <h2 className={SECTION_CAPTION_CLS}>
            3. CrmSidebar — 三層 group + 快速工具
          </h2>
          <p className={SECTION_SUB_CLS}>
            active item 深藍底白字 + count badge 反白；下方快速工具固定底部
          </p>
        </div>
        <div className="flex gap-4 items-start min-h-[480px]">
          <CrmSidebar
            groups={[
              {
                key: "status",
                title: "回廠狀態",
                items: [
                  { key: "status:all", label: "全部客戶", count: 156 },
                  { key: "status:overdue", label: "逾期未回廠", count: 8, icon: "warning" },
                  { key: "status:soon", label: "即將到期", count: 23 },
                  { key: "status:ok", label: "正常", count: 113 },
                  { key: "status:new", label: "新客戶", count: 12 },
                ].map((it) => ({
                  ...it,
                  active: it.key === activeSideKey,
                  onClick: () => setActiveSideKey(it.key),
                })),
              },
              {
                key: "warranty",
                title: "保固 / 保險",
                items: [
                  { key: "warr:soon", label: "保固即將到期", count: 15 },
                  { key: "warr:desmo", label: "Desmo 到期", count: 5 },
                  { key: "warr:insurance", label: "強制險到期", count: 3 },
                ].map((it) => ({
                  ...it,
                  active: it.key === activeSideKey,
                  onClick: () => setActiveSideKey(it.key),
                })),
              },
            ]}
            quickTools={[
              { key: "call", label: "電訪工作台", href: "/crm/aftersales/call-tasks", icon: "phone_in_talk" },
              { key: "ro", label: "售後工單系統", href: "/parts/aftersales/repair-orders", icon: "build" },
              { key: "nps", label: "NPS 滿意度", href: "/crm/aftersales/nps", icon: "sentiment_satisfied" },
            ]}
          />

          <div className="flex-1 bg-white border border-[#EEECE6] rounded-lg p-4">
            <p className={SECTION_SUB_CLS}>
              主內容區 placeholder — 當前 active：
              <code className="font-mono text-[#185FA5] ml-1">
                {activeSideKey}
              </code>
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================== */}
      {/* 4. CrmCustomerCard                                              */}
      {/* ============================================================== */}
      <section className="space-y-3">
        <div>
          <h2 className={SECTION_CAPTION_CLS}>
            4. CrmCustomerCard — 3 種 traffic + chip + 展開
          </h2>
          <p className={SECTION_SUB_CLS}>
            左 4px 色條（紅 / 黃 / 綠）、中 KV grid、右 actions、可展開
          </p>
        </div>

        <div className="space-y-2">
          <CrmCustomerCard
            traffic="red"
            name="陳大文"
            code="ABC-1234"
            chips={[
              { key: "src", label: "🔗 RS05 同步", color: "teal" },
              { key: "vip", label: "💰 高消費", color: "amber" },
              { key: "tag1", label: "賽道粉", color: "blue" },
            ]}
            fields={[
              { label: "車款", value: "Panigale V4 2024" },
              { label: "里程", value: "12,450 km" },
              { label: "保固到期", value: "2026-08-15", tone: "soon" },
              { label: "Desmo 到期", value: "逾期 12 天", tone: "warn" },
            ]}
            note="客戶反映冷車啟動有異音，已預約 5/20 進廠"
            actions={
              <>
                <button
                  type="button"
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                  onClick={() => alert("電訪")}
                >
                  📞 電訪
                </button>
                <button
                  type="button"
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
                  onClick={() => alert("詳情")}
                >
                  詳情 ›
                </button>
              </>
            }
            expanded={expandedKey === "alex"}
            onToggle={() =>
              setExpandedKey(expandedKey === "alex" ? null : "alex")
            }
            onClick={() => alert("整張卡片點擊（開 drawer）")}
          >
            <div className="space-y-2">
              <h4 className="text-[12px] font-semibold text-[#2C2C2A]">
                展開區（caller 自由）— 範例：最近 3 筆工單
              </h4>
              <ul className="text-[12px] text-[#5A5955] space-y-1">
                <li>• RO-2026-0512 / 一萬公里大保養 / NT$ 12,800</li>
                <li>• RO-2026-0218 / 五千公里小保養 / NT$ 4,200</li>
                <li>• RO-2025-1108 / 鍊條更換 / NT$ 2,800</li>
              </ul>
            </div>
          </CrmCustomerCard>

          <CrmCustomerCard
            traffic="amber"
            name="王小明"
            code="DEF-5678"
            chips={[
              { key: "src", label: "🚶 自行進廠", color: "blue" },
              { key: "tag1", label: "通勤族", color: "gray" },
            ]}
            fields={[
              { label: "車款", value: "Monster 937 2023" },
              { label: "里程", value: "8,200 km" },
              { label: "下次保養", value: "剩 28 天", tone: "soon" },
              { label: "強制險到期", value: "2026-07-01", tone: "default" },
            ]}
            actions={
              <button
                type="button"
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                onClick={() => alert("詳情")}
              >
                詳情 ›
              </button>
            }
            expanded={expandedKey === "wang"}
            onToggle={() =>
              setExpandedKey(expandedKey === "wang" ? null : "wang")
            }
          />

          <CrmCustomerCard
            traffic="green"
            name="林雅芳"
            code="XYZ-9012"
            chips={[
              { key: "src", label: "👤 SA 自建", color: "gray" },
            ]}
            fields={[
              { label: "車款", value: "Scrambler Icon 2025" },
              { label: "里程", value: "3,100 km" },
              { label: "保固到期", value: "2027-03-20", tone: "ok" },
              { label: "Desmo 到期", value: "尚未到期", tone: "ok" },
            ]}
            note="新客戶（建檔 23 天）"
            actions={
              <button
                type="button"
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                onClick={() => alert("詳情")}
              >
                詳情 ›
              </button>
            }
            onClick={() => alert("整張卡片點擊")}
          />

          <div className="pt-2">
            <h3 className={SECTION_SUB_CLS}>無 chip / 無 actions / 無 onClick</h3>
            <div className="mt-2">
              <CrmCustomerCard
                traffic="green"
                name="純展示客戶"
                code="—"
                fields={[
                  { label: "電話", value: "0912-345-678" },
                  { label: "Email", value: "test@example.com" },
                ]}
              />
            </div>
          </div>

          <div className="pt-2">
            <h3 className={SECTION_SUB_CLS}>disabled state（pending 灰化）</h3>
            <div className="mt-2">
              <CrmCustomerCard
                traffic="amber"
                name="儲存中⋯"
                code="DEMO-0001"
                fields={[
                  { label: "車款", value: "Diavel V4" },
                  { label: "里程", value: "1,200 km" },
                ]}
                disabled
                actions={
                  <button
                    type="button"
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white"
                    disabled
                  >
                    儲存中⋯
                  </button>
                }
              />
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================== */}
      {/* 5. CallTaskCard                                                 */}
      {/* ============================================================== */}
      <section className="space-y-3">
        <div>
          <h2 className={SECTION_CAPTION_CLS}>
            5. CallTaskCard — 4 種 status + 展開 + topInfoBar slot
          </h2>
          <p className={SECTION_SUB_CLS}>
            左 4px 狀態色條（overdue 紅 / pending 黃 / done 綠 / scheduled 藍）、
            可展開話術 / 歷史 / 通話結果 5 chip / 下次跟進 / 競品 / 備註 / 儲存
          </p>
        </div>

        <div className="space-y-2">
          {/* overdue + sales + 售後進廠資訊條 slot off */}
          <CallTaskCard
            taskType="d3_followup"
            taskTypeBadge="D+3 即時追蹤"
            taskTypeColor="red"
            customerName="陳大文"
            customerCode="C00001"
            scheduledLabel="2026-05-14 14:30"
            status="overdue"
            chips={[
              { key: "rs", label: "👤 陳雅惠", color: "gray" },
              { key: "att", label: "已嘗試 1 次", color: "gray" },
            ]}
            expanded={taskExpanded === "t-overdue"}
            onToggle={() =>
              setTaskExpanded(taskExpanded === "t-overdue" ? null : "t-overdue")
            }
            scriptTagLabel="話術提示 — D+3 追蹤"
            scriptText="您好，三天前您留下資訊看 FTR 1200，今天想跟您確認考慮進度，有沒有什麼問題我可以協助釐清？"
            scriptHints={["確認分期方案", "詢問決策進度", "提供補充資料", "邀約再次到店"]}
            history={[
              { date: "2026-05-12", result: "[D+3] 未接聽", note: "撥打 1 次無回應", tone: "amber" },
              { date: "2026-05-10", result: "[展廳] 到店試乘", note: "Roadmaster / 30 分鐘", tone: "teal" },
            ]}
            callResults={[
              { key: "answered", label: "✅ 已接通", tint: "teal" },
              { key: "no_answer", label: "📵 未接聽", tint: "amber" },
              { key: "callback_later", label: "📅 改期再撥", tint: "navy" },
              { key: "refused", label: "❌ 結案", tint: "red" },
              { key: "wrong_number", label: "📬 號碼錯誤", tint: "gray" },
            ]}
            selectedResult={taskResult}
            onSelectResult={(k) => setTaskResult(k)}
            nextFollowUpDate={taskNextDate}
            onChangeNextDate={setTaskNextDate}
            competitorBrand={taskCompetitor}
            onChangeCompetitor={setTaskCompetitor}
            note={taskNote}
            onChangeNote={setTaskNote}
            onSave={() => alert("儲存通話記錄（demo）")}
            onSkip={() => alert("略過今日（demo）")}
            footerHint={<span>🎯 目標：確認分期方案與決策進度</span>}
            actions={
              <a
                href="tel:0912345678"
                className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white"
              >
                📞 0912-345-678
              </a>
            }
          />

          {/* pending today */}
          <CallTaskCard
            taskType="d7_followup"
            taskTypeBadge="D+7 深度確認"
            taskTypeColor="amber"
            customerName="王小明"
            customerCode="C00012"
            scheduledLabel="2026-05-17 11:30"
            status="pending"
            chips={[{ key: "rs", label: "👤 林俊傑", color: "gray" }]}
            expanded={taskExpanded === "t-pending"}
            onToggle={() =>
              setTaskExpanded(taskExpanded === "t-pending" ? null : "t-pending")
            }
            scriptTagLabel="話術提示 — D+7 深度確認"
            scriptText="您好，我是上週聯絡過您的業務，想再次確認您對 FTR 1200 的考慮進度。"
            scriptHints={["了解猶豫點", "比較競品優勢", "提供試乘"]}
            callResults={[
              { key: "answered", label: "✅ 已接通", tint: "teal" },
              { key: "no_answer", label: "📵 未接聽", tint: "amber" },
              { key: "callback_later", label: "📅 改期", tint: "navy" },
              { key: "refused", label: "❌ 結案", tint: "red" },
              { key: "wrong_number", label: "📬 錯號", tint: "gray" },
            ]}
            selectedResult={null}
            onSelectResult={() => undefined}
            nextFollowUpDate=""
            onChangeNextDate={() => undefined}
            competitorBrand=""
            onChangeCompetitor={() => undefined}
            note=""
            onChangeNote={() => undefined}
            onSave={() => undefined}
            onSkip={() => undefined}
          />

          {/* done */}
          <CallTaskCard
            taskType="event_invite"
            taskTypeBadge="活動邀約"
            taskTypeColor="blue"
            customerName="林雅芳"
            customerCode="C00015"
            scheduledLabel="2026-05-17 09:00"
            status="done"
            chips={[
              { key: "rs", label: "👤 王建華", color: "gray" },
              { key: "res", label: "已接通", color: "teal" },
            ]}
            onToggle={() => undefined}
          />

          {/* scheduled + 售後進廠資訊條 slot demo */}
          <CallTaskCard
            taskType="aftersales_d3"
            taskTypeBadge="D+3 售後滿意度"
            taskTypeColor="teal"
            customerName="周杰倫"
            customerCode="C00018"
            scheduledLabel="2026-05-22 10:00"
            status="scheduled"
            chips={[{ key: "sa", label: "👤 David Tan", color: "gray" }]}
            expanded={taskExpanded === "t-aftersales"}
            onToggle={() =>
              setTaskExpanded(taskExpanded === "t-aftersales" ? null : "t-aftersales")
            }
            topInfoBar={
              <div className="bg-[#EAF3DE] border border-[#C5DC9F] rounded-md px-3 py-2 text-[12px] text-[#3B6D11] flex flex-wrap gap-x-4 gap-y-1">
                <span><b className="font-mono">RO-2026-0512</b></span>
                <span>進廠：2026-05-19</span>
                <span>里程：12,450 km</span>
                <span>消費：NT$ 12,800</span>
              </div>
            }
            scriptTagLabel="話術提示 — D+3 售後滿意度"
            scriptText="您好，三天前您在我們這邊進廠保養，想跟您確認車況有沒有什麼異常⋯"
            scriptHints={["確認車況", "詢問 NPS", "提醒下次保養", "感謝光臨"]}
            callResults={[
              { key: "answered", label: "✅ 已接通", tint: "teal" },
              { key: "callback_later", label: "📅 改期", tint: "navy" },
            ]}
            selectedResult={null}
            onSelectResult={() => undefined}
            nextFollowUpDate=""
            onChangeNextDate={() => undefined}
            note=""
            onChangeNote={() => undefined}
            onSave={() => undefined}
          />
        </div>
      </section>

      <footer className="pt-6 border-t border-[#EEECE6]">
        <p className={SECTION_SUB_CLS}>
          ✅ 5 個元件均為 client component (`&quot;use client&quot;`)、TS strict、
          純 props 驅動、無 console.log、無 DB 相依。可在 CRM01A/B、CRM03A/B、
          CRM04A/B 等卡片型頁面直接 import 使用。
        </p>
      </footer>
    </main>
  );
}
