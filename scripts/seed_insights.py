import os
import time
from google.cloud import firestore

# Setup Firestore to use emulator
os.environ["FIRESTORE_EMULATOR_HOST"] = "localhost:8080"

# Using google-cloud-firestore directly is often easier for local emulators
db = firestore.Client(project="demo-nexus")
ORG_ID = "demo-org"

INSIGHTS = [
    {
        "insight_id": "ins_1",
        "insight_type": "bias_detection",
        "headline": "ResumeScanner_NLP penalising non-trad education",
        "summary": "Deep causal analysis reveals a 12% penalisation for applicants from non-traditional educational backgrounds. This correlates strongly with lower socio-economic status. Immediate re-weighting recommended.",
        "severity": "critical",
        "created_at_ms": int(time.time() * 1000) - 3600000,
        "data": {}
    },
    {
        "insight_id": "ins_2",
        "insight_type": "remediation_applied",
        "headline": "CreditRisk-v2 threshold autopilot engaged",
        "summary": "Disparate impact ratio dropped to 0.78 for Hispanic applicants. Autopilot has adjusted approval thresholds (+3%) to restore EEOC compliance without sacrificing predictive utility.",
        "severity": "high",
        "created_at_ms": int(time.time() * 1000) - 7200000,
        "data": {}
    },
    {
        "insight_id": "ins_3",
        "insight_type": "compliance_alert",
        "headline": "Federated model consensus achieved",
        "summary": "Global network consensus reached across 14 nodes. 142 training rounds completed using differential privacy. No model inversion risks detected.",
        "severity": "low",
        "created_at_ms": int(time.time() * 1000) - 14400000,
        "data": {}
    },
    {
        "insight_id": "ins_4",
        "insight_type": "regulatory_update",
        "headline": "NYC Local Law 144 compliance validated",
        "summary": "Annual automated employment decision tools (AEDT) audit generated. Platform confirms 100% compliance with new demographic parity requirements ahead of April deadline.",
        "severity": "info",
        "created_at_ms": int(time.time() * 1000) - 86400000,
        "data": {}
    }
]

def main():
    print("Seeding Global Insights (Using google-cloud-firestore)...")
    col_ref = db.collection("orgs").document(ORG_ID).collection("global_insights")
    
    # Write new
    for ins in INSIGHTS:
        doc_ref = col_ref.document(ins["insight_id"])
        doc_ref.set(ins)
        print(f"  + Seeded {ins['headline']} [{ins['severity']}]")
        
    print(f"Successfully seeded {len(INSIGHTS)} insights.")

if __name__ == "__main__":
    main()
