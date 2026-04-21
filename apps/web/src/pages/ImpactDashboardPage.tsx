import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Heart, Users, Shield, TrendingUp, CheckCircle } from "lucide-react";
import { MetricKPI } from "../components/MetricKPI";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line } from "recharts";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import reactCountUp from "react-countup";
const CountUp = (reactCountUp as any).default || reactCountUp;

const ORG_ID = "demo-org";

const impactPie = [
  { name: "Approved → Approved", value: 67, color: "#10B981" },
  { name: "Rejected → Approved (Corrected)", value: 22, color: "#3B82F6" },
  { name: "Approved → Rejected (Corrected)", value: 3, color: "#F59E0B" },
  { name: "Unaffected", value: 8, color: "#334155" },
];

const domainImpact = [
  { domain: "Hiring", corrected: 47, total: 120, color: "#3B82F6" },
  { domain: "Credit", corrected: 23, total: 95, color: "#10B981" },
  { domain: "Healthcare", corrected: 12, total: 80, color: "#06B6D4" },
  { domain: "Insurance", corrected: 8, total: 45, color: "#F59E0B" },
];

const cumulativeImpact = Array.from({ length: 30 }, (_, i) => ({
  day: `Day ${i + 1}`,
  lives: Math.floor(12 + i * 3.2 + Math.sin(i * 0.5) * 4),
}));

const testimonials = [
  { name: "Maria Gonzalez", domain: "Credit", quote: "After NEXUS intercepted, my loan application was reconsidered and approved. The AI had unfairly weighted my zip code.", impact: "Loan Approved" },
  { name: "James Okafor", domain: "Hiring", quote: "My resume was previously filtered out. NEXUS detected the career gap bias and ensured fair evaluation.", impact: "Interview Granted" },
  { name: "Priya Sharma", domain: "Healthcare", quote: "The triage system initially deprioritized my case. NEXUS detected demographic bias and escalated appropriately.", impact: "Priority Raised" },
];

export function ImpactDashboardPage() {
  // MICRO 4: Live counter that increments when new intercepts arrive
  const [livesProtected, setLivesProtected] = useState(1247);
  const hasInitialized = useRef(false);

  useEffect(() => {
    const q = query(
      collection(db, `orgs/${ORG_ID}/intercept_log`),
      orderBy("timestamp_ms", "desc"),
      limit(1)
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!hasInitialized.current) {
        hasInitialized.current = true;
        return; // Skip initial snapshot
      }
      snap.docChanges().forEach(change => {
        if (change.type === "added") {
          setLivesProtected(prev => prev + 1);
        }
      });
    });
    return unsub;
  }, []);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Heart size={28} color="var(--red-bright)" />
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Impact Dashboard</h1>
          <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Real lives protected by NEXUS fairness interventions</p>
        </div>
      </div>

      {/* Hero Counter */}
      <motion.div className="nexus-card" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{
          textAlign: "center", padding: "40px 20px", marginBottom: 24,
          background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08), rgba(16,185,129,0.08))",
          borderTop: "2px solid var(--blue-400)",
        }}>
        <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>Total Lives Positively Impacted</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 84, fontWeight: 700, lineHeight: 1 }}>
          <span style={{ background: "linear-gradient(135deg, #3B82F6, #A78BFA, #10B981)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            <CountUp end={livesProtected} duration={0.5} separator="," preserveValue={true} />
          </span>
        </div>
        <div style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 12, display: "flex", justifyContent: "center", gap: 24 }}>
          <span><Shield size={14} style={{ verticalAlign: "middle" }} /> Protected from bias</span>
          <span><CheckCircle size={14} style={{ verticalAlign: "middle" }} /> Decisions corrected</span>
          <span><TrendingUp size={14} style={{ verticalAlign: "middle" }} /> Ongoing monitoring</span>
        </div>
      </motion.div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <MetricKPI label="Decisions Corrected" value={90} colour="blue" trend="up" trendValue="+12 today" />
        <MetricKPI label="Active Models" value={3} colour="green" />
        <MetricKPI label="Avg Response" value={87} unit="ms" colour="cyan" />
        <MetricKPI label="Compliance Score" value={96} unit="%" colour="purple" />
      </div>

      {/* 3-Column: Pie + Domain Bars + Cumulative */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* Pie */}
        <div className="nexus-card">
          <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--font-display)", marginBottom: 12 }}>Decision Outcomes</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={impactPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
                {impactPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#0A1628", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 8 }}>
            {impactPie.map(p => (
              <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text-secondary)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.color }} />
                {p.name.length > 20 ? p.name.slice(0, 20) + "…" : p.name}
              </div>
            ))}
          </div>
        </div>

        {/* Domain Bars */}
        <div className="nexus-card">
          <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--font-display)", marginBottom: 12 }}>Impact by Domain</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={domainImpact} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} />
              <YAxis type="category" dataKey="domain" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} width={80} />
              <Tooltip contentStyle={{ background: "#0A1628", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="corrected" radius={[0, 4, 4, 0]} fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Cumulative */}
        <div className="nexus-card">
          <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--font-display)", marginBottom: 12 }}>Cumulative Lives Protected</div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={cumulativeImpact}>
              <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#64748B" }} interval={4} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} />
              <Tooltip contentStyle={{ background: "#0A1628", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="lives" stroke="#10B981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Human Stories */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "var(--font-display)", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Users size={18} color="var(--blue-400)" /> Human Stories
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {testimonials.map((t, i) => (
            <motion.div key={i} className="nexus-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
              style={{ borderLeft: "3px solid var(--blue-500)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 14, fontFamily: "var(--font-display)" }}>{t.name}</span>
                <span className="pill pill-green">{t.impact}</span>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, fontStyle: "italic" }}>"{t.quote}"</p>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-dim)" }}>Domain: {t.domain}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
