/**
 * Proposal Template Editor (admin-only)
 *
 * Lets admin/super users edit the static/boilerplate sections of the generated
 * proposal letter from the Estimating Presets page. Sections are stored on
 * business.estimating_presets (proposal_*_html columns); NULL means "use the
 * built-in default", so nothing changes until a section is actually edited.
 *
 * Computed letter content (pricing, scope tables, mobilization, day-type
 * logic) is NOT editable here — it stays code-generated in EstimateSheet.tsx
 * and is assembled around these sections. Editable sections may only contain
 * prose plus the documented {{tokens}}.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bold,
  CheckCircle,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Info,
  Italic,
  List,
  ListOrdered,
  Plus,
  RotateCcw,
  Save,
  SeparatorHorizontal,
  Trash2,
  Underline,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  EstimatingPresets,
  getEstimatingPresets,
  updateEstimatingPresets,
} from "../../services/estimatingPresetsService";
import {
  CustomProposalSection,
  DEFAULT_NETA_OPTIONS,
  DEFAULT_PROPOSAL_BRANDING,
  DEFAULT_PROPOSAL_CONCLUSION_HTML,
  DEFAULT_PROPOSAL_FOOTER_HTML,
  DEFAULT_PROPOSAL_HEADER_HTML,
  DEFAULT_PROPOSAL_INTRO_HTML,
  DEFAULT_PROPOSAL_SAFETY_POLICY_HTML,
  DEFAULT_PROPOSAL_SIGNATURE_HTML,
  DEFAULT_PROPOSAL_SIGNER_NAME,
  DEFAULT_PROPOSAL_SIGNER_TITLE,
  DEFAULT_PROPOSAL_TERMS_HTML,
  NetaOption,
  PROPOSAL_SECTION_ANCHORS,
  ProposalBranding,
  ProposalSectionAnchor,
  TEMPLATE_TOKENS,
  escapeProposalText,
  findMissingDefaultTokens,
  findUnknownTokens,
  resolveCustomSections,
  resolveNetaOptions,
  resolveProposalBranding,
  renderTemplateSection,
  sanitizeTemplateHtml,
} from "./proposalTemplateDefaults";
import { BRAND_COLOR } from "@/lib/companyConfig";

/** contentEditable page-break marker — identical to the per-letter editor's. */
const PAGE_BREAK_HTML =
  '<div class="amp-page-break" contenteditable="false" style="page-break-before:always;break-before:page;border-top:2px dashed #9ca3af;margin:18px 0;position:relative;height:0;cursor:default;user-select:none;" title="Page Break"><span style="position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:white;padding:0 10px;color:#9ca3af;font-size:11px;font-weight:500;letter-spacing:0.5px;pointer-events:none;">PAGE BREAK</span></div>';

/**
 * Reusable rich-text editor for one template section: contentEditable body with
 * a bold/italic/underline/bullets/numbered/page-break/image toolbar. Remounts
 * when `seedVersion` changes (load / reset-to-default) so React doesn't fight
 * live edits. Image insertion embeds the picked file as a data-URL <img>,
 * mirroring LetterImageHandler's approach in the per-letter editor.
 */
function RichSectionEditor({
  seedHtml,
  seedVersion,
  onChange,
  minHeightClass = "min-h-[120px]",
}: {
  seedHtml: string;
  seedVersion: number;
  onChange: (html: string) => void;
  minHeightClass?: string;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const emit = () => {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  /** Ensure the caret is inside the editor before an insert command. */
  const ensureCaret = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    const inEditor =
      sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode);
    if (!inEditor) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  };

  const runCommand = (command: string) => {
    ensureCaret();
    document.execCommand(command, false);
    emit();
  };

  const insertHtml = (html: string) => {
    ensureCaret();
    document.execCommand("insertHTML", false, html);
    emit();
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file?.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () =>
      insertHtml(
        `<img src="${reader.result as string}" style="max-width:100%;height:auto;" />`,
      );
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const toolButton =
    "p-1.5 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-dark-300 transition-colors";

  return (
    <div className="border border-neutral-300 dark:border-neutral-600">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-200">
        {[
          { command: "bold", Icon: Bold, title: "Bold" },
          { command: "italic", Icon: Italic, title: "Italic" },
          { command: "underline", Icon: Underline, title: "Underline" },
          {
            command: "insertUnorderedList",
            Icon: List,
            title: "Bulleted list",
          },
          {
            command: "insertOrderedList",
            Icon: ListOrdered,
            title: "Numbered list",
          },
        ].map(({ command, Icon, title }) => (
          <button
            key={command}
            type="button"
            title={title}
            onMouseDown={(e) => {
              e.preventDefault();
              runCommand(command);
            }}
            className={toolButton}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
        <span className="w-px h-5 bg-neutral-300 dark:bg-neutral-600 mx-1" />
        <button
          type="button"
          title="Insert page break"
          onMouseDown={(e) => {
            e.preventDefault();
            insertHtml(PAGE_BREAK_HTML);
          }}
          className={toolButton}
        >
          <SeparatorHorizontal className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Insert image"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className={toolButton}
        >
          <ImageIcon className="h-4 w-4" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
      </div>
      {/* Letter content is authored against a white page, so the editor keeps a
          light background in both themes. */}
      <div
        key={seedVersion}
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        dangerouslySetInnerHTML={{ __html: seedHtml }}
        onInput={emit}
        className={`${minHeightClass} max-h-[480px] overflow-y-auto p-4 bg-white text-neutral-900 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand`}
        style={{ fontFamily: "Arial, sans-serif" }}
      />
    </div>
  );
}

/**
 * One branding image field: a thumbnail preview plus Upload / Reset controls.
 * Uploads are embedded as data-URLs (same approach as the section image button)
 * so they travel with the saved template — no separate asset hosting needed.
 */
function BrandingImageField({
  label,
  help,
  value,
  isDefault,
  onChange,
  onReset,
}: {
  label: string;
  help?: string;
  value: string;
  isDefault: boolean;
  onChange: (dataUrl: string) => void;
  onReset: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file?.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
        {label}
      </label>
      {help && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
          {help}
        </p>
      )}
      <div className="flex items-center gap-3">
        <div className="w-28 h-16 flex items-center justify-center border border-neutral-300 dark:border-neutral-600 bg-white overflow-hidden shrink-0">
          {value ? (
            <img
              src={value}
              alt={label}
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <span className="text-xs text-neutral-400">No image</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand
                       border border-brand rounded-none hover:bg-brand hover:text-white transition-colors"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Upload Image
          </button>
          {!isDefault && (
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400
                         border border-neutral-300 dark:border-neutral-600 rounded-none
                         hover:bg-neutral-50 dark:hover:bg-dark-200 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to Default
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
      </div>
    </div>
  );
}

type SectionKey =
  | "header"
  | "intro"
  | "terms"
  | "conclusion"
  | "signature"
  | "safety"
  | "footer";

interface SectionConfig {
  key: SectionKey;
  column:
    | "proposal_header_html"
    | "proposal_intro_html"
    | "proposal_terms_html"
    | "proposal_conclusion_html"
    | "proposal_signature_html"
    | "proposal_safety_policy_html"
    | "proposal_footer_html";
  label: string;
  description: string;
  defaultHtml: string;
}

const SECTIONS: SectionConfig[] = [
  {
    key: "header",
    column: "proposal_header_html",
    label: "Header / Top Block",
    description:
      "Letter number, date, and the customer name / company / address block at the very top. The AMP logo banner above it is generated automatically.",
    defaultHtml: DEFAULT_PROPOSAL_HEADER_HTML,
  },
  {
    key: "intro",
    column: "proposal_intro_html",
    label: "Introduction",
    description:
      "Greeting, the furnish-services sentence, and the NETA standard line. Appears right after the letter header and customer address.",
    defaultHtml: DEFAULT_PROPOSAL_INTRO_HTML,
  },
  {
    key: "terms",
    column: "proposal_terms_html",
    label: "Terms & Conditions",
    description:
      'The payment-terms sentence and the "This price is based upon the following" numbered list. Appears after the generated pricing block.',
    defaultHtml: DEFAULT_PROPOSAL_TERMS_HTML,
  },
  {
    key: "conclusion",
    column: "proposal_conclusion_html",
    label: "Conclusion",
    description:
      "Validity statement, core-principles paragraph, and the purchase-order email line.",
    defaultHtml: DEFAULT_PROPOSAL_CONCLUSION_HTML,
  },
  {
    key: "signature",
    column: "proposal_signature_html",
    label: "Signature Block",
    description:
      "Sign-off, signature image, and signer name/title. The signer name and title tokens are filled from the fields below.",
    defaultHtml: DEFAULT_PROPOSAL_SIGNATURE_HTML,
  },
  {
    key: "safety",
    column: "proposal_safety_policy_html",
    label: "Safety Policy",
    description:
      "The Lockout/Tagout safety policy page body. The page header is generated automatically.",
    defaultHtml: DEFAULT_PROPOSAL_SAFETY_POLICY_HTML,
  },
  {
    key: "footer",
    column: "proposal_footer_html",
    label: "Footer",
    description:
      "The footer line that follows the proposal main body (address / phone).",
    defaultHtml: DEFAULT_PROPOSAL_FOOTER_HTML,
  },
];

const ANCHOR_LABEL: Record<ProposalSectionAnchor, string> = Object.fromEntries(
  PROPOSAL_SECTION_ANCHORS.map((a) => [a.value, a.label]),
) as Record<ProposalSectionAnchor, string>;

let customSectionIdCounter = 0;
function makeCustomSectionId(): string {
  customSectionIdCounter += 1;
  return `cs-${Date.now().toString(36)}-${customSectionIdCounter}`;
}

/** Whitespace-insensitive compare so an untouched section saves as NULL
 *  (keeping the built-in default as the live fallback). */
function normalizeHtml(html: string): string {
  return html.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
}

/** Sample token values for the live preview. */
const PREVIEW_TOKENS: Record<string, string> = {
  contactName: "Jane Smith",
  letterNumber: "12345",
  letterDate: new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }),
  companyName: "Sample Company, Inc.",
  customerAddress: "123 Main Street, Huntsville, AL 35801",
  projectTitle: "Sample Substation Maintenance",
  jobsiteLocation: ", Huntsville, AL",
  netaStandardText:
    "All tests will be performed in accordance with ANSI/NETA MTS 2023 - Standard for Maintenance Testing Specifications for Electrical power Equipment and Systems.",
  currentYear: String(new Date().getFullYear()),
  alternateRatesNote: "",
  signatureImage: DEFAULT_PROPOSAL_BRANDING.signatureImage,
};

export default function ProposalTemplateEditor({
  userId,
}: {
  userId?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showTokens, setShowTokens] = useState(true);

  // Current HTML per section (what will be saved).
  const [sectionHtml, setSectionHtml] = useState<Record<SectionKey, string>>(
    () =>
      Object.fromEntries(SECTIONS.map((s) => [s.key, s.defaultHtml])) as Record<
        SectionKey,
        string
      >,
  );
  // Seed content for the contentEditable editors. Bumping `version` remounts
  // the editor with new content (load / reset-to-default) without React
  // fighting the user's live edits.
  const [seeds, setSeeds] = useState<
    Record<SectionKey, { html: string; version: number }>
  >(
    () =>
      Object.fromEntries(
        SECTIONS.map((s) => [s.key, { html: s.defaultHtml, version: 0 }]),
      ) as Record<SectionKey, { html: string; version: number }>,
  );
  const [signerName, setSignerName] = useState(DEFAULT_PROPOSAL_SIGNER_NAME);
  const [signerTitle, setSignerTitle] = useState(DEFAULT_PROPOSAL_SIGNER_TITLE);

  // Adjustable branding: logos, banner text, safety title, signature image.
  const [branding, setBranding] = useState<ProposalBranding>(
    DEFAULT_PROPOSAL_BRANDING,
  );
  const updateBranding = (patch: Partial<ProposalBranding>) => {
    setBranding((prev) => ({ ...prev, ...patch }));
    markChanged();
  };

  // Editable NETA-standard option list.
  const [netaOptions, setNetaOptions] =
    useState<NetaOption[]>(DEFAULT_NETA_OPTIONS);
  // Admin-added custom sections. `html` is the live (to-be-saved) value;
  // `seedHtml`/`seedVersion` only change on load, so typing doesn't make React
  // rewrite the contentEditable DOM (which would jump the cursor) — exactly
  // like the built-in sections' separate `seeds` state.
  const [customSections, setCustomSections] = useState<
    (CustomProposalSection & { seedHtml: string; seedVersion: number })[]
  >([]);

  // Scroll targets for the floating quick-nav shown while the preview is open.
  const topRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const presets = await getEstimatingPresets();
        if (cancelled) return;
        const nextHtml = {} as Record<SectionKey, string>;
        const nextSeeds = {} as Record<
          SectionKey,
          { html: string; version: number }
        >;
        for (const section of SECTIONS) {
          const dbValue = (presets as EstimatingPresets)[section.column];
          const html =
            typeof dbValue === "string" && dbValue.trim()
              ? dbValue
              : section.defaultHtml;
          nextHtml[section.key] = html;
          nextSeeds[section.key] = { html, version: 1 };
        }
        setSectionHtml(nextHtml);
        setSeeds(nextSeeds);
        setSignerName(
          (presets.proposal_signer_name || "").trim() ||
            DEFAULT_PROPOSAL_SIGNER_NAME,
        );
        setSignerTitle(
          (presets.proposal_signer_title || "").trim() ||
            DEFAULT_PROPOSAL_SIGNER_TITLE,
        );
        setNetaOptions(resolveNetaOptions(presets.proposal_neta_options));
        setBranding(resolveProposalBranding(presets.proposal_branding));
        setCustomSections(
          resolveCustomSections(presets.proposal_custom_sections).map((s) => ({
            ...s,
            seedHtml: s.html,
            seedVersion: 1,
          })),
        );
      } catch (err) {
        console.error("Error loading proposal template:", err);
        if (!cancelled)
          setError(
            "Failed to load the proposal template. Showing built-in defaults.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const markChanged = () => {
    setHasChanges(true);
    setSuccessMessage(null);
  };

  const handleSectionInput = (key: SectionKey, html: string) => {
    setSectionHtml((prev) => ({ ...prev, [key]: html }));
    markChanged();
  };

  const handleResetSection = (section: SectionConfig) => {
    if (
      !window.confirm(
        `Reset the "${section.label}" section to the built-in default? Your edits to this section will be lost when you save.`,
      )
    )
      return;
    setSectionHtml((prev) => ({ ...prev, [section.key]: section.defaultHtml }));
    setSeeds((prev) => ({
      ...prev,
      [section.key]: {
        html: section.defaultHtml,
        version: prev[section.key].version + 1,
      },
    }));
    markChanged();
  };

  // ── NETA option handlers ──
  const addNetaOption = () => {
    setNetaOptions((prev) => [
      ...prev,
      {
        // Counter suffix keeps values unique even for rapid double-clicks;
        // the value doubles as the React key and the per-letter identifier.
        value: makeCustomSectionId().replace(/^cs-/, "neta-"),
        label: "New Standard",
        text: "",
      },
    ]);
    markChanged();
  };
  const updateNetaOption = (
    index: number,
    field: "label" | "text",
    value: string,
  ) => {
    setNetaOptions((prev) =>
      prev.map((o, i) => (i === index ? { ...o, [field]: value } : o)),
    );
    markChanged();
  };
  const removeNetaOption = (index: number) => {
    setNetaOptions((prev) => prev.filter((_, i) => i !== index));
    markChanged();
  };
  const resetNetaOptions = () => {
    if (
      !window.confirm(
        "Reset the NETA standard options to the built-in defaults? Your changes will be lost when you save.",
      )
    )
      return;
    setNetaOptions(DEFAULT_NETA_OPTIONS.map((o) => ({ ...o })));
    markChanged();
  };

  // ── Custom section handlers ──
  const addCustomSection = () => {
    setCustomSections((prev) => [
      ...prev,
      {
        id: makeCustomSectionId(),
        label: "Custom Section",
        html: "",
        anchor: "after_conclusion",
        seedHtml: "",
        seedVersion: 1,
      },
    ]);
    markChanged();
  };
  const updateCustomSection = (
    id: string,
    patch: Partial<CustomProposalSection>,
  ) => {
    setCustomSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
    markChanged();
  };
  const removeCustomSection = (id: string) => {
    if (
      !window.confirm(
        "Delete this custom section? It will be removed from generated letters when you save.",
      )
    )
      return;
    setCustomSections((prev) => prev.filter((s) => s.id !== id));
    markChanged();
  };
  const moveCustomSection = (id: string, dir: -1 | 1) => {
    setCustomSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
    markChanged();
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const payload: Partial<EstimatingPresets> = {};
      for (const section of SECTIONS) {
        const clean = sanitizeTemplateHtml(sectionHtml[section.key]);
        // Store NULL when the section matches the built-in default so future
        // default-text updates in code still apply until someone edits.
        payload[section.column] =
          normalizeHtml(clean) === normalizeHtml(section.defaultHtml)
            ? null
            : clean;
      }
      const name = signerName.trim();
      const title = signerTitle.trim();
      payload.proposal_signer_name =
        !name || name === DEFAULT_PROPOSAL_SIGNER_NAME ? null : name;
      payload.proposal_signer_title =
        !title || title === DEFAULT_PROPOSAL_SIGNER_TITLE ? null : title;

      // NETA options: drop entries with empty text; store NULL when unchanged
      // from the built-in defaults so future default updates keep applying.
      const cleanedNeta = netaOptions
        .map((o) => ({
          value: o.value.trim(),
          label: o.label.trim() || o.value.trim(),
          text: o.text.trim(),
        }))
        .filter((o) => o.value && o.text);
      payload.proposal_neta_options =
        JSON.stringify(cleanedNeta) === JSON.stringify(DEFAULT_NETA_OPTIONS)
          ? null
          : cleanedNeta;

      // Custom sections: sanitize + drop empty; store NULL when none.
      const cleanedCustom = customSections
        .map((s) => ({
          id: s.id,
          label: s.label.trim() || "Custom Section",
          html: sanitizeTemplateHtml(s.html).trim(),
          anchor: s.anchor,
        }))
        .filter((s) => s.html);
      payload.proposal_custom_sections = cleanedCustom.length
        ? cleanedCustom
        : null;

      // Branding: normalize (empty field → default), store NULL when every
      // field matches the built-in defaults so future default updates apply.
      const cleanedBranding = resolveProposalBranding(branding);
      payload.proposal_branding =
        JSON.stringify(cleanedBranding) ===
        JSON.stringify(DEFAULT_PROPOSAL_BRANDING)
          ? null
          : cleanedBranding;

      await updateEstimatingPresets(payload, userId);
      setHasChanges(false);
      setSuccessMessage(
        "Proposal template saved. All newly generated proposals will use the updated text.",
      );
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error("Error saving proposal template:", err);
      setError(
        "Failed to save the proposal template. If this persists, make sure the add_proposal_template_columns.sql migration has been run.",
      );
    } finally {
      setSaving(false);
    }
  };

  const effectiveBranding = resolveProposalBranding(branding);
  const previewTokens: Record<string, string> = {
    ...PREVIEW_TOKENS,
    netaStandardText: netaOptions[0]?.text || PREVIEW_TOKENS.netaStandardText,
    signerName: signerName.trim() || DEFAULT_PROPOSAL_SIGNER_NAME,
    signerTitle: signerTitle.trim() || DEFAULT_PROPOSAL_SIGNER_TITLE,
    signatureImage: effectiveBranding.signatureImage,
  };

  const renderPreviewSection = (key: SectionKey) =>
    renderTemplateSection(
      sanitizeTemplateHtml(sectionHtml[key]),
      previewTokens,
    );

  /** All custom sections at a given anchor, rendered in order. */
  const renderCustomAt = (anchor: ProposalSectionAnchor) =>
    customSections
      .filter((s) => s.anchor === anchor && s.html.trim())
      .map((s) => renderTemplateSection(sanitizeTemplateHtml(s.html), previewTokens))
      .join("");

  const previewHtml = `
    <div style="max-width: 800px; margin: 0 auto; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #111;">
      <div style="display:flex;align-items:center;padding-bottom:6px;margin-bottom:12px;border-bottom:1px solid #ccc;">
        ${effectiveBranding.letterLogoUrl ? `<img src="${effectiveBranding.letterLogoUrl}" alt="Logo" style="height: 24px; margin-right: 8px;" />` : ""}
        <span style="font-size: 1em; font-weight: bold; color: #333;">${escapeProposalText(effectiveBranding.letterBannerText)}</span>
      </div>
      ${renderPreviewSection("header")}
      ${renderCustomAt("after_header")}
      ${renderPreviewSection("intro")}
      ${renderCustomAt("after_intro")}
      <div style="margin:12px 0;padding:10px;border:1px dashed ${BRAND_COLOR};border-radius:8px;background:#fff7f2;color:#9a3412;text-align:center;">[ Generated scope table appears here ]</div>
      ${renderCustomAt("after_scope")}
      <div style="margin-top: 12px;"><b style="font-size: 1.15em;">Pricing &amp; Terms</b></div>
      <div style="margin:4px 0;padding:10px;border:1px dashed ${BRAND_COLOR};border-radius:8px;background:#fff7f2;color:#9a3412;text-align:center;">[ Generated pricing options &amp; mobilization line appear here ]</div>
      ${renderCustomAt("after_pricing")}
      ${renderPreviewSection("terms")}
      ${renderCustomAt("after_terms")}
      ${renderPreviewSection("conclusion")}
      ${renderCustomAt("after_conclusion")}
      ${renderPreviewSection("signature")}
      ${renderCustomAt("after_signature")}
      <div style="text-align:center; margin-top: 8px; font-size: 0.9em; color: #444;">END OF LETTER</div>
      ${renderPreviewSection("footer")}
      ${renderCustomAt("before_safety")}
      <div style="margin:18px 0;border-top:2px dashed #9ca3af;text-align:center;color:#9ca3af;font-size:11px;font-weight:500;letter-spacing:0.5px;line-height:0;"><span style="background:white;padding:0 10px;position:relative;top:-8px;">PAGE BREAK</span></div>
      <div>
        <div style="display: flex; align-items: center; border-bottom: 2px solid ${BRAND_COLOR}; padding-bottom: 4px; margin-bottom: 8px;">
          ${effectiveBranding.safetyLogoUrl ? `<img src="${effectiveBranding.safetyLogoUrl}" alt="Logo" style="height: 32px; margin-right: 8px;" />` : ""}
          <span style="font-size: 1.15em; font-weight: bold; color: #333;">${escapeProposalText(effectiveBranding.safetyTitle)}</span>
        </div>
        ${renderPreviewSection("safety")}
      </div>
    </div>
  `;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div ref={topRef} className="space-y-6">
      {/* Status messages */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-none p-4">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}
      {successMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-none p-4">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle className="h-5 w-5 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        </div>
      )}
      {hasChanges && !successMessage && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-none p-4">
          <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>You have unsaved template changes.</span>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-2xl">
          Edits here apply to <b>all newly generated proposals</b> (single and
          combined letters). Pricing, scope tables, and mobilization are always
          generated automatically and cannot be edited here. Letters that were
          already generated and saved are not affected.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300
                       bg-white dark:bg-dark-100 border border-neutral-300 dark:border-neutral-600 rounded-none
                       hover:bg-neutral-50 dark:hover:bg-dark-200 transition-colors"
          >
            {showPreview ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            {showPreview ? "Hide Preview" : "Live Preview"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white
                       bg-brand hover:bg-brand-dark rounded-none shadow-sm
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Template"}
          </button>
        </div>
      </div>

      {/* Token reference */}
      <div className="bg-white dark:bg-dark-150 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-700">
        <button
          type="button"
          onClick={() => setShowTokens((v) => !v)}
          className="w-full flex items-center gap-2 px-6 py-4 text-left"
        >
          <Info className="h-5 w-5 text-brand" />
          <span className="text-lg font-semibold text-neutral-900 dark:text-white">
            Available Placeholders
          </span>
          <span className="ml-auto text-sm text-neutral-500 dark:text-neutral-400">
            {showTokens ? "Hide" : "Show"}
          </span>
        </button>
        {showTokens && (
          <div className="px-6 pb-6">
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">
              These placeholders are filled automatically each time a proposal
              is generated. Type them exactly as shown (including the double
              curly braces).
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
              {TEMPLATE_TOKENS.map(({ token, description }) => (
                <div key={token} className="flex gap-2 text-sm">
                  <code className="shrink-0 px-1.5 py-0.5 bg-neutral-100 dark:bg-dark-200 border border-neutral-200 dark:border-neutral-700 text-brand font-mono">
                    {token}
                  </code>
                  <span className="text-neutral-600 dark:text-neutral-400">
                    {description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Signer fields */}
      <div className="bg-white dark:bg-dark-150 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-700 p-6">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-1">
          Signer
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          Fills the {"{{signerName}}"} and {"{{signerTitle}}"} placeholders in
          the signature block.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Signer Name
            </label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => {
                setSignerName(e.target.value);
                markChanged();
              }}
              className="block w-full px-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm
                         focus:ring-brand focus:border-brand
                         bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Signer Title
            </label>
            <input
              type="text"
              value={signerTitle}
              onChange={(e) => {
                setSignerTitle(e.target.value);
                markChanged();
              }}
              className="block w-full px-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm
                         focus:ring-brand focus:border-brand
                         bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Branding & images */}
      <div className="bg-white dark:bg-dark-150 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-700 p-6">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-1">
          Branding &amp; Images
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          The logo and company text above the letter, the logo and title above
          the safety policy page, and the signer's signature image. These apply
          to both single and combined letters.
        </p>

        {/* Letter header */}
        <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 mb-3">
          Letter Header
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          <BrandingImageField
            label="Logo above the letter"
            value={branding.letterLogoUrl}
            isDefault={
              branding.letterLogoUrl === DEFAULT_PROPOSAL_BRANDING.letterLogoUrl
            }
            onChange={(dataUrl) => updateBranding({ letterLogoUrl: dataUrl })}
            onReset={() =>
              updateBranding({
                letterLogoUrl: DEFAULT_PROPOSAL_BRANDING.letterLogoUrl,
              })
            }
          />
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Company text next to the logo
            </label>
            <input
              type="text"
              value={branding.letterBannerText}
              onChange={(e) =>
                updateBranding({ letterBannerText: e.target.value })
              }
              className="block w-full px-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm
                         focus:ring-brand focus:border-brand bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
            />
          </div>
        </div>

        {/* Safety policy header */}
        <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 mb-3">
          Safety Policy Header
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          <BrandingImageField
            label="Logo above the safety policy"
            value={branding.safetyLogoUrl}
            isDefault={
              branding.safetyLogoUrl === DEFAULT_PROPOSAL_BRANDING.safetyLogoUrl
            }
            onChange={(dataUrl) => updateBranding({ safetyLogoUrl: dataUrl })}
            onReset={() =>
              updateBranding({
                safetyLogoUrl: DEFAULT_PROPOSAL_BRANDING.safetyLogoUrl,
              })
            }
          />
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Safety policy title
            </label>
            <input
              type="text"
              value={branding.safetyTitle}
              onChange={(e) => updateBranding({ safetyTitle: e.target.value })}
              className="block w-full px-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm
                         focus:ring-brand focus:border-brand bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
            />
          </div>
        </div>

        {/* Signature */}
        <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 mb-3">
          Signature
        </h3>
        <BrandingImageField
          label="Signer's signature image"
          help="Fills the {{signatureImage}} placeholder in the signature block."
          value={branding.signatureImage}
          isDefault={
            branding.signatureImage === DEFAULT_PROPOSAL_BRANDING.signatureImage
          }
          onChange={(dataUrl) => updateBranding({ signatureImage: dataUrl })}
          onReset={() =>
            updateBranding({
              signatureImage: DEFAULT_PROPOSAL_BRANDING.signatureImage,
            })
          }
        />
      </div>

      {/* Section editors */}
      {SECTIONS.map((section) => {
        const html = sectionHtml[section.key];
        const unknownTokens = findUnknownTokens(html);
        const missingTokens = findMissingDefaultTokens(
          html,
          section.defaultHtml,
        );
        const seed = seeds[section.key];
        return (
          <div
            key={section.key}
            className="bg-white dark:bg-dark-150 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-700 p-6"
          >
            <div className="flex items-start justify-between gap-4 mb-1">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                {section.label}
              </h2>
              <button
                type="button"
                onClick={() => handleResetSection(section)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400
                           bg-white dark:bg-dark-100 border border-neutral-300 dark:border-neutral-600 rounded-none
                           hover:bg-neutral-50 dark:hover:bg-dark-200 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset to Default
              </button>
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-3">
              {section.description}
            </p>

            {missingTokens.length > 0 && (
              <div className="mb-3 flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-none p-3">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                  This section no longer contains{" "}
                  {missingTokens.map((t) => `{{${t}}}`).join(", ")} — the
                  corresponding value will not appear in generated letters.
                </span>
              </div>
            )}
            {unknownTokens.length > 0 && (
              <div className="mb-3 flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-none p-3">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                  Unrecognized placeholder
                  {unknownTokens.length > 1 ? "s" : ""}:{" "}
                  {unknownTokens.map((t) => `{{${t}}}`).join(", ")} — these will
                  appear as literal text in generated letters.
                </span>
              </div>
            )}

            <RichSectionEditor
              seedHtml={seed.html}
              seedVersion={seed.version}
              onChange={(newHtml) => handleSectionInput(section.key, newHtml)}
            />
          </div>
        );
      })}

      {/* NETA standard options */}
      <div className="bg-white dark:bg-dark-150 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-700 p-6">
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            NETA Standard Options
          </h2>
          <button
            type="button"
            onClick={resetNetaOptions}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400
                       bg-white dark:bg-dark-100 border border-neutral-300 dark:border-neutral-600 rounded-none
                       hover:bg-neutral-50 dark:hover:bg-dark-200 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to Default
          </button>
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          The choices for the NETA Standard dropdown when generating a letter.
          The selected option fills the {"{{netaStandardText}}"} placeholder in
          the Introduction section.
        </p>
        <div className="space-y-3">
          {netaOptions.map((opt, index) => (
            <div
              key={opt.value}
              className="flex items-start gap-3 border border-neutral-200 dark:border-neutral-700 p-3"
            >
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={opt.label}
                  onChange={(e) =>
                    updateNetaOption(index, "label", e.target.value)
                  }
                  placeholder="Short label (e.g. MTS 2023)"
                  className="block w-full px-3 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-none
                             focus:ring-brand focus:border-brand bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
                />
                <textarea
                  value={opt.text}
                  onChange={(e) =>
                    updateNetaOption(index, "text", e.target.value)
                  }
                  rows={2}
                  placeholder="The full sentence inserted into the letter"
                  className="block w-full px-3 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-none
                             focus:ring-brand focus:border-brand bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
                />
              </div>
              <button
                type="button"
                onClick={() => removeNetaOption(index)}
                title="Remove option"
                className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addNetaOption}
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand
                     border border-brand rounded-none hover:bg-brand hover:text-white transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Option
        </button>
      </div>

      {/* Custom sections */}
      <div className="bg-white dark:bg-dark-150 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-700 p-6">
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Custom Sections
          </h2>
          <button
            type="button"
            onClick={addCustomSection}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand
                       border border-brand rounded-none hover:bg-brand hover:text-white transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Section
          </button>
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          Add your own sections and choose where each one appears in the letter.
          Use the arrows to change the order sections at the same location are
          shown. All template placeholders work here too.
        </p>
        {customSections.length === 0 ? (
          <p className="text-sm text-neutral-400 dark:text-neutral-500 italic">
            No custom sections yet.
          </p>
        ) : (
          <div className="space-y-4">
            {customSections.map((section, index) => (
              <div
                key={section.id}
                className="border border-neutral-200 dark:border-neutral-700 p-4"
              >
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <input
                    type="text"
                    value={section.label}
                    onChange={(e) =>
                      updateCustomSection(section.id, { label: e.target.value })
                    }
                    placeholder="Section name (for your reference)"
                    className="flex-1 min-w-[180px] px-3 py-1.5 text-sm font-medium border border-neutral-300 dark:border-neutral-600 rounded-none
                               focus:ring-brand focus:border-brand bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
                  />
                  <label className="text-sm text-neutral-600 dark:text-neutral-400">
                    Location:
                  </label>
                  <select
                    value={section.anchor}
                    onChange={(e) =>
                      updateCustomSection(section.id, {
                        anchor: e.target.value as ProposalSectionAnchor,
                      })
                    }
                    className="px-2 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-none
                               bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
                  >
                    {PROPOSAL_SECTION_ANCHORS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => moveCustomSection(section.id, -1)}
                    disabled={index === 0}
                    title="Move up"
                    className="p-1.5 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-dark-200 disabled:opacity-30 transition-colors"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveCustomSection(section.id, 1)}
                    disabled={index === customSections.length - 1}
                    title="Move down"
                    className="p-1.5 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-dark-200 disabled:opacity-30 transition-colors"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCustomSection(section.id)}
                    title="Delete section"
                    className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <RichSectionEditor
                  seedHtml={section.seedHtml}
                  seedVersion={section.seedVersion}
                  onChange={(newHtml) =>
                    updateCustomSection(section.id, { html: newHtml })
                  }
                  minHeightClass="min-h-[100px]"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live preview */}
      {showPreview && (
        <div
          ref={previewRef}
          className="bg-white dark:bg-dark-150 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-700 p-6"
        >
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-1">
            Live Preview
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
            Sample data with your current (unsaved) edits. Dashed boxes mark
            content that is generated automatically per proposal.
          </p>
          <div className="border border-neutral-300 dark:border-neutral-600 bg-white p-8 overflow-x-auto">
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </div>
      )}

      {/* Floating quick-nav (only while the preview is open) */}
      {showPreview && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
          <button
            type="button"
            onClick={() =>
              previewRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white
                       bg-brand hover:bg-brand-dark rounded-none shadow-lg transition-colors"
          >
            <ArrowDown className="h-4 w-4" />
            Jump to Preview
          </button>
          <button
            type="button"
            onClick={() =>
              topRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300
                       bg-white dark:bg-dark-100 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-lg
                       hover:bg-neutral-50 dark:hover:bg-dark-200 transition-colors"
          >
            <ArrowUp className="h-4 w-4" />
            Go to Top
          </button>
        </div>
      )}
    </div>
  );
}
