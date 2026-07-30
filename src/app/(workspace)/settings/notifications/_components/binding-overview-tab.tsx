"use client";

/**
 * Tab 二：LINE 綁定總覽 — 唯讀。
 *
 * 角色路由能不能發得出去，取決於「擔任該職位的員工有沒有綁 LINE」，
 * 這個分頁讓管理員一眼看出誰還沒綁，好去催他跑 /me/profile 綁定流程。
 * 純顯示、不寫任何資料。
 */

export interface EmployeeBindRowView {
  id: string;
  name: string;
  roleCodes: string[];
  roleLabels: string[];
  bound: boolean;
  boundAt: string | null;
  notifyEnabled: boolean;
}

export function BindingOverviewTab({ employees }: { employees: EmployeeBindRowView[] }) {
  const unboundCount = employees.filter((e) => !e.bound).length;

  return (
    <div className="space-y-3">
      {unboundCount === 0 ? (
        <div className="rounded-lg border border-[#C5DC9F] bg-[#EAF3DE] px-4 py-2.5 text-[12.5px] text-[#3B6D11]">
          ✓ 全部已綁定
        </div>
      ) : (
        <div className="rounded-lg border border-[#F5AEAD] bg-[#FDECEA] px-4 py-2.5 text-[12.5px] text-[#CC0000]">
          ⚠️ 有 {unboundCount} 位員工尚未綁定 LINE，這些人如果剛好職位對應到某個通知事件，會收不到通知。
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-[#EEECE6] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#F8F7F4] text-[11px] text-[#9A9890]">
              <tr>
                <th className="px-4 py-2 text-left font-medium">姓名</th>
                <th className="px-4 py-2 text-left font-medium">職位</th>
                <th className="px-4 py-2 text-left font-medium">LINE 綁定狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEECE6]">
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-[12.5px] text-[#9A9890]">
                    目前品牌下沒有在職員工資料
                  </td>
                </tr>
              ) : (
                employees.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2.5 align-top font-medium text-[#2C2C2A]">{e.name}</td>
                    <td className="px-4 py-2.5 align-top text-[#5A5955]">
                      {e.roleLabels.length > 0 ? (
                        e.roleLabels.join("、")
                      ) : (
                        <span className="text-[#9A9890]">（未設定職位）</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      {e.bound ? (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-[#EAF3DE] px-1.5 py-0.5 text-[11px] text-[#3B6D11]">
                          ✓ 已綁定{e.boundAt && <span className="text-[#5A5955]">・{formatDate(e.boundAt)}</span>}
                        </span>
                      ) : (
                        <span className="inline-flex items-center whitespace-nowrap rounded-md bg-[#FDECEA] px-1.5 py-0.5 text-[11px] font-medium text-[#CC0000]">
                          未綁定
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // CLAUDE.md 慣例：時間存 UTC、顯示轉 Asia/Taipei，固定 timeZone 避免 server/client 算出不同字串
  return d.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
