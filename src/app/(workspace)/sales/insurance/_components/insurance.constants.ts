// RS_EX1 保險招攬工作台 demo 常數
// 來源：Stitch nav_node 0d1f9b6a-5bb3-415a-b2f0-0cf9be960232

export type InsUrgency = "urgent" | "soon" | "far" | "done";
export type InsType = "新轉續" | "續轉續" | "斷轉續" | "外轉續" | "在修未投保";
export type InsStatus = "pending" | "contacted" | "escalate" | "done";

export type Coverage = "強制" | "商業" | "車損" | "不計免賠" | "第三人" | "竊盜" | "刮痕" | "玻璃";

export type CallHistory = {
  dot: "blue" | "amber" | "teal";
  time: string;
  text: string;
};

export type InsCase = {
  id: number;
  name: string;
  phone: string;
  plate: string;
  bike: string;
  expiry: string;
  daysLeft: number;
  urgency: InsUrgency;
  type: InsType;
  co: string;
  rs: string;
  status: InsStatus;
  callCount: number;
  coverages: Record<Coverage, "YES" | "NO">;
  history: CallHistory[];
  note: string;
  result?: string;
  nextDate?: string;
  lost?: string;
  /**
   * BDN #14：流失原因 ROOT CAUSE 編碼（對應 sales_dictionary.code, kind='insurance_lost_reason'）
   * 與 `lost`（流失去向）正交：去向回答「跑去哪」、root cause 回答「為什麼」
   */
  lostReasonCode?: string;
};

/** BDN #14：流失原因 dropdown 的 option 形狀（從 sales_dictionary 撈來傳進 board） */
export type LostReasonOption = { code: string; label: string };

export const INS_PARAMS = {
  urgentDays: 30,
  warnDays: 90,
  callGap: 7,
  maxCalls: 3,
  targetRate: 70,
  targetRev: 20000,
};

export const SCRIPTS: { tag: string; title: string; text: string }[] = [
  {
    tag: "A",
    title: "開場白（調研破冰）",
    text: "○○先生／小姐您好，我是 DUCATI 台北展示中心的○○，現在方便占您一分鐘時間嗎？我們發現您的愛車保險即將到期，想確認您是否已經安排續保了呢？",
  },
  {
    tag: "B",
    title: "尚未續保 → VIP 方案介紹",
    text: "我們目前有 VIP 續保專屬服務，可享優惠保費，還附贈原廠保養禮券。讓我為您介紹一下方案內容，您看可以嗎？",
  },
  {
    tag: "C",
    title: "已在他處續保 → 詢問流失原因",
    text: "感謝您告訴我！請問您是在哪裡續保的呢？能否分享一下選擇他們的主要原因？（記錄後詢問明年預約）",
  },
  {
    tag: "D",
    title: "感謝致意 → 預約明年",
    text: "非常感謝您今天接受訪問！遺憾這次未能及時服務，明年同一時間我再聯繫您安排續保，這樣可以嗎？有任何需要歡迎隨時 LINE 我。",
  },
];

export const CALL_RESULTS = [
  "電訪成功",
  "客忙，再聯繫",
  "無法接通",
  "錯誤號碼",
  "LINE 留言",
  "拒絕電訪",
];

export const LOST_REASONS = [
  "電銷直接投保",
  "親友介紹投保",
  "自行至保險公司",
  "抱怨，不考慮",
  "其他原因",
];

export const QUOTE_STATES = ["— 無 —", "LINE 報價", "現場報價", "Email 報價", "已成交並出單"];

export const INSURERS = ["富邦產險", "國泰世紀產險", "新光產險", "泰安產險", "明台產險", "兆豐產險", "其他"];

export const RS_LIST = ["林佳蓉", "陳雅惠", "張志明", "王俊傑"];

export const BIKE_MODELS = [
  "Panigale V4",
  "Panigale V2",
  "Streetfighter V4",
  "Streetfighter V2",
  "Monster SP",
  "Multistrada V4",
  "Diavel V4",
  "Scrambler",
];

export const COVERAGE_KEYS: Coverage[] = [
  "強制",
  "商業",
  "車損",
  "不計免賠",
  "第三人",
  "竊盜",
  "刮痕",
  "玻璃",
];

export const INS_CASES_SEED: InsCase[] = [
  {
    id: 1,
    name: "王大明",
    phone: "0912-345-678",
    plate: "ABC-1234",
    bike: "Panigale V4",
    expiry: "2026-05-25",
    daysLeft: 15,
    urgency: "urgent",
    type: "新轉續",
    co: "富邦產險",
    rs: "林佳蓉",
    status: "pending",
    callCount: 1,
    coverages: { 強制: "YES", 商業: "YES", 車損: "YES", 不計免賠: "YES", 第三人: "YES", 竊盜: "NO", 刮痕: "YES", 玻璃: "NO" },
    history: [
      { dot: "blue", time: "05-03", text: "第 1 次電訪：電訪成功，客戶表示還在考慮方案" },
      { dot: "amber", time: "05-07", text: "排程 05-15 第 2 次電訪（到期前 10 天）" },
    ],
    note: "客戶上次有詢問分期保費選項，建議準備富邦 12 期方案報價。",
  },
  {
    id: 2,
    name: "陳美玲",
    phone: "0928-456-789",
    plate: "XYZ-5678",
    bike: "Monster SP",
    expiry: "2026-05-18",
    daysLeft: 8,
    urgency: "urgent",
    type: "續轉續",
    co: "國泰世紀產險",
    rs: "陳雅惠",
    status: "escalate",
    callCount: 3,
    coverages: { 強制: "YES", 商業: "YES", 車損: "YES", 不計免賠: "NO", 第三人: "YES", 竊盜: "NO", 刮痕: "NO", 玻璃: "NO" },
    history: [
      { dot: "blue", time: "04-20", text: "第 1 次電訪：客忙，再聯繫" },
      { dot: "blue", time: "04-28", text: "第 2 次電訪：無法接通" },
      { dot: "blue", time: "05-06", text: "第 3 次電訪：無法接通，已達最多電訪次數" },
    ],
    note: "已達 3 次電訪上限，需升報主管協助。",
  },
  {
    id: 3,
    name: "李文彬",
    phone: "0955-567-890",
    plate: "DEF-9012",
    bike: "Streetfighter V4",
    expiry: "2026-07-15",
    daysLeft: 66,
    urgency: "soon",
    type: "外轉續",
    co: "新光產險",
    rs: "張志明",
    status: "contacted",
    callCount: 1,
    coverages: { 強制: "YES", 商業: "YES", 車損: "YES", 不計免賠: "YES", 第三人: "YES", 竊盜: "YES", 刮痕: "NO", 玻璃: "YES" },
    history: [
      { dot: "blue", time: "05-01", text: "第 1 次電訪：電訪成功，客戶說 6 月底前決定" },
      { dot: "amber", time: "05-01", text: "排程 06-15 第 2 次電訪" },
    ],
    note: "客戶上次在他處投保，這次想回本店。已傳送報價單至 LINE。",
    nextDate: "2026-06-15",
  },
  {
    id: 4,
    name: "林宗翰",
    phone: "0966-678-901",
    plate: "GHI-3456",
    bike: "Multistrada V4",
    expiry: "2026-07-30",
    daysLeft: 81,
    urgency: "soon",
    type: "續轉續",
    co: "富邦產險",
    rs: "林佳蓉",
    status: "pending",
    callCount: 0,
    coverages: { 強制: "YES", 商業: "YES", 車損: "YES", 不計免賠: "YES", 第三人: "YES", 竊盜: "YES", 刮痕: "YES", 玻璃: "YES" },
    history: [{ dot: "amber", time: "05-10", text: "系統自動排程，尚未電訪" }],
    note: "老車主，保險一直在本店續，話術用 D 段感謝維護關係即可。",
  },
  {
    id: 5,
    name: "黃俊豪",
    phone: "0977-789-012",
    plate: "JKL-7890",
    bike: "Diavel V4",
    expiry: "2026-08-20",
    daysLeft: 102,
    urgency: "soon",
    type: "新轉續",
    co: "泰安產險",
    rs: "王俊傑",
    status: "pending",
    callCount: 0,
    coverages: { 強制: "YES", 商業: "NO", 車損: "NO", 不計免賠: "NO", 第三人: "YES", 竊盜: "NO", 刮痕: "NO", 玻璃: "NO" },
    history: [{ dot: "amber", time: "05-10", text: "系統自動排程，尚未電訪" }],
    note: "新車交車時購買最基本保險，有機會加購商業險與車損險。",
  },
  {
    id: 6,
    name: "張雅婷",
    phone: "0988-890-123",
    plate: "MNO-1234",
    bike: "Scrambler",
    expiry: "2026-11-10",
    daysLeft: 184,
    urgency: "far",
    type: "新轉續",
    co: "明台產險",
    rs: "陳雅惠",
    status: "pending",
    callCount: 0,
    coverages: { 強制: "YES", 商業: "YES", 車損: "YES", 不計免賠: "YES", 第三人: "YES", 竊盜: "NO", 刮痕: "NO", 玻璃: "NO" },
    history: [{ dot: "amber", time: "05-10", text: "90 天提醒期未到，暫不電訪" }],
    note: "",
  },
  {
    id: 7,
    name: "吳建國",
    phone: "0919-901-234",
    plate: "PQR-5678",
    bike: "Panigale V2",
    expiry: "2026-12-05",
    daysLeft: 209,
    urgency: "far",
    type: "斷轉續",
    co: "其他",
    rs: "張志明",
    status: "pending",
    callCount: 0,
    coverages: { 強制: "YES", 商業: "NO", 車損: "NO", 不計免賠: "NO", 第三人: "NO", 竊盜: "NO", 刮痕: "NO", 玻璃: "NO" },
    history: [{ dot: "amber", time: "05-10", text: "90 天提醒期未到，暫不電訪" }],
    note: "上次在他處投保，有機會在提醒期到來時吸引回本店。",
  },
];

export const DONE_CASES_SEED: InsCase[] = [
  {
    id: 101,
    name: "蔡明哲",
    phone: "0933-012-345",
    plate: "STU-9012",
    bike: "Streetfighter V2",
    expiry: "2026-05-05",
    daysLeft: 0,
    urgency: "done",
    type: "續轉續",
    co: "富邦產險",
    rs: "林佳蓉",
    status: "done",
    callCount: 2,
    coverages: { 強制: "YES", 商業: "YES", 車損: "YES", 不計免賠: "YES", 第三人: "YES", 竊盜: "NO", 刮痕: "NO", 玻璃: "NO" },
    history: [
      { dot: "blue", time: "04-10", text: "第 1 次電訪：電訪成功" },
      { dot: "teal", time: "04-15", text: "已成交出單，富邦產險，保費 $22,500" },
    ],
    note: "",
    result: "已成交出單",
  },
];

export type NewDelivery = {
  name: string;
  bike: string;
  delivDate: string;
  plate: string;
  rs: string;
  insStatus: "全險已投" | "已投強制險" | "僅強制險";
  note: string;
};

export const NEW_DELIVERIES: NewDelivery[] = [
  { name: "王大明", bike: "Panigale V4", delivDate: "2026-05-10", plate: "ABC-1234", rs: "林佳蓉", insStatus: "已投強制險", note: "建議加購商業險與車損險" },
  { name: "陳美玲", bike: "Monster SP", delivDate: "2026-05-08", plate: "XYZ-5678", rs: "陳雅惠", insStatus: "全險已投", note: "已完成，無需追蹤" },
  { name: "黃俊豪", bike: "Diavel V4", delivDate: "2026-04-28", plate: "JKL-7890", rs: "王俊傑", insStatus: "僅強制險", note: "已電訪提醒加購，客戶考慮中" },
];

export type PerfRow = { name: string; done: number; rev: number };

export const PERF_RS_ROWS: PerfRow[] = [
  { name: "林佳蓉", done: 1, rev: 4200 },
  { name: "陳雅惠", done: 1, rev: 3800 },
  { name: "張志明", done: 1, rev: 4600 },
  { name: "王俊傑", done: 0, rev: 0 },
];

export const PERF_LOST_REASONS: { label: string; count: number }[] = [
  { label: "電銷直接投保", count: 2 },
  { label: "親友介紹投保", count: 1 },
  { label: "其他原因", count: 0 },
  { label: "無法接通（待跟進）", count: 2 },
];

export const PERF_YEAR_TOTALS: { month: string; amount: number }[] = [
  { month: "1 月", amount: 8400 },
  { month: "2 月", amount: 7200 },
  { month: "3 月", amount: 14800 },
  { month: "4 月", amount: 15400 },
  { month: "5 月（進行中）", amount: 12600 },
  { month: "合計", amount: 58400 },
];
