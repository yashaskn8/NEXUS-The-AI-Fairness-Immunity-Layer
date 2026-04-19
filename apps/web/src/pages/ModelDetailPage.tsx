import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";
import { motion } from "framer-motion";
import { useRealtimeMetrics } from "../hooks/useRealtimeMetrics";
import { CausalGraphViewer } from "../components/CausalGraphViewer";
import { SeverityBadge } from "../components/SeverityBadge";
import { SkeletonCard } from "../components/SkeletonCard";

const ORG_ID = "demo-org";

const tabs = ["Live Metrics", "Causal Graph", "Threshold Autopilot", "Simulator", "Bias Forecast", "Stress Test"] as const;

export function ModelDetailPage() {
  const { modelId } = useParams<{ modelId: string }>();
  const [activeTab, setActiveTab] = useState<typeof tabs[number]>("Live Metrics");
  const [window, setWindow] = useState<"1m" | "5m" | "1h" | "24h">("1h");
  const { metrics, loading } = useRealtimeMetrics(ORG_ID, modelId || "", window);

  const metricNames = ["disparate_impact", "demographic_parity", "equalized_odds", "predictive_parity", "individual_fairness"];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Model: {modelId}</h1>
      </div>

      {/* Tab Nav */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid var(--border-glow)", paddingBottom: 0 }}>
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: activeTab === tab ? "var(--accent-blue)" : "transparent",
              color: activeTab === tab ? "#fff" : "var(--text-secondary)",
              border: "none",
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              borderRadius: "8px 8px 0 0",
              transition: "all 0.15s",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* TAB 1: Live Metrics */}
      {activeTab === "Live Metrics" && (
        <div>
          {/* Window selector */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {(["1m", "5m", "1h", "24h"] as const).map((w) => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                className={window === w ? "nexus-btn" : "nexus-btn-outline"}
                style={{ padding: "6px 14px", fontSize: 12 }}
              >
                {w}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} height="220px" />)}
            </div>
          ) : metrics.length === 0 ? (
            <div className="nexus-card" style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}>
              Waiting for events…
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {metricNames.map((name) => {
                const filtered = metrics
                  .filter((m) => m.metric_name === name)
                  .reverse();
                const chartData = filtered.map((m, i) => ({
                  idx: i,
                  value: m.value,
                  time: new Date(m.computed_at_ms).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
                }));
                const isViolated = filtered.some((m) => m.is_violated);
                const threshold = filtered[0]?.threshold ?? 0.8;

                return (
                  <motion.div
                    key={name}
                    className="nexus-card"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{name.replace(/_/g, " ").toUpperCase()}</span>
                      <SeverityBadge severity={isViolated ? "critical" : "ok"} />
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id={`grad-${name}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={isViolated ? "#EF4444" : "#10B981"} stopOpacity={0.2} />
                            <stop offset="100%" stopColor={isViolated ? "#EF4444" : "#10B981"} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                        <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#64748B" }} />
                        <YAxis domain={[0, 1.2]} tick={{ fontSize: 9, fill: "#64748B" }} />
                        <Tooltip contentStyle={{ background: "#0D1628", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8 }} />
                        <ReferenceLine y={threshold} stroke="#EF4444" strokeDasharray="5 5" />
                        <Area type="monotone" dataKey="value" stroke={isViolated ? "#EF4444" : "#10B981"} fill={`url(#grad-${name})`} strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Causal Graph */}
      {activeTab === "Causal Graph" && (
        <div className="nexus-card">
          <CausalGraphViewer graphData={null} onNodeSelect={(n) => console.log("Selected:", n)} />
        </div>
      )}

      {/* TAB 3: Threshold Autopilot */}
      {activeTab === "Threshold Autopilot" && (
        <div className="nexus-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ fontSize: 16 }}>Threshold Autopilot</h3>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Autopilot</span>
              <input type="checkbox" defaultChecked style={{ width: 40, height: 20 }} />
            </label>
          </div>
          <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            When autopilot is enabled, NEXUS dynamically adjusts per-group decision thresholds to maintain compliance with EEOC's four-fifths rule.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
            {["Male", "Female", "White", "Black", "Hispanic", "Asian"].map((group) => (
              <div key={group} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 13, minWidth: 70 }}>{group}</span>
                <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${60 + Math.random() * 30}%`, background: "var(--accent-blue)", borderRadius: 4, transition: "width 0.3s" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: Simulator */}
      {activeTab === "Simulator" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div className="nexus-card">
            <h3 style={{ fontSize: 16, marginBottom: 16 }}>Feature Inputs</h3>
            {["years_exp", "gpa", "skills_score", "interview_score"].map((feat) => (
              <div key={feat} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{feat}</label>
                <input type="range" min="0" max="100" defaultValue="50" style={{ width: "100%" }} />
              </div>
            ))}
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Protected Attribute Override</label>
              <select style={{ width: "100%", padding: 8, background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border-glow)", borderRadius: "var(--radius)" }}>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <button className="nexus-btn" style={{ marginTop: 16, width: "100%" }}>Run Simulation</button>
          </div>
          <div className="nexus-card" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)" }}>
            Run a simulation to see counterfactual results here.
          </div>
        </div>
      )}

      {/* TAB 5: Bias Forecast */}
      {activeTab === "Bias Forecast" && (
        <div className="nexus-card" style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}>
          Forecast data will appear here once sufficient time-series data is available.
        </div>
      )}

      {/* TAB 6: Stress Test */}
      {activeTab === "Stress Test" && (
        <div className="nexus-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ fontSize: 16 }}>Stress Test Report</h3>
            <button className="nexus-btn">Run Stress Test</button>
          </div>
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}>
            No stress test run. Click 'Run Stress Test' to begin.
          </div>
        </div>
      )}
    </div>
  );
}
