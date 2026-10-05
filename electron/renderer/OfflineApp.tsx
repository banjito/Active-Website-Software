import { HashRouter, Navigate, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { AuthProvider } from "@/lib/AuthContext";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { DemoModeProvider } from "@/lib/DemoModeContext";
import JobListPage from "./JobListPage";
import JobPage from "./JobPage";
import ReportListPage from "./ReportListPage";
import ReportHost from "./ReportHost";

/**
 * Standalone offline reporting app. Deliberately NOT the full ampOS shell:
 * a job list, a page per job (its saved reports), a report-type picker, and a
 * page per report. Uses HashRouter so deep links work
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
      <ThemeProvider defaultTheme="system" storageKey="amp-offline-theme">
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <DemoModeProvider>
            <Toaster position="top-right" />
            <HashRouter>
              <Routes>
                <Route path="/" element={<JobListPage />} />
                {/* Reports' own Back/Cancel buttons go to /jobs/<id>. */}
                <Route path="/jobs/:id" element={<JobPage />} />
                <Route path="/jobs/:id/new" element={<ReportListPage />} />
                <Route
                  path="/jobs/:id/:slug/:reportId?"
                  element={<ReportHost />}
                />
                {/* Any other online-only link a report follows: back home, not a blank screen. */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </HashRouter>
          </DemoModeProvider>
        </LocalizationProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
