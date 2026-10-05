import { HashRouter, Navigate, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { AuthProvider } from "@/lib/AuthContext";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { DemoModeProvider } from "@/lib/DemoModeContext";
import SavedReportsPage from "./SavedReportsPage";
import ReportListPage from "./ReportListPage";
import ReportHost from "./ReportHost";

/**
 * Standalone offline reporting app. Deliberately NOT the full ampOS shell and
 * has no jobs: the saved-reports list, a report-type picker, and a page per
 * report. Uses HashRouter so deep links work
 * under the file:// protocol in a packaged build. The report components run
 * unchanged: data I/O goes through the offline Supabase adapter (aliased in
 * vite.config.electron.ts), and AuthProvider resolves to a local user offline.
 *
 * The dynamic route mirrors the main app's /jobs/:id/<slug>/:reportId? shape so
 * report components read the same useParams() keys (id, reportId).
 */
export default function OfflineApp() {
  return (
    <AuthProvider>
      {/* Light only: the offline app has no dark mode. A new storage key so a
          "dark" choice saved by the old theme toggle is ignored. */}
      <ThemeProvider defaultTheme="light" storageKey="amp-offline-theme-light">
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <DemoModeProvider>
            <Toaster position="top-right" />
            <HashRouter>
              <Routes>
                <Route path="/" element={<SavedReportsPage />} />
                <Route path="/new" element={<ReportListPage />} />
                <Route
                  path="/jobs/:id/:slug/:reportId?"
                  element={<ReportHost />}
                />
                {/* Reports' own Back/Cancel go to /jobs/<id>, and other links
                    point at online-only pages: send them home, not to a blank screen. */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </HashRouter>
          </DemoModeProvider>
        </LocalizationProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
