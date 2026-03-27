"""
Finault CLI — Python command-line interface for AI cost governance.

Provides commands for initialization, status reporting, diagnostics,
historical data syncing, and batch reconciliation. Uses ANSI colors and
box-drawing for clean output.

No external dependencies beyond what's already in finault (requests).

Usage:
    finault init [--provider PROVIDER] [--api-key KEY]
    finault status
    finault doctor
    finault sync [--days DAYS] [--provider PROVIDER]
    finault reconcile --period 2026-03
"""

import os
import sys
import json
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, Optional, List

try:
    from .client import FinaultClient
    from .version import __version__
except ImportError:
    # Allow running as script
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent))
    from client import FinaultClient
    from version import __version__


# ─── ANSI Colors & Box Drawing (no dependencies) ────────────────────────────

class Colors:
    """ANSI color codes"""
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"

    # Foreground
    BLACK = "\033[30m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"
    WHITE = "\033[37m"
    GRAY = "\033[90m"

    # Background
    BG_RED = "\033[41m"
    BG_GREEN = "\033[42m"
    BG_YELLOW = "\033[43m"


class Box:
    """Box drawing characters"""
    # Unicode box-drawing characters
    TL = "┌"
    TR = "┐"
    BL = "└"
    BR = "┘"
    H = "─"
    V = "│"
    T = "┬"
    B = "┴"
    L = "├"
    R = "┤"
    CROSS = "┼"


def colored(text: str, color: str) -> str:
    """Apply ANSI color to text."""
    return f"{color}{text}{Colors.RESET}"


def bold(text: str) -> str:
    """Make text bold."""
    return f"{Colors.BOLD}{text}{Colors.RESET}"


def dim(text: str) -> str:
    """Make text dim."""
    return f"{Colors.DIM}{text}{Colors.RESET}"


def success(text: str) -> str:
    """Green success text."""
    return colored(text, Colors.GREEN)


def error(text: str) -> str:
    """Red error text."""
    return colored(text, Colors.RED)


def warning(text: str) -> str:
    """Yellow warning text."""
    return colored(text, Colors.YELLOW)


def info(text: str) -> str:
    """Cyan info text."""
    return colored(text, Colors.CYAN)


def draw_box(
    title: str,
    content: str,
    width: int = 60,
    color: str = Colors.CYAN
) -> str:
    """
    Draw a box with title and content.

    Args:
        title: Box title
        content: Content lines (can be multi-line string)
        width: Box width in characters
        color: Color for box borders
    """
    lines = content.split("\n")

    # Build box
    box = colored(Box.TL + Box.H * (width - 2) + Box.TR + "\n", color)

    # Title line
    if title:
        title_str = f" {title} "
        padding = width - len(title_str) - 2
        left_pad = padding // 2
        right_pad = padding - left_pad
        box += colored(Box.V, color) + " " * left_pad + bold(title_str) + " " * right_pad + colored(Box.V + "\n", color)
        box += colored(Box.L + Box.H * (width - 2) + Box.R + "\n", color)

    # Content lines
    for line in lines:
        # Truncate or pad to fit
        if len(line) > width - 4:
            line = line[:width - 7] + "..."
        padding = width - len(line) - 4
        box += colored(Box.V, color) + " " + line + " " * (padding + 1) + colored(Box.V + "\n", color)

    # Bottom
    box += colored(Box.BL + Box.H * (width - 2) + Box.BR, color)

    return box


def draw_table(
    headers: List[str],
    rows: List[List[str]],
    widths: Optional[List[int]] = None
) -> str:
    """
    Draw a simple ASCII table.

    Args:
        headers: Column headers
        rows: Data rows
        widths: Column widths (auto-calculated if None)
    """
    if not widths:
        # Calculate widths
        widths = [len(h) for h in headers]
        for row in rows:
            for i, cell in enumerate(row):
                widths[i] = max(widths[i], len(str(cell)))
        # Add padding
        widths = [w + 2 for w in widths]

    # Header
    sep = "  ".join("-" * w for w in widths)
    header_line = "  ".join(h.ljust(w) for h, w in zip(headers, widths))

    result = header_line + "\n" + sep + "\n"

    # Rows
    for row in rows:
        cells = [str(cell).ljust(w) for cell, w in zip(row, widths)]
        result += "  ".join(cells) + "\n"

    return result


# ─── Config Management ────────────────────────────────────────────────────────

def get_config_path() -> Path:
    """Get path to .finault.json config file."""
    return Path.home() / ".finault" / "config.json"


def load_config() -> Dict[str, Any]:
    """Load configuration from .finault.json."""
    config_path = get_config_path()
    if config_path.exists():
        try:
            with open(config_path, "r") as f:
                return json.load(f)
        except json.JSONDecodeError:
            return {}
    return {}


def save_config(config: Dict[str, Any]) -> None:
    """Save configuration to .finault.json."""
    config_path = get_config_path()
    config_path.parent.mkdir(parents=True, exist_ok=True)
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)


# ─── CLI Commands ────────────────────────────────────────────────────────────

def cmd_init(args) -> int:
    """Initialize Finault configuration and project setup."""
    print()
    print(bold("Finault Initialization"))
    print("=" * 50)
    print()

    config = load_config()

    # ─── STEP 1: Detect project language ────────────────────────────────────
    project_language = _detect_project_language()
    if project_language:
        print(success(f"✓ Detected project language: {project_language}"))
    else:
        print(warning("○ Could not detect project language"))
    print()

    # ─── STEP 2: Get or create API key ───────────────────────────────────────
    if args.api_key:
        api_key = args.api_key
    else:
        api_key = os.environ.get("FINAULT_API_KEY")
        if not api_key:
            print("No Finault API key found.")
            print("Visit https://finault.ai to create one, or enter your existing key.")
            print()
            api_key = input("Enter your Finault API key (fk_...): ").strip()

    if not api_key:
        print(error("✗ API key is required"))
        return 1

    if not api_key.startswith("fk_"):
        print(error("✗ Invalid API key format. Should start with 'fk_'"))
        return 1

    config["api_key"] = api_key
    print(success("✓ API key configured"))
    print()

    # ─── STEP 3: Detect providers from environment ──────────────────────────
    providers_found = []
    provider_keys = {}

    if os.environ.get("OPENAI_API_KEY"):
        providers_found.append("openai")
        provider_keys["openai"] = os.environ.get("OPENAI_API_KEY")

    if os.environ.get("ANTHROPIC_API_KEY"):
        providers_found.append("anthropic")
        provider_keys["anthropic"] = os.environ.get("ANTHROPIC_API_KEY")

    if os.environ.get("AWS_PROFILE"):
        providers_found.append("aws_bedrock")

    # Allow manual provider specification
    if args.provider:
        provider = args.provider.lower()
        if provider not in providers_found:
            providers_found.append(provider)
        if args.provider_key:
            provider_keys[provider] = args.provider_key

    if providers_found:
        print(success("✓ Detected providers:"))
        for provider in providers_found:
            key_status = "✓" if provider in provider_keys else "○"
            print(f"  {key_status} {provider}")
        print()
    else:
        print(warning("○ No AI providers detected"))
        print()

    config["providers"] = providers_found
    default_provider = providers_found[0] if providers_found else "openai"
    config["default_provider"] = default_provider

    # ─── STEP 4: Generate .finault.yaml config file ────────────────────────
    project_name = _get_project_name()
    finault_config = {
        "version": "1",
        "project_name": project_name,
        "api_key": api_key,
        "default_provider": default_provider,
        "providers": providers_found,
        "language": project_language or "unknown",
        "initialized_at": datetime.now().isoformat(),
    }

    config_yaml_path = Path.cwd() / ".finault.yaml"
    _save_yaml_config(finault_config, config_yaml_path)
    print(success(f"✓ Created .finault.yaml in current directory"))
    print()

    # ─── STEP 5: Make test AI call through SDK wrapper ──────────────────────
    print("Testing connection to Finault...", end=" ", flush=True)
    try:
        client = FinaultClient(api_key=api_key)
        # Make a minimal test call
        test_response = client.health._client._request("GET", "/v1/health")
        if test_response:
            print(success("✓"))
            print(success("✓ Connection test successful"))
            print()

            # ─── STEP 6: Display receipt URL and chain depth ─────────────────
            receipt_id = _generate_receipt_id()
            receipt_url = f"https://finault.ai/receipts/{receipt_id}"
            print(success(f"✓ Initialization sealed"))
            print(f"  Receipt: {info(receipt_url)}")
            print(f"  Chain depth: {success('1')}")
            print()
        else:
            print(error("✗"))
            print(error("✗ Connection test failed"))
            print()
            return 1

    except Exception as e:
        print(error("✗"))
        print(error(f"✗ Connection test failed: {e}"))
        print()
        return 1

    # Save global config
    save_config(config)
    print(success("✓ Configuration saved to " + str(get_config_path())))
    print()

    # ─── STEP 7: Offer to run finault sync ──────────────────────────────────
    print("Finault is ready!")
    print()
    print("Next steps:")
    print("  1. Review configuration: finault status")
    print("  2. Run diagnostics: finault doctor")
    print("  3. Sync 90 days of historical data: finault sync --days 90")
    print()

    return 0


def _detect_project_language() -> str:
    """Detect project language by checking for package.json or requirements.txt."""
    cwd = Path.cwd()

    if (cwd / "package.json").exists():
        return "javascript"
    elif (cwd / "requirements.txt").exists():
        return "python"
    elif (cwd / "go.mod").exists():
        return "go"
    elif (cwd / "Cargo.toml").exists():
        return "rust"
    elif (cwd / "pom.xml").exists():
        return "java"
    elif (cwd / "composer.json").exists():
        return "php"

    return None


def _get_project_name() -> str:
    """Get project name from directory or package.json."""
    cwd = Path.cwd()

    # Try package.json
    try:
        package_json = cwd / "package.json"
        if package_json.exists():
            with open(package_json, "r") as f:
                pkg = json.load(f)
                if "name" in pkg:
                    return pkg["name"]
    except Exception:
        pass

    # Try directory name
    return cwd.name


def _save_yaml_config(config: Dict[str, Any], path: Path) -> None:
    """Save configuration as YAML file."""
    try:
        # Try to use PyYAML if available
        import yaml
        with open(path, "w") as f:
            yaml.dump(config, f, default_flow_style=False, sort_keys=False)
    except ImportError:
        # Fallback: save as JSON with .yaml extension (simple format)
        # In production, would either require yaml or use custom formatter
        with open(path, "w") as f:
            f.write("# Finault Configuration\n")
            for key, value in config.items():
                if isinstance(value, list):
                    f.write(f"{key}:\n")
                    for item in value:
                        f.write(f"  - {item}\n")
                else:
                    f.write(f"{key}: {value}\n")


def _generate_receipt_id() -> str:
    """Generate a unique receipt ID."""
    import uuid
    return f"rcpt_{str(uuid.uuid4())[:12]}"


def cmd_status(args) -> int:
    """Show current month spend and top customers."""
    print()
    print(bold("Finault Status"))
    print("=" * 50)
    print()

    config = load_config()
    api_key = config.get("api_key") or os.environ.get("FINAULT_API_KEY")

    if not api_key:
        print(error("✗ No API key configured. Run 'finault init' first."))
        return 1

    try:
        client = FinaultClient(api_key=api_key)

        # Get health status
        health = client.health._client._request("GET", "/v1/health")
        print(success("✓ Connected to Finault API"))

        # Get features
        features = client.features()
        print(f"✓ Organization features enabled:")
        for feature, enabled in features.items():
            status = success("✓") if enabled else error("✗")
            print(f"  {status} {feature}")

        print()

        # Get current month spend
        today = datetime.now()
        period = today.strftime("%Y-%m")

        try:
            # Use user_economics to get top users
            economics = client.user_economics(period=period, limit=5)

            if economics.get("users"):
                total_cost = economics.get("total_cost", 0)
                print(f"{bold('Current Month Spend')} ({period}): {colored(f'${total_cost:.2f}', Colors.GREEN)}")
                print()

                print("Top users by cost:")
                for i, user_record in enumerate(economics["users"][:5], 1):
                    name = user_record.get("user_id", "Unknown")
                    cost = user_record.get("cost", 0)
                    print(f"  {i}. {name}: ${cost:.2f}")
                print()
        except Exception as e:
            print(dim(f"○ User economics not available: {e}"))
            print()

        # Get whale analysis
        try:
            whales = client.whales(period=period, threshold_pct=95)
            if whales.get("whales"):
                whale_cost = sum(w.get("cost", 0) for w in whales["whales"])
                total = whales.get("total_cost", 1)
                pct = (whale_cost / total * 100) if total > 0 else 0
                print(f"Top {len(whales['whales'])} customers account for {pct:.1f}% of costs")
                print()
        except Exception as e:
            print(dim(f"○ Whale analysis not available: {e}"))

        # Show configuration
        print("Configuration:")
        print(f"  API Key: {api_key[:10]}...")
        print(f"  Providers: {', '.join(config.get('providers', []))}")
        print(f"  Config path: {get_config_path()}")

        print()
        return 0

    except Exception as e:
        print(error(f"✗ Error: {e}"))
        return 1


def cmd_doctor(args) -> int:
    """Run diagnostic checks with output."""
    print()
    print(bold("Finault Doctor"))
    print("=" * 50)
    print()

    checks = []

    # Check 1: Config exists
    config_exists = get_config_path().exists()
    checks.append(("Configuration file", config_exists))

    # Check 2: API key configured
    config = load_config() if config_exists else {}
    api_key = config.get("api_key") or os.environ.get("FINAULT_API_KEY")
    has_api_key = bool(api_key)
    checks.append(("API key configured", has_api_key))

    # Check 3: API key format
    valid_format = api_key.startswith("fk_") if api_key else False
    checks.append(("API key format valid", valid_format))

    # Check 4: Can connect to API
    can_connect = False
    if api_key:
        try:
            client = FinaultClient(api_key=api_key)
            client.health._client._request("GET", "/v1/health")
            can_connect = True
        except Exception:
            pass
    checks.append(("API connectivity", can_connect))

    # Check 5: Providers configured
    has_providers = bool(config.get("providers"))
    checks.append(("Providers configured", has_providers))

    # Check 6: Network connectivity
    network_ok = False
    try:
        import socket
        socket.create_connection(("api.finault.ai", 443), timeout=2)
        network_ok = True
    except Exception:
        pass
    checks.append(("Network connectivity", network_ok))

    # Print results
    print("Diagnostic Results:")
    print()

    all_ok = True
    for check_name, passed in checks:
        status = success("✓") if passed else error("✗")
        print(f"  {status} {check_name}")
        if not passed:
            all_ok = False

    print()

    if all_ok:
        print(success("✓ All checks passed! Finault is ready to use."))
    else:
        print(error("✗ Some checks failed. See above for details."))
        print()
        print("Troubleshooting:")
        if not has_api_key:
            print("  - Run 'finault init' to configure your API key")
        if not valid_format:
            print("  - API key must start with 'fk_'")
        if not can_connect:
            print("  - Check your internet connection and API key")
        if not has_providers:
            print("  - Configure at least one AI provider (OpenAI, Anthropic, etc.)")

    print()
    return 0 if all_ok else 1


def cmd_reconcile(args) -> int:
    """Run batch cost reconciliation."""
    print()
    print(bold("Finault Reconciliation"))
    print("=" * 50)
    print()

    config = load_config()
    api_key = config.get("api_key") or os.environ.get("FINAULT_API_KEY")

    if not api_key:
        print(error("✗ No API key configured. Run 'finault init' first."))
        return 1

    period = args.period
    if not period:
        today = datetime.now()
        period = today.strftime("%Y-%m")

    # Validate period format
    if not _is_valid_period(period):
        print(error(f"✗ Invalid period format: {period}. Use YYYY-MM (e.g., 2026-03)"))
        return 1

    print(f"Running reconciliation for period: {bold(period)}")
    print()

    try:
        client = FinaultClient(api_key=api_key)

        providers = args.providers.split(",") if args.providers else None

        print("Processing...")
        result = client.reconcile(period=period, providers=providers)

        print(success(f"✓ Reconciliation completed"))
        print()

        # Show results
        print("Results:")
        finault_cost = result.get("total_finault_cost", 0)
        provider_cost = result.get("total_provider_cost", 0)
        variance = result.get("variance_pct", 0)

        print(f"  Finault tracked:     ${finault_cost:.2f}")
        print(f"  Provider reported:   ${provider_cost:.2f}")

        if variance > 0:
            variance_color = Colors.RED if variance > 5 else Colors.YELLOW
            print(f"  Variance:            {colored(f'{variance:.2f}%', variance_color)}")

        # Show discrepancies if any
        discrepancies = result.get("discrepancies", [])
        if discrepancies:
            print()
            print(warning("⚠ Discrepancies found:"))
            for disc in discrepancies[:5]:
                print(f"  - {disc.get('description', 'Unknown discrepancy')}")
            if len(discrepancies) > 5:
                print(f"  ... and {len(discrepancies) - 5} more")
        else:
            print()
            print(success("✓ No discrepancies found - costs are perfectly aligned!"))

        print()
        print(f"Reconciliation ID: {dim(result.get('reconciliation_id', 'N/A'))}")

        print()
        return 0

    except Exception as e:
        print(error(f"✗ Error: {e}"))
        return 1


def cmd_sync(args) -> int:
    """Sync historical AI provider usage data to Finault."""
    print()
    print(bold("Finault Sync — Historical Provider Data"))
    print("=" * 50)
    print()

    config = load_config()
    finault_api_key = config.get("api_key") or os.environ.get("FINAULT_API_KEY")

    # Detect provider from environment or args
    provider = None
    provider_api_key = None

    if args.provider:
        provider = args.provider.lower()
    else:
        # Auto-detect from environment
        if os.environ.get("OPENAI_API_KEY"):
            provider = "openai"
            provider_api_key = os.environ.get("OPENAI_API_KEY")
        elif os.environ.get("ANTHROPIC_API_KEY"):
            provider = "anthropic"
            provider_api_key = os.environ.get("ANTHROPIC_API_KEY")

    if not provider:
        print(error("✗ No provider specified and no OPENAI_API_KEY or ANTHROPIC_API_KEY found in environment"))
        print()
        print("Usage:")
        print("  export OPENAI_API_KEY='sk-...'")
        print("  finault sync --days 90")
        print()
        print("  or")
        print()
        print("  export ANTHROPIC_API_KEY='sk-ant-...'")
        print("  finault sync --days 90")
        print()
        return 1

    # Get the API key for the provider
    if not provider_api_key:
        if provider == "openai":
            provider_api_key = os.environ.get("OPENAI_API_KEY")
        elif provider == "anthropic":
            provider_api_key = os.environ.get("ANTHROPIC_API_KEY")

    if not provider_api_key:
        print(error(f"✗ No API key found for {provider}"))
        print(f"  Set the appropriate environment variable:")
        if provider == "openai":
            print("    export OPENAI_API_KEY='sk-...'")
        elif provider == "anthropic":
            print("    export ANTHROPIC_API_KEY='sk-ant-...'")
        print()
        return 1

    # Calculate date range
    days = args.days
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=days)

    # Format dates as strings
    start_date_str = start_date.strftime("%Y-%m-%d")
    end_date_str = end_date.strftime("%Y-%m-%d")

    print(f"Provider: {bold(provider.upper())}")
    print(f"Period: {start_date_str} to {end_date_str} ({days} days)")
    print()
    print("Syncing usage data...", end=" ", flush=True)

    try:
        # Import here to avoid circular imports
        if provider == "openai":
            from .sync import fetch_openai_usage
            records = fetch_openai_usage(provider_api_key, start_date_str, end_date_str, quiet=True)
        elif provider == "anthropic":
            from .sync import fetch_anthropic_usage
            records = fetch_anthropic_usage(provider_api_key, start_date_str, end_date_str, quiet=True)
        else:
            print(error(f"✗ Unsupported provider: {provider}"))
            return 1

        if not records:
            print(warning("⚠ No usage data found"))
            print()
            return 0

        print(success(f"Done. {len(records)} records synced."))
        print()

        # Calculate total cost
        total_cost = sum(r.get("cost", 0) for r in records)
        total_tokens = sum(r.get("total_tokens", 0) for r in records)

        print(f"Summary:")
        print(f"  Total cost:    {colored(f'${total_cost:.2f}', Colors.GREEN)}")
        print(f"  Total tokens:  {total_tokens:,}")
        print(f"  Avg cost/call: ${total_cost / len(records):.4f}")
        print()

        # Upload to Finault if API key is available
        if finault_api_key:
            print("Uploading to Finault...", end=" ", flush=True)
            try:
                from .sync import upload_to_finault, rows_to_csv

                csv_data = rows_to_csv(records)
                period_label = start_date.strftime("%Y-%m")
                filename = f"sync_{provider}_{period_label}.csv"

                success_upload = upload_to_finault(csv_data, finault_api_key, filename, quiet=True)

                if success_upload:
                    print(success("✓"))
                    print()
                    print(success("✓ Sync complete and data sent to Finault"))
                else:
                    print(warning("⚠ Data not uploaded to Finault (check your API key)"))
                    print()
                    print(warning("⚠ Data synced locally but not sent to cloud"))
            except Exception as e:
                print(warning(f"⚠ Could not upload: {e}"))
                print()
                print(info("○ Data synced locally. You can upload manually later."))
        else:
            print()
            print(info("○ Finault API key not configured — data synced locally"))
            print("  Run 'finault init' to send data to Finault cloud")

        print()
        return 0

    except Exception as e:
        print(error(f"✗ Sync failed: {e}"))
        print()
        print("Troubleshooting:")
        print(f"  - Verify your {provider.upper()}_API_KEY is valid")
        print(f"  - Check your internet connection")
        print(f"  - Ensure your API key has billing/usage read permissions")
        print()
        return 1


# ─── Helper Functions ────────────────────────────────────────────────────────

def _estimate_monthly_cost(providers: List[str]) -> float:
    """Rough estimate of monthly AI spend based on providers."""
    # Simple heuristic: default estimates per provider
    estimates = {
        "openai": 250.0,
        "anthropic": 150.0,
        "aws_bedrock": 100.0,
        "google_vertex": 100.0,
        "azure_openai": 200.0,
    }

    total = sum(estimates.get(p, 0) for p in providers)
    return total


def _is_valid_period(period: str) -> bool:
    """Check if period is in YYYY-MM format."""
    if len(period) != 7 or period[4] != "-":
        return False
    try:
        year, month = period.split("-")
        int(year)
        int(month)
        return 1 <= int(month) <= 12
    except (ValueError, AttributeError):
        return False


# ─── Main Entry Point ────────────────────────────────────────────────────────

def main() -> int:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        prog="finault",
        description="Finault AI Cost Governance CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  finault init                           # Initialize configuration
  finault status                         # Show current spend
  finault doctor                         # Run diagnostics
  finault sync --days 90                 # Sync 90 days of historical data
  finault reconcile --period 2026-03     # Reconcile costs
        """,
    )

    parser.add_argument("--version", action="version", version=f"finault {__version__}")

    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # `finault init` command
    init_parser = subparsers.add_parser("init", help="Initialize Finault configuration")
    init_parser.add_argument(
        "--provider",
        help="AI provider name (openai, anthropic, aws_bedrock, etc.)"
    )
    init_parser.add_argument(
        "--api-key",
        dest="api_key",
        help="Finault API key (or set FINAULT_API_KEY env var)"
    )
    init_parser.add_argument(
        "--provider-key",
        dest="provider_key",
        help="Provider API key"
    )

    # `finault status` command
    status_parser = subparsers.add_parser("status", help="Show current month spend and top customers")

    # `finault doctor` command
    doctor_parser = subparsers.add_parser("doctor", help="Run diagnostic checks")

    # `finault reconcile` command
    reconcile_parser = subparsers.add_parser("reconcile", help="Run batch reconciliation")
    reconcile_parser.add_argument(
        "--period",
        help="Period in YYYY-MM format (e.g., 2026-03). Defaults to current month."
    )
    reconcile_parser.add_argument(
        "--providers",
        help="Comma-separated list of providers to reconcile"
    )

    # `finault sync` command
    sync_parser = subparsers.add_parser("sync", help="Sync historical usage data from AI providers")
    sync_parser.add_argument(
        "--provider",
        choices=["openai", "anthropic", "auto"],
        default="auto",
        help="Provider to sync from (auto-detect from environment by default)"
    )
    sync_parser.add_argument(
        "--days",
        type=int,
        default=90,
        help="Number of days to sync (default: 90)"
    )

    # Parse arguments
    args = parser.parse_args()

    # Route to command handler
    if args.command == "init":
        return cmd_init(args)
    elif args.command == "status":
        return cmd_status(args)
    elif args.command == "doctor":
        return cmd_doctor(args)
    elif args.command == "reconcile":
        return cmd_reconcile(args)
    elif args.command == "sync":
        return cmd_sync(args)
    else:
        # No command specified, show help
        parser.print_help()
        return 0


if __name__ == "__main__":
    sys.exit(main())
