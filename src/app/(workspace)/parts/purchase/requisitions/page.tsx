import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import {
  RequisitionsBoard,
  type RequisitionRow,
  type OrgRef,
  type RequisitionFilters,
} from "./_components/requisitions-board";

export const dynamic = "force-dynamic";

type ReqHead = {
  id: string;
  req_no: string;
  org_id: string | null;
  status: string;
  required_date: string | null;
  notes: string | null;
  approved_at: string | null;
};

type LineHead = {
  req_id: string;
  line_no: number;
  item_id: string;
  qty_required: number | null;
  uom: string | null;
};

type ItemRef = { id: string; code: string; name: string };

async function loadData(filters: RequisitionFilters): Promise<{
  rows: RequisitionRow[];
  totalCount: number;
  orgs: OrgRef[];
}> {
  const supabase = await createClient();
  const brand = getBrandKey();

  let q = supabase
    .from("purchase_requisitions")
    .select("id, req_no, org_id, status, required_date, notes, approved_at")
    .eq("brand_id", brand);

  if (filters.org !== "all") q = q.eq("org_id", filters.org);
  if (filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.q.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    q = q.or(`req_no.ilike.%${t}%,notes.ilike.%${t}%`);
  }

  const [reqRes, orgsRes, totalRes] = await Promise.all([
    q.order("required_date", { ascending: false }).limit(500),
    supabase
      .from("organizations")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("purchase_requisitions")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand),
  ]);

  if (reqRes.error) throw new Error(`requisitions: ${reqRes.error.message}`);

  const reqs = (reqRes.data ?? []) as unknown as ReqHead[];
  const reqIds = reqs.map((r) => r.id);

  // 撈每張單的 line_no=1（demo 一張單對應一行；如後續多 line 此處只取首行做 list 顯示）
  let lines: LineHead[] = [];
  if (reqIds.length > 0) {
    const { data: lineData } = await supabase
      .from("purchase_requisition_lines")
      .select("req_id, line_no, item_id, qty_required, uom")
      .eq("brand_id", brand)
      .eq("line_no", 1)
      .in("req_id", reqIds);
    lines = (lineData ?? []) as unknown as LineHead[];
  }

  const itemIds = Array.from(new Set(lines.map((l) => l.item_id)));
  let items: ItemRef[] = [];
  if (itemIds.length > 0) {
    const { data: itemData } = await supabase
      .from("items")
      .select("id, code, name")
      .in("id", itemIds);
    items = (itemData ?? []) as unknown as ItemRef[];
  }
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const lineMap = new Map(lines.map((l) => [l.req_id, l]));

  const rows: RequisitionRow[] = reqs.map((r) => {
    const l = lineMap.get(r.id);
    const it = l ? itemMap.get(l.item_id) : null;
    return {
      id: r.id,
      req_no: r.req_no,
      org_id: r.org_id,
      status: r.status,
      required_date: r.required_date,
      notes: r.notes,
      approved_at: r.approved_at,
      item_code: it?.code ?? null,
      item_name: it?.name ?? null,
      qty_required: l?.qty_required != null ? Number(l.qty_required) : null,
      uom: l?.uom ?? null,
    };
  });

  return {
    rows,
    totalCount: totalRes.count ?? 0,
    orgs: (orgsRes.data ?? []) as unknown as OrgRef[],
  };
}

export default async function RequisitionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.PR_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視需求處理的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.PR_CREATE);
  const canApprove = await hasPermission(PERMISSIONS.PR_APPROVE);

  const sp = await searchParams;
  const filters: RequisitionFilters = {
    org: sp.org ?? "all",
    status: sp.status ?? "all",
    q: sp.q ?? "",
  };

  const { rows, totalCount, orgs } = await loadData(filters);

  return (
    <RequisitionsBoard
      rows={rows}
      totalCount={totalCount}
      orgs={orgs}
      canEdit={canEdit}
      canApprove={canApprove}
      filters={filters}
    />
  );
}
