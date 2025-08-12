#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '../src/components/reports');

// List of report files to update (excluding the ones we already updated and utility files)
const REPORT_FILES = [
  '23-MediumVoltageMotorStarterMTSReport.tsx',
  '13-VoltagePotentialTransformerTestMTSReport.tsx',
  '12-CurrentTransformerTestMTSReport.tsx',
  'MediumVoltageCircuitBreakerMTSReport.tsx',
  'MediumVoltageCircuitBreakerReport.tsx',
  'LowVoltageCircuitBreakerThermalMagneticMTSReport.tsx',
  'LowVoltageCircuitBreakerThermalMagneticATSReport.tsx',
  'LowVoltageCircuitBreakerElectronicTripMTSReport.tsx',
  'MediumVoltageCableVLFTest.jsx',
  'TanDeltaTestMTSForm.tsx',
  'MediumVoltageVLFMTSReport.tsx',
  'TwoSmallDryTyperXfmrATSReport.tsx',
  'TanDeltaChartMTS.tsx',
  'TwoSmallDryTyperXfmrMTSReport.tsx',
  'LargeDryTypeTransformerReport.tsx',
  'LargeDryTypeXfmrMTSReport.tsx',
  'LiquidXfmrVisualMTSReport.tsx',
  'LargeDryTypeTransformerMTSReport.tsx',
  'SwitchgearPanelboardMTSReport.tsx',
  '12-CurrentTransformerTestATSReport.tsx',
  'CurrentTransformerTestATSReport.tsx',
  'LowVoltageSwitchMultiDeviceTest.tsx',
  'ReportApprovalWorkflow.tsx',
  'PanelboardReport.tsx',
  'SwitchgearReport.tsx',
  'LowVoltageSwitchReport.tsx',
  'LowVoltagePanelboardSmallBreakerTestATSReport.tsx',
  'MediumVoltageVLFReport.tsx',
  'LowVoltageCircuitBreakerElectronicTripATSReport.tsx',
  'LowVoltageCircuitBreakerElectronicTripATSSecondaryInjectionReport.tsx',
  'MediumVoltageSwitchOilReport.tsx',
  'MetalEnclosedBuswayReport.tsx',
  'TanDeltaChart.tsx',
  'OilInspectionReport.tsx',
  'DryTypeTransformerReport.tsx',
  'LiquidFilledTransformerReport.tsx'
];

function addKeyboardNavigationImport(content) {
  // Check if import already exists
  if (content.includes("import { useKeyboardNavigation }")) {
    return content;
  }

  // Find the last import statement
  const importRegex = /import[^;]+;/g;
  const imports = content.match(importRegex) || [];
  
  if (imports.length === 0) {
    return content;
  }

  const lastImport = imports[imports.length - 1];
  const lastImportIndex = content.lastIndexOf(lastImport);
  const insertIndex = lastImportIndex + lastImport.length;

  const newImport = "\nimport { useKeyboardNavigation } from '@/lib/hooks/useKeyboardNavigation';";
  
  return content.slice(0, insertIndex) + newImport + content.slice(insertIndex);
}

function addKeyboardNavigationToInputs(content) {
  // Pattern to match input elements that don't already have keyboard navigation
  const inputPattern = /<input\s+([^>]*?)(?<!onKeyDown=\{[^}]*\}[^>]*?)>/g;
  const selectPattern = /<select\s+([^>]*?)(?<!onKeyDown=\{[^}]*\}[^>]*?)>/g;
  const textareaPattern = /<textarea\s+([^>]*?)(?<!onKeyDown=\{[^}]*\}[^>]*?)>/g;

  let updatedContent = content;
  let hasChanges = false;

  // Add data-position and onKeyDown to inputs that are in tables or forms
  updatedContent = updatedContent.replace(inputPattern, (match, attributes) => {
    // Skip if already has onKeyDown or data-position
    if (attributes.includes('onKeyDown') || attributes.includes('data-position')) {
      return match;
    }

    // Skip if it's a readonly field or not in an editable context
    if (attributes.includes('readOnly={true}') || attributes.includes('readOnly={!isEditing}') === false) {
      return match;
    }

    hasChanges = true;
    // Add placeholder data-position and onKeyDown - these will need manual adjustment
    return `<input ${attributes} data-position="0-0" onKeyDown={(e) => handleKeyDown?.(e, { row: 0, col: 0 })}>`;
  });

  // Similar for select elements
  updatedContent = updatedContent.replace(selectPattern, (match, attributes) => {
    if (attributes.includes('onKeyDown') || attributes.includes('data-position')) {
      return match;
    }

    if (attributes.includes('disabled={true}') || attributes.includes('disabled={!isEditing}') === false) {
      return match;
    }

    hasChanges = true;
    return `<select ${attributes} data-position="0-0" onKeyDown={(e) => handleKeyDown?.(e, { row: 0, col: 0 })}>`;
  });

  return { content: updatedContent, hasChanges };
}

function processReportFile(filePath) {
  console.log(`Processing ${path.basename(filePath)}...`);
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Add the import
    content = addKeyboardNavigationImport(content);
    
    // Add keyboard navigation to inputs (with placeholders)
    const { content: updatedContent, hasChanges } = addKeyboardNavigationToInputs(content);
    
    if (hasChanges) {
      // Add a comment at the top of the component about manual keyboard navigation setup needed
      const componentMatch = updatedContent.match(/(const \w+: React\.FC[^=]*= \(\) => \{)/);
      if (componentMatch) {
        const insertIndex = updatedContent.indexOf(componentMatch[1]) + componentMatch[1].length;
        const comment = `
  // TODO: Set up keyboard navigation hooks for tables/forms
  // Example: const navigation = useKeyboardNavigation({ totalRows: X, totalCols: Y, isEditMode: isEditing });
  // Then update data-position and onKeyDown handlers with proper row/col values
`;
        content = updatedContent.slice(0, insertIndex) + comment + updatedContent.slice(insertIndex);
      } else {
        content = updatedContent;
      }
      
      fs.writeFileSync(filePath, content);
      console.log(`✅ Updated ${path.basename(filePath)} with keyboard navigation placeholders`);
    } else {
      console.log(`ℹ️  ${path.basename(filePath)} - no changes needed`);
    }
    
  } catch (error) {
    console.error(`❌ Error processing ${path.basename(filePath)}:`, error.message);
  }
}

function main() {
  console.log('🚀 Adding keyboard navigation to all reports...\n');
  
  // Process each report file
  REPORT_FILES.forEach(fileName => {
    const filePath = path.join(REPORTS_DIR, fileName);
    if (fs.existsSync(filePath)) {
      processReportFile(filePath);
    } else {
      console.log(`⚠️  File not found: ${fileName}`);
    }
  });
  
  console.log('\n✨ Keyboard navigation setup complete!');
  console.log('\n📝 Next steps:');
  console.log('1. Review each report file for TODO comments');
  console.log('2. Set up proper useKeyboardNavigation hooks with correct totalRows/totalCols');
  console.log('3. Update data-position attributes with proper row/col coordinates');
  console.log('4. Test keyboard navigation in each report');
}

if (require.main === module) {
  main();
} 