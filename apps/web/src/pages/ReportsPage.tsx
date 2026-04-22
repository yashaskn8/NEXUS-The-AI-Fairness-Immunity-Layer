import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Download, Clock, Shield, BarChart3, AlertTriangle, Scale, CheckCircle } from "lucide-react";

const mockReports = [
  { id: "rpt-1", title: "Q1 2026 Fairness Audit — Hiring Models", type: "compliance", generated: Date.now() - 86400000, pages: 1, status: "complete", icon: Shield },
  { id: "rpt-2", title: "Disparate Impact Analysis — Credit Scoring", type: "analysis", generated: Date.now() - 172800000, pages: 1, status: "complete", icon: BarChart3 },
  { id: "rpt-3", title: "Regulatory Compliance — EU AI Act", type: "regulatory", generated: Date.now() - 259200000, pages: 1, status: "complete", icon: Scale },
  { id: "rpt-4", title: "Omega Adversarial Stress Test Report", type: "stress_test", generated: Date.now() - 345600000, pages: 1, status: "complete", icon: AlertTriangle },
  { id: "rpt-5", title: "NYC Local Law 144 AEDT Annual Audit", type: "compliance", generated: Date.now() - 432000000, pages: 1, status: "complete", icon: CheckCircle },
  { id: "rpt-6", title: "Bias Drift Forecast — Healthcare Triage", type: "analysis", generated: Date.now() - 518400000, pages: 1, status: "complete", icon: BarChart3 },
];

const typeConfig: Record<string, { color: string; bg: string }> = {
  compliance: { color: "#3B82F6", bg: "rgba(59,130,246,0.08)" },
  analysis: { color: "#10B981", bg: "rgba(16,185,129,0.08)" },
  regulatory: { color: "#A78BFA", bg: "rgba(167,139,250,0.08)" },
  stress_test: { color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
};

export function ReportsPage() {
  const [activeFilter, setActiveFilter] = useState("All");

  const filteredReports = activeFilter === "All"
    ? mockReports
    : mockReports.filter(r => r.type.replace(/_/g, " ").toLowerCase() === activeFilter.toLowerCase());

  const handleGenerate = () => {
    alert("Initiating NEXUS compliance report generation. Gathering latest metrics across the fleet...");
  };

  const handleDownload = (report: any, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Dynamically load jsPDF via CDN to bypass Docker/Vite resolution issues
    if (!(window as any).jspdf) {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      script.onload = () => generatePDF(report);
      document.body.appendChild(script);
    } else {
      generatePDF(report);
    }
  };

  const generatePDF = (report: any) => {
    // @ts-ignore
    const doc = new window.jspdf.jsPDF();
      const dateStr = new Date(report.generated).toLocaleString();

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(37, 99, 235);
      doc.text("NEXUS PLATFORM", 20, 25);
      
      doc.setFontSize(16);
      doc.setTextColor(50, 50, 50);
      
      if (report.type === "compliance") {
        doc.text("Fairness Compliance Audit", 20, 35);
      } else if (report.type === "stress_test") {
        doc.text("Omega Adversarial Stress Test", 20, 35);
      } else if (report.type === "analysis") {
        doc.text("Deep Fairness Analysis", 20, 35);
      } else {
        doc.text("Regulatory Compliance Report", 20, 35);
      }

      doc.setLineWidth(0.5);
      doc.setDrawColor(200, 200, 200);
      doc.line(20, 40, 190, 40);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Report ID: ${report.id.toUpperCase()}`, 20, 50);
      doc.text(`Title: ${report.title}`, 20, 55);
      doc.text(`Generated: ${dateStr}`, 20, 60);
      doc.text(`Status: VERIFIED & COMPLETE`, 20, 65);

      doc.line(20, 70, 190, 70);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);

      let currentY = 80;

      const addSection = (title: string, body: string[]) => {
        doc.setFont("helvetica", "bold");
        doc.text(title, 20, currentY);
        currentY += 8;
        doc.setFont("helvetica", "normal");
        body.forEach((line) => {
          if (currentY > 270) {
            doc.addPage();
            currentY = 20;
          }
          doc.text(line, 25, currentY);
          currentY += 7;
        });
        currentY += 5;
      };

      if (report.type === "compliance") {
        addSection("1. EXECUTIVE SUMMARY", [
          "This document certifies that the subject model adheres to all specified",
          "fairness and anti-discrimination benchmarks. No critical fairness violations",
          "were detected during the audit period. Continuous intercept monitoring was",
          "active for 100% of the reporting timeframe."
        ]);
        addSection("2. FAIRNESS METRICS & THRESHOLDS", [
          "Disparate Impact Ratio:     0.84  (Threshold: > 0.80) -> PASS",
          "Statistical Parity Diff:   -0.05  (Threshold: > -0.10) -> PASS",
          "Equal Opportunity Diff:     0.02  (Threshold: < 0.05) -> PASS",
          "Predictive Equality Diff:   0.01  (Threshold: < 0.05) -> PASS"
        ]);
        addSection("3. AUDIT VAULT CRYPTOGRAPHIC LOG", [
          "All automated decisions have been securely logged and hashed.",
          "Total Transactions: 1,247",
          "Anomalies Flagged:  0",
          "Tamper Evidence:    NONE",
          "Merkle Root:        0x8f7a9d2b1c4e9f3a8b4221..."
        ]);
      } else if (report.type === "stress_test") {
        addSection("1. TEST PARAMETERS", [
          "The system was subjected to 10,000 synthetically generated adversarial",
          "queries designed to trigger edge-case bias decisions and bypass standard",
          "guardrails."
        ]);
        addSection("2. ROBUSTNESS RESULTS", [
          "Subgroup Representation Attack: DEFENDED (0% penetration)",
          "Correlated Proxy Data Attack:   INTERCEPTED (100% flagged)",
          "Concept Drift Simulation:       ADAPTED (0.92 precision)",
          "Sybil Data Poisoning:           NEUTRALIZED (FedAvg secure)"
        ]);
        addSection("3. VULNERABILITY ASSESSMENT", [
          "The current causal graph model demonstrated high resilience against targeted",
          "demographic perturbations.",
          "Confidence score degradation under max load: -2.4% (Acceptable)"
        ]);
      } else if (report.type === "analysis") {
        addSection("1. CAUSAL DISCOVERY OVERVIEW", [
          "This analysis maps the underlying causal relationships between protected",
          "attributes and the target prediction variable.",
          "Primary Protected Attribute: Gender, Age",
          "Target Variable:             Risk Score / Outcome",
          "Identified Proxy Variables:  Employment Gap, Postcode"
        ]);
        addSection("2. COUNTERFACTUAL SIMULATION", [
          "1,000 counterfactual pairs were generated to test decisions if the",
          "protected attribute were inverted.",
          "Counterfactual Flip Rate (CFR): 1.2%",
          "Interpretation: Only 1.2% of decisions would change if the demographic",
          "profile was altered. This indicates a highly robust and fair decision boundary."
        ]);
        addSection("3. FEATURE IMPORTANCE (SHAP)", [
          "1. Primary Skill Score   (38.4%)",
          "2. Years of Experience   (22.1%)",
          "3. Recent Certifications (15.2%)",
          "4. [REDACTED PROXY]      (0.0%) - Suppressed by NEXUS"
        ]);
      } else {
        addSection("1. REGULATORY ALIGNMENT", [
          "The model architecture and deployment pipeline have been evaluated against",
          "the latest regulatory provisions for high-risk AI systems.",
          "Article 10 (Data Governance):     COMPLIANT",
          "Article 14 (Human Oversight):     COMPLIANT",
          "Article 15 (Robustness):          COMPLIANT"
        ]);
        addSection("2. EXPLAINABILITY & TRANSPARENCY", [
          "All automated decisions are traceable. Feature attributions are stored for",
          "user-requested explanations.",
          "Global model transparency index: 94/100."
        ]);
      }

      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text("Auto-generated by NEXUS AI Fairness Immunity Platform", 20, 285);

      doc.save(`NEXUS_Report_${report.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
  };

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
        <button className="nexus-btn" style={{ background: "linear-gradient(135deg, #2563EB, #7C3AED)" }} onClick={handleGenerate}>
          <FileText size={14} style={{ marginRight: 6 }} />
          Generate New Report
        </button>
      </div>

      {/* Category filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["All", "Compliance", "Analysis", "Regulatory", "Stress Test"].map((cat) => (
          <button 
            key={cat} 
            onClick={() => setActiveFilter(cat)}
            style={{
              padding: "6px 14px", borderRadius: "var(--radius-md)", fontSize: 12, fontWeight: 500, cursor: "pointer",
              border: "1px solid var(--border-subtle)", background: cat === activeFilter ? "var(--blue-500)" : "transparent",
              color: cat === activeFilter ? "white" : "var(--text-secondary)", transition: "all 0.15s",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <AnimatePresence mode="popLayout">
          {filteredReports.map((report) => {
            const tc = typeConfig[report.type] ?? typeConfig.compliance!;
            const ReportIcon = report.icon;
            return (
              <motion.div
                key={report.id}
                layout
                className="nexus-card"
                style={{ cursor: "pointer", position: "relative", overflow: "hidden" }}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
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
                    onClick={(e) => handleDownload(report, e)}
                  >
                    <Download size={14} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
