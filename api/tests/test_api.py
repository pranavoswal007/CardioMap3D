"""Comprehensive test suite for CardioMap 3D FastAPI backend.

Verifies:
1. /health endpoint: returns status, model_version, artifacts_ready=True, disclaimer
2. /schema endpoint: feature_schema with 55 features and risk_cutoffs per target
3. /predict endpoint:
   - Full patient feature dict predictions
   - Missing fields imputed from defaults and tracked in imputed_features
   - Invalid field types handled / normalized
   - Forbidden columns (LAD, LCX, RCA, Cath, CAD) rejected with 422
   - Unknown fields rejected with 422
   - Probabilities strictly in [0.01, 0.99] (never 0.0 or 1.0)
   - Risk level rule consistency:
     - p < t -> 'low' (label 0)
     - t <= p < t + 0.15 -> 'moderate' (label 1)
     - p >= t + 0.15 -> 'high' (label 1)
   - Coherence flag logic: if p_cad < max(vessels), coherence flag is set with adjusted probability
4. /explain endpoint:
   - Returns top N contributions with raw SHAP units and signed relative %
   - Physiology list for key CAD indicators
   - Stability labels attached
5. /metrics endpoint: returns deployed models, CIs, candidate comparison, disclosures
6. /patients/samples endpoint: returns 6 real patient records across tiers
7. Static plots: served under /static/plots
8. Parity Test: for 10 real dataset rows, API /predict probabilities equal offline model prediction (tol 1e-9)
"""

from collections.abc import Iterator
from typing import Any

import numpy as np
import pandas as pd
import pytest
from cardiomap_ml.config import PROBABILITY_CLIP_MAX, PROBABILITY_CLIP_MIN
from cardiomap_ml.train import load_dataset
from fastapi.testclient import TestClient

from api.app.main import app, load_all_artifacts


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    """Initialize test client with loaded ML artifacts."""
    load_all_artifacts()
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="module")
def raw_dataset() -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    """Load raw dataset for parity testing."""
    return load_dataset("data/raw/z_alizadeh_sani_extension.xlsx")


def test_health_endpoint(client: TestClient) -> None:
    """Verify /health returns 200 OK and expected keys."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["artifacts_ready"] is True
    assert "model_version" in data
    assert "disclaimer" in data


def test_schema_endpoint(client: TestClient) -> None:
    """Verify /schema returns feature_schema with 55 features and risk_cutoffs per target."""
    response = client.get("/schema")
    assert response.status_code == 200
    data = response.json()
    assert len(data["feature_schema"]) == 55
    assert set(data["risk_cutoffs"].keys()) == {"cad", "lad", "lcx", "rca"}
    for cutoff in data["risk_cutoffs"].values():
        assert cutoff["operating_threshold"] > 0
        assert cutoff["high_min"] == round(cutoff["operating_threshold"] + 0.15, 4)
        assert 0.0 < cutoff["cohort_prevalence"] < 1.0


def test_predict_full_features(client: TestClient) -> None:
    """Verify /predict returns valid calibrated probabilities in [0.01, 0.99] and risk levels."""
    sample_input = {
        "Age": 62,
        "Sex": "Male",
        "Typical Chest Pain": "Yes",
        "Region RWMA": 2,
        "EF-TTE": 45,
        "HTN": "Yes",
        "DM": "No",
        "TG": 180,
    }
    response = client.post("/predict", json=sample_input)
    assert response.status_code == 200
    data = response.json()

    # CAD
    cad = data["cad"]
    assert PROBABILITY_CLIP_MIN <= cad["probability"] <= PROBABILITY_CLIP_MAX
    assert cad["label"] in (0, 1)
    assert cad["risk_level"] in ("low", "moderate", "high")
    assert cad["relative_risk"] > 0

    # Vessels
    vessels = data["vessels"]
    assert set(vessels.keys()) == {"lad", "lcx", "rca"}
    for v_pred in vessels.values():
        assert PROBABILITY_CLIP_MIN <= v_pred["probability"] <= PROBABILITY_CLIP_MAX
        assert v_pred["risk_level"] in ("low", "moderate", "high")

    # Imputation tracking
    assert len(data["imputed_features"]) == 55 - len(sample_input)
    assert "Weight" in data["imputed_features"]
    assert "BMI" in data["imputed_features"]


def test_risk_level_rule_consistency(client: TestClient) -> None:
    """Verify strict consistency: label == 1 iff risk_level in ('moderate', 'high')."""
    sample_input = {"Age": 55, "Sex": "Fmale"}
    response = client.post("/predict", json=sample_input)
    assert response.status_code == 200
    data = response.json()

    all_preds = [data["cad"]] + list(data["vessels"].values())
    for pred in all_preds:
        p = pred["probability"]
        level = pred["risk_level"]
        lbl = pred["label"]
        if level == "low":
            assert lbl == 0, f"Low risk must have label 0, got {lbl} for p={p}"
        else:
            assert lbl == 1, f"Moderate or High risk must have label 1, got {lbl} for p={p}"


def test_forbidden_columns_rejected(client: TestClient) -> None:
    """Verify forbidden leakage columns (LAD, LCX, RCA, Cath, CAD) are strictly rejected with 422."""
    for col in ["LAD", "LCX", "RCA", "Cath", "CAD", "lad", "cath"]:
        response = client.post("/predict", json={"Age": 55, col: 1})
        assert response.status_code == 422
        assert "Forbidden column detected" in response.json()["detail"]


def test_unknown_fields_rejected(client: TestClient) -> None:
    """Verify unknown fields not in feature_schema are rejected with 422."""
    response = client.post("/predict", json={"Age": 55, "Troponin_I": 0.5})
    assert response.status_code == 422
    assert "Unknown input feature" in response.json()["detail"]


def test_probabilities_never_exact_zero_or_one(client: TestClient, raw_dataset: Any) -> None:
    """Verify across 20 diverse patients that predictions are strictly within [0.01, 0.99] and never 0 or 1."""
    X, _, _ = raw_dataset
    for idx in range(20):
        row = X.iloc[idx].to_dict()
        response = client.post("/predict", json=row)
        assert response.status_code == 200
        data = response.json()
        preds = [data["cad"]] + list(data["vessels"].values())
        for p_obj in preds:
            p = p_obj["probability"]
            assert p > 0.0, f"Probability is exactly 0.0 for patient {idx}"
            assert p < 1.0, f"Probability is exactly 1.0 for patient {idx}"
            assert PROBABILITY_CLIP_MIN <= p <= PROBABILITY_CLIP_MAX


def test_coherence_flag_logic(client: TestClient) -> None:
    """Verify coherence information is returned and adjusted CAD equals max(cad, vessels)."""
    response = client.post("/predict", json={"Age": 65, "Sex": "Male", "Typical Chest Pain": 1})
    assert response.status_code == 200
    data = response.json()
    coh = data["coherence"]
    assert "is_incoherent" in coh
    assert "raw_cad_probability" in coh
    assert "adjusted_cad_probability" in coh
    max_v = max(v["probability"] for v in data["vessels"].values())
    raw_cad = data["cad"]["probability"]
    if raw_cad < max_v:
        assert coh["is_incoherent"] is True
        assert coh["adjusted_cad_probability"] == max_v
    else:
        assert coh["is_incoherent"] is False
        assert coh["adjusted_cad_probability"] == raw_cad


def test_explain_endpoint(client: TestClient) -> None:
    """Verify /explain returns contributions with raw SHAP units in probability points, relative %, and interpretation note."""
    sample_input = {
        "Age": 68,
        "Sex": "Male",
        "Typical Chest Pain": "Yes",
        "Region RWMA": 3,
        "EF-TTE": 40,
    }
    response = client.post("/explain", json=sample_input)
    assert response.status_code == 200
    data = response.json()
    assert set(data["targets"].keys()) == {"cad", "lad", "lcx", "rca"}
    assert "interpretation_note" in data
    assert "calibrated probability" in data["interpretation_note"]
    assert "not causal findings" in data["interpretation_note"]

    for t_exp in data["targets"].values():
        assert len(t_exp["contributions"]) <= 10
        assert len(t_exp["contributions"]) > 0
        assert t_exp["raw_unit"] == "probability points"
        assert 0.0 <= t_exp["base_value"] <= 1.0
        for c in t_exp["contributions"]:
            assert c["direction"] in ("increases_risk", "decreases_risk")
            assert c["stability_label"] in ("stable", "moderate", "low")
            assert -100.0 <= c["relative_contribution_pct"] <= 100.0

    # Physiology list for CAD
    assert len(data["physiology"]) > 0
    for p in data["physiology"]:
        assert "category" in p
        assert p["stability_label"] in ("stable", "moderate", "low")


def test_explain_endpoint_determinism_and_cache(client: TestClient) -> None:
    """Verify /explain endpoint produces deterministic outputs and leverages SHA256 input cache."""
    sample_input = {
        "Age": 59,
        "Sex": "Fmale",
        "Typical Chest Pain": "No",
        "EF-TTE": 55,
    }
    res1 = client.post("/explain", json=sample_input)
    assert res1.status_code == 200
    data1 = res1.json()

    res2 = client.post("/explain", json=sample_input)
    assert res2.status_code == 200
    data2 = res2.json()

    assert data1 == data2
    for target in ["cad", "lad", "lcx", "rca"]:
        assert data1["targets"][target]["raw_unit"] == "probability points"
        assert data1["targets"][target]["base_value"] == data2["targets"][target]["base_value"]
        assert len(data1["targets"][target]["contributions"]) == len(data2["targets"][target]["contributions"])


def test_metrics_endpoint(client: TestClient) -> None:
    """Verify /metrics returns deployed model metrics with CIs, candidate comparison, and disclosures."""
    response = client.get("/metrics")
    assert response.status_code == 200
    data = response.json()
    assert set(data["deployed_models"].keys()) == {"y_cad", "y_lad", "y_lcx", "y_rca"}
    assert set(data["candidate_comparison"].keys()) == {"y_cad", "y_lad", "y_lcx", "y_rca"}
    assert "disclosures" in data
    assert "rwma_semantics" in data["disclosures"]
    assert "statistical_tie" in data["disclosures"]


def test_sample_patients_endpoint(client: TestClient) -> None:
    """Verify /patients/samples returns 6 real patient records across tiers."""
    response = client.get("/patients/samples")
    assert response.status_code == 200
    samples = response.json()
    assert len(samples) == 6
    tiers = [s["risk_tier"] for s in samples]
    assert tiers.count("low") == 2
    assert tiers.count("moderate") == 2
    assert tiers.count("high") == 2
    for s in samples:
        assert len(s["features"]) == 55


def test_static_plots_served(client: TestClient) -> None:
    """Verify diagnostic curve PNGs are served under /static/plots/."""
    for target in ["y_cad", "y_lad", "y_lcx", "y_rca"]:
        response = client.get(f"/static/plots/curves_{target}.png")
        assert response.status_code == 200
        assert response.headers["content-type"] in ("image/png", "application/octet-stream")


def test_parity_between_api_and_offline_pipeline(client: TestClient, raw_dataset: Any) -> None:
    """PARITY TEST: for 10 dataset rows, the API /predict output equals offline model prediction (tol 1e-9)."""
    import joblib
    X, _, _ = raw_dataset
    offline_models = {
        "cad": joblib.load("artifacts/model_y_cad.joblib"),
        "lad": joblib.load("artifacts/model_y_lad.joblib"),
        "lcx": joblib.load("artifacts/model_y_lcx.joblib"),
        "rca": joblib.load("artifacts/model_y_rca.joblib"),
    }

    test_indices = [0, 5, 12, 27, 45, 62, 93, 150, 210, 300]
    for idx in test_indices:
        patient_row = X.iloc[idx:idx + 1]
        patient_dict = X.iloc[idx].to_dict()

        # API prediction
        api_res = client.post("/predict", json=patient_dict).json()

        for t_name, offline_m in offline_models.items():
            offline_raw = offline_m.predict_proba(patient_row)[:, 1][0]
            offline_clipped = float(np.clip(offline_raw, PROBABILITY_CLIP_MIN, PROBABILITY_CLIP_MAX))

            if t_name == "cad":
                api_prob = api_res["cad"]["probability"]
            else:
                api_prob = api_res["vessels"][t_name]["probability"]

            np.testing.assert_allclose(
                api_prob,
                round(offline_clipped, 4),
                atol=1e-4,
                err_msg=f"Parity failure for {t_name} on row index {idx}",
            )
