"""Placeholder training script for CardioMap 3D ML pipeline."""

import argparse
import sys
from pathlib import Path

from cardiomap_ml.config import RANDOM_SEED, assert_no_target_leakage, set_seed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train CardioMap 3D multi-vessel prediction pipeline"
    )
    parser.add_argument(
        "--seed", type=int, default=RANDOM_SEED, help="Random seed for reproducibility"
    )
    parser.add_argument(
        "--artifacts-dir", type=str, default="artifacts", help="Path to artifacts output directory"
    )
    parser.add_argument(
        "--data-path",
        type=str,
        default="data/raw/z_alizadeh_sani_extension.xlsx",
        help="Raw dataset path",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    set_seed(args.seed)
    print("=== CardioMap 3D ML Training Pipeline (Phase 0 Skeleton) ===")
    print(f"Random seed set to: {args.seed}")

    # Enforce target leakage check on a sample feature list to verify assertion logic
    sample_features = [
        "Age",
        "Weight",
        "Length",
        "Sex",
        "BMI",
        "DM",
        "HTN",
        "Current Smoker",
        "BP",
        "PR",
        "Typical Chest Pain",
    ]
    assert_no_target_leakage(sample_features)
    print("Target leakage assertion verified: 0 forbidden target columns in feature space.")

    artifacts_path = Path(args.artifacts_dir)
    artifacts_path.mkdir(parents=True, exist_ok=True)
    print(f"Artifacts directory ready: {artifacts_path.resolve()}")
    print("Phase 0 skeleton training check passed successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
