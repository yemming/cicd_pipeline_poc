import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentBrand } from "@/lib/brands/current";

export const dynamic = "force-dynamic";

function maskKey(value: string | undefined): string {
  if (!value) return "（未設定）";
  if (value.length <= 4) return "*".repeat(value.length);
  return value.slice(0, 2) + "*".repeat(value.length - 4) + value.slice(-2);
}

export default async function EInvoiceSettingsPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.EINVOICE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視電子發票的權限</p>
      </main>
    );
  }

  const canSettings = await hasPermission(PERMISSIONS.EINVOICE_SETTINGS);
  const brand = getCurrentBrand();
  const env = process.env.ECPAY_ENV === "prod" ? "prod" : "test";

  // 安全顯示：HashKey/HashIV 加密 mask（即使是 admin，也是 mask 過的）
  const merchantId = process.env.ECPAY_INVOICE_MERCHANT_ID ?? "2000132";
  const hashKey    = process.env.ECPAY_INVOICE_HASH_KEY    ?? "ejCk326UnaZWKisg";
  const hashIV     = process.env.ECPAY_INVOICE_HASH_IV     ?? "q9jcZX8Ib9LM8wYk";
  const usingDefault = !process.env.ECPAY_INVOICE_MERCHANT_ID;

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">發票設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Sprint 0
        </span>
        <span className="text-[12px] text-[#9A9890]">當前 brand: {brand.displayName}</span>
      </header>

      {usingDefault && (
        <div className="px-3 py-2 rounded bg-[#FDF3E3] border border-amber-300 text-[#854F0B] text-[12.5px]">
          ⚠ 目前使用綠界**測試帳號**（公開共用，請勿用於正式營運）。上線前請於 Zeabur / .env 設置正式
          <code className="font-mono mx-1">ECPAY_INVOICE_MERCHANT_ID</code>
          / <code className="font-mono">ECPAY_INVOICE_HASH_KEY</code>
          / <code className="font-mono">ECPAY_INVOICE_HASH_IV</code>。
        </div>
      )}

      {/* 環境 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 綠界環境</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <Kv label="當前環境" value={
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${
              env === "prod" ? "bg-[#FDECEA] text-[#CC0000]" : "bg-[#EAF4FB] text-[#185FA5]"
            }`}>
              {env === "prod" ? "PROD（正式）" : "STAGE（測試）"}
            </span>
          } />
          <Kv label="API 端點"
              mono
              value={env === "prod" ? "einvoice.ecpay.com.tw" : "einvoice-stage.ecpay.com.tw"} />
          <Kv label="切換方式"
              small
              value={
                <code className="font-mono text-[11.5px]">
                  ECPAY_ENV=prod npm run start
                </code>
              } />
          <Kv label="憑證來源"
              small
              value={usingDefault ? "硬編碼測試 fallback" : ".env / Zeabur 環境變數"} />
        </div>
      </section>

      {/* 綠界帳號 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 發票特店帳號（B2C / B2B 共用）</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <Kv label="MerchantID" mono value={merchantId} />
          <Kv label="HashKey"   mono value={canSettings ? maskKey(hashKey) : "*****（無權限）"} />
          <Kv label="HashIV"    mono value={canSettings ? maskKey(hashIV)  : "*****（無權限）"} />
          <Kv label="加密方式"   small value="AES-128-CBC + URL-encode（PKCS7 padding）" />
          <Kv label="Revision"  small value="B2C: 3.0.0 / B2B: 1.0.0" />
        </div>
        {!canSettings && (
          <div className="px-4 py-2 bg-[#F8F7F4] text-[11px] text-[#9A9890] border-t border-[#EEECE6]">
            ⓘ HashKey / HashIV 完整內容僅 admin（einvoice.settings 權限）可見
          </div>
        )}
      </section>

      {/* 賣方資訊 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 預設賣方資訊（會印在發票備註）</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <Kv label="賣方名稱"   value={brand.ecpayDefaults.senderName} />
          <Kv label="賣方電話"   mono value={brand.ecpayDefaults.senderPhone} />
          <Kv label="賣方郵遞區號" mono value={brand.ecpayDefaults.senderZip} />
          <Kv label="賣方地址"   value={brand.ecpayDefaults.senderAddress} />
          <Kv label="發票備註"   small value={brand.ecpayDefaults.invoiceRemark} />
        </div>
        <div className="px-4 py-2 bg-[#F8F7F4] text-[11px] text-[#9A9890] border-t border-[#EEECE6]">
          ⓘ 賣方資訊定義在 <code className="font-mono">src/lib/brands/{brand.key}.ts</code>，編輯後重新部署生效
        </div>
      </section>

      {!isAdmin && (
        <div className="text-[11px] text-[#9A9890] py-2">
          ⓘ 此頁部分操作僅 app admin 可執行
        </div>
      )}
    </main>
  );
}

function Kv({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className={`${mono ? "font-mono" : ""} ${small ? "text-[11.5px] text-[#5A5955]" : "text-[12.5px] text-[#2C2C2A]"}`}>
        {value}
      </div>
    </div>
  );
}
