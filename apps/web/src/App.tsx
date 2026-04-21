import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useState, useEffect } from "react";
import { auth } from "./firebase";
import { seedFirestoreIfEmpty } from "./utils/seedFirestore";

import { LoginPage } from "./pages/LoginPage";
import { LandingPage } from "./pages/LandingPage";
import { CommandCentrePage } from "./pages/CommandCentrePage";
import { ModelDetailPage } from "./pages/ModelDetailPage";
import { AuditVaultPage } from "./pages/AuditVaultPage";
import { FederatedNetworkPage } from "./pages/FederatedNetworkPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ImpactDashboardPage } from "./pages/ImpactDashboardPage";
import { InterceptionLogsPage } from "./pages/InterceptionLogsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { DashboardLayout } from "./layouts/DashboardLayout";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-base)" }}>
        <div style={{
          width: 40, height: 40,
          border: "3px solid rgba(59,130,246,0.2)",
          borderTop: "3px solid var(--blue-400)",
          borderRadius: "50%",
          animation: "rotate-slow 0.8s linear infinite",
        }} />
      </div>
    );
  }

  // Bypass Auth for Demo
  return <>{children}</>;
}

export default function App() {
  // Seed Firestore on mount
  useEffect(() => {
    seedFirestoreIfEmpty("demo-org");
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <DashboardLayout />
            </RequireAuth>
          }
        >
          <Route path="/command-centre" element={<CommandCentrePage />} />
          <Route path="/models/overview" element={<CommandCentrePage />} />
          <Route path="/models/:modelId" element={<ModelDetailPage />} />
          <Route path="/simulator" element={<ModelDetailPage />} />
          <Route path="/forecast" element={<ModelDetailPage />} />
          <Route path="/vault" element={<AuditVaultPage />} />
          <Route path="/impact" element={<ImpactDashboardPage />} />
          <Route path="/logs" element={<InterceptionLogsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/network" element={<FederatedNetworkPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
