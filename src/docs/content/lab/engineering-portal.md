---
title: Engineering portal
description: Designs, drawings, standards, and the technical documentation field crews depend on.
keywords: [engineering, drawings, one line, standards, design, documentation]
---

The engineering portal holds design work and the reference material field crews depend on.

## What lives here

| Page | Covers |
|---|---|
| **Designs** | Design work in progress, with an approval workflow |
| **Drawings** | The drawing repository: one-lines, schematics, layouts |
| **Standards** | Standards compliance and updates |
| **Documentation** | The technical documentation library |

## Designs and approval

Design work goes through an approval workflow before it is issued, on the same principle as report review. Something leaving the company gets checked by someone who did not produce it.

## The drawing repository

Drawings are stored centrally rather than emailed around.

The one that matters most to field crews is the **one-line**. A crew that has the current one-line before they arrive:

- Knows what equipment is actually there
- Can count devices against the scope
- Does not spend the first two hours tracing circuits

::: tip
Attach the current one-line to the job at the start. Every technician who opens the job then has it, instead of three of them texting the project manager for it on separate days.
:::

## Versions

Drawings change. Keep revisions rather than overwriting, and make sure the revision on the job is the current one.

::: warning
An out-of-date one-line is worse than none. A crew trusts it, counts twelve breakers, and finds nineteen. Now the scope, the estimate, and the schedule are all wrong.
:::

## Standards

Standards compliance tracks which standards apply and what changed when they are updated.

This matters directly to testing: when an acceptance testing edition is revised, the limits can change. A report written against the wrong edition passes equipment that the current edition would fail.

See [Report catalog](/docs/reports/catalog).

## Technical documentation

The internal library: reference material, equipment documentation, technical notes.

Useful for the things everyone looks up and nobody remembers: correction factor tables, typical values by equipment class, manufacturer quirks.

## Engineering and jobs

Engineering work often supports a job rather than being one. When it does, attach the output to the job so the crew doing the field work has it, and so the effort is visible in job costs.

See [Job files and documents](/docs/jobs/files-and-documents).

## Related

- [Lab overview](/docs/lab/overview)
- [Assets](/docs/jobs/assets): counting equipment off the one-line
