/**
 * 簽核欄 — 底部固定 N 個簽名格，傳角色名稱即可。
 * `keep-together` 防止簽核欄被印表機分頁切斷。
 */
export function PrintSignatures({ roles }: { roles: string[] }) {
  return (
    <section className="print-signatures keep-together">
      {roles.map((r, i) => (
        <div key={i} className="print-signature-cell">
          <div className="print-signature-line" />
          <div className="print-signature-label">{r}</div>
        </div>
      ))}
    </section>
  );
}
