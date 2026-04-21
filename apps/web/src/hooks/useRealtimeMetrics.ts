import { useState, useEffect, useRef } from "react";
import { collection, query, where, orderBy, limit, onSnapshot, type QueryConstraint } from "firebase/firestore";
import { db } from "../firebase";
import { normaliseMetric } from "../utils/normalise";

export interface RealtimeMetric {
  metric_id: string;
  org_id: string;
  model_id: string;
  metric_name: string;
  protected_attribute: string;
  value: number;
  threshold: number;
  is_violated: boolean;
  severity: string;
  window: string;
  sample_size: number;
  computed_at_ms: number;
}

// Fallback synthetic metrics
function generateFallbackMetrics(modelId: string): RealtimeMetric[] {
  const now = Date.now();
  const names = ["disparate_impact", "demographic_parity", "equalized_odds", "predictive_parity", "individual_fairness"];
  const attrs = ["gender", "age_group", "race"];
  const results: RealtimeMetric[] = [];
  let idx = 0;
  for (const name of names) {
    for (const attr of attrs) {
      const isDI = name === "disparate_impact";
      const baseVal = isDI ? 0.67 + Math.random() * 0.25 : -0.15 + Math.random() * 0.25;
      const threshold = isDI ? 0.80 : 0.10;
      const violated = isDI ? baseVal < threshold : Math.abs(baseVal) > threshold;
      results.push({
        metric_id: `fallback-${idx++}`,
        org_id: "demo-org",
        model_id: modelId,
        metric_name: name,
        protected_attribute: attr,
        value: +baseVal.toFixed(4),
        threshold,
        is_violated: violated,
        severity: violated ? (isDI && baseVal < 0.7 ? "critical" : "warning") : "ok",
        window: "5m",
        sample_size: 200,
        computed_at_ms: now - idx * 60000,
      });
    }
  }
  return results;
}

export function useRealtimeMetrics(
  orgId: string,
  modelId: string,
  window: "1m" | "5m" | "1h" | "24h" = "1h"
) {
  const [metrics, setMetrics] = useState<RealtimeMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackRef = useRef<RealtimeMetric[] | null>(null);

  useEffect(() => {
    if (!orgId || !modelId) { setLoading(false); return; }

    if (!fallbackRef.current) {
      fallbackRef.current = generateFallbackMetrics(modelId);
    }

    const constraints: QueryConstraint[] = [
      where("model_id", "==", modelId),
      orderBy("computed_at_ms", "desc"),
      limit(60),
    ];

    const q = query(collection(db, `orgs/${orgId}/fairness_metrics`), ...constraints);

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          if (snapshot.docs.length > 0) {
            const data = snapshot.docs.map((doc) => normaliseMetric({ id: doc.id, ...doc.data() }) as unknown as RealtimeMetric);
            setMetrics(data);
          } else {
            setMetrics(fallbackRef.current!);
          }
          setLoading(false);
          setError(null);
        }, 100);
      },
      (err) => {
        setMetrics(fallbackRef.current!);
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      unsub();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [orgId, modelId, window]);

  return { metrics, loading, error };
}
