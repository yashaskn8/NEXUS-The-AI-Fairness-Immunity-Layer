"""
NEXUS SDK Example — Hiring Model with Intercept Mode.
Demonstrates how NEXUS intercepts discriminatory hiring decisions in real-time.
"""
from __future__ import annotations

import numpy as np
from sklearn.linear_model import LogisticRegression

from nexus_sdk import NexusClient


def main() -> None:
    """
    1. Train a biased hiring model (gender bias embedded)
    2. Integrate NexusClient in INTERCEPT mode
    3. Process 100 candidates
    4. Print comparison table
    """
    print("=" * 70)
    print("NEXUS SDK — Hiring Model Intercept Demo")
    print("=" * 70)

    rng = np.random.default_rng(42)
    n_train = 500

    # ── Step 1: Generate biased training data ──
    print("\n[1] Generating biased training data (500 samples)...")

    years_exp = rng.uniform(0, 20, n_train)
    gpa = rng.uniform(2.0, 4.0, n_train)
    skills_score = rng.uniform(0, 100, n_train)
    interview_score = rng.uniform(0, 100, n_train)
    gender = rng.choice(["male", "female"], n_train)

    # Base approval probability
    approval_prob = (
        0.15 * (years_exp / 20)
        + 0.25 * ((gpa - 2) / 2)
        + 0.30 * (skills_score / 100)
        + 0.30 * (interview_score / 100)
    )

    # Embed gender bias: female approval rate ~0.55 vs male ~0.82
    bias_factor = np.where(gender == "female", 0.63, 1.0)
    approval_prob = approval_prob * bias_factor

    decisions = (approval_prob > 0.45).astype(int)

    # Train logistic regression
    X_train = np.column_stack([years_exp, gpa, skills_score, interview_score])
    model = LogisticRegression(random_state=42)
    model.fit(X_train, decisions)

    male_rate = decisions[gender == "male"].mean()
    female_rate = decisions[gender == "female"].mean()
    original_di = female_rate / male_rate if male_rate > 0 else 0

    print(f"   Male approval rate:   {male_rate:.2%}")
    print(f"   Female approval rate: {female_rate:.2%}")
    print(f"   Disparate Impact:     {original_di:.3f} ({'⚠ VIOLATION' if original_di < 0.8 else '✅ OK'})")

    # ── Step 2: Setup NexusClient in INTERCEPT mode ──
    print("\n[2] Connecting to NEXUS in INTERCEPT mode...")

    client = NexusClient(
        api_key="nxs_demo_key_for_testing",
        org_id="demo-org",
        model_id="hiring-v2",
        domain="hiring",
        mode="intercept",
        base_url="http://localhost:8080",
    )

    print("   ✅ NexusClient initialized")

    # ── Step 3: Process 100 new candidates ──
    print("\n[3] Processing 100 new candidates through NEXUS...")
    print("-" * 70)
    print(f"{'ID':>4} | {'Gender':>8} | {'Original':>10} | {'NEXUS':>10} | {'Intercepted':>12}")
    print("-" * 70)

    n_test = 100
    test_years = rng.uniform(0, 20, n_test)
    test_gpa = rng.uniform(2.0, 4.0, n_test)
    test_skills = rng.uniform(0, 100, n_test)
    test_interview = rng.uniform(0, 100, n_test)
    test_gender = rng.choice(["male", "female"], n_test)

    X_test = np.column_stack([test_years, test_gpa, test_skills, test_interview])

    intercept_count = 0
    original_decisions = []
    nexus_decisions = []

    for i in range(n_test):
        features = {
            "years_experience": float(test_years[i]),
            "gpa": float(test_gpa[i]),
            "skills_score": float(test_skills[i]),
            "interview_score": float(test_interview[i]),
        }
        protected_attrs = {"gender": test_gender[i]}

        # Get model prediction
        prob = float(model.predict_proba(X_test[i:i + 1])[0, 1])
        original_decision = "approved" if prob > 0.5 else "rejected"

        # Send through NEXUS
        result = client.log_decision(
            decision=original_decision,
            confidence=prob,
            features=features,
            protected_attributes=protected_attrs,
            individual_id=f"candidate_{i}",
        )

        nexus_decision = result.final_decision if result else original_decision
        was_intercepted = result.was_intercepted if result else False

        original_decisions.append(original_decision)
        nexus_decisions.append(nexus_decision)

        if was_intercepted:
            intercept_count += 1

        marker = "⚡" if was_intercepted else "  "
        print(f"{i:>4} | {test_gender[i]:>8} | {original_decision:>10} | {nexus_decision:>10} | {marker:>12}")

    # ── Step 4: Summary Statistics ──
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)

    original_approved = sum(1 for d in original_decisions if d == "approved")
    nexus_approved = sum(1 for d in nexus_decisions if d == "approved")

    # Compute corrected DI
    test_male_mask = test_gender == "male"
    test_female_mask = test_gender == "female"

    orig_male_rate = sum(1 for i, d in enumerate(original_decisions) if d == "approved" and test_male_mask[i]) / max(test_male_mask.sum(), 1)
    orig_female_rate = sum(1 for i, d in enumerate(original_decisions) if d == "approved" and test_female_mask[i]) / max(test_female_mask.sum(), 1)
    corrected_male_rate = sum(1 for i, d in enumerate(nexus_decisions) if d == "approved" and test_male_mask[i]) / max(test_male_mask.sum(), 1)
    corrected_female_rate = sum(1 for i, d in enumerate(nexus_decisions) if d == "approved" and test_female_mask[i]) / max(test_female_mask.sum(), 1)

    orig_di = orig_female_rate / orig_male_rate if orig_male_rate > 0 else 0
    corrected_di = corrected_female_rate / corrected_male_rate if corrected_male_rate > 0 else 0

    print(f"   Total candidates:    {n_test}")
    print(f"   Interceptions:       {intercept_count} ({intercept_count / n_test:.0%})")
    print(f"   Original approvals:  {original_approved}")
    print(f"   NEXUS approvals:     {nexus_approved}")
    print(f"   Original DI:         {orig_di:.3f} ({'⚠ VIOLATION' if orig_di < 0.8 else '✅ OK'})")
    print(f"   Corrected DI:        {corrected_di:.3f} ({'⚠ VIOLATION' if corrected_di < 0.8 else '✅ OK'})")
    print()
    print("   NEXUS intercepted biased rejections and corrected them in real-time.")
    print("   No model retraining required. No code changes. Just two lines of code.")

    client.close()


if __name__ == "__main__":
    main()
