import type { ReactNode, CSSProperties } from "react";

interface NexusCardProps {
  title?:     string;
  subtitle?:  string;
  children:   ReactNode;
  className?: string;
  style?:     CSSProperties;
  glow?:      "blue" | "green" | "red" | "amber" | "purple" | "none";
  padding?:   "sm" | "md" | "lg";
  noBorder?:  boolean;
  onClick?:   () => void;
}

const GLOW_MAP: Record<string, string> = {
  blue:   "var(--shadow-glow-blue)",
  green:  "var(--shadow-glow-green)",
  red:    "var(--shadow-glow-red)",
  amber:  "var(--shadow-glow-amber)",
  purple: "var(--shadow-glow-purple)",
};

const PADDING_MAP: Record<string, string> = {
  sm: "12px 16px",
  md: "20px 24px",
  lg: "28px 32px",
};

export function NexusCard({ title, subtitle, children, className = "", style, glow, padding = "md", noBorder, onClick }: NexusCardProps) {
  const glowShadow = glow && glow !== "none" ? GLOW_MAP[glow] : undefined;

  return (
    <div
      className={`nexus-card ${className}`}
      onClick={onClick}
      style={{
        padding: PADDING_MAP[padding],
        border: noBorder ? "none" : undefined,
        boxShadow: glowShadow,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {title && (
        <div style={{ marginBottom: subtitle ? 4 : 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-display)", color: "rgba(255,255,255,0.90)" }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
