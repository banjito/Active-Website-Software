---
title: Assets
description: The equipment list on a job. Adding it, importing it, and hanging reports off it.
keywords: [asset, equipment, transformer, breaker, bulk import, advanced import, bulk edit, nameplate, sub-asset]
---

An asset is one piece of equipment you tested. The **Assets** tab on a job is the list of them, and each one carries the report written against it.

If you are looking for a report, find its asset first.

## Adding assets one at a time

1. Open the job and go to **Assets**.
2. Click **Add asset**.
3. Enter the **name**, matching the nameplate or the one-line drawing. `Transformer T-1`, not `the big one by the door`.
4. Enter the **identifier** if there is one: a tag number, a serial, an asset tag.
5. Pick the **report type**. See the [report catalog](/docs/reports/catalog) if you are not sure which form applies.
6. Save.

The asset appears in the list with its report in `In progress`.

## Bulk import

For a job with forty panels, do not type forty rows.

1. Click **Bulk import**.
2. Paste your list, or upload a spreadsheet.
3. The preview shows every row it parsed, full height, before anything is created. Check it.
4. Fix anything wrong in the preview, then confirm.

::: tip
The preview is there so you can catch a column misalignment before it becomes forty badly-named assets. Read it. It takes ten seconds and saves an hour.
:::

### Advanced import

A plain import brings in the equipment list -- identifier, building, substation, type. **Advanced** brings the equipment-specific data in with it, so you are not opening forty cables afterwards to type the conductor size into each one.

Click **Advanced** at the mapping step and you get:

- **Same type for every row.** For a sheet that is all one thing -- every row a medium voltage cable -- name the type once instead of adding a Type column. Rows that carry their own type in a column keep it.
- **Manufacturer, model / catalog number, serial number.** Left out of the plain import on purpose, because a normal equipment list has none of them. An as-built or a vendor submittal usually does.
- **The nameplate fields for the types in the sheet.** Once the importer knows what kind of equipment it is looking at, it offers exactly the fields that equipment has -- conductor size, insulation type, voltage rating and the rest for a cable; frame size, trip unit and I.C. rating for a breaker. Columns matching those names map themselves.

A sheet can hold more than one type. Each row only takes the fields its own type has, so a mixed list still lands cleanly.

The **Equipment detail** column in the preview shows what each row is bringing with it. That data lands on the equipment, which means every report written against it later starts pre-filled.

## Bulk editing

You find out that all forty MECH panel breakers are the same manufacturer and catalog number, and only the serial numbers differ. Change them once.

1. Tick the assets. **Shift**-click ticks a whole run, and **Select all N in this view** takes everything the current search and filters leave on screen.
2. Click **Edit fields**.
3. Tick each field you want to change and type the new value.
4. Apply.

Only ticked fields are written. Everything else on those assets is left exactly as it was -- an untouched field is never blanked out by accident. A field ticked with an empty box *does* clear that value on every selected asset, and you are asked to confirm before it happens.

Nameplate fields belong to an equipment type, so they appear only when the whole selection is one type -- either because it already is, or because you are setting one type for all of them in the same edit. Fields you do not tick keep their existing per-asset value, so changing the frame size on forty breakers leaves each one's trip unit alone.

## Sub-assets

Real equipment nests. A switchgear lineup contains breakers. A substation contains transformers and relays.

Link a sub-asset to its parent and the list groups them together instead of scattering fifteen breakers alphabetically through the job. The deliverable follows the same grouping, so the customer's PDF reads in the order the equipment is actually laid out.

To link one, set the parent on the sub-asset when you create or edit it.

## Asset status

Each asset shows the status of its report:

| Status | Means |
|---|---|
| **In progress** | Being written. Editable. |
| **Ready for review** | Submitted. Waiting on a reviewer. |
| **Approved** | Signed off. Can go into a deliverable. |

Filter by status using the chips above the list. `Ready for review` is the reviewer's queue for this job.

## Sorting the list

Click a column header to sort. Hold **Shift** and click a second header to sort by two columns, for example parent asset first, then name.

The sort and filter you pick are remembered when you leave and come back.

## Editing assets

Click into an asset to change its name, identifier, or parent. Edits save as you make them and persist across page loads, so a half-finished rename is not lost if you get pulled away.

Changing an asset's **report type** after the report has data in it is not something you want to do; the fields do not map across form types. Delete and recreate instead, or ask an administrator.

## Moving assets to another site

Equipment imported against the wrong facility can be re-homed in bulk. This happens most often when a spreadsheet is imported with the wrong site picked in the dialog.

1. Open the site's asset list, or a job's **Assets** tab.
2. Tick the assets to move. **Shift**-click ticks a whole run, and **Select all N in this view** takes everything the current search and filters leave on screen -- so filter down to exactly what is wrong first, then select all.
3. Click **Move to site** and pick the destination.

Before the move runs it checks three things and shows you what it found:

- **Identifiers already in use at the destination.** An identifier only has to be unique within one site, building and substation, so the same name can legitimately exist at two facilities. These block the move -- rename them or untick them first.
- **Sub-assets that would be left behind.** A sub-asset has to live at the same site as its parent, so ticking a lineup brings its switches with it automatically.
- **Jobs that are not at the destination.** Their links are kept on purpose: the same equipment is often worked by more than one customer. The equipment stays on those jobs' Assets tabs. Remove it there if that is wrong.

Nothing is copied. The equipment keeps its id, so every linked report, nameplate value and note goes with it. Filings into a folder that belongs to the old site are cleared, because that folder does not exist at the destination.

## Deleting an asset

Deleting an asset deletes its report. There is no undo.

::: danger
Do not delete an asset to "clean up" a job with an approved report on it. That report may already be in a delivered package. If a piece of equipment turned out not to exist, mark it in the notes instead.
:::
