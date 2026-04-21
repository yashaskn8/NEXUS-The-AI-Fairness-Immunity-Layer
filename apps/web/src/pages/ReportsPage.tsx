import { motion } from "framer-motion";
import { FileText, Download, Clock, Shield, BarChart3, AlertTriangle, Scale, CheckCircle } from "lucide-react";

const mockReports = [
  { id: "rpt-1", title: "Q1 2026 Fairness Audit — Hiring Models", type: "compliance", generated: Date.now() - 86400000, pages: 24, status: "complete", icon: Shield },
  { id: "rpt-2", title: "Disparate Impact Analysis — Credit Scoring", type: "analysis", generated: Date.now() - 172800000, pages: 18, status: "complete", icon: BarChart3 },
  { id: "rpt-3", title: "Regulatory Compliance — EU AI Act", type: "regulatory", generated: Date.now() - 259200000, pages: 32, status: "complete", icon: Scale },
  { id: "rpt-4", title: "Omega Adversarial Stress Test Report", type: "stress_test", generated: Date.now() - 345600000, pages: 15, status: "complete", icon: AlertTriangle },
  { id: "rpt-5", title: "NYC Local Law 144 AEDT Annual Audit", type: "compliance", generated: Date.now() - 432000000, pages: 28, status: "complete", icon: CheckCircle },
  { id: "rpt-6", title: "Bias Drift Forecast — Healthcare Triage", type: "analysis", generated: Date.now() - 518400000, pages: 12, status: "complete", icon: BarChart3 },
];

const typeConfig: Record<string, { color: string; bg: string }> = {
  compliance: { color: "#3B82F6", bg: "rgba(59,130,246,0.08)" },
  analysis: { color: "#10B981", bg: "rgba(16,185,129,0.08)" },
  regulatory: { color: "#A78BFA", bg: "rgba(167,139,250,0.08)" },
  stress_test: { color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
};

export function ReportsPage() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <FileText size={28} color="var(--blue-400)" />
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700 }}>Reports</h1>
            <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Auto-generated compliance and analysis reports</p>
          </div>
        </div>
        <button className="nexus-btn" style={{ background: "linear-gradient(135deg, #2563EB, #7C3AED)" }}>
          <FileText size={14} style={{ marginRight: 6 }} />
          Generate New Report
        </button>
      </div>

      {/* Category filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["All", "Compliance", "Analysis", "Regulatory", "Stress Test"].map((cat) => (
          <button key={cat} style={{
            padding: "6px 14px", borderRadius: "var(--radius-md)", fontSize: 12, fontWeight: 500, cursor: "pointer",
            border: "1px solid var(--border-subtle)", background: cat === "All" ? "var(--blue-500)" : "transparent",
            color: cat === "All" ? "white" : "var(--text-secondary)", transition: "all 0.15s",
          }}>
            {cat}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {mockReports.map((report, i) => {
          const tc = typeConfig[report.type] ?? typeConfig.compliance!;
          const ReportIcon = report.icon;
          return (
            <motion.div
              key={report.id}
              className="nexus-card"
              style={{ cursor: "pointer", position: "relative", overflow: "hidden" }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ borderColor: `${tc.color}60` }}
            >
              {/* Gradient accent */}
              <div style={{ position: "absolute", top: 0, right: 0, width: 120, height: 120, background: `radial-gradient(circle at top right, ${tc.bg}, transparent)`, pointerEvents: "none" }} />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: tc.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ReportIcon size={16} color={tc.color} />
                    </div>
                    <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: tc.bg, color: tc.color }}>
                      {report.type.replace(/_/g, " ").toUpperCase()}
                    </span>
                  </div>
                  <h3 style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-display)", marginBottom: 10, lineHeight: 1.3, color: "rgba(255,255,255,0.90)" }}>
                    {report.title}
                  </h3>
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-dim)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Clock size={12} /> {new Date(report.generated).toLocaleDateString()}
                    </span>
                    <span>{report.pages} pages</span>
                    <span className="pill pill-green" style={{ fontSize: 9 }}>COMPLETE</span>
                  </div>
                </div>
                <button
                  className="nexus-btn-outline"
                  style={{ padding: "8px 12px", flexShrink: 0 }}
                  onClick={(e) => { e.stopPropagation(); }}
                >
                  <Download size={14} />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
