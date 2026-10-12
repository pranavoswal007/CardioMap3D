"""Configuration settings for CardioMap 3D API."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings with environment variable support."""

    app_name: str = "CardioMap 3D API"
    app_version: str = "0.2.0"
    debug: bool = False
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*",
    ]

    # Clinical risk classification configuration
    risk_level_margin: float = 0.15
    clip_min: float = 0.01
    clip_max: float = 0.99

    disclaimer: str = (
        "CardioMap 3D is a clinical decision-support and educational research tool. "
        "Predictions represent statistical stenosis risk associations and do not replace "
        "coronary angiography or professional clinical judgment."
    )

    # Paths
    base_dir: Path = Path(__file__).resolve().parent.parent.parent
    artifacts_dir: Path = base_dir / "artifacts"
    data_dir: Path = base_dir / "data"

    model_config = SettingsConfigDict(env_prefix="CARDIOMAP_", case_sensitive=False)


settings = Settings()
