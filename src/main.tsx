import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './services/versionChecker'; // Auto-start version checker - shows a "refresh to update" toast on new deploys
// Initialize global keyboard navigation for all input fields
import './lib/keyboardNavigation';
import { applyBrandColors, applyCornerStyle } from './lib/companyConfig';
import { initSiteTheme } from './services/siteThemeService';
import { installJobFileLinks } from './lib/jobFiles';

// Set --brand CSS variables before first paint so per-instance colors apply,
// then layer on any admin-saved theme (cached copy first, then from the DB).
applyBrandColors();
applyCornerStyle();
initSiteTheme();
// Job files are private: sign their links wherever the app shows or opens one.
installJobFileLinks();

// Localhost only: "log in as" someone (scripts/login-as.mjs). Left out of production builds.
// The sign-in tokens are taken off the URL before the app reads it.
if (import.meta.env.DEV) {
  const marker = '#devLoginAs=';
  const hash = window.location.hash;
  const payload = hash.startsWith(marker) ? hash.slice(marker.length) : null;
  if (payload) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  void import('./lib/devLoginAs').then((m) => m.initDevLoginAs(payload));
}

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
    
  } catch (error) {
    console.error('Failed to render app:', error);
  }
}
