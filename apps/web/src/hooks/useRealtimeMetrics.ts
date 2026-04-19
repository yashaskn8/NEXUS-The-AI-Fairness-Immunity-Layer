import { useState, useEffect, useRef } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "../firebase";
import type { FairnessMetric } from "../types/nexus";

interface UseRealtimeMetricsResult {
  metrics: FairnessMetric[];
  loading: boolean;
  error: Error | null;
}

export function useRealtimeMetrics(
  orgId: string,
  modelId: string,
  window: "1m" | "5m" | "1h" | "24h" = "1h"
): UseRealtimeMetricsResult {
  const [metrics, setMetrics] = useState<FairnessMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!orgId || !modelId) {
      setLoading(false);
      return;
    }

    const constraints: QueryConstraint[] = [
      where("model_id", "==", modelId),
      orderBy("computed_at_ms", "desc"),
      limit(60),
    ];

    const q = query(
      collection(db, `orgs/${orgId}/fairness_metrics`),
      ...constraints
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          const data = snapshot.docs.map(
            (doc) => ({ ...doc.data(), metric_id: doc.id } as FairnessMetric)
          );
          setMetrics(data);
          setLoading(false);
          setError(null);
        }, 100);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [orgId, modelId, window]);

  return { metrics, loading, error };
}
