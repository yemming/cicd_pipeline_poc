import { redirect } from "next/navigation";

/**
 * 舊版 CSI 滿意度 stub 頁面。
 *
 * P1-γ (2026-05-18)：原本是 Stitch HTML（screen a17fb6da...），但問卷模板
 * 真實列表已在第七輪 P1-#5 完成於 /crm/sales/survey-templates；CSI 模組
 * 跟 CRM 行銷模組共用同一份 survey_templates 資料，這條 URL 就 redirect
 * 過去，避免兩份畫面分歧。
 */
export default function CsiSurveysLegacyRedirect(): never {
  redirect("/crm/sales/survey-templates");
}
