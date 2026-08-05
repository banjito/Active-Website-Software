---
title: Building a template
description: Step by step through the builder, from empty canvas to published form.
keywords: [builder, template, sections, components, publish, drag]
---

## Open the builder

Go to **Custom forms → Templates**, then **New template**. Or open an existing template to edit it.

The builder has three parts: the **component library** down the left, the **canvas** in the middle, and **settings** for whatever you have selected.

## Step 1: Name it

Fill in the template name first. A technician picks this from a dropdown when adding an asset, so make it recognizable at a glance.

- Good: `Arc Flash Survey - Acme Chemical`
- Bad: `Form 3`

Add a **description** so other people know when to use it, and a **NETA section** (`ATS 7.3.3`, `MTS 4.2`) if the form corresponds to a standard clause.

## Step 2: Set the form settings

Four switches control the shape of the whole document:

| Setting | Turn it on when |
|---|---|
| **Include job info** | Almost always. Adds the customer/site/job header block. |
| **Include print header** | The form goes to a customer. Adds branding to the printed page. |
| **Include pass/fail** | The form produces a verdict. Turn off for surveys and checklists. |
| **Page break after section** | Each section should start on a fresh printed page. |

## Step 3: Add sections

A section is a titled block of the report: `Nameplate Data`, `Insulation Resistance`, `Comments`.

Add a section, give it a title, then drag components into it.

Keep sections in the order a technician works: identification first, then inspection, then tests, then equipment used, then comments. A form that jumps around is a form people fill in wrong.

## Step 4: Drag in components

Pull components from the library on the left onto the canvas.

Start with these three on almost every form:

1. **Job Info.** Customer, site, job number, date, technician. Mostly pre-filled from the job.
2. **Nameplate Data.** Manufacturer, model, serial, ratings.
3. **Comments.** Free text at the end.

Then add the testing components that match what is actually being measured. The full library is in [Field types](/docs/custom-forms/field-types).

## Step 5: Configure each component

Click a component on the canvas to edit it. Depending on the type, you can:

- Rename the label
- Add, remove, and rename **columns** on tables
- Mark fields **required**
- Mark fields **read-only** (calculated values)
- Set default values
- Set the print layout for wide tables

::: tip
Mark a field required only if the form is genuinely wrong without it. A form with thirty required fields is a form technicians will fight, and the one field that actually mattered gets lost among the twenty-nine that did not.
:::

## Step 6: Preview

Click **Preview**. You get the form exactly as a technician will see it.

Fill it in. Really, type into it. Preview is the only place you will notice that your test grid has its columns in a confusing order, or that a dropdown is missing its most common option.

Then print the preview. Wide tables that look fine on screen fall off the edge on paper, and that is much easier to fix now than after forty of them exist.

## Step 7: Save

Click **Save**. The template now exists, but nobody else can use it.

## Step 8: Publish

Click **Publish**. The template now appears in the report type list when someone adds an asset to a job.

::: warning
You have to save before you can publish. If the publish button tells you to save first, that is exactly what it means: your latest changes are not on the server yet.
:::

## Editing a published template

You can. Changes apply to **new** instances only; forms already filled in keep the structure they were filled in with.

That is what you want. A report a customer already received should not change shape because someone edited the template afterwards.

## Retiring a template

**Unpublish** it. It disappears from the job dropdown, and every instance already created stays exactly as it is.

Do not delete a template that has instances against it.

## Saved components

If you build a component configuration you will reuse, such as a test grid with your company's standard columns, save it. It becomes available to drop into future templates without rebuilding it.
