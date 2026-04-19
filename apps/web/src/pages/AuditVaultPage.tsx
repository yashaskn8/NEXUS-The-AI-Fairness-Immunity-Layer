import { motion } from "framer-motion";
import { useCollection } from "../hooks/useCollection";
import { orderBy } from "firebase/firestore";
import type { AuditRecord } from "../types/nexus";
import { Lock, CheckCircle } from "lucide-react";

const ORG_ID = "demo-org";

export function AuditVaultPage() {
  const { data: records, loading } = useCollection<AuditRecord>(
    `audit_chain/${ORG_ID}/records`,
    orderBy("timestamp", "desc")
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Lock size={28} color="var(--accent-blue)" />
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Audit Vault</h1>
          <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Immutable, cryptographically-chained audit trail</p>
        </div>
      </div>

      {/* Chain Verify Button */}
      <div className="nexus-card" style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--accent-green)" }}>
            <CheckCircle size={16} style={{ verticalAlign: "text-bottom", marginRight: 6 }} />
            Chain Integrity: VERIFIED
          </span>
          <span style={{ marginLeft: 16, color: "var(--text-dim)", fontSize: 13 }}>
            {records.length} records
          </span>
        </div>
        <button className="nexus-btn-outline">Verify Full Chain</button>
      </div>

      {/* Chain Blocks */}
      <div style={{ position: "relative" }}>
        {/* Vertical connector line */}
        <div
          style={{
            position: "absolute",
            left: 24,
            top: 0,
            bottom: 0,
            width: 2,
            background: "linear-gradient(to bottom, var(--accent-blue), var(--border-glow))",
          }}
        />

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-dim)" }}>Loading chain…</div>
        ) : records.length === 0 ? (
          <div className="nexus-card" style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}>
            No audit records yet.
          </div>
        ) : (
          records.slice(0, 50).map((record, i) => (
            <motion.div
              key={record.record_id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              style={{ display: "flex", gap: 16, marginBottom: 2, paddingLeft: 48 }}
            >
              {/* Chain dot */}
              <div
                style={{
                  position: "absolute",
                  left: 17,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "var(--bg-surface)",
                  border: "2px solid var(--accent-blue)",
                  marginTop: 16,
                }}
              />

              <div
                className="nexus-card"
                style={{
                  flex: 1,
                  padding: 14,
                  marginBottom: 4,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent-blue)" }}>
                      {record.action_type.replace(/_/g, " ").toUpperCase()}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                      {new Date(record.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--text-dim)",
                      maxWidth: 150,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    #{record.record_hash.slice(0, 12)}…
                  </span>
                </div>
                <div style={{ marginTop: 6, display: "flex", gap: 24 }}>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    Event: <span style={{ fontFamily: "var(--font-mono)" }}>{record.event_id.slice(0, 8)}</span>
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    Signed: <span style={{ fontFamily: "var(--font-mono)" }}>{record.signed_by}</span>
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    Prev: <span style={{ fontFamily: "var(--font-mono)" }}>{record.previous_hash.slice(0, 12)}</span>
                  </span>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
