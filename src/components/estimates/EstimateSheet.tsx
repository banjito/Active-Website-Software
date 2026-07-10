import React, { useState, useEffect, useRef, useCallback } from "react";
import { Tab, Dialog } from "@headlessui/react";
import {
  X,
  GripHorizontal,
  Copy,
  FileText,
  ImagePlus,
  List,
  ListOrdered,
  SeparatorHorizontal,
  Save,
  Check,
  LogOut,
  Trash,
  Edit,
  BookOpen,
} from "lucide-react";
import {
  LetterImageHandler,
  LetterImageHandlerRef,
} from "./LetterImageHandler";
import { supabase } from "../../lib/supabase";
import { Button } from "../ui/Button";
import { Switch } from "../ui/Switch";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { useAuth } from "../../lib/AuthContext";
import {
  getEstimatingPresets,
  EstimatingPresets,
  DEFAULT_ESTIMATING_PRESETS,
} from "../../services/estimatingPresetsService";
import {
  DEFAULT_PROPOSAL_TEMPLATE_SECTIONS,
  ProposalTemplateSections,
  renderTemplateSection,
  resolveProposalTemplateSections,
} from "./proposalTemplateDefaults";
import {
  createEmptyTravelGroup,
  DEFAULT_TRAVEL_DATA,
  normalizeTravelData,
  computeTravelTotals,
} from "../../lib/travelExpenses";
import {
  fmtMoney,
  fmtMoney0,
  fmtNum,
  numField,
  calcField,
  totalField,
  sectionTitle,
  subLabel,
  SectionNav,
  type SectionNavItem,
} from "./estimateFieldKit";
import { useUserPreferences } from "../../hooks/useUserPreferences";
import { ProposalScopeNotesModal } from "./ProposalScopeNotesModal";
import ScopeLibraryPickerModal from "./ScopeLibraryPickerModal";
import CopyEstimateToOpportunityModal, {
  CopyTargetOpportunity,
} from "./CopyEstimateToOpportunityModal";
import type { EstimatingScopeLibraryItem } from "../../services/estimatingScopeLibraryService";

// Styles from the original code
const styles = {
  app: {
    fontFamily: "Arial, sans-serif",
    margin: "0 auto",
    padding: "20px",
  },
  title: {
    textAlign: "center",
    color: "var(--text-color)",
    marginBottom: "30px",
  },
  headerSection: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "15px",
    marginBottom: "20px",
  },
  formGroup: {
    display: "flex" as const,
    flexDirection: "column" as const,
  },
  formLabel: {
    fontWeight: "bold",
    marginBottom: "5px",
    color: "var(--text-color)",
  },
  formInput: {
    padding: "8px",
    border: "1px solid var(--border-color)",
    borderRadius: "4px",
    backgroundColor: "var(--input-bg)",
    color: "var(--text-color)",
  },
  ratesSection: {
    display: "flex",
    gap: "15px",
    marginBottom: "20px",
  },
  tableContainer: {
    overflowX: "auto" as const,
    marginBottom: "20px",
  },
  table: {
    width: "100%",
    minWidth: "max-content",
    tableLayout: "fixed" as const,
    borderCollapse: "collapse" as const,
    fontSize: "14px",
    backgroundColor: "var(--table-bg)",
  },
  tableHeader: {
    backgroundColor: "var(--header-bg)",
    padding: "10px",
    textAlign: "center" as const,
    border: "1px solid var(--border-color)",
    fontWeight: "bold",
    color: "var(--text-color)",
  },
  tableCell: {
    padding: "5px",
    border: "1px solid var(--border-color)",
    textAlign: "center" as const,
    backgroundColor: "var(--cell-bg)",
    color: "var(--text-color)",
  },
  tableInput: {
    width: "95%",
    padding: "5px",
    border: "1px solid var(--border-color)",
    borderRadius: "4px",
    textAlign: "center" as const,
    backgroundColor: "var(--input-bg)",
    color: "var(--text-color)",
  },
  calculated: {
    backgroundColor: "var(--calculated-bg)",
    fontWeight: "bold",
    color: "var(--text-color)",
  },
  // Blue "auto-calculated" cell — mirrors the field kit's CALC_CLS for inline-style tables.
  calcCell: {
    backgroundColor: "var(--calc-cell-bg)",
    border: "1px solid var(--calc-cell-border)",
    color: "var(--calc-cell-text)",
    fontWeight: 500,
  },
  // Orange "total" cell — mirrors the field kit's TOTAL_CLS for inline-style tables.
  totalCell: {
    backgroundColor: "var(--total-cell-bg)",
    border: "1px solid var(--total-cell-border)",
    color: "var(--total-cell-text)",
    fontWeight: "bold",
  },
  summarySection: {
    marginTop: "20px",
    width: "400px",
    marginLeft: "auto",
    backgroundColor: "var(--summary-bg)",
    padding: "15px",
    borderRadius: "4px",
  },
  // Flat, full-width block for sections rendered inside a SectionNav panel
  // (the panel already provides the card frame + padding).
  panelBlock: {
    width: "100%",
    marginTop: 0,
    marginBottom: "16px",
  },
  // Slim section heading matching the field kit's sectionTitle().
  panelTitle: {
    fontSize: "14px",
    fontWeight: 500,
    color: "var(--text-color)",
    borderBottom: "0.5px solid var(--border-color)",
    paddingBottom: "8px",
    marginBottom: "12px",
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid var(--border-color)",
    color: "var(--text-color)",
  },
  summaryLabel: {
    fontWeight: "bold",
    color: "var(--text-color)",
  },
  summaryValue: {
    textAlign: "right" as const,
    minWidth: "120px",
    color: "var(--text-color)",
  },
  grandTotal: {
    fontSize: "1.2em",
    fontWeight: "bold",
    borderTop: "2px solid var(--border-color)",
    paddingTop: "10px",
    backgroundColor: "var(--total-bg)",
  },
  totalLabel: {
    textAlign: "right",
    fontWeight: "bold",
  },
  totalValue: {
    fontWeight: "bold",
    backgroundColor: "var(--total-bg)",
  },
  tfoot: {
    borderTop: "2px solid var(--border-color)",
  },
  sectionHeader: {
    fontSize: "1.1em",
    fontWeight: "bold",
    backgroundColor: "var(--header-bg)",
    padding: "10px",
    marginTop: "20px",
    marginBottom: "10px",
    color: "var(--text-color)",
  },
};

interface EstimateSheetProps {
  opportunityId: string;
  mode?: "new" | "view" | "letter" | "letters" | "combined-letter";
  openSignal?: number;
  preferredEstimateId?: string | null;
  onActiveEstimateChange?: (estimateId: string | null) => void;
}

interface OpportunityData {
  title?: string;
  description: string;
  quote_number?: string;
  jobsite_location?: string;
  customer: {
    id: string;
    name: string;
    company_name: string;
    address: string;
  };
}

type EstimateLineItemRowType = "item" | "section" | "subsection" | "blank";

interface EstimateLineItem {
  rowType?: EstimateLineItemRowType;
  item: string;
  quantity: number | string;
  materialPrice: number | string;
  expensePrice: number | string;
  laborMen: number | string;
  laborHours: number | string;
  notes: string;
}

interface EstimateData {
  // Optional custom title shown in tabs and selectors; falls back to Quote <number>
  title?: string;
  client: string;
  jobDescription: string;
  dateDue: string;
  location: string;
  periodOfPerformance: string;
  estimatedStartDate: string;
  poNumber: string;
  notes: string;

  // SOV items (the main items)
  sovItems: EstimateLineItem[];

  // Proposal display toggles. These only affect what the generated proposal
  // shows under "Scope"; the SOV items above always drive pricing regardless.
  // When true (default), the proposal includes the SOV Item & Quantity table.
  useSovItems?: boolean;
  // When true, the proposal includes `scopeNarrative` as free text. Can be used
  // alongside or instead of the SOV table (e.g. for abstract scopes).
  useScopeNarrative?: boolean;
  // Free-text scope description used for abstract scopes (proposal display only).
  scopeNarrative?: string;

  // Non-SOV items (reports, shipping, etc.)
  nonSovItems: EstimateLineItem[];

  calculatedValues: {
    subtotalMaterial: number;
    subtotalExpense: number;
    subtotalLabor: number;
    totalMaterial: number;
    totalExpense: number;
    totalLabor: number;
    grandTotal: number;

    // New fields for Non-SOV
    nonSovMaterial: number;
    nonSovExpense: number;
    nonSovLabor: number;

    // Summary fields
    sovLaborHours: number;
    nonSovLaborHours: number;
    totalLaborHours: number;
  };

  // Hours summary section
  hoursSummary: {
    men: number;
    hoursPerDay: number;
    daysOnsite: number;
    workHours: number;
    nonSovHours: number;
    travelHours: number;
    totalHours: number;
    // Labor rate breakdown
    straightTimeHours: number;
    overtimeHours: number;
    doubleTimeHours: number;
    // Travel hours allocated in labor tracking table
    travelStraightTimeHours: number;
    travelOvertimeHours: number;
    travelDoubleTimeHours: number;
  };

  // Saturday labor hours tracking (alternate scenario)
  saturdayHoursSummary?: {
    straightTimeHours: number;
    overtimeHours: number;
    doubleTimeHours: number;
    travelStraightTimeHours: number;
    travelOvertimeHours: number;
    travelDoubleTimeHours: number;
  };

  // Sunday/Holiday labor hours tracking (alternate scenario)
  sundayHoursSummary?: {
    straightTimeHours: number;
    overtimeHours: number;
    doubleTimeHours: number;
    travelStraightTimeHours: number;
    travelOvertimeHours: number;
    travelDoubleTimeHours: number;
  };
}

const DEFAULT_LINE_COUNT = 5;
const EMPTY_LINE_ITEM: EstimateLineItem = {
  rowType: "item",
  item: "",
  quantity: 0,
  materialPrice: 0,
  expensePrice: 0,
  laborMen: 0,
  laborHours: 0,
  notes: "",
};

const createEmptyLineItem = (): EstimateLineItem => ({ ...EMPTY_LINE_ITEM });

const createSectionLineItem = (): EstimateLineItem => ({
  ...EMPTY_LINE_ITEM,
  rowType: "section",
  item: "New Section",
});

const createSubsectionLineItem = (): EstimateLineItem => ({
  ...EMPTY_LINE_ITEM,
  rowType: "subsection",
  item: "New Sub-Section",
});

const createBlankLineItem = (): EstimateLineItem => ({
  ...EMPTY_LINE_ITEM,
  rowType: "blank",
});

const createLineItemForRowType = (
  rowType: EstimateLineItemRowType = "item",
): EstimateLineItem => {
  if (rowType === "section") return createSectionLineItem();
  if (rowType === "subsection") return createSubsectionLineItem();
  if (rowType === "blank") return createBlankLineItem();
  return createEmptyLineItem();
};

const createDefaultLineItems = (): EstimateLineItem[] =>
  Array(DEFAULT_LINE_COUNT)
    .fill(null)
    .map(() => createEmptyLineItem());

const isEstimateSectionRow = (item: any) => item?.rowType === "section";
const isEstimateSubsectionRow = (item: any) => item?.rowType === "subsection";
const isEstimateBlankRow = (item: any) => item?.rowType === "blank";
const isStructuralLineItem = (item: any) =>
  isEstimateSectionRow(item) || isEstimateSubsectionRow(item) || isEstimateBlankRow(item);

const normalizeEstimateLineItem = (item: any): EstimateLineItem => {
  const rowType: EstimateLineItemRowType =
    item?.rowType === "section" ||
    item?.rowType === "subsection" ||
    item?.rowType === "blank"
      ? item.rowType
      : "item";

  return {
    ...EMPTY_LINE_ITEM,
    ...(item || {}),
    rowType,
  };
};

const normalizeEstimateLineItems = (
  items: any,
  fallback: EstimateLineItem[],
): EstimateLineItem[] => {
  if (!Array.isArray(items) || items.length === 0) {
    return fallback.map((item) => normalizeEstimateLineItem(item));
  }

  return items.map(normalizeEstimateLineItem);
};

const shouldShowSovItemInProposal = (item: any): boolean => {
  if (isEstimateBlankRow(item)) return true;
  const name = (item?.item ?? "").toString().trim();
  if (isEstimateSectionRow(item)) return name.length > 0;
  if (isEstimateSubsectionRow(item)) return name.length > 0;

  const hasQty = Number(item?.quantity) > 0;
  const hasAnyCost = [
    item?.materialPrice,
    item?.expensePrice,
    item?.laborMen,
    item?.laborHours,
  ].some((value: any) => Number(value) > 0);

  return name.length > 0 || hasQty || hasAnyCost;
};

// Default Non-SOV items
const DEFAULT_NON_SOV_ITEMS: EstimateLineItem[] = [
  {
    ...EMPTY_LINE_ITEM,
    item: "Reports",
    quantity: 1,
  },
  {
    ...EMPTY_LINE_ITEM,
    item: "Project Management",
    quantity: 1,
  },
  {
    ...EMPTY_LINE_ITEM,
    item: "Shipping/ Postage",
    quantity: 1,
  },
  {
    ...EMPTY_LINE_ITEM,
    item: "Equipment Rental",
    quantity: 1,
  },
  {
    ...EMPTY_LINE_ITEM,
    item: "Equipment Purchase",
    quantity: 1,
  },
];

const createDefaultNonSovItems = (): EstimateLineItem[] =>
  DEFAULT_NON_SOV_ITEMS.map((item) => normalizeEstimateLineItem(item));


interface QuoteData {
  id: string;
  created_at: string;
  data: any;
  travel_data: any;
  quote_number?: string;
  status?:
    | "in_progress"
    | "ready_for_review"
    | "approved_to_send"
    | "sent"
    | "no_quote"
    | null;
}

/**
 * Strip the invisible block "cruft" that bloats printed letter proposals.
 *
 * The letter editor runs inside the app, where Tailwind's Preflight resets
 * <p>/<heading> margins to 0. So empty or <br>-only paragraphs — typically left
 * behind when pasting from Word/Outlook, or after deleting text — collapse to a
 * single modest line and look harmless while editing. The print window
 * (handlePrintLetter) is a bare window.open with no Preflight, so the browser's
 * default stylesheet restores ~1em top+bottom margins on every <p>, and a stack
 * of those empty paragraphs balloons into page-sized gaps that are impossible to
 * see (or delete) in the editor. We remove the Word cruft and collapse runs of
 * empty blocks so the printed output matches what the user sees.
 *
 * Mutates `root` in place. Safe to run on the live editor or a detached clone.
 */
function sanitizeLetterHtmlNode(root: HTMLElement): void {
  // Word/Outlook paste leftovers that never belong in the letter body.
  root
    .querySelectorAll("o\\:p, style, meta, link, xml, title")
    .forEach((el) => el.remove());

  // A block is "empty" when it carries no real content — only whitespace,
  // non-breaking spaces, and/or <br> line breaks. Intentional structural
  // elements (page breaks, scope spacers) and anything holding media/tables/
  // lists are never treated as empty.
  const isEmptyBlock = (el: Element): boolean => {
    if (
      el.classList.contains("amp-page-break") ||
      el.classList.contains("amp-scope-spacer")
    )
      return false;
    if (el.querySelector("img, table, ul, ol, li, hr, svg, input, iframe"))
      return false;
    const text = el.textContent || "";
    return (
      text
        .replace(/\u00a0/g, "")
        .replace(/\u200b/g, "")
        .replace(/\u200c/g, "")
        .replace(/\u200d/g, "")
        .replace(/\ufeff/g, "")
        .trim() === ""
    );
  };

  // Collapse runs of consecutive empty blocks down to a single blank line, so
  // even a pathological stack of pasted blank paragraphs can't open a page gap.
  const blocks = Array.from(root.querySelectorAll<HTMLElement>("p, div"));
  for (const block of blocks) {
    if (!block.isConnected || !isEmptyBlock(block)) continue;
    let next = block.nextElementSibling;
    while (next && isEmptyBlock(next)) {
      const toRemove = next;
      next = next.nextElementSibling;
      toRemove.remove();
    }
    // Normalize the surviving blank line to a margin-free <br> placeholder.
    block.replaceWith(document.createElement("br"));
  }
}

/** Labor rates from each estimate's saved JSON — combined letters must not use the active tab's rates for every scope. */
function getHourlyRatesForCombinedScope(parsedData: any): {
  straightTime: number;
  overtime: number;
  doubleTime: number;
} {
  const hr = parsedData?.hourlyRates;
  if (hr && typeof hr === "object") {
    const st = Number(hr.straightTime);
    const ot = Number(hr.overtime);
    const dt = Number(hr.doubleTime);
    return {
      straightTime: Number.isFinite(st)
        ? st
        : DEFAULT_ESTIMATING_PRESETS.default_hourly_rate,
      overtime: Number.isFinite(ot)
        ? ot
        : DEFAULT_ESTIMATING_PRESETS.overtime_rate,
      doubleTime: Number.isFinite(dt)
        ? dt
        : DEFAULT_ESTIMATING_PRESETS.double_time_rate,
    };
  }
  return {
    straightTime: DEFAULT_ESTIMATING_PRESETS.default_hourly_rate,
    overtime: DEFAULT_ESTIMATING_PRESETS.overtime_rate,
    doubleTime: DEFAULT_ESTIMATING_PRESETS.double_time_rate,
  };
}

const DEFAULT_MOBILIZATION_FACTORS = {
  base: 0.0,
  over100k: 0.1,
  over500k: 0.05,
  over1m: 0.05,
};

const DEFAULT_PAYMENT_TERM_FACTORS = {
  net30: 1.0,
  net60: 1.06,
  net90: 1.09,
};

/** Payment-term factors are price multipliers, so a saved 0 / negative / non-numeric factor
 * (e.g. a cleared input persisted as 0) zeroes out every NET price — fall back per key. */
function sanitizePaymentTermFactors(raw: unknown): {
  net30: number;
  net60: number;
  net90: number;
} {
  const src = (
    raw && typeof raw === "object" ? raw : {}
  ) as Record<string, unknown>;
  const pick = (key: "net30" | "net60" | "net90") => {
    const n = Number(src[key]);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_PAYMENT_TERM_FACTORS[key];
  };
  return { net30: pick("net30"), net60: pick("net60"), net90: pick("net90") };
}

/** Mobilization factors from each estimate's saved JSON — combined letters must not use the active tab's factors for every scope. */
function getMobilizationFactorsForCombinedScope(parsedData: any): {
  base: number;
  over100k: number;
  over500k: number;
  over1m: number;
} {
  const mf = parsedData?.mobilizationFactors;
  if (mf && typeof mf === "object") {
    const b = Number(mf.base);
    const k = Number(mf.over100k);
    const fk = Number(mf.over500k);
    const m = Number(mf.over1m);
    return {
      base: Number.isFinite(b) ? b : DEFAULT_MOBILIZATION_FACTORS.base,
      over100k: Number.isFinite(k) ? k : DEFAULT_MOBILIZATION_FACTORS.over100k,
      over500k: Number.isFinite(fk)
        ? fk
        : DEFAULT_MOBILIZATION_FACTORS.over500k,
      over1m: Number.isFinite(m) ? m : DEFAULT_MOBILIZATION_FACTORS.over1m,
    };
  }
  return { ...DEFAULT_MOBILIZATION_FACTORS };
}

/** Pure mobilization-factor lookup that works with any factors object (not just component state). */
function computeMobilizationFactor(
  finalValue: number,
  factors: { base: number; over100k: number; over500k: number; over1m: number },
) {
  if (finalValue > 1000000) return factors.over1m;
  if (finalValue > 500000) return factors.over500k;
  if (finalValue > 100000) return factors.over100k;
  return factors.base;
}

// Copy-to-clipboard buttons for symbols that are awkward to type (≥ / ≤).
// Used in both the estimate sheet header and the letter proposal toolbar so
// the symbol can be pasted anywhere as plain text.
const SYMBOL_COPY_ITEMS: { symbol: string; label: string }[] = [
  { symbol: "≥", label: "Copy ≥ (greater than or equal to)" },
  { symbol: "≤", label: "Copy ≤ (less than or equal to)" },
];

function SymbolCopyButtons({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copySymbol = async (symbol: string) => {
    try {
      await navigator.clipboard.writeText(symbol);
    } catch {
      // Fallback for insecure contexts / older browsers
      const ta = document.createElement("textarea");
      ta.value = symbol;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {}
      document.body.removeChild(ta);
    }
    setCopied(symbol);
    window.setTimeout(
      () => setCopied((current) => (current === symbol ? null : current)),
      1200,
    );
  };

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {SYMBOL_COPY_ITEMS.map(({ symbol, label }) => (
        <button
          key={symbol}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            copySymbol(symbol);
          }}
          title={label}
          aria-label={label}
          className="inline-flex h-10 w-10 items-center justify-center rounded-none border border-[#f26722] bg-white text-base font-semibold leading-none text-[#f26722] transition-colors hover:bg-[#f26722] hover:text-white dark:bg-[#f26722] dark:text-white dark:hover:bg-[#d95d1d]"
        >
          {copied === symbol ? "✓" : symbol}
        </button>
      ))}
    </div>
  );
}

export default function EstimateSheet({
  opportunityId,
  mode,
  openSignal,
  preferredEstimateId,
  onActiveEstimateChange,
}: EstimateSheetProps) {
  const theme = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
  const [isOpen, setIsOpen] = useState(true);
  const [quotes, setQuotes] = useState<QuoteData[]>([]);
  const [selectedQuoteIndex, setSelectedQuoteIndex] = useState<number>(-1);
  const [isNewQuote, setIsNewQuote] = useState(true);
  const [hasQuote, setHasQuote] = useState(false);
  const [estimateStatus, setEstimateStatus] = useState<
    | "in_progress"
    | "ready_for_review"
    | "approved_to_send"
    | "sent"
    | "no_quote"
    | null
  >(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopyToOpportunityOpen, setIsCopyToOpportunityOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showTravel, setShowTravel] = useState(false);
  const [isGettingData, setIsGettingData] = useState(true);
  const [opportunityData, setOpportunityData] =
    useState<OpportunityData | null>(null);
  const [isManualLaborHours, setIsManualLaborHours] = useState(false);
  const [isManualTravelLaborHours, setIsManualTravelLaborHours] =
    useState(false);
  const [showSaturdayHours, setShowSaturdayHours] = useState(false);
  const [showSundayHours, setShowSundayHours] = useState(false);
  const [isManualSaturdayHours, setIsManualSaturdayHours] = useState(false);
  const [isManualSundayHours, setIsManualSundayHours] = useState(false);
  const [letterPaymentTerm, setLetterPaymentTerm] = useState<
    "net30" | "net60" | "net90"
  >("net30");
  // Which payment term's price is displayed in the SOV item price column
  const [selectedSovPriceTerm, setSelectedSovPriceTerm] = useState<
    "net30" | "net60" | "net90"
  >("net30");
  const [letterShowAllTerms, setLetterShowAllTerms] = useState(true);
  const [letterIncludeMF, setLetterIncludeMF] = useState(true);
  const [letterIncludeSaturday, setLetterIncludeSaturday] = useState(false);
  const [letterIncludeSunday, setLetterIncludeSunday] = useState(false);
  const [letterIncludeSovNotes, setLetterIncludeSovNotes] = useState(false);
  // Active section in the Travel Expenses nav/panel layout.
  const [activeTravelSection, setActiveTravelSection] = useState<
    "travel" | "perDiem" | "lodging" | "localMiles" | "airTravel" | "rentalCar"
  >("travel");
  // Active panel in the calc/summary nav (Hours & Labor / Payment+Mobilization / Financial).
  const [activeSummarySection, setActiveSummarySection] = useState<
    "hoursLabor" | "terms" | "financial"
  >("hoursLabor");
  // Transient "Copied!" feedback for the quote-terms copy button.
  const [quoteTextCopied, setQuoteTextCopied] = useState(false);
  const { user } = useAuth(); // Get user at component level
  const { preferences, updatePreference, deletePreference } =
    useUserPreferences();
  const getCurrentUserPreparedByName = useCallback(async () => {
    if (!user) return "";

    const fallbackName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email ||
      "";

    try {
      const { data: profile } = await supabase
        .schema("common")
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle();

      return profile?.full_name || profile?.email || fallbackName;
    } catch (error) {
      console.error("Failed to fetch quote prepared by profile:", error);
      return fallbackName;
    }
  }, [user]);

  // State for the travel data object - uses DEFAULT_TRAVEL_DATA so all arrays are always defined
  const [travelData, setTravelData] = useState({ ...DEFAULT_TRAVEL_DATA });

  // State for the main data object
  const [data, setData] = useState<EstimateData>(() => {
    const defaults: EstimateData = {
      title: "",
      client: "",
      jobDescription: "",
      dateDue: "",
      location: "",
      periodOfPerformance: "",
      estimatedStartDate: "",
      poNumber: "",
      notes: "",
      sovItems: createDefaultLineItems(),
      nonSovItems: createDefaultNonSovItems(),
      calculatedValues: {
        subtotalMaterial: 0,
        subtotalExpense: 0,
        subtotalLabor: 0,
        totalMaterial: 0,
        totalExpense: 0,
        totalLabor: 0,
        grandTotal: 0,
        nonSovMaterial: 0,
        nonSovExpense: 0,
        nonSovLabor: 0,
        sovLaborHours: 0,
        nonSovLaborHours: 0,
        totalLaborHours: 0,
      },
      hoursSummary: {
        men: DEFAULT_ESTIMATING_PRESETS.default_number_of_men,
        hoursPerDay: DEFAULT_ESTIMATING_PRESETS.default_hours_per_day,
        daysOnsite: 0,
        workHours: 0,
        nonSovHours: 0,
        travelHours: 0,
        totalHours: 0,
        straightTimeHours: 0,
        overtimeHours: 0,
        doubleTimeHours: 0,
        travelStraightTimeHours: 0,
        travelOvertimeHours: 0,
        travelDoubleTimeHours: 0,
      },
    };
    // Initial data is loaded from Supabase preferences in useEffect below
    return defaults;
  });

  // Track fields temporarily displayed as blank (for backspace over 0)
  const [blankingKeys, setBlankingKeys] = useState<Set<string>>(new Set());
  const makeKey = (section: "sov" | "nonSov", index: number, field: string) =>
    `${section}:${index}:${field}`;

  // Drag and drop state
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [draggedItemType, setDraggedItemType] = useState<
    "sov" | "nonSov" | null
  >(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Tab drag and drop state
  const [draggedTabIndex, setDraggedTabIndex] = useState<number | null>(null);
  const [dragOverTabIndex, setDragOverTabIndex] = useState<number | null>(null);
  const isDraggingTabRef = useRef<boolean>(false);

  // Payment term factors state
  const [paymentTermFactors, setPaymentTermFactors] = useState({
    ...DEFAULT_PAYMENT_TERM_FACTORS,
  });

  // Mobilization factors state (threshold-based)
  // base: <= 100,000; over100k: > 100,000; over500k: > 500,000; over1m: > 1,000,000
  const [mobilizationFactors, setMobilizationFactors] = useState({
    base: 0.0,
    over100k: 0.1,
    over500k: 0.05,
    over1m: 0.05,
  });
  // Quantity for this estimate when included in a combined letter proposal (default 1)
  const [combinedLetterQuantity, setCombinedLetterQuantity] =
    useState<number>(1);
  const draftKey = `estimate-draft-${opportunityId}`;
  const skipNextFocusRef = React.useRef<boolean>(false);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [draftRestored, setDraftRestored] = useState<boolean>(false);
  const [scopeLibraryPicker, setScopeLibraryPicker] = useState<{
    open: boolean;
    section: "sov" | "nonSov";
    index: number;
  } | null>(null);

  // Clear justSaved indicator when edits are made
  useEffect(() => {
    if (isDirty) setJustSaved(false);
  }, [isDirty]);

  const [selectedSovItemIndexes, setSelectedSovItemIndexes] = useState<
    number[]
  >([]);
  const [copyTargetQuoteId, setCopyTargetQuoteId] = useState<string>("");
  const [newCopyEstimateTitle, setNewCopyEstimateTitle] = useState<string>("");
  const [isCopyingSovItems, setIsCopyingSovItems] = useState<boolean>(false);
  const DEFAULT_ITEM_COL_WIDTH = 240;
  const MAX_ITEM_COL_WIDTH = 1200; // clamp so columns never render "really long" (e.g. Windows/cross-browser)
  const estimateColWidthKey = "estimateItemColWidth";

  const clampColWidth = (w: number) =>
    Math.max(
      1,
      Math.min(MAX_ITEM_COL_WIDTH, Number(w) || DEFAULT_ITEM_COL_WIDTH),
    );
  const toPx = (w: number) => `${clampColWidth(w)}px`;

  const [itemColWidth, setItemColWidth] = useState<number>(() => {
    const saved = preferences?.ui?.[estimateColWidthKey];
    return typeof saved === "number" && saved > 0
      ? clampColWidth(saved)
      : DEFAULT_ITEM_COL_WIDTH;
  });
  const [nonSovItemColWidth, setNonSovItemColWidth] = useState<number>(() => {
    const saved = preferences?.ui?.[estimateColWidthKey];
    return typeof saved === "number" && saved > 0
      ? clampColWidth(saved)
      : DEFAULT_ITEM_COL_WIDTH;
  });

  // Apply saved column width once when preferences first load (clamped so huge saved values don't break layout)
  const appliedSavedColWidthRef = useRef(false);
  useEffect(() => {
    if (appliedSavedColWidthRef.current) return;
    if (preferences?.ui === undefined) return; // prefs not loaded yet
    appliedSavedColWidthRef.current = true;
    const saved = preferences.ui[estimateColWidthKey];
    if (typeof saved === "number" && saved > 0) {
      const w = clampColWidth(saved);
      setItemColWidth(w);
      setNonSovItemColWidth(w);
    }
  }, [preferences?.ui]);

  // Persist column width when user resizes (debounced) so it sticks across sessions and devices
  useEffect(() => {
    if (!appliedSavedColWidthRef.current) return;
    const t = setTimeout(() => {
      const w = clampColWidth(itemColWidth);
      updatePreference(`ui.${estimateColWidthKey}`, w);
    }, 1000);
    return () => clearTimeout(t);
  }, [itemColWidth, updatePreference]);

  const itemHeaderRef = useRef<HTMLTableCellElement>(null);
  const nonSovItemHeaderRef = useRef<HTMLTableCellElement>(null);
  const isResizingItemRef = useRef(false);
  const isResizingNonSovRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const startNonSovWidthRef = useRef(0);
  const [isResizing, setIsResizing] = useState(false);

  const onItemMouseDown = (e: React.MouseEvent) => {
    if (!itemHeaderRef.current) return;
    isResizingItemRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = itemColWidth;
    setIsResizing(true);
    e.preventDefault();
  };

  const onNonSovItemMouseDown = (e: React.MouseEvent) => {
    if (!nonSovItemHeaderRef.current) return;
    isResizingNonSovRef.current = true;
    startXRef.current = e.clientX;
    startNonSovWidthRef.current = nonSovItemColWidth;
    setIsResizing(true);
    e.preventDefault();
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (isResizingItemRef.current) {
      const delta = e.clientX - startXRef.current;
      setItemColWidth(Math.max(1, startWidthRef.current + delta));
    } else if (isResizingNonSovRef.current) {
      const delta = e.clientX - startXRef.current;
      setNonSovItemColWidth(Math.max(1, startNonSovWidthRef.current + delta));
    }
    e.preventDefault();
  };

  const onMouseUp = () => {
    if (isResizingItemRef.current) {
      isResizingItemRef.current = false;
    }
    if (isResizingNonSovRef.current) {
      isResizingNonSovRef.current = false;
    }
    setIsResizing(false);
  };

  // Document-level listeners so resize keeps working when cursor leaves the table (e.g. small window)
  useEffect(() => {
    if (!isResizing) return;
    const moveHandler = (e: MouseEvent) => {
      if (isResizingItemRef.current) {
        const delta = e.clientX - startXRef.current;
        setItemColWidth(Math.max(1, startWidthRef.current + delta));
      } else if (isResizingNonSovRef.current) {
        const delta = e.clientX - startXRef.current;
        setNonSovItemColWidth(Math.max(1, startNonSovWidthRef.current + delta));
      }
      e.preventDefault();
    };
    const upHandler = () => {
      isResizingItemRef.current = false;
      isResizingNonSovRef.current = false;
      setIsResizing(false);
    };
    document.addEventListener("mousemove", moveHandler, true);
    document.addEventListener("mouseup", upHandler, true);
    return () => {
      document.removeEventListener("mousemove", moveHandler, true);
      document.removeEventListener("mouseup", upHandler, true);
    };
  }, [isResizing]);

  // Fetch opportunity data
  useEffect(() => {
    async function fetchOpportunityData() {
      try {
        // 1. Fetch Opportunity from business schema
        const opportunityColumns =
          "id, title, description, customer_id, contact_id, quote_number, jobsite_location";
        const { data: oppData, error: oppError } = await supabase
          .schema("business")
          .from("opportunities")
          .select(opportunityColumns)
          .eq("id", opportunityId)
          .single();

        if (oppError) {
          console.error("Error fetching opportunity data:", oppError);
          throw oppError;
        }

        if (!oppData) {
          console.error("Opportunity not found:", opportunityId);
          return;
        }

        // 2. Fetch Customer from common schema if customer_id exists
        let customerInfo: OpportunityData["customer"] | null = null;
        if (oppData.customer_id) {
          const { data: custData, error: custError } = await supabase
            .schema("common")
            .from("customers")
            .select("id, name, company_name, address")
            .eq("id", oppData.customer_id)
            .single<OpportunityData["customer"]>();
          if (!custError && custData) {
            customerInfo = custData;
          }
          // Fetch the specific contact linked to the opportunity, not the customer's primary contact
          if (oppData.contact_id) {
            const { data: contactInfo, error: contactError } = await supabase
              .schema("common")
              .from("contacts")
              .select("first_name, last_name")
              .eq("id", oppData.contact_id)
              .single();
            if (!contactError && contactInfo) {
              setContactData(contactInfo);
            } else {
              console.warn(
                "Could not fetch opportunity contact, falling back to customer primary contact",
              );
              // Fallback to customer primary contact if opportunity contact not found
              const { data: contactList, error: fallbackError } = await supabase
                .schema("common")
                .from("contacts")
                .select("first_name, last_name, is_primary")
                .eq("customer_id", oppData.customer_id)
                .order("is_primary", { ascending: false });
              if (!fallbackError && contactList && contactList.length > 0) {
                const primary = contactList.find((c: any) => c.is_primary);
                setContactData(primary || contactList[0]);
              } else {
                setContactData(null);
              }
            }
          } else {
            console.warn(
              "No contact_id on opportunity, using customer primary contact",
            );
            // No contact_id on opportunity, use customer primary contact
            const { data: contactList, error: contactError } = await supabase
              .schema("common")
              .from("contacts")
              .select("first_name, last_name, is_primary")
              .eq("customer_id", oppData.customer_id)
              .order("is_primary", { ascending: false });
            if (!contactError && contactList && contactList.length > 0) {
              const primary = contactList.find((c: any) => c.is_primary);
              setContactData(primary || contactList[0]);
            } else {
              setContactData(null);
            }
          }
        } else {
          setContactData(null);
        }

        // 3. Combine data and set state
        const transformedData = {
          title: oppData.title,
          description: oppData.description || "",
          quote_number: (oppData as any).quote_number || "",
          jobsite_location: oppData.jobsite_location,
          customer: customerInfo || {
            id: "",
            name: "",
            company_name: "",
            address: "",
          },
        };
        setOpportunityData(transformedData);
        const customerName =
          transformedData.customer.company_name ||
          transformedData.customer.name ||
          "";
        setData((prev) => ({
          ...prev,
          client: customerName,
          jobDescription: transformedData.description,
          location: transformedData.customer.address || "",
        }));
      } catch (error) {
        console.error("Error in fetchOpportunityData useEffect:", error);
      }
    }
    if (opportunityId) {
      fetchOpportunityData();
    }
  }, [opportunityId]);

  // Only fetch existing estimates automatically when not actively editing a new quote
  useEffect(() => {
    if (!isOpen || !isNewQuote) {
      fetchEstimateData();
    }
  }, [opportunityId, isOpen, isNewQuote]);

  useEffect(() => {
    if (!onActiveEstimateChange || isNewQuote || selectedQuoteIndex < 0) return;

    const activeQuoteId = quotes[selectedQuoteIndex]?.id;
    if (activeQuoteId) {
      onActiveEstimateChange(activeQuoteId);
    }
  }, [isNewQuote, onActiveEstimateChange, quotes, selectedQuoteIndex]);

  // Restore draft from Supabase preferences when opening 'new' estimate for this opportunity
  useEffect(() => {
    if (!opportunityId) return;
    if (isOpen && isNewQuote) {
      const savedDraft = preferences.drafts?.[draftKey];
      if (savedDraft && typeof savedDraft === "object") {
        // Extract payment term factors if they exist
        const {
          paymentTermFactors: savedFactors,
          mobilizationFactors: savedMobilization,
          ...restData
        } = savedDraft;
        const restoredData: any = { ...restData };
        if (Array.isArray(restoredData.sovItems)) {
          restoredData.sovItems = normalizeEstimateLineItems(
            restoredData.sovItems,
            createDefaultLineItems(),
          );
        }
        if (Array.isArray(restoredData.nonSovItems)) {
          restoredData.nonSovItems = normalizeEstimateLineItems(
            restoredData.nonSovItems,
            createDefaultNonSovItems(),
          );
        }

        // Restore data
        setData((prev) => ({ ...prev, ...restoredData }));

        // Restore payment term factors if they exist
        if (savedFactors && typeof savedFactors === "object") {
          setPaymentTermFactors((prev) =>
            sanitizePaymentTermFactors({ ...prev, ...savedFactors }),
          );
        }
        // Restore mobilization factors if they exist
        if (savedMobilization && typeof savedMobilization === "object") {
          setMobilizationFactors((prev) =>
            getMobilizationFactorsForCombinedScope({
              mobilizationFactors: { ...prev, ...savedMobilization },
            }),
          );
        }
        // Restore quantity for combined letter if in draft
        if (
          savedDraft.combinedLetterQuantity !== undefined &&
          savedDraft.combinedLetterQuantity !== null
        ) {
          const qty = Math.max(
            1,
            Math.floor(Number(savedDraft.combinedLetterQuantity)) || 1,
          );
          setCombinedLetterQuantity(qty);
        } else {
          setCombinedLetterQuantity(1);
        }
        // Restore selected SOV price term if present in draft
        if (
          savedDraft.selectedSovPriceTerm &&
          ["net30", "net60", "net90"].includes(savedDraft.selectedSovPriceTerm)
        ) {
          setSelectedSovPriceTerm(savedDraft.selectedSovPriceTerm);
        }

        setDraftRestored(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isNewQuote, opportunityId, preferences.drafts]);

  // Persist draft to Supabase preferences on changes while editing a new quote
  useEffect(() => {
    if (!opportunityId) return;
    if (isOpen && isNewQuote) {
      const draftData = {
        ...data,
        paymentTermFactors,
        mobilizationFactors,
        combinedLetterQuantity,
        selectedSovPriceTerm,
      };
      // Save to Supabase (debounced by the service)
      updatePreference(`drafts.${draftKey}`, draftData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    data,
    paymentTermFactors,
    mobilizationFactors,
    combinedLetterQuantity,
    selectedSovPriceTerm,
    isOpen,
    isNewQuote,
    opportunityId,
  ]);

  // Function to get saved tab order from Supabase preferences
  const getSavedTabOrder = useCallback((): string[] | null => {
    const tabOrderKey = `estimate-tab-order-${opportunityId}`;
    const saved = preferences.ui?.[tabOrderKey];
    return Array.isArray(saved) ? saved : null;
  }, [opportunityId, preferences.ui]);

  // Function to save tab order to Supabase preferences
  const saveTabOrder = useCallback(
    (quoteIds: string[]) => {
      const tabOrderKey = `estimate-tab-order-${opportunityId}`;
      updatePreference(`ui.${tabOrderKey}`, quoteIds);
    },
    [opportunityId, updatePreference],
  );

  // Letter proposal preference keys
  const letterDraftKey = `letter-proposal-draft-${opportunityId}`;
  const letterOpenKey = `letter-proposal-open-${opportunityId}`;
  const letterQuoteIndexKey = `letter-quote-index-${opportunityId}`;
  const letterNetaStandardKey = `letter-neta-standard-${opportunityId}`;

  // Helper to get letter proposal state from Supabase preferences
  const getLetterProposalState = useCallback(() => {
    return {
      html: preferences.drafts?.[letterDraftKey] as string | null,
      isOpen:
        preferences.ui?.[letterOpenKey] === true ||
        preferences.ui?.[letterOpenKey] === "true",
      quoteIndex: preferences.ui?.[letterQuoteIndexKey] as number | null,
      netaStandard: preferences.ui?.[letterNetaStandardKey] as string | null,
    };
  }, [
    preferences.drafts,
    preferences.ui,
    letterDraftKey,
    letterOpenKey,
    letterQuoteIndexKey,
    letterNetaStandardKey,
  ]);

  // Helper to save letter proposal HTML to Supabase (debounced by service)
  const saveLetterProposalHtml = useCallback(
    (html: string) => {
      updatePreference(`drafts.${letterDraftKey}`, html);
    },
    [updatePreference, letterDraftKey],
  );

  // Helper to save letter proposal open state
  const saveLetterProposalOpen = useCallback(
    (isOpen: boolean) => {
      updatePreference(`ui.${letterOpenKey}`, isOpen);
    },
    [updatePreference, letterOpenKey],
  );

  // Helper to save letter quote index
  const saveLetterQuoteIndex = useCallback(
    (index: number | null) => {
      if (index !== null) {
        updatePreference(`ui.${letterQuoteIndexKey}`, index);
      }
    },
    [updatePreference, letterQuoteIndexKey],
  );

  // Helper to save letter NETA standard
  const saveLetterNetaStandard = useCallback(
    (standard: string) => {
      if (standard) {
        updatePreference(`ui.${letterNetaStandardKey}`, standard);
      }
    },
    [updatePreference, letterNetaStandardKey],
  );

  // Helper to clear all letter proposal state from Supabase
  const clearLetterProposalState = useCallback(async () => {
    await Promise.all([
      deletePreference(`drafts.${letterDraftKey}`),
      deletePreference(`ui.${letterOpenKey}`),
      deletePreference(`ui.${letterQuoteIndexKey}`),
      deletePreference(`ui.${letterNetaStandardKey}`),
    ]);
  }, [
    deletePreference,
    letterDraftKey,
    letterOpenKey,
    letterQuoteIndexKey,
    letterNetaStandardKey,
  ]);

  // Function to apply saved order to quotes
  const applySavedOrder = (quotes: QuoteData[]): QuoteData[] => {
    const savedOrder = getSavedTabOrder();
    if (!savedOrder || savedOrder.length === 0) {
      return quotes;
    }

    // Create a map for quick lookup
    const quoteMap = new Map(quotes.map((q) => [q.id, q]));

    // Reorder based on saved order, then append any new quotes not in saved order
    const ordered: QuoteData[] = [];
    const usedIds = new Set<string>();

    for (const id of savedOrder) {
      if (quoteMap.has(id)) {
        ordered.push(quoteMap.get(id)!);
        usedIds.add(id);
      }
    }

    // Add any quotes that weren't in the saved order (new quotes)
    for (const quote of quotes) {
      if (!usedIds.has(quote.id)) {
        ordered.push(quote);
      }
    }

    return ordered;
  };

  async function fetchEstimateData(preserveSelection: boolean = false) {
    try {
      const { data: quoteData, error } = await supabase
        .schema("business")
        .from("estimates")
        .select("id, created_at, data, travel_data, status")
        .eq("opportunity_id", opportunityId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching estimates:", error);
        return;
      }

      if (quoteData && quoteData.length > 0) {
        // Apply saved tab order if it exists
        const orderedQuotes = applySavedOrder(quoteData);

        // Determine which index to select. Prefer the estimate the parent
        // asked us to reopen after a save/remount, then fall back to the
        // currently selected quote when preserving selection.
        let indexToSelect = 0;
        const quoteIdToSelect =
          preferredEstimateId ||
          (preserveSelection ? quotes[selectedQuoteIndex]?.id : null);

        if (quoteIdToSelect) {
          const foundIndex = orderedQuotes.findIndex(
            (q) => q.id === quoteIdToSelect,
          );
          if (foundIndex !== -1) {
            indexToSelect = foundIndex;
          }
        }

        // Load the selected quote
        loadQuoteData(orderedQuotes[indexToSelect]);
        setQuotes(orderedQuotes);
        setSelectedQuoteIndex(indexToSelect);
        setIsNewQuote(false);
        setHasQuote(true);
      } else {
        // No existing quotes, set up for a new one
        setHasQuote(false);
        setIsNewQuote(true);
        setEstimateStatus(null); // Reset status for new quote
      }
    } catch (err) {
      console.error("Catch block error fetching estimates:", err);
    }
  }

  async function checkExistingQuote() {
    // This function might be redundant if fetchEstimateData handles the logic
    // Keeping it for now, but ensure it uses the schema
    try {
      const { count, error } = await supabase
        .schema("business")
        .from("estimates")
        .select("* ", { count: "exact", head: true })
        .eq("opportunity_id", opportunityId);

      if (error) {
        console.error("Error checking existing quote count:", error);
        setHasQuote(false); // Assume no quote on error
        return;
      }

      setHasQuote(count !== null && count > 0);
    } catch (err) {
      console.error("Catch block error checking quote count:", err);
      setHasQuote(false);
    }
  }

  async function fetchQuotes() {
    // This might also be redundant if fetchEstimateData is the primary load point
    try {
      const { data, error } = await supabase
        .schema("business")
        .from("estimates")
        .select("id, created_at, data, travel_data, status")
        .eq("opportunity_id", opportunityId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching quotes list:", error);
        setQuotes([]);
        return;
      }

      // Apply saved tab order if it exists
      const orderedQuotes = applySavedOrder(data || []);
      setQuotes(orderedQuotes);
      if (data && data.length > 0 && selectedQuoteIndex >= data.length) {
        // Adjust selected index if it becomes invalid after refetch
        setSelectedQuoteIndex(0);
      }
    } catch (err) {
      console.error("Catch block error fetching quotes list:", err);
      setQuotes([]);
    }
  }

  // Load specific quote data
  // Helper to safely convert to number for calculateDefaultLaborHours
  const parseNum = (value: number | string | undefined | null): number => {
    if (value === undefined || value === null || value === "") return 0;
    if (typeof value === "number") return value;
    return parseFloat(value) || 0;
  };

  // Function to calculate default labor hours using the formula
  const calculateDefaultLaborHours = (data: any) => {
    const men = parseNum(data.hoursSummary.men) || 2;
    const hoursPerDay = parseNum(data.hoursSummary.hoursPerDay) || 8;

    // Calculate total SOV labor hours from the SOV items
    let sovLaborHours = 0;
    if (data.sovItems) {
      sovLaborHours = data.sovItems.reduce((total: number, item: any) => {
        if (isStructuralLineItem(item)) return total;
        return (
          total +
          calculateLaborUnit(item.laborMen, item.laborHours) *
            parseNum(item.quantity)
        );
      }, 0);
    }

    // Calculate total non-SOV labor hours from the non-SOV items
    let nonSovLaborHours = 0;
    if (data.nonSovItems) {
      nonSovLaborHours = data.nonSovItems.reduce((total: number, item: any) => {
        if (isStructuralLineItem(item)) return total;
        return (
          total +
          calculateLaborUnit(item.laborMen, item.laborHours) *
            parseNum(item.quantity)
        );
      }, 0);
    }

    // Calculate total labor hours (SOV + non-SOV)
    const totalLaborHours = sovLaborHours + nonSovLaborHours;

    // Calculate days onsite from SOV labor hours only (excludes non-SOV hours like PM/reports)
    // This is used to calculate travel trips to the site
    const daysOnsite =
      men > 0 && hoursPerDay > 0 ? sovLaborHours / (men * hoursPerDay) : 0;

    // Calculate total work hours
    const totalWorkHours = men * hoursPerDay * daysOnsite;

    // New formula based on hours per day:
    // 0-8 hours/day: all straight time
    // 8-12 hours/day: first 8 hours straight, rest overtime
    // 12+ hours/day: first 8 hours straight, next 4 hours overtime, rest double time
    let straightTime = 0;
    let overtime = 0;
    let doubleTime = 0;

    if (totalWorkHours > 0 && hoursPerDay > 0) {
      const totalDays = Math.ceil(totalWorkHours / hoursPerDay);

      for (let day = 0; day < totalDays; day++) {
        const hoursThisDay = Math.min(
          hoursPerDay,
          totalWorkHours - day * hoursPerDay,
        );

        if (hoursThisDay <= 8) {
          // All hours are straight time
          straightTime += hoursThisDay;
        } else if (hoursThisDay <= 12) {
          // First 8 hours are straight time, rest is overtime
          straightTime += 8;
          overtime += hoursThisDay - 8;
        } else {
          // First 8 hours are straight time, next 4 are overtime, rest is double time
          straightTime += 8;
          overtime += 4;
          doubleTime += hoursThisDay - 12;
        }
      }
    }

    return {
      straightTime,
      overtime,
      doubleTime,
    };
  };

  const loadQuoteData = (quote: QuoteData) => {
    // Prevent the async presets loader from overwriting saved data
    presetsAppliedRef.current = true;
    try {
      // Parse the JSON data if it's a string
      let parsedData = quote.data;
      if (typeof quote.data === "string") {
        parsedData = JSON.parse(quote.data);
      }

      // Ensure the data has the required calculatedValues structure
      const defaultCalculatedValues = {
        subtotalMaterial: 0,
        subtotalExpense: 0,
        subtotalLabor: 0,
        totalMaterial: 0,
        totalExpense: 0,
        totalLabor: 0,
        grandTotal: 0,
        nonSovMaterial: 0,
        nonSovExpense: 0,
        nonSovLabor: 0,
        sovLaborHours: 0,
        nonSovLaborHours: 0,
        totalLaborHours: 0,
      };

      // Merge the loaded data with defaults to ensure all required properties exist
      const completeData = {
        title: parsedData.title || "",
        client: parsedData.client || "",
        jobDescription: parsedData.jobDescription || "",
        dateDue: parsedData.dateDue || "",
        location: parsedData.location || "",
        periodOfPerformance: parsedData.periodOfPerformance || "",
        estimatedStartDate: parsedData.estimatedStartDate || "",
        poNumber: parsedData.poNumber || "",
        notes: parsedData.notes || "",
        sovItems: normalizeEstimateLineItems(
          parsedData.sovItems,
          createDefaultLineItems(),
        ),
        useSovItems: parsedData.useSovItems ?? true,
        useScopeNarrative: parsedData.useScopeNarrative ?? false,
        scopeNarrative: parsedData.scopeNarrative || "",
        nonSovItems: normalizeEstimateLineItems(
          parsedData.nonSovItems,
          createDefaultNonSovItems(),
        ),
        calculatedValues: {
          ...defaultCalculatedValues,
          ...(parsedData.calculatedValues || {}),
        },
        hoursSummary: {
          men: DEFAULT_ESTIMATING_PRESETS.default_number_of_men,
          hoursPerDay: DEFAULT_ESTIMATING_PRESETS.default_hours_per_day,
          daysOnsite: 0,
          workHours: 0,
          nonSovHours: 0,
          travelHours: 0,
          totalHours: 0,
          straightTimeHours: 0,
          overtimeHours: 0,
          doubleTimeHours: 0,
          travelStraightTimeHours: 0,
          travelOvertimeHours: 0,
          travelDoubleTimeHours: 0,
          ...(parsedData.hoursSummary || {}),
        },
        saturdayHoursSummary: parsedData.saturdayHoursSummary || undefined,
        sundayHoursSummary: parsedData.sundayHoursSummary || undefined,
      };

      setData(completeData);
      setSelectedSovItemIndexes([]);
      setCopyTargetQuoteId("");

      // Load status from quote
      setEstimateStatus(quote.status || null);

      // Debug: Log what's being loaded
      console.log("Loading quote data:", {
        hoursSummary: completeData.hoursSummary,
        parsedHoursSummary: parsedData.hoursSummary,
      });

      // Handle hourly rates — sanitize saved values so a missing/invalid rate
      // (older estimates) can't propagate NaN into FINAL and SOV item prices
      setHourlyRates(getHourlyRatesForCombinedScope(parsedData));

      // Handle payment term factors — sanitized so a saved 0/invalid factor
      // (which zeroes every NET price) falls back to the defaults
      setPaymentTermFactors(
        sanitizePaymentTermFactors(parsedData.paymentTermFactors),
      );

      // Restore which payment term's price was shown in the SOV column
      if (
        parsedData.selectedSovPriceTerm &&
        ["net30", "net60", "net90"].includes(parsedData.selectedSovPriceTerm)
      ) {
        setSelectedSovPriceTerm(parsedData.selectedSovPriceTerm);
      } else {
        setSelectedSovPriceTerm("net30");
      }

      // Handle mobilization factors — per-key fallback so an empty/partial saved
      // object (e.g. the placeholder estimate's {}) can't NaN the mobilization
      setMobilizationFactors(getMobilizationFactorsForCombinedScope(parsedData));

      if (parsedData.isManualLaborHours !== undefined) {
        setIsManualLaborHours(parsedData.isManualLaborHours);
      }
      if (parsedData.isManualTravelLaborHours !== undefined) {
        setIsManualTravelLaborHours(parsedData.isManualTravelLaborHours);
      }

      // Restore material markup if saved
      if (
        parsedData.materialMarkup !== undefined &&
        parsedData.materialMarkup !== null
      ) {
        const parsedMarkup = Number(parsedData.materialMarkup);
        if (!Number.isNaN(parsedMarkup) && parsedMarkup > 0) {
          setMaterialMarkup(parsedMarkup);
        }
      }

      // Restore quantity for combined letter proposal (default 1)
      if (
        parsedData.combinedLetterQuantity !== undefined &&
        parsedData.combinedLetterQuantity !== null
      ) {
        const qty = Math.max(
          1,
          Math.floor(Number(parsedData.combinedLetterQuantity)) || 1,
        );
        setCombinedLetterQuantity(qty);
      } else {
        setCombinedLetterQuantity(1);
      }

      // Restore Saturday/Sunday labor hours visibility and flags
      if (parsedData.showSaturdayHours) setShowSaturdayHours(true);
      if (parsedData.showSundayHours) setShowSundayHours(true);
      if (parsedData.isManualSaturdayHours) setIsManualSaturdayHours(true);
      if (parsedData.isManualSundayHours) setIsManualSundayHours(true);
      if (parsedData.letterPaymentTerm)
        setLetterPaymentTerm(parsedData.letterPaymentTerm);

      // Set default labor hours using formula if not already set AND not manually edited
      if (
        (!parsedData.hoursSummary ||
          (parsedData.hoursSummary.straightTimeHours === 0 &&
            parsedData.hoursSummary.overtimeHours === 0 &&
            parsedData.hoursSummary.doubleTimeHours === 0)) &&
        !parsedData.isManualLaborHours
      ) {
        // Calculate default hours using the formula
        const defaultHours = calculateDefaultLaborHours(completeData);
        setData((prev) => ({
          ...prev,
          hoursSummary: {
            ...prev.hoursSummary,
            straightTimeHours: defaultHours.straightTime,
            overtimeHours: defaultHours.overtime,
            doubleTimeHours: defaultHours.doubleTime,
          },
        }));
      }

      // Handle travel data
      if (quote.travel_data) {
        let parsedTravelData = quote.travel_data;
        if (typeof quote.travel_data === "string") {
          parsedTravelData = JSON.parse(quote.travel_data);
        }
        setTravelData(normalizeTravelData(parsedTravelData));
        setShowTravel(true);
      } else {
        setShowTravel(false);
        setTravelData(normalizeTravelData(null));
      }
    } catch (error) {
      console.error("Error loading quote data:", error);
      // Fallback to default data structure if parsing fails
      setData({
        client: "",
        jobDescription: "",
        dateDue: "",
        location: "",
        periodOfPerformance: "",
        estimatedStartDate: "",
        poNumber: "",
        notes: "",
        sovItems: createDefaultLineItems(),
        nonSovItems: createDefaultNonSovItems(),
        calculatedValues: {
          subtotalMaterial: 0,
          subtotalExpense: 0,
          subtotalLabor: 0,
          totalMaterial: 0,
          totalExpense: 0,
          totalLabor: 0,
          grandTotal: 0,
          nonSovMaterial: 0,
          nonSovExpense: 0,
          nonSovLabor: 0,
          sovLaborHours: 0,
          nonSovLaborHours: 0,
          totalLaborHours: 0,
        },
        hoursSummary: {
          men: DEFAULT_ESTIMATING_PRESETS.default_number_of_men,
          hoursPerDay: DEFAULT_ESTIMATING_PRESETS.default_hours_per_day,
          daysOnsite: 0,
          workHours: 0,
          nonSovHours: 0,
          travelHours: 0,
          totalHours: 0,
          straightTimeHours: 0,
          overtimeHours: 0,
          doubleTimeHours: 0,
          travelStraightTimeHours: 0,
          travelOvertimeHours: 0,
          travelDoubleTimeHours: 0,
        },
      });
      setShowTravel(false);
      setShowSaturdayHours(false);
      setShowSundayHours(false);
    }
  };

  // Handle closing the dialog with unsaved changes confirmation
  const handleClose = () => {
    if (isDirty) {
      const confirmed = window.confirm(
        "You have unsaved changes. Are you sure you want to exit?",
      );
      if (!confirmed) {
        return; // Don't close if user cancels
      }
    }
    setIsOpen(false);
    // Reset mode to allow immediate reopening
    if (mode === "new" || mode === "view") {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("resetEstimateMode"));
      }, 100);
    }
  };

  // Handle closing the letter proposal dialog with unsaved changes confirmation
  const handleCloseLetterProposal = () => {
    if (isLetterDirty) {
      const confirmed = window.confirm(
        "You have unsaved changes. Are you sure you want to exit?",
      );
      if (!confirmed) {
        return; // Don't close if user cancels
      }
    }
    setIsLetterProposalOpen(false);
    setLetterProposalName(""); // Clear the letter name
    // Clear letter proposal state when deliberately closing
    clearLetterProposalState();
    // Reset mode to allow immediate reopening
    if (mode === "letter" || mode === "letters" || mode === "combined-letter") {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("resetEstimateMode"));
      }, 100);
    }
  };

  // Modified save function to handle new quotes
  async function saveQuote() {
    if (!user) {
      alert("You must be logged in to save a quote.");
      return;
    }

    // Ensure opportunityId is valid
    if (!opportunityId) {
      alert("Cannot save quote: Opportunity ID is missing.");
      return;
    }

    const generateQuoteVersion = () => {
      // Get the next version number based on existing quotes
      const existingVersions = quotes.map((q) => {
        const match = q.quote_number?.match(/v(\d+)$/);
        return match ? parseInt(match[1]) : 0;
      });
      const nextVersion = Math.max(...existingVersions, 0) + 1;
      return `v${nextVersion}`;
    };

    // Always persist travel data regardless of toggle visibility
    const safeTravelData = travelData ? { ...travelData } : {};
    const dataWithEmbeddedTravel = {
      ...(data as any),
      travel_data: safeTravelData,
      hourlyRates: hourlyRates,
      paymentTermFactors: paymentTermFactors,
      mobilizationFactors: mobilizationFactors,
      selectedSovPriceTerm: selectedSovPriceTerm,
      isManualLaborHours: isManualLaborHours,
      isManualTravelLaborHours: isManualTravelLaborHours,
      materialMarkup: materialMarkup,
      combinedLetterQuantity: Math.max(
        1,
        Math.floor(Number(combinedLetterQuantity)) || 1,
      ),
      showSaturdayHours: showSaturdayHours,
      showSundayHours: showSundayHours,
      isManualSaturdayHours: isManualSaturdayHours,
      isManualSundayHours: isManualSundayHours,
      letterPaymentTerm: letterPaymentTerm,
    };

    // Debug: Log what's being saved
    console.log("Saving quote data:", {
      hoursSummary: data.hoursSummary,
      hourlyRates: hourlyRates,
    });
    const quoteRecord = {
      opportunity_id: opportunityId,
      // Embed travel into the main data blob for consumers that read from data
      data: JSON.stringify(dataWithEmbeddedTravel),
      // Also save a dedicated travel_data column for direct access
      travel_data: JSON.stringify(safeTravelData),
      quote_number: generateQuoteVersion(),
      user_id: user.id, // Track who created this estimate
      status: estimateStatus || null, // Save the estimate status
    };

    try {
      setIsSaving(true);
      let result;
      let preparedByAfterSave: string | null = null;

      // Determine if we are updating an existing selected quote or inserting a new one
      const isUpdating =
        !isNewQuote && quotes.length > 0 && selectedQuoteIndex < quotes.length;
      const quoteIdToUpdate = isUpdating
        ? quotes[selectedQuoteIndex]?.id
        : null;

      if (isUpdating && quoteIdToUpdate) {
        // Update existing quote
        console.log(`Updating estimate with ID: ${quoteIdToUpdate}`);
        // Preserve existing quote number when updating, but include status
        const updatePayload = { ...quoteRecord } as any;
        delete updatePayload.quote_number;
        // Ensure status is included in update
        updatePayload.status = estimateStatus || null;
        result = await supabase
          .schema("business") // Specify schema
          .from("estimates")
          .update(updatePayload)
          .eq("id", quoteIdToUpdate)
          .select()
          .single(); // Expect a single record back

        if (result.data) {
          const updatedQuote = result.data;
          // Update the specific quote in the local state
          setQuotes((prev) =>
            prev.map((q, index) =>
              index === selectedQuoteIndex ? updatedQuote : q,
            ),
          );
          // Clear any draft from Supabase after a successful save
          deletePreference(`drafts.${draftKey}`);
          setIsDirty(false);
          setJustSaved(true);
          setDraftRestored(false);

          // Update prepared_by on the opportunity to include current user's name
          if (opportunityId && user) {
            try {
              const preparedByName = await getCurrentUserPreparedByName();
              const { data: opp, error: oppErr } = await supabase
                .schema("business")
                .from("opportunities")
                .select("prepared_by")
                .eq("id", opportunityId)
                .maybeSingle();
              if (!oppErr && preparedByName) {
                const existing = (opp?.prepared_by as string | null) || "";
                const currentEmail = user.email?.toLowerCase();
                const currentName = preparedByName.toLowerCase();
                const parts = existing
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .filter((s) => {
                    const lower = s.toLowerCase();
                    return lower !== currentEmail && lower !== currentName;
                  });
                parts.push(preparedByName);
                const newPreparedBy = parts.join(", ");
                preparedByAfterSave = newPreparedBy;
                await supabase
                  .schema("business")
                  .from("opportunities")
                  .update({ prepared_by: newPreparedBy })
                  .eq("id", opportunityId);
              }
            } catch (e) {
              console.error(
                "Failed to update prepared_by after quote update:",
                e,
              );
            }
            // Notify parent without forcing a full opportunity reload.
            window.dispatchEvent(
              new CustomEvent("estimateSaved", {
                detail: {
                  opportunityId,
                  estimateId: quoteIdToUpdate,
                  preparedBy: preparedByAfterSave,
                },
              }),
            );
          }
        } else {
          console.warn("Update operation did not return data.");
          // Refetch to be sure state is correct, preserving selection
          await fetchEstimateData(true);
        }
      } else {
        // Insert new quote
        console.log("Inserting new estimate record.");
        result = await supabase
          .schema("business") // Specify schema
          .from("estimates")
          .insert(quoteRecord)
          .select()
          .single(); // Expect a single record back

        if (result.data) {
          const newQuote = result.data;
          // Add the new quote to the beginning of the list and select it
          setQuotes((prev) => [newQuote, ...prev]);
          setSelectedQuoteIndex(0);
          setIsNewQuote(false); // It's no longer a new quote conceptually
          setHasQuote(true);
          // Clear draft from Supabase after successful creation
          deletePreference(`drafts.${draftKey}`);
          setIsDirty(false);
          setJustSaved(true);
          setDraftRestored(false);

          // Trigger prepared_by update for the opportunity
          if (opportunityId) {
            // First, directly update prepared_by to include current user's name
            if (user) {
              try {
                const preparedByName = await getCurrentUserPreparedByName();
                const { data: opp, error: oppErr } = await supabase
                  .schema("business")
                  .from("opportunities")
                  .select("prepared_by")
                  .eq("id", opportunityId)
                  .maybeSingle();
                if (!oppErr && preparedByName) {
                  const existing = (opp?.prepared_by as string | null) || "";
                  const currentEmail = user.email?.toLowerCase();
                  const currentName = preparedByName.toLowerCase();
                  const parts = existing
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .filter((s) => {
                      const lower = s.toLowerCase();
                      return lower !== currentEmail && lower !== currentName;
                    });
                  parts.push(preparedByName);
                  const newPreparedBy = parts.join(", ");
                  preparedByAfterSave = newPreparedBy;
                  await supabase
                    .schema("business")
                    .from("opportunities")
                    .update({ prepared_by: newPreparedBy })
                    .eq("id", opportunityId);
                }
              } catch (e) {
                console.error(
                  "Failed to update prepared_by after new quote:",
                  e,
                );
              }
            }
            // Notify parent without forcing a full opportunity reload.
            window.dispatchEvent(
              new CustomEvent("estimateSaved", {
                detail: {
                  opportunityId,
                  estimateId: newQuote.id,
                  preparedBy: preparedByAfterSave,
                },
              }),
            );
          }
        } else {
          console.error("Insert operation did not return data.");
          alert(
            "Quote saved, but failed to retrieve confirmation. Please refresh.",
          );
          // Refetch to ensure we have the latest data
          await fetchEstimateData(true);
        }
      }

      if (result.error) throw result.error;
    } catch (error: any) {
      console.error("Error saving quote:", error);
      alert(`Error saving quote: ${error.message}`);
    } finally {
      setIsSaving(false);
      // Allow global refreshes again after save/close
      try {
        localStorage.removeItem("AMP_SUSPEND_REFRESH");
      } catch {}
    }
  }

  async function deleteQuoteById(quoteId: string) {
    if (!quoteId) return;
    if (!confirm("Delete this estimate? This cannot be undone.")) return;
    try {
      const { error } = await supabase
        .schema("business")
        .from("estimates")
        .delete()
        .eq("id", quoteId);
      if (error) throw error;
      // Update local state
      setQuotes((prev) => prev.filter((q) => q.id !== quoteId));
      // Adjust selected index if needed
      setSelectedQuoteIndex((prevIdx) => {
        const nextLen = quotes.length - 1;
        if (nextLen <= 0) {
          setIsNewQuote(true);
          setEstimateStatus(null); // Reset status for new quote
          return -1;
        }
        return Math.max(0, Math.min(prevIdx, nextLen - 1));
      });
      alert("Estimate deleted");
    } catch (e) {
      console.error("Error deleting estimate:", e);
      alert("Failed to delete estimate");
    }
  }

  // Duplicate an existing quote
  async function duplicateQuote(quoteId: string) {
    if (!quoteId || !user) return;

    const quoteToDuplicate = quotes.find((q) => q.id === quoteId);
    if (!quoteToDuplicate) {
      alert("Could not find estimate to duplicate.");
      return;
    }

    try {
      setIsSaving(true);

      // Parse existing data to add "(Copy)" to the title
      let duplicatedData = quoteToDuplicate.data;
      try {
        const parsed =
          typeof duplicatedData === "string"
            ? JSON.parse(duplicatedData)
            : duplicatedData;
        const originalTitle = parsed?.title?.trim() || "";
        parsed.title = originalTitle ? `${originalTitle} (Copy)` : "Copy";
        duplicatedData = JSON.stringify(parsed);
      } catch (e) {
        console.warn("Could not parse quote data for title update:", e);
      }

      // Generate new quote version number
      const existingVersions = quotes.map((q) => {
        const match = q.quote_number?.match(/v(\d+)$/);
        return match ? parseInt(match[1]) : 0;
      });
      const nextVersion = Math.max(...existingVersions, 0) + 1;
      const newQuoteNumber = `v${nextVersion}`;

      // Create new quote record
      const duplicateRecord = {
        opportunity_id: opportunityId,
        data: duplicatedData,
        travel_data: quoteToDuplicate.travel_data,
        quote_number: newQuoteNumber,
        user_id: user.id,
        status: null, // Reset status for duplicated quote
      };

      const { data: newQuote, error } = await supabase
        .schema("business")
        .from("estimates")
        .insert(duplicateRecord)
        .select()
        .single();

      if (error) throw error;

      if (newQuote) {
        // Add the new quote to the beginning of the list and select it
        setQuotes((prev) => [newQuote, ...prev]);
        setSelectedQuoteIndex(0);
        loadQuoteData(newQuote);
        setIsNewQuote(false);
        setHasQuote(true);
        alert("Estimate duplicated successfully!");

        // Notify listeners to refresh
        window.dispatchEvent(
          new CustomEvent("estimateSaved", {
            detail: { opportunityId, estimateId: newQuote.id },
          }),
        );
      }
    } catch (e) {
      console.error("Error duplicating estimate:", e);
      alert("Failed to duplicate estimate");
    } finally {
      setIsSaving(false);
    }
  }

  // Copy an existing quote into a DIFFERENT opportunity. The scope, pricing,
  // and hours are copied unchanged; the client/location/description header
  // fields are refreshed to match the destination opportunity so the copy is
  // quote-ready for the new customer.
  async function copyQuoteToOpportunity(
    quoteId: string,
    target: CopyTargetOpportunity,
  ) {
    if (!quoteId || !user) return;
    if (target.id === opportunityId) {
      alert("That estimate already belongs to this opportunity.");
      return;
    }

    const quoteToCopy = quotes.find((q) => q.id === quoteId);
    if (!quoteToCopy) {
      alert("Could not find estimate to copy.");
      return;
    }

    try {
      setIsSaving(true);

      // 1. Fetch the destination opportunity + its customer so we can refresh
      //    the header fields on the copied estimate.
      const { data: targetOpp, error: targetOppError } = await supabase
        .schema("business")
        .from("opportunities")
        .select("id, description, customer_id")
        .eq("id", target.id)
        .single();
      if (targetOppError) throw targetOppError;

      let targetCustomerName = "";
      let targetCustomerAddress = "";
      if (targetOpp?.customer_id) {
        const { data: targetCustomer } = await supabase
          .schema("common")
          .from("customers")
          .select("name, company_name, address")
          .eq("id", targetOpp.customer_id)
          .single();
        if (targetCustomer) {
          targetCustomerName =
            targetCustomer.company_name || targetCustomer.name || "";
          targetCustomerAddress = targetCustomer.address || "";
        }
      }

      // 2. Clone the estimate data, refreshing the customer-specific fields.
      let copiedData = quoteToCopy.data;
      try {
        const parsed =
          typeof copiedData === "string"
            ? JSON.parse(copiedData)
            : { ...copiedData };
        parsed.client = targetCustomerName;
        parsed.location = targetCustomerAddress;
        parsed.jobDescription = targetOpp?.description || "";
        copiedData = JSON.stringify(parsed);
      } catch (e) {
        console.warn("Could not parse quote data for copy header update:", e);
      }

      // 3. Determine the next quote version number within the destination.
      const { data: targetQuotes } = await supabase
        .schema("business")
        .from("estimates")
        .select("quote_number")
        .eq("opportunity_id", target.id);
      const existingVersions = (targetQuotes || []).map((q: any) => {
        const match = q.quote_number?.match(/v(\d+)$/);
        return match ? parseInt(match[1]) : 0;
      });
      const nextVersion = Math.max(...existingVersions, 0) + 1;
      const newQuoteNumber = `v${nextVersion}`;

      // 4. Insert the copied estimate under the destination opportunity.
      const copyRecord = {
        opportunity_id: target.id,
        data: copiedData,
        travel_data: quoteToCopy.travel_data,
        quote_number: newQuoteNumber,
        user_id: user.id,
        status: null,
      };

      const { data: newQuote, error } = await supabase
        .schema("business")
        .from("estimates")
        .insert(copyRecord)
        .select()
        .single();
      if (error) throw error;

      setIsCopyToOpportunityOpen(false);

      // Notify listeners (e.g. the destination opportunity) to refresh.
      if (newQuote) {
        window.dispatchEvent(
          new CustomEvent("estimateSaved", {
            detail: { opportunityId: target.id, estimateId: newQuote.id },
          }),
        );
      }

      const targetLabel =
        target.quote_number ||
        target.title ||
        target.customer_name ||
        "the selected opportunity";
      alert(`Estimate copied to ${targetLabel} as ${newQuoteNumber}.`);
    } catch (e) {
      console.error("Error copying estimate to opportunity:", e);
      alert("Failed to copy estimate to the selected opportunity.");
    } finally {
      setIsSaving(false);
    }
  }

  // Reset data for new quote
  const handleGenerateNewQuote = () => {
    setIsNewQuote(true);
    setCombinedLetterQuantity(1);
    setData({
      client:
        opportunityData?.customer.company_name ||
        opportunityData?.customer.name ||
        "",
      jobDescription: opportunityData?.description || "",
      dateDue: "",
      location: opportunityData?.customer.address || "",
      periodOfPerformance: "",
      estimatedStartDate: "",
      poNumber: "",
      notes: "",
      sovItems: createDefaultLineItems(),
      nonSovItems: createDefaultNonSovItems(),
      calculatedValues: {
        subtotalMaterial: 0,
        subtotalExpense: 0,
        subtotalLabor: 0,
        totalMaterial: 0,
        totalExpense: 0,
        totalLabor: 0,
        grandTotal: 0,
        nonSovMaterial: 0,
        nonSovExpense: 0,
        nonSovLabor: 0,
        sovLaborHours: 0,
        nonSovLaborHours: 0,
        totalLaborHours: 0,
      },
      hoursSummary: {
        men: DEFAULT_ESTIMATING_PRESETS.default_number_of_men,
        hoursPerDay: DEFAULT_ESTIMATING_PRESETS.default_hours_per_day,
        daysOnsite: 0,
        workHours: 0,
        nonSovHours: 0,
        travelHours: 0,
        totalHours: 0,
        straightTimeHours: 0,
        overtimeHours: 0,
        doubleTimeHours: 0,
        travelStraightTimeHours: 0,
        travelOvertimeHours: 0,
        travelDoubleTimeHours: 0,
      },
    });
    setShowTravel(false);
    setShowSaturdayHours(false);
    setShowSundayHours(false);
    setIsOpen(true);
  };

  // Function to calculate material extension - handles both string and number inputs
  const calculateMaterialExtension = (
    quantity: number | string,
    price: number | string,
  ) => {
    const qtyNum =
      typeof quantity === "string" ? parseFloat(quantity) || 0 : quantity || 0;
    const priceNum =
      typeof price === "string" ? parseFloat(price) || 0 : price || 0;
    return qtyNum * priceNum;
  };

  // Function to calculate expense extension - handles both string and number inputs
  const calculateExpenseExtension = (
    quantity: number | string,
    price: number | string,
  ) => {
    const qtyNum =
      typeof quantity === "string" ? parseFloat(quantity) || 0 : quantity || 0;
    const priceNum =
      typeof price === "string" ? parseFloat(price) || 0 : price || 0;
    return qtyNum * priceNum;
  };

  // Function to calculate labor unit - handles both string and number inputs
  const calculateLaborUnit = (men: number | string, hours: number | string) => {
    const menNum = typeof men === "string" ? parseFloat(men) || 0 : men || 0;
    const hoursNum =
      typeof hours === "string" ? parseFloat(hours) || 0 : hours || 0;
    return menNum * hoursNum;
  };

  // Function to calculate labor total - handles both string and number inputs
  const calculateLaborTotal = (
    quantity: number | string,
    men: number | string,
    hours: number | string,
  ) => {
    const qtyNum =
      typeof quantity === "string" ? parseFloat(quantity) || 0 : quantity || 0;
    return qtyNum * calculateLaborUnit(men, hours);
  };

  // Helper function to safely convert string or number to number for calculations
  const toNum = (value: number | string | undefined | null): number => {
    if (value === undefined || value === null || value === "") return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    return parseFloat(value) || 0;
  };

  // Helper function to format numbers with commas
  const formatCurrency = (amount: number | string) => {
    const numAmount = toNum(amount);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numAmount);
  };

  // Helper function to format numbers with commas (no currency symbol)
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const getQuoteDisplayName = (quote: QuoteData, index: number) => {
    try {
      const parsed =
        typeof quote.data === "string"
          ? JSON.parse(quote.data)
          : quote.data || {};
      const customTitle = parsed?.title?.trim();
      if (customTitle) return customTitle;
    } catch {}
    return `Quote ${(opportunityData as any)?.quote_number || quote.id?.slice(0, 6) || index + 1}`;
  };

  const getNextQuoteNumber = () => {
    const existingVersions = quotes.map((q) => {
      const match = q.quote_number?.match(/v(\d+)$/);
      return match ? parseInt(match[1]) : 0;
    });
    const nextVersion = Math.max(...existingVersions, 0) + 1;
    return `v${nextVersion}`;
  };

  const parseQuoteData = (quote: QuoteData) => {
    if (typeof quote.data === "string") {
      return JSON.parse(quote.data || "{}");
    }
    return { ...(quote.data || {}) };
  };

  const isEmptySovItem = (item: EstimateLineItem) => {
    if (isStructuralLineItem(item)) return false;
    return (
      !String(item.item || "").trim() &&
      !String(item.notes || "").trim() &&
      toNum(item.quantity) === 0 &&
      toNum(item.materialPrice) === 0 &&
      toNum(item.expensePrice) === 0 &&
      toNum(item.laborMen) === 0 &&
      toNum(item.laborHours) === 0
    );
  };

  const trimTrailingEmptySovItems = (items: EstimateLineItem[]) => {
    const trimmed = [...items];
    while (trimmed.length > 0 && isEmptySovItem(trimmed[trimmed.length - 1])) {
      trimmed.pop();
    }
    return trimmed;
  };

  const recalculateEstimateSnapshot = (
    estimateData: any,
    estimateTravelData?: any,
  ) => {
    const sovItems = normalizeEstimateLineItems(
      estimateData.sovItems,
      createDefaultLineItems(),
    );
    const nonSovItems = normalizeEstimateLineItems(
      estimateData.nonSovItems,
      createDefaultNonSovItems(),
    );
    const hoursSummary = {
      men: DEFAULT_ESTIMATING_PRESETS.default_number_of_men,
      hoursPerDay: DEFAULT_ESTIMATING_PRESETS.default_hours_per_day,
      daysOnsite: 0,
      workHours: 0,
      nonSovHours: 0,
      travelHours: 0,
      totalHours: 0,
      straightTimeHours: 0,
      overtimeHours: 0,
      doubleTimeHours: 0,
      travelStraightTimeHours: 0,
      travelOvertimeHours: 0,
      travelDoubleTimeHours: 0,
      ...(estimateData.hoursSummary || {}),
    };

    let sovMaterialTotal = 0;
    let sovExpenseTotal = 0;
    let sovLaborTotal = 0;
    let sovLaborHours = 0;
    sovItems.forEach((item) => {
      if (isStructuralLineItem(item)) return;
      sovMaterialTotal += calculateMaterialExtension(
        item.quantity,
        item.materialPrice,
      );
      sovExpenseTotal += calculateExpenseExtension(
        item.quantity,
        item.expensePrice,
      );
      sovLaborTotal += calculateLaborTotal(
        item.quantity,
        item.laborMen,
        item.laborHours,
      );
      sovLaborHours +=
        calculateLaborUnit(item.laborMen, item.laborHours) *
        toNum(item.quantity);
    });

    let nonSovMaterialTotal = 0;
    let nonSovExpenseTotal = 0;
    let nonSovLaborTotal = 0;
    let nonSovLaborHours = 0;
    nonSovItems.forEach((item) => {
      if (isStructuralLineItem(item)) return;
      nonSovMaterialTotal += calculateMaterialExtension(
        item.quantity,
        item.materialPrice,
      );
      nonSovExpenseTotal += calculateExpenseExtension(
        item.quantity,
        item.expensePrice,
      );
      nonSovLaborTotal += calculateLaborTotal(
        item.quantity,
        item.laborMen,
        item.laborHours,
      );
      nonSovLaborHours +=
        calculateLaborUnit(item.laborMen, item.laborHours) *
        toNum(item.quantity);
    });

    const totalWorkHours = sovLaborHours + nonSovLaborHours;
    const hoursPerDay = toNum(hoursSummary.hoursPerDay);
    let straightTimeHours = 0;
    let overtimeHours = 0;
    let doubleTimeHours = 0;
    if (totalWorkHours > 0 && hoursPerDay > 0) {
      const totalDays = Math.ceil(totalWorkHours / hoursPerDay);
      for (let day = 0; day < totalDays; day++) {
        const hoursThisDay = Math.min(
          hoursPerDay,
          totalWorkHours - day * hoursPerDay,
        );
        if (hoursThisDay <= 8) {
          straightTimeHours += hoursThisDay;
        } else if (hoursThisDay <= 12) {
          straightTimeHours += 8;
          overtimeHours += hoursThisDay - 8;
        } else {
          straightTimeHours += 8;
          overtimeHours += 4;
          doubleTimeHours += hoursThisDay - 12;
        }
      }
    }

    let totalTravelHours = 0;
    if (estimateTravelData) {
      totalTravelHours = computeTravelTotals(estimateTravelData).laborHours;
    }

    const calculatedValues = {
      subtotalMaterial: sovMaterialTotal + nonSovMaterialTotal,
      subtotalExpense: sovExpenseTotal + nonSovExpenseTotal,
      subtotalLabor: sovLaborTotal + nonSovLaborTotal,
      totalMaterial: sovMaterialTotal + nonSovMaterialTotal,
      totalExpense: sovExpenseTotal + nonSovExpenseTotal,
      totalLabor: sovLaborTotal + nonSovLaborTotal,
      grandTotal:
        sovMaterialTotal +
        nonSovMaterialTotal +
        sovExpenseTotal +
        nonSovExpenseTotal +
        sovLaborTotal +
        nonSovLaborTotal,
      nonSovMaterial: nonSovMaterialTotal,
      nonSovExpense: nonSovExpenseTotal,
      nonSovLabor: nonSovLaborTotal,
      sovLaborHours,
      nonSovLaborHours,
      totalLaborHours: totalWorkHours,
    };

    const menNum = toNum(hoursSummary.men);
    const hoursPerDayNum = toNum(hoursSummary.hoursPerDay);
    const daysOnsite =
      menNum > 0 && hoursPerDayNum > 0
        ? sovLaborHours / (menNum * hoursPerDayNum)
        : 0;

    return {
      ...estimateData,
      sovItems,
      nonSovItems,
      calculatedValues,
      hoursSummary: {
        ...hoursSummary,
        daysOnsite,
        workHours: sovLaborHours,
        nonSovHours: nonSovLaborHours,
        travelHours: totalTravelHours,
        totalHours: totalWorkHours + totalTravelHours,
        straightTimeHours: estimateData.isManualLaborHours
          ? hoursSummary.straightTimeHours
          : straightTimeHours,
        overtimeHours: estimateData.isManualLaborHours
          ? hoursSummary.overtimeHours
          : overtimeHours,
        doubleTimeHours: estimateData.isManualLaborHours
          ? hoursSummary.doubleTimeHours
          : doubleTimeHours,
        travelStraightTimeHours: estimateData.isManualTravelLaborHours
          ? hoursSummary.travelStraightTimeHours
          : totalTravelHours,
        travelOvertimeHours: estimateData.isManualTravelLaborHours
          ? hoursSummary.travelOvertimeHours
          : 0,
        travelDoubleTimeHours: estimateData.isManualTravelLaborHours
          ? hoursSummary.travelDoubleTimeHours
          : 0,
      },
    };
  };

  const toggleSovItemSelection = (index: number) => {
    setSelectedSovItemIndexes((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index].sort((a, b) => a - b),
    );
  };

  const handleCopySelectedSovItems = async () => {
    if (!user) return;

    const selectedItems = selectedSovItemIndexes
      .map((index) => data.sovItems[index])
      .filter((item) => item && !isStructuralLineItem(item))
      .map((item) =>
        normalizeEstimateLineItem(JSON.parse(JSON.stringify(item))),
      );

    if (selectedItems.length === 0) {
      alert("Select at least one SOV line item.");
      return;
    }

    const currentQuoteId = !isNewQuote ? quotes[selectedQuoteIndex]?.id : null;
    const targetQuote = quotes.find((q) => q.id === copyTargetQuoteId);
    const isNewTarget = copyTargetQuoteId === "__new__";
    if (!isNewTarget && !targetQuote) {
      alert("Choose a target estimate.");
      return;
    }

    const targetName = isNewTarget
      ? newCopyEstimateTitle.trim() || "New estimate"
      : getQuoteDisplayName(
          targetQuote!,
          quotes.findIndex((q) => q.id === targetQuote!.id),
        );

    const dirtyWarning = isDirty
      ? "\n\nUnsaved edits on this estimate will stay unsaved."
      : "";
    if (
      !confirm(
        `Copy ${selectedItems.length} SOV item${selectedItems.length === 1 ? "" : "s"} to "${targetName}"?${dirtyWarning}`,
      )
    ) {
      return;
    }

    try {
      setIsCopyingSovItems(true);

      if (isNewTarget) {
        const newEstimateData = recalculateEstimateSnapshot({
          ...data,
          title:
            newCopyEstimateTitle.trim() ||
            `Copy of ${data.title?.trim() || "Estimate"}`,
          sovItems: selectedItems,
          nonSovItems: createDefaultNonSovItems(),
          isManualLaborHours: false,
          isManualTravelLaborHours: false,
          hourlyRates,
          paymentTermFactors,
          mobilizationFactors,
          materialMarkup,
          combinedLetterQuantity: 1,
          showSaturdayHours: false,
          showSundayHours: false,
          isManualSaturdayHours: false,
          isManualSundayHours: false,
          letterPaymentTerm,
        });

        const { data: newQuote, error } = await supabase
          .schema("business")
          .from("estimates")
          .insert({
            opportunity_id: opportunityId,
            data: JSON.stringify(newEstimateData),
            travel_data: null,
            quote_number: getNextQuoteNumber(),
            user_id: user.id,
            status: estimateStatus || null,
          })
          .select()
          .single();

        if (error) throw error;
        if (newQuote) {
          setQuotes((prev) => [newQuote, ...prev]);
          setSelectedQuoteIndex(0);
          loadQuoteData(newQuote);
          setIsNewQuote(false);
          setHasQuote(true);
          setSelectedSovItemIndexes([]);
          setCopyTargetQuoteId("");
          setNewCopyEstimateTitle("");
          window.dispatchEvent(
            new CustomEvent("estimateSaved", {
              detail: { opportunityId, estimateId: newQuote.id },
            }),
          );
          alert("SOV items copied.");
        }
        return;
      }

      const parsedTargetData = parseQuoteData(targetQuote!);
      let parsedTravelData = targetQuote!.travel_data;
      if (typeof parsedTravelData === "string" && parsedTravelData.trim()) {
        parsedTravelData = JSON.parse(parsedTravelData);
      }

      const existingTargetItems = normalizeEstimateLineItems(
        parsedTargetData.sovItems,
        createDefaultLineItems(),
      );
      const updatedTargetData = recalculateEstimateSnapshot(
        {
          ...parsedTargetData,
          sovItems: [
            ...trimTrailingEmptySovItems(existingTargetItems),
            ...selectedItems,
          ],
        },
        parsedTravelData || undefined,
      );

      const { data: updatedQuote, error } = await supabase
        .schema("business")
        .from("estimates")
        .update({ data: JSON.stringify(updatedTargetData) })
        .eq("id", targetQuote!.id)
        .select()
        .single();

      if (error) throw error;
      if (updatedQuote) {
        const nextQuotes = quotes.map((q) =>
          q.id === updatedQuote.id ? updatedQuote : q,
        );
        const nextSelectedIndex = nextQuotes.findIndex(
          (q) => q.id === updatedQuote.id,
        );
        setQuotes(nextQuotes);
        setSelectedQuoteIndex(nextSelectedIndex);
        loadQuoteData(updatedQuote);
        setIsNewQuote(false);
        setSelectedSovItemIndexes([]);
        setCopyTargetQuoteId("");
        window.dispatchEvent(
          new CustomEvent("estimateSaved", {
            detail: { opportunityId, estimateId: updatedQuote.id },
          }),
        );
        alert(
          currentQuoteId === updatedQuote.id
            ? "SOV items copied."
            : "SOV items copied and target estimate opened.",
        );
      }
    } catch (error: any) {
      console.error("Error copying SOV items:", error);
      alert(`Failed to copy SOV items: ${error.message || "Unknown error"}`);
    } finally {
      setIsCopyingSovItems(false);
    }
  };

  // Travel non-labor costs (vehicle, per diem, lodging, etc. — excludes travel labor which is now in the Labor Hours Tracking table)
  const getTravelNonLaborCost = () => {
    try {
      const sum = computeTravelTotals(travelData).nonLaborCost;
      return Number.isFinite(sum) ? sum : 0;
    } catch {
      return 0;
    }
  };

  // Travel labor cost from the Labor Hours Tracking table
  const getTravelLaborCost = () => {
    return (
      toNum(data.hoursSummary.travelStraightTimeHours) *
        toNum(hourlyRates.straightTime) +
      toNum(data.hoursSummary.travelOvertimeHours) *
        toNum(hourlyRates.overtime) +
      toNum(data.hoursSummary.travelDoubleTimeHours) *
        toNum(hourlyRates.doubleTime)
    );
  };

  // Total travel cost (for display): travel labor from tracking table + non-labor from travel section
  const getTotalTravelCost = () => {
    return getTravelLaborCost() + getTravelNonLaborCost();
  };

  // Shared material + expense base used by all day-type scenarios
  const getMaterialExpenseBase = () => {
    return (
      toNum(data.calculatedValues.totalMaterial) *
        1.09 *
        toNum(materialMarkup) +
      toNum(data.calculatedValues.totalExpense) * 1.09 +
      toNum(data.calculatedValues.nonSovExpense) * 1.0
    );
  };

  // Work labor cost from the M-F Labor Hours Tracking table
  const getWorkLaborCost = () => {
    return (
      toNum(data.hoursSummary.straightTimeHours) *
        toNum(hourlyRates.straightTime) +
      toNum(data.hoursSummary.overtimeHours) * toNum(hourlyRates.overtime) +
      toNum(data.hoursSummary.doubleTimeHours) * toNum(hourlyRates.doubleTime)
    );
  };

  // Helper function to get the exact FINAL value (G54) as shown in UI — Monday-Friday scenario
  const getFinalValue = () => {
    return Math.ceil(
      (getMaterialExpenseBase() +
        getWorkLaborCost() +
        getTravelLaborCost() +
        getTravelNonLaborCost()) /
        0.96,
    );
  };

  // FINAL value for Saturday scenario
  const getSaturdayFinalValue = () => {
    const sat = data.saturdayHoursSummary;
    if (!sat) return getFinalValue();
    const workLabor =
      toNum(sat.straightTimeHours) * toNum(hourlyRates.straightTime) +
      toNum(sat.overtimeHours) * toNum(hourlyRates.overtime) +
      toNum(sat.doubleTimeHours) * toNum(hourlyRates.doubleTime);
    const travelLabor =
      toNum(sat.travelStraightTimeHours) * toNum(hourlyRates.straightTime) +
      toNum(sat.travelOvertimeHours) * toNum(hourlyRates.overtime) +
      toNum(sat.travelDoubleTimeHours) * toNum(hourlyRates.doubleTime);
    return Math.ceil(
      (getMaterialExpenseBase() +
        workLabor +
        travelLabor +
        getTravelNonLaborCost()) /
        0.96,
    );
  };

  // FINAL value for Sunday/Holiday scenario
  const getSundayFinalValue = () => {
    const sun = data.sundayHoursSummary;
    if (!sun) return getFinalValue();
    const workLabor =
      toNum(sun.straightTimeHours) * toNum(hourlyRates.straightTime) +
      toNum(sun.overtimeHours) * toNum(hourlyRates.overtime) +
      toNum(sun.doubleTimeHours) * toNum(hourlyRates.doubleTime);
    const travelLabor =
      toNum(sun.travelStraightTimeHours) * toNum(hourlyRates.straightTime) +
      toNum(sun.travelOvertimeHours) * toNum(hourlyRates.overtime) +
      toNum(sun.travelDoubleTimeHours) * toNum(hourlyRates.doubleTime);
    return Math.ceil(
      (getMaterialExpenseBase() +
        workLabor +
        travelLabor +
        getTravelNonLaborCost()) /
        0.96,
    );
  };

  // Plain-text version of the quote terms block, for pasting straight into a quote.
  const buildQuoteText = () => {
    const f = getFinalValue();
    const mob = (v: number) => Math.ceil(v * getMobilizationFactor(v));
    const termAmt = (v: number, factor: number) =>
      Math.ceil(v * factor) + mob(v);
    const lines: string[] = [];
    const block = (label: string, factor: number) => {
      lines.push(`${label}:`);
      lines.push(`  Monday - Friday: ${formatCurrency(termAmt(f, factor))}`);
      if (showSaturdayHours)
        lines.push(
          `  Saturday: ${formatCurrency(termAmt(getSaturdayFinalValue(), factor))}`,
        );
      if (showSundayHours)
        lines.push(
          `  Sunday / Holiday: ${formatCurrency(termAmt(getSundayFinalValue(), factor))}`,
        );
      lines.push("");
    };
    block("NET 30", paymentTermFactors.net30);
    block("NET 60", paymentTermFactors.net60);
    block("NET 90", paymentTermFactors.net90);
    lines.push(
      `Mobilization costs of ${formatCurrency(mob(f))} shall be paid out of the above agreed upon price before the first day of work.`,
    );
    if (showTravel) {
      lines.push("");
      lines.push(`Total Travel Cost: ${formatCurrency(getTotalTravelCost())}`);
    }
    return lines.join("\n");
  };

  const handleCopyQuoteText = async () => {
    try {
      await navigator.clipboard.writeText(buildQuoteText());
      setQuoteTextCopied(true);
      setTimeout(() => setQuoteTextCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy quote text:", err);
    }
  };

  // Function to calculate SOV item price
  // Formula: =($G$54/$K$44*I10) * payment term factor
  // G54 = Final (G54), K44 = Work/SOV hrs (from Hours Summary), I10 = Labor Unit (for this row)
  const calculateSOVItemPrice = (
    materialExtension: number,
    expenseExtension: number,
    laborUnit: number,
    term: "net30" | "net60" | "net90" = selectedSovPriceTerm,
  ) => {
    // Get FINAL (G54) - the value after subtotal markup
    const final = getFinalValue();

    // Get Work/SOV hrs (K44) from Hours Summary table
    const workSovHours = toNum(data.hoursSummary.workHours);

    // Calculate the formula: (Final / Work/SOV hrs) * Labor Unit
    const laborAllocation =
      workSovHours > 0 ? (final / workSovHours) * toNum(laborUnit) : 0;

    // Apply the selected payment term factor
    const termFactor = paymentTermFactors[term] ?? 1.0;
    const termAdjusted = Number.isFinite(laborAllocation) ? laborAllocation * termFactor : 0;

    // SOV item price should ONLY include the labor allocation (no materials or expenses)
    return Number.isFinite(termAdjusted) ? termAdjusted : 0;
  };

  // Arrow-key cell navigation for estimate tables (avoids global nav's position heuristic which skips rows / jumps on Windows)
  const SOV_FOCUSABLE_COLS = [0, 1, 2, 6, 7, 11, 12];
  const NON_SOV_FOCUSABLE_COLS = [0, 1, 2, 6, 7, 10, 11];

  const handleEstimateCellKeyDown = (
    e: React.KeyboardEvent,
    tableId: "sov" | "nonSov",
    rowIndex: number,
    colIndex: number,
    rowCount: number,
  ) => {
    const key = e.key;
    if (
      key !== "ArrowLeft" &&
      key !== "ArrowRight" &&
      key !== "ArrowUp" &&
      key !== "ArrowDown"
    )
      return;
    const focusableCols =
      tableId === "sov" ? SOV_FOCUSABLE_COLS : NON_SOV_FOCUSABLE_COLS;
    const colIdx = focusableCols.indexOf(colIndex);
    if (colIdx === -1) return;

    // Always consume arrow keys in estimate cells so global position-based nav doesn't run (avoids skip/jump on Windows)
    e.preventDefault();
    e.stopPropagation();

    let nextRow = rowIndex;
    let nextCol = colIndex;
    if (key === "ArrowRight") {
      if (colIdx >= focusableCols.length - 1) return;
      nextCol = focusableCols[colIdx + 1];
    } else if (key === "ArrowLeft") {
      if (colIdx <= 0) return;
      nextCol = focusableCols[colIdx - 1];
    } else if (key === "ArrowDown") {
      if (rowIndex >= rowCount - 1) return;
      nextRow = rowIndex + 1;
    } else if (key === "ArrowUp") {
      if (rowIndex <= 0) return;
      nextRow = rowIndex - 1;
    }

    const next = document.querySelector(
      `[data-estimate-table="${tableId}"][data-estimate-row="${nextRow}"][data-estimate-col="${nextCol}"]`,
    ) as HTMLElement | null;
    if (next) {
      next.focus();
      if (
        next instanceof HTMLInputElement ||
        next instanceof HTMLTextAreaElement
      ) {
        next.select();
      }
    }
  };

  // Handle input changes
  const handleItemChange = (
    section: "sov" | "nonSov",
    index: number,
    field: string,
    value: string | number,
  ) => {
    const itemsKey = section === "sov" ? "sovItems" : "nonSovItems";
    const newItems = [...data[itemsKey]];

    // For numeric fields, parse value but preserve trailing decimal point for typing
    let parsedValue: string | number = value;
    if (field !== "item" && field !== "notes") {
      const strValue = String(value);
      // If user is still typing a decimal (ends with . or has trailing zeros after decimal)
      if (
        strValue === "" ||
        strValue === "." ||
        strValue.endsWith(".") ||
        /\.\d*0+$/.test(strValue)
      ) {
        // Keep as string to preserve decimal point during typing, but use 0 for empty
        parsedValue = strValue === "" ? 0 : strValue;
      } else {
        // Convert to number for completed values
        parsedValue = parseFloat(strValue) || 0;
      }
    }

    newItems[index] = {
      ...newItems[index],
      [field]: parsedValue,
    };

    setData((prev) => {
      const newData = {
        ...prev,
        [itemsKey]: newItems,
      };

      // Apply formula automatically when SOV or non-SOV item labor data changes
      if (
        (section === "sov" || section === "nonSov") &&
        (field === "laborMen" || field === "laborHours" || field === "quantity")
      ) {
        setIsManualLaborHours(false); // Reset manual flag when labor data changes
        const defaultHours = calculateDefaultLaborHours(newData);
        newData.hoursSummary = {
          ...newData.hoursSummary,
          straightTimeHours: defaultHours.straightTime,
          overtimeHours: defaultHours.overtime,
          doubleTimeHours: defaultHours.doubleTime,
        };
      }

      return newData;
    });
    setIsDirty(true);
    // Clear blanking state for this field when user types something
    const key = makeKey(section, index, field);
    if (blankingKeys.has(key)) {
      const copy = new Set(blankingKeys);
      copy.delete(key);
      setBlankingKeys(copy);
    }
  };

  const applyScopeLibraryItemToRow = (
    section: "sov" | "nonSov",
    index: number,
    libraryItem: EstimatingScopeLibraryItem,
  ) => {
    const itemsKey = section === "sov" ? "sovItems" : "nonSovItems";

    setData((prev) => {
      const newItems = [...prev[itemsKey]];
      const existingItem = newItems[index] || createEmptyLineItem();
      const existingQuantity = Number(existingItem.quantity);

      newItems[index] = normalizeEstimateLineItem({
        ...existingItem,
        rowType: "item",
        item: libraryItem.item_name,
        quantity: existingQuantity > 0 ? existingItem.quantity : 1,
        materialPrice: Number(libraryItem.material_cost) || 0,
        laborMen: Number(libraryItem.tech_count) || 0,
        laborHours: Number(libraryItem.hours) || 0,
        notes: libraryItem.estimate_notes || "",
      });

      const newData = {
        ...prev,
        [itemsKey]: newItems,
      };

      setIsManualLaborHours(false);
      const defaultHours = calculateDefaultLaborHours(newData);
      newData.hoursSummary = {
        ...newData.hoursSummary,
        straightTimeHours: defaultHours.straightTime,
        overtimeHours: defaultHours.overtime,
        doubleTimeHours: defaultHours.doubleTime,
      };

      return newData;
    });

    setBlankingKeys((prev) => {
      const next = new Set(prev);
      ["quantity", "materialPrice", "laborMen", "laborHours"].forEach((field) =>
        next.delete(makeKey(section, index, field)),
      );
      return next;
    });
    setIsDirty(true);
  };

  const handleGeneralChange = (field: string, value: string) => {
    setData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setIsDirty(true);
  };

  const SCOPE_LIBRARY_TRIGGER = "/library";

  // Handles edits to the abstract-scope narrative textarea. Typing "/library"
  // removes the trigger token and opens the Scope Notes library at that caret
  // position so the selected note(s) are inserted in-place.
  const handleScopeNarrativeChange = (value: string) => {
    const triggerIdx = value.lastIndexOf(SCOPE_LIBRARY_TRIGGER);
    if (triggerIdx !== -1) {
      const before = value.slice(0, triggerIdx);
      const after = value.slice(triggerIdx + SCOPE_LIBRARY_TRIGGER.length);
      scopeNarrativeInsertPosRef.current = before.length;
      handleGeneralChange("scopeNarrative", before + after);
      setIsScopeNarrativeLibraryOpen(true);
      return;
    }
    handleGeneralChange("scopeNarrative", value);
  };

  // Converts the scope-note HTML emitted by ProposalScopeNotesModal into plain
  // text suitable for the narrative textarea (one bullet per list item).
  const scopeNotesHtmlToText = (html: string): string => {
    const container = document.createElement("div");
    container.innerHTML = html;
    const items = Array.from(container.querySelectorAll("li"));
    if (items.length > 0) {
      return items
        .map((li) => `• ${(li.textContent || "").trim()}`)
        .filter((line) => line !== "• ")
        .join("\n");
    }
    return (container.textContent || "").trim();
  };

  // Inserts library-selected scope notes into the narrative at the stored caret.
  const insertScopeNotesIntoNarrative = (notesHtml: string) => {
    const text = scopeNotesHtmlToText(notesHtml);
    if (!text) return;
    setData((prev) => {
      const current = prev.scopeNarrative || "";
      const pos = scopeNarrativeInsertPosRef.current ?? current.length;
      const needsLeadingBreak =
        pos > 0 && !current.slice(0, pos).endsWith("\n");
      const insertion = (needsLeadingBreak ? "\n" : "") + text;
      const next = current.slice(0, pos) + insertion + current.slice(pos);
      scopeNarrativeInsertPosRef.current = pos + insertion.length;
      return { ...prev, scopeNarrative: next };
    });
    setIsDirty(true);
  };

  // Drag and drop handlers
  const handleDragStart = (
    e: React.DragEvent,
    index: number,
    type: "sov" | "nonSov",
  ) => {
    if (isViewMode) return;
    setDraggedItemIndex(index);
    setDraggedItemType(type);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(
      "text/html",
      (e.currentTarget as HTMLElement).outerHTML,
    );

    // Find the table row and set its opacity
    const dragHandle = e.currentTarget as HTMLElement;
    const tableRow = dragHandle.closest("tr");
    if (tableRow) {
      tableRow.style.opacity = "0.5";
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    // Find the table row and reset its opacity
    const dragHandle = e.currentTarget as HTMLElement;
    const tableRow = dragHandle.closest("tr");
    if (tableRow) {
      tableRow.style.opacity = "1";
    }

    setDraggedItemIndex(null);
    setDraggedItemType(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (
    e: React.DragEvent,
    dropIndex: number,
    dropType: "sov" | "nonSov",
  ) => {
    e.preventDefault();

    if (
      draggedItemIndex === null ||
      draggedItemType === null ||
      draggedItemType !== dropType
    ) {
      return;
    }

    if (draggedItemIndex === dropIndex) {
      return;
    }

    const itemsKey = dropType === "sov" ? "sovItems" : "nonSovItems";
    const items = [...data[itemsKey]];
    const draggedItem = items[draggedItemIndex];

    // Remove the dragged item
    items.splice(draggedItemIndex, 1);

    // Insert at the new position
    const insertIndex =
      draggedItemIndex < dropIndex ? dropIndex - 1 : dropIndex;
    items.splice(insertIndex, 0, draggedItem);

    setData((prev) => ({
      ...prev,
      [itemsKey]: items,
    }));

    setIsDirty(true);
    if (dropType === "sov") {
      setSelectedSovItemIndexes([]);
    }
    setDraggedItemIndex(null);
    setDraggedItemType(null);
    setDragOverIndex(null);
  };

  // Tab drag and drop handlers
  const handleTabDragStart = (e: React.DragEvent, index: number) => {
    isDraggingTabRef.current = true;
    setDraggedTabIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({ type: "tab", index }),
    );
    // Add visual feedback
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = "0.5";
    // Prevent text selection
    e.dataTransfer.setDragImage(target, 0, 0);
  };

  const handleTabDragEnd = (e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = "1";
    // Use setTimeout to allow drag to complete before allowing clicks
    setTimeout(() => {
      isDraggingTabRef.current = false;
    }, 200);
    setDraggedTabIndex(null);
    setDragOverTabIndex(null);
  };

  const handleTabDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (dragOverTabIndex !== index) {
      setDragOverTabIndex(index);
    }
  };

  const handleTabDragLeave = () => {
    setDragOverTabIndex(null);
  };

  const handleTabDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (draggedTabIndex === null || draggedTabIndex === dropIndex) {
      setDraggedTabIndex(null);
      setDragOverTabIndex(null);
      return;
    }

    // Reorder quotes
    const newQuotes = [...quotes];
    const draggedQuote = newQuotes[draggedTabIndex];

    // Remove the dragged item
    newQuotes.splice(draggedTabIndex, 1);

    // Calculate the new drop index after removal
    let adjustedDropIndex = dropIndex;
    if (draggedTabIndex < dropIndex) {
      adjustedDropIndex = dropIndex - 1;
    }

    // Insert at new position
    newQuotes.splice(adjustedDropIndex, 0, draggedQuote);

    // Update selected index
    let newSelectedIndex = selectedQuoteIndex;
    if (selectedQuoteIndex === draggedTabIndex) {
      // If we dragged the selected tab, it moves to the new position
      newSelectedIndex = adjustedDropIndex;
    } else {
      // Adjust selected index based on where items moved
      if (
        draggedTabIndex < selectedQuoteIndex &&
        adjustedDropIndex >= selectedQuoteIndex
      ) {
        // Dragged item moved from left to right, past the selected item
        newSelectedIndex = selectedQuoteIndex - 1;
      } else if (
        draggedTabIndex > selectedQuoteIndex &&
        adjustedDropIndex <= selectedQuoteIndex
      ) {
        // Dragged item moved from right to left, past the selected item
        newSelectedIndex = selectedQuoteIndex + 1;
      }
    }

    // Update quotes array
    setQuotes(newQuotes);

    // Update selected index and load the quote if it changed
    if (newSelectedIndex !== selectedQuoteIndex) {
      setSelectedQuoteIndex(newSelectedIndex);
      if (newSelectedIndex >= 0 && newSelectedIndex < newQuotes.length) {
        loadQuoteData(newQuotes[newSelectedIndex]);
      }
    }

    // Save the new order
    saveTabOrder(newQuotes.map((q) => q.id));

    setDraggedTabIndex(null);
    setDragOverTabIndex(null);
  };

  // Handler for Saturday labor hours changes
  const handleSaturdayHoursChange = (field: string, value: string) => {
    if (isViewMode) return;
    setIsManualSaturdayHours(true);
    let parsedValue: number | string;
    if (
      value === "" ||
      value === "." ||
      value.endsWith(".") ||
      /\.\d*0+$/.test(value)
    ) {
      parsedValue = value === "" ? 0 : value;
    } else {
      parsedValue = parseFloat(value) || 0;
    }
    setData((prev) => ({
      ...prev,
      saturdayHoursSummary: {
        straightTimeHours: 0,
        overtimeHours: 0,
        doubleTimeHours: 0,
        travelStraightTimeHours: 0,
        travelOvertimeHours: 0,
        travelDoubleTimeHours: 0,
        ...(prev.saturdayHoursSummary || {}),
        [field]: parsedValue,
      },
    }));
    setIsDirty(true);
  };

  // Handler for Sunday/Holiday labor hours changes
  const handleSundayHoursChange = (field: string, value: string) => {
    if (isViewMode) return;
    setIsManualSundayHours(true);
    let parsedValue: number | string;
    if (
      value === "" ||
      value === "." ||
      value.endsWith(".") ||
      /\.\d*0+$/.test(value)
    ) {
      parsedValue = value === "" ? 0 : value;
    } else {
      parsedValue = parseFloat(value) || 0;
    }
    setData((prev) => ({
      ...prev,
      sundayHoursSummary: {
        straightTimeHours: 0,
        overtimeHours: 0,
        doubleTimeHours: 0,
        travelStraightTimeHours: 0,
        travelOvertimeHours: 0,
        travelDoubleTimeHours: 0,
        ...(prev.sundayHoursSummary || {}),
        [field]: parsedValue,
      },
    }));
    setIsDirty(true);
  };

  const handleHoursSummaryChange = (field: string, value: string) => {
    if (isViewMode) return;
    console.log("handleHoursSummaryChange called:", { field, value });

    if (
      ["straightTimeHours", "overtimeHours", "doubleTimeHours"].includes(field)
    ) {
      setIsManualLaborHours(true);
    }
    if (
      [
        "travelStraightTimeHours",
        "travelOvertimeHours",
        "travelDoubleTimeHours",
      ].includes(field)
    ) {
      setIsManualTravelLaborHours(true);
    }

    // Preserve decimal point during typing
    let parsedValue: number | string;
    if (
      value === "" ||
      value === "." ||
      value.endsWith(".") ||
      /\.\d*0+$/.test(value)
    ) {
      // Keep as string to preserve decimal point during typing
      parsedValue = value === "" ? 0 : value;
    } else {
      parsedValue = parseFloat(value) || 0;
    }

    setData((prev) => {
      const newData = {
        ...prev,
        hoursSummary: {
          ...prev.hoursSummary,
          [field]: parsedValue,
        },
      };

      // Apply formula automatically when men or hoursPerDay changes
      if (field === "men" || field === "hoursPerDay") {
        setIsManualLaborHours(false); // Reset manual flag when formula inputs change
        const defaultHours = calculateDefaultLaborHours(newData);
        newData.hoursSummary = {
          ...newData.hoursSummary,
          straightTimeHours: defaultHours.straightTime,
          overtimeHours: defaultHours.overtime,
          doubleTimeHours: defaultHours.doubleTime,
        };
      }

      return newData;
    });
    setIsDirty(true);
  };

  // Recalculate all values when data changes
  useEffect(() => {
    console.log("Recalculation useEffect triggered with data:", {
      straightTimeHours: data.hoursSummary.straightTimeHours,
      overtimeHours: data.hoursSummary.overtimeHours,
      doubleTimeHours: data.hoursSummary.doubleTimeHours,
    });
    const newCalculated = { ...data.calculatedValues };

    // SOV totals
    let sovMaterialTotal = 0;
    let sovExpenseTotal = 0;
    let sovLaborTotal = 0;
    let sovLaborHours = 0;

    data.sovItems.forEach((item) => {
      if (isStructuralLineItem(item)) return;

      const materialExtension = calculateMaterialExtension(
        item.quantity,
        item.materialPrice,
      );
      const expenseExtension = calculateExpenseExtension(
        item.quantity,
        item.expensePrice,
      );
      const laborItemTotal = calculateLaborTotal(
        item.quantity,
        item.laborMen,
        item.laborHours,
      );

      sovMaterialTotal += materialExtension;
      sovExpenseTotal += expenseExtension;
      sovLaborTotal += laborItemTotal;
      sovLaborHours +=
        calculateLaborUnit(item.laborMen, item.laborHours) *
        toNum(item.quantity);
    });

    // Non-SOV totals
    let nonSovMaterialTotal = 0;
    let nonSovExpenseTotal = 0;
    let nonSovLaborTotal = 0;
    let nonSovLaborHours = 0;

    data.nonSovItems.forEach((item) => {
      if (isStructuralLineItem(item)) return;

      const materialExtension = calculateMaterialExtension(
        item.quantity,
        item.materialPrice,
      );
      const expenseExtension = calculateExpenseExtension(
        item.quantity,
        item.expensePrice,
      );
      const laborItemTotal = calculateLaborTotal(
        item.quantity,
        item.laborMen,
        item.laborHours,
      );

      nonSovMaterialTotal += materialExtension;
      nonSovExpenseTotal += expenseExtension;
      nonSovLaborTotal += laborItemTotal;
      nonSovLaborHours +=
        calculateLaborUnit(item.laborMen, item.laborHours) *
        toNum(item.quantity);
    });

    // Update calculated values
    newCalculated.subtotalMaterial = sovMaterialTotal + nonSovMaterialTotal;
    newCalculated.subtotalExpense = sovExpenseTotal + nonSovExpenseTotal;
    newCalculated.subtotalLabor = sovLaborTotal + nonSovLaborTotal;
    newCalculated.nonSovMaterial = nonSovMaterialTotal;
    newCalculated.nonSovExpense = nonSovExpenseTotal;
    newCalculated.nonSovLabor = nonSovLaborTotal;
    newCalculated.sovLaborHours = sovLaborHours;
    newCalculated.nonSovLaborHours = nonSovLaborHours;
    newCalculated.totalLaborHours = sovLaborHours + nonSovLaborHours;

    newCalculated.totalMaterial = newCalculated.subtotalMaterial;
    newCalculated.totalExpense = newCalculated.subtotalExpense;
    newCalculated.totalLabor = newCalculated.subtotalLabor;

    newCalculated.grandTotal =
      newCalculated.totalMaterial +
      newCalculated.totalExpense +
      newCalculated.totalLabor;

    // Calculate hours summary
    const totalWorkHours = sovLaborHours + nonSovLaborHours;
    // Days onsite calculated from SOV hours only (excludes non-SOV hours like PM/reports)
    // This is used to calculate travel trips to the site
    const menNum = toNum(data.hoursSummary.men);
    const hoursPerDayNum = toNum(data.hoursSummary.hoursPerDay);
    const daysOnsite =
      menNum > 0 && hoursPerDayNum > 0
        ? sovLaborHours / (menNum * hoursPerDayNum)
        : 0;

    // Calculate labor rate breakdown based on hours per day
    // 0-8 hours per day = straight time, >8-12 = overtime, >12 = double time
    const hoursPerDay = hoursPerDayNum;
    let straightTimeHours = 0;
    let overtimeHours = 0;
    let doubleTimeHours = 0;

    if (totalWorkHours > 0 && hoursPerDay > 0) {
      const totalDays = Math.ceil(totalWorkHours / hoursPerDay);

      for (let day = 0; day < totalDays; day++) {
        const hoursThisDay = Math.min(
          hoursPerDay,
          totalWorkHours - day * hoursPerDay,
        );

        if (hoursThisDay <= 8) {
          // All hours are straight time
          straightTimeHours += hoursThisDay;
        } else if (hoursThisDay <= 12) {
          // First 8 hours are straight time, rest is overtime
          straightTimeHours += 8;
          overtimeHours += hoursThisDay - 8;
        } else {
          // First 8 hours are straight time, next 4 are overtime, rest is double time
          straightTimeHours += 8;
          overtimeHours += 4;
          doubleTimeHours += hoursThisDay - 12;
        }
      }
    }

    // Calculate travel hours from travel data
    let totalTravelHours = 0;
    if (showTravel) {
      totalTravelHours = computeTravelTotals(travelData).laborHours;
    }

    const totalHours = totalWorkHours + totalTravelHours;

    setData((prev) => ({
      ...prev,
      calculatedValues: newCalculated,
      hoursSummary: {
        ...prev.hoursSummary,
        daysOnsite: daysOnsite,
        workHours: sovLaborHours,
        nonSovHours: nonSovLaborHours,
        travelHours: totalTravelHours,
        totalHours: totalHours,
        straightTimeHours: isManualLaborHours
          ? prev.hoursSummary.straightTimeHours
          : straightTimeHours,
        overtimeHours: isManualLaborHours
          ? prev.hoursSummary.overtimeHours
          : overtimeHours,
        doubleTimeHours: isManualLaborHours
          ? prev.hoursSummary.doubleTimeHours
          : doubleTimeHours,
        travelStraightTimeHours: isManualTravelLaborHours
          ? prev.hoursSummary.travelStraightTimeHours
          : totalTravelHours,
        travelOvertimeHours: isManualTravelLaborHours
          ? prev.hoursSummary.travelOvertimeHours
          : 0,
        travelDoubleTimeHours: isManualTravelLaborHours
          ? prev.hoursSummary.travelDoubleTimeHours
          : 0,
      },
    }));
  }, [
    data.sovItems,
    data.nonSovItems,
    data.hoursSummary.men,
    data.hoursSummary.hoursPerDay,
    showTravel,
    travelData,
    isManualLaborHours,
    isManualTravelLaborHours,
  ]);

  const handleAddLine = (
    section: "sov" | "nonSov",
    rowType: EstimateLineItemRowType = "item",
  ) => {
    const itemsKey = section === "sov" ? "sovItems" : "nonSovItems";
    const nextItem =
      section === "sov"
        ? createLineItemForRowType(rowType)
        : createEmptyLineItem();
    setData((prev) => ({
      ...prev,
      [itemsKey]: [...prev[itemsKey], nextItem],
    }));
    setIsDirty(true);
  };

  const handleClearRow = (section: "sov" | "nonSov", index: number) => {
    const itemsKey = section === "sov" ? "sovItems" : "nonSovItems";
    const newItems = data[itemsKey].filter((_, i) => i !== index);
    setData((prev) => ({
      ...prev,
      [itemsKey]: newItems,
    }));
    if (section === "sov") {
      setSelectedSovItemIndexes((prev) =>
        prev
          .filter((selectedIndex) => selectedIndex !== index)
          .map((selectedIndex) =>
            selectedIndex > index ? selectedIndex - 1 : selectedIndex,
          ),
      );
    }
  };

  const handleClearSelectedSovItems = () => {
    if (selectedSovItemIndexes.length === 0) return;
    if (
      !confirm(
        `Delete ${selectedSovItemIndexes.length} selected SOV item${
          selectedSovItemIndexes.length === 1 ? "" : "s"
        }? This cannot be undone.`,
      )
    ) {
      return;
    }
    const toDelete = new Set(selectedSovItemIndexes);
    setData((prev) => ({
      ...prev,
      sovItems: prev.sovItems.filter((_, i) => !toDelete.has(i)),
    }));
    setSelectedSovItemIndexes([]);
  };

  const toggleTravel = () => {
    setShowTravel(!showTravel);
  };

  // --- Travel updaters (merged model; derived values are computed on read via computeTravelTotals) ---
  const updateTravelGroup = (
    index: number,
    field: string,
    value: string | number,
  ) => {
    if (isViewMode) return;
    const numValue = typeof value === "string" ? Number(value) : value;
    setTravelData((prev) => {
      const travel = (prev.travel ?? []).map((g: any, i: number) =>
        i === index ? { ...g, [field]: numValue } : g,
      );
      return { ...prev, travel };
    });
    setIsDirty(true);
  };

  const addTravelGroup = () => {
    if (isViewMode) return;
    setTravelData((prev) => ({
      ...prev,
      travel: [...(prev.travel ?? []), createEmptyTravelGroup()],
    }));
    setIsDirty(true);
  };

  const removeTravelGroup = (index: number) => {
    if (isViewMode) return;
    setTravelData((prev) => {
      const current = prev.travel ?? [];
      if (current.length <= 1) return prev;
      return { ...prev, travel: current.filter((_: any, i: number) => i !== index) };
    });
    setIsDirty(true);
  };

  const updateTravelSection = (
    section: "perDiem" | "lodging" | "localMiles" | "airTravel" | "rentalCar",
    field: string,
    value: string | number,
  ) => {
    if (isViewMode) return;
    const numValue = typeof value === "string" ? Number(value) : value;
    setTravelData((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: numValue },
    }));
    setIsDirty(true);
  };

  // Function to update theme variables
  const updateThemeVariables = () => {
    const root = document.documentElement;
    const isDark = root.classList.contains("dark");

    if (isDark) {
      root.style.setProperty("--text-color", "#E4E6EB");
      root.style.setProperty("--border-color", "#3A3B3D");
      root.style.setProperty("--input-bg", "#242526");
      root.style.setProperty("--header-bg", "#1C1E21");
      root.style.setProperty("--cell-bg", "#242526");
      root.style.setProperty("--calculated-bg", "#1C1E21");
      root.style.setProperty("--table-bg", "#1C1E21");
      root.style.setProperty("--summary-bg", "#242526");
      root.style.setProperty("--total-bg", "#1C1E21");
      root.style.setProperty("--input-text", "#E4E6EB");
      root.style.setProperty("--input-placeholder", "#6B7280");
      root.style.setProperty("--input-border-focus", "#f26722");
      // Calculated (blue) / total (orange) cells — mirror the field kit palette (dark).
      root.style.setProperty("--calc-cell-bg", "rgba(23,37,84,0.40)");
      root.style.setProperty("--calc-cell-text", "#bfdbfe");
      root.style.setProperty("--calc-cell-border", "#1e3a8a");
      root.style.setProperty("--total-cell-bg", "rgba(67,20,7,0.40)");
      root.style.setProperty("--total-cell-text", "#fed7aa");
      root.style.setProperty("--total-cell-border", "#9a3412");
    } else {
      root.style.setProperty("--text-color", "#333333");
      root.style.setProperty("--border-color", "#E5E7EB");
      root.style.setProperty("--input-bg", "#FFFFFF");
      root.style.setProperty("--header-bg", "#F9FAFB");
      root.style.setProperty("--cell-bg", "#FFFFFF");
      root.style.setProperty("--calculated-bg", "#F9FAFB");
      root.style.setProperty("--table-bg", "#FFFFFF");
      root.style.setProperty("--summary-bg", "#F9FAFB");
      root.style.setProperty("--total-bg", "#F3F4F6");
      root.style.setProperty("--input-text", "#111827");
      root.style.setProperty("--input-placeholder", "#9CA3AF");
      root.style.setProperty("--input-border-focus", "#f26722");
      // Calculated (blue) / total (orange) cells — mirror the field kit palette (light).
      root.style.setProperty("--calc-cell-bg", "#eff6ff");
      root.style.setProperty("--calc-cell-text", "#1e40af");
      root.style.setProperty("--calc-cell-border", "#bfdbfe");
      root.style.setProperty("--total-cell-bg", "#fff7ed");
      root.style.setProperty("--total-cell-text", "#9a3412");
      root.style.setProperty("--total-cell-border", "#fed7aa");
    }
  };

  // Set up theme observer
  useEffect(() => {
    // Initial theme setup
    updateThemeVariables();

    // Create observer to watch for theme changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "class"
        ) {
          updateThemeVariables();
        }
      });
    });

    // Start observing the HTML element for class changes
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Cleanup observer on component unmount
    return () => observer.disconnect();
  }, []);

  // Add global styles for inputs with !important
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      .estimate-form input,
      .estimate-form textarea,
      .estimate-form select {
        background-color: var(--input-bg) !important;
        color: var(--input-text) !important;
        border-color: var(--border-color) !important;
        transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease !important;
      }

      .estimate-form input:focus,
      .estimate-form textarea:focus,
      .estimate-form select:focus {
        border-color: var(--input-border-focus) !important;
        outline: none !important;
        box-shadow: 0 0 0 2px rgba(242, 103, 34, 0.2) !important;
      }

      .estimate-form input::placeholder,
      .estimate-form textarea::placeholder {
        color: var(--input-placeholder) !important;
      }

      .estimate-form input:disabled,
      .estimate-form textarea:disabled,
      .estimate-form select:disabled {
        background-color: var(--calculated-bg) !important;
        cursor: not-allowed;
      }

      .estimate-form table {
        transition: background-color 0.2s ease !important;
      }

      .estimate-form td,
      .estimate-form th {
        transition: background-color 0.2s ease, border-color 0.2s ease !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Add this above the return statement in the EstimateSheet component
  function handleGenerateLetterProposal() {
    setLetterIncludeMF(true);
    setLetterIncludeSaturday(showSaturdayHours);
    setLetterIncludeSunday(showSundayHours);
    setIsQuoteSelectOpen(true);
  }

  function handleGenerateCombinedLetterProposal() {
    setLetterIncludeMF(true);
    setLetterIncludeSaturday(showSaturdayHours);
    setLetterIncludeSunday(showSundayHours);
    setSelectedQuotesForCombined([]);
    setIsCombinedQuoteSelectOpen(true);
  }

  const [isQuoteSelectOpen, setIsQuoteSelectOpen] = useState(false);
  const [isCombinedQuoteSelectOpen, setIsCombinedQuoteSelectOpen] =
    useState(false);
  const [isLetterProposalOpen, setIsLetterProposalOpen] = useState(false);
  const [isLettersListOpen, setIsLettersListOpen] = useState(false);
  const [letters, setLetters] = useState<
    Array<{
      id: string;
      html: string;
      created_at: string;
      quote_number?: string;
      neta_standard?: string;
      title?: string;
    }>
  >([]);
  const [selectedLetterIndex, setSelectedLetterIndex] = useState<number>(-1);
  const [currentLetterId, setCurrentLetterId] = useState<string | null>(null);
  const [selectedQuotesForCombined, setSelectedQuotesForCombined] = useState<
    number[]
  >([]);
  const [scopeQuantities, setScopeQuantities] = useState<
    Record<number, number>
  >({});
  const [singleLetterScopeQuantity, setSingleLetterScopeQuantity] =
    useState<number>(1);
  const [showIndividualPricing, setShowIndividualPricing] =
    useState<boolean>(true);
  const [showGrandTotalPricing, setShowGrandTotalPricing] =
    useState<boolean>(true);
  const [includeMobilizationWhenZero, setIncludeMobilizationWhenZero] =
    useState<boolean>(false);
  const [isScopeNotesModalOpen, setIsScopeNotesModalOpen] = useState(false);
  // Scope Notes library opened from the abstract-scope narrative textarea
  // (separate from the letter-editor instance above). Tracks the caret offset
  // where the selected note(s) should be inserted.
  const [isScopeNarrativeLibraryOpen, setIsScopeNarrativeLibraryOpen] =
    useState(false);
  const scopeNarrativeInsertPosRef = useRef<number | null>(null);
  const [hourlyRates, setHourlyRates] = useState({
    straightTime: DEFAULT_ESTIMATING_PRESETS.default_hourly_rate,
    overtime: DEFAULT_ESTIMATING_PRESETS.overtime_rate,
    doubleTime: DEFAULT_ESTIMATING_PRESETS.double_time_rate,
  });

  const [materialMarkup, setMaterialMarkup] = useState(
    DEFAULT_ESTIMATING_PRESETS.default_markup_factor,
  );

  // Track if presets have been loaded and applied (for new estimates only)
  const [presetsLoaded, setPresetsLoaded] = useState(false);
  const presetsAppliedRef = useRef(false);

  // Fetch and apply estimating presets for new estimates
  useEffect(() => {
    async function loadAndApplyPresets() {
      // Only apply presets once, and only for new estimates (no saved quote data)
      if (presetsAppliedRef.current) return;

      try {
        const presets = await getEstimatingPresets();

        // Re-check after async gap — loadQuoteData may have run while we awaited
        if (presetsAppliedRef.current) return;

        // Check if this is a new estimate (no existing quote selected)
        const hasExistingData = quotes.length > 0 && selectedQuoteIndex >= 0;

        if (!hasExistingData && presets) {
          presetsAppliedRef.current = true;

          // Apply hourly rates from presets (fall back per-field if a DB column is null)
          const finiteOr = (value: unknown, fallback: number) => {
            const num = Number(value);
            return Number.isFinite(num) && num > 0 ? num : fallback;
          };
          setHourlyRates({
            straightTime: finiteOr(
              presets.default_hourly_rate,
              DEFAULT_ESTIMATING_PRESETS.default_hourly_rate,
            ),
            overtime: finiteOr(
              presets.overtime_rate,
              DEFAULT_ESTIMATING_PRESETS.overtime_rate,
            ),
            doubleTime: finiteOr(
              presets.double_time_rate,
              DEFAULT_ESTIMATING_PRESETS.double_time_rate,
            ),
          });

          // Apply material markup from presets
          setMaterialMarkup(
            finiteOr(
              presets.default_markup_factor,
              DEFAULT_ESTIMATING_PRESETS.default_markup_factor,
            ),
          );

          // Apply defaults to data (men, hoursPerDay)
          setData((prev) => ({
            ...prev,
            hoursSummary: {
              ...prev.hoursSummary,
              men: presets.default_number_of_men,
              hoursPerDay: presets.default_hours_per_day,
            },
          }));

          // Apply travel data presets
          setTravelData((prev) => ({
            ...prev,
            travel: prev.travel?.length
              ? [
                  {
                    ...prev.travel[0],
                    numVehicles: presets.default_number_of_vehicles,
                    rate: presets.default_vehicle_cost_per_mile,
                    numMen: presets.default_number_of_men,
                    travelLaborRate: presets.default_hourly_rate,
                  },
                ]
              : prev.travel,
            perDiem: {
              ...(prev.perDiem || {}),
              dailyRate: presets.default_per_diem_rate,
              numMen: presets.default_number_of_men,
            },
            lodging: {
              ...(prev.lodging || {}),
              numMen: presets.default_number_of_men,
              rate: presets.default_lodging_rate,
            },
            localMiles: {
              ...(prev.localMiles || {}),
              numVehicles: presets.default_number_of_vehicles,
              milesPerDay: presets.default_local_miles_per_day,
              rate: presets.default_vehicle_cost_per_mile,
            },
            airTravel: {
              ...(prev.airTravel || {}),
              numMen: presets.default_flight_number_of_men,
              flightRate: presets.default_flight_rate,
              luggageFees: presets.default_flight_luggage_fees,
            },
            rentalCar: {
              ...(prev.rentalCar || {}),
              numCars: presets.default_rental_number_of_cars,
              rate: presets.default_rental_rate,
            },
          }));

          console.log("Estimating presets applied:", presets);
        }

        setPresetsLoaded(true);
      } catch (error) {
        console.error("Error loading estimating presets:", error);
        setPresetsLoaded(true); // Continue with hardcoded defaults on error
      }
    }

    loadAndApplyPresets();
  }, [quotes.length, selectedQuoteIndex]);

  // Proposal letter template sections (admin-editable from Estimating Presets
  // > Proposal Template). Defaults are used until the presets row loads; null
  // DB columns fall back to the built-in text, so letters are unchanged until
  // an admin edits a section.
  const [proposalTemplate, setProposalTemplate] =
    useState<ProposalTemplateSections>(DEFAULT_PROPOSAL_TEMPLATE_SECTIONS);
  useEffect(() => {
    let cancelled = false;
    getEstimatingPresets()
      .then((presets) => {
        if (!cancelled)
          setProposalTemplate(resolveProposalTemplateSections(presets));
      })
      .catch((err) =>
        console.error("Error loading proposal template sections:", err),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  // Trigger recalculation when hourly rates change
  useEffect(() => {
    // This will cause the component to re-render and recalculate getFinalValue()
    // The getFinalValue function now uses hourlyRates, so changing rates will update totals
  }, [hourlyRates]);

  const letterUpdateSourceRef = useRef<"user" | "programmatic">("programmatic");
  const letterEditorRef = useRef<HTMLDivElement | null>(null);
  const imageHandlerRef = useRef<LetterImageHandlerRef>(null);
  const draggedScopeNotesRef = useRef<HTMLElement | null>(null);
  const [selectedLetterQuoteIndex, setSelectedLetterQuoteIndex] = useState<
    number | null
  >(null);
  const [letterHtml, setLetterHtml] = useState<string>("");
  const [isLetterDirty, setIsLetterDirty] = useState<boolean>(false);
  const [isSavingLetter, setIsSavingLetter] = useState<boolean>(false);
  const savedLetterHtmlRef = useRef<string>("");
  const [contactData, setContactData] = useState<{
    first_name: string;
    last_name: string;
  } | null>(null);
  const [isViewMode, setIsViewMode] = useState<boolean>(false);
  const [netaStandard, setNetaStandard] = useState<string>("");
  const [letterProposalName, setLetterProposalName] = useState<string>("");

  // Cmd/Ctrl+S saves the estimate (when editable). Kept in a ref so the single
  // window listener always runs against the latest state/handler.
  const keyboardSaveRef = useRef<() => void>(() => {});
  keyboardSaveRef.current = () => {
    if (isViewMode || isSaving) return;
    void saveQuote();
  };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        keyboardSaveRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const syncLetterEditorHtmlFromDom = () => {
    const editor = letterEditorRef.current;
    if (!editor) return;
    letterUpdateSourceRef.current = "user";
    const newHtml = editor.innerHTML;
    if (newHtml !== letterHtml) {
      setLetterHtml(newHtml);
    }
    if (newHtml.trim() !== savedLetterHtmlRef.current.trim()) {
      setIsLetterDirty(true);
    }
  };

  const runLetterEditorCommand = (command: string) => {
    const editor = letterEditorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false);
    syncLetterEditorHtmlFromDom();
  };

  // NETA choices come from the admin-editable Proposal Template (falling back to
  // built-in defaults until presets load). The leading "-- Select --" is a UI
  // placeholder only and is never stored per-letter.
  const NETA_OPTIONS = [
    { value: "", text: "-- Select --" },
    ...proposalTemplate.netaOptions.map((o) => ({
      value: o.value,
      text: o.text,
    })),
  ];

  /** Render all admin-added custom sections placed at a given anchor. */
  const renderCustomSectionsAt = (
    anchor: string,
    tokens: Record<string, string>,
  ): string =>
    proposalTemplate.customSections
      .filter((s) => s.anchor === anchor)
      .map((s) => renderTemplateSection(s.html, tokens))
      .join("");

  // Fix duplicate/bolded label bug in Pricing & Terms
  function normalizePricingTermsHtml(html: string): string {
    if (!html || !html.includes("Pricing & Terms")) return html;
    let out = html;
    const opt1Label =
      "Option 1: Where NET 30 Terms are applicable and agreed upon:";
    const opt2Label =
      "Option 2: Where NET 60 Terms are applicable and agreed upon:";
    const opt3Label =
      "Option 3: Where NET 90 Terms are applicable and agreed upon:";
    // Fix plain-text duplicated label (no <b>): "Option 1: ... agreed upon: Option 1: ... agreed upon: 42,541.00"
    out = out.replace(
      new RegExp(
        `(${opt1Label})\\s*${opt1Label.replace(/[()]/g, "\\$&")}\\s*`,
        "g",
      ),
      "$1 ",
    );
    out = out.replace(
      new RegExp(
        `(${opt2Label})\\s*${opt2Label.replace(/[()]/g, "\\$&")}\\s*`,
        "g",
      ),
      "$1 ",
    );
    out = out.replace(
      new RegExp(
        `(${opt3Label})\\s*${opt3Label.replace(/[()]/g, "\\$&")}\\s*`,
        "g",
      ),
      "$1 ",
    );
    out = out.replace(
      /Mobilization costs of\s+Mobilization costs of\s+/g,
      "Mobilization costs of ",
    );
    // Fix duplicated label inside <b> followed by amount outside
    out = out.replace(
      new RegExp(
        `(${opt1Label})\\s*<b[^>]*>\\s*${opt1Label.replace(/[()]/g, "\\$&")}\\s*</b>\\s*\\$([\\d,]+\\.\\d{2})`,
        "gi",
      ),
      "$1 <b>$$$2</b>",
    );
    out = out.replace(
      new RegExp(
        `(${opt2Label})\\s*<b[^>]*>\\s*${opt2Label.replace(/[()]/g, "\\$&")}\\s*</b>\\s*\\$([\\d,]+\\.\\d{2})`,
        "gi",
      ),
      "$1 <b>$$$2</b>",
    );
    out = out.replace(
      new RegExp(
        `(${opt3Label})\\s*<b[^>]*>\\s*${opt3Label.replace(/[()]/g, "\\$&")}\\s*</b>\\s*\\$([\\d,]+\\.\\d{2})`,
        "gi",
      ),
      "$1 <b>$$$2</b>",
    );
    // Fix duplicated label + amount inside <b>
    out = out.replace(
      new RegExp(
        `(${opt1Label})\\s*<b[^>]*>\\s*${opt1Label.replace(/[()]/g, "\\$&")}\\s*\\$([\\d,]+\\.\\d{2})\\s*</b>`,
        "gi",
      ),
      "$1 <b>$$$2</b>",
    );
    out = out.replace(
      new RegExp(
        `(${opt2Label})\\s*<b[^>]*>\\s*${opt2Label.replace(/[()]/g, "\\$&")}\\s*\\$([\\d,]+\\.\\d{2})\\s*</b>`,
        "gi",
      ),
      "$1 <b>$$$2</b>",
    );
    out = out.replace(
      new RegExp(
        `(${opt3Label})\\s*<b[^>]*>\\s*${opt3Label.replace(/[()]/g, "\\$&")}\\s*\\$([\\d,]+\\.\\d{2})\\s*</b>`,
        "gi",
      ),
      "$1 <b>$$$2</b>",
    );
    // Fix "Mobilization costs of <b>Mobilization costs of 2,959.00</b>"
    out = out.replace(
      /Mobilization costs of\s*<b[^>]*>\s*Mobilization costs of\s*\$([\d,]+\.\d{2})\s*<\/b>/gi,
      "Mobilization costs of <b>$$$1</b>",
    );
    return out;
  }

  // Update only the NETA standard span via string replace so the rest of the letter HTML is never parsed/serialized (avoids corrupting Pricing & Terms).
  function replaceNetaSpanInHtml(html: string, newText: string): string {
    const escaped = (newText || "[Select NETA Standard]")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    return html.replace(
      /<span id="neta-standard-text">[^<]*<\/span>/g,
      `<span id="neta-standard-text">${escaped}</span>`,
    );
  }

  function escapeLetterHtml(value: unknown): string {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function buildSovProposalTableHtml(
    sovItems: any[],
    includeNotes: boolean,
  ): string {
    const borderColor = "#ccc";
    const makeCellStyle = (
      options: {
        right?: boolean;
        bottom?: boolean;
        align?: "left" | "center";
        header?: boolean;
        section?: boolean;
        blank?: boolean;
        relative?: boolean;
      } = {},
    ) => {
      const {
        right = true,
        bottom = true,
        align = "left",
        header = false,
        section = false,
        blank = false,
        relative = false,
      } = options;
      return (
        [
          "box-sizing:border-box",
          "border:0",
          right ? `border-right:1px solid ${borderColor}` : "",
          bottom ? `border-bottom:1px solid ${borderColor}` : "",
          blank ? "padding:10px 0" : "padding:4px 12px",
          blank ? "height:18px" : "",
          "white-space:normal",
          "overflow-wrap:anywhere",
          "word-break:normal",
          "vertical-align:top",
          `text-align:${align}`,
          header || section ? "background:#f9fafb" : "",
          header || section ? "font-weight:bold" : "",
          relative ? "position:relative" : "",
        ]
          .filter(Boolean)
          .join(";") + ";"
      );
    };
    const resizeHandle =
      '<span class="amp-col-resize print-hidden" contenteditable="false" style="position:absolute;right:-5px;top:0;width:10px;height:100%;cursor:col-resize;z-index:2;border-right:2px solid rgba(242,103,34,0.35);"></span>';
    const rows =
      sovItems && sovItems.length > 0
        ? sovItems
        : [{ item: "24-hour Power Study", quantity: 1, notes: "" }];
    const columnCount = includeNotes ? 3 : 2;
    const colgroup = includeNotes
      ? '<colgroup><col style="width:55%;" /><col style="width:15%;" /><col style="width:30%;" /></colgroup>'
      : '<colgroup><col style="width:75%;" /><col style="width:25%;" /></colgroup>';
    const header = includeNotes
      ? `<tr><th style="${makeCellStyle({ header: true, align: "center", relative: true })}">Item${resizeHandle}</th><th style="${makeCellStyle({ header: true, align: "center", relative: true })}">Quantity${resizeHandle}</th><th style="${makeCellStyle({ header: true, align: "center", right: false })}">Notes</th></tr>`
      : `<tr><th style="${makeCellStyle({ header: true, align: "center", relative: true })}">Item${resizeHandle}</th><th style="${makeCellStyle({ header: true, align: "center", right: false })}">Quantity</th></tr>`;
    const bodyRows = rows
      .map((item: any, index: number) => {
        const bottom = index !== rows.length - 1;
        if (isEstimateBlankRow(item)) {
          return `<tr class="amp-sov-blank-row"><td colspan="${columnCount}" style="${makeCellStyle({ right: false, bottom, blank: true })}">&nbsp;</td></tr>`;
        }

        const name = escapeLetterHtml(item?.item || "");
        if (isEstimateSectionRow(item)) {
          return `<tr class="amp-sov-section-row"><td colspan="${columnCount}" style="${makeCellStyle({ right: false, bottom, section: true, align: "center" })}">${name}</td></tr>`;
        }
        if (isEstimateSubsectionRow(item)) {
          return `<tr class="amp-sov-subsection-row"><td colspan="${columnCount}" style="${makeCellStyle({ right: false, bottom, align: "center" })};font-style:italic;color:#6b7280;font-size:0.88em;">${name}</td></tr>`;
        }

        const qty = escapeLetterHtml(item?.quantity ?? item?.qty ?? 1);
        const notesCell = includeNotes
          ? `<td style="${makeCellStyle({ right: false, bottom })}">${escapeLetterHtml(item?.notes || "")}</td>`
          : "";
        return `<tr><td style="${makeCellStyle({ bottom })}">${name}</td><td style="${makeCellStyle({ right: includeNotes, bottom, align: "center" })}">${qty}</td>${notesCell}</tr>`;
      })
      .join("");

    return `
      <table class="amp-section amp-sov-table" style="width:100%;border-collapse:separate;border-spacing:0;margin-bottom:16px;table-layout:fixed;border:1px solid ${borderColor};">
        ${colgroup}
        <thead>${header}</thead>
        <tbody>${bodyRows}</tbody>
      </table>
    `;
  }

  // Renders the proposal "Scope" section. For abstract scopes the estimate can
  // opt into a free-text narrative (useScopeNarrative); otherwise it falls back
  // to the standard SOV Item & Quantity table.
  function buildScopeProposalHtml(
    source: any,
    sovItems: any[],
    includeNotes: boolean,
  ): string {
    // Default to the SOV table when the flag is absent (legacy estimates).
    const showSovItems = source?.useSovItems !== false;
    const narrative = (source?.scopeNarrative ?? "").toString().trim();
    const showNarrative = !!source?.useScopeNarrative && narrative.length > 0;

    let narrativeHtml = "";
    if (showNarrative) {
      const paragraphs = narrative
        .split(/\n{2,}/)
        .map(
          (block: string) =>
            `<p style="margin:0 0 8px;">${escapeLetterHtml(block).replace(/\n/g, "<br/>")}</p>`,
        )
        .join("");
      narrativeHtml = `<div class="amp-section amp-scope-narrative" style="margin-bottom:16px;">${paragraphs}</div>`;
    }

    const tableHtml = showSovItems
      ? buildSovProposalTableHtml(sovItems, includeNotes)
      : "";

    // Narrative first (descriptive intro), then the itemized table when both on.
    // If neither is selected, fall back to the table so the proposal isn't empty.
    if (!narrativeHtml && !tableHtml) {
      return buildSovProposalTableHtml(sovItems, includeNotes);
    }
    return `${narrativeHtml}${tableHtml}`;
  }

  function applyNetaTextByValue(value: string) {
    try {
      const option = NETA_OPTIONS.find((o) => o.value === value);
      const newText = option?.text || "[Select NETA Standard]";

      // 1) Update the visible text in the editor DOM — nothing else
      const editor = letterEditorRef.current;
      if (editor) {
        const span = editor.querySelector(
          "#neta-standard-text",
        ) as HTMLElement | null;
        if (span) span.textContent = newText;
      }

      // 2) Update letterHtml state via string-only replacement, marked as 'user'
      //    so the programmatic-write effect does NOT rewrite editor.innerHTML
      if (letterHtml.includes("neta-standard-text")) {
        letterUpdateSourceRef.current = "user";
        setLetterHtml(replaceNetaSpanInHtml(letterHtml, newText));
      }

      // 3) Persist the dropdown value
      setNetaStandard(value);
    } catch {}
  }

  // When letterHtml changes due to programmatic updates, write it into the editor
  useEffect(() => {
    if (letterUpdateSourceRef.current !== "programmatic") return;
    const editor = letterEditorRef.current;
    if (!editor) return;

    // Don't interfere if user is actively editing (has focus)
    if (document.activeElement === editor) return;
    // Skip forcing focus/selection if we're re-rendering after a move to preserve scroll
    if (skipNextFocusRef.current) {
      skipNextFocusRef.current = false;
      return;
    }

    try {
      // Write HTML without triggering React re-render of contentEditable
      if (editor.innerHTML !== letterHtml) {
        editor.innerHTML = letterHtml;
      }

      // Only set focus and cursor if the editor doesn't already have focus
      if (document.activeElement !== editor) {
        editor.focus();
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          const range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(false);
          selection.addRange(range);
        }
      }
    } catch {}
  }, [letterHtml]);

  // Restore letter proposal state from Supabase preferences if needed (but not for fresh generation).
  // Do not run this for the saved-letters list mode; that view should not also
  // rehydrate the letter editor, which is expensive and can cause UI thrash.
  useEffect(() => {
    if (mode) return;

    console.log("Restoration useEffect triggered:", {
      mode,
      isLetterProposalOpen,
      isQuoteSelectOpen,
    });

    if (
      !isLetterProposalOpen &&
      !isQuoteSelectOpen &&
      selectedLetterQuoteIndex === null
    ) {
      const savedState = getLetterProposalState();

      console.log("Checking restoration conditions:", {
        savedOpen: savedState.isOpen,
        hasSavedHtml: !!savedState.html,
      });

      if (savedState.isOpen && savedState.html) {
        console.log("Restoring letter proposal from Supabase preferences");
        setIsLetterProposalOpen(true);
        const normalized = normalizePricingTermsHtml(savedState.html);
        setLetterHtml(normalized);
        savedLetterHtmlRef.current = normalized;
        setIsLetterDirty(false);
        if (savedState.quoteIndex !== null) {
          setSelectedLetterQuoteIndex(savedState.quoteIndex);
        }
        if (savedState.netaStandard) {
          setNetaStandard(savedState.netaStandard);
        }
      }
    } else {
      console.log("Skipping restoration due to conditions:", {
        mode,
        isLetterProposalOpen,
        isQuoteSelectOpen,
        selectedLetterQuoteIndex,
      });
    }
  }, [
    opportunityId,
    mode,
    isLetterProposalOpen,
    isQuoteSelectOpen,
    selectedLetterQuoteIndex,
    getLetterProposalState,
  ]);

  // When letter proposal FIRST opens, make sure editor is populated
  const letterEditorPopulatedRef = useRef(false);
  useEffect(() => {
    if (!isLetterProposalOpen) {
      letterEditorPopulatedRef.current = false;
      return;
    }
    if (isLetterProposalOpen && letterHtml && letterEditorRef.current) {
      // Small delay to ensure editor is fully rendered
      setTimeout(() => {
        const editor = letterEditorRef.current;
        if (!editor) return;

        // Only populate editor once when it first opens or is empty; never re-write on subsequent letterHtml changes
        if (
          !letterEditorPopulatedRef.current ||
          editor.innerHTML.trim() === ""
        ) {
          letterEditorPopulatedRef.current = true;
          letterUpdateSourceRef.current = "programmatic";
          editor.innerHTML = letterHtml;
          // Cleanup legacy blocks that should no longer appear
          try {
            editor
              .querySelectorAll(".amp-combined-summary")
              .forEach((el) => el.remove());
          } catch {}
        }

        // Bind up/down arrow controls for combined-letter scope blocks
        try {
          const blocks = Array.from(
            editor.querySelectorAll(".amp-scope-block"),
          ) as HTMLElement[];
          if (blocks.length) {
            blocks.forEach((block) => {
              if ((block as any)._ampArrowsBound) return;
              const upBtn = block.querySelector(
                ".amp-scope-controls .move-up",
              ) as HTMLButtonElement | null;
              const downBtn = block.querySelector(
                ".amp-scope-controls .move-down",
              ) as HTMLButtonElement | null;
              const moveUp = (e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                const parent = block.parentElement;
                if (!parent) return;
                const prevViewportTop = block.getBoundingClientRect().top;
                const prevWindowScrollY =
                  window.scrollY || document.documentElement.scrollTop;
                const prevEditorScrollTop = (editor as HTMLElement).scrollTop;
                try {
                  const sel = window.getSelection();
                  sel && sel.removeAllRanges();
                } catch {}
                const prev = block.previousElementSibling as HTMLElement | null;
                if (prev && prev.classList.contains("amp-scope-block")) {
                  parent.insertBefore(block, prev);
                  try {
                    const html = editor.innerHTML;
                    skipNextFocusRef.current = true;
                    const st = prevEditorScrollTop;
                    setLetterHtml(html);
                    setTimeout(() => {
                      try {
                        const newTop = block.getBoundingClientRect().top;
                        const delta = newTop - prevViewportTop;
                        if (Number.isFinite(delta)) {
                          window.scrollTo({
                            top: prevWindowScrollY + delta,
                            behavior: "instant" as any,
                          });
                        }
                        (editor as HTMLElement).scrollTop = st;
                      } catch {}
                    }, 0);
                    // Save to Supabase (debounced by service)
                    saveLetterProposalHtml(html);
                  } catch {}
                }
              };
              const moveDown = (e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                const parent = block.parentElement;
                if (!parent) return;
                const prevViewportTop = block.getBoundingClientRect().top;
                const prevWindowScrollY =
                  window.scrollY || document.documentElement.scrollTop;
                const prevEditorScrollTop = (editor as HTMLElement).scrollTop;
                try {
                  const sel = window.getSelection();
                  sel && sel.removeAllRanges();
                } catch {}
                const next = block.nextElementSibling as HTMLElement | null;
                if (next && next.classList.contains("amp-scope-block")) {
                  parent.insertBefore(next, block);
                  try {
                    const html = editor.innerHTML;
                    skipNextFocusRef.current = true;
                    const st = prevEditorScrollTop;
                    setLetterHtml(html);
                    setTimeout(() => {
                      try {
                        const newTop = block.getBoundingClientRect().top;
                        const delta = newTop - prevViewportTop;
                        if (Number.isFinite(delta)) {
                          window.scrollTo({
                            top: prevWindowScrollY + delta,
                            behavior: "instant" as any,
                          });
                        }
                        (editor as HTMLElement).scrollTop = st;
                      } catch {}
                    }, 0);
                    // Save to Supabase (debounced by service)
                    saveLetterProposalHtml(html);
                  } catch {}
                }
              };
              upBtn?.addEventListener("click", moveUp as any);
              downBtn?.addEventListener("click", moveDown as any);
              (block as any)._ampArrowsBound = true;
            });
          }
        } catch {}

        // Scope quantity controls have been moved to the quote selection modal
        // No longer needed here since quantities are set before letter generation
      }, 100);
    }
  }, [isLetterProposalOpen, letterHtml]);

  useEffect(() => {
    if (!isLetterProposalOpen) return;
    const editor = letterEditorRef.current;
    if (!editor) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const handle = target?.closest?.(".amp-col-resize") as HTMLElement | null;
      if (!handle) return;

      const headerCell = handle.closest("th") as HTMLTableCellElement | null;
      const table = headerCell?.closest(
        "table.amp-sov-table",
      ) as HTMLTableElement | null;
      const headerRow = headerCell?.parentElement;
      if (!headerCell || !table || !headerRow) return;

      const columnIndex = Array.from(headerRow.children).indexOf(headerCell);
      const columns = Array.from(
        table.querySelectorAll("col"),
      ) as HTMLTableColElement[];
      const nextColumnIndex = columnIndex + 1;
      if (columnIndex < 0 || !columns[columnIndex] || !columns[nextColumnIndex])
        return;

      event.preventDefault();
      event.stopPropagation();

      const tableWidth = table.getBoundingClientRect().width || 1;
      const headerCells = Array.from(
        headerRow.children,
      ) as HTMLTableCellElement[];
      const startWidths = columns.map((column, index) => {
        const measured = headerCells[index]?.getBoundingClientRect().width || 0;
        const percent = parseFloat(column.style.width || "0");
        return (
          measured ||
          (Number.isFinite(percent)
            ? (percent / 100) * tableWidth
            : tableWidth / columns.length)
        );
      });
      const startX = event.clientX;
      const currentStart = startWidths[columnIndex];
      const nextStart = startWidths[nextColumnIndex];
      const combinedWidth = currentStart + nextStart;
      const minWidth = Math.max(24, Math.min(56, combinedWidth / 3));
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const currentWidth = Math.max(
          minWidth,
          Math.min(combinedWidth - minWidth, currentStart + delta),
        );
        const nextWidth = combinedWidth - currentWidth;

        columns[columnIndex].style.width =
          `${(currentWidth / tableWidth) * 100}%`;
        columns[nextColumnIndex].style.width =
          `${(nextWidth / tableWidth) * 100}%`;
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;

        letterUpdateSourceRef.current = "user";
        const newHtml = editor.innerHTML;
        setLetterHtml(newHtml);
        setIsLetterDirty(newHtml.trim() !== savedLetterHtmlRef.current.trim());
        saveLetterProposalHtml(newHtml);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    editor.addEventListener("mousedown", onMouseDown);
    return () => {
      editor.removeEventListener("mousedown", onMouseDown);
    };
  }, [isLetterProposalOpen, saveLetterProposalHtml]);

  // Drag-and-drop for scope notes: allow moving the scope notes block anywhere in the letter
  useEffect(() => {
    if (!isLetterProposalOpen) return;
    const editor = letterEditorRef.current;
    if (!editor) return;

    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (
        !target.classList.contains("scope-notes-drag-handle") &&
        !target.closest(".scope-notes-drag-handle")
      )
        return;
      const section = target.closest(".scope-notes-section");
      if (!section) return;
      e.stopPropagation();
      draggedScopeNotesRef.current = section as HTMLElement;
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("application/amp-scope-notes", "1");
        e.dataTransfer.setData("text/plain", "Scope Notes");
      }
    };

    const handleDragEnd = () => {
      draggedScopeNotesRef.current = null;
    };

    const handleDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("application/amp-scope-notes"))
        return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: DragEvent) => {
      const dragged = draggedScopeNotesRef.current;
      if (!dragged || !letterEditorRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const dropTarget = e.target as Node;
      const dropEl = (
        dropTarget.nodeType === Node.TEXT_NODE
          ? dropTarget.parentElement
          : dropTarget
      ) as HTMLElement;
      if (!dropEl) return;
      if (dragged.contains(dropEl) || dragged === dropEl) return;

      const letterRoot =
        letterEditorRef.current.querySelector("#letter-proposal") ||
        letterEditorRef.current;
      if (!letterRoot.contains(dropEl)) return;

      // Insert before the section-level block that contains the drop target
      const block = dropEl.closest(
        '.amp-section, .amp-scope-block, .scope-notes-section, table.amp-section, div[style*="margin"]',
      );
      const insertBefore: Node =
        block && letterRoot.contains(block) ? block : dropEl;
      if (insertBefore === dragged) return; // avoid no-op
      const parent = insertBefore.parentNode;
      if (!parent) return;
      parent.insertBefore(dragged, insertBefore);

      letterUpdateSourceRef.current = "programmatic";
      setLetterHtml(letterEditorRef.current.innerHTML);
      setIsLetterDirty(true);
      draggedScopeNotesRef.current = null;
    };

    editor.addEventListener("dragstart", handleDragStart, true);
    editor.addEventListener("dragend", handleDragEnd, true);
    editor.addEventListener("dragover", handleDragOver, true);
    editor.addEventListener("drop", handleDrop, true);
    return () => {
      editor.removeEventListener("dragstart", handleDragStart, true);
      editor.removeEventListener("dragend", handleDragEnd, true);
      editor.removeEventListener("dragover", handleDragOver, true);
      editor.removeEventListener("drop", handleDrop, true);
    };
  }, [isLetterProposalOpen]);

  // Function to format address for letter proposal
  function formatAddressForLetter(address: string): string {
    if (!address) return "Address";

    // Remove "United States" from the address
    const formattedAddress = address.replace(/,?\s*United States\s*$/i, "");

    // Split by commas and format each part
    const parts = formattedAddress
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part);

    if (parts.length === 0) return "Address";
    if (parts.length === 1) return parts[0];

    // Format as: "Street Address," on first line, "City, State, Zip" on second line
    const streetAddress = parts[0] + ",";
    const cityStateZip = parts.slice(1).join(", ");

    return `${streetAddress}<br/>${cityStateZip}`;
  }

  function handleSelectQuoteForLetter(index: number) {
    console.log("handleSelectQuoteForLetter called with index:", index);
    setSelectedLetterQuoteIndex(index);
    setIsQuoteSelectOpen(false);

    // Prevent AuthContext refresh while letter proposal is open
    try {
      localStorage.setItem("AMP_SUSPEND_REFRESH", "true");
    } catch {}

    // Generate letter immediately
    console.log("Generating letter proposal immediately");
    generateLetterProposal(index);
  }

  // Function to preload assets before generating letter
  const preloadAssets = () => {
    return new Promise((resolve) => {
      let loadedCount = 0;
      const totalAssets = 2;

      const checkComplete = () => {
        loadedCount++;
        if (loadedCount >= totalAssets) {
          resolve(true);
        }
      };

      const logo = new Image();
      const signature = new Image();

      // Handle both success and error cases for logo
      logo.onload = checkComplete;
      logo.onerror = () => {
        console.warn("Failed to load logo image, continuing anyway");
        checkComplete();
      };

      // Handle both success and error cases for signature
      signature.onload = checkComplete;
      signature.onerror = () => {
        console.warn("Failed to load signature image, continuing anyway");
        checkComplete();
      };

      // Start loading images
      logo.src =
        "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png";
      signature.src =
        (window as any)?.AMP_SIGNATURE_URL ||
        "/img/brian-rodgers-signature.jpg";

      // Fallback timeout in case images take too long
      setTimeout(() => {
        console.warn("Asset preloading timed out, continuing anyway");
        resolve(true);
      }, 5000); // 5 second timeout
    });
  };

  function generateLetterProposal(index: number) {
    console.log("generateLetterProposal called with index:", index);
    // Preload assets first, then generate the letter
    preloadAssets()
      .then(() => {
        console.log(
          "Assets preloaded successfully, calling generateLetterContent",
        );
        generateLetterContent(index);
      })
      .catch((error) => {
        console.error("Error preloading assets:", error);
        // Continue with letter generation even if asset loading fails
        console.log(
          "Continuing with letter generation despite asset loading error",
        );
        generateLetterContent(index);
      });
  }

  // Function to update letter_proposal_created_date when saving letter proposal
  async function updateLetterProposalCreatedDate() {
    console.log(
      "updateLetterProposalCreatedDate called - updating date and dispatching event",
    );

    try {
      // Set letter proposal created date to today at noon UTC to prevent timezone shifts
      const today = new Date().toISOString().substring(0, 10);
      const letterProposalCreatedDate = today + "T12:00:00.000Z";

      console.log(
        "Updating letter_proposal_date to:",
        letterProposalCreatedDate,
      );

      const { error: updateError } = await supabase
        .schema("business")
        .from("opportunities")
        .update({ letter_proposal_date: letterProposalCreatedDate })
        .eq("id", opportunityId);

      if (updateError) {
        console.warn(
          "Failed to update letter_proposal_created_date:",
          updateError,
        );
      } else {
        console.log(
          "Successfully updated letter_proposal_date, dispatching event",
        );
        // Notify OpportunityDetail after letter is saved
        window.dispatchEvent(
          new CustomEvent("letterProposalGenerated", {
            detail: { opportunityId },
          }),
        );
      }
    } catch (error) {
      console.error("Error updating letter proposal created date:", error);
    }
  }

  function generateLetterContent(index: number) {
    console.log("generateLetterContent called with index:", index);
    console.log("Current isLetterProposalOpen state:", isLetterProposalOpen);

    // Generate the letter HTML template with data from quotes[index] and opportunityData
    const quote = quotes[index];
    const today = new Date();
    const dateStr = today.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const customer: { name: string; company_name: string; address: string } =
      (opportunityData?.customer as any) || {
        name: "",
        company_name: "",
        address: "",
      };
    // --- FIX: Always parse quote.data if it's a string, then pull sovItems from the parsed object ---
    let parsedData = quote.data;
    if (typeof parsedData === "string") {
      try {
        parsedData = JSON.parse(parsedData);
      } catch (e) {
        parsedData = {};
      }
    }
    let sovItems: any[] = [];
    if (Array.isArray(parsedData.sovItems) && parsedData.sovItems.length > 0) {
      // Filter out placeholder/empty rows so only real items appear in the letter
      sovItems = parsedData.sovItems.filter(shouldShowSovItemInProposal);
    }
    // --- Build the material + expense base (shared across all day-type scenarios) ---
    function getMaterialExpenseBaseParsed(parsed: any) {
      const cv = parsed.calculatedValues || {};
      return (
        (cv.totalMaterial || 0) * 1.09 * materialMarkup +
        (cv.totalExpense || 0) * 1.09 +
        (cv.nonSovExpense || 0) * 1.0
      );
    }
    // Work labor cost for a given hours summary
    function getWorkLaborCostParsed(hs: any) {
      return (
        (hs?.straightTimeHours || 0) * hourlyRates.straightTime +
        (hs?.overtimeHours || 0) * hourlyRates.overtime +
        (hs?.doubleTimeHours || 0) * hourlyRates.doubleTime
      );
    }
    // Travel labor cost from hours summary (now tracked in labor table)
    function getTravelLaborCostParsed(hs: any) {
      return (
        (hs?.travelStraightTimeHours || 0) * hourlyRates.straightTime +
        (hs?.travelOvertimeHours || 0) * hourlyRates.overtime +
        (hs?.travelDoubleTimeHours || 0) * hourlyRates.doubleTime
      );
    }
    function formatCurrency(amount: number) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    }
    // Include travel non-labor cost from the most reliable source
    const parsedTravel = (() => {
      let source: any = (quote as any)?.travel_data ?? null;
      if (typeof source === "string") {
        try {
          source = JSON.parse(source);
        } catch {
          source = null;
        }
      }
      if (!source && parsedData?.travel_data) {
        source =
          typeof parsedData.travel_data === "string"
            ? (() => {
                try {
                  return JSON.parse(parsedData.travel_data);
                } catch {
                  return null;
                }
              })()
            : parsedData.travel_data;
      }
      if (!source && travelData) {
        source = travelData;
      }
      return source || {};
    })();
    const getParsedTravelNonLaborCost = () =>
      computeTravelTotals(parsedTravel).nonLaborCost;
    const hs = parsedData.hoursSummary || {};
    const matExpBase = getMaterialExpenseBaseParsed(parsedData);
    const travelNonLabor = getParsedTravelNonLaborCost();
    const baseFinalValue = Math.ceil(
      (matExpBase +
        getWorkLaborCostParsed(hs) +
        getTravelLaborCostParsed(hs) +
        travelNonLabor) /
        0.96,
    );
    const finalValue = baseFinalValue * (singleLetterScopeQuantity || 1);

    // Saturday/Sunday final values (if applicable)
    const satHS = parsedData.saturdayHoursSummary;
    const sunHS = parsedData.sundayHoursSummary;
    const hasSaturdayPricing = !!parsedData.showSaturdayHours && !!satHS;
    const hasSundayPricing = !!parsedData.showSundayHours && !!sunHS;
    const satBaseFinalValue = hasSaturdayPricing
      ? Math.ceil(
          (matExpBase +
            getWorkLaborCostParsed(satHS) +
            getTravelLaborCostParsed(satHS) +
            travelNonLabor) /
            0.96,
        )
      : baseFinalValue;
    const satFinalValue = satBaseFinalValue * (singleLetterScopeQuantity || 1);
    const sunBaseFinalValue = hasSundayPricing
      ? Math.ceil(
          (matExpBase +
            getWorkLaborCostParsed(sunHS) +
            getTravelLaborCostParsed(sunHS) +
            travelNonLabor) /
            0.96,
        )
      : baseFinalValue;
    const sunFinalValue = sunBaseFinalValue * (singleLetterScopeQuantity || 1);
    const mobilizationRaw = (() => {
      const factor = getMobilizationFactor(finalValue);
      return Math.ceil(finalValue * factor);
    })();
    const mobilization = formatCurrency(mobilizationRaw);
    const showMobilizationInLetter =
      mobilizationRaw > 0 || includeMobilizationWhenZero;

    // Use letter controls for which day-types to show (still require data to exist)
    const showMFInLetter = letterIncludeMF;
    const showSatInLetter = letterIncludeSaturday && hasSaturdayPricing;
    const showSunInLetter = letterIncludeSunday && hasSundayPricing;

    // Mobilization amounts per scenario
    const satMobRaw = hasSaturdayPricing
      ? Math.ceil(satFinalValue * getMobilizationFactor(satFinalValue))
      : mobilizationRaw;
    const sunMobRaw = hasSundayPricing
      ? Math.ceil(sunFinalValue * getMobilizationFactor(sunFinalValue))
      : mobilizationRaw;

    // Determine which payment terms to render
    const termsToRender: { key: string; label: string; factor: number }[] =
      letterShowAllTerms
        ? [
            { key: "net30", label: "NET 30", factor: paymentTermFactors.net30 },
            { key: "net60", label: "NET 60", factor: paymentTermFactors.net60 },
            { key: "net90", label: "NET 90", factor: paymentTermFactors.net90 },
          ]
        : [
            {
              key: letterPaymentTerm,
              label:
                letterPaymentTerm === "net30"
                  ? "NET 30"
                  : letterPaymentTerm === "net60"
                    ? "NET 60"
                    : "NET 90",
              factor: paymentTermFactors[letterPaymentTerm],
            },
          ];

    // Build the pricing HTML block dynamically
    const hasMultipleDayTypes =
      (showMFInLetter ? 1 : 0) +
        (showSatInLetter ? 1 : 0) +
        (showSunInLetter ? 1 : 0) >
      1;
    const pricingHtml = (() => {
      // Classic format: M-F only (or single day-type) with all terms → single list with Option 1/2/3
      if (!hasMultipleDayTypes && letterShowAllTerms) {
        const baseValue = showSatInLetter
          ? satFinalValue
          : showSunInLetter
            ? sunFinalValue
            : finalValue;
        const baseMob = showSatInLetter
          ? satMobRaw
          : showSunInLetter
            ? sunMobRaw
            : mobilizationRaw;
        const option1 = formatCurrency(
          Math.ceil(baseValue * paymentTermFactors.net30) + baseMob,
        );
        const option2 = formatCurrency(
          Math.ceil(baseValue * paymentTermFactors.net60) + baseMob,
        );
        const option3 = formatCurrency(
          Math.ceil(baseValue * paymentTermFactors.net90) + baseMob,
        );
        return `<ul style="margin: 4px 0;">
          <li>Option 1: Where NET 30 Terms are applicable and agreed upon: <b>${option1}</b></li>
          <li>Option 2: Where NET 60 Terms are applicable and agreed upon: <b>${option2}</b></li>
          <li>Option 3: Where NET 90 Terms are applicable and agreed upon: <b>${option3}</b></li>
        </ul>`;
      }
      // Multi day-type or single term: show per-term blocks with day-type line items
      return termsToRender
        .map((term, termIdx) => {
          const lines: string[] = [];
          if (showMFInLetter) {
            lines.push(
              `<li>Work performed Monday - Friday: <b>${formatCurrency(Math.ceil(finalValue * term.factor) + mobilizationRaw)}</b></li>`,
            );
          }
          if (showSatInLetter) {
            lines.push(
              `<li>Work performed on Saturday: <b>${formatCurrency(Math.ceil(satFinalValue * term.factor) + satMobRaw)}</b></li>`,
            );
          }
          if (showSunInLetter) {
            lines.push(
              `<li>Work performed on Sunday / Holiday: <b>${formatCurrency(Math.ceil(sunFinalValue * term.factor) + sunMobRaw)}</b></li>`,
            );
          }
          if (lines.length === 0) {
            lines.push(
              `<li>Total: <b>${formatCurrency(Math.ceil(finalValue * term.factor) + mobilizationRaw)}</b></li>`,
            );
          }
          // Single term selected (no "all"): use simpler header without "Option N"
          const header = !letterShowAllTerms
            ? `<div class="amp-section" style="margin:4px 0;"><b>Where ${term.label} Terms are applicable and agreed upon:</b></div>`
            : `<div class="amp-section" style="margin:4px 0;"><b>Option ${termIdx + 1}: Where ${term.label} Terms are applicable and agreed upon:</b></div>`;
          return `${header}\n<ul style="margin: 4px 0;">${lines.join("\n")}</ul>`;
        })
        .join("\n");
    })();

    // Get scope title for display
    const scopeTitle =
      parsedData?.title && String(parsedData.title).trim()
        ? String(parsedData.title).trim()
        : "Scope";
    const sovTableHtml = buildScopeProposalHtml(
      parsedData,
      sovItems,
      letterIncludeSovNotes,
    );

    const contactName = contactData
      ? `${contactData.first_name} ${contactData.last_name}`.trim()
      : customer.name || "Contact Name";
    // Prefer opportunity's quote_number for the letter number
    const letterQuoteNumber =
      (opportunityData as any)?.quote_number ||
      quote.id?.slice(0, 6) ||
      index + 1;

    const signatureUrl =
      (window as any)?.AMP_SIGNATURE_URL || "/img/brian-rodgers-signature.jpg";

    // Render the admin-editable template sections with this letter's values.
    // The computed machinery (pricing, scope tables, mobilization) stays
    // code-generated below and is assembled around these sections.
    const templateTokens: Record<string, string> = {
      contactName,
      letterNumber: String(letterQuoteNumber),
      letterDate: dateStr,
      companyName: customer.company_name || "Company",
      customerAddress: formatAddressForLetter(customer.address),
      projectTitle: opportunityData?.title || "Project Title",
      jobsiteLocation: opportunityData?.jobsite_location
        ? ", " + opportunityData.jobsite_location
        : "",
      netaStandardText:
        NETA_OPTIONS.find((o) => o.value === netaStandard)?.text ||
        "[Select NETA Standard]",
      currentYear: String(new Date().getFullYear()),
      alternateRatesNote:
        showSatInLetter || showSunInLetter
          ? " Alternate rates apply for Saturday and Sunday/Holiday work as noted above."
          : "",
      signatureImage: signatureUrl,
      signerName: proposalTemplate.signerName,
      signerTitle: proposalTemplate.signerTitle,
    };
    const headerHtml = renderTemplateSection(
      proposalTemplate.headerHtml,
      templateTokens,
    );
    const footerHtml = renderTemplateSection(
      proposalTemplate.footerHtml,
      templateTokens,
    );
    const introHtml = renderTemplateSection(
      proposalTemplate.introHtml,
      templateTokens,
    );
    const termsHtml = renderTemplateSection(
      proposalTemplate.termsHtml,
      templateTokens,
    );
    const conclusionHtml = renderTemplateSection(
      proposalTemplate.conclusionHtml,
      templateTokens,
    );
    const signatureBlockHtml = renderTemplateSection(
      proposalTemplate.signatureHtml,
      templateTokens,
    );
    const safetyPolicyHtml = renderTemplateSection(
      proposalTemplate.safetyPolicyHtml,
      templateTokens,
    );

    const newLetterHtml = `
      <div id="letter-proposal" class="print-content" style="max-width: 800px; margin: 0 auto; font-family: Arial, sans-serif; position:relative; font-size: 11pt; line-height: 1.5;">
        <div style="display:flex;align-items:center;padding-bottom:6px;margin-bottom:12px;border-bottom:1px solid #ccc;">
          <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" style="height: 24px; margin-right: 8px;" />
          <span style="font-size: 1em; font-weight: bold; color: #333;">AMP Quality Energy Services</span>
        </div>
        ${headerHtml}
        ${renderCustomSectionsAt("after_header", templateTokens)}
        ${introHtml}
        ${renderCustomSectionsAt("after_intro", templateTokens)}
        <div class="amp-scope-block" style="margin-bottom:12px;border:1px solid #f0c8b3;border-left:4px solid #f26722;border-radius:8px;padding:10px;background:#fff7f2;">
          <div class="amp-section amp-keep-with-next" style="display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff0e6;padding:6px 8px;border-radius:6px;margin-bottom:6px;">
            <b style="font-size: 1.15em;">Scope</b>
          </div>
          ${sovTableHtml}
        </div>
        ${renderCustomSectionsAt("after_scope", templateTokens)}
        <div class="amp-section" style="margin-top: 12px;"><b style="font-size: 1.15em;">Pricing & Terms</b></div>
        ${
          (singleLetterScopeQuantity || 1) > 1
            ? `
        <div class="amp-section" style="margin:4px 0;">
          <div style="margin-bottom:4px;"><b>The following price is based upon the scope quantities listed below:</b></div>
          <div><b>${scopeTitle}</b> to be performed <b>${singleLetterScopeQuantity}</b> ${singleLetterScopeQuantity === 1 ? "time" : "times"}</div>
        </div>
        `
            : ""
        }
        ${pricingHtml}
        ${showMobilizationInLetter ? `<div class="amp-section">Mobilization costs of ${mobilization} shall be paid out of the above agreed upon price before the first day of work.</div>` : ""}
        ${renderCustomSectionsAt("after_pricing", templateTokens)}
        ${termsHtml}
        ${renderCustomSectionsAt("after_terms", templateTokens)}
        ${conclusionHtml}
        ${renderCustomSectionsAt("after_conclusion", templateTokens)}
        ${signatureBlockHtml}
        ${renderCustomSectionsAt("after_signature", templateTokens)}
        <div style="text-align:center; margin-top: 8px; font-size: 0.9em; color: #444;">END OF LETTER</div>
        ${footerHtml}
        ${renderCustomSectionsAt("before_safety", templateTokens)}
        <div style="margin-top: 80px;">
          <div style="display: flex; align-items: center; border-bottom: 2px solid #f26722; padding-bottom: 4px; margin-bottom: 8px;">
            <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" style="height: 32px; margin-right: 8px;" />
            <span style="font-size: 1.0em; font-weight: bold; color: #333;">| <i>Quality Energy Services</i></span>
            <span style="font-size: 1.0em; font-weight: bold; color: #333; margin-left: 12px;">&mdash; Safety Policy on Jobsites</span>
          </div>
          ${safetyPolicyHtml}
        </div>
      </div>
    `;
    setLetterHtml(newLetterHtml);
    savedLetterHtmlRef.current = newLetterHtml;
    setIsLetterDirty(false);
    setIsLetterProposalOpen(true);
    // Prevent AuthContext refresh while letter proposal is open
    try {
      localStorage.setItem("AMP_SUSPEND_REFRESH", "true");
    } catch {}
  }

  function handleSelectQuotesForCombinedLetter() {
    if (selectedQuotesForCombined.length === 0) return;

    setIsCombinedQuoteSelectOpen(false);

    // Prevent AuthContext refresh while letter proposal is open
    try {
      localStorage.setItem("AMP_SUSPEND_REFRESH", "true");
    } catch {}

    // Generate the combined letter HTML template with data from selected quotes
    const selectedQuotes = selectedQuotesForCombined.map((idx) => quotes[idx]);
    const today = new Date();
    const dateStr = today.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const customer: { name: string; company_name: string; address: string } =
      (opportunityData?.customer as any) || {
        name: "",
        company_name: "",
        address: "",
      };

    // Process all selected quotes
    const processedQuotes = selectedQuotes.map((quote, quoteIndex) => {
      const originalQuoteIndex = selectedQuotesForCombined[quoteIndex];
      let parsedData = quote.data;
      if (typeof parsedData === "string") {
        try {
          parsedData = JSON.parse(parsedData);
        } catch (e) {
          parsedData = {};
        }
      }

      let sovItems: any[] = [];
      if (
        Array.isArray(parsedData.sovItems) &&
        parsedData.sovItems.length > 0
      ) {
        sovItems = parsedData.sovItems.filter(shouldShowSovItemInProposal);
      }

      // Per-scope rates from saved quote data; use live form state only for the estimate tab currently open
      const quoteHourlyRates =
        originalQuoteIndex === selectedQuoteIndex && selectedQuoteIndex >= 0
          ? hourlyRates
          : getHourlyRatesForCombinedScope(parsedData);

      // Per-scope mobilization factors from saved quote data; use live form state only for the active tab
      const scopeMobFactors =
        originalQuoteIndex === selectedQuoteIndex && selectedQuoteIndex >= 0
          ? mobilizationFactors
          : getMobilizationFactorsForCombinedScope(parsedData);

      // Calculate final value for this quote
      function getFinalNumeratorWithoutTravel(parsed: any) {
        const cv = parsed.calculatedValues || {};
        const hs = parsed.hoursSummary || {};
        const totalMaterial = cv.totalMaterial || 0;
        const totalExpense = cv.totalExpense || 0;
        const nonSovExpense = cv.nonSovExpense || 0;
        const straightTimeHours = hs.straightTimeHours || 0;
        const overtimeHours = hs.overtimeHours || 0;
        const doubleTimeHours = hs.doubleTimeHours || 0;
        return (
          totalMaterial * 1.09 * materialMarkup +
          totalExpense * 1.09 +
          nonSovExpense * 1.0 +
          straightTimeHours * quoteHourlyRates.straightTime +
          overtimeHours * quoteHourlyRates.overtime +
          doubleTimeHours * quoteHourlyRates.doubleTime
        );
      }

      // Get travel cost
      const parsedTravel = (() => {
        let source: any = (quote as any)?.travel_data ?? null;
        if (typeof source === "string") {
          try {
            source = JSON.parse(source);
          } catch {
            source = null;
          }
        }
        if (!source && parsedData?.travel_data) {
          source =
            typeof parsedData.travel_data === "string"
              ? (() => {
                  try {
                    return JSON.parse(parsedData.travel_data);
                  } catch {
                    return null;
                  }
                })()
              : parsedData.travel_data;
        }
        return source || {};
      })();

      // Material/expense base (shared across day-type scenarios)
      const cv = parsedData.calculatedValues || {};
      const matExpBase =
        (cv.totalMaterial || 0) * 1.09 * materialMarkup +
        (cv.totalExpense || 0) * 1.09 +
        (cv.nonSovExpense || 0) * 1.0;

      const hs = parsedData.hoursSummary || {};
      const workLabor =
        (hs.straightTimeHours || 0) * quoteHourlyRates.straightTime +
        (hs.overtimeHours || 0) * quoteHourlyRates.overtime +
        (hs.doubleTimeHours || 0) * quoteHourlyRates.doubleTime;
      const travelLabor =
        (hs.travelStraightTimeHours || 0) * quoteHourlyRates.straightTime +
        (hs.travelOvertimeHours || 0) * quoteHourlyRates.overtime +
        (hs.travelDoubleTimeHours || 0) * quoteHourlyRates.doubleTime;
      const travelNonLabor = computeTravelTotals(parsedTravel).nonLaborCost;
      const travelNonLaborSafe = Math.max(0, travelNonLabor);

      const finalValue = Math.ceil(
        (matExpBase + workLabor + travelLabor + travelNonLaborSafe) / 0.96,
      );
      const validFinalValue =
        isNaN(finalValue) || !isFinite(finalValue) ? 0 : finalValue;

      // Saturday / Sunday final values
      const satHS = parsedData.saturdayHoursSummary;
      const sunHS = parsedData.sundayHoursSummary;
      const hasSat = !!parsedData.showSaturdayHours && !!satHS;
      const hasSun = !!parsedData.showSundayHours && !!sunHS;

      const calcDayValue = (dayHS: any) => {
        const wl =
          (dayHS?.straightTimeHours || 0) * quoteHourlyRates.straightTime +
          (dayHS?.overtimeHours || 0) * quoteHourlyRates.overtime +
          (dayHS?.doubleTimeHours || 0) * quoteHourlyRates.doubleTime;
        const tl =
          (dayHS?.travelStraightTimeHours || 0) *
            quoteHourlyRates.straightTime +
          (dayHS?.travelOvertimeHours || 0) * quoteHourlyRates.overtime +
          (dayHS?.travelDoubleTimeHours || 0) * quoteHourlyRates.doubleTime;
        return Math.ceil((matExpBase + wl + tl + travelNonLaborSafe) / 0.96);
      };

      const satFinalValue = hasSat ? calcDayValue(satHS) : validFinalValue;
      const sunFinalValue = hasSun ? calcDayValue(sunHS) : validFinalValue;

      return {
        quote,
        parsedData,
        sovItems,
        finalValue: validFinalValue,
        satFinalValue,
        sunFinalValue,
        hasSat,
        hasSun,
        scopeMobFactors,
        quoteNumber:
          (opportunityData as any)?.quote_number ||
          quote.id?.slice(0, 6) ||
          selectedQuotesForCombined[quoteIndex] + 1,
        displayTitle:
          parsedData?.title && String(parsedData.title).trim()
            ? String(parsedData.title).trim()
            : "",
      };
    });

    // Calculate combined totals - ALWAYS calculated regardless of display toggles
    // This ensures grand total is always accurate even when individual pricing is hidden
    // IMPORTANT: These calculations happen BEFORE any display logic, so they always include all quotes
    // NOTE: showIndividualPricing and showGrandTotalPricing only affect DISPLAY, not calculations
    // Scope quantities are applied to the final values for grand total calculation
    const combinedFinalValue = processedQuotes.reduce((sum, q, index) => {
      const originalQuoteIndex = selectedQuotesForCombined[index];
      const scopeQty = scopeQuantities[originalQuoteIndex] || 1;
      const value = Number(q.finalValue) || 0;
      if (isNaN(value) || !isFinite(value)) {
        console.warn("Invalid finalValue in processedQuote:", q);
        return sum;
      }
      return sum + value * scopeQty;
    }, 0);

    // Sum per-scope mobilizations using each scope's own saved factors
    const combinedMobilizationRaw = processedQuotes.reduce((sum, q, index) => {
      const originalQuoteIndex = selectedQuotesForCombined[index];
      const scopeQty = scopeQuantities[originalQuoteIndex] || 1;
      const factor = computeMobilizationFactor(q.finalValue, q.scopeMobFactors);
      return sum + Math.ceil(q.finalValue * scopeQty * factor);
    }, 0);
    const combinedMobilization = formatCurrency(combinedMobilizationRaw);

    // Saturday combined final value
    const combinedSatFinalValue = processedQuotes.reduce((sum, q, index) => {
      const originalQuoteIndex = selectedQuotesForCombined[index];
      const scopeQty = scopeQuantities[originalQuoteIndex] || 1;
      return sum + (q.satFinalValue || q.finalValue) * scopeQty;
    }, 0);
    const combinedSatMobRaw = processedQuotes.reduce((sum, q, index) => {
      const originalQuoteIndex = selectedQuotesForCombined[index];
      const scopeQty = scopeQuantities[originalQuoteIndex] || 1;
      const satVal = (q.satFinalValue || q.finalValue) * scopeQty;
      return (
        sum +
        Math.ceil(
          satVal *
            computeMobilizationFactor(
              q.satFinalValue || q.finalValue,
              q.scopeMobFactors,
            ),
        )
      );
    }, 0);

    // Sunday combined final value
    const combinedSunFinalValue = processedQuotes.reduce((sum, q, index) => {
      const originalQuoteIndex = selectedQuotesForCombined[index];
      const scopeQty = scopeQuantities[originalQuoteIndex] || 1;
      return sum + (q.sunFinalValue || q.finalValue) * scopeQty;
    }, 0);
    const combinedSunMobRaw = processedQuotes.reduce((sum, q, index) => {
      const originalQuoteIndex = selectedQuotesForCombined[index];
      const scopeQty = scopeQuantities[originalQuoteIndex] || 1;
      const sunVal = (q.sunFinalValue || q.finalValue) * scopeQty;
      return (
        sum +
        Math.ceil(
          sunVal *
            computeMobilizationFactor(
              q.sunFinalValue || q.finalValue,
              q.scopeMobFactors,
            ),
        )
      );
    }, 0);

    const anyScopeHasSat = processedQuotes.some((q) => q.hasSat);
    const anyScopeHasSun = processedQuotes.some((q) => q.hasSun);
    const grandShowMF = letterIncludeMF;
    const grandShowSat = letterIncludeSaturday && anyScopeHasSat;
    const grandShowSun = letterIncludeSunday && anyScopeHasSun;

    // Generate SOV tables for each quote
    // NOTE: Individual pricing calculations always happen here (for grand total accuracy)
    // but display is conditional based on showIndividualPricing toggle
    const sovTablesHtml = processedQuotes
      .map((processedQuote, index) => {
        const originalQuoteIndex = selectedQuotesForCombined[index];
        const scopeQty = scopeQuantities[originalQuoteIndex] || 1;
        const scopeNumber = index + 1;
        const headingText =
          processedQuote.displayTitle || `Scope ${scopeNumber}`;
        const sovTableHtml = buildScopeProposalHtml(
          processedQuote.parsedData,
          processedQuote.sovItems,
          letterIncludeSovNotes,
        );

        const scopeMobilizationRaw = (() => {
          const factor = computeMobilizationFactor(
            processedQuote.finalValue,
            processedQuote.scopeMobFactors,
          );
          return Math.ceil(processedQuote.finalValue * factor);
        })();
        const showScopeMobilization =
          scopeMobilizationRaw > 0 || includeMobilizationWhenZero;
        const showScopesMF = letterIncludeMF;
        const showScopesSat = letterIncludeSaturday && processedQuote.hasSat;
        const showScopesSun = letterIncludeSunday && processedQuote.hasSun;

        const satScopeMobRaw = processedQuote.hasSat
          ? Math.ceil(
              processedQuote.satFinalValue *
                computeMobilizationFactor(
                  processedQuote.satFinalValue,
                  processedQuote.scopeMobFactors,
                ),
            )
          : scopeMobilizationRaw;
        const sunScopeMobRaw = processedQuote.hasSun
          ? Math.ceil(
              processedQuote.sunFinalValue *
                computeMobilizationFactor(
                  processedQuote.sunFinalValue,
                  processedQuote.scopeMobFactors,
                ),
            )
          : scopeMobilizationRaw;

        const scopeTermsToRender = letterShowAllTerms
          ? [
              {
                key: "net30",
                label: "NET 30",
                factor: paymentTermFactors.net30,
              },
              {
                key: "net60",
                label: "NET 60",
                factor: paymentTermFactors.net60,
              },
              {
                key: "net90",
                label: "NET 90",
                factor: paymentTermFactors.net90,
              },
            ]
          : [
              {
                key: letterPaymentTerm,
                label:
                  letterPaymentTerm === "net30"
                    ? "NET 30"
                    : letterPaymentTerm === "net60"
                      ? "NET 60"
                      : "NET 90",
                factor: paymentTermFactors[letterPaymentTerm],
              },
            ];

        const scopeHasMultipleDayTypes =
          (showScopesMF ? 1 : 0) +
            (showScopesSat ? 1 : 0) +
            (showScopesSun ? 1 : 0) >
          1;
        const scopePricingLines = (() => {
          // Classic format: single day-type with all terms → Option 1/2/3 list
          if (!scopeHasMultipleDayTypes && letterShowAllTerms) {
            const baseVal = showScopesSat
              ? processedQuote.satFinalValue
              : showScopesSun
                ? processedQuote.sunFinalValue
                : processedQuote.finalValue;
            const baseMob = showScopesSat
              ? satScopeMobRaw
              : showScopesSun
                ? sunScopeMobRaw
                : scopeMobilizationRaw;
            const o1Raw =
              Math.ceil(baseVal * paymentTermFactors.net30) + baseMob;
            const o2Raw =
              Math.ceil(baseVal * paymentTermFactors.net60) + baseMob;
            const o3Raw =
              Math.ceil(baseVal * paymentTermFactors.net90) + baseMob;
            return `<ul style="margin: 4px 0;">
            <li>Option 1: Where NET 30 Terms are applicable and agreed upon: <b class="scope-price" data-base="${o1Raw}" data-kind="net30">${formatCurrency(o1Raw)}</b></li>
            <li>Option 2: Where NET 60 Terms are applicable and agreed upon: <b class="scope-price" data-base="${o2Raw}" data-kind="net60">${formatCurrency(o2Raw)}</b></li>
            <li>Option 3: Where NET 90 Terms are applicable and agreed upon: <b class="scope-price" data-base="${o3Raw}" data-kind="net90">${formatCurrency(o3Raw)}</b></li>
          </ul>`;
          }
          // Multi day-type or single term: per-term blocks with day-type line items
          return scopeTermsToRender
            .map((term, termIdx) => {
              const lines: string[] = [];
              if (showScopesMF) {
                const val =
                  Math.ceil(processedQuote.finalValue * term.factor) +
                  scopeMobilizationRaw;
                lines.push(
                  `<li>Work performed Monday - Friday: <b class="scope-price" data-base="${val}" data-kind="${term.key}">${formatCurrency(val)}</b></li>`,
                );
              }
              if (showScopesSat) {
                const val =
                  Math.ceil(processedQuote.satFinalValue * term.factor) +
                  satScopeMobRaw;
                lines.push(
                  `<li>Work performed on Saturday: <b>${formatCurrency(val)}</b></li>`,
                );
              }
              if (showScopesSun) {
                const val =
                  Math.ceil(processedQuote.sunFinalValue * term.factor) +
                  sunScopeMobRaw;
                lines.push(
                  `<li>Work performed on Sunday / Holiday: <b>${formatCurrency(val)}</b></li>`,
                );
              }
              if (lines.length === 0) {
                const val =
                  Math.ceil(processedQuote.finalValue * term.factor) +
                  scopeMobilizationRaw;
                lines.push(
                  `<li>Total: <b class="scope-price" data-base="${val}" data-kind="${term.key}">${formatCurrency(val)}</b></li>`,
                );
              }
              const hdr = !letterShowAllTerms
                ? `<b>Where ${term.label} Terms are applicable and agreed upon:</b>`
                : `<b>Option ${termIdx + 1}: Where ${term.label} Terms are applicable and agreed upon:</b>`;
              return `<div class="amp-section" style="margin:4px 0;">${hdr}</div>
            <ul style="margin: 4px 0;">${lines.join("\n")}</ul>`;
            })
            .join("\n");
        })();

        const individualPricingHtml = `
        <div class="amp-individual-pricing" style="${showIndividualPricing ? "" : "display: none;"}">
          <div class="amp-section" style="margin-top: 8px;"><b style="font-size: 1.15em;">Pricing & Terms</b></div>
          ${scopePricingLines}
          ${showScopeMobilization ? `<div class="amp-section">Mobilization costs of <b class="scope-price" data-base="${scopeMobilizationRaw}" data-kind="mobilization">${formatCurrency(scopeMobilizationRaw)}</b> shall be paid out of the above agreed upon price before the first day of work.</div>` : ""}
        </div>
      `;

        return `
        <div class="amp-scope-block" style="margin-bottom:12px;border:1px solid #f0c8b3;border-left:4px solid #f26722;border-radius:8px;padding:10px;background:#fff7f2;">
          <div class="amp-scope-controls print-hidden" contenteditable="false" style="display:flex;gap:6px;justify-content:flex-end;margin:-4px -4px 4px -4px;">
            <button class="move-up" aria-label="Move scope up" title="Move up" style="border:1px solid #e5e7eb;background:#fff;border-radius:9999px;padding:2px 8px;cursor:pointer;">▲</button>
            <button class="move-down" aria-label="Move scope down" title="Move down" style="border:1px solid #e5e7eb;background:#fff;border-radius:9999px;padding:2px 8px;cursor:pointer;">▼</button>
          </div>
          <div class="amp-section amp-keep-with-next" style="display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff0e6;padding:6px 8px;border-radius:6px;margin-bottom:6px;">
            <b>${headingText}</b>
          </div>
          ${sovTableHtml}
        ${individualPricingHtml}
        </div>
      `;
      })
      .join(
        '<p class="amp-scope-spacer" style="margin:0; padding:0; line-height:0.5;"><br></p>',
      );

    const contactName = contactData
      ? `${contactData.first_name} ${contactData.last_name}`.trim()
      : customer.name || "Contact Name";
    const signatureUrl =
      (window as any)?.AMP_SIGNATURE_URL || "/img/brian-rodgers-signature.jpg";

    // Combined letters render the same admin-editable template sections as
    // single-scope letters (shared source in proposalTemplateDefaults.ts), so
    // template edits apply to both letter types.
    const templateTokens: Record<string, string> = {
      contactName,
      letterNumber: String(
        (opportunityData as any)?.quote_number || "Multiple",
      ),
      letterDate: dateStr,
      companyName: customer.company_name || "Company",
      customerAddress: formatAddressForLetter(customer.address),
      projectTitle: opportunityData?.title || "Project Title",
      jobsiteLocation: opportunityData?.jobsite_location
        ? ", " + opportunityData.jobsite_location
        : "",
      netaStandardText:
        NETA_OPTIONS.find((o) => o.value === netaStandard)?.text ||
        "[Select NETA Standard]",
      currentYear: String(new Date().getFullYear()),
      alternateRatesNote:
        grandShowSat || grandShowSun
          ? " Alternate rates apply for Saturday and Sunday/Holiday work as noted above."
          : "",
      signatureImage: signatureUrl,
      signerName: proposalTemplate.signerName,
      signerTitle: proposalTemplate.signerTitle,
    };
    const headerHtml = renderTemplateSection(
      proposalTemplate.headerHtml,
      templateTokens,
    );
    const footerHtml = renderTemplateSection(
      proposalTemplate.footerHtml,
      templateTokens,
    );
    const introHtml = renderTemplateSection(
      proposalTemplate.introHtml,
      templateTokens,
    );
    const termsHtml = renderTemplateSection(
      proposalTemplate.termsHtml,
      templateTokens,
    );
    const conclusionHtml = renderTemplateSection(
      proposalTemplate.conclusionHtml,
      templateTokens,
    );
    const signatureBlockHtml = renderTemplateSection(
      proposalTemplate.signatureHtml,
      templateTokens,
    );
    const safetyPolicyHtml = renderTemplateSection(
      proposalTemplate.safetyPolicyHtml,
      templateTokens,
    );

    const newCombinedLetterHtml = `
      <div id="letter-proposal" class="print-content" style="max-width: 800px; margin: 0 auto; font-family: Arial, sans-serif; position:relative; font-size: 11pt; line-height: 1.5;">
        <div style="display: flex; align-items: center; border-bottom: 2px solid #f26722; padding-bottom: 6px; margin-bottom: 12px;">
          <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" style="height: 36px; margin-right: 10px;" />
          <span style="font-size: 1.1em; font-weight: bold; color: #333;">| <i>Quality Energy Services</i></span>
        </div>
        ${headerHtml}
        ${renderCustomSectionsAt("after_header", templateTokens)}
        ${introHtml}
        ${renderCustomSectionsAt("after_intro", templateTokens)}
        <div><b style="font-size: 1.15em;">Combined Scope of Work</b></div>
        ${sovTablesHtml}
        ${renderCustomSectionsAt("after_scope", templateTokens)}
        ${
          showGrandTotalPricing
            ? `
        <p class="amp-scope-spacer" style="margin:0; padding:0; line-height:0.5;"><br></p>
        <div class="amp-scope-block" style="margin-bottom:12px;border:1px solid #f0c8b3;border-left:4px solid #f26722;border-radius:8px;padding:10px;background:#fff7f2;">
          <div class="amp-section amp-keep-with-next" style="display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff0e6;padding:6px 8px;border-radius:6px;margin-bottom:6px;">
            <b>Grand Total Pricing</b>
          </div>
          ${(() => {
            // Only show if at least one scope has quantity > 1
            const hasQuantityGreaterThanOne = processedQuotes.some(
              (processedQuote, index) => {
                const originalQuoteIndex = selectedQuotesForCombined[index];
                const scopeQty = scopeQuantities[originalQuoteIndex] || 1;
                return scopeQty > 1;
              },
            );

            if (!hasQuantityGreaterThanOne) return "";

            const scopeQuantityLines = processedQuotes
              .map((processedQuote, index) => {
                const originalQuoteIndex = selectedQuotesForCombined[index];
                const scopeQty = scopeQuantities[originalQuoteIndex] || 1;
                const scopeNumber = index + 1;
                const headingText =
                  processedQuote.displayTitle || `Scope ${scopeNumber}`;
                const timeText = scopeQty === 1 ? "time" : "times";
                return `${headingText} to be performed <b>${scopeQty}</b> ${timeText}`;
              })
              .join("<br/>");
            return scopeQuantityLines
              ? `<div class="amp-section" style="margin:4px 0;"><div style="margin-bottom:4px;"><b>The following price is based upon the scope quantities listed below:</b></div>${scopeQuantityLines}</div>`
              : "";
          })()}
          ${(() => {
            const grandHasMultipleDayTypes =
              (grandShowMF ? 1 : 0) +
                (grandShowSat ? 1 : 0) +
                (grandShowSun ? 1 : 0) >
              1;
            const grandTerms = letterShowAllTerms
              ? [
                  {
                    key: "net30",
                    label: "NET 30",
                    factor: paymentTermFactors.net30,
                  },
                  {
                    key: "net60",
                    label: "NET 60",
                    factor: paymentTermFactors.net60,
                  },
                  {
                    key: "net90",
                    label: "NET 90",
                    factor: paymentTermFactors.net90,
                  },
                ]
              : [
                  {
                    key: letterPaymentTerm,
                    label:
                      letterPaymentTerm === "net30"
                        ? "NET 30"
                        : letterPaymentTerm === "net60"
                          ? "NET 60"
                          : "NET 90",
                    factor: paymentTermFactors[letterPaymentTerm],
                  },
                ];
            // Classic format: single day-type with all terms → Option 1/2/3 list
            if (!grandHasMultipleDayTypes && letterShowAllTerms) {
              const baseVal = grandShowSat
                ? combinedSatFinalValue
                : grandShowSun
                  ? combinedSunFinalValue
                  : combinedFinalValue;
              const baseMob = grandShowSat
                ? combinedSatMobRaw
                : grandShowSun
                  ? combinedSunMobRaw
                  : combinedMobilizationRaw;
              const o1Raw =
                Math.ceil(baseVal * paymentTermFactors.net30) + baseMob;
              const o2Raw =
                Math.ceil(baseVal * paymentTermFactors.net60) + baseMob;
              const o3Raw =
                Math.ceil(baseVal * paymentTermFactors.net90) + baseMob;
              return (
                '<ul style="margin: 16px 0 4px 16px;">' +
                '<li>Option 1: Where NET 30 Terms are applicable and agreed upon: <b class="grand-price" data-kind="net30" data-base="' +
                o1Raw +
                '">' +
                formatCurrency(o1Raw) +
                "</b></li>" +
                '<li>Option 2: Where NET 60 Terms are applicable and agreed upon: <b class="grand-price" data-kind="net60" data-base="' +
                o2Raw +
                '">' +
                formatCurrency(o2Raw) +
                "</b></li>" +
                '<li>Option 3: Where NET 90 Terms are applicable and agreed upon: <b class="grand-price" data-kind="net90" data-base="' +
                o3Raw +
                '">' +
                formatCurrency(o3Raw) +
                "</b></li>" +
                "</ul>"
              );
            }
            // Multi day-type or single term: per-term blocks with day-type line items
            return grandTerms
              .map(function (term, termIdx) {
                const lines: string[] = [];
                if (grandShowMF) {
                  const val =
                    Math.ceil(combinedFinalValue * term.factor) +
                    combinedMobilizationRaw;
                  lines.push(
                    '<li>Work performed Monday - Friday: <b class="grand-price" data-kind="' +
                      term.key +
                      '" data-base="' +
                      val +
                      '">' +
                      formatCurrency(val) +
                      "</b></li>",
                  );
                }
                if (grandShowSat) {
                  const val =
                    Math.ceil(combinedSatFinalValue * term.factor) +
                    combinedSatMobRaw;
                  lines.push(
                    "<li>Work performed on Saturday: <b>" +
                      formatCurrency(val) +
                      "</b></li>",
                  );
                }
                if (grandShowSun) {
                  const val =
                    Math.ceil(combinedSunFinalValue * term.factor) +
                    combinedSunMobRaw;
                  lines.push(
                    "<li>Work performed on Sunday / Holiday: <b>" +
                      formatCurrency(val) +
                      "</b></li>",
                  );
                }
                if (lines.length === 0) {
                  const val =
                    Math.ceil(combinedFinalValue * term.factor) +
                    combinedMobilizationRaw;
                  lines.push(
                    '<li>Total: <b class="grand-price" data-kind="' +
                      term.key +
                      '" data-base="' +
                      val +
                      '">' +
                      formatCurrency(val) +
                      "</b></li>",
                  );
                }
                const hdr = !letterShowAllTerms
                  ? "<b>Where " +
                    term.label +
                    " Terms are applicable and agreed upon:</b>"
                  : "<b>Option " +
                    (termIdx + 1) +
                    ": Where " +
                    term.label +
                    " Terms are applicable and agreed upon:</b>";
                return (
                  '<div class="amp-section" style="margin:4px 0;">' +
                  hdr +
                  '</div><ul style="margin: 4px 0;">' +
                  lines.join("\n") +
                  "</ul>"
                );
              })
              .join("\n");
          })()}
          ${combinedMobilizationRaw > 0 || includeMobilizationWhenZero ? `<div class="amp-section" style="margin:4px 0;">Mobilization costs of <b class="grand-price" data-kind="mobilization" data-base="${combinedMobilizationRaw}">${combinedMobilization}</b> shall be paid out of the above agreed upon price before the first day of work.</div>` : ""}
        </div>
        `
            : ""
        }
        ${renderCustomSectionsAt("after_pricing", templateTokens)}
        ${termsHtml}
        ${renderCustomSectionsAt("after_terms", templateTokens)}
        ${conclusionHtml}
        ${renderCustomSectionsAt("after_conclusion", templateTokens)}
        ${signatureBlockHtml}
        ${renderCustomSectionsAt("after_signature", templateTokens)}
        <div style="text-align:center; margin-top: 8px; font-size: 0.9em; color: #444;">END OF LETTER</div>
        ${footerHtml}
        ${renderCustomSectionsAt("before_safety", templateTokens)}
        <div class="safety-policy-section" style="margin-top: 20px;">
          <div style="font-size: 1.3em; font-weight: bold; color: #333; margin: 10px 0 12px 0; text-align: center;">Safety Policy on Jobsites</div>
          ${safetyPolicyHtml}
        </div>
      </div>
    `;
    setLetterHtml(newCombinedLetterHtml);
    savedLetterHtmlRef.current = newCombinedLetterHtml;
    setIsLetterDirty(false);
    setIsLetterProposalOpen(true);
    // Prevent AuthContext refresh while letter proposal is open
    try {
      localStorage.setItem("AMP_SUSPEND_REFRESH", "true");
    } catch {}
  }

  function handlePrintLetter() {
    // Open print dialog for the letter proposal
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      const currentContent = (letterEditorRef.current?.innerHTML || "").trim();
      let bodyHtml = currentContent || letterHtml || "";
      if (!bodyHtml) {
        alert("Nothing to print. Please generate the letter first.");
        try {
          printWindow.close();
        } catch {}
        return;
      }

      // Clean up empty list items that cause extra bullets in print
      try {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = bodyHtml;
        // Remove empty <li> elements
        tempDiv.querySelectorAll("li").forEach((li) => {
          if (!li.textContent?.trim() && !li.querySelector("img")) {
            li.remove();
          }
        });
        // Remove empty lists
        tempDiv.querySelectorAll("ul, ol").forEach((list) => {
          if (!list.textContent?.trim() && !list.querySelector("li")) {
            list.remove();
          }
        });
        tempDiv
          .querySelectorAll(".amp-col-resize, .amp-scope-controls")
          .forEach((el) => el.remove());
        tempDiv.querySelectorAll(".amp-sov-table th").forEach((th) => {
          th.textContent = (th.textContent || "").replace(/\s+/g, " ").trim();
        });
        // Collapse the invisible empty-paragraph stacks that otherwise expand
        // into page-sized gaps once the print window's default margins apply.
        sanitizeLetterHtmlNode(tempDiv);
        bodyHtml = tempDiv.innerHTML;
      } catch {}

      const html = `<!DOCTYPE html><html><head><title>Letter Proposal</title><style>
        /*
         * Match the in-app editor, which runs under Tailwind's Preflight reset.
         * Without this, the bare print window falls back to the browser's default
         * stylesheet (~1em margins on every <p>/heading), so paragraphs the user
         * typed or pasted — especially empty ones — open up gaps that never showed
         * while editing. Zeroing these makes print render exactly like the editor;
         * intended spacing comes from the inline margins on .amp-section blocks.
         */
        p, h1, h2, h3, h4, h5, h6, blockquote, figure, pre { margin: 0; }
        /*
         * Body line spacing. Forced with !important so it overrides the
         * line-height baked inline into the letter wrapper of older saved
         * proposals (the inline value would otherwise win). Single source of
         * truth for printed spacing — keep this in sync with the editor rule in
         * index.css (.letter-proposal-editor #letter-proposal). Elements that
         * set their own line-height (SOV cells, .amp-scope-spacer) are unaffected.
         */
        #letter-proposal { line-height: 1.5 !important; }
        @media print {
          @page { size: letter; margin: 0.5in; }
          body {
            font-family: Arial, sans-serif;
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #letter-proposal.print-content { padding-bottom: 35mm; }
          .amp-footer {
            position: fixed !important;
            left: 0; right: 0; bottom: 0;
            width: 100%;
            font-size: 0.9em;
            color: #555;
            border-top: 1px solid #ccc;
            padding: 8px 0;
            text-align: center;
            background: white;
          }
          /* Hide the dropdown, keep the sentence */
          #neta-standard-select { display: none !important; }
          /* Hide scope reordering controls in print */
          .amp-scope-controls { display: none !important; }
          .print-hidden,
          .amp-col-resize { display: none !important; }
          .amp-sov-table {
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: separate !important;
            border-spacing: 0 !important;
            border: 1px solid #bfbfbf !important;
            background: #fff !important;
          }
          .amp-sov-table th,
          .amp-sov-table td {
            box-sizing: border-box !important;
            border: 0 !important;
            border-right: 1px solid #bfbfbf !important;
            border-bottom: 1px solid #bfbfbf !important;
            padding: 4px 12px !important;
            font-family: Arial, Helvetica, sans-serif !important;
            font-size: 11pt !important;
            font-weight: 400 !important;
            font-variant-ligatures: none !important;
            letter-spacing: normal !important;
            line-height: 1.2 !important;
            text-rendering: geometricPrecision !important;
            -webkit-font-smoothing: antialiased !important;
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            word-break: normal !important;
            vertical-align: top !important;
          }
          .amp-sov-table th:last-child,
          .amp-sov-table td:last-child {
            border-right: 0 !important;
          }
          .amp-sov-table tbody tr:last-child > td {
            border-bottom: 0 !important;
          }
          .amp-sov-table th {
            background: #f9fafb !important;
            font-weight: 700 !important;
            text-align: center !important;
          }
          .amp-sov-table td:nth-child(2) {
            text-align: center !important;
          }
          .amp-sov-table .amp-sov-section-row td {
            background: #f9fafb !important;
            font-weight: 700 !important;
            text-align: center !important;
          }
          .amp-sov-table .amp-sov-blank-row td {
            height: 18px !important;
            padding: 10px 0 !important;
          }
          .amp-sov-table tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          /* Hide quantity input in print but keep label */
          .scope-qty { display: none !important; }
          .scope-qty-tag { display: inline !important; }
          /* Reasonable widows/orphans to reduce awkward splits */
          p { orphans: 2; widows: 2; }
          /* Ensure images scale properly */
          img { max-width: 100%; height: auto; }
          /* Prevent extra bullets - ensure div.amp-section elements don't get list styling */
          div.amp-section { list-style: none !important; }
          div.amp-section::before,
          div.amp-section::after { content: none !important; display: none !important; }
          /* Hide empty list items that might cause extra bullets */
          li:empty { display: none !important; }
          li:empty::before,
          li:empty::after { content: none !important; display: none !important; }
          /* Keep list markers visible in print, matching the editor */
          ul,
          #letter-proposal ul {
            list-style: disc outside !important;
            margin: 4px 0 4px 18px !important;
            padding-left: 18px !important;
          }
          ol,
          #letter-proposal ol {
            list-style: decimal outside !important;
            margin: 4px 0 4px 18px !important;
            padding-left: 18px !important;
          }
          li { display: list-item !important; margin: 2px 0 !important; }
          ul::after,
          ol::after { content: none !important; display: none !important; }
          /* Manual page breaks inserted by user */
          .amp-page-break {
            break-before: page !important;
            page-break-before: always !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            height: 0 !important;
          }
          .amp-page-break span { display: none !important; }
        }
        /* Signature should render well */
        img[alt="Signature"] { max-height: 60px; }
      </style></head><body class="letter-proposal-print-content">${bodyHtml}</body></html>`;
      try {
        printWindow.document.open();
      } catch {}
      printWindow.document.write(html);
      printWindow.document.close();
      // Wait for the new window to fully render before printing
      const trigger = () => {
        setTimeout(() => {
          try {
            printWindow.focus();
          } catch {}
          try {
            printWindow.print();
          } catch {}
        }, 100);
      };
      // Some browsers fire load on document, others on window
      try {
        printWindow.addEventListener("load", trigger);
      } catch {
        setTimeout(trigger, 150);
      }
    }
  }

  // When opening the saved estimates modal, auto-select the first quote if available
  useEffect(() => {
    if (
      isOpen &&
      !isNewQuote &&
      quotes.length > 0 &&
      selectedQuoteIndex === -1
    ) {
      setSelectedQuoteIndex(0);
      loadQuoteData(quotes[0]);
    }
  }, [isOpen, isNewQuote, quotes, selectedQuoteIndex]);

  // Respond to mode prop
  useEffect(() => {
    if (mode === "new") {
      setIsOpen(true);
      setIsNewQuote(true);
      setIsViewMode(false);
      setShowTravel(false);
      try {
        localStorage.setItem("AMP_SUSPEND_REFRESH", "true");
      } catch {}
      // Always start with fresh data when explicitly generating a new estimate
      // Clear any existing draft to ensure fresh start
      deletePreference(`drafts.${draftKey}`).catch(() => {});
      setIsDirty(false);
      setData({
        client:
          opportunityData?.customer.company_name ||
          opportunityData?.customer.name ||
          "",
        jobDescription: opportunityData?.description || "",
        dateDue: "",
        location: opportunityData?.customer.address || "",
        periodOfPerformance: "",
        estimatedStartDate: "",
        poNumber: "",
        notes: "",
        sovItems: createDefaultLineItems(),
        nonSovItems: createDefaultNonSovItems(),
        calculatedValues: {
          subtotalMaterial: 0,
          subtotalExpense: 0,
          subtotalLabor: 0,
          totalMaterial: 0,
          totalExpense: 0,
          totalLabor: 0,
          grandTotal: 0,
          nonSovMaterial: 0,
          nonSovExpense: 0,
          nonSovLabor: 0,
          sovLaborHours: 0,
          nonSovLaborHours: 0,
          totalLaborHours: 0,
        },
        hoursSummary: {
          men: DEFAULT_ESTIMATING_PRESETS.default_number_of_men,
          hoursPerDay: DEFAULT_ESTIMATING_PRESETS.default_hours_per_day,
          daysOnsite: 0,
          workHours: 0,
          nonSovHours: 0,
          travelHours: 0,
          totalHours: 0,
          straightTimeHours: 0,
          overtimeHours: 0,
          doubleTimeHours: 0,
          travelStraightTimeHours: 0,
          travelOvertimeHours: 0,
          travelDoubleTimeHours: 0,
        },
      });
    } else if (mode === "view") {
      setIsNewQuote(false);
      setIsOpen(true);
      setIsViewMode(true);
      try {
        localStorage.setItem("AMP_SUSPEND_REFRESH", "true");
      } catch {}
    } else if (mode === "letter") {
      setIsOpen(false); // Ensure saved estimates modal is closed
      // Clear any existing letter proposal state to start fresh
      clearLetterProposalState();
      // Reset letter proposal state
      setIsLetterProposalOpen(false);
      setIsQuoteSelectOpen(false);
      setLetterHtml("");
      savedLetterHtmlRef.current = "";
      setIsLetterDirty(false);
      setSelectedLetterQuoteIndex(null);
      setCurrentLetterId(null);
      // Small delay to ensure state is reset before opening quote selection
      setTimeout(() => {
        handleGenerateLetterProposal();
      }, 50);
    } else if (mode === "combined-letter") {
      setIsOpen(false); // Ensure saved estimates modal is closed
      // Clear any existing letter proposal state to start fresh
      clearLetterProposalState();
      // Reset letter proposal state
      setIsLetterProposalOpen(false);
      setIsCombinedQuoteSelectOpen(false);
      setSelectedQuotesForCombined([]);
      setLetterHtml("");
      savedLetterHtmlRef.current = "";
      setIsLetterDirty(false);
      setSelectedLetterQuoteIndex(null);
      setCurrentLetterId(null);
      // Small delay to ensure state is reset before opening quote selection
      setTimeout(() => {
        handleGenerateCombinedLetterProposal();
      }, 50);
    } else if (mode === "letters") {
      setIsOpen(false);
      setIsLetterProposalOpen(false);
      setIsLetterDirty(false);
      (async () => {
        try {
          const { data, error } = await supabase
            .schema("business")
            .from("letter_proposals")
            .select("id, title, html, created_at, quote_number, neta_standard")
            .eq("opportunity_id", opportunityId)
            .order("created_at", { ascending: false });
          if (!error && data) {
            setLetters(data as any);
          } else {
            setLetters([]);
          }
        } catch {
          setLetters([]);
        }
        setIsLettersListOpen(true);
      })();
    }
    // If mode is undefined, do nothing (default behavior)
  }, [mode]);

  // If the estimate modal closes, re-enable global refreshes
  useEffect(() => {
    if (!isOpen) {
      try {
        localStorage.removeItem("AMP_SUSPEND_REFRESH");
      } catch {}
    }
  }, [isOpen]);

  // If the letter proposal closes, re-enable global refreshes
  // Only remove the flag if we're sure the user deliberately closed it
  useEffect(() => {
    if (!isLetterProposalOpen) {
      // Check if we have persisted letter content - if we do, don't remove the flag
      // as the user might just be switching tabs and we want to preserve their work
      const savedState = getLetterProposalState();

      // Only remove suspend refresh if there's no saved content and no saved open state
      // This indicates the user deliberately closed and cleared the proposal
      if (!savedState.html && !savedState.isOpen) {
        try {
          localStorage.removeItem("AMP_SUSPEND_REFRESH");
        } catch {}
      }
    }
  }, [isLetterProposalOpen, opportunityId, getLetterProposalState]);

  // Save letter content to Supabase whenever it changes (debounced by service)
  useEffect(() => {
    if (!letterHtml) return;
    // Service handles debouncing, so we can call directly
    saveLetterProposalHtml(letterHtml);
  }, [letterHtml, saveLetterProposalHtml]);

  // Save letter proposal open state to Supabase
  useEffect(() => {
    saveLetterProposalOpen(isLetterProposalOpen);
    if (isLetterProposalOpen) {
      // Set suspend refresh when opening (keep in localStorage for cross-tab coordination)
      try {
        localStorage.setItem("AMP_SUSPEND_REFRESH", "true");
      } catch {}
    }
  }, [isLetterProposalOpen, saveLetterProposalOpen]);

  // Immediate restoration on component mount and ensure suspend refresh is set
  useEffect(() => {
    const savedState = getLetterProposalState();

    // If there's saved letter content or the proposal was open, restore it immediately
    if (savedState.isOpen && savedState.html && !isLetterProposalOpen) {
      console.log("Immediate restoration on mount");
      setIsLetterProposalOpen(true);
      const normalized = normalizePricingTermsHtml(savedState.html);
      setLetterHtml(normalized);
      savedLetterHtmlRef.current = normalized;
      setIsLetterDirty(false);
      if (savedState.quoteIndex !== null) {
        setSelectedLetterQuoteIndex(savedState.quoteIndex);
      }
      if (savedState.netaStandard) {
        setNetaStandard(savedState.netaStandard);
      }
      try {
        localStorage.setItem("AMP_SUSPEND_REFRESH", "true");
      } catch {}
    } else if (savedState.html || savedState.isOpen || isLetterProposalOpen) {
      // Even if not restoring, ensure suspend refresh is set
      try {
        localStorage.setItem("AMP_SUSPEND_REFRESH", "true");
      } catch {}
    }
  }, [opportunityId, getLetterProposalState]); // Run on mount and when opportunityId changes

  // Add visibility change listener to restore letter proposal and ensure suspend refresh stays set
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const savedState = getLetterProposalState();

        // If there's saved content and the proposal should be open but isn't, restore it
        if (savedState.isOpen && savedState.html && !isLetterProposalOpen) {
          console.log("Restoring letter proposal on visibility change");
          setIsLetterProposalOpen(true);
          const normalized = normalizePricingTermsHtml(savedState.html);
          setLetterHtml(normalized);
          savedLetterHtmlRef.current = normalized;
          setIsLetterDirty(false);
          if (savedState.quoteIndex !== null) {
            setSelectedLetterQuoteIndex(savedState.quoteIndex);
          }
          if (savedState.netaStandard) {
            setNetaStandard(savedState.netaStandard);
          }
        }

        // Always re-set the suspend refresh flag when tab becomes visible if there's saved content
        if (savedState.html || savedState.isOpen || isLetterProposalOpen) {
          try {
            localStorage.setItem("AMP_SUSPEND_REFRESH", "true");
          } catch {}
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [opportunityId, isLetterProposalOpen, getLetterProposalState]);

  // Save selected letter quote index to Supabase
  useEffect(() => {
    if (selectedLetterQuoteIndex !== null) {
      saveLetterQuoteIndex(selectedLetterQuoteIndex);
    }
  }, [selectedLetterQuoteIndex, saveLetterQuoteIndex]);

  // Save NETA standard to Supabase
  useEffect(() => {
    if (netaStandard) {
      saveLetterNetaStandard(netaStandard);
    }
  }, [netaStandard, saveLetterNetaStandard]);

  // When the parent triggers an openSignal change for the same mode, just bring modal to front without resetting state
  useEffect(() => {
    if (!openSignal) return;
    if (mode === "new" || mode === "view") {
      setIsOpen(true);
      try {
        localStorage.setItem("AMP_SUSPEND_REFRESH", "true");
      } catch {}
      // Do not touch isNewQuote/isViewMode/data here to preserve the form state
    }
  }, [openSignal]);

  // If opportunityData loads after modal is open and mode is 'new', reset the form with the new data
  useEffect(() => {
    if (mode === "new" && isOpen && opportunityData) {
      setIsNewQuote(true);
      setData((prev) => ({
        ...prev,
        client:
          opportunityData.customer.company_name ||
          opportunityData.customer.name ||
          "",
        jobDescription: opportunityData.description || "",
        location: opportunityData.customer.address || "",
      }));
    }
  }, [opportunityData, mode, isOpen]);

  // Mobilization factor based on threshold cost (now adjustable)
  function getMobilizationFactor(finalValue: number) {
    if (finalValue > 1000000) return mobilizationFactors.over1m;
    if (finalValue > 500000) return mobilizationFactors.over500k;
    if (finalValue > 100000) return mobilizationFactors.over100k;
    return mobilizationFactors.base;
  }

  // When mobilization or payment-term factors change, update the letter/proposal HTML so the
  // "Pricing & Terms" and "Copy paste below into quote" amounts stay in sync with the estimate.
  // NOTE: letterHtml is intentionally NOT in the dependency array — this should only run when the
  // factors themselves change, not on every HTML edit (which would corrupt dollar amounts via re-processing).
  const letterHtmlRef = useRef(letterHtml);
  letterHtmlRef.current = letterHtml;
  useEffect(() => {
    const html = letterHtmlRef.current;
    if (
      !isLetterProposalOpen ||
      !html ||
      !html.includes("Mobilization costs of")
    )
      return;
    const option1Match = html.match(
      /Option 1:\s*Where NET 30[^<]*<b>\$([\d,]+\.\d{2})<\/b>/i,
    );
    if (!option1Match) return;
    const option1Raw = parseFloat(option1Match[1].replace(/,/g, ""));
    if (!Number.isFinite(option1Raw) || option1Raw <= 0) return;
    const mobMatch = html.match(/Mobilization costs of[^$]*\$([\d,]+\.\d{2})/i);
    const mobilizationRawFromLetter = mobMatch
      ? parseFloat(mobMatch[1].replace(/,/g, ""))
      : 0;
    const isInclusiveFormat =
      Number.isFinite(mobilizationRawFromLetter) &&
      mobilizationRawFromLetter > 0 &&
      option1Raw > mobilizationRawFromLetter;
    const finalValue = isInclusiveFormat
      ? (option1Raw - mobilizationRawFromLetter) / paymentTermFactors.net30
      : option1Raw / paymentTermFactors.net30;
    if (!Number.isFinite(finalValue) || finalValue <= 0) return;
    const newMobilizationRaw = Math.ceil(
      finalValue * getMobilizationFactor(finalValue),
    );
    const newMobilization = formatCurrency(newMobilizationRaw);
    const newOption1 = formatCurrency(
      Math.ceil(finalValue * paymentTermFactors.net30) + newMobilizationRaw,
    );
    const newOption2 = formatCurrency(
      Math.ceil(finalValue * paymentTermFactors.net60) + newMobilizationRaw,
    );
    const newOption3 = formatCurrency(
      Math.ceil(finalValue * paymentTermFactors.net90) + newMobilizationRaw,
    );
    const updated = html
      .replace(
        /(Mobilization costs of )(\$[\d,]+\.\d{2})/,
        (_m, g1) => `${g1}${newMobilization}`,
      )
      .replace(
        /(Option 1:\s*Where NET 30[^<]*<b>)(\$[\d,]+\.\d{2})(<\/b>)/i,
        (_m, g1, _g2, g3) => `${g1}${newOption1}${g3}`,
      )
      .replace(
        /(Option 2:\s*Where NET 60[^<]*<b>)(\$[\d,]+\.\d{2})(<\/b>)/i,
        (_m, g1, _g2, g3) => `${g1}${newOption2}${g3}`,
      )
      .replace(
        /(Option 3:\s*Where NET 90[^<]*<b>)(\$[\d,]+\.\d{2})(<\/b>)/i,
        (_m, g1, _g2, g3) => `${g1}${newOption3}${g3}`,
      );
    if (updated !== html) {
      letterUpdateSourceRef.current = "programmatic";
      setLetterHtml(updated);
      if (savedLetterHtmlRef.current) savedLetterHtmlRef.current = updated;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobilizationFactors, paymentTermFactors, isLetterProposalOpen]);

  useEffect(() => {
    // If the HTML update was programmatic, try to preserve caret and scroll
    if (letterUpdateSourceRef.current === "programmatic") {
      try {
        // Restore previous selection if possible; otherwise keep caret at end
        const editor = letterEditorRef.current;
        if (!editor) return;
        editor.focus();
        const selection = window.getSelection();
        if (!selection) return;
        selection.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection.addRange(range);
      } catch {}
    }
  }, [letterHtml]);

  return (
    <div className="flex space-x-4">
      {typeof mode === "undefined" && (
        <>
          <Button
            onClick={handleGenerateNewQuote}
            className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors flex items-center"
          >
            Generate Estimate
          </Button>
          <Button
            onClick={() => {
              setIsNewQuote(false);
              setIsOpen(true);
            }}
            className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors flex items-center"
          >
            Show Estimates
          </Button>
          <Button
            onClick={handleGenerateLetterProposal}
            className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors flex items-center"
          >
            Generate Letter Proposal
          </Button>
          <Button
            onClick={handleGenerateCombinedLetterProposal}
            className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors flex items-center"
          >
            Generate Combined Letter Proposal
          </Button>
        </>
      )}

      <Dialog
        open={isOpen}
        onClose={handleClose}
        className="fixed inset-0 z-50 overflow-y-auto"
      >
        <div className="flex items-center justify-center min-h-screen">
          <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />

          <div className="relative bg-white dark:bg-dark-150 rounded-none w-[98%] h-[95vh] mx-auto p-6 shadow-xl my-4 estimate-form">
            <div className="absolute top-0 right-3 pt-4 pr-4 flex items-center gap-3">
              {isViewMode &&
              quotes.length === 0 &&
              isNewQuote ? null : isNewQuote ? (
                <Button
                  onClick={saveQuote}
                  disabled={isSaving}
                  isLoading={isSaving}
                  className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors"
                >
                  Save Quote
                </Button>
              ) : isViewMode ? (
                <>
                  <Button
                    onClick={() => {
                      setJustSaved(false);
                      setIsViewMode(false);
                    }}
                    className="h-10 w-10 p-0 bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors"
                  >
                    <Edit className="h-6 w-6" />
                  </Button>
                  {selectedQuoteIndex >= 0 && quotes[selectedQuoteIndex] && (
                    <>
                      <Button
                        type="button"
                        onClick={() => {
                          if (
                            confirm(
                              "Delete this estimate? This cannot be undone.",
                            )
                          ) {
                            deleteQuoteById(quotes[selectedQuoteIndex].id);
                          }
                        }}
                        className="h-10 w-10 p-0 rounded-none bg-red-600 text-white hover:bg-red-700 transition-colors"
                      >
                        <Trash className="h-6 w-6" />
                      </Button>
                      <Button
                        onClick={() =>
                          duplicateQuote(quotes[selectedQuoteIndex].id)
                        }
                        disabled={isSaving}
                        className="bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1"
                        leftIcon={<Copy className="h-5 w-5" />}
                      >
                        Duplicate
                      </Button>
                      <SymbolCopyButtons />
                      <Button
                        onClick={() => setIsCopyToOpportunityOpen(true)}
                        disabled={isSaving}
                        className="bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center gap-1"
                        leftIcon={<Copy className="h-5 w-5" />}
                      >
                        Copy to opportunity
                      </Button>
                    </>
                  )}
                </>
              ) : (
                <>
                  {/* Circular save button matching ReportHeader pattern */}
                  <button
                    onClick={saveQuote}
                    disabled={isSaving}
                    className={`flex h-10 w-10 items-center justify-center rounded-none text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                      justSaved
                        ? "bg-green-600 hover:bg-green-700 focus:ring-green-500"
                        : "bg-[#f26722] hover:bg-[#f26722]/90 focus:ring-[#f26722]"
                    }`}
                    aria-label={justSaved ? "Saved" : "Save"}
                    title={justSaved ? "Saved" : "Save"}
                  >
                    {isSaving ? (
                      <LoadingSpinner
                        className="h-5 w-5"
                        size="xs"
                        variant="light"
                      />
                    ) : justSaved ? (
                      <Check className="h-6 w-6" />
                    ) : (
                      <Save className="h-6 w-6" />
                    )}
                  </button>
                  {selectedQuoteIndex >= 0 && quotes[selectedQuoteIndex] && (
                    <>
                      <Button
                        onClick={() => {
                          if (
                            confirm(
                              "Delete this estimate? This cannot be undone.",
                            )
                          ) {
                            deleteQuoteById(quotes[selectedQuoteIndex].id);
                          }
                        }}
                        className="h-10 w-10 p-0 rounded-none bg-red-600 text-white hover:bg-red-700 transition-colors"
                      >
                        <Trash className="h-6 w-6" />
                      </Button>
                      <Button
                        onClick={() =>
                          duplicateQuote(quotes[selectedQuoteIndex].id)
                        }
                        disabled={isSaving}
                        className="bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1"
                        leftIcon={<Copy className="h-5 w-5" />}
                      >
                        Duplicate
                      </Button>
                      <SymbolCopyButtons />
                      <Button
                        onClick={() => setIsCopyToOpportunityOpen(true)}
                        disabled={isSaving}
                        className="bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center gap-1"
                        leftIcon={<Copy className="h-5 w-5" />}
                      >
                        Copy to opportunity
                      </Button>
                    </>
                  )}
                </>
              )}
              {/* Swap: LogOut in edit mode, X otherwise */}
              {!isViewMode && !isNewQuote ? (
                <button
                  type="button"
                  onClick={() => setIsViewMode(true)}
                  className="text-neutral-600 hover:text-neutral-500 dark:text-dark-400 dark:hover:text-dark-300"
                  title="Done editing"
                  aria-label="Done editing"
                >
                  <LogOut className="h-6 w-6" />
                </button>
              ) : (
                <button
                  type="button"
                  className="text-neutral-600 hover:text-neutral-500 dark:text-dark-400 dark:hover:text-dark-300"
                  onClick={handleClose}
                >
                  <span className="sr-only">Close</span>
                  <X className="h-6 w-6" />
                </button>
              )}
            </div>

            <Dialog.Title className="text-xl font-semibold text-neutral-900 dark:text-dark-900 mb-6">
              {isViewMode && quotes.length === 0 && isNewQuote
                ? "Saved Estimates"
                : isNewQuote
                  ? "New Estimate"
                  : "Saved Estimates"}
            </Dialog.Title>

            {/* Prompt when user opened "Show Estimates" but none exist */}
            {isViewMode && quotes.length === 0 && isNewQuote ? (
              <div className="h-[calc(95vh-120px)] flex items-center justify-center">
                <div className="text-center max-w-md">
                  <FileText className="mx-auto h-16 w-16 text-neutral-300 dark:text-dark-400 mb-4" />
                  <h3 className="text-lg font-semibold text-neutral-700 dark:text-dark-800 mb-2">
                    No Estimates Saved
                  </h3>
                  <p className="text-neutral-500 dark:text-dark-500 mb-6">
                    No estimates have been saved for this opportunity yet. Would
                    you like to create one?
                  </p>
                  <div className="flex justify-center gap-3">
                    <Button
                      onClick={() => {
                        setIsViewMode(false);
                        handleGenerateNewQuote();
                      }}
                      className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors px-6 py-2"
                    >
                      Generate Estimate
                    </Button>
                    <Button
                      onClick={handleClose}
                      className="bg-neutral-200 text-neutral-700 hover:bg-neutral-300 dark:bg-dark-200 dark:text-dark-700 dark:hover:bg-dark-300 transition-colors px-6 py-2"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-[calc(95vh-120px)] overflow-y-auto">
                {!isNewQuote && quotes.length > 0 ? (
                  <Tab.Group
                    selectedIndex={
                      selectedQuoteIndex >= 0 &&
                      selectedQuoteIndex < quotes.length
                        ? selectedQuoteIndex
                        : 0
                    }
                    onChange={(index) => {
                      if (isDraggingTabRef.current) return;

                      const quote = quotes[index];
                      if (!quote) return;

                      setSelectedQuoteIndex(index);
                      loadQuoteData(quote);
                    }}
                  >
                    <div className="mb-4">
                      <Tab.List className="flex space-x-2 border-b border-neutral-200">
                        {quotes.map((quote, index) => (
                          <div
                            key={quote.id}
                            className={`flex flex-col items-center ${
                              dragOverTabIndex === index
                                ? "ring-2 ring-[#f26722] ring-offset-2 rounded-none"
                                : ""
                            }`}
                            onDragOver={(e) => {
                              e.preventDefault();
                              handleTabDragOver(e, index);
                            }}
                            onDragLeave={handleTabDragLeave}
                            onDrop={(e) => handleTabDrop(e, index)}
                          >
                            {/* Grip icon above tab */}
                            <div
                              draggable
                              onDragStart={(e) => {
                                handleTabDragStart(e, index);
                              }}
                              onDragEnd={(e) => {
                                handleTabDragEnd(e);
                              }}
                              className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 mb-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <GripHorizontal size={16} />
                            </div>
                            {/* Tab itself */}
                            <Tab
                              className={({ selected }) =>
                                `px-4 py-2 text-sm font-medium rounded-none focus:outline-none transition-all ${
                                  selected
                                    ? "bg-[#f26722] text-white"
                                    : "bg-neutral-100 dark:bg-dark-150 text-neutral-500 dark:text-dark-400 hover:bg-neutral-200 dark:hover:bg-dark-300"
                                } ${
                                  draggedTabIndex === index ? "opacity-50" : ""
                                }`
                              }
                              onClick={(e) => {
                                // Prevent click if we're dragging
                                if (isDraggingTabRef.current) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }
                              }}
                            >
                              {getQuoteDisplayName(quote, index)}
                            </Tab>
                          </div>
                        ))}
                      </Tab.List>
                    </div>
                  </Tab.Group>
                ) : null}

                <div className="mt-4">
                  <div style={styles.app}>
                    {/* Status and Page Numbering Row */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "20px",
                        gap: "20px",
                      }}
                    >
                      {/* Status Selector - Show for both new and existing estimates */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <label
                          style={{
                            fontSize: "14px",
                            fontWeight: "bold",
                            color: "var(--text-color)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Status:
                        </label>
                        <select
                          value={estimateStatus || ""}
                          onChange={(e) => {
                            const newStatus = e.target.value || null;
                            setEstimateStatus(newStatus as any);
                            // Auto-save status change for existing estimates
                            if (!isNewQuote && quotes[selectedQuoteIndex]?.id) {
                              supabase
                                .schema("business")
                                .from("estimates")
                                .update({ status: newStatus })
                                .eq("id", quotes[selectedQuoteIndex].id)
                                .then(({ error }) => {
                                  if (error) {
                                    console.error(
                                      "Failed to update status:",
                                      error,
                                    );
                                  } else {
                                    // Update local state
                                    setQuotes((prev) =>
                                      prev.map((q, idx) =>
                                        idx === selectedQuoteIndex
                                          ? { ...q, status: newStatus as any }
                                          : q,
                                      ),
                                    );
                                  }
                                });
                            }
                            // For new quotes, status will be saved when the quote is saved
                          }}
                          style={{
                            padding: "6px 12px",
                            fontSize: "14px",
                            border: "1px solid var(--border-color)",
                            borderRadius: "4px",
                            backgroundColor: "var(--bg-color)",
                            color: "var(--text-color)",
                            cursor: isViewMode ? "not-allowed" : "pointer",
                            minWidth: "180px",
                          }}
                          disabled={isViewMode}
                        >
                          <option value="">-- Select Status --</option>
                          <option
                            value="in_progress"
                            title="Working on the estimate"
                          >
                            In Progress — working on estimate
                          </option>
                          <option value="ready_for_review">
                            Ready for Review
                          </option>
                          <option value="approved_to_send">
                            Approved to Send
                          </option>
                          <option value="sent">Sent</option>
                          <option
                            value="no_quote"
                            title="Not submitting a quote"
                          >
                            No Quote — not submitting
                          </option>
                        </select>
                      </div>
                      {/* Page Numbering */}
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: "bold",
                          color: "var(--text-color)",
                          marginLeft: "auto",
                        }}
                      >
                        SHEET {isNewQuote ? "1" : selectedQuoteIndex + 1} OF{" "}
                        {isNewQuote ? "1" : Math.max(quotes.length, 1)}
                      </div>
                    </div>

                    {/* Improved Header Layout */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "30px",
                        marginBottom: "20px",
                      }}
                    >
                      {/* First Row - Client and Quote Title */}
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>Client:</label>
                        <input
                          type="text"
                          style={styles.formInput}
                          value={data.client}
                          onChange={(e) =>
                            handleGeneralChange("client", e.target.value)
                          }
                          readOnly={isViewMode}
                        />
                      </div>

                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>
                          Quote Title (optional):
                        </label>
                        <input
                          type="text"
                          style={styles.formInput}
                          value={data.title || ""}
                          onChange={(e) =>
                            handleGeneralChange("title", e.target.value)
                          }
                          readOnly={isViewMode}
                          placeholder="E.g. Switchgear Testing Scope A"
                        />
                      </div>
                    </div>

                    {/* Second Row - Notes and Additional Notes */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "30px",
                        marginBottom: "20px",
                        alignItems: "start",
                      }}
                    >
                      {/* Notes Section */}
                      <div
                        style={{
                          backgroundColor: "var(--summary-bg)",
                          padding: "15px",
                          borderRadius: "4px",
                          border: "1px solid var(--border-color)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "14px",
                            fontWeight: "bold",
                            color: "var(--text-color)",
                            marginBottom: "10px",
                          }}
                        >
                          Notes:
                        </div>
                        <ul
                          style={{
                            margin: "0",
                            paddingLeft: "20px",
                            color: "var(--text-color)",
                            fontSize: "12px",
                            lineHeight: "1.4",
                          }}
                        >
                          <li style={{ marginBottom: "5px" }}>
                            • fields highlighted in light gray are calculated
                            automatically
                          </li>
                          <li style={{ marginBottom: "5px" }}>
                            • "Material" columns for costs to receive tax &
                            mark-up
                          </li>
                        </ul>
                      </div>

                      {/* Additional Notes */}
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>
                          Additional Notes:
                        </label>
                        <textarea
                          style={{
                            ...styles.formInput,
                            minHeight: "80px",
                            resize: "vertical",
                          }}
                          value={data.notes}
                          onChange={(e) =>
                            handleGeneralChange("notes", e.target.value)
                          }
                          placeholder="Enter any additional notes or special instructions..."
                        />
                      </div>
                    </div>

                    {/* SOV Quote Items */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={styles.sectionHeader}>SOV QUOTE ITEMS</div>
                      {/* Payment Term Selector for SOV Item Price column */}
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "12px", color: "var(--muted-fg, #6b7280)" }}>
                          Price shown:
                        </span>
                        <select
                          value={selectedSovPriceTerm}
                          disabled={isViewMode}
                          onChange={(e) => {
                            setSelectedSovPriceTerm(e.target.value as "net30" | "net60" | "net90");
                            setIsDirty(true);
                          }}
                          style={{
                            fontSize: "12px",
                            padding: "4px 8px",
                            border: "1px solid var(--border-color)",
                            borderRadius: "4px",
                            backgroundColor: "var(--input-bg)",
                            color: "var(--text-color)",
                            cursor: isViewMode ? "default" : "pointer",
                          }}
                        >
                          <option value="net30">NET 30</option>
                          <option value="net60">NET 60</option>
                          <option value="net90">NET 90</option>
                        </select>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setItemColWidth(DEFAULT_ITEM_COL_WIDTH);
                          setNonSovItemColWidth(DEFAULT_ITEM_COL_WIDTH);
                          updatePreference(
                            `ui.${estimateColWidthKey}`,
                            DEFAULT_ITEM_COL_WIDTH,
                            true,
                          );
                        }}
                      >
                        Default column width
                      </Button>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "16px",
                          flexWrap: "wrap",
                          marginLeft: "auto",
                        }}
                      >
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: "13px",
                            cursor: isViewMode ? "default" : "pointer",
                          }}
                          title="Include the SOV Item & Quantity table in the generated proposal. Pricing always uses the items below regardless of this toggle."
                        >
                          <Switch
                            checked={data.useSovItems !== false}
                            disabled={isViewMode}
                            checkedClassName="bg-[#f26722]"
                            onCheckedChange={(checked) => {
                              setData((prev) => ({
                                ...prev,
                                useSovItems: checked,
                              }));
                              setIsDirty(true);
                            }}
                          />
                          Show items in proposal
                        </label>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: "13px",
                            cursor: isViewMode ? "default" : "pointer",
                          }}
                          title="Include a free-text scope description in the proposal. Can be used alongside or instead of the items table (e.g. for abstract scopes)."
                        >
                          <Switch
                            checked={!!data.useScopeNarrative}
                            disabled={isViewMode}
                            checkedClassName="bg-[#f26722]"
                            onCheckedChange={(checked) => {
                              setData((prev) => ({
                                ...prev,
                                useScopeNarrative: checked,
                              }));
                              setIsDirty(true);
                            }}
                          />
                          Use scope narrative in proposal
                        </label>
                      </div>
                    </div>
                    {data.useScopeNarrative && (
                      <div style={{ ...styles.formGroup, marginTop: "8px" }}>
                        <label style={styles.formLabel}>
                          Scope Narrative (shown in the proposal
                          {data.useSovItems !== false
                            ? " above the Item & Quantity table"
                            : " instead of the Item & Quantity table"}
                          ):
                        </label>
                        <textarea
                          style={{
                            ...styles.formInput,
                            minHeight: "140px",
                            resize: "vertical",
                          }}
                          value={data.scopeNarrative || ""}
                          disabled={isViewMode}
                          onChange={(e) =>
                            handleScopeNarrativeChange(e.target.value)
                          }
                          placeholder="Describe the scope of work. Type /library to insert a saved scope note from the library."
                        />
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--muted-fg, #6b7280)",
                            marginTop: "4px",
                          }}
                        >
                          Tip: type <strong>/library</strong> to pick from saved
                          scope notes. The SOV items still drive pricing even
                          when hidden.
                        </div>
                      </div>
                    )}
                    <ProposalScopeNotesModal
                      isOpen={isScopeNarrativeLibraryOpen}
                      onClose={() => setIsScopeNarrativeLibraryOpen(false)}
                      onInsert={(notesHtml: string) => {
                        insertScopeNotesIntoNarrative(notesHtml);
                        setIsScopeNarrativeLibraryOpen(false);
                      }}
                    />
                    {/* SOV table always visible in the editor; the toggle only
                        controls whether items appear in the generated proposal */}
                      <div
                        style={styles.tableContainer}
                        onMouseMove={onMouseMove}
                        onMouseUp={onMouseUp}
                        onMouseLeave={onMouseUp}
                      >
                        <table style={styles.table}>
                          <thead>
                            <tr>
                              <th
                                style={{
                                  ...styles.tableHeader,
                                  width: "44px",
                                  minWidth: "44px",
                                }}
                              ></th>
                              <th
                                ref={itemHeaderRef}
                                style={{
                                  ...styles.tableHeader,
                                  width: toPx(itemColWidth),
                                  minWidth: toPx(itemColWidth),
                                  position: "relative",
                                }}
                              >
                                ITEM
                                <span
                                  role="separator"
                                  aria-orientation="vertical"
                                  title="Drag to resize column"
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    onItemMouseDown(e);
                                  }}
                                  style={{
                                    position: "absolute",
                                    right: -4,
                                    top: 0,
                                    height: "100%",
                                    width: 12,
                                    minHeight: 24,
                                    cursor: "col-resize",
                                    userSelect: "none",
                                    zIndex: 10,
                                  }}
                                />
                              </th>
                              <th style={styles.tableHeader}>QUANTITY</th>
                              <th style={styles.tableHeader}>MATERIAL PRICE</th>
                              <th style={styles.tableHeader}>
                                MATERIAL EXTENSION
                              </th>
                              <th style={styles.tableHeader}>LABOR (MEN)</th>
                              <th style={styles.tableHeader}>LABOR (HOURS)</th>
                              <th style={styles.tableHeader}>LABOR UNIT</th>
                              <th style={styles.tableHeader}>LABOR TOTAL</th>
                              <th style={styles.tableHeader}>
                                SOV ITEM PRICE ({selectedSovPriceTerm === "net30" ? "NET 30" : selectedSovPriceTerm === "net60" ? "NET 60" : "NET 90"})
                              </th>
                              <th style={styles.tableHeader}>NOTES</th>
                              {!isViewMode && (
                                <th style={styles.tableHeader}>CLEAR</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {data.sovItems.map((item, index) => {
                              const isSectionRow = isEstimateSectionRow(item);
                              const isSubsectionRow = isEstimateSubsectionRow(item);
                              const isBlankRow = isEstimateBlankRow(item);
                              if (isSectionRow || isSubsectionRow || isBlankRow) {
                                const structuralBg = isSectionRow
                                  ? "var(--header-bg)"
                                  : isSubsectionRow
                                    ? "var(--cell-bg)"
                                    : "var(--cell-bg)";
                                return (
                                  <tr
                                    key={index}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e) => handleDrop(e, index, "sov")}
                                    style={{
                                      backgroundColor:
                                        dragOverIndex === index &&
                                        draggedItemType === "sov"
                                          ? "#f3f4f6"
                                          : "transparent",
                                      borderTop:
                                        dragOverIndex === index &&
                                        draggedItemType === "sov"
                                          ? "2px solid #f26722"
                                          : "none",
                                    }}
                                  >
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        backgroundColor: structuralBg,
                                      }}
                                    />
                                    <td
                                      colSpan={10}
                                      style={{
                                        ...styles.tableCell,
                                        backgroundColor: structuralBg,
                                        padding: isBlankRow
                                          ? "10px 5px"
                                          : isSubsectionRow
                                            ? "4px 5px"
                                            : "6px 5px",
                                        borderTop: isSectionRow
                                          ? "2px solid var(--border-color)"
                                          : "1px solid var(--border-color)",
                                        borderBottom: isSectionRow
                                          ? "2px solid var(--border-color)"
                                          : "1px solid var(--border-color)",
                                      }}
                                    >
                                      <div
                                        style={{
                                          position: "relative",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          minHeight: isBlankRow
                                            ? "22px"
                                            : "28px",
                                        }}
                                      >
                                        {!isViewMode && (
                                          <div
                                            draggable={true}
                                            onDragStart={(e) =>
                                              handleDragStart(e, index, "sov")
                                            }
                                            onDragEnd={handleDragEnd}
                                            style={{
                                              position: "absolute",
                                              left: 8,
                                              cursor: "grab",
                                              color: "#6b7280",
                                              fontSize: "14px",
                                              userSelect: "none",
                                              padding: "2px",
                                            }}
                                            title="Drag to reorder"
                                          >
                                            ⋮⋮
                                          </div>
                                        )}
                                        {isSectionRow ? (
                                          <input
                                            type="text"
                                            style={{
                                              ...styles.tableInput,
                                              width: "min(520px, 80%)",
                                              border: "none",
                                              backgroundColor: "transparent",
                                              fontWeight: "bold",
                                              textAlign: "center",
                                              padding: "4px",
                                            }}
                                            value={item.item}
                                            onChange={(e) =>
                                              handleItemChange(
                                                "sov",
                                                index,
                                                "item",
                                                e.target.value,
                                              )
                                            }
                                            onKeyDown={(e) =>
                                              handleEstimateCellKeyDown(
                                                e,
                                                "sov",
                                                index,
                                                0,
                                                data.sovItems.length,
                                              )
                                            }
                                            data-estimate-table="sov"
                                            data-estimate-row={index}
                                            data-estimate-col={0}
                                            readOnly={isViewMode}
                                          />
                                        ) : isSubsectionRow ? (
                                          <input
                                            type="text"
                                            style={{
                                              ...styles.tableInput,
                                              width: "min(480px, 90%)",
                                              border: "none",
                                              backgroundColor: "transparent",
                                              fontWeight: "normal",
                                              fontStyle: "italic",
                                              fontSize: "0.88em",
                                              color: "var(--text-muted, #6b7280)",
                                              textAlign: "center",
                                              padding: "4px",
                                            }}
                                            value={item.item}
                                            onChange={(e) =>
                                              handleItemChange(
                                                "sov",
                                                index,
                                                "item",
                                                e.target.value,
                                              )
                                            }
                                            onKeyDown={(e) =>
                                              handleEstimateCellKeyDown(
                                                e,
                                                "sov",
                                                index,
                                                0,
                                                data.sovItems.length,
                                              )
                                            }
                                            data-estimate-table="sov"
                                            data-estimate-row={index}
                                            data-estimate-col={0}
                                            readOnly={isViewMode}
                                          />
                                        ) : (
                                          <div
                                            style={{
                                              width: "80%",
                                              height: "1px",
                                              backgroundColor:
                                                "var(--border-color)",
                                              opacity: 0.7,
                                            }}
                                          />
                                        )}
                                      </div>
                                    </td>
                                    {!isViewMode && (
                                      <td
                                        style={{
                                          ...styles.tableCell,
                                          backgroundColor: structuralBg,
                                        }}
                                      >
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleClearRow("sov", index)
                                          }
                                          onKeyDown={(e) =>
                                            handleEstimateCellKeyDown(
                                              e,
                                              "sov",
                                              index,
                                              12,
                                              data.sovItems.length,
                                            )
                                          }
                                          data-estimate-table="sov"
                                          data-estimate-row={index}
                                          data-estimate-col={12}
                                          style={{
                                            background: "none",
                                            border: "none",
                                            color: "#ef4444",
                                            cursor: "pointer",
                                            padding: "2px",
                                          }}
                                          title="Delete this row"
                                        >
                                          <Trash className="h-5 w-5" />
                                        </button>
                                      </td>
                                    )}
                                  </tr>
                                );
                              }

                              const materialExtension =
                                calculateMaterialExtension(
                                  item.quantity,
                                  item.materialPrice,
                                );
                              const expenseExtension =
                                calculateExpenseExtension(
                                  item.quantity,
                                  item.expensePrice,
                                );
                              const laborUnit = calculateLaborUnit(
                                item.laborMen,
                                item.laborHours,
                              );
                              const laborTotal = calculateLaborTotal(
                                item.quantity,
                                item.laborMen,
                                item.laborHours,
                              );

                              // Debug: Log the item values
                              console.log("SOV Item Debug:", {
                                index: index,
                                item: item.item,
                                laborMen: item.laborMen,
                                laborHours: item.laborHours,
                                calculatedLaborUnit: laborUnit,
                                rawLaborMen: item.laborMen,
                                rawLaborHours: item.laborHours,
                                typeOfLaborMen: typeof item.laborMen,
                                typeOfLaborHours: typeof item.laborHours,
                              });

                              const sovItemPrice = calculateSOVItemPrice(
                                materialExtension,
                                expenseExtension,
                                laborUnit,
                              );

                              return (
                                <tr
                                  key={index}
                                  onDragOver={(e) => handleDragOver(e, index)}
                                  onDragLeave={handleDragLeave}
                                  onDrop={(e) => handleDrop(e, index, "sov")}
                                  style={{
                                    backgroundColor:
                                      dragOverIndex === index &&
                                      draggedItemType === "sov"
                                        ? "#f3f4f6"
                                        : "transparent",
                                    borderTop:
                                      dragOverIndex === index &&
                                      draggedItemType === "sov"
                                        ? "2px solid #f26722"
                                        : "none",
                                  }}
                                >
                                  <td
                                    style={{
                                      ...styles.tableCell,
                                      width: "44px",
                                      minWidth: "44px",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedSovItemIndexes.includes(
                                        index,
                                      )}
                                      onChange={() =>
                                        toggleSovItemSelection(index)
                                      }
                                      title="Select this SOV item to copy"
                                    />
                                  </td>
                                  <td
                                    style={{
                                      ...styles.tableCell,
                                      width: toPx(itemColWidth),
                                      minWidth: toPx(itemColWidth),
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                      }}
                                    >
                                      {!isViewMode && (
                                        <div
                                          draggable={true}
                                          onDragStart={(e) =>
                                            handleDragStart(e, index, "sov")
                                          }
                                          onDragEnd={handleDragEnd}
                                          onMouseEnter={(e) => {
                                            (
                                              e.target as HTMLElement
                                            ).style.color = "#374151";
                                            (
                                              e.target as HTMLElement
                                            ).style.cursor = "grab";
                                          }}
                                          onMouseLeave={(e) => {
                                            (
                                              e.target as HTMLElement
                                            ).style.color = "#6b7280";
                                          }}
                                          onMouseDown={(e) => {
                                            (
                                              e.target as HTMLElement
                                            ).style.cursor = "grabbing";
                                          }}
                                          onMouseUp={(e) => {
                                            (
                                              e.target as HTMLElement
                                            ).style.cursor = "grab";
                                          }}
                                          style={{
                                            cursor: "grab",
                                            color: "#6b7280",
                                            fontSize: "14px",
                                            userSelect: "none",
                                            padding: "2px",
                                            borderRadius: "2px",
                                            transition: "color 0.2s ease",
                                          }}
                                          title="Drag to reorder"
                                        >
                                          ⋮⋮
                                        </div>
                                      )}
                                      <input
                                        type="text"
                                        style={{
                                          ...styles.tableInput,
                                          flex: 1,
                                        }}
                                        value={item.item}
                                        onChange={(e) =>
                                          handleItemChange(
                                            "sov",
                                            index,
                                            "item",
                                            e.target.value,
                                          )
                                        }
                                        onKeyDown={(e) =>
                                          handleEstimateCellKeyDown(
                                            e,
                                            "sov",
                                            index,
                                            0,
                                            data.sovItems.length,
                                          )
                                        }
                                        data-estimate-table="sov"
                                        data-estimate-row={index}
                                        data-estimate-col={0}
                                        readOnly={isViewMode}
                                      />
                                      {!isViewMode && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setScopeLibraryPicker({
                                              open: true,
                                              section: "sov",
                                              index,
                                            })
                                          }
                                          title="Search scope item library"
                                          aria-label="Search scope item library"
                                          style={{
                                            background: "none",
                                            border: "none",
                                            color: "#f26722",
                                            cursor: "pointer",
                                            padding: "3px",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            borderRadius: "4px",
                                          }}
                                        >
                                          <BookOpen className="h-5 w-5" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                  <td style={styles.tableCell}>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      style={styles.tableInput}
                                      value={
                                        blankingKeys.has(
                                          makeKey("sov", index, "quantity"),
                                        )
                                          ? ""
                                          : String(item.quantity ?? "")
                                      }
                                      onChange={(e) =>
                                        handleItemChange(
                                          "sov",
                                          index,
                                          "quantity",
                                          e.target.value,
                                        )
                                      }
                                      onKeyDown={(e) => {
                                        handleEstimateCellKeyDown(
                                          e,
                                          "sov",
                                          index,
                                          1,
                                          data.sovItems.length,
                                        );
                                        if (
                                          e.key === "Backspace" &&
                                          String(item.quantity) === "0"
                                        ) {
                                          const copy = new Set(blankingKeys);
                                          copy.add(
                                            makeKey("sov", index, "quantity"),
                                          );
                                          setBlankingKeys(copy);
                                          e.preventDefault();
                                          handleItemChange(
                                            "sov",
                                            index,
                                            "quantity",
                                            "",
                                          );
                                        }
                                      }}
                                      data-estimate-table="sov"
                                      data-estimate-row={index}
                                      data-estimate-col={1}
                                      readOnly={isViewMode}
                                    />
                                  </td>
                                  <td style={styles.tableCell}>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      style={styles.tableInput}
                                      value={
                                        blankingKeys.has(
                                          makeKey(
                                            "sov",
                                            index,
                                            "materialPrice",
                                          ),
                                        )
                                          ? ""
                                          : String(item.materialPrice ?? "")
                                      }
                                      onChange={(e) =>
                                        handleItemChange(
                                          "sov",
                                          index,
                                          "materialPrice",
                                          e.target.value,
                                        )
                                      }
                                      onKeyDown={(e) => {
                                        handleEstimateCellKeyDown(
                                          e,
                                          "sov",
                                          index,
                                          2,
                                          data.sovItems.length,
                                        );
                                        if (
                                          e.key === "Backspace" &&
                                          String(item.materialPrice) === "0"
                                        ) {
                                          const copy = new Set(blankingKeys);
                                          copy.add(
                                            makeKey(
                                              "sov",
                                              index,
                                              "materialPrice",
                                            ),
                                          );
                                          setBlankingKeys(copy);
                                          e.preventDefault();
                                          handleItemChange(
                                            "sov",
                                            index,
                                            "materialPrice",
                                            "",
                                          );
                                        }
                                      }}
                                      data-estimate-table="sov"
                                      data-estimate-row={index}
                                      data-estimate-col={2}
                                      readOnly={isViewMode}
                                    />
                                  </td>
                                  <td
                                    style={{
                                      ...styles.tableCell,
                                      ...styles.calculated,
                                    }}
                                  >
                                    {formatCurrency(materialExtension)}
                                  </td>
                                  <td style={styles.tableCell}>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      style={styles.tableInput}
                                      value={
                                        blankingKeys.has(
                                          makeKey("sov", index, "laborMen"),
                                        )
                                          ? ""
                                          : Number.isNaN(Number(item.laborMen))
                                            ? ""
                                            : String(item.laborMen ?? "")
                                      }
                                      onChange={(e) =>
                                        handleItemChange(
                                          "sov",
                                          index,
                                          "laborMen",
                                          e.target.value,
                                        )
                                      }
                                      onKeyDown={(e) => {
                                        handleEstimateCellKeyDown(
                                          e,
                                          "sov",
                                          index,
                                          6,
                                          data.sovItems.length,
                                        );
                                        if (
                                          e.key === "Backspace" &&
                                          String(item.laborMen) === "0"
                                        ) {
                                          const copy = new Set(blankingKeys);
                                          copy.add(
                                            makeKey("sov", index, "laborMen"),
                                          );
                                          setBlankingKeys(copy);
                                          e.preventDefault();
                                          handleItemChange(
                                            "sov",
                                            index,
                                            "laborMen",
                                            "",
                                          );
                                        }
                                      }}
                                      data-estimate-table="sov"
                                      data-estimate-row={index}
                                      data-estimate-col={6}
                                      readOnly={isViewMode}
                                    />
                                  </td>
                                  <td style={styles.tableCell}>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      style={styles.tableInput}
                                      value={
                                        blankingKeys.has(
                                          makeKey("sov", index, "laborHours"),
                                        )
                                          ? ""
                                          : Number.isNaN(
                                                Number(item.laborHours),
                                              )
                                            ? ""
                                            : String(item.laborHours ?? "")
                                      }
                                      onChange={(e) =>
                                        handleItemChange(
                                          "sov",
                                          index,
                                          "laborHours",
                                          e.target.value,
                                        )
                                      }
                                      onKeyDown={(e) => {
                                        handleEstimateCellKeyDown(
                                          e,
                                          "sov",
                                          index,
                                          7,
                                          data.sovItems.length,
                                        );
                                        if (
                                          e.key === "Backspace" &&
                                          String(item.laborHours) === "0"
                                        ) {
                                          const copy = new Set(blankingKeys);
                                          copy.add(
                                            makeKey("sov", index, "laborHours"),
                                          );
                                          setBlankingKeys(copy);
                                          e.preventDefault();
                                          handleItemChange(
                                            "sov",
                                            index,
                                            "laborHours",
                                            "",
                                          );
                                        }
                                      }}
                                      data-estimate-table="sov"
                                      data-estimate-row={index}
                                      data-estimate-col={7}
                                      readOnly={isViewMode}
                                    />
                                  </td>
                                  <td
                                    style={{
                                      ...styles.tableCell,
                                      ...styles.calculated,
                                    }}
                                  >
                                    {formatNumber(laborUnit)}
                                  </td>
                                  <td
                                    style={{
                                      ...styles.tableCell,
                                      ...styles.calculated,
                                    }}
                                  >
                                    {formatNumber(laborTotal)}
                                  </td>
                                  <td
                                    style={{
                                      ...styles.tableCell,
                                      ...styles.calculated,
                                    }}
                                  >
                                    {formatCurrency(sovItemPrice)}
                                  </td>
                                  <td style={styles.tableCell}>
                                    <input
                                      type="text"
                                      style={styles.tableInput}
                                      value={item.notes}
                                      onChange={(e) =>
                                        handleItemChange(
                                          "sov",
                                          index,
                                          "notes",
                                          e.target.value,
                                        )
                                      }
                                      onKeyDown={(e) =>
                                        handleEstimateCellKeyDown(
                                          e,
                                          "sov",
                                          index,
                                          11,
                                          data.sovItems.length,
                                        )
                                      }
                                      data-estimate-table="sov"
                                      data-estimate-row={index}
                                      data-estimate-col={11}
                                      readOnly={isViewMode}
                                    />
                                  </td>
                                  {!isViewMode && (
                                    <td style={styles.tableCell}>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleClearRow("sov", index)
                                        }
                                        onKeyDown={(e) =>
                                          handleEstimateCellKeyDown(
                                            e,
                                            "sov",
                                            index,
                                            12,
                                            data.sovItems.length,
                                          )
                                        }
                                        data-estimate-table="sov"
                                        data-estimate-row={index}
                                        data-estimate-col={12}
                                        style={{
                                          background: "none",
                                          border: "none",
                                          color: "#ef4444",
                                          cursor: "pointer",
                                          padding: "2px",
                                        }}
                                        title="Delete this row"
                                      >
                                        <Trash className="h-5 w-5" />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        {(() => {
                          const selectableSovIndexes = data.sovItems
                            .map((item, index) =>
                              !isStructuralLineItem(item) ? index : -1,
                            )
                            .filter((index) => index >= 0);
                          const targetQuotes = quotes.filter(
                            (quote) =>
                              quote.id !==
                              (!isNewQuote
                                ? quotes[selectedQuoteIndex]?.id
                                : ""),
                          );
                          const allSovItemsSelected =
                            selectableSovIndexes.length > 0 &&
                            selectableSovIndexes.every((index) =>
                              selectedSovItemIndexes.includes(index),
                            );
                          return (
                            <div className="mt-4 space-y-2 print:hidden">
                              <div className="flex flex-wrap items-center gap-2">
                                <label className="text-sm font-medium text-neutral-700 dark:text-dark-800">
                                  {selectedSovItemIndexes.length} selected
                                </label>
                                <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-dark-800">
                                  <input
                                    type="checkbox"
                                    checked={allSovItemsSelected}
                                    disabled={selectableSovIndexes.length === 0}
                                    onChange={(e) => {
                                      setSelectedSovItemIndexes(
                                        e.target.checked
                                          ? selectableSovIndexes
                                          : [],
                                      );
                                    }}
                                  />
                                  Select all
                                </label>
                                {selectedSovItemIndexes.length > 0 && (
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() =>
                                      setSelectedSovItemIndexes([])
                                    }
                                  >
                                    Deselect
                                  </Button>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  value={copyTargetQuoteId}
                                  onChange={(e) =>
                                    setCopyTargetQuoteId(e.target.value)
                                  }
                                  className="form-input h-9 min-w-[220px] flex-1 text-sm"
                                  style={{
                                    width: "auto",
                                    backgroundColor: "var(--input-bg)",
                                    color: "var(--text-color)",
                                    borderColor: "var(--border-color)",
                                  }}
                                >
                                  <option value="">Copy to...</option>
                                  {targetQuotes.map((quote) => {
                                    const quoteIndex = quotes.findIndex(
                                      (q) => q.id === quote.id,
                                    );
                                    return (
                                      <option key={quote.id} value={quote.id}>
                                        {getQuoteDisplayName(quote, quoteIndex)}
                                      </option>
                                    );
                                  })}
                                  <option value="__new__">New estimate</option>
                                </select>
                                {copyTargetQuoteId === "__new__" && (
                                  <input
                                    type="text"
                                    value={newCopyEstimateTitle}
                                    onChange={(e) =>
                                      setNewCopyEstimateTitle(e.target.value)
                                    }
                                    placeholder="New estimate name"
                                    className="form-input h-9 min-w-[220px] text-sm"
                                    style={{
                                      width: "auto",
                                      backgroundColor: "var(--input-bg)",
                                      color: "var(--text-color)",
                                      borderColor: "var(--border-color)",
                                    }}
                                  />
                                )}
                                <Button
                                  type="button"
                                  onClick={handleCopySelectedSovItems}
                                  disabled={
                                    isCopyingSovItems ||
                                    selectedSovItemIndexes.length === 0 ||
                                    !copyTargetQuoteId
                                  }
                                  className="h-9 bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1"
                                  leftIcon={<Copy className="h-5 w-5" />}
                                >
                                  {isCopyingSovItems
                                    ? "Copying..."
                                    : "Copy SOV Items"}
                                </Button>
                                {!isViewMode && (
                                  <Button
                                    type="button"
                                    onClick={handleClearSelectedSovItems}
                                    disabled={
                                      selectedSovItemIndexes.length === 0
                                    }
                                    className="h-9 bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-1"
                                    leftIcon={<Trash className="h-5 w-5" />}
                                  >
                                    Delete Selected
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={() => handleAddLine("sov", "section")}
                            className="inline-flex items-center gap-2 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
                            leftIcon={<FileText className="h-5 w-5" />}
                            style={{
                              backgroundColor: "var(--cell-bg)",
                              borderColor: "var(--border-color)",
                              color: "var(--text-color)",
                            }}
                          >
                            Add Section
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleAddLine("sov", "subsection")}
                            className="inline-flex items-center gap-2 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
                            leftIcon={<List className="h-5 w-5" />}
                            style={{
                              backgroundColor: "var(--cell-bg)",
                              borderColor: "var(--border-color)",
                              color: "var(--text-color)",
                              fontStyle: "italic",
                            }}
                          >
                            Add Sub-Section
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleAddLine("sov", "blank")}
                            className="inline-flex items-center gap-2 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
                            leftIcon={
                              <SeparatorHorizontal className="h-5 w-5" />
                            }
                            style={{
                              backgroundColor: "var(--cell-bg)",
                              borderColor: "var(--border-color)",
                              color: "var(--text-color)",
                            }}
                          >
                            Add Blank Row
                          </Button>
                          <Button
                            onClick={() => handleAddLine("sov")}
                            className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors"
                          >
                            Add SOV Line
                          </Button>
                        </div>
                      </div>

                    {/* Non-SOV Quote Items */}
                    <div style={styles.sectionHeader}>NON-SOV QUOTE ITEMS</div>
                    <div
                      style={styles.tableContainer}
                      onMouseMove={onMouseMove}
                      onMouseUp={onMouseUp}
                      onMouseLeave={onMouseUp}
                    >
                      <table style={styles.table}>
                        <thead>
                          <tr>
                            <th
                              ref={nonSovItemHeaderRef}
                              style={{
                                ...styles.tableHeader,
                                width: toPx(nonSovItemColWidth),
                                minWidth: toPx(nonSovItemColWidth),
                                position: "relative",
                              }}
                            >
                              ITEM
                              <span
                                role="separator"
                                aria-orientation="vertical"
                                title="Drag to resize column"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  onNonSovItemMouseDown(e);
                                }}
                                style={{
                                  position: "absolute",
                                  right: -4,
                                  top: 0,
                                  height: "100%",
                                  width: 12,
                                  minHeight: 24,
                                  cursor: "col-resize",
                                  userSelect: "none",
                                  zIndex: 10,
                                }}
                              />
                            </th>
                            <th style={styles.tableHeader}>QUANTITY</th>
                            <th style={styles.tableHeader}>MATERIAL PRICE</th>
                            <th style={styles.tableHeader}>
                              MATERIAL EXTENSION
                            </th>
                            <th style={styles.tableHeader}>LABOR (MEN)</th>
                            <th style={styles.tableHeader}>LABOR (HOURS)</th>
                            <th style={styles.tableHeader}>LABOR UNIT</th>
                            <th style={styles.tableHeader}>LABOR TOTAL</th>
                            <th style={styles.tableHeader}>NOTES</th>
                            {!isViewMode && (
                              <th style={styles.tableHeader}>CLEAR</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {data.nonSovItems.map((item, index) => {
                            const materialExtension =
                              calculateMaterialExtension(
                                item.quantity,
                                item.materialPrice,
                              );
                            const laborUnit = calculateLaborUnit(
                              item.laborMen,
                              item.laborHours,
                            );
                            const laborTotal = calculateLaborTotal(
                              item.quantity,
                              item.laborMen,
                              item.laborHours,
                            );

                            return (
                              <tr
                                key={index}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, index, "nonSov")}
                                style={{
                                  backgroundColor:
                                    dragOverIndex === index &&
                                    draggedItemType === "nonSov"
                                      ? "#f3f4f6"
                                      : "transparent",
                                  borderTop:
                                    dragOverIndex === index &&
                                    draggedItemType === "nonSov"
                                      ? "2px solid #f26722"
                                      : "none",
                                }}
                              >
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    width: toPx(nonSovItemColWidth),
                                    minWidth: toPx(nonSovItemColWidth),
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                    }}
                                  >
                                    {!isViewMode && (
                                      <div
                                        draggable={true}
                                        onDragStart={(e) =>
                                          handleDragStart(e, index, "nonSov")
                                        }
                                        onDragEnd={handleDragEnd}
                                        onMouseEnter={(e) => {
                                          (
                                            e.target as HTMLElement
                                          ).style.color = "#374151";
                                          (
                                            e.target as HTMLElement
                                          ).style.cursor = "grab";
                                        }}
                                        onMouseLeave={(e) => {
                                          (
                                            e.target as HTMLElement
                                          ).style.color = "#6b7280";
                                        }}
                                        onMouseDown={(e) => {
                                          (
                                            e.target as HTMLElement
                                          ).style.cursor = "grabbing";
                                        }}
                                        onMouseUp={(e) => {
                                          (
                                            e.target as HTMLElement
                                          ).style.cursor = "grab";
                                        }}
                                        style={{
                                          cursor: "grab",
                                          color: "#6b7280",
                                          fontSize: "14px",
                                          userSelect: "none",
                                          padding: "2px",
                                          borderRadius: "2px",
                                          transition: "color 0.2s ease",
                                        }}
                                        title="Drag to reorder"
                                      >
                                        ⋮⋮
                                      </div>
                                    )}
                                    <input
                                      type="text"
                                      style={{ ...styles.tableInput, flex: 1 }}
                                      value={item.item}
                                      onChange={(e) =>
                                        handleItemChange(
                                          "nonSov",
                                          index,
                                          "item",
                                          e.target.value,
                                        )
                                      }
                                      onKeyDown={(e) =>
                                        handleEstimateCellKeyDown(
                                          e,
                                          "nonSov",
                                          index,
                                          0,
                                          data.nonSovItems.length,
                                        )
                                      }
                                      data-estimate-table="nonSov"
                                      data-estimate-row={index}
                                      data-estimate-col={0}
                                      readOnly={isViewMode}
                                    />
                                    {!isViewMode && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setScopeLibraryPicker({
                                            open: true,
                                            section: "nonSov",
                                            index,
                                          })
                                        }
                                        title="Search scope item library"
                                        aria-label="Search scope item library"
                                        style={{
                                          background: "none",
                                          border: "none",
                                          color: "#f26722",
                                          cursor: "pointer",
                                          padding: "3px",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          borderRadius: "4px",
                                        }}
                                      >
                                        <BookOpen className="h-5 w-5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.quantity}
                                    onChange={(e) =>
                                      handleItemChange(
                                        "nonSov",
                                        index,
                                        "quantity",
                                        e.target.value,
                                      )
                                    }
                                    onKeyDown={(e) =>
                                      handleEstimateCellKeyDown(
                                        e,
                                        "nonSov",
                                        index,
                                        1,
                                        data.nonSovItems.length,
                                      )
                                    }
                                    data-estimate-table="nonSov"
                                    data-estimate-row={index}
                                    data-estimate-col={1}
                                    readOnly={isViewMode}
                                  />
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    style={styles.tableInput}
                                    value={item.materialPrice}
                                    onChange={(e) =>
                                      handleItemChange(
                                        "nonSov",
                                        index,
                                        "materialPrice",
                                        e.target.value,
                                      )
                                    }
                                    onKeyDown={(e) =>
                                      handleEstimateCellKeyDown(
                                        e,
                                        "nonSov",
                                        index,
                                        2,
                                        data.nonSovItems.length,
                                      )
                                    }
                                    data-estimate-table="nonSov"
                                    data-estimate-row={index}
                                    data-estimate-col={2}
                                    readOnly={isViewMode}
                                  />
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                  }}
                                >
                                  {formatCurrency(materialExtension)}
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    style={styles.tableInput}
                                    value={
                                      Number.isNaN(Number(item.laborMen))
                                        ? ""
                                        : item.laborMen
                                    }
                                    onChange={(e) =>
                                      handleItemChange(
                                        "nonSov",
                                        index,
                                        "laborMen",
                                        e.target.value,
                                      )
                                    }
                                    onKeyDown={(e) =>
                                      handleEstimateCellKeyDown(
                                        e,
                                        "nonSov",
                                        index,
                                        6,
                                        data.nonSovItems.length,
                                      )
                                    }
                                    data-estimate-table="nonSov"
                                    data-estimate-row={index}
                                    data-estimate-col={6}
                                    readOnly={isViewMode}
                                  />
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    style={styles.tableInput}
                                    value={
                                      Number.isNaN(Number(item.laborHours))
                                        ? ""
                                        : item.laborHours
                                    }
                                    onChange={(e) =>
                                      handleItemChange(
                                        "nonSov",
                                        index,
                                        "laborHours",
                                        e.target.value,
                                      )
                                    }
                                    onKeyDown={(e) =>
                                      handleEstimateCellKeyDown(
                                        e,
                                        "nonSov",
                                        index,
                                        7,
                                        data.nonSovItems.length,
                                      )
                                    }
                                    data-estimate-table="nonSov"
                                    data-estimate-row={index}
                                    data-estimate-col={7}
                                    readOnly={isViewMode}
                                  />
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                  }}
                                >
                                  {formatNumber(laborUnit)}
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                  }}
                                >
                                  {formatNumber(laborTotal)}
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="text"
                                    style={styles.tableInput}
                                    value={item.notes}
                                    onChange={(e) =>
                                      handleItemChange(
                                        "nonSov",
                                        index,
                                        "notes",
                                        e.target.value,
                                      )
                                    }
                                    onKeyDown={(e) =>
                                      handleEstimateCellKeyDown(
                                        e,
                                        "nonSov",
                                        index,
                                        10,
                                        data.nonSovItems.length,
                                      )
                                    }
                                    data-estimate-table="nonSov"
                                    data-estimate-row={index}
                                    data-estimate-col={10}
                                    readOnly={isViewMode}
                                  />
                                </td>
                                {!isViewMode && (
                                  <td style={styles.tableCell}>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleClearRow("nonSov", index)
                                      }
                                      onKeyDown={(e) =>
                                        handleEstimateCellKeyDown(
                                          e,
                                          "nonSov",
                                          index,
                                          11,
                                          data.nonSovItems.length,
                                        )
                                      }
                                      data-estimate-table="nonSov"
                                      data-estimate-row={index}
                                      data-estimate-col={11}
                                      style={{
                                        background: "none",
                                        border: "none",
                                        color: "#ef4444",
                                        cursor: "pointer",
                                        padding: "2px",
                                      }}
                                      title="Delete this row"
                                    >
                                      <Trash className="h-5 w-5" />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      <div className="mt-4 flex justify-end space-x-4">
                        <Button
                          onClick={() => handleAddLine("nonSov")}
                          className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors"
                        >
                          Add Non-SOV Line
                        </Button>
                        <Button
                          onClick={toggleTravel}
                          className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors"
                        >
                          {showTravel ? "Hide Travel" : "Add Travel"}
                        </Button>
                      </div>
                    </div>

                    {showTravel &&
                      (() => {
                        const tt = computeTravelTotals(travelData);
                        const td = travelData as any;
                        const speed =
                          DEFAULT_ESTIMATING_PRESETS.default_average_speed || 50;
                        const navItems: {
                          key: typeof activeTravelSection;
                          label: string;
                          badge: string;
                        }[] = [
                          {
                            key: "travel",
                            label: "Travel",
                            badge: `${fmtMoney0(tt.travel.cost)} · ${tt.travel.hours.toFixed(0)} hrs`,
                          },
                          {
                            key: "perDiem",
                            label: "Per diem",
                            badge: fmtMoney0(tt.perDiem.total),
                          },
                          {
                            key: "lodging",
                            label: "Lodging",
                            badge: fmtMoney0(tt.lodging.total),
                          },
                          {
                            key: "localMiles",
                            label: "Local miles",
                            badge: fmtMoney0(tt.localMiles.total),
                          },
                          {
                            key: "airTravel",
                            label: "Air travel",
                            badge: `${fmtMoney0(tt.airTravel.flightTotal)} · ${tt.airTravel.hours.toFixed(0)} hrs`,
                          },
                          {
                            key: "rentalCar",
                            label: "Rental car",
                            badge: fmtMoney0(tt.rentalCar.total),
                          },
                        ];

                        return (
                          <div className="mt-8 max-w-4xl">
                            <h3 className="text-xl font-semibold mb-4">
                              Travel Expenses
                            </h3>

                            <SectionNav
                              items={navItems}
                              active={activeTravelSection}
                              onChange={setActiveTravelSection}
                            >
                              {/* Disabled fieldset locks every travel input/button in view mode (the section nav stays usable) */}
                              <fieldset
                                disabled={isViewMode}
                                className="min-w-0"
                              >
                                {/* TRAVEL (vehicle + time merged) */}
                                {activeTravelSection === "travel" && (
                                  <div>
                                    {sectionTitle(
                                      "Travel",
                                      `drive miles & time, @ ${speed} mph standard`,
                                    )}
                                    {tt.groups.map((g: any, idx: number) => (
                                      <div
                                        key={idx}
                                        className="border border-neutral-200 dark:border-dark-200 rounded-none p-3 mb-2"
                                      >
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                                            Trip group {idx + 1}
                                          </span>
                                          {tt.groups.length > 1 && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                removeTravelGroup(idx)
                                              }
                                              className="text-xs text-neutral-400 hover:text-red-500"
                                              aria-label="Remove trip group"
                                            >
                                              Remove
                                            </button>
                                          )}
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-2">
                                          {numField("Trips", g.trips, (v) =>
                                            updateTravelGroup(idx, "trips", v),
                                          )}
                                          {numField(
                                            "One way miles",
                                            g.oneWayMiles,
                                            (v) =>
                                              updateTravelGroup(
                                                idx,
                                                "oneWayMiles",
                                                v,
                                              ),
                                          )}
                                          {numField(
                                            "# vehicles",
                                            g.numVehicles,
                                            (v) =>
                                              updateTravelGroup(
                                                idx,
                                                "numVehicles",
                                                v,
                                              ),
                                          )}
                                          {numField("# of men", g.numMen, (v) =>
                                            updateTravelGroup(idx, "numMen", v),
                                          )}
                                          {numField(
                                            "Rate ($/mi)",
                                            g.rate,
                                            (v) =>
                                              updateTravelGroup(idx, "rate", v),
                                            0.01,
                                          )}
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                          {calcField(
                                            "Vehicle miles",
                                            fmtNum(g.vehicleMiles),
                                          )}
                                          {calcField(
                                            "Vehicle cost",
                                            fmtMoney(g.vehicleCost),
                                          )}
                                          {calcField(
                                            "One way hours",
                                            g.oneWayHours.toFixed(2),
                                          )}
                                          {calcField(
                                            "Group travel hours",
                                            g.groupHours.toFixed(2),
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={addTravelGroup}
                                      className="w-full flex items-center justify-center gap-2 text-sm text-[#185FA5] dark:text-blue-300 border border-blue-200 dark:border-blue-900 rounded-none py-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                                    >
                                      + Add trip group
                                    </button>
                                    {subLabel("Section totals")}
                                    <div className="grid grid-cols-3 gap-2">
                                      {totalField(
                                        "Total vehicle miles",
                                        fmtNum(tt.travel.vehicleMiles),
                                      )}
                                      {totalField(
                                        "Total vehicle cost",
                                        fmtMoney(tt.travel.cost),
                                      )}
                                      {totalField(
                                        "Grand total travel hours",
                                        tt.travel.hours.toFixed(2),
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* PER DIEM */}
                                {activeTravelSection === "perDiem" && (
                                  <div>
                                    {sectionTitle("Per diem")}
                                    <div className="grid grid-cols-3 gap-2">
                                      {numField(
                                        "# of days",
                                        td.perDiem.numDays,
                                        (v) =>
                                          updateTravelSection(
                                            "perDiem",
                                            "numDays",
                                            v,
                                          ),
                                      )}
                                      {numField(
                                        "Daily rate",
                                        td.perDiem.dailyRate,
                                        (v) =>
                                          updateTravelSection(
                                            "perDiem",
                                            "dailyRate",
                                            v,
                                          ),
                                        0.01,
                                      )}
                                      {numField(
                                        "# of men",
                                        td.perDiem.numMen,
                                        (v) =>
                                          updateTravelSection(
                                            "perDiem",
                                            "numMen",
                                            v,
                                          ),
                                      )}
                                    </div>
                                    {subLabel("Calculated")}
                                    <div className="grid grid-cols-2 gap-2">
                                      {calcField(
                                        "Per diem per man",
                                        fmtMoney(tt.perDiem.perMan),
                                      )}
                                      {totalField(
                                        "Total per diem",
                                        fmtMoney(tt.perDiem.total),
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* LODGING */}
                                {activeTravelSection === "lodging" && (
                                  <div>
                                    {sectionTitle("Lodging")}
                                    <div className="grid grid-cols-3 gap-2">
                                      {numField(
                                        "# of nights",
                                        td.lodging.numNights,
                                        (v) =>
                                          updateTravelSection(
                                            "lodging",
                                            "numNights",
                                            v,
                                          ),
                                      )}
                                      {numField(
                                        "# of men",
                                        td.lodging.numMen,
                                        (v) =>
                                          updateTravelSection(
                                            "lodging",
                                            "numMen",
                                            v,
                                          ),
                                      )}
                                      {numField(
                                        "Rate ($/night)",
                                        td.lodging.rate,
                                        (v) =>
                                          updateTravelSection(
                                            "lodging",
                                            "rate",
                                            v,
                                          ),
                                        0.01,
                                      )}
                                    </div>
                                    {subLabel("Calculated")}
                                    <div className="grid grid-cols-2 gap-2">
                                      {calcField(
                                        "# of man nights",
                                        fmtNum(tt.lodging.manNights),
                                      )}
                                      {totalField(
                                        "Total lodging",
                                        fmtMoney(tt.lodging.total),
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* LOCAL MILES */}
                                {activeTravelSection === "localMiles" && (
                                  <div>
                                    {sectionTitle("Local miles")}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                      {numField(
                                        "# of days",
                                        td.localMiles.numDays,
                                        (v) =>
                                          updateTravelSection(
                                            "localMiles",
                                            "numDays",
                                            v,
                                          ),
                                      )}
                                      {numField(
                                        "# of vehicles",
                                        td.localMiles.numVehicles,
                                        (v) =>
                                          updateTravelSection(
                                            "localMiles",
                                            "numVehicles",
                                            v,
                                          ),
                                      )}
                                      {numField(
                                        "Miles per day",
                                        td.localMiles.milesPerDay,
                                        (v) =>
                                          updateTravelSection(
                                            "localMiles",
                                            "milesPerDay",
                                            v,
                                          ),
                                      )}
                                      {numField(
                                        "Rate ($/mi)",
                                        td.localMiles.rate,
                                        (v) =>
                                          updateTravelSection(
                                            "localMiles",
                                            "rate",
                                            v,
                                          ),
                                        0.01,
                                      )}
                                    </div>
                                    {subLabel("Calculated")}
                                    <div className="grid grid-cols-2 gap-2">
                                      {calcField(
                                        "Total miles",
                                        fmtNum(tt.localMiles.totalMiles),
                                      )}
                                      {totalField(
                                        "Total cost",
                                        fmtMoney(tt.localMiles.total),
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* AIR TRAVEL (flights + air time merged) */}
                                {activeTravelSection === "airTravel" && (
                                  <div>
                                    {sectionTitle(
                                      "Air travel",
                                      "flights & air time",
                                    )}
                                    {subLabel("Shared inputs")}
                                    <div className="grid grid-cols-2 gap-2">
                                      {numField(
                                        "# of men",
                                        td.airTravel.numMen,
                                        (v) =>
                                          updateTravelSection(
                                            "airTravel",
                                            "numMen",
                                            v,
                                          ),
                                      )}
                                      {numField(
                                        "# of trips",
                                        td.airTravel.numTrips,
                                        (v) =>
                                          updateTravelSection(
                                            "airTravel",
                                            "numTrips",
                                            v,
                                          ),
                                      )}
                                    </div>
                                    {subLabel("Flight cost")}
                                    <div className="grid grid-cols-3 gap-2">
                                      {numField(
                                        "# of flights",
                                        td.airTravel.numFlights,
                                        (v) =>
                                          updateTravelSection(
                                            "airTravel",
                                            "numFlights",
                                            v,
                                          ),
                                      )}
                                      {numField(
                                        "Rate ($/ticket)",
                                        td.airTravel.flightRate,
                                        (v) =>
                                          updateTravelSection(
                                            "airTravel",
                                            "flightRate",
                                            v,
                                          ),
                                        0.01,
                                      )}
                                      {numField(
                                        "Luggage fees",
                                        td.airTravel.luggageFees,
                                        (v) =>
                                          updateTravelSection(
                                            "airTravel",
                                            "luggageFees",
                                            v,
                                          ),
                                        0.01,
                                      )}
                                    </div>
                                    {subLabel("Air time")}
                                    <div className="grid grid-cols-2 gap-2">
                                      {numField(
                                        "One way hours in air",
                                        td.airTravel.oneWayHoursInAir,
                                        (v) =>
                                          updateTravelSection(
                                            "airTravel",
                                            "oneWayHoursInAir",
                                            v,
                                          ),
                                        0.5,
                                      )}
                                      {calcField(
                                        "Round trip + terminal",
                                        tt.airTravel.roundTripTerminal.toFixed(
                                          1,
                                        ),
                                      )}
                                    </div>
                                    {subLabel("Section totals")}
                                    <div className="grid grid-cols-2 gap-2">
                                      {totalField(
                                        "Total flight amount",
                                        fmtMoney(tt.airTravel.flightTotal),
                                      )}
                                      {totalField(
                                        "Grand total air hours",
                                        tt.airTravel.hours.toFixed(2),
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* RENTAL CAR */}
                                {activeTravelSection === "rentalCar" && (
                                  <div>
                                    {sectionTitle("Rental car")}
                                    <div className="grid grid-cols-3 gap-2">
                                      {numField(
                                        "# of cars",
                                        td.rentalCar.numCars,
                                        (v) =>
                                          updateTravelSection(
                                            "rentalCar",
                                            "numCars",
                                            v,
                                          ),
                                      )}
                                      {numField(
                                        "# of days",
                                        td.rentalCar.numDays,
                                        (v) =>
                                          updateTravelSection(
                                            "rentalCar",
                                            "numDays",
                                            v,
                                          ),
                                      )}
                                      {numField(
                                        "Daily rate ($/day)",
                                        td.rentalCar.rate,
                                        (v) =>
                                          updateTravelSection(
                                            "rentalCar",
                                            "rate",
                                            v,
                                          ),
                                        0.01,
                                      )}
                                    </div>
                                    {subLabel("Calculated")}
                                    <div className="grid grid-cols-2 gap-2">
                                      {calcField(
                                        "Total car-days",
                                        fmtNum(tt.rentalCar.carDays),
                                      )}
                                      {totalField(
                                        "Total rental cost",
                                        fmtMoney(tt.rentalCar.total),
                                      )}
                                    </div>
                                  </div>
                                )}
                              </fieldset>
                            </SectionNav>

                            {/* Travel grand totals */}
                            <div className="mt-4 flex flex-wrap items-center justify-end gap-6 rounded-none bg-neutral-50 dark:bg-dark-100 border border-neutral-200 dark:border-dark-200 px-4 py-3">
                              <div className="text-sm text-neutral-600 dark:text-neutral-300">
                                Total travel hours:{" "}
                                <span className="font-semibold text-neutral-900 dark:text-white">
                                  {tt.laborHours.toFixed(2)}
                                </span>
                              </div>
                              <div className="text-sm text-neutral-600 dark:text-neutral-300">
                                Total travel expenses (non-labor):{" "}
                                <span className="font-semibold text-[#854F0B] dark:text-orange-300">
                                  {fmtMoney(tt.nonLaborCost)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                    {(() => {
                      const summaryNavItems: SectionNavItem<typeof activeSummarySection>[] = [
                        { key: "hoursLabor", label: "Hours & Labor", badge: `${formatNumber(data.hoursSummary.totalHours)} hrs` },
                        { key: "terms", label: "Payment + mob", badge: formatCurrency(Math.ceil(getFinalValue() * paymentTermFactors.net30) + Math.ceil(getFinalValue() * getMobilizationFactor(getFinalValue()))) },
                        { key: "financial", label: "Financial", badge: formatCurrency(getFinalValue()) },
                      ];
                      return (
                        <div className="mt-8 max-w-4xl">
                          <h3 className="text-xl font-semibold mb-4">Estimate Summary</h3>
                          <SectionNav
                            items={summaryNavItems}
                            active={activeSummarySection}
                            onChange={setActiveSummarySection}
                          >
                        {activeSummarySection === "financial" && (
                          <div>
                      {/* Financial Summary Table - Left Side */}
                      <div
                        style={styles.panelBlock}
                      >
                        <h3
                          style={{
                            ...styles.panelTitle,
                            marginBottom: "15px",
                          }}
                        >
                          Financial Summary
                        </h3>
                        <table
                          style={{
                            ...styles.table,
                            width: "100%",
                            fontSize: "14px",
                          }}
                        >
                          <thead>
                            <tr>
                              <th
                                style={{
                                  ...styles.tableHeader,
                                  padding: "12px 8px",
                                }}
                              ></th>
                              <th
                                style={{
                                  ...styles.tableHeader,
                                  padding: "12px 8px",
                                }}
                              >
                                AMOUNT
                              </th>
                              <th
                                style={{
                                  ...styles.tableHeader,
                                  padding: "12px 8px",
                                }}
                              >
                                TAX FACTOR
                              </th>
                              <th
                                style={{
                                  ...styles.tableHeader,
                                  padding: "12px 8px",
                                }}
                              >
                                COST
                              </th>
                              <th
                                style={{
                                  ...styles.tableHeader,
                                  padding: "12px 8px",
                                }}
                              >
                                MARK-UP
                              </th>
                              <th
                                style={{
                                  ...styles.tableHeader,
                                  padding: "12px 8px",
                                }}
                              >
                                TOTALS
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  fontWeight: "bold",
                                  padding: "12px 8px",
                                  textAlign: "left",
                                }}
                              >
                                MATERIAL TOTAL:
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  ...styles.calcCell,
                                  padding: "12px 8px",
                                }}
                              >
                                {formatCurrency(
                                  data.calculatedValues.totalMaterial,
                                )}
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  padding: "12px 8px",
                                }}
                              >
                                1.09
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  ...styles.calcCell,
                                  padding: "12px 8px",
                                }}
                              >
                                {formatCurrency(
                                  data.calculatedValues.totalMaterial * 1.09,
                                )}
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  padding: "12px 8px",
                                }}
                              >
                                <input
                                  type="number"
                                  style={{
                                    ...styles.tableInput,
                                    width: "100%",
                                  }}
                                  value={materialMarkup}
                                  onChange={(e) => {
                                    const markup =
                                      parseFloat(e.target.value) ||
                                      DEFAULT_ESTIMATING_PRESETS.default_markup_factor;
                                    setMaterialMarkup(markup);
                                  }}
                                  step="0.1"
                                  min="0"
                                  readOnly={isViewMode}
                                  placeholder="1.3"
                                />
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  ...styles.calcCell,
                                  padding: "12px 8px",
                                }}
                              >
                                {formatCurrency(
                                  data.calculatedValues.totalMaterial *
                                    1.09 *
                                    materialMarkup,
                                )}
                              </td>
                            </tr>
                            <tr style={{ ...styles.tfoot }}>
                              <td
                                colSpan={5}
                                style={{
                                  ...styles.tableCell,
                                  textAlign: "right",
                                  fontWeight: "bold",
                                  padding: "12px 8px",
                                }}
                              >
                                Total:
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  ...styles.totalCell,
                                  fontWeight: "bold",
                                  padding: "12px 8px",
                                }}
                              >
                                {formatCurrency(
                                  data.calculatedValues.totalMaterial *
                                    1.09 *
                                    materialMarkup +
                                    data.calculatedValues.totalExpense * 1.09 +
                                    data.calculatedValues.nonSovExpense * 1.0,
                                )}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                          </div>
                        )}
                        {activeSummarySection === "hoursLabor" && (
                          <div>
                      {/* Hours Summary Section - Right Side - fixed width so it doesn't stretch the page */}
                      <div
                        style={styles.panelBlock}
                      >
                        <h3
                          style={{
                            ...styles.panelTitle,
                            marginBottom: "15px",
                          }}
                        >
                          Hours Summary
                        </h3>
                        <table
                          style={{
                            ...styles.table,
                            width: "100%",
                            minWidth: 0,
                            fontSize: "14px",
                            tableLayout: "fixed",
                          }}
                        >
                          <tbody>
                            <tr>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  width: "60%",
                                  textAlign: "left",
                                  padding: "12px 8px",
                                }}
                              >
                                Men:
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  width: "40%",
                                  padding: "12px 8px",
                                }}
                              >
                                <input
                                  type="number"
                                  step="0.01"
                                  style={{
                                    ...styles.tableInput,
                                    width: "100%",
                                  }}
                                  value={data.hoursSummary.men}
                                  onChange={(e) =>
                                    handleHoursSummaryChange(
                                      "men",
                                      e.target.value,
                                    )
                                  }
                                  readOnly={isViewMode}
                                />
                              </td>
                            </tr>
                            <tr>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  textAlign: "left",
                                  padding: "12px 8px",
                                }}
                              >
                                Hrs/Day:
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  padding: "12px 8px",
                                }}
                              >
                                <input
                                  type="number"
                                  step="0.01"
                                  style={{
                                    ...styles.tableInput,
                                    width: "100%",
                                  }}
                                  value={data.hoursSummary.hoursPerDay}
                                  onChange={(e) =>
                                    handleHoursSummaryChange(
                                      "hoursPerDay",
                                      e.target.value,
                                    )
                                  }
                                  readOnly={isViewMode}
                                />
                              </td>
                            </tr>
                            <tr>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  textAlign: "left",
                                  padding: "12px 8px",
                                }}
                              >
                                Days Onsite:
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  ...styles.calcCell,
                                  padding: "12px 8px",
                                }}
                              >
                                {formatNumber(data.hoursSummary.daysOnsite)}
                              </td>
                            </tr>
                            <tr>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  textAlign: "left",
                                  padding: "12px 8px",
                                }}
                              >
                                Work / SOV Hrs:
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  ...styles.calcCell,
                                  padding: "12px 8px",
                                }}
                              >
                                {formatNumber(data.hoursSummary.workHours)}
                              </td>
                            </tr>
                            <tr>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  textAlign: "left",
                                  padding: "12px 8px",
                                }}
                              >
                                Non-SOV Hrs:
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  ...styles.calcCell,
                                  padding: "12px 8px",
                                }}
                              >
                                {formatNumber(data.hoursSummary.nonSovHours)}
                              </td>
                            </tr>
                            <tr>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  textAlign: "left",
                                  padding: "12px 8px",
                                }}
                              >
                                Travel Hours:
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  ...styles.calcCell,
                                  padding: "12px 8px",
                                }}
                              >
                                {formatNumber(data.hoursSummary.travelHours)}
                              </td>
                            </tr>
                            <tr style={{ ...styles.tfoot }}>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  textAlign: "left",
                                  fontWeight: "bold",
                                  padding: "12px 8px",
                                }}
                              >
                                TOTAL HOURS:
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  ...styles.totalCell,
                                  fontWeight: "bold",
                                  padding: "12px 8px",
                                }}
                              >
                                {formatNumber(data.hoursSummary.totalHours)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      {/* Labor Calculation Table - Under Financial Summary */}
                      <div
                        style={styles.panelBlock}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "15px",
                          }}
                        >
                          <h3
                            style={{ ...styles.panelTitle, marginBottom: 0 }}
                          >
                            Labor Hours Tracking — Monday-Friday
                          </h3>
                          {!isViewMode && (
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              onClick={() => {
                                setShowSaturdayHours(!showSaturdayHours);
                                setIsDirty(true);
                              }}
                              style={{
                                padding: "4px 10px",
                                fontSize: "11px",
                                borderRadius: "4px",
                                cursor: "pointer",
                                backgroundColor: showSaturdayHours
                                  ? "#f26722"
                                  : "transparent",
                                color: showSaturdayHours ? "white" : "#f26722",
                                border: "0.5px solid #f26722",
                              }}
                            >
                              {showSaturdayHours
                                ? "Hide Saturday"
                                : "Show Saturday"}
                            </button>
                            <button
                              onClick={() => {
                                setShowSundayHours(!showSundayHours);
                                setIsDirty(true);
                              }}
                              style={{
                                padding: "4px 10px",
                                fontSize: "11px",
                                borderRadius: "4px",
                                cursor: "pointer",
                                backgroundColor: showSundayHours
                                  ? "#f26722"
                                  : "transparent",
                                color: showSundayHours ? "white" : "#f26722",
                                border: "0.5px solid #f26722",
                              }}
                            >
                              {showSundayHours
                                ? "Hide Sunday/Holiday"
                                : "Show Sunday/Holiday"}
                            </button>
                          </div>
                          )}
                        </div>

                        {/* Hours Counter */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: "15px",
                            padding: "10px",
                            backgroundColor: "#f8f9fa",
                            borderRadius: "4px",
                            border: "1px solid #dee2e6",
                          }}
                        >
                          <div style={{ fontWeight: "bold", color: "#495057" }}>
                            Work Hours Quoted:{" "}
                            {toNum(data.hoursSummary.workHours) +
                              toNum(data.hoursSummary.nonSovHours)}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                            }}
                          >
                            <div
                              style={{
                                fontWeight: "bold",
                                color: (() => {
                                  const quotedHours =
                                    toNum(data.hoursSummary.workHours) +
                                    toNum(data.hoursSummary.nonSovHours);
                                  const actualHours =
                                    toNum(data.hoursSummary.straightTimeHours) +
                                    toNum(data.hoursSummary.overtimeHours) +
                                    toNum(data.hoursSummary.doubleTimeHours);
                                  const difference = actualHours - quotedHours;
                                  if (difference > 0) return "#dc3545";
                                  if (difference < 0) return "#28a745";
                                  return "#6c757d";
                                })(),
                              }}
                            >
                              {(() => {
                                const quotedHours =
                                  toNum(data.hoursSummary.workHours) +
                                  toNum(data.hoursSummary.nonSovHours);
                                const actualHours =
                                  toNum(data.hoursSummary.straightTimeHours) +
                                  toNum(data.hoursSummary.overtimeHours) +
                                  toNum(data.hoursSummary.doubleTimeHours);
                                const difference = actualHours - quotedHours;
                                if (difference > 0)
                                  return `${difference} hours over`;
                                if (difference < 0)
                                  return `${Math.abs(difference)} hours remaining`;
                                return "Hours exact";
                              })()}
                            </div>
                            {!isViewMode && (
                            <button
                              onClick={() => {
                                setIsManualLaborHours(false);
                                const defaultHours =
                                  calculateDefaultLaborHours(data);
                                setData((prev) => ({
                                  ...prev,
                                  hoursSummary: {
                                    ...prev.hoursSummary,
                                    straightTimeHours:
                                      defaultHours.straightTime,
                                    overtimeHours: defaultHours.overtime,
                                    doubleTimeHours: defaultHours.doubleTime,
                                  },
                                }));
                                setIsDirty(true);
                              }}
                              style={{
                                padding: "4px 8px",
                                fontSize: "12px",
                                backgroundColor: "transparent",
                                color: "#f26722",
                                border: "0.5px solid #f26722",
                                borderRadius: "4px",
                                cursor: "pointer",
                              }}
                            >
                              Reset to Formula
                            </button>
                            )}
                          </div>
                        </div>
                        <table
                          style={{
                            ...styles.table,
                            width: "100%",
                            fontSize: "14px",
                          }}
                        >
                          <thead>
                            <tr>
                              <th
                                style={{
                                  ...styles.tableHeader,
                                  padding: "12px 8px",
                                }}
                              ></th>
                              <th
                                style={{
                                  ...styles.tableHeader,
                                  padding: "12px 8px",
                                }}
                              >
                                HOURS
                              </th>
                              <th
                                style={{
                                  ...styles.tableHeader,
                                  padding: "12px 8px",
                                }}
                              >
                                RATE
                              </th>
                              <th
                                style={{
                                  ...styles.tableHeader,
                                  padding: "12px 8px",
                                }}
                              >
                                AMOUNT
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  fontWeight: "bold",
                                  padding: "12px 8px",
                                  textAlign: "left",
                                }}
                              >
                                LABOR @ STRAIGHT TIME:
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  ...styles.calculated,
                                  padding: "12px 8px",
                                }}
                              >
                                <input
                                  type="number"
                                  step="0.01"
                                  style={{
                                    ...styles.tableInput,
                                    width: "100%",
                                  }}
                                  value={
                                    data.hoursSummary.straightTimeHours || ""
                                  }
                                  onChange={(e) =>
                                    handleHoursSummaryChange(
                                      "straightTimeHours",
                                      e.target.value,
                                    )
                                  }
                                  readOnly={isViewMode}
                                  placeholder="0"
                                />
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  ...styles.calculated,
                                  padding: "12px 8px",
                                }}
                              >
                                <input
                                  type="number"
                                  style={{
                                    ...styles.tableInput,
                                    width: "100%",
                                  }}
                                  value={hourlyRates.straightTime || ""}
                                  onChange={(e) => {
                                    setHourlyRates((prev) => ({
                                      ...prev,
                                      straightTime:
                                        parseFloat(e.target.value) || 0,
                                    }));
                                  }}
                                  step="0.01"
                                  min="0"
                                  readOnly={isViewMode}
                                  placeholder="240.00"
                                />
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  ...styles.calculated,
                                  padding: "12px 8px",
                                }}
                              >
                                {formatCurrency(
                                  toNum(data.hoursSummary.straightTimeHours) *
                                    hourlyRates.straightTime,
                                )}
                              </td>
                            </tr>
                            <tr>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  fontWeight: "bold",
                                  padding: "12px 8px",
                                  textAlign: "left",
                                }}
                              >
                                LABOR @ OVERTIME:
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  ...styles.calculated,
                                  padding: "12px 8px",
                                }}
                              >
                                <input
                                  type="number"
                                  step="0.01"
                                  style={{
                                    ...styles.tableInput,
                                    width: "100%",
                                  }}
                                  value={data.hoursSummary.overtimeHours || ""}
                                  onChange={(e) =>
                                    handleHoursSummaryChange(
                                      "overtimeHours",
                                      e.target.value,
                                    )
                                  }
                                  readOnly={isViewMode}
                                  placeholder="0"
                                />
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  ...styles.calculated,
                                  padding: "12px 8px",
                                }}
                              >
                                <input
                                  type="number"
                                  style={{
                                    ...styles.tableInput,
                                    width: "100%",
                                  }}
                                  value={hourlyRates.overtime || ""}
                                  onChange={(e) => {
                                    setHourlyRates((prev) => ({
                                      ...prev,
                                      overtime: parseFloat(e.target.value) || 0,
                                    }));
                                  }}
                                  step="0.01"
                                  min="0"
                                  readOnly={isViewMode}
                                  placeholder="360.00"
                                />
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  ...styles.calculated,
                                  padding: "12px 8px",
                                }}
                              >
                                {formatCurrency(
                                  toNum(data.hoursSummary.overtimeHours) *
                                    hourlyRates.overtime,
                                )}
                              </td>
                            </tr>
                            <tr>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  fontWeight: "bold",
                                  padding: "12px 8px",
                                  textAlign: "left",
                                }}
                              >
                                LABOR @ DOUBLE TIME:
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  ...styles.calculated,
                                  padding: "12px 8px",
                                }}
                              >
                                <input
                                  type="number"
                                  step="0.01"
                                  style={{
                                    ...styles.tableInput,
                                    width: "100%",
                                  }}
                                  value={
                                    data.hoursSummary.doubleTimeHours || ""
                                  }
                                  onChange={(e) =>
                                    handleHoursSummaryChange(
                                      "doubleTimeHours",
                                      e.target.value,
                                    )
                                  }
                                  readOnly={isViewMode}
                                  placeholder="0"
                                />
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  ...styles.calculated,
                                  padding: "12px 8px",
                                }}
                              >
                                <input
                                  type="number"
                                  style={{
                                    ...styles.tableInput,
                                    width: "100%",
                                  }}
                                  value={hourlyRates.doubleTime || ""}
                                  onChange={(e) => {
                                    setHourlyRates((prev) => ({
                                      ...prev,
                                      doubleTime:
                                        parseFloat(e.target.value) || 0,
                                    }));
                                  }}
                                  step="0.01"
                                  min="0"
                                  readOnly={isViewMode}
                                  placeholder="480.00"
                                />
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  ...styles.calculated,
                                  padding: "12px 8px",
                                }}
                              >
                                {formatCurrency(
                                  toNum(data.hoursSummary.doubleTimeHours) *
                                    hourlyRates.doubleTime,
                                )}
                              </td>
                            </tr>
                            {showTravel && (
                              <>
                                <tr>
                                  <td
                                    colSpan={4}
                                    style={{
                                      ...styles.tableCell,
                                      padding: "6px 8px",
                                      backgroundColor: "var(--header-bg)",
                                      fontWeight: "bold",
                                      textAlign: "left",
                                      fontSize: "12px",
                                    }}
                                  >
                                    TRAVEL LABOR
                                  </td>
                                </tr>
                                <tr>
                                  <td colSpan={4} style={{ padding: "0" }}>
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        padding: "8px 8px",
                                        backgroundColor: (() => {
                                          const quotedTravel = toNum(
                                            data.hoursSummary.travelHours,
                                          );
                                          const allocatedTravel =
                                            toNum(
                                              data.hoursSummary
                                                .travelStraightTimeHours,
                                            ) +
                                            toNum(
                                              data.hoursSummary
                                                .travelOvertimeHours,
                                            ) +
                                            toNum(
                                              data.hoursSummary
                                                .travelDoubleTimeHours,
                                            );
                                          const diff = Math.abs(
                                            allocatedTravel - quotedTravel,
                                          );
                                          if (diff < 0.01) return "#d4edda";
                                          return "#fff3cd";
                                        })(),
                                        borderRadius: "4px",
                                        margin: "4px 0",
                                        border: (() => {
                                          const quotedTravel = toNum(
                                            data.hoursSummary.travelHours,
                                          );
                                          const allocatedTravel =
                                            toNum(
                                              data.hoursSummary
                                                .travelStraightTimeHours,
                                            ) +
                                            toNum(
                                              data.hoursSummary
                                                .travelOvertimeHours,
                                            ) +
                                            toNum(
                                              data.hoursSummary
                                                .travelDoubleTimeHours,
                                            );
                                          const diff = Math.abs(
                                            allocatedTravel - quotedTravel,
                                          );
                                          if (diff < 0.01)
                                            return "1px solid #c3e6cb";
                                          return "1px solid #ffc107";
                                        })(),
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontSize: "12px",
                                          fontWeight: "bold",
                                          color: "#495057",
                                        }}
                                      >
                                        Travel Hours from Travel Section:{" "}
                                        {toNum(
                                          data.hoursSummary.travelHours,
                                        ).toFixed(2)}
                                      </div>
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "8px",
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize: "12px",
                                            fontWeight: "bold",
                                            color: (() => {
                                              const quotedTravel = toNum(
                                                data.hoursSummary.travelHours,
                                              );
                                              const allocatedTravel =
                                                toNum(
                                                  data.hoursSummary
                                                    .travelStraightTimeHours,
                                                ) +
                                                toNum(
                                                  data.hoursSummary
                                                    .travelOvertimeHours,
                                                ) +
                                                toNum(
                                                  data.hoursSummary
                                                    .travelDoubleTimeHours,
                                                );
                                              const diff = Math.abs(
                                                allocatedTravel - quotedTravel,
                                              );
                                              if (diff < 0.01) return "#28a745";
                                              return "#dc3545";
                                            })(),
                                          }}
                                        >
                                          {(() => {
                                            const quotedTravel = toNum(
                                              data.hoursSummary.travelHours,
                                            );
                                            const allocatedTravel =
                                              toNum(
                                                data.hoursSummary
                                                  .travelStraightTimeHours,
                                              ) +
                                              toNum(
                                                data.hoursSummary
                                                  .travelOvertimeHours,
                                              ) +
                                              toNum(
                                                data.hoursSummary
                                                  .travelDoubleTimeHours,
                                              );
                                            const diff =
                                              allocatedTravel - quotedTravel;
                                            if (Math.abs(diff) < 0.01)
                                              return "Travel hours match";
                                            if (diff > 0)
                                              return `${diff.toFixed(2)} hours over`;
                                            return `${Math.abs(diff).toFixed(2)} hours not allocated — will not be charged!`;
                                          })()}
                                        </div>
                                        {isManualTravelLaborHours &&
                                          !isViewMode && (
                                          <button
                                            onClick={() => {
                                              setIsManualTravelLaborHours(
                                                false,
                                              );
                                              const totalTravel = toNum(
                                                data.hoursSummary.travelHours,
                                              );
                                              setData((prev) => ({
                                                ...prev,
                                                hoursSummary: {
                                                  ...prev.hoursSummary,
                                                  travelStraightTimeHours:
                                                    totalTravel,
                                                  travelOvertimeHours: 0,
                                                  travelDoubleTimeHours: 0,
                                                },
                                              }));
                                              setIsDirty(true);
                                            }}
                                            style={{
                                              padding: "2px 6px",
                                              fontSize: "11px",
                                              backgroundColor: "transparent",
                                              color: "#f26722",
                                              border: "0.5px solid #f26722",
                                              borderRadius: "4px",
                                              cursor: "pointer",
                                            }}
                                          >
                                            Reset Travel Hours
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                                <tr>
                                  <td
                                    style={{
                                      ...styles.tableCell,
                                      fontWeight: "bold",
                                      padding: "12px 8px",
                                      textAlign: "left",
                                    }}
                                  >
                                    TRAVEL @ STRAIGHT TIME:
                                  </td>
                                  <td
                                    style={{
                                      ...styles.tableCell,
                                      ...styles.calculated,
                                      padding: "12px 8px",
                                    }}
                                  >
                                    <input
                                      type="number"
                                      step="0.01"
                                      style={{
                                        ...styles.tableInput,
                                        width: "100%",
                                      }}
                                      value={
                                        data.hoursSummary
                                          .travelStraightTimeHours || ""
                                      }
                                      onChange={(e) =>
                                        handleHoursSummaryChange(
                                          "travelStraightTimeHours",
                                          e.target.value,
                                        )
                                      }
                                      readOnly={isViewMode}
                                      placeholder="0"
                                    />
                                  </td>
                                  <td
                                    style={{
                                      ...styles.tableCell,
                                      ...styles.calculated,
                                      padding: "12px 8px",
                                    }}
                                  >
                                    {formatCurrency(hourlyRates.straightTime)}
                                  </td>
                                  <td
                                    style={{
                                      ...styles.tableCell,
                                      ...styles.calculated,
                                      padding: "12px 8px",
                                    }}
                                  >
                                    {formatCurrency(
                                      toNum(
                                        data.hoursSummary
                                          .travelStraightTimeHours,
                                      ) * hourlyRates.straightTime,
                                    )}
                                  </td>
                                </tr>
                                <tr>
                                  <td
                                    style={{
                                      ...styles.tableCell,
                                      fontWeight: "bold",
                                      padding: "12px 8px",
                                      textAlign: "left",
                                    }}
                                  >
                                    TRAVEL @ OVERTIME:
                                  </td>
                                  <td
                                    style={{
                                      ...styles.tableCell,
                                      ...styles.calculated,
                                      padding: "12px 8px",
                                    }}
                                  >
                                    <input
                                      type="number"
                                      step="0.01"
                                      style={{
                                        ...styles.tableInput,
                                        width: "100%",
                                      }}
                                      value={
                                        data.hoursSummary.travelOvertimeHours ||
                                        ""
                                      }
                                      onChange={(e) =>
                                        handleHoursSummaryChange(
                                          "travelOvertimeHours",
                                          e.target.value,
                                        )
                                      }
                                      readOnly={isViewMode}
                                      placeholder="0"
                                    />
                                  </td>
                                  <td
                                    style={{
                                      ...styles.tableCell,
                                      ...styles.calculated,
                                      padding: "12px 8px",
                                    }}
                                  >
                                    {formatCurrency(hourlyRates.overtime)}
                                  </td>
                                  <td
                                    style={{
                                      ...styles.tableCell,
                                      ...styles.calculated,
                                      padding: "12px 8px",
                                    }}
                                  >
                                    {formatCurrency(
                                      toNum(
                                        data.hoursSummary.travelOvertimeHours,
                                      ) * hourlyRates.overtime,
                                    )}
                                  </td>
                                </tr>
                                <tr>
                                  <td
                                    style={{
                                      ...styles.tableCell,
                                      fontWeight: "bold",
                                      padding: "12px 8px",
                                      textAlign: "left",
                                    }}
                                  >
                                    TRAVEL @ DOUBLE TIME:
                                  </td>
                                  <td
                                    style={{
                                      ...styles.tableCell,
                                      ...styles.calculated,
                                      padding: "12px 8px",
                                    }}
                                  >
                                    <input
                                      type="number"
                                      step="0.01"
                                      style={{
                                        ...styles.tableInput,
                                        width: "100%",
                                      }}
                                      value={
                                        data.hoursSummary
                                          .travelDoubleTimeHours || ""
                                      }
                                      onChange={(e) =>
                                        handleHoursSummaryChange(
                                          "travelDoubleTimeHours",
                                          e.target.value,
                                        )
                                      }
                                      readOnly={isViewMode}
                                      placeholder="0"
                                    />
                                  </td>
                                  <td
                                    style={{
                                      ...styles.tableCell,
                                      ...styles.calculated,
                                      padding: "12px 8px",
                                    }}
                                  >
                                    {formatCurrency(hourlyRates.doubleTime)}
                                  </td>
                                  <td
                                    style={{
                                      ...styles.tableCell,
                                      ...styles.calculated,
                                      padding: "12px 8px",
                                    }}
                                  >
                                    {formatCurrency(
                                      toNum(
                                        data.hoursSummary.travelDoubleTimeHours,
                                      ) * hourlyRates.doubleTime,
                                    )}
                                  </td>
                                </tr>
                              </>
                            )}
                            <tr style={{ ...styles.tfoot }}>
                              <td
                                colSpan={3}
                                style={{
                                  ...styles.tableCell,
                                  textAlign: "right",
                                  fontWeight: "bold",
                                  padding: "12px 8px",
                                }}
                              >
                                Total:
                              </td>
                              <td
                                style={{
                                  ...styles.tableCell,
                                  ...styles.calculated,
                                  fontWeight: "bold",
                                  padding: "12px 8px",
                                }}
                              >
                                {formatCurrency(
                                  getWorkLaborCost() + getTravelLaborCost(),
                                )}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      {/* Saturday Labor Hours Tracking */}
                      {showSaturdayHours && (
                        <div
                          style={styles.panelBlock}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "15px",
                            }}
                          >
                            <h3
                              style={{
                                ...styles.panelTitle,
                                marginBottom: 0,
                                color: "#f26722",
                              }}
                            >
                              Labor Hours Tracking — Saturday
                            </h3>
                            <button
                              onClick={() => {
                                setData((prev) => ({
                                  ...prev,
                                  saturdayHoursSummary: {
                                    straightTimeHours: toNum(
                                      prev.hoursSummary.straightTimeHours,
                                    ),
                                    overtimeHours: toNum(
                                      prev.hoursSummary.overtimeHours,
                                    ),
                                    doubleTimeHours: toNum(
                                      prev.hoursSummary.doubleTimeHours,
                                    ),
                                    travelStraightTimeHours: toNum(
                                      prev.hoursSummary.travelStraightTimeHours,
                                    ),
                                    travelOvertimeHours: toNum(
                                      prev.hoursSummary.travelOvertimeHours,
                                    ),
                                    travelDoubleTimeHours: toNum(
                                      prev.hoursSummary.travelDoubleTimeHours,
                                    ),
                                  },
                                }));
                                setIsManualSaturdayHours(true);
                                setIsDirty(true);
                              }}
                              style={{
                                padding: "4px 8px",
                                fontSize: "12px",
                                backgroundColor: "transparent",
                                color: "#f26722",
                                border: "0.5px solid #f26722",
                                borderRadius: "4px",
                                cursor: "pointer",
                              }}
                            >
                              Copy from M-F
                            </button>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginBottom: "15px",
                              padding: "10px",
                              backgroundColor: "#fff3cd",
                              borderRadius: "4px",
                              border: "1px solid #ffc107",
                            }}
                          >
                            <div
                              style={{ fontWeight: "bold", color: "#856404" }}
                            >
                              Work Hours Quoted:{" "}
                              {toNum(data.hoursSummary.workHours) +
                                toNum(data.hoursSummary.nonSovHours)}
                            </div>
                            <div
                              style={{
                                fontWeight: "bold",
                                color: (() => {
                                  const quotedHours =
                                    toNum(data.hoursSummary.workHours) +
                                    toNum(data.hoursSummary.nonSovHours);
                                  const sat = data.saturdayHoursSummary || {
                                    straightTimeHours: 0,
                                    overtimeHours: 0,
                                    doubleTimeHours: 0,
                                  };
                                  const actualHours =
                                    toNum(sat.straightTimeHours) +
                                    toNum(sat.overtimeHours) +
                                    toNum(sat.doubleTimeHours);
                                  const diff = actualHours - quotedHours;
                                  if (diff > 0) return "#dc3545";
                                  if (diff < 0) return "#28a745";
                                  return "#6c757d";
                                })(),
                              }}
                            >
                              {(() => {
                                const quotedHours =
                                  toNum(data.hoursSummary.workHours) +
                                  toNum(data.hoursSummary.nonSovHours);
                                const sat = data.saturdayHoursSummary || {
                                  straightTimeHours: 0,
                                  overtimeHours: 0,
                                  doubleTimeHours: 0,
                                };
                                const actualHours =
                                  toNum(sat.straightTimeHours) +
                                  toNum(sat.overtimeHours) +
                                  toNum(sat.doubleTimeHours);
                                const diff = actualHours - quotedHours;
                                if (diff > 0) return `${diff} hours over`;
                                if (diff < 0)
                                  return `${Math.abs(diff)} hours remaining`;
                                return "Hours exact";
                              })()}
                            </div>
                          </div>
                          <table
                            style={{
                              ...styles.table,
                              width: "100%",
                              fontSize: "14px",
                            }}
                          >
                            <thead>
                              <tr>
                                <th
                                  style={{
                                    ...styles.tableHeader,
                                    padding: "12px 8px",
                                  }}
                                ></th>
                                <th
                                  style={{
                                    ...styles.tableHeader,
                                    padding: "12px 8px",
                                  }}
                                >
                                  HOURS
                                </th>
                                <th
                                  style={{
                                    ...styles.tableHeader,
                                    padding: "12px 8px",
                                  }}
                                >
                                  RATE
                                </th>
                                <th
                                  style={{
                                    ...styles.tableHeader,
                                    padding: "12px 8px",
                                  }}
                                >
                                  AMOUNT
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    fontWeight: "bold",
                                    padding: "12px 8px",
                                    textAlign: "left",
                                  }}
                                >
                                  LABOR @ STRAIGHT TIME:
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                    padding: "12px 8px",
                                  }}
                                >
                                  <input
                                    type="number"
                                    step="0.01"
                                    style={{
                                      ...styles.tableInput,
                                      width: "100%",
                                    }}
                                    value={
                                      data.saturdayHoursSummary
                                        ?.straightTimeHours || ""
                                    }
                                    onChange={(e) =>
                                      handleSaturdayHoursChange(
                                        "straightTimeHours",
                                        e.target.value,
                                      )
                                    }
                                    readOnly={isViewMode}
                                    placeholder="0"
                                  />
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                    padding: "12px 8px",
                                  }}
                                >
                                  {formatCurrency(hourlyRates.straightTime)}
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                    padding: "12px 8px",
                                  }}
                                >
                                  {formatCurrency(
                                    toNum(
                                      data.saturdayHoursSummary
                                        ?.straightTimeHours,
                                    ) * hourlyRates.straightTime,
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    fontWeight: "bold",
                                    padding: "12px 8px",
                                    textAlign: "left",
                                  }}
                                >
                                  LABOR @ OVERTIME:
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                    padding: "12px 8px",
                                  }}
                                >
                                  <input
                                    type="number"
                                    step="0.01"
                                    style={{
                                      ...styles.tableInput,
                                      width: "100%",
                                    }}
                                    value={
                                      data.saturdayHoursSummary
                                        ?.overtimeHours || ""
                                    }
                                    onChange={(e) =>
                                      handleSaturdayHoursChange(
                                        "overtimeHours",
                                        e.target.value,
                                      )
                                    }
                                    readOnly={isViewMode}
                                    placeholder="0"
                                  />
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                    padding: "12px 8px",
                                  }}
                                >
                                  {formatCurrency(hourlyRates.overtime)}
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                    padding: "12px 8px",
                                  }}
                                >
                                  {formatCurrency(
                                    toNum(
                                      data.saturdayHoursSummary?.overtimeHours,
                                    ) * hourlyRates.overtime,
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    fontWeight: "bold",
                                    padding: "12px 8px",
                                    textAlign: "left",
                                  }}
                                >
                                  LABOR @ DOUBLE TIME:
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                    padding: "12px 8px",
                                  }}
                                >
                                  <input
                                    type="number"
                                    step="0.01"
                                    style={{
                                      ...styles.tableInput,
                                      width: "100%",
                                    }}
                                    value={
                                      data.saturdayHoursSummary
                                        ?.doubleTimeHours || ""
                                    }
                                    onChange={(e) =>
                                      handleSaturdayHoursChange(
                                        "doubleTimeHours",
                                        e.target.value,
                                      )
                                    }
                                    readOnly={isViewMode}
                                    placeholder="0"
                                  />
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                    padding: "12px 8px",
                                  }}
                                >
                                  {formatCurrency(hourlyRates.doubleTime)}
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                    padding: "12px 8px",
                                  }}
                                >
                                  {formatCurrency(
                                    toNum(
                                      data.saturdayHoursSummary
                                        ?.doubleTimeHours,
                                    ) * hourlyRates.doubleTime,
                                  )}
                                </td>
                              </tr>
                              {showTravel && (
                                <>
                                  <tr>
                                    <td
                                      colSpan={4}
                                      style={{
                                        ...styles.tableCell,
                                        padding: "6px 8px",
                                        backgroundColor: "var(--header-bg)",
                                        fontWeight: "bold",
                                        textAlign: "left",
                                        fontSize: "12px",
                                      }}
                                    >
                                      TRAVEL LABOR
                                    </td>
                                  </tr>
                                  <tr>
                                    <td colSpan={4} style={{ padding: "0" }}>
                                      <div
                                        style={{
                                          display: "flex",
                                          justifyContent: "space-between",
                                          alignItems: "center",
                                          padding: "8px 8px",
                                          backgroundColor: (() => {
                                            const quotedTravel = toNum(
                                              data.hoursSummary.travelHours,
                                            );
                                            const sat =
                                              data.saturdayHoursSummary || {
                                                travelStraightTimeHours: 0,
                                                travelOvertimeHours: 0,
                                                travelDoubleTimeHours: 0,
                                              };
                                            const allocatedTravel =
                                              toNum(
                                                sat.travelStraightTimeHours,
                                              ) +
                                              toNum(sat.travelOvertimeHours) +
                                              toNum(sat.travelDoubleTimeHours);
                                            const diff = Math.abs(
                                              allocatedTravel - quotedTravel,
                                            );
                                            if (diff < 0.01) return "#d4edda";
                                            return "#fff3cd";
                                          })(),
                                          borderRadius: "4px",
                                          margin: "4px 0",
                                          border: (() => {
                                            const quotedTravel = toNum(
                                              data.hoursSummary.travelHours,
                                            );
                                            const sat =
                                              data.saturdayHoursSummary || {
                                                travelStraightTimeHours: 0,
                                                travelOvertimeHours: 0,
                                                travelDoubleTimeHours: 0,
                                              };
                                            const allocatedTravel =
                                              toNum(
                                                sat.travelStraightTimeHours,
                                              ) +
                                              toNum(sat.travelOvertimeHours) +
                                              toNum(sat.travelDoubleTimeHours);
                                            const diff = Math.abs(
                                              allocatedTravel - quotedTravel,
                                            );
                                            if (diff < 0.01)
                                              return "1px solid #c3e6cb";
                                            return "1px solid #ffc107";
                                          })(),
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize: "12px",
                                            fontWeight: "bold",
                                            color: "#495057",
                                          }}
                                        >
                                          Travel Hours from Travel Section:{" "}
                                          {toNum(
                                            data.hoursSummary.travelHours,
                                          ).toFixed(2)}
                                        </div>
                                        <div
                                          style={{
                                            fontSize: "12px",
                                            fontWeight: "bold",
                                            color: (() => {
                                              const quotedTravel = toNum(
                                                data.hoursSummary.travelHours,
                                              );
                                              const sat =
                                                data.saturdayHoursSummary || {
                                                  travelStraightTimeHours: 0,
                                                  travelOvertimeHours: 0,
                                                  travelDoubleTimeHours: 0,
                                                };
                                              const allocatedTravel =
                                                toNum(
                                                  sat.travelStraightTimeHours,
                                                ) +
                                                toNum(sat.travelOvertimeHours) +
                                                toNum(
                                                  sat.travelDoubleTimeHours,
                                                );
                                              const diff = Math.abs(
                                                allocatedTravel - quotedTravel,
                                              );
                                              if (diff < 0.01) return "#28a745";
                                              return "#dc3545";
                                            })(),
                                          }}
                                        >
                                          {(() => {
                                            const quotedTravel = toNum(
                                              data.hoursSummary.travelHours,
                                            );
                                            const sat =
                                              data.saturdayHoursSummary || {
                                                travelStraightTimeHours: 0,
                                                travelOvertimeHours: 0,
                                                travelDoubleTimeHours: 0,
                                              };
                                            const allocatedTravel =
                                              toNum(
                                                sat.travelStraightTimeHours,
                                              ) +
                                              toNum(sat.travelOvertimeHours) +
                                              toNum(sat.travelDoubleTimeHours);
                                            const diff =
                                              allocatedTravel - quotedTravel;
                                            if (Math.abs(diff) < 0.01)
                                              return "Travel hours match";
                                            if (diff > 0)
                                              return `${diff.toFixed(2)} hours over`;
                                            return `${Math.abs(diff).toFixed(2)} hours not allocated — will not be charged!`;
                                          })()}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                  <tr>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        fontWeight: "bold",
                                        padding: "12px 8px",
                                        textAlign: "left",
                                      }}
                                    >
                                      TRAVEL @ STRAIGHT TIME:
                                    </td>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        ...styles.calculated,
                                        padding: "12px 8px",
                                      }}
                                    >
                                      <input
                                        type="number"
                                        step="0.01"
                                        style={{
                                          ...styles.tableInput,
                                          width: "100%",
                                        }}
                                        value={
                                          data.saturdayHoursSummary
                                            ?.travelStraightTimeHours || ""
                                        }
                                        onChange={(e) =>
                                          handleSaturdayHoursChange(
                                            "travelStraightTimeHours",
                                            e.target.value,
                                          )
                                        }
                                        readOnly={isViewMode}
                                        placeholder="0"
                                      />
                                    </td>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        ...styles.calculated,
                                        padding: "12px 8px",
                                      }}
                                    >
                                      {formatCurrency(hourlyRates.straightTime)}
                                    </td>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        ...styles.calculated,
                                        padding: "12px 8px",
                                      }}
                                    >
                                      {formatCurrency(
                                        toNum(
                                          data.saturdayHoursSummary
                                            ?.travelStraightTimeHours,
                                        ) * hourlyRates.straightTime,
                                      )}
                                    </td>
                                  </tr>
                                  <tr>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        fontWeight: "bold",
                                        padding: "12px 8px",
                                        textAlign: "left",
                                      }}
                                    >
                                      TRAVEL @ OVERTIME:
                                    </td>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        ...styles.calculated,
                                        padding: "12px 8px",
                                      }}
                                    >
                                      <input
                                        type="number"
                                        step="0.01"
                                        style={{
                                          ...styles.tableInput,
                                          width: "100%",
                                        }}
                                        value={
                                          data.saturdayHoursSummary
                                            ?.travelOvertimeHours || ""
                                        }
                                        onChange={(e) =>
                                          handleSaturdayHoursChange(
                                            "travelOvertimeHours",
                                            e.target.value,
                                          )
                                        }
                                        readOnly={isViewMode}
                                        placeholder="0"
                                      />
                                    </td>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        ...styles.calculated,
                                        padding: "12px 8px",
                                      }}
                                    >
                                      {formatCurrency(hourlyRates.overtime)}
                                    </td>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        ...styles.calculated,
                                        padding: "12px 8px",
                                      }}
                                    >
                                      {formatCurrency(
                                        toNum(
                                          data.saturdayHoursSummary
                                            ?.travelOvertimeHours,
                                        ) * hourlyRates.overtime,
                                      )}
                                    </td>
                                  </tr>
                                  <tr>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        fontWeight: "bold",
                                        padding: "12px 8px",
                                        textAlign: "left",
                                      }}
                                    >
                                      TRAVEL @ DOUBLE TIME:
                                    </td>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        ...styles.calculated,
                                        padding: "12px 8px",
                                      }}
                                    >
                                      <input
                                        type="number"
                                        step="0.01"
                                        style={{
                                          ...styles.tableInput,
                                          width: "100%",
                                        }}
                                        value={
                                          data.saturdayHoursSummary
                                            ?.travelDoubleTimeHours || ""
                                        }
                                        onChange={(e) =>
                                          handleSaturdayHoursChange(
                                            "travelDoubleTimeHours",
                                            e.target.value,
                                          )
                                        }
                                        readOnly={isViewMode}
                                        placeholder="0"
                                      />
                                    </td>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        ...styles.calculated,
                                        padding: "12px 8px",
                                      }}
                                    >
                                      {formatCurrency(hourlyRates.doubleTime)}
                                    </td>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        ...styles.calculated,
                                        padding: "12px 8px",
                                      }}
                                    >
                                      {formatCurrency(
                                        toNum(
                                          data.saturdayHoursSummary
                                            ?.travelDoubleTimeHours,
                                        ) * hourlyRates.doubleTime,
                                      )}
                                    </td>
                                  </tr>
                                </>
                              )}
                              <tr style={{ ...styles.tfoot }}>
                                <td
                                  colSpan={3}
                                  style={{
                                    ...styles.tableCell,
                                    textAlign: "right",
                                    fontWeight: "bold",
                                    padding: "12px 8px",
                                  }}
                                >
                                  Total:
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                    fontWeight: "bold",
                                    padding: "12px 8px",
                                  }}
                                >
                                  {formatCurrency(
                                    (() => {
                                      const sat = data.saturdayHoursSummary || {
                                        straightTimeHours: 0,
                                        overtimeHours: 0,
                                        doubleTimeHours: 0,
                                        travelStraightTimeHours: 0,
                                        travelOvertimeHours: 0,
                                        travelDoubleTimeHours: 0,
                                      };
                                      return (
                                        toNum(sat.straightTimeHours) *
                                          hourlyRates.straightTime +
                                        toNum(sat.overtimeHours) *
                                          hourlyRates.overtime +
                                        toNum(sat.doubleTimeHours) *
                                          hourlyRates.doubleTime +
                                        toNum(sat.travelStraightTimeHours) *
                                          hourlyRates.straightTime +
                                        toNum(sat.travelOvertimeHours) *
                                          hourlyRates.overtime +
                                        toNum(sat.travelDoubleTimeHours) *
                                          hourlyRates.doubleTime
                                      );
                                    })(),
                                  )}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                      {/* Sunday/Holiday Labor Hours Tracking */}
                      {showSundayHours && (
                        <div
                          style={styles.panelBlock}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "15px",
                            }}
                          >
                            <h3
                              style={{
                                ...styles.panelTitle,
                                marginBottom: 0,
                                color: "#dc3545",
                              }}
                            >
                              Labor Hours Tracking — Sunday / Holiday
                            </h3>
                            <button
                              onClick={() => {
                                setData((prev) => ({
                                  ...prev,
                                  sundayHoursSummary: {
                                    straightTimeHours: toNum(
                                      prev.hoursSummary.straightTimeHours,
                                    ),
                                    overtimeHours: toNum(
                                      prev.hoursSummary.overtimeHours,
                                    ),
                                    doubleTimeHours: toNum(
                                      prev.hoursSummary.doubleTimeHours,
                                    ),
                                    travelStraightTimeHours: toNum(
                                      prev.hoursSummary.travelStraightTimeHours,
                                    ),
                                    travelOvertimeHours: toNum(
                                      prev.hoursSummary.travelOvertimeHours,
                                    ),
                                    travelDoubleTimeHours: toNum(
                                      prev.hoursSummary.travelDoubleTimeHours,
                                    ),
                                  },
                                }));
                                setIsManualSundayHours(true);
                                setIsDirty(true);
                              }}
                              style={{
                                padding: "4px 8px",
                                fontSize: "12px",
                                backgroundColor: "transparent",
                                color: "#f26722",
                                border: "0.5px solid #f26722",
                                borderRadius: "4px",
                                cursor: "pointer",
                              }}
                            >
                              Copy from M-F
                            </button>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginBottom: "15px",
                              padding: "10px",
                              backgroundColor: "#f8d7da",
                              borderRadius: "4px",
                              border: "1px solid #f5c6cb",
                            }}
                          >
                            <div
                              style={{ fontWeight: "bold", color: "#721c24" }}
                            >
                              Work Hours Quoted:{" "}
                              {toNum(data.hoursSummary.workHours) +
                                toNum(data.hoursSummary.nonSovHours)}
                            </div>
                            <div
                              style={{
                                fontWeight: "bold",
                                color: (() => {
                                  const quotedHours =
                                    toNum(data.hoursSummary.workHours) +
                                    toNum(data.hoursSummary.nonSovHours);
                                  const sun = data.sundayHoursSummary || {
                                    straightTimeHours: 0,
                                    overtimeHours: 0,
                                    doubleTimeHours: 0,
                                  };
                                  const actualHours =
                                    toNum(sun.straightTimeHours) +
                                    toNum(sun.overtimeHours) +
                                    toNum(sun.doubleTimeHours);
                                  const diff = actualHours - quotedHours;
                                  if (diff > 0) return "#dc3545";
                                  if (diff < 0) return "#28a745";
                                  return "#6c757d";
                                })(),
                              }}
                            >
                              {(() => {
                                const quotedHours =
                                  toNum(data.hoursSummary.workHours) +
                                  toNum(data.hoursSummary.nonSovHours);
                                const sun = data.sundayHoursSummary || {
                                  straightTimeHours: 0,
                                  overtimeHours: 0,
                                  doubleTimeHours: 0,
                                };
                                const actualHours =
                                  toNum(sun.straightTimeHours) +
                                  toNum(sun.overtimeHours) +
                                  toNum(sun.doubleTimeHours);
                                const diff = actualHours - quotedHours;
                                if (diff > 0) return `${diff} hours over`;
                                if (diff < 0)
                                  return `${Math.abs(diff)} hours remaining`;
                                return "Hours exact";
                              })()}
                            </div>
                          </div>
                          <table
                            style={{
                              ...styles.table,
                              width: "100%",
                              fontSize: "14px",
                            }}
                          >
                            <thead>
                              <tr>
                                <th
                                  style={{
                                    ...styles.tableHeader,
                                    padding: "12px 8px",
                                  }}
                                ></th>
                                <th
                                  style={{
                                    ...styles.tableHeader,
                                    padding: "12px 8px",
                                  }}
                                >
                                  HOURS
                                </th>
                                <th
                                  style={{
                                    ...styles.tableHeader,
                                    padding: "12px 8px",
                                  }}
                                >
                                  RATE
                                </th>
                                <th
                                  style={{
                                    ...styles.tableHeader,
                                    padding: "12px 8px",
                                  }}
                                >
                                  AMOUNT
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    fontWeight: "bold",
                                    padding: "12px 8px",
                                    textAlign: "left",
                                  }}
                                >
                                  LABOR @ STRAIGHT TIME:
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                    padding: "12px 8px",
                                  }}
                                >
                                  <input
                                    type="number"
                                    step="0.01"
                                    style={{
                                      ...styles.tableInput,
                                      width: "100%",
                                    }}
                                    value={
                                      data.sundayHoursSummary
                                        ?.straightTimeHours || ""
                                    }
                                    onChange={(e) =>
                                      handleSundayHoursChange(
                                        "straightTimeHours",
                                        e.target.value,
                                      )
                                    }
                                    readOnly={isViewMode}
                                    placeholder="0"
                                  />
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                    padding: "12px 8px",
                                  }}
                                >
                                  {formatCurrency(hourlyRates.straightTime)}
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                    padding: "12px 8px",
                                  }}
                                >
                                  {formatCurrency(
                                    toNum(
                                      data.sundayHoursSummary
                                        ?.straightTimeHours,
                                    ) * hourlyRates.straightTime,
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    fontWeight: "bold",
                                    padding: "12px 8px",
                                    textAlign: "left",
                                  }}
                                >
                                  LABOR @ OVERTIME:
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                    padding: "12px 8px",
                                  }}
                                >
                                  <input
                                    type="number"
                                    step="0.01"
                                    style={{
                                      ...styles.tableInput,
                                      width: "100%",
                                    }}
                                    value={
                                      data.sundayHoursSummary?.overtimeHours ||
                                      ""
                                    }
                                    onChange={(e) =>
                                      handleSundayHoursChange(
                                        "overtimeHours",
                                        e.target.value,
                                      )
                                    }
                                    readOnly={isViewMode}
                                    placeholder="0"
                                  />
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                    padding: "12px 8px",
                                  }}
                                >
                                  {formatCurrency(hourlyRates.overtime)}
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                    padding: "12px 8px",
                                  }}
                                >
                                  {formatCurrency(
                                    toNum(
                                      data.sundayHoursSummary?.overtimeHours,
                                    ) * hourlyRates.overtime,
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    fontWeight: "bold",
                                    padding: "12px 8px",
                                    textAlign: "left",
                                  }}
                                >
                                  LABOR @ DOUBLE TIME:
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                    padding: "12px 8px",
                                  }}
                                >
                                  <input
                                    type="number"
                                    step="0.01"
                                    style={{
                                      ...styles.tableInput,
                                      width: "100%",
                                    }}
                                    value={
                                      data.sundayHoursSummary
                                        ?.doubleTimeHours || ""
                                    }
                                    onChange={(e) =>
                                      handleSundayHoursChange(
                                        "doubleTimeHours",
                                        e.target.value,
                                      )
                                    }
                                    readOnly={isViewMode}
                                    placeholder="0"
                                  />
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                    padding: "12px 8px",
                                  }}
                                >
                                  {formatCurrency(hourlyRates.doubleTime)}
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                    padding: "12px 8px",
                                  }}
                                >
                                  {formatCurrency(
                                    toNum(
                                      data.sundayHoursSummary?.doubleTimeHours,
                                    ) * hourlyRates.doubleTime,
                                  )}
                                </td>
                              </tr>
                              {showTravel && (
                                <>
                                  <tr>
                                    <td
                                      colSpan={4}
                                      style={{
                                        ...styles.tableCell,
                                        padding: "6px 8px",
                                        backgroundColor: "var(--header-bg)",
                                        fontWeight: "bold",
                                        textAlign: "left",
                                        fontSize: "12px",
                                      }}
                                    >
                                      TRAVEL LABOR
                                    </td>
                                  </tr>
                                  <tr>
                                    <td colSpan={4} style={{ padding: "0" }}>
                                      <div
                                        style={{
                                          display: "flex",
                                          justifyContent: "space-between",
                                          alignItems: "center",
                                          padding: "8px 8px",
                                          backgroundColor: (() => {
                                            const quotedTravel = toNum(
                                              data.hoursSummary.travelHours,
                                            );
                                            const sun =
                                              data.sundayHoursSummary || {
                                                travelStraightTimeHours: 0,
                                                travelOvertimeHours: 0,
                                                travelDoubleTimeHours: 0,
                                              };
                                            const allocatedTravel =
                                              toNum(
                                                sun.travelStraightTimeHours,
                                              ) +
                                              toNum(sun.travelOvertimeHours) +
                                              toNum(sun.travelDoubleTimeHours);
                                            const diff = Math.abs(
                                              allocatedTravel - quotedTravel,
                                            );
                                            if (diff < 0.01) return "#d4edda";
                                            return "#fff3cd";
                                          })(),
                                          borderRadius: "4px",
                                          margin: "4px 0",
                                          border: (() => {
                                            const quotedTravel = toNum(
                                              data.hoursSummary.travelHours,
                                            );
                                            const sun =
                                              data.sundayHoursSummary || {
                                                travelStraightTimeHours: 0,
                                                travelOvertimeHours: 0,
                                                travelDoubleTimeHours: 0,
                                              };
                                            const allocatedTravel =
                                              toNum(
                                                sun.travelStraightTimeHours,
                                              ) +
                                              toNum(sun.travelOvertimeHours) +
                                              toNum(sun.travelDoubleTimeHours);
                                            const diff = Math.abs(
                                              allocatedTravel - quotedTravel,
                                            );
                                            if (diff < 0.01)
                                              return "1px solid #c3e6cb";
                                            return "1px solid #ffc107";
                                          })(),
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize: "12px",
                                            fontWeight: "bold",
                                            color: "#495057",
                                          }}
                                        >
                                          Travel Hours from Travel Section:{" "}
                                          {toNum(
                                            data.hoursSummary.travelHours,
                                          ).toFixed(2)}
                                        </div>
                                        <div
                                          style={{
                                            fontSize: "12px",
                                            fontWeight: "bold",
                                            color: (() => {
                                              const quotedTravel = toNum(
                                                data.hoursSummary.travelHours,
                                              );
                                              const sun =
                                                data.sundayHoursSummary || {
                                                  travelStraightTimeHours: 0,
                                                  travelOvertimeHours: 0,
                                                  travelDoubleTimeHours: 0,
                                                };
                                              const allocatedTravel =
                                                toNum(
                                                  sun.travelStraightTimeHours,
                                                ) +
                                                toNum(sun.travelOvertimeHours) +
                                                toNum(
                                                  sun.travelDoubleTimeHours,
                                                );
                                              const diff = Math.abs(
                                                allocatedTravel - quotedTravel,
                                              );
                                              if (diff < 0.01) return "#28a745";
                                              return "#dc3545";
                                            })(),
                                          }}
                                        >
                                          {(() => {
                                            const quotedTravel = toNum(
                                              data.hoursSummary.travelHours,
                                            );
                                            const sun =
                                              data.sundayHoursSummary || {
                                                travelStraightTimeHours: 0,
                                                travelOvertimeHours: 0,
                                                travelDoubleTimeHours: 0,
                                              };
                                            const allocatedTravel =
                                              toNum(
                                                sun.travelStraightTimeHours,
                                              ) +
                                              toNum(sun.travelOvertimeHours) +
                                              toNum(sun.travelDoubleTimeHours);
                                            const diff =
                                              allocatedTravel - quotedTravel;
                                            if (Math.abs(diff) < 0.01)
                                              return "Travel hours match";
                                            if (diff > 0)
                                              return `${diff.toFixed(2)} hours over`;
                                            return `${Math.abs(diff).toFixed(2)} hours not allocated — will not be charged!`;
                                          })()}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                  <tr>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        fontWeight: "bold",
                                        padding: "12px 8px",
                                        textAlign: "left",
                                      }}
                                    >
                                      TRAVEL @ STRAIGHT TIME:
                                    </td>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        ...styles.calculated,
                                        padding: "12px 8px",
                                      }}
                                    >
                                      <input
                                        type="number"
                                        step="0.01"
                                        style={{
                                          ...styles.tableInput,
                                          width: "100%",
                                        }}
                                        value={
                                          data.sundayHoursSummary
                                            ?.travelStraightTimeHours || ""
                                        }
                                        onChange={(e) =>
                                          handleSundayHoursChange(
                                            "travelStraightTimeHours",
                                            e.target.value,
                                          )
                                        }
                                        readOnly={isViewMode}
                                        placeholder="0"
                                      />
                                    </td>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        ...styles.calculated,
                                        padding: "12px 8px",
                                      }}
                                    >
                                      {formatCurrency(hourlyRates.straightTime)}
                                    </td>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        ...styles.calculated,
                                        padding: "12px 8px",
                                      }}
                                    >
                                      {formatCurrency(
                                        toNum(
                                          data.sundayHoursSummary
                                            ?.travelStraightTimeHours,
                                        ) * hourlyRates.straightTime,
                                      )}
                                    </td>
                                  </tr>
                                  <tr>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        fontWeight: "bold",
                                        padding: "12px 8px",
                                        textAlign: "left",
                                      }}
                                    >
                                      TRAVEL @ OVERTIME:
                                    </td>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        ...styles.calculated,
                                        padding: "12px 8px",
                                      }}
                                    >
                                      <input
                                        type="number"
                                        step="0.01"
                                        style={{
                                          ...styles.tableInput,
                                          width: "100%",
                                        }}
                                        value={
                                          data.sundayHoursSummary
                                            ?.travelOvertimeHours || ""
                                        }
                                        onChange={(e) =>
                                          handleSundayHoursChange(
                                            "travelOvertimeHours",
                                            e.target.value,
                                          )
                                        }
                                        readOnly={isViewMode}
                                        placeholder="0"
                                      />
                                    </td>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        ...styles.calculated,
                                        padding: "12px 8px",
                                      }}
                                    >
                                      {formatCurrency(hourlyRates.overtime)}
                                    </td>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        ...styles.calculated,
                                        padding: "12px 8px",
                                      }}
                                    >
                                      {formatCurrency(
                                        toNum(
                                          data.sundayHoursSummary
                                            ?.travelOvertimeHours,
                                        ) * hourlyRates.overtime,
                                      )}
                                    </td>
                                  </tr>
                                  <tr>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        fontWeight: "bold",
                                        padding: "12px 8px",
                                        textAlign: "left",
                                      }}
                                    >
                                      TRAVEL @ DOUBLE TIME:
                                    </td>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        ...styles.calculated,
                                        padding: "12px 8px",
                                      }}
                                    >
                                      <input
                                        type="number"
                                        step="0.01"
                                        style={{
                                          ...styles.tableInput,
                                          width: "100%",
                                        }}
                                        value={
                                          data.sundayHoursSummary
                                            ?.travelDoubleTimeHours || ""
                                        }
                                        onChange={(e) =>
                                          handleSundayHoursChange(
                                            "travelDoubleTimeHours",
                                            e.target.value,
                                          )
                                        }
                                        readOnly={isViewMode}
                                        placeholder="0"
                                      />
                                    </td>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        ...styles.calculated,
                                        padding: "12px 8px",
                                      }}
                                    >
                                      {formatCurrency(hourlyRates.doubleTime)}
                                    </td>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        ...styles.calculated,
                                        padding: "12px 8px",
                                      }}
                                    >
                                      {formatCurrency(
                                        toNum(
                                          data.sundayHoursSummary
                                            ?.travelDoubleTimeHours,
                                        ) * hourlyRates.doubleTime,
                                      )}
                                    </td>
                                  </tr>
                                </>
                              )}
                              <tr style={{ ...styles.tfoot }}>
                                <td
                                  colSpan={3}
                                  style={{
                                    ...styles.tableCell,
                                    textAlign: "right",
                                    fontWeight: "bold",
                                    padding: "12px 8px",
                                  }}
                                >
                                  Total:
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.calculated,
                                    fontWeight: "bold",
                                    padding: "12px 8px",
                                  }}
                                >
                                  {formatCurrency(
                                    (() => {
                                      const sun = data.sundayHoursSummary || {
                                        straightTimeHours: 0,
                                        overtimeHours: 0,
                                        doubleTimeHours: 0,
                                        travelStraightTimeHours: 0,
                                        travelOvertimeHours: 0,
                                        travelDoubleTimeHours: 0,
                                      };
                                      return (
                                        toNum(sun.straightTimeHours) *
                                          hourlyRates.straightTime +
                                        toNum(sun.overtimeHours) *
                                          hourlyRates.overtime +
                                        toNum(sun.doubleTimeHours) *
                                          hourlyRates.doubleTime +
                                        toNum(sun.travelStraightTimeHours) *
                                          hourlyRates.straightTime +
                                        toNum(sun.travelOvertimeHours) *
                                          hourlyRates.overtime +
                                        toNum(sun.travelDoubleTimeHours) *
                                          hourlyRates.doubleTime
                                      );
                                    })(),
                                  )}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                          </div>
                        )}
                        {activeSummarySection === "terms" && (
                          <div>
                        {/* Payment Term Calculations Table */}
                        <div
                          style={styles.panelBlock}
                        >
                          <h3
                            style={{
                              ...styles.panelTitle,
                              marginBottom: "15px",
                            }}
                          >
                            PAYMENT TERM CALCULATIONS
                          </h3>
                          <table
                            style={{
                              ...styles.table,
                              width: "100%",
                              fontSize: "14px",
                            }}
                          >
                            <thead>
                              <tr>
                                <th
                                  style={{
                                    ...styles.tableHeader,
                                    padding: "12px 8px",
                                  }}
                                >
                                  PAYMENT TERMS
                                </th>
                                <th
                                  style={{
                                    ...styles.tableHeader,
                                    padding: "12px 8px",
                                  }}
                                >
                                  FACTOR
                                </th>
                                <th
                                  style={{
                                    ...styles.tableHeader,
                                    padding: "12px 8px",
                                  }}
                                >
                                  ROUNDED PRICE
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    fontWeight: "bold",
                                    padding: "12px 8px",
                                    textAlign: "left",
                                  }}
                                >
                                  NET 30
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    padding: "12px 8px",
                                  }}
                                >
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    style={{
                                      ...styles.tableInput,
                                      width: "80px",
                                      textAlign: "center",
                                    }}
                                    value={paymentTermFactors.net30}
                                    onChange={(e) => {
                                      const value =
                                        parseFloat(e.target.value) || 0;
                                      setPaymentTermFactors((prev) => ({
                                        ...prev,
                                        net30: value,
                                      }));
                                      setIsDirty(true);
                                    }}
                                    onBlur={() => {
                                      setPaymentTermFactors((prev) =>
                                        prev.net30 > 0
                                          ? prev
                                          : {
                                              ...prev,
                                              net30:
                                                DEFAULT_PAYMENT_TERM_FACTORS.net30,
                                            },
                                      );
                                    }}
                                    readOnly={isViewMode}
                                  />
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.totalCell,
                                    padding: "12px 8px",
                                  }}
                                >
                                  {formatCurrency(
                                    Math.ceil(
                                      getFinalValue() *
                                        paymentTermFactors.net30,
                                    ) +
                                      Math.ceil(
                                        getFinalValue() *
                                          getMobilizationFactor(
                                            getFinalValue(),
                                          ),
                                      ),
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    fontWeight: "bold",
                                    padding: "12px 8px",
                                    textAlign: "left",
                                  }}
                                >
                                  NET 60
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    padding: "12px 8px",
                                  }}
                                >
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    style={{
                                      ...styles.tableInput,
                                      width: "80px",
                                      textAlign: "center",
                                    }}
                                    value={paymentTermFactors.net60}
                                    onChange={(e) => {
                                      const value =
                                        parseFloat(e.target.value) || 0;
                                      setPaymentTermFactors((prev) => ({
                                        ...prev,
                                        net60: value,
                                      }));
                                      setIsDirty(true);
                                    }}
                                    onBlur={() => {
                                      setPaymentTermFactors((prev) =>
                                        prev.net60 > 0
                                          ? prev
                                          : {
                                              ...prev,
                                              net60:
                                                DEFAULT_PAYMENT_TERM_FACTORS.net60,
                                            },
                                      );
                                    }}
                                    readOnly={isViewMode}
                                  />
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.totalCell,
                                    padding: "12px 8px",
                                  }}
                                >
                                  {formatCurrency(
                                    Math.ceil(
                                      getFinalValue() *
                                        paymentTermFactors.net60,
                                    ) +
                                      Math.ceil(
                                        getFinalValue() *
                                          getMobilizationFactor(
                                            getFinalValue(),
                                          ),
                                      ),
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    fontWeight: "bold",
                                    padding: "12px 8px",
                                    textAlign: "left",
                                  }}
                                >
                                  NET 90
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    padding: "12px 8px",
                                  }}
                                >
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    style={{
                                      ...styles.tableInput,
                                      width: "80px",
                                      textAlign: "center",
                                    }}
                                    value={paymentTermFactors.net90}
                                    onChange={(e) => {
                                      const value =
                                        parseFloat(e.target.value) || 0;
                                      setPaymentTermFactors((prev) => ({
                                        ...prev,
                                        net90: value,
                                      }));
                                      setIsDirty(true);
                                    }}
                                    onBlur={() => {
                                      setPaymentTermFactors((prev) =>
                                        prev.net90 > 0
                                          ? prev
                                          : {
                                              ...prev,
                                              net90:
                                                DEFAULT_PAYMENT_TERM_FACTORS.net90,
                                            },
                                      );
                                    }}
                                    readOnly={isViewMode}
                                  />
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.totalCell,
                                    padding: "12px 8px",
                                  }}
                                >
                                  {formatCurrency(
                                    Math.ceil(
                                      getFinalValue() *
                                        paymentTermFactors.net90,
                                    ) +
                                      Math.ceil(
                                        getFinalValue() *
                                          getMobilizationFactor(
                                            getFinalValue(),
                                          ),
                                      ),
                                  )}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        {/* Mobilization Calculations Table */}
                        <div
                          style={styles.panelBlock}
                        >
                          <h3
                            style={{
                              ...styles.panelTitle,
                              marginBottom: "15px",
                            }}
                          >
                            MOBILIZATION CALCULATIONS
                          </h3>
                          <table
                            style={{
                              ...styles.table,
                              width: "100%",
                              fontSize: "14px",
                            }}
                          >
                            <thead>
                              <tr>
                                <th
                                  style={{
                                    ...styles.tableHeader,
                                    padding: "12px 8px",
                                  }}
                                >
                                  THRESHOLD COST (&gt;)
                                </th>
                                <th
                                  style={{
                                    ...styles.tableHeader,
                                    padding: "12px 8px",
                                  }}
                                >
                                  FACTOR
                                </th>
                                <th
                                  style={{
                                    ...styles.tableHeader,
                                    padding: "12px 8px",
                                  }}
                                >
                                  ROUNDED PRICE
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    fontWeight: "bold",
                                    padding: "12px 8px",
                                    textAlign: "left",
                                  }}
                                >
                                  $0.00
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    padding: "12px 8px",
                                  }}
                                >
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    style={{
                                      ...styles.tableInput,
                                      width: "80px",
                                      textAlign: "center",
                                    }}
                                    value={mobilizationFactors.base}
                                    onChange={(e) => {
                                      const value =
                                        parseFloat(e.target.value) || 0;
                                      setMobilizationFactors((prev) => ({
                                        ...prev,
                                        base: value,
                                      }));
                                      setIsDirty(true);
                                    }}
                                    readOnly={isViewMode}
                                  />
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.totalCell,
                                    padding: "12px 8px",
                                  }}
                                >
                                  {formatCurrency(
                                    Math.ceil(
                                      getFinalValue() *
                                        mobilizationFactors.base,
                                    ),
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    fontWeight: "bold",
                                    padding: "12px 8px",
                                    textAlign: "left",
                                  }}
                                >
                                  $100,000.00
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    padding: "12px 8px",
                                  }}
                                >
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    style={{
                                      ...styles.tableInput,
                                      width: "80px",
                                      textAlign: "center",
                                    }}
                                    value={mobilizationFactors.over100k}
                                    onChange={(e) => {
                                      const value =
                                        parseFloat(e.target.value) || 0;
                                      setMobilizationFactors((prev) => ({
                                        ...prev,
                                        over100k: value,
                                      }));
                                      setIsDirty(true);
                                    }}
                                    readOnly={isViewMode}
                                  />
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.totalCell,
                                    padding: "12px 8px",
                                  }}
                                >
                                  {(() => {
                                    const f = getFinalValue();
                                    const factor =
                                      f > 100000
                                        ? mobilizationFactors.over100k
                                        : mobilizationFactors.base;
                                    return formatCurrency(
                                      Math.ceil(f * factor),
                                    );
                                  })()}
                                </td>
                              </tr>
                              <tr>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    fontWeight: "bold",
                                    padding: "12px 8px",
                                    textAlign: "left",
                                  }}
                                >
                                  $500,000.00
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    padding: "12px 8px",
                                  }}
                                >
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    style={{
                                      ...styles.tableInput,
                                      width: "80px",
                                      textAlign: "center",
                                    }}
                                    value={mobilizationFactors.over500k}
                                    onChange={(e) => {
                                      const value =
                                        parseFloat(e.target.value) || 0;
                                      setMobilizationFactors((prev) => ({
                                        ...prev,
                                        over500k: value,
                                      }));
                                      setIsDirty(true);
                                    }}
                                    readOnly={isViewMode}
                                  />
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.totalCell,
                                    padding: "12px 8px",
                                  }}
                                >
                                  {(() => {
                                    const f = getFinalValue();
                                    const factor =
                                      f > 500000
                                        ? mobilizationFactors.over500k
                                        : f > 100000
                                          ? mobilizationFactors.over100k
                                          : mobilizationFactors.base;
                                    return formatCurrency(
                                      Math.ceil(f * factor),
                                    );
                                  })()}
                                </td>
                              </tr>
                              <tr>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    fontWeight: "bold",
                                    padding: "12px 8px",
                                    textAlign: "left",
                                  }}
                                >
                                  $1,000,000.00
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    padding: "12px 8px",
                                  }}
                                >
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    style={{
                                      ...styles.tableInput,
                                      width: "80px",
                                      textAlign: "center",
                                    }}
                                    value={mobilizationFactors.over1m}
                                    onChange={(e) => {
                                      const value =
                                        parseFloat(e.target.value) || 0;
                                      setMobilizationFactors((prev) => ({
                                        ...prev,
                                        over1m: value,
                                      }));
                                      setIsDirty(true);
                                    }}
                                    readOnly={isViewMode}
                                  />
                                </td>
                                <td
                                  style={{
                                    ...styles.tableCell,
                                    ...styles.totalCell,
                                    padding: "12px 8px",
                                  }}
                                >
                                  {(() => {
                                    const f = getFinalValue();
                                    const factor =
                                      f > 1000000
                                        ? mobilizationFactors.over1m
                                        : f > 500000
                                          ? mobilizationFactors.over500k
                                          : f > 100000
                                            ? mobilizationFactors.over100k
                                            : mobilizationFactors.base;
                                    return formatCurrency(
                                      Math.ceil(f * factor),
                                    );
                                  })()}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                          </div>
                        )}
                          </SectionNav>
                        </div>
                      );
                    })()}

                    {/* Proposal — Financial Summary & Quote Text */}
                    <div className="mt-6">
                        {/* Financial Summary */}
                        <div
                          style={{
                            ...styles.summarySection,
                            width: "100%",
                            marginBottom: "20px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                            }}
                          >
                            {/* Left side - SUB TOTAL and FINAL */}
                            <div
                              style={{
                                width: "60%",
                                color: "var(--text-color)",
                              }}
                            >
                              <div style={{ marginBottom: "15px" }}>
                                <div
                                  style={{
                                    fontWeight: "bold",
                                    marginBottom: "5px",
                                  }}
                                >
                                  SUB TOTAL (M-F)
                                </div>
                                <div
                                  style={{
                                    fontSize: "16px",
                                    fontWeight: "bold",
                                  }}
                                >
                                  {formatCurrency(
                                    getMaterialExpenseBase() +
                                      getWorkLaborCost() +
                                      getTravelLaborCost() +
                                      getTravelNonLaborCost(),
                                  )}
                                </div>
                                <div
                                  style={{
                                    fontSize: "12px",
                                    color: "var(--text-color)",
                                    opacity: 0.8,
                                  }}
                                >
                                  (before final mark-up)
                                </div>
                              </div>
                              <div>
                                <div
                                  style={{
                                    fontWeight: "bold",
                                    marginBottom: "5px",
                                  }}
                                >
                                  FINAL (M-F)
                                </div>
                                <div style={{ marginBottom: "5px" }}>
                                  {formatCurrency(getFinalValue())}
                                </div>
                                <div style={{ marginBottom: "5px" }}>
                                  Mobilization:{" "}
                                  {(() => {
                                    const final = getFinalValue();
                                    const factor = getMobilizationFactor(final);
                                    return formatCurrency(
                                      Math.ceil(final * factor),
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>

                            {/* Right side - CUSTOMER TOTAL COST table (includes mobilization as last step) */}
                            <div
                              style={{
                                width: "40%",
                                color: "var(--text-color)",
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: "bold",
                                  marginBottom: "10px",
                                  textAlign: "center",
                                }}
                              >
                                CUSTOMER TOTAL COST
                              </div>
                              <table
                                style={{
                                  ...styles.table,
                                  width: "100%",
                                  fontSize: "12px",
                                }}
                              >
                                <thead>
                                  <tr>
                                    <th
                                      style={{
                                        ...styles.tableHeader,
                                        padding: "6px 8px",
                                      }}
                                    ></th>
                                    <th
                                      style={{
                                        ...styles.tableHeader,
                                        padding: "6px 8px",
                                      }}
                                    >
                                      M-F
                                    </th>
                                    {showSaturdayHours && (
                                      <th
                                        style={{
                                          ...styles.tableHeader,
                                          padding: "6px 8px",
                                          color: "#f26722",
                                        }}
                                      >
                                        SAT
                                      </th>
                                    )}
                                    {showSundayHours && (
                                      <th
                                        style={{
                                          ...styles.tableHeader,
                                          padding: "6px 8px",
                                          color: "#dc3545",
                                        }}
                                      >
                                        SUN/HOL
                                      </th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        padding: "6px 8px",
                                        textAlign: "left",
                                      }}
                                    >
                                      NET 30
                                    </td>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        padding: "6px 8px",
                                        textAlign: "right",
                                      }}
                                    >
                                      {formatCurrency(
                                        Math.ceil(
                                          getFinalValue() *
                                            paymentTermFactors.net30,
                                        ) +
                                          Math.ceil(
                                            getFinalValue() *
                                              getMobilizationFactor(
                                                getFinalValue(),
                                              ),
                                          ),
                                      )}
                                    </td>
                                    {showSaturdayHours && (
                                      <td
                                        style={{
                                          ...styles.tableCell,
                                          padding: "6px 8px",
                                          textAlign: "right",
                                        }}
                                      >
                                        {formatCurrency(
                                          Math.ceil(
                                            getSaturdayFinalValue() *
                                              paymentTermFactors.net30,
                                          ) +
                                            Math.ceil(
                                              getSaturdayFinalValue() *
                                                getMobilizationFactor(
                                                  getSaturdayFinalValue(),
                                                ),
                                            ),
                                        )}
                                      </td>
                                    )}
                                    {showSundayHours && (
                                      <td
                                        style={{
                                          ...styles.tableCell,
                                          padding: "6px 8px",
                                          textAlign: "right",
                                        }}
                                      >
                                        {formatCurrency(
                                          Math.ceil(
                                            getSundayFinalValue() *
                                              paymentTermFactors.net30,
                                          ) +
                                            Math.ceil(
                                              getSundayFinalValue() *
                                                getMobilizationFactor(
                                                  getSundayFinalValue(),
                                                ),
                                            ),
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                  <tr>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        padding: "6px 8px",
                                        textAlign: "left",
                                      }}
                                    >
                                      NET 60
                                    </td>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        padding: "6px 8px",
                                        textAlign: "right",
                                      }}
                                    >
                                      {formatCurrency(
                                        Math.ceil(
                                          getFinalValue() *
                                            paymentTermFactors.net60,
                                        ) +
                                          Math.ceil(
                                            getFinalValue() *
                                              getMobilizationFactor(
                                                getFinalValue(),
                                              ),
                                          ),
                                      )}
                                    </td>
                                    {showSaturdayHours && (
                                      <td
                                        style={{
                                          ...styles.tableCell,
                                          padding: "6px 8px",
                                          textAlign: "right",
                                        }}
                                      >
                                        {formatCurrency(
                                          Math.ceil(
                                            getSaturdayFinalValue() *
                                              paymentTermFactors.net60,
                                          ) +
                                            Math.ceil(
                                              getSaturdayFinalValue() *
                                                getMobilizationFactor(
                                                  getSaturdayFinalValue(),
                                                ),
                                            ),
                                        )}
                                      </td>
                                    )}
                                    {showSundayHours && (
                                      <td
                                        style={{
                                          ...styles.tableCell,
                                          padding: "6px 8px",
                                          textAlign: "right",
                                        }}
                                      >
                                        {formatCurrency(
                                          Math.ceil(
                                            getSundayFinalValue() *
                                              paymentTermFactors.net60,
                                          ) +
                                            Math.ceil(
                                              getSundayFinalValue() *
                                                getMobilizationFactor(
                                                  getSundayFinalValue(),
                                                ),
                                            ),
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                  <tr>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        padding: "6px 8px",
                                        textAlign: "left",
                                      }}
                                    >
                                      NET 90
                                    </td>
                                    <td
                                      style={{
                                        ...styles.tableCell,
                                        padding: "6px 8px",
                                        textAlign: "right",
                                      }}
                                    >
                                      {formatCurrency(
                                        Math.ceil(
                                          getFinalValue() *
                                            paymentTermFactors.net90,
                                        ) +
                                          Math.ceil(
                                            getFinalValue() *
                                              getMobilizationFactor(
                                                getFinalValue(),
                                              ),
                                          ),
                                      )}
                                    </td>
                                    {showSaturdayHours && (
                                      <td
                                        style={{
                                          ...styles.tableCell,
                                          padding: "6px 8px",
                                          textAlign: "right",
                                        }}
                                      >
                                        {formatCurrency(
                                          Math.ceil(
                                            getSaturdayFinalValue() *
                                              paymentTermFactors.net90,
                                          ) +
                                            Math.ceil(
                                              getSaturdayFinalValue() *
                                                getMobilizationFactor(
                                                  getSaturdayFinalValue(),
                                                ),
                                            ),
                                        )}
                                      </td>
                                    )}
                                    {showSundayHours && (
                                      <td
                                        style={{
                                          ...styles.tableCell,
                                          padding: "6px 8px",
                                          textAlign: "right",
                                        }}
                                      >
                                        {formatCurrency(
                                          Math.ceil(
                                            getSundayFinalValue() *
                                              paymentTermFactors.net90,
                                          ) +
                                            Math.ceil(
                                              getSundayFinalValue() *
                                                getMobilizationFactor(
                                                  getSundayFinalValue(),
                                                ),
                                            ),
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>

                        {/* Quantity for combined letter proposal */}
                        <div
                          style={{
                            ...styles.summarySection,
                            width: "100%",
                            marginTop: "12px",
                            marginBottom: "8px",
                          }}
                        >
                          <div
                            style={{ fontWeight: "bold", marginBottom: "5px" }}
                          >
                            Quantity for combined letter
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: "var(--text-color)",
                              opacity: 0.9,
                              marginBottom: "6px",
                            }}
                          >
                            Used when this estimate is included in a combined
                            letter proposal. You can still change it when
                            generating the letter.
                          </div>
                          <input
                            type="number"
                            min={1}
                            value={combinedLetterQuantity}
                            onChange={(e) => {
                              const v = Math.max(
                                1,
                                Math.floor(Number(e.target.value)) || 1,
                              );
                              setCombinedLetterQuantity(v);
                              setIsDirty(true);
                            }}
                            readOnly={isViewMode}
                            style={{
                              ...styles.tableInput,
                              width: "80px",
                              textAlign: "center",
                            }}
                          />
                        </div>

                        {/* Quote Text and Terms */}
                        <div
                          style={{ ...styles.summarySection, width: "100%" }}
                        >
                          <button
                            type="button"
                            onClick={handleCopyQuoteText}
                            style={{
                              padding: "8px 16px",
                              fontSize: "13px",
                              fontWeight: 500,
                              backgroundColor: quoteTextCopied
                                ? "transparent"
                                : "#f26722",
                              color: quoteTextCopied ? "#f26722" : "white",
                              border: "0.5px solid #f26722",
                              borderRadius: "6px",
                              cursor: "pointer",
                            }}
                          >
                            {quoteTextCopied ? "Copied!" : "Copy"}
                          </button>
                        </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Dialog>

      {/* Quote Selection Modal */}
      {isQuoteSelectOpen && (
        <Dialog
          open={isQuoteSelectOpen}
          onClose={() => {
            setIsQuoteSelectOpen(false);
            setSingleLetterScopeQuantity(1);
            setIncludeMobilizationWhenZero(false);
            setLetterIncludeSovNotes(false);
            // Reset mode to allow immediate reopening
            if (mode === "letter") {
              // Use a timeout to reset the mode, allowing immediate reopening
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("resetEstimateMode"));
              }, 100);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
        >
          <div className="bg-white dark:bg-dark-150 text-neutral-900 dark:text-neutral-100 rounded-none shadow-lg p-6 max-w-md w-full">
            <h2 className="text-lg font-bold mb-4 dark:text-white">
              Select a Quote
            </h2>
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm text-neutral-700 dark:text-neutral-200">
                  Scope Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  value={singleLetterScopeQuantity}
                  onChange={(e) => {
                    const qty = Math.max(
                      1,
                      Math.floor(Number(e.target.value) || 1),
                    );
                    setSingleLetterScopeQuantity(qty);
                  }}
                  className="w-20 px-2 py-1 border border-neutral-300 dark:border-neutral-600 rounded text-sm"
                />
              </div>
              <label className="flex items-center cursor-pointer mt-2">
                <input
                  type="checkbox"
                  checked={includeMobilizationWhenZero}
                  onChange={(e) =>
                    setIncludeMobilizationWhenZero(e.target.checked)
                  }
                  className="mr-2 h-5 w-5 text-[#f26722] focus:ring-[#f26722] border-neutral-300 rounded"
                />
                <span className="text-sm text-neutral-700 dark:text-neutral-200">
                  Include mobilization in letter even when $0
                </span>
              </label>
              <label className="flex items-center cursor-pointer mt-2">
                <input
                  type="checkbox"
                  checked={letterIncludeSovNotes}
                  onChange={(e) => setLetterIncludeSovNotes(e.target.checked)}
                  className="mr-2 h-5 w-5 text-[#f26722] focus:ring-[#f26722] border-neutral-300 rounded"
                />
                <span className="text-sm text-neutral-700 dark:text-neutral-200">
                  Include SOV item notes
                </span>
              </label>
              <div className="mt-3 p-3 bg-neutral-50 dark:bg-dark-100 rounded-none border border-neutral-200 dark:border-neutral-700">
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
                  Work Schedule Pricing in Letter
                </p>
                <div className="space-y-1.5">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={letterIncludeMF}
                      onChange={(e) => setLetterIncludeMF(e.target.checked)}
                      className="mr-2 h-5 w-5 text-[#f26722] focus:ring-[#f26722] border-neutral-300 rounded"
                    />
                    <span className="text-sm text-neutral-700 dark:text-neutral-200">
                      Monday - Friday
                    </span>
                  </label>
                  <label
                    className={`flex items-center ${showSaturdayHours ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                  >
                    <input
                      type="checkbox"
                      checked={letterIncludeSaturday}
                      onChange={(e) =>
                        setLetterIncludeSaturday(e.target.checked)
                      }
                      disabled={!showSaturdayHours}
                      className="mr-2 h-5 w-5 text-[#f26722] focus:ring-[#f26722] border-neutral-300 rounded"
                    />
                    <span className="text-sm text-neutral-700 dark:text-neutral-200">
                      Saturday
                      {!showSaturdayHours
                        ? " (enable Saturday table first)"
                        : ""}
                    </span>
                  </label>
                  <label
                    className={`flex items-center ${showSundayHours ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                  >
                    <input
                      type="checkbox"
                      checked={letterIncludeSunday}
                      onChange={(e) => setLetterIncludeSunday(e.target.checked)}
                      disabled={!showSundayHours}
                      className="mr-2 h-5 w-5 text-[#f26722] focus:ring-[#f26722] border-neutral-300 rounded"
                    />
                    <span className="text-sm text-neutral-700 dark:text-neutral-200">
                      Sunday / Holiday
                      {!showSundayHours ? " (enable Sunday table first)" : ""}
                    </span>
                  </label>
                </div>
              </div>
              <div className="mt-3 p-3 bg-neutral-50 dark:bg-dark-100 rounded-none border border-neutral-200 dark:border-neutral-700">
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
                  Payment Terms in Letter
                </p>
                <label className="flex items-center cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={letterShowAllTerms}
                    onChange={(e) => setLetterShowAllTerms(e.target.checked)}
                    className="mr-2 h-5 w-5 text-[#f26722] focus:ring-[#f26722] border-neutral-300 rounded"
                  />
                  <span className="text-sm text-neutral-700 dark:text-neutral-200">
                    Show all payment terms (NET 30, 60, 90)
                  </span>
                </label>
                {!letterShowAllTerms && (
                  <select
                    value={letterPaymentTerm}
                    onChange={(e) =>
                      setLetterPaymentTerm(
                        e.target.value as "net30" | "net60" | "net90",
                      )
                    }
                    className="w-full px-2 py-1.5 border border-neutral-300 dark:border-neutral-600 rounded text-sm bg-white dark:bg-dark-100 dark:text-white"
                  >
                    <option value="net30">NET 30</option>
                    <option value="net60">NET 60</option>
                    <option value="net90">NET 90</option>
                  </select>
                )}
              </div>
            </div>
            <ul>
              {quotes.map((q, idx) => (
                <li
                  key={q.id}
                  className="mb-2 flex items-center justify-between"
                >
                  <span>
                    {(function () {
                      try {
                        const parsed =
                          typeof q.data === "string"
                            ? JSON.parse(q.data)
                            : q.data || {};
                        const customTitle = parsed?.title?.trim();
                        if (customTitle) return customTitle;
                      } catch {}
                      return `Quote ${(opportunityData as any)?.quote_number || q.id?.slice(0, 6) || idx + 1}`;
                    })()}{" "}
                    - {q.created_at?.slice(0, 10)}
                  </span>
                  <Button
                    onClick={() => handleSelectQuoteForLetter(idx)}
                    className="bg-[#f26722] text-white ml-2"
                  >
                    Select
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              onClick={() => {
                setIsQuoteSelectOpen(false);
                setSingleLetterScopeQuantity(1);
                setIncludeMobilizationWhenZero(false);
                setLetterIncludeSovNotes(false);
                // Reset mode to allow immediate reopening
                if (mode === "letter") {
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent("resetEstimateMode"));
                  }, 100);
                }
              }}
              className="mt-4"
            >
              Cancel
            </Button>
          </div>
        </Dialog>
      )}

      {/* Combined Quote Selection Modal */}
      {isCombinedQuoteSelectOpen && (
        <Dialog
          open={isCombinedQuoteSelectOpen}
          onClose={() => {
            setIsCombinedQuoteSelectOpen(false);
            setSelectedQuotesForCombined([]);
            setScopeQuantities({});
            setShowIndividualPricing(true);
            setShowGrandTotalPricing(true);
            setIncludeMobilizationWhenZero(false);
            setLetterIncludeSovNotes(false);
            // Reset mode to allow immediate reopening
            if (mode === "combined-letter") {
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("resetEstimateMode"));
              }, 100);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
        >
          <div className="bg-white dark:bg-dark-150 text-neutral-900 dark:text-neutral-100 rounded-none shadow-lg p-6 max-w-lg w-full">
            <h2 className="text-lg font-bold mb-4 dark:text-white">
              Select Multiple Quotes for Combined Letter
            </h2>
            <div className="mb-4">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                Select the quotes you want to include in the combined letter
                proposal:
              </p>
            </div>
            <div className="mb-4 p-3 bg-neutral-50 dark:bg-dark-100 rounded-none border border-neutral-200 dark:border-neutral-700">
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Pricing Options:
              </p>
              <div className="space-y-2">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showIndividualPricing}
                    onChange={(e) => setShowIndividualPricing(e.target.checked)}
                    className="mr-2 h-5 w-5 text-[#f26722] focus:ring-[#f26722] border-neutral-300 rounded"
                  />
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">
                    Show individual pricing for each scope
                  </span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showGrandTotalPricing}
                    onChange={(e) => setShowGrandTotalPricing(e.target.checked)}
                    className="mr-2 h-5 w-5 text-[#f26722] focus:ring-[#f26722] border-neutral-300 rounded"
                  />
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">
                    Show grand total pricing for all scope
                  </span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeMobilizationWhenZero}
                    onChange={(e) =>
                      setIncludeMobilizationWhenZero(e.target.checked)
                    }
                    className="mr-2 h-5 w-5 text-[#f26722] focus:ring-[#f26722] border-neutral-300 rounded"
                  />
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">
                    Include mobilization in letter even when $0
                  </span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={letterIncludeSovNotes}
                    onChange={(e) => setLetterIncludeSovNotes(e.target.checked)}
                    className="mr-2 h-5 w-5 text-[#f26722] focus:ring-[#f26722] border-neutral-300 rounded"
                  />
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">
                    Include SOV item notes
                  </span>
                </label>
                <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-600">
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Work Schedule Pricing in Letter
                  </p>
                  <div className="space-y-1.5">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={letterIncludeMF}
                        onChange={(e) => setLetterIncludeMF(e.target.checked)}
                        className="mr-2 h-5 w-5 text-[#f26722] focus:ring-[#f26722] border-neutral-300 rounded"
                      />
                      <span className="text-sm text-neutral-700 dark:text-neutral-300">
                        Monday - Friday
                      </span>
                    </label>
                    <label
                      className={`flex items-center ${showSaturdayHours ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                    >
                      <input
                        type="checkbox"
                        checked={letterIncludeSaturday}
                        onChange={(e) =>
                          setLetterIncludeSaturday(e.target.checked)
                        }
                        disabled={!showSaturdayHours}
                        className="mr-2 h-5 w-5 text-[#f26722] focus:ring-[#f26722] border-neutral-300 rounded"
                      />
                      <span className="text-sm text-neutral-700 dark:text-neutral-300">
                        Saturday
                        {!showSaturdayHours ? " (enable table first)" : ""}
                      </span>
                    </label>
                    <label
                      className={`flex items-center ${showSundayHours ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                    >
                      <input
                        type="checkbox"
                        checked={letterIncludeSunday}
                        onChange={(e) =>
                          setLetterIncludeSunday(e.target.checked)
                        }
                        disabled={!showSundayHours}
                        className="mr-2 h-5 w-5 text-[#f26722] focus:ring-[#f26722] border-neutral-300 rounded"
                      />
                      <span className="text-sm text-neutral-700 dark:text-neutral-300">
                        Sunday / Holiday
                        {!showSundayHours ? " (enable table first)" : ""}
                      </span>
                    </label>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-600">
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Payment Terms in Letter
                  </p>
                  <label className="flex items-center cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={letterShowAllTerms}
                      onChange={(e) => setLetterShowAllTerms(e.target.checked)}
                      className="mr-2 h-5 w-5 text-[#f26722] focus:ring-[#f26722] border-neutral-300 rounded"
                    />
                    <span className="text-sm text-neutral-700 dark:text-neutral-300">
                      Show all payment terms (NET 30, 60, 90)
                    </span>
                  </label>
                  {!letterShowAllTerms && (
                    <select
                      value={letterPaymentTerm}
                      onChange={(e) =>
                        setLetterPaymentTerm(
                          e.target.value as "net30" | "net60" | "net90",
                        )
                      }
                      className="w-full px-2 py-1.5 border border-neutral-300 rounded text-sm bg-white dark:bg-dark-100 dark:text-white dark:border-neutral-600"
                    >
                      <option value="net30">NET 30</option>
                      <option value="net60">NET 60</option>
                      <option value="net90">NET 90</option>
                    </select>
                  )}
                </div>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {quotes.map((q, idx) => (
                <div
                  key={q.id}
                  className="mb-3 flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-700 rounded-none"
                >
                  <div className="flex items-center flex-1">
                    <input
                      type="checkbox"
                      id={`quote-${idx}`}
                      checked={selectedQuotesForCombined.includes(idx)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedQuotesForCombined((prev) => [
                            ...prev,
                            idx,
                          ]);
                          // Default scope quantity from estimate sheet (combinedLetterQuantity), else 1
                          let qty = 1;
                          try {
                            const parsed =
                              typeof q.data === "string"
                                ? JSON.parse(q.data)
                                : q.data || {};
                            if (
                              parsed.combinedLetterQuantity !== undefined &&
                              parsed.combinedLetterQuantity !== null
                            ) {
                              qty = Math.max(
                                1,
                                Math.floor(
                                  Number(parsed.combinedLetterQuantity),
                                ) || 1,
                              );
                            }
                          } catch (_) {}
                          setScopeQuantities((prev) => ({
                            ...prev,
                            [idx]: qty,
                          }));
                        } else {
                          setSelectedQuotesForCombined((prev) =>
                            prev.filter((i) => i !== idx),
                          );
                          // Remove scope quantity when unselected
                          setScopeQuantities((prev) => {
                            const updated = { ...prev };
                            delete updated[idx];
                            return updated;
                          });
                        }
                      }}
                      className="mr-3 h-5 w-5 text-[#f26722] focus:ring-[#f26722] border-neutral-300 rounded"
                    />
                    <label
                      htmlFor={`quote-${idx}`}
                      className="text-sm font-medium text-neutral-900 dark:text-neutral-100 cursor-pointer"
                    >
                      {(function () {
                        try {
                          const parsed =
                            typeof q.data === "string"
                              ? JSON.parse(q.data)
                              : q.data || {};
                          const customTitle = parsed?.title?.trim();
                          if (customTitle) return customTitle;
                        } catch {}
                        return `Quote ${(opportunityData as any)?.quote_number || q.id?.slice(0, 6) || idx + 1}`;
                      })()}{" "}
                      - {q.created_at?.slice(0, 10)}
                    </label>
                  </div>
                  {selectedQuotesForCombined.includes(idx) && (
                    <div className="flex items-center gap-2 ml-4">
                      <label className="text-sm text-neutral-700 dark:text-neutral-200">
                        Scope Quantity
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={scopeQuantities[idx] || 1}
                        onChange={(e) => {
                          const qty = Math.max(
                            1,
                            Math.floor(Number(e.target.value) || 1),
                          );
                          setScopeQuantities((prev) => ({
                            ...prev,
                            [idx]: qty,
                          }));
                        }}
                        className="w-20 px-2 py-1 border border-neutral-300 dark:border-neutral-600 rounded text-sm"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-6">
              <Button
                onClick={() => {
                  setIsCombinedQuoteSelectOpen(false);
                  setSelectedQuotesForCombined([]);
                  setScopeQuantities({});
                  setShowIndividualPricing(true);
                  setShowGrandTotalPricing(true);
                  setIncludeMobilizationWhenZero(false);
                  setLetterIncludeSovNotes(false);
                  // Reset mode to allow immediate reopening
                  if (mode === "combined-letter") {
                    setTimeout(() => {
                      window.dispatchEvent(
                        new CustomEvent("resetEstimateMode"),
                      );
                    }, 100);
                  }
                }}
                className="bg-neutral-500 text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleSelectQuotesForCombinedLetter()}
                disabled={selectedQuotesForCombined.length === 0}
                className="bg-[#f26722] text-white disabled:bg-neutral-300 disabled:cursor-not-allowed"
              >
                Generate Combined Letter ({selectedQuotesForCombined.length}{" "}
                selected)
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Saved Letters Modal */}
      {isLettersListOpen && (
        <Dialog
          open={isLettersListOpen}
          onClose={() => {
            setIsLettersListOpen(false);
            // Reset mode to allow immediate reopening
            if (mode === "letters") {
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("resetEstimateMode"));
              }, 100);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
        >
          <div className="bg-white dark:bg-dark-150 text-neutral-900 dark:text-neutral-100 rounded-none shadow-lg p-6 max-w-2xl w-full">
            <h2 className="text-lg font-bold mb-4 dark:text-white">
              Saved Letter Proposals
            </h2>
            {letters.length === 0 ? (
              <div className="text-sm text-neutral-500 dark:text-neutral-400">
                No saved letters yet.
              </div>
            ) : (
              <ul className="divide-y dark:divide-neutral-700">
                {letters.map((l, idx) => (
                  <li
                    key={l.id}
                    className="py-2 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm font-medium">
                        {(l as any).title ||
                          `Letter # ${(opportunityData as any)?.quote_number || idx + 1}`}
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        {l.created_at?.slice(0, 10)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={async () => {
                          try {
                            const baseTitle =
                              (l as any).title ||
                              `Letter # ${(opportunityData as any)?.quote_number || idx + 1}`;
                            const newTitle = `${baseTitle} - Copy`;
                            const payload: any = {
                              opportunity_id: opportunityId,
                              title: newTitle,
                              html: l.html,
                              created_at: new Date().toISOString(),
                              quote_number:
                                (opportunityData as any)?.quote_number || null,
                              neta_standard: (l as any)?.neta_standard || null,
                            };
                            const { data: inserted, error: dupErr } =
                              await supabase
                                .schema("business")
                                .from("letter_proposals")
                                .insert(payload)
                                .select("*")
                                .single();
                            if (dupErr) throw dupErr;
                            // Prepend the new copy to the list (newest first)
                            setLetters((prev) => [inserted as any, ...prev]);
                          } catch (e: any) {
                            alert(
                              "Failed to duplicate: " +
                                (e?.message || "Unknown error"),
                            );
                          }
                        }}
                        className="bg-blue-600 text-white hover:bg-blue-700"
                      >
                        Duplicate
                      </Button>
                      <Button
                        onClick={() => {
                          setIsLettersListOpen(false);
                          setIsLetterProposalOpen(true);
                          const normalized = normalizePricingTermsHtml(l.html);
                          setLetterHtml(normalized);
                          savedLetterHtmlRef.current = normalized;
                          setIsLetterDirty(false);
                          setCurrentLetterId(l.id);
                          setNetaStandard(l.neta_standard || "");
                          setLetterProposalName((l as any).title || ""); // Populate the name field
                        }}
                        className="bg-[#f26722] text-white"
                      >
                        Open
                      </Button>
                      <Button
                        onClick={async () => {
                          if (!confirm("Delete this saved letter?")) return;
                          try {
                            const { error } = await supabase
                              .schema("business")
                              .from("letter_proposals")
                              .delete()
                              .eq("id", l.id);
                            if (error) throw error;
                            setLetters((prev) =>
                              prev.filter((item) => item.id !== l.id),
                            );
                            if (currentLetterId === l.id) {
                              setCurrentLetterId(null);
                              setIsLetterProposalOpen(false);
                              setIsLetterDirty(false);
                              savedLetterHtmlRef.current = "";
                            }
                          } catch (e: any) {
                            alert(
                              "Failed to delete: " +
                                (e?.message || "Unknown error"),
                            );
                          }
                        }}
                        className="bg-red-600 text-white"
                      >
                        <Trash className="h-6 w-6" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 text-right">
              <Button
                onClick={() => {
                  setIsLettersListOpen(false);
                  // Reset mode to allow immediate reopening
                  if (mode === "letters") {
                    setTimeout(() => {
                      window.dispatchEvent(
                        new CustomEvent("resetEstimateMode"),
                      );
                    }, 100);
                  }
                }}
              >
                Close
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Letter Proposal Modal */}
      <Dialog
        open={isLetterProposalOpen}
        onClose={handleCloseLetterProposal}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60"
      >
        <div
          className="fixed inset-0 bg-black bg-opacity-60 z-40"
          onClick={handleCloseLetterProposal}
        />
        <div className="relative z-50 bg-white w-full h-full max-w-5xl mx-auto my-8 rounded-none shadow-lg flex flex-col">
          <div className="p-4 border-b space-y-3">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xl font-bold">Letter Proposal</h2>
              <div className="flex gap-2">
                {currentLetterId ? (
                  <Button
                    onClick={async () => {
                      if (!confirm("Delete this saved letter?")) return;
                      try {
                        const { error } = await supabase
                          .schema("business")
                          .from("letter_proposals")
                          .delete()
                          .eq("id", currentLetterId);
                        if (error) throw error;
                        // Update the letters list to remove the deleted letter
                        setLetters((prev) =>
                          prev.filter((item) => item.id !== currentLetterId),
                        );
                        setCurrentLetterId(null);
                        setIsLetterProposalOpen(false);
                        setIsLetterDirty(false);
                        savedLetterHtmlRef.current = "";
                        setLetterProposalName(""); // Clear the letter name
                        // Clear letter proposal state when deleting
                        clearLetterProposalState();
                        // Reset mode to allow immediate reopening
                        if (
                          mode === "letter" ||
                          mode === "letters" ||
                          mode === "combined-letter"
                        ) {
                          setTimeout(() => {
                            window.dispatchEvent(
                              new CustomEvent("resetEstimateMode"),
                            );
                          }, 100);
                        }
                        alert("Letter deleted successfully");
                      } catch (e: any) {
                        alert(
                          "Failed to delete letter: " +
                            (e?.message || "Unknown error"),
                        );
                      }
                    }}
                    className="bg-red-600 text-white hover:bg-red-700"
                  >
                    Delete Letter
                  </Button>
                ) : null}
                <Button
                  onClick={async () => {
                    const sourceHtml = (
                      letterEditorRef.current?.innerHTML ||
                      letterHtml ||
                      ""
                    ).trim();
                    if (!sourceHtml) {
                      alert("Nothing to save. Please generate a letter first.");
                      return;
                    }

                    setIsSavingLetter(true);
                    try {
                      // Use the letterProposalName from the input field (optional)
                      const customName = letterProposalName.trim();

                      const container = document.createElement("div");
                      container.innerHTML = sourceHtml;
                      // Sync any input current values to their value attributes before saving HTML
                      try {
                        Array.from(container.querySelectorAll("input")).forEach(
                          (el: any) => {
                            if (el && typeof el.value === "string") {
                              el.setAttribute("value", el.value);
                            }
                          },
                        );
                      } catch {}
                      // Ensure selected NETA standard text is reflected in the letter before saving
                      try {
                        const sel = container.querySelector(
                          "#neta-standard-select",
                        ) as HTMLSelectElement | null;
                        const txt = container.querySelector(
                          "#neta-standard-text",
                        ) as HTMLElement | null;
                        if (sel && txt) {
                          const selected =
                            sel.options[sel.selectedIndex]?.text || "";
                          if (selected) txt.textContent = selected;
                        }
                      } catch {}

                      const htmlToSave = container.innerHTML;

                      const payload = {
                        opportunity_id: opportunityId,
                        title:
                          customName.length > 0
                            ? customName
                            : `Letter Proposal - ${opportunityData?.title || "Untitled"}`,
                        html: htmlToSave,
                        created_at: new Date().toISOString(),
                        quote_number:
                          (opportunityData as any)?.quote_number || null,
                        neta_standard: netaStandard,
                      } as any;

                      // Compute a NET 30 price for quoted_amount fallback, honoring per-scope quantities
                      let computedNet30: number = 0;
                      try {
                        // 1) Prefer combined grand total if present (already quantity-adjusted by UI)
                        const grand = container.querySelector(
                          '.grand-price[data-kind="net30"]',
                        ) as HTMLElement | null;
                        const grandBaseAttr = grand?.getAttribute("data-base");
                        if (grandBaseAttr) {
                          const v =
                            Number(grandBaseAttr.replace(/,/g, "")) || 0;
                          computedNet30 = Math.round(v * 100) / 100;
                        }
                        // If no data-base, try text content under the Grand Total Pricing block
                        if (!computedNet30 || computedNet30 <= 0) {
                          const grandHeader = Array.from(
                            container.querySelectorAll("b"),
                          ).find(
                            (el) =>
                              (el.textContent || "").trim() ===
                              "Grand Total Pricing",
                          );
                          if (grandHeader) {
                            const block =
                              grandHeader.closest(".amp-scope-block") ||
                              grandHeader.parentElement?.parentElement ||
                              grandHeader.parentElement;
                            if (block) {
                              const liNet30 = Array.from(
                                block.querySelectorAll("li"),
                              ).find((li) =>
                                /NET\s*30/i.test(li.textContent || ""),
                              ) as HTMLElement | undefined;
                              if (liNet30) {
                                const match = (liNet30.textContent || "").match(
                                  /\$([0-9,]+\.?[0-9]*)/,
                                );
                                if (match && match[1]) {
                                  const v =
                                    Number(match[1].replace(/,/g, "")) || 0;
                                  computedNet30 = Math.round(v * 100) / 100;
                                }
                              }
                            }
                          }
                        }

                        // 2) If no grand total, sum per-scope base prices * nearest scope qty
                        if (!computedNet30 || computedNet30 <= 0) {
                          const scopePrices = Array.from(
                            container.querySelectorAll(
                              '.scope-price[data-kind="net30"]',
                            ),
                          ) as HTMLElement[];
                          if (scopePrices.length > 0) {
                            let sum = 0;
                            scopePrices.forEach((el) => {
                              const baseAttr =
                                el.getAttribute("data-base") || "0";
                              const base =
                                Number((baseAttr || "0").replace(/,/g, "")) ||
                                0;
                              // find closest scope qty input within the same scope block
                              const block =
                                el.closest(".amp-section")?.parentElement ||
                                (el.parentElement as HTMLElement | null);
                              let qtyEl = block?.querySelector(
                                "input.scope-qty",
                              ) as HTMLInputElement | null;
                              if (!qtyEl) {
                                // global fallback
                                qtyEl = container.querySelector(
                                  "input.scope-qty",
                                ) as HTMLInputElement | null;
                              }
                              const qtyRaw =
                                qtyEl?.getAttribute("value") ||
                                qtyEl?.value ||
                                "1";
                              const qty = Math.max(
                                1,
                                parseInt(qtyRaw || "1", 10) || 1,
                              );
                              sum += base * qty;
                            });
                            computedNet30 = Math.round(sum * 100) / 100;
                          }
                        }
                        // Final fallback: scan all NET 30 amounts and take the largest (covers single/multi blocks)
                        if (!computedNet30 || computedNet30 <= 0) {
                          const net30Lis = Array.from(
                            container.querySelectorAll("li"),
                          ) as HTMLElement[];
                          let best = 0;
                          net30Lis.forEach((li) => {
                            const txt = (li.textContent || "").trim();
                            if (/NET\s*30/i.test(txt)) {
                              const m = txt.match(/\$([0-9,]+\.?[0-9]*)/);
                              if (m && m[1]) {
                                const v = Number(m[1].replace(/,/g, "")) || 0;
                                if (v > best) best = v;
                              }
                            }
                          });
                          if (best > 0)
                            computedNet30 = Math.round(best * 100) / 100;
                        }
                      } catch {}

                      const extractNet30FromHtml = (html: string): number => {
                        try {
                          const doc =
                            document.implementation.createHTMLDocument(
                              "letter-parse",
                            );
                          const tmp = doc.createElement("div");
                          tmp.innerHTML = html || "";
                          // 1) Grand total data-base
                          const grand = tmp.querySelector(
                            '.grand-price[data-kind="net30"]',
                          ) as HTMLElement | null;
                          const baseAttr = grand?.getAttribute("data-base");
                          if (baseAttr) {
                            const v = Number(baseAttr.replace(/,/g, "")) || 0;
                            if (v > 0) return Math.round(v * 100) / 100;
                          }
                          // 2) Grand Total Pricing block text
                          const grandHeader = Array.from(
                            tmp.querySelectorAll("b"),
                          ).find(
                            (el) =>
                              (el.textContent || "").trim() ===
                              "Grand Total Pricing",
                          );
                          if (grandHeader) {
                            const block = (grandHeader.closest(
                              ".amp-scope-block",
                            ) ||
                              grandHeader.parentElement?.parentElement ||
                              grandHeader.parentElement) as HTMLElement | null;
                            if (block) {
                              const liNet30 = Array.from(
                                block.querySelectorAll("li"),
                              ).find((li) =>
                                /NET\s*30/i.test(li.textContent || ""),
                              ) as HTMLElement | undefined;
                              if (liNet30) {
                                const m = (liNet30.textContent || "").match(
                                  /\$([0-9,]+\.?[0-9]*)/,
                                );
                                if (m && m[1]) {
                                  const v = Number(m[1].replace(/,/g, "")) || 0;
                                  if (v > 0) return Math.round(v * 100) / 100;
                                }
                              }
                            }
                          }
                          // 3) Max NET 30 across all list items
                          const net30Lis = Array.from(
                            tmp.querySelectorAll("li"),
                          ) as HTMLElement[];
                          let best = 0;
                          net30Lis.forEach((li) => {
                            const txt = (li.textContent || "").trim();
                            if (/NET\s*30/i.test(txt)) {
                              const m = txt.match(/\$([0-9,]+\.?[0-9]*)/);
                              if (m && m[1]) {
                                const v = Number(m[1].replace(/,/g, "")) || 0;
                                if (v > best) best = v;
                              }
                            }
                          });
                          if (best > 0) return Math.round(best * 100) / 100;
                        } catch {}
                        return 0;
                      };

                      const updateOpportunityFromLetter = async (
                        proposalId: string | null,
                        net30: number,
                      ) => {
                        try {
                          const payload: any = {
                            selected_letter_proposal: proposalId,
                          };
                          // Always set quoted_amount from the most recent letter proposal when saving
                          if (net30 && net30 > 0) {
                            payload.quoted_amount = net30;
                          }
                          const { error: oppErr } = await supabase
                            .schema("business")
                            .from("opportunities")
                            .update(payload)
                            .eq("id", opportunityId);
                          if (oppErr) {
                            console.warn(
                              "Failed to sync opportunity from letter:",
                              oppErr,
                            );
                          }
                        } catch (e) {
                          console.warn("Opportunity sync exception:", e);
                        }
                      };

                      if (currentLetterId) {
                        const { error } = await supabase
                          .schema("business")
                          .from("letter_proposals")
                          .update(payload)
                          .eq("id", currentLetterId);
                        if (error) throw error;

                        // Update the letters list with the new title
                        setLetters((prev) =>
                          prev.map((letter) =>
                            letter.id === currentLetterId
                              ? {
                                  ...letter,
                                  title: payload.title,
                                  html: payload.html,
                                  neta_standard: payload.neta_standard,
                                }
                              : letter,
                          ),
                        );

                        // Re-read saved HTML to ensure we match the persisted letter
                        let net30Saved = computedNet30;
                        try {
                          const { data: savedLetter } = await supabase
                            .schema("business")
                            .from("letter_proposals")
                            .select("html")
                            .eq("id", currentLetterId)
                            .single();
                          if (savedLetter?.html) {
                            const v = extractNet30FromHtml(
                              String(savedLetter.html),
                            );
                            if (v && v > 0) net30Saved = v;
                          }
                        } catch {}
                        await updateOpportunityFromLetter(
                          currentLetterId,
                          net30Saved,
                        );

                        // Update letter proposal date and notify parent when letter is saved
                        updateLetterProposalCreatedDate();

                        // Reload the saved letter to ensure it's ready to print
                        try {
                          const { data: savedLetterData } = await supabase
                            .schema("business")
                            .from("letter_proposals")
                            .select("html, title, neta_standard")
                            .eq("id", currentLetterId)
                            .single();

                          if (savedLetterData) {
                            const savedHtml = normalizePricingTermsHtml(
                              savedLetterData.html || letterHtml,
                            );
                            setLetterHtml(savedHtml);
                            savedLetterHtmlRef.current = savedHtml;
                            setIsLetterDirty(false);
                            if (savedLetterData.title) {
                              setLetterProposalName(savedLetterData.title);
                            }
                            if (savedLetterData.neta_standard) {
                              setNetaStandard(savedLetterData.neta_standard);
                            }
                            // Refresh the letters list
                            const { data: updatedLetters } = await supabase
                              .schema("business")
                              .from("letter_proposals")
                              .select(
                                "id, title, html, created_at, quote_number, neta_standard",
                              )
                              .eq("opportunity_id", opportunityId)
                              .order("created_at", { ascending: false });
                            if (updatedLetters) {
                              setLetters(updatedLetters as any);
                            }
                          }
                        } catch (e) {
                          console.error("Error reloading saved letter:", e);
                        }

                        // Keep the letter proposal open so user can print it
                        // No alert or prompt - just keep it open
                      } else {
                        const { data: inserted, error } = await supabase
                          .schema("business")
                          .from("letter_proposals")
                          .insert(payload)
                          .select("id")
                          .single();
                        if (error) throw error;
                        setCurrentLetterId(inserted?.id || null);
                        // Re-read saved HTML to ensure we match the persisted letter
                        let net30Saved2 = computedNet30;
                        try {
                          const { data: savedLetter2 } = await supabase
                            .schema("business")
                            .from("letter_proposals")
                            .select("html")
                            .eq("id", inserted?.id || "")
                            .single();
                          if (savedLetter2?.html) {
                            const v = extractNet30FromHtml(
                              String(savedLetter2.html),
                            );
                            if (v && v > 0) net30Saved2 = v;
                          }
                        } catch {}
                        await updateOpportunityFromLetter(
                          inserted?.id || null,
                          net30Saved2,
                        );

                        // Update letter proposal date and notify parent when letter is saved
                        updateLetterProposalCreatedDate();

                        // Reload the saved letter to ensure it's ready to print
                        try {
                          const { data: savedLetterData } = await supabase
                            .schema("business")
                            .from("letter_proposals")
                            .select("html, title, neta_standard")
                            .eq("id", inserted?.id || "")
                            .single();

                          if (savedLetterData) {
                            const savedHtml = normalizePricingTermsHtml(
                              savedLetterData.html || letterHtml,
                            );
                            setLetterHtml(savedHtml);
                            savedLetterHtmlRef.current = savedHtml;
                            setIsLetterDirty(false);
                            if (savedLetterData.title) {
                              setLetterProposalName(savedLetterData.title);
                            }
                            if (savedLetterData.neta_standard) {
                              setNetaStandard(savedLetterData.neta_standard);
                            }
                            // Refresh the letters list to include the new letter
                            const { data: updatedLetters } = await supabase
                              .schema("business")
                              .from("letter_proposals")
                              .select(
                                "id, title, html, created_at, quote_number, neta_standard",
                              )
                              .eq("opportunity_id", opportunityId)
                              .order("created_at", { ascending: false });
                            if (updatedLetters) {
                              setLetters(updatedLetters as any);
                            }
                          }
                        } catch (e) {
                          console.error("Error reloading saved letter:", e);
                        }

                        // Keep the letter proposal open so user can print it
                        // No alert or prompt - just keep it open
                      }
                    } catch (e: any) {
                      console.error("Save letter failed", e);
                      alert(
                        "Failed to save letter: " +
                          (e?.message || "Unknown error"),
                      );
                    } finally {
                      setIsSavingLetter(false);
                    }
                  }}
                  disabled={isSavingLetter}
                  isLoading={isSavingLetter}
                  className="bg-[#f26722] text-white"
                >
                  Save Letter
                </Button>
                <Button
                  onClick={handlePrintLetter}
                  className="bg-[#f26722] text-white"
                >
                  Print
                </Button>
                <Button onClick={handleCloseLetterProposal}>Close</Button>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2 border-t px-4">
              <label
                htmlFor="letter-name"
                className="text-sm font-medium text-neutral-700 whitespace-nowrap"
              >
                Letter Name (optional):
              </label>
              <input
                id="letter-name"
                type="text"
                value={letterProposalName}
                onChange={(e) => setLetterProposalName(e.target.value)}
                placeholder={`Letter Proposal - ${opportunityData?.title || "Untitled"}`}
                className="flex-1 px-3 py-2 border border-neutral-300 rounded-none shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] text-sm bg-white"
              />
            </div>
          </div>
          {/* Inline control bar, confined to the same width as the letter content */}
          <div className="p-3 border-b bg-neutral-50">
            <div
              className="space-y-3"
              style={{ maxWidth: 900, margin: "0 auto" }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">NETA Standard:</span>
                <select
                  value={netaStandard}
                  onChange={(e) => applyNetaTextByValue(e.target.value)}
                  className="border rounded px-2 py-1 flex-1 min-w-[220px]"
                >
                  {NETA_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.text}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsScopeNotesModalOpen(true);
                  }}
                  variant="outline"
                  size="sm"
                  leftIcon={<FileText className="w-4 h-4" />}
                  className="whitespace-nowrap border-[#f26722] text-[#f26722] hover:bg-[#f26722] hover:text-white dark:border-[#f26722] dark:bg-[#f26722] dark:text-white dark:hover:bg-[#d95d1d] dark:hover:text-white"
                >
                  Scope Notes
                </Button>
                <Button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    runLetterEditorCommand("insertUnorderedList");
                  }}
                  variant="outline"
                  size="sm"
                  title="Bullet List"
                  leftIcon={<List className="w-4 h-4" />}
                  className="whitespace-nowrap border-[#f26722] text-[#f26722] hover:bg-[#f26722] hover:text-white dark:border-[#f26722] dark:bg-[#f26722] dark:text-white dark:hover:bg-[#d95d1d] dark:hover:text-white"
                >
                  Bullets
                </Button>
                <Button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    runLetterEditorCommand("insertOrderedList");
                  }}
                  variant="outline"
                  size="sm"
                  title="Numbered List"
                  leftIcon={<ListOrdered className="w-4 h-4" />}
                  className="whitespace-nowrap border-[#f26722] text-[#f26722] hover:bg-[#f26722] hover:text-white dark:border-[#f26722] dark:bg-[#f26722] dark:text-white dark:hover:bg-[#d95d1d] dark:hover:text-white"
                >
                  Numbered
                </Button>
                <Button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    imageHandlerRef.current?.insertImage();
                  }}
                  variant="outline"
                  size="sm"
                  leftIcon={<ImagePlus className="w-4 h-4" />}
                  className="whitespace-nowrap border-[#f26722] text-[#f26722] hover:bg-[#f26722] hover:text-white dark:border-[#f26722] dark:bg-[#f26722] dark:text-white dark:hover:bg-[#d95d1d] dark:hover:text-white"
                >
                  Insert Image
                </Button>
                <Button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const editor = letterEditorRef.current;
                    if (!editor) return;
                    editor.focus();
                    const pageBreakHtml =
                      '<div class="amp-page-break" contenteditable="false" style="page-break-before:always;break-before:page;border-top:2px dashed #9ca3af;margin:18px 0;position:relative;height:0;cursor:default;user-select:none;" title="Page Break"><span style="position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:white;padding:0 10px;color:#9ca3af;font-size:11px;font-weight:500;letter-spacing:0.5px;pointer-events:none;">PAGE BREAK</span></div>';
                    document.execCommand("insertHTML", false, pageBreakHtml);
                    letterUpdateSourceRef.current = "user";
                    const newHtml = editor.innerHTML;
                    if (newHtml !== letterHtml) {
                      setLetterHtml(newHtml);
                      setIsLetterDirty(true);
                    }
                  }}
                  variant="outline"
                  size="sm"
                  leftIcon={<SeparatorHorizontal className="w-4 h-4" />}
                  className="whitespace-nowrap border-[#f26722] text-[#f26722] hover:bg-[#f26722] hover:text-white dark:border-[#f26722] dark:bg-[#f26722] dark:text-white dark:hover:bg-[#d95d1d] dark:hover:text-white"
                >
                  Page Break
                </Button>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium">Symbols:</span>
                  <SymbolCopyButtons />
                </div>
              </div>
            </div>
          </div>
          <div
            className="flex-1 overflow-auto p-8"
            style={{ background: "#f9f9f9" }}
          >
            <div
              ref={letterEditorRef}
              contentEditable
              suppressContentEditableWarning
              className="letter-proposal-editor"
              style={{
                minHeight: "1000px",
                outline: "none",
                background: "white",
                // Match the printed letter's line spacing so the editor is WYSIWYG.
                fontSize: "11pt",
                lineHeight: 1.5,
                padding: 32,
                borderRadius: 8,
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                maxWidth: 900,
                margin: "0 auto",
              }}
              onInput={(e) => {
                letterUpdateSourceRef.current = "user";
                const newHtml = (e.target as HTMLElement).innerHTML;
                if (newHtml !== letterHtml) {
                  setLetterHtml(newHtml);
                  if (newHtml.trim() !== savedLetterHtmlRef.current.trim()) {
                    setIsLetterDirty(true);
                  }
                }
              }}
              onPaste={(e) => {
                if (imageHandlerRef.current?.handlePaste(e)) return;
                // After the browser drops the pasted HTML in, strip Word/Outlook
                // cruft and collapse the empty-paragraph stacks it brings along,
                // so the gap-on-print problem never gets saved into the letter.
                setTimeout(() => {
                  const editor = letterEditorRef.current;
                  if (!editor) return;
                  sanitizeLetterHtmlNode(editor);
                  letterUpdateSourceRef.current = "user";
                  const newHtml = editor.innerHTML;
                  if (newHtml !== letterHtml) {
                    setLetterHtml(newHtml);
                    if (newHtml.trim() !== savedLetterHtmlRef.current.trim()) {
                      setIsLetterDirty(true);
                    }
                  }
                }, 0);
              }}
              onBlur={() => {}}
            />
            <LetterImageHandler
              ref={imageHandlerRef}
              editorRef={letterEditorRef}
              onContentChange={() => {
                const editor = letterEditorRef.current;
                if (!editor) return;
                letterUpdateSourceRef.current = "user";
                const newHtml = editor.innerHTML;
                if (newHtml !== letterHtml) {
                  setLetterHtml(newHtml);
                  if (newHtml.trim() !== savedLetterHtmlRef.current.trim()) {
                    setIsLetterDirty(true);
                  }
                }
              }}
            />
          </div>

          {/* Scope Notes Modal - rendered inside Letter Proposal so opening it doesn't close the parent */}
          <ProposalScopeNotesModal
            isOpen={isScopeNotesModalOpen}
            onClose={() => setIsScopeNotesModalOpen(false)}
            onInsert={(notesHtml: string) => {
              if (!letterEditorRef.current) return;
              const editorEl = letterEditorRef.current;
              const currentHtml = editorEl.innerHTML;

              // Strategy: Insert scope notes after the Item & Quantity table(s)
              // Look for the last </table> before pricing, or after the scope section
              const container = document.createElement("div");
              container.innerHTML = currentHtml;

              // Check if scope notes section already exists - append to it
              const existingScopeNotes = container.querySelector(
                ".scope-notes-section",
              );
              if (existingScopeNotes) {
                // Append new notes to the existing list
                const existingUl = existingScopeNotes.querySelector("ul");
                if (existingUl) {
                  const tempDiv = document.createElement("div");
                  tempDiv.innerHTML = notesHtml;
                  const newUl = tempDiv.querySelector("ul");
                  if (newUl) {
                    Array.from(newUl.children).forEach((li) => {
                      existingUl.appendChild(li.cloneNode(true));
                    });
                  }
                }
              } else {
                // Find the best insertion point: after the last scope table, before pricing
                // For combined letters, look for the last .amp-scope-block
                const scopeBlocks =
                  container.querySelectorAll(".amp-scope-block");
                const tables = container.querySelectorAll("table.amp-section");

                // Create the notes element
                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = notesHtml;
                const notesElement = tempDiv.firstElementChild;

                if (notesElement) {
                  if (scopeBlocks.length > 0) {
                    // Combined letter: insert after the last scope block
                    const lastScopeBlock = scopeBlocks[scopeBlocks.length - 1];
                    lastScopeBlock.parentNode?.insertBefore(
                      notesElement,
                      lastScopeBlock.nextSibling,
                    );
                  } else if (tables.length > 0) {
                    // Single letter: insert after the last table
                    const lastTable = tables[tables.length - 1];
                    lastTable.parentNode?.insertBefore(
                      notesElement,
                      lastTable.nextSibling,
                    );
                  } else {
                    // Fallback: append to the letter content
                    const letterDiv =
                      container.querySelector("#letter-proposal") || container;
                    // Find the Pricing & Terms section and insert before it
                    const pricingHeaders = Array.from(
                      container.querySelectorAll("b"),
                    ).filter(
                      (el) =>
                        (el.textContent || "").trim() === "Pricing & Terms",
                    );
                    if (pricingHeaders.length > 0) {
                      const pricingSection =
                        pricingHeaders[0].closest(".amp-section") ||
                        pricingHeaders[0].parentElement;
                      if (pricingSection) {
                        pricingSection.parentNode?.insertBefore(
                          notesElement,
                          pricingSection,
                        );
                      } else {
                        letterDiv.appendChild(notesElement);
                      }
                    } else {
                      letterDiv.appendChild(notesElement);
                    }
                  }
                }
              }

              const newHtml = container.innerHTML;
              letterUpdateSourceRef.current = "programmatic";
              setLetterHtml(newHtml);
              editorEl.innerHTML = newHtml;
              setIsLetterDirty(true);
            }}
            userId={user?.id}
          />
        </div>
      </Dialog>

      <ScopeLibraryPickerModal
        open={Boolean(scopeLibraryPicker?.open)}
        onClose={() => setScopeLibraryPicker(null)}
        onSelect={(libraryItem) => {
          if (!scopeLibraryPicker) return;
          applyScopeLibraryItemToRow(
            scopeLibraryPicker.section,
            scopeLibraryPicker.index,
            libraryItem,
          );
          setScopeLibraryPicker(null);
        }}
      />
      <CopyEstimateToOpportunityModal
        open={isCopyToOpportunityOpen}
        onClose={() => setIsCopyToOpportunityOpen(false)}
        currentOpportunityId={opportunityId}
        isSaving={isSaving}
        onSelect={(target) => {
          const quote = quotes[selectedQuoteIndex];
          if (quote) {
            copyQuoteToOpportunity(quote.id, target);
          }
        }}
      />
    </div>
  );
}
