import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useState, useEffect } from "react";
import { auth } from "./firebase";

import { LoginPage } from "./pages/LoginPage";
import { CommandCentrePage } from "./pages/CommandCentrePage";
import { ModelDetailPage } from "./pages/ModelDetailPage";
import { AuditVaultPage } from "./pages/AuditVaultPage";
import { FederatedNetworkPage } from "./pages/FederatedNetworkPage";
import { ReportsPage } from "./pages/ReportsPage";
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
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width: 40,
            height: 40,
            border: "3px solid var(--border-glow)",
            borderTop: "3px solid var(--accent-blue)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Bypass Auth for Demo
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
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
          <Route path="/forecast" element={<CommandCentrePage />} />
          <Route path="/vault" element={<AuditVaultPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/network" element={<FederatedNetworkPage />} />
          <Route path="/settings" element={<ReportsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/command-centre" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
