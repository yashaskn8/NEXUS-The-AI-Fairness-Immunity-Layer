import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { motion } from "framer-motion";
import { auth } from "../firebase";
import {
  Zap,
  BarChart3,
  FlaskConical,
  TrendingUp,
  Lock,
  FileText,
  Globe,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";

const navItems = [
  { path: "/command-centre", label: "Command Centre", icon: Zap },
  { path: "/models/overview", label: "Models", icon: BarChart3 },
  { path: "/simulator", label: "Simulator", icon: FlaskConical },
  { path: "/forecast", label: "Forecast", icon: TrendingUp },
  { path: "/vault", label: "Vault", icon: Lock },
  { path: "/reports", label: "Reports", icon: FileText },
  { path: "/network", label: "Network", icon: Globe },
  { path: "/settings", label: "Settings", icon: Settings },
];

export function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const user = auth.currentUser;

  const handleSignOut = async () => {
    await signOut(auth);
    navigate("/login");
  };

  const sidebarWidth = collapsed ? 60 : 220;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <motion.aside
        animate={{ width: sidebarWidth }}
        transition={{ duration: 0.2 }}
        style={{
          background: "var(--bg-surface)",
          borderRight: "1px solid var(--border-glow)",
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          top: 0,
          left: 0,
          height: "100vh",
          zIndex: 50,
          overflow: "hidden",
        }}
      >
        {/* Logo + Toggle */}
        <div
          style={{
            padding: collapsed ? "20px 12px" : "20px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "space-between",
            borderBottom: "1px solid var(--border-glow)",
          }}
        >
          {!collapsed && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 20,
                fontWeight: 700,
                color: "var(--accent-blue)",
              }}
            >
              NEXUS
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: 4,
            }}
          >
            {collapsed ? <Menu size={18} /> : <X size={18} />}
          </button>
        </div>

        {/* Nav Items */}
        <nav style={{ flex: 1, padding: "12px 0" }}>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: collapsed ? "12px 0" : "12px 16px",
                justifyContent: collapsed ? "center" : "flex-start",
                color: isActive ? "var(--accent-blue)" : "var(--text-secondary)",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                borderLeft: isActive ? "3px solid var(--accent-blue)" : "3px solid transparent",
                transition: "all 0.15s ease",
              })}
            >
              <item.icon size={18} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User Profile */}
        <div
          style={{
            padding: collapsed ? "16px 8px" : "16px",
            borderTop: "1px solid var(--border-glow)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          {user?.photoURL && (
            <img
              src={user.photoURL}
              alt="Avatar"
              style={{ width: 32, height: 32, borderRadius: "50%" }}
            />
          )}
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user?.displayName ?? "User"}
              </div>
              <button
                onClick={handleSignOut}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-dim)",
                  fontSize: 11,
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <LogOut size={11} /> Sign out
              </button>
            </div>
          )}
        </div>
      </motion.aside>

      {/* Main Content */}
      <main
        style={{
          flex: 1,
          marginLeft: sidebarWidth,
          padding: 24,
          overflowY: "auto",
          minHeight: "100vh",
          transition: "margin-left 0.2s",
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}
