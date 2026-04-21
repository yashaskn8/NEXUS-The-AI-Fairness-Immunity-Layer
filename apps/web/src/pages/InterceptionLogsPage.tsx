import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { List, Filter, Search, Zap, CheckCircle } from "lucide-react";
import { useInterceptFeed } from "../hooks/useInterceptFeed";
import { formatRelTime } from "../utils/format";
import { MetricKPI } from "../components/MetricKPI";
import { SkeletonCard } from "../components/SkeletonCard";

const ORG_ID = "demo-org";

const domainColor: Record<string, string> = {
  hiring: "#3B82F6", credit: "#10B981", healthcare: "#06B6D4", legal: "#A78BFA", insurance: "#F59E0B",
};

export function InterceptionLogsPage() {
  const { events, loading } = useInterceptFeed(ORG_ID);
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [interceptedOnly, setInterceptedOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let res = events;
    if (search) res = res.filter(e => e.model_id.toLowerCase().includes(search.toLowerCase()) || e.domain?.toLowerCase().includes(search.toLowerCase()));
    if (domainFilter !== "all") res = res.filter(e => e.domain === domainFilter);
    if (interceptedOnly) res = res.filter(e => e.was_intercepted);
    return res;
  }, [events, search, domainFilter, interceptedOnly]);

  const intercepted = events.filter(e => e.was_intercepted).length;
  const passed = events.length - intercepted;
  const avgLatency = events.length ? Math.round(events.reduce((s, e) => s + (e.latency_ms || 0), 0) / events.length) : 0;
  const domains = [...new Set(events.map(e => e.domain).filter(Boolean))];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <List size={28} color="var(--blue-400)" />
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Interception Logs</h1>
          <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Complete audit trail of every decision processed by NEXUS</p>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <MetricKPI label="Total Decisions" value={events.length} colour="blue" />
        <MetricKPI label="Intercepted" value={intercepted} colour="amber" />
        <MetricKPI label="Passed" value={passed} colour="green" />
        <MetricKPI label="Avg Latency" value={avgLatency} unit="ms" colour="cyan" />
      </div>

      {/* Filters */}
      <div className="nexus-card" style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, padding: "12px 16px", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }} />
          <input
            type="text" placeholder="Search by model, domain..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%", padding: "8px 12px 8px 32px", borderRadius: "var(--radius-md)",
              background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)", fontSize: 13, outline: "none",
            }}
          />
        </div>
        <select
          value={domainFilter} onChange={e => setDomainFilter(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", fontSize: 13 }}>
          <option value="all">All Domains</option>
          {domains.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <button onClick={() => setInterceptedOnly(!interceptedOnly)}
          style={{
            padding: "8px 14px", borderRadius: "var(--radius-md)", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
            background: interceptedOnly ? "var(--amber-subtle)" : "transparent",
            border: interceptedOnly ? "1px solid var(--amber)" : "1px solid var(--border-subtle)",
            color: interceptedOnly ? "var(--amber)" : "var(--text-secondary)",
          }}>
          <Filter size={12} style={{ marginRight: 4 }} />
          Intercepted Only
        </button>
        <span style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{filtered.length} results</span>
      </div>

      {/* Log Table */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1,2,3,4,5].map(i => <SkeletonCard key={i} height="60px" />)}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {/* Header */}
          <div style={{
            display: "grid", gridTemplateColumns: "80px 120px 80px 200px 1fr 80px",
            gap: 8, padding: "8px 16px", background: "var(--bg-elevated)", borderRadius: "10px 10px 4px 4px",
            fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            <span>Time</span><span>Model</span><span>Domain</span><span>Original → Final</span><span>Reason</span><span>Latency</span>
          </div>

          {filtered.slice(0, 50).map((event, i) => {
            const isExpanded = expanded === event.event_id;
            return (
              <motion.div
                key={event.event_id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                onClick={() => setExpanded(isExpanded ? null : event.event_id)}
                style={{
                  display: "grid", gridTemplateColumns: "80px 120px 80px 200px 1fr 80px",
                  gap: 8, padding: "10px 16px", cursor: "pointer",
                  background: event.was_intercepted ? "rgba(245,158,11,0.03)" : "var(--bg-surface)",
                  borderLeft: event.was_intercepted ? "3px solid var(--amber)" : "3px solid transparent",
                  borderBottom: "1px solid rgba(255,255,255,0.03)",
                  borderRadius: i === filtered.length - 1 ? "4px 4px 10px 10px" : 4,
                  transition: "background 0.15s",
                  alignItems: "center",
                  fontSize: 13,
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)" }}>
                  {formatRelTime(event.timestamp_ms)}
                </span>
                <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {event.model_id}
                </span>
                <span style={{
                  padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                  background: `${domainColor[event.domain] ?? "#3B82F6"}18`,
                  color: domainColor[event.domain] ?? "#3B82F6",
                  display: "inline-block", width: "fit-content",
                }}>
                  {event.domain}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                  {event.was_intercepted ? <Zap size={12} color="var(--amber)" /> : <CheckCircle size={12} color="var(--green)" />}
                  <span style={{ color: "var(--text-dim)" }}>{event.original_decision}</span>
                  <span style={{ color: "var(--text-dim)" }}>→</span>
                  <span style={{ color: event.was_intercepted ? "var(--green)" : "var(--text-dim)" }}>{event.final_decision}</span>
                </span>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  {event.intervention_reason?.replace(/_/g, " ") ?? "—"}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)" }}>
                  {event.latency_ms}ms
                </span>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
