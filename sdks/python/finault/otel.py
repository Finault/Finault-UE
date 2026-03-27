"""
Finault OpenTelemetry Exporter — Build 14
Exports seal data as OTLP spans. Zero external dependencies.
"""

import json
import os
from urllib.request import Request, urlopen
import hashlib
from datetime import datetime


class FinaultOTelExporter:
    """Exports Finault seal data as OpenTelemetry spans.
    No dependency on opentelemetry-sdk — builds OTLP JSON directly."""

    def __init__(self, endpoint=None):
        self.endpoint = endpoint or os.environ.get(
            'OTEL_EXPORTER_OTLP_ENDPOINT',
            'http://localhost:4318/v1/traces'
        )

    def export_seal(self, seal):
        """Convert a Finault seal to an OTLP trace span and export."""
        span = {
            "resourceSpans": [{
                "resource": {
                    "attributes": [
                        {"key": "service.name", "value": {"stringValue": "finault"}},
                        {"key": "finault.org_id", "value": {"stringValue": seal.get('org_id', '')}},
                    ]
                },
                "scopeSpans": [{
                    "scope": {"name": "finault.seal", "version": "4.2.0"},
                    "spans": [{
                        "traceId": self._seal_to_trace_id(seal['seal_id']),
                        "spanId": self._seal_to_span_id(seal['seal_id']),
                        "name": f"finault.{seal.get('action', 'seal')}",
                        "kind": 3,
                        "startTimeUnixNano": str(self._iso_to_nanos(seal['timestamp'])),
                        "endTimeUnixNano": str(self._iso_to_nanos(seal['timestamp']) +
                                              int((seal.get('latency_ms', 0) or 0) * 1_000_000)),
                        "attributes": [
                            {"key": "finault.seal_id", "value": {"stringValue": seal['seal_id']}},
                            {"key": "finault.seal_hash", "value": {"stringValue": seal.get('seal_hash', '')}},
                            {"key": "gen_ai.system", "value": {"stringValue": seal.get('provider', '')}},
                            {"key": "gen_ai.request.model", "value": {"stringValue": seal.get('model', '')}},
                            {"key": "gen_ai.usage.prompt_tokens", "value": {"intValue": str(seal.get('tokens_in', 0) or 0)}},
                            {"key": "gen_ai.usage.completion_tokens", "value": {"intValue": str(seal.get('tokens_out', 0) or 0)}},
                            {"key": "finault.cost_usd", "value": {"doubleValue": seal.get('cost_usd', 0) or 0}},
                            {"key": "finault.revenue_usd", "value": {"doubleValue": seal.get('revenue_usd', 0) or 0}},
                            {"key": "finault.margin_pct", "value": {"doubleValue": seal.get('margin_pct', 0) or 0}},
                            {"key": "finault.dark_debt_score", "value": {"intValue": str(seal.get('dark_debt_score', 0) or 0)}},
                            {"key": "finault.receipt_url", "value": {"stringValue": f"https://api.finault.ai/seal/{seal['seal_id']}"}},
                        ],
                        "status": {"code": 1},
                    }]
                }]
            }]
        }

        try:
            req = Request(
                self.endpoint,
                data=json.dumps(span).encode(),
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            urlopen(req, timeout=5)
        except Exception:
            pass  # Non-blocking

    def _seal_to_trace_id(self, seal_id):
        return hashlib.sha256(seal_id.encode()).hexdigest()[:32]

    def _seal_to_span_id(self, seal_id):
        return hashlib.sha256(seal_id.encode()).hexdigest()[:16]

    def _iso_to_nanos(self, iso_str):
        dt = datetime.fromisoformat(iso_str.replace('Z', '+00:00'))
        return int(dt.timestamp() * 1_000_000_000)
