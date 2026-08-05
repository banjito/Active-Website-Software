---
title: Test values and pass/fail
description: How limits, temperature correction, and pass/fail evaluation work.
keywords: [pass fail, limits, temperature correction, insulation resistance, values]
---

The reason ampOS reports are forms rather than documents: the app understands the numbers.

## Pass and fail

Many test fields carry limits from the applicable standard for that equipment at that voltage class. Type a value and the form evaluates it against the limit right away.

A failing value is flagged as you enter it, not at the end, and not by the customer's engineer three weeks later.

::: note
A flagged value is not necessarily an error in your testing. It usually means the equipment actually has a problem, which is the whole point of testing it. Note it in the comments and recommend what should happen.
:::

## Temperature correction

Insulation resistance changes with temperature. A reading taken at 40°C and one taken at 15°C are not comparable until both are corrected to a common reference, usually 20°C.

ampOS does this for you. Enter the ambient temperature in the job information section and the correction is applied automatically to the fields that need it.

::: warning
The correction is only as good as the temperature you typed. Leaving the ambient temperature at its default makes every corrected value on the report wrong. Take the reading and enter it.
:::

Both the measured and the corrected values appear on the report, so a reader can see what was actually measured and what it corrects to.

## Units

Column headers state the unit the field expects. Megohms and gigohms are the usual pair, and mixing them up is off by a factor of a thousand.

The form does not guess. If a column says gigohms and you type a megohm value, you have recorded a reading a thousand times too low, and it will flag as a failure that is not real.

## Calculated fields

Some values are computed rather than typed: ratios, deviations, corrected values, averages. These are read-only, and keyboard navigation skips them so you never land in one.

If a calculated field looks wrong, the input feeding it is wrong. Do not go hunting for a way to override it.

## Values you cannot take

Equipment that could not be tested, whether not de-energized, not accessible, or out of service, gets left blank with an explanation in the comments. Not a zero.

A zero is a measurement. Blank plus a comment is the truth.

## Pass/fail on the whole report

Some report types carry an overall result. That is a judgement, not just an aggregation. A transformer can have one marginal reading and still be serviceable, and it can pass every numeric limit while having a cracked bushing you photographed.

Set it based on what you actually saw, and explain it in the comments.

## Trending across years

Because readings are stored as data rather than pictures, the same asset tested each year can be compared over time. A transformer whose insulation resistance has dropped steadily for four years is a finding even if every individual year passed.

That comparison only works if asset names stay consistent between visits. See [Sites](/docs/jobs/sites).
