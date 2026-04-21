import { motion } from "framer-motion";
import { Shield, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { auth, googleProvider, signInWithPopup } from "../firebase";

export function LoginPage() {
  const navigate = useNavigate();

  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      navigate("/command-centre");
    } catch {
      // Bypass auth for demo
      navigate("/command-centre");
    }
  };

  const handleDemoMode = () => {
    navigate("/command-centre");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", background: "var(--bg-void)" }}>
      <div className="nexus-mesh" />
      <div className="grid-overlay" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0, pointerEvents: "none" }} />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        style={{ position: "relative", zIndex: 1, width: 420, padding: 40 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, borderRadius: 16, background: "rgba(59,130,246,0.10)", border: "1px solid rgba(59,130,246,0.25)", marginBottom: 16 }}>
            <Shield size={32} color="var(--blue-400)" />
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 700, marginBottom: 8 }}>
            <span style={{ color: "var(--blue-400)" }}>NEXUS</span>
          </h1>
          <p style={{ color: "var(--text-dim)", fontSize: 14 }}>The AI Fairness Immunity Layer</p>
        </div>

        {/* Sign In Card */}
        <div className="nexus-card glass" style={{ padding: "32px 28px" }}>
          <h2 style={{ fontSize: 18, fontFamily: "var(--font-display)", fontWeight: 600, marginBottom: 20, textAlign: "center" }}>Sign In</h2>

          {/* Google Sign In */}
          <button onClick={handleGoogleSignIn} style={{
            width: "100%", padding: "12px 16px", borderRadius: "var(--radius-md)",
            background: "white", border: "none", color: "#333",
            fontSize: 14, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            transition: "all 0.2s", marginBottom: 12,
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
          </div>

          {/* Demo Mode */}
          <button onClick={handleDemoMode} className="nexus-btn" style={{
            width: "100%", padding: "12px 16px",
            background: "linear-gradient(135deg, #2563EB, #7C3AED)",
            fontSize: 14,
          }}>
            Enter Demo Mode <ArrowRight size={14} style={{ marginLeft: 4 }} />
          </button>

          <p style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "var(--text-dim)" }}>
            Demo mode provides full access with synthetic data
          </p>
        </div>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "var(--text-dim)" }}>
          NEXUS Official Platform
        </p>
      </motion.div>
    </div>
  );
}
