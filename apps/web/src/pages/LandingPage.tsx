import { motion, useScroll, useTransform } from "framer-motion";
import { Link } from "react-router-dom";
import { Shield, Brain, Globe, ChevronRight, ArrowRight, Activity, Lock, TrendingUp } from "lucide-react";


const features = [
  { icon: Shield, title: "Real-Time Bias Interception", desc: "Every AI decision passes through NEXUS before reaching production. Fairness violations are corrected in <200ms with zero downtime.", gradient: "linear-gradient(135deg, #3B82F6, #2563EB)", glow: "var(--shadow-glow-blue)" },
  { icon: Brain, title: "Causal AI Engine", desc: "Deep causal inference detects proxy discrimination. Mutual information scoring identifies features acting as hidden protected attributes.", gradient: "linear-gradient(135deg, #A78BFA, #7C3AED)", glow: "var(--shadow-glow-purple)" },
  { icon: Lock, title: "Cryptographic Audit Vault", desc: "SHA-256 hash-chain ensures tamper-proof compliance records. Every intervention is cryptographically signed and immutable.", gradient: "linear-gradient(135deg, #10B981, #059669)", glow: "var(--shadow-glow-green)" },
  { icon: Globe, title: "Federated Fairness Network", desc: "35+ organisations collaborate on bias correction using differential privacy. No raw data leaves any organisation.", gradient: "linear-gradient(135deg, #06B6D4, #0891B2)", glow: "0 0 24px rgba(6,182,212,0.40)" },
  { icon: TrendingUp, title: "Predictive Bias Forecasting", desc: "Prophet-based drift detection forecasts fairness violations days before they occur. Proactive, not reactive.", gradient: "linear-gradient(135deg, #F59E0B, #D97706)", glow: "var(--shadow-glow-amber)" },
  { icon: Activity, title: "Regulatory Intelligence", desc: "Auto-syncs with global AI regulations. When thresholds change, NEXUS adapts within minutes.", gradient: "linear-gradient(135deg, #EF4444, #DC2626)", glow: "var(--shadow-glow-red)" },
];

const TICKER_ITEMS = [
  "500M+ AI decisions made daily",
  "98% of Fortune 500 use AI hiring",
  "EU AI Act: high-risk AI must be audited",
  "COMPAS: 2× false positive rate for Black defendants",
  "NEXUS: 200ms real-time interception",
  "47 biased decisions corrected today",
];

export function LandingPage() {
  const { scrollYProgress } = useScroll();
  const y1 = useTransform(scrollYProgress, [0, 0.3], [0, -50]);
  const opacity1 = useTransform(scrollYProgress, [0, 0.2], [1, 0]);

  const tickerText = TICKER_ITEMS.join("  ·  ") + "  ·  ";

  return (
    <div style={{
      background: "#020408",
      minHeight: "100vh",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* ── Atmospheric blobs ── */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        pointerEvents: "none", zIndex: 0,
      }}>
        <div style={{
          position: "absolute", top: "-10%", left: "-5%",
          width: "80%", height: "70%",
          background: "radial-gradient(ellipse 80% 60% at 20% 40%, rgba(59,130,246,0.12) 0%, transparent 60%)",
          animation: "atmosphere-drift 25s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", top: "10%", right: "-10%",
          width: "70%", height: "65%",
          background: "radial-gradient(ellipse 60% 50% at 80% 65%, rgba(139,92,246,0.09) 0%, transparent 55%)",
          animation: "atmosphere-drift 32s ease-in-out infinite reverse",
        }} />
        <div style={{
          position: "absolute", bottom: "-5%", left: "15%",
          width: "60%", height: "50%",
          background: "radial-gradient(ellipse 50% 40% at 50% 90%, rgba(16,185,129,0.07) 0%, transparent 50%)",
          animation: "atmosphere-drift 28s ease-in-out infinite 8s",
        }} />
      </div>

      {/* ── Grid overlay ── */}
      <div className="landing-grid-overlay" style={{ position: "fixed" }} />

      {/* NAV */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "16px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", backdropFilter: "blur(12px)", background: "rgba(2,4,8,0.6)", borderBottom: "1px solid rgba(59,130,246,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Shield size={22} color="var(--blue-400)" />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, color: "var(--blue-400)" }}>NEXUS</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <a href="#features" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: 14 }}>Features</a>
          <a href="#stats" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: 14 }}>Impact</a>
          <Link to="/login" className="nexus-btn" style={{ padding: "8px 20px" }}>Launch Dashboard</Link>
        </div>
      </nav>

      {/* HERO */}
      <motion.section style={{ y: y1, opacity: opacity1, position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", textAlign: "center", padding: "0 20px" }}>
        {/* Animated sphere rings */}
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", border: "1px solid rgba(59,130,246,0.08)", opacity: 0.3, pointerEvents: "none" }} />
        <motion.div animate={{ rotate: -360 }} transition={{ duration: 45, repeat: Infinity, ease: "linear" }}
          style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", border: "1px solid rgba(139,92,246,0.08)", opacity: 0.3, pointerEvents: "none" }} />
        <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.10), transparent 60%)", pointerEvents: "none" }} />

        {/* Shield icon with ring pulses */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          style={{ position: "relative", marginBottom: 24 }}
        >
          {/* Pulsing rings */}
          <svg width="320" height="320" viewBox="0 0 320 320" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", pointerEvents: "none" }}>
            <circle cx="160" cy="160" r="80" fill="none" stroke="rgba(59,130,246,0.3)" strokeWidth="1" style={{ transformOrigin: "center", animation: "ring-pulse 2.5s ease-out infinite" }} />
            <circle cx="160" cy="160" r="110" fill="none" stroke="rgba(59,130,246,0.2)" strokeWidth="1" style={{ transformOrigin: "center", animation: "ring-pulse 2.5s ease-out infinite 0.8s" }} />
            <circle cx="160" cy="160" r="140" fill="none" stroke="rgba(59,130,246,0.15)" strokeWidth="1" style={{ transformOrigin: "center", animation: "ring-pulse 2.5s ease-out infinite 1.6s" }} />
          </svg>
          <Shield size={48} color="var(--blue-400)" style={{ position: "relative", zIndex: 1 }} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }}>
          {/* Removed Challenge Branding */}
        </motion.div>

        <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.6 }}
          style={{ fontFamily: "var(--font-display)", fontSize: "clamp(40px, 6vw, 72px)", fontWeight: 700, lineHeight: 1.1, maxWidth: 800, marginBottom: 16 }}>
          <span style={{ color: "white" }}>The AI Fairness</span>
          <br />
          <span style={{
            background: "linear-gradient(135deg, #60A5FA 0%, #A78BFA 50%, #34D399 100%)",
            backgroundSize: "200% 200%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            animation: "gradient-shift 4s ease infinite",
          }}>Immunity Layer</span>
        </motion.h1>

        <motion.p initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.6 }}
          style={{ fontSize: 18, color: "var(--text-secondary)", maxWidth: 600, lineHeight: 1.6, marginBottom: 32 }}>
          NEXUS intercepts every AI decision in real-time, detects bias through causal inference, and enforces fairness with cryptographic accountability.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
          style={{ display: "flex", gap: 16, position: "relative", zIndex: 10 }}>
          <Link to="/command-centre" className="nexus-btn" style={{ padding: "14px 28px", fontSize: 16 }}>
            Enter Command Centre <ArrowRight size={16} style={{ marginLeft: 4 }} />
          </Link>
          <a href="#features" className="nexus-btn-outline" style={{ padding: "14px 28px", fontSize: 16 }}>
            Learn More
          </a>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div animate={{ y: [0, 10, 0] }} transition={{ duration: 2, repeat: Infinity }}
          style={{ position: "absolute", bottom: 80, color: "var(--text-dim)" }}>
          <ChevronRight size={20} style={{ transform: "rotate(90deg)" }} />
        </motion.div>

        {/* ── Stats Ticker ── */}
        <div className="ticker-strip" style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          overflow: "hidden",
          borderTop: "1px solid rgba(59,130,246,0.12)",
          borderBottom: "1px solid rgba(59,130,246,0.12)",
          padding: "10px 0",
          background: "rgba(2,4,8,0.5)",
          backdropFilter: "blur(8px)",
        }}>
          <div className="ticker-inner" style={{
            display: "flex",
            width: "max-content",
            animation: "ticker-scroll 40s linear infinite",
          }}>
            <span style={{ fontSize: 12, fontFamily: "Inter, sans-serif", fontWeight: 400, color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap", paddingRight: 16 }}>
              {tickerText}
            </span>
            <span style={{ fontSize: 12, fontFamily: "Inter, sans-serif", fontWeight: 400, color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap", paddingRight: 16 }}>
              {tickerText}
            </span>
          </div>
        </div>
      </motion.section>

      {/* FEATURES */}
      <section id="features" style={{ position: "relative", zIndex: 1, padding: "40px 40px 100px", maxWidth: 1200, margin: "0 auto" }}>
        <motion.h2 initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
          style={{ fontSize: 36, fontFamily: "var(--font-display)", fontWeight: 700, textAlign: "center", marginBottom: 48 }}>
          <span style={{ background: "linear-gradient(135deg, #3B82F6, #A78BFA)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Core Capabilities</span>
        </motion.h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {features.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
              whileHover={{ scale: 1.02 }}
              style={{
                background: "var(--bg-surface)", border: "1px solid rgba(59,130,246,0.12)", borderRadius: "var(--radius-lg)",
                padding: "28px 24px", transition: "all 0.2s",
              }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: f.gradient, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, boxShadow: f.glow }}>
                <f.icon size={22} color="white" />
              </div>
              <h3 style={{ fontSize: 16, fontFamily: "var(--font-display)", fontWeight: 600, marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ position: "relative", zIndex: 1, padding: "60px 40px 80px", textAlign: "center" }}>
        <h2 style={{ fontSize: 32, fontFamily: "var(--font-display)", fontWeight: 700, marginBottom: 16 }}>Ready to make AI fair?</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 16, marginBottom: 24 }}>NEXUS is open-source and ready for deployment.</p>
        <Link to="/command-centre" className="nexus-btn" style={{ padding: "14px 32px", fontSize: 16 }}>
          Launch NEXUS <ArrowRight size={16} style={{ marginLeft: 4 }} />
        </Link>
      </section>

      {/* Footer */}
      <footer style={{ position: "relative", zIndex: 1, padding: "20px 40px", borderTop: "1px solid rgba(59,130,246,0.08)", textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>
        Built with ❤️ for fairness
      </footer>
    </div>
  );
}
