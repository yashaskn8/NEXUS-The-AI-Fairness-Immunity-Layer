import { useState, useEffect } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { normaliseIntercept } from "../utils/normalise";

export interface InterceptEvent {
  event_id: string;
  model_id: string;
  org_id: string;
  domain: string;
  original_decision: string;
  final_decision: string;
  was_intercepted: boolean;
  intervention_reason: string;
  latency_ms: number;
  confidence: number;
  protected_attributes: Record<string, string>;
  timestamp_ms: number;
}

// Hardcoded fallback for when Firestore is empty
const FALLBACK_EVENTS: InterceptEvent[] = [
  { event_id: "evt-1", org_id: "demo-org", timestamp_ms: Date.now() - 60000, model_id: "hiring-v1", domain: "hiring", original_decision: "rejected", final_decision: "approved", was_intercepted: true, intervention_reason: "threshold_autopilot", latency_ms: 87, confidence: 0.52, protected_attributes: { gender: "female" } },
  { event_id: "evt-2", org_id: "demo-org", timestamp_ms: Date.now() - 120000, model_id: "hiring-v1", domain: "hiring", original_decision: "rejected", final_decision: "approved", was_intercepted: true, intervention_reason: "causal_intervention", latency_ms: 94, confidence: 0.49, protected_attributes: { gender: "female" } },
  { event_id: "evt-3", org_id: "demo-org", timestamp_ms: Date.now() - 240000, model_id: "credit-v2", domain: "credit", original_decision: "rejected", final_decision: "approved", was_intercepted: true, intervention_reason: "threshold_autopilot", latency_ms: 78, confidence: 0.55, protected_attributes: { gender: "female" } },
  { event_id: "evt-4", org_id: "demo-org", timestamp_ms: Date.now() - 480000, model_id: "healthcare-v1", domain: "healthcare", original_decision: "normal_priority", final_decision: "high_priority", was_intercepted: true, intervention_reason: "demographic_bias", latency_ms: 45, confidence: 0.61, protected_attributes: { race: "black" } },
  { event_id: "evt-5", org_id: "demo-org", timestamp_ms: Date.now() - 600000, model_id: "hiring-v1", domain: "hiring", original_decision: "approved", final_decision: "approved", was_intercepted: false, intervention_reason: "none", latency_ms: 12, confidence: 0.91, protected_attributes: { gender: "male" } },
];

export function useInterceptFeed(orgId: string) {
  const [events, setEvents] = useState<InterceptEvent[]>(FALLBACK_EVENTS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId) { setLoading(false); return; }
    const q = query(
      collection(db, `orgs/${orgId}/intercept_log`),
      orderBy("timestamp_ms", "desc"),
      limit(100)
    );
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.docs.length > 0) {
          const data = snapshot.docs.map((doc) => normaliseIntercept({ id: doc.id, ...doc.data() }) as unknown as InterceptEvent);
          setEvents(data);
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [orgId]);

  return { events, loading };
}
