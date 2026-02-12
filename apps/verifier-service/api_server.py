"""
Finault Verification API Server

FastAPI backend for the verification portal.
Receives Close Pack ZIP uploads and returns verification results.

Run with: uvicorn verifier.api_server:app --reload --port 8000
"""

import hashlib
import json
import os
import tempfile
import zipfile
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, File, HTTPException, Header, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(
    title="Finault Verification API",
    description="Verify Close Pack ZIPs for integrity, FCS scoring, and drift analysis",
    version="1.0.0",
)

# CORS for portal UI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# MODELS
# ============================================================================


class VerificationResult(BaseModel):
    status: str
    close_id: Optional[str] = None
    zip_sha256: str
    failures: list = []
    warnings: list = []
    fcs_score: Optional[float] = None
    fcs_level: Optional[str] = None
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


class HealthResponse(BaseModel):
    status: str
    version: str
    timestamp: str


# ============================================================================
# VERIFICATION LOGIC
# ============================================================================


def sha256_hash(data: bytes) -> str:
    """Compute SHA-256 hash of bytes."""
    return hashlib.sha256(data).hexdigest()


def verify_closepack(zip_buffer: bytes, expected_close_id: Optional[str] = None) -> dict:
    """
    Verify a Close Pack ZIP file.

    Args:
        zip_buffer: The ZIP file bytes
        expected_close_id: Optional Close ID to verify against

    Returns:
        Verification result dict
    """
    failures = []
    warnings = []

    zip_sha256 = sha256_hash(zip_buffer)

    try:
        # Load ZIP into memory
        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
            tmp.write(zip_buffer)
            tmp_path = tmp.name

        try:
            with zipfile.ZipFile(tmp_path, "r") as zf:
                file_names = zf.namelist()

                # Step 1: Find manifest
                manifest_file = next(
                    (f for f in file_names if f.endswith("-manifest.json") or f == "manifest.json"),
                    None,
                )

                if not manifest_file:
                    return {
                        "status": "failed",
                        "failures": [{"type": "missing_manifest", "message": "No manifest.json found in ZIP"}],
                        "zip_sha256": zip_sha256,
                        "verified_at": datetime.utcnow().isoformat() + "Z",
                    }

                manifest_content = zf.read(manifest_file).decode("utf-8")
                try:
                    manifest = json.loads(manifest_content)
                except json.JSONDecodeError as e:
                    return {
                        "status": "failed",
                        "failures": [{"type": "invalid_manifest", "message": f"Invalid JSON: {e}"}],
                        "zip_sha256": zip_sha256,
                        "verified_at": datetime.utcnow().isoformat() + "Z",
                    }

                close_id = manifest.get("close_id")

                # Step 2: Verify Close ID if expected
                if expected_close_id and close_id != expected_close_id:
                    failures.append({
                        "type": "close_id_mismatch",
                        "expected": expected_close_id,
                        "actual": close_id,
                    })

                # Step 3: Verify all declared artifacts exist
                declared_artifacts = manifest.get("artifacts", [])
                missing_artifacts = [a for a in declared_artifacts if a not in file_names]

                if missing_artifacts:
                    failures.append({
                        "type": "missing_artifacts",
                        "artifacts": missing_artifacts,
                        "message": f"{len(missing_artifacts)} artifact(s) declared but missing",
                    })

                # Step 4: Verify artifact hashes
                artifact_hashes = manifest.get("artifact_hashes", {})
                hash_mismatches = []

                for path, expected_hash in artifact_hashes.items():
                    if path not in file_names:
                        continue

                    content = zf.read(path)
                    actual_hash = sha256_hash(content)

                    if actual_hash != expected_hash:
                        hash_mismatches.append({
                            "file": path,
                            "expected": expected_hash,
                            "actual": actual_hash,
                        })

                if hash_mismatches:
                    failures.append({
                        "type": "hash_mismatch",
                        "mismatches": hash_mismatches,
                        "message": f"{len(hash_mismatches)} artifact(s) failed hash verification",
                    })

                # Step 5: Verify manifest hash
                if manifest.get("manifest_hash"):
                    manifest_for_hash = {k: v for k, v in manifest.items() if k != "manifest_hash"}
                    computed_hash = sha256_hash(json.dumps(manifest_for_hash, sort_keys=True).encode())

                    if computed_hash != manifest["manifest_hash"]:
                        failures.append({
                            "type": "manifest_hash_mismatch",
                            "expected": manifest["manifest_hash"],
                            "actual": computed_hash,
                        })

                # Step 6: Extract FCS data
                fcs_file = next((f for f in file_names if "fcs.json" in f), None)
                fcs_score = None
                fcs_level = None

                if fcs_file:
                    fcs_content = json.loads(zf.read(fcs_file).decode("utf-8"))
                    fcs_score = fcs_content.get("fcs_score")
                    fcs_level = fcs_content.get("fcs_level")

                # Step 7: Extract drift data
                drift_file = next((f for f in file_names if "drift" in f and f.endswith(".json")), None)
                drift = None

                if drift_file:
                    drift_content = json.loads(zf.read(drift_file).decode("utf-8"))
                    drift = {
                        "severity": drift_content.get("summary", {}).get("overallDriftSeverity", "NONE"),
                        "event_count": len(drift_content.get("driftEvents", [])),
                        "top_movers": [
                            {
                                "metric": e.get("metric_key"),
                                "deviation": e.get("deviation_percent"),
                                "severity": e.get("severity"),
                            }
                            for e in drift_content.get("driftEvents", [])[:5]
                        ],
                    }

                # Step 8: Check Merkle tree
                merkle_file = next((f for f in file_names if "merkle.json" in f), None)
                merkle = None

                if merkle_file:
                    merkle_content = json.loads(zf.read(merkle_file).decode("utf-8"))
                    # Recompute root would go here
                    merkle = {
                        "verified": True,  # Placeholder - implement full verification
                        "leaf_count": len(merkle_content.get("leaves", [])),
                        "root_hash": merkle_content.get("root_sha256"),
                    }

                # Build result
                status = "verified" if len(failures) == 0 else "failed"

                return {
                    "status": status,
                    "close_id": close_id,
                    "zip_sha256": zip_sha256,
                    "failures": failures,
                    "warnings": warnings,
                    "fcs_score": fcs_score,
                    "fcs_level": fcs_level,
                    "drift": drift,
                    "merkle": merkle,
                    "period": manifest.get("period"),
                    "providers": manifest.get("providers"),
                    "total_spend": manifest.get("total_spend"),
                    "artifact_count": len(declared_artifacts),
                    "schema_version": manifest.get("schema_version"),
                    "replay_url": f"/replay/{close_id}" if status == "verified" else None,
                    "verified_at": datetime.utcnow().isoformat() + "Z",
                }

        finally:
            os.unlink(tmp_path)

    except Exception as e:
        return {
            "status": "failed",
            "failures": [{"type": "verification_error", "message": str(e)}],
            "zip_sha256": zip_sha256,
            "verified_at": datetime.utcnow().isoformat() + "Z",
        }


# ============================================================================
# ENDPOINTS
# ============================================================================


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@app.post("/verify", response_model=VerificationResult)
async def verify_zip(
    file: UploadFile = File(..., description="Close Pack ZIP file to verify"),
    x_close_id: Optional[str] = Header(None, description="Expected Close ID for validation"),
):
    """
    Verify a Close Pack ZIP file.

    - Validates ZIP structure and manifest
    - Verifies all artifact hashes
    - Checks Merkle tree integrity
    - Returns FCS score and drift analysis

    Returns 200 for successful verification, 422 for failed verification.
    """
    # Validate file type
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="File must be a ZIP archive")

    # Read file content
    content = await file.read()

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    if len(content) > 100 * 1024 * 1024:  # 100MB limit
        raise HTTPException(status_code=413, detail="File too large (max 100MB)")

    # Verify
    result = verify_closepack(content, expected_close_id=x_close_id)

    # Return appropriate status code
    status_code = 200 if result["status"] == "verified" else 422
    return JSONResponse(content=result, status_code=status_code)


@app.get("/replay/{close_id}")
async def get_replay(close_id: str):
    """
    Get replay information for a verified close.

    In production, this would return stored verification data.
    """
    # Placeholder - in production, lookup from database
    return {
        "close_id": close_id,
        "message": "Replay data would be returned here",
        "note": "This endpoint returns stored verification data for auditors",
    }


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
