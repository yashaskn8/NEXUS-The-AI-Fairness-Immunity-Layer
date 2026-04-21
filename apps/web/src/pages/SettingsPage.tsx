import { motion } from "framer-motion";
import { Settings, User, Building2, Key, ShieldCheck, Bell, Globe, Save } from "lucide-react";
import { NexusButton } from "../components/NexusButton";
import { NexusCard } from "../components/NexusCard";

export function SettingsPage() {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Settings size={28} color="var(--blue-400)" />
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Settings</h1>
          <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Manage your NEXUS profile, organisation, and API configurations</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 32 }}>
        {/* Sidebar Nav */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[
            { id: "profile", label: "Profile", icon: User, active: true },
            { id: "org", label: "Organisation", icon: Building2 },
            { id: "api", label: "API Keys", icon: Key },
            { id: "security", label: "Security & MFA", icon: ShieldCheck },
            { id: "notifications", label: "Notifications", icon: Bell },
            { id: "network", label: "Network Access", icon: Globe },
          ].map(item => (
            <button
              key={item.id}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
                borderRadius: "var(--radius-md)", border: "none", cursor: "pointer",
                background: item.active ? "rgba(59,130,246,0.12)" : "transparent",
                color: item.active ? "var(--blue-400)" : "var(--text-secondary)",
                fontSize: 14, fontWeight: item.active ? 600 : 500,
                textAlign: "left", transition: "all 0.15s",
              }}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Profile Section */}
          <NexusCard title="Profile Information">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, color: "var(--text-dim)" }}>Full Name</label>
                <input type="text" defaultValue="Demo User" style={{ padding: "10px 14px", borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "white", outline: "none" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, color: "var(--text-dim)" }}>Email Address</label>
                <input type="email" defaultValue="demo@nexus-ai.io" style={{ padding: "10px 14px", borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "white", outline: "none" }} />
              </div>
            </div>
            <div style={{ marginTop: 20 }}>
              <NexusButton size="sm">
                <Save size={14} style={{ marginRight: 6 }} />
                Save Profile
              </NexusButton>
            </div>
          </NexusCard>

          {/* API Credentials */}
          <NexusCard title="API Credentials">
            <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>Use these keys to integrate the NEXUS Interceptor into your production environment.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(59,130,246,0.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--blue-400)", marginBottom: 2 }}>PRODUCTION KEY</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>nxs_live_8F3K9J2L1M5N4P7Q6R9T</div>
                </div>
                <NexusButton variant="secondary" size="sm">Rotate</NexusButton>
              </div>
              <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(59,130,246,0.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--blue-400)", marginBottom: 2 }}>SANDBOX KEY</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>nxs_test_A1B2C3D4E5F6G7H8I9J0</div>
                </div>
                <NexusButton variant="secondary" size="sm">Copy</NexusButton>
              </div>
            </div>
          </NexusCard>

          {/* Org Section */}
          <NexusCard title="Organisation Settings">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, color: "var(--text-dim)" }}>Organisation Name</label>
                <input type="text" defaultValue="Nexus Global Demo" style={{ padding: "10px 14px", borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "white", outline: "none" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, color: "var(--text-dim)" }}>Subdomain</label>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="text" defaultValue="demo-org" style={{ flex: 1, padding: "10px 14px", borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "white", outline: "none" }} />
                  <span style={{ fontSize: 13, color: "var(--text-dim)" }}>.nexus-ai.io</span>
                </div>
              </div>
            </div>
          </NexusCard>
        </div>
      </div>
    </motion.div>
  );
}
