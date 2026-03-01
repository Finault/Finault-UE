"""Exception classes for the Finault SDK"""

from typing import Optional, Dict, Any


class FinaultError(Exception):
    """Base exception class for all Finault SDK errors"""

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        error_code: Optional[str] = None,
        request_id: Optional[str] = None,
    ):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.request_id = request_id
        super().__init__(message)

    def __repr__(self) -> str:
        attrs = [f"message={self.message!r}"]
        if self.status_code:
            attrs.append(f"status_code={self.status_code}")
        if self.error_code:
            attrs.append(f"error_code={self.error_code!r}")
        if self.request_id:
            attrs.append(f"request_id={self.request_id!r}")
        return f"{self.__class__.__name__}({', '.join(attrs)})"


class AuthenticationError(FinaultError):
    """Raised when authentication fails (401)"""

    pass


class RateLimitError(FinaultError):
    """Raised when rate limit is exceeded (429)"""

    def __init__(
        self,
        message: str,
        retry_after: Optional[int] = None,
        request_id: Optional[str] = None,
    ):
        super().__init__(message, status_code=429, request_id=request_id)
        self.retry_after = retry_after


class ValidationError(FinaultError):
    """Raised when request validation fails (400)"""

    def __init__(
        self,
        message: str,
        field_errors: Optional[Dict[str, str]] = None,
        request_id: Optional[str] = None,
    ):
        super().__init__(message, status_code=400, request_id=request_id)
        self.field_errors = field_errors or {}


class APIError(FinaultError):
    """Raised for general API errors"""

    pass
