"""Configuration settings for CardioMap 3D API."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings with environment variable support."""

    app_name: str = "CardioMap 3D API"
    app_version: str = "0.1.0"
    debug: bool = False
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    # Paths
    base_dir: Path = Path(__file__).resolve().parent.parent.parent
    artifacts_dir: Path = base_dir / "artifacts"
    data_dir: Path = base_dir / "data"

    model_config = SettingsConfigDict(env_prefix="CARDIOMAP_", case_sensitive=False)


settings = Settings()
