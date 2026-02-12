"""
Finault Authentication & Authorization

Implements JWT tokens, HMAC signature verification, and RBAC.
Supports multi-tenant isolation and scoped API keys.
"""

import hashlib
import hmac
import secrets
import time
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional
from functools import wraps

import jwt
from fastapi import HTTPException, Request, Security
from fastapi.security import APIKeyHeader, HTTPBearer
from pydantic import BaseModel

from .config import settings


# ============================================================================
# MODELS
# ============================================================================

class TokenScope(str, Enum):
    """API token scopes for RBAC."""
    READ = "read"                    # View verification results
    VERIFY = "verify"                # Submit ZIPs for verification
    REPLAY = "replay"                # Trigger replays
    ANCHOR = "anchor"                # Trigger blockchain anchoring
    ERP = "erp"                      # ERP posting operations
    ADMIN = "admin"                  # Full access
    AUDIT = "audit"                  # Read-only audit access


class TokenPayload(BaseModel):
    """JWT token payload."""
    sub: str                          # Subject (user/service ID)
    tenant_id: str                    # Tenant ID for multi-tenancy
    scopes: list[str]                 # Granted scopes
    iat: int                          # Issued at
    exp: int                          # Expiration
    jti: Optional[str] = None         # JWT ID for revocation


class APIKeyInfo(BaseModel):
    """API key metadata."""
    key_id: str
    tenant_id: str
    scopes: list[str]
    created_at: str
    expires_at: Optional[str] = None
    description: Optional[str] = None


# ============================================================================
# JWT AUTHENTICATION
# ============================================================================

class JWTAuth:
    """JWT token management."""

    def __init__(self, secret: str = None, algorithm: str = None):
        self.secret = secret or settings.jwt_secret
        self.algorithm = algorithm or settings.jwt_algorithm
        self.expiration_hours = settings.jwt_expiration_hours

    def create_token(
        self,
        subject: str,
        tenant_id: str,
        scopes: list[str],
        expires_in_hours: int = None,
    ) -> str:
        """Create a JWT token."""
        now = datetime.utcnow()
        exp_hours = expires_in_hours or self.expiration_hours

        payload = {
            "sub": subject,
            "tenant_id": tenant_id,
            "scopes": scopes,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(hours=exp_hours)).timestamp()),
            "jti": secrets.token_hex(16),
        }

        return jwt.encode(payload, self.secret, algorithm=self.algorithm)

    def verify_token(self, token: str) -> TokenPayload:
        """Verify and decode a JWT token."""
        try:
            payload = jwt.decode(token, self.secret, algorithms=[self.algorithm])
            return TokenPayload(**payload)
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token has expired")
        except jwt.InvalidTokenError as e:
            raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    def refresh_token(self, token: str) -> str:
        """Refresh an existing token."""
        payload = self.verify_token(token)
        return self.create_token(
            subject=payload.sub,
            tenant_id=payload.tenant_id,
            scopes=payload.scopes,
        )


# ============================================================================
# HMAC SIGNATURE VERIFICATION
# ============================================================================

class HMACAuth:
    """HMAC signature verification for webhooks and API requests."""

    def __init__(self, secret: str = None):
        self.secret = (secret or settings.hmac_secret).encode()

    def sign(self, data: bytes, timestamp: int = None) -> tuple[str, int]:
        """Sign data with HMAC-SHA256."""
        ts = timestamp or int(time.time())
        message = f"{ts}.".encode() + data
        signature = hmac.new(self.secret, message, hashlib.sha256).hexdigest()
        return signature, ts

    def verify(
        self,
        data: bytes,
        signature: str,
        timestamp: int,
        max_age_seconds: int = 300,
    ) -> bool:
        """Verify HMAC signature with timestamp validation."""
        # Check timestamp freshness
        now = int(time.time())
        if abs(now - timestamp) > max_age_seconds:
            return False

        # Compute expected signature
        message = f"{timestamp}.".encode() + data
        expected = hmac.new(self.secret, message, hashlib.sha256).hexdigest()

        # Constant-time comparison
        return hmac.compare_digest(signature, expected)

    def sign_webhook_payload(self, payload: dict) -> dict:
        """Sign a webhook payload."""
        import json
        data = json.dumps(payload, sort_keys=True).encode()
        signature, timestamp = self.sign(data)
        return {
            "payload": payload,
            "signature": signature,
            "timestamp": timestamp,
        }


# ============================================================================
# API KEY AUTHENTICATION
# ============================================================================

class APIKeyAuth:
    """API key management and validation."""

    # In-memory store for demo; use database in production
    _keys: dict[str, APIKeyInfo] = {}

    @classmethod
    def generate_key(
        cls,
        tenant_id: str,
        scopes: list[str],
        description: str = None,
        expires_in_days: int = None,
    ) -> tuple[str, APIKeyInfo]:
        """Generate a new API key."""
        key = f"fin_{secrets.token_hex(32)}"
        key_id = hashlib.sha256(key.encode()).hexdigest()[:16]

        expires_at = None
        if expires_in_days:
            expires_at = (datetime.utcnow() + timedelta(days=expires_in_days)).isoformat()

        info = APIKeyInfo(
            key_id=key_id,
            tenant_id=tenant_id,
            scopes=scopes,
            created_at=datetime.utcnow().isoformat(),
            expires_at=expires_at,
            description=description,
        )

        # Store hashed key -> info mapping
        key_hash = hashlib.sha256(key.encode()).hexdigest()
        cls._keys[key_hash] = info

        return key, info

    @classmethod
    def validate_key(cls, key: str) -> Optional[APIKeyInfo]:
        """Validate an API key and return its info."""
        key_hash = hashlib.sha256(key.encode()).hexdigest()
        info = cls._keys.get(key_hash)

        if not info:
            return None

        # Check expiration
        if info.expires_at:
            expires = datetime.fromisoformat(info.expires_at)
            if datetime.utcnow() > expires:
                return None

        return info

    @classmethod
    def revoke_key(cls, key_id: str) -> bool:
        """Revoke an API key by ID."""
        for key_hash, info in list(cls._keys.items()):
            if info.key_id == key_id:
                del cls._keys[key_hash]
                return True
        return False


# ============================================================================
# FASTAPI SECURITY DEPENDENCIES
# ============================================================================

api_key_header = APIKeyHeader(name=settings.api_key_header, auto_error=False)
bearer_scheme = HTTPBearer(auto_error=False)

jwt_auth = JWTAuth()
hmac_auth = HMACAuth()


async def get_current_user(
    request: Request,
    api_key: str = Security(api_key_header),
    bearer: Optional[str] = Security(bearer_scheme),
) -> TokenPayload:
    """
    Authenticate request via API key or JWT bearer token.
    Returns token payload with user info and scopes.
    """
    # Try API key first
    if api_key:
        info = APIKeyAuth.validate_key(api_key)
        if info:
            return TokenPayload(
                sub=f"api_key:{info.key_id}",
                tenant_id=info.tenant_id,
                scopes=info.scopes,
                iat=int(time.time()),
                exp=int(time.time()) + 3600,
            )

    # Try JWT bearer token
    if bearer:
        token = bearer.credentials if hasattr(bearer, 'credentials') else str(bearer)
        return jwt_auth.verify_token(token)

    # No authentication provided
    raise HTTPException(
        status_code=401,
        detail="Authentication required. Provide API key or Bearer token.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_scopes(*required_scopes: str):
    """Decorator to require specific scopes."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, user: TokenPayload = None, **kwargs):
            if not user:
                raise HTTPException(status_code=401, detail="Authentication required")

            # Admin scope grants all access
            if TokenScope.ADMIN.value in user.scopes:
                return await func(*args, user=user, **kwargs)

            # Check required scopes
            missing = set(required_scopes) - set(user.scopes)
            if missing:
                raise HTTPException(
                    status_code=403,
                    detail=f"Missing required scopes: {', '.join(missing)}",
                )

            return await func(*args, user=user, **kwargs)
        return wrapper
    return decorator


def get_tenant_id(user: TokenPayload) -> str:
    """Extract tenant ID from authenticated user."""
    return user.tenant_id


# ============================================================================
# RATE LIMITING
# ============================================================================

class RateLimiter:
    """Simple in-memory rate limiter."""

    def __init__(self, requests: int = None, window_seconds: int = None):
        self.max_requests = requests or settings.rate_limit_requests
        self.window = window_seconds or settings.rate_limit_window_seconds
        self._requests: dict[str, list[float]] = {}

    def is_allowed(self, key: str) -> tuple[bool, int]:
        """
        Check if request is allowed.
        Returns (allowed, remaining_requests).
        """
        now = time.time()
        cutoff = now - self.window

        # Clean old requests
        if key in self._requests:
            self._requests[key] = [t for t in self._requests[key] if t > cutoff]
        else:
            self._requests[key] = []

        # Check limit
        current = len(self._requests[key])
        if current >= self.max_requests:
            return False, 0

        # Record request
        self._requests[key].append(now)
        return True, self.max_requests - current - 1

    def get_headers(self, key: str) -> dict:
        """Get rate limit headers for response."""
        allowed, remaining = self.is_allowed(key)
        return {
            "X-RateLimit-Limit": str(self.max_requests),
            "X-RateLimit-Remaining": str(remaining),
            "X-RateLimit-Window": str(self.window),
        }


rate_limiter = RateLimiter()
