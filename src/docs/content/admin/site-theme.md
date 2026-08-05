---
title: Site theme
description: Logo, brand color, and the company details that print on documents.
keywords: [theme, logo, brand, color, branding, white label, customize]
---

Every ampOS instance carries its own branding. Set it once here and it flows through the app, the generated documents, and anything a customer sees.

## Where it is

**Admin → Site theme.**

## The logo

Upload your company logo. It appears in the top bar, on the portal, on the docs, and on generated documents.

What works:

- **SVG** if you have it. Sharp at every size, and it inverts cleanly in dark mode.
- **PNG with a transparent background** otherwise.
- A **wide** logo rather than a tall one. The header is short, so a tall logo gets scaled down until the text is unreadable.

There is also an **icon**, the square mark used where a full logo will not fit, like the browser tab.

::: tip
Check the logo in dark mode before you finish. Dark logos on dark backgrounds are the most common branding mistake, and you will not see it if you only ever use light mode.
:::

You can also hide the logo entirely, for instances that would rather show only the product name.

## The brand color

The brand color drives buttons, links, active navigation, and accents across the app.

Pick something with enough contrast to read as text on white **and** on the dark background. A pale color that looks good on a marketing site becomes unreadable link text in dark mode.

::: warning
The brand color is used for interactive elements. Choosing a red or amber that reads as "error" or "warning" makes normal buttons look alarming. Test it on a page with real content before committing.
:::

## Company details

The company details set here print on generated documents (proposals, purchase orders, deliverables, certificates):

- Full company name, and the legal entity name for contract language
- Address, and the footer variant used on proposals
- Phone
- Accounting and purchase-order email addresses
- Website

Get these right. They go out on every customer-facing document, and a wrong address on a proposal is the sort of error a customer remembers.

## Where branding shows up

| Place | Uses |
|---|---|
| Top bar and portal | Logo |
| Documentation | Logo |
| Browser tab | Icon |
| Buttons, links, active nav | Brand color |
| Deliverable covers | Logo, colors, company details |
| Proposals | Logo, company details, footer address |
| Purchase orders | Logo, company details, PO email |
| Certificates | Logo, company details |

## Light and dark mode

Both are supported everywhere, and users pick per device. Anything you set here has to work in both.

Check after changing the logo or the brand color:

1. The portal in both modes
2. A generated deliverable PDF
3. A report print preview

## For a new instance

Branding is one of the first things to set when standing up an instance for a new company, before anyone generates a customer document with the wrong logo on it.

The rest of the instance setup is a separate process; ask whoever handles deployment.
