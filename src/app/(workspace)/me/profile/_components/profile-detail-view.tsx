"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  removeAvatarAction,
  updateAppearanceAction,
  updatePasswordAction,
  updatePreferencesAction,
  updateProfileBasicAction,
  uploadAvatarAction,
} from "@/lib/profile-actions";
import {
  generateMyLineBindCode,
  getMyLineBindStatus,
  setMyLineNotifyEnabled,
  unbindMyLine,
  type LineBindStatus,
} from "@/domain/line-binding";
import type { BrandPalette } from "@/lib/brands/brand-palettes";
import type { SidebarTheme } from "@/lib/brands/sidebar-themes";
import { BadgeCropperModal } from "@/app/(workspace)/admin/navigation/_components/badge-cropper-modal";

export type ProfileRow = {
  id: string;
  name: string | null;
  address: string | null;
  avatar_url: string | null;
  avatar_path: string | null;
  preferred_palette_key: string | null;
  preferred_custom_palette: { primary?: string; accent?: string } | null;
  preferred_sidebar_theme_key: string | null;
  default_landing_path: string | null;
  default_brand_id: string | null;
  updated_at: string | null;
};

type AccessibleBrand = { key: string; name: string };

type Banner = { ok: boolean; msg: string } | null;

type TabKey = "basic" | "appearance" | "notifications" | "security" | "preferences";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "basic", label: "基本資料", icon: "person" },
  { key: "appearance", label: "外觀偏好", icon: "palette" },
  { key: "notifications", label: "通知", icon: "notifications" },
  { key: "security", label: "安全", icon: "lock" },
  { key: "preferences", label: "其他偏好", icon: "tune" },
];

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] w-full";
const textareaClass =
  "min-h-[64px] border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] bg-white outline-none focus:border-[#185FA5] w-full";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return "—";
  }
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function ProfileDetailView({
  profile,
  email,
  palettes,
  sidebarThemes,
  accessibleBrands,
}: {
  profile: ProfileRow;
  email: string | null;
  palettes: BrandPalette[];
  sidebarThemes: SidebarTheme[];
  accessibleBrands: AccessibleBrand[];
}) {
  const [banner, setBanner] = useState<Banner>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("basic");

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/dashboard" className="hover:text-[#185FA5]">首頁</Link>
          <span>›</span>
          <span className="text-[#5A5955]">個人設定</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/dashboard"
            className="h-[30px] inline-flex items-center justify-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回首頁
          </Link>
        </div>
      </div>

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">個人帳號</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {profile.name ?? "（尚未填寫姓名）"}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                {email ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EAF4FB] text-[#185FA5]">
                    {email}
                  </span>
                ) : null}
                <span className="font-mono text-[10.5px] text-[#9A9890]" title="使用者 ID">
                  {profile.id.slice(0, 8)}…
                </span>
              </div>
            </div>
            <div className="mt-auto text-[11px] text-[#9A9890]">
              最後更新：{fmtDateTime(profile.updated_at)}
            </div>
          </div>
          <AvatarUploader
            avatarUrl={profile.avatar_url}
            name={profile.name}
            showBanner={showBanner}
          />
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto" id="tab-content">
        <div className="flex border-b border-[#EEECE6]">
          {TABS.map((t) => {
            const active = t.key === activeTab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] last:border-r-0 ${
                  active
                    ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                    : "text-[#5A5955] hover:bg-[#F8F7F4]"
                }`}
              >
                <span className="material-symbols-outlined text-[16px] leading-none">{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
        {activeTab === "basic" && (
          <BasicTab profile={profile} email={email} showBanner={showBanner} />
        )}
        {activeTab === "appearance" && (
          <AppearanceTab
            profile={profile}
            palettes={palettes}
            sidebarThemes={sidebarThemes}
            showBanner={showBanner}
          />
        )}
        {activeTab === "notifications" && <NotificationsTab />}
        {activeTab === "security" && <SecurityTab showBanner={showBanner} />}
        {activeTab === "preferences" && (
          <PreferencesTab
            profile={profile}
            accessibleBrands={accessibleBrands}
            showBanner={showBanner}
          />
        )}
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────
// Avatar uploader（取代 design pattern 的 image 框位置）
// ──────────────────────────────────────────────────────────

function AvatarUploader({
  avatarUrl,
  name,
  showBanner,
}: {
  avatarUrl: string | null;
  name: string | null;
  showBanner: (b: Banner) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [previewBust, setPreviewBust] = useState(0);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const trigger = () => fileRef.current?.click();

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      showBanner({ ok: false, msg: "僅接受圖片檔（JPG / PNG / WebP / GIF）" });
      e.target.value = "";
      return;
    }
    setPendingFile(f);
    e.target.value = "";
  };

  const onCropCancel = () => {
    if (!isPending) setPendingFile(null);
  };

  const onCropConfirm = (cropped: File) => {
    const fd = new FormData();
    fd.append("file", cropped);
    startTransition(async () => {
      const res = await uploadAvatarAction(fd);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已更新大頭貼" });
        setPendingFile(null);
        setPreviewBust(Date.now());
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const remove = () => {
    if (!confirm("確定移除大頭貼？")) return;
    startTransition(async () => {
      const res = await removeAvatarAction();
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已移除大頭貼" });
        setPreviewBust(Date.now());
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const displayUrl = avatarUrl
    ? previewBust
      ? `${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}_=${previewBust}`
      : avatarUrl
    : null;

  return (
    <div className="shrink-0 flex flex-col items-stretch gap-1.5" style={{ width: 140 }}>
      <div
        className="relative group rounded-lg border border-[#D5D3CB] bg-[#F8F7F4] flex items-center justify-center overflow-hidden"
        style={{ width: 140, height: 140 }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={onPick}
        />
        {displayUrl ? (
          <Image
            src={displayUrl}
            alt={name ?? "大頭貼"}
            width={140}
            height={140}
            unoptimized
            className="w-full h-full object-cover block"
          />
        ) : (
          <button
            type="button"
            disabled={isPending}
            onClick={trigger}
            className="w-full h-full flex flex-col items-center justify-center text-[#9A9890] hover:text-[#0F6E56] hover:bg-white disabled:opacity-50"
          >
            <div className="w-14 h-14 rounded-full bg-[#0F6E56] text-white flex items-center justify-center text-[20px] font-bold font-display mb-2">
              {getInitials(name)}
            </div>
            <div className="text-[11px]">{isPending ? "上傳中…" : "點擊上傳"}</div>
            <div className="text-[10px] mt-0.5 text-[#B8B6AE]">JPG/PNG/WebP，5MB</div>
          </button>
        )}

        {displayUrl ? (
          <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-1.5">
            <button
              type="button"
              onClick={trigger}
              disabled={isPending}
              className="h-[26px] px-3 rounded-full text-[11px] bg-white text-[#1A3A5C] disabled:opacity-60"
            >
              {isPending ? "處理中…" : "更換圖片"}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={isPending}
              className="h-[26px] px-3 rounded-full text-[11px] bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD] disabled:opacity-60"
            >
              移除
            </button>
          </div>
        ) : null}
      </div>

      <BadgeCropperModal
        file={pendingFile}
        pending={isPending}
        onCancel={onCropCancel}
        onConfirm={onCropConfirm}
        title="調整大頭貼"
        description="拖曳移動、滑鼠滾輪縮放、選擇比例 — 大頭貼建議用 1:1 方形，最不會被切。"
        defaultRatio={1}
        previewLabel="大頭貼預覽"
        ratioHint="大頭貼會以方形顯示在頂部右上角，建議用 1:1 方形比例。"
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Tab 1：基本資料（姓名、email、地址）
// ──────────────────────────────────────────────────────────

function BasicTab({
  profile,
  email,
  showBanner,
}: {
  profile: ProfileRow;
  email: string | null;
  showBanner: (b: Banner) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(profile.name ?? "");
  const [address, setAddress] = useState(profile.address ?? "");

  const dirty = name.trim() !== (profile.name ?? "") || address.trim() !== (profile.address ?? "");

  const save = () => {
    startTransition(async () => {
      const res = await updateProfileBasicAction({ name, address });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存基本資料" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const reset = () => {
    setName(profile.name ?? "");
    setAddress(profile.address ?? "");
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  return (
    <div className={lockedClass}>
      <SectionCard title="個人資訊">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>登錄人姓名 *</label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="您的姓名"
              maxLength={80}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>電子郵件（已綁定，不可修改）</label>
            <input
              className={`${inputClass} bg-[#F8F7F4] cursor-not-allowed text-[#5A5955]`}
              value={email ?? ""}
              readOnly
            />
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <label className={labelClass}>地址</label>
            <textarea
              className={textareaClass}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="例：台北市信義區松仁路 100 號 8 樓"
              maxLength={240}
              rows={2}
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 justify-end">
          <button
            type="button"
            onClick={reset}
            disabled={isPending || !dirty}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-40"
          >
            還原
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isPending || !dirty}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            {isPending ? "儲存中⋯" : "儲存基本資料"}
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Tab 2：外觀偏好（palette + custom hex + sidebar 主題）
// ──────────────────────────────────────────────────────────

function AppearanceTab({
  profile,
  palettes,
  sidebarThemes,
  showBanner,
}: {
  profile: ProfileRow;
  palettes: BrandPalette[];
  sidebarThemes: SidebarTheme[];
  showBanner: (b: Banner) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // null = follow brand default；"custom" = 自訂；其他 = preset key
  const [paletteKey, setPaletteKey] = useState<string>(
    profile.preferred_palette_key ?? "__follow__",
  );
  const [customPrimary, setCustomPrimary] = useState(
    profile.preferred_custom_palette?.primary ?? "#CC0000",
  );
  const [customAccent, setCustomAccent] = useState(
    profile.preferred_custom_palette?.accent ?? "#1A1A2E",
  );
  const [sidebarKey, setSidebarKey] = useState<string>(
    profile.preferred_sidebar_theme_key ?? "__follow__",
  );

  const apply = () => {
    startTransition(async () => {
      const res = await updateAppearanceAction({
        preferred_palette_key: paletteKey === "__follow__" ? null : paletteKey,
        preferred_custom_palette:
          paletteKey === "custom"
            ? { primary: customPrimary, accent: customAccent }
            : null,
        preferred_sidebar_theme_key: sidebarKey === "__follow__" ? null : sidebarKey,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已套用外觀偏好" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  return (
    <div className={`${lockedClass} grid grid-cols-1 md:grid-cols-2 gap-3`}>
      <SectionCard title="主題色（喜好顏色）">
        <div className="flex flex-col gap-2">
          <label className={labelClass}>主色方案</label>
          <select
            className={inputClass}
            value={paletteKey}
            onChange={(e) => setPaletteKey(e.target.value)}
          >
            <option value="__follow__">▸ 跟著品牌預設</option>
            {palettes.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name} — {p.description}
              </option>
            ))}
            <option value="custom">自訂兩個 hex…</option>
          </select>

          {/* preset 預覽色塊 */}
          {paletteKey !== "__follow__" && paletteKey !== "custom" ? (
            <PalettePreview palette={palettes.find((p) => p.key === paletteKey)} />
          ) : null}

          {paletteKey === "custom" ? (
            <div className="grid grid-cols-2 gap-3 mt-1">
              <div className="flex flex-col gap-1">
                <label className={labelClass}>主色 primary</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customPrimary}
                    onChange={(e) => setCustomPrimary(e.target.value.toUpperCase())}
                    className="w-[40px] h-[30px] border border-[#D5D3CB] rounded p-0.5 cursor-pointer"
                  />
                  <input
                    className={`${inputClass} font-mono`}
                    value={customPrimary}
                    onChange={(e) => setCustomPrimary(e.target.value)}
                    placeholder="#RRGGBB"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>強調色 accent</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customAccent}
                    onChange={(e) => setCustomAccent(e.target.value.toUpperCase())}
                    className="w-[40px] h-[30px] border border-[#D5D3CB] rounded p-0.5 cursor-pointer"
                  />
                  <input
                    className={`${inputClass} font-mono`}
                    value={customAccent}
                    onChange={(e) => setCustomAccent(e.target.value)}
                    placeholder="#RRGGBB"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Sidebar 風格">
        <div className="flex flex-col gap-2">
          <label className={labelClass}>左側導航 9 套主題</label>
          <select
            className={inputClass}
            value={sidebarKey}
            onChange={(e) => setSidebarKey(e.target.value)}
          >
            <option value="__follow__">▸ 跟著品牌預設</option>
            {sidebarThemes.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}（{t.variant === "dark" ? "深色" : "淺色"}）— {t.description}
              </option>
            ))}
          </select>

          {sidebarKey !== "__follow__" ? (
            <SidebarPreview theme={sidebarThemes.find((t) => t.key === sidebarKey)} />
          ) : null}
        </div>
      </SectionCard>

      <div className="md:col-span-2 flex items-center justify-end gap-2">
        <span className="text-[11px] text-[#9A9890] mr-auto">
          套用後整個工作區會立刻反映新顏色與主題；可隨時改回「跟著品牌預設」。
        </span>
        <button
          type="button"
          onClick={apply}
          disabled={isPending}
          className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
        >
          {isPending ? "套用中⋯" : "套用外觀偏好"}
        </button>
      </div>
    </div>
  );
}

function PalettePreview({ palette }: { palette: BrandPalette | undefined }) {
  if (!palette) return null;
  return (
    <div className="flex items-center gap-2 mt-1">
      <div
        className="w-10 h-6 rounded border border-[#D5D3CB]"
        style={{ backgroundColor: palette.primary }}
        title={`primary ${palette.primary}`}
      />
      <div
        className="w-10 h-6 rounded border border-[#D5D3CB]"
        style={{ backgroundColor: palette.accent }}
        title={`accent ${palette.accent}`}
      />
      <span className="text-[11px] font-mono text-[#9A9890]">
        {palette.primary} / {palette.accent}
      </span>
    </div>
  );
}

function SidebarPreview({ theme }: { theme: SidebarTheme | undefined }) {
  if (!theme) return null;
  return (
    <div className="mt-1 rounded border border-[#D5D3CB] overflow-hidden text-[11px]">
      <div className="flex">
        <div className="w-10 py-3 flex items-center justify-center" style={{ backgroundColor: theme.rail, color: theme.text }}>
          <span className="material-symbols-outlined text-[14px]">apps</span>
        </div>
        <div className="flex-1 py-2 px-3" style={{ backgroundColor: theme.panel, color: theme.text }}>
          <div>主畫面</div>
          <div style={{ color: theme.textMuted }} className="text-[10px]">設定 / 統計 / 報表</div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Tab 3：通知（連到 admin/notifications）
// ──────────────────────────────────────────────────────────

function NotificationsTab() {
  const [status, setStatus] = useState<LineBindStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getMyLineBindStatus();
        if (!cancelled) setStatus(s);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "載入失敗，請重新整理頁面");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <SectionCard title="LINE 通知綁定">
        <div className="space-y-2 animate-pulse">
          <div className="h-4 w-24 bg-[#EEECE6] rounded" />
          <div className="h-3 w-56 bg-[#EEECE6] rounded" />
          <div className="h-[30px] w-28 bg-[#EEECE6] rounded" />
        </div>
      </SectionCard>
    );
  }

  if (loadError || !status) {
    return (
      <SectionCard title="LINE 通知綁定">
        <p className="text-[12.5px] text-[#CC0000]">{loadError ?? "載入失敗，請重新整理頁面"}</p>
      </SectionCard>
    );
  }

  if (!status.employeeId) {
    return (
      <SectionCard title="LINE 通知綁定">
        <p className="text-[12.5px] text-[#5A5955] leading-relaxed">
          此帳號未對應到任何員工資料，無法綁定 LINE 通知。如果你認為這是設定錯誤，請聯絡系統管理員確認你的帳號是否已建立員工記錄並綁定
          user_id。
        </p>
      </SectionCard>
    );
  }

  return status.bound ? <BoundLineSection status={status} /> : <UnboundLineSection />;
}

function UnboundLineSection() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = () => {
    setError(null);
    startTransition(async () => {
      const res = await generateMyLineBindCode();
      if (res.ok) {
        setResult({ code: res.code, expiresAt: res.expiresAt });
      } else {
        setError(res.error);
      }
    });
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("複製失敗，請手動選取代碼");
    }
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  return (
    <SectionCard title="LINE 通知綁定">
      <div className={lockedClass}>
        <div className="mb-3">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#F2F2F2] text-[#6B6A68]">
            尚未綁定
          </span>
        </div>

        {error ? <p className="text-[12.5px] text-[#CC0000] mb-2">{error}</p> : null}

        {!result ? (
          <button
            type="button"
            onClick={generate}
            disabled={isPending}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            {isPending ? "產生中⋯" : "產生綁定碼"}
          </button>
        ) : (
          <div className="space-y-3">
            <ol className="text-[12.5px] text-[#5A5955] leading-relaxed list-decimal pl-4 space-y-1.5">
              <li>
                加「DealerOS Notifier」LINE 官方帳號為好友（還沒加的話，請洽系統管理員取得加好友方式）
              </li>
              <li>
                把下面這組代碼傳送給它：
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="h-[30px] inline-flex items-center px-3 rounded bg-[#F8F7F4] border border-[#D5D3CB] font-mono text-[13px] font-semibold text-[#1A3A5C]">
                    {result.code}
                  </code>
                  <button
                    type="button"
                    onClick={copy}
                    className="h-[30px] px-3 rounded text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                  >
                    {copied ? "已複製" : "複製"}
                  </button>
                </div>
              </li>
              <li>收到「綁定成功」的回覆訊息後，回來這個頁面重新整理即可看到已綁定狀態</li>
            </ol>
            <p className="text-[11px] text-[#9A9890]">
              這組代碼 10 分鐘內有效（{fmtDateTime(result.expiresAt)} 前），過期請重新產生一組。
            </p>
            <button
              type="button"
              onClick={generate}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              {isPending ? "產生中⋯" : "重新產生綁定碼"}
            </button>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function BoundLineSection({ status }: { status: LineBindStatus }) {
  const [isPending, startTransition] = useTransition();
  const [notifyEnabled, setNotifyEnabled] = useState(status.notifyEnabled);
  const [unbound, setUnbound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleNotify = () => {
    setError(null);
    const next = !notifyEnabled;
    startTransition(async () => {
      const res = await setMyLineNotifyEnabled(next);
      if (res.ok) {
        setNotifyEnabled(next);
      } else {
        setError(res.error);
      }
    });
  };

  const doUnbind = () => {
    if (!window.confirm("確定要解除 LINE 通知綁定？解除後將不再收到個人 LINE 通知。")) return;
    setError(null);
    startTransition(async () => {
      const res = await unbindMyLine();
      if (res.ok) {
        setUnbound(true);
      } else {
        setError(res.error);
      }
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  if (unbound) {
    return (
      <SectionCard title="LINE 通知綁定">
        <p className="text-[12.5px] text-[#5A5955]">
          已解除綁定。重新整理頁面可看到最新狀態，或直接點下方「產生綁定碼」重新綁定。
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="LINE 通知綁定">
      <div className={lockedClass}>
        <div className="mb-1">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EAF3DE] text-[#3B6D11]">
            <span className="material-symbols-outlined text-[13px] leading-none">check_circle</span>
            已綁定
          </span>
        </div>
        <div className="text-[11.5px] text-[#9A9890] mb-3">綁定時間：{fmtDateTime(status.boundAt)}</div>

        {error ? <p className="text-[12.5px] text-[#CC0000] mb-2">{error}</p> : null}

        <div className="flex items-center gap-3 mb-3">
          <label className="flex items-center gap-2 text-[12.5px] text-[#2C2C2A] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={notifyEnabled}
              disabled={isPending}
              onChange={toggleNotify}
              className="w-[16px] h-[16px] accent-[#0F6E56]"
            />
            接收通知
          </label>
          {isPending ? <span className="text-[11px] text-[#9A9890]">處理中⋯</span> : null}
        </div>

        <button
          type="button"
          onClick={doUnbind}
          disabled={isPending}
          className="h-[30px] px-3.5 rounded text-[12.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
        >
          {isPending ? "處理中⋯" : "解除綁定"}
        </button>
      </div>
    </SectionCard>
  );
}

// ──────────────────────────────────────────────────────────
// Tab 4：安全（修改密碼）
// ──────────────────────────────────────────────────────────

function SecurityTab({ showBanner }: { showBanner: (b: Banner) => void }) {
  const [isPending, startTransition] = useTransition();
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");

  const ready = pwd.length >= 8 && pwd === confirm;

  const submit = () => {
    startTransition(async () => {
      const res = await updatePasswordAction({ newPassword: pwd, confirm });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已更新密碼" });
        setPwd("");
        setConfirm("");
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  return (
    <div className={lockedClass}>
      <SectionCard title="修改密碼">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>新密碼</label>
            <input
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="至少 8 個字元"
            />
            {pwd && pwd.length < 8 ? (
              <div className="text-[11px] text-[#CC0000]">密碼至少 8 個字元</div>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>確認新密碼</label>
            <input
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="再輸入一次"
            />
            {confirm && pwd !== confirm ? (
              <div className="text-[11px] text-[#CC0000]">兩次輸入不一致</div>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={isPending || !ready}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
          >
            {isPending ? "更新中⋯" : "更新密碼"}
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Tab 5：其他偏好（landing path + default brand）
// ──────────────────────────────────────────────────────────

function PreferencesTab({
  profile,
  accessibleBrands,
  showBanner,
}: {
  profile: ProfileRow;
  accessibleBrands: AccessibleBrand[];
  showBanner: (b: Banner) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [landing, setLanding] = useState(profile.default_landing_path ?? "");
  const [brand, setBrand] = useState(profile.default_brand_id ?? "");

  const dirty =
    landing.trim() !== (profile.default_landing_path ?? "") ||
    brand !== (profile.default_brand_id ?? "");

  const save = () => {
    startTransition(async () => {
      const res = await updatePreferencesAction({
        default_landing_path: landing,
        default_brand_id: brand,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存偏好" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";
  const showBrandSelect = accessibleBrands.length > 1;

  return (
    <div className={lockedClass}>
      <SectionCard title="登入後預設行為">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>預設首頁路徑</label>
            <input
              className={`${inputClass} font-mono`}
              value={landing}
              onChange={(e) => setLanding(e.target.value)}
              placeholder="/dashboard"
            />
            <div className="text-[10.5px] text-[#9A9890]">
              留空 = 預設 /dashboard。例：/feedback/tickets、/parts/setup/items
            </div>
          </div>
          {showBrandSelect ? (
            <div className="flex flex-col gap-1">
              <label className={labelClass}>預設 active brand</label>
              <select
                className={inputClass}
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              >
                <option value="">▸ 用第一個能存取的品牌</option>
                {accessibleBrands.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.name}（{b.key}）
                  </option>
                ))}
              </select>
              <div className="text-[10.5px] text-[#9A9890]">
                您能存取 {accessibleBrands.length} 個品牌；切換不會跳出登入。
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <label className={labelClass}>預設 active brand</label>
              <input
                className={`${inputClass} bg-[#F8F7F4] text-[#9A9890]`}
                value={accessibleBrands[0]?.name ?? "（無存取權的品牌）"}
                readOnly
              />
              <div className="text-[10.5px] text-[#9A9890]">
                您只能存取單一品牌，不需要設定預設。
              </div>
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={save}
            disabled={isPending || !dirty}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            {isPending ? "儲存中⋯" : "儲存偏好"}
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 共用 SectionCard
// ──────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">▼ {title}</h2>
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}
