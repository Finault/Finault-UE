"""Main Finault API client"""

import time
import json
from typing import Dict, Any, Optional, Iterator, Union
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .version import __version__
from .exceptions import (
    FinaultError,
    AuthenticationError,
    RateLimitError,
    ValidationError,
    APIError,
)
from .resources import (
    Chat,
    ClosePack,
    Budgets,
    Anomalies,
    Keys,
    Dashboard,
    Health,
    Pricing,
)
from .models import ChatCompletionChunk


class FinaultClient:
    """
    Official Finault SDK client for Python

    Usage:
        import finault
        client = finault.FinaultClient(api_key="fk_live_...")

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": "Hello"}],
            provider_api_key="sk-..."
        )
        print(response.cost)
    """

    API_BASE_URL = "https://api.finault.ai"

    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        timeout: float = 30.0,
        max_retries: int = 3,
    ):
        """
        Initialize the Finault client

        Args:
            api_key: Finault API key (starts with 'fk_')
            base_url: Optional custom API base URL
            timeout: Request timeout in seconds (default: 30)
            max_retries: Maximum number of retries for failed requests (default: 3)

        Raises:
            ValueError: If API key is not provided or invalid
        """
        if not api_key:
            raise ValueError("api_key is required")
        if not api_key.startswith("fk_"):
            raise ValueError("Invalid API key format. API keys should start with 'fk_'")

        self.api_key = api_key
        self.base_url = base_url or self.API_BASE_URL
        self.timeout = timeout
        self.max_retries = max_retries

        # Initialize HTTP session with retry strategy
        self.session = self._create_session()

        # Initialize resource groups
        self.chat = Chat(self)
        self.closepack = ClosePack(self)
        self.budgets = Budgets(self)
        self.anomalies = Anomalies(self)
        self.keys = Keys(self)
        self.dashboard = Dashboard(self)
        self.health = Health(self)
        self.pricing = Pricing(self)

    def _create_session(self) -> requests.Session:
        """Create a requests session with retry strategy"""
        session = requests.Session()

        # Configure retry strategy for 429 and 5xx errors
        retry_strategy = Retry(
            total=self.max_retries,
            status_forcelist=[429, 500, 502, 503, 504],
            method_whitelist=["HEAD", "GET", "OPTIONS", "POST", "PUT", "DELETE"],
            backoff_factor=1,
        )

        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("http://", adapter)
        session.mount("https://", adapter)

        return session

    def _get_headers(self) -> Dict[str, str]:
        """Get request headers"""
        return {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
            "User-Agent": f"finault-python/{__version__}",
        }

    def _handle_error_response(
        self, status_code: int, response_data: Dict[str, Any], request_id: Optional[str] = None
    ) -> None:
        """Handle error responses and raise appropriate exceptions"""
        error_message = response_data.get("error", {})
        if isinstance(error_message, dict):
            message = error_message.get("message", "Unknown error")
            code = error_message.get("code", "unknown")
        else:
            message = str(error_message)
            code = "unknown"

        if status_code == 401:
            raise AuthenticationError(message, status_code=status_code, request_id=request_id)
        elif status_code == 429:
            retry_after = int(response_data.get("retry_after", 60))
            raise RateLimitError(message, retry_after=retry_after, request_id=request_id)
        elif status_code == 400:
            field_errors = response_data.get("field_errors", {})
            raise ValidationError(message, field_errors=field_errors, request_id=request_id)
        elif status_code >= 500:
            raise APIError(
                f"Server error: {message}",
                status_code=status_code,
                error_code=code,
                request_id=request_id,
            )
        else:
            raise APIError(
                message,
                status_code=status_code,
                error_code=code,
                request_id=request_id,
            )

    def _request(
        self,
        method: str,
        path: str,
        data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Make an API request

        Args:
            method: HTTP method (GET, POST, PUT, PATCH, DELETE)
            path: API endpoint path
            data: Request body data
            params: Query parameters

        Returns:
            Response JSON as dictionary

        Raises:
            FinaultError: For any API or network errors
        """
        url = f"{self.base_url}{path}"

        try:
            response = self.session.request(
                method=method,
                url=url,
                json=data,
                params=params,
                headers=self._get_headers(),
                timeout=self.timeout,
            )

            request_id = response.headers.get("X-Request-Id")

            # Handle successful responses
            if response.status_code < 400:
                try:
                    return response.json()
                except json.JSONDecodeError:
                    if response.status_code == 204:
                        return {}
                    raise APIError("Invalid JSON response from API", request_id=request_id)

            # Handle error responses
            try:
                response_data = response.json()
            except json.JSONDecodeError:
                response_data = {"error": {"message": response.text}}

            self._handle_error_response(response.status_code, response_data, request_id)

        except requests.exceptions.Timeout:
            raise APIError(f"Request timeout after {self.timeout}s")
        except requests.exceptions.ConnectionError as e:
            raise APIError(f"Connection error: {str(e)}")
        except requests.exceptions.RequestException as e:
            raise APIError(f"Request failed: {str(e)}")

    def _stream_request(
        self,
        method: str,
        path: str,
        data: Optional[Dict[str, Any]] = None,
    ) -> Iterator[ChatCompletionChunk]:
        """
        Make a streaming API request

        Args:
            method: HTTP method
            path: API endpoint path
            data: Request body data

        Yields:
            ChatCompletionChunk objects

        Raises:
            FinaultError: For any API or network errors
        """
        url = f"{self.base_url}{path}"

        try:
            response = self.session.request(
                method=method,
                url=url,
                json=data,
                headers=self._get_headers(),
                timeout=self.timeout,
                stream=True,
            )

            request_id = response.headers.get("X-Request-Id")

            if response.status_code >= 400:
                try:
                    response_data = response.json()
                except json.JSONDecodeError:
                    response_data = {"error": {"message": response.text}}
                self._handle_error_response(response.status_code, response_data, request_id)

            # Process streaming response
            for line in response.iter_lines():
                if not line:
                    continue

                line = line.decode("utf-8") if isinstance(line, bytes) else line

                # Skip SSE metadata
                if line.startswith(":"):
                    continue

                # Handle SSE data format
                if line.startswith("data: "):
                    line = line[6:]

                # End of stream
                if line == "[DONE]":
                    break

                try:
                    chunk_data = json.loads(line)
                    yield ChatCompletionChunk.from_dict(chunk_data)
                except json.JSONDecodeError:
                    # Skip malformed lines
                    continue

        except requests.exceptions.Timeout:
            raise APIError(f"Request timeout after {self.timeout}s")
        except requests.exceptions.ConnectionError as e:
            raise APIError(f"Connection error: {str(e)}")
        except requests.exceptions.RequestException as e:
            raise APIError(f"Request failed: {str(e)}")

    def close(self) -> None:
        """Close the HTTP session"""
        self.session.close()

    def __enter__(self):
        """Context manager entry"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close()

    def __repr__(self) -> str:
        return f"FinaultClient(api_key={self.api_key[:10]}..., base_url={self.base_url})"
