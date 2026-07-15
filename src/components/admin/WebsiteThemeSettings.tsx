import React, { useEffect, useRef, useState } from "react";
import { Palette, RotateCcw, Upload, X } from "lucide-react";
import Card, {
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/toast";
import { darkenHex } from "@/lib/companyConfig";
import {
  SiteTheme,
  defaultTheme,
  applySiteTheme,
  getSiteTheme,
  saveSiteTheme,
  clearSiteTheme,
  uploadLogo,
} from "@/services/siteThemeService";

const HEX_RE = /^#[0-9a-f]{6}$/i;
const MAX_LOGO_BYTES = 1024 * 1024; // 1 MB

const DEFAULT_LOGO = "/ampOS_full_logo.svg";
const DEFAULT_ICON = "/AMP-vector-filled.svg";

/**
 * Best-effort dominant-color extraction: downscale onto a canvas, bucket
 * similar pixels, skip grays/whites/blacks, return up to 4 distinct hexes.
 * Returns [] for monochrome logos or if the image can't be rasterized.
 */
const extractPaletteFromFile = (file: File): Promise<string[]> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (colors: string[]) => {
      URL.revokeObjectURL(url);
      resolve(colors);
    };
    img.onload = () => {
      try {
        const size = 64;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return done([]);
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        const buckets = new Map<
          number,
          { n: number; r: number; g: number; b: number }
        >();
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 200) continue; // transparent
          const r = data[i],
            g = data[i + 1],
            b = data[i + 2];
          const max = Math.max(r, g, b),
            min = Math.min(r, g, b);
          if (max - min < 30) continue; // grays / near-monochrome
          if (min > 230) continue; // near-white
          if (max < 35) continue; // near-black
          const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
          const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
          e.n++;
          e.r += r;
          e.g += g;
          e.b += b;
          buckets.set(key, e);
        }

        const dist = (a: number[], b: number[]) =>
          Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
        const picked: number[][] = [];
        for (const e of [...buckets.values()].sort((a, b) => b.n - a.n)) {
          const rgb = [
            Math.round(e.r / e.n),
            Math.round(e.g / e.n),
            Math.round(e.b / e.n),
          ];
          if (picked.every((p) => dist(p, rgb) > 90)) picked.push(rgb);
          if (picked.length >= 4) break;
        }
        done(
          picked.map(
            ([r, g, b]) =>
              `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`,
          ),
        );
      } catch {
        done([]);
      }
    };
    img.onerror = () => done([]);
    img.src = url;
  });

const WebsiteThemeSettings: React.FC = () => {
  const [savedTheme, setSavedTheme] = useState<SiteTheme | null>(null);
  const [brand, setBrand] = useState(defaultTheme.brandColor);
  const [dark, setDark] = useState(defaultTheme.brandColorDark);
  const [autoDark, setAutoDark] = useState(true);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [iconUrl, setIconUrl] = useState<string | undefined>(undefined);
  const [hideLogo, setHideLogo] = useState(false);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "icon" | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSiteTheme()
      .then((theme) => {
        if (theme) {
          setSavedTheme(theme);
          setBrand(theme.brandColor);
          setDark(theme.brandColorDark);
          setAutoDark(theme.brandColorDark === darkenHex(theme.brandColor));
          setLogoUrl(theme.logoUrl);
          setIconUrl(theme.iconUrl);
          setHideLogo(theme.hideLogo ?? false);
        }
      })
      .catch((err) => {
        console.error("Failed to load site theme:", err);
        toast({
          title: "Could not load saved theme",
          description:
            "If this instance is new, run create_app_settings_table.sql first.",
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  // Live preview while editing.
  useEffect(() => {
    if (HEX_RE.test(brand) && HEX_RE.test(dark)) {
      applySiteTheme({
        brandColor: brand,
        brandColorDark: dark,
        logoUrl,
        iconUrl,
        hideLogo,
      });
    }
  }, [brand, dark, logoUrl, iconUrl, hideLogo]);

  // On leaving the page, restore whatever is actually saved. Uses a ref so
  // the restore runs only on unmount (not on every savedTheme change, which
  // would briefly revert the live theme right after saving).
  const savedThemeRef = useRef<SiteTheme | null>(null);
  useEffect(() => {
    savedThemeRef.current = savedTheme;
  }, [savedTheme]);
  useEffect(() => {
    return () => applySiteTheme(savedThemeRef.current);
  }, []);

  const setBrandColor = (value: string) => {
    setBrand(value);
    if (autoDark && HEX_RE.test(value)) setDark(darkenHex(value));
  };

  const handleUpload = async (kind: "logo" | "icon", file: File | null) => {
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      toast({
        title: "File too large",
        description: "Logo images must be under 1 MB (SVG or PNG work best).",
        variant: "destructive",
      });
      return;
    }
    try {
      setUploading(kind);
      // Suggest brand colors pulled from the image itself.
      extractPaletteFromFile(file).then((colors) => {
        if (colors.length) setSuggested(colors);
      });
      const url = await uploadLogo(file, kind);
      if (kind === "logo") setLogoUrl(url);
      else setIconUrl(url);
      toast({
        title: "Uploaded",
        description: "Remember to hit Save theme to make it permanent.",
      });
    } catch (err) {
      console.error("Logo upload failed:", err);
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setUploading(null);
    }
  };

  const handleSave = async () => {
    if (!HEX_RE.test(brand) || !HEX_RE.test(dark)) {
      toast({
        title: "Invalid color",
        description: "Colors must be 6-digit hex values like #f26722.",
        variant: "destructive",
      });
      return;
    }
    try {
      setSaving(true);
      const theme: SiteTheme = {
        brandColor: brand,
        brandColorDark: dark,
        ...(logoUrl ? { logoUrl } : {}),
        ...(iconUrl ? { iconUrl } : {}),
        ...(hideLogo ? { hideLogo } : {}),
      };
      await saveSiteTheme(theme);
      setSavedTheme(theme);
      toast({
        title: "Theme saved",
        description: "The new branding is live for everyone on next page load.",
      });
    } catch (err) {
      console.error("Failed to save site theme:", err);
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      setSaving(true);
      await clearSiteTheme();
      setSavedTheme(null);
      setBrand(defaultTheme.brandColor);
      setDark(defaultTheme.brandColorDark);
      setAutoDark(true);
      setLogoUrl(undefined);
      setIconUrl(undefined);
      setHideLogo(false);
      setSuggested([]);
      applySiteTheme(null);
      toast({
        title: "Theme reset",
        description: "Back to the default brand color and logos.",
      });
    } catch (err) {
      console.error("Failed to reset site theme:", err);
      toast({
        title: "Reset failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const dirty =
    brand !== (savedTheme?.brandColor ?? defaultTheme.brandColor) ||
    dark !== (savedTheme?.brandColorDark ?? defaultTheme.brandColorDark) ||
    logoUrl !== savedTheme?.logoUrl ||
    iconUrl !== savedTheme?.iconUrl ||
    hideLogo !== (savedTheme?.hideLogo ?? false);

  const colorField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    disabled = false,
  ) => (
    <div>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={HEX_RE.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-10 w-14 cursor-pointer rounded-none border border-neutral-300 dark:border-neutral-600 bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="form-input w-32 font-mono text-sm"
          placeholder="#f26722"
        />
      </div>
    </div>
  );

  const logoField = (
    label: string,
    hint: string,
    current: string | undefined,
    fallback: string,
    kind: "logo" | "icon",
    inputRef: React.RefObject<HTMLInputElement>,
    onClear: () => void,
  ) => (
    <div>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
        {label}
      </label>
      <p className="text-xs text-neutral-500 mb-2">{hint}</p>
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-40 items-center justify-center border border-neutral-200 dark:border-neutral-700 bg-white p-2">
          <img
            src={current || fallback}
            alt={label}
            className="max-h-full max-w-full object-contain"
          />
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/svg+xml,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            handleUpload(kind, e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <Button
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={uploading !== null}
          leftIcon={<Upload className="h-4 w-4" />}
        >
          {uploading === kind ? "Uploading…" : "Upload"}
        </Button>
        {current && (
          <Button
            variant="ghost"
            onClick={onClear}
            disabled={uploading !== null}
            leftIcon={<X className="h-4 w-4" />}
          >
            Use default
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="container mx-auto max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand/10 rounded-none">
              <Palette className="h-6 w-6 text-brand" />
            </div>
            <div>
              <CardTitle>Website Theme</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <p className="text-sm text-neutral-500">Loading saved theme…</p>
          ) : (
            <>
              {/* Branding: logos + colors together */}
              <div className="space-y-6">
                <div className="space-y-2">
                  {!hideLogo &&
                    logoField(
                      "Full logo",
                      "Shown on the login page, portal home, and loading overlays.",
                      logoUrl,
                      DEFAULT_LOGO,
                      "logo",
                      logoInputRef,
                      () => setLogoUrl(undefined),
                    )}
                  <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                    <input
                      type="checkbox"
                      checked={hideLogo}
                      onChange={(e) => setHideLogo(e.target.checked)}
                    />
                    Don't show a full logo anywhere
                  </label>
                </div>

                {logoField(
                  "Header icon",
                  "The compact mark in the top-left of the app header.",
                  iconUrl,
                  DEFAULT_ICON,
                  "icon",
                  iconInputRef,
                  () => setIconUrl(undefined),
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    {colorField("Brand color", brand, setBrandColor)}
                    {suggested.length > 0 && (
                      <div>
                        <p className="text-xs text-neutral-500 mb-1">
                          Suggested from your logo:
                        </p>
                        <div className="flex items-center gap-2">
                          {suggested.map((hex) => (
                            <button
                              key={hex}
                              type="button"
                              title={hex}
                              onClick={() => setBrandColor(hex)}
                              className={`h-8 w-8 rounded-none border-2 transition-transform hover:scale-110 ${
                                brand.toLowerCase() === hex.toLowerCase()
                                  ? "border-neutral-900 dark:border-white"
                                  : "border-neutral-200 dark:border-neutral-700"
                              }`}
                              style={{ backgroundColor: hex }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {colorField("Hover / dark shade", dark, setDark, autoDark)}
                    <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                      <input
                        type="checkbox"
                        checked={autoDark}
                        onChange={(e) => {
                          setAutoDark(e.target.checked);
                          if (e.target.checked && HEX_RE.test(brand))
                            setDark(darkenHex(brand));
                        }}
                      />
                      Derive automatically from brand color
                    </label>
                  </div>
                </div>
              </div>

              {/* Live preview */}
              <div className="border border-neutral-200 dark:border-neutral-700 rounded-none p-4 space-y-3">
                <p className="text-xs uppercase tracking-wide text-neutral-500">
                  Preview (already live on this page)
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button className="bg-brand hover:bg-brand-dark text-white">
                    Primary button
                  </Button>
                  <span className="text-brand font-semibold">Accent text</span>
                  <span className="inline-block h-8 w-8 rounded-none bg-brand" />
                  <span className="inline-block h-8 w-8 rounded-none bg-brand-dark" />
                  <span className="inline-block h-8 w-8 rounded-none bg-brand/10 border border-brand" />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className="bg-brand hover:bg-brand-dark text-white"
                >
                  {saving ? "Saving…" : "Save theme"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleReset}
                  disabled={saving}
                  leftIcon={<RotateCcw className="h-4 w-4" />}
                >
                  Reset to default
                </Button>
              </div>

              <p className="text-xs text-neutral-500">
                Note: colors in automated emails are set separately (the
                COMPANY_BRAND_COLOR server secret). The browser-tab favicon is
                not affected by these settings.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WebsiteThemeSettings;
