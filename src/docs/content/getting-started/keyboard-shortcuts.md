---
title: Keyboard shortcuts
description: Fill out reports without touching the mouse.
keywords: [keyboard, hotkeys, arrow keys, tab, fast entry]
---

Test reports are grids of numbers. Reaching for a mouse between every cell is the single biggest time sink in field data entry, so ampOS lets you drive forms entirely from the keyboard.

## Moving between fields

Inside any form in ampOS:

| Key | Does |
|---|---|
| **→** | Move to the field to the right |
| **←** | Move to the field to the left |
| **↑** | Move to the field above |
| **↓** | Move to the field below |
| **Enter** | Move to the next field in order |
| **Tab** | Move to the next field in order (standard browser behavior) |

Arrow keys move by **screen position**, not by tab order. In a test grid, pressing `↓` really does go down the column, even when the underlying form order zig-zags.

## Text is selected for you

When you land on a field, its existing contents are selected. Just type; the old value is replaced. No need to select-all or backspace.

This does not happen on dropdowns, where selecting text would get in the way.

## Fields that get skipped

Navigation automatically skips anything you cannot type in:

- Disabled fields
- Read-only fields (calculated values, for example)
- Hidden fields
- Fields in collapsed sections

So arrowing across a row of results never dumps you into a computed column.

## Dropdowns

On a `select` field, type the first letter of the option you want. Pressing `S` on a pass/fail dropdown jumps to `Satisfactory`. Then keep arrowing.

## Searching

| Key | Does |
|---|---|
| **⌘K** / **Ctrl K** | Open search in these docs |
| **/** | Open search in these docs |
| **Esc** | Close any open dialog |

## A fast workflow for grids

1. Click the first cell of the grid once.
2. Type the value.
3. Press `→` to move across the row, `↓` to drop to the next row.
4. Never touch the mouse again until the section is done.

::: tip
On a tablet with a keyboard case, this is the difference between a report taking twenty minutes and taking five. It is worth spending one job getting used to it.
:::
