import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  CloudUpload,
  FileUp,
  Layers,
  Search,
  X,
} from "lucide-react";
import { usePersistentState } from "@/hooks/usePersistentState";

type ReportSpec = "ATS" | "MTS";

export interface AddReportTemplate {
  id: string;
  name: string;
  /** "report:/jobs/{jobId}/{slug}..." */
  fileUrl: string;
  /** Route that starts a new report of this type. */
  path: string;
  /** Null shows under both ATS and MTS. */
  type?: ReportSpec | null;
}

interface AddReportMenuProps {
  jobId: string;
  anchorRef: React.RefObject<HTMLButtonElement>;
  templates: AddReportTemplate[];
  customForms: { id: string; name: string; neta_section?: string | null }[];
  internalForms: { slug: string; name: string }[];
  /** file_url of every report already on the job, for "Used on this job". */
  jobAssetUrls: string[];
  onClose: () => void;
  onUploadFile: () => void;
  onUploadOffline: () => void;
  onBatchUploadOffline: () => void;
}

interface Item {
  key: string;
  name: string;
  note?: string | null;
  path: string;
  type: ReportSpec | null;
  group: string;
  used: number;
  words: string[];
}

const GROUPS = [
  "Breakers",
  "Cables",
  "Transformers",
  "Switchgear, Panelboards & Busway",
  "Switches",
  "Instrument Transformers",
  "Grounding & Ground Fault",
  "Emergency Systems",
  "Other",
  "Custom Forms",
  "Internal Forms",
];

// First match wins, so the order matters: a "Current Transformer" is not a
// power transformer, and a "Panelboard Small Breaker Test" is a breaker test.
const GROUP_RULES: [RegExp, string][] = [
  [/current transformer|potential transformer|contactor vt/, "Instrument Transformers"],
  [/transformer|xfmr/, "Transformers"],
  [/ground/, "Grounding & Ground Fault"],
  [/breaker/, "Breakers"],
  [/cable/, "Cables"],
  [/transfer switch|generator|emergency/, "Emergency Systems"],
  [/switchgear|switchboard|panelboard|busway/, "Switchgear, Panelboards & Busway"],
  [/switch/, "Switches"],
];

const groupFor = (name: string) => {
  const lower = name.toLowerCase();
  return GROUP_RULES.find(([rule]) => rule.test(lower))?.[1] ?? "Other";
};

// Report names mix long and short forms, so either one should find the report.
const SEARCH_ALIASES: [RegExp, string][] = [
  [/xfmr/, "transformer"],
  [/transformer/, "xfmr"],
  [/low[- ]voltage/, "lv"],
  [/\blv\b/, "low voltage"],
  [/medium[- ]voltage/, "mv"],
  [/current transformer/, "ct"],
  [/potential transformer|\bvt\b/, "vt pt potential transformer"],
  [/breaker/, "cb"],
  [/lv circuit breaker|7\.6\.1 /, "mccb molded case"],
  [/switchgear/, "swgr"],
  [/ground fault/, "gfi"],
];

const toWords = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter(Boolean);

const searchWords = (text: string) => {
  const lower = text.toLowerCase();
  const extra = SEARCH_ALIASES.filter(([rule]) => rule.test(lower)).map(
    ([, alias]) => alias,
  );
  return toWords([lower, ...extra].join(" "));
};

// Every typed word must match, in any order. Short words only match the start
// of a word, otherwise "ct" would hit "inspection".
const matches = (item: Item, query: string[]) =>
  query.every((q) =>
    item.words.some((word) =>
      q.length >= 4 ? word.includes(q) : word.startsWith(q),
    ),
  );

const reportSlug = (fileUrl: string) =>
  fileUrl.startsWith("report:/jobs/")
    ? fileUrl.slice("report:/jobs/".length).split("/")[1]?.split("?")[0] || null
    : null;

const countUsed = (urls: string[]) => {
  const counts = new Map<string, number>();
  urls.forEach((url) => {
    let key = reportSlug(url);
    if (url.startsWith("custom-form:/jobs/")) {
      const templateId = url.slice("custom-form:/jobs/".length).split("/")[2];
      key = templateId ? `custom:${templateId}` : null;
    }
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
};

const MAX_USED = 6;
const MIN_WIDTH = 520;
const MAX_WIDTH = 820;
const MAX_HEIGHT = 760;
const EDGE = 16;
const GAP = 8;

const isTouchDevice = () =>
  window.matchMedia("(hover: none) and (pointer: coarse)").matches;

type Layout =
  | { full: true }
  | { full: false; left: number; top: number; width: number; height: number };

/** Left of the button, slid up to stay on screen. Full screen on phones and tablets. */
const getLayout = (anchor: HTMLElement | null): Layout => {
  if (!anchor || isTouchDevice() || window.innerWidth < 1024) {
    return { full: true };
  }
  const rect = anchor.getBoundingClientRect();
  const room = rect.left - GAP - EDGE;
  if (room < MIN_WIDTH) return { full: true };
  const width = Math.min(MAX_WIDTH, room);
  const height = Math.min(MAX_HEIGHT, window.innerHeight - EDGE * 2);
  const top = Math.max(
    EDGE,
    Math.min(rect.top, window.innerHeight - EDGE - height),
  );
  return { full: false, left: rect.left - GAP - width, top, width, height };
};

export default function AddReportMenu({
  jobId,
  anchorRef,
  templates,
  customForms,
  internalForms,
  jobAssetUrls,
  onClose,
  onUploadFile,
  onUploadOffline,
  onBatchUploadOffline,
}: AddReportMenuProps) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [spec, setSpec] = usePersistentState<ReportSpec>(
    "addReport:spec",
    "ATS",
  );
  const [usedOpen, setUsedOpen] = usePersistentState("addReport:usedOpen", false);
  const [layout, setLayout] = useState<Layout>(() =>
    getLayout(anchorRef.current),
  );

  // Latest onClose without re-binding the listeners on every parent render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const update = () => setLayout(getLayout(anchorRef.current));
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      update();
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      // The button toggles itself.
      if (anchorRef.current?.contains(target)) return;
      onCloseRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onCloseRef.current();
      anchorRef.current?.focus();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchorRef]);

  // On touch the on-screen keyboard would cover half the list, so wait for a tap.
  useEffect(() => {
    if (!isTouchDevice()) searchRef.current?.focus({ preventScroll: true });
  }, []);

  // Keep the page behind the full-screen version from scrolling.
  useEffect(() => {
    if (!layout.full) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [layout.full]);

  const items = useMemo<Item[]>(() => {
    const counts = countUsed(jobAssetUrls);
    const fromTemplates = templates.map((t): Item => {
      // The stored slug and the route slug can differ for older reports.
      const slugs = new Set(
        [reportSlug(t.fileUrl), t.path.split("/")[3]].filter(
          (s): s is string => Boolean(s),
        ),
      );
      let used = 0;
      slugs.forEach((slug) => {
        used += counts.get(slug) || 0;
      });
      return {
        key: `template:${t.id}`,
        name: t.name,
        path: t.path,
        type: t.type ?? null,
        group: groupFor(t.name),
        used,
        words: searchWords(t.name),
      };
    });
    const fromCustom = customForms.map(
      (t): Item => ({
        key: `custom:${t.id}`,
        name: t.name,
        note: t.neta_section,
        path: `/jobs/${jobId}/custom-form/${t.id}/new`,
        type: null,
        group: "Custom Forms",
        used: counts.get(`custom:${t.id}`) || 0,
        words: searchWords(`${t.name} ${t.neta_section || ""}`),
      }),
    );
    const fromInternal = internalForms.map(
      (t): Item => ({
        key: `internal:${t.slug}`,
        name: t.name,
        path: `/jobs/${jobId}/${t.slug}`,
        type: null,
        group: "Internal Forms",
        used: counts.get(t.slug) || 0,
        words: searchWords(t.name),
      }),
    );
    return [...fromTemplates, ...fromCustom, ...fromInternal];
  }, [templates, customForms, internalForms, jobAssetUrls, jobId]);

  const queryWords = toWords(query);
  const searching = queryWords.length > 0;
  const hits = searching ? items.filter((i) => matches(i, queryWords)) : items;

  // Shown under either toggle: a job's own reports are the likeliest pick.
  const usedItems = hits
    .filter((i) => i.used > 0)
    .sort((a, b) => b.used - a.used)
    .slice(0, MAX_USED);
  const usedKeys = new Set(usedItems.map((i) => i.key));
  // A search always opens it, otherwise the matches inside would be hidden.
  const showUsed = usedOpen || searching;

  // While searching, don't list the same report twice.
  const rest = searching ? hits.filter((i) => !usedKeys.has(i.key)) : hits;
  const visible = rest.filter((i) => !i.type || i.type === spec);
  const groups = GROUPS.map((label) => ({
    label,
    items: visible.filter((i) => i.group === label),
  })).filter((g) => g.items.length > 0);

  const otherSpec: ReportSpec = spec === "ATS" ? "MTS" : "ATS";
  const otherCount = searching
    ? rest.filter((i) => i.type === otherSpec).length
    : 0;

  const topResult = searching
    ? (usedItems[0] ?? groups[0]?.items[0] ?? null)
    : null;

  const renderItem = (item: Item, showCount: boolean) => {
    const isTop = item.key === topResult?.key;
    return (
      <Link
        key={item.key}
        to={item.path}
        onClick={onClose}
        className={`flex items-start gap-2 rounded-none px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand touch:py-2.5 dark:text-white dark:hover:bg-dark-200 ${
          isTop ? "bg-neutral-100 dark:bg-dark-200" : ""
        }`}
      >
        <span className="min-w-0 flex-1 break-words">
          {item.name}
          {item.note && (
            <span className="ml-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              ({item.note})
            </span>
          )}
        </span>
        {showCount && (
          <span
            className="shrink-0 pt-0.5 text-xs text-neutral-500 dark:text-neutral-400"
            title={`${item.used} on this job`}
          >
            {item.used}x
          </span>
        )}
        {isTop && (
          <span className="shrink-0 pt-0.5 text-xs text-neutral-500 touch:hidden dark:text-neutral-400">
            Enter
          </span>
        )}
      </Link>
    );
  };

  const groupTitle =
    "px-2 pb-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400";

  const uploads = [
    { label: "Upload file", icon: FileUp, run: onUploadFile },
    { label: "Offline report", icon: CloudUpload, run: onUploadOffline },
    {
      label: "Batch offline reports",
      icon: Layers,
      run: onBatchUploadOffline,
    },
  ];

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Add report"
      className={`fixed flex flex-col overflow-hidden bg-white print:hidden dark:bg-dark-150 ${
        layout.full
          ? "inset-x-0 top-0 z-[70] h-[100dvh] rounded-[0px]"
          : "z-50 rounded-none border border-neutral-200 shadow-xl dark:border-dark-300"
      }`}
      style={
        layout.full
          ? { paddingTop: "env(safe-area-inset-top)" }
          : {
              left: layout.left,
              top: layout.top,
              width: layout.width,
              height: layout.height,
            }
      }
    >
      <div className="shrink-0 border-b border-neutral-200 p-3 dark:border-dark-300">
        {layout.full && (
          <div className="mb-2 flex items-center justify-between">
            <div className="text-lg font-semibold text-neutral-900 dark:text-white">
              Add Report
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-11 w-11 items-center justify-center rounded-none text-neutral-600 hover:bg-neutral-100 dark:text-white dark:hover:bg-dark-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !topResult) return;
                e.preventDefault();
                onClose();
                navigate(topResult.path);
              }}
              placeholder="Search reports..."
              aria-label="Search reports"
              className="h-10 w-full rounded-none border border-neutral-300 bg-white pl-9 pr-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand touch:h-11 touch:text-base dark:border-dark-300 dark:bg-dark-100 dark:text-white"
            />
          </div>
          <div
            className="grid w-40 grid-cols-2 border border-neutral-200 max-sm:w-full dark:border-dark-300"
            role="group"
            aria-label="Report specification"
          >
            {(["ATS", "MTS"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSpec(type)}
                aria-pressed={spec === type}
                className={`h-[38px] text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand touch:h-[42px] ${
                  spec === type
                    ? "bg-brand text-white"
                    : "bg-white text-neutral-700 hover:bg-neutral-100 dark:bg-dark-150 dark:text-white dark:hover:bg-dark-100"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {usedItems.length > 0 && (
          <div className="mb-3 border-b border-neutral-200 pb-3 dark:border-dark-300">
            <button
              type="button"
              onClick={() => setUsedOpen((open) => !open)}
              disabled={searching}
              aria-expanded={showUsed}
              className="flex w-full items-center gap-1 rounded-none px-2 py-1 text-left text-xs font-semibold text-neutral-500 enabled:hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand touch:min-h-[44px] dark:text-neutral-400 dark:enabled:hover:bg-dark-200"
            >
              <ChevronRight
                className={`h-4 w-4 shrink-0 transition-transform ${showUsed ? "rotate-90" : ""}`}
              />
              Used on this job ({usedItems.length})
            </button>
            {showUsed && (
              <div className="mt-1 grid gap-x-4 sm:grid-cols-2">
                {usedItems.map((item) => renderItem(item, true))}
              </div>
            )}
          </div>
        )}

        {/* Fills as many columns as fit: one on a phone, two or three when wider. */}
        <div style={{ columns: "17rem 3", columnGap: "1rem" }}>
          {groups.map((group) => (
            <div key={group.label} className="mb-4 break-inside-avoid rounded-none border border-neutral-200 p-2 dark:border-dark-300">
              <div className={groupTitle}>{group.label}</div>
              {/* Lines sit on a wrapper so rounded theme corners don't curl them. */}
              <div className="divide-y divide-neutral-200 dark:divide-dark-300">
                {group.items.map((item) => (
                  <div key={item.key}>{renderItem(item, false)}</div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {usedItems.length === 0 && groups.length === 0 && (
          <div className="px-2 py-2 text-sm text-neutral-500 dark:text-neutral-400">
            No matching {spec} reports
          </div>
        )}
        {otherCount > 0 && (
          <button
            type="button"
            onClick={() => setSpec(otherSpec)}
            className="px-2 py-1.5 text-sm font-medium text-brand hover:underline"
          >
            {otherCount} more in {otherSpec}
          </button>
        )}
      </div>

      <div
        className="flex shrink-0 flex-wrap items-center gap-1 border-t border-neutral-200 px-3 py-2 dark:border-dark-300"
        style={
          layout.full
            ? { paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }
            : undefined
        }
      >
        <span className="px-2 text-xs font-semibold text-neutral-500 max-sm:w-full dark:text-neutral-400">
          Or upload
        </span>
        {uploads.map(({ label, icon: Icon, run }) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              onClose();
              run();
            }}
            className="inline-flex h-9 items-center gap-2 rounded-none px-2 text-sm text-neutral-700 hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand touch:h-11 dark:text-white dark:hover:bg-dark-200"
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
