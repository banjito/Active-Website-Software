// Schema mappings for database tables
// This file centralizes schema references for maintainability

export const SCHEMAS = {
  // neta_ops schema tables
  ASSETS: 'neta_ops.assets',
  JOB_ASSETS: 'neta_ops.job_assets',
  JOBS: 'neta_ops.jobs', 
  REPORTS: 'neta_ops.reports',
  
  // business schema tables
  ESTIMATES: 'business.estimates',
  OPPORTUNITIES: 'business.opportunities',
  
  // common schema tables
  CONTACTS: 'common.contacts',
  CUSTOMERS: 'common.customers',
  
  // technician scheduling tables (common schema)
  TECH_AVAILABILITY: 'common.technician_availability',
  TECH_EXCEPTIONS: 'common.technician_exceptions',
  TECH_SKILLS: 'common.technician_skills',
  TECH_ASSIGNMENTS: 'common.technician_assignments',
  JOB_SKILL_REQUIREMENTS: 'common.job_skill_requirements',
  AVAILABLE_TECHNICIANS: 'common.available_technicians' // Properly reference the view in common schema
}

// Function to help with migration from old schema
export function getTable(tableName: string): string {
  // Map old public schema table names to new schema qualified names
  switch (tableName) {
    case 'assets': return SCHEMAS.ASSETS;
    case 'job_assets': return SCHEMAS.JOB_ASSETS;
    case 'jobs': return SCHEMAS.JOBS;
    case 'reports': return SCHEMAS.REPORTS;
    case 'estimates': return SCHEMAS.ESTIMATES;
    case 'opportunities': return SCHEMAS.OPPORTUNITIES;
    case 'contacts': return SCHEMAS.CONTACTS;
    case 'customers': return SCHEMAS.CUSTOMERS;
    case 'technician_availability': return SCHEMAS.TECH_AVAILABILITY;
    case 'technician_exceptions': return SCHEMAS.TECH_EXCEPTIONS;
    case 'technician_skills': return SCHEMAS.TECH_SKILLS;
    case 'technician_assignments': return SCHEMAS.TECH_ASSIGNMENTS;
    case 'job_skill_requirements': return SCHEMAS.JOB_SKILL_REQUIREMENTS;
    case 'available_technicians': return SCHEMAS.AVAILABLE_TECHNICIANS;
    default: return tableName; // For any tables not in our mapping, return as is
  }
} 