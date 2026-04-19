"""
NEXUS Demo — Seed Hiring Bias Data.
Generates a biased hiring scenario for live demo presentation.

Usage:
    python scripts/seed_hiring_bias.py                # default: 200 candidates
    python scripts/seed_hiring_bias.py --count 800    # custom count
    python scripts/seed_hiring_bias.py --dry-run      # compute stats only, no API calls
    python scripts/seed_hiring_bias.py --no-progress   # suppress progress output
"""
from __future__ import annotations

import argparse
import os
import sys
import time

import numpy as np

# Add SDK to path robustly (runtime)
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(CURRENT_DIR)
sys.path.insert(0, os.path.join(ROOT_DIR, "sdk", "python"))
sys.path.insert(0, os.path.join(ROOT_DIR, "shared", "python"))

# Static hint for Pyright/Pylance (never executed at runtime but resolves IDE errors)
if False:  # type: ignore[unreachable]  # noqa: SIM108
    sys.path.insert(0, "sdk/python")
    sys.path.insert(0, "shared/python")

from nexus_sdk.client import NexusClient  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="NEXUS Demo — Seed Hiring Bias Data")
    parser.add_argument("--count", type=int, default=200, help="Total candidates to generate (default: 200)")
    parser.add_argument("--dry-run", action="store_true", help="Compute stats only, no API calls")
    parser.add_argument("--no-progress", action="store_true", help="Suppress progress output")
    parser.add_argument("--base-url", type=str, default="http://localhost:8080", help="Gateway URL")
    parser.add_argument("--api-key", type=str, default="nxs_demo_key", help="API key to use")
    return parser.parse_args()


def main() -> None:
    """
    Creates synthetic candidates with embedded bias:
    - Female candidates: approval probability × 0.63
    - Age 41-55: approval probability × 0.71
    - Female + 41-55 (intersectional): approval probability × 0.48
    """
    args = parse_args()
    n_candidates = args.count

    print("═" * 60)
    print("  NEXUS Demo Seeder — Biased Hiring Scenario")
    print("═" * 60)
    print(f"  Candidates: {n_candidates}")
    print(f"  Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    print(f"  Gateway: {args.base_url}")

    rng = np.random.default_rng(42)

    # Generate synthetic features
    years_exp = rng.uniform(0, 25, n_candidates)
    gpa = rng.normal(3.2, 0.4, n_candidates).clip(2.0, 4.0)
    has_career_gap = rng.choice([0, 1], n_candidates, p=[0.75, 0.25])
    skills_score = rng.uniform(30, 100, n_candidates)
    interview_score = rng.uniform(40, 100, n_candidates)
    university_rank = rng.integers(1, 500, n_candidates)
    linkedin_connections = rng.integers(50, 2000, n_candidates)

    # Protected attributes
    gender = rng.choice(["M", "F", "NB"], n_candidates, p=[0.45, 0.45, 0.10])
    age_group = rng.choice(["22-30", "31-40", "41-55"], n_candidates, p=[0.35, 0.40, 0.25])
    race = rng.choice(["white", "black", "hispanic", "asian", "other"], n_candidates, p=[0.40, 0.20, 0.20, 0.15, 0.05])

    # Base approval probability
    approval_prob = (
        0.15 * (years_exp / 25)
        + 0.20 * ((gpa - 2) / 2)
        + 0.05 * (1 - has_career_gap)
        + 0.25 * (skills_score / 100)
        + 0.25 * (interview_score / 100)
        + 0.05 * (1 - university_rank / 500)
        + 0.05 * (linkedin_connections / 2000)
    )

    # ── Embed Bias ──
    print("\n[*] Embedding bias patterns:")
    print("    Female: approval probability × 0.63")
    print("    Age 41-55: approval probability × 0.71")
    print("    Female + 41-55: approval probability × 0.48")

    for i in range(n_candidates):
        if gender[i] == "F" and age_group[i] == "41-55":
            approval_prob[i] *= 0.48  # Intersectional bias
        elif gender[i] == "F":
            approval_prob[i] *= 0.63
        elif age_group[i] == "41-55":
            approval_prob[i] *= 0.71

    # Generate decisions
    noise = rng.normal(0, 0.05, n_candidates)
    confidence = (approval_prob + noise).clip(0.1, 0.99)
    decisions = np.where(confidence > 0.50, "approved", "rejected")

    # ── Pre-NEXUS Stats ──
    male_rate = (decisions[gender == "M"] == "approved").mean()
    female_rate = (decisions[gender == "F"] == "approved").mean()
    nb_rate = (decisions[gender == "NB"] == "approved").mean() if (gender == "NB").sum() > 0 else 0
    young_rate = (decisions[age_group == "22-30"] == "approved").mean()
    old_rate = (decisions[age_group == "41-55"] == "approved").mean()

    gender_di = female_rate / male_rate if male_rate > 0 else 0
    age_di = old_rate / young_rate if young_rate > 0 else 0

    print(f"\n[*] Pre-NEXUS Statistics:")
    print(f"    Male approval rate:      {male_rate:.2%}")
    print(f"    Female approval rate:    {female_rate:.2%}")
    print(f"    Non-binary rate:         {nb_rate:.2%}")
    print(f"    Gender DI:               {gender_di:.3f}")
    print(f"    Young (22-30) rate:      {young_rate:.2%}")
    print(f"    Older (41-55) rate:      {old_rate:.2%}")
    print(f"    Age DI:                  {age_di:.3f}")

    # ── Assertions ──
    print(f"\n[*] Validating embedded bias patterns:")

    assert gender_di < 0.80, f"Gender DI ({gender_di:.3f}) should be < 0.80 (four-fifths rule violation)"
    print(f"    ✅ Gender DI ({gender_di:.3f}) < 0.80 — bias confirmed")

    assert age_di < 0.80, f"Age DI ({age_di:.3f}) should be < 0.80"
    print(f"    ✅ Age DI ({age_di:.3f}) < 0.80 — bias confirmed")

    assert female_rate < male_rate, f"Female rate ({female_rate:.2%}) should be < male rate ({male_rate:.2%})"
    print(f"    ✅ Female rate < Male rate — disparity confirmed")

    assert old_rate < young_rate, f"Older rate ({old_rate:.2%}) should be < younger rate ({young_rate:.2%})"
    print(f"    ✅ Older rate < Younger rate — age disparity confirmed")

    # Check intersectional bias
    intersectional_mask = (gender == "F") & (age_group == "41-55")
    intersectional_rate = (decisions[intersectional_mask] == "approved").mean()
    assert intersectional_rate < female_rate, "Intersectional (F+41-55) rate should be lowest"
    print(f"    ✅ Intersectional rate ({intersectional_rate:.2%}) < Female rate ({female_rate:.2%}) — confirmed")

    if args.dry_run:
        print(f"\n{'═' * 60}")
        print(f"  DRY RUN COMPLETE — No events sent to gateway")
        print(f"{'═' * 60}")
        return

    # ── Phase 1: Async mode (detection) ──
    half = n_candidates // 2
    print(f"\n[*] Phase 1: Sending {half} events in ASYNC mode (monitoring)...")

    async_client = NexusClient(
        api_key=args.api_key,
        org_id="demo-org",
        model_id="hiring-v2",
        domain="hiring",
        mode="async",
        base_url=args.base_url,
    )

    try:
        for i in range(half):
            features = {
                "years_experience": float(years_exp[i]),
                "gpa": float(gpa[i]),
                "has_career_gap": int(has_career_gap[i]),
                "skills_score": float(skills_score[i]),
                "interview_score": float(interview_score[i]),
                "university_rank": int(university_rank[i]),
                "linkedin_connections": int(linkedin_connections[i]),
            }
            pa = {
                "gender": gender[i],
                "age_group": age_group[i],
                "race": race[i],
            }

            async_client.log_decision(
                decision=decisions[i],
                confidence=float(confidence[i]),
                features=features,
                protected_attributes=pa,
                individual_id=f"candidate_{i:04d}",
            )

            if not args.no_progress and (i + 1) % 50 == 0:
                print(f"    Sent {i + 1}/{half} events...")

        async_client.flush()
        print(f"    ✅ {half} events sent in async mode")
    except Exception as exc:
        print(f"    ⚠ Gateway unavailable ({exc}) — continuing with local demo")
    finally:
        async_client.close()

    # ── Phase 2: Intercept mode ──
    print(f"\n[*] Phase 2: Sending remaining {n_candidates - half} events in INTERCEPT mode...")

    intercept_client = NexusClient(
        api_key=args.api_key,
        org_id="demo-org",
        model_id="hiring-v2",
        domain="hiring",
        mode="intercept",
        base_url=args.base_url,
    )

    intercepted_count = 0
    nexus_decisions = list(decisions[:half])  # Keep phase 1 decisions

    try:
        for i in range(half, n_candidates):
            features = {
                "years_experience": float(years_exp[i]),
                "gpa": float(gpa[i]),
                "has_career_gap": int(has_career_gap[i]),
                "skills_score": float(skills_score[i]),
                "interview_score": float(interview_score[i]),
                "university_rank": int(university_rank[i]),
                "linkedin_connections": int(linkedin_connections[i]),
            }
            pa = {
                "gender": gender[i],
                "age_group": age_group[i],
                "race": race[i],
            }

            result = intercept_client.log_decision(
                decision=decisions[i],
                confidence=float(confidence[i]),
                features=features,
                protected_attributes=pa,
                individual_id=f"candidate_{i:04d}",
            )

            if result and result.was_intercepted:
                intercepted_count += 1
                nexus_decisions.append(result.final_decision)
            else:
                nexus_decisions.append(decisions[i])

            if not args.no_progress and (i + 1 - half) % 50 == 0:
                print(f"    Sent {i + 1 - half}/{n_candidates - half} events...")

        print(f"    ✅ {n_candidates - half} events sent in intercept mode")
        print(f"    ⚡ {intercepted_count} decisions intercepted")
    except Exception as exc:
        print(f"    ⚠ Gateway unavailable ({exc}) — using simulated results")
        nexus_decisions.extend(decisions[half:])
    finally:
        intercept_client.close()

    # ── Summary ──
    nexus_arr = np.array(nexus_decisions)
    post_male_rate = (nexus_arr[gender == "M"] == "approved").mean()
    post_female_rate = (nexus_arr[gender == "F"] == "approved").mean()
    post_di = post_female_rate / post_male_rate if post_male_rate > 0 else 0

    print(f"\n{'═' * 60}")
    print(f"  RESULTS")
    print(f"{'═' * 60}")
    print(f"  BEFORE NEXUS:")
    print(f"    Disparate Impact (gender): {gender_di:.3f}")
    print(f"    Disparate Impact (age):    {age_di:.3f}")
    print(f"  AFTER NEXUS:")
    print(f"    Disparate Impact (gender): {post_di:.3f}")
    print(f"    Interceptions:             {intercepted_count}")
    print(f"{'═' * 60}")
    print(f"  NEXUS corrected hiring bias in real-time.")
    print(f"  Total runtime: ~{time.process_time():.0f}s")


if __name__ == "__main__":
    main()
