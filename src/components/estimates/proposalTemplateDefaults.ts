/**
 * Proposal Letter Template — defaults, tokens, and rendering helpers.
 *
 * The proposal letter's static/boilerplate sections (greeting, terms list,
 * conclusion, signature block, safety policy) are editable by admins from the
 * Estimating Presets page and stored on `business.estimating_presets`
 * (`proposal_*_html` columns). Everything computed — pricing, scope tables,
 * mobilization, day-type logic — stays code-generated in EstimateSheet.tsx and
 * is assembled AROUND these sections; the sections themselves only contain
 * prose plus the {{tokens}} below.
 *
 * The default strings here are extracted verbatim from the previous hardcoded
 * template literal in `generateLetterContent()`. When a DB column is null or
 * empty the generator falls back to these defaults, so behavior is unchanged
 * until an admin actually edits a section.
 */

import type { EstimatingPresets } from "../../services/estimatingPresetsService";
import { companyConfig } from "@/lib/companyConfig";

/** Tokens available inside editable template sections. */
export const TEMPLATE_TOKENS: { token: string; description: string }[] = [
  { token: "{{contactName}}", description: "Customer contact's full name" },
  {
    token: "{{letterNumber}}",
    description: "The letter / quote number (header block)",
  },
  {
    token: "{{letterDate}}",
    description: "The letter date, already formatted (header block)",
  },
  {
    token: "{{companyName}}",
    description: "Customer company name (header block)",
  },
  {
    token: "{{customerAddress}}",
    description: "Customer address, formatted for the letter (header block)",
  },
  { token: "{{projectTitle}}", description: "Opportunity / project title" },
  {
    token: "{{jobsiteLocation}}",
    description:
      'Jobsite location, prefixed with ", " when present (empty when the opportunity has no location)',
  },
  {
    token: "{{netaStandardText}}",
    description:
      "The NETA standard sentence selected when generating the letter",
  },
  { token: "{{currentYear}}", description: "The current year (e.g. 2026)" },
  {
    token: "{{alternateRatesNote}}",
    description:
      'Becomes " Alternate rates apply for Saturday and Sunday/Holiday work as noted above." when weekend pricing is shown in the letter; empty otherwise',
  },
  {
    token: "{{signatureImage}}",
    description: "URL of the signer's signature image",
  },
  { token: "{{signerName}}", description: "Signer name (editable below)" },
  { token: "{{signerTitle}}", description: "Signer title (editable below)" },
];

const KNOWN_TOKEN_NAMES = new Set(
  TEMPLATE_TOKENS.map((t) => t.token.replace(/[{}]/g, "")),
);

// ---------------------------------------------------------------------------
// Default section HTML (verbatim from the previous hardcoded letter template)
// ---------------------------------------------------------------------------

/** Greeting + furnish-services sentence + NETA standard line. */
export const DEFAULT_PROPOSAL_INTRO_HTML = `<div class="amp-section" style="margin: 8px 0;">Dear {{contactName}},</div>
        <div class="amp-section">${companyConfig.legalName} is pleased to offer the following proposal for your consideration.</div>
        <div class="amp-section" style="margin: 8px 0;">${companyConfig.legalName} will furnish field technical services, tooling, instrumentation, and equipment to perform the listed scope at {{projectTitle}}{{jobsiteLocation}}.</div>
        <div class="amp-section" style="margin: 8px 0;">
          <span id="neta-standard-text">{{netaStandardText}}</span>
        </div>`;

/** Payment-terms sentence + "This price is based upon the following" list. */
export const DEFAULT_PROPOSAL_TERMS_HTML = `<div class="amp-section">${companyConfig.legalName} does not offer or accept terms greater than 90 days. No retainage is allowed. This work is subject to progress billing where applicable.</div>
        <div class="amp-section" style="margin-top: 8px;">This price is based upon the following:</div>
        <ol class="amp-section" style="margin: 4px 0 4px 20px;">
          <li>The schedule for this work will be mutually determined.</li>
          <li>Work to be performed during normal working hours, Monday through Friday.{{alternateRatesNote}}</li>
          <li>Repairs and/or retests, if required, will be separately quoted.</li>
          <li>All site work delays beyond ${companyConfig.fullName} control will be billed in accordance with ${companyConfig.fullName} {{currentYear}} T&M Rate Sheet.</li>
          <li>Aerial lift for overhead work to be provided by others.</li>
          <li>Arc flash analysis, short circuit, and coordination study to be quoted separately.</li>
          <li>All work performed by ${companyConfig.name} will be in accordance with the safety policy attached</li>
        </ol>`;

/** Conclusion paragraph, PO email line, validity statement. */
export const DEFAULT_PROPOSAL_CONCLUSION_HTML = `<div style="margin-top: 12px;"><b style="font-size: 1.15em;">Conclusion</b></div>
        <div>This proposal is valid for 120 days.</div>
        <div style="margin-top: 8px;">We appreciate the opportunity to provide a proposal for this scope of work. ${companyConfig.fullName} enjoys the opportunity to display our core principles daily: Attentiveness, Commitment, Creativity, Dependability, Diligence, Integrity, and Poise. If we ever fall short of these values, we ask that you inform us, so we may do whatever it takes to elicit forgiveness.</div>
        <div style="margin-top: 8px;"><b><i>Please send purchase orders to <a href="mailto:${companyConfig.purchaseOrdersEmail}">${companyConfig.purchaseOrdersEmail}</a>.</i></b></div>
        <div style="margin-top: 8px;">Should you have any questions please contact the undersigned.</div>`;

/** Sign-off + signature image + signer name/title. */
export const DEFAULT_PROPOSAL_SIGNATURE_HTML = `<div style="margin-top: 12px;">Sincerely,</div>
        <div style="margin: 4px 0 2px 0;">
          <img src="{{signatureImage}}" alt="Signature" style="height: 40px; max-width: 280px; object-fit: contain;" onerror="this.style.display='none'"/>
        </div>
        <div>{{signerName}}</div>
        <div>{{signerTitle}}</div>`;

/**
 * The Lockout/Tagout safety policy body. The generator owns the page wrapper
 * and the "Safety Policy on Jobsites" header (they differ between single and
 * combined letters); this is the shared content inside it.
 */
export const DEFAULT_PROPOSAL_SAFETY_POLICY_HTML = `<div style="font-weight: bold; margin-bottom: 4px;">LOCKOUT / TAGOUT</div>
          <div>On a jobsite where the customer has an established Lockout program or there is a lockout procedure already established, ${companyConfig.name} employees will follow local Lockout program provided that it does not expose the employee to greater risk than the ${companyConfig.name} procedure below.</div>
          <div style="margin-top: 4px;">In the absence of a local lockout procedure, ${companyConfig.name} employees will follow the following procedure.</div>
          <ul style="margin: 4px 0 4px 16px;">
            <li>The employees shall be notified that a lockout (tagout) system is going to be implemented and the reason therefore. The qualified employee implementing the lockout (tagout) shall know the disconnecting means location for all sources of electrical energy and the location of all sources of potential energy. The qualified person shall be knowledgeable of hazards associated with all energy sources.</li>
            <li>If the electrical supply is energized, the qualified person shall deenergize and disconnect the electric supply and relieve all stored energy.</li>
            <li>Lockout (tagout) all disconnecting means with lockout (tagout) devices.</li>
            <li>For tagout, one additional safety measure must be employed, such as opening, blocking, or removing an additional circuit element.</li>
            <li>Attempt to operate the disconnecting means to determine that operation is prohibited.</li>
            <li>A voltage-detecting instrument shall be used.  Inspect the instrument for visible damage. Do not proceed if there is an indication of damage to the instrument until an undamaged device is available.</li>
            <li>Verify proper instrument operation and then test for absence of voltage.</li>
            <li>Verify proper instrument operation after testing for absence of voltage.</li>
            <li>Where required, install grounding equipment/conductor device on the phase conductors or circuit parts, to eliminate induced voltage or stored energy, before touching them. Where it has been determined that contact with other exposed energized conductors or circuit parts is possible, apply ground connecting devices rated for the available fault duty.</li>
            <li>The equipment and/or electrical source is now locked out (tagged out).</li>
          </ul>
          <div style="margin-top: 6px; font-weight: bold;">Procedure Involving More Than One Person.</div>
          <div>For a simple lockout/tagout and where more than one person is involved in the job or task, each person shall install his or her own personal lockout (tagout) device.</div>
          <div style="margin-top: 8px;">Safety is the utmost priority at ${companyConfig.fullName} and we reserve the right to stop work on any project that our technicians deem as unsafe. ${companyConfig.fullName} technicians follow NFPA 70E, ANSI, NETA, and OSHA safety guidelines. Lock out/Tag out of all energy sources is required prior to working on an electrical system. Any exceptions to the above-mentioned specifications will need to be made in writing prior to shut-down for our safety officer's evaluation. Drop hazard mitigation shall be implemented while working at heights.</div>
          <div style="margin-top: 12px; font-size: 1.0em; font-weight: bold; text-align: center;">END OF SAFETY POLICY</div>`;

export const DEFAULT_PROPOSAL_SIGNER_NAME = companyConfig.signerName;
export const DEFAULT_PROPOSAL_SIGNER_TITLE = companyConfig.signerTitle;

// ---------------------------------------------------------------------------
// Branding & images (adjustable logos, banner text, safety title, signature)
// ---------------------------------------------------------------------------

/** The AMP logo hosted on Vercel blob storage — the historical letter banner. */
export const DEFAULT_PROPOSAL_LOGO_URL =
  "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png";

/** Signer's signature image. Overridable per-instance via branding below. */
export const DEFAULT_PROPOSAL_SIGNATURE_IMAGE = "/img/brian-signature.png";

/** Company text shown next to the logo at the top of the letter. */
export const DEFAULT_PROPOSAL_LETTER_BANNER_TEXT = companyConfig.fullName;

/** Heading text on the safety policy page. */
export const DEFAULT_PROPOSAL_SAFETY_TITLE = "Safety Policy on Jobsites";

/** Adjustable branding pieces of the generated proposal letter. */
export interface ProposalBranding {
  /** Logo above the letter (path or data URL). */
  letterLogoUrl: string;
  /** Company text shown next to the letter logo. */
  letterBannerText: string;
  /** Logo above the safety policy page (path or data URL). */
  safetyLogoUrl: string;
  /** Heading text on the safety policy page. */
  safetyTitle: string;
  /** Signer's signature image (path or data URL). */
  signatureImage: string;
}

export const DEFAULT_PROPOSAL_BRANDING: ProposalBranding = {
  letterLogoUrl: DEFAULT_PROPOSAL_LOGO_URL,
  letterBannerText: DEFAULT_PROPOSAL_LETTER_BANNER_TEXT,
  safetyLogoUrl: DEFAULT_PROPOSAL_LOGO_URL,
  safetyTitle: DEFAULT_PROPOSAL_SAFETY_TITLE,
  signatureImage: DEFAULT_PROPOSAL_SIGNATURE_IMAGE,
};

/**
 * Coerce a DB JSON value into a clean ProposalBranding. Each missing / empty
 * field falls back to the built-in default, so a null column reproduces the
 * historical letter exactly.
 */
export function resolveProposalBranding(value: unknown): ProposalBranding {
  const o =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const str = (v: unknown, fallback: string): string => {
    const s = typeof v === "string" ? v.trim() : "";
    return s ? s : fallback;
  };
  return {
    letterLogoUrl: str(o.letterLogoUrl, DEFAULT_PROPOSAL_BRANDING.letterLogoUrl),
    letterBannerText: str(
      o.letterBannerText,
      DEFAULT_PROPOSAL_BRANDING.letterBannerText,
    ),
    safetyLogoUrl: str(o.safetyLogoUrl, DEFAULT_PROPOSAL_BRANDING.safetyLogoUrl),
    safetyTitle: str(o.safetyTitle, DEFAULT_PROPOSAL_BRANDING.safetyTitle),
    signatureImage: str(
      o.signatureImage,
      DEFAULT_PROPOSAL_BRANDING.signatureImage,
    ),
  };
}

/**
 * Top display block: letter number, date, and customer name/company/address.
 * The generator owns the logo/company-name banner above this; only the
 * address block below it is editable here.
 */
export const DEFAULT_PROPOSAL_HEADER_HTML = `<div class="amp-section"><b style="font-size: 1.2em;">Letter # {{letterNumber}}</b></div>
        <div class="amp-section" style="margin-bottom: 8px;"><b>{{letterDate}}</b></div>
        <div>
          {{contactName}}<br/>
          {{companyName}}<br/>
          {{customerAddress}}<br/>
        </div>`;

/** Footer line that follows the proposal main body (address / phone). */
export const DEFAULT_PROPOSAL_FOOTER_HTML = `<div style="width:100%;font-size:0.85em;color:#555;border-top:1px solid #ccc;padding:4px 0;text-align:center;margin-top:12px;">${companyConfig.addressFooter} | ${companyConfig.phone}</div>`;

// ---------------------------------------------------------------------------
// NETA standard options (editable list)
// ---------------------------------------------------------------------------

export interface NetaOption {
  /** Stable key persisted per-letter (do not reuse across different texts). */
  value: string;
  /** Short label shown where a compact name is useful. */
  label: string;
  /** The sentence substituted for {{netaStandardText}}. */
  text: string;
}

/** Built-in NETA choices (verbatim from the previous hardcoded NETA_OPTIONS). */
export const DEFAULT_NETA_OPTIONS: NetaOption[] = [
  {
    value: "mts",
    label: "MTS 2023",
    text: "All tests will be performed in accordance with ANSI/NETA MTS 2023 - Standard for Maintenance Testing Specifications for Electrical power Equipment and Systems.",
  },
  {
    value: "ats",
    label: "ATS 2025",
    text: "All tests will be performed in accordance with ANSI/NETA ATS 2025 - Standard for Acceptance Testing Specifications for Electrical Power Equipment and Systems",
  },
  {
    value: "both",
    label: "ATS/MTS + IEEE 81",
    text: "All work will be performed in accordance with the applicable ANSI/NETA ATS/MTS & IEEE 81 Standards.",
  },
];

/**
 * Coerce a DB JSON value into a clean NetaOption[]. Invalid / empty input
 * falls back to the built-in defaults so the dropdown is never empty.
 */
export function resolveNetaOptions(value: unknown): NetaOption[] {
  if (!Array.isArray(value)) return DEFAULT_NETA_OPTIONS;
  const cleaned: NetaOption[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const optValue = typeof o.value === "string" ? o.value.trim() : "";
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if (!optValue || !text) continue;
    const label =
      typeof o.label === "string" && o.label.trim() ? o.label.trim() : optValue;
    cleaned.push({ value: optValue, label, text });
  }
  return cleaned.length ? cleaned : DEFAULT_NETA_OPTIONS;
}

// ---------------------------------------------------------------------------
// Custom (admin-added) sections
// ---------------------------------------------------------------------------

/** Fixed points in the generated letter where a custom section may be placed. */
export const PROPOSAL_SECTION_ANCHORS = [
  { value: "after_header", label: "After header / before greeting" },
  { value: "after_intro", label: "After introduction (before Scope)" },
  { value: "after_scope", label: "After Scope table (before Pricing)" },
  { value: "after_pricing", label: "After Pricing & Terms" },
  { value: "after_terms", label: "After Terms & Conditions" },
  { value: "after_conclusion", label: "After Conclusion" },
  { value: "after_signature", label: "After Signature block" },
  { value: "before_safety", label: "Before Safety Policy page" },
] as const;

export type ProposalSectionAnchor =
  (typeof PROPOSAL_SECTION_ANCHORS)[number]["value"];

const ANCHOR_VALUES = new Set(PROPOSAL_SECTION_ANCHORS.map((a) => a.value));

export interface CustomProposalSection {
  id: string;
  label: string;
  html: string;
  anchor: ProposalSectionAnchor;
}

/**
 * Coerce a DB JSON value into clean CustomProposalSection[]. Each section's
 * html is sanitized; entries with an unknown anchor or empty html are dropped.
 */
export function resolveCustomSections(value: unknown): CustomProposalSection[] {
  if (!Array.isArray(value)) return [];
  const cleaned: CustomProposalSection[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const anchor = typeof o.anchor === "string" ? o.anchor : "";
    if (!ANCHOR_VALUES.has(anchor as ProposalSectionAnchor)) continue;
    const html = typeof o.html === "string" ? o.html.trim() : "";
    if (!html) continue;
    const id =
      typeof o.id === "string" && o.id
        ? o.id
        : `cs-${Math.random().toString(36).slice(2)}`;
    const label =
      typeof o.label === "string" && o.label.trim()
        ? o.label.trim()
        : "Custom Section";
    cleaned.push({
      id,
      label,
      html: sanitizeTemplateHtml(html),
      anchor: anchor as ProposalSectionAnchor,
    });
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Resolution + rendering
// ---------------------------------------------------------------------------

export interface ProposalTemplateSections {
  headerHtml: string;
  introHtml: string;
  termsHtml: string;
  conclusionHtml: string;
  signatureHtml: string;
  safetyPolicyHtml: string;
  footerHtml: string;
  signerName: string;
  signerTitle: string;
  netaOptions: NetaOption[];
  customSections: CustomProposalSection[];
  branding: ProposalBranding;
}

export const DEFAULT_PROPOSAL_TEMPLATE_SECTIONS: ProposalTemplateSections = {
  headerHtml: DEFAULT_PROPOSAL_HEADER_HTML,
  introHtml: DEFAULT_PROPOSAL_INTRO_HTML,
  termsHtml: DEFAULT_PROPOSAL_TERMS_HTML,
  conclusionHtml: DEFAULT_PROPOSAL_CONCLUSION_HTML,
  signatureHtml: DEFAULT_PROPOSAL_SIGNATURE_HTML,
  safetyPolicyHtml: DEFAULT_PROPOSAL_SAFETY_POLICY_HTML,
  footerHtml: DEFAULT_PROPOSAL_FOOTER_HTML,
  signerName: DEFAULT_PROPOSAL_SIGNER_NAME,
  signerTitle: DEFAULT_PROPOSAL_SIGNER_TITLE,
  netaOptions: DEFAULT_NETA_OPTIONS,
  customSections: [],
  branding: DEFAULT_PROPOSAL_BRANDING,
};

/**
 * Strip active content from admin-authored template HTML before it is placed
 * into a generated letter. Defaults are trusted code constants and are NOT run
 * through this (the default signature <img> intentionally uses onerror to hide
 * itself when the image is missing) — only DB-sourced values are sanitized.
 */
export function sanitizeTemplateHtml(html: string): string {
  if (typeof document === "undefined") return html;
  const div = document.createElement("div");
  div.innerHTML = html;
  div
    .querySelectorAll("script, style, iframe, object, embed, link, meta")
    .forEach((el) => el.remove());
  div.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
      } else if (
        (name === "href" || name === "src" || name === "xlink:href") &&
        attr.value.trim().toLowerCase().startsWith("javascript:")
      ) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return div.innerHTML;
}

/** DB value when present (sanitized), otherwise the built-in default. */
function sectionOrDefault(
  value: string | null | undefined,
  fallback: string,
): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? sanitizeTemplateHtml(trimmed) : fallback;
}

/**
 * Resolve the effective template sections from an estimating_presets row.
 * Null/empty columns fall back to the built-in defaults, so an un-migrated or
 * never-edited row produces exactly the historical letter text.
 */
export function resolveProposalTemplateSections(
  presets?: Partial<EstimatingPresets> | null,
): ProposalTemplateSections {
  return {
    headerHtml: sectionOrDefault(
      presets?.proposal_header_html,
      DEFAULT_PROPOSAL_HEADER_HTML,
    ),
    introHtml: sectionOrDefault(
      presets?.proposal_intro_html,
      DEFAULT_PROPOSAL_INTRO_HTML,
    ),
    termsHtml: sectionOrDefault(
      presets?.proposal_terms_html,
      DEFAULT_PROPOSAL_TERMS_HTML,
    ),
    conclusionHtml: sectionOrDefault(
      presets?.proposal_conclusion_html,
      DEFAULT_PROPOSAL_CONCLUSION_HTML,
    ),
    signatureHtml: sectionOrDefault(
      presets?.proposal_signature_html,
      DEFAULT_PROPOSAL_SIGNATURE_HTML,
    ),
    safetyPolicyHtml: sectionOrDefault(
      presets?.proposal_safety_policy_html,
      DEFAULT_PROPOSAL_SAFETY_POLICY_HTML,
    ),
    footerHtml: sectionOrDefault(
      presets?.proposal_footer_html,
      DEFAULT_PROPOSAL_FOOTER_HTML,
    ),
    signerName:
      (presets?.proposal_signer_name || "").trim() ||
      DEFAULT_PROPOSAL_SIGNER_NAME,
    signerTitle:
      (presets?.proposal_signer_title || "").trim() ||
      DEFAULT_PROPOSAL_SIGNER_TITLE,
    netaOptions: resolveNetaOptions(presets?.proposal_neta_options),
    customSections: resolveCustomSections(presets?.proposal_custom_sections),
    branding: resolveProposalBranding(presets?.proposal_branding),
  };
}

/**
 * Substitute {{token}} placeholders in a template section. Only tokens present
 * in `tokens` are replaced; unrecognized placeholders are left visible so a
 * typo shows up in the letter instead of silently vanishing.
 */
export function renderTemplateSection(
  html: string,
  tokens: Record<string, string>,
): string {
  return html.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(tokens, name) ? tokens[name] : match,
  );
}

/**
 * Invisible page-break marker inserted before the safety policy page. Prints on
 * a fresh page via the `.amp-page-break` rule in the letter print stylesheet;
 * renders as a zero-height no-op in the on-screen editor.
 */
export const PROPOSAL_SAFETY_PAGE_BREAK_HTML =
  '<div class="amp-page-break" style="break-before:page;page-break-before:always;height:0;border:none;margin:0;padding:0;"></div>';

/** Escape text for safe interpolation into generated letter HTML. */
export function escapeProposalText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** {{placeholders}} in `html` that are not recognized template tokens. */
export function findUnknownTokens(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) {
    if (!KNOWN_TOKEN_NAMES.has(match[1])) found.add(match[1]);
  }
  return Array.from(found);
}

/** Known tokens used by `defaultHtml` that no longer appear in `html`. */
export function findMissingDefaultTokens(
  html: string,
  defaultHtml: string,
): string[] {
  const inDefault = new Set<string>();
  for (const match of defaultHtml.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) {
    if (KNOWN_TOKEN_NAMES.has(match[1])) inDefault.add(match[1]);
  }
  const missing: string[] = [];
  for (const name of inDefault) {
    if (!new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`).test(html))
      missing.push(name);
  }
  return missing;
}
