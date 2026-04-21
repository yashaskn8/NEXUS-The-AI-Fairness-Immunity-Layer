import { AnimatePresence, motion } from "framer-motion";
import type { InterceptEvent } from "../hooks/useInterceptFeed";

interface InterceptTickerProps {
  events: InterceptEvent[];
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
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
  const visible = events.slice(0, 10);

  return (
    <div className="nexus-card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(59,130,246,0.10)", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--font-display)" }}>Live Intercept Feed</span>
        <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{events.length} events</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        <AnimatePresence>
          {visible.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
              Waiting for interception logs...
            </div>
          ) : (
            visible.map((event) => {
              const intercepted = event.was_intercepted;
              const ts = event.timestamp_ms || Date.now();
              return (
                <motion.div
                  key={event.event_id}
                  initial={{ opacity: 0, y: -16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 16px",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    borderLeft: intercepted ? "3px solid var(--amber)" : "3px solid transparent",
                    background: intercepted ? "rgba(245,158,11,0.04)" : "transparent",
                    boxShadow: intercepted ? "inset 4px 0 0 rgba(245,158,11,0.7)" : "none",
                    fontSize: 13,
                    height: 48,
                  }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)", minWidth: 65, flexShrink: 0 }}>
                    {formatTime(ts)}
                  </span>
                  <span style={{ fontWeight: 500, minWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>
                    {event.model_id}
                  </span>
                  {event.domain && (
                    <span style={{
                      padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                      background: `${domainColor[event.domain] ?? "#3B82F6"}18`,
                      color: domainColor[event.domain] ?? "#3B82F6",
                    }}>
                      {event.domain}
                    </span>
                  )}
                  <span style={{ flex: 1, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11, color: intercepted ? "var(--green)" : "var(--text-dim)" }}>
                    {intercepted && <span style={{ color: "var(--amber)", marginRight: 4 }}>⚡</span>}
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
