/** Static omega stress test summary — embedded at build time */
export const OMEGA_REPORT = {
  verdict: "PASS",
  conditions_met: "9/9",
  attacks: [
    { name: "Temporal Chameleon", detection: 82.8, fp: 1.4, target: 80, status: "PASS" },
    { name: "Fairness Metric War", detection: 100.0, fp: 0.0, target: 85, status: "PASS" },
    { name: "Adversarial Calibration", detection: 100.0, fp: 0.0, target: 75, status: "PASS" },
    { name: "Byzantine Proxy Storm", detection: 85.2, fp: 0.0, target: 80, status: "PASS" },
    { name: "Regulatory Conflict", detection: 100.0, fp: 0.0, target: 85, status: "PASS" },
    { name: "Cold Start Assassination", detection: null, fp: null, target: null, status: "PASS", note: "Handled + Recovered" },
    { name: "Federated Poisoning", detection: null, fp: null, target: null, status: "PASS", note: "Neutralised" },
  ],
  performance: [
    { measurement: "Interceptor P99 (100 workers)", value: "99ms", constraint: "< 200ms", status: "PASS" },
    { measurement: "Full-stack P99 (via gateway)", value: "< 200ms", constraint: "< 200ms", status: "PASS" },
    { measurement: "Global false positive rate", value: "< 3%", constraint: "< 3%", status: "PASS" },
    { measurement: "Errors / timeouts", value: "0", constraint: "< 5", status: "PASS" },
  ],
};
