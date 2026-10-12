"""Pydantic v2 schemas for CardioMap 3D API."""


from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Health check status response."""

    status: str = Field(default="ok", description="API operational status")
    app_name: str
    version: str
    artifacts_ready: bool = Field(description="Whether trained ML model artifacts exist")
    disclaimer: str = Field(
        default="CardioMap 3D is for educational/decision-support research only. Not a substitute for formal diagnostic imaging."
    )


class VesselRiskScore(BaseModel):
    """Vessel-level stenosis risk prediction and calibration details."""

    vessel: str = Field(description="Coronary vessel identifier: LAD, LCX, or RCA")
    stenosis_probability: float = Field(
        ge=0.0, le=1.0, description="Calibrated risk probability of significant stenosis (>50%)"
    )
    risk_tier: str = Field(description="Low (<30%), Moderate (30-70%), or High (>70%)")
    confidence_interval: list[float] | None = Field(
        default=None, description="95% CI from bootstrap or ensemble variance"
    )
    is_illustrative: bool = Field(
        default=True, description="Vessel lumen visualization mapping is strictly illustrative"
    )


class FeatureContribution(BaseModel):
    """Feature SHAP contribution for explainability."""

    feature_name: str
    display_name: str
    feature_value: float | str
    shap_value: float
    direction: str = Field(description="'increases_risk' or 'decreases_risk'")


class PredictionResponse(BaseModel):
    """Multi-vessel CAD prediction response with SHAP attributions."""

    cad_probability: float = Field(ge=0.0, le=1.0)
    cad_predicted_class: int
    vessels: dict[str, VesselRiskScore]
    top_explanations: list[FeatureContribution]
    clinical_disclaimer: str = Field(
        default="Decision support only. Predictions are vessel-level probabilities and do not localize lesions. Not a substitute for coronary angiography."
    )
