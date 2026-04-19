import { useState, useEffect } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import type { InterceptLogEvent } from "../types/nexus";

interface UseInterceptFeedResult {
  events: InterceptLogEvent[];
  loading: boolean;
}

export function useInterceptFeed(orgId: string): UseInterceptFeedResult {
  const [events, setEvents] = useState<InterceptLogEvent[]>([
    { event_id: "evt-1", org_id: orgId, timestamp: Date.now() - 60000, model_id: "CreditRisk-v2", domain: "credit", original_decision: "Deny", final_decision: "Approve (Fairness Adjusted)", was_intercepted: true, latency_ms: 12 },
    { event_id: "evt-2", org_id: orgId, timestamp: Date.now() - 120000, model_id: "ResumeScanner_NLP", domain: "hiring", original_decision: "Filter", final_decision: "Retain (Protected Class)", was_intercepted: true, latency_ms: 8 },
    { event_id: "evt-3", org_id: orgId, timestamp: Date.now() - 300000, model_id: "MedTriage_US", domain: "healthcare", original_decision: "Normal Priority", final_decision: "High Priority (Demographic Bias detected)", was_intercepted: true, latency_ms: 24 }
  ]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `orgs/${orgId}/intercept_log`),
      orderBy("timestamp", "desc"),
      limit(100)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map(
          (doc) => ({ ...doc.data(), event_id: doc.id } as InterceptLogEvent)
        );
        setEvents(data);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return unsubscribe;
  }, [orgId]);

  return { events, loading };
}
