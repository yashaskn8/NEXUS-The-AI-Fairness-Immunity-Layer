import { motion } from "framer-motion";

interface SeverityBadgeProps {
  severity: string;
}

const SEVERITY_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  ok:       { label: "OK",       bg: "var(--green-subtle)",          text: "var(--green)",    dot: "var(--green)" },
  none:     { label: "OK",       bg: "var(--green-subtle)",          text: "var(--green)",    dot: "var(--green)" },
  low:      { label: "LOW",      bg: "var(--blue-subtle)",           text: "var(--blue-400)", dot: "var(--blue-400)" },
  info:     { label: "INFO",     bg: "var(--blue-subtle)",           text: "var(--blue-400)", dot: "var(--blue-400)" },
  warning:  { label: "WARNING",  bg: "var(--amber-subtle)",          text: "var(--amber)",    dot: "var(--amber)" },
  medium:   { label: "MEDIUM",   bg: "var(--amber-subtle)",          text: "var(--amber)",    dot: "var(--amber)" },
  high:     { label: "HIGH",     bg: "rgba(249,115,22,0.10)",        text: "#F97316",         dot: "#F97316" },
  critical: { label: "CRITICAL", bg: "var(--red-subtle)",            text: "var(--red)",      dot: "var(--red)" },
};

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const c = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.low!;
  const isCritical = severity === "critical";

  return (
    <motion.span
      className={isCritical ? "pulse-critical" : ""}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        background: c.bg,
        color: c.text,
        fontFamily: "var(--font-mono)",
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: c.dot,
        animation: isCritical ? "pulse-dot 1.5s ease-in-out infinite" : undefined,
      }} />
      {c.label}
    </motion.span>
  );
}
