import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { Flag, X } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { canReviewReports } from "@/lib/roles";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/Button";
import { deriveReportPathParts } from "@/components/reports/common/ReportPhotos";
import {
  FIELD_FLAGS_CHANGED_EVENT,
  FIELD_FLAG_REASONS,
  FieldFlag,
  FieldFlagReason,
  FlaggableReportAsset,
  createFieldFlag,
  fetchOpenFieldFlags,
  fetchRoundStart,
  fieldFlagReasonLabel,
  findReportAsset,
  markFieldFlagFixed,
  markFieldFlagStillWrong,
  removeFieldFlag,
  updateFieldFlag,
} from "@/services/reportFieldFlagService";
import {
  FLAG_UI_ATTR,
  FieldLocator,
  describeTarget,
  getFlagRoot,
  isVisible,
  newLocatorCache,
  readFieldValue,
  resolveTarget,
  targetAtPoint,
} from "./fieldLocator";

// Field flags on a report page: a reviewer clicks the fields that are wrong or
// blank, the tech sees them outlined while the report is an Issue. Layout mounts
// this on every report and custom form page, so reports need no wiring.

/** Statuses where the tech sees the flags. In Progress too, since techs often
 * move an Issue report there while fixing it. */
const TECH_VISIBLE_STATUSES = ["issue", "in_progress"];
/** Statuses where a reviewer can add or change flags. */
const FLAGGABLE_STATUSES = ["ready_for_review", "issue"];

export interface TargetState {
  found: boolean;
  changed: boolean;
}

export interface FieldFlagsController {
  active: boolean;
  asset: FlaggableReportAsset | null;
  /** Open flags from the current review round, oldest first (pin numbers follow this order). */
  flags: FieldFlag[];
  /** Flags from before the report was last sent for review: the reviewer checks these off. */
  carriedOver: Set<string>;
  showFlags: boolean;
  canFlag: boolean;
  flagMode: boolean;
  setFlagMode: (on: boolean) => void;
  targetStates: Record<string, TargetState>;
  setTargetStates: (states: Record<string, TargetState>) => void;
  jump: { flagId: string; nonce: number } | null;
  jumpTo: (flagId: string) => void;
}

const statusFromEvent = (detail: any, assetId: string): string | null => {
  if (!detail?.newStatus) return null;
  if (detail.assetId === assetId) return detail.newStatus;
  if (Array.isArray(detail.assetIds) && detail.assetIds.includes(assetId)) return detail.newStatus;
  return null;
};

export const useReportFieldFlags = (enabled: boolean): FieldFlagsController => {
  const { user } = useAuth();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  // The print view (PDF export, review preview) renders separate plain-text
  // tables, so flags never show there.
  const active = enabled && params.get("print") !== "true";
  const wantsFlagMode = params.get("flag") === "true";
  const canReview = canReviewReports(user?.user_metadata?.role, user?.email);

  const [asset, setAsset] = useState<FlaggableReportAsset | null>(null);
  const [allFlags, setAllFlags] = useState<FieldFlag[]>([]);
  const [flagMode, setFlagModeState] = useState(false);
  const [targetStates, setTargetStates] = useState<Record<string, TargetState>>({});
  const [jump, setJump] = useState<{ flagId: string; nonce: number } | null>(null);

  useEffect(() => {
    setAsset(null);
    setAllFlags([]);
    setFlagModeState(false);
    setTargetStates({});
    setJump(null);
    if (!active) return;
    const parts = deriveReportPathParts();
    if (!parts) return;
    let cancelled = false;
    findReportAsset(parts)
      .then((found) => {
        if (!cancelled) setAsset(found);
      })
      .catch((e) => console.warn("[FieldFlags] report lookup failed:", e));
    return () => {
      cancelled = true;
    };
  }, [active, location.pathname]);

  const assetId = asset?.id;

  const loadFlags = useCallback(async () => {
    if (!assetId) return;
    try {
      setAllFlags(await fetchOpenFieldFlags(assetId));
    } catch (e) {
      console.warn("[FieldFlags] failed to load flags:", e);
    }
  }, [assetId]);

  useEffect(() => {
    if (!assetId) return;
    loadFlags();
    const onFlags = (e: Event) => {
      if ((e as CustomEvent).detail?.assetId === assetId) loadFlags();
    };
    const onStatus = (e: Event) => {
      const next = statusFromEvent((e as CustomEvent).detail, assetId);
      if (!next) return;
      setAsset((prev) =>
        prev && prev.id === assetId
          ? {
              ...prev,
              status: String(next).toLowerCase(),
              approved_at: next === "approved" ? new Date().toISOString() : prev.approved_at,
            }
          : prev,
      );
    };
    window.addEventListener(FIELD_FLAGS_CHANGED_EVENT, onFlags);
    window.addEventListener("assetStatusChanged", onStatus);
    return () => {
      window.removeEventListener(FIELD_FLAGS_CHANGED_EVENT, onFlags);
      window.removeEventListener("assetStatusChanged", onStatus);
    };
  }, [assetId, loadFlags]);

  // Flags made before the report was last approved belong to an old round.
  const flags = useMemo(() => {
    const approvedAt = asset?.approved_at ? Date.parse(asset.approved_at) : null;
    return approvedAt
      ? allFlags.filter((f) => Date.parse(f.created_at) > approvedAt)
      : allFlags;
  }, [allFlags, asset?.approved_at]);

  const status = asset?.status || "";

  // When the report was last sent for review. Flags older than that are from
  // the previous round, and the reviewer marks each fixed or still wrong.
  const [roundStart, setRoundStart] = useState<number | null>(null);
  useEffect(() => {
    setRoundStart(null);
    if (!assetId || status !== "ready_for_review") return;
    let cancelled = false;
    fetchRoundStart(assetId)
      .then((at) => {
        if (!cancelled) setRoundStart(at ? Date.parse(at) : null);
      })
      .catch((e) => console.warn("[FieldFlags] review round lookup failed:", e));
    return () => {
      cancelled = true;
    };
  }, [assetId, status]);

  const carriedOver = useMemo(
    () =>
      new Set(
        roundStart === null
          ? []
          : flags.filter((f) => Date.parse(f.created_at) < roundStart).map((f) => f.id),
      ),
    [flags, roundStart],
  );
  const canFlag = active && !!asset && canReview && FLAGGABLE_STATUSES.includes(status);
  const showFlags =
    active &&
    !!asset &&
    flags.length > 0 &&
    (flagMode ||
      TECH_VISIBLE_STATUSES.includes(status) ||
      (canReview && status === "ready_for_review"));

  const setFlagMode = useCallback(
    (on: boolean) => setFlagModeState(on && canFlag),
    [canFlag],
  );

  useEffect(() => {
    if (!canFlag) setFlagModeState(false);
    else if (wantsFlagMode) setFlagModeState(true);
  }, [canFlag, wantsFlagMode]);

  // The review screen shows the report in a frame and drives flag mode from
  // its own button; keep it told how many flags there are.
  useEffect(() => {
    if (!active || window.parent === window) return;
    window.parent.postMessage(
      { type: "fieldFlagsState", count: flags.length, on: flagMode },
      window.location.origin,
    );
  }, [active, flags.length, flagMode]);

  useEffect(() => {
    if (!active || window.parent === window) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "fieldFlagsToggle") setFlagModeState((on) => !on && canFlag);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [active, canFlag]);

  const jumpTo = useCallback(
    (flagId: string) => setJump({ flagId, nonce: Date.now() }),
    [],
  );

  return {
    active,
    asset,
    flags,
    carriedOver,
    showFlags,
    canFlag,
    flagMode,
    setFlagMode,
    targetStates,
    setTargetStates,
    jump,
    jumpTo,
  };
};

const FLAG_CSS = `
@media screen {
  [data-ff-state="open"] { outline: 2px solid #dc2626 !important; outline-offset: 1px; background-color: rgba(220, 38, 38, 0.08) !important; }
  [data-ff-state="changed"] { outline: 2px solid #d97706 !important; outline-offset: 1px; background-color: rgba(217, 119, 6, 0.1) !important; }
  [data-ff-hover] { outline: 2px dashed #dc2626 !important; outline-offset: 1px; }
  [data-ff-pulse] { animation: ff-pulse 0.7s ease-out 3; }
  @keyframes ff-pulse { 50% { outline-offset: 5px; } }
  html[data-ff-mode] [data-ff-root] { cursor: crosshair; }
  html[data-ff-mode] [data-ff-root] input,
  html[data-ff-mode] [data-ff-root] select,
  html[data-ff-mode] [data-ff-root] textarea { pointer-events: none !important; }
}
@media (prefers-reduced-motion: reduce) { [data-ff-pulse] { animation: none; } }
@media print { [${FLAG_UI_ATTR}] { display: none !important; } }
`;

const locatorOf = (flag: FieldFlag): FieldLocator => ({
  kind: flag.target_kind,
  index: flag.field_index,
  key: flag.field_key,
  context: flag.context,
  section: flag.locator?.section || "",
  row: flag.locator?.row || "",
  column: flag.locator?.column || "",
});

const isChanged = (flag: FieldFlag, el: HTMLElement) =>
  flag.target_kind === "field" &&
  readFieldValue(el).trim() !== (flag.value_at_flag || "").trim();

const shownValue = (value: string | null) => (value && value.trim() ? value : "(blank)");

type Popover =
  | { mode: "new"; locator: FieldLocator; value: string | null; anchor: HTMLElement }
  | { mode: "existing"; flagId: string };

interface Pin {
  flagId: string;
  num: number;
  top: number;
  left: number;
  changed: boolean;
}

/** Outlines, numbered pins, the click-to-flag mode and the reviewer's panel. */
export const FieldFlagsOverlay: React.FC<{ ctrl: FieldFlagsController }> = ({ ctrl }) => {
  const { user } = useAuth();
  const { flags, showFlags, flagMode, canFlag, asset, setTargetStates, setFlagMode } = ctrl;
  const [pins, setPins] = useState<Pin[]>([]);
  const [popover, setPopover] = useState<Popover | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  const elements = useRef(new Map<string, HTMLElement | null>());
  const marked = useRef(new Set<HTMLElement>());
  const dirty = useRef(true);
  const lastResolve = useRef(0);
  const frame = useRef<number | null>(null);
  const resolveTimer = useRef<number | null>(null);
  const lastStates = useRef("");
  const popoverRef = useRef<Popover | null>(popover);
  popoverRef.current = popover;

  const live = showFlags || flagMode;

  const anchorFor = useCallback(
    (p: Popover | null) =>
      !p ? null : p.mode === "new" ? p.anchor : elements.current.get(p.flagId) || null,
    [],
  );

  const pass: () => void = useCallback(() => {
    frame.current = null;
    const root = getFlagRoot();
    const now = Date.now();
    // Finding fields again is the slow part; do it after the page changes,
    // at most twice a second. Scrolling only moves the pins.
    if (dirty.current && now - lastResolve.current > 500) {
      const cache = newLocatorCache();
      const next = new Map<string, HTMLElement | null>();
      flags.forEach((f) => next.set(f.id, resolveTarget(locatorOf(f), root, cache)));
      elements.current = next;
      dirty.current = false;
      lastResolve.current = now;
    } else if (dirty.current && resolveTimer.current === null) {
      resolveTimer.current = window.setTimeout(() => {
        resolveTimer.current = null;
        if (frame.current === null) frame.current = requestAnimationFrame(pass);
      }, 500 - (now - lastResolve.current));
    }

    const clip = root.getBoundingClientRect();
    const top = Math.max(0, clip.top);
    const bottom = Math.min(window.innerHeight, clip.bottom);
    const nextPins: Pin[] = [];
    const states: Record<string, TargetState> = {};
    const stillMarked = new Set<HTMLElement>();

    flags.forEach((f, i) => {
      const el = elements.current.get(f.id);
      if (!el || !el.isConnected) {
        states[f.id] = { found: false, changed: false };
        return;
      }
      const changed = isChanged(f, el);
      states[f.id] = { found: true, changed };
      const state = changed ? "changed" : "open";
      if (el.getAttribute("data-ff-state") !== state) el.setAttribute("data-ff-state", state);
      stillMarked.add(el);
      if (!isVisible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.top < top - 4 || r.top > bottom) return;
      nextPins.push({
        flagId: f.id,
        num: i + 1,
        top: r.top - 9,
        left: Math.min(window.innerWidth - 22, r.right - 9),
        changed,
      });
    });

    marked.current.forEach((el) => {
      if (!stillMarked.has(el)) el.removeAttribute("data-ff-state");
    });
    marked.current = stillMarked;

    setPins((prev) => (JSON.stringify(prev) === JSON.stringify(nextPins) ? prev : nextPins));
    // These live in Layout, so only hand them up when they actually change.
    const statesJson = JSON.stringify(states);
    if (statesJson !== lastStates.current) {
      lastStates.current = statesJson;
      setTargetStates(states);
    }

    const anchor = anchorFor(popoverRef.current);
    if (anchor && anchor.isConnected) {
      const r = anchor.getBoundingClientRect();
      const width = 300;
      const below = r.bottom + 8;
      const pos = {
        top: Math.max(8, below + 260 > window.innerHeight ? r.top - 268 : below),
        left: Math.max(8, Math.min(window.innerWidth - width - 8, r.left)),
      };
      setPopoverPos((prev) =>
        prev && prev.top === pos.top && prev.left === pos.left ? prev : pos,
      );
    }
  }, [flags, anchorFor, setTargetStates]);

  const schedule = useCallback(() => {
    if (frame.current === null) frame.current = requestAnimationFrame(pass);
  }, [pass]);

  // Keep outlines, pins and the popover lined up with the report.
  useEffect(() => {
    if (!live) return;
    dirty.current = true;
    lastResolve.current = 0;
    schedule();
    const root = getFlagRoot();
    const markDirty = () => {
      dirty.current = true;
      schedule();
    };
    const observer = new MutationObserver(markDirty);
    observer.observe(root, { childList: true, subtree: true });
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("input", schedule, true);
    document.addEventListener("change", schedule, true);
    // Reports also change values from code (copy buttons, calculations).
    const timer = window.setInterval(schedule, 1000);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule, { capture: true } as any);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("input", schedule, true);
      document.removeEventListener("change", schedule, true);
      window.clearInterval(timer);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (resolveTimer.current !== null) window.clearTimeout(resolveTimer.current);
      frame.current = null;
      resolveTimer.current = null;
    };
  }, [live, schedule]);

  // Place a newly opened note next to its field on the next frame.
  useEffect(() => {
    setPopoverPos(null);
    if (popover) schedule();
  }, [popover, schedule]);

  // Clear outlines when flags are hidden or the page changes.
  useEffect(() => {
    if (live) return;
    marked.current.forEach((el) => el.removeAttribute("data-ff-state"));
    marked.current.clear();
    setPins([]);
    setPopover(null);
  }, [live]);

  useEffect(
    () => () => {
      marked.current.forEach((el) => el.removeAttribute("data-ff-state"));
    },
    [],
  );

  // Click-to-flag.
  useEffect(() => {
    if (!flagMode) return;
    const html = document.documentElement;
    html.setAttribute("data-ff-mode", "on");
    let hovered: HTMLElement | null = null;
    let hoverFrame: number | null = null;

    const setHover = (el: HTMLElement | null) => {
      if (hovered === el) return;
      hovered?.removeAttribute("data-ff-hover");
      hovered = el;
      hovered?.setAttribute("data-ff-hover", "");
    };

    const onMove = (e: MouseEvent) => {
      if (hoverFrame !== null) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = null;
        setHover(targetAtPoint(e.clientX, e.clientY, e.target as Element, getFlagRoot()));
      });
    };

    const onClick = (e: MouseEvent) => {
      const start = e.target as Element | null;
      const root = getFlagRoot();
      if (!start || start.closest(`[${FLAG_UI_ATTR}]`) || !root.contains(start)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const target = targetAtPoint(e.clientX, e.clientY, start, root);
      if (!target) return;
      for (const [flagId, el] of elements.current) {
        if (el === target) {
          setPopover({ mode: "existing", flagId });
          schedule();
          return;
        }
      }
      const locator = describeTarget(target, root);
      if (!locator) return;
      setPopover({
        mode: "new",
        locator,
        value: locator.kind === "field" ? readFieldValue(target) : null,
        anchor: target,
      });
      schedule();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (popoverRef.current) setPopover(null);
      else setFlagMode(false);
    };

    window.addEventListener("mousemove", onMove, { capture: true, passive: true });
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      html.removeAttribute("data-ff-mode");
      setHover(null);
      if (hoverFrame !== null) cancelAnimationFrame(hoverFrame);
      window.removeEventListener("mousemove", onMove, { capture: true } as any);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [flagMode, schedule, setFlagMode]);

  // "Jump" from a flag list: scroll to the field and open its note, once per click.
  const handledJump = useRef(0);
  useEffect(() => {
    if (!ctrl.jump || ctrl.jump.nonce === handledJump.current) return;
    handledJump.current = ctrl.jump.nonce;
    const el = elements.current.get(ctrl.jump.flagId);
    if (!el || !el.isConnected) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.setAttribute("data-ff-pulse", "");
    window.setTimeout(() => el.removeAttribute("data-ff-pulse"), 2200);
    setPopover({ mode: "existing", flagId: ctrl.jump.flagId });
  }, [ctrl.jump]);

  if (!ctrl.active || !asset || (!live && !canFlag)) return null;

  const inFrame = window.parent !== window;

  const runAction = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e: any) {
      console.error("[FieldFlags] update failed:", e);
      toast({
        title: "Flag not updated",
        description: e?.message || "Check your connection and try again.",
        variant: "destructive",
      });
    }
  };
  const reviewActions: ReviewActions = {
    onFixed: (f) => user && runAction(() => markFieldFlagFixed(f, user.id)),
    onStillWrong: (f) => {
      const el = elements.current.get(f.id);
      if (el) runAction(() => markFieldFlagStillWrong(f, readFieldValue(el)));
    },
  };
  const reviewing = ctrl.carriedOver.size > 0;
  const changedCarried = flags.filter(
    (f) => ctrl.carriedOver.has(f.id) && ctrl.targetStates[f.id]?.changed,
  );
  const untouchedCount = flags.filter((f) => {
    const st = ctrl.targetStates[f.id];
    return ctrl.carriedOver.has(f.id) && f.target_kind === "field" && st?.found && !st.changed;
  }).length;
  const existing =
    popover?.mode === "existing" ? flags.find((f) => f.id === popover.flagId) || null : null;

  return createPortal(
    <div data-ff-ui="" className="print:hidden">
      <style>{FLAG_CSS}</style>

      {live &&
        pins.map((pin) => (
          <button
            key={pin.flagId}
            type="button"
            onClick={() => {
              setPopover({ mode: "existing", flagId: pin.flagId });
              schedule();
            }}
            title="Show the reviewer's note"
            className={`fixed z-40 min-w-[18px] h-[18px] px-1 rounded-none text-[11px] font-semibold leading-[18px] text-white shadow ${
              pin.changed ? "bg-amber-600" : "bg-red-600"
            }`}
            style={{ top: pin.top, left: pin.left }}
          >
            {pin.num}
          </button>
        ))}

      {popover && popoverPos && (popover.mode === "new" || existing) && (
        <FlagPopover
          key={popover.mode === "new" ? "new" : popover.flagId}
          top={popoverPos.top}
          left={popoverPos.left}
          flag={existing}
          num={existing ? flags.indexOf(existing) + 1 : flags.length + 1}
          context={popover.mode === "new" ? popover.locator.context : existing!.context}
          valueAtFlag={popover.mode === "new" ? popover.value : existing!.value_at_flag}
          isSection={
            popover.mode === "new" ? popover.locator.kind === "section" : existing!.target_kind === "section"
          }
          state={existing ? ctrl.targetStates[existing.id] : undefined}
          canEdit={canFlag}
          onFixed={
            existing && ctrl.carriedOver.has(existing.id) && canFlag
              ? async () => {
                  await runAction(() => markFieldFlagFixed(existing, user!.id));
                  setPopover(null);
                }
              : undefined
          }
          onClose={() => setPopover(null)}
          onSave={async (reason, note) => {
            if (!user) return;
            try {
              if (popover.mode === "new") {
                const loc = popover.locator;
                await createFieldFlag(
                  {
                    asset_id: asset.id,
                    target_kind: loc.kind,
                    field_index: loc.index,
                    field_key: loc.key,
                    context: loc.context,
                    locator: { section: loc.section, row: loc.row, column: loc.column },
                    value_at_flag: popover.value,
                    reason,
                    note,
                  },
                  user.id,
                );
              } else if (existing) {
                await updateFieldFlag(existing, { reason, note });
              }
              setPopover(null);
            } catch (e: any) {
              console.error("[FieldFlags] save failed:", e);
              toast({
                title: "Flag not saved",
                description: e?.message || "Check your connection and try again.",
                variant: "destructive",
              });
            }
          }}
          onRemove={
            existing
              ? async () => {
                  if (!user) return;
                  try {
                    await removeFieldFlag(existing, user.id);
                    setPopover(null);
                  } catch (e: any) {
                    console.error("[FieldFlags] remove failed:", e);
                    toast({
                      title: "Flag not removed",
                      description: e?.message || "Check your connection and try again.",
                      variant: "destructive",
                    });
                  }
                }
              : undefined
          }
        />
      )}

      {canFlag && (
        // In the review screen the report sits in a frame: put the controls
        // at its top left, next to the review buttons. On a full report page,
        // bottom left, clear of the floating "report an issue" button.
        <div
          className={`fixed z-40 flex items-start gap-2 ${
            inFrame ? "top-4 left-4 flex-col" : "bottom-4 left-20 flex-col-reverse"
          }`}
        >
          <Button
            type="button"
            size="sm"
            variant={flagMode ? "destructive" : "outline"}
            className={`rounded-none shadow ${flagMode ? "" : "bg-white dark:bg-dark-150"}`}
            leftIcon={<Flag className="w-4 h-4" />}
            onClick={() => {
              if (flagMode) {
                ctrl.setFlagMode(false);
                setPopover(null);
              } else {
                ctrl.setFlagMode(true);
                setPanelOpen(true);
              }
            }}
          >
            {flagMode ? "Done flagging" : `Flag fields${flags.length ? ` (${flags.length})` : ""}`}
          </Button>
          {(flagMode || reviewing) && panelOpen && (
            <div className="w-80 max-h-[60vh] flex flex-col bg-white dark:bg-dark-150 border border-red-300 dark:border-red-700 shadow-lg rounded-none">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
                <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Flagged fields ({flags.length})
                </p>
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="p-1 text-neutral-500 hover:text-neutral-800 dark:hover:text-white rounded-none"
                  aria-label="Hide list"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {flagMode && (
                <p className="px-3 pt-2 text-xs text-neutral-600 dark:text-neutral-400">
                  Click a field or section title to flag it. Esc to stop.
                </p>
              )}
              {reviewing && (
                <div className="px-3 pt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-neutral-700 dark:text-neutral-300">
                    Last round: {changedCarried.length} changed · {untouchedCount} untouched
                  </span>
                  {changedCarried.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        user &&
                        runAction(async () => {
                          for (const f of changedCarried) await markFieldFlagFixed(f, user.id);
                        })
                      }
                      className="px-2 py-0.5 border border-green-600 text-green-700 dark:text-green-400 font-semibold rounded-none"
                    >
                      Mark changed fixed ({changedCarried.length})
                    </button>
                  )}
                </div>
              )}
              <div className="overflow-y-auto p-3 flex flex-col gap-2">
                {flags.length === 0 ? (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">No flags yet.</p>
                ) : (
                  <FlagListItems ctrl={ctrl} compact actions={reviewActions} />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
};

const FlagPopover: React.FC<{
  top: number;
  left: number;
  flag: FieldFlag | null;
  num: number;
  context: string;
  valueAtFlag: string | null;
  isSection: boolean;
  state?: TargetState;
  canEdit: boolean;
  onClose: () => void;
  onSave: (reason: FieldFlagReason | null, note: string | null) => Promise<void>;
  onRemove?: () => Promise<void>;
  /** Only for flags from the previous review round. */
  onFixed?: () => Promise<void>;
}> = ({ top, left, flag, num, context, valueAtFlag, isSection, state, canEdit, onClose, onSave, onRemove, onFixed }) => {
  const [reason, setReason] = useState<FieldFlagReason | null>(flag?.reason ?? null);
  const [note, setNote] = useState(flag?.note ?? "");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Field flag"
      className="fixed z-50 w-[300px] bg-white dark:bg-dark-150 border border-red-400 dark:border-red-700 shadow-xl rounded-none p-3 flex flex-col gap-2 text-sm"
      style={{ top, left }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-neutral-900 dark:text-white">
          <span className="text-red-600 dark:text-red-400">#{num}</span>{" "}
          {context || (isSection ? "Section" : "Field")}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 text-neutral-500 hover:text-neutral-800 dark:hover:text-white rounded-none"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {!isSection && (
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          Value when flagged: <span className="font-mono">{shownValue(valueAtFlag)}</span>
          {state?.changed && (
            <span className="ml-1 font-semibold text-amber-700 dark:text-amber-400">· Changed since</span>
          )}
        </p>
      )}

      {canEdit ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {FIELD_FLAG_REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setReason(reason === r.value ? null : r.value)}
                className={`px-2 py-0.5 text-xs border rounded-none ${
                  reason === r.value
                    ? "border-red-600 text-red-700 dark:text-red-300 font-semibold bg-red-50 dark:bg-red-900/30"
                    : "border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <textarea
            id="field-flag-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note (optional)"
            rows={3}
            className="form-input w-full text-sm rounded-none"
            autoFocus={!flag}
          />
          <div className="flex justify-end gap-2">
            {onFixed && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-none"
                disabled={busy}
                onClick={() => run(onFixed)}
              >
                Mark fixed
              </Button>
            )}
            {onRemove && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-none mr-auto"
                disabled={busy}
                onClick={() => run(onRemove)}
              >
                Remove
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" className="rounded-none" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="rounded-none"
              disabled={busy}
              onClick={() => run(() => onSave(reason, note.trim() || null))}
            >
              {flag ? "Save" : "Save flag"}
            </Button>
          </div>
        </>
      ) : (
        <>
          {flag?.reason && (
            <p className="font-medium text-red-700 dark:text-red-300">{fieldFlagReasonLabel(flag.reason)}</p>
          )}
          {flag?.note && (
            <p className="text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap break-words">{flag.note}</p>
          )}
          {!flag?.reason && !flag?.note && (
            <p className="text-neutral-600 dark:text-neutral-400">The reviewer flagged this {isSection ? "section" : "field"}.</p>
          )}
        </>
      )}
    </div>
  );
};

interface ReviewActions {
  onFixed: (flag: FieldFlag) => void;
  onStillWrong: (flag: FieldFlag) => void;
}

/** One line per flag, with Jump. Shared by the reviewer's panel and the Issue banner. */
const FlagListItems: React.FC<{
  ctrl: FieldFlagsController;
  compact?: boolean;
  /** Reviewer's buttons for flags carried over from the last round. */
  actions?: ReviewActions;
}> = ({ ctrl, compact, actions }) => (
  <ol className={`flex flex-col ${compact ? "gap-2" : "gap-1"} list-none m-0 p-0`}>
    {ctrl.flags.map((f, i) => {
      const state = ctrl.targetStates[f.id];
      const carried = ctrl.carriedOver.has(f.id);
      const label = [fieldFlagReasonLabel(f.reason), f.note].filter(Boolean).join(": ");
      return (
        <li
          key={f.id}
          className={`text-sm ${
            compact
              ? `border border-neutral-200 dark:border-neutral-700 border-l-4 px-2 py-1.5 ${
                  state?.changed ? "border-l-amber-600" : "border-l-red-600"
                }`
              : ""
          }`}
        >
          <span className="font-semibold">{i + 1}.</span>{" "}
          <span className="font-medium">{f.context || (f.target_kind === "section" ? "Section" : "Field")}</span>
          {label && <span>: {label}</span>}
          {state?.changed && (
            <span className="ml-1 text-xs font-semibold text-amber-700 dark:text-amber-400">Changed</span>
          )}
          {carried && f.target_kind === "field" && state?.found && !state.changed && (
            <span className="ml-1 text-xs font-semibold text-red-700 dark:text-red-400">Untouched</span>
          )}
          {state && !state.found ? (
            <span className="ml-1 text-xs text-neutral-500 dark:text-neutral-400">(couldn't find on page)</span>
          ) : (
            <button
              type="button"
              onClick={() => ctrl.jumpTo(f.id)}
              className="ml-2 text-xs font-semibold underline rounded-none"
            >
              Jump
            </button>
          )}
          {carried && actions && (
            <span className="mt-1 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => actions.onFixed(f)}
                className="px-2 py-0.5 text-xs border border-green-600 text-green-700 dark:text-green-400 rounded-none"
              >
                Mark fixed
              </button>
              {state?.changed && (
                <button
                  type="button"
                  onClick={() => actions.onStillWrong(f)}
                  title="Keeps the flag and shows it red again"
                  className="px-2 py-0.5 text-xs border border-red-600 text-red-700 dark:text-red-400 rounded-none"
                >
                  Still wrong
                </button>
              )}
            </span>
          )}
        </li>
      );
    })}
  </ol>
);

/** Flag list for the red Issue banner at the top of the report. */
export const FlaggedFieldsList: React.FC<{ ctrl: FieldFlagsController }> = ({ ctrl }) => {
  if (!ctrl.showFlags) return null;
  return (
    <div data-ff-ui="" className="mt-2 text-red-800 dark:text-red-200">
      <p className="text-sm font-semibold mb-1">
        {ctrl.flags.length === 1 ? "1 field flagged" : `${ctrl.flags.length} fields flagged`}
      </p>
      <FlagListItems ctrl={ctrl} />
    </div>
  );
};
