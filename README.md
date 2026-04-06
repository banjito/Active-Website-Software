# ampOS - Active Maintenance Platform

> **Enterprise Job Management & Electrical Testing Report System**

A comprehensive web application for electrical testing companies to manage jobs, generate professional test reports, track deliverables, and automate business operations.

---

## 📚 Documentation

| Resource | Description |
|----------|-------------|
| [`/documentation/`](./documentation/) | All project documentation organized by category |
| [`/documentation/README.md`](./documentation/README.md) | Documentation index and quick reference |
| [`/documentation/FOLDER_ORGANIZATION.md`](./documentation/FOLDER_ORGANIZATION.md) | Complete project structure |
| [`/Database Scripts/`](./Database%20Scripts/) | SQL scripts for database setup and maintenance |

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server (port 5175)
npm run dev

# Build for production
npm run build

# Run linter
npm run lint
```

---

## 🏗️ Architecture Overview

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS with dark mode support
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Email**: Postmark
- **Deployment**: Netlify
- **Icons**: Lucide React

### Project Structure

```
ampOS/
├── src/
│   ├── app/                    # Page routes (division dashboards, meetings, etc.)
│   ├── components/             # React components
│   │   ├── admin/             # Admin dashboard, user management, permissions
│   │   ├── auth/              # Authentication components
│   │   ├── chat/              # Chat system
│   │   ├── customers/         # Customer management
│   │   ├── customForms/       # Custom form builder system
│   │   ├── dashboards/        # Division-specific dashboards
│   │   ├── equipment/         # Equipment & vehicle management
│   │   ├── jobs/              # Job management, deliverables, SLA tracking
│   │   ├── lab/               # Lab equipment calibration
│   │   ├── reports/           # 60+ technical test reports (ATS/MTS)
│   │   ├── sales/             # Sales pipeline, opportunities
│   │   ├── scheduling/        # Job scheduling
│   │   ├── shortcuts/         # Keyboard shortcuts system
│   │   └── ui/                # Reusable UI components
│   ├── lib/                   # Services, utilities, types
│   ├── services/              # Business logic services
│   └── types/                 # TypeScript type definitions
├── Database Scripts/          # SQL scripts organized by purpose
├── documentation/             # All project documentation
├── supabase/                  # Supabase Edge Functions
└── scripts/                   # Utility & test scripts
```

---

## ✨ Key Features

### 📋 Job Management
- Complete job lifecycle tracking (pending → completed → billed)
- Customer association and contact management
- Division-based organization (Field Tech, Lab, Calibration, etc.)
- Resource allocation and scheduling
- Cost tracking and profitability analysis
- SLA management and violation tracking

### 📊 Technical Reports (60+ Report Types)
Comprehensive NETA-compliant electrical testing reports:

| Category | Reports |
|----------|---------|
| **Switchgear & Panelboards** | ATS 21/25, MTS forms |
| **Transformers** | Dry Type, Liquid Filled, Large Dry Type |
| **Circuit Breakers** | LV Electronic Trip, Thermal-Magnetic, MV |
| **Cables** | Low Voltage (3/12/20 sets), Medium Voltage VLF |
| **Current/Potential Transformers** | CT/PT ATS/MTS forms |
| **Special Tests** | GFI Trip Test, Grounding System, Oil Analysis |
| **Transfer Switches** | Automatic Transfer Switch ATS |

### 📦 Deliverables System
- Package reports into deliverables for customers
- Cover letter and executive summary generation
- Combined PDF generation with proper formatting
- Review and approval workflow
- Status tracking (draft → approved → delivered)

### 📧 Automated Email Notifications
| Email | Schedule | Purpose |
|-------|----------|---------|
| Daily Review Notification | 12:00 PM CST | Reports ready for review |
| Daily Ready-to-Bill Report | 8:00 AM CST | Jobs ready for billing |
| Ready-to-Bill Notification | Immediate | When job status changes |
| Weekly PO Report | Monday 8 AM | Purchase orders summary |
| Weekly Jobs Status Report | Monday 8 AM | Jobs by status summary |

### 🖥️ Division Dashboards
- **Field Tech**: Job scheduling, mobile-optimized
- **Lab**: Equipment calibration tracking
- **Calibration**: Calibration schedules and metrics
- **Georgia/Tennessee/North Alabama**: Regional operations
- **International**: International job tracking
- **Armadillo/Scavenger**: Specialized divisions

### 🗓️ Runway Meetings (EOS Level 10)
Full meeting management system with:
- **Control Tower**: Weekly KPI scorecard
- **Flight Path**: 90-day rocks/goals
- **To-Dos**: Action items with assignees
- **Issues**: Problem tracking and resolution
- **Headlines**: Team updates
- Meeting summaries and action tracking

### ⌨️ Keyboard Navigation
- Arrow keys navigate between form fields
- Enter key advances to next field
- Automatic text selection on focus
- Works across all input types

### 🎨 Custom Form Builder
Drag-and-drop form creation system:
- 20+ pre-built components (job info, temperature correction, tests)
- Reusable templates
- NETA section assignment
- Professional print output

---

## 📁 Component Inventory

### Reports (`/src/components/reports/`)
| Report | File | Description |
|--------|------|-------------|
| Switchgear ATS | `SwitchgearReport.tsx` | Switchgear inspection (ATS 21) |
| Panelboard | `PanelboardReport.tsx` | Panelboard inspection |
| Dry Type Transformer | `DryTypeTransformerReport.tsx` | Dry type transformer testing |
| Liquid Filled Transformer | `LiquidFilledTransformerReport.tsx` | Liquid filled transformer testing |
| Large Dry Type MTS | `LargeDryTypeTransformerMTSReport.tsx` | Large dry type (MTS) |
| LV Cable ATS (12 sets) | `12setslowvoltagecables.tsx` | Low voltage cable test |
| MV VLF Test | `MediumVoltageVLFReport.tsx` | Medium voltage VLF testing |
| LV CB Electronic Trip | `LowVoltageCircuitBreakerElectronicTripATSReport.tsx` | Electronic trip breaker |
| LV CB Thermal-Magnetic | `LowVoltageCircuitBreakerThermalMagneticATSReport.tsx` | Thermal-magnetic breaker |
| MV Circuit Breaker | `MediumVoltageCircuitBreakerReport.tsx` | Medium voltage breaker |
| Current Transformer ATS | `12-CurrentTransformerTestATSReport.tsx` | CT testing (ATS) |
| Current Transformer MTS | `12-CurrentTransformerTestMTSReport.tsx` | CT testing (MTS) |
| Potential Transformer | `PotentialTransformerATSReport.tsx` | PT testing |
| Automatic Transfer Switch | `AutomaticTransferSwitchATSReport.tsx` | ATS testing |
| GFI Trip Test | `GFITripTestReport.tsx` | Ground fault trip testing |
| Grounding System | `GroundingSystemMaster.tsx` | Grounding system test |
| Oil Inspection | `OilInspectionReport.tsx` | Oil analysis |

### Jobs (`/src/components/jobs/`)
| Component | Description |
|-----------|-------------|
| `JobList.tsx` | Job listing with filters |
| `JobDetail.tsx` | Comprehensive job view |
| `JobDeliverables.tsx` | Deliverables management |
| `DeliverableViewer.tsx` | PDF generation for deliverables |
| `JobCostTracking.tsx` | Cost and budget tracking |
| `JobProfitabilityAnalysis.tsx` | Profit margin analysis |
| `SLAManagement.tsx` | SLA tracking and violations |
| `JobResources.tsx` | Resource allocation |
| `JobNotifications.tsx` | Job-specific notifications |
| `OneLineDrawings.tsx` | Electrical drawings |
| `SubmittalTracker.tsx` | Document submittals |

### Admin (`/src/components/admin/`)
| Component | Description |
|-----------|-------------|
| `AdminDashboard.tsx` | Main admin interface |
| `AdminUserManagement.tsx` | User CRUD operations |
| `PermissionManagement.tsx` | Role-based permissions |
| `RoleManagement.tsx` | Role definitions |
| `SystemHealthMonitoring.tsx` | System status |
| `EncryptionSettings.tsx` | Security settings |
| `PortalConfiguration.tsx` | Portal settings |

### Equipment (`/src/components/equipment/`)
| Component | Description |
|-----------|-------------|
| `EquipmentManagement.tsx` | Equipment inventory |
| `EquipmentTracking.tsx` | Asset tracking |
| `MaintenanceSchedule.tsx` | Maintenance planning |
| `VehicleManagement.tsx` | Fleet management |
| `EquipmentCalibration.tsx` | Calibration tracking |

---

## 🗄️ Database Schema

### Core Schemas
- **`neta_ops`**: Main operational data (jobs, assets, reports, deliverables)
- **`common`**: Shared data (customers, SLAs, users)

### Key Tables
| Table | Schema | Purpose |
|-------|--------|---------|
| `jobs` | neta_ops | Job records |
| `assets` | neta_ops | Documents, reports, files |
| `job_assets` | neta_ops | Job-asset relationships |
| `deliverables` | neta_ops | Deliverable packages |
| `generated_documents` | neta_ops | Cover letters, summaries |
| `customers` | common | Customer records |
| `sla_definitions` | common | SLA templates |
| `sla_tracking` | common | Active SLA instances |

### Report Tables (neta_ops)
- `gfi_trip_test_reports` - GFI Trip Test data
- `current_transformer_test_ats_reports` - CT ATS data
- `current_transformer_test_mts_reports` - CT MTS data
- `voltage_potential_transformer_mts_reports` - PT MTS data
- `medium_voltage_circuit_breaker_reports` - MV CB data
- `automatic_transfer_switch_ats_reports` - ATS data
- `low_voltage_panelboard_small_breaker_reports` - Panelboard data

---

## 🔧 Services

### Core Services (`/src/services/`)
| Service | Purpose |
|---------|---------|
| `jobService.ts` | Job CRUD, resource allocation, cost tracking |
| `slaService.ts` | SLA management and monitoring |
| `auditService.ts` | Activity logging |
| `pdfExportService.ts` | PDF generation |
| `notificationService.ts` | Email and in-app notifications |
| `roleService.ts` | Permission management |
| `metricsService.ts` | Performance metrics |

### Report Importers (`/src/services/reportImport/`)
42 specialized importers for importing data from various report formats.

---

## 🌐 Edge Functions (`/supabase/functions/`)

| Function | Trigger | Purpose |
|----------|---------|---------|
| `daily-review-notification` | Cron (12 PM) | Daily review email |
| `daily-ready-to-bill-report` | Cron (8 AM) | Billing summary |
| `ready-to-bill-notification` | Event | Instant billing alert |
| `weekly-po-report` | Cron (Monday) | PO weekly summary |
| `weekly-jobs-status-report` | Cron (Monday) | Jobs status summary |

---

## 🎨 Styling Guidelines

### Brand Colors
- **Primary Orange**: `#f26722`
- **Dark Background**: `dark:bg-dark-200`
- **Dark Cards**: `dark:bg-dark-150`

### CSS Classes
```css
.form-input    /* Standard input styling */
.btn-primary   /* Primary action buttons */
.card          /* Card containers */
.print:block   /* Show only when printing */
.print:hidden  /* Hide when printing */
```

### Print Requirements
All reports must include:
- Professional header with logo
- Clean borders and formatting
- Black text on white background
- Hidden interactive elements (dropdowns, buttons)
- PASS/FAIL status badges

---

## 📝 Development Guidelines

### Code Style
- Use TypeScript with strict types (but `any` allowed for flexibility)
- Use `@/` path alias for imports
- Components in PascalCase, utilities in kebab-case
- Always support dark mode (`dark:` modifier)

### Error Handling
```typescript
try {
  const { data, error } = await supabase.schema('neta_ops').from('table').select('*');
  if (error) throw error;
  // Handle data
} catch (error) {
  console.error('Error:', error);
  toast.error('Operation failed');
}
```

### Authentication
```typescript
import { useAuth } from '@/lib/AuthContext';

const { user } = useAuth();
if (!user) return <RequireAuth />;
```

---

## 🧪 Testing

```bash
# Test email data queries
node scripts/test-review-data.js
node scripts/test-daily-ready-to-bill-report.js
node scripts/test-weekly-po-data.js
node scripts/test-weekly-jobs-data.js

# Test actual email sending
node scripts/test-review-notification.js
node scripts/test-weekly-reports.js
```

---

## 📦 Deployment

### Netlify Configuration
See `netlify.toml` for deployment settings.

### Environment Variables
| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `POSTMARK_API_KEY` | Email service |
| `POSTMARK_FROM` | Sender email |

---

## 📄 License

See [LICENSE](./LICENSE) file.

---

**Last Updated**: December 2024
