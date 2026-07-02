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

/** Tokens available inside editable template sections. */
export const TEMPLATE_TOKENS: { token: string; description: string }[] = [
  { token: "{{contactName}}", description: "Customer contact's full name" },
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
        <div class="amp-section">AMP LLC is pleased to offer the following proposal for your consideration.</div>
        <div class="amp-section" style="margin: 8px 0;">AMP LLC will furnish field technical services, tooling, instrumentation, and equipment to perform the listed scope at {{projectTitle}}{{jobsiteLocation}}.</div>
        <div class="amp-section" style="margin: 8px 0;">
          <span id="neta-standard-text">{{netaStandardText}}</span>
        </div>`;

/** Payment-terms sentence + "This price is based upon the following" list. */
export const DEFAULT_PROPOSAL_TERMS_HTML = `<div class="amp-section">AMP LLC does not offer or accept terms greater than 90 days. No retainage is allowed. This work is subject to progress billing where applicable.</div>
        <div class="amp-section" style="margin-top: 8px;">This price is based upon the following:</div>
        <ol class="amp-section" style="margin: 4px 0 4px 20px;">
          <li>The schedule for this work will be mutually determined.</li>
          <li>Work to be performed during normal working hours, Monday through Friday.{{alternateRatesNote}}</li>
          <li>Repairs and/or retests, if required, will be separately quoted.</li>
          <li>All site work delays beyond AMP Quality Energy Services control will be billed in accordance with AMP Quality Energy Services {{currentYear}} T&M Rate Sheet.</li>
          <li>Aerial lift for overhead work to be provided by others.</li>
          <li>Arc flash analysis, short circuit, and coordination study to be quoted separately.</li>
          <li>All work performed by AMP will be in accordance with the safety policy attached</li>
        </ol>`;

/** Conclusion paragraph, PO email line, validity statement. */
export const DEFAULT_PROPOSAL_CONCLUSION_HTML = `<div style="margin-top: 12px;"><b style="font-size: 1.15em;">Conclusion</b></div>
        <div>This proposal is valid for 120 days.</div>
        <div style="margin-top: 8px;">We appreciate the opportunity to provide a proposal for this scope of work. AMP Quality Energy Services enjoys the opportunity to display our core principles daily: Attentiveness, Commitment, Creativity, Dependability, Diligence, Integrity, and Poise. If we ever fall short of these values, we ask that you inform us, so we may do whatever it takes to elicit forgiveness.</div>
        <div style="margin-top: 8px;"><b><i>Please send purchase orders to <a href="mailto:purchaseorders@ampqes.com">purchaseorders@ampqes.com</a>.</i></b></div>
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
          <div>On a jobsite where the customer has an established Lockout program or there is a lockout procedure already established, AMP employees will follow local Lockout program provided that it does not expose the employee to greater risk than the AMP procedure below.</div>
          <div style="margin-top: 4px;">In the absence of a local lockout procedure, AMP employees will follow the following procedure.</div>
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
          <div style="margin-top: 8px;">Safety is the utmost priority at AMP Quality Energy Services and we reserve the right to stop work on any project that our technicians deem as unsafe. AMP Quality Energy Services technicians follow NFPA 70E, ANSI, NETA, and OSHA safety guidelines. Lock out/Tag out of all energy sources is required prior to working on an electrical system. Any exceptions to the above-mentioned specifications will need to be made in writing prior to shut-down for our safety officer's evaluation. Drop hazard mitigation shall be implemented while working at heights.</div>
          <div style="margin-top: 12px; font-size: 1.0em; font-weight: bold; text-align: center;">END OF SAFETY POLICY</div>`;

export const DEFAULT_PROPOSAL_SIGNER_NAME = "Brian Rodgers";
export const DEFAULT_PROPOSAL_SIGNER_TITLE = "Chief Executive Officer";

// ---------------------------------------------------------------------------
// Resolution + rendering
// ---------------------------------------------------------------------------

export interface ProposalTemplateSections {
  introHtml: string;
  termsHtml: string;
  conclusionHtml: string;
  signatureHtml: string;
  safetyPolicyHtml: string;
  signerName: string;
  signerTitle: string;
}

export const DEFAULT_PROPOSAL_TEMPLATE_SECTIONS: ProposalTemplateSections = {
  introHtml: DEFAULT_PROPOSAL_INTRO_HTML,
  termsHtml: DEFAULT_PROPOSAL_TERMS_HTML,
  conclusionHtml: DEFAULT_PROPOSAL_CONCLUSION_HTML,
  signatureHtml: DEFAULT_PROPOSAL_SIGNATURE_HTML,
  safetyPolicyHtml: DEFAULT_PROPOSAL_SAFETY_POLICY_HTML,
  signerName: DEFAULT_PROPOSAL_SIGNER_NAME,
  signerTitle: DEFAULT_PROPOSAL_SIGNER_TITLE,
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
    signerName:
      (presets?.proposal_signer_name || "").trim() ||
      DEFAULT_PROPOSAL_SIGNER_NAME,
    signerTitle:
      (presets?.proposal_signer_title || "").trim() ||
      DEFAULT_PROPOSAL_SIGNER_TITLE,
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
