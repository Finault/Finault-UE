"""
Finault OpenTelemetry Exporter (Python)
═════════════════════════════════════════════════════════════════════════════════

OTel span exporter that emits spans with Finault cost, margin, and seal attributes
Compatible with opentelemetry-api standard
"""

import json
import time
import threading
import requests
from typing import List, Optional, Dict, Any
from opentelemetry.sdk.trace import ReadableSpan, SpanExporter
from opentelemetry.sdk.trace.export import SpanExportResult


class FinaultOtelExporter(SpanExporter):
    """
    Finault OpenTelemetry Span Exporter

    Exports spans with Finault-specific attributes (cost, margin, seal data)
    to the Finault telemetry API.
    """

    def __init__(
        self,
        org_id: str,
        api_key: str,
        endpoint: str = "https://gateway.finault.ai/api/telemetry",
        batch_size: int = 100,
        flush_interval: float = 5.0
    ):
        """
        Initialize Finault OTel exporter

        Args:
            org_id: Organization ID
            api_key: Finault API key
            endpoint: Telemetry API endpoint
            batch_size: Number of spans to batch before flushing
            flush_interval: Seconds between auto-flushes
        """
        self.org_id = org_id
        self.api_key = api_key
        self.endpoint = endpoint
        self.batch_size = batch_size
        self.flush_interval = flush_interval

        self.buffer: List[ReadableSpan] = []
        self.buffer_lock = threading.Lock()
        self.flush_timer: Optional[threading.Timer] = None

    def export(self, spans: List[ReadableSpan]) -> SpanExportResult:
        """Export spans"""
        try:
            with self.buffer_lock:
                self.buffer.extend(spans)

                # Auto-flush if buffer exceeds batch size
                if len(self.buffer) >= self.batch_size:
                    self._flush()
                else:
                    # Schedule flush if not already scheduled
                    self._schedule_flush()

            return SpanExportResult.SUCCESS
        except Exception as err:
            print(f"Failed to export spans: {err}")
            return SpanExportResult.FAILED_NOT_RETRYABLE

    def shutdown(self) -> None:
        """Shutdown exporter"""
        if self.flush_timer:
            self.flush_timer.cancel()

        with self.buffer_lock:
            self._flush()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        """Force flush buffered spans"""
        if self.flush_timer:
            self.flush_timer.cancel()
            self.flush_timer = None

        with self.buffer_lock:
            self._flush()

        return True

    def _schedule_flush(self) -> None:
        """Schedule automatic flush"""
        if not self.flush_timer:
            self.flush_timer = threading.Timer(
                self.flush_interval,
                self._flush_thread_safe
            )
            self.flush_timer.daemon = True
            self.flush_timer.start()

    def _flush_thread_safe(self) -> None:
        """Thread-safe flush"""
        with self.buffer_lock:
            self._flush()

    def _flush(self) -> None:
        """Flush buffered spans"""
        if not self.buffer:
            return

        spans_to_export = self.buffer[:self.batch_size]
        self.buffer = self.buffer[self.batch_size:]

        try:
            telemetry_events = [
                self._span_to_telemetry_event(span)
                for span in spans_to_export
            ]

            payload = {
                "events": telemetry_events,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }

            headers = {
                "Content-Type": "application/json",
                "X-Finault-Org-ID": self.org_id,
                "X-Finault-API-Key": self.api_key
            }

            requests.post(self.endpoint, json=payload, headers=headers, timeout=10)
            print(f"Exported {len(telemetry_events)} telemetry events")

        except Exception as err:
            print(f"Failed to flush spans: {err}")
            # Re-add spans to buffer for retry
            self.buffer = spans_to_export + self.buffer

        # Schedule next flush if buffer still has items
        if self.buffer:
            self._schedule_flush()

    def _span_to_telemetry_event(self, span: ReadableSpan) -> Dict[str, Any]:
        """Convert span to Finault telemetry event"""
        attributes = span.attributes or {}

        # Convert timestamps from nanoseconds to milliseconds
        start_time_ms = span.start_time / 1e6
        end_time_ms = span.end_time / 1e6
        duration_ms = (span.end_time - span.start_time) / 1e6

        return {
            "trace_id": span.context.trace_id,
            "span_id": span.context.span_id,
            "parent_span_id": span.parent.span_id if span.parent else None,
            "name": span.name,
            "start_time": start_time_ms,
            "end_time": end_time_ms,
            "duration_ms": duration_ms,

            # Finault-specific attributes
            "finault": {
                "cost_usd": attributes.get("finault.cost"),
                "margin_usd": attributes.get("finault.margin"),
                "margin_percent": attributes.get("finault.margin_percent"),
                "seal_id": attributes.get("finault.seal_id"),
                "seal_url": attributes.get("finault.seal_url"),
                "model": attributes.get("finault.model"),
                "provider": attributes.get("finault.provider"),
                "tokens_in": attributes.get("finault.tokens_in"),
                "tokens_out": attributes.get("finault.tokens_out"),
                "cache_hit": attributes.get("finault.cache_hit"),
                "cost_method": attributes.get("finault.cost_method")
            },

            # Standard attributes
            "attributes": {
                "http.method": attributes.get("http.method"),
                "http.url": attributes.get("http.url"),
                "http.status_code": attributes.get("http.status_code"),
                "http.host": attributes.get("http.host"),
                "http.scheme": attributes.get("http.scheme"),
                "component": attributes.get("component")
            },

            # Status
            "status": {
                "code": span.status.status_code.name if span.status else None,
                "message": span.status.description if span.status else None
            },

            # Events
            "events": [
                {
                    "name": event.name,
                    "timestamp": event.timestamp / 1e6,
                    "attributes": event.attributes or {}
                }
                for event in (span.events or [])
            ]
        }


def init_finault_otel(
    org_id: str,
    api_key: str,
    endpoint: Optional[str] = None,
    auto_instrument: bool = False
) -> FinaultOtelExporter:
    """
    Initialize Finault OpenTelemetry exporter

    Args:
        org_id: Organization ID
        api_key: Finault API key
        endpoint: Optional custom endpoint
        auto_instrument: Whether to auto-instrument (future use)

    Returns:
        FinaultOtelExporter instance
    """
    return FinaultOtelExporter(
        org_id=org_id,
        api_key=api_key,
        endpoint=endpoint or "https://gateway.finault.ai/api/telemetry"
    )


__all__ = ["FinaultOtelExporter", "init_finault_otel"]
