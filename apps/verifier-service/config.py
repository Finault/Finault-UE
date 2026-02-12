"""
Finault Verifier Configuration

Production-ready configuration for the verification API server.
Supports environment-based configuration and secrets management.
"""

import os
from functools import lru_cache
from typing import Optional
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings with environment variable support."""

    # Server
    app_name: str = "Finault Verification API"
    version: str = "2.0.0"
    environment: str = Field(default="development", env="FINAULT_ENV")
    debug: bool = Field(default=False, env="DEBUG")

    # Server binding
    host: str = Field(default="0.0.0.0", env="HOST")
    port: int = Field(default=8000, env="PORT")
    workers: int = Field(default=4, env="WORKERS")

    # Security
    api_key_header: str = "X-API-Key"
    jwt_secret: str = Field(default="change-me-in-production", env="JWT_SECRET")
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24

    # HMAC for webhook signatures
    hmac_secret: str = Field(default="change-me-in-production", env="HMAC_SECRET")

    # Rate limiting
    rate_limit_requests: int = Field(default=100, env="RATE_LIMIT_REQUESTS")
    rate_limit_window_seconds: int = Field(default=60, env="RATE_LIMIT_WINDOW")

    # File upload limits
    max_upload_size_mb: int = Field(default=100, env="MAX_UPLOAD_SIZE_MB")

    # Database (for audit logs and receipt storage)
    database_url: Optional[str] = Field(default=None, env="DATABASE_URL")

    # Object storage (R2/S3)
    storage_endpoint: Optional[str] = Field(default=None, env="STORAGE_ENDPOINT")
    storage_bucket: str = Field(default="finault-closepacks", env="STORAGE_BUCKET")
    storage_access_key: Optional[str] = Field(default=None, env="STORAGE_ACCESS_KEY")
    storage_secret_key: Optional[str] = Field(default=None, env="STORAGE_SECRET_KEY")

    # Anchoring
    anchor_ethereum_rpc: Optional[str] = Field(default=None, env="ANCHOR_ETH_RPC")
    anchor_arweave_gateway: str = Field(default="https://arweave.net", env="ANCHOR_ARWEAVE")
    anchor_mode: str = Field(default="SOFT", env="ANCHOR_MODE")  # HARD or SOFT

    # Observability
    prometheus_enabled: bool = Field(default=True, env="PROMETHEUS_ENABLED")
    prometheus_port: int = Field(default=9090, env="PROMETHEUS_PORT")
    log_level: str = Field(default="INFO", env="LOG_LEVEL")

    # Multi-tenancy
    multi_tenant_enabled: bool = Field(default=False, env="MULTI_TENANT")
    default_tenant_id: str = Field(default="default", env="DEFAULT_TENANT")

    # Webhooks
    webhook_timeout_seconds: int = Field(default=30, env="WEBHOOK_TIMEOUT")
    webhook_retry_attempts: int = Field(default=3, env="WEBHOOK_RETRIES")

    # Data retention
    retention_days_audit_logs: int = Field(default=2555, env="RETENTION_AUDIT_DAYS")  # 7 years
    retention_days_closepacks: int = Field(default=2555, env="RETENTION_CLOSEPACK_DAYS")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Convenience exports
settings = get_settings()
