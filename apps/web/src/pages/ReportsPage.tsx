import { motion } from "framer-motion";
import { FileText, Download, Clock } from "lucide-react";

const mockReports = [
  { id: "rpt-1", title: "Q1 2026 Fairness Audit — Hiring Models", type: "compliance", generated: Date.now() - 86400000, pages: 24, status: "complete" },
  { id: "rpt-2", title: "Disparate Impact Analysis — Credit Scoring", type: "analysis", generated: Date.now() - 172800000, pages: 18, status: "complete" },
  { id: "rpt-3", title: "Regulatory Compliance — EU AI Act", type: "regulatory", generated: Date.now() - 259200000, pages: 32, status: "complete" },
  { id: "rpt-4", title: "Stress Test Report — Insurance Underwriting", type: "stress_test", generated: Date.now() - 345600000, pages: 15, status: "complete" },
];

const typeColor: Record<string, string> = {
  compliance: "#3B82F6",
  analysis: "#10B981",
  regulatory: "#A78BFA",
  stress_test: "#F59E0B",
};

export function ReportsPage() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <FileText size={28} color="var(--accent-blue)" />
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700 }}>Reports</h1>
            <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Auto-generated compliance and analysis reports</p>
          </div>
        </div>
        <button className="nexus-btn">Generate Report</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {mockReports.map((report, i) => (
          <motion.div
            key={report.id}
            className="nexus-card"
            style={{ cursor: "pointer" }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ scale: 1.01 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 600,
                    background: `${typeColor[report.type] ?? "#3B82F6"}22`,
                    color: typeColor[report.type] ?? "#3B82F6",
                    marginBottom: 8,
                  }}
                >
                  {report.type.replace(/_/g, " ").toUpperCase()}
                </span>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, lineHeight: 1.3 }}>{report.title}</h3>
                <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-dim)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock size={12} /> {new Date(report.generated).toLocaleDateString()}
                  </span>
                  <span>{report.pages} pages</span>
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
        ))}
      </div>
    </div>
  );
}
