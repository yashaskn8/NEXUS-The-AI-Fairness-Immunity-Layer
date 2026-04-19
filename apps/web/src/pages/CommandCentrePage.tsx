import { motion } from "framer-motion";
import reactCountUp from "react-countup";
const CountUp = (reactCountUp as any).default || reactCountUp;
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from "recharts";
import { SeverityBadge } from "../components/SeverityBadge";
import { InterceptTicker } from "../components/InterceptTicker";
import { SkeletonCard } from "../components/SkeletonCard";
import { useInterceptFeed } from "../hooks/useInterceptFeed";
import { useCollection } from "../hooks/useCollection";
import { orderBy, limit } from "firebase/firestore";
import type { FairnessMetric, GlobalInsight } from "../types/nexus";

const ORG_ID = "demo-org";

export function CommandCentrePage() {
  const { events, loading: eventsLoading } = useInterceptFeed(ORG_ID);
  const { data: metrics, loading: metricsLoading } = useCollection<FairnessMetric>(
    `orgs/${ORG_ID}/fairness_metrics`,
    orderBy("computed_at_ms", "desc"),
    limit(60)
  );
  const { data: insights, loading: insightsLoading } = useCollection<GlobalInsight>(
    `orgs/${ORG_ID}/global_insights`,
    orderBy("created_at_ms", "desc"),
    limit(10)
  );

  const interceptedToday = events.filter((e) => e.was_intercepted).length;
  const totalToday = events.length;
  const avgLatency = events.length
    ? Math.round(events.reduce((s, e) => s + (e.latency_ms || 0), 0) / events.length)
    : 0;

  // Build chart data from metrics (DI over time)
  const diMetrics = metrics
    .filter((m) => m.metric_name === "disparate_impact")
    .reverse();

  const chartData = diMetrics.map((m, i) => ({
    idx: i,
    time: new Date(m.computed_at_ms).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    value: m.value,
  }));

  const noData = metrics.length === 0 && !metricsLoading;

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Command Centre</h1>
      <p style={{ color: "var(--text-dim)", marginBottom: 24 }}>Real-time fairness monitoring</p>

      {noData && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="nexus-card"
          style={{ marginBottom: 20, borderLeftColor: "var(--accent-amber)", borderLeftWidth: 3, padding: 16 }}
        >
          <span style={{ color: "var(--accent-amber)", fontWeight: 600 }}>No data yet</span>
          <span style={{ color: "var(--text-secondary)", marginLeft: 8 }}>
            Run: <code style={{ fontFamily: "var(--font-mono)" }}>python scripts/seed_hiring_bias.py</code>
          </span>
        </motion.div>
      )}

      {/* 3-Column Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* LEFT — Model Fleet */}
        <div>
          <div className="nexus-card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>Fleet Health Score</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 36, fontWeight: 700, color: "var(--accent-green)" }}>
              <CountUp end={noData ? 0 : 82} duration={1.5} />
            </div>
          </div>
          {metricsLoading ? (
            <>
              <SkeletonCard height="80px" />
              <div style={{ height: 8 }} />
              <SkeletonCard height="80px" />
            </>
          ) : (
            diMetrics.slice(0, 5).map((m, i) => (
              <motion.div
                key={m.metric_id || i}
                className="nexus-card"
                style={{ marginBottom: 8, padding: 14, cursor: "pointer" }}
                whileHover={{ scale: 1.02 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{m.model_id}</span>
                  <SeverityBadge severity={m.severity as "ok" | "critical"} />
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                  {["#10B981", m.is_violated ? "#EF4444" : "#10B981", "#10B981", "#F59E0B", "#10B981"].map((c, j) => (
                    <div key={j} style={{ flex: 1, height: 4, borderRadius: 2, background: c }} />
                  ))}
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* CENTRE — Live Activity */}
        <div>
          <div className="nexus-card" style={{ marginBottom: 16, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Decisions Intercepted Today</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 48, fontWeight: 700, color: "var(--accent-blue)" }}>
              <CountUp end={interceptedToday} duration={1.5} />
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              of {totalToday} total | {avgLatency}ms avg
            </div>
          </div>

          {/* DI Chart */}
          <div className="nexus-card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Fleet Disparate Impact</div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="diGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#64748B" }} />
                  <YAxis domain={[0.5, 1.1]} tick={{ fontSize: 10, fill: "#64748B" }} />
                  <Tooltip
                    contentStyle={{ background: "#0D1628", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8 }}
                    labelStyle={{ color: "#94A3B8" }}
                  />
                  <ReferenceLine y={0.8} stroke="#EF4444" strokeDasharray="5 5" label={{ value: "EEOC 0.80", fill: "#EF4444", fontSize: 10 }} />
                  <Area type="monotone" dataKey="value" stroke="#10B981" fill="url(#diGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)" }}>
                Waiting for metric data...
              </div>
            )}
          </div>

          {/* Intercept Ticker */}
          {eventsLoading ? <SkeletonCard height="400px" /> : <InterceptTicker events={events} />}
        </div>

        {/* RIGHT — AI Conscience Feed */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>AI Conscience Feed</div>
          {insightsLoading ? (
            <SkeletonCard height="300px" />
          ) : insights.length === 0 ? (
            <div className="nexus-card" style={{ color: "var(--text-dim)", fontSize: 13 }}>
              No insights yet.
            </div>
          ) : (
            insights.map((insight, i) => (
              <motion.div
                key={insight.insight_id || i}
                className="nexus-card"
                style={{ marginBottom: 8, padding: 14 }}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{
                    fontSize: 14,
                    color: insight.severity === "critical" ? "var(--accent-red)"
                      : insight.severity === "high" ? "var(--accent-amber)"
                      : "var(--accent-blue)",
                  }}>
                    {insight.severity === "critical" ? "🔔" : insight.severity === "high" ? "⚠️" : "ℹ️"}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{insight.headline}</span>
                </div>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {insight.summary}
                </p>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Bottom KPI Bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {[
          { label: "Total Decisions Today", value: totalToday },
          { label: "Models With Violations", value: metrics.filter((m) => m.is_violated).length },
          { label: "Avg Fleet DI", value: diMetrics.length ? +(diMetrics.reduce((s, m) => s + m.value, 0) / diMetrics.length).toFixed(2) : 0 },
          { label: "Laws Monitored", value: 5 },
        ].map((kpi) => (
          <div key={kpi.label} className="nexus-card" style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 700 }}>
              <CountUp end={kpi.value} duration={1.2} decimals={kpi.label.includes("DI") ? 2 : 0} />
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>{kpi.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
