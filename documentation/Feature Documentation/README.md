# Feature Documentation

Documentation for major application features.

**Last Updated**: January 2025

---

## 📋 Features Index

### Core Features

| Document | Feature | Status |
|----------|---------|--------|
| [Deliverables-System.md](./Deliverables-System.md) | Deliverables & PDF Generation | ✅ Active |
| [sla-tracking.md](./sla-tracking.md) | SLA Management | ✅ Active |
| [KEYBOARD_NAVIGATION.md](./KEYBOARD_NAVIGATION.md) | Keyboard Navigation | ✅ Active |
| [RUNWAY_MEETING_GUIDE.md](./RUNWAY_MEETING_GUIDE.md) | EOS Level 10 Meetings | ✅ Active |
| [AGENTS.md](./AGENTS.md) | Code Style & AI Agents | ✅ Active |
| [BACK_TO_JOB_BUTTON.md](./BACK_TO_JOB_BUTTON.md) | Navigation Enhancement | ✅ Active |
| [README-task-master.md](./README-task-master.md) | Task Master | ✅ Active |
| [`/src/components/reports/README.md`](../../src/components/reports/README.md) | Report Approval Workflow | ✅ Active |
| [HR_DEVELOPMENT.md](./HR_DEVELOPMENT.md) | HR Portal | ✅ Active |
| [HR_SUMMARY.md](./HR_SUMMARY.md) | HR Portal (Summary) | ✅ Active |
| [HELP_CENTER_PDF_UPLOAD.md](./HELP_CENTER_PDF_UPLOAD.md) | Help Center PDF Upload | ✅ Active |

---

## 🚀 Feature Overview

### Deliverables System
Package multiple reports into professional deliverables for customers.

**Key Capabilities:**
- Select reports via cover letters
- Generate combined PDFs
- Review and approval workflow
- Document locking after delivery
- Executive summary support

**Components:**
- `JobDeliverables.tsx` - Deliverables management
- `DeliverableViewer.tsx` - PDF generation

**[Full Documentation →](./Deliverables-System.md)**

---

### SLA Tracking
Monitor and enforce service level agreements on jobs.

**Key Capabilities:**
- Define SLA templates (response time, resolution time)
- Apply SLAs to jobs
- Real-time compliance monitoring
- Violation tracking and notifications
- Performance metrics

**Components:**
- `SLAManagement.tsx` - SLA tracking UI
- `slaService.ts` - SLA service layer

**[Full Documentation →](./sla-tracking.md)**

---

### Keyboard Navigation
Global keyboard navigation for efficient form input.

**Key Capabilities:**
- Arrow keys navigate between fields
- Enter advances to next field
- Automatic text selection
- Works with all input types
- Skips disabled/readonly fields

**Implementation:**
- `keyboardNavigation.ts` - Core navigation logic
- Auto-initialized on app load

**[Full Documentation →](./KEYBOARD_NAVIGATION.md)**

---

### Runway Meetings (EOS Level 10)
Full meeting management following EOS methodology.

**Key Capabilities:**
- Scorecard tracking (Control Tower)
- 90-day goals (Flight Path/Rocks)
- Action items (To-Dos)
- Issue tracking (Land the Plane)
- Meeting summaries (Baggage Claim)

**Routes:**
- `/meetings` - Meeting hub
- `/meetings/my-data` - Personal dashboard
- `/meetings/rocks` - Goals tracking
- `/meetings/issues` - Issue management
- `/meetings/to-dos` - Action items

**[Full Documentation →](./RUNWAY_MEETING_GUIDE.md)**

---

### Code Style (AGENTS.md)
Development guidelines and AI agent configuration.

**Topics Covered:**
- Build commands (`npm run dev`, `npm run build`)
- Import patterns (`@/` alias)
- Naming conventions
- Styling requirements (print CSS, dark mode)
- Error handling patterns
- Database patterns
- Authentication usage

**[Full Documentation →](./AGENTS.md)**

---

### Report Approval Workflow
Modal-based review and approval system for technical reports.

**Key Capabilities:**
- Full-screen modal viewer for report preview
- Read-only preview mode with iframe isolation
- Collapsible review actions panel
- Approve, reject, or archive reports
- Revision history tracking
- Status-based filtering and metrics
- Support for 3-part and 4-part report URLs

**Components:**
- `ReportApprovalWorkflow.tsx` - Main approval interface
- Vanilla JavaScript modal (isolated from React lifecycle)

**Access Points:**
- Division Reports Page (`/[division]/reports` → Approval tab)
- Job Detail Page (`/jobs/[jobId]` → Reports tab, Admin only)

**[Full Documentation →](../../src/components/reports/README.md#-report-approval-process)**

---

### HR Portal
Comprehensive human resources management system with recruiting, hiring, and offer management.

**Key Capabilities:**
- Job requisitions with approval workflow
- Candidate tracking (ATS)
- Interview scheduling with feedback
- Offer letter management
- Multi-level offer approvals
- Public career page for applications
- Resume storage and management

**Routes:**
- `/hr` - HR Dashboard
- `/hr/recruiting/*` - Recruiting features
- `/hr/offers/*` - Offer management

**Status:**
- ✅ Core recruiting features active
- ✅ Offer management active
- 🚧 Onboarding, employee management, and other features planned

**[Full Documentation →](./HR_DEVELOPMENT.md)** | **[Quick Summary →](./HR_SUMMARY.md)**

---

### Help Center PDF Upload
Upload and manage PDF documents in the Help Center alongside guides.

**Key Capabilities:**
- Upload PDF documents with custom names
- Assign Portal categories
- Full-screen PDF viewer
- Download and view options
- View count tracking
- Admin-only upload/delete permissions
- Search and filter by category

**Components:**
- `UploadPdfModal.tsx` - PDF upload interface
- `PdfViewerModal.tsx` - Full-screen PDF viewer
- `HelpCenterDashboard.tsx` - Main dashboard (updated)

**Database:**
- `common.help_center_documents` - Document storage
- Storage bucket: `help-center-documents`

**[Full Documentation →](./HELP_CENTER_PDF_UPLOAD.md)**

---

## 📊 Feature Matrix

| Feature | Database | Components | Services | Tests |
|---------|----------|------------|----------|-------|
| Deliverables | ✅ neta_ops.deliverables | ✅ | ✅ | Manual |
| SLA Tracking | ✅ common.sla_* | ✅ | ✅ | ✅ |
| Keyboard Nav | N/A | ✅ | N/A | ✅ |
| Meetings | ✅ neta_ops.meetings_* | ✅ | ✅ | Manual |
| Report Approval | ✅ neta_ops.technical_reports | ✅ | ✅ | Manual |
| HR Portal | ✅ common.job_requisitions, common.candidates, etc. | ✅ | ✅ | Manual |
| Help Center PDF Upload | ✅ common.help_center_documents | ✅ | ✅ | Manual |

---

## 🔄 Recent Feature Updates

### January 2025
- **Help Center PDF Upload** - Upload and manage PDF documents in Help Center
- **Full-Screen PDF Viewer** - Enhanced PDF viewing experience
- **HR Portal** - Complete recruiting and hiring system
- **Job Requisitions** - Full approval workflow
- **Candidate Tracking (ATS)** - Applicant management
- **Interview Scheduling** - Interview management with feedback
- **Offer Management** - Offer letters with multi-level approvals
- **Public Career Page** - Job application portal

### December 2024
- **Report Approval Modal System** - New vanilla JavaScript modal for stable report viewing and review
- **Collapsible Review Panel** - Show/hide review actions with toggle button
- **URL Parsing Improvements** - Support for 3-part and 4-part report URLs (including substation identifiers)
- **Deliverables PDF Generation** - Full combined PDF output
- **Document Locking** - Lock cover letters when delivered
- **Report Selection Tracking** - Track reports per deliverable

### November 2024
- **GFI Trip Test Report** - New report type
- **CT/PT Reports** - Current and potential transformer reports
- **Weekly Email Reports** - Automated weekly summaries

### October 2024
- **Runway Meeting System** - Full EOS L10 implementation
- **Custom Form Builder** - Drag-and-drop form creation
- **SLA Tracking** - Service level agreement monitoring

---

## 🛠️ Implementing New Features

### Checklist

1. **Planning**
   - [ ] Define feature requirements
   - [ ] Identify database needs
   - [ ] Plan component structure
   - [ ] Consider print requirements

2. **Database**
   - [ ] Create migration scripts
   - [ ] Set up RLS policies
   - [ ] Test in development

3. **Components**
   - [ ] Create React components
   - [ ] Add dark mode support
   - [ ] Implement print styles
   - [ ] Add to routing

4. **Services**
   - [ ] Create service functions
   - [ ] Add error handling
   - [ ] Implement caching if needed

5. **Documentation**
   - [ ] Create feature documentation
   - [ ] Update README files
   - [ ] Add to this index

---

## 📚 Related Documentation

- `/documentation/Setup Guides/` - Configuration guides
- `/documentation/Technical Reference/` - Technical details
- `/documentation/Database & Schema/` - Database structure
- `/src/components/` - Component source code
