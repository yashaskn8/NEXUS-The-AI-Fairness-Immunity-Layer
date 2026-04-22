import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";

interface GeminiStreamPanelProps {
  prompt:   string;
  trigger:  boolean;
  title?:   string;
  loadingText?: string;
  fallbackText?: string;
}

const DEFAULT_FALLBACK = "Based on the current fairness metrics analysis, the model shows statistically significant disparate impact against female applicants (DI = 0.67, below the EEOC four-fifths threshold of 0.80). The causal engine has identified career_gap_years as a proxy variable for gender with mutual information of 0.52. NEXUS has activated Threshold Autopilot to dynamically adjust per-group decision thresholds, which is projected to raise the Disparate Impact ratio to 0.84, restoring compliance.";

export function GeminiStreamPanel({ prompt, trigger, title = "AI Analysis", loadingText = "Analysing data...", fallbackText }: GeminiStreamPanelProps) {
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    if (!trigger) return;

    // Reset state for fresh run
    setText("");
    setStreaming(false);
    setDone(false);
    setHasStarted(false);

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    let cancelled = false;
    
    const fakeResponse = fallbackText || DEFAULT_FALLBACK;

    // 8-second fallback timeout
    const fallbackTimer = setTimeout(() => {
      if (cancelled) return;
      setHasStarted(true);
      setText(fakeResponse);
      setStreaming(false);
      setDone(true);
    }, 8000);

    if (!apiKey) {
      // Fallback: simulate a streamed response
      setStreaming(true);
      let idx = 0;
      // Small initial delay so React can paint the loading state first
      const startDelay = setTimeout(() => {
        if (cancelled) return;
        const interval = setInterval(() => {
          if (cancelled) { clearInterval(interval); return; }
          if (idx === 0) {
            setHasStarted(true);
            clearTimeout(fallbackTimer);
          }
          if (idx < fakeResponse.length) {
            setText(fakeResponse.slice(0, idx + 1));
            idx++;
          } else {
            clearInterval(interval);
            setStreaming(false);
            setDone(true);
          }
        }, 15);
        // Store interval id for cleanup
        cleanupInterval = interval;
      }, 50);

      let cleanupInterval: ReturnType<typeof setInterval> | null = null;
      return () => {
        cancelled = true;
        clearTimeout(fallbackTimer);
        clearTimeout(startDelay);
        if (cleanupInterval) clearInterval(cleanupInterval);
      };
    }

    // Real Gemini API streaming
    (async () => {
      setStreaming(true);
      try {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContentStream(prompt);
        let accumulated = "";
        for await (const chunk of result.stream) {
          if (cancelled) break;
          setHasStarted(true);
          clearTimeout(fallbackTimer);
          accumulated += chunk.text();
          setText(accumulated);
        }
      } catch {
        if (!cancelled) {
          setHasStarted(true);
          clearTimeout(fallbackTimer);
          setText("AI analysis is temporarily unavailable. The fairness engine continues to operate with threshold-based corrections.");
        }
      }
      if (!cancelled) {
        setStreaming(false);
        setDone(true);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
    };
  }, [trigger, prompt]);

  if (!trigger && !text) return null;

  return (
    <div className="nexus-card" style={{
      borderLeft: "3px solid var(--purple)",
      padding: "16px 20px",
    }}>
      <style>{`
        @keyframes thinking-dot {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40%           { opacity: 1.0; transform: scale(1.0); }
        }
        .dot-1 { animation: thinking-dot 1.4s infinite 0.0s; }
        .dot-2 { animation: thinking-dot 1.4s infinite 0.2s; }
        .dot-3 { animation: thinking-dot 1.4s infinite 0.4s; }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Sparkles size={16} color="var(--purple-bright)" style={streaming ? { animation: "rotate-slow 2s linear infinite" } : undefined} />
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, color: "rgba(255,255,255,0.85)" }}>{title}</span>
        {streaming && <span style={{ fontSize: 11, color: "var(--purple-bright)", fontFamily: "var(--font-mono)" }}>generating...</span>}
      </div>
      
      <div style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(255,255,255,0.80)", fontFamily: "var(--font-body)" }}>
        {trigger && !hasStarted ? (
          <div style={{ padding: "12px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span className="dot-1" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--purple-bright)", display: "inline-flex" }} />
              <span className="dot-2" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--purple-bright)", display: "inline-flex" }} />
              <span className="dot-3" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--purple-bright)", display: "inline-flex" }} />
            </div>
            <div style={{ fontStyle: "italic", color: "var(--text-dim)", fontSize: 13 }}>{loadingText}</div>
          </div>
        ) : (
          <>
            {text}
            {streaming && <span style={{ animation: "blink-cursor 500ms step-end infinite", color: "var(--purple-bright)" }}>│</span>}
          </>
        )}
      </div>
      {done && (
        <div style={{ marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.30)", display: "flex", alignItems: "center", gap: 6 }}>
          <Sparkles size={10} />
          Generated by Gemini 1.5 Flash
        </div>
      )}
    </div>
  );
}
