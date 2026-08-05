---
title: Components and field types
description: The full component library, and the field types inside each one.
keywords: [components, fields, library, table, insulation, calculated, dropdown]
---

Two layers here. **Components** are the blocks you drag onto the canvas. **Field types** are what individual cells inside a component can be.

## The component library

### Start with these

| Component | What it gives you |
|---|---|
| **Job Info** | Customer, site, job number, date, technician, substation, equipment location. Mostly pre-filled from the job. |
| **Nameplate Data** | Manufacturer, catalog number, serial, ratings. |
| **Extended Nameplate** | The above with additional rating fields, for larger equipment. |
| **Comments** | Free text. Put one at the end of every form. |
| **Test Equipment** | Instruments used, with serials and calibration dates. |
| **Visual Inspection** | NETA-style checklist with the standard result dropdown. |

### Insulation and dielectric

| Component | Use for |
|---|---|
| **Insulation Test** | Standard insulation resistance grid |
| **Insulation by Winding** | Insulation resistance broken out per winding |
| **Temperature Correction** | Applies correction factors to measured values |
| **Dielectric Absorption** | DA ratio testing |
| **Polarization Index** | PI testing |
| **Withstand Test** | Applied withstand voltage |
| **Applied Voltage** | Applied voltage testing |
| **Power Factor** | Power factor / dissipation factor |
| **Capacitance Test** | Capacitance measurement |
| **Oil Test** | Insulating oil results |

### Resistance and ratio

| Component | Use for |
|---|---|
| **Contact Resistance** | Contact / micro-ohm readings |
| **Winding Resistance** | Winding resistance measurement |
| **Resistance Readings** | General resistance grid |
| **Turns Ratio** | Transformer turns ratio |
| **Ratio / Polarity CT-PT** | Instrument transformer ratio and polarity |
| **Shield Continuity** | Cable shield continuity |

### Readings

| Component | Use for |
|---|---|
| **Voltage Readings** | Voltage measurement grid |
| **Current Readings** | Current measurement grid |
| **Contact Timing** | Breaker contact timing |
| **Fuse Data** | Fuse ratings and details |

### Breakers and trip units

| Component | Use for |
|---|---|
| **LV Breaker Nameplate** | Low-voltage breaker identification |
| **Trip Unit Settings** | Trip unit configuration |
| **Device Settings (As Found / As Left)** | Settings before and after adjustment |
| **Primary Injection (LV)** | Primary injection results |
| **Secondary Injection** | Secondary injection results |
| **Secondary Injection (LV)** | Low-voltage secondary injection |

### Build your own

| Component | Use for |
|---|---|
| **Custom Table** | A grid with columns you define |
| **Conditional Table** | A grid whose rows appear based on a dropdown. Pick `Primary` and get four rows, `Secondary` and get two |
| **Custom Text** | A free-form block |

::: tip
Reach for a purpose-built component before **Custom Table**. `Insulation Test` already has the right columns, the right units, and correction wired in. A custom table you built to look like it does not.
:::

## Field types

Inside a component, each cell is one of these.

### Text

Free text, one line. Names, catalog numbers, locations.

### Textarea

Multi-line text. Comments, findings, notes.

### Number

Numeric only. Use this rather than Text for anything you might ever want to compare, total, or trend. A reading stored as text is a reading you cannot do anything with.

### Date

A date picker. Test dates, calibration dates.

### Select

A dropdown with options you define.

Two rules that make dropdowns good: put the most common option first, and always include an escape hatch (`Other`, `See comments`). A technician who cannot express what they found will type something wrong instead.

### Checkbox

A single yes/no. Good for "cover removed", "customer witnessed".

### Calculated

A read-only field computed from other fields. Ratios, deviations, averages.

Keyboard navigation skips calculated fields, so technicians never land in one by accident.

### Temperature / Humidity

A special combined cell: temperature in °F as an input, °C and the temperature correction factor read-only alongside it, and humidity as an input.

::: warning
Use this rather than three separate number fields. It is what feeds temperature correction elsewhere on the form. Hand-rolled temperature fields do not.
:::

## Required and read-only

Any field can be marked **required** (the form is incomplete without it) or **read-only** (displayed but not editable).

Mark required sparingly. See the note in [Building a template](/docs/custom-forms/building-a-template).

## Print layout

Wide tables need a print layout set, or they run off the edge of the page. Set it on the component, then print the preview to confirm.
