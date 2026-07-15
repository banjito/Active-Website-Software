import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initEncryptionService } from './services/encryptionService';
import './services/versionChecker'; // Auto-start version checker - shows a "refresh to update" toast on new deploys
// Initialize global keyboard navigation for all input fields
import './lib/keyboardNavigation';
import { applyBrandColors } from './lib/companyConfig';
import { initSiteTheme } from './services/siteThemeService';

// Set --brand CSS variables before first paint so per-instance colors apply,
// then layer on any admin-saved theme (cached copy first, then from the DB).
applyBrandColors();
initSiteTheme();

// Render app immediately - don't block on async operations
const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Failed to find root element');
} else {
  try {
    createRoot(rootElement).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    
    // Initialize encryption service in background after app renders
    // This doesn't need to block the app from loading
    initEncryptionService().then(success => {
      if (!success) {
        console.warn('Encryption service initialization failed. Some features may not work properly.');
      }
    }).catch(err => {
      console.warn('Encryption service error:', err);
    });
  } catch (error) {
    console.error('Failed to render app:', error);
  }
}
