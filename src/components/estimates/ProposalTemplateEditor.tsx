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
  Bold,
  CheckCircle,
  Eye,
  EyeOff,
  Info,
  Italic,
  RotateCcw,
  Save,
  Underline,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  EstimatingPresets,
  getEstimatingPresets,
  updateEstimatingPresets,
} from "../../services/estimatingPresetsService";
import {
  DEFAULT_PROPOSAL_CONCLUSION_HTML,
  DEFAULT_PROPOSAL_INTRO_HTML,
  DEFAULT_PROPOSAL_SAFETY_POLICY_HTML,
  DEFAULT_PROPOSAL_SIGNATURE_HTML,
  DEFAULT_PROPOSAL_SIGNER_NAME,
  DEFAULT_PROPOSAL_SIGNER_TITLE,
  DEFAULT_PROPOSAL_TERMS_HTML,
  TEMPLATE_TOKENS,
  findMissingDefaultTokens,
  findUnknownTokens,
  renderTemplateSection,
  sanitizeTemplateHtml,
} from "./proposalTemplateDefaults";

type SectionKey = "intro" | "terms" | "conclusion" | "signature" | "safety";

interface SectionConfig {
  key: SectionKey;
  column:
    | "proposal_intro_html"
    | "proposal_terms_html"
    | "proposal_conclusion_html"
    | "proposal_signature_html"
    | "proposal_safety_policy_html";
  label: string;
  description: string;
  defaultHtml: string;
}

const SECTIONS: SectionConfig[] = [
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
];

/** Whitespace-insensitive compare so an untouched section saves as NULL
 *  (keeping the built-in default as the live fallback). */
function normalizeHtml(html: string): string {
  return html.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
}

/** Sample token values for the live preview. */
const PREVIEW_TOKENS: Record<string, string> = {
  contactName: "Jane Smith",
  projectTitle: "Sample Substation Maintenance",
  jobsiteLocation: ", Huntsville, AL",
  netaStandardText:
    "All tests will be performed in accordance with ANSI/NETA MTS 2023 - Standard for Maintenance Testing Specifications for Electrical power Equipment and Systems.",
  currentYear: String(new Date().getFullYear()),
  alternateRatesNote: "",
  signatureImage: "/img/brian-rodgers-signature.jpg",
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

  const editorRefs = useRef<Partial<Record<SectionKey, HTMLDivElement | null>>>(
    {},
  );

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

  const runEditorCommand = (key: SectionKey, command: string) => {
    const editor = editorRefs.current[key];
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false);
    handleSectionInput(key, editor.innerHTML);
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

  const previewTokens: Record<string, string> = {
    ...PREVIEW_TOKENS,
    signerName: signerName.trim() || DEFAULT_PROPOSAL_SIGNER_NAME,
    signerTitle: signerTitle.trim() || DEFAULT_PROPOSAL_SIGNER_TITLE,
  };

  const renderPreviewSection = (key: SectionKey) =>
    renderTemplateSection(
      sanitizeTemplateHtml(sectionHtml[key]),
      previewTokens,
    );

  const previewHtml = `
    <div style="max-width: 800px; margin: 0 auto; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #111;">
      <div style="display:flex;align-items:center;padding-bottom:6px;margin-bottom:12px;border-bottom:1px solid #ccc;">
        <span style="font-size: 1em; font-weight: bold; color: #333;">AMP Quality Energy Services</span>
      </div>
      <div><b style="font-size: 1.2em;">Letter # 12345</b></div>
      <div style="margin-bottom: 8px;"><b>${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</b></div>
      <div>Jane Smith<br/>Sample Company, Inc.<br/>123 Main Street, Huntsville, AL 35801<br/></div>
      ${renderPreviewSection("intro")}
      <div style="margin:12px 0;padding:10px;border:1px dashed #f26722;border-radius:8px;background:#fff7f2;color:#9a3412;text-align:center;">[ Generated scope table appears here ]</div>
      <div style="margin-top: 12px;"><b style="font-size: 1.15em;">Pricing &amp; Terms</b></div>
      <div style="margin:4px 0;padding:10px;border:1px dashed #f26722;border-radius:8px;background:#fff7f2;color:#9a3412;text-align:center;">[ Generated pricing options &amp; mobilization line appear here ]</div>
      ${renderPreviewSection("terms")}
      ${renderPreviewSection("conclusion")}
      ${renderPreviewSection("signature")}
      <div style="text-align:center; margin-top: 8px; font-size: 0.9em; color: #444;">END OF LETTER</div>
      <div style="width:100%;font-size:0.85em;color:#555;border-top:1px solid #ccc;padding:4px 0;text-align:center;margin-top:12px;">P.O. Box 1725 | Decatur, Alabama 35602 | (256) 513-8255</div>
      <div style="margin-top: 24px;">
        <div style="display: flex; align-items: center; border-bottom: 2px solid #f26722; padding-bottom: 4px; margin-bottom: 8px;">
          <span style="font-size: 1.0em; font-weight: bold; color: #333;">Safety Policy on Jobsites</span>
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
    <div className="space-y-6">
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
                       bg-[#f26722] hover:bg-[#e55611] rounded-none shadow-sm
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
          <Info className="h-5 w-5 text-[#f26722]" />
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
                  <code className="shrink-0 px-1.5 py-0.5 bg-neutral-100 dark:bg-dark-200 border border-neutral-200 dark:border-neutral-700 text-[#f26722] font-mono">
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
                         focus:ring-[#f26722] focus:border-[#f26722]
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
                         focus:ring-[#f26722] focus:border-[#f26722]
                         bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
            />
          </div>
        </div>
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

            <div className="border border-neutral-300 dark:border-neutral-600">
              <div className="flex items-center gap-1 px-2 py-1.5 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-200">
                {[
                  { command: "bold", Icon: Bold, title: "Bold" },
                  { command: "italic", Icon: Italic, title: "Italic" },
                  { command: "underline", Icon: Underline, title: "Underline" },
                ].map(({ command, Icon, title }) => (
                  <button
                    key={command}
                    type="button"
                    title={title}
                    onMouseDown={(e) => {
                      // Keep the editor selection so the command applies to it
                      e.preventDefault();
                      runEditorCommand(section.key, command);
                    }}
                    className="p-1.5 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-dark-300 transition-colors"
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
              {/* Letter content is authored against a white page, so the
                  editor keeps a light background in both themes. */}
              <div
                key={`${section.key}-${seed.version}`}
                ref={(el) => {
                  editorRefs.current[section.key] = el;
                }}
                contentEditable
                suppressContentEditableWarning
                dangerouslySetInnerHTML={{ __html: seed.html }}
                onInput={(e) =>
                  handleSectionInput(
                    section.key,
                    (e.target as HTMLDivElement).innerHTML,
                  )
                }
                className="min-h-[120px] max-h-[480px] overflow-y-auto p-4 bg-white text-neutral-900 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                style={{ fontFamily: "Arial, sans-serif" }}
              />
            </div>
          </div>
        );
      })}

      {/* Live preview */}
      {showPreview && (
        <div className="bg-white dark:bg-dark-150 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-700 p-6">
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
    </div>
  );
}
