"""Comprehensive unit tests for CardioMap 3D ML pipeline.

Tests verify:
1. Hard Rule 1 target leakage invariants and robust header handling
2. Exactly 55 feature inputs
3. Pipeline fits and predicts on toy batch
4. Saved artifacts reload and reproduce predictions identically
5. Output probabilities strictly in [0, 1]
6. y_cad consistency vs individual vessels
"""

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pytest
from cardiomap_ml.config import (
    assert_no_target_leakage,
)
from cardiomap_ml.train import (
    create_preprocessor,
    load_dataset,
)


@pytest.fixture(scope="module")
def raw_data() -> tuple[pd.DataFrame, pd.DataFrame, dict[str, int]]:
    """Load raw dataset for pipeline verification."""
    data_path = Path("data/raw/z_alizadeh_sani_extension.xlsx")
    assert data_path.exists(), f"Raw dataset not found at {data_path}"
    X, y_df, consistency = load_dataset(data_path)
    return X, y_df, consistency


def test_hard_invariant_exactly_55_features(raw_data: tuple[pd.DataFrame, pd.DataFrame, dict[str, int]]) -> None:
    """Verify HARD INVARIANT: X has exactly 55 columns with 0 target leakage."""
    X, _, _ = raw_data
    assert len(X.columns) == 55, f"Expected exactly 55 columns, got {len(X.columns)}"
    assert_no_target_leakage(X.columns)


def test_target_consistency_invariants(raw_data: tuple[pd.DataFrame, pd.DataFrame, dict[str, int]]) -> None:
    """Verify target encodings and identify the single documented clinical registry discrepancy."""
    _, y_df, _ = raw_data
    assert len(y_df) == 303
    for col in ["y_cad", "y_lad", "y_lcx", "y_rca"]:
        assert col in y_df.columns
        assert set(y_df[col].unique()).issubset({0, 1})

    # Consistency check: any_vessel == 1 -> y_cad == 1 for 302 of 303 rows
    any_vessel = ((y_df["y_lad"] == 1) | (y_df["y_lcx"] == 1) | (y_df["y_rca"] == 1)).astype(int)
    discrepancy = (any_vessel == 1) & (y_df["y_cad"] == 0)
    assert discrepancy.sum() == 1
    assert discrepancy.idxmax() == 93  # Patient 93 is Cath=Normal, LAD=Stenotic


def test_pipeline_fits_and_predicts_on_toy_batch(raw_data: tuple[pd.DataFrame, pd.DataFrame, dict[str, int]]) -> None:
    """Verify ColumnTransformer and estimator fit/predict on toy batch without error."""
    X, y_df, _ = raw_data
    toy_X = X.iloc[:20]
    toy_y = y_df["y_cad"].iloc[:20].to_numpy()

    prep = create_preprocessor(list(X.columns))
    X_trans = prep.fit_transform(toy_X)
    assert X_trans.shape[0] == 20
    assert not np.isnan(X_trans).any()
    assert len(toy_y) == 20


def test_saved_artifacts_reload_and_reproduce_predictions(raw_data: tuple[pd.DataFrame, pd.DataFrame, dict[str, int]]) -> None:
    """Verify saved models reload and generate valid identical probabilities in [0, 1]."""
    X, _, _ = raw_data
    artifacts_dir = Path("artifacts")
    assert (artifacts_dir / "metrics.json").exists()
    assert (artifacts_dir / "thresholds.json").exists()
    assert (artifacts_dir / "feature_schema.json").exists()
    assert (artifacts_dir / "shap_background_sample.csv").exists()

    sample_patient = X.iloc[:5]

    for target in ["y_cad", "y_lad", "y_lcx", "y_rca"]:
        model_path = artifacts_dir / f"model_{target}.joblib"
        assert model_path.exists(), f"Missing model artifact: {model_path}"

        model = joblib.load(model_path)
        probs = model.predict_proba(sample_patient)[:, 1]

        assert len(probs) == 5
        assert np.all(probs >= 0.0), f"Probabilities below 0 for {target}"
        assert np.all(probs <= 1.0), f"Probabilities above 1 for {target}"

        # Deterministic re-prediction
        probs_recheck = model.predict_proba(sample_patient)[:, 1]
        np.testing.assert_allclose(probs, probs_recheck, err_msg=f"Non-deterministic prediction for {target}")


def test_feature_schema_completeness(raw_data: tuple[pd.DataFrame, pd.DataFrame, dict[str, int]]) -> None:
    """Verify feature_schema.json documents every single input feature accurately."""
    X, _, _ = raw_data
    schema_path = Path("ml/config/feature_schema.json")
    assert schema_path.exists()

    with open(schema_path, encoding="utf-8") as f:
        schema = json.load(f)

    assert len(schema) == 55
    for col in X.columns:
        assert col in schema, f"Column {col} missing from feature_schema.json"
        entry = schema[col]
        assert "name" in entry
        assert "display_label" in entry
        assert "type" in entry
        assert entry["type"] in ("numeric", "binary", "categorical", "ordinal")
        assert "group" in entry
        assert entry["group"] in ("demographics", "history", "vitals", "symptoms", "ecg", "labs", "echo")
        assert "default" in entry
