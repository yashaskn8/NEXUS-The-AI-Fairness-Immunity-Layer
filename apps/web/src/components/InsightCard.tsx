import { useState } from "react";
import { motion } from "framer-motion";
import { formatRelTime } from "../utils/format";
import { AlertCircle, FileSearch, Scale, ShieldAlert, ChevronDown, ChevronRight } from "lucide-react";

export interface InsightData {
  insight_id?: string;
  severity: string;
  headline: string;
  summary: string;
  insight_type?: string;
  icon_type?: string;
  created_at_ms?: number;
}

interface InsightCardProps {
  insight: InsightData;
  index: number;
}

const SEVERITY_CONFIG: Record<string, { color: string; icon: any }> = {
  critical: { color: "var(--red)", icon: ShieldAlert },
  high:     { color: "var(--amber)", icon: AlertCircle },
  warning:  { color: "var(--amber)", icon: AlertCircle },
  medium:   { color: "var(--amber)", icon: AlertCircle },
  low:      { color: "var(--blue-400)", icon: Scale },
  info:     { color: "var(--text-secondary)", icon: FileSearch },
};

export function InsightCard({ insight, index }: InsightCardProps) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITY_CONFIG[insight.severity] || SEVERITY_CONFIG.info;
  const Icon = sev!.icon;

  return (
    <motion.div
      className="nexus-card"
      style={{ marginBottom: 12, padding: 16, position: "relative", overflow: "hidden", cursor: "pointer" }}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={() => setExpanded(!expanded)}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: sev!.color }} />

      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ marginTop: 2, flexShrink: 0 }}>
          <Icon size={20} color={sev!.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13, lineHeight: 1.4, color: "rgba(255,255,255,0.90)", paddingRight: 8 }}>
              {insight.headline || "Unclassified System Insight"}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: "var(--text-dim)", whiteSpace: "nowrap", fontFamily: "var(--font-mono)" }}>
                {formatRelTime(insight.created_at_ms || Date.now())}
              </span>
              {expanded ? <ChevronDown size={12} color="var(--text-dim)" /> : <ChevronRight size={12} color="var(--text-dim)" />}
            </div>
          </div>
          <p style={{
            fontSize: 12, color: "rgba(255,255,255,0.50)", lineHeight: 1.5,
            ...(expanded ? {} : { WebkitLineClamp: 2, display: "-webkit-box", WebkitBoxOrient: "vertical" as const, overflow: "hidden" }),
          }}>
            {insight.summary || "No detailed summary available."}
          </p>
          {expanded && (
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              {insight.insight_type && (
                <span className={`pill ${insight.severity === "critical" ? "pill-red" : insight.severity === "warning" ? "pill-amber" : "pill-blue"}`} style={{ fontSize: 10 }}>
                  {insight.insight_type.toUpperCase().replace(/_/g, " ")}
                </span>
              )}
              <span className="pill pill-grey" style={{ fontSize: 10 }}>
                GEMINI 1.5 FLASH
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
