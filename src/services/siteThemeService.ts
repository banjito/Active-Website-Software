import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  BRAND_COLOR,
  BRAND_COLOR_DARK,
  applyBrandColorValues,
} from "@/lib/companyConfig";

/**
 * Site theme saved by the admin Website Theme page. Stored in
 * common.app_settings under key 'site_theme' and cached in localStorage so
 * returning visitors get the right branding before the DB round-trip.
 */
export interface SiteTheme {
  brandColor: string;
  brandColorDark: string;
  /** Public URL of the full logo (login page, portal, overlays). */
  logoUrl?: string;
  /** Public URL of the compact icon/mark (app header). */
  iconUrl?: string;
  /** Hide the full logo everywhere it appears (login, portal, overlays). */
  hideLogo?: boolean;
}

const SETTINGS_KEY = "site_theme";
const CACHE_KEY = "site_theme";
const LOGO_BUCKET = "user-uploads";
const LOGO_FOLDER = "branding";

const HEX_RE = /^#[0-9a-f]{6}$/i;

const isValidUrl = (u: unknown): boolean =>
  typeof u === "string" && (/^https?:\/\//.test(u) || u.startsWith("/"));

const isValidTheme = (t: unknown): t is SiteTheme => {
  if (!t || typeof t !== "object") return false;
  const theme = t as SiteTheme;
  if (!HEX_RE.test(theme.brandColor || "")) return false;
  if (!HEX_RE.test(theme.brandColorDark || "")) return false;
  if (theme.logoUrl !== undefined && !isValidUrl(theme.logoUrl)) return false;
  if (theme.iconUrl !== undefined && !isValidUrl(theme.iconUrl)) return false;
  if (theme.hideLogo !== undefined && typeof theme.hideLogo !== "boolean")
    return false;
  return true;
};

/** The env/default colors (what "Reset to default" restores). */
export const defaultTheme: SiteTheme = {
  brandColor: BRAND_COLOR,
  brandColorDark: BRAND_COLOR_DARK,
};

// ── Current theme + subscriptions (so mounted components update live) ───────

let currentTheme: SiteTheme | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((cb) => cb());

export const getCurrentTheme = (): SiteTheme | null => currentTheme;

export function applySiteTheme(theme: SiteTheme | null): void {
  currentTheme = theme;
  const active = theme ?? defaultTheme;
  applyBrandColorValues(active.brandColor, active.brandColorDark);
  notify();
}

/**
 * Logo URLs from the active theme, falling back to the instance defaults.
 * Components re-render when an admin-saved theme loads or changes.
 */
export function useSiteLogos(): {
  logoUrl: string;
  iconUrl: string;
  hideLogo: boolean;
} {
  const [, forceRender] = useState(0);
  useEffect(() => {
    const cb = () => forceRender((n) => n + 1);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return {
    logoUrl: currentTheme?.logoUrl || "/ampOS_full_logo.svg",
    iconUrl: currentTheme?.iconUrl || "/AMP-vector-filled.svg",
    hideLogo: currentTheme?.hideLogo ?? false,
  };
}

// ── Persistence ──────────────────────────────────────────────────────────────

export async function getSiteTheme(): Promise<SiteTheme | null> {
  const { data, error } = await supabase
    .schema("common")
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  if (error) throw error;
  return isValidTheme(data?.value) ? (data!.value as SiteTheme) : null;
}

export async function saveSiteTheme(theme: SiteTheme): Promise<void> {
  const { error } = await supabase
    .schema("common")
    .from("app_settings")
    .upsert({ key: SETTINGS_KEY, value: theme }, { onConflict: "key" });
  if (error) throw error;
  localStorage.setItem(CACHE_KEY, JSON.stringify(theme));
}

export async function clearSiteTheme(): Promise<void> {
  const { error } = await supabase
    .schema("common")
    .from("app_settings")
    .delete()
    .eq("key", SETTINGS_KEY);
  if (error) throw error;
  localStorage.removeItem(CACHE_KEY);
}

/** Upload a logo image and return its public URL. */
export async function uploadLogo(
  file: File,
  kind: "logo" | "icon"
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${LOGO_FOLDER}/site-${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Boot-time init: apply the cached theme immediately (no flash), then fetch
 * the saved theme and reconcile. Silently keeps env/default branding if the
 * table doesn't exist yet or nothing is saved.
 */
export function initSiteTheme(): void {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (isValidTheme(cached)) applySiteTheme(cached);
  } catch {
    localStorage.removeItem(CACHE_KEY);
  }

  getSiteTheme()
    .then((theme) => {
      if (theme) {
        applySiteTheme(theme);
        localStorage.setItem(CACHE_KEY, JSON.stringify(theme));
      } else {
        localStorage.removeItem(CACHE_KEY);
        applySiteTheme(null);
      }
    })
    .catch(() => {
      // table may not exist yet; env/default branding already applied
    });
}
