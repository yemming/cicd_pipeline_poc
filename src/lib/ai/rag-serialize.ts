/**
 * 結構化紀錄序列化 → 自然語言 chunk
 *
 * 給 RAG ingestion 用：把 repair_orders / final_inspections / customers /
 * handcard_voice_notes / business_card_scans 等結構化 row 組合成一段
 * 給 embedding model 吃的自然語言。
 *
 * 每個 helper 回 { content, metadata }，由呼叫端決定要不要 embed + insert。
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type SerializedChunk = {
  content: string;
  metadata: Record<string, unknown>;
};

// ─── repair_order ──────────────────────────────────────────────

export async function serializeRepairOrder(
  supabase: SupabaseClient,
  roId: string,
): Promise<SerializedChunk | null> {
  const { data: ro } = await supabase
    .from('repair_orders')
    .select(
      'id, brand_id, ro_code, issue_date, status, mileage_in, opened_at, closed_at, lines_subtotal, lines_total, customer_id, vehicle_id, metadata',
    )
    .eq('id', roId)
    .maybeSingle();
  if (!ro) return null;

  // 客戶 + 車輛 + 車型 + lines（4 個 query 平行）
  const [{ data: customer }, { data: vehicle }, { data: lines }, { data: addons }] =
    await Promise.all([
      ro.customer_id
        ? supabase
            .from('customers')
            .select('name, phone, email, type')
            .eq('id', ro.customer_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      ro.vehicle_id
        ? supabase
            .from('customer_vehicles')
            .select(
              'license_plate, vin, manufactured_year, current_mileage, color, model_id',
            )
            .eq('id', ro.vehicle_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('repair_order_lines')
        .select('kind, labor_name, labor_units, part_code, part_name, qty, amount')
        .eq('repair_order_id', roId)
        .order('line_no'),
      supabase
        .from('repair_order_addons')
        .select('name, amount')
        .eq('repair_order_id', roId),
    ]);

  let vehicleModel: { display_name?: string; engine_cc?: number } | null = null;
  if (vehicle?.model_id) {
    const { data } = await supabase
      .from('vehicle_models')
      .select('display_name, engine_cc')
      .eq('id', vehicle.model_id)
      .maybeSingle();
    vehicleModel = data;
  }

  // 組裝
  const bits: string[] = [];
  bits.push(`維修工單 ${ro.ro_code}（狀態：${ro.status}）`);
  if (ro.issue_date) bits.push(`開單日 ${ro.issue_date}`);
  if (ro.opened_at) bits.push(`進廠時間 ${formatDateTime(ro.opened_at)}`);
  if (ro.closed_at) bits.push(`完工時間 ${formatDateTime(ro.closed_at)}`);

  if (customer) {
    const ctype = customer.type === 'corporate' ? '公司' : '個人';
    bits.push(
      `客戶：${customer.name}（${ctype}${customer.phone ? `・電話 ${customer.phone}` : ''}）`,
    );
  }

  if (vehicle) {
    const veh = [
      vehicleModel?.display_name ?? '未知車型',
      vehicle.manufactured_year ? `${vehicle.manufactured_year} 年式` : '',
      vehicleModel?.engine_cc ? `${vehicleModel.engine_cc}cc` : '',
      vehicle.color ? `${vehicle.color} 色` : '',
    ]
      .filter(Boolean)
      .join('・');
    bits.push(
      `車輛：${veh}｜車牌 ${vehicle.license_plate ?? '—'}｜VIN ${vehicle.vin ?? '—'}`,
    );
    if (ro.mileage_in != null) bits.push(`進廠里程 ${ro.mileage_in} km`);
  }

  if (lines && lines.length > 0) {
    const laborLines = lines.filter((l) => l.kind === 'labor');
    const partLines = lines.filter((l) => l.kind === 'parts');
    if (laborLines.length > 0) {
      bits.push(
        `工項：${laborLines
          .map((l) => `${l.labor_name ?? '—'}（${l.labor_units ?? 0} 工時）`)
          .join('、')}`,
      );
    }
    if (partLines.length > 0) {
      bits.push(
        `換件：${partLines
          .map(
            (l) =>
              `${l.part_name ?? l.part_code ?? '零件'} × ${l.qty ?? 1}（${l.amount ?? 0} 元）`,
          )
          .join('、')}`,
      );
    }
  }

  if (addons && addons.length > 0) {
    bits.push(`加購：${addons.map((a) => `${a.name}（${a.amount} 元）`).join('、')}`);
  }

  if (ro.lines_subtotal != null || ro.lines_total != null) {
    bits.push(
      `金額：小計 ${ro.lines_subtotal ?? 0} 元、總計 ${ro.lines_total ?? 0} 元`,
    );
  }

  // metadata 內的補充（若有 notes / 主訴等等 free text）
  const meta = ro.metadata as Record<string, unknown> | null;
  if (meta) {
    const notes = (meta.notes ?? meta.complaint ?? meta.symptom) as string | undefined;
    if (notes?.trim()) bits.push(`備註：${notes.trim()}`);
  }

  return {
    content: bits.join('｜'),
    metadata: {
      ro_code: ro.ro_code,
      customer_id: ro.customer_id,
      vehicle_id: ro.vehicle_id,
      vehicle_model_id: vehicle?.model_id ?? null,
      license_plate: vehicle?.license_plate ?? null,
      status: ro.status,
      issue_date: ro.issue_date,
    },
  };
}

// ─── final_inspection ──────────────────────────────────────────

export async function serializeFinalInspection(
  supabase: SupabaseClient,
  inspId: string,
): Promise<SerializedChunk | null> {
  const { data: insp } = await supabase
    .from('final_inspections')
    .select(
      'id, brand_id, inspection_no, status, inspector_name, line_results, issue_note, test_drive, cleaning, signoff_note, next_service, photos, repair_order_id, created_at',
    )
    .eq('id', inspId)
    .maybeSingle();
  if (!insp) return null;

  // 帶上對應 RO 的 code / customer / 車輛
  let roCode: string | null = null;
  let customerId: string | null = null;
  let vehicleId: string | null = null;
  if (insp.repair_order_id) {
    const { data: ro } = await supabase
      .from('repair_orders')
      .select('ro_code, customer_id, vehicle_id')
      .eq('id', insp.repair_order_id)
      .maybeSingle();
    if (ro) {
      roCode = ro.ro_code;
      customerId = ro.customer_id;
      vehicleId = ro.vehicle_id;
    }
  }

  const bits: string[] = [];
  bits.push(`最終檢驗 ${insp.inspection_no ?? '—'}（狀態：${insp.status}）`);
  if (roCode) bits.push(`對應工單 ${roCode}`);
  if (insp.inspector_name) bits.push(`檢驗人 ${insp.inspector_name}`);
  if (insp.test_drive) bits.push(`試乘：${JSON.stringify(insp.test_drive)}`);
  if (insp.cleaning) bits.push(`清潔：${JSON.stringify(insp.cleaning)}`);
  if (insp.issue_note?.trim()) bits.push(`問題備註：${insp.issue_note.trim()}`);
  if (insp.signoff_note?.trim()) bits.push(`簽核備註：${insp.signoff_note.trim()}`);

  const lineResults = insp.line_results as Array<Record<string, unknown>> | null;
  if (lineResults && lineResults.length > 0) {
    const items = lineResults
      .map((l) => `${l.name ?? l.code ?? '項目'}：${l.result ?? l.status ?? 'OK'}`)
      .join('、');
    bits.push(`檢驗項目：${items}`);
  }

  const nextService = insp.next_service as Record<string, unknown> | null;
  if (nextService) {
    const due = (nextService.next_due_date ?? nextService.next_due_mileage) as
      | string
      | number
      | undefined;
    if (due) bits.push(`下次保養：${due}`);
  }

  return {
    content: bits.join('｜'),
    metadata: {
      inspection_no: insp.inspection_no,
      ro_code: roCode,
      customer_id: customerId,
      vehicle_id: vehicleId,
      status: insp.status,
    },
  };
}

// ─── customer ──────────────────────────────────────────────────

export async function serializeCustomer(
  supabase: SupabaseClient,
  customerId: string,
): Promise<SerializedChunk | null> {
  const { data: c } = await supabase
    .from('customers')
    .select(
      'id, brand_id, code, name, type, phone, email, address, notes, metadata, created_at',
    )
    .eq('id', customerId)
    .maybeSingle();
  if (!c) return null;

  // 帶最近 3 台車 + 最近 3 筆 RO
  const [{ data: vehicles }, { data: ros }] = await Promise.all([
    supabase
      .from('customer_vehicles')
      .select('license_plate, vin, manufactured_year, current_mileage, model_id')
      .eq('customer_id', customerId)
      .eq('is_active', true)
      .limit(3),
    supabase
      .from('repair_orders')
      .select('ro_code, issue_date, status')
      .eq('customer_id', customerId)
      .order('issue_date', { ascending: false })
      .limit(3),
  ]);

  const bits: string[] = [];
  const ctype = c.type === 'corporate' ? '公司' : '個人';
  bits.push(`客戶 ${c.code}：${c.name}（${ctype}）`);
  if (c.phone) bits.push(`電話 ${c.phone}`);
  if (c.email) bits.push(`Email ${c.email}`);
  if (c.address) bits.push(`地址 ${c.address}`);

  // 兩個都空 → 明確標示「無互動紀錄」、讓 AI 有東西可講、不要乾說「查不到」
  if ((!vehicles || vehicles.length === 0) && (!ros || ros.length === 0)) {
    bits.push('目前尚無車輛 / 工單 / 互動紀錄（可能是剛建檔的客戶）');
  }

  if (vehicles && vehicles.length > 0) {
    // 撈車型名
    const modelIds = Array.from(
      new Set(vehicles.map((v) => v.model_id).filter(Boolean) as string[]),
    );
    let modelMap: Record<string, string> = {};
    if (modelIds.length > 0) {
      const { data: models } = await supabase
        .from('vehicle_models')
        .select('id, display_name')
        .in('id', modelIds);
      modelMap = Object.fromEntries(
        (models ?? []).map((m) => [m.id as string, m.display_name as string]),
      );
    }
    bits.push(
      `名下車輛：${vehicles
        .map(
          (v) =>
            `${modelMap[v.model_id as string] ?? '未知車型'}（${v.license_plate ?? '—'}、${v.current_mileage ?? 0} km）`,
        )
        .join('、')}`,
    );
  }

  if (ros && ros.length > 0) {
    bits.push(
      `近期工單：${ros.map((r) => `${r.ro_code}（${r.issue_date}・${r.status}）`).join('、')}`,
    );
  }

  if (c.notes?.trim()) bits.push(`備註：${c.notes.trim()}`);

  const meta = c.metadata as Record<string, unknown> | null;
  const extra = meta?.business_card_extra as Record<string, unknown> | undefined;
  if (extra) {
    const extraBits = [
      extra.company ? `公司 ${extra.company}` : '',
      extra.title ? `職稱 ${extra.title}` : '',
      extra.line_id ? `LINE ${extra.line_id}` : '',
    ].filter(Boolean);
    if (extraBits.length > 0) bits.push(`名片資訊：${extraBits.join('、')}`);
  }

  return {
    content: bits.join('｜'),
    metadata: {
      customer_code: c.code,
      customer_id: c.id,
      type: c.type,
    },
  };
}

// ─── handcard_voice_note ──────────────────────────────────────

export async function serializeHandcardVoiceNote(
  supabase: SupabaseClient,
  noteId: string,
): Promise<SerializedChunk | null> {
  const { data: n } = await supabase
    .from('handcard_voice_notes')
    .select(
      'id, brand_id, transcript, ai_suggestions, reviewed_decisions, duration_seconds, created_at',
    )
    .eq('id', noteId)
    .maybeSingle();
  if (!n) return null;

  const reviewed = n.reviewed_decisions as Record<string, unknown> | null;
  const ai = n.ai_suggestions as Record<string, { value?: unknown }> | null;

  const bits: string[] = [];
  // 12 欄手卡有 reviewed_decisions.customer_name / customer_phone → 拿出來放在開頭，
  // 讓 retrieval 對客戶姓名 query 也能命中接待錄音 chunk
  const customerName = (reviewed?.customer_name as string | undefined)?.trim();
  const customerPhone = (reviewed?.customer_phone as string | undefined)?.trim();
  const head = customerName
    ? `接待錄音紀錄｜客戶 ${customerName}${customerPhone ? `（${customerPhone}）` : ''}`
    : '接待錄音紀錄';
  bits.push(`${head}｜${formatDateTime(n.created_at)}｜時長 ${n.duration_seconds ?? 0} 秒`);

  // reviewed_decisions 優先；否則用 ai_suggestions
  const get = (k: string): string | undefined => {
    const r = reviewed?.[k];
    if (r != null && r !== '') return String(r);
    const a = ai?.[k]?.value;
    if (a != null && a !== '') return String(a);
    return undefined;
  };

  const summary = get('customer_summary');
  if (summary) bits.push(`摘要：${summary}`);
  const intent = get('intent_level');
  if (intent) bits.push(`意向 ${intent}/5`);
  const timing = get('purchase_timing');
  if (timing) bits.push(`購車時機 ${timing}`);
  const models = ai?.intended_models?.value as string[] | undefined;
  if (models && models.length > 0) bits.push(`意向車型 ${models.join('、')}`);
  const competitor = get('competitor_brand');
  if (competitor) bits.push(`競品 ${competitor}`);
  const budget = get('budget_range');
  if (budget) bits.push(`預算 ${budget}`);

  const transcript = n.transcript as string | null;
  if (transcript) bits.push(`逐字稿：${transcript.slice(0, 400)}`);

  return {
    content: bits.join('｜'),
    metadata: {
      kind: 'handcard_voice',
      duration_seconds: n.duration_seconds,
    },
  };
}

// ─── business_card_scan ────────────────────────────────────────

export async function serializeBusinessCardScan(
  supabase: SupabaseClient,
  scanId: string,
): Promise<SerializedChunk | null> {
  const { data: s } = await supabase
    .from('business_card_scans')
    .select(
      'id, brand_id, ai_suggestions, reviewed_decisions, customer_id, created_at',
    )
    .eq('id', scanId)
    .maybeSingle();
  if (!s) return null;

  const reviewed = s.reviewed_decisions as Record<string, string> | null;
  const ai = s.ai_suggestions as Record<string, { value?: string }> | null;
  const get = (k: string): string => {
    return (reviewed?.[k] ?? ai?.[k]?.value ?? '').trim();
  };

  const bits: string[] = [];
  bits.push(`名片掃描｜${formatDateTime(s.created_at)}`);
  const name = get('name');
  const company = get('company');
  const title = get('title');
  const mobile = get('phone_mobile');
  const office = get('phone_office');
  const email = get('email');
  const address = get('address');
  const lineId = get('line_id');
  const notes = get('notes');

  if (name) bits.push(`姓名：${name}`);
  if (company) bits.push(`公司：${company}`);
  if (title) bits.push(`職稱：${title}`);
  if (mobile) bits.push(`行動：${mobile}`);
  if (office) bits.push(`公司電話：${office}`);
  if (email) bits.push(`Email：${email}`);
  if (address) bits.push(`地址：${address}`);
  if (lineId) bits.push(`LINE：${lineId}`);
  if (notes) bits.push(`備註：${notes}`);

  return {
    content: bits.join('｜'),
    metadata: {
      kind: 'business_card',
      customer_id: s.customer_id,
    },
  };
}

// ─── helpers ───────────────────────────────────────────────────

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Taipei',
  });
}
