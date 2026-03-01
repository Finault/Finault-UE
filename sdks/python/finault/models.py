"""Data models for the Finault SDK"""

from typing import Dict, List, Any, Optional, Iterator
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class BaseModel:
    """Base model class with dict conversion and repr"""

    def to_dict(self) -> Dict[str, Any]:
        """Convert model to dictionary"""
        return {k: v for k, v in self.__dict__.items() if not k.startswith("_")}

    def __repr__(self) -> str:
        attrs = ", ".join(f"{k}={v!r}" for k, v in self.__dict__.items() if not k.startswith("_"))
        return f"{self.__class__.__name__}({attrs})"


@dataclass
class ChatMessage(BaseModel):
    """Chat message object"""

    role: str
    content: str


@dataclass
class ChatCompletionChunk(BaseModel):
    """Streaming chat completion chunk"""

    id: str
    object: str
    created: int
    model: str
    delta: Dict[str, Any]
    finish_reason: Optional[str] = None


@dataclass
class ChatCompletion(BaseModel):
    """Chat completion response"""

    id: str
    object: str
    created: int
    model: str
    content: str
    tokens: int
    input_tokens: int
    output_tokens: int
    cost: float
    currency: str = "USD"
    request_id: str = ""
    provider: str = ""
    finish_reason: str = "stop"
    usage: Optional[Dict[str, int]] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ChatCompletion":
        """Create instance from API response"""
        return cls(
            id=data.get("id", ""),
            object=data.get("object", "chat.completion"),
            created=data.get("created", 0),
            model=data.get("model", ""),
            content=data.get("choices", [{}])[0].get("message", {}).get("content", ""),
            tokens=data.get("usage", {}).get("total_tokens", 0),
            input_tokens=data.get("usage", {}).get("prompt_tokens", 0),
            output_tokens=data.get("usage", {}).get("completion_tokens", 0),
            cost=data.get("cost", 0.0),
            currency=data.get("currency", "USD"),
            request_id=data.get("request_id", ""),
            provider=data.get("provider", ""),
            finish_reason=data.get("choices", [{}])[0].get("finish_reason", "stop"),
        )


@dataclass
class ClosePack(BaseModel):
    """Close pack for a specific period"""

    id: str
    period: str
    created_at: str
    updated_at: str
    status: str
    summary: str
    total_spend: float
    transaction_count: int
    journal_entries: List[Dict[str, Any]] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ClosePack":
        """Create instance from API response"""
        return cls(
            id=data.get("id", ""),
            period=data.get("period", ""),
            created_at=data.get("created_at", ""),
            updated_at=data.get("updated_at", ""),
            status=data.get("status", "draft"),
            summary=data.get("summary", ""),
            total_spend=data.get("total_spend", 0.0),
            transaction_count=data.get("transaction_count", 0),
            journal_entries=data.get("journal_entries", []),
        )


@dataclass
class Budget(BaseModel):
    """Budget object"""

    id: str
    name: str
    limit: float
    spent: float
    period: str
    status: str
    alerts: List[Dict[str, Any]] = field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""

    @property
    def remaining(self) -> float:
        """Calculate remaining budget"""
        return max(0, self.limit - self.spent)

    @property
    def utilization_percent(self) -> float:
        """Calculate budget utilization percentage"""
        if self.limit == 0:
            return 0.0
        return (self.spent / self.limit) * 100

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Budget":
        """Create instance from API response"""
        return cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            limit=data.get("limit", 0.0),
            spent=data.get("spent", 0.0),
            period=data.get("period", "monthly"),
            status=data.get("status", "active"),
            alerts=data.get("alerts", []),
            created_at=data.get("created_at", ""),
            updated_at=data.get("updated_at", ""),
        )


@dataclass
class Anomaly(BaseModel):
    """Cost anomaly detection result"""

    id: str
    type: str
    severity: str
    description: str
    detected_at: str
    amount_variance: float
    percentage_variance: float
    acknowledged: bool = False
    acknowledged_at: Optional[str] = None
    acknowledged_by: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Anomaly":
        """Create instance from API response"""
        return cls(
            id=data.get("id", ""),
            type=data.get("type", ""),
            severity=data.get("severity", "medium"),
            description=data.get("description", ""),
            detected_at=data.get("detected_at", ""),
            amount_variance=data.get("amount_variance", 0.0),
            percentage_variance=data.get("percentage_variance", 0.0),
            acknowledged=data.get("acknowledged", False),
            acknowledged_at=data.get("acknowledged_at"),
            acknowledged_by=data.get("acknowledged_by"),
        )


@dataclass
class APIKey(BaseModel):
    """API key object"""

    id: str
    name: str
    key_preview: str
    created_at: str
    last_used_at: Optional[str] = None
    status: str = "active"

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "APIKey":
        """Create instance from API response"""
        return cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            key_preview=data.get("key_preview", ""),
            created_at=data.get("created_at", ""),
            last_used_at=data.get("last_used_at"),
            status=data.get("status", "active"),
        )


@dataclass
class DashboardOverview(BaseModel):
    """Dashboard overview metrics"""

    total_spend: float
    spend_trend: float
    request_count: int
    average_cost_per_request: float
    top_models: List[Dict[str, Any]] = field(default_factory=list)
    top_providers: List[Dict[str, Any]] = field(default_factory=list)
    budget_status: List[Dict[str, Any]] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DashboardOverview":
        """Create instance from API response"""
        return cls(
            total_spend=data.get("total_spend", 0.0),
            spend_trend=data.get("spend_trend", 0.0),
            request_count=data.get("request_count", 0),
            average_cost_per_request=data.get("average_cost_per_request", 0.0),
            top_models=data.get("top_models", []),
            top_providers=data.get("top_providers", []),
            budget_status=data.get("budget_status", []),
        )


@dataclass
class DashboardInsights(BaseModel):
    """Dashboard insights"""

    key_findings: List[str] = field(default_factory=list)
    recommendations: List[str] = field(default_factory=list)
    optimization_opportunities: List[Dict[str, Any]] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DashboardInsights":
        """Create instance from API response"""
        return cls(
            key_findings=data.get("key_findings", []),
            recommendations=data.get("recommendations", []),
            optimization_opportunities=data.get("optimization_opportunities", []),
        )


@dataclass
class HealthStatus(BaseModel):
    """Health check response"""

    status: str
    timestamp: str
    version: str = ""

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "HealthStatus":
        """Create instance from API response"""
        return cls(
            status=data.get("status", "unknown"),
            timestamp=data.get("timestamp", ""),
            version=data.get("version", ""),
        )


@dataclass
class PricingInfo(BaseModel):
    """Pricing information"""

    models: Dict[str, Dict[str, float]] = field(default_factory=dict)
    providers: List[str] = field(default_factory=list)
    last_updated: str = ""

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PricingInfo":
        """Create instance from API response"""
        return cls(
            models=data.get("models", {}),
            providers=data.get("providers", []),
            last_updated=data.get("last_updated", ""),
        )
