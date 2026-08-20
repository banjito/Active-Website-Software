/**
 * Print-media emulation for the embedded report preview.
 *
 * The review window shows a report inside an iframe and calls
 * `contentWindow.print()` on it. Historically the preview *approximated* paper
 * with a large hand-written `.force-print` mirror of the print rules, which
 * always drifted from what `@media print` actually produces — so the preview
 * and the printed page disagreed.
 *
 * Instead of mirroring the rules, this rewrites every `@media print` block in
 * the document to `@media all`, so the browser renders the real print
 * stylesheet on screen. The preview then *is* the print layout: same
 * selectors, same specificity, same cascade order. Nothing to keep in sync.
 *
 * Only used on pages opened with `?preview=true` / `?embedded=true`. If the
 * rules can't be reached (cross-origin stylesheet), the caller falls back to
 * the legacy `.force-print` mirror.
 */

/** Set on <html> while the document is rendering its print styles on screen. */
export const PRINT_EMULATED_CLASS = "print-emulated";

type GroupingRule = CSSRule & { cssRules?: CSSRuleList; media?: MediaList };

/** `print`, `only print`, `print and (…)` — but never `not print`. */
const PRINT_MEDIA = /(^|[\s,(])(only\s+)?print\b/i;
const NEGATED_MEDIA = /\bnot\b/i;

export interface PrintMediaEmulation {
  /** True once at least one print block is being rendered on screen. */
  isActive: () => boolean;
  /** Restore the original media queries and drop the marker class. */
  stop: () => void;
}

export function enablePrintMediaEmulation(): PrintMediaEmulation {
  const originalMedia = new Map<CSSRule, string>();

  const flipRules = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules) as GroupingRule[]) {
      const media = rule.media;
      if (media && !originalMedia.has(rule)) {
        const text = media.mediaText;
        if (PRINT_MEDIA.test(text) && !NEGATED_MEDIA.test(text)) {
          originalMedia.set(rule, text);
          // `print and (orientation: landscape)` keeps its conditions; only the
          // media type changes, so a print-only rule now also matches screen.
          media.mediaText = text.replace(/\b(only\s+)?print\b/gi, "all");
        }
      }
      // @media inside @supports / @layer / another @media.
      if (rule.cssRules) flipRules(rule.cssRules);
    }
  };

  // Walking every rule of the Tailwind sheet is not free, so a sheet is only
  // re-walked when its rule count changes — which covers a <link> that was
  // still loading and a <style> whose contents were replaced.
  const walked = new WeakMap<CSSStyleSheet, number>();

  const sweep = () => {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        // Cross-origin sheets throw here; nothing to do but skip them.
        const rules = sheet.cssRules;
        if (!rules || rules.length === 0) continue;
        if (walked.get(sheet) === rules.length) continue;
        walked.set(sheet, rules.length);
        flipRules(rules);
      } catch {
        /* inaccessible stylesheet */
      }
    }
    if (originalMedia.size > 0) {
      document.documentElement.classList.add(PRINT_EMULATED_CLASS);
    }
  };

  sweep();

  // Reports inject their own print CSS from effects after mount, and linked
  // stylesheets can still be loading, so keep flipping whatever shows up.
  const observer = new MutationObserver(sweep);
  observer.observe(document.head, { childList: true, subtree: true });
  const onLoad = () => sweep();
  window.addEventListener("load", onLoad);

  return {
    isActive: () => originalMedia.size > 0,
    stop: () => {
      observer.disconnect();
      window.removeEventListener("load", onLoad);
      originalMedia.forEach((text, rule) => {
        const media = (rule as GroupingRule).media;
        if (!media) return;
        try {
          media.mediaText = text;
        } catch {
          /* stylesheet went away with the document */
        }
      });
      originalMedia.clear();
      document.documentElement.classList.remove(PRINT_EMULATED_CLASS);
    },
  };
}

/** True when the print stylesheet is already being rendered on screen. */
export function isPrintMediaEmulated(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains(PRINT_EMULATED_CLASS)
  );
}
