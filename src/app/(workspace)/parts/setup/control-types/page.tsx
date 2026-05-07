import { PartsShell } from "@/components/parts/parts-shell";
import { createClient } from "@/lib/supabase/server";

const TYPE_DESCRIPTIONS: Record<string, { name: string; desc: string; color: string; bg: string }> = {
  serial: {
    name: "序列號類(Serial)",
    desc: "每件獨立追蹤,例如:整車 / 引擎 / 變速箱。一物一碼,可追溯保固。",
    color: "#CC0000",
    bg: "#FDECEA",
  },
  lot: {
    name: "批號類(Lot/Batch)",
    desc: "整批管理,例如:機油 / 滾珠軸承 / 來令片。同批次共用過保日期。",
    color: "#854F0B",
    bg: "#FDF3E3",
  },
  qty: {
    name: "數量類(Qty)",
    desc: "純數量,不追溯個別件,例如:螺絲 / 墊片 / 通用 O-ring。",
    color: "#0F6E56",
    bg: "#E8F5F0",
  },
};

export default async function Page() {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("items")
    .select("control_type")
    .eq("is_active", true);

  const counts = (items ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.control_type] = (acc[row.control_type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <PartsShell
      title="管控類型定義"
      chapter="1.5"
      description="商品的庫存管控粒度,決定收貨流程要不要逐件序列號 / 批號"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "基礎設定" },
        { label: "管控類型定義" },
      ]}
    >
      <div className="grid md:grid-cols-3 gap-3 mb-5">
        {Object.entries(TYPE_DESCRIPTIONS).map(([key, t]) => (
          <div
            key={key}
            className="bg-white rounded-lg border-2 p-4"
            style={{ borderColor: t.bg }}
          >
            <div
              className="inline-block text-[11px] font-bold px-2 py-0.5 rounded mb-2"
              style={{ background: t.bg, color: t.color }}
            >
              {t.name}
            </div>
            <div className="text-[20px] font-bold mb-1" style={{ color: t.color }}>
              {counts[key] ?? 0} <span className="text-[12px] text-[#9A9890] font-medium">種料件</span>
            </div>
            <p className="text-[11px] text-[#6B6A68] leading-relaxed">{t.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#FFF9F0] border border-[#FDF3E3] rounded-lg px-4 py-3 text-[12px] text-[#854F0B]">
        💡 管控類型在「商品基礎資料」建檔時設定,一旦有交易紀錄就無法變更 — 請審慎選擇。
      </div>
    </PartsShell>
  );
}
