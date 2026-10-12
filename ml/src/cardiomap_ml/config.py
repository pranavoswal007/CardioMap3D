"""Configuration and safety assertions for CardioMap 3D ML pipeline."""

import os
import random
from collections.abc import Sequence

import numpy as np

# Global deterministic random seed (Hard rule 7)
RANDOM_SEED: int = 42

# Primary target prediction columns
TARGET_COLUMNS: tuple[str, ...] = ("Cath", "LAD", "LCX", "RCA")

# Exact forbidden target set: LAD, LCX, RCA, Cath, plus target label CAD
FORBIDDEN_TARGET_NAMES: tuple[str, ...] = ("LAD", "LCX", "RCA", "Cath", "CAD")


def normalize_column_name(name: str) -> str:
    """Normalize a column name by stripping whitespace, lowercasing, and removing separators."""
    return name.strip().lower().replace("_", "").replace("-", "").replace(" ", "")


# Normalized set of forbidden target names for leak-checking
FORBIDDEN_LEAKAGE_TARGETS: frozenset[str] = frozenset(
    normalize_column_name(t) for t in FORBIDDEN_TARGET_NAMES
)


def set_seed(seed: int = RANDOM_SEED) -> None:
    """Set random seeds across Python, NumPy, and environment for strict reproducibility."""
    random.seed(seed)
    np.random.seed(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)


def assert_no_target_leakage(
    feature_names: Sequence[str],
    forbidden_targets: frozenset[str] | Sequence[str] = FORBIDDEN_LEAKAGE_TARGETS,
) -> None:
    """Strictly assert that no target or post-catheterization vessel column exists in features.

    Matching uses exact normalized-name matching (stripping whitespace, lowercasing,
    and removing underscores, hyphens, and spaces). Legitimate features containing forbidden
    letter sequences as substrings are not blocked.

    Raises:
        AssertionError: If any target or angiography outcome is present in feature_names.
    """
    normalized_forbidden = {normalize_column_name(t) for t in forbidden_targets}
    leaked = [
        f for f in feature_names if normalize_column_name(f) in normalized_forbidden
    ]
    if leaked:
        raise AssertionError(
            f"CRITICAL TARGET LEAKAGE DETECTED! Features contain forbidden target columns: {leaked}. "
            f"LAD, LCX, RCA, Cath, and CAD must NEVER be model input features."
        )
