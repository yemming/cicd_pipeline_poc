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

// ─── einvoice ─────────────────────────────────────────────────

export async function serializeEinvoice(
  supabase: SupabaseClient,
  einvoiceId: string,
): Promise<SerializedChunk | null> {
  const { data: e } = await supabase
    .from('einvoices')
    .select(
      'id, brand_id, source_module, source_ref, ecpay_invoice_no, ecpay_invoice_date, ecpay_status, invoice_type, carrier_type, carrier_code, tax_id, buyer_name, buyer_address, buyer_email, total_amount, tax_amount, items, remark, issued_at, created_at',
    )
    .eq('id', einvoiceId)
    .maybeSingle();
  if (!e) return null;

  const bits: string[] = [];
  bits.push(`電子發票 ${e.ecpay_invoice_no ?? '—'}（狀態：${e.ecpay_status ?? '—'}）`);
  if (e.ecpay_invoice_date) bits.push(`開立日 ${e.ecpay_invoice_date}`);
  if (e.invoice_type) bits.push(`類型 ${e.invoice_type}`);
  if (e.source_module || e.source_ref) {
    bits.push(`來源 ${e.source_module ?? '—'}${e.source_ref ? ` (${e.source_ref})` : ''}`);
  }
  if (e.buyer_name) bits.push(`買方 ${e.buyer_name}`);
  if (e.tax_id) bits.push(`統編 ${e.tax_id}`);
  if (e.carrier_type) {
    bits.push(`載具 ${e.carrier_type}${e.carrier_code ? `（${e.carrier_code}）` : ''}`);
  }
  if (e.buyer_address) bits.push(`地址 ${e.buyer_address}`);
  if (e.buyer_email) bits.push(`Email ${e.buyer_email}`);
  bits.push(
    `含稅金額 NT$${e.total_amount ?? 0}${
      e.tax_amount != null ? `（稅額 NT$${e.tax_amount}）` : ''
    }`,
  );

  const items = e.items as Array<Record<string, unknown>> | null;
  if (items && items.length > 0) {
    const itemSummary = items
      .slice(0, 5)
      .map((it) => `${it.name ?? '品項'}×${it.qty ?? 1} = ${it.amount ?? '?'}`)
      .join('、');
    bits.push(`品項：${itemSummary}${items.length > 5 ? ` 等 ${items.length} 項` : ''}`);
  }
  if (e.remark?.trim()) bits.push(`備註：${e.remark.trim()}`);

  return {
    content: bits.join('｜'),
    metadata: {
      invoice_no: e.ecpay_invoice_no,
      invoice_date: e.ecpay_invoice_date,
      source_module: e.source_module,
      source_ref: e.source_ref,
      total_amount: e.total_amount,
      tax_id: e.tax_id,
    },
  };
}

// ─── sales_order ──────────────────────────────────────────────

export async function serializeSalesOrder(
  supabase: SupabaseClient,
  id: string,
): Promise<SerializedChunk | null> {
  const { data: o } = await supabase
    .from('sales_orders')
    .select(
      'order_no, contract_type, status, customer_id, customer_name, customer_phone, rs_name, vehicle_model_name, vehicle_color, vehicle_vin, used_brand_model, used_plate, payment_method, total_amount, down_payment, deal_price, delivery_date, final_payment_date, special_notes, condition_notes, signed_at, fulfilled_at',
    )
    .eq('id', id)
    .maybeSingle();
  if (!o) return null;
  const bits: string[] = [];
  bits.push(`銷售訂單 ${o.order_no ?? '—'}（${o.contract_type ?? ''}・狀態 ${o.status ?? '—'}）`);
  if (o.customer_name) bits.push(`客戶 ${o.customer_name}${o.customer_phone ? `（${o.customer_phone}）` : ''}`);
  if (o.rs_name) bits.push(`業務 ${o.rs_name}`);
  if (o.vehicle_model_name) {
    bits.push(
      `車輛 ${o.vehicle_model_name}${o.vehicle_color ? `・${o.vehicle_color}` : ''}${o.vehicle_vin ? `・VIN ${o.vehicle_vin}` : ''}`,
    );
  }
  if (o.used_brand_model) {
    bits.push(`折抵舊車 ${o.used_brand_model}${o.used_plate ? `（${o.used_plate}）` : ''}`);
  }
  bits.push(
    `付款 ${o.payment_method ?? '—'}・成交價 NT$${o.deal_price ?? o.total_amount ?? 0}${
      o.down_payment != null ? `（頭款 NT$${o.down_payment}）` : ''
    }`,
  );
  if (o.delivery_date) bits.push(`交車日 ${o.delivery_date}`);
  if (o.signed_at) bits.push(`簽約時間 ${formatDateTime(o.signed_at)}`);
  if (o.special_notes?.trim()) bits.push(`備註：${o.special_notes.trim()}`);
  if (o.condition_notes?.trim()) bits.push(`條件：${o.condition_notes.trim()}`);
  return {
    content: bits.join('｜'),
    metadata: {
      order_no: o.order_no,
      customer_id: o.customer_id,
      status: o.status,
    },
  };
}

// ─── sales_lead ───────────────────────────────────────────────

export async function serializeSalesLead(
  supabase: SupabaseClient,
  id: string,
): Promise<SerializedChunk | null> {
  const { data: l } = await supabase
    .from('sales_leads')
    .select(
      'code, name, phone, email, habc, intent_model, source, rs_name, follow_date, last_visit_at, note, kind, dormancy_status, lost_reason, competitor_brand, converted_customer_id',
    )
    .eq('id', id)
    .maybeSingle();
  if (!l) return null;
  const bits: string[] = [];
  bits.push(`銷售線索 ${l.code ?? '—'}：${l.name ?? '—'}${l.phone ? `（${l.phone}）` : ''}`);
  if (l.habc) bits.push(`等級 ${l.habc}`);
  if (l.intent_model) bits.push(`意向 ${l.intent_model}`);
  if (l.source) bits.push(`來源 ${l.source}`);
  if (l.rs_name) bits.push(`業務 ${l.rs_name}`);
  if (l.last_visit_at) bits.push(`上次來訪 ${l.last_visit_at}`);
  if (l.follow_date) bits.push(`追蹤日 ${l.follow_date}`);
  if (l.dormancy_status && l.dormancy_status !== 'active') bits.push(`狀態 ${l.dormancy_status}`);
  if (l.competitor_brand) bits.push(`競品 ${l.competitor_brand}`);
  if (l.lost_reason) bits.push(`流失原因 ${l.lost_reason}`);
  if (l.converted_customer_id) bits.push(`已轉客戶`);
  if (l.note?.trim()) bits.push(`備註：${l.note.trim()}`);
  return {
    content: bits.join('｜'),
    metadata: {
      code: l.code,
      customer_id: l.converted_customer_id,
      habc: l.habc,
      kind: l.kind,
    },
  };
}

// ─── sales_handcard ───────────────────────────────────────────

export async function serializeSalesHandcard(
  supabase: SupabaseClient,
  id: string,
): Promise<SerializedChunk | null> {
  const { data: h } = await supabase
    .from('sales_handcards')
    .select(
      'reception_date, reception_period, customer_name, customer_phone, customer_identity, customer_id, lead_id, assigned_rs_name, lead_grade, intent_level, purchase_timing, intended_models, trial_status, competitor_brand, competitor_model, quoted_amount, notes, status',
    )
    .eq('id', id)
    .maybeSingle();
  if (!h) return null;
  const bits: string[] = [];
  bits.push(
    `接待手卡｜${h.reception_date ?? '—'} ${h.reception_period ?? ''}｜客戶 ${h.customer_name ?? '—'}${
      h.customer_phone ? `（${h.customer_phone}）` : ''
    }`,
  );
  if (h.customer_identity) bits.push(`身份 ${h.customer_identity}`);
  if (h.assigned_rs_name) bits.push(`業務 ${h.assigned_rs_name}`);
  if (h.lead_grade) bits.push(`等級 ${h.lead_grade}`);
  if (h.intent_level) bits.push(`意向 ${h.intent_level}/5`);
  if (h.purchase_timing) bits.push(`時機 ${h.purchase_timing}`);
  const models = (h.intended_models as string[] | null) ?? [];
  if (models.length > 0) bits.push(`意向車型 ${models.join('、')}`);
  if (h.trial_status) bits.push(`試駕 ${h.trial_status}`);
  if (h.competitor_brand) {
    bits.push(`競品 ${h.competitor_brand}${h.competitor_model ? ` ${h.competitor_model}` : ''}`);
  }
  if (h.quoted_amount) bits.push(`報價 NT$${h.quoted_amount}`);
  if (h.status) bits.push(`狀態 ${h.status}`);
  if (h.notes?.trim()) bits.push(`備註：${h.notes.trim()}`);
  return {
    content: bits.join('｜'),
    metadata: {
      code: `${h.reception_date ?? ''}-${h.customer_name ?? ''}`.trim(),
      customer_id: h.customer_id,
      customer_name: h.customer_name,
    },
  };
}

// ─── appointment ──────────────────────────────────────────────

export async function serializeAppointment(
  supabase: SupabaseClient,
  id: string,
): Promise<SerializedChunk | null> {
  const { data: a } = await supabase
    .from('appointments')
    .select(
      'appointment_date, appointment_time, customer_id, vehicle_id, service_type, service_subtype, estimated_hours, status, arrived_at, started_at, completed_at, notes',
    )
    .eq('id', id)
    .maybeSingle();
  if (!a) return null;

  // 補客戶 + 車輛資訊
  const [{ data: c }, { data: v }] = await Promise.all([
    a.customer_id
      ? supabase.from('customers').select('name, phone').eq('id', a.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    a.vehicle_id
      ? supabase
          .from('customer_vehicles')
          .select('license_plate, model_id')
          .eq('id', a.vehicle_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const bits: string[] = [];
  bits.push(`預約｜${a.appointment_date ?? '—'} ${a.appointment_time ?? ''}（狀態 ${a.status ?? '—'}）`);
  if (a.service_type) {
    bits.push(`服務 ${a.service_type}${a.service_subtype ? `・${a.service_subtype}` : ''}`);
  }
  if (a.estimated_hours) bits.push(`預估 ${a.estimated_hours} 工時`);
  if (c) bits.push(`客戶 ${c.name}${c.phone ? `（${c.phone}）` : ''}`);
  if (v?.license_plate) bits.push(`車牌 ${v.license_plate}`);
  if (a.arrived_at) bits.push(`到店 ${formatDateTime(a.arrived_at)}`);
  if (a.completed_at) bits.push(`完成 ${formatDateTime(a.completed_at)}`);
  if (a.notes?.trim()) bits.push(`備註：${a.notes.trim()}`);

  return {
    content: bits.join('｜'),
    metadata: {
      appt_no: `${a.appointment_date ?? ''} ${a.appointment_time ?? ''}`.trim(),
      customer_id: a.customer_id,
      vehicle_id: a.vehicle_id,
      service_type: a.service_type,
    },
  };
}

// ─── work_order（Wave 2.0、跟 repair_orders 不同表） ─────────

export async function serializeWorkOrder(
  supabase: SupabaseClient,
  id: string,
): Promise<SerializedChunk | null> {
  const { data: w } = await supabase
    .from('work_orders')
    .select(
      'ro_no, customer_id, vehicle_id, status, opened_at, closed_at, mileage_in, mileage_out, customer_complaint, diagnosis, work_summary, parts_amount, labor_amount, total_amount, notes',
    )
    .eq('id', id)
    .maybeSingle();
  if (!w) return null;

  const [{ data: c }, { data: v }] = await Promise.all([
    w.customer_id
      ? supabase.from('customers').select('name, phone').eq('id', w.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    w.vehicle_id
      ? supabase
          .from('customer_vehicles')
          .select('license_plate, vin, model_id')
          .eq('id', w.vehicle_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const bits: string[] = [];
  bits.push(`維修工單 ${w.ro_no ?? '—'}（狀態 ${w.status ?? '—'}）`);
  if (c) bits.push(`客戶 ${c.name}${c.phone ? `（${c.phone}）` : ''}`);
  if (v) bits.push(`車輛 車牌 ${v.license_plate ?? '—'}${v.vin ? `・VIN ${v.vin}` : ''}`);
  if (w.opened_at) bits.push(`進廠 ${formatDateTime(w.opened_at)}`);
  if (w.closed_at) bits.push(`完工 ${formatDateTime(w.closed_at)}`);
  if (w.mileage_in != null) bits.push(`進廠里程 ${w.mileage_in} km`);
  if (w.customer_complaint?.trim()) bits.push(`主訴：${w.customer_complaint.trim()}`);
  if (w.diagnosis?.trim()) bits.push(`診斷：${w.diagnosis.trim()}`);
  if (w.work_summary?.trim()) bits.push(`處理：${w.work_summary.trim()}`);
  if (w.total_amount != null) {
    bits.push(
      `金額：總計 NT$${w.total_amount}${w.parts_amount != null ? `（零件 ${w.parts_amount}` : ''}${
        w.labor_amount != null ? `・工資 ${w.labor_amount}）` : ''
      }`,
    );
  }
  if (w.notes?.trim()) bits.push(`備註：${w.notes.trim()}`);

  return {
    content: bits.join('｜'),
    metadata: {
      wo_no: w.ro_no,
      ro_code: w.ro_no,
      customer_id: w.customer_id,
      vehicle_id: w.vehicle_id,
      status: w.status,
    },
  };
}

// ─── pre_inspection ───────────────────────────────────────────

export async function serializePreInspection(
  supabase: SupabaseClient,
  id: string,
): Promise<SerializedChunk | null> {
  const { data: p } = await supabase
    .from('pre_inspections')
    .select(
      'pi_no, status, customer_id, vehicle_id, customer_name, customer_phone, vehicle_license_plate, vehicle_model_name, mileage_in, sa_name, estimated_subtotal, signed_at, mode',
    )
    .eq('id', id)
    .maybeSingle();
  if (!p) return null;
  const bits: string[] = [];
  bits.push(`預檢 ${p.pi_no ?? '—'}（狀態 ${p.status ?? '—'}${p.mode ? `・模式 ${p.mode}` : ''}）`);
  if (p.customer_name) bits.push(`客戶 ${p.customer_name}${p.customer_phone ? `（${p.customer_phone}）` : ''}`);
  if (p.vehicle_license_plate) {
    bits.push(`車輛 ${p.vehicle_model_name ?? ''}（${p.vehicle_license_plate}）`);
  }
  if (p.mileage_in != null) bits.push(`進廠里程 ${p.mileage_in} km`);
  if (p.sa_name) bits.push(`SA ${p.sa_name}`);
  if (p.estimated_subtotal != null) bits.push(`估價小計 NT$${p.estimated_subtotal}`);
  if (p.signed_at) bits.push(`簽認 ${formatDateTime(p.signed_at)}`);
  return {
    content: bits.join('｜'),
    metadata: {
      inspection_no: p.pi_no,
      customer_id: p.customer_id,
      vehicle_id: p.vehicle_id,
    },
  };
}

// ─── customer_vehicle ─────────────────────────────────────────

export async function serializeCustomerVehicle(
  supabase: SupabaseClient,
  id: string,
): Promise<SerializedChunk | null> {
  const { data: v } = await supabase
    .from('customer_vehicles')
    .select(
      'customer_id, model_id, vin, license_plate, engine_no, color, manufactured_year, purchase_date, current_mileage, last_service_date, last_service_mileage, next_service_due_date, next_service_due_mileage, warranty_until, insurance_company, insurance_until, notes',
    )
    .eq('id', id)
    .maybeSingle();
  if (!v) return null;

  const [{ data: c }, { data: m }] = await Promise.all([
    v.customer_id
      ? supabase.from('customers').select('name, phone').eq('id', v.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    v.model_id
      ? supabase
          .from('vehicle_models')
          .select('display_name, engine_cc')
          .eq('id', v.model_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const bits: string[] = [];
  bits.push(
    `客戶車輛 ${m?.display_name ?? '未知車型'}${v.manufactured_year ? `（${v.manufactured_year} 年式）` : ''}`,
  );
  bits.push(`車牌 ${v.license_plate ?? '—'}`);
  if (v.vin) bits.push(`VIN ${v.vin}`);
  if (v.color) bits.push(`色 ${v.color}`);
  if (m?.engine_cc) bits.push(`${m.engine_cc}cc`);
  if (c) bits.push(`車主 ${c.name}${c.phone ? `（${c.phone}）` : ''}`);
  if (v.current_mileage != null) bits.push(`目前里程 ${v.current_mileage} km`);
  if (v.purchase_date) bits.push(`購車日 ${v.purchase_date}`);
  if (v.last_service_date) {
    bits.push(`上次保養 ${v.last_service_date}${v.last_service_mileage ? `（${v.last_service_mileage} km）` : ''}`);
  }
  if (v.next_service_due_date) {
    bits.push(`下次保養 ${v.next_service_due_date}${v.next_service_due_mileage ? `（${v.next_service_due_mileage} km）` : ''}`);
  }
  if (v.warranty_until) bits.push(`保固至 ${v.warranty_until}`);
  if (v.insurance_company) {
    bits.push(`保險 ${v.insurance_company}${v.insurance_until ? `（至 ${v.insurance_until}）` : ''}`);
  }
  if (v.notes?.trim()) bits.push(`備註：${v.notes.trim()}`);

  return {
    content: bits.join('｜'),
    metadata: {
      license_plate: v.license_plate,
      vin: v.vin,
      customer_id: v.customer_id,
      vehicle_model_id: v.model_id,
    },
  };
}

// ─── new_car_inventory ────────────────────────────────────────

export async function serializeNewCarInventory(
  supabase: SupabaseClient,
  id: string,
): Promise<SerializedChunk | null> {
  const { data: n } = await supabase
    .from('new_car_inventory')
    .select(
      'vin, vehicle_model_id, color, year, engine_no, build_date, cost_price, list_price, status, arrival_date, displayed_date, reserved_date, sold_date, delivered_date, license_plate_no, note',
    )
    .eq('id', id)
    .maybeSingle();
  if (!n) return null;

  const { data: m } = n.vehicle_model_id
    ? await supabase
        .from('vehicle_models')
        .select('display_name')
        .eq('id', n.vehicle_model_id)
        .maybeSingle()
    : { data: null };

  const bits: string[] = [];
  bits.push(`新車庫存 ${m?.display_name ?? '—'}（VIN ${n.vin ?? '—'}・狀態 ${n.status ?? '—'}）`);
  if (n.color) bits.push(`色 ${n.color}`);
  if (n.year) bits.push(`${n.year} 年式`);
  if (n.list_price) bits.push(`牌價 NT$${n.list_price}`);
  if (n.cost_price) bits.push(`成本 NT$${n.cost_price}`);
  if (n.arrival_date) bits.push(`到店 ${n.arrival_date}`);
  if (n.displayed_date) bits.push(`展示 ${n.displayed_date}`);
  if (n.reserved_date) bits.push(`預訂 ${n.reserved_date}`);
  if (n.sold_date) bits.push(`售出 ${n.sold_date}`);
  if (n.license_plate_no) bits.push(`車牌 ${n.license_plate_no}`);
  if (n.note?.trim()) bits.push(`備註：${n.note.trim()}`);
  return {
    content: bits.join('｜'),
    metadata: {
      vin: n.vin,
      status: n.status,
      vehicle_model_id: n.vehicle_model_id,
    },
  };
}

// ─── used_car_inventory ───────────────────────────────────────

export async function serializeUsedCarInventory(
  supabase: SupabaseClient,
  id: string,
): Promise<SerializedChunk | null> {
  const { data: u } = await supabase
    .from('used_car_inventory')
    .select(
      'vin, license_plate, model_display_name, year, color, mileage_km, acquisition_price, listing_price, cost, margin, acquisition_source, acquisition_date, listed_date, sold_date, status, condition_grade, note',
    )
    .eq('id', id)
    .maybeSingle();
  if (!u) return null;
  const bits: string[] = [];
  bits.push(
    `中古車庫存 ${u.model_display_name ?? '—'}${u.year ? `（${u.year} 年式）` : ''}（狀態 ${u.status ?? '—'}）`,
  );
  if (u.license_plate) bits.push(`車牌 ${u.license_plate}`);
  if (u.vin) bits.push(`VIN ${u.vin}`);
  if (u.color) bits.push(`色 ${u.color}`);
  if (u.mileage_km != null) bits.push(`里程 ${u.mileage_km} km`);
  if (u.condition_grade) bits.push(`狀態評級 ${u.condition_grade}`);
  if (u.listing_price) bits.push(`售價 NT$${u.listing_price}`);
  if (u.acquisition_price) bits.push(`收車 NT$${u.acquisition_price}`);
  if (u.margin != null) bits.push(`利潤 NT$${u.margin}`);
  if (u.acquisition_source) bits.push(`來源 ${u.acquisition_source}`);
  if (u.acquisition_date) bits.push(`收車日 ${u.acquisition_date}`);
  if (u.listed_date) bits.push(`上架 ${u.listed_date}`);
  if (u.sold_date) bits.push(`售出 ${u.sold_date}`);
  if (u.note?.trim()) bits.push(`備註：${u.note.trim()}`);
  return {
    content: bits.join('｜'),
    metadata: {
      code: u.license_plate ?? u.vin,
      vin: u.vin,
      license_plate: u.license_plate,
      status: u.status,
    },
  };
}

// ─── sales_test_drive ─────────────────────────────────────────

export async function serializeSalesTestDrive(
  supabase: SupabaseClient,
  id: string,
): Promise<SerializedChunk | null> {
  const { data: t } = await supabase
    .from('sales_test_drives')
    .select('customer_id, vehicle_model_id, scheduled_at, completed_at, status, notes')
    .eq('id', id)
    .maybeSingle();
  if (!t) return null;
  const [{ data: c }, { data: m }] = await Promise.all([
    t.customer_id
      ? supabase.from('customers').select('name, phone').eq('id', t.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    t.vehicle_model_id
      ? supabase
          .from('vehicle_models')
          .select('display_name')
          .eq('id', t.vehicle_model_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const bits: string[] = [];
  bits.push(`試駕紀錄｜${formatDateTime(t.scheduled_at)}（狀態 ${t.status ?? '—'}）`);
  if (c) bits.push(`客戶 ${c.name}${c.phone ? `（${c.phone}）` : ''}`);
  if (m) bits.push(`試駕車型 ${m.display_name}`);
  if (t.completed_at) bits.push(`完成 ${formatDateTime(t.completed_at)}`);
  if (t.notes?.trim()) bits.push(`備註：${t.notes.trim()}`);
  return {
    content: bits.join('｜'),
    metadata: {
      code: t.scheduled_at,
      customer_id: t.customer_id,
      vehicle_model_id: t.vehicle_model_id,
    },
  };
}

// ─── sales_quote ──────────────────────────────────────────────

export async function serializeSalesQuote(
  supabase: SupabaseClient,
  id: string,
): Promise<SerializedChunk | null> {
  const { data: q } = await supabase
    .from('sales_quotes')
    .select(
      'quote_no, vehicle_kind, status, customer_id, customer_name, customer_phone, rs_name, vehicle_model_name, used_brand_model, vehicle_amount, addon_amount, discount_amount, total_amount, expires_at, sent_at, closed_at, notes',
    )
    .eq('id', id)
    .maybeSingle();
  if (!q) return null;
  const bits: string[] = [];
  bits.push(`報價單 ${q.quote_no ?? '—'}（${q.vehicle_kind ?? ''}・狀態 ${q.status ?? '—'}）`);
  if (q.customer_name) bits.push(`客戶 ${q.customer_name}${q.customer_phone ? `（${q.customer_phone}）` : ''}`);
  if (q.rs_name) bits.push(`業務 ${q.rs_name}`);
  if (q.vehicle_model_name) bits.push(`車型 ${q.vehicle_model_name}`);
  if (q.used_brand_model) bits.push(`折抵 ${q.used_brand_model}`);
  bits.push(
    `總價 NT$${q.total_amount ?? 0}${q.vehicle_amount ? `（車 ${q.vehicle_amount}` : ''}${
      q.addon_amount ? `・加購 ${q.addon_amount}` : ''
    }${q.discount_amount ? `・折扣 ${q.discount_amount}）` : ''}`,
  );
  if (q.expires_at) bits.push(`效期 ${q.expires_at}`);
  if (q.sent_at) bits.push(`送出 ${formatDateTime(q.sent_at)}`);
  if (q.notes?.trim()) bits.push(`備註：${q.notes.trim()}`);
  return {
    content: bits.join('｜'),
    metadata: { quote_no: q.quote_no, customer_id: q.customer_id, status: q.status },
  };
}

// ─── delivery ─────────────────────────────────────────────────

export async function serializeDelivery(
  supabase: SupabaseClient,
  id: string,
): Promise<SerializedChunk | null> {
  const { data: d } = await supabase
    .from('deliveries')
    .select(
      'delivery_no, sales_order_id, customer_id, customer_name, customer_phone, rs_name, vehicle_model_name, vehicle_color, vin, plate_no, status, scheduled_delivery_date, actual_delivery_date, delivered_at, warranty_no, warranty_start_date, notes',
    )
    .eq('id', id)
    .maybeSingle();
  if (!d) return null;
  const bits: string[] = [];
  bits.push(`交車單 ${d.delivery_no ?? '—'}（狀態 ${d.status ?? '—'}）`);
  if (d.customer_name) bits.push(`客戶 ${d.customer_name}${d.customer_phone ? `（${d.customer_phone}）` : ''}`);
  if (d.rs_name) bits.push(`業務 ${d.rs_name}`);
  if (d.vehicle_model_name) {
    bits.push(`車輛 ${d.vehicle_model_name}${d.vehicle_color ? `・${d.vehicle_color}` : ''}${d.vin ? `・VIN ${d.vin}` : ''}`);
  }
  if (d.plate_no) bits.push(`車牌 ${d.plate_no}`);
  if (d.scheduled_delivery_date) bits.push(`預計交車 ${d.scheduled_delivery_date}`);
  if (d.actual_delivery_date) bits.push(`實際交車 ${d.actual_delivery_date}`);
  if (d.delivered_at) bits.push(`交車時間 ${formatDateTime(d.delivered_at)}`);
  if (d.warranty_no) bits.push(`保固單號 ${d.warranty_no}${d.warranty_start_date ? `（${d.warranty_start_date} 起）` : ''}`);
  if (d.notes?.trim()) bits.push(`備註：${d.notes.trim()}`);
  return {
    content: bits.join('｜'),
    metadata: { code: d.delivery_no, customer_id: d.customer_id, status: d.status, vin: d.vin },
  };
}

// ─── warranty_claim ───────────────────────────────────────────

export async function serializeWarrantyClaim(
  supabase: SupabaseClient,
  id: string,
): Promise<SerializedChunk | null> {
  const { data: w } = await supabase
    .from('warranty_claims')
    .select(
      'cl_no, ro_id, vin, customer_id, claim_type, claim_date, status, applied_amount, approved_amount, parts_cost, labor_cost, forecast_receipt_date, actual_receipt_date, oem_reference_no, notes',
    )
    .eq('id', id)
    .maybeSingle();
  if (!w) return null;
  const { data: c } = w.customer_id
    ? await supabase.from('customers').select('name').eq('id', w.customer_id).maybeSingle()
    : { data: null };
  const bits: string[] = [];
  bits.push(`保固索賠 ${w.cl_no ?? '—'}（類別 ${w.claim_type ?? '—'}・狀態 ${w.status ?? '—'}）`);
  if (c?.name) bits.push(`客戶 ${c.name}`);
  if (w.vin) bits.push(`VIN ${w.vin}`);
  if (w.claim_date) bits.push(`申請日 ${w.claim_date}`);
  bits.push(
    `金額：申請 NT$${w.applied_amount ?? 0}${w.approved_amount != null ? ` / 核准 NT$${w.approved_amount}` : ''}`,
  );
  if (w.parts_cost != null || w.labor_cost != null) {
    bits.push(`成本：零件 NT$${w.parts_cost ?? 0}・工資 NT$${w.labor_cost ?? 0}`);
  }
  if (w.forecast_receipt_date) bits.push(`預計入帳 ${w.forecast_receipt_date}`);
  if (w.actual_receipt_date) bits.push(`實際入帳 ${w.actual_receipt_date}`);
  if (w.oem_reference_no) bits.push(`OEM 編號 ${w.oem_reference_no}`);
  if (w.notes?.trim()) bits.push(`備註：${w.notes.trim()}`);
  return {
    content: bits.join('｜'),
    metadata: { claim_no: w.cl_no, customer_id: w.customer_id, status: w.status, vin: w.vin },
  };
}

// ─── parts_warranty_claim ─────────────────────────────────────

export async function serializePartsWarrantyClaim(
  supabase: SupabaseClient,
  id: string,
): Promise<SerializedChunk | null> {
  const { data: p } = await supabase
    .from('parts_warranty_claims')
    .select(
      'claim_no, ro_no, item_label, hours_label, warranty_type, apply_amount, approved_amount, status, status_label, expected_pay_date, submitted_at, approved_at, reimbursed_at, sla_days, notes',
    )
    .eq('id', id)
    .maybeSingle();
  if (!p) return null;
  const bits: string[] = [];
  bits.push(`零件保固索賠 ${p.claim_no ?? '—'}（類別 ${p.warranty_type ?? '—'}・狀態 ${p.status_label ?? p.status ?? '—'}）`);
  if (p.ro_no) bits.push(`對應工單 ${p.ro_no}`);
  if (p.item_label) bits.push(`零件 ${p.item_label}`);
  if (p.hours_label) bits.push(`工時 ${p.hours_label}`);
  bits.push(`金額：申請 NT$${p.apply_amount ?? 0}${p.approved_amount != null ? ` / 核准 NT$${p.approved_amount}` : ''}`);
  if (p.expected_pay_date) bits.push(`預計撥款 ${p.expected_pay_date}`);
  if (p.sla_days) bits.push(`SLA ${p.sla_days} 天`);
  if (p.notes?.trim()) bits.push(`備註：${p.notes.trim()}`);
  return {
    content: bits.join('｜'),
    metadata: { claim_no: p.claim_no, status: p.status, ro_no: p.ro_no },
  };
}

// ─── insurance_policy ─────────────────────────────────────────

export async function serializeInsurancePolicy(
  supabase: SupabaseClient,
  id: string,
): Promise<SerializedChunk | null> {
  const { data: i } = await supabase
    .from('insurance_policies')
    .select(
      'policy_no, insurer, policy_type, customer_id, vehicle_id, start_date, end_date, premium, status, renewal_type, next_action_date, call_count, last_called_at, notes',
    )
    .eq('id', id)
    .maybeSingle();
  if (!i) return null;
  const [{ data: c }, { data: v }] = await Promise.all([
    i.customer_id
      ? supabase.from('customers').select('name, phone').eq('id', i.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    i.vehicle_id
      ? supabase
          .from('customer_vehicles')
          .select('license_plate')
          .eq('id', i.vehicle_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const bits: string[] = [];
  bits.push(`保險單 ${i.policy_no ?? '—'}（${i.insurer ?? ''}・${i.policy_type ?? ''}・狀態 ${i.status ?? '—'}）`);
  if (c) bits.push(`客戶 ${c.name}${c.phone ? `（${c.phone}）` : ''}`);
  if (v?.license_plate) bits.push(`車牌 ${v.license_plate}`);
  if (i.start_date && i.end_date) bits.push(`期間 ${i.start_date} ~ ${i.end_date}`);
  if (i.premium != null) bits.push(`保費 NT$${i.premium}`);
  if (i.renewal_type) bits.push(`續保類型 ${i.renewal_type}`);
  if (i.next_action_date) bits.push(`下次動作 ${i.next_action_date}`);
  if (i.call_count) bits.push(`已電訪 ${i.call_count} 次`);
  if (i.notes?.trim()) bits.push(`備註：${i.notes.trim()}`);
  return {
    content: bits.join('｜'),
    metadata: { policy_no: i.policy_no, customer_id: i.customer_id, status: i.status },
  };
}

// ─── item ─────────────────────────────────────────────────────

export async function serializeItem(
  supabase: SupabaseClient,
  id: string,
): Promise<SerializedChunk | null> {
  const { data: it } = await supabase
    .from('items')
    .select(
      'code, name, name_en, category, control_type, base_uom, spec_description, standard_cost, suggested_price, warranty_months, shelf_life_months, is_active',
    )
    .eq('id', id)
    .maybeSingle();
  if (!it) return null;
  const bits: string[] = [];
  bits.push(`零件 ${it.code ?? '—'}：${it.name ?? '—'}${it.name_en ? `（${it.name_en}）` : ''}`);
  if (it.category) bits.push(`類別 ${it.category}`);
  if (it.control_type) bits.push(`管控 ${it.control_type}`);
  if (it.base_uom) bits.push(`單位 ${it.base_uom}`);
  if (it.standard_cost != null) bits.push(`成本 NT$${it.standard_cost}`);
  if (it.suggested_price != null) bits.push(`建議售價 NT$${it.suggested_price}`);
  if (it.warranty_months) bits.push(`保固 ${it.warranty_months} 個月`);
  if (it.shelf_life_months) bits.push(`效期 ${it.shelf_life_months} 個月`);
  if (it.spec_description?.trim()) bits.push(`規格：${it.spec_description.trim()}`);
  if (it.is_active === false) bits.push(`（已停用）`);
  return {
    content: bits.join('｜'),
    metadata: { code: it.code, category: it.category },
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
