/**
 * Constants & Types — RP8 今日待辦（純 client-safe）
 *
 * 分離自 my-todos.ts（"use server"），讓 API route + client component 可直接 import。
 */

export type TodoKind =
  | "pending_approval_decision"   // 主管：待我核准
  | "pending_approval_requested"  // SA：我送審等主管
  | "ro_rework"                   // 技師：退回重工
  | "ro_parts_waiting"            // 倉管：待料
  | "ro_checkout_pending"         // SA：待結帳
  | "ro_inprogress";              // 技師：進行中（一般提醒）

export type TodoItem = {
  id: string;
  kind: TodoKind;
  title: string;
  body: string;
  href?: string;
  priority: "red" | "orange" | "grey";
  ro_code?: string;
  ro_id?: string;
  created_at?: string;
};
