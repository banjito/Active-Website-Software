#!/usr/bin/env node

/**
 * Generate version.json file for automatic update detection
 * This runs during the build process
 */

const fs = require('fs');
const path = require('path');

// Generate a version string based on current timestamp
// This ensures each build has a unique version
const version = Date.now().toString();
const timestamp = new Date().toISOString();

const versionInfo = {
  version: version,
  timestamp: timestamp,
  buildDate: new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  })
};

// Write to both public (for dev) and dist (for production)
const publicPath = path.join(__dirname, '../public/version.json');
const distPath = path.join(__dirname, '../dist/version.json');

// Always write to public
fs.writeFileSync(publicPath, JSON.stringify(versionInfo, null, 2));
console.log('✅ Generated version.json for development:', publicPath);

// Write to dist if it exists (production builds)
const distDir = path.dirname(distPath);
if (fs.existsSync(distDir)) {
  fs.writeFileSync(distPath, JSON.stringify(versionInfo, null, 2));
  console.log('✅ Generated version.json for production:', distPath);
}

console.log('📦 Version:', version);
console.log('🕐 Build time:', versionInfo.buildDate);















