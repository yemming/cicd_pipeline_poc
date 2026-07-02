"use client";

/**
 * 中古車評估鑑價 v2 — RS06 5-tab 評估單
 *
 * 規格：docs/DUCATI_v2_output/01_銷售接待/02_展廳接待/RS06_中古車評估鑑價_v2.html
 *
 * 5 個 tab：
 *   - TAB 0：基本資料 & 證件掃描
 *   - TAB 1：外觀漆面評估（損傷點 + 漆膜厚度 + 燈具玻璃）
 *   - TAB 2：車身骨架結構檢查（OK/警告/損傷 三態 checklist + 進度條）
 *   - TAB 3：機械底盤系統（OK/警告/損傷 三態 + 進度條 + 輪胎量化）
 *   - TAB 4：收購定價核算（4 段 A/B/C/D 計算表 + 評估結論）
 *
 * 跨頁 state：N/A（單頁 wizard，純 useState）
 * 後端：第七輪 BDN P1-#7（2026-05-17）已接 DB（used_car_evaluations 表）：
 *        - 💾 儲存評估單 → INSERT status='draft'，建立後可繼續修改
 *        - 📨 送出簽核   → 改 status='submitted'，進 /admin/approvals/tradein
 *        - 歷史評估列表 → /usedcar/evaluations
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";
import { useIsAdmin } from "@/components/admin-context";
import {
  createEvaluationAction,
  submitEvaluationAction,
  approveEvaluationAction,
  rejectEvaluationAction,
  deleteEvaluationAction,
  loadEvaluationForViewAction,
  confirmTradeInAcquisitionAction,
  uploadLoanClearanceDocAction,
} from "@/lib/used-car/evaluation-actions";
import type { UsedCarEvaluationWithCustomer } from "@/domain/used-car-evaluations";
import { brands as brandConfigs } from "@/lib/brands/registry";
import { useActiveBrand } from "@/lib/scope/scope-context";

// ============================================================
// 常數
// ============================================================

const BIKE_MODELS = [
  "— 選擇車款 —",
  "Panigale V2（2021）",
  "Panigale V4 S",
  "Monster SP",
  "Streetfighter V4",
  "Multistrada V4 S",
  "DesertX Rally",
  "Hypermotard 698 RVE",
];

const DISPLACEMENTS = [
  "955 cc（≥500cc）",
  "950 cc",
  "821 cc",
  "698 cc",
  "499 cc（＜500cc）",
];

const GRADE_OPTIONS = [
  { key: "S", label: "CPO認證", color: "#C8001A" },
  { key: "A", label: "優良", color: "#185FA5" },
  { key: "B", label: "良好", color: "#0F6E56" },
  { key: "C", label: "普通", color: "#854F0B" },
  { key: "D", label: "整備中", color: "#9A9890" },
] as const;

type GradeKey = (typeof GRADE_OPTIONS)[number]["key"];

const TAB_DEFS = [
  { num: 0, label: "📋 基本資料 & 證件掃描" },
  { num: 1, label: "🎨 外觀漆面評估" },
  { num: 2, label: "🔩 車身骨架結構" },
  { num: 3, label: "⚙️ 機械底盤系統" },
  { num: 4, label: "💰 收購定價核算" },
];

const SCAN_DOCS: Array<{ id: number; icon: string; label: string; sub: string }> = [
  { id: 0, icon: "📋", label: "行照正本", sub: "確認車牌/VIN/車型一致" },
  { id: 1, icon: "🆔", label: "賣方身分證", sub: "正面 + 背面（雙證件）" },
  { id: 2, icon: "🆔", label: "買方身分證", sub: "正面 + 背面（雙證件）" },
  { id: 3, icon: "🛡️", label: "強制責任險保單", sub: "有效期需 30 日以上" },
  { id: 4, icon: "✅", label: "臨時檢驗合格證", sub: "出廠 5 年以上車輛必備" },
  { id: 5, icon: "📖", label: "保養手冊/維修紀錄", sub: "評估保養完整性" },
  { id: 6, icon: "🔢", label: "VIN 車身號碼特寫", sub: "車架實體號碼，需與行照一致" },
  { id: 7, icon: "📊", label: "里程數特寫", sub: "通電後儀表板截圖" },
];

const FINE_QUERY_OPTIONS = ["未查詢", "無未繳罰款 ✅", "有未繳罰款 ⚠️（需先繳清）"];
const LIEN_OPTIONS = [
  "未查詢",
  "無設定（可直接過戶）✅",
  "有設定，已清償塗銷 ✅",
  "有設定，尚未清償 ❌（需先辦塗銷）",
];
const INSPECT_OPTIONS = [
  "出廠未滿 5 年（免驗車）",
  "出廠 5 年以上，4 個月內已驗車 ✅",
  "出廠 5 年以上，需臨時驗車 ⚠️",
];
const TAX_OPTIONS = ["未查詢", "已繳清 ✅", "有積欠 ⚠️（需先清繳）"];

const DOT_STATES = ["empty", "ok", "warn", "bad"] as const;
type DotState = (typeof DOT_STATES)[number];

const SIDE_DOTS: Array<{ id: string; left: string; top: string; label: string }> = [
  { id: "s0", left: "21%", top: "62%", label: "左整流罩" },
  { id: "s1", left: "36%", top: "42%", label: "油箱車身" },
  { id: "s2", left: "52%", top: "45%", label: "座墊尾段" },
  { id: "s3", left: "78%", top: "58%", label: "車尾整流罩" },
  { id: "s4", left: "23%", top: "88%", label: "前輪前叉" },
  { id: "s5", left: "77%", top: "88%", label: "後輪後搖臂" },
  { id: "s6", left: "38%", top: "70%", label: "引擎本體" },
  { id: "s7", left: "74%", top: "76%", label: "排氣管" },
];

const TOP_DOTS: Array<{ id: string; left: string; top: string; label: string }> = [
  { id: "t0", left: "30%", top: "28%", label: "左前車身" },
  { id: "t1", left: "30%", top: "72%", label: "右前車身" },
  { id: "t2", left: "65%", top: "28%", label: "左後車身" },
  { id: "t3", left: "65%", top: "72%", label: "右後車身" },
];

const PAINT_ZONES = [
  "前土除",
  "前叉/儀表",
  "左整流罩（前）",
  "右整流罩（前）",
  "油箱蓋",
  "油箱（左）",
  "油箱（右）",
  "左整流罩（後）",
  "右整流罩（後）",
  "尾段整流罩",
  "排氣管護蓋",
  "座墊總成",
];

type CheckState = "none" | "ok" | "warn" | "bad";

const GLASS_ITEMS = [
  "儀表板液晶顯示正常（無故障燈、無像素死點）",
  "前燈（LED）左右亮度一致，無進水霧化",
  "後燈及方向燈運作正常",
  "後視鏡完整無裂損（如有安裝）",
  "風鏡完整無裂紋（如有安裝）",
  "護手包覆完整無龜裂老化",
];

const FRAME_CATS: Array<{ cat: string; items: string[] }> = [
  {
    cat: "前段骨架",
    items: [
      "前車架頭管無彎曲變形（目視確認）",
      "前叉上下三角台螺絲無轉動/鬆動痕跡",
      "車架前端無明顯衝擊溃縮痕跡",
      "前土除固定螺絲狀態正常",
      "燈座/儀表固定點無異常",
    ],
  },
  {
    cat: "中段骨架",
    items: [
      "主車架管件無裂紋或補焊痕跡",
      "引擎固定吊架螺絲無鬆動",
      "油箱固定座無銹蝕或變形",
      "車架中段無明顯側向變形",
    ],
  },
  {
    cat: "後段骨架",
    items: [
      "後搖臂軸心螺絲（後輪軸）230 Nm 扭力點無異常",
      "後搖臂軸承無異常間隙或鏽蝕",
      "後子車架（尾架）焊接完整無裂紋",
      "後搖臂無彎曲，左右對稱",
    ],
  },
  {
    cat: "事故記錄判斷",
    items: [
      "車身號碼（VIN）字跡清晰無改刻痕跡",
      "引擎號碼字跡清晰無改刻",
      "車架主要焊接點未見非原廠再焊接",
      "車身各部件間隙均勻（前後輪/引擎/整流罩）",
      "封膠連續性正常（非原廠封膠形狀不均勻）",
    ],
  },
];

const MECH_CATS: Array<{ cat: string; items: string[] }> = [
  {
    cat: "引擎系統",
    items: [
      "冷啟動順利，無異常聲音",
      "怠速穩定不忽高忽低",
      "機油液面正常（油尺確認）",
      "機油顏色正常（無乳化、無黑泥）",
      "冷卻液液面正常，無渗漏",
      "引擎本體無滲漏機油痕跡",
      "故障燈（Check Engine）無亮起",
    ],
  },
  {
    cat: "傳動系統",
    items: [
      "鏈條張力正常無過度鬆弛",
      "鏈盤齒形磨耗在允許範圍",
      "各檔位換檔順暢（路試確認）",
      "離合器作動正常無打滑",
      "後輪驅動無異常振動",
    ],
  },
  {
    cat: "煞車系統",
    items: [
      "前煞車碟盤厚度正常（無明顯磨耗溝）",
      "後煞車碟盤厚度正常",
      "前煞車拉桿手感正常",
      "ABS 指示燈行駛後正常熄滅",
      "煞車液液面在正常範圍",
      "煞車管路無裂縫或油漬",
    ],
  },
  {
    cat: "懸吊系統",
    items: [
      "前叉無滲漏避震油痕跡",
      "前叉作動順暢（手壓測試）",
      "後避震器無滲漏，壓縮回彈正常",
      "行駛過不平路面無異常雜音",
      "車身左右高度均等",
    ],
  },
  {
    cat: "電氣系統",
    items: [
      "電瓶電壓正常（靜態 12.6V 以上）",
      "充電系統正常（運轉時 13.5–14.5V）",
      "所有燈具功能正常",
      "儀表板指示燈功能正常",
      "行車電腦無儲存故障碼",
    ],
  },
];

const TIRE_WEAR_OPTIONS = [
  "均勻（正常）",
  "中央磨損（氣壓過高）",
  "邊緣磨損（氣壓過低）",
  "單側磨損（定位異常）",
  "鋸齒磨損（懸吊問題）",
];

// T12：收購決策改成「有 value 的選項」（對映設計稿 RS06 STEP4）。
// value 落 DB（decision 欄）、label 顯示。前 3 個（BUY_*）會觸發真正建主檔+工單，NO_BUY 不觸發。
const PURCHASE_DECISIONS: { value: string; label: string }[] = [
  { value: "", label: "— 請選擇收購決策 —" },
  { value: "BUY_NORMAL", label: "✅ 建議收購（正常流程）" },
  { value: "BUY_COND", label: "⚠️ 條件收購（整備後重評）" },
  { value: "BUY_MGR", label: "🔐 謹慎收購（需主管核准）" },
  { value: "NO_BUY", label: "❌ 不建議收購（風險過高）" },
];

// 是否為「會觸發建主檔」的收購決策
const BUY_DECISIONS = new Set(["BUY_NORMAL", "BUY_COND", "BUY_MGR"]);

function n(v: string) {
  return parseInt(v.replace(/[^\d]/g, ""), 10) || 0;
}

function fmt(v: number) {
  return v.toLocaleString();
}

// ============================================================
// 主元件
// ============================================================

export default function UsedCarEvaluationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const brandName = brandConfigs[useActiveBrand()].displayName;

  useSetPageHeader({
    breadcrumb: [
      { label: "中古車輛", href: "/usedcar/sales-dashboard" },
      { label: "中古車評估鑑價" },
    ],
  });

  const [tab, setTab] = useState<0 | 1 | 2 | 3 | 4>(0);

  // TAB 0 基本資料
  // BDN #15 · 從 RS01 電子手卡跳轉過來時 pre-fill 客戶姓名
  //   URL pattern：/usedcar/evaluation?from_handcard=1&customer_name=XXX
  //   handcard 沒蒐集車牌欄位，所以只 pre-fill 姓名；plate 留給 RS 用行照 OCR 填
  //   lazy init 一次即可、不用 useEffect（避免 react-hooks/set-state-in-effect）
  const [sellerName, setSellerName] = useState(() => {
    if (searchParams.get("from_handcard")) {
      return searchParams.get("customer_name")?.trim() ?? "";
    }
    return "";
  });
  const [brand, setBrand] = useState(brandName);
  const [model, setModel] = useState("Panigale V2（2021）");
  const [year, setYear] = useState("2021");
  const [vin, setVin] = useState("");
  const [engineNo, setEngineNo] = useState("");
  const [plate, setPlate] = useState("");
  const [mileage, setMileage] = useState("");
  const [color, setColor] = useState("");
  const [displacement, setDisplacement] = useState(DISPLACEMENTS[0]);
  const [licenseExpire, setLicenseExpire] = useState("");
  const [insuranceExpire, setInsuranceExpire] = useState("");
  const [appraiser, setAppraiser] = useState("陳志明 RS");
  const [quickGrade, setQuickGrade] = useState<GradeKey>("S");
  const [quickNote, setQuickNote] = useState("");

  // TAB 0 證件掃描
  const [scanned, setScanned] = useState<number[]>([]);
  const [scanDates, setScanDates] = useState<Record<number, string>>({});
  // TAB 0 OCR 結果（demo 階段：點掃描格上的「Demo OCR」按鈕灌入；後續輪次接真 OCR API）
  const [ocrVin, setOcrVin] = useState("");
  const [ocrEngineNo, setOcrEngineNo] = useState("");
  const [fineQuery, setFineQuery] = useState(FINE_QUERY_OPTIONS[0]);
  const [lien, setLien] = useState(LIEN_OPTIONS[0]);
  const [inspect, setInspect] = useState(INSPECT_OPTIONS[0]);
  const [tax, setTax] = useState(TAX_OPTIONS[0]);
  const [insuranceRemain, setInsuranceRemain] = useState("");
  // 輪7-4：貸款清償證明文件
  const [loanClearanceDocUrl, setLoanClearanceDocUrl] = useState<string | null>(null);
  const [loanDocUploading, setLoanDocUploading] = useState(false);
  const [loanDocError, setLoanDocError] = useState<string | null>(null);

  // TAB 1 外觀損傷點
  const [sideDots, setSideDots] = useState<Record<string, DotState>>(() => {
    const o: Record<string, DotState> = {};
    for (const d of SIDE_DOTS) o[d.id] = "empty";
    return o;
  });
  const [topDots, setTopDots] = useState<Record<string, DotState>>(() => {
    const o: Record<string, DotState> = {};
    for (const d of TOP_DOTS) o[d.id] = "empty";
    return o;
  });
  const [dotLog, setDotLog] = useState("");

  // TAB 1 漆膜
  const [paintUm, setPaintUm] = useState<Record<number, string>>({});
  const [paintState, setPaintState] = useState<Record<number, 0 | 1 | 2 | undefined>>({});

  // TAB 1 燈具/玻璃
  const [glassChecks, setGlassChecks] = useState<Record<number, CheckState>>(() => {
    const o: Record<number, CheckState> = {};
    for (let i = 0; i < GLASS_ITEMS.length; i += 1) o[i] = "none";
    return o;
  });

  // TAB 2 骨架
  const [frameChecks, setFrameChecks] = useState<Record<string, CheckState>>({});

  // TAB 3 機械
  const [mechChecks, setMechChecks] = useState<Record<string, CheckState>>({});

  // TAB 3 輪胎
  const [tireFrontMm, setTireFrontMm] = useState("");
  const [tireRearMm, setTireRearMm] = useState("");
  const [tireFrontPsi, setTireFrontPsi] = useState("");
  const [tireRearPsi, setTireRearPsi] = useState("");
  const [tireFrontWear, setTireFrontWear] = useState(TIRE_WEAR_OPTIONS[0]);
  const [tireRearWear, setTireRearWear] = useState(TIRE_WEAR_OPTIONS[0]);
  const [tireFrontBrand, setTireFrontBrand] = useState("");
  const [tireRearBrand, setTireRearBrand] = useState("");

  // TAB 4 定價
  const [pMarket, setPMarket] = useState("");
  const [pMsrp, setPMsrp] = useState("");
  const [pRepair, setPRepair] = useState("");
  const [pPaint, setPPaint] = useState("");
  const [pTire, setPTire] = useState("");
  const [pWarranty, setPWarranty] = useState("");
  const [pAdmin, setPAdmin] = useState("5000");
  const [pComm, setPComm] = useState("");
  const [pProfit, setPProfit] = useState("");
  const [pNew, setPNew] = useState("");
  const [finalGrade, setFinalGrade] = useState<GradeKey>("B");
  // T12：decision 現在存 value（BUY_NORMAL / BUY_COND / BUY_MGR / NO_BUY / ""）
  const [decision, setDecision] = useState<string>("");
  const [conclusion, setConclusion] = useState("");

  // T12：確認收購結果（成功卡）+ transition
  const [tradeInDone, setTradeInDone] = useState<{
    used_car_id: string;
    ro_code: string;
    conditional: boolean;
  } | null>(null);
  const [isAcquiring, startAcquireTransition] = useTransition();

  // toast
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  // 已建立的評估單 id（成功儲存 draft 後填入；用於後續 submit）
  const [savedEvalId, setSavedEvalId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // ── ?id= 進來 → fetch + prefill（view 模式 / 簽核台「查看」進來）─────────
  const evaluationId = searchParams.get("id");
  const [prefillLoading, setPrefillLoading] = useState<boolean>(!!evaluationId);
  const [prefillSource, setPrefillSource] =
    useState<UsedCarEvaluationWithCustomer | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);

  useEffect(() => {
    if (!evaluationId) return;
    let cancelled = false;
    (async () => {
      setPrefillLoading(true);
      setPrefillError(null);
      const r = await loadEvaluationForViewAction(evaluationId);
      if (cancelled) return;
      if (!r.ok) {
        setPrefillError(r.error);
        setPrefillLoading(false);
        return;
      }
      const row = r.data;
      setPrefillSource(row);
      setSavedEvalId(row.id);
      if (row.customer?.name) setSellerName(row.customer.name);
      if (row.brand_name) setBrand(row.brand_name);
      if (row.model) setModel(row.model);
      if (row.year != null) setYear(String(row.year));
      if (row.vin) setVin(row.vin);
      if (row.license_plate) setPlate(row.license_plate);
      if (row.mileage != null) setMileage(String(row.mileage));
      if (row.color) setColor(row.color);
      if (row.displacement) setDisplacement(row.displacement);
      if (row.appraiser) setAppraiser(row.appraiser);
      if (row.condition_grade) {
        setQuickGrade(row.condition_grade);
        setFinalGrade(row.condition_grade);
      }
      if (row.conclusion) {
        setQuickNote(row.conclusion);
        setConclusion(row.conclusion);
      }
      if (row.decision) setDecision(row.decision);
      // pricing_jsonb 反向 prefill（key 對應 handleSaveDraft 寫入時的命名）
      const pricing = (row.pricing_jsonb ?? {}) as Record<string, unknown>;
      const asStr = (v: unknown) => (typeof v === "string" ? v : "");
      if (pricing.pMarket != null) setPMarket(asStr(pricing.pMarket));
      if (pricing.pMsrp != null) setPMsrp(asStr(pricing.pMsrp));
      if (pricing.pRepair != null) setPRepair(asStr(pricing.pRepair));
      if (pricing.pPaint != null) setPPaint(asStr(pricing.pPaint));
      if (pricing.pTire != null) setPTire(asStr(pricing.pTire));
      if (pricing.pWarranty != null) setPWarranty(asStr(pricing.pWarranty));
      if (pricing.pAdmin != null) setPAdmin(asStr(pricing.pAdmin));
      if (pricing.pComm != null) setPComm(asStr(pricing.pComm));
      if (pricing.pProfit != null) setPProfit(asStr(pricing.pProfit));
      if (pricing.pNew != null) setPNew(asStr(pricing.pNew));
      // equipment_jsonb 反向 prefill 賣家 / OCR / 證件等（最常見的 metadata 欄）
      const eq = (row.equipment_jsonb ?? {}) as Record<string, unknown>;
      if (typeof eq.sellerName === "string" && eq.sellerName) setSellerName(eq.sellerName);
      if (typeof eq.engineNo === "string") setEngineNo(eq.engineNo);
      if (typeof eq.licenseExpire === "string") setLicenseExpire(eq.licenseExpire);
      if (typeof eq.insuranceExpire === "string") setInsuranceExpire(eq.insuranceExpire);
      if (typeof eq.quickNote === "string") setQuickNote(eq.quickNote);
      // 輪7-4：貸款清償證明文件
      if (row.loan_clearance_doc_url) setLoanClearanceDocUrl(row.loan_clearance_doc_url);
      setPrefillLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [evaluationId]);

  // ── 簽核：detail 頁直接核准 / 駁回（admin only、status=submitted 才顯示）─────
  const isAdmin = useIsAdmin();
  const [isApproving, startApproveTransition] = useTransition();
  const canApprove =
    isAdmin && !!prefillSource && prefillSource.status === "submitted";

  function handleApprove() {
    if (!evaluationId || !canApprove) return;
    if (!confirm(`確定核准評估單 ${prefillSource?.eval_no ?? ""}？`)) return;
    startApproveTransition(async () => {
      const r = await approveEvaluationAction(evaluationId);
      if (!r.ok) {
        showToast(`❌ 核准失敗：${r.error}`);
        return;
      }
      showToast("✓ 已核准、同步建中古車庫存");
      setTimeout(() => router.push("/admin/approvals/tradein"), 800);
    });
  }

  function handleReject() {
    if (!evaluationId || !canApprove) return;
    const reason = window.prompt("駁回原因（必填）：");
    if (!reason || !reason.trim()) {
      showToast("❌ 請填寫駁回原因");
      return;
    }
    startApproveTransition(async () => {
      const r = await rejectEvaluationAction(evaluationId, reason.trim());
      if (!r.ok) {
        showToast(`❌ 駁回失敗：${r.error}`);
        return;
      }
      showToast("✓ 已駁回");
      setTimeout(() => router.push("/admin/approvals/tradein"), 800);
    });
  }

  // ── 刪除：admin only、draft only（後端 domain helper 也強制 status=draft）─────
  const canDelete =
    isAdmin && !!prefillSource && prefillSource.status === "draft";

  function handleDelete() {
    if (!evaluationId || !canDelete) return;
    if (
      !confirm(
        `確定刪除評估單 ${prefillSource?.eval_no ?? ""}？無法復原。`,
      )
    )
      return;
    startApproveTransition(async () => {
      const r = await deleteEvaluationAction(evaluationId);
      if (!r.ok) {
        showToast(`❌ 刪除失敗：${r.error}`);
        return;
      }
      showToast("✓ 已刪除");
      setTimeout(() => router.push("/usedcar/evaluations"), 700);
    });
  }

  // ── 修改：draft 狀態下、wizard inputs 一直可編；CRUD pill bar 提供「💾 儲存變更」
  // 直接 trigger 既有 handleSaveDraft（內部會判斷 update vs create）。
  const canEdit = !!prefillSource && prefillSource.status === "draft";

  // 評估單號（每次掛載 generate）
  const evalNo = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `EV-${y}${m}${dd}-001`;
  }, []);

  // TODO(P0-#3 follow-up): 處理 ?id=<uuid> hydrate edit mode
  // 目前 wizard 是 client component、state 樹複雜（50+ useState），hydrate 邏輯
  // 需要全部 setState 從 equipment_jsonb / pricing_jsonb 還原；留到後續輪次補。
  // 入單成功後 router.push 到 /usedcar/evaluations 列表頁讓 user 看到 row 已落 DB。

  // ============================================================
  // Save / Submit handlers — 第八輪 BDN P0-#3（2026-05-17）接 DB
  // ============================================================

  // 把當前 wizard state 整包打成 CreateEvaluationInput
  // 不讀 calcResult（避免破壞 useMemo 編譯期 memoization）；suggested 用同公式 inline 算
  const buildPayload = () => {
    const market = n(pMarket);
    const cost =
      n(pRepair) + n(pPaint) + n(pTire) + n(pWarranty) + n(pAdmin) + n(pComm) + n(pProfit);
    const suggested = market - cost;
    return ({
    eval_no: evalNo,
    vin: vin.trim() || null,
    license_plate: plate.trim() || null,
    brand_name: brand.trim() || null,
    model: model.trim() || null,
    year: year ? Number(year) || null : null,
    color: color.trim() || null,
    displacement: displacement || null,
    mileage: mileage ? Number(mileage) || null : null,
    appraiser: appraiser.trim() || null,
    condition_grade: finalGrade,
    estimated_value: suggested || null,
    decision: decision || null,
    conclusion: conclusion.trim() || null,
    equipment_jsonb: {
      sideDots,
      topDots,
      paintState,
      paintUm,
      glassChecks,
      frameChecks,
      mechChecks,
      tireFrontMm,
      tireRearMm,
      tireFrontPsi,
      tireRearPsi,
      tireFrontWear,
      tireRearWear,
      tireFrontBrand,
      tireRearBrand,
      sellerName,
      engineNo,
      licenseExpire,
      insuranceExpire,
      fineQuery,
      lien,
      inspect,
      tax,
      insuranceRemain,
      quickGrade,
      quickNote,
      ocrVin,
      ocrEngineNo,
      scanned,
      scanDates,
    },
    pricing_jsonb: {
      pMarket,
      pMsrp,
      pRepair,
      pPaint,
      pTire,
      pWarranty,
      pAdmin,
      pComm,
      pProfit,
      pNew,
    },
    });
  };

  // 儲存 draft — 若已有 savedEvalId 走 update（避免重複建單），否則 create
  // navigateAfter: 成功後是否導頁；submit flow 不導頁直接接送簽
  function handleSaveDraft(opts?: { navigateAfter?: boolean }): Promise<string | null> {
    const navigateAfter = opts?.navigateAfter ?? true;
    return new Promise((resolve) => {
      startTransition(async () => {
        // 基本必填 guard
        if (!vin.trim() && !plate.trim() && !model.trim()) {
          showToast("❌ 至少需填寫車款、VIN 或車牌其中一項");
          resolve(null);
          return;
        }
        const payload = buildPayload();
        // 若已存過、走 update（之後 polish 可改 RPC upsert；目前 create 就好）
        // 目前 RLS / unique constraint 未強制 eval_no 唯一，重存會被擋在 helper 端
        const r = await createEvaluationAction(payload);
        if (!r.ok) {
          showToast(`❌ ${r.error}`);
          resolve(null);
          return;
        }
        setSavedEvalId(r.data.id);
        showToast(`✓ 評估單 ${evalNo} 已儲存草稿`);
        if (navigateAfter) {
          router.push("/usedcar/evaluations");
        }
        resolve(r.data.id);
      });
    });
  }

  // 送出簽核：若還沒儲存先儲存（不導頁）→ 立刻 submit → 導列表
  function handleSubmitForReview() {
    startTransition(async () => {
      let id = savedEvalId;
      if (!id) {
        // 還沒存過、先建 draft（不導頁）
        if (!vin.trim() && !plate.trim() && !model.trim()) {
          showToast("❌ 至少需填寫車款、VIN 或車牌其中一項");
          return;
        }
        const r = await createEvaluationAction(buildPayload());
        if (!r.ok) {
          showToast(`❌ 建立失敗：${r.error}`);
          return;
        }
        setSavedEvalId(r.data.id);
        id = r.data.id;
      }
      const sr = await submitEvaluationAction(id);
      if (!sr.ok) {
        showToast(`❌ 送簽失敗：${sr.error}`);
        return;
      }
      showToast(`📨 評估單 ${evalNo} 已送出簽核`);
      router.push("/usedcar/evaluations");
    });
  }

  // ── T12：確認收購（置換 trade_in）— 真 server action ─────────────────
  // 呼叫共用觸發函式：建中古車主檔（pending_recon）+ 觸發 PD-UC 整備工單。
  // decision 必為 BUY_* 才會走這條；NO_BUY 不觸發。
  function handleConfirmTradeIn() {
    if (!BUY_DECISIONS.has(decision)) {
      showToast("❌ 請先在「收購決策」選擇收購選項");
      return;
    }
    // 基本必填：車款 / VIN / 車牌 至少一項
    if (!model.trim() && !vin.trim() && !plate.trim()) {
      showToast("❌ 至少需填寫車款、VIN 或車牌其中一項");
      return;
    }
    const market = n(pMarket);
    const cost =
      n(pRepair) + n(pPaint) + n(pTire) + n(pWarranty) + n(pAdmin) + n(pComm) + n(pProfit);
    const suggested = market - cost;
    const reconEstimate = n(pRepair) + n(pPaint) + n(pTire) + n(pWarranty) + n(pAdmin);
    startAcquireTransition(async () => {
      const r = await confirmTradeInAcquisitionAction({
        evaluation_id: savedEvalId ?? undefined,
        decision: decision as "BUY_NORMAL" | "BUY_COND" | "BUY_MGR",
        vehicle: {
          brand_name: brand.trim() || null,
          model: model.trim() || null,
          year: year ? Number(year) || null : null,
          vin: vin.trim() || null,
          license_plate: plate.trim() || null,
          color: color.trim() || null,
          mileage_km: mileage ? Number(mileage) || null : null,
          condition_grade: finalGrade,
        },
        acquisition_price: suggested || null,
        recon_estimate: reconEstimate || null,
        conclusion: conclusion.trim() || null,
      });
      if (!r.ok) {
        showToast(`❌ ${r.error}`);
        return;
      }
      setTradeInDone({
        used_car_id: r.data.used_car_id,
        ro_code: r.data.ro_code,
        conditional: decision === "BUY_COND",
      });
    });
  }

  // ============================================================
  // Derived
  // ============================================================

  const frameTotal = useMemo(
    () => FRAME_CATS.reduce((acc, c) => acc + c.items.length, 0),
    [],
  );
  const frameDone = useMemo(
    () => Object.values(frameChecks).filter((v) => v !== "none").length,
    [frameChecks],
  );
  const framePct = Math.round((frameDone / Math.max(frameTotal, 1)) * 100);

  const mechTotal = useMemo(
    () => MECH_CATS.reduce((acc, c) => acc + c.items.length, 0),
    [],
  );
  const mechDone = useMemo(
    () => Object.values(mechChecks).filter((v) => v !== "none").length,
    [mechChecks],
  );
  const mechPct = Math.round((mechDone / Math.max(mechTotal, 1)) * 100);

  const tireFrontTs = useMemo(() => evalTireMm(tireFrontMm), [tireFrontMm]);
  const tireRearTs = useMemo(() => evalTireMm(tireRearMm), [tireRearMm]);

  const calcResult = useMemo(() => {
    const market = n(pMarket);
    const repair = n(pRepair);
    const paint = n(pPaint);
    const tire = n(pTire);
    const warranty = n(pWarranty);
    const admin = n(pAdmin);
    const comm = n(pComm);
    const profit = n(pProfit);
    const newCar = n(pNew);
    const cost = repair + paint + tire + warranty + admin + comm + profit;
    const suggested = market - cost;
    const diff = newCar > 0 ? newCar - suggested : 0;
    const premium = diff > 0 ? diff - cost : 0;
    // D 段補強：殘值 = 收購價 − 整備預估費（BDN #11）
    // 整備預估費 = B 段 5 欄合計（不含 C 段銷售費用與利潤）
    const refurbCost = repair + paint + tire + warranty + admin;
    const residual = suggested - refurbCost;
    return { market, repair, paint, tire, warranty, admin, comm, profit, newCar, cost, suggested, diff, premium, refurbCost, residual };
  }, [pMarket, pRepair, pPaint, pTire, pWarranty, pAdmin, pComm, pProfit, pNew]);

  // ============================================================
  // Handlers
  // ============================================================

  function goTab(n: 0 | 1 | 2 | 3 | 4) {
    setTab(n);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function doScan(id: number, label: string) {
    if (scanned.includes(id)) {
      showToast(`📷 ${label}：已掃描，點擊可重新拍攝`);
      return;
    }
    setScanned((prev) => [...prev, id]);
    setScanDates((prev) => ({ ...prev, [id]: new Date().toLocaleDateString("zh-TW") }));
    showToast(`📷 ${label} 已拍攝存檔`);
  }

  // ───────── Demo OCR：模擬從證件圖片識別出 VIN / 引擎號 ─────────
  // BDN #12（2026-05-16）— 真 OCR API 後續輪次再接；目前提供假值以演示比對 banner
  function demoOcrFill(id: number) {
    // id=0 行照 → 同時 OCR 出 VIN + 引擎號；id=6 VIN 特寫 → 只 OCR 出 VIN
    const fakeVin = "ZDM14BWW7MB123456";
    const fakeEngine = "ZDM1218 0012345";
    if (id === 0) {
      setOcrVin(fakeVin);
      setOcrEngineNo(fakeEngine);
      showToast("🔍 行照 OCR 完成：VIN + 引擎號已抓取");
    } else if (id === 6) {
      setOcrVin(fakeVin);
      showToast("🔍 VIN 特寫 OCR 完成：車身號碼已抓取");
    }
  }

  // ───────── VIN / 引擎號一致性驗證（純前端字串比對）─────────
  const vinVerify = useMemo(() => {
    const normalize = (s: string) => s.toUpperCase().replace(/[\s\-_]/g, "");
    const vinMismatch =
      vin.trim() !== "" && ocrVin.trim() !== "" && normalize(vin) !== normalize(ocrVin);
    const engineMismatch =
      engineNo.trim() !== "" &&
      ocrEngineNo.trim() !== "" &&
      normalize(engineNo) !== normalize(ocrEngineNo);
    return { vinMismatch, engineMismatch, hasAny: vinMismatch || engineMismatch };
  }, [vin, ocrVin, engineNo, ocrEngineNo]);

  function cycleDot(group: "side" | "top", id: string, label: string) {
    const cur = group === "side" ? sideDots[id] : topDots[id];
    const idx = DOT_STATES.indexOf(cur);
    const next = DOT_STATES[(idx + 1) % DOT_STATES.length];
    const setter = group === "side" ? setSideDots : setTopDots;
    setter((prev) => ({ ...prev, [id]: next }));
    if (next !== "empty") {
      const lblMap: Record<DotState, string> = {
        empty: "未標記",
        ok: "✅ 正常",
        warn: "⚠️ 注意",
        bad: "❌ 損傷",
      };
      setDotLog(`📍 ${label} → ${lblMap[next]}`);
    } else {
      setDotLog("");
    }
  }

  function setPaintZone(idx: number, state: 0 | 1 | 2) {
    setPaintState((prev) => ({ ...prev, [idx]: state }));
  }

  function setPaintUmValue(idx: number, v: string) {
    setPaintUm((prev) => ({ ...prev, [idx]: v }));
    const num = parseInt(v, 10) || 0;
    if (!num) {
      setPaintState((prev) => {
        const next = { ...prev };
        delete next[idx];
        return next;
      });
      return;
    }
    // BDN #10 門檻：≤80 正常 · 80-120 注意 · >120 補漆
    if (num <= 80) setPaintZone(idx, 0);
    else if (num <= 120) setPaintZone(idx, 1);
    else setPaintZone(idx, 2);
  }

  function setGlass(idx: number, state: CheckState) {
    setGlassChecks((prev) => ({ ...prev, [idx]: state }));
  }

  function setFrameItem(id: string, state: CheckState) {
    setFrameChecks((prev) => ({ ...prev, [id]: state }));
  }

  function setMechItem(id: string, state: CheckState) {
    setMechChecks((prev) => ({ ...prev, [id]: state }));
  }

  // ============================================================
  // Render
  // ============================================================

  // ?id= 進來、prefill 還沒回 → 全螢幕 loading（避免閃預設值）
  if (evaluationId && prefillLoading && !prefillError) {
    return (
      <main className="px-6 py-12 flex flex-col items-center gap-3 text-[#5A5955]">
        <div className="w-10 h-10 rounded-full border-4 border-[#185FA5]/20 border-t-[#185FA5] animate-spin" />
        <div className="text-[13px]">載入評估單⋯</div>
      </main>
    );
  }
  if (evaluationId && prefillError) {
    return (
      <main className="px-6 py-12 flex flex-col items-center gap-3">
        <div className="text-[14px] text-[#CC0000]">⚠️ {prefillError}</div>
        <Link
          href="/usedcar/evaluations"
          className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
        >
          ← 返回列表
        </Link>
      </main>
    );
  }

  const modeLabel = prefillSource
    ? (
        {
          draft: "草稿",
          submitted: "已送審（檢視中）",
          approved: "已核准",
          rejected: "已駁回",
        } as const
      )[prefillSource.status]
    : null;
  const modeChipCls = prefillSource
    ? prefillSource.status === "approved"
      ? "bg-[#EAF3DE] text-[#3B6D11]"
      : prefillSource.status === "rejected"
        ? "bg-[#FDECEA] text-[#CC0000]"
        : prefillSource.status === "submitted"
          ? "bg-[#FDF3E3] text-[#854F0B]"
          : "bg-[#F2F2F2] text-[#6B6A68]"
    : "";

  return (
    <div className="max-w-[1100px] mx-auto space-y-3 pb-20">
          {/* Breadcrumb + CRUD pill bar（PageView 規格） */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
              <Link
                href="/usedcar/evaluations"
                className="hover:text-[#185FA5]"
              >
                中古車評估歷史
              </Link>
              <span>›</span>
              <span className="text-[#5A5955] font-mono">{evalNo}</span>
              {modeLabel && (
                <span
                  className={`ml-1 px-2 py-0.5 rounded-md text-[11px] ${modeChipCls}`}
                >
                  {modeLabel}
                </span>
              )}
              {!prefillSource && !evaluationId && (
                <span className="ml-1 px-2 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
                  建立模式
                </span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <Link
                href="/usedcar/evaluations"
                className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                ← 返回列表
              </Link>
              {evaluationId && (
                <button
                  type="button"
                  onClick={() =>
                    window.open(
                      `/print/usedcar-evaluation/${evaluationId}`,
                      "_blank",
                      "noopener",
                    )
                  }
                  className="h-[30px] px-4 inline-flex items-center gap-1 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
                  title="列印 / 另存 PDF"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    print
                  </span>
                  列印
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void handleSaveDraft({ navigateAfter: false })}
                  disabled={isPending || isApproving}
                  className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] font-semibold bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
                  title="儲存目前欄位變更（草稿狀態才能改）"
                >
                  {isPending ? "儲存中⋯" : "💾 儲存變更"}
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isApproving || isPending}
                  className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] font-semibold bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
                >
                  {isApproving ? "處理中⋯" : "🗑️ 刪除"}
                </button>
              )}
              {canApprove && (
                <>
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={isApproving}
                    className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] font-semibold bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
                  >
                    {isApproving ? "簽核中⋯" : "✓ 核准"}
                  </button>
                  <button
                    type="button"
                    onClick={handleReject}
                    disabled={isApproving}
                    className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] font-semibold bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
                  >
                    {isApproving ? "處理中⋯" : "✗ 駁回"}
                  </button>
                </>
              )}
              {evaluationId && !canApprove && !canEdit && (
                <Link
                  href="/usedcar/evaluations/new"
                  className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
                >
                  ＋ 新增評估
                </Link>
              )}
            </div>
          </div>

          {/* Page Header */}
          <header
            className="flex items-center gap-2.5 flex-wrap"
            data-testid="evaluation-page-header"
          >
            <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
              中古車評估鑑價 — 5 階段評估
            </h1>
            <span
              className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium"
              data-testid="evaluation-sprint-chip"
            >
              銷售 · RS06-v2
            </span>
            <span className="text-[12px] text-[#9A9890]">
              基本資料 → 外觀 → 骨架 → 機械 → 定價
            </span>
            <span
              className="ml-auto px-2 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68] font-mono"
              data-testid="evaluation-no"
            >
              {evalNo}
            </span>
          </header>

          {/* Tab Bar */}
          <div
            className="flex bg-white border border-[#EEECE6] rounded-lg overflow-x-auto"
            data-testid="evaluation-tab-bar"
          >
            {TAB_DEFS.map((t, idx) => {
              const active = t.num === tab;
              return (
                <button
                  key={t.num}
                  type="button"
                  onClick={() => goTab(t.num as 0 | 1 | 2 | 3 | 4)}
                  data-testid={`evaluation-tab-${t.num}`}
                  className={`flex-1 min-w-[140px] px-3 py-2.5 text-center text-[12px] whitespace-nowrap transition-colors ${
                    idx < TAB_DEFS.length - 1 ? "border-r border-[#EEECE6]" : ""
                  } ${
                    active
                      ? "bg-[#1A3A5C] text-white font-bold"
                      : "text-[#9A9890] font-medium hover:bg-[#F4F3F0]"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* TAB 0 — 基本資料 */}
          {tab === 0 && (
            <section data-testid="evaluation-pane-0" className="space-y-3">
              <SectionCard
                icon="🏍️"
                iconBg="bg-[#EAF4FB]"
                title="中古車基本資訊"
                subtitle="評估前核對車輛識別資料"
                trailing={
                  <span className="px-2 py-0.5 rounded text-[11px] bg-[#F2F2F2] text-[#6B6A68]">
                    評估單號：{evalNo}
                  </span>
                }
              >
                <Grid cols={3}>
                  <Field label="客戶姓名（賣方）">
                    <input
                      className={inputCls}
                      placeholder="例：陳大文"
                      value={sellerName}
                      onChange={(e) => setSellerName(e.target.value)}
                      data-testid="evaluation-seller-name"
                    />
                  </Field>
                  <Field label="廠牌" required>
                    <input className={inputCls} value={brand} onChange={(e) => setBrand(e.target.value)} />
                  </Field>
                  <Field label="車款型號" required>
                    <select
                      className={inputCls}
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      data-testid="evaluation-model-select"
                    >
                      {BIKE_MODELS.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="出廠年份" required>
                    <input className={inputCls} value={year} onChange={(e) => setYear(e.target.value)} />
                  </Field>
                  <Field label="車身號碼（VIN）" required>
                    <input
                      className={`${inputCls} font-mono`}
                      placeholder="ZDM...（17碼）"
                      value={vin}
                      onChange={(e) => setVin(e.target.value)}
                    />
                  </Field>
                  <Field label="引擎號碼" required>
                    <input
                      className={`${inputCls} font-mono`}
                      placeholder="引擎號碼"
                      value={engineNo}
                      onChange={(e) => setEngineNo(e.target.value)}
                    />
                  </Field>
                  <Field label="目前牌照號碼">
                    <input
                      className={inputCls}
                      placeholder="例：ABC-1234"
                      value={plate}
                      onChange={(e) => setPlate(e.target.value)}
                    />
                  </Field>
                  <Field label="當前里程" required>
                    <input
                      className={`${inputCls} font-mono`}
                      placeholder="例：35,000 km"
                      value={mileage}
                      onChange={(e) => setMileage(e.target.value)}
                      data-testid="evaluation-mileage"
                    />
                  </Field>
                  <Field label="車身顏色">
                    <input
                      className={inputCls}
                      placeholder="例：Ducati Red"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                    />
                  </Field>
                  <Field label="排氣量">
                    <select
                      className={inputCls}
                      value={displacement}
                      onChange={(e) => setDisplacement(e.target.value)}
                    >
                      {DISPLACEMENTS.map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="行照有效期限">
                    <input
                      type="date"
                      className={inputCls}
                      value={licenseExpire}
                      onChange={(e) => setLicenseExpire(e.target.value)}
                    />
                  </Field>
                  <Field label="保險到期日">
                    <input
                      type="date"
                      className={inputCls}
                      value={insuranceExpire}
                      onChange={(e) => setInsuranceExpire(e.target.value)}
                    />
                  </Field>
                  <Field label="評估師">
                    <input
                      className={inputCls}
                      value={appraiser}
                      onChange={(e) => setAppraiser(e.target.value)}
                    />
                  </Field>
                </Grid>

                <SecTitle>整體車況快速評級</SecTitle>
                <Grid cols={2}>
                  <Field label="車況等級">
                    <GradeRow
                      value={quickGrade}
                      onChange={setQuickGrade}
                      testIdPrefix="evaluation-quick-grade"
                    />
                  </Field>
                  <Field label="快速備注">
                    <textarea
                      className={`${inputCls} h-[70px] resize-none`}
                      placeholder="快速記錄明顯缺陷或特殊狀況..."
                      value={quickNote}
                      onChange={(e) => setQuickNote(e.target.value)}
                    />
                  </Field>
                </Grid>
              </SectionCard>

              <SectionCard
                icon="📷"
                iconBg="bg-[#FDF3E3]"
                title="車輛證件掃描存檔"
                subtitle="使用平板相機拍攝各項證件 · 存入評估紀錄備查 · 供日後買賣合約及過戶手續使用"
                trailing={
                  <span
                    className="px-2 py-0.5 rounded text-[11px] bg-[#F2F2F2] text-[#6B6A68]"
                    data-testid="evaluation-scan-count"
                  >
                    {scanned.length} / 8 已掃描
                  </span>
                }
              >
                <div className="bg-[#FDF3E3] border border-[#F0C97E] rounded-md px-3.5 py-2 mb-3 text-[12px] text-[#854F0B]">
                  📷 <b>操作說明：</b>
                  點擊方格啟動平板相機拍攝，照片自動存入本評估紀錄備查。所有文件均需與行照核對一致，VIN 號碼為鑑定真偽的最重要依據。
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                  <div className="bg-[#E1F5EE] border border-[#5DCAA5] rounded-md px-3 py-2 text-[11.5px]">
                    <div className="font-bold text-[#0F6E56] mb-1">✅ 過戶必備文件</div>
                    <div className="text-[#4A4A48] leading-relaxed">
                      ① 行照正本<br />
                      ② 賣方身分證正本（雙證件）<br />
                      ③ 買方身分證正本（雙證件）<br />
                      ④ 強制責任險保單（有效期 30 日以上）<br />
                      ⑤ 過戶登記申請書（監理站現場填寫）<br />
                      ⑥ 新舊車主印章
                    </div>
                  </div>
                  <div className="bg-[#FDF3E3] border border-[#F0C97E] rounded-md px-3 py-2 text-[11.5px]">
                    <div className="font-bold text-[#854F0B] mb-1">⚠️ 特殊狀況額外文件</div>
                    <div className="text-[#4A4A48] leading-relaxed">
                      出廠 5 年以上 → 臨時檢驗合格證<br />
                      有貸款設定 → 清償證明 + 塗銷動保設定<br />
                      有違規/欠稅 → 繳清收據（2 個月內）<br />
                      非本人辦理 → 委託書 + 代辦人身分證<br />
                      強制險不足 30 日 → 新車主名義重新投保
                    </div>
                  </div>
                </div>

                <div className="text-[12px] font-semibold text-[#4A4A48] mb-2">
                  📷 掃描存檔（點擊方格啟動相機）
                </div>
                <div
                  className="grid grid-cols-2 md:grid-cols-4 gap-2.5"
                  data-testid="evaluation-scan-grid"
                >
                  {SCAN_DOCS.map((d) => {
                    const done = scanned.includes(d.id);
                    const supportsOcr = d.id === 0 || d.id === 6;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => doScan(d.id, d.label)}
                        data-testid={`evaluation-scan-${d.id}`}
                        className={`relative flex flex-col items-center justify-center gap-1 min-h-[90px] p-3 rounded-lg border-[1.5px] transition-colors ${
                          done
                            ? "border-solid border-[#5DCAA5] bg-[#E1F5EE]"
                            : "border-dashed border-[#D5D3CB] bg-[#FAFAF8] hover:border-[#85B7EB] hover:bg-[#EAF4FB]"
                        }`}
                      >
                        {done && (
                          <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] bg-[#0F6E56] text-white">
                            ✅ 已存檔
                          </span>
                        )}
                        <div className="text-[20px]">{done ? "✅" : d.icon}</div>
                        <div className="text-[11.5px] font-semibold text-[#4A4A48]">
                          {d.label}
                        </div>
                        <div className="text-[10px] text-[#9A9890]">
                          {done ? scanDates[d.id] : d.sub}
                        </div>
                        {supportsOcr && (
                          <span
                            role="button"
                            tabIndex={0}
                            data-testid={`evaluation-demo-ocr-${d.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              demoOcrFill(d.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.stopPropagation();
                                e.preventDefault();
                                demoOcrFill(d.id);
                              }
                            }}
                            className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] bg-[#185FA5] text-white cursor-pointer hover:bg-[#0F4577]"
                          >
                            Demo OCR
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {vinVerify.hasAny && (
                  <div
                    data-testid="evaluation-vin-mismatch-banner"
                    className="mt-3 px-3.5 py-2.5 rounded-md border bg-[#FDF3E3] border-[#F0C97E] text-[#854F0B] text-[12px]"
                  >
                    <div className="font-bold mb-1">
                      ⚠️ 行照識別結果與基本資料不一致，請核對
                    </div>
                    {vinVerify.vinMismatch && (
                      <div
                        className="leading-relaxed"
                        data-testid="evaluation-vin-mismatch-detail-vin"
                      >
                        車身號碼（VIN）— 行照 OCR：
                        <b className="font-mono">{ocrVin}</b> · 基本資料：
                        <b className="font-mono">{vin}</b>
                      </div>
                    )}
                    {vinVerify.engineMismatch && (
                      <div
                        className="leading-relaxed"
                        data-testid="evaluation-vin-mismatch-detail-engine"
                      >
                        引擎號碼 — 行照 OCR：
                        <b className="font-mono">{ocrEngineNo}</b> · 基本資料：
                        <b className="font-mono">{engineNo}</b>
                      </div>
                    )}
                  </div>
                )}

                <SecTitle>過戶前必要查詢</SecTitle>
                <Grid cols={3}>
                  <Field label="交通違規罰款">
                    <div className="flex gap-1.5">
                      <select
                        className={`${inputCls} flex-1`}
                        value={fineQuery}
                        onChange={(e) => setFineQuery(e.target.value)}
                      >
                        {FINE_QUERY_OPTIONS.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => showToast("🔍 開啟監理服務網罰款查詢...")}
                        className={`${btnGhost} h-[30px] px-3 text-[11.5px]`}
                      >
                        查詢
                      </button>
                    </div>
                  </Field>
                  <Field label="貸款 / 動產擔保設定">
                    <select
                      className={inputCls}
                      value={lien}
                      onChange={(e) => setLien(e.target.value)}
                    >
                      {LIEN_OPTIONS.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </Field>

                  {/* 輪7-4：貸款清償證明文件上傳（有貸款設定才顯示） */}
                  {(lien.includes("有設定") || loanClearanceDocUrl) && (
                    <div className="md:col-span-2">
                      <div className="text-[11px] text-[#9A9890] font-medium mb-1">
                        貸款清償證明文件
                        {lien.includes("有設定，尚未清償") && (
                          <span className="ml-1.5 text-[#CC0000]">⚠️ 有設定未清償</span>
                        )}
                      </div>
                      {loanClearanceDocUrl ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-[#EAF3DE] text-[#3B6D11] text-[11.5px]">
                            ✓ 已上傳
                          </span>
                          <a
                            href={loanClearanceDocUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#185FA5] text-[11.5px] hover:underline truncate max-w-[200px]"
                          >
                            查看文件
                          </a>
                          <button
                            type="button"
                            className="text-[11px] text-[#9A9890] hover:text-[#CC0000] underline"
                            onClick={() => setLoanClearanceDocUrl(null)}
                          >
                            重新上傳
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <label className={`cursor-pointer inline-flex items-center gap-1.5 h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] ${loanDocUploading ? "opacity-60 pointer-events-none" : ""}`}>
                            {loanDocUploading ? "上傳中⋯" : "📎 選擇文件"}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={loanDocUploading || !evaluationId}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file || !evaluationId) return;
                                setLoanDocUploading(true);
                                setLoanDocError(null);
                                try {
                                  const reader = new FileReader();
                                  reader.onload = async (evt) => {
                                    const dataUrl = evt.target?.result as string;
                                    if (!dataUrl) {
                                      setLoanDocError("無法讀取文件");
                                      setLoanDocUploading(false);
                                      return;
                                    }
                                    const res = await uploadLoanClearanceDocAction(evaluationId, dataUrl);
                                    if (res.ok) {
                                      setLoanClearanceDocUrl(res.data.url);
                                    } else {
                                      setLoanDocError(res.error);
                                    }
                                    setLoanDocUploading(false);
                                  };
                                  reader.readAsDataURL(file);
                                } catch {
                                  setLoanDocError("上傳失敗，請稍後再試");
                                  setLoanDocUploading(false);
                                }
                              }}
                            />
                          </label>
                          {!evaluationId && (
                            <span className="text-[11px] text-[#9A9890]">請先儲存評估單才能上傳文件</span>
                          )}
                          {loanDocError && (
                            <span className="text-[11px] text-[#CC0000]">{loanDocError}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <Field label="出廠年份 / 驗車狀態">
                    <select
                      className={inputCls}
                      value={inspect}
                      onChange={(e) => setInspect(e.target.value)}
                    >
                      {INSPECT_OPTIONS.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="牌照稅 / 燃料稅">
                    <select
                      className={inputCls}
                      value={tax}
                      onChange={(e) => setTax(e.target.value)}
                    >
                      {TAX_OPTIONS.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="強制責任險剩餘天數">
                    <div className="flex gap-1.5 items-center">
                      <input
                        className={`${inputCls} flex-1`}
                        placeholder="例：45 天"
                        value={insuranceRemain}
                        onChange={(e) => setInsuranceRemain(e.target.value)}
                      />
                      <span className="text-[11px] text-[#9A9890] whitespace-nowrap">
                        ≥30天可移轉
                      </span>
                    </div>
                  </Field>
                  <Field label="過戶規費說明">
                    <div className="bg-[#F4F3F0] rounded-md px-2.5 py-1.5 text-[11.5px] text-[#5A5955] leading-relaxed">
                      過戶費 NT$150 + 當年剩餘牌照稅 + 燃料稅
                    </div>
                  </Field>
                </Grid>
              </SectionCard>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveDraft({ navigateAfter: false })}
                  disabled={isPending}
                  className={`${btnGhost} disabled:opacity-60 disabled:cursor-not-allowed`}
                  data-testid="evaluation-save-tab0"
                >
                  {isPending ? "儲存中⋯" : "💾 儲存草稿"}
                </button>
                <button
                  type="button"
                  onClick={() => goTab(1)}
                  className={btnPrimary}
                  data-testid="evaluation-next-0"
                >
                  外觀漆面評估 →
                </button>
              </div>
            </section>
          )}

          {/* TAB 1 — 外觀漆面 */}
          {tab === 1 && (
            <section data-testid="evaluation-pane-1" className="space-y-3">
              <SectionCard
                icon="🎨"
                iconBg="bg-[#FDECEA]"
                title="外觀損傷標記圖"
                subtitle="點擊標記點循環：正常 → 注意 → 損傷 → 未標記"
                trailing={
                  <div className="flex gap-3 flex-wrap text-[11px] text-[#9A9890]">
                    <LegDot color="#0F6E56" label="正常" />
                    <LegDot color="#F0A500" label="注意" />
                    <LegDot color="#C8001A" label="損傷" />
                    <LegDot color="rgba(120,120,120,.35)" label="未標" />
                  </div>
                }
              >
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#9A9890] mb-1">
                  側面圖 Side View
                </div>
                <div className="relative w-full h-[152px] mb-2" data-testid="evaluation-dots-side">
                  <SideBikeSvg />
                  {SIDE_DOTS.map((d) => (
                    <DotMark
                      key={d.id}
                      state={sideDots[d.id]}
                      style={{ left: d.left, top: d.top }}
                      label={d.label}
                      onClick={() => cycleDot("side", d.id, d.label)}
                      testid={`evaluation-side-dot-${d.id}`}
                    />
                  ))}
                </div>

                <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#9A9890] mb-1 mt-2.5">
                  鳥瞰圖 Top View
                </div>
                <div className="relative w-full h-[88px]" data-testid="evaluation-dots-top">
                  <TopBikeSvg />
                  {TOP_DOTS.map((d) => (
                    <DotMark
                      key={d.id}
                      state={topDots[d.id]}
                      style={{ left: d.left, top: d.top }}
                      label={d.label}
                      onClick={() => cycleDot("top", d.id, d.label)}
                      testid={`evaluation-top-dot-${d.id}`}
                    />
                  ))}
                </div>

                <div
                  className="mt-1.5 text-[11.5px] text-[#9A9890] min-h-[18px]"
                  data-testid="evaluation-dot-log"
                >
                  {dotLog}
                </div>
              </SectionCard>

              <SectionCard
                icon="📏"
                iconBg="bg-[#FDECEA]"
                title="漆面量化記錄（漆膜測厚儀）"
                subtitle="≤80μm 正常 · 80-120μm 注意 · >120μm 補漆"
                trailing={
                  <button
                    type="button"
                    onClick={() =>
                      showToast(
                        "📏 ≤80μm：正常（原廠漆） · 80-120μm：注意（疑似補漆） · >120μm：補漆（明顯補漆/重噴）",
                      )
                    }
                    className={`${btnGhost} h-[28px] px-3 text-[11.5px]`}
                  >
                    μm 說明
                  </button>
                }
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {PAINT_ZONES.map((z, idx) => {
                    const st = paintState[idx];
                    // BDN #10 三態 chip：依 paintState 對應「正常 / 注意 / 補漆」
                    const chipMeta =
                      st === 0
                        ? { label: "正常", cls: "bg-[#EAF3DE] text-[#3B6D11]" }
                        : st === 1
                          ? { label: "注意", cls: "bg-[#FDF3E3] text-[#854F0B]" }
                          : st === 2
                            ? { label: "補漆", cls: "bg-[#FDECEA] text-[#CC0000]" }
                            : null;
                    return (
                      <div
                        key={z}
                        className="grid grid-cols-[1fr_72px_84px_56px_1fr] gap-1.5 items-center px-2.5 py-1.5 rounded-md border border-[#EEECE6] bg-[#FAFAF8] text-[12px]"
                        data-testid={`evaluation-paint-zone-${idx}`}
                      >
                        <div className="font-semibold">{z}</div>
                        <input
                          className="w-full px-1.5 py-1 rounded-md border border-[#D5D3CB] font-mono text-[12px] text-center bg-white"
                          placeholder="μm"
                          value={paintUm[idx] ?? ""}
                          onChange={(e) => setPaintUmValue(idx, e.target.value)}
                          data-testid={`evaluation-paint-um-${idx}`}
                        />
                        <div className="flex gap-0.5 justify-center">
                          {(
                            [
                              { v: 0 as const, label: "✓", bg: "bg-[#E1F5EE]", text: "text-[#0F6E56]", active: "bg-[#0F6E56] text-white" },
                              { v: 1 as const, label: "⚠", bg: "bg-[#FDF3E3]", text: "text-[#F0A500]", active: "bg-[#F0A500] text-white" },
                              { v: 2 as const, label: "✗", bg: "bg-[#FDECEA]", text: "text-[#C8001A]", active: "bg-[#C8001A] text-white" },
                            ] as const
                          ).map((o) => {
                            const sel = st === o.v;
                            return (
                              <button
                                key={o.v}
                                type="button"
                                onClick={() => setPaintZone(idx, o.v)}
                                className={`w-6 h-6 rounded text-[10px] transition-colors ${
                                  sel ? o.active : `${o.bg} ${o.text}`
                                }`}
                                aria-label={o.label}
                              >
                                {o.label}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex justify-center">
                          {chipMeta ? (
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${chipMeta.cls}`}
                              data-testid={`evaluation-paint-chip-${idx}`}
                            >
                              {chipMeta.label}
                            </span>
                          ) : (
                            <span className="text-[11px] text-[#9A9890]">—</span>
                          )}
                        </div>
                        <input
                          className="w-full px-1.5 py-1 rounded-md border border-[#D5D3CB] text-[11.5px] bg-white"
                          placeholder="備注..."
                        />
                      </div>
                    );
                  })}
                </div>
              </SectionCard>

              <SectionCard
                icon="🔍"
                iconBg="bg-[#EAF4FB]"
                title="燈具、玻璃與儀表板"
              >
                <div className="flex flex-col gap-1">
                  {GLASS_ITEMS.map((t, i) => (
                    <CheckItem
                      key={i}
                      label={t}
                      state={glassChecks[i]}
                      onChange={(s) => setGlass(i, s)}
                      testid={`evaluation-glass-${i}`}
                    />
                  ))}
                </div>
              </SectionCard>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => goTab(0)} className={btnGhost}>
                  ← 返回
                </button>
                <button
                  type="button"
                  onClick={() => goTab(2)}
                  className={btnPrimary}
                  data-testid="evaluation-next-1"
                >
                  車身骨架 →
                </button>
              </div>
            </section>
          )}

          {/* TAB 2 — 車身骨架 */}
          {tab === 2 && (
            <section data-testid="evaluation-pane-2" className="space-y-3">
              <SectionCard
                icon="🔩"
                iconBg="bg-[#FDECEA]"
                title="車身骨架結構檢查"
                subtitle="判斷焊接方式（點焊=原廠/CO2焊=已更換）· 封膠狀態 · 溃縮區變形"
                trailing={
                  <div className="flex items-center gap-2">
                    <div className="w-[100px] h-[7px] bg-[#EEECE6] rounded overflow-hidden">
                      <div
                        className="h-full rounded transition-[width] duration-300"
                        style={{
                          width: `${framePct}%`,
                          background: "linear-gradient(90deg, #0F6E56, #5DCAA5)",
                        }}
                        data-testid="evaluation-frame-bar"
                      />
                    </div>
                    <span
                      className="text-[12px] font-bold font-mono text-[#0F6E56] whitespace-nowrap"
                      data-testid="evaluation-frame-pct"
                    >
                      {framePct}%
                    </span>
                  </div>
                }
              >
                {FRAME_CATS.map((cat) => (
                  <div key={cat.cat} className="mb-1">
                    <div className="text-[11px] font-bold text-[#9A9890] tracking-wider uppercase bg-[#F4F3F0] rounded px-2.5 py-1.5 mt-2 mb-1">
                      {cat.cat}
                    </div>
                    <div className="flex flex-col gap-1">
                      {cat.items.map((t, i) => {
                        const id = `${cat.cat}-${i}`;
                        return (
                          <CheckItem
                            key={id}
                            label={t}
                            state={frameChecks[id] ?? "none"}
                            onChange={(s) => setFrameItem(id, s)}
                            testid={`evaluation-frame-${slug(id)}`}
                            threeState
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </SectionCard>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => goTab(1)} className={btnGhost}>
                  ← 返回
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const allOk: Record<string, CheckState> = {};
                    FRAME_CATS.forEach((cat, ci) => {
                      cat.items.forEach((_, i) => {
                        allOk[`${cat.cat}-${i}`] = "ok";
                      });
                      void ci;
                    });
                    setFrameChecks(allOk);
                  }}
                  className={`${btnGhost} h-[28px] px-3 text-[12px]`}
                  data-testid="evaluation-frame-check-all"
                >
                  ✅ 全部 OK（測試）
                </button>
                <button
                  type="button"
                  onClick={() => goTab(3)}
                  className={btnPrimary}
                  data-testid="evaluation-next-2"
                >
                  機械底盤 →
                </button>
              </div>
            </section>
          )}

          {/* TAB 3 — 機械底盤 */}
          {tab === 3 && (
            <section data-testid="evaluation-pane-3" className="space-y-3">
              <SectionCard
                icon="⚙️"
                iconBg="bg-[#E8EDF2]"
                title="機械底盤系統檢查"
                subtitle="靜態目視 + 動態路試"
                trailing={
                  <div className="flex items-center gap-2">
                    <div className="w-[100px] h-[7px] bg-[#EEECE6] rounded overflow-hidden">
                      <div
                        className="h-full rounded transition-[width] duration-300"
                        style={{
                          width: `${mechPct}%`,
                          background: "linear-gradient(90deg, #0F6E56, #5DCAA5)",
                        }}
                        data-testid="evaluation-mech-bar"
                      />
                    </div>
                    <span
                      className="text-[12px] font-bold font-mono text-[#0F6E56] whitespace-nowrap"
                      data-testid="evaluation-mech-pct"
                    >
                      {mechPct}%
                    </span>
                  </div>
                }
              >
                {MECH_CATS.map((cat) => (
                  <div key={cat.cat} className="mb-1">
                    <div className="text-[11px] font-bold text-[#9A9890] tracking-wider uppercase bg-[#F4F3F0] rounded px-2.5 py-1.5 mt-2 mb-1">
                      {cat.cat}
                    </div>
                    <div className="flex flex-col gap-1">
                      {cat.items.map((t, i) => {
                        const id = `${cat.cat}-${i}`;
                        return (
                          <CheckItem
                            key={id}
                            label={t}
                            state={mechChecks[id] ?? "none"}
                            onChange={(s) => setMechItem(id, s)}
                            testid={`evaluation-mech-${slug(id)}`}
                            threeState
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </SectionCard>

              <SectionCard
                icon="🔵"
                iconBg="bg-[#FDF3E3]"
                title="輪胎量化記錄"
                subtitle="使用花紋深度尺 · 法定最低 1.6 mm · 建議更換 ≤ 3 mm"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <TireBox
                    label="🔵 前輪"
                    mm={tireFrontMm}
                    onMm={setTireFrontMm}
                    psi={tireFrontPsi}
                    onPsi={setTireFrontPsi}
                    wear={tireFrontWear}
                    onWear={setTireFrontWear}
                    brand={tireFrontBrand}
                    onBrand={setTireFrontBrand}
                    ts={tireFrontTs}
                    side="front"
                  />
                  <TireBox
                    label="🔵 後輪"
                    mm={tireRearMm}
                    onMm={setTireRearMm}
                    psi={tireRearPsi}
                    onPsi={setTireRearPsi}
                    wear={tireRearWear}
                    onWear={setTireRearWear}
                    brand={tireRearBrand}
                    onBrand={setTireRearBrand}
                    ts={tireRearTs}
                    side="rear"
                  />
                </div>
              </SectionCard>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => goTab(2)} className={btnGhost}>
                  ← 返回
                </button>
                <button
                  type="button"
                  onClick={() => goTab(4)}
                  className={btnPrimary}
                  data-testid="evaluation-next-3"
                >
                  收購定價核算 →
                </button>
              </div>
            </section>
          )}

          {/* TAB 4 — 收購定價 */}
          {tab === 4 && (
            <section data-testid="evaluation-pane-4" className="space-y-3">
              <SectionCard
                icon="💰"
                iconBg="bg-[#E1F5EE]"
                title="收購定價核算"
                subtitle="市場行情 − 整備成本 − 利潤 ＝ 建議收購報價"
                noPad
              >
                <table className="w-full border-collapse text-[12.5px]" data-testid="evaluation-calc-table">
                  <thead>
                    <tr className="bg-[#FAFAF8]">
                      <th className="text-left text-[11px] font-semibold text-[#9A9890] px-2.5 py-2 border-b-2 border-[#EEECE6]" style={{ width: "40%" }}>
                        項目說明
                      </th>
                      <th className="text-right text-[11px] font-semibold text-[#9A9890] px-2.5 py-2 border-b-2 border-[#EEECE6]" style={{ width: "22%" }}>
                        金額（NT$）
                      </th>
                      <th className="text-right text-[11px] font-semibold text-[#9A9890] px-2.5 py-2 border-b-2 border-[#EEECE6]" style={{ width: "16%" }}>
                        計算結果
                      </th>
                      <th className="text-left text-[11px] font-semibold text-[#9A9890] px-2.5 py-2 border-b-2 border-[#EEECE6]">
                        備注
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <CatRow label="A　市場行情參考" />
                    <CalcRow
                      label="當地市場同款中古車銷售行情（含稅）"
                      value={pMarket}
                      onChange={setPMarket}
                      result={null}
                      resultColor="#9A9890"
                      resultLabel="網路查詢"
                      note="參考來源"
                      testid="evaluation-calc-market"
                    />
                    <CalcRow
                      label="同款新車原廠建議售價（MSRP）"
                      value={pMsrp}
                      onChange={setPMsrp}
                      result={null}
                      resultColor="#9A9890"
                      resultLabel="原廠定價"
                      note=""
                    />
                    <CatRow label="B　整備成本估算" />
                    <CalcRow
                      label="機械維修費用"
                      value={pRepair}
                      onChange={setPRepair}
                      result={calcResult.repair}
                      resultColor="#C8001A"
                      note="維修項目說明"
                      testid="evaluation-calc-repair"
                    />
                    <CalcRow
                      label="外觀翻新/漆面整備"
                      value={pPaint}
                      onChange={setPPaint}
                      result={calcResult.paint}
                      resultColor="#C8001A"
                      note="補漆/拋光"
                    />
                    <CalcRow
                      label="輪胎更換費用"
                      value={pTire}
                      onChange={setPTire}
                      result={calcResult.tire}
                      resultColor="#C8001A"
                      note="前後輪胎"
                    />
                    <CalcRow
                      label="保固/商譽成本預留"
                      value={pWarranty}
                      onChange={setPWarranty}
                      result={calcResult.warranty}
                      resultColor="#C8001A"
                      note="建議 1–2%"
                    />
                    <CalcRow
                      label="代辦過戶/行政費用"
                      value={pAdmin}
                      onChange={setPAdmin}
                      result={calcResult.admin}
                      resultColor="#C8001A"
                      note="監理站費用"
                    />
                    <CatRow label="C　銷售費用與利潤" />
                    <CalcRow
                      label="銷售相關成本（佣金，建議 1.5%）"
                      value={pComm}
                      onChange={setPComm}
                      result={calcResult.comm}
                      resultColor="#C8001A"
                      note=""
                    />
                    <CalcRow
                      label="計畫銷售利潤（建議 4–6%）"
                      value={pProfit}
                      onChange={setPProfit}
                      result={calcResult.profit}
                      resultColor="#C8001A"
                      note=""
                    />
                    <CatRow label="D　置換溢價核算（以舊換新時）" />
                    <CalcRow
                      label="新車成交價格（折扣後，來自 RS04）"
                      value={pNew}
                      onChange={setPNew}
                      result={null}
                      resultColor="#9A9890"
                      resultLabel="來自 RS04"
                      note=""
                    />
                    <tr className="bg-[#E1F5EE]">
                      <td className="px-2.5 py-2 font-bold border-b border-[#F4F3F0]">
                        建議收購報價
                      </td>
                      <td
                        colSpan={2}
                        className="px-2.5 py-2 text-right border-b border-[#F4F3F0]"
                      >
                        <span
                          className="font-mono font-bold text-[16px] text-[#1A3A5C]"
                          data-testid="evaluation-suggested"
                        >
                          NT$ {fmt(calcResult.suggested)}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 border-b border-[#F4F3F0]">
                        <input
                          className="w-full px-1.5 py-1 rounded-md border border-[#D5D3CB] font-mono text-[12.5px] text-right bg-white"
                          placeholder="評估師可手動修正"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div
                  className="bg-[#1A3A5C] rounded-b-md px-5 py-4 text-white flex items-center justify-between gap-3 flex-wrap"
                  data-testid="evaluation-result-box"
                >
                  <div className="flex gap-5 flex-wrap">
                    <div className="text-center">
                      <div className="text-[10.5px] opacity-65 mb-0.5">整備成本合計</div>
                      <div
                        className="text-[15px] font-bold font-mono text-[#FF8080]"
                        data-testid="evaluation-total-cost"
                      >
                        {fmt(calcResult.cost)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10.5px] opacity-65 mb-0.5">新舊車差價</div>
                      <div className="text-[15px] font-bold font-mono">
                        {calcResult.diff > 0 ? fmt(calcResult.diff) : "—"}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10.5px] opacity-65 mb-0.5">置換溢價</div>
                      <div className="text-[15px] font-bold font-mono text-[#5DCAA5]">
                        {calcResult.diff > 0 ? fmt(calcResult.premium) : "—"}
                      </div>
                    </div>
                    <div className="text-center">
                      <div
                        className="text-[10.5px] opacity-65 mb-0.5"
                        title="殘值 = 收購價 − 整備預估費（B 段合計）"
                      >
                        殘值（收購 − 整備）
                      </div>
                      <div
                        className="text-[15px] font-bold font-mono text-[#FFD37E]"
                        data-testid="evaluation-residual"
                      >
                        {fmt(calcResult.residual)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] opacity-70 mb-1">建議收購報價</div>
                    <div
                      className="text-[24px] font-bold font-mono"
                      data-testid="evaluation-grand-price"
                    >
                      NT$ {fmt(calcResult.suggested)}
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                icon="✅"
                iconBg="bg-[#E1F5EE]"
                title="評估結論與建議"
              >
                <Grid cols={2}>
                  <Field label="最終評級">
                    <GradeRow
                      value={finalGrade}
                      onChange={setFinalGrade}
                      testIdPrefix="evaluation-final-grade"
                    />
                  </Field>
                  <Field label="收購決策">
                    <select
                      className={inputCls}
                      value={decision}
                      onChange={(e) => setDecision(e.target.value)}
                      data-testid="evaluation-decision"
                    >
                      {PURCHASE_DECISIONS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </Grid>
                <Field label="評估師結論說明">
                  <textarea
                    className={`${inputCls} h-[72px] resize-none`}
                    placeholder="整體車況說明、主要缺陷、建議整備項目、市場行情分析..."
                    value={conclusion}
                    onChange={(e) => setConclusion(e.target.value)}
                  />
                </Field>

                {/* T12：依決策顯示對應說明卡 + 確認收購（真 action）/ 確認不收購 */}
                {BUY_DECISIONS.has(decision) && !tradeInDone && (
                  <div
                    className="mt-3 rounded-md border border-[#5DCAA5] bg-[#E1F5EE] px-3.5 py-3 text-[12px] text-[#085041] leading-relaxed"
                    data-testid="evaluation-buy-desc"
                  >
                    <b>
                      {decision === "BUY_COND"
                        ? "⚠️ 條件收購（整備後重評）"
                        : decision === "BUY_MGR"
                          ? "🔐 謹慎收購（需主管核准）"
                          : "✅ 建議收購（正常流程）"}
                    </b>
                    <br />
                    確認後系統將自動：
                    <br />1 · 建立中古車車輛主檔（acquisition_source = trade_in，狀態「待整備」）
                    <br />2 · 觸發整備工單（PD-UC），費用計入整車成本、通知售後主管分派技師
                    {decision === "BUY_COND" && (
                      <>
                        <br />3 · 標記「整備後需重新鑑價」才可上架銷售
                      </>
                    )}
                    <div className="mt-2.5">
                      <button
                        type="button"
                        onClick={handleConfirmTradeIn}
                        disabled={isAcquiring}
                        data-testid="evaluation-confirm-tradein"
                        className={`${btnTeal} disabled:opacity-60 disabled:cursor-not-allowed`}
                      >
                        {isAcquiring ? "建立中⋯" : "✅ 確認收購（建主檔 + 觸發整備工單）"}
                      </button>
                    </div>
                  </div>
                )}
                {decision === "NO_BUY" && !tradeInDone && (
                  <div
                    className="mt-3 rounded-md border border-[#F5AEAD] bg-[#FDECEA] px-3.5 py-3 text-[12px] text-[#CC0000] leading-relaxed"
                    data-testid="evaluation-nobuy-desc"
                  >
                    <b>❌ 不建議收購（風險過高）</b>
                    <br />
                    不會建立任何車輛主檔。請於結論說明欄填寫不收購理由，再送出簽核 / 儲存即可。
                  </div>
                )}

                {/* T12：收購成功結果卡 */}
                {tradeInDone && (
                  <div
                    className="mt-3 rounded-lg bg-gradient-to-br from-[#0F6E56] to-[#185FA5] text-white p-4 shadow"
                    data-testid="evaluation-tradein-done"
                  >
                    <div className="text-[15px] font-bold mb-1">
                      {tradeInDone.conditional
                        ? "⚠️ 條件收購確認！整備工單已建立"
                        : "🎉 收購確認完成！整備工單已建立"}
                    </div>
                    <div className="text-[12px] opacity-90 mb-3">
                      中古車車輛主檔已建立，整備工單已觸發，費用計入整車成本
                    </div>
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className="px-3 py-1.5 rounded-md bg-white/15 border border-white/25 text-[12px]">
                        整備工單：<b className="font-mono">{tradeInDone.ro_code}</b>
                      </span>
                      <span className="px-3 py-1.5 rounded-md bg-white/15 border border-white/25 text-[12px]">
                        來源類型：<b>TRADE_IN</b>
                      </span>
                      <span className="px-3 py-1.5 rounded-md bg-white/15 border border-white/25 text-[12px]">
                        車輛狀態：<b>待整備</b>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => router.push("/usedcar/stock")}
                        className="px-4 py-2 rounded-md bg-white text-[#0F6E56] text-[12.5px] font-semibold"
                      >
                        🏍️ 查看中古車庫存
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push("/parts/aftersales/repair-orders")}
                        className="px-4 py-2 rounded-md bg-white/15 border border-white/30 text-[12.5px] font-semibold"
                      >
                        🔧 查看整備工單
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 flex-wrap mt-2">
                  <button
                    type="button"
                    onClick={() => showToast("🖨️ 評估報告 PDF 預覽")}
                    className={btnGhost}
                  >
                    🖨️ 列印評估報告
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveDraft()}
                    disabled={isPending}
                    className={`${btnGhost} disabled:opacity-60 disabled:cursor-not-allowed`}
                    data-testid="evaluation-save-final"
                  >
                    {isPending ? "儲存中⋯" : "💾 儲存評估單"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitForReview}
                    disabled={isPending}
                    className={`${btnPrimary} disabled:opacity-60 disabled:cursor-not-allowed`}
                    data-testid="evaluation-submit"
                  >
                    {isPending ? "送出中⋯" : "📨 送出簽核"}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/sales/quote")}
                    className={btnTeal}
                    data-testid="evaluation-to-rs04"
                  >
                    → 帶入 RS04 報價單
                  </button>
                </div>
              </SectionCard>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => goTab(3)} className={btnGhost}>
                  ← 返回
                </button>
              </div>
            </section>
          )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 px-4 py-2 rounded-lg shadow-lg text-[12.5px] z-50 bg-[#1A3A5C] text-white max-w-[320px] leading-relaxed"
          data-testid="evaluation-toast"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Helper components
// ============================================================

const inputCls =
  "w-full px-2.5 py-1.5 rounded-md border border-[#D5D3CB] text-[12.5px] outline-none focus:border-[#85B7EB] bg-white";

const btnPrimary =
  "h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-[#1A3A5C] text-white hover:bg-[#0F2A45] transition-colors";
const btnTeal =
  "h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-[#0F6E56] text-white hover:bg-[#0a5742] transition-colors";
const btnGhost =
  "h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-white border border-[#D5D3CB] text-[#4A4A48] hover:bg-[#F4F3F0] transition-colors";

function SectionCard({
  icon,
  iconBg,
  title,
  subtitle,
  trailing,
  noPad,
  children,
}: {
  icon: string;
  iconBg: string;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  noPad?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-7 h-7 rounded-md flex items-center justify-center text-[13px] flex-shrink-0 ${iconBg}`}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[#2C2C2A]">{title}</div>
            {subtitle && (
              <div className="text-[11px] text-[#9A9890] mt-0.5 leading-tight">
                {subtitle}
              </div>
            )}
          </div>
        </div>
        {trailing}
      </header>
      <div className={noPad ? "" : "px-4 py-3.5"}>{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 mb-2.5">
      <label className="text-[11.5px] font-semibold text-[#4A4A48]">
        {label} {required && <span className="text-[#C8001A] text-[11px]">*</span>}
      </label>
      {children}
    </div>
  );
}

function Grid({ cols, children }: { cols: 2 | 3; children: React.ReactNode }) {
  return (
    <div
      className={`grid gap-x-4 gap-y-0 ${
        cols === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-3"
      }`}
    >
      {children}
    </div>
  );
}

function SecTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[10.5px] font-bold tracking-wider uppercase text-[#9A9890] mt-3.5 mb-2">
      <span>{children}</span>
      <span className="flex-1 h-px bg-[#EEECE6]" />
    </div>
  );
}

function GradeRow({
  value,
  onChange,
  testIdPrefix,
}: {
  value: GradeKey;
  onChange: (g: GradeKey) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {GRADE_OPTIONS.map((g) => {
        const sel = g.key === value;
        return (
          <button
            key={g.key}
            type="button"
            onClick={() => onChange(g.key)}
            data-testid={`${testIdPrefix}-${g.key}`}
            className={`px-1 py-1.5 text-center rounded-md border-[1.5px] transition-colors ${
              sel
                ? "border-[#1A3A5C] bg-[#EAF4FB]"
                : "border-[#EEECE6] hover:border-[#1A3A5C]"
            }`}
          >
            <div className="text-[15px] font-bold font-mono" style={{ color: g.color }}>
              {g.key}
            </div>
            <div className="text-[10px] text-[#9A9890] mt-0.5">{g.label}</div>
          </button>
        );
      })}
    </div>
  );
}

function LegDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
    </div>
  );
}

function DotMark({
  state,
  style,
  label,
  onClick,
  testid,
}: {
  state: DotState;
  style: React.CSSProperties;
  label: string;
  onClick: () => void;
  testid: string;
}) {
  const bg =
    state === "ok"
      ? "#0F6E56"
      : state === "warn"
        ? "#F0A500"
        : state === "bad"
          ? "#C8001A"
          : "rgba(120,120,120,.35)";
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      data-state={state}
      title={label}
      className="absolute w-4 h-4 rounded-full border-2 border-white shadow cursor-pointer transition-transform hover:scale-125"
      style={{ ...style, transform: "translate(-50%, -50%)", background: bg }}
      aria-label={label}
    />
  );
}

function CheckItem({
  label,
  state,
  onChange,
  testid,
  threeState,
}: {
  label: string;
  state: CheckState;
  onChange: (s: CheckState) => void;
  testid: string;
  threeState?: boolean;
}) {
  const itemCls =
    state === "ok"
      ? "bg-[#E1F5EE] border-[#5DCAA5]"
      : state === "warn"
        ? "bg-[#FDF3E3] border-[#F0C97E]"
        : state === "bad"
          ? "bg-[#FDECEA] border-[#F5AEAD]"
          : "bg-white border-[#EEECE6] hover:border-[#85B7EB]";
  return (
    <div
      className={`flex items-start gap-2 px-2.5 py-1.5 rounded-md border transition-colors ${itemCls}`}
      data-testid={testid}
    >
      <div className="flex gap-0.5 flex-shrink-0">
        <button
          type="button"
          onClick={() => onChange("ok")}
          className={`w-[21px] h-[21px] rounded text-[10px] font-bold transition-colors ${
            state === "ok"
              ? "bg-[#0F6E56] border-[#0F6E56] text-white border"
              : "bg-white border border-[#D5D3CB] text-[#0F6E56] hover:border-[#1A3A5C]"
          }`}
          aria-label="OK"
          data-testid={`${testid}-ok`}
        >
          ✓
        </button>
        {threeState && (
          <button
            type="button"
            onClick={() => onChange("warn")}
            className={`w-[21px] h-[21px] rounded text-[10px] font-bold transition-colors ${
              state === "warn"
                ? "bg-[#F0A500] border-[#F0A500] text-white border"
                : "bg-white border border-[#D5D3CB] text-[#F0A500] hover:border-[#1A3A5C]"
            }`}
            aria-label="WARN"
            data-testid={`${testid}-warn`}
          >
            ⚠
          </button>
        )}
        <button
          type="button"
          onClick={() => onChange("bad")}
          className={`w-[21px] h-[21px] rounded text-[10px] font-bold transition-colors ${
            state === "bad"
              ? "bg-[#C8001A] border-[#C8001A] text-white border"
              : "bg-white border border-[#D5D3CB] text-[#C8001A] hover:border-[#1A3A5C]"
          }`}
          aria-label="BAD"
          data-testid={`${testid}-bad`}
        >
          ✗
        </button>
      </div>
      <div className="text-[12px] leading-relaxed flex-1 pt-0.5">{label}</div>
    </div>
  );
}

function TireBox({
  label,
  mm,
  onMm,
  psi,
  onPsi,
  wear,
  onWear,
  brand,
  onBrand,
  ts,
  side,
}: {
  label: string;
  mm: string;
  onMm: (v: string) => void;
  psi: string;
  onPsi: (v: string) => void;
  wear: string;
  onWear: (v: string) => void;
  brand: string;
  onBrand: (v: string) => void;
  ts: { state: "ok" | "warn" | "bad" | "none"; mark: string };
  side: "front" | "rear";
}) {
  const tsBg =
    ts.state === "ok"
      ? "bg-[#E1F5EE]"
      : ts.state === "warn"
        ? "bg-[#FDF3E3]"
        : ts.state === "bad"
          ? "bg-[#FDECEA]"
          : "bg-[#F1EFE8]";
  const tsColor =
    ts.state === "ok"
      ? "text-[#0F6E56]"
      : ts.state === "warn"
        ? "text-[#F0A500]"
        : ts.state === "bad"
          ? "text-[#C8001A]"
          : "text-[#9A9890]";
  return (
    <div className="border border-[#EEECE6] rounded-md p-3 bg-[#FAFAF8]">
      <div className="text-[12px] font-bold mb-2 text-[#1A3A5C]">{label}</div>
      <TireRow lbl="花紋深度">
        <input
          className="flex-1 px-2 py-1 rounded-md border border-[#D5D3CB] font-mono text-[12px] text-center bg-white"
          placeholder="mm"
          value={mm}
          onChange={(e) => onMm(e.target.value)}
          data-testid={`evaluation-tire-${side}-mm`}
        />
        <div
          className={`w-[26px] h-[26px] rounded-md flex items-center justify-center text-[12px] flex-shrink-0 ${tsBg} ${tsColor}`}
          data-testid={`evaluation-tire-${side}-ts`}
        >
          {ts.mark}
        </div>
      </TireRow>
      <TireRow lbl="胎壓">
        <input
          className="flex-1 px-2 py-1 rounded-md border border-[#D5D3CB] font-mono text-[12px] text-center bg-white"
          placeholder="bar"
          value={psi}
          onChange={(e) => onPsi(e.target.value)}
        />
        <span className="text-[11px] text-[#9A9890] whitespace-nowrap">標準 2.5</span>
      </TireRow>
      <TireRow lbl="磨損類型">
        <select
          className="flex-1 px-2 py-1 rounded-md border border-[#D5D3CB] text-[12px] bg-white"
          value={wear}
          onChange={(e) => onWear(e.target.value)}
        >
          {TIRE_WEAR_OPTIONS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </TireRow>
      <TireRow lbl="品牌">
        <input
          className="flex-1 px-2 py-1 rounded-md border border-[#D5D3CB] text-[12px] bg-white"
          placeholder="Pirelli / Michelin"
          value={brand}
          onChange={(e) => onBrand(e.target.value)}
        />
      </TireRow>
    </div>
  );
}

function TireRow({ lbl, children }: { lbl: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-1.5 text-[12px]">
      <span className="w-[76px] text-[#9A9890] flex-shrink-0">{lbl}</span>
      {children}
    </div>
  );
}

function CatRow({ label }: { label: string }) {
  return (
    <tr className="bg-[#F4F3F0]">
      <td
        colSpan={4}
        className="px-2.5 py-1.5 text-[11px] font-bold text-[#9A9890] tracking-wider"
      >
        {label}
      </td>
    </tr>
  );
}

function CalcRow({
  label,
  value,
  onChange,
  result,
  resultColor,
  resultLabel,
  note,
  testid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  result: number | null;
  resultColor: string;
  resultLabel?: string;
  note: string;
  testid?: string;
}) {
  return (
    <tr>
      <td className="px-2.5 py-1.5 border-b border-[#F4F3F0]">{label}</td>
      <td className="px-2.5 py-1.5 border-b border-[#F4F3F0]">
        <input
          className="w-full px-1.5 py-1 rounded-md border border-[#D5D3CB] font-mono text-[12.5px] text-right bg-white"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testid}
        />
      </td>
      <td
        className="px-2.5 py-1.5 text-right font-mono font-bold border-b border-[#F4F3F0]"
        style={{ color: resultColor }}
      >
        {result == null ? resultLabel ?? "" : fmt(result)}
      </td>
      <td className="px-2.5 py-1.5 border-b border-[#F4F3F0]">
        <input
          className="w-full px-1.5 py-1 rounded-md border border-[#D5D3CB] text-[12.5px] bg-white"
          placeholder={note}
        />
      </td>
    </tr>
  );
}

function evalTireMm(v: string): {
  state: "ok" | "warn" | "bad" | "none";
  mark: string;
} {
  const num = parseFloat(v);
  if (!num || Number.isNaN(num)) return { state: "none", mark: "?" };
  if (num > 3) return { state: "ok", mark: "✓" };
  if (num > 1.6) return { state: "warn", mark: "⚠" };
  return { state: "bad", mark: "✗" };
}

function slug(s: string) {
  return s.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
}

// ============================================================
// Inline SVG（簡化版機車輪廓，純裝飾）
// ============================================================

function SideBikeSvg() {
  return (
    <svg viewBox="0 0 420 145" width="100%" height="145" preserveAspectRatio="none" className="block">
      <circle cx="325" cy="112" r="27" fill="none" stroke="#999" strokeWidth="7" />
      <circle cx="325" cy="112" r="13" fill="#C0C0C0" stroke="#999" strokeWidth="2" />
      <circle cx="95" cy="112" r="27" fill="none" stroke="#999" strokeWidth="7" />
      <circle cx="95" cy="112" r="13" fill="#C0C0C0" stroke="#999" strokeWidth="2" />
      <path d="M95 88 L145 60 L270 58 L325 88" fill="none" stroke="#888" strokeWidth="4" strokeLinecap="round" />
      <line x1="95" y1="88" x2="130" y2="62" stroke="#888" strokeWidth="5" strokeLinecap="round" />
      <path d="M130 62 Q155 38 200 34 Q240 30 270 38 L285 60 Q290 75 285 88 L145 88 Z" fill="#D8D8D8" stroke="#BBB" strokeWidth="1.5" />
      <path d="M80 88 Q72 72 88 58 Q108 44 135 46 L145 88 Z" fill="#CACACA" stroke="#BBB" strokeWidth="1.5" />
      <path d="M285 88 L340 88 Q355 78 345 62 Q330 44 300 42 Q285 40 285 60 Z" fill="#CACACA" stroke="#BBB" strokeWidth="1.5" />
      <path d="M172 36 Q210 26 258 34 L260 50 Q220 42 170 50 Z" fill="#C8C8C8" stroke="#AAA" strokeWidth="1" />
      <path d="M185 38 Q222 28 270 36 L270 44 Q222 36 185 46 Z" fill="#444" stroke="#333" strokeWidth="1" />
      <ellipse cx="175" cy="96" rx="18" ry="12" fill="#BEBEBE" stroke="#999" strokeWidth="1.5" />
      <path d="M285 95 Q310 90 335 95 Q345 100 340 108" stroke="#888" strokeWidth="5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function TopBikeSvg() {
  return (
    <svg viewBox="0 0 420 78" width="100%" height="78" preserveAspectRatio="none" className="block">
      <ellipse cx="210" cy="39" rx="118" ry="20" fill="#D8D8D8" stroke="#BBB" strokeWidth="1.5" />
      <ellipse cx="96" cy="39" rx="11" ry="21" fill="#C0C0C0" stroke="#999" strokeWidth="2" />
      <ellipse cx="324" cy="39" rx="11" ry="21" fill="#C0C0C0" stroke="#999" strokeWidth="2" />
      <line x1="96" y1="39" x2="324" y2="39" stroke="#CCC" strokeWidth="1" strokeDasharray="5,4" />
      <line x1="128" y1="16" x2="128" y2="62" stroke="#999" strokeWidth="5.5" strokeLinecap="round" />
      <ellipse cx="200" cy="39" rx="38" ry="17" fill="#CACACA" stroke="#AAA" />
      <ellipse cx="262" cy="39" rx="43" ry="13" fill="#555" stroke="#444" />
    </svg>
  );
}
