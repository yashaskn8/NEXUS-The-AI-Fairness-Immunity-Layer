import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Settings, User, Building2, Key, ShieldCheck, Bell, Globe, Save, 
  Eye, EyeOff, Copy, RefreshCw, Check
} from "lucide-react";
import { NexusButton } from "../components/NexusButton";
import { NexusCard } from "../components/NexusCard";
import { EmptyState } from "../components/EmptyState";

type SettingsSection = 'profile' | 'organisation' | 'api_keys' | 'security' | 'notifications' | 'network';

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');
  const [showProductionKey, setShowProductionKey] = useState(false);
  const [showSandboxKey, setShowSandboxKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isRotating, setIsRotating] = useState(false);

  const prodKey = "nxs_live_8F3K9J2L1M5N4P7Q6R9T";
  const sandboxKey = "nxs_test_A1B2C3D4E5F6G7H8I9J0";

  const maskKey = (key: string) => {
    const prefix = key.startsWith("nxs_live_") ? "nxs_live_" : "nxs_test_";
    const suffix = key.slice(-4);
    const middle = "•".repeat(key.length - (prefix.length + 4));
    return `${prefix}${middle}${suffix}`;
  };

  const handleCopy = async (key: string, id: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRotate = () => {
    setIsRotating(true);
    setTimeout(() => setIsRotating(false), 1000);
  };

  const navItems = [
    { id: "profile", label: "Profile", icon: User },
    { id: "organisation", label: "Organisation", icon: Building2 },
    { id: "api_keys", label: "API Keys", icon: Key },
    { id: "security", label: "Security & MFA", icon: ShieldCheck },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "network", label: "Network Access", icon: Globe },
  ] as const;

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
          {navItems.map(item => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
                  borderRadius: "var(--radius-md)", border: "none", cursor: "pointer",
                  background: isActive ? "rgba(59,130,246,0.12)" : "transparent",
                  color: isActive ? "var(--blue-400)" : "rgba(255,255,255,0.55)",
                  fontSize: 14, fontWeight: isActive ? 600 : 500,
                  textAlign: "left", transition: "all 0.15s",
                  borderLeft: isActive ? "3px solid var(--blue-400)" : "3px solid transparent",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = "rgba(59,130,246,0.06)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                <item.icon size={16} />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <AnimatePresence mode="wait">
            {activeSection === 'profile' && (
              <motion.div key="profile" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>
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
              </motion.div>
            )}

            {activeSection === 'organisation' && (
              <motion.div key="organisation" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>
                <NexusCard title="Organisation Settings">
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, color: "var(--text-dim)" }}>Organisation Name</label>
                      <input type="text" defaultValue="Nexus Global Demo" style={{ padding: "10px 14px", borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "white", outline: "none" }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <label style={{ fontSize: 12, color: "var(--text-dim)" }}>Subdomain</label>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input type="text" defaultValue="demo-org" style={{ flex: 1, padding: "10px 14px", borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "white", outline: "none" }} />
                          <span style={{ fontSize: 13, color: "var(--text-dim)" }}>.nexus-ai.io</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <label style={{ fontSize: 12, color: "var(--text-dim)" }}>Plan Tier</label>
                        <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "var(--blue-400)", fontSize: 14, fontWeight: 600 }}>Enterprise Demo</div>
                      </div>
                    </div>
                  </div>
                </NexusCard>
              </motion.div>
            )}

            {activeSection === 'api_keys' && (
              <motion.div key="api_keys" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  <NexusCard title="API Credentials">
                    <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>Use these keys to integrate the NEXUS Interceptor into your production environment.</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {/* Production Key */}
                      <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(59,130,246,0.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--blue-400)", marginBottom: 2 }}>PRODUCTION KEY</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontFamily: "Space Mono, monospace", fontSize: 13, letterSpacing: '0.05em' }}>
                              {showProductionKey ? prodKey : maskKey(prodKey)}
                            </span>
                            <button 
                              onClick={() => setShowProductionKey(!showProductionKey)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', display: 'flex', padding: 0 }}
                              title={showProductionKey ? "Hide Key" : "Show Key"}
                            >
                              {showProductionKey ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <NexusButton variant="secondary" size="sm" onClick={handleRotate} disabled={isRotating}>
                            {isRotating ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <RefreshCw size={12} className="animate-spin" />
                                Rotating...
                              </span>
                            ) : "Rotate"}
                          </NexusButton>
                          <NexusButton variant="secondary" size="sm" onClick={() => handleCopy(prodKey, 'prod')}>
                            {copiedKey === 'prod' ? (
                              <span style={{ color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Check size={12} /> Copied
                              </span>
                            ) : "Copy"}
                          </NexusButton>
                        </div>
                      </div>

                      {/* Sandbox Key */}
                      <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(59,130,246,0.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--blue-400)", marginBottom: 2 }}>SANDBOX KEY</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontFamily: "Space Mono, monospace", fontSize: 13, letterSpacing: '0.05em' }}>
                              {showSandboxKey ? sandboxKey : maskKey(sandboxKey)}
                            </span>
                            <button 
                              onClick={() => setShowSandboxKey(!showSandboxKey)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', display: 'flex', padding: 0 }}
                            >
                              {showSandboxKey ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </div>
                        <NexusButton variant="secondary" size="sm" onClick={() => handleCopy(sandboxKey, 'sandbox')}>
                          {copiedKey === 'sandbox' ? (
                            <span style={{ color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Check size={12} /> Copied
                            </span>
                          ) : "Copy"}
                        </NexusButton>
                      </div>
                    </div>
                  </NexusCard>

                  {/* SDK Quick Start */}
                  <NexusCard title="Quick Integration">
                    <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>Add two lines to any Python AI pipeline:</p>
                    <div style={{ position: 'relative' }}>
                      <pre style={{ 
                        background: 'var(--bg-void)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
                        padding: '20px', fontSize: 13, fontFamily: 'Space Mono, monospace', overflowX: 'auto', lineHeight: 1.6,
                        color: 'rgba(255,255,255,0.8)'
                      }}>
                        <code style={{ color: '#60a5fa' }}>pip install </code><code style={{ color: '#34d399' }}>nexus-sdk</code><br /><br />
                        <code style={{ color: '#c084fc' }}>from </code><code style={{ color: 'white' }}>nexus_sdk </code><code style={{ color: '#c084fc' }}>import </code><code style={{ color: 'white' }}>NexusClient</code><br /><br />
                        <code style={{ color: 'white' }}>client = NexusClient(</code><br />
                        <code style={{ color: 'white' }}>    api_key=</code><code style={{ color: '#fbbf24' }}>"{maskKey(prodKey)}"</code><code style={{ color: 'rgba(255,255,255,0.4)' }}>,  # your key</code><br />
                        <code style={{ color: 'white' }}>    org_id=</code><code style={{ color: '#fbbf24' }}>"demo-org"</code><code style={{ color: 'white' }}>,</code><br />
                        <code style={{ color: 'white' }}>    model_id=</code><code style={{ color: '#fbbf24' }}>"your-model-v1"</code><code style={{ color: 'white' }}>,</code><br />
                        <code style={{ color: 'white' }}>    mode=</code><code style={{ color: '#fbbf24' }}>"intercept"</code><br />
                        <code style={{ color: 'white' }}>)</code><br /><br />
                        <code style={{ color: 'white' }}>result = client.log_decision(</code><br />
                        <code style={{ color: 'white' }}>    decision=</code><code style={{ color: '#fbbf24' }}>"rejected"</code><code style={{ color: 'white' }}>,</code><br />
                        <code style={{ color: 'white' }}>    confidence=</code><code style={{ color: '#fbbf24' }}>0.55</code><code style={{ color: 'white' }}>,</code><br />
                        <code style={{ color: 'white' }}>    features={'{'}"years_exp": 6, "gpa": 3.8{'}'}</code><code style={{ color: 'white' }}>,</code><br />
                        <code style={{ color: 'white' }}>    protected_attributes={'{'}"gender": "female"{'}'}</code><br />
                        <code style={{ color: 'white' }}>)</code><br />
                        <code style={{ color: 'rgba(255,255,255,0.4)' }}># result.final_decision == "approved" ← bias corrected</code>
                      </pre>
                      <button 
                        onClick={() => handleCopy(`pip install nexus-sdk\n\nfrom nexus_sdk import NexusClient\n\nclient = NexusClient(\n    api_key="${prodKey}",\n    org_id="demo-org",\n    model_id="your-model-v1",\n    mode="intercept"\n)\n\nresult = client.log_decision(\n    decision="rejected",\n    confidence=0.55,\n    features={"years_exp": 6, "gpa": 3.8},\n    protected_attributes={"gender": "female"}\n)\n# result.final_decision == "approved"`, 'snippet')}
                        style={{ 
                          position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                          padding: '6px 12px', borderRadius: 6, color: 'rgba(255,255,255,0.6)', fontSize: 11, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 6
                        }}
                      >
                        {copiedKey === 'snippet' ? <><Check size={12} color="var(--green)" /> Copied</> : <><Copy size={12} /> Copy Snippet</>}
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                      {[
                        { label: '🐍 Python SDK', link: '#python' },
                        { label: '📦 Node.js SDK', link: '#nodejs' },
                        { label: '☕ Java SDK', link: '#java' }
                      ].map(sdk => (
                        <a key={sdk.label} href={sdk.link} style={{ 
                          padding: '6px 12px', borderRadius: 100, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
                          fontSize: 12, color: 'var(--blue-400)', textDecoration: 'none', fontWeight: 500
                        }}>
                          {sdk.label}
                        </a>
                      ))}
                    </div>
                  </NexusCard>
                </div>
              </motion.div>
            )}

            {activeSection === 'security' && (
              <motion.div key="security" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>
                <NexusCard title="Security & MFA">
                  <EmptyState 
                    icon={<ShieldCheck size={48} />}
                    title="Security Hardening"
                    body="Multi-factor authentication, session management, and IP allowlisting. Available in Pro tier."
                    cta={{ label: "Upgrade to Pro", onClick: () => {} }}
                  />
                </NexusCard>
              </motion.div>
            )}

            {activeSection === 'notifications' && (
              <motion.div key="notifications" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>
                <NexusCard title="Notification Preferences">
                  <EmptyState 
                    icon={<Bell size={48} />}
                    title="Alert Configuration"
                    body="Configure email alerts, webhook endpoints, and Slack integration for real-time bias detection."
                  />
                </NexusCard>
              </motion.div>
            )}

            {activeSection === 'network' && (
              <motion.div key="network" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>
                <NexusCard title="Network Access">
                  <EmptyState 
                    icon={<Globe size={48} />}
                    title="Network Controls"
                    body="Manage API rate limit configuration and allowed domain whitelisting for your organisation."
                  />
                </NexusCard>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
