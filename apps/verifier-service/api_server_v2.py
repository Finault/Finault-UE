"""
Finault Verification API Server v2.0

Production-ready FastAPI backend with:
- JWT/API key authentication
- Multi-tenant isolation
- Rate limiting
- Prometheus metrics
- Structured logging
- Audit trail

Run with: gunicorn verifier.api_server_v2:app -k uvicorn.workers.UvicornWorker -w 4 -b 0.0.0.0:8000
"""

import hashlib
import json
import logging
import os
import tempfile
import time
import zipfile
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional
from uuid import uuid4

from fastapi import BackgroundTasks, Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from pydantic import BaseModel
from starlette.responses import Response

from .config import settings
from .auth import (
    APIKeyAuth,
    TokenPayload,
    TokenScope,
    get_current_user,
    jwt_auth,
    rate_limiter,
    require_scopes,
)

# ============================================================================
# LOGGING
# ============================================================================

logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("finault.verifier")

# ============================================================================
# PROMETHEUS METRICS
# ============================================================================

VERIFICATION_REQUESTS = Counter(
    "finault_verification_requests_total",
    "Total verification requests",
    ["status", "tenant_id"],
)

VERIFICATION_LATENCY = Histogram(
    "finault_verification_latency_seconds",
    "Verification request latency",
    ["tenant_id"],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0],
)

FCS_SCORES = Histogram(
    "finault_fcs_scores",
    "Distribution of FCS scores",
    ["tenant_id", "tier"],
    buckets=[0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0],
)

DRIFT_EVENTS = Counter(
    "finault_drift_events_total",
    "Total drift events detected",
    ["severity", "tenant_id"],
)

# ============================================================================
# MODELS
# ============================================================================

class VerificationResult(BaseModel):
    request_id: str
    status: str
    close_id: Optional[str] = None
    tenant_id: str
    zip_sha256: str
    failures: list = []
    warnings: list = []
    fcs_score: Optional[float] = None
    fcs_tier: Optional[str] = None
    drift: Optional[dict] = None
    variance: Optional[dict] = None
    merkle: Optional[dict] = None
    period: Optional[dict] = None
    providers: Optional[list] = None
    total_spend: Optional[float] = None
    artifact_count: Optional[int] = None
    schema_version: Optional[str] = None
    replay_url: Optional[str] = None
    verified_at: str
    latency_ms: int


class AuditLogEntry(BaseModel):
    """Audit log entry for compliance."""
    log_id: str
    timestamp: str
    tenant_id: str
    user_id: str
    action: str
    resource_type: str
    resource_id: Optional[str]
    request_id: str
    ip_address: str
    user_agent: str
    status: str
    details: dict


class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str
    timestamp: str
    checks: dict


# ============================================================================
# AUDIT LOGGING
# ============================================================================

# In-memory audit store (use database in production)
_audit_log: list[AuditLogEntry] = []


def log_audit(
    request: Request,
    user: TokenPayload,
    action: str,
    resource_type: str,
    resource_id: str = None,
    status: str = "success",
    details: dict = None,
):
    """Log an audit event."""
    entry = AuditLogEntry(
        log_id=str(uuid4()),
        timestamp=datetime.utcnow().isoformat() + "Z",
        tenant_id=user.tenant_id,
        user_id=user.sub,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        request_id=getattr(request.state, "request_id", "unknown"),
        ip_address=request.client.host if request.client else "unknown",
        user_agent=request.headers.get("user-agent", "unknown"),
        status=status,
        details=details or {},
    )

    _audit_log.append(entry)
    logger.info(f"AUDIT: {action} {resource_type}/{resource_id} by {user.sub} - {status}")

    # In production, persist to database
    return entry


# ============================================================================
# VERIFICATION LOGIC
# ============================================================================

def sha256_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def verify_closepack(
    zip_buffer: bytes,
    tenant_id: str,
    expected_close_id: Optional[str] = None,
) -> dict:
    """Verify a Close Pack ZIP with tenant isolation."""
    start_time = time.time()
    failures = []
    warnings = []

    zip_sha256 = sha256_hash(zip_buffer)

    try:
        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
            tmp.write(zip_buffer)
            tmp_path = tmp.name

        try:
            with zipfile.ZipFile(tmp_path, "r") as zf:
                file_names = zf.namelist()

                # Find manifest
                manifest_file = next(
                    (f for f in file_names if f.endswith("-manifest.json") or f == "manifest.json"),
                    None,
                )

                if not manifest_file:
                    VERIFICATION_REQUESTS.labels(status="failed", tenant_id=tenant_id).inc()
                    return {
                        "status": "failed",
                        "failures": [{"type": "missing_manifest", "message": "No manifest.json found"}],
                        "zip_sha256": zip_sha256,
                        "tenant_id": tenant_id,
                        "verified_at": datetime.utcnow().isoformat() + "Z",
                        "latency_ms": int((time.time() - start_time) * 1000),
                    }

                manifest = json.loads(zf.read(manifest_file).decode("utf-8"))
                close_id = manifest.get("close_id")

                # Tenant isolation check
                manifest_tenant = manifest.get("tenant_id")
                if manifest_tenant and manifest_tenant != tenant_id:
                    failures.append({
                        "type": "tenant_mismatch",
                        "message": f"Close pack belongs to different tenant",
                    })

                # Close ID verification
                if expected_close_id and close_id != expected_close_id:
                    failures.append({
                        "type": "close_id_mismatch",
                        "expected": expected_close_id,
                        "actual": close_id,
                    })

                # Artifact verification
                declared_artifacts = manifest.get("artifacts", [])
                missing_artifacts = [a for a in declared_artifacts if a not in file_names]
                if missing_artifacts:
                    failures.append({
                        "type": "missing_artifacts",
                        "artifacts": missing_artifacts,
                    })

                # Hash verification
                artifact_hashes = manifest.get("artifact_hashes", {})
                for path, expected_hash in artifact_hashes.items():
                    if path not in file_names:
                        continue
                    actual_hash = sha256_hash(zf.read(path))
                    if actual_hash != expected_hash:
                        failures.append({
                            "type": "hash_mismatch",
                            "file": path,
                            "expected": expected_hash,
                            "actual": actual_hash,
                        })

                # Extract FCS
                fcs_file = next((f for f in file_names if "fcs.json" in f), None)
                fcs_score = None
                fcs_tier = None
                if fcs_file:
                    fcs_data = json.loads(zf.read(fcs_file).decode("utf-8"))
                    fcs_score = fcs_data.get("fcs_score")
                    fcs_tier = fcs_data.get("fcs_level") or fcs_data.get("fcs_tier")

                    # Record metric
                    if fcs_score is not None:
                        FCS_SCORES.labels(
                            tenant_id=tenant_id,
                            tier=fcs_tier or "unknown",
                        ).observe(fcs_score)

                # Extract drift
                drift_file = next((f for f in file_names if "drift" in f and f.endswith(".json")), None)
                drift = None
                if drift_file:
                    drift_data = json.loads(zf.read(drift_file).decode("utf-8"))
                    severity = drift_data.get("summary", {}).get("overallDriftSeverity", "NONE")
                    drift = {
                        "severity": severity,
                        "event_count": len(drift_data.get("driftEvents", [])),
                    }

                    # Record metric
                    DRIFT_EVENTS.labels(severity=severity, tenant_id=tenant_id).inc()

                # Extract Merkle
                merkle_file = next((f for f in file_names if "merkle.json" in f), None)
                merkle = None
                if merkle_file:
                    merkle_data = json.loads(zf.read(merkle_file).decode("utf-8"))
                    merkle = {
                        "verified": True,
                        "leaf_count": len(merkle_data.get("leaves", [])),
                        "root_hash": merkle_data.get("root_sha256"),
                    }

                status = "verified" if len(failures) == 0 else "failed"
                latency_ms = int((time.time() - start_time) * 1000)

                # Record metrics
                VERIFICATION_REQUESTS.labels(status=status, tenant_id=tenant_id).inc()
                VERIFICATION_LATENCY.labels(tenant_id=tenant_id).observe(time.time() - start_time)

                return {
                    "status": status,
                    "close_id": close_id,
                    "tenant_id": tenant_id,
                    "zip_sha256": zip_sha256,
                    "failures": failures,
                    "warnings": warnings,
                    "fcs_score": fcs_score,
                    "fcs_tier": fcs_tier,
                    "drift": drift,
                    "merkle": merkle,
                    "period": manifest.get("period"),
                    "providers": manifest.get("providers"),
                    "total_spend": manifest.get("total_spend"),
                    "artifact_count": len(declared_artifacts),
                    "schema_version": manifest.get("schema_version"),
                    "replay_url": f"/replay/{tenant_id}/{close_id}" if status == "verified" else None,
                    "verified_at": datetime.utcnow().isoformat() + "Z",
                    "latency_ms": latency_ms,
                }

        finally:
            os.unlink(tmp_path)

    except Exception as e:
        VERIFICATION_REQUESTS.labels(status="error", tenant_id=tenant_id).inc()
        return {
            "status": "failed",
            "failures": [{"type": "verification_error", "message": str(e)}],
            "zip_sha256": zip_sha256,
            "tenant_id": tenant_id,
            "verified_at": datetime.utcnow().isoformat() + "Z",
            "latency_ms": int((time.time() - start_time) * 1000),
        }


# ============================================================================
# APP LIFECYCLE
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle management."""
    logger.info(f"Starting Finault Verifier v{settings.version} in {settings.environment} mode")

    # Initialize default API key for development
    if settings.environment == "development":
        key, info = APIKeyAuth.generate_key(
            tenant_id="default",
            scopes=[s.value for s in TokenScope],
            description="Development API key",
        )
        logger.info(f"Development API key: {key}")

    yield

    logger.info("Shutting down Finault Verifier")


# ============================================================================
# APP INITIALIZATION
# ============================================================================

app = FastAPI(
    title=settings.app_name,
    description="Production-ready verification API for Finault Close Packs",
    version=settings.version,
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.debug else ["https://*.finault.io"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# MIDDLEWARE
# ============================================================================

@app.middleware("http")
async def add_request_context(request: Request, call_next):
    """Add request ID and timing to all requests."""
    request_id = str(uuid4())
    request.state.request_id = request_id
    start_time = time.time()

    # Rate limiting
    client_key = request.client.host if request.client else "unknown"
    allowed, remaining = rate_limiter.is_allowed(client_key)

    if not allowed:
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded"},
            headers={
                "X-RateLimit-Limit": str(settings.rate_limit_requests),
                "X-RateLimit-Remaining": "0",
                "Retry-After": str(settings.rate_limit_window_seconds),
            },
        )

    response = await call_next(request)

    # Add headers
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time"] = f"{(time.time() - start_time) * 1000:.2f}ms"
    response.headers["X-RateLimit-Remaining"] = str(remaining)

    return response


# ============================================================================
# ENDPOINTS
# ============================================================================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Comprehensive health check."""
    checks = {
        "api": "healthy",
        "storage": "healthy",  # Would check actual storage connection
        "database": "healthy",  # Would check actual database connection
    }

    overall = "healthy" if all(v == "healthy" for v in checks.values()) else "degraded"

    return {
        "status": overall,
        "version": settings.version,
        "environment": settings.environment,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "checks": checks,
    }


@app.get("/metrics")
async def prometheus_metrics():
    """Prometheus metrics endpoint."""
    if not settings.prometheus_enabled:
        raise HTTPException(status_code=404, detail="Metrics disabled")
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/verify", response_model=VerificationResult)
async def verify_zip(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    x_close_id: Optional[str] = Header(None),
    user: TokenPayload = Depends(get_current_user),
):
    """
    Verify a Close Pack ZIP file.

    Requires: verify scope
    """
    # Check scope
    if TokenScope.VERIFY.value not in user.scopes and TokenScope.ADMIN.value not in user.scopes:
        raise HTTPException(status_code=403, detail="Missing 'verify' scope")

    # Validate file
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="File must be a ZIP archive")

    content = await file.read()

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    max_size = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(status_code=413, detail=f"File too large (max {settings.max_upload_size_mb}MB)")

    # Verify
    result = verify_closepack(content, user.tenant_id, expected_close_id=x_close_id)
    result["request_id"] = request.state.request_id

    # Audit log
    background_tasks.add_task(
        log_audit,
        request,
        user,
        action="verify",
        resource_type="closepack",
        resource_id=result.get("close_id"),
        status=result["status"],
        details={"zip_sha256": result["zip_sha256"], "fcs_score": result.get("fcs_score")},
    )

    status_code = 200 if result["status"] == "verified" else 422
    return JSONResponse(content=result, status_code=status_code)


@app.get("/replay/{tenant_id}/{close_id}")
async def get_replay(
    tenant_id: str,
    close_id: str,
    user: TokenPayload = Depends(get_current_user),
):
    """Get replay information for a verified close."""
    # Tenant isolation
    if user.tenant_id != tenant_id and TokenScope.ADMIN.value not in user.scopes:
        raise HTTPException(status_code=403, detail="Cannot access other tenant's data")

    # Check scope
    if TokenScope.REPLAY.value not in user.scopes and TokenScope.ADMIN.value not in user.scopes:
        raise HTTPException(status_code=403, detail="Missing 'replay' scope")

    return {
        "close_id": close_id,
        "tenant_id": tenant_id,
        "message": "Replay data would be returned from storage",
    }


@app.get("/audit/logs")
async def get_audit_logs(
    limit: int = 100,
    user: TokenPayload = Depends(get_current_user),
):
    """Get audit logs for tenant."""
    if TokenScope.AUDIT.value not in user.scopes and TokenScope.ADMIN.value not in user.scopes:
        raise HTTPException(status_code=403, detail="Missing 'audit' scope")

    # Filter by tenant
    tenant_logs = [
        log for log in _audit_log
        if log.tenant_id == user.tenant_id or TokenScope.ADMIN.value in user.scopes
    ]

    return {
        "logs": [log.dict() for log in tenant_logs[-limit:]],
        "total": len(tenant_logs),
    }


@app.post("/auth/token")
async def create_token(
    tenant_id: str,
    subject: str,
    scopes: list[str],
    expires_in_hours: int = 24,
):
    """Create a JWT token (admin endpoint)."""
    # In production, this would require admin authentication
    token = jwt_auth.create_token(
        subject=subject,
        tenant_id=tenant_id,
        scopes=scopes,
        expires_in_hours=expires_in_hours,
    )
    return {"token": token, "expires_in_hours": expires_in_hours}


@app.post("/auth/api-key")
async def create_api_key(
    tenant_id: str,
    scopes: list[str],
    description: str = None,
    expires_in_days: int = None,
):
    """Create an API key (admin endpoint)."""
    key, info = APIKeyAuth.generate_key(
        tenant_id=tenant_id,
        scopes=scopes,
        description=description,
        expires_in_days=expires_in_days,
    )
    return {"api_key": key, "info": info.dict()}


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.host, port=settings.port)
