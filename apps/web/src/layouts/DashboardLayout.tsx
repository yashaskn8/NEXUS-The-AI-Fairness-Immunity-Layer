import { useState, useMemo, useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { motion, AnimatePresence } from "framer-motion";
import { auth } from "../firebase";
import {
  Zap, FlaskConical, TrendingUp, Heart,
  List, Lock, FileText, Globe, Settings,
  LogOut, Menu, X
} from "lucide-react";
import { useInterceptFeed } from "../hooks/useInterceptFeed";
import reactCountUp from "react-countup";
const CountUp = (reactCountUp as any).default || reactCountUp;

const navItems = [
  { path: "/command-centre", label: "Command Centre", icon: Zap },
  { path: "/simulator",      label: "Simulator", icon: FlaskConical },
  { path: "/forecast",       label: "Forecast", icon: TrendingUp },
  { path: "/impact",         label: "Impact", icon: Heart },
  { path: "/logs",           label: "Audit Logs", icon: List },
  { path: "/vault",          label: "Vault", icon: Lock },
  { path: "/reports",        label: "Reports", icon: FileText },
  { path: "/network",        label: "Network", icon: Globe },
  { path: "/settings",       label: "Settings", icon: Settings },
];

const services = [
  { name: "Gateway", status: true },
  { name: "Interceptor", status: true },
  { name: "Causal", status: true },
  { name: "Vault", status: true },
  { name: "Federated", status: true },
];

export function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem('nexus_sidebar_collapsed');
    return stored === null ? false : stored === 'true';
  });

  useEffect(() => {
    localStorage.setItem('nexus_sidebar_collapsed', String(collapsed));
  }, [collapsed]);
  const navigate = useNavigate();
  const location = useLocation();
  const user = auth.currentUser;
  const sidebarWidth = collapsed ? 60 : 220;

  // MICRO 1: Compute P99 from recent intercept latencies
  const { events } = useInterceptFeed("demo-org");
  const p99Info = useMemo(() => {
    const latencies = events.map(e => e.latency_ms || 0).filter(l => l > 0).sort((a, b) => a - b);
    if (latencies.length === 0) return { value: 99, color: "#34D399", symbol: "✓" };
    const idx = Math.floor(latencies.length * 0.99);
    const p99 = latencies[Math.min(idx, latencies.length - 1)]!;
    if (p99 < 100) return { value: p99, color: "#34D399", symbol: "✓" };
    if (p99 <= 150) return { value: p99, color: "#FCD34D", symbol: "~" };
    return { value: p99, color: "#F87171", symbol: "!" };
  }, [events]);
  const interceptedCount = events.filter(e => e.was_intercepted).length;

  const handleSignOut = async () => {
    await signOut(auth);
    navigate("/login");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* ─── TOP STATUS BAR ─── */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, height: 48,
        background: "rgba(5,11,24,0.92)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(59,130,246,0.10)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", zIndex: 60,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--blue-400)", letterSpacing: "0.02em" }}>NEXUS</span>
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "rgba(255,255,255,0.06)", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>v1.0.0</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)", animation: "pulse-dot 2s ease-in-out infinite" }} />
            <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>API</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: p99Info.color, fontFamily: "var(--font-mono)" }}>⚡ P99: {p99Info.value}ms {p99Info.symbol}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--blue-400)", fontFamily: "var(--font-mono)" }}>
              ⚡ <CountUp end={interceptedCount || 47} duration={1.5} /> intercepted
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {user?.photoURL && (
            <img src={user.photoURL} alt="Avatar" style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid rgba(59,130,246,0.3)" }} />
          )}
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{user?.displayName ?? "Demo User"}</span>
          <button onClick={handleSignOut} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: 4 }}>
            <LogOut size={14} />
          </button>
        </div>
      </div>

      {/* ─── LEFT SIDEBAR ─── */}
      <motion.aside
        animate={{ width: sidebarWidth }}
        transition={{ duration: 0.2 }}
        style={{
          background: "var(--bg-surface)",
          borderRight: "1px solid rgba(59,130,246,0.08)",
          display: "flex", flexDirection: "column",
          position: "fixed", top: 48, left: 0, bottom: 0,
          zIndex: 50, overflow: "hidden",
        }}
      >
        {/* Toggle */}
        <div style={{
          padding: collapsed ? "12px 0" : "12px 16px",
          display: "flex", alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-end",
        }}>
          <button onClick={() => setCollapsed(!collapsed)} style={{
            background: "none", border: "none", color: "var(--text-dim)",
            cursor: "pointer", padding: 4,
          }}>
            {collapsed ? <Menu size={16} /> : <X size={16} />}
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "4px 0" }}>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              style={({ isActive }) => ({
                display: "flex", alignItems: "center",
                gap: 10, height: 40,
                padding: collapsed ? "0 0" : "0 16px",
                justifyContent: collapsed ? "center" : "flex-start",
                color: isActive ? "var(--blue-400)" : "rgba(255,255,255,0.55)",
                textDecoration: "none", fontSize: 14, fontWeight: isActive ? 600 : 500,
                borderLeft: isActive ? "3px solid var(--blue-500)" : "3px solid transparent",
                borderRadius: "0 8px 8px 0",
                background: isActive ? "rgba(59,130,246,0.12)" : "transparent",
                transition: "all 150ms cubic-bezier(0.16, 1, 0.3, 1)",
              })}
            >
              <item.icon size={16} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* System Status */}
        {!collapsed && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(59,130,246,0.08)" }}>
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>System Status</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {services.map((s) => (
                <div key={s.name} title={s.name} style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: s.status ? "var(--green)" : "var(--red)",
                }} />
              ))}
            </div>
          </div>
        )}
      </motion.aside>

      {/* ─── MAIN CONTENT ─── */}
      <main style={{
        flex: 1, marginLeft: sidebarWidth, marginTop: 48,
        padding: 24, overflowY: "auto", minHeight: "calc(100vh - 48px)",
        transition: "margin-left 0.2s",
      }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.20, ease: [0.16, 1, 0.3, 1] }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
