#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function addKeyboardNavigationImport(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  
  // Check if import already exists
  if (content.includes("import { useKeyboardNavigation }")) {
    console.log(`ℹ️  ${path.basename(filePath)} already has keyboard navigation import`);
    return false;
  }

  // Find the last import statement
  const importRegex = /import[^;]+;/g;
  const imports = content.match(importRegex) || [];
  
  if (imports.length === 0) {
    console.error(`❌ No import statements found in ${path.basename(filePath)}`);
    return false;
  }

  const lastImport = imports[imports.length - 1];
  const lastImportIndex = content.lastIndexOf(lastImport);
  const insertIndex = lastImportIndex + lastImport.length;

  const newImport = "\nimport { useKeyboardNavigation } from '@/lib/hooks/useKeyboardNavigation';";
  
  const updatedContent = content.slice(0, insertIndex) + newImport + content.slice(insertIndex);
  
  // Add a comment at the top of the component about keyboard navigation setup
  const componentMatch = updatedContent.match(/(const \w+: React\.FC[^=]*= \(\) => \{)/);
  if (componentMatch) {
    const componentIndex = updatedContent.indexOf(componentMatch[1]) + componentMatch[1].length;
    const comment = `
  // TODO: Set up keyboard navigation hooks for tables/forms
  // See KEYBOARD_NAVIGATION_GUIDE.md for implementation details
  // Example: const navigation = useKeyboardNavigation({ totalRows: X, totalCols: Y, isEditMode: isEditing });
`;
    const finalContent = updatedContent.slice(0, componentIndex) + comment + updatedContent.slice(componentIndex);
    
    fs.writeFileSync(filePath, finalContent);
    console.log(`✅ Added keyboard navigation import and TODO comment to ${path.basename(filePath)}`);
    return true;
  } else {
    fs.writeFileSync(filePath, updatedContent);
    console.log(`✅ Added keyboard navigation import to ${path.basename(filePath)} (no component found for TODO comment)`);
    return true;
  }
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node add-keyboard-nav-import.js <report-file-path>');
    console.log('Example: node add-keyboard-nav-import.js src/components/reports/MyReport.tsx');
    return;
  }

  const filePath = args[0];
  const success = addKeyboardNavigationImport(filePath);
  
  if (success) {
    console.log('\n📝 Next steps:');
    console.log('1. Review the TODO comment in the component');
    console.log('2. Follow the KEYBOARD_NAVIGATION_GUIDE.md for implementation');
    console.log('3. Set up navigation hooks for each table/form section');
    console.log('4. Add data-position and onKeyDown to input elements');
    console.log('5. Test keyboard navigation thoroughly');
  }
}

if (require.main === module) {
  main();
} 