import { useState, useEffect } from "react";
import {
  collection,
  query,
  onSnapshot,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "../firebase";

interface UseCollectionResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
}

export function useCollection<T>(
  collectionPath: string,
  ...queryConstraints: QueryConstraint[]
): UseCollectionResult<T> {
  const [data, setData] = useState<T[]>([
    {
      metric_id: "m-1", org_id: "demo", model_id: "CreditRisk-v2", metric_name: "disparate_impact", value: 0.81, threshold_min: 0.8, computed_at_ms: Date.now() - 3600000, severity: "critical", is_violated: false,
      insight_id: "i-1", text: "ResumeScanner_NLP is penalizing non-traditional educational backgrounds by 12%. Immediate re-weighting recommended.", type: "bias_detection"
    },
    {
      metric_id: "m-2", org_id: "demo", model_id: "CreditRisk-v2", metric_name: "disparate_impact", value: 0.84, threshold_min: 0.8, computed_at_ms: Date.now() - 7200000, severity: "warning", is_violated: false,
      insight_id: "i-2", text: "CreditRisk-v2 disparate impact ratio strictly maintained above 0.80 following the latest federated differentially-private sync.", type: "remediation_applied"
    },
    {
      metric_id: "m-3", org_id: "demo", model_id: "CreditRisk-v2", metric_name: "disparate_impact", value: 0.89, threshold_min: 0.8, computed_at_ms: Date.now() - 10800000, severity: "ok", is_violated: false,
      insight_id: "i-3", text: "Global network consensus achieved. 142 training rounds completed without risking model inversion attacks.", type: "compliance_alert"
    },
    { metric_id: "m-4", org_id: "demo", model_id: "ResumeScanner_NLP", metric_name: "disparate_impact", value: 0.76, threshold_min: 0.8, computed_at_ms: Date.now() - 14400000, severity: "critical", is_violated: true }
  ] as unknown as T[]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!collectionPath) {
      setLoading(false);
      return;
    }

    const q = queryConstraints.length > 0
      ? query(collection(db, collectionPath), ...queryConstraints)
      : query(collection(db, collectionPath));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as T)
        );
        setData(items);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionPath]);

  return { data, loading, error };
}
