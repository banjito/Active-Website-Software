# HR Development - Basic Summary

## What We Built

An HR portal with recruiting and hiring features.

## Main Features

### Recruiting
- **Job Requisitions** - Create and manage job postings with approval workflow
- **Career Page** - Public page where candidates can apply
- **Candidate Tracking** - Track applicants through the hiring process
- **Interview Scheduling** - Schedule and manage interviews with feedback forms
- **Offer Letters** - Create and send job offers with compensation details
- **Offer Approvals** - Multi-level approval system for offers

### Database
- 8 main tables: job_requisitions, candidates, interviews, offers, offer_approvals, offer_templates, offer_approvers, e_signatures
- All stored in `common` schema
- Resume storage bucket for file uploads

### User Interface
- HR Dashboard with quick stats
- Sidebar navigation with collapsible sections
- Pages for each feature with create/edit/view capabilities
- Public career page for job applications

## Status

✅ **Working:**
- Job requisitions (create, approve, post)
- Candidate tracking
- Interview scheduling
- Offer management
- Public career page with applications

🚧 **Placeholder (Not Implemented):**
- Resume parsing
- Candidate communication
- Onboarding features
- Employee management
- Time & attendance
- Performance reviews

## Technical Details

- **Frontend**: React + TypeScript
- **Backend**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage for resumes
- **Access**: All authenticated users (no role restrictions yet)

## Files

- **Pages**: `src/pages/hr/`
- **Services**: `src/services/hr/`
- **Database**: `Database Scripts/Historical Migrations/2024_hr_*.sql`
- **Layout**: `src/components/ui/HrLayout.tsx`

---

**For detailed documentation, see [HR_DEVELOPMENT.md](./HR_DEVELOPMENT.md)**
