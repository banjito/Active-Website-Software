/**
 * Text size and alignment set in the builder for a table's headings, its
 * cells, or one column (section.headerText / bodyText, column.fontSize/align).
 *
 * The report and print CSS fix sizes with !important (10px cells, flat
 * inputs), so a setting is carried as a CSS variable plus a marker class, and
 * TEXT_STYLE_CSS applies it with enough weight to win, on screen, in paper
 * view and in print. Nothing set: no class, so the report looks as before.
 */

import type React from 'react';
import type { TableTextStyle, TextAlign } from '@/lib/types/customForms';

export const FONT_SIZE_CHOICES = [7, 8, 9, 10, 11, 12, 14, 16, 18];
export const ALIGN_CHOICES: { value: TextAlign; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

/** Class and style for a th / td with this text style (empty when none is set). */
export function textStyleProps(style: TableTextStyle | undefined): {
  className: string;
  style: React.CSSProperties;
} {
  const classes: string[] = [];
  const vars: Record<string, string> = {};
  if (style?.fontSize) {
    classes.push('cf-fs');
    vars['--cf-fs'] = `${style.fontSize}px`;
  }
  if (style?.align) {
    classes.push('cf-ta');
    vars['--cf-ta'] = style.align;
  }
  return { className: classes.join(' '), style: vars as React.CSSProperties };
}

/** True when any part of a table has a text style, so the CSS is needed. */
export const hasTextStyle = (style: TableTextStyle | undefined) => !!(style?.fontSize || style?.align);

/*
 * `:is(#a#b#c, *)` matches every element but weighs three ids, so these rules
 * beat the report's own `#report-container ...` rules without naming them.
 */
const W = ':is(#cf-w1#cf-w2#cf-w3, *)';
const CELL = `:is(th, td)`;

export const TEXT_STYLE_CSS = `
${CELL}.cf-fs${W},
${CELL}.cf-fs ${W}:not(svg, svg *) {
  font-size: var(--cf-fs) !important;
}
${CELL}.cf-ta${W},
${CELL}.cf-ta :is(input, select, textarea, .cf-print-text, .cf-static-text, .cf-calc-value)${W} {
  text-align: var(--cf-ta) !important;
  text-align-last: var(--cf-ta) !important;
}
`;

/** A body cell's text style: the column's own setting, else the table's body setting. */
export function columnTextStyle(
  section: { bodyText?: TableTextStyle; columns?: { id: string; fontSize?: number; align?: TextAlign }[] },
  columnId: string | undefined,
): TableTextStyle | undefined {
  const column = columnId ? section.columns?.find((c) => c.id === columnId) : undefined;
  const fontSize = column?.fontSize ?? section.bodyText?.fontSize;
  const align = column?.align ?? section.bodyText?.align;
  return fontSize || align ? { fontSize, align } : undefined;
}

/** True when the table has any text setting, so TEXT_STYLE_CSS must be on the page. */
export function tableUsesTextStyle(section: {
  headerText?: TableTextStyle;
  bodyText?: TableTextStyle;
  columns?: { fontSize?: number; align?: TextAlign }[];
}): boolean {
  return (
    hasTextStyle(section.headerText) ||
    hasTextStyle(section.bodyText) ||
    !!section.columns?.some((c) => c.fontSize || c.align)
  );
}
