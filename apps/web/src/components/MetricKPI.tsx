import type { ReactNode } from "react";
import reactCountUp from "react-countup";
const CountUp = (reactCountUp as any).default || reactCountUp;

interface MetricKPIProps {
  label:       ReactNode;
  value:       number | string;
  unit?:       string;
  trend?:      "up" | "down" | "neutral";
  trendValue?: string;
  colour:      "blue" | "green" | "red" | "amber" | "purple" | "cyan";
  animate?:    boolean;
  decimals?:   number;
}

const COLOUR_MAP: Record<string, { main: string; bg: string }> = {
  blue:   { main: "var(--blue-400)",     bg: "rgba(59,130,246,0.05)" },
  green:  { main: "var(--green)",        bg: "rgba(16,185,129,0.05)" },
  red:    { main: "var(--red)",          bg: "rgba(239,68,68,0.05)" },
  amber:  { main: "var(--amber)",        bg: "rgba(245,158,11,0.05)" },
  purple: { main: "var(--purple-bright)",bg: "rgba(139,92,246,0.05)" },
  cyan:   { main: "var(--cyan)",         bg: "rgba(6,182,212,0.05)" },
};

export function MetricKPI({ label, value, unit, trend, trendValue, colour, animate = true, decimals = 0 }: MetricKPIProps) {
  const c = COLOUR_MAP[colour] ?? COLOUR_MAP.blue!;
  const numValue = typeof value === "number" ? value : parseFloat(value) || 0;

  return (
    <div className="nexus-card" style={{
      padding: "20px 24px",
      position: "relative",
      overflow: "hidden",
      borderTop: `2px solid ${c.main}`,
    }}>
      {/* Gradient background */}
      <div style={{
        position: "absolute", top: 0, right: 0, width: "50%", height: "50%",
        background: `radial-gradient(circle at top right, ${c.bg}, transparent)`,
        pointerEvents: "none",
      }} />

      <div style={{ fontSize: 12, fontWeight: 400, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        {label}
      </div>

      <div style={{ fontFamily: "var(--font-mono)", fontSize: 36, fontWeight: 700, color: c.main, lineHeight: 1 }}>
        {animate && typeof value === "number" ? (
          <CountUp end={numValue} duration={1.5} decimals={decimals} separator="," />
        ) : (
          value
        )}
        {unit && <span style={{ fontSize: 18, marginLeft: 4, opacity: 0.7 }}>{unit}</span>}
      </div>

      {trend && trendValue && (
        <div style={{ marginTop: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: trend === "up" ? "var(--green)" : trend === "down" ? "var(--red)" : "var(--text-dim)" }}>
            {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"} {trendValue}
          </span>
        </div>
      )}
    </div>
  );
}
