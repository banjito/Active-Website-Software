---
title: Saving and autosave
description: Reports save themselves. What that means for bad signal, tabs, and two people editing at once.
keywords: [save, autosave, lost work, offline, connection]
---

Reports save automatically as you type. There is no save button to forget.

## How it works

About half a second after you stop typing, the report saves in the background. No dialog, no spinner blocking the form, no interruption.

A **Auto Saving Enabled** badge on the report tells you the feature is active on that form.

The first autosave on a brand-new report also creates the report record and updates the address in your browser bar to include the new report ID. That is normal. It means the report now exists and is safe to navigate away from.

## What this means in practice

**You do not need to save.** Fill in the form and leave. It is saved.

**A dropped connection does not lose the whole report.** Only whatever you typed in the last moment before it dropped. Reconnect and keep going.

**Closing the tab is safe** as long as you have paused typing for a second first.

::: tip
In a substation with bad signal, watch the connection rather than the form. If the browser shows you are offline, stop entering data and get to signal. Anything you type while disconnected is not saved. Write it on paper for the moment and enter it after.
:::

## When you submit

Submitting for review does a final save and then changes the status. It does not overwrite anything you typed.

## Two people in the same report

Do not do this. ampOS does not merge simultaneous edits. The last save wins, and the other person's work is silently replaced.

On a big job, split by asset. Two technicians on twenty panels should take ten each, not both work the same report.

::: warning
This is the one way to genuinely lose work in ampOS. If someone else has a report open, wait or take a different asset.
:::

## Editing an approved report

Approved reports lock. If something needs to change after approval, a reviewer sends it back to `In progress`, you fix it, and it goes through review again.

That is friction on purpose. An approved report may already be in a package sitting in a customer's inbox, and quietly editing it after the fact means the version they have and the version you have no longer match.

## Recovering something

There is no undo history on a field. If you overwrote a value and cannot remember it, the sources of truth are:

1. Your photos of the equipment and the instrument display
2. Your field notes
3. Re-testing

Which is the real argument for photographing instrument readings as you take them.
