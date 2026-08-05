---
title: Using a form on a job
description: Attaching a published custom form to an asset and filling it out.
keywords: [use form, fill, instance, attach, job]
---

Once a template is published, it behaves like any built-in report.

## Attaching one

1. Open the job and go to the **Assets** tab.
2. Click **Add asset**.
3. Name the asset and enter its identifier.
4. In the report type list, pick your custom form. Published custom forms appear alongside the built-in reports.
5. Save. The form opens.

::: note
If the form you want is not in the list, it is not published. Saving a template is not enough; someone has to publish it. See [Building a template](/docs/custom-forms/building-a-template).
:::

## Filling it out

Exactly like a built-in report:

- The job info block is pre-filled from the job. Check it rather than assuming.
- Arrow keys move between fields, `Enter` advances, and existing text is selected when you land. See [Keyboard shortcuts](/docs/getting-started/keyboard-shortcuts).
- Calculated fields are skipped automatically.
- It saves as you type. There is no save button to forget.

## Pass or fail

If the template has pass/fail enabled, set the overall result before you submit. It is a judgement about the equipment, not an automatic total of the fields above it.

If the template has pass/fail turned off, as on a survey or a checklist, there is nothing to set.

## Review and approval

Custom forms go through the same review flow as everything else: `In progress` → `Ready for review` → `Approved`. You cannot approve your own.

See [Review and approval](/docs/reports/review-and-approval).

## In deliverables

Approved custom form instances can be selected into a deliverable alongside built-in reports, and they print with the same branding and continuous page numbering.

See [Building a deliverable](/docs/deliverables/building-a-deliverable).

## If the template changes

Instances keep the structure they were created with. Editing the template afterwards does not reshape forms that are already filled in.

So if a template gains a section in March, a form filled in during February will not have it. That is intentional. The alternative is reports silently changing after a customer has received them.

## If a template is unpublished

Existing instances are untouched and stay readable, printable, and includable in deliverables. You just cannot create new ones.

## Troubleshooting

| Problem | Cause |
|---|---|
| The form is not in the report type list | Not published |
| Job info is blank | The job is missing customer or site details |
| A field will not accept typing | It is calculated or read-only |
| Temperature correction is not applying | The form uses plain number fields instead of the Temperature/Humidity component |
| The printed form runs off the page | The component's print layout is not set. Fix it on the template |
