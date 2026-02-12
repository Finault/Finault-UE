#!/usr/bin/env python3
"""
ACPS - AI Cost & Performance Standard
=====================================
Open Source Reference Implementation (Python)

Version: 2.0.0
License: MIT
Repository: https://github.com/finault/acps

pip install acps-parser

Usage:
    from acps_parser import ACPSParser, AllocationRule
    
    doc = ACPSParser.from_openai_csv('invoice.csv', [
        AllocationRule('eng', 'ENGINEERING', 'project', 'eng-', 'prefix'),
    ])
    
    print(f"Total: ${doc.summary.total_spend}")
"""

import csv
import hashlib
import json
import re
from dataclasses import dataclass, field, asdict
from datetime import datetime
from decimal import Decimal
from enum import Enum
from io import StringIO
from typing import Any, Dict, List, Optional, Tuple


class Provider(Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    AZURE = "azure"
    GOOGLE = "google"
    BEDROCK = "bedrock"
    UNKNOWN = "unknown"


class MatchType(Enum):
    EXACT = "exact"
    PREFIX = "prefix"
    SUFFIX = "suffix"
    CONTAINS = "contains"
    REGEX = "regex"
    DEFAULT = "default"


@dataclass
class AllocationRule:
    """Rule for allocating costs to cost centers."""
    rule_id: str
    cost_center: str
    field: str = "project"
    pattern: str = ""
    match_type: str = "contains"
    team: Optional[str] = None
    gl_account: Optional[str] = None
    priority: int = 100
    
    def matches(self, value: str) -> bool:
        if not value:
            return self.match_type == "default"
        
        value_lower = value.lower()
        pattern_lower = self.pattern.lower()
        
        if self.match_type == "exact":
            return value_lower == pattern_lower
        elif self.match_type == "prefix":
            return value_lower.startswith(pattern_lower)
        elif self.match_type == "suffix":
            return value_lower.endswith(pattern_lower)
        elif self.match_type == "contains":
            return pattern_lower in value_lower
        elif self.match_type == "regex":
            try:
                return bool(re.search(self.pattern, value, re.IGNORECASE))
            except re.error:
                return False
        elif self.match_type == "default":
            return True
        return False


@dataclass
class LineItem:
    """A single line item from an invoice."""
    date: str
    model: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    cost: Decimal
    provider: str
    project: Optional[str] = None
    api_key_id: Optional[str] = None
    request_id: Optional[str] = None
    cost_center: Optional[str] = None
    team: Optional[str] = None
    gl_account: Optional[str] = None
    allocation_method: Optional[str] = None
    allocation_rule_id: Optional[str] = None
    allocation_confidence: float = 1.0


@dataclass
class Allocation:
    """Aggregated allocation to a cost center."""
    cost_center: str
    amount: Decimal
    percentage: float
    line_item_count: int
    team: Optional[str] = None
    gl_account: Optional[str] = None
    models: Dict[str, Decimal] = field(default_factory=dict)
    providers: Dict[str, Decimal] = field(default_factory=dict)


@dataclass
class Summary:
    """Summary statistics for the document."""
    total_spend: Decimal
    allocated_spend: Decimal
    unallocated_spend: Decimal
    allocation_rate: float
    period_start: str
    period_end: str
    total_tokens: int
    total_requests: int
    providers_used: List[str]
    models_used: List[str]
    cost_centers: int


@dataclass
class Metadata:
    """Document metadata."""
    acps_version: str = "2.0.0"
    generated_at: str = ""
    generated_by: str = "acps-parser"
    source_file: Optional[str] = None
    source_hash: Optional[str] = None
    organization: Optional[str] = None
    accounting_period: Optional[str] = None


@dataclass
class Attestation:
    """Cryptographic attestation."""
    hash: str
    algorithm: str = "SHA-256"
    timestamp: str = ""
    previous_hash: Optional[str] = None
    certifier: Optional[str] = None
    certifier_id: Optional[str] = None


@dataclass
class ACPSDocument:
    """Complete ACPS document."""
    metadata: Metadata
    summary: Summary
    allocations: List[Allocation]
    line_items: List[LineItem]
    attestation: Optional[Attestation] = None
    custom: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "metadata": asdict(self.metadata),
            "summary": {
                **asdict(self.summary),
                "total_spend": float(self.summary.total_spend),
                "allocated_spend": float(self.summary.allocated_spend),
                "unallocated_spend": float(self.summary.unallocated_spend),
            },
            "allocations": [
                {**asdict(a), "amount": float(a.amount)}
                for a in self.allocations
            ],
            "line_items": [
                {**asdict(li), "cost": float(li.cost)}
                for li in self.line_items
            ],
            "attestation": asdict(self.attestation) if self.attestation else None,
            "custom": self.custom,
        }
    
    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent)


class ACPSParser:
    """Parser for various AI provider invoice formats."""
    
    COLUMN_MAPPINGS = {
        Provider.OPENAI: {
            "date": ["date", "timestamp", "created_at", "usage_date", "day"],
            "model": ["model", "model_id", "model_name"],
            "input_tokens": ["prompt_tokens", "input_tokens", "context_tokens"],
            "output_tokens": ["completion_tokens", "output_tokens", "generated_tokens"],
            "cost": ["cost", "amount", "total", "cost_in_usd", "usd"],
            "project": ["project_id", "project", "project_name", "api_key_name"],
        },
        Provider.ANTHROPIC: {
            "date": ["date", "timestamp", "created_at", "period"],
            "model": ["model", "model_id", "model_name"],
            "input_tokens": ["input_tokens", "prompt_tokens"],
            "output_tokens": ["output_tokens", "completion_tokens"],
            "cost": ["cost", "total_cost", "amount", "usd"],
            "project": ["workspace_id", "workspace", "project", "api_key_name"],
        },
        Provider.AZURE: {
            "date": ["UsageDateTime", "date", "timestamp"],
            "model": ["deploymentName", "model", "Model"],
            "input_tokens": ["promptTokens", "input_tokens"],
            "output_tokens": ["completionTokens", "output_tokens"],
            "cost": ["cost", "PreTaxCost", "amount"],
            "project": ["ResourceGroup", "Tags", "project"],
        },
        Provider.GOOGLE: {
            "date": ["usage_date", "date", "timestamp"],
            "model": ["model_id", "model", "model_name"],
            "input_tokens": ["input_tokens", "prompt_tokens", "input_characters"],
            "output_tokens": ["output_tokens", "completion_tokens", "output_characters"],
            "cost": ["cost", "total_cost", "amount"],
            "project": ["project_id", "project", "labels"],
        },
        Provider.BEDROCK: {
            "date": ["timestamp", "date", "UsageDate"],
            "model": ["modelId", "model", "ModelId"],
            "input_tokens": ["inputTokenCount", "input_tokens"],
            "output_tokens": ["outputTokenCount", "output_tokens"],
            "cost": ["cost", "charges", "BlendedCost"],
            "project": ["user:Project", "project", "tags"],
        },
    }
    
    PROVIDER_IDENTIFIERS = {
        Provider.OPENAI: ["openai", "gpt-4", "gpt-3.5", "davinci", "chatgpt"],
        Provider.ANTHROPIC: ["anthropic", "claude", "sonnet", "opus", "haiku"],
        Provider.AZURE: ["azure", "microsoft", "openai.azure"],
        Provider.GOOGLE: ["google", "gemini", "palm", "vertex"],
        Provider.BEDROCK: ["bedrock", "amazon", "aws", "titan"],
    }
    
    @classmethod
    def detect_provider(cls, content: str, headers: List[str]) -> Provider:
        content_lower = content.lower()
        headers_lower = [h.lower() for h in headers]
        
        for provider, identifiers in cls.PROVIDER_IDENTIFIERS.items():
            for identifier in identifiers:
                if identifier in content_lower:
                    return provider
                if any(identifier in h for h in headers_lower):
                    return provider
        
        return Provider.OPENAI  # Default
    
    @classmethod
    def find_column(cls, headers: List[str], candidates: List[str]) -> Optional[str]:
        headers_lower = {h.lower(): h for h in headers}
        for candidate in candidates:
            if candidate.lower() in headers_lower:
                return headers_lower[candidate.lower()]
        return None
    
    @classmethod
    def parse_csv(cls, content: str) -> Tuple[List[str], List[Dict[str, str]]]:
        reader = csv.DictReader(StringIO(content))
        headers = reader.fieldnames or []
        rows = list(reader)
        return headers, rows
    
    @classmethod
    def from_csv(
        cls,
        content: str,
        rules: List[AllocationRule],
        provider: Optional[Provider] = None,
        source_file: Optional[str] = None,
        organization: Optional[str] = None,
    ) -> ACPSDocument:
        headers, rows = cls.parse_csv(content)
        
        if not rows:
            raise ValueError("No data rows found in CSV")
        
        # Detect provider if not specified
        if provider is None:
            provider = cls.detect_provider(content, headers)
        
        # Get column mappings
        mappings = cls.COLUMN_MAPPINGS.get(provider, cls.COLUMN_MAPPINGS[Provider.OPENAI])
        
        date_col = cls.find_column(headers, mappings["date"])
        model_col = cls.find_column(headers, mappings["model"])
        input_col = cls.find_column(headers, mappings["input_tokens"])
        output_col = cls.find_column(headers, mappings["output_tokens"])
        cost_col = cls.find_column(headers, mappings["cost"])
        project_col = cls.find_column(headers, mappings["project"])
        
        # Sort rules by priority
        sorted_rules = sorted(rules, key=lambda r: r.priority)
        
        # Process line items
        line_items = []
        for row in rows:
            # Extract values
            date = row.get(date_col, "") if date_col else ""
            model = row.get(model_col, "unknown") if model_col else "unknown"
            input_tokens = int(row.get(input_col, 0) or 0) if input_col else 0
            output_tokens = int(row.get(output_col, 0) or 0) if output_col else 0
            cost = Decimal(str(row.get(cost_col, 0) or 0)) if cost_col else Decimal(0)
            project = row.get(project_col, "") if project_col else ""
            
            # Apply allocation rules
            allocation = None
            for rule in sorted_rules:
                field_value = row.get(rule.field, project) if rule.field != "project" else project
                if rule.matches(field_value):
                    allocation = rule
                    break
            
            line_item = LineItem(
                date=date,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
                cost=cost,
                provider=provider.value,
                project=project,
                cost_center=allocation.cost_center if allocation else "UNALLOCATED",
                team=allocation.team if allocation else None,
                gl_account=allocation.gl_account if allocation else None,
                allocation_method="rule" if allocation else "none",
                allocation_rule_id=allocation.rule_id if allocation else None,
            )
            line_items.append(line_item)
        
        # Calculate allocations
        allocation_map: Dict[str, Dict[str, Any]] = {}
        for li in line_items:
            cc = li.cost_center or "UNALLOCATED"
            if cc not in allocation_map:
                allocation_map[cc] = {
                    "amount": Decimal(0),
                    "count": 0,
                    "team": li.team,
                    "gl_account": li.gl_account,
                    "models": {},
                    "providers": {},
                }
            allocation_map[cc]["amount"] += li.cost
            allocation_map[cc]["count"] += 1
            
            if li.model not in allocation_map[cc]["models"]:
                allocation_map[cc]["models"][li.model] = Decimal(0)
            allocation_map[cc]["models"][li.model] += li.cost
            
            if li.provider not in allocation_map[cc]["providers"]:
                allocation_map[cc]["providers"][li.provider] = Decimal(0)
            allocation_map[cc]["providers"][li.provider] += li.cost
        
        total_spend = sum(li.cost for li in line_items)
        
        allocations = [
            Allocation(
                cost_center=cc,
                amount=data["amount"],
                percentage=float(data["amount"] / total_spend * 100) if total_spend else 0,
                line_item_count=data["count"],
                team=data["team"],
                gl_account=data["gl_account"],
                models={k: float(v) for k, v in data["models"].items()},
                providers={k: float(v) for k, v in data["providers"].items()},
            )
            for cc, data in allocation_map.items()
        ]
        
        # Calculate summary
        dates = sorted([li.date for li in line_items if li.date])
        allocated_spend = sum(li.cost for li in line_items if li.cost_center != "UNALLOCATED")
        
        summary = Summary(
            total_spend=total_spend,
            allocated_spend=allocated_spend,
            unallocated_spend=total_spend - allocated_spend,
            allocation_rate=float(allocated_spend / total_spend * 100) if total_spend else 0,
            period_start=dates[0] if dates else "",
            period_end=dates[-1] if dates else "",
            total_tokens=sum(li.total_tokens for li in line_items),
            total_requests=len(line_items),
            providers_used=list(set(li.provider for li in line_items)),
            models_used=list(set(li.model for li in line_items)),
            cost_centers=len(allocation_map),
        )
        
        # Create metadata
        source_hash = hashlib.sha256(content.encode()).hexdigest()
        metadata = Metadata(
            generated_at=datetime.utcnow().isoformat() + "Z",
            source_file=source_file,
            source_hash=source_hash,
            organization=organization,
            accounting_period=f"{dates[0][:7] if dates else ''}" if dates else None,
        )
        
        # Create attestation
        doc_content = json.dumps({
            "summary": {"total_spend": float(total_spend)},
            "allocations": [{"cc": a.cost_center, "amount": float(a.amount)} for a in allocations],
        })
        attestation = Attestation(
            hash=hashlib.sha256(doc_content.encode()).hexdigest(),
            timestamp=datetime.utcnow().isoformat() + "Z",
        )
        
        return ACPSDocument(
            metadata=metadata,
            summary=summary,
            allocations=allocations,
            line_items=line_items,
            attestation=attestation,
        )
    
    @classmethod
    def from_openai_csv(cls, content: str, rules: List[AllocationRule], **kwargs) -> ACPSDocument:
        return cls.from_csv(content, rules, provider=Provider.OPENAI, **kwargs)
    
    @classmethod
    def from_anthropic_csv(cls, content: str, rules: List[AllocationRule], **kwargs) -> ACPSDocument:
        return cls.from_csv(content, rules, provider=Provider.ANTHROPIC, **kwargs)


class ClosePackExporter:
    """Export ACPS documents to various formats."""
    
    @classmethod
    def to_journal_csv(cls, doc: ACPSDocument, company: str = "Company") -> str:
        """Export to QuickBooks-compatible journal entry CSV."""
        lines = ["Line,Journal No,Date,Account Code,Account Name,Debit,Credit,Cost Center,Memo,Reference"]
        
        journal_no = f"JE-AI-{datetime.now().strftime('%Y%m')}"
        date = doc.summary.period_end or datetime.now().strftime("%Y-%m-%d")
        
        line_num = 1
        for alloc in doc.allocations:
            if alloc.cost_center == "UNALLOCATED":
                continue
            
            # Debit line (expense)
            account_code = alloc.gl_account or f"6{hash(alloc.cost_center) % 1000:03d}"
            lines.append(f'{line_num},{journal_no},{date},{account_code},'
                        f'"AI Expense - {alloc.cost_center}",{float(alloc.amount):.2f},,'
                        f'{alloc.cost_center},"AI spend allocation",{doc.attestation.hash[:8] if doc.attestation else ""}')
            line_num += 1
        
        # Credit line (AP)
        total = sum(a.amount for a in doc.allocations if a.cost_center != "UNALLOCATED")
        lines.append(f'{line_num},{journal_no},{date},2100,"Accounts Payable",,{float(total):.2f},'
                    f'CORPORATE,"AI provider payable",{doc.attestation.hash[:8] if doc.attestation else ""}')
        
        return "\n".join(lines)
    
    @classmethod
    def to_netsuite_csv(cls, doc: ACPSDocument) -> str:
        """Export to NetSuite CSV import format."""
        lines = ["External ID,Transaction Date,Posting Period,Account,Debit,Credit,Memo,Department,Class"]
        
        period = doc.summary.period_end[:7] if doc.summary.period_end else datetime.now().strftime("%Y-%m")
        ext_id = f"FINAULT-{period}"
        
        for alloc in doc.allocations:
            if alloc.cost_center == "UNALLOCATED":
                continue
            
            lines.append(f'{ext_id},{doc.summary.period_end},{period},'
                        f'"AI Expense",{float(alloc.amount):.2f},,"AI allocation",'
                        f'{alloc.cost_center},{alloc.team or ""}')
        
        total = sum(a.amount for a in doc.allocations if a.cost_center != "UNALLOCATED")
        lines.append(f'{ext_id},{doc.summary.period_end},{period},'
                    f'"Accounts Payable",,{float(total):.2f},"AI provider payable",CORPORATE,')
        
        return "\n".join(lines)
    
    @classmethod
    def to_xero_csv(cls, doc: ACPSDocument) -> str:
        """Export to Xero CSV import format."""
        lines = ["*ContactName,*InvoiceNumber,*InvoiceDate,*DueDate,Description,*Quantity,*UnitAmount,*AccountCode,TaxType,TrackingName1,TrackingOption1"]
        
        invoice_no = f"AI-{datetime.now().strftime('%Y%m%d')}"
        date = doc.summary.period_end or datetime.now().strftime("%Y-%m-%d")
        # Xero uses DD/MM/YYYY
        date_parts = date.split("-")
        xero_date = f"{date_parts[2]}/{date_parts[1]}/{date_parts[0]}" if len(date_parts) == 3 else date
        
        for alloc in doc.allocations:
            if alloc.cost_center == "UNALLOCATED":
                continue
            
            lines.append(f'"AI Provider",{invoice_no},{xero_date},{xero_date},'
                        f'"AI Spend - {alloc.cost_center}",1,{float(alloc.amount):.2f},'
                        f'6000,"Tax Exempt","Cost Center","{alloc.cost_center}"')
        
        return "\n".join(lines)


# CLI interface
def main():
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: acps-parser <command> [options]")
        print("Commands:")
        print("  parse <file.csv>    Parse an invoice file")
        print("  export <file.json>  Export to journal CSV")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "parse":
        if len(sys.argv) < 3:
            print("Usage: acps-parser parse <file.csv>")
            sys.exit(1)
        
        with open(sys.argv[2], "r") as f:
            content = f.read()
        
        # Default rules
        rules = [
            AllocationRule("default", "GENERAL", match_type="default"),
        ]
        
        doc = ACPSParser.from_csv(content, rules)
        print(doc.to_json())
    
    elif command == "export":
        if len(sys.argv) < 3:
            print("Usage: acps-parser export <file.json>")
            sys.exit(1)
        
        print("Export not yet implemented")
    
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()
