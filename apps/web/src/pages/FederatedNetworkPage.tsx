import { motion } from "framer-motion";
import { Globe, Shield } from "lucide-react";
import { MetricKPI } from "../components/MetricKPI";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from "recharts";

const budgetData = [
  { org: "FairView",  epsilon: 0.42 },
  { org: "EquiLend",  epsilon: 0.38 },
  { org: "CreditSAP", epsilon: 0.51 },
  { org: "InsureRgt", epsilon: 0.29 },
  { org: "HealthAI",  epsilon: 0.44 },
];


const nodes = [
  { id: "node-1", name: "FairView Finance", location: "New York", participants: 12, status: "active", x: 250, y: 135 },
  { id: "node-2", name: "EquiLend EU", location: "London", participants: 8, status: "active", x: 380, y: 120 },
  { id: "node-3", name: "CreditSafe APAC", location: "Singapore", participants: 5, status: "syncing", x: 600, y: 195 },
  { id: "node-4", name: "InsureRight AU", location: "Sydney", participants: 3, status: "active", x: 650, y: 270 },
  { id: "node-5", name: "HealthAI India", location: "Mumbai", participants: 7, status: "active", x: 550, y: 170 },
  { id: "node-6", name: "EduFair Brazil", location: "São Paulo", participants: 4, status: "active", x: 300, y: 280 },
];

export function FederatedNetworkPage() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Globe size={28} color="var(--cyan)" />
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Federated Network</h1>
          <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Cross-organisation collaborative fairness training with Differential Privacy</p>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <MetricKPI label="Participating Orgs" value={35} colour="blue" />
        <MetricKPI label="Completed Rounds" value={142} colour="green" />
        <MetricKPI label="Avg DI Improvement" value={8.4} unit="%" colour="cyan" decimals={1} />
        <MetricKPI label={<><span style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>ε</span> BUDGET REMAINING</>} value={3.2} colour="purple" decimals={1} />
      </div>

      {/* Map + Nodes */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
        <div className="nexus-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(59,130,246,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--font-display)" }}>Global Network Map</span>
            <span className="pill pill-green"><Shield size={10} /> DP Enabled</span>
          </div>
          <div style={{
            position: "relative", minHeight: 380,
            background: "radial-gradient(circle at 50% 50%, rgba(6,182,212,0.04) 0%, transparent 60%)",
          }}>
            <svg viewBox="0 0 800 400" width="100%" height="100%" style={{ display: "block" }}>
              <defs>
                <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                </radialGradient>
              </defs>
              {/* Grid lines */}
              {Array.from({ length: 9 }, (_, i) => (
                <line key={`h${i}`} x1="0" y1={i * 50} x2="800" y2={i * 50} stroke="rgba(59,130,246,0.04)" />
              ))}
              {Array.from({ length: 17 }, (_, i) => (
                <line key={`v${i}`} x1={i * 50} y1="0" x2={i * 50} y2="400" stroke="rgba(59,130,246,0.04)" />
              ))}
              {/* Concentric rings */}
              {[180, 120, 60].map((r, i) => (
                <ellipse key={r} cx="400" cy="200" rx={r * 2} ry={r} fill="none" stroke={`rgba(6,182,212,${0.06 - i * 0.015})`} strokeWidth="1" />
              ))}
              {/* Connection lines */}
              <style>{`
                @keyframes flow-to-hub {
                  from { stroke-dashoffset: 60; }
                  to { stroke-dashoffset: 0; }
                }
              `}</style>
              {nodes.map((node, i) => (
                <line 
                  key={`line-${node.id}`} 
                  x1={node.x} y1={node.y} 
                  x2="400" y2="200" 
                  stroke={node.status === 'syncing' ? 'rgba(245,158,11,0.30)' : 'rgba(6,182,212,0.35)'} 
                  strokeWidth={1} 
                  strokeDasharray="4 8"
                  style={{
                    animation: `flow-to-hub 2s linear infinite`,
                    animationDelay: `${i * 0.3}s`
                  }}
                />
              ))}
              {/* Hub */}
              <circle cx="400" cy="200" r="40" fill="url(#hubGlow)" />
              <circle cx="400" cy="200" r="10" fill="#10B981">
                <animate attributeName="r" values="10;14;10" dur="3s" repeatCount="indefinite" />
              </circle>
              <text x="400" y="230" textAnchor="middle" fill="#10B981" fontSize="10" fontFamily="Space Mono" fontWeight="bold">NEXUS HUB</text>
              {/* Nodes */}
              {nodes.map((node, i) => (
                <g key={node.id}>
                  <circle cx={node.x} cy={node.y} r="16" fill="none" stroke={node.status === "active" ? "rgba(6,182,212,0.3)" : "rgba(245,158,11,0.3)"} strokeWidth="1">
                    <animate attributeName="r" values="12;22;12" dur="3s" repeatCount="indefinite" begin={`${i * 0.5}s`} />
                    <animate attributeName="opacity" values="1;0;1" dur="3s" repeatCount="indefinite" begin={`${i * 0.5}s`} />
                  </circle>
                  <circle cx={node.x} cy={node.y} r="6" fill={node.status === "active" ? "#06B6D4" : "#F59E0B"} />
                  <text x={node.x} y={node.y - 14} textAnchor="middle" fill="#94A3B8" fontSize="9" fontFamily="Space Grotesk">{node.location}</text>
                </g>
              ))}
            </svg>
          </div>
        </div>

        {/* Node List */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--font-display)", marginBottom: 12 }}>Active Nodes</div>
          {nodes.map((node, i) => (
            <motion.div
              key={node.id}
              className="nexus-card"
              style={{ marginBottom: 8, padding: 14 }}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ borderColor: "rgba(6,182,212,0.4)" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13, fontFamily: "var(--font-display)" }}>{node.name}</span>
                <span style={{
                  padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600,
                  background: node.status === "active" ? "var(--green-subtle)" : "var(--amber-subtle)",
                  color: node.status === "active" ? "var(--green)" : "var(--amber)",
                }}>
                  {node.status.toUpperCase()}
                </span>
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--text-dim)" }}>
                <span>📍 {node.location}</span>
                <span>👥 {node.participants} participants</span>
              </div>
              {/* Mini bar */}
              <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${60 + node.participants * 4}%` }} transition={{ delay: i * 0.1, duration: 0.6 }}
                  style={{ height: "100%", background: "var(--cyan)", borderRadius: 2 }} />
              </div>
            </motion.div>
          ))}

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--font-display)", marginBottom: 8 }}>Privacy Budget Usage — Current Round</div>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart layout="vertical" data={budgetData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <XAxis type="number" domain={[0, 1.2]} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                <YAxis dataKey="org" type="category" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={60} />
                <Tooltip contentStyle={{ background: "#0A1628", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8, fontSize: 11 }} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                <ReferenceLine x={1.0} stroke="rgba(239,68,68,0.5)" strokeDasharray="3 3" label={{ value: "Round limit", fill: "#EF4444", fontSize: 10, position: "insideTopLeft" }} />
                <Bar dataKey="epsilon" barSize={12} radius={[0, 4, 4, 0]}>
                  {budgetData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.epsilon > 0.8 ? "var(--red)" : entry.epsilon > 0.5 ? "var(--amber)" : "var(--green)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8 }}>
              All organisations within round budget limit (<span style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>ε</span> &lt; 1.0). Cumulative budget remaining: 3.2 <span style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>ε</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
