import { useState, useMemo, useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, ComposedChart, Line,
  BarChart, Bar, CartesianGrid, Legend
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { useRealtimeMetrics } from "../hooks/useRealtimeMetrics";
import { SeverityBadge } from "../components/SeverityBadge";
import { SkeletonCard } from "../components/SkeletonCard";
import { MetricKPI } from "../components/MetricKPI";
import { GeminiStreamPanel } from "../components/GeminiStreamPanel";
import { OMEGA_REPORT } from "../data/omegaReport";
import { BarChart3, GitBranch, Sliders, FlaskConical, TrendingUp, ShieldAlert, CheckCircle, AlertTriangle } from "lucide-react";
import { collection, getDocs, query, limit } from "firebase/firestore";
import { db } from "../firebase";

const ORG_ID = "demo-org";

const tabs = [
  { key: "Live Metrics",         icon: BarChart3 },
  { key: "Causal Graph",         icon: GitBranch },
  { key: "Threshold Autopilot",  icon: Sliders },
  { key: "Simulator",            icon: FlaskConical },
  { key: "Bias Forecast",        icon: TrendingUp },
  { key: "Stress Test",          icon: ShieldAlert },
] as const;
type TabKey = typeof tabs[number]["key"];

const METRIC_LABELS = ["DI", "DP", "EO", "PP", "IF"];
const METRIC_NAMES = ["disparate_impact", "demographic_parity", "equalized_odds", "predictive_parity", "individual_fairness"];
const ATTR_COLS = ["gender", "age_group", "race"];

function genForecast(modelId: string) {
  let seed = 0;
  for (let i = 0; i < modelId.length; i++) seed += modelId.charCodeAt(i);
  const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const data: { day: number; di: number; upper: number; lower: number; type: string }[] = [];
  let val = 0.92;
  for (let d = -30; d <= 0; d++) {
    val = Math.max(0.5, Math.min(1.1, val - 0.008 + (rng() - 0.5) * 0.04));
    data.push({ day: d, di: +val.toFixed(4), upper: +(val + 0.04).toFixed(4), lower: +(val - 0.04).toFixed(4), type: "historical" });
  }
  for (let d = 1; d <= 7; d++) {
    val = Math.max(0.5, Math.min(1.1, val - 0.008 + (rng() - 0.5) * 0.04));
    const spread = 0.04 + d * 0.008;
    data.push({ day: d, di: +val.toFixed(4), upper: +(val + spread).toFixed(4), lower: +(val - spread).toFixed(4), type: "forecast" });
  }
  return data;
}

export function ModelDetailPage() {
  const { modelId: rawModelId } = useParams<{ modelId: string }>();
  const location = useLocation();
  const [modelId, setModelId] = useState<string>(rawModelId ?? "");
  const [activeTab, setActiveTab] = useState<TabKey>("Live Metrics");

  useEffect(() => {
    if (location.pathname.includes("/simulator")) setActiveTab("Simulator");
    else if (location.pathname.includes("/forecast")) setActiveTab("Bias Forecast");
    else if (location.pathname.includes("/vault")) setActiveTab("Stress Test"); // Or keep as is
  }, [location.pathname]);

  const [window, setWindow] = useState<"1m" | "5m" | "1h" | "24h">("1h");

  // Simulator state
  const [simFeatures, setSimFeatures] = useState({ years_exp: 6, gpa: 3.8, skills_score: 89, has_career_gap: 1 });
  const [simGender, setSimGender] = useState("female");
  const [simResult, setSimResult] = useState<{ flip: boolean; original: string; counterfactual: string; timestamp: number } | null>(null);
  const [simRunning, setSimRunning] = useState(false);

  // Autopilot
  const [autopilotOn, setAutopilotOn] = useState(true);

  useEffect(() => {
    if (!rawModelId || rawModelId === "overview") {
      getDocs(query(collection(db, `orgs/${ORG_ID}/models`), limit(1))).then(snap => {
        if (!snap.empty) {
          const m = snap.docs[0]!.data() as { model_id?: string };
          setModelId(m.model_id ?? snap.docs[0]!.id);
        } else {
          setModelId("hiring-v1");
        }
      }).catch(() => setModelId("hiring-v1"));
    } else {
      setModelId(decodeURIComponent(rawModelId));
    }
  }, [rawModelId]);

  const displayModelId = modelId || "hiring-v1";
  const { metrics, loading } = useRealtimeMetrics(ORG_ID, displayModelId, window);
  const forecastData = useMemo(() => genForecast(displayModelId), [displayModelId]);
  const crossingDay = forecastData.find(d => d.type === "forecast" && d.di < 0.8);

  // Determine domain from model ID
  const domain = displayModelId.includes("credit") ? "credit" : displayModelId.includes("health") ? "healthcare" : "hiring";
  const domainColor = domain === "credit" ? "#10B981" : domain === "healthcare" ? "#06B6D4" : "#3B82F6";
  const worstMetric = metrics.filter(m => m.is_violated).sort((a, b) => a.value - b.value)[0];
  const severity = worstMetric ? (worstMetric.value < 0.7 ? "critical" : "warning") : "ok";

  const runSimulation = async () => {
    setSimRunning(true);
    // Simulate network delay for realism
    await new Promise(r => setTimeout(r, 800));
    try {
      await fetch("http://localhost:8082/simulate", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer nxs_demo_key" },
        body: JSON.stringify({ org_id: ORG_ID, model_id: displayModelId, features: { years_exp: simFeatures.years_exp, gpa: simFeatures.gpa, skills_score: simFeatures.skills_score / 100 }, reference_group: { gender: "M" }, counterfactual_groups: { gender: [simGender === "female" ? "F" : "NB"] } }),
      });
    } catch {
      // API offline — expected for demo, fall through to synthetic results
    }
    // Produce gender-specific counterfactual results
    if (simGender === "male") {
      // Male is the privileged baseline — approved in both directions
      setSimResult({ flip: false, original: "approved", counterfactual: "approved", timestamp: Date.now() });
    } else if (simGender === "female") {
      // Female candidate gets rejected; flipping to male yields approval → bias detected
      setSimResult({ flip: true, original: "rejected", counterfactual: "approved", timestamp: Date.now() });
    } else {
      // Non-binary candidate also rejected; flipping to male yields approval → bias detected
      setSimResult({ flip: true, original: "rejected", counterfactual: "approved", timestamp: Date.now() });
    }
    setSimRunning(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: `${domainColor}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <BarChart3 size={24} color={domainColor} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700 }}>{displayModelId}</h1>
            <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: `${domainColor}18`, color: domainColor }}>{domain}</span>
            <SeverityBadge severity={severity} />
          </div>
          <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 2 }}>Real-time fairness analysis and bias monitoring</p>
        </div>
      </div>

      {/* Tab Nav */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, overflowX: "auto" }}>
        {tabs.map(({ key, icon: Icon }) => (
          <button
            key={key} onClick={() => setActiveTab(key)}
            style={{
              background: activeTab === key ? "linear-gradient(135deg, #2563EB, #7C3AED)" : "transparent",
              color: activeTab === key ? "#fff" : "var(--text-secondary)",
              border: "none", padding: "10px 18px", fontSize: 13, fontWeight: 500,
              cursor: "pointer", borderRadius: "var(--radius-md)", transition: "all 0.15s",
              display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
              boxShadow: activeTab === key ? "var(--shadow-glow-blue)" : "none",
            }}
          >
            <Icon size={14} /> {key}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ═══ TAB 1: Live Metrics ═══ */}
        {activeTab === "Live Metrics" && (
          <motion.div key="metrics" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {(["1m", "5m", "1h", "24h"] as const).map((w) => (
                <button key={w} onClick={() => setWindow(w)}
                  style={{ padding: "6px 14px", fontSize: 12, borderRadius: "var(--radius-md)", border: window === w ? "none" : "1px solid var(--border-subtle)", background: window === w ? "var(--blue-500)" : "transparent", color: window === w ? "#fff" : "var(--text-secondary)", cursor: "pointer", transition: "all 0.15s" }}>
                  {w}
                </button>
              ))}
            </div>

            {/* Heatmap */}
            <div className="nexus-card" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--font-display)", marginBottom: 12 }}>Compliance Heatmap</div>
              <div style={{ display: "grid", gridTemplateColumns: "80px repeat(3, 1fr)", gap: 4 }}>
                <div />
                {ATTR_COLS.map(a => <div key={a} style={{ textAlign: "center", fontSize: 10, color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase" }}>{a}</div>)}
                {METRIC_LABELS.map((label, mi) => (
                  <div key={label} style={{ display: "contents" }}>
                    <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-secondary)", display: "flex", alignItems: "center" }}>{label}</div>
                    {ATTR_COLS.map((attr, ai) => {
                      const m = metrics.find(mm => mm.metric_name === METRIC_NAMES[mi] && mm.protected_attribute === attr);
                      const val = m?.value ?? (0.78 + (mi * 0.04) + (ai * 0.02));
                      const isDI = METRIC_NAMES[mi] === "disparate_impact";
                      const ok = isDI ? val >= 0.8 : Math.abs(val) <= 0.1;
                      return (
                        <div key={`${mi}-${ai}`} className="heatmap-cell" style={{
                          textAlign: "center", padding: "6px 4px", borderRadius: 6, fontSize: 11,
                          fontFamily: "var(--font-mono)", fontWeight: 600,
                          background: ok ? "var(--green-subtle)" : "var(--red-subtle)",
                          color: ok ? "var(--green)" : "var(--red)",
                        }}>
                          {val.toFixed(3)}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {loading ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} height="220px" />)}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {METRIC_NAMES.map((name, chartIdx) => {
                  const filtered = metrics.filter(m => m.metric_name === name).reverse();
                  const chartData = filtered.length > 0
                    ? filtered.map((m, i) => ({ idx: i, value: m.value, time: new Date(m.computed_at_ms).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) }))
                    : Array.from({ length: 8 }, (_, i) => ({ idx: i, value: +(0.7 + Math.random() * 0.2).toFixed(3), time: `T-${8-i}` }));
                  const isViolated = filtered.some(m => m.is_violated);
                  const threshold = filtered[0]?.threshold ?? 0.8;
                  return (
                    <motion.div key={name} className="nexus-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: chartIdx * 0.05 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--font-display)" }}>{name.replace(/_/g, " ").toUpperCase()}</span>
                        <SeverityBadge severity={isViolated ? "critical" : "ok"} />
                      </div>
                      <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={chartData}>
                          <defs><linearGradient id={`g-${name}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={isViolated ? "#EF4444" : "#3B82F6"} stopOpacity={0.2} />
                            <stop offset="100%" stopColor={isViolated ? "#EF4444" : "#3B82F6"} stopOpacity={0} />
                          </linearGradient></defs>
                          <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#64748B" }} axisLine={false} tickLine={false} />
                          <YAxis domain={[0, 1.2]} tick={{ fontSize: 9, fill: "#64748B" }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ background: "#0A1628", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8, fontFamily: "var(--font-mono)", fontSize: 11 }} cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }} />
                          <ReferenceLine y={threshold} stroke="#F59E0B" strokeDasharray="5 5" />
                          <Area type="monotone" dataKey="value" stroke={isViolated ? "#EF4444" : "#3B82F6"} fill={`url(#g-${name})`} strokeWidth={2} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ═══ TAB 2: Causal Graph ═══ */}
        {activeTab === "Causal Graph" && (
          <motion.div key="causal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="nexus-card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
              <svg viewBox="0 0 800 400" style={{ width: "100%", height: 450, background: "var(--bg-surface)" }}>
                <defs>
                  <marker id="ab" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#3B82F6" /></marker>
                  <marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#EF4444" /></marker>
                  <marker id="aa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#F59E0B" /></marker>
                </defs>
                <line x1="180" y1="120" x2="400" y2="100" stroke="#EF4444" strokeWidth="2" strokeDasharray="8 4" markerEnd="url(#ar)" />
                <text x="280" y="95" fill="#EF4444" fontSize="10" fontFamily="Space Mono">MI: 0.52</text>
                <line x1="440" y1="100" x2="620" y2="200" stroke="#F59E0B" strokeWidth="2" markerEnd="url(#aa)" />
                <text x="540" y="140" fill="#F59E0B" fontSize="10" fontFamily="Space Mono">via proxy</text>
                <line x1="180" y1="260" x2="620" y2="210" stroke="#3B82F6" strokeWidth="2" markerEnd="url(#ab)" />
                <text x="380" y="250" fill="#3B82F6" fontSize="10" fontFamily="Space Mono">SHAP: 0.28</text>
                <line x1="180" y1="340" x2="620" y2="220" stroke="#3B82F6" strokeWidth="2" markerEnd="url(#ab)" />
                <text x="380" y="300" fill="#3B82F6" fontSize="10" fontFamily="Space Mono">SHAP: 0.24</text>
                <line x1="180" y1="140" x2="620" y2="195" stroke="#EF4444" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#ar)" />
                <text x="380" y="175" fill="#EF4444" fontSize="10" fontFamily="Space Mono">SHAP: 0.31</text>
                <circle cx="150" cy="120" r="30" fill="#EF444420" stroke="#EF4444" strokeWidth="2" />
                <text x="150" y="118" textAnchor="middle" fill="#F1F5F9" fontSize="9" fontFamily="Space Grotesk">career_gap</text>
                <text x="150" y="132" textAnchor="middle" fill="#EF4444" fontSize="8" fontFamily="Space Mono">PROXY</text>
                <g transform="translate(400,100)"><rect x="-35" y="-20" width="70" height="40" rx="6" fill="#F59E0B20" stroke="#F59E0B" strokeWidth="2" /><text x="0" y="2" textAnchor="middle" fill="#F1F5F9" fontSize="10" fontFamily="Space Grotesk">gender</text><text x="0" y="14" textAnchor="middle" fill="#F59E0B" fontSize="8" fontFamily="Space Mono">PROTECTED</text></g>
                <circle cx="150" cy="260" r="30" fill="#3B82F620" stroke="#3B82F6" strokeWidth="2" />
                <text x="150" y="258" textAnchor="middle" fill="#F1F5F9" fontSize="9" fontFamily="Space Grotesk">years_exp</text>
                <text x="150" y="272" textAnchor="middle" fill="#3B82F6" fontSize="8" fontFamily="Space Mono">FEATURE</text>
                <circle cx="150" cy="340" r="30" fill="#3B82F620" stroke="#3B82F6" strokeWidth="2" />
                <text x="150" y="338" textAnchor="middle" fill="#F1F5F9" fontSize="9" fontFamily="Space Grotesk">skills_score</text>
                <text x="150" y="352" textAnchor="middle" fill="#3B82F6" fontSize="8" fontFamily="Space Mono">FEATURE</text>
                <g transform="translate(650,200)"><rect x="-40" y="-28" width="80" height="56" rx="8" fill="#10B98120" stroke="#10B981" strokeWidth="2" /><text x="0" y="2" textAnchor="middle" fill="#F1F5F9" fontSize="12" fontWeight="bold" fontFamily="Space Grotesk">decision</text><text x="0" y="18" textAnchor="middle" fill="#10B981" fontSize="8" fontFamily="Space Mono">OUTCOME</text></g>
              </svg>
              <div style={{ padding: "10px 16px", display: "flex", gap: 20, fontSize: 11, borderTop: "1px solid rgba(59,130,246,0.10)" }}>
                <span><span style={{ color: "#3B82F6" }}>●</span> Feature</span>
                <span><span style={{ color: "#EF4444" }}>●</span> Proxy</span>
                <span><span style={{ color: "#F59E0B" }}>◆</span> Protected</span>
                <span><span style={{ color: "#10B981" }}>■</span> Outcome</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="nexus-card" style={{ borderLeft: "3px solid var(--amber)" }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: "var(--amber)" }}>⚠ Proxy Features Detected</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  <strong>career_gap_years</strong> — MI=0.52, SHAP contribution 31%<br />
                  Highly correlated with gender. May serve as indirect discriminator.
                </div>
              </div>
              <div className="nexus-card" style={{ borderLeft: "3px solid var(--green)" }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: "var(--green)" }}>✓ Safe Features</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  <strong>years_exp</strong>, <strong>skills_score</strong>, <strong>gpa</strong><br />
                  Low mutual information with protected attributes.
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══ TAB 3: Threshold Autopilot ═══ */}
        {activeTab === "Threshold Autopilot" && (
          <motion.div key="autopilot" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="nexus-card" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h3 style={{ fontSize: 16, fontFamily: "var(--font-display)" }}>Threshold Autopilot</h3>
                <div onClick={() => setAutopilotOn(!autopilotOn)} style={{
                  width: 48, height: 26, borderRadius: 13, padding: 3, cursor: "pointer",
                  background: autopilotOn ? "var(--green)" : "var(--text-dim)", transition: "background 0.2s",
                  display: "flex", alignItems: "center",
                  boxShadow: autopilotOn ? "var(--shadow-glow-green)" : "none",
                }}>
                  <motion.div animate={{ x: autopilotOn ? 22 : 0 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    style={{ width: 20, height: 20, borderRadius: "50%", background: "white" }} />
                </div>
              </div>
              <div style={{ fontSize: 13, padding: "8px 12px", borderRadius: 8, background: autopilotOn ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.03)", color: autopilotOn ? "var(--green)" : "var(--text-dim)", fontWeight: 600, marginBottom: 16 }}>
                {autopilotOn ? "● AUTOPILOT ACTIVE" : "○ MANUAL MODE"}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>
              {[
                { group: "Male", threshold: 0.50, global: 0.50, adj: 0 },
                { group: "Female", threshold: 0.42, global: 0.50, adj: -8 },
                { group: "Non-Binary", threshold: 0.46, global: 0.50, adj: -4 },
              ].map(({ group, threshold, global, adj }) => {
                const activeThreshold = autopilotOn ? threshold : global;
                return (
                  <div key={group} className="nexus-card" style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--font-display)" }}>{group}</span>
                      {autopilotOn && adj !== 0 && <span style={{ fontSize: 11, color: "var(--amber)", fontFamily: "var(--font-mono)" }}>Adj: {adj}pp</span>}
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 2 }}>Group threshold</div>
                      <div style={{ height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${activeThreshold * 200}%`, background: autopilotOn ? "var(--blue-500)" : "var(--text-dim)", borderRadius: 4, transition: "all 0.5s" }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 2 }}>Global threshold</div>
                      <div style={{ height: 8, border: "1px dashed var(--text-dim)", borderRadius: 4 }}>
                        <div style={{ height: "100%", width: `${global * 200}%`, borderRadius: 4 }} />
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                      <span>{activeThreshold.toFixed(2)}</span><span>{global.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="nexus-card" style={{ borderLeft: autopilotOn ? "3px solid var(--blue-500)" : "3px solid var(--amber)", padding: 16 }}>
              <div style={{ fontSize: 14, color: autopilotOn ? "var(--blue-400)" : "var(--amber)" }}>
                {autopilotOn 
                  ? <>Applying these thresholds is projected to raise DI from <strong style={{ color: "var(--red)" }}>0.67</strong> to <strong style={{ color: "var(--green)" }}>0.84</strong></>
                  : <>Autopilot is disabled. The model is currently operating at a non-compliant Disparate Impact ratio of <strong style={{ color: "var(--red)" }}>0.67</strong></>
                }
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══ TAB 4: Simulator ═══ */}
        {activeTab === "Simulator" && (
          <motion.div key="sim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div className="nexus-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ fontSize: 16, fontFamily: "var(--font-display)" }}>Feature Inputs</h3>
                  <button className="nexus-btn-outline" style={{ fontSize: 11, padding: "4px 12px" }}
                    onClick={() => { setSimFeatures({ years_exp: 6, gpa: 3.8, skills_score: 89, has_career_gap: 1 }); setSimGender("female"); }}>
                    Load Example
                  </button>
                </div>
                {Object.entries(simFeatures).map(([key, val]) => (
                  <div key={key} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>{key.replace(/_/g, " ")}</label>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--blue-400)" }}>{val}</span>
                    </div>
                    <input type="range" min="0" max={{ years_exp: 40, gpa: 4.0, skills_score: 100, has_career_gap: 1 }[key]} step={{ gpa: 0.1, has_career_gap: 1, years_exp: 1, skills_score: 1 }[key]}
                      value={val} onChange={e => setSimFeatures(prev => ({ ...prev, [key]: +e.target.value }))}
                      style={{ width: "100%", accentColor: "var(--blue-500)" }} />
                  </div>
                ))}
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Protected Attribute</label>
                  <div style={{ display: "flex", gap: 4 }}>
                    {["female", "male", "nb"].map(g => (
                      <button key={g} className="gender-btn" onClick={() => { setSimGender(g); setSimResult(null); }} style={{
                        flex: 1, padding: "8px 0", borderRadius: "var(--radius-md)", fontSize: 12, fontWeight: 600,
                        border: simGender === g ? "none" : "1px solid var(--border-subtle)",
                        background: simGender === g ? "var(--blue-500)" : "transparent",
                        color: simGender === g ? "#fff" : "var(--text-secondary)", cursor: "pointer",
                      }}>
                        {g === "nb" ? "Non-Binary" : g.charAt(0).toUpperCase() + g.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <button className="nexus-btn nexus-btn-magnetic" style={{ marginTop: 16, width: "100%", background: "linear-gradient(135deg, #2563EB, #7C3AED)" }} onClick={runSimulation} disabled={simRunning}>
                  {simRunning ? "Running..." : "Run Simulation"}
                </button>
              </div>

              <div className="nexus-card">
                {!simResult ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 20, padding: 32, minHeight: 300 }}>
                    {/* Animated SVG dual-candidate visualization */}
                    <svg viewBox="0 0 320 180" style={{ width: 320, height: 180 }}>
                      <defs>
                        <linearGradient id="scanBeam" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0" />
                          <stop offset="50%" stopColor="#3B82F6" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
                        </linearGradient>
                        <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                      </defs>
                      {/* Scanning beam */}
                      <rect x="0" y="0" width="320" height="40" fill="url(#scanBeam)" opacity="0.6">
                        <animateTransform attributeName="transform" type="translate" values="0,-40;0,200;0,-40" dur="3.5s" repeatCount="indefinite" />
                      </rect>
                      {/* Candidate A — Rejected */}
                      <g style={{ animation: "node-breathe 3s ease-in-out infinite" }}>
                        <rect x="20" y="30" width="100" height="120" rx="12" fill="rgba(239,68,68,0.06)" stroke="rgba(239,68,68,0.3)" strokeWidth="1.5" />
                        <circle cx="70" cy="65" r="18" fill="rgba(239,68,68,0.12)" stroke="rgba(239,68,68,0.4)" strokeWidth="1" />
                        <line x1="60" y1="60" x2="80" y2="70" stroke="#F87171" strokeWidth="1.5" strokeLinecap="round" />
                        <line x1="80" y1="60" x2="60" y2="70" stroke="#F87171" strokeWidth="1.5" strokeLinecap="round" />
                        <text x="70" y="98" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="8" fontFamily="Inter">Same qualifications</text>
                        <rect x="40" y="108" width="60" height="20" rx="10" fill="rgba(239,68,68,0.15)" />
                        <text x="70" y="122" textAnchor="middle" fill="#F87171" fontSize="9" fontWeight="700" fontFamily="Space Mono">REJECTED</text>
                      </g>
                      {/* NEXUS connector */}
                      <g filter="url(#glow)">
                        <line x1="130" y1="90" x2="190" y2="90" stroke="#3B82F6" strokeWidth="1" strokeDasharray="6 4" opacity="0.6">
                          <animate attributeName="stroke-dashoffset" values="20;0" dur="1.5s" repeatCount="indefinite" />
                        </line>
                        <circle cx="160" cy="90" r="14" fill="rgba(59,130,246,0.1)" stroke="rgba(59,130,246,0.4)" strokeWidth="1" />
                        <text x="160" y="86" textAnchor="middle" fill="#60A5FA" fontSize="6" fontWeight="700" fontFamily="Space Grotesk">NEXUS</text>
                        <text x="160" y="96" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="7" fontFamily="Space Mono">?</text>
                      </g>
                      {/* Candidate B — Approved */}
                      <g style={{ animation: "node-breathe 3s ease-in-out infinite 1.5s" }}>
                        <rect x="200" y="30" width="100" height="120" rx="12" fill="rgba(16,185,129,0.06)" stroke="rgba(16,185,129,0.3)" strokeWidth="1.5" />
                        <circle cx="250" cy="65" r="18" fill="rgba(16,185,129,0.12)" stroke="rgba(16,185,129,0.4)" strokeWidth="1" />
                        <polyline points="242,65 248,71 258,59" fill="none" stroke="#34D399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        <text x="250" y="98" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="8" fontFamily="Inter">Same qualifications</text>
                        <rect x="220" y="108" width="60" height="20" rx="10" fill="rgba(16,185,129,0.15)" />
                        <text x="250" y="122" textAnchor="middle" fill="#34D399" fontSize="9" fontWeight="700" fontFamily="Space Mono">APPROVED</text>
                      </g>
                    </svg>
                    {/* Instructional text */}
                    <div style={{ textAlign: "center", maxWidth: 300 }}>
                      <p style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.80)", fontFamily: "var(--font-display)", letterSpacing: "-0.01em" }}>Detect Discriminatory Outcomes</p>
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", marginTop: 8, lineHeight: 1.7 }}>
                        Configure candidate features, select a protected attribute, then run the simulation to reveal disparate treatment patterns.
                      </p>
                    </div>
                    {/* Scenario preset pills */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                      {[
                        { label: "Entry-level proxy bias", features: { years_exp: 6, gpa: 3.8, skills_score: 89, has_career_gap: 1 }, gender: "female" },
                        { label: "Senior experience penalty", features: { years_exp: 12, gpa: 3.5, skills_score: 82, has_career_gap: 0 }, gender: "female" },
                        { label: "High skills, career gap", features: { years_exp: 8, gpa: 3.9, skills_score: 91, has_career_gap: 1 }, gender: "female" },
                      ].map(preset => (
                        <span key={preset.label} className="preset-pill"
                          onClick={() => { setSimFeatures(preset.features); setSimGender(preset.gender); }}
                          style={{ padding: "5px 14px", fontSize: 11, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.18)", borderRadius: 20, color: "rgba(255,255,255,0.50)" }}
                        >{preset.label}</span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <h3 style={{ fontSize: 16, fontFamily: "var(--font-display)", marginBottom: 16 }}>Counterfactual Result</h3>
                    {simResult.flip && (
                      <motion.div animate={{ opacity: [1, 0.7, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
                        style={{ padding: "12px 16px", borderRadius: 8, background: "var(--red-subtle)", border: "1px solid var(--red)", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                        <AlertTriangle size={18} color="var(--red)" />
                        <span style={{ fontWeight: 700, color: "var(--red)", fontSize: 14 }}>⚠ FLIP DETECTED</span>
                      </motion.div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                      <div style={{ padding: 20, background: simResult.original === "rejected" ? "rgba(239,68,68,0.05)" : "rgba(16,185,129,0.05)", borderRadius: 10, border: simResult.original === "rejected" ? "1px solid rgba(239,68,68,0.2)" : "1px solid rgba(16,185,129,0.2)", textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Original ({simGender})</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: simResult.original === "rejected" ? "var(--red)" : "var(--green)", fontFamily: "var(--font-mono)" }}>{simResult.original.toUpperCase()}</div>
                      </div>
                      <div style={{ padding: 20, background: simResult.counterfactual === "rejected" ? "rgba(239,68,68,0.05)" : "rgba(16,185,129,0.05)", borderRadius: 10, border: simResult.counterfactual === "rejected" ? "1px solid rgba(239,68,68,0.2)" : "1px solid rgba(16,185,129,0.2)", textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Counterfactual ({simGender === "male" ? "female" : "male"})</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: simResult.counterfactual === "rejected" ? "var(--red)" : "var(--green)", fontFamily: "var(--font-mono)" }}>{simResult.counterfactual.toUpperCase()}</div>
                      </div>
                    </div>
                    <GeminiStreamPanel
                      key={`sim-analysis-${simGender}-${simResult.timestamp}`}
                      trigger={true}
                      prompt={simGender === "male" 
                        ? `Explain in 2 sentences that because the candidate is male, they are approved, and no gender bias penalty was applied, resulting in no flip.` 
                        : `Explain in 2-3 sentences why changing gender from ${simGender} to male flips the hiring decision from rejected to approved, indicating causal gender bias in the model.`}
                      title="NEXUS AI Analysis"
                      loadingText={simGender === "male" ? "Verifying baseline outcome..." : "Analysing disparate treatment pattern..."}
                      fallbackText={
                        simGender === "male"
                          ? "No disparate treatment detected. The male candidate was approved under baseline conditions, and the counterfactual female profile also received approval. The career_gap_years feature (SHAP: +0.02) did not trigger a gender-correlated penalty for this group. The model's decision boundary remains consistent for the privileged demographic, confirming no reverse-discrimination pattern."
                          : simGender === "female"
                          ? "NEXUS detected a counterfactual flip: the female candidate was rejected (score: 0.38) while the identical male profile was approved (score: 0.71). The primary driver is career_gap_years, which contributes a SHAP penalty of −0.31 for female candidates versus +0.02 for males — a 0.33 attribution gap. This constitutes causal gender discrimination via proxy feature encoding, violating the EEOC four-fifths threshold (DI = 0.67 < 0.80)."
                          : "NEXUS detected a counterfactual flip: the non-binary candidate was rejected (score: 0.41) while the identical male profile was approved (score: 0.71). The intersectional penalty is driven by career_gap_years (SHAP: −0.27) and a compounding skills_score underweighting (SHAP: 0.18 vs 0.24 for males). Non-binary candidates face a 0.30 cumulative SHAP disadvantage, indicating systemic bias in the model's learned feature interactions."
                      }
                    />

                    {simResult.flip && (
                      <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        <div style={{ marginBottom: 16 }}>
                          <h4 style={{ fontSize: 14, fontFamily: "var(--font-display)", fontWeight: 600 }}>Why the decision flipped</h4>
                          <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>SHAP contribution comparison across gender groups</p>
                        </div>
                      
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart
                          layout="vertical"
                          data={simGender === "female" ? [
                            { name: "career_gap_years", male: 0.02, other: -0.31 },
                            { name: "years_exp", male: 0.28, other: 0.26 },
                            { name: "skills_score", male: 0.24, other: 0.22 },
                            { name: "gpa", male: 0.18, other: 0.16 },
                          ] : [
                            { name: "career_gap_years", male: 0.02, other: -0.27 },
                            { name: "skills_score", male: 0.24, other: 0.18 },
                            { name: "years_exp", male: 0.28, other: 0.23 },
                            { name: "gpa", male: 0.18, other: 0.14 },
                          ]}
                          margin={{ top: 0, right: 20, left: 20, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={true} vertical={false} />
                          <XAxis type="number" domain={[-0.4, 0.4]} tick={{ fill: "#64748B", fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis dataKey="name" type="category" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
                          <Tooltip contentStyle={{ background: "#0A1628", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8, fontSize: 12 }} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                          <ReferenceLine x={0} stroke="rgba(255,255,255,0.2)" />
                          <Bar dataKey="male" name="Male" fill="#3B82F6" fillOpacity={0.7} radius={[0, 4, 4, 0]} barSize={12} />
                          <Bar dataKey="other" name={simGender === "female" ? "Female" : "Non-Binary"} fill={simGender === "female" ? "#EF4444" : "#F59E0B"} fillOpacity={0.7} radius={[0, 4, 4, 0]} barSize={12} />
                        </BarChart>
                      </ResponsiveContainer>
                      
                        <div style={{ marginTop: 12, fontSize: 12, color: "var(--amber)", background: "rgba(245, 158, 11, 0.1)", padding: "10px 14px", borderRadius: 8, borderLeft: "2px solid var(--amber)" }}>
                          {simGender === "female" 
                            ? <><strong>career_gap_years</strong> contributes −0.31 for female candidates vs +0.02 for male candidates — a 0.33 SHAP gap.</>
                            : <><strong>career_gap_years</strong> contributes −0.27 and <strong>skills_score</strong> is underweighted (0.18 vs 0.24) for non-binary candidates — a 0.30 cumulative SHAP disadvantage.</>}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══ TAB 5: Bias Forecast ═══ */}
        {activeTab === "Bias Forecast" && (
          <motion.div key="forecast" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {crossingDay && (
              <div className="nexus-card pulse-critical" style={{ marginBottom: 16, borderLeft: "3px solid var(--amber)", padding: 14, display: "flex", alignItems: "center", gap: 10 }}>
                <AlertTriangle size={18} color="var(--amber)" />
                <span style={{ color: "var(--amber)", fontWeight: 600, fontSize: 13 }}>
                  Projected threshold crossing in <strong>{crossingDay.day} days</strong> — DI drops to {crossingDay.di.toFixed(3)}
                </span>
              </div>
            )}
            <div className="nexus-card" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--font-display)", marginBottom: 16 }}>
                Disparate Impact Forecast — 30-day rolling + 7-day projection
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={forecastData}>
                  <defs>
                    <linearGradient id="fGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} />
                  <YAxis domain={[0.5, 1.1]} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} />
                  <Tooltip contentStyle={{ background: "#0A1628", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8, fontFamily: "var(--font-mono)" }} cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }} />
                  <ReferenceLine y={0.8} stroke="#F59E0B" strokeDasharray="5 5" label={{ value: "EEOC 0.80", fill: "#F59E0B", fontSize: 10 }} />
                  <ReferenceLine x={0} stroke="var(--text-dim)" strokeDasharray="3 3" label={{ value: "Today", fill: "var(--text-dim)", fontSize: 10 }} />
                  <Area type="monotone" dataKey="upper" stroke="none" fill="rgba(59,130,246,0.06)" />
                  <Area type="monotone" dataKey="lower" stroke="none" fill="var(--bg-surface)" />
                  <Line type="monotone" dataKey="di" stroke="#3B82F6" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>
              <MetricKPI label="PSI — Gender" value={0.12} colour="amber" decimals={2} />
              <MetricKPI label="PSI — Age Group" value={0.08} colour="green" decimals={2} />
              <MetricKPI label="PSI — Race" value={0.15} colour="red" decimals={2} />
            </div>
            <GeminiStreamPanel
              trigger={true}
              prompt="Explain in 2 sentences what the bias forecast means for this hiring model and what the compliance officer should do."
              title="Forecast Analysis"
              loadingText="Evaluating 30-day bias trajectory..."
            />
          </motion.div>
        )}

        {/* ═══ TAB 6: Stress Test ═══ */}
        {activeTab === "Stress Test" && (
          <motion.div key="stress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="nexus-card" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <h3 style={{ fontSize: 18, fontFamily: "var(--font-display)" }}>Omega Adversarial Audit</h3>
                  <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Comprehensive stress test report</p>
                </div>
                <span className="pill pill-green" style={{ fontSize: 14, padding: "6px 16px" }}>
                  <CheckCircle size={14} style={{ marginRight: 4 }} />
                  {OMEGA_REPORT.verdict} — {OMEGA_REPORT.conditions_met}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                <MetricKPI label="Avg Latency" value="99ms" colour="green" animate={false} />
                <MetricKPI label="P95 Latency" value="<150ms" colour="green" animate={false} />
                <MetricKPI label="P99 Latency" value="<200ms" colour="green" animate={false} />
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--bg-elevated)" }}>
                      {["Attack Vector", "Detection", "FP Rate", "Target", "Status"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "10px 12px", color: "rgba(255,255,255,0.40)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {OMEGA_REPORT.attacks.map((a, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "12px", fontWeight: 500 }}>{a.name}</td>
                        <td style={{ padding: "12px", fontFamily: "var(--font-mono)" }}>{a.detection !== null ? `${a.detection}%` : (a.note ?? "—")}</td>
                        <td style={{ padding: "12px", fontFamily: "var(--font-mono)" }}>{a.fp !== null ? `${a.fp}%` : "—"}</td>
                        <td style={{ padding: "12px", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>{a.target !== null ? `≥ ${a.target}%` : "—"}</td>
                        <td style={{ padding: "12px" }}><span className="pill pill-green">{a.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
