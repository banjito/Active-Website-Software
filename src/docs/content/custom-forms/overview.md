---
title: Custom forms overview
description: Build your own report templates from pre-made testing components, without writing code.
keywords: [custom form, template, builder, own report, no code]
---

The built-in catalog covers standard NETA testing. Custom forms cover everything else: a customer's proprietary checklist, an internal QC form, a specialty test your company does that nobody else does.

Once published, a custom form behaves like a built-in report: it attaches to a job, it goes through review, and it lands in deliverables.

## How it differs from a form builder you have used before

Most form builders give you a blank page and a text box. This one gives you **testing components**.

A component is a whole block of a test report that already knows how it works. `Insulation Test` arrives as a proper grid with the right columns. `Temperature Correction` arrives already wired to apply correction factors. `Visual Inspection` arrives as a NETA-style checklist with the standard result dropdown.

You assemble a report out of roughly forty of these, rather than building an insulation resistance grid one cell at a time.

## Templates and instances

Two words that get confused constantly.

| Term | What it is |
|---|---|
| **Template** | The blank form you designed. One per report type. |
| **Instance** | One filled-out copy, attached to a job. Many per template. |

Editing a template does not change instances already filled in. That is deliberate. A report a customer already received should not silently change because someone tweaked the template.

## The lifecycle

1. **Build** the template in the builder.
2. **Save** it. It exists, but nobody can use it yet.
3. **Preview** it to see what a technician will actually get.
4. **Publish** it. Now it appears in the report list when someone adds an asset to a job.
5. Technicians fill out **instances** against jobs.
6. **Unpublish** it when it is retired. Existing instances are untouched.

::: note
Save and publish are two separate buttons. Saving does not publish. A template you saved but never published is invisible to everyone else, which is useful while you are still working on it.
:::

## Pass/fail

Custom form instances carry an overall result of `PASS` or `FAIL`. Whether that appears at all is a template setting. Turn it off for forms where a verdict makes no sense, like a site survey.

## NETA section

Templates have a NETA section field: `ATS 7.3.3`, `MTS 4.2`. Fill it in when the form corresponds to a standard clause. It prints on the report, and it is the first thing a customer's engineer looks for.

## When to build one instead of asking for a built-in

Build a custom form when:

- The form is specific to one customer or one contract
- It is a checklist or survey rather than an electrical test
- You need it this week

Ask for a built-in report when:

- It is a standard NETA test every company in the industry performs
- It needs calculations the component library does not offer

## What to read next

- [Building a template](/docs/custom-forms/building-a-template)
- [Field types](/docs/custom-forms/field-types): the component library and the field types inside it
- [Using a form on a job](/docs/custom-forms/using-on-a-job)
