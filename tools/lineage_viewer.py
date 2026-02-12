#!/usr/bin/env python3
"""
Finault Lineage Viewer

CLI tool to visualize close pack lineage chains and drift deltas.
Parses history.json and variance data to show timeline relationships.

Usage:
    python lineage_viewer.py --zip closepack.zip
    python lineage_viewer.py --derived /path/to/derived/
    python lineage_viewer.py --zip closepack.zip --html lineage.html
"""

import argparse
import json
import os
import sys
import tempfile
import zipfile
from datetime import datetime
from typing import Any, Optional


# ============================================================================
# COLORS FOR CLI OUTPUT
# ============================================================================

class Colors:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    RED = "\033[31m"
    CYAN = "\033[36m"
    BLUE = "\033[34m"


def colorize(text: str, color: str) -> str:
    """Apply color to text for terminal output."""
    return f"{color}{text}{Colors.RESET}"


# ============================================================================
# DATA EXTRACTION
# ============================================================================


def extract_from_zip(zip_path: str) -> dict[str, Any]:
    """Extract lineage data from a Close Pack ZIP."""
    data = {
        "manifest": None,
        "history": None,
        "fcs": None,
        "drift": None,
        "variance": None,
    }

    with zipfile.ZipFile(zip_path, "r") as zf:
        file_names = zf.namelist()

        # Find and load manifest
        manifest_file = next(
            (f for f in file_names if f.endswith("-manifest.json") or f == "manifest.json"),
            None,
        )
        if manifest_file:
            data["manifest"] = json.loads(zf.read(manifest_file).decode("utf-8"))

        # Find and load history
        history_file = next((f for f in file_names if "history.json" in f), None)
        if history_file:
            data["history"] = json.loads(zf.read(history_file).decode("utf-8"))

        # Find and load FCS
        fcs_file = next((f for f in file_names if "fcs.json" in f), None)
        if fcs_file:
            data["fcs"] = json.loads(zf.read(fcs_file).decode("utf-8"))

        # Find and load drift
        drift_file = next(
            (f for f in file_names if "drift" in f and f.endswith(".json")),
            None,
        )
        if drift_file:
            data["drift"] = json.loads(zf.read(drift_file).decode("utf-8"))

        # Find and load variance
        variance_file = next(
            (f for f in file_names if "variance" in f and f.endswith(".json")),
            None,
        )
        if variance_file:
            data["variance"] = json.loads(zf.read(variance_file).decode("utf-8"))

    return data


def extract_from_directory(derived_path: str) -> dict[str, Any]:
    """Extract lineage data from a derived/ directory."""
    data = {
        "manifest": None,
        "history": None,
        "fcs": None,
        "drift": None,
        "variance": None,
    }

    for filename in os.listdir(derived_path):
        filepath = os.path.join(derived_path, filename)

        if "manifest" in filename and filename.endswith(".json"):
            with open(filepath) as f:
                data["manifest"] = json.load(f)
        elif "history" in filename and filename.endswith(".json"):
            with open(filepath) as f:
                data["history"] = json.load(f)
        elif "fcs" in filename and filename.endswith(".json"):
            with open(filepath) as f:
                data["fcs"] = json.load(f)
        elif "drift" in filename and filename.endswith(".json"):
            with open(filepath) as f:
                data["drift"] = json.load(f)
        elif "variance" in filename and filename.endswith(".json"):
            with open(filepath) as f:
                data["variance"] = json.load(f)

    return data


# ============================================================================
# CLI DISPLAY
# ============================================================================


def display_lineage_cli(data: dict[str, Any]) -> None:
    """Display lineage information in CLI format."""
    manifest = data.get("manifest", {})
    history = data.get("history", {})
    fcs = data.get("fcs", {})
    drift = data.get("drift", {})
    variance = data.get("variance", {})

    close_id = manifest.get("close_id") or history.get("close_id", "Unknown")
    period = manifest.get("period", {})

    print("\n" + "─" * 60)
    print(colorize("FINAULT LINEAGE VIEWER", Colors.BOLD + Colors.CYAN))
    print("─" * 60)

    # Current close info
    print(f"\n{colorize('➤ Close ID:', Colors.BOLD)} {close_id}")
    if period:
        print(f"  Period: {period.get('start', '?')} to {period.get('end', '?')}")

    if manifest.get("providers"):
        print(f"  Providers: {', '.join(manifest['providers'])}")

    if manifest.get("total_spend"):
        print(f"  Total Spend: ${manifest['total_spend']:,.2f}")

    # FCS Score
    if fcs:
        fcs_score = fcs.get("fcs_score", 0)
        fcs_level = fcs.get("fcs_level", "N/A")
        level_color = (
            Colors.GREEN if fcs_level == "HIGH"
            else Colors.YELLOW if fcs_level == "MEDIUM"
            else Colors.RED
        )
        print(f"\n  {colorize('FCS:', Colors.BOLD)} {colorize(f'{fcs_score} ({fcs_level})', level_color)}")

        if fcs.get("reason_codes"):
            print(f"  Reason Codes: {', '.join(fcs['reason_codes'])}")

    # Drift Events
    if drift:
        drift_events = drift.get("driftEvents", [])
        severity = drift.get("summary", {}).get("overallDriftSeverity", "NONE")
        sev_color = (
            Colors.GREEN if severity == "NONE"
            else Colors.YELLOW if severity in ["LOW", "MEDIUM"]
            else Colors.RED
        )

        print(f"\n  {colorize('Drift:', Colors.BOLD)} {colorize(severity, sev_color)} ({len(drift_events)} events)")

        if drift_events:
            print("  Top Movers:")
            for event in drift_events[:5]:
                metric = event.get("metric_key", "Unknown")
                deviation = event.get("deviation_percent", 0)
                evt_sev = event.get("severity", "?")
                evt_color = (
                    Colors.RED if evt_sev == "HIGH"
                    else Colors.YELLOW if evt_sev == "MEDIUM"
                    else Colors.GREEN
                )
                print(f"    {colorize('•', evt_color)} {metric}: {deviation:.1f}% ({evt_sev})")

    # Variance
    if variance and variance.get("status") != "UNAVAILABLE":
        top_movers = variance.get("topMovers", [])
        if top_movers:
            print(f"\n  {colorize('Variance Top Movers:', Colors.BOLD)}")
            for mover in top_movers[:5]:
                dim = mover.get("dimension_value", "?")
                delta = mover.get("delta_amount", 0)
                pct = mover.get("delta_pct", 0)
                direction = "↑" if delta > 0 else "↓" if delta < 0 else "→"
                color = Colors.RED if abs(pct) > 10 else Colors.YELLOW if abs(pct) > 5 else Colors.GREEN
                print(f"    {colorize(direction, color)} {dim}: ${delta:,.2f} ({pct:+.1f}%)")

    # Lineage Chain
    print(f"\n{colorize('Lineage Chain:', Colors.BOLD)}")
    history_depth = history.get("history_depth", 1)
    print(f"  Depth: {history_depth}")

    print(f"\n  {colorize(close_id, Colors.CYAN)} {colorize('(current)', Colors.DIM)}")

    chain = history.get("chain", [])
    if chain:
        for i, prior in enumerate(chain):
            prior_id = prior.get("close_id", "?")
            prior_start = prior.get("period_start", "?")
            prior_end = prior.get("period_end", "?")
            prefix = "  └─" if i == len(chain) - 1 else "  ├─"
            print(f"  {prefix} {prior_id} ({prior_start} to {prior_end})")
    else:
        print(f"  └─ {colorize('(First close - no prior history)', Colors.DIM)}")

    print("\n" + "─" * 60 + "\n")


# ============================================================================
# HTML GENERATION
# ============================================================================


def generate_lineage_html(data: dict[str, Any], output_path: str) -> None:
    """Generate HTML lineage visualization."""
    manifest = data.get("manifest", {})
    history = data.get("history", {})
    fcs = data.get("fcs", {})
    drift = data.get("drift", {})
    variance = data.get("variance", {})

    close_id = manifest.get("close_id") or history.get("close_id", "Unknown")
    period = manifest.get("period", {})
    fcs_score = fcs.get("fcs_score", "N/A") if fcs else "N/A"
    fcs_level = fcs.get("fcs_level", "N/A") if fcs else "N/A"
    drift_severity = drift.get("summary", {}).get("overallDriftSeverity", "NONE") if drift else "NONE"

    # Build drift events HTML
    drift_events_html = ""
    if drift and drift.get("driftEvents"):
        for event in drift["driftEvents"][:10]:
            color = "#dc3545" if event.get("severity") == "HIGH" else "#ffc107" if event.get("severity") == "MEDIUM" else "#28a745"
            drift_events_html += f'<li style="color: {color}">{event.get("metric_key", "?")}: {event.get("deviation_percent", 0):.1f}% ({event.get("severity", "?")})</li>'
    else:
        drift_events_html = "<li>No drift events detected</li>"

    # Build lineage chain HTML
    chain_html = ""
    chain = history.get("chain", []) if history else []
    for prior in chain:
        chain_html += f'<li>← {prior.get("close_id", "?")} ({prior.get("period_start", "?")} to {prior.get("period_end", "?")})</li>'

    # Build variance HTML
    variance_html = ""
    if variance and variance.get("topMovers"):
        for mover in variance["topMovers"][:5]:
            delta = mover.get("delta_amount", 0)
            pct = mover.get("delta_pct", 0)
            color = "#dc3545" if abs(pct) > 10 else "#ffc107" if abs(pct) > 5 else "#28a745"
            variance_html += f'<li style="color: {color}">{mover.get("dimension_value", "?")}: ${delta:,.2f} ({pct:+.1f}%)</li>'
    else:
        variance_html = "<li>No variance data available</li>"

    # FCS color
    fcs_color = "#28a745" if fcs_level == "HIGH" else "#ffc107" if fcs_level == "MEDIUM" else "#dc3545"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Finault Lineage - {close_id}</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      background: #f8f9fa;
      color: #333;
    }}
    h1 {{ color: #2c3e50; margin-bottom: 5px; }}
    .subtitle {{ color: #7f8c8d; margin-bottom: 20px; }}
    .card {{
      background: white;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }}
    .card h2 {{
      color: #2c3e50;
      border-bottom: 2px solid #eee;
      padding-bottom: 10px;
      margin-top: 0;
    }}
    .info-row {{
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #f0f0f0;
    }}
    .info-row:last-child {{ border-bottom: none; }}
    .info-label {{ color: #7f8c8d; font-weight: 500; }}
    .info-value {{ color: #2c3e50; font-weight: 600; }}
    .fcs-badge {{
      display: inline-block;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 18px;
      font-weight: bold;
      color: white;
      background: {fcs_color};
    }}
    .lineage-list {{
      font-family: 'Menlo', 'Monaco', monospace;
      font-size: 14px;
      padding-left: 0;
      list-style: none;
    }}
    .lineage-list li {{
      padding: 8px 12px;
      margin: 4px 0;
      background: #f8f9fa;
      border-radius: 6px;
      border-left: 3px solid #3498db;
    }}
    .lineage-list li.current {{
      background: #e8f4fd;
      border-left-color: #2980b9;
      font-weight: bold;
    }}
    ul.events {{ padding-left: 20px; }}
    ul.events li {{ margin: 8px 0; }}
    footer {{
      text-align: center;
      color: #95a5a6;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #eee;
    }}
  </style>
</head>
<body>
  <h1>📊 Finault Lineage Viewer</h1>
  <p class="subtitle">Close Pack Analysis & Visualization</p>

  <div class="card">
    <h2>📋 Close Pack: {close_id}</h2>
    <div class="info-row">
      <span class="info-label">Period</span>
      <span class="info-value">{period.get('start', 'N/A')} to {period.get('end', 'N/A')}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Providers</span>
      <span class="info-value">{', '.join(manifest.get('providers', ['N/A']))}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Total Spend</span>
      <span class="info-value">${manifest.get('total_spend', 0):,.2f}</span>
    </div>
    <div class="info-row">
      <span class="info-label">FCS Score</span>
      <span class="info-value"><span class="fcs-badge">{fcs_score} ({fcs_level})</span></span>
    </div>
  </div>

  <div class="card">
    <h2>📈 Drift Events ({drift_severity})</h2>
    <ul class="events">{drift_events_html}</ul>
  </div>

  <div class="card">
    <h2>📊 Variance Analysis</h2>
    <ul class="events">{variance_html}</ul>
  </div>

  <div class="card">
    <h2>🔗 Lineage Chain (Depth: {history.get('history_depth', 1) if history else 1})</h2>
    <ul class="lineage-list">
      <li class="current"><strong>{close_id}</strong> (current)</li>
      {chain_html}
    </ul>
  </div>

  <footer>
    Generated by Finault Lineage Viewer • {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC
  </footer>
</body>
</html>"""

    with open(output_path, "w") as f:
        f.write(html)

    print(f"✅ HTML lineage visualization written to: {output_path}")


# ============================================================================
# MAIN
# ============================================================================


def main():
    parser = argparse.ArgumentParser(
        description="Finault Lineage Viewer - Visualize close pack lineage and drift",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python lineage_viewer.py --zip closepack.zip
  python lineage_viewer.py --derived ./derived/
  python lineage_viewer.py --zip closepack.zip --html lineage.html
        """,
    )
    parser.add_argument("--zip", "-z", help="Path to Close Pack ZIP file")
    parser.add_argument("--derived", "-d", help="Path to derived/ directory")
    parser.add_argument("--html", "-o", help="Output HTML file path")

    args = parser.parse_args()

    if not args.zip and not args.derived:
        parser.error("Either --zip or --derived must be specified")

    # Extract data
    if args.zip:
        if not os.path.exists(args.zip):
            print(f"❌ File not found: {args.zip}")
            sys.exit(1)
        data = extract_from_zip(args.zip)
    else:
        if not os.path.isdir(args.derived):
            print(f"❌ Directory not found: {args.derived}")
            sys.exit(1)
        data = extract_from_directory(args.derived)

    # Generate output
    if args.html:
        generate_lineage_html(data, args.html)
    else:
        display_lineage_cli(data)


if __name__ == "__main__":
    main()
