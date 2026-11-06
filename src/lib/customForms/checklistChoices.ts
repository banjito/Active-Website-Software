/**
 * Result choices for a checklist (e.g. Visual & Mechanical Inspection), edited
 * for the whole table at once.
 *
 * Rows can have their own choices, so a whole-table edit is applied to each
 * row rather than pasted over it: a rename or removal reaches every row that
 * has that choice, a new choice reaches every row, and a row keeps its own
 * order unless the whole-table order was changed.
 */

interface ChecklistRow {
  id: string;
  resultOptions?: string[];
}

/** One choice in the whole-table list. `from` is its name when editing began; null if new. */
export interface TableChoice {
  from: string | null;
  label: string;
}

/** Each row's choices when editing began, by row id. */
export type RowChoices = Record<string, string[]>;

export const snapshotRowChoices = (items: ChecklistRow[]): RowChoices =>
  Object.fromEntries(items.map((item) => [item.id, item.resultOptions ?? []]));

/** Every choice used in the table, in the order first seen. */
const uniqueChoices = (lists: string[][]) => [...new Set(lists.flat())];

export const tableChoices = (items: ChecklistRow[]): TableChoice[] =>
  uniqueChoices(items.map((item) => item.resultOptions ?? [])).map((label) => ({
    from: label,
    label,
  }));

/** True when rows do not all have the same choices in the same order. */
export const rowsDiffer = (items: ChecklistRow[]) =>
  new Set(items.map((item) => JSON.stringify(item.resultOptions ?? []))).size > 1;

/** Blank choices are left out, and a name used twice in a row appears once. */
const cleanLabels = (choices: TableChoice[]) => [
  ...new Set(choices.map((c) => c.label).filter((label) => label.trim())),
];

/**
 * Apply the whole-table list to every row. Always works from the rows as they
 * were when editing began, so typing one choice's name over another's part way
 * through a rename does not merge them.
 */
export function applyTableChoices<T extends ChecklistRow>(
  items: T[],
  before: RowChoices,
  choices: TableChoice[],
): T[] {
  const added = choices.filter((c) => c.from === null);
  const kept = new Set(choices.map((c) => c.from));
  const untouchedOrder = [
    ...uniqueChoices(Object.values(before)).filter((name) => kept.has(name)),
    ...added.map(() => null),
  ];
  const reordered = choices.some((c, i) => c.from !== untouchedOrder[i]);

  return items.map((item) => {
    const own = before[item.id];
    // A row added since editing began takes the whole list.
    if (!own) return { ...item, resultOptions: cleanLabels(choices) };
    const mine = reordered
      ? choices.filter((c) => c.from === null || own.includes(c.from))
      : [
          ...own.flatMap((name) => choices.filter((c) => c.from === name)),
          ...added,
        ];
    return { ...item, resultOptions: cleanLabels(mine) };
  });
}
