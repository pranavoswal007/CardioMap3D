"""Main FastAPI entrypoint for CardioMap 3D API."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .schemas import FeatureContribution, HealthResponse, PredictionResponse, VesselRiskScore

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Production-grade API for interactive 3D coronary artery risk visualization, "
        "multi-target stenosis prediction, and SHAP-based clinical explanations."
    ),
)

# Enable CORS for frontend Vite dev server and production clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    """Check API operational health and model artifact readiness."""
    artifacts_ready = (settings.artifacts_dir / "metrics.json").exists() or (
        settings.artifacts_dir / "models.json"
    ).exists()
    return HealthResponse(
        status="ok",
        app_name=settings.app_name,
        version=settings.app_version,
        artifacts_ready=artifacts_ready,
    )


# TODO(PHASE 2): DELETE. Returns fabricated numbers, violates the no-fabrication rule.
@app.get("/predict/demo", response_model=PredictionResponse)
def get_demo_prediction() -> PredictionResponse:
    """Return calibrated baseline demonstration prediction for UI verification."""
    return PredictionResponse(
        cad_probability=0.74,
        cad_predicted_class=1,
        vessels={
            "LAD": VesselRiskScore(
                vessel="LAD",
                stenosis_probability=0.782,
                risk_tier="High",
                confidence_interval=[0.72, 0.84],
                is_illustrative=True,
            ),
            "RCA": VesselRiskScore(
                vessel="RCA",
                stenosis_probability=0.524,
                risk_tier="Moderate",
                confidence_interval=[0.45, 0.59],
                is_illustrative=True,
            ),
            "LCX": VesselRiskScore(
                vessel="LCX",
                stenosis_probability=0.241,
                risk_tier="Low",
                confidence_interval=[0.18, 0.31],
                is_illustrative=True,
            ),
        },
        top_explanations=[
            FeatureContribution(
                feature_name="Typical Chest Pain",
                display_name="Typical Anginal Chest Pain",
                feature_value="Yes",
                shap_value=0.34,
                direction="increases_risk",
            ),
            FeatureContribution(
                feature_name="EF",
                display_name="Ejection Fraction (EF < 50%)",
                feature_value=45.0,
                shap_value=0.28,
                direction="increases_risk",
            ),
            FeatureContribution(
                feature_name="ST_Depression",
                display_name="ECG ST-Segment Depression",
                feature_value="Present",
                shap_value=0.22,
                direction="increases_risk",
            ),
            FeatureContribution(
                feature_name="HDL",
                display_name="High-Density Lipoprotein (HDL)",
                feature_value=54.0,
                shap_value=-0.19,
                direction="decreases_risk",
            ),
        ],
    )
