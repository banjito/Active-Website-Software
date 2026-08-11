---
title: MOP library
description: Method of Procedure documents for NETA acceptance testing, written for the crew doing the work.
keywords: [MOP, method of procedure, NETA, ATS, acceptance testing, field procedure]
---

A **Method of Procedure (MOP)** is the written plan for a single piece of equipment: what
you are testing, what you need, what could hurt you, and the order the tests run in. Every
MOP in this library is written against the **NETA ATS (Acceptance Testing Specifications)**
standard.

Open the MOP for the equipment in front of you before you start, not after. In the field
you can reach these from the life ring icon in a job's **Reports** tab, which opens the same
text in a side panel without losing your place on the job.

## What is in every MOP

Each procedure follows the same shape, so you always know where to look:

| Section | What it answers |
| --- | --- |
| Purpose | Why this procedure exists and what standard it meets |
| Scope | What equipment it covers |
| Safety and precautions | What has to be true before anyone touches the gear |
| Equipment and tools | What to load out before you leave the shop |
| Procedure | Preparation, visual inspection, then the electrical tests in order |
| Conclusion | How the site gets left |

## The rules that apply to all of them

::: danger
Nothing in these procedures starts until the equipment is de-energized, isolated, verified
dead, and locked out. If any one of those is missing, stop.
:::

- Follow every applicable safety regulation, and wear the appropriate PPE for the task and
  the incident energy at that equipment.
- Verify that every test set is in calibration and in good working order before it leaves
  the shop. An out-of-cal instrument invalidates the whole report.
- Barricade the test area and post signs. Nobody wanders into a hipot.
- Where a MOP cites manufacturer's published data, use it. Only fall back to NETA
  **Table 100.1** when the manufacturer's data is genuinely unavailable.
- Record what you measured, not what you expected. Deviations get noted and investigated,
  not smoothed over.

## The procedures

### Switching and protection

- [Transfer switch](/docs/procedures/transfer-switch) — automatic, static, and manual ATS
- [Transfer control panel](/docs/procedures/transfer-control-panel)
- [Low-voltage circuit breaker](/docs/procedures/low-voltage-circuit-breaker)
- [Low-voltage switch and disconnect](/docs/procedures/low-voltage-switch)
- [Switchboard](/docs/procedures/switchboard)

### Power equipment

- [Transformer](/docs/procedures/transformer)
- [Medium-voltage cable](/docs/procedures/medium-voltage-cable)
- [Uninterruptible power supply](/docs/procedures/uninterruptible-power-supply)
- [Generator](/docs/procedures/generator)

## Recording the results

The MOP tells you what to perform. The [report](/docs/reports/overview) is where the values
land. Fill the report out as you go rather than from memory at the end of the day, and use
the report's comments field for anything the MOP told you to investigate further.
