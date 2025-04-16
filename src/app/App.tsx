import HRPortal from './hr/page';

function App() {
  return (
    <AuthProvider>
      <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
        <DivisionProvider>
          <ChatWindowProvider>
            <Router>
              <ScrollToTop />
              <Routes>
                {/* === Core Routes === */}
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<Navigate to="/portal" replace />} />
                <Route path="/portal" element={<RequireAuth><PortalLanding /></RequireAuth>} />
                <Route path="/admin-dashboard" element={<RequireAuth><AdminDashboard /></RequireAuth>} />
                <Route path="/profile-setup" element={<RequireAuth><ProfileSetup /></RequireAuth>} />
                <Route path="/debug" element={<RequireAuth><Layout><DebugTableCheck /></Layout></RequireAuth>} />
                <Route path="/chat-debug" element={<RequireAuth><Layout><ChatDebug /></Layout></RequireAuth>} />

                {/* === HR Portal Route === */}
                <Route path="/hr" element={<RequireAuth><Layout><HRPortal /></Layout></RequireAuth>} />

                {/* === Lab Portal Routes === */}
                // ... existing code ...
              </Routes>
            </Router>
          </ChatWindowProvider>
        </DivisionProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App; 