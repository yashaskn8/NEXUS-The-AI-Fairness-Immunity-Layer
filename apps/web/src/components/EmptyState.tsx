import type { ReactNode } from "react";

interface EmptyStateProps {
  icon:    ReactNode;
  title:   string;
  body:    string;
  code?:   string;
  cta?:    { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, body, code, cta }: EmptyStateProps) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "80px 40px", textAlign: "center",
    }}>
      <div style={{ color: "rgba(59,130,246,0.5)", marginBottom: 16 }}>{icon}</div>
      <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 18, color: "rgba(255,255,255,0.70)", marginBottom: 8 }}>{title}</h3>
      <p style={{ fontSize: 14, color: "rgba(255,255,255,0.40)", maxWidth: 400, lineHeight: 1.5 }}>{body}</p>
      {code && (
        <div style={{
          marginTop: 16, padding: "12px 20px", borderRadius: "var(--radius-md)",
          background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
          fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--green)",
          cursor: "pointer", userSelect: "all",
        }}>
          {code}
        </div>
      )}
      {cta && (
        <button className="nexus-btn-outline" style={{ marginTop: 16 }} onClick={cta.onClick}>
          {cta.label}
        </button>
      )}
    </div>
  );
}
