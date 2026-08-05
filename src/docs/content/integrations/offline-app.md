---
title: Offline reports app
description: A desktop app for writing reports where there is no signal.
keywords: [offline, desktop, electron, no signal, substation, app]
---

Substations, basements, and rural plants do not have connectivity. The offline app is a desktop application for writing reports without a connection.

## What it is

A standalone desktop app for Windows and macOS, containing the report forms and nothing else.

- **No login.** It runs locally.
- **No cloud.** Everything is stored on that machine.
- **Reports only.** No jobs list, no deliverables, no scheduling, no customers.
- **The same forms.** The report components are the same ones the web app uses, so a report written offline looks and behaves identically.
- **PDF export** built in.

## When to use it

Use it when you genuinely have no connection: an underground vault, a plant that blocks cellular, a site where the guest Wi-Fi does not reach the switchgear room.

Do **not** use it as your default. The web app saves as you type, keeps reports attached to their job, and puts them into review automatically. The offline app is a workaround for a specific problem, and every report written in it has to be brought back by hand.

::: tip
Marginal signal is not the same as no signal. If you have any connection at all, the web app is better. It saves continuously, and a report that saved is worth more than a report you have to transfer later.
:::

## Installing it

Installers are published as releases rather than bundled with the app. Ask an administrator for the current download link for your platform.

It installs like any normal desktop application. You do not sign in.

## Writing a report offline

1. Open the app.
2. Find the report type in the searchable list.
3. Fill it in exactly as you would in the web app. Same layout, same keyboard navigation.
4. It saves locally as you go.
5. Export to PDF if you need a copy on site.

## Getting reports back into ampOS

Reports are transferred as files rather than syncing automatically. Export from the offline app, then bring the file back into ampOS.

::: warning
Nothing is automatic here. A report written offline is not in ampOS until someone moves it there. Do the transfer the same day. A report sitting on a laptop is not in review, is not in a deliverable, and is not backed up.
:::

## Current limitations

- **No automatic sync.** Transfer is manual.
- **No job context.** The app does not know your jobs, so job information is typed rather than pre-filled.
- **No review workflow.** Review happens after the report reaches ampOS.
- **Local storage only.** A report on a laptop that dies is gone. There is no backup.
- **One machine.** Reports do not follow you to another computer.

## Before a job with no signal

1. Confirm the app is installed and opens.
2. Know which report types you will need.
3. Have the job number, customer, and site details written down. The app cannot look them up.
4. Photograph nameplates as usual; photos are attached after transfer.
5. Plan when you will transfer the reports.

## Related

- [Saving and autosave](/docs/reports/saving-and-autosave): how the web app protects work on a bad connection
- [Filling out a report](/docs/reports/filling-out-a-report): the forms are the same
