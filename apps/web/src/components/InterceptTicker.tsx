import { AnimatePresence, motion } from "framer-motion";
import type { InterceptLogEvent } from "../types/nexus";

interface InterceptTickerProps {
  events: InterceptLogEvent[];
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

const domainColor: Record<string, string> = {
  hiring: "#3B82F6",
  credit: "#10B981",
  healthcare: "#06B6D4",
  legal: "#A78BFA",
  insurance: "#F59E0B",
};

export function InterceptTicker({ events }: InterceptTickerProps) {
  return (
    <div className="nexus-card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: 530 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-glow)", flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Live Intercept Feed</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        <AnimatePresence>
          {events.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
              Waiting for interception logs...
            </div>
          ) : (
            events.map((event) => {
              const intercepted = event.was_intercepted;
              return (
                <motion.div
                  key={event.event_id || Math.random().toString()}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px",
                    borderBottom: "1px solid rgba(255,255,255,0.02)",
                    borderLeft: intercepted ? "3px solid #F59E0B" : "3px solid transparent",
                    color: intercepted ? "#F59E0B" : "var(--text-dim)",
                    fontSize: 13,
                  }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, minWidth: 60, color: "var(--text-dim)" }}>
                    {formatTime(event.timestamp)}
                  </span>
                  <span style={{ minWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {event.model_id?.slice(0, 12)}
                  </span>
                  {event.domain && (
                    <span
                      style={{
                        padding: "1px 6px",
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 600,
                        background: `${domainColor[event.domain] ?? "#3B82F6"}22`,
                        color: domainColor[event.domain] ?? "#3B82F6",
                      }}
                    >
                      {event.domain}
                    </span>
                  )}
                  <span style={{ flex: 1, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                    {intercepted ? "⚡" : "✓"}{" "}
                    {event.original_decision} → {event.final_decision}
                  </span>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
