/**
 * Document and block frames.
 *
 * The frame walks the V2 block tree: sections, layout containers, and explicit
 * page breaks. It owns the print rules, so `showInPrint`, keep-together,
 * page breaks and per-section orientation behave the same in the builder
 * preview, the template preview page and a saved instance.
 */

import React from "react";
import { EyeOff } from "lucide-react";
import type {
  CustomFormTemplate,
  SectionConfig,
} from "@/lib/types/customForms";
import { sortedSections } from "@/lib/customForms/runtime";
import type { SectionChrome } from "@/lib/customForms/runtime";
import {
  isLayoutBlock,
  isPageBreakBlock,
  isSectionBlock,
  type BlockV2,
  type DocumentV2,
  type LayoutBlockV2,
  type PrintConfigV2,
  type SectionBlockV2,
} from "@/lib/customForms/v2/schema";
import { documentFromV1 } from "@/lib/customForms/v2/fromV1";
import { SectionBody } from "./SectionBody";
import { ExpressionDiagnostics, useExpressionChrome } from "@/components/customForms/runtime/ExpressionChrome";

/** Class name for a block that prints in a named page orientation. */
const LANDSCAPE_CLASS = "cf-page-landscape";
const PORTRAIT_CLASS = "cf-page-portrait";

/**
 * Named-page rules for mixed orientation.
 *
 * `@page` cannot be scoped to an element, so mixed orientation needs named
 * pages. The rules go in one stylesheet that this hook owns and removes on
 * unmount, rather than being appended to the document head and left there,
 * which is how report print styles have leaked before.
 */
function usePrintPageRules(enabled: boolean) {
  React.useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const style = document.createElement("style");
    style.setAttribute("data-custom-form-print", "true");
    style.textContent = `
@media print {
  @page cfLandscape { size: landscape; }
  @page cfPortrait { size: portrait; }
  .${LANDSCAPE_CLASS} { page: cfLandscape; break-before: page; }
  .${PORTRAIT_CLASS} { page: cfPortrait; break-before: page; }
}`;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, [enabled]);
}

/** Print classes for a block's print configuration. */
function printClasses(
  print: PrintConfigV2 | undefined,
  documentOrientation: "portrait" | "landscape" | undefined,
): string {
  if (!print) return "";
  const classes: string[] = [];
  if (print.only === "screen") classes.push("print:hidden");
  if (print.only === "print") classes.push("hidden print:block");
  if (print.breakBefore) classes.push("print:break-before-page");
  if (print.breakAfter) classes.push("print:break-after-page");
  if (print.keepTogether) classes.push("print:break-inside-avoid");
  if (print.orientation && print.orientation !== (documentOrientation ?? "portrait")) {
    classes.push(
      print.orientation === "landscape" ? LANDSCAPE_CLASS : PORTRAIT_CLASS,
    );
  }
  return classes.join(" ");
}

function printStyle(print: PrintConfigV2 | undefined): React.CSSProperties | undefined {
  if (!print?.margins) return undefined;
  const style: React.CSSProperties = {};
  if (print.margins.top) style.marginTop = print.margins.top;
  if (print.margins.right) style.marginRight = print.margins.right;
  if (print.margins.bottom) style.marginBottom = print.margins.bottom;
  if (print.margins.left) style.marginLeft = print.margins.left;
  return Object.keys(style).length ? style : undefined;
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

interface SectionFrameProps {
  /** The V1 section the chrome callbacks are typed against. */
  v1Section: SectionConfig;
  section: SectionBlockV2;
  chrome: SectionChrome;
  isFirst?: boolean;
  pageBreakAfter?: boolean;
  documentOrientation?: "portrait" | "landscape";
}

/**
 * A section hidden in print still renders on screen, marked. Dropping it from
 * the screen made the builder preview disagree with the form the technician
 * actually fills in.
 */
export const SectionFrame: React.FC<SectionFrameProps> = ({
  v1Section,
  section,
  chrome,
  isFirst = false,
  pageBreakAfter = false,
  documentOrientation,
}) => {
  const hiddenInPrint = section.print?.only === "screen";
  return (
    <div
      className={[
        isFirst ? "" : "mt-6 print:mt-4",
        printClasses(section.print, documentOrientation),
        pageBreakAfter && !hiddenInPrint ? "print:break-after-page" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={printStyle(section.print)}
    >
      {/* The rule, the heading and the first of the body stay together: a
          section title stranded alone at the foot of a page is the commonest
          print complaint, and `break-after: avoid` is what prevents it. */}
      <div className="w-full h-1 bg-brand mb-3 print:mb-1 print:break-after-avoid" />
      <div className="flex items-center gap-2 mb-3 print:mb-1 print:break-after-avoid">
        <h2 className="text-lg font-semibold print:text-sm text-neutral-900 dark:text-white print:text-black print:break-after-avoid">
          {section.title}
        </h2>
        {hiddenInPrint && (
          <span className="print:hidden inline-flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
            <EyeOff className="w-3 h-3" />
            Hidden in print
          </span>
        )}
      </div>
      <SectionBody section={v1Section} chrome={chrome} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Layout containers
// ---------------------------------------------------------------------------

const LAYOUT_CLASSES: Record<LayoutBlockV2["kind"], string> = {
  stack: "space-y-6",
  grid: "grid gap-4",
  "side-by-side": "grid gap-4 grid-cols-1 md:grid-cols-2 items-start",
  strip:
    "border border-neutral-200 dark:border-neutral-700 rounded-none p-3 flex flex-wrap gap-4",
  callout: "rounded-none border-l-4 p-3",
  "keep-together": "space-y-4 print:break-inside-avoid",
};

const CALLOUT_TONES: Record<string, string> = {
  info: "border-blue-400 bg-blue-50 dark:bg-blue-900/20",
  warning: "border-amber-400 bg-amber-50 dark:bg-amber-900/20",
  criteria: "border-brand bg-orange-50 dark:bg-orange-900/20",
};

const LayoutFrame: React.FC<{
  block: LayoutBlockV2;
  renderChild: (child: BlockV2, index: number) => React.ReactNode;
  documentOrientation?: "portrait" | "landscape";
}> = ({ block, renderChild, documentOrientation }) => {
  const style: React.CSSProperties = { ...printStyle(block.print) };
  if (block.kind === "grid" && block.columns) {
    style.gridTemplateColumns = `repeat(${block.columns}, minmax(0, 1fr))`;
  }
  if (block.kind === "side-by-side" && block.widths?.length) {
    style.gridTemplateColumns = block.widths.join(" ");
  }

  return (
    <div
      className={[
        LAYOUT_CLASSES[block.kind],
        block.kind === "callout"
          ? (CALLOUT_TONES[block.tone ?? "info"] ?? CALLOUT_TONES.info)
          : "",
        printClasses(block.print, documentOrientation),
      ]
        .filter(Boolean)
        .join(" ")}
      style={Object.keys(style).length ? style : undefined}
    >
      {block.title && (
        <div className="text-sm font-semibold text-neutral-900 dark:text-white mb-2">
          {block.title}
        </div>
      )}
      {block.children.map(renderChild)}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

interface DocumentBodyProps {
  template: CustomFormTemplate;
  chrome: SectionChrome;
  emptyMessage?: string;
}

/**
 * The whole document, through the shared runtime.
 *
 * The template's V1 structure is adapted to a V2 document so layout
 * containers, page breaks and per-section print settings render from one
 * model. Sections still hand `SectionBody` their V1 shape, which is what the
 * chromes are typed against.
 */
export const DocumentBody: React.FC<DocumentBodyProps> = ({
  template,
  chrome,
  emptyMessage = "This template has no sections yet.",
}) => {
  const expressionRuntime = useExpressionChrome(template.structure, chrome);
  const v1Sections = React.useMemo(
    () => sortedSections(template.structure.sections),
    [template.structure.sections],
  );
  const document: DocumentV2 = React.useMemo(
    () => documentFromV1(template.structure),
    [template.structure],
  );
  const v1ById = React.useMemo(
    () => new Map(v1Sections.map((section) => [section.id, section])),
    [v1Sections],
  );

  const needsPageRules = React.useMemo(
    () =>
      document.blocks.some(
        (block) =>
          isSectionBlock(block) &&
          block.print?.orientation != null &&
          block.print.orientation !== (document.settings.orientation ?? "portrait"),
      ),
    [document],
  );
  usePrintPageRules(needsPageRules);

  if (v1Sections.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-neutral-500 dark:text-neutral-400">{emptyMessage}</p>
      </div>
    );
  }

  const breakAfterEach = document.settings.pageBreakAfterSection === true;
  let sectionOrdinal = 0;
  const lastSectionIndex = document.blocks.length - 1;

  const renderBlock = (block: BlockV2, index: number): React.ReactNode => {
    if (isPageBreakBlock(block)) {
      return <div key={block.id} className="hidden print:block print:break-after-page" />;
    }

    if (isLayoutBlock(block)) {
      return (
        <LayoutFrame
          key={block.id}
          block={block}
          documentOrientation={document.settings.orientation}
          renderChild={renderBlock}
        />
      );
    }

    const v1Section = v1ById.get(block.id);
    if (!v1Section) return null;
    const isFirst = sectionOrdinal === 0;
    sectionOrdinal += 1;
    return (
      <SectionFrame
        key={block.id}
        v1Section={v1Section}
        section={block}
        chrome={expressionRuntime.chrome}
        isFirst={isFirst}
        pageBreakAfter={breakAfterEach && index < lastSectionIndex}
        documentOrientation={document.settings.orientation}
      />
    );
  };

  return <><ExpressionDiagnostics issues={expressionRuntime.issues} />{document.blocks.map(renderBlock)}</>;
};
