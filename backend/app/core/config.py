"""
Application Configuration and Environment Settings

Loads configuration settings from environment variables or a `.env` file
using Pydantic BaseSettings for strict type validation and secure defaults.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """System-wide configuration settings with environment variable fallbacks."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # PostgreSQL Database Connection URI (using psycopg v3 driver)
    database_url: str = "postgresql+psycopg://newtonite:newtonite@localhost:5432/newtonite"

    # JWT Authentication Parameters
    jwt_secret: str = "dev-only-change-me"
    jwt_expire_minutes: int = 480  # Default 8 hours
    jwt_algorithm: str = "HS256"

    # Comma-separated CORS allowed origins (e.g., local Vite dev server and Nginx production port)
    cors_origins: str = "http://localhost:5173,http://localhost:8080"

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse comma-delimited cors_origins string into a clean list of allowed origin URLs."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


# Global singleton settings instance
settings = Settings()

