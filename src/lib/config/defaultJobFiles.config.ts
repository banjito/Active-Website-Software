import { DefaultJobFile } from '../services/defaultJobFiles';

/**
 * Configuration for default job files
 * You can easily modify these files or add new ones here
 */

// Global default files that appear in ALL jobs
export const GLOBAL_DEFAULT_FILES: DefaultJobFile[] = [
  {
    name: 'Safety Checklist',
    description: 'Pre-job safety inspection checklist',
    file_url: 'template://safety-checklist',
    template_type: 'safety_checklist',
    status: 'pending'
  },
  {
    name: 'Work Order',
    description: 'Standard work order template',
    file_url: 'template://work-order',
    template_type: 'work_order',
    status: 'pending'
  },
  {
    name: 'Equipment Inspection Report',
    description: 'Equipment inspection and testing report',
    file_url: 'template://equipment-inspection',
    template_type: 'equipment_inspection',
    status: 'pending'
  },
  {
    name: 'Job Completion Report',
    description: 'Final job completion and sign-off report',
    file_url: 'template://job-completion',
    template_type: 'job_completion',
    status: 'pending'
  }
];

// Division-specific files
export const DIVISION_DEFAULT_FILES: Record<string, DefaultJobFile[]> = {
  calibration: [
    {
      name: 'Calibration Certificate Template',
      description: 'Template for calibration certificates',
      file_url: 'template://calibration-certificate',
      template_type: 'calibration_certificate',
      status: 'pending'
    },
    {
      name: 'Measurement Uncertainty Analysis',
      description: 'Uncertainty analysis worksheet',
      file_url: 'template://uncertainty-analysis',
      template_type: 'uncertainty_analysis',
      status: 'pending'
    },
    {
      name: 'Calibration Data Sheet',
      description: 'Data recording sheet for calibrations',
      file_url: 'template://calibration-data-sheet',
      template_type: 'calibration_data',
      status: 'pending'
    }
  ],
  
  armadillo: [
    {
      name: 'Armadillo Testing Procedures',
      description: 'Specialized testing procedures for Armadillo division',
      file_url: 'template://armadillo-testing',
      template_type: 'armadillo_testing',
      status: 'pending'
    },
    {
      name: 'Quality Control Checklist',
      description: 'QC checklist for Armadillo operations',
      file_url: 'template://armadillo-qc',
      template_type: 'quality_control',
      status: 'pending'
    }
  ],
  
  scavenger: [
    {
      name: 'Scavenger Operations Manual',
      description: 'Operations manual for scavenger division',
      file_url: 'template://scavenger-operations',
      template_type: 'scavenger_operations',
      status: 'pending'
    },
    {
      name: 'Environmental Assessment',
      description: 'Environmental impact assessment form',
      file_url: 'template://environmental-assessment',
      template_type: 'environmental',
      status: 'pending'
    }
  ],
  
  neta: [
    {
      name: 'NETA Standards Compliance',
      description: 'NETA standards compliance checklist',
      file_url: 'template://neta-compliance',
      template_type: 'neta_compliance',
      status: 'pending'
    },
    {
      name: 'Electrical Testing Report',
      description: 'Comprehensive electrical testing report',
      file_url: 'template://electrical-testing',
      template_type: 'electrical_testing',
      status: 'pending'
    }
  ],
  
  north_alabama: [
    {
      name: 'North Alabama Regional Procedures',
      description: 'Region-specific procedures and requirements',
      file_url: 'template://north-alabama-procedures',
      template_type: 'regional_procedures',
      status: 'pending'
    }
  ]
};

// Settings for default file behavior
export const DEFAULT_FILE_SETTINGS = {
  // Whether to add default files to new jobs
  ENABLE_DEFAULT_FILES: true,
  
  // Whether to allow users to disable default files per job
  ALLOW_DISABLE_PER_JOB: false,
  
  // Default status for new default files
  DEFAULT_STATUS: 'pending' as const,
  
  // Whether to show a notification when default files are added
  SHOW_NOTIFICATION: true,
  
  // Whether to fail job creation if default files cannot be added
  FAIL_ON_DEFAULT_FILE_ERROR: false
};

/**
 * Helper function to add a new global default file
 */
export function addGlobalDefaultFile(file: DefaultJobFile): void {
  GLOBAL_DEFAULT_FILES.push(file);
}

/**
 * Helper function to add a new division-specific default file
 */
export function addDivisionDefaultFile(division: string, file: DefaultJobFile): void {
  if (!DIVISION_DEFAULT_FILES[division]) {
    DIVISION_DEFAULT_FILES[division] = [];
  }
  DIVISION_DEFAULT_FILES[division].push(file);
}

/**
 * Helper function to remove a default file by name
 */
export function removeDefaultFile(fileName: string, division?: string): void {
  if (division && DIVISION_DEFAULT_FILES[division]) {
    DIVISION_DEFAULT_FILES[division] = DIVISION_DEFAULT_FILES[division].filter(
      file => file.name !== fileName
    );
  } else {
    const index = GLOBAL_DEFAULT_FILES.findIndex(file => file.name === fileName);
    if (index > -1) {
      GLOBAL_DEFAULT_FILES.splice(index, 1);
    }
  }
} 