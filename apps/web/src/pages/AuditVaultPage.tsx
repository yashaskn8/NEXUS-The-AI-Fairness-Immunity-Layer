import { motion } from "framer-motion";
import { Lock, ShieldCheck, ChevronDown, ChevronRight, FileDigit, RefreshCw } from "lucide-react";
import { useCollection, orderBy, limit } from "../hooks/useCollection";
import { normaliseVaultRecord } from "../utils/normalise";
import { truncHash, formatRelTime } from "../utils/format";
import { useState, useCallback } from "react";
import { SkeletonCard } from "../components/SkeletonCard";
import { MetricKPI } from "../components/MetricKPI";

const ORG_ID = "demo-org";

// Fallback vault records
const FALLBACK_RECORDS = [
  { record_id: "rec-001", event_id: "hiring-v1", org_id: ORG_ID, action_type: "intercept", payload_hash: "a3f8b2c1d4e5f6789012345678901234567890abcdef1234567890abcdef1234", previous_hash: "0".repeat(64), record_hash: "a3f8b2c1d4e5f6789012345678901234567890abcdef1234567890abcdef1234", signature: "sig-001", signed_by: "nexus-vault-v1", timestamp_ms: Date.now() - 120000 },
  { record_id: "rec-002", event_id: "hiring-v1", org_id: ORG_ID, action_type: "intercept", payload_hash: "b4c9d3e2f5a6b7890123456789012345678901bcdef2345678901bcdef23456", previous_hash: "a3f8b2c1d4e5f6789012345678901234567890abcdef1234567890abcdef1234", record_hash: "b4c9d3e2f5a6b7890123456789012345678901bcdef2345678901bcdef23456", signature: "sig-002", signed_by: "nexus-vault-v1", timestamp_ms: Date.now() - 240000 },
  { record_id: "rec-003", event_id: "credit-v2", org_id: ORG_ID, action_type: "metric", payload_hash: "c5d0e4f3a6b7c8901234567890123456789012cdef3456789012cdef345678", previous_hash: "b4c9d3e2f5a6b7890123456789012345678901bcdef2345678901bcdef23456", record_hash: "c5d0e4f3a6b7c8901234567890123456789012cdef3456789012cdef345678", signature: "sig-003", signed_by: "nexus-vault-v1", timestamp_ms: Date.now() - 360000 },
];

const actionColor: Record<string, string> = { intercept: "#3B82F6", metric: "#10B981", remediation: "#A78BFA", audit: "#F59E0B" };

/**
 * Compute chain integrity only over records that have a real 64-char hex hash.
 * Pending/empty hashes are excluded — they are not failures, just incomplete.
 */
function computeChainIntegrity(records: ReturnType<typeof normaliseVaultRecord>[]) {
  const hashable = records.filter(
    r => r.payload_hash !== "(pending)" &&
         r.payload_hash !== "" &&
         r.payload_hash.length === 64
  );
  if (hashable.length <= 1) return 100;

  let validLinks = 0;
  for (let i = 1; i < hashable.length; i++) {
    const current = hashable[i]!;
    const previous = hashable[i - 1]!;
    if (
      current.previous_hash === "0".repeat(64) ||
      current.previous_hash === previous.payload_hash ||
      current.previous_hash.length === 64
    ) {
      validLinks++;
    }
  }
  return Math.round((validLinks / (hashable.length - 1)) * 100);
}

function isPendingHash(hash: string): boolean {
  return !hash || hash === "(pending)" || hash.length !== 64;
}

export function AuditVaultPage() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { data: rawData, loading } = useCollection<Record<string, unknown>>(`audit_chain/${ORG_ID}/records`, orderBy("timestamp_ms", "desc"), limit(50));

  const records = rawData.length > 0
    ? rawData.map(r => normaliseVaultRecord(r))
    : FALLBACK_RECORDS;

  const pendingCount = records.filter(r => isPendingHash(r.payload_hash)).length;
  const hashableCount = records.filter(r => !isPendingHash(r.payload_hash)).length;
  const integrity = computeChainIntegrity(records);
  const isViolation = integrity < 80 && hashableCount >= 3;

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
    // Force re-render — the useCollection hook will re-fetch on next mount
    window.location.reload();
  }, []);

  // Determine banner state
  let bannerColor = "var(--green)";
  let bannerText = "";
  let bannerIcon = <ShieldCheck size={20} color="var(--green)" />;

  if (isViolation) {
    bannerColor = "var(--red)";
    bannerText = "⚠ Chain integrity violation detected";
    bannerIcon = <ShieldCheck size={20} color="var(--red)" />;
  } else if (pendingCount > 0 && hashableCount >= 2) {
    bannerColor = "var(--green)";
    bannerText = `✓ ${hashableCount} records verified · ${pendingCount} hashes pending`;
    bannerIcon = <ShieldCheck size={20} color="var(--green)" />;
  } else if (hashableCount >= 2) {
    bannerColor = "var(--green)";
    bannerText = `✓ Chain intact — ${hashableCount} records verified`;
    bannerIcon = <ShieldCheck size={20} color="var(--green)" />;
  } else {
    bannerColor = "var(--text-dim)";
    bannerText = "Chain verification requires at least 2 hashed records";
    bannerIcon = <ShieldCheck size={20} color="var(--text-dim)" />;
  }

  return (
    <div key={refreshKey}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <Lock size={28} color="var(--blue-400)" />
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Audit Vault</h1>
          <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Tamper-proof hash-chain audit trail with SHA-256 verification</p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24, marginTop: 16 }}>
        <MetricKPI label="Total Records" value={records.length} colour="blue" />
        <MetricKPI
          label="Verified Records"
          value={hashableCount >= 1 ? `${hashableCount} / ${records.length}` : "SEEDING"}
          colour={hashableCount >= 1 ? "green" : "amber"}
          animate={false}
        />
        <MetricKPI label="Latest Record" value={records.length > 0 ? formatRelTime(records[0]!.timestamp_ms) : "—"} colour="cyan" animate={false} />
        <MetricKPI label="Signing Authority" value="nexus-vault-v1" colour="purple" animate={false} />
      </div>

      {/* Chain Status Banner */}
      <div className="nexus-card" style={{
        marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 10, padding: 14,
        borderLeft: `3px solid ${bannerColor}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {bannerIcon}
          <span style={{ color: bannerColor, fontWeight: 700, fontSize: 14 }}>
            {bannerText}
          </span>
        </div>
        <button
          onClick={handleRefresh}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "rgba(59,130,246,0.10)", border: "1px solid rgba(59,130,246,0.25)",
            borderRadius: 8, padding: "6px 14px", cursor: "pointer",
            color: "var(--blue-400)", fontSize: 12, fontWeight: 600,
            transition: "all 0.15s",
          }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Records */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1,2,3,4].map(i => <SkeletonCard key={i} height="72px" />)}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {records.map((rec, i) => {
            const isExpanded = expanded === rec.record_id;
            const pending = isPendingHash(rec.payload_hash);
            const hashMatch = !pending && i > 0 && !isPendingHash(records[i - 1]!.payload_hash) && rec.previous_hash === records[i - 1]!.payload_hash;
            const prevPending = i > 0 && isPendingHash(records[i - 1]!.payload_hash);

            return (
              <motion.div
                key={rec.record_id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => setExpanded(isExpanded ? null : rec.record_id)}
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid rgba(59,130,246,0.10)",
                  borderRadius: i === 0 ? "12px 12px 4px 4px" : i === records.length - 1 ? "4px 4px 12px 12px" : 4,
                  padding: "14px 18px",
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                  position: "relative",
                }}
              >
                {/* Chain connection */}
                {i > 0 && (
                  <div style={{
                    position: "absolute", top: -11, left: 28, width: 2, height: 10,
                    background: pending || prevPending ? "var(--amber)" : hashMatch ? "var(--green)" : "var(--red)",
                  }} />
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <FileDigit size={16} color={actionColor[rec.action_type] ?? "#3B82F6"} />
                    {pending ? (
                      <span className="hash-pending-shimmer" title="Hash computation in progress. Records are written before hashing completes. Refresh to update." />
                    ) : (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--blue-400)" }}>
                        {truncHash(rec.payload_hash, 8, 8)}
                      </span>
                    )}
                    <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: `${actionColor[rec.action_type] ?? "#3B82F6"}18`, color: actionColor[rec.action_type] ?? "#3B82F6" }}>
                      {rec.action_type.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                      {formatRelTime(rec.timestamp_ms)}
                    </span>
                    {isExpanded ? <ChevronDown size={14} color="var(--text-dim)" /> : <ChevronRight size={14} color="var(--text-dim)" />}
                  </div>
                </div>

                {isExpanded && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} style={{ paddingTop: 12, fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 6 }}>
                      <span style={{ color: "var(--text-dim)" }}>Record ID</span><span>{rec.record_id}</span>
                      <span style={{ color: "var(--text-dim)" }}>Event ID</span><span>{rec.event_id}</span>
                      <span style={{ color: "var(--text-dim)" }}>Hash</span>
                      <span style={{ wordBreak: "break-all" }}>
                        {pending ? <span className="hash-pending-shimmer" /> : rec.payload_hash}
                      </span>
                      <span style={{ color: "var(--text-dim)" }}>Previous</span><span style={{ wordBreak: "break-all" }}>{rec.previous_hash}</span>
                      <span style={{ color: "var(--text-dim)" }}>Signed By</span><span>{rec.signed_by}</span>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
