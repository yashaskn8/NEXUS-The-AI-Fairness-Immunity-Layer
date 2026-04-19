import { motion } from "framer-motion";
import { Globe, Users, Zap, TrendingUp } from "lucide-react";
import reactCountUp from "react-countup";
const CountUp = (reactCountUp as any).default || reactCountUp;
const mockFederatedNodes = [
  { id: "node-1", name: "FairView Finance", location: "New York", participants: 12, lastRound: Date.now() - 120000, status: "active" },
  { id: "node-2", name: "EquiLend EU", location: "London", participants: 8, lastRound: Date.now() - 300000, status: "active" },
  { id: "node-3", name: "CreditSafe APAC", location: "Singapore", participants: 5, lastRound: Date.now() - 600000, status: "syncing" },
  { id: "node-4", name: "InsureRight AU", location: "Sydney", participants: 3, lastRound: Date.now() - 1200000, status: "active" },
  { id: "node-5", name: "HealthAI India", location: "Mumbai", participants: 7, lastRound: Date.now() - 180000, status: "active" },
];

export function FederatedNetworkPage() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Globe size={28} color="var(--accent-blue)" />
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Federated Network</h1>
          <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Cross-org collaborative fairness training with Differential Privacy</p>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { icon: Users, label: "Participating Orgs", value: 35 },
          { icon: Zap, label: "Completed Rounds", value: 142 },
          { icon: TrendingUp, label: "Avg DI Improvement", value: 8.4, suffix: "%" },
          { icon: Globe, label: "ε Budget Remaining", value: 3.2 },
        ].map((stat) => (
          <div key={stat.label} className="nexus-card" style={{ textAlign: "center" }}>
            <stat.icon size={24} color="var(--accent-blue)" style={{ marginBottom: 8 }} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 700 }}>
              <CountUp end={stat.value} duration={1.2} decimals={stat.suffix ? 1 : 0} suffix={stat.suffix || ""} />
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* World Map Placeholder + Node List */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
        <div className="nexus-card" style={{ position: "relative", minHeight: 400 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Global Network Map</div>
          <div
            style={{
              height: 350,
              background: "radial-gradient(circle at 50% 50%, rgba(59,130,246,0.05) 0%, transparent 60%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--radius)",
            }}
          >
            {/* SVG world map with node dots */}
            <svg viewBox="0 0 800 400" width="100%" height="100%">
              {/* Simplified continents */}
              <ellipse cx="400" cy="200" rx="360" ry="180" fill="none" stroke="rgba(59,130,246,0.1)" strokeWidth="1" />
              <ellipse cx="400" cy="200" rx="240" ry="120" fill="none" stroke="rgba(59,130,246,0.06)" strokeWidth="1" />
              <ellipse cx="400" cy="200" rx="120" ry="60" fill="none" stroke="rgba(59,130,246,0.04)" strokeWidth="1" />
              {/* Node positions */}
              {[
                { x: 250, y: 135, label: "NYC" },
                { x: 380, y: 120, label: "London" },
                { x: 600, y: 195, label: "Singapore" },
                { x: 650, y: 270, label: "Sydney" },
                { x: 550, y: 170, label: "Mumbai" },
              ].map((node, i) => (
                <g key={i}>
                  {/* Pulse ring */}
                  <circle cx={node.x} cy={node.y} r="12" fill="none" stroke="rgba(59,130,246,0.3)" strokeWidth="1">
                    <animate attributeName="r" values="8;20;8" dur="3s" repeatCount="indefinite" begin={`${i * 0.6}s`} />
                    <animate attributeName="opacity" values="1;0;1" dur="3s" repeatCount="indefinite" begin={`${i * 0.6}s`} />
                  </circle>
                  <circle cx={node.x} cy={node.y} r="5" fill="#3B82F6" />
                  <text x={node.x} y={node.y - 12} textAnchor="middle" fill="#94A3B8" fontSize="10">{node.label}</text>
                  {/* Connection lines to center */}
                  <line x1={node.x} y1={node.y} x2="400" y2="200" stroke="rgba(59,130,246,0.08)" strokeWidth="1" strokeDasharray="4 4" />
                </g>
              ))}
              {/* Center hub */}
              <circle cx="400" cy="200" r="8" fill="#10B981" />
              <text x="400" y="185" textAnchor="middle" fill="#10B981" fontSize="10" fontWeight="bold">HUB</text>
            </svg>
          </div>
        </div>

        {/* Node List */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Active Nodes</div>
          {mockFederatedNodes.map((node, i) => (
            <motion.div
              key={node.id}
              className="nexus-card"
              style={{ marginBottom: 8, padding: 14 }}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontWeight: 500, fontSize: 13 }}>{node.name}</span>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 10,
                    fontSize: 10,
                    fontWeight: 600,
                    background: node.status === "active" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
                    color: node.status === "active" ? "#10B981" : "#F59E0B",
                  }}
                >
                  {node.status.toUpperCase()}
                </span>
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--text-dim)" }}>
                <span>📍 {node.location}</span>
                <span>👥 {node.participants}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
