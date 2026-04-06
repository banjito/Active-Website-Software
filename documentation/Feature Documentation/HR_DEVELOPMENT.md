# HR Development Documentation

**Last Updated**: January 2025

## Overview

The HR Portal is a comprehensive human resources management system integrated into the ampOS platform. It provides end-to-end functionality for recruiting, hiring, onboarding, and employee management.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Database Schema](#database-schema)
3. [Recruiting Features](#recruiting-features)
4. [Offer Management](#offer-management)
5. [Services & APIs](#services--apis)
6. [User Interface](#user-interface)
7. [File Storage](#file-storage)
8. [Future Enhancements](#future-enhancements)

---

## Architecture

### Technology Stack
- **Frontend**: React with TypeScript
- **Backend**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage (for resumes)
- **Routing**: React Router
- **UI Components**: Custom components with Tailwind CSS

### Schema Organization
All HR tables are stored in the `common` schema (not `hr` schema) due to Supabase allowed schema restrictions.

### Key Files & Directories
```
src/
├── pages/hr/
│   ├── HrDashboard.tsx
│   ├── recruiting/
│   │   ├── JobRequisitions.tsx
│   │   ├── RequisitionApprovals.tsx
│   │   ├── CareerPage.tsx
│   │   ├── PublicCareerPage.tsx
│   │   ├── CandidateTracking.tsx
│   │   ├── InterviewScheduling.tsx
│   │   ├── ResumeParsing.tsx
│   │   └── CandidateCommunication.tsx
│   └── offers/
│       ├── OfferLetters.tsx
│       ├── OfferApprovals.tsx
│       ├── ESignatures.tsx
│       └── CompPositionDetails.tsx
├── services/hr/
│   ├── jobRequisitionsService.ts
│   ├── candidatesService.ts
│   ├── interviewsService.ts
│   └── offersService.ts
└── components/ui/
    └── HrLayout.tsx

Database Scripts/
├── create_hr_schema.sql
└── Historical Migrations/
    ├── 2024_hr_schema.sql
    ├── 2024_hr_job_requisitions.sql
    ├── 2024_hr_offers_schema.sql
    ├── 2024_hr_interviews.sql
    ├── 2024_hr_resumes_bucket.sql
    └── 2024_hr_offer_approvers.sql
```

---

## Database Schema

### Core Tables

#### 1. Job Requisitions (`common.job_requisitions`)
Stores job posting information and requisition details.

**Key Fields:**
- `id` (UUID, Primary Key)
- `title` (VARCHAR) - Job title
- `department` (VARCHAR) - Department name
- `location` (VARCHAR) - Job location
- `employment_type` (VARCHAR) - Full-time, Part-time, Contract, etc.
- `salary_range_min/max` (DECIMAL) - Compensation range
- `status` (VARCHAR) - draft, pending_approval, approved, posted, closed, cancelled
- `priority` (VARCHAR) - low, medium, high, urgent
- `description` (TEXT) - Job description
- `requirements` (TEXT) - Job requirements
- `requisition_number` (VARCHAR) - Auto-generated (REQ-YYYY-XXXXX)
- `created_by`, `approved_by`, `posted_by` (UUID) - User references
- `created_at`, `updated_at`, `approved_at`, `posted_at` (TIMESTAMP)

**Features:**
- Auto-generated requisition numbers
- Version tracking
- Soft delete support
- Full-text search indexes
- Status transition triggers

#### 2. Candidates (`common.candidates`)
Applicant Tracking System (ATS) table for candidate management.

**Key Fields:**
- `id` (UUID, Primary Key)
- `first_name`, `last_name` (VARCHAR)
- `email`, `phone` (VARCHAR)
- `location` (VARCHAR)
- `position_applied` (VARCHAR)
- `requisition_id` (UUID) - Links to job requisition
- `status` (VARCHAR) - new, screening, interview, offer, hired, rejected
- `source` (VARCHAR) - Application source
- `resume_url` (TEXT) - Link to uploaded resume
- `cover_letter` (TEXT)
- `applied_date`, `last_contact_date` (TIMESTAMP)
- `notes` (TEXT)
- **EEO Data:**
  - `eeo_gender`, `eeo_race` (VARCHAR)
  - `eeo_veteran`, `eeo_disability` (BOOLEAN)

**Indexes:**
- Status, position, requisition, email indexes for fast queries

#### 3. Interviews (`common.interviews`)
Interview scheduling and management.

**Key Fields:**
- `id` (UUID, Primary Key)
- `candidate_id` (UUID) - References candidates
- `interview_type` (VARCHAR) - phone, video, in-person, panel
- `interview_stage` (VARCHAR) - initial_culture, technical, final
- `scheduled_date`, `scheduled_time` (DATE, TIME)
- `duration_minutes` (INTEGER)
- `location` (VARCHAR) - Physical location
- `video_link` (TEXT) - Video call URL
- `interviewer_ids` (UUID[]) - Array of interviewer user IDs
- `status` (VARCHAR) - scheduled, completed, cancelled, no-show, rescheduled
- `notes`, `feedback` (TEXT)
- `rating` (INTEGER) - 1-5 scale
- `created_by` (UUID)

**Features:**
- Multiple interviewers per interview
- Interview stage tracking
- Feedback and rating system

#### 4. Offers (`common.offers`)
Job offer letters and compensation details.

**Key Fields:**
- `id` (UUID, Primary Key)
- `candidate_id` (UUID) - References candidates
- `requisition_id` (UUID) - Links to job requisition
- `template_id` (UUID) - References offer templates
- `position_title`, `department` (VARCHAR)
- `employment_type` (VARCHAR) - full-time, part-time, contract, temporary
- `start_date` (DATE)
- `location`, `reporting_manager` (VARCHAR)
- **Compensation:**
  - `base_salary` (DECIMAL)
  - `salary_currency` (VARCHAR) - Default: USD
  - `pay_frequency` (VARCHAR) - hourly, weekly, bi-weekly, monthly, annual
  - `bonus_amount` (DECIMAL)
  - `bonus_description` (TEXT)
  - `equity_compensation` (TEXT)
  - `benefits_summary` (TEXT)
- `status` (VARCHAR) - draft, pending_approval, approved, sent, accepted, declined, expired, withdrawn
- `offer_letter_content` (TEXT) - Generated offer letter
- `custom_fields` (JSONB) - Additional custom data
- `offer_date`, `expiration_date` (DATE)
- `sent_date`, `accepted_date`, `declined_date` (TIMESTAMP)
- **E-Signature:**
  - `signature_status` (VARCHAR) - pending, signed, declined
  - `signature_data` (JSONB)
  - `signed_at` (TIMESTAMP)

#### 5. Offer Approvals (`common.offer_approvals`)
Multi-level approval workflow for offers.

**Key Fields:**
- `id` (UUID, Primary Key)
- `offer_id` (UUID) - References offers
- `approver_id` (UUID) - User who can approve
- `approval_order` (INTEGER) - Sequential approval order
- `status` (VARCHAR) - pending, approved, rejected, skipped
- `comments` (TEXT)
- `approved_at` (TIMESTAMP)

#### 6. Global Offer Approvers (`common.offer_approvers`)
System-wide list of users who can approve any offer.

**Key Fields:**
- `id` (UUID, Primary Key)
- `approver_id` (UUID) - User ID
- `approval_order` (INTEGER) - Default approval sequence
- `is_active` (BOOLEAN) - Enable/disable approver
- `created_by` (UUID)

#### 7. Offer Templates (`common.offer_templates`)
Reusable templates for offer letters.

**Key Fields:**
- `id` (UUID, Primary Key)
- `name` (VARCHAR)
- `description` (TEXT)
- `template_content` (TEXT) - Template with placeholders
- `is_default` (BOOLEAN)
- `created_by` (UUID)

#### 8. E-Signatures (`common.e_signatures`)
Electronic signature records for offer acceptance.

**Key Fields:**
- `id` (UUID, Primary Key)
- `offer_id` (UUID) - References offers
- `signer_type` (VARCHAR) - candidate, manager, hr
- `signer_id` (UUID) - User ID if applicable
- `signer_email`, `signer_name` (VARCHAR)
- `signature_image` (TEXT) - Base64 or URL
- `signature_data` (JSONB) - Additional signature metadata
- `ip_address`, `user_agent` (TEXT) - Audit trail
- `signed_at` (TIMESTAMP)

### Database Features

#### Row Level Security (RLS)
- **Current Status**: RLS is **disabled** on all HR tables
- **Reason**: Open access pattern for authenticated users
- **Permissions**: Explicit GRANT statements provide access to authenticated and anon users

#### Triggers
- **Auto-update timestamps**: `updated_at` columns automatically updated
- **Requisition number generation**: Auto-generates REQ-YYYY-XXXXX format
- **Status transition tracking**: Automatically sets timestamps on status changes

#### Indexes
- Status indexes for filtering
- Department indexes for grouping
- Full-text search indexes on job requisitions
- Composite indexes for common query patterns
- GIN indexes for array fields (interviewer_ids)

---

## Recruiting Features

### 1. Job Requisitions

**Location**: `/hr/recruiting/job-requisitions`

**Features:**
- Create, edit, delete job requisitions
- Status workflow: Draft → Pending Approval → Approved → Posted → Closed
- Priority levels: Low, Medium, High, Urgent
- Salary range specification
- Department and location tracking
- Rich text job descriptions and requirements
- Auto-generated requisition numbers
- Grid and list view modes
- Advanced filtering and sorting
- Search functionality

**Status Workflow:**
1. **Draft** - Initial creation, can be edited freely
2. **Pending Approval** - Submitted for manager/HR approval
3. **Approved** - Approved and ready to post
4. **Posted** - Live on career page
5. **Closed** - Position filled or cancelled

### 2. Requisition Approvals

**Location**: `/hr/recruiting/requisition-approvals`

**Features:**
- View all requisitions pending approval
- Approve or reject requisitions
- Add approval comments
- Filter by department, priority, date
- Approval history tracking

### 3. Career Page

**Location**: `/hr/recruiting/career-page`

**Features:**
- Preview of public career page
- Manage which requisitions are posted
- View posted job listings
- Post/unpost requisitions
- Search and filter posted jobs

### 4. Public Career Page

**Location**: Public-facing page (no authentication required)

**Features:**
- Browse all posted job openings
- Search by keyword, department, location
- Filter by employment type
- View job details
- Apply directly through the page
- Resume upload
- EEO data collection
- Cover letter submission

**Application Process:**
1. Candidate selects a job
2. Fills out application form
3. Uploads resume (PDF, DOC, DOCX)
4. Optionally provides cover letter
5. Completes EEO information (voluntary)
6. Submits application
7. Receives confirmation

### 5. Candidate Tracking (ATS)

**Location**: `/hr/recruiting/candidate-tracking`

**Features:**
- View all candidates
- Create new candidate records
- Update candidate status
- Link candidates to job requisitions
- View candidate details:
  - Personal information
  - Resume (if uploaded)
  - Cover letter
  - Application history
  - Interview history
  - Offer history
- Status pipeline: New → Screening → Interview → Offer → Hired/Rejected
- Search and filter by status, position, date
- EEO data tracking
- Notes and communication history

**Candidate Status Flow:**
- **New** - Just applied
- **Screening** - Initial review
- **Interview** - In interview process
- **Offer** - Offer extended
- **Hired** - Successfully hired
- **Rejected** - Not selected

### 6. Interview Scheduling

**Location**: `/hr/recruiting/interview-scheduling`

**Features:**
- Schedule interviews for candidates
- Multiple interview types: Phone, Video, In-Person, Panel
- Interview stages: Initial/Culture, Technical, Final
- Multiple interviewers per interview
- Video link support (Zoom, Teams, etc.)
- Interview calendar view
- Interview feedback forms:
  - Getting to know candidate
  - Why applying questions
  - Culture fit assessment
  - Work experience evaluation
  - Situational questions
  - Overall feedback
  - Rating (1-5 scale)
- Interview timer
- Status tracking: Scheduled, Completed, Cancelled, No-Show, Rescheduled
- Interview history per candidate

**Interview Feedback Form Fields:**
- Getting to know notes
- Why applying (checked/notes)
- Love job (checked/notes)
- Not love job (checked/notes)
- Family values (checked/notes)
- Fit culture notes
- Work experience notes
- React situations notes
- Overall feedback
- Rating (1-5)

### 7. Resume Parsing

**Location**: `/hr/recruiting/resume-parsing`

**Status**: Placeholder page (implementation pending)

**Planned Features:**
- Automatic resume parsing
- Extract candidate information
- Skills extraction
- Experience parsing
- Education parsing

### 8. Candidate Communication

**Location**: `/hr/recruiting/candidate-communication`

**Status**: Placeholder page (implementation pending)

**Planned Features:**
- Email templates
- Bulk email sending
- Communication history
- Automated follow-ups

---

## Offer Management

### 1. Offer Letters

**Location**: `/hr/offers/offer-letters`

**Features:**
- Create offer letters for candidates
- Use offer templates
- Customize offer content
- Position details:
  - Title, department, location
  - Employment type
  - Start date
  - Reporting manager
- Compensation details:
  - Base salary
  - Pay frequency
  - Bonus information
  - Equity compensation
  - Benefits summary
- Offer status tracking
- Send offers to candidates
- Track acceptance/decline
- Expiration date management

**Offer Status Flow:**
- **Draft** - Being prepared
- **Pending Approval** - Awaiting approval
- **Approved** - Ready to send
- **Sent** - Sent to candidate
- **Accepted** - Candidate accepted
- **Declined** - Candidate declined
- **Expired** - Offer expired
- **Withdrawn** - Offer withdrawn

### 2. Offer Approvals

**Location**: `/hr/offers/offer-approvals`

**Features:**
- Multi-level approval workflow
- Global approvers list
- Sequential approval order
- Approve/reject with comments
- View approval history
- Track pending approvals
- Skip approvers if needed

**Approval Process:**
1. Offer created in draft
2. Moved to pending_approval status
3. Approval records created for all active global approvers
4. Approvers review in order
5. All must approve (or can be skipped)
6. Once approved, offer can be sent

### 3. E-Signatures

**Location**: `/hr/offers/e-signatures`

**Features:**
- Electronic signature capture
- Signature image storage
- IP address and user agent tracking
- Audit trail
- Multiple signer types: Candidate, Manager, HR
- Signature status tracking

### 4. Compensation/Position Details

**Location**: `/hr/offers/comp-position-details`

**Features:**
- Detailed compensation breakdown
- Position details management
- Benefits information
- Equity compensation tracking
- Salary history
- Position history

---

## Services & APIs

### Job Requisitions Service

**File**: `src/services/hr/jobRequisitionsService.ts`

**Methods:**
- `getAll()` - Get all requisitions
- `getById(id)` - Get single requisition
- `create(input, userId)` - Create new requisition
- `update(id, input)` - Update requisition
- `delete(id)` - Delete requisition
- `submitForApproval(id)` - Submit for approval
- `approve(id, approvedBy)` - Approve requisition
- `reject(id, reason, rejectedBy)` - Reject requisition
- `post(id)` - Post to career page
- `close(id)` - Close requisition

### Candidates Service

**File**: `src/services/hr/candidatesService.ts`

**Methods:**
- `getAll()` - Get all candidates
- `getById(id)` - Get single candidate
- `create(input)` - Create new candidate
- `update(id, input)` - Update candidate
- `delete(id)` - Delete candidate
- `updateStatus(id, status)` - Update candidate status

### Interviews Service

**File**: `src/services/hr/interviewsService.ts`

**Methods:**
- `getAll()` - Get all interviews
- `getById(id)` - Get single interview
- `getByCandidateId(candidateId)` - Get interviews for candidate
- `create(input, userId)` - Schedule interview
- `update(id, input)` - Update interview
- `delete(id)` - Delete interview
- `updateStatus(id, status, feedback, rating)` - Complete interview with feedback

### Offers Service

**File**: `src/services/hr/offersService.ts`

**Methods:**

**Templates:**
- `getTemplates()` - Get all templates
- `getTemplateById(id)` - Get single template
- `createTemplate(input, userId)` - Create template
- `updateTemplate(id, input)` - Update template
- `deleteTemplate(id)` - Delete template

**Offers:**
- `getAll()` - Get all offers
- `getById(id)` - Get single offer
- `getByCandidateId(candidateId)` - Get offers for candidate
- `create(input, userId)` - Create offer
- `update(id, input)` - Update offer
- `delete(id)` - Delete offer
- `updateStatus(id, status)` - Update offer status

**Approvals:**
- `getApprovalsByOfferId(offerId)` - Get approvals for offer
- `createApproval(offerId, approverId, order)` - Create approval record
- `updateApproval(id, status, comments)` - Approve/reject

**Global Approvers:**
- `getGlobalApprovers()` - Get all global approvers
- `addGlobalApprover(approverId, order, createdBy)` - Add approver
- `removeGlobalApprover(id)` - Remove approver
- `updateGlobalApprover(id, updates)` - Update approver

**E-Signatures:**
- `getSignaturesByOfferId(offerId)` - Get signatures for offer
- `createSignature(offerId, signerType, signerData)` - Create signature

---

## User Interface

### HR Layout

**File**: `src/components/ui/HrLayout.tsx`

**Features:**
- Collapsible sidebar navigation
- Organized menu sections:
  - Recruiting
  - Offers
  - Onboarding (partially implemented - see status below)
  - Employee Files (Document Storage implemented)
  - HR Data (placeholder)
  - Time & Attendance (placeholder)
  - Performance Reviews (placeholder)
  - Compliance (placeholder)
  - Offboarding (placeholder)
  - Integrations (placeholder)
  - Analytics (placeholder)
  - Self-Service (placeholder)
- Auto-expand sections based on current route
- Profile menu with settings
- Theme support (light/dark)
- Responsive design

### HR Dashboard

**File**: `src/pages/HrDashboard.tsx`

**Features:**
- Quick stats cards:
  - Active Employees
  - Open Positions
  - New Hires
  - Pending Reviews
- Quick action cards linking to major features
- Overview of HR operations

### Design Patterns

**Common UI Patterns:**
- Modal dialogs for create/edit operations
- Toast notifications for user feedback
- Loading states
- Error handling
- Form validation
- Search and filter controls
- Grid and list view toggles
- Status badges
- Action buttons (Edit, Delete, View, etc.)

---

## File Storage

### Resume Storage

**Bucket**: `resumes`

**Setup Script**: `Database Scripts/Historical Migrations/2024_hr_resumes_bucket.sql`

**Features:**
- Public bucket for anonymous uploads
- 10MB file size limit
- Allowed MIME types:
  - `application/pdf`
  - `application/msword` (DOC)
  - `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (DOCX)
- Anonymous upload policy (for public career page)
- Authenticated read/update/delete policies (for HR team)

**Storage Policies:**
- **Insert**: Public (anonymous users can upload)
- **Select**: Public (anyone can read)
- **Update**: Authenticated only
- **Delete**: Authenticated only

### Employee Document Storage

**Bucket**: `employee-documents`

**Setup Script**: `Database Scripts/Setup & Configuration/setup_employee_documents_storage.sql`

**Features:**
- Private bucket for secure employee file storage
- Signed URLs for document access (1 hour expiration, refreshed on demand)
- Organized by employee ID in storage paths
- Support for all file types
- Document metadata tracking (category, tags, expiration dates)

**Storage Policies:**
- **Insert**: Authenticated users only
- **Select**: Authenticated users only (via signed URLs)
- **Update**: Authenticated users only
- **Delete**: Authenticated users only

**Database Tables:**
- `common.employee_documents` - Document metadata and tracking
- `common.employee_document_folders` - Folder organization

**Key Features:**
- Expiration date tracking with automatic expired status
- Category-based organization
- Tag-based search and filtering
- Folder hierarchy support
- Archive/restore functionality
- Version tracking (version field in database)

---

## Current Development Status

### Onboarding Section (Partially Complete)

**Status**: Development paused - requires coordination with other team members

**Completed:**
- Database schema created (`2024_hr_onboarding_schema.sql`)
- Basic UI components created:
  - New Hire Packets (`NewHirePackets.tsx`)
  - E-Sign Forms (`ESignForms.tsx`)
  - Checklists (`Checklists.tsx`)
  - Welcome Emails (`WelcomeEmails.tsx`)
  - IT/Equipment Tasks (`ITEquipmentTasks.tsx`)
- Service layer implemented (`onboardingService.ts`)

**Pending:**
- Integration testing and refinement
- Workflow completion
- User acceptance testing
- Coordination with stakeholders for final requirements

**Note**: The onboarding section has foundational components in place but needs team coordination to complete implementation and testing.

### Employee Files - Document Storage (Implemented)

**Status**: ✅ Complete and functional

**Features Implemented:**
- Document upload with metadata (name, description, category, tags)
- Folder organization system
- Document categorization (contracts, certifications, performance, hr, payroll, etc.)
- Expiration date tracking with visual indicators
- Archive/restore functionality
- Search and filtering (by category, folder, tags, name)
- Document download with signed URLs
- Employee-specific document management

**Database Tables:**
- `common.employee_documents` - Stores document metadata
- `common.employee_document_folders` - Organizes documents into folders

**Storage Bucket:**
- `employee-documents` - Private bucket for secure document storage

**Files:**
- Service: `src/services/hr/employeeDocumentsService.ts`
- Component: `src/pages/hr/employee-files/DocumentStorage.tsx`
- Database Scripts:
  - `Database Scripts/Setup & Configuration/create_employee_documents_table.sql`
  - `Database Scripts/Setup & Configuration/setup_employee_documents_storage.sql`

**Remaining Employee Files Features:**
- Version/Expiration Tracking (enhanced tracking UI)
- Custom Tabs (customizable document organization)

## Future Enhancements

### Planned Features (from HrLayout menu)

#### Onboarding
- Complete integration and testing
- Workflow refinement
- User acceptance testing
- Final requirements coordination

#### Employee Files
- ✅ Document Storage (Complete)
- Version/Expiration Tracking (Enhanced UI)
- Custom Tabs

#### HR Data
- Employee Profiles
- Job/Title History
- Compensation History
- Org Chart
- Reporting

#### Time & Attendance
- PTO/Leave Tracking
- Accrual Policies
- Timesheets

#### Performance Reviews
- Review Cycles
- Goals
- Feedback Tools

#### Compliance
- Document Acknowledgment
- E-Sign Recordkeeping
- EEO/Reporting

#### Offboarding
- Termination Workflows
- Exit Surveys
- Final Docs

#### Integrations
- Payroll
- Background Checks
- Benefits/Time/ATS Tools

#### Analytics
- HR Dashboards
- Custom Reports
- Export Tools

#### Self-Service
- Employee Portal
- Manager Portal
- Task Workflows

### Database Schema (from create_hr_schema.sql)

The `create_hr_schema.sql` file includes a comprehensive HRMS schema with:
- Employees table
- Leave Types and Applications
- Leave Allocations
- Attendance tracking
- Attendance Requests
- Employee Checkins
- Expense Claims
- Employee Advances
- Salary Slips
- Holidays

**Note**: This schema exists but is not yet integrated into the application UI. It's available for future implementation.

---

## Migration History

### Key Migrations

1. **2024_hr_schema.sql** - Initial HR schema (candidates, job requisitions)
2. **2024_hr_job_requisitions.sql** - Enhanced job requisitions with full features
3. **2024_hr_offers_schema.sql** - Offers, approvals, templates, e-signatures
4. **2024_hr_interviews.sql** - Interview scheduling
5. **2024_hr_interviews_add_stage.sql** - Added interview stage field
6. **2024_hr_resumes_bucket.sql** - Resume storage bucket setup
7. **2024_hr_offer_approvers.sql** - Global offer approvers
8. **2024_hr_offers_global_approvers.sql** - Enhanced approver functionality

---

## Access & Permissions

### Current Access Model
- **RLS**: Disabled on all HR tables
- **Permissions**: Explicit GRANT statements
- **Access**: All authenticated users have full access
- **Anonymous**: Can upload resumes via public career page

### Future Permission Model
Consider implementing:
- Role-based access (HR Manager, HR Personnel, Hiring Manager, etc.)
- Department-based restrictions
- Approval workflow permissions
- Read-only vs. edit permissions

---

## Testing & Validation

### Manual Testing Checklist

**Job Requisitions:**
- [ ] Create requisition
- [ ] Edit requisition
- [ ] Submit for approval
- [ ] Approve/reject
- [ ] Post to career page
- [ ] Close requisition
- [ ] Search and filter

**Candidates:**
- [ ] Create candidate
- [ ] Update status
- [ ] Link to requisition
- [ ] Upload resume
- [ ] View candidate details

**Interviews:**
- [ ] Schedule interview
- [ ] Add multiple interviewers
- [ ] Complete interview with feedback
- [ ] View interview history

**Offers:**
- [ ] Create offer
- [ ] Use template
- [ ] Submit for approval
- [ ] Approve offer
- [ ] Send offer
- [ ] Track acceptance

**Public Career Page:**
- [ ] View posted jobs
- [ ] Apply for job
- [ ] Upload resume
- [ ] Submit application

---

## Known Issues & Limitations

1. **RLS Disabled**: All HR tables have RLS disabled for open access
2. **No Role-Based Permissions**: All authenticated users have full access
3. **Resume Parsing**: Not yet implemented (placeholder page)
4. **Candidate Communication**: Not yet implemented (placeholder page)
5. **Email Integration**: No automated email sending
6. **Calendar Integration**: No calendar sync for interviews
7. **Background Checks**: Not integrated
8. **Payroll Integration**: Not integrated

---

## Support & Maintenance

### Database Maintenance
- Regular backups recommended
- Monitor table sizes
- Review indexes for performance
- Clean up old closed requisitions if needed

### Storage Maintenance
- Monitor resume bucket size
- Set up retention policies if needed
- Regular cleanup of orphaned files

### Code Maintenance
- Keep services updated with schema changes
- Maintain TypeScript types
- Update UI components as features evolve

---

## Related Documentation

- [Feature Documentation Index](./README.md)
- [Database Schema Documentation](../Database%20&%20Schema/)
- [Setup Guides](../Setup%20Guides/)

---

## Changelog

### 2024
- Initial HR portal implementation
- Job requisitions system
- Candidate tracking (ATS)
- Interview scheduling
- Offer management
- Public career page
- Resume storage

---

**Document Version**: 1.0  
**Last Reviewed**: January 2025
