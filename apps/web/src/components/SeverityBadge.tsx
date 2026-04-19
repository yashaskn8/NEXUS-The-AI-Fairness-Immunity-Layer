import { motion } from "framer-motion";

interface SeverityBadgeProps {
  severity: "ok" | "none" | "low" | "warning" | "medium" | "high" | "critical";
}

const config: Record<string, { bg: string; text: string; label: string }> = {
  ok: { bg: "rgba(16,185,129,0.15)", text: "#10B981", label: "OK" },
  none: { bg: "rgba(16,185,129,0.15)", text: "#10B981", label: "OK" },
  low: { bg: "rgba(59,130,246,0.15)", text: "#3B82F6", label: "LOW" },
  warning: { bg: "rgba(245,158,11,0.15)", text: "#F59E0B", label: "WARNING" },
  medium: { bg: "rgba(245,158,11,0.15)", text: "#F59E0B", label: "MEDIUM" },
  high: { bg: "rgba(245,158,11,0.2)", text: "#F59E0B", label: "HIGH" },
  critical: { bg: "rgba(239,68,68,0.2)", text: "#EF4444", label: "CRITICAL" },
};

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const c = config[severity] ?? config.low!;
  const isCritical = severity === "critical";

  return (
    <motion.span
      animate={isCritical ? { opacity: [1, 0.6, 1] } : {}}
      transition={isCritical ? { duration: 1, repeat: Infinity } : {}}
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.05em",
        background: c.bg,
        color: c.text,
        fontFamily: "var(--font-mono)",
      }}
    >
      {c.label}
    </motion.span>
  );
}
