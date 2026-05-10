"use client";

import { useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
} from "@tanstack/react-table";
import { NoticeBar, SectionHeader } from "./atoms";

type Row = {
  series: string;
  model: string;
  year: string;
  firstService: string;       // 機油保養 首保(1000)
  yearlyCheck: string;        // 年度保養 保養檢查
  oilService: string;         // 機油保養 每15,000km(24個月)
  laborOilQty: string;        // 工時/機油量(LU)
  desmoValve: string;         // Desmo保養 汽門間隙
  desmoYearOil: string;       // Desmo+年保+機油保養(LU)
  chainOil: string;           // 額外保養 無油脂複合鏈油
  forkOil: string;            // 額外保養 前叉油
  timingBelt: string;         // 額外保養 正時皮帶
  oilCycle: string;           // 年度保養 機油保養週期
  remark: string;
};

const ROWS: Row[] = [
  ["MULTISTRADA",     "Multistrada V4",       "21→25", "1:00(10LU)", "30min(5LU)",  "1:30(15LU)",                        "53LU/每60,000km", "5:18(53LU) / 5:48(58LU)", "6h:48(68LU)", "36min(6LU) 每24個月", "1h:12(12LU) 每45,000km", "—",                       "每24個月", ""],
  ["",                "Multistrada V4 PP",    "22→25", "1:00(10LU)", "30min(5LU)",  "1:54(19LU)",                        "53LU/每60,000km", "5:18(53LU) / 5:48(58LU)", "7h:12(72LU)", "36min(6LU) 每24個月", "1h:12(12LU) 每45,000km", "—",                       "每24個月", ""],
  ["",                "Multistrada V4 RS",    "24→25", "1:00(10LU)", "30min(5LU)",  "1:54(19LU)",                        "71LU/每30,000km", "7:06(71LU) / 7:36(76LU)", "9h:00(90LU)", "36min(6LU) 每24個月", "1h:12(12LU) 每45,000km", "—",                       "每24個月", ""],
  ["",                "Multistrada V2",       "25",    "1:00(10LU)", "30min(5LU)",  "1:18(13LU)",                        "30LU/每30,000km", "3:00(30LU) / 3:30(35LU)", "4h:18(43LU)", "36min(6LU) 每24個月", "1h:12(12LU) 每45,000km", "—",                       "每24個月", ""],
  ["DESERTX",         "DesertX",              "23→25", "1:06(11LU)", "30min(5LU)",  "1:42(17LU)",                        "30LU/每30,000km", "3:00(30LU) / 3:30(35LU)", "4h:12(42LU)", "36min(6LU) 每24個月", "1h:42(17LU) 每15,000km", "30min(5LU) 每30,000km",   "每24個月", ""],
  ["",                "DesertX Rally",        "24→25", "1:06(11LU)", "30min(5LU)",  "1:42(17LU)",                        "30LU/每30,000km", "3:00(30LU) / 3:30(35LU)", "4h:12(42LU)", "36min(6LU) 每24個月", "1h:42(17LU) 每15,000km", "30min(5LU) 每30,000km",   "每24個月", ""],
  ["DIAVEL",          "Diavel V4",            "23→25", "1:00(10LU)", "30min",       "1h:12(12LU)",                       "47LU/每60,000km", "4:42(47LU) / 5:12(52LU)", "5h:54(59LU)", "36min(6LU) 每24個月", "1h:12(12LU) 每45,000km", "—",                       "每24個月", ""],
  ["",                "XDiavel V4",           "25",    "1:00(10LU)", "30min",       "1h:12(12LU)",                       "47LU/每60,000km", "4:42(47LU) / 5:12(52LU)", "5h:54(59LU)", "36min(6LU) 每24個月", "1h:12(12LU) 每45,000km", "—",                       "每24個月", ""],
  ["HYPERMOTARD",     "Hypermotard 698",      "24→25", "1:00(10LU)", "30min(5LU)",  "1h:12(12LU)",                       "27LU/每30,000km", "2:42(27LU) / 3:12(32LU)", "3h:42(37LU)", "36min(6LU) 每24個月", "1h:12(12LU) 每45,000km", "—",                       "每24個月", ""],
  ["MONSTER",         "Monster V2",           "21→25", "1:00(10LU)", "30min(5LU)",  "1:42(17LU)",                        "30LU/每30,000km", "3:00(30LU) / 3:18(33LU)", "4h:12(42LU)", "36min(6LU) 每24個月", "1h:12(12LU) 每45,000km", "30min(5LU) 每30,000km",   "每24個月", ""],
  ["PANIGALE",        "Panigale V2",          "25",    "0(10LU)",    "30min(5LU)",  "1h:00 每15,000km",                  "32LU/每40,000km", "3:12(32LU) / 3:42(37LU)", "4h:30(45LU)", "36min(6LU) 每24個月", "1h:30(15LU) 每36個月",  "—",                       "每24個月", ""],
  ["",                "Panigale V4",          "25",    "1:30(15LU)", "30min(5LU)",  "2:00(20LU) 每12,000km",             "50LU/每24,000km", "5:00(50LU) / 5:30(55LU)", "7h:00(70LU)", "36min(6LU) 每24個月", "1h:30(15LU) 每36個月",  "—",                       "每36個月", ""],
  ["STREETFIGHTER",   "Streetfighter V2",     "25",    "1:00(10LU)", "30min(5LU)",  "1:18(13LU) 每15,000km",             "32LU/每30,000km", "3:12(32LU) / 3:42(37LU)", "4h:30(45LU)", "36min(6LU) 每24個月", "1h:30(15LU) 每36個月",  "—",                       "每36個月", ""],
  ["",                "Streetfighter V4",     "25",    "1:30(15LU)", "30min(5LU)",  "2:00(20LU) 每12,000km",             "50LU/每24,000km", "5:00(50LU) / 5:30(55LU)", "7h:00(70LU)", "36min(6LU) 每24個月", "1h:30(15LU) 每36個月",  "—",                       "每36個月", ""],
  ["SCRAMBLER",       "Scrambler 800 (第一段)","23→25","1:00(10LU)", "30min(5LU)",  "1h:12(12LU) 每12,000km",            "30LU/每12,000km", "3:00(30LU) / 3:30(35LU)", "4h:12(42LU)", "36min(6LU) 每24個月", "1h:12(12LU) 每36個月",  "30min(5LU) 每30,000km",   "每36個月", ""],
  ["",                "Scrambler 800 (第二段)","23→25","",            "",            "4:00(40LU) 每24,000km",             "40LU/每24,000km", "",                         "",            "",                    "",                       "",                        "",        ""],
  ["HYPERMOTARD (Desmo)","Hypermotard 950",   "19→25", "1:00(10LU)", "1h:12(12LU)", "1h:12(12LU) 每15,000km",            "37LU/每30,000km", "3:42(37LU)",               "4h:48(48LU)", "36min(6LU) 每24個月", "1h:12(12LU) 每45,000km", "1:00(10LU) 每30,000km",   "每24個月", "Desmo 車型"],
  ["SCRAMBLER (Desmo)","Scrambler 1100",      "18→25", "1:00(10LU)", "1h:12(12LU)", "3:36(36LU) 每12,000km / 4:54(49LU) 每24,000km","36LU/12,000km / 49LU/24,000km","3:36(36LU) / 4:54(49LU)","—","36min(6LU) 每36個月","1h:12(12LU) 每45,000km","42min(7LU) 每24,000km","每36個月","Desmo 車型"],
].map((r) => ({
  series: r[0], model: r[1], year: r[2],
  firstService: r[3], yearlyCheck: r[4], oilService: r[5],
  laborOilQty: r[6], desmoValve: r[7], desmoYearOil: r[8],
  chainOil: r[9], forkOil: r[10], timingBelt: r[11],
  oilCycle: r[12], remark: r[13],
}));

const helper = createColumnHelper<Row>();

const COLS = [
  helper.accessor("series",       { header: "車系",                         size: 130 }),
  helper.accessor("model",        { header: "車型",                         size: 180 }),
  helper.accessor("year",         { header: "年份",                         size: 70 }),
  helper.accessor("firstService", { header: "首保 (1,000km)",              size: 120 }),
  helper.accessor("yearlyCheck",  { header: "年度保養檢查",                size: 110 }),
  helper.accessor("oilService",   { header: "機油保養 / 24個月",            size: 180 }),
  helper.accessor("laborOilQty",  { header: "工時/機油量",                  size: 140 }),
  helper.accessor("desmoValve",   { header: "Desmo 汽門間隙",               size: 180 }),
  helper.accessor("desmoYearOil", { header: "Desmo+年保+機油",             size: 130 }),
  helper.accessor("chainOil",     { header: "鏈油 / 24個月",                size: 150 }),
  helper.accessor("forkOil",      { header: "前叉油",                       size: 170 }),
  helper.accessor("timingBelt",   { header: "正時皮帶",                     size: 170 }),
  helper.accessor("oilCycle",     { header: "保養週期",                     size: 90 }),
  helper.accessor("remark",       { header: "備註",                         size: 100 }),
];

export function TabServiceSchedule() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState("");

  const data = useMemo(() => ROWS, []);
  const table = useReactTable({
    data, columns: COLS,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-5">
      <NoticeBar tone="blue">
        張貼於售後接待區牆面｜<strong>透明維修宣告</strong>｜
        工時費率 <strong>NTD 1,650 / 每小時（含稅）</strong>｜
        LU = Labor Unit，每單位 6 分鐘｜Ed. 2025
      </NoticeBar>

      <div className="flex items-center justify-between gap-3">
        <SectionHeader number="1" tone="violet" title="定期保養內容暨工時表" subtitle="Regular Service & Labour Time Schedule" />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="🔍 搜尋車型 / 車系…"
          className="px-3 py-2 text-[12.5px] border border-slate-200 rounded-lg w-56 focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 outline-none"
        />
      </div>

      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <table className="text-[12px] w-full" style={{ minWidth: 1700 }}>
          <thead className="bg-violet-50 text-violet-900">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    className="text-left px-3 py-2.5 font-bold cursor-pointer select-none whitespace-nowrap border-b border-violet-200 hover:bg-violet-100"
                    style={{ width: h.getSize() }}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {{ asc: " ▲", desc: " ▼" }[h.column.getIsSorted() as string] ?? ""}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {table.getRowModel().rows.map((row, i) => (
              <tr key={row.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 align-top text-slate-700 whitespace-pre-wrap">
                    {(cell.getValue() as string) || <span className="text-slate-300">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NoticeBar tone="slate">
        <strong>【LU 換算與費用】</strong>
        LU = Labor Unit（工時單位）= 6 分鐘 ‖ 工時費率：NTD 1,650/小時（含稅）‖
        費用試算：LU 數 × 6÷60 × 1,650 = 費用（例：10 LU = 1 小時 = NT$1,650）‖{" "}
        <strong>【台灣總代理】</strong>碩文股份有限公司（Kevin-Ind Co., Ltd.）‖{" "}
        <strong>【保固索賠】</strong>需透過 Yutech 系統申請，原廠審核後方可執行 ‖{" "}
        <strong>【診斷工具】</strong>DDS 2.0（筆電+RJ45+通訊纜線）連接車輛 ECU ‖ Ed. 2025
      </NoticeBar>
    </div>
  );
}
