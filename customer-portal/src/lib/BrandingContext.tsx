import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getContrastingForegroundHsl,
  hexToHslParts,
  normalizeHexColor,
} from "@/lib/brandColors";
import { useTheme } from "@/lib/ThemeContext";

type BrandPatch = {
  logoUrl?: string | null;
  primaryColor?: string | null;
};

interface BrandingValue {
  logoUrl: string | null;
  primaryColor: string | null;
  setBranding: (patch: BrandPatch) => void;
  resetBranding: () => void;
}

const BRAND_CSS_VARIABLES = [
  "--primary",
  "--primary-foreground",
  "--ring",
  "--accent",
  "--accent-foreground",
] as const;

const BrandingContext = createContext<BrandingValue | undefined>(undefined);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const cssVars = buildBrandCssVars(primaryColor, theme);

    if (!cssVars) {
      BRAND_CSS_VARIABLES.forEach((name) => root.style.removeProperty(name));
      return;
    }

    Object.entries(cssVars).forEach(([name, value]) => {
      root.style.setProperty(name, value);
    });
  }, [primaryColor, theme]);

  const setBranding = useCallback((patch: BrandPatch) => {
    if (Object.prototype.hasOwnProperty.call(patch, "logoUrl")) {
      const nextLogoUrl = patch.logoUrl?.trim() || null;
      setLogoUrl(nextLogoUrl);
    }

    if (Object.prototype.hasOwnProperty.call(patch, "primaryColor")) {
      setPrimaryColor(normalizeHexColor(patch.primaryColor));
    }
  }, []);

  const resetBranding = useCallback(() => {
    setLogoUrl(null);
    setPrimaryColor(null);
  }, []);

  const value = useMemo<BrandingValue>(
    () => ({ logoUrl, primaryColor, setBranding, resetBranding }),
    [logoUrl, primaryColor, setBranding, resetBranding],
  );

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): BrandingValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error("useBranding must be used within BrandingProvider");
  return ctx;
}

function buildBrandCssVars(
  primaryColor: string | null,
  theme: "light" | "dark",
): Record<(typeof BRAND_CSS_VARIABLES)[number], string> | null {
  const normalized = normalizeHexColor(primaryColor);
  const hsl = normalized ? hexToHslParts(normalized) : null;
  if (!normalized || !hsl) return null;

  const accentLightness = theme === "dark" ? 19 : 95;
  const accentForegroundLightness = theme === "dark" ? 82 : 28;

  return {
    "--primary": `${hsl.h} ${hsl.s}% ${hsl.l}%`,
    "--primary-foreground": getContrastingForegroundHsl(normalized),
    "--ring": `${hsl.h} ${hsl.s}% ${hsl.l}%`,
    "--accent": `${hsl.h} ${clamp(hsl.s, 35, 78)}% ${accentLightness}%`,
    "--accent-foreground": `${hsl.h} ${clamp(hsl.s, 45, 90)}% ${accentForegroundLightness}%`,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
