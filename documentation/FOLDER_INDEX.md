# Folder Index

Complete file listings for all documentation and major directories.

**Last Updated**: December 2024

---

## 📁 /documentation/

### Root Files
| File | Description |
|------|-------------|
| `README.md` | Documentation index and quick reference |
| `FOLDER_INDEX.md` | This file - complete file listings |
| `FOLDER_ORGANIZATION.md` | Project structure overview |
| `autosave-implementation-guide.md` | Autosave feature guide |

### /Setup Guides/
| File | Description |
|------|-------------|
| `AUTOMATED_EMAILS_REFERENCE.md` | Complete email automation reference |
| `DAILY_EMAIL_SETUP.md` | Daily review notification setup |
| `DAILY_READY_TO_BILL_SETUP.md` | Ready-to-bill daily report |
| `READY_TO_BILL_EMAIL_SETUP.md` | Instant billing notification |
| `WEEKLY_REPORTS_SETUP.md` | Weekly reports configuration |
| `WEEKLY_REPORTS_QUICK_START.md` | Quick start for weekly reports |
| `job-notifications.md` | Job notification system |
| `README.md` | Setup guides index |

### /Feature Documentation/
| File | Description |
|------|-------------|
| `Deliverables-System.md` | Deliverables workflow documentation |
| `sla-tracking.md` | SLA management system |
| `KEYBOARD_NAVIGATION.md` | Keyboard navigation feature |
| `AGENTS.md` | AI agents and code style guide |
| `RUNWAY_MEETING_GUIDE.md` | EOS Level 10 meetings |
| `BACK_TO_JOB_BUTTON.md` | Navigation enhancement |
| `README-task-master.md` | Task master documentation |
| `README.md` | Feature documentation index |

### /Technical Reference/
| File | Description |
|------|-------------|
| `CROSS_SCHEMA_QUERIES.md` | Multi-schema query patterns |
| `default-job-files.md` | Default file configurations |
| `REPORT_STANDARDIZATION_PLAN.md` | Report standardization |
| `storage-buckets-setup.md` | Supabase storage setup |
| `supabase-document-storage.md` | Document storage patterns |
| `update_frontend_guide.md` | Frontend update procedures |
| `README.md` | Technical reference index |

### /Database & Schema/
| File | Description |
|------|-------------|
| `schema_relationships.md` | Table relationships |
| `schema.dbml` | Schema in DBML format |
| `README.md` | Database documentation index |

### /Custom Reports/
| File | Description |
|------|-------------|
| `CUSTOM_FORMS_README.md` | Main custom forms docs |
| `CUSTOM_FORMS_IMPLEMENTATION_GUIDE.md` | Implementation guide |
| `CUSTOM_FORMS_CONTEXT.md` | Context and background |
| `CUSTOM_FORMS_SUMMARY.md` | Feature summary |
| `CUSTOM_FORMS_FILES_CREATED.md` | Created files list |
| `QUICK_START.md` | Quick start guide |
| `TODO.md` | Remaining tasks |
| `README.md` | Custom reports index |

### /Migration & Fixes/
| File | Description |
|------|-------------|
| `SCHEMA_MIGRATION.md` | Schema migration procedures |
| `REPORT_SAVING_FIX_INSTRUCTIONS.md` | Report saving fixes |
| `SENT_STATUS_MIGRATION_INSTRUCTIONS.md` | Status migration |
| `README.md` | Migration index |

### /Troubleshooting/
| File | Description |
|------|-------------|
| `manual_fix_instructions.md` | Manual fix procedures |
| `README.md` | Troubleshooting index |

### /Windows Compatibility/
| File | Description |
|------|-------------|
| `WINDOWS_MATCHING_STRATEGY.md` | Windows compatibility |
| `WINDOWS_PRINT_FIX.md` | Print fixes |
| `WINDOWS_TEST_CHECKLIST.md` | Testing checklist |
| `README.md` | Windows docs index |

### /devlogs/
| File | Description |
|------|-------------|
| `nov7log.md` | November 7 development notes |
| `nov15log.md` | November 15 development notes |

---

## 📁 /Database Scripts/

### /Setup & Configuration/ (18 files)
| File | Purpose |
|------|---------|
| `create_deliverables_table.sql` | Deliverables table |
| `add_status_to_generated_documents.sql` | Document locking |
| `add_report_selection_to_cover_letters.sql` | Report selection |
| `add_update_delete_policies_generated_documents.sql` | RLS policies |
| `create_liquid_filled_xfmr_ats25_reports.sql` | Transformer table |
| `create_small_lv_dry_type_transformer_ats25_reports.sql` | Transformer table |
| `create_subcontractor_agreements.sql` | Subcontractor table |
| `add_portal_preferences_to_profiles.sql` | Portal preferences |
| `add_pause_functionality_to_issues.sql` | Issue pause |
| `add-submittal-tracking.sql` | Submittal tracking |
| `asset-approval-workflow-setup.sql` | Asset workflow |
| `fix_issue_priority_permissions.sql` | Issue permissions |
| `manual-set-report-timestamps.sql` | Timestamps |
| `manual-setup-technical-reports.sql` | Reports setup |
| `manual-setup-technical-reports-fixed.sql` | Fixed version |
| `check_and_create_table.sql` | Table check |
| `step1_check_table.sql` | Migration step 1 |
| `step2_create_table.sql` | Migration step 2 |

### /Report Tables/ (10 files)
| File | Report Type |
|------|-------------|
| `gfi_trip_test_reports.sql` | GFI Trip Test |
| `current_transformer_test_ats_reports.sql` | CT ATS |
| `current_transformer_test_mts_reports.sql` | CT MTS |
| `voltage_potential_transformer_mts_reports.sql` | PT MTS |
| `medium_voltage_circuit_breaker_reports.sql` | MV CB |
| `medium_voltage_vlf_mts_reports.sql` | MV VLF MTS |
| `automatic_transfer_switch_ats_reports.sql` | ATS |
| `low_voltage_panelboard_small_breaker_reports.sql` | Panelboard |
| `create_lv_cb_et_ats_table.sql` | LV CB ET |
| `medium_voltage_cable_vlf_test.sql` | MV Cable VLF |

### /Fixes & Maintenance/ (8 files)
| File | Purpose |
|------|---------|
| `FIX_ASSETS_CONSTRAINT.sql` | Asset constraints |
| `fix_chat_schemas_simple.sql` | Chat schema |
| `fix_quoted_amount.sql` | Quoted amount |
| `fix_subcontractor_agreements_policies.sql` | Subcontractor RLS |
| `fix-asset-reports-table.sql` | Asset reports |
| `fix-foreign-key-constraints.sql` | Foreign keys |
| `disable_rls_subcontractor_agreements.sql` | Disable RLS |
| `step3_fix_permissions.sql` | Permissions |

### /Verification & Testing/ (4 files)
| File | Purpose |
|------|---------|
| `schema_access_verification.sql` | Schema access |
| `schema_access_verification_fixed.sql` | Fixed version |
| `verification_query.sql` | General verification |
| `debug_job_status.sql` | Job status debug |

### /Historical Migrations/ (68+ files)
Archived migration scripts from previous releases.

---

## 📁 /src/components/

### /reports/ (70+ files)
| Category | Count | Key Files |
|----------|-------|-----------|
| ATS Reports | 30+ | `SwitchgearReport.tsx`, `PanelboardReport.tsx`, etc. |
| MTS Reports | 20+ | Various MTS variants |
| Specialized | 10+ | `GFITripTestReport.tsx`, `OilInspectionReport.tsx` |
| Common | 5 | `reportMappings.ts`, `ReportWrapper.tsx`, `ReportUtils.ts` |

### /jobs/ (18 files)
| File | Description |
|------|-------------|
| `JobList.tsx` | Job listing |
| `JobDetail.tsx` | Job details view |
| `JobDeliverables.tsx` | Deliverables management |
| `DeliverableViewer.tsx` | PDF generation |
| `JobCostTracking.tsx` | Cost tracking |
| `JobProfitabilityAnalysis.tsx` | Profitability |
| `SLAManagement.tsx` | SLA tracking |
| `JobResources.tsx` | Resource allocation |
| `JobNotifications.tsx` | Notifications |
| `JobCreationForm.tsx` | Job creation |
| `JobDiagnostics.tsx` | Diagnostics |
| `JobSurveys.tsx` | Surveys |
| `OneLineDrawings.tsx` | Drawings |
| `SubmittalTracker.tsx` | Submittals |
| `GeneratedDocumentViewer.tsx` | Document viewer |
| `ResourceAllocationManager.tsx` | Resources |
| `OpportunityList.tsx` | Opportunities |
| `OpportunityDetail.tsx` | Opportunity details |

### /admin/ (12 files)
| File | Description |
|------|-------------|
| `AdminDashboard.tsx` | Main dashboard |
| `AdminUserManagement.tsx` | User management |
| `PermissionManagement.tsx` | Permissions |
| `RoleManagement.tsx` | Roles |
| `RoleAuditLogs.tsx` | Audit logs |
| `SystemHealthMonitoring.tsx` | System health |
| `SystemLogsCard.tsx` | Logs display |
| `EncryptionSettings.tsx` | Encryption |
| `PortalConfiguration.tsx` | Portal config |
| `DataBackupControls.tsx` | Backups |
| `NotificationDevControls.tsx` | Notifications |
| `InProgressDashboard.tsx` | In-progress view |

### /equipment/ (11 files)
| File | Description |
|------|-------------|
| `EquipmentManagement.tsx` | Management |
| `EquipmentTracking.tsx` | Tracking |
| `EquipmentTable.tsx` | Table view |
| `EquipmentForm.tsx` | Forms |
| `EquipmentDetailsModal.tsx` | Details |
| `EquipmentAssignmentModal.tsx` | Assignments |
| `AssignmentForm.tsx` | Assignment form |
| `MaintenanceSchedule.tsx` | Maintenance |
| `MaintenanceForm.tsx` | Maintenance form |
| `VehicleManagement.tsx` | Vehicles |
| `VehicleTracking.tsx` | Vehicle tracking |

### /customForms/ (5 files)
| File | Description |
|------|-------------|
| `FormBuilder.tsx` | Main builder |
| `FormCanvas.tsx` | Canvas area |
| `ComponentLibrarySidebar.tsx` | Component library |
| `SectionEditor.tsx` | Section editing |
| `FormPreview.tsx` | Preview mode |

### /customers/ (10 files)
Customer management components.

### /dashboards/ (8 files)
Division-specific dashboard components.

### /ui/ (37 files)
Reusable UI components (Button, Dialog, Input, etc.).

---

## 📁 /src/services/

### Root Services (11 files)
| File | Purpose |
|------|---------|
| `jobService.ts` | Job operations, resources, costs |
| `slaService.ts` | SLA management |
| `auditService.ts` | Activity logging |
| `pdfExportService.ts` | PDF generation |
| `notificationService.ts` | Notifications |
| `roleService.ts` | Role management |
| `permissionService.ts` | Permissions |
| `metricsService.ts` | Metrics |
| `customerService.ts` | Customers |
| `encryptionService.ts` | Encryption |
| `versionChecker.ts` | Version checking |

### /reportImport/ (42 files)
Report import services for various report types.

---

## 📁 /src/lib/

### Root Files
| File | Purpose |
|------|---------|
| `AuthContext.tsx` | Authentication context |
| `DivisionContext.tsx` | Division context |
| `ThemeContext.tsx` | Theme management |
| `supabase.ts` | Supabase client |
| `types.ts` | Type definitions |
| `utils.ts` | Utility functions |
| `roles.ts` | Role definitions |
| `keyboardNavigation.ts` | Keyboard nav system |

### /types/ (8 files)
TypeScript type definitions.

### /services/ (8 files)
Service layer utilities.

### /hooks/ (4 files)
React hooks.

---

## 📁 /supabase/functions/

| Function | Purpose |
|----------|---------|
| `/daily-review-notification/index.ts` | Daily review email |
| `/daily-ready-to-bill-report/index.ts` | Billing report |
| `/ready-to-bill-notification/index.ts` | Instant billing alert |
| `/weekly-po-report/index.ts` | Weekly PO report |
| `/weekly-jobs-status-report/index.ts` | Weekly status report |

---

## 📁 /scripts/

| Script | Purpose |
|--------|---------|
| `test-daily-ready-to-bill-report.js` | Test billing report |
| `test-review-notification.js` | Test review email |
| `test-weekly-reports.js` | Test weekly reports |
| `test-weekly-po-data.js` | Test PO data |
| `test-weekly-jobs-data.js` | Test jobs data |
| `run_sla_migration.js` | SLA migration |
| `run_job_notification_migration.js` | Notification migration |
| Various other test and utility scripts |

---

## 📁 Root Files

| File | Description |
|------|-------------|
| `README.md` | Project README |
| `CHANGELOG.md` | Change log |
| `QUICK_START_GUIDE.md` | Quick start |
| `AUTO_UPDATE_SYSTEM.md` | Auto-update docs |
| `SMART_UPDATE_BEHAVIOR.md` | Smart updates |
| `CACHE_FIX_INSTRUCTIONS.md` | Cache fixes |
| `package.json` | Dependencies |
| `vite.config.ts` | Vite configuration |
| `tailwind.config.cjs` | Tailwind config |
| `tsconfig.json` | TypeScript config |
| `netlify.toml` | Netlify deployment |

---

## Statistics

| Category | Count |
|----------|-------|
| Documentation files | 65+ |
| React components | 270+ |
| Report types | 60+ |
| Database scripts | 100+ |
| Services | 50+ |
| Edge functions | 5 |

---

*This index is automatically maintained. Last generated: December 2024*
