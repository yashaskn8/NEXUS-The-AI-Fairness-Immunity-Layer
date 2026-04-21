import { motion } from "framer-motion";
import reactCountUp from "react-countup";
const CountUp = (reactCountUp as any).default || reactCountUp;
import {
  XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from "recharts";
import { SeverityBadge } from "../components/SeverityBadge";
import { InterceptTicker } from "../components/InterceptTicker";
import { SkeletonCard } from "../components/SkeletonCard";
import { InsightCard, type InsightData } from "../components/InsightCard";
import { MetricKPI } from "../components/MetricKPI";
import { Activity, Zap, Bell } from "lucide-react";
import { useInterceptFeed } from "../hooks/useInterceptFeed";
import { useCollection, orderBy, limit } from "../hooks/useCollection";
import { useNavigate } from "react-router-dom";
import { normaliseInsight } from "../utils/normalise";

const ORG_ID = "demo-org";

// Fallback insights for demo
const FALLBACK_INSIGHTS: InsightData[] = [
  { insight_id: "fi-1", severity: "critical", headline: "Gender bias spike in hiring pipeline", summary: "ResumeScanner_NLP shows Disparate Impact of 0.67, below EEOC threshold. Threshold Autopilot activated. 47 decisions corrected in the past hour.", insight_type: "bias_detection", created_at_ms: Date.now() },
  { insight_id: "fi-2", severity: "info", headline: "Federated round 142 completed", summary: "35 organisations contributed differentially private gradients. Average DI improvement: 8.4% across the network.", insight_type: "compliance_alert", created_at_ms: Date.now() - 3600000 },
  { insight_id: "fi-3", severity: "info", headline: "EU AI Act threshold update applied", summary: "Regulatory Intelligence detected updated guidance. Credit domain DI threshold raised from 0.82 to 0.85.", insight_type: "regulatory_update", created_at_ms: Date.now() - 7200000 },
  { insight_id: "fi-4", severity: "warning", headline: "Bias drift forecast: CreditRisk-v2", summary: "Prophet model projects 73% probability of DI violation in 9 days. Monitoring frequency increased to 60 seconds.", insight_type: "bias_detection", created_at_ms: Date.now() - 14400000 },
];

// Fallback fleet data
const FLEET_MODELS = [
  { model_id: "hiring-v1", domain: "hiring", severity: "critical", last_event_ms: Date.now() - 5000 },
  { model_id: "credit-v2", domain: "credit", severity: "warning", last_event_ms: Date.now() - 30000 },
  { model_id: "healthcare-v1", domain: "healthcare", severity: "ok", last_event_ms: Date.now() - 90000 },
];

const domainColors: Record<string, string> = { hiring: "#3B82F6", credit: "#10B981", healthcare: "#06B6D4" };

export function CommandCentrePage() {
  const navigate = useNavigate();
  const { events, loading: eventsLoading } = useInterceptFeed(ORG_ID);

  const { data: rawInsightsData } = useCollection<Record<string, unknown>>(
    `orgs/${ORG_ID}/global_insights`, orderBy("created_at_ms", "desc"), limit(10)
  );

  // FIX 4: Deduplicate insights by headline
  const rawInsights: InsightData[] = rawInsightsData.length > 0
    ? rawInsightsData.map((r) => normaliseInsight(r) as unknown as InsightData).filter((i) => i.headline)
    : FALLBACK_INSIGHTS;
  const insights = rawInsights.filter(
    (insight, index, self) => index === self.findIndex(i => i.headline === insight.headline)
  ).slice(0, 4);

  const interceptedToday = events.filter((e) => e.was_intercepted).length;
  const totalToday = events.length;
  const avgLatency = events.length
    ? Math.round(events.reduce((s, e) => s + (e.latency_ms || 0), 0) / events.length)
    : 0;

  // Build DI chart data
  const chartData = Array.from({ length: 12 }, (_, i) => ({
    time: new Date(Date.now() - (11 - i) * 300000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    value: +(0.65 + Math.sin(i * 0.5) * 0.12 + Math.random() * 0.05).toFixed(3),
  }));

  // Fleet health score
  const fleetScore = 82;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 12 }}>
            <Activity className="glow-text" size={28} color="var(--blue-400)" />
            Command Centre
          </h1>
          <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Global viewport for real-time fairness monitoring</p>
        </div>
      </div>

      {/* 3-Column Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 300px", gap: 16, marginBottom: 24 }}>
        {/* LEFT — Model Fleet */}
        <div style={{ minWidth: 0, overflow: "visible" }}>
          <div className="nexus-card" style={{ marginBottom: 12, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Fleet Health Score</div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 48, fontWeight: 700,
              color: fleetScore >= 90 ? "var(--green)" : fleetScore >= 75 ? "var(--amber)" : "var(--red)",
            }}>
              <CountUp end={fleetScore} duration={1.5} />
            </div>
          </div>

          {FLEET_MODELS.map((m) => (
            <motion.div
              key={m.model_id}
              whileHover={{ borderColor: "rgba(59,130,246,0.5)" }}
              onClick={() => navigate(`/models/${m.model_id}`)}
              style={{
                marginBottom: 8, padding: 14, cursor: "pointer",
                background: "var(--bg-elevated)", borderRadius: "var(--radius-md)",
                borderLeft: `3px solid ${m.severity === "critical" ? "var(--red)" : m.severity === "warning" ? "var(--amber)" : "var(--green)"}`,
                border: "1px solid rgba(59,130,246,0.10)",
                transition: "all 0.15s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
                  {m.severity === "critical" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--red)", animation: "pulse-dot 1.5s infinite", flexShrink: 0 }} />}
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.model_id}</span>
                </div>
                <SeverityBadge severity={m.severity} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: `${domainColors[m.domain] ?? "#3B82F6"}18`, color: domainColors[m.domain] ?? "#3B82F6" }}>
                  {m.domain}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
                  {Math.round((Date.now() - m.last_event_ms) / 1000)}s ago
                </span>
              </div>
              <div style={{ display: "flex", gap: 3 }}>
                {["DI", "DP", "EO", "PP", "IF"].map((_, j) => (
                  <div key={j} style={{
                    flex: 1, height: 4, borderRadius: 2,
                    background: m.severity === "critical" && j < 2 ? "var(--red)" : m.severity === "warning" && j === 0 ? "var(--amber)" : "var(--green)",
                  }} />
                ))}
              </div>
            </motion.div>
          ))}

          <button className="nexus-btn-outline" style={{ width: "100%", marginTop: 8 }}>
            Register Model
          </button>
        </div>

        {/* CENTRE — Live Activity */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Intercept Counter */}
          <div className="nexus-card" style={{ textAlign: "center", padding: "24px" }}>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>Decisions Intercepted Today</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 64, fontWeight: 700, color: "var(--blue-400)", lineHeight: 1 }}>
              <CountUp end={interceptedToday} duration={1.5} />
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>
              of {totalToday} total | {avgLatency}ms avg latency
            </div>
          </div>

          {/* DI Chart */}
          <div className="nexus-card" style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--font-display)", marginBottom: 12 }}>Fleet Disparate Impact</div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="diGradCC" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0.5, 1.1]} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#0A1628", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 10, fontFamily: "var(--font-mono)", fontSize: 12 }} />
                <ReferenceLine y={0.8} stroke="var(--amber)" strokeDasharray="5 5" label={{ value: "EEOC 0.80", fill: "#F59E0B", fontSize: 10, position: "right" }} />
                <Area type="monotone" dataKey="value" stroke="#3B82F6" fill="url(#diGradCC)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Ticker */}
          {eventsLoading ? <SkeletonCard height="300px" /> : <InterceptTicker events={events} />}
        </div>

        {/* RIGHT — AI Conscience Feed */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--font-display)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <Zap size={14} color="var(--amber)" /> AI Conscience Feed
          </div>
          {insights.length === 0 ? (
            <div className="nexus-card" style={{ textAlign: "center", padding: 40 }}>
              <Bell size={32} color="var(--text-dim)" style={{ marginBottom: 8 }} />
              <div style={{ color: "var(--text-dim)", fontSize: 13 }}>No insights yet.</div>
            </div>
          ) : (
            insights.map((insight, i) => (
              <InsightCard key={insight.insight_id || i} insight={insight} index={i} />
            ))
          )}
        </div>
      </div>

      {/* Bottom KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <MetricKPI label="Total Decisions" value={totalToday} colour="blue" />
        <MetricKPI label="Critical Violations" value={3} colour="red" />
        <MetricKPI label="Avg Fleet DI" value={0.74} colour="amber" decimals={2} />
        <MetricKPI label="Active Nodes" value={35} colour="green" />
      </div>
    </div>
  );
}
