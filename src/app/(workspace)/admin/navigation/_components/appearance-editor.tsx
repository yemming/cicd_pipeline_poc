"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SIDEBAR_THEMES, type SidebarTheme } from "@/lib/brands/sidebar-themes";
import {
  BRAND_PALETTES,
  darken,
  isValidHex,
  type BrandPalette,
} from "@/lib/brands/brand-palettes";
import {
  removeBrandBadge,
  updateBrandAppearance,
  uploadBrandBadge,
} from "@/lib/appearance-actions";
import { BadgeCropperModal } from "./badge-cropper-modal";

export type AppearanceProps = {
  brandKey: string;
  brandName: string;
  initial: {
    dashboard_tagline: string;
    footer_badge_url: string | null;
    sidebar_theme: string;
    brand_palette: string;
    custom_palette: { primary?: string; accent?: string } | null;
  };
};

export function AppearanceEditor({ brandKey, brandName, initial }: AppearanceProps) {
  const router = useRouter();
  const [savePending, startSave] = useTransition();
  const [uploadPending, startUpload] = useTransition();
  const [removePending, startRemove] = useTransition();

  const [tagline, setTagline] = useState(initial.dashboard_tagline);
  const [themeKey, setThemeKey] = useState(initial.sidebar_theme);
  const [paletteKey, setPaletteKey] = useState(initial.brand_palette);
  const [customPrimary, setCustomPrimary] = useState(
    initial.custom_palette?.primary ?? "#CC0000",
  );
  const [customAccent, setCustomAccent] = useState(
    initial.custom_palette?.accent ?? "#1A1A2E",
  );
  const [badgeUrl, setBadgeUrl] = useState(initial.footer_badge_url);

  // 選好原檔後丟給 cropper modal；modal confirm 後才真上傳
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialCustomPrimary = initial.custom_palette?.primary ?? "#CC0000";
  const initialCustomAccent = initial.custom_palette?.accent ?? "#1A1A2E";
  const customDirty =
    paletteKey === "custom" &&
    (customPrimary !== initialCustomPrimary || customAccent !== initialCustomAccent);

  const dirty =
    tagline !== initial.dashboard_tagline ||
    themeKey !== initial.sidebar_theme ||
    paletteKey !== initial.brand_palette ||
    customDirty;

  const customValid =
    paletteKey !== "custom" || (isValidHex(customPrimary) && isValidHex(customAccent));

  const handleSave = () => {
    if (!customValid) {
      alert("自訂主顏色：請填合法 #RRGGBB hex 值");
      return;
    }
    const fd = new FormData();
    fd.set("dashboard_tagline", tagline);
    fd.set("sidebar_theme", themeKey);
    fd.set("brand_palette", paletteKey);
    if (paletteKey === "custom") {
      fd.set("custom_primary", customPrimary);
      fd.set("custom_accent", customAccent);
    }
    startSave(async () => {
      try {
        await updateBrandAppearance(fd);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    });
  };

  // 第一段：選檔 → 開 cropper modal
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
  };

  const handleCancelCrop = () => {
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 第二段：cropper confirm → 真正打 server action 上傳
  const handleConfirmCrop = (croppedFile: File) => {
    const fd = new FormData();
    fd.set("file", croppedFile);
    startUpload(async () => {
      try {
        const { url } = await uploadBrandBadge(fd);
        setBadgeUrl(url);
        setPendingFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    });
  };

  const handleRemove = () => {
    if (!confirm("確定移除目前的 footer badge 圖片？sidebar 底部會留白。")) return;
    startRemove(async () => {
      try {
        await removeBrandBadge();
        setBadgeUrl(null);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const busy = savePending || uploadPending || removePending;

  return (
    <section className="bg-white rounded-2xl border border-outline-variant/30 p-5 mb-6">
      <header className="mb-5">
        <h2 className="text-base font-bold font-display flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-[color:var(--color-brand-primary)]">
            palette
          </span>
          主視覺設定
        </h2>
        <p className="text-xs text-on-surface-variant mt-1">
          編輯 {brandName}（brand_id: <code className="font-mono">{brandKey}</code>）的儀表板抬頭、sidebar 佈景主題、主顏色、與品牌主形象（Topbar 左上 logo）。
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column: tagline + sidebar theme + brand palette */}
        <div className="space-y-5">
          <label className="block">
            <span className="block text-xs font-semibold text-on-surface-variant mb-1.5">
              儀表板抬頭（dashboard tagline）
            </span>
            <input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="DUCATI TAIPEI OFFICIAL DEALER"
              disabled={busy}
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest font-display tracking-wider"
            />
            <span className="block text-[11px] text-on-surface-variant mt-1.5">
              在主畫面儀表板最上方那條雅緻紅字。留空則整段不顯示。
            </span>
          </label>

          <div>
            <span className="block text-xs font-semibold text-on-surface-variant mb-1.5">
              Sidebar 佈景主題（{SIDEBAR_THEMES.length} 套）
            </span>
            <div className="grid grid-cols-3 gap-2">
              {SIDEBAR_THEMES.map((t) => (
                <ThemeSwatch
                  key={t.key}
                  theme={t}
                  selected={themeKey === t.key}
                  onSelect={() => setThemeKey(t.key)}
                  disabled={busy}
                />
              ))}
            </div>
          </div>

          <div>
            <span className="block text-xs font-semibold text-on-surface-variant mb-1.5">
              主顏色（{BRAND_PALETTES.length} 套 + 自訂）
            </span>
            <div className="grid grid-cols-3 gap-2">
              {BRAND_PALETTES.map((p) => (
                <PaletteSwatch
                  key={p.key}
                  palette={p}
                  selected={paletteKey === p.key}
                  onSelect={() => setPaletteKey(p.key)}
                  disabled={busy}
                />
              ))}
              <CustomPaletteSwatch
                primary={customPrimary}
                accent={customAccent}
                selected={paletteKey === "custom"}
                onSelect={() => setPaletteKey("custom")}
                disabled={busy}
              />
            </div>

            {paletteKey === "custom" && (
              <div className="mt-3 p-3 rounded-lg border border-outline-variant/30 bg-surface-container-lowest space-y-2.5">
                <CustomColorRow
                  label="主色 primary"
                  hint="按鈕、active state、品牌 chip"
                  value={customPrimary}
                  onChange={setCustomPrimary}
                  disabled={busy}
                />
                <CustomColorRow
                  label="對比色 accent"
                  hint="次要強調、徽章、金線"
                  value={customAccent}
                  onChange={setCustomAccent}
                  disabled={busy}
                />
                <p className="text-[10px] text-on-surface-variant leading-relaxed">
                  Hover/pressed（primary-dark）會由系統自動推暗 12%；不需手動指定。
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || busy || !customValid}
              className="px-5 py-2 rounded-lg bg-[color:var(--color-brand-primary)] text-white font-medium hover:bg-[color:var(--color-brand-primary-dark)] disabled:opacity-60 flex items-center gap-2"
            >
              {savePending && <Spinner />}
              {savePending ? "儲存中…" : "儲存設定"}
            </button>
            {dirty && (
              <span className="text-[11px] text-amber-600 flex items-center gap-1">
                <span className="material-symbols-outlined text-base">edit</span>
                有未儲存的變更
              </span>
            )}
          </div>
        </div>

        {/* Right column: badge upload */}
        <div className="space-y-3">
          <span className="block text-xs font-semibold text-on-surface-variant">
            品牌主形象（顯示於 Topbar 左上）
          </span>

          <div className="rounded-lg border border-outline-variant/30 bg-white p-4 flex items-center justify-center min-h-24">
            {badgeUrl ? (
              <Image
                src={badgeUrl}
                alt="badge preview"
                width={240}
                height={80}
                unoptimized
                className="max-h-12 w-auto object-contain"
              />
            ) : (
              <span className="text-on-surface-variant/50 text-xs">（沒上傳，Topbar 左上會 fallback 顯示 DealerOS 字標）</span>
            )}
          </div>

          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            支援 PNG / JPG / WEBP / GIF（SVG 不可，因為 cropper 走 canvas），最大 5 MB。選檔後會跳出裁切視窗，可拖曳、滾輪縮放、選比例。建議用透明底、橫向 logo，4:1 比例最不會被切。
          </p>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleFileSelect}
              disabled={busy}
              className="text-sm flex-1 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-surface-container file:text-on-surface file:cursor-pointer"
            />
            {uploadPending && <Spinner />}
            {badgeUrl && !uploadPending && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded-lg border border-outline-variant/40 hover:bg-surface-container-low text-on-surface-variant disabled:opacity-60 flex items-center gap-1"
              >
                {removePending ? <Spinner /> : <span className="material-symbols-outlined text-base">delete</span>}
                移除
              </button>
            )}
          </div>
        </div>
      </div>

      <BadgeCropperModal
        file={pendingFile}
        pending={uploadPending}
        onCancel={handleCancelCrop}
        onConfirm={handleConfirmCrop}
      />
    </section>
  );
}

// ──────────────────────────────────────────────────────────
// Sidebar theme swatch
// ──────────────────────────────────────────────────────────
function ThemeSwatch({
  theme,
  selected,
  onSelect,
  disabled,
}: {
  theme: SidebarTheme;
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      title={theme.description}
      className={`group relative rounded-lg overflow-hidden border-2 transition-all text-left disabled:opacity-60 ${
        selected
          ? "border-[color:var(--color-brand-primary)] ring-2 ring-[color:var(--color-brand-primary)]/30"
          : "border-transparent hover:border-outline-variant"
      }`}
    >
      <div className="flex h-12 w-full">
        <div className="w-[28%]" style={{ backgroundColor: theme.rail }} />
        <div className="flex-1 flex flex-col justify-center pl-2 gap-0.5" style={{ backgroundColor: theme.panel }}>
          <div className="h-1 w-3/4 rounded-full" style={{ backgroundColor: theme.text, opacity: 0.7 }} />
          <div className="h-1 w-1/2 rounded-full" style={{ backgroundColor: theme.textMuted }} />
        </div>
      </div>
      <div className="px-2 py-1.5 bg-white">
        <div className="text-[11px] font-bold truncate">{theme.name}</div>
      </div>
      {selected && <SelectedDot />}
    </button>
  );
}

// ──────────────────────────────────────────────────────────
// Brand palette swatch — 雙色預覽 + dark 推算的小條
// ──────────────────────────────────────────────────────────
function PaletteSwatch({
  palette,
  selected,
  onSelect,
  disabled,
}: {
  palette: BrandPalette;
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  const dark = darken(palette.primary, 0.12);
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      title={palette.description}
      className={`group relative rounded-lg overflow-hidden border-2 transition-all text-left disabled:opacity-60 ${
        selected
          ? "border-[color:var(--color-brand-primary)] ring-2 ring-[color:var(--color-brand-primary)]/30"
          : "border-transparent hover:border-outline-variant"
      }`}
    >
      <div className="flex h-12 w-full">
        <div className="flex-1" style={{ backgroundColor: palette.primary }} />
        <div className="w-3" style={{ backgroundColor: dark }} />
        <div className="w-1/3" style={{ backgroundColor: palette.accent }} />
      </div>
      <div className="px-2 py-1.5 bg-white">
        <div className="text-[11px] font-bold truncate">{palette.name}</div>
      </div>
      {selected && <SelectedDot />}
    </button>
  );
}

// ──────────────────────────────────────────────────────────
// Custom palette swatch — 第 9 張卡，點下去開兩個 color input
// ──────────────────────────────────────────────────────────
function CustomPaletteSwatch({
  primary,
  accent,
  selected,
  onSelect,
  disabled,
}: {
  primary: string;
  accent: string;
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  const safePrimary = isValidHex(primary) ? primary : "#CCCCCC";
  const safeAccent = isValidHex(accent) ? accent : "#999999";
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      title="自訂主顏色 — 自選兩個 hex"
      className={`group relative rounded-lg overflow-hidden border-2 border-dashed transition-all text-left disabled:opacity-60 ${
        selected
          ? "border-[color:var(--color-brand-primary)] ring-2 ring-[color:var(--color-brand-primary)]/30"
          : "border-outline-variant hover:border-on-surface"
      }`}
    >
      <div className="flex h-12 w-full">
        <div className="flex-1" style={{ backgroundColor: safePrimary }} />
        <div className="w-1/3" style={{ backgroundColor: safeAccent }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="material-symbols-outlined text-white drop-shadow text-lg">colorize</span>
        </div>
      </div>
      <div className="px-2 py-1.5 bg-white">
        <div className="text-[11px] font-bold truncate">自訂搭配</div>
      </div>
      {selected && <SelectedDot />}
    </button>
  );
}

function CustomColorRow({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const colorRef = useRef<HTMLInputElement>(null);
  const valid = isValidHex(value);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => colorRef.current?.click()}
        disabled={disabled}
        className="w-9 h-9 rounded-lg border border-outline-variant/40 shrink-0 cursor-pointer relative overflow-hidden disabled:opacity-60"
        style={{ backgroundColor: valid ? value : "#CCCCCC" }}
        title="開啟調色盤"
      >
        <input
          ref={colorRef}
          type="color"
          value={valid ? value : "#CCCCCC"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          disabled={disabled}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold">{label}</span>
          <span className="text-[10px] text-on-surface-variant truncate">{hint}</span>
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value.trim();
            onChange(v && !v.startsWith("#") ? "#" + v : v);
          }}
          disabled={disabled}
          placeholder="#CC0000"
          className={`w-full mt-0.5 px-2 py-1 rounded border bg-white font-mono text-xs ${
            valid ? "border-outline-variant/40" : "border-error"
          }`}
        />
      </div>
    </div>
  );
}

function SelectedDot() {
  return (
    <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[color:var(--color-brand-primary)] text-white flex items-center justify-center">
      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>check</span>
    </span>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
