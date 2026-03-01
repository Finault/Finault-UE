#!/usr/bin/env python3
"""
Smart migration runner - executes SQL statement by statement with error reporting.

Usage:
  python3 scripts/apply-migration.py                    # Run migration
  python3 scripts/apply-migration.py --dry-run          # Parse only, don't execute
  python3 scripts/apply-migration.py --no-reset         # Don't wipe DB first
  DATABASE_URL="postgresql://..." python3 scripts/apply-migration.py  # Use custom connection

Requires: pip install psycopg2-binary
"""

import sys
import os
import re
import socket
import time

try:
    import psycopg2
except ImportError:
    print("❌ psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

# ═══════════════════════════════════════════════════════════════════════════════
# RESOLVE HOSTNAMES TO IPv4 (Supabase direct host returns IPv6 which many
# home networks can't reach)
# ═══════════════════════════════════════════════════════════════════════════════

def resolve_ipv4(hostname):
    """Resolve hostname to IPv4 address, return IP string or None."""
    try:
        results = socket.getaddrinfo(hostname, None, socket.AF_INET)
        if results:
            return results[0][4][0]
    except Exception:
        pass
    return None

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

SUPABASE_PROJECT_REF = "bejoptgsrhmklmllkobu"
SUPABASE_DB_PASSWORD = "9TV6re5L0ecX9lXy"

# Resolve direct host to IPv4 upfront
_direct_host = f"db.{SUPABASE_PROJECT_REF}.supabase.co"
_direct_ipv4 = resolve_ipv4(_direct_host)

CONNECTIONS = [
    {
        "name": f"Direct IPv4 ({_direct_ipv4 or 'unresolved'})",
        "host": _direct_ipv4 or _direct_host,
        "port": 5432,
        "dbname": "postgres",
        "user": "postgres",
        "password": SUPABASE_DB_PASSWORD,
        "connect_timeout": 30,
        "sslmode": "require",
    },
    {
        "name": "Session Pooler (port 5432)",
        "host": "aws-1-us-east-2.pooler.supabase.com",
        "port": 5432,
        "dbname": "postgres",
        "user": f"postgres.{SUPABASE_PROJECT_REF}",
        "password": SUPABASE_DB_PASSWORD,
        "connect_timeout": 30,
        "sslmode": "require",
    },
    {
        "name": "Transaction Pooler (port 6543)",
        "host": "aws-1-us-east-2.pooler.supabase.com",
        "port": 6543,
        "dbname": "postgres",
        "user": f"postgres.{SUPABASE_PROJECT_REF}",
        "password": SUPABASE_DB_PASSWORD,
        "connect_timeout": 30,
        "sslmode": "require",
    },
]

MIGRATION_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                              "database", "combined-migration-clean.sql")


def split_into_statements(content):
    """Split SQL content into statements, tracking source line numbers."""
    statements = []  # list of (start_line, statement_text)
    current_lines = []
    start_line = 1
    in_dollar = False
    dollar_tag = None

    for line_num, line in enumerate(content.split('\n'), 1):
        stripped = line.strip()

        # Skip pure comments and empty lines at statement start
        if not current_lines and (not stripped or stripped.startswith('--')):
            continue

        if not current_lines:
            start_line = line_num

        # Track $$ blocks (handle paired $$ on same line)
        dollar_matches = re.findall(r'\$(\w*)\$', line)
        for tag in dollar_matches:
            full_tag = f'${tag}$'
            if not in_dollar:
                in_dollar = True
                dollar_tag = full_tag
            elif full_tag == dollar_tag:
                in_dollar = False
                dollar_tag = None

        current_lines.append(line)

        # Statement ends with ; when not inside $$ block
        if not in_dollar and stripped.endswith(';'):
            stmt = '\n'.join(current_lines).strip()
            # Skip comment-only blocks
            if stmt and not all(l.strip().startswith('--') or not l.strip() for l in current_lines):
                statements.append((start_line, stmt))
            current_lines = []

    # Leftover (shouldn't happen with well-formed SQL)
    if current_lines:
        stmt = '\n'.join(current_lines).strip()
        if stmt and not all(l.strip().startswith('--') or not l.strip() for l in current_lines):
            statements.append((start_line, stmt))

    return statements


def try_connect():
    """Try each connection option. Returns (connection, config_name) or (None, None)."""

    # Check for DATABASE_URL environment variable first
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        print("   Trying DATABASE_URL from environment...")
        try:
            conn = psycopg2.connect(db_url, connect_timeout=30)
            print("   ✅ Connected via DATABASE_URL")
            return conn, "DATABASE_URL"
        except Exception as e:
            print(f"   ❌ DATABASE_URL failed: {str(e).strip()[:120]}")

    for config in CONNECTIONS:
        name = config.pop("name")
        host = config.get("host", "?")
        port = config.get("port", "?")
        print(f"   Trying {name} ({host}:{port})...")

        # Quick DNS + port check first
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(10)
            result = sock.connect_ex((host, int(port)))
            sock.close()
            if result != 0:
                config["name"] = name
                print(f"   ❌ {name}: port {port} not reachable (network/firewall issue)")
                continue
        except Exception as e:
            config["name"] = name
            print(f"   ❌ {name}: DNS/network error: {str(e)[:80]}")
            continue

        try:
            conn = psycopg2.connect(**config)
            config["name"] = name
            print(f"   ✅ Connected via {name}")
            return conn, name
        except Exception as e:
            config["name"] = name
            err = str(e).strip()
            if "password" in err.lower():
                print(f"   ❌ {name}: Authentication failed (wrong password?)")
            elif "timeout" in err.lower():
                print(f"   ❌ {name}: Connection timeout")
            else:
                print(f"   ❌ {name}: {err[:120]}")

    return None, None


def reset_database(cur):
    """Drop all public schema objects for a clean start."""
    print("\n🗑️  RESETTING DATABASE (dropping all public schema objects)...")

    reset_sql = """
    DO $$ DECLARE r RECORD;
    BEGIN
        -- Drop all policies first
        FOR r IN (SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public') LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
        END LOOP;

        -- Drop views
        FOR r IN (SELECT viewname FROM pg_views WHERE schemaname = 'public') LOOP
            EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', r.viewname);
        END LOOP;

        -- Drop materialized views
        FOR r IN (SELECT matviewname FROM pg_matviews WHERE schemaname = 'public') LOOP
            EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS public.%I CASCADE', r.matviewname);
        END LOOP;

        -- Drop tables
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
            EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
        END LOOP;

        -- Drop functions
        FOR r IN (SELECT p.oid::regprocedure::text as func_sig
                  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
                  WHERE n.nspname = 'public') LOOP
            BEGIN
                EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.func_sig);
            EXCEPTION WHEN OTHERS THEN
                NULL;  -- Ignore errors from already-dropped functions
            END;
        END LOOP;

        -- Drop custom types/enums
        FOR r IN (SELECT typname FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid
                  WHERE n.nspname = 'public' AND t.typtype = 'e') LOOP
            EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
        END LOOP;
    END $$;
    """

    try:
        cur.execute(reset_sql)
        print("   ✅ Database reset complete\n")
    except Exception as e:
        print(f"   ⚠️ Reset had issues: {str(e)[:200]}")
        print("   Continuing anyway...\n")


def get_stmt_description(stmt):
    """Extract a human-readable description from a SQL statement."""
    first_line = stmt.strip().split('\n')[0][:100]

    # Extract key info
    if m := re.match(r'CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|FUNCTION|TRIGGER|INDEX|POLICY|TYPE|EXTENSION)\s+(?:IF\s+NOT\s+EXISTS\s+)?(\S+)', first_line, re.IGNORECASE):
        obj_type = re.match(r'CREATE\s+(?:OR\s+REPLACE\s+)?(\w+)', first_line, re.IGNORECASE).group(1).upper()
        return f"CREATE {obj_type} {m.group(1)}"
    if m := re.match(r'ALTER\s+TABLE\s+(\w+)', first_line, re.IGNORECASE):
        return f"ALTER TABLE {m.group(1)}"
    if m := re.match(r'DROP\s+(\w+)\s+(?:IF\s+EXISTS\s+)?(\S+)', first_line, re.IGNORECASE):
        return f"DROP {m.group(1)} {m.group(2)}"
    if m := re.match(r'(INSERT|GRANT|COMMENT|DO)', first_line, re.IGNORECASE):
        return f"{m.group(1).upper()} ..."
    return first_line[:80]


def main():
    dry_run = "--dry-run" in sys.argv
    reset_first = "--no-reset" not in sys.argv

    print(f"{'='*70}")
    print(f"📦 Finault Migration Runner")
    print(f"{'='*70}")
    print(f"   Migration: {MIGRATION_FILE}")
    print(f"   Mode:      {'DRY RUN (parse only)' if dry_run else 'LIVE'}")
    print(f"   Reset DB:  {'Yes' if reset_first else 'No'}")

    if not os.path.exists(MIGRATION_FILE):
        print(f"\n⛔ Migration file not found: {MIGRATION_FILE}")
        print(f"   Run: python3 scripts/make-clean-migration.py")
        sys.exit(1)

    # Read and parse
    with open(MIGRATION_FILE) as f:
        content = f.read()

    statements = split_into_statements(content)
    print(f"   Parsed:    {len(statements)} statements from {len(content.splitlines())} lines\n")

    if dry_run:
        print("✅ Dry run complete. Statement breakdown:")
        type_counts = {}
        for _, stmt in statements:
            desc = get_stmt_description(stmt)
            stype = desc.split()[0] if desc else "OTHER"
            type_counts[stype] = type_counts.get(stype, 0) + 1
        for stype, count in sorted(type_counts.items(), key=lambda x: -x[1]):
            print(f"   {stype:20s} {count}")
        return

    # Connect
    print(f"🔌 Connecting to Supabase database...")
    conn, conn_name = try_connect()
    if not conn:
        print(f"\n{'='*70}")
        print(f"⛔ COULD NOT CONNECT TO DATABASE")
        print(f"{'='*70}")
        print(f"\nTroubleshooting:")
        print(f"  1. Check Supabase Dashboard → Settings → Database")
        print(f"  2. Verify the password in this script matches your DB password")
        print(f"  3. Try setting DATABASE_URL env variable:")
        print(f"     export DATABASE_URL='postgresql://postgres.{SUPABASE_PROJECT_REF}:{SUPABASE_DB_PASSWORD}@aws-1-us-east-2.pooler.supabase.com:5432/postgres'")
        print(f"  4. Check if your IP is allowed (Supabase → Settings → Database → Network)")
        print(f"  5. Try from a different network (VPN, mobile hotspot)")
        sys.exit(1)

    conn.autocommit = True
    cur = conn.cursor()

    # Reset
    if reset_first:
        reset_database(cur)

    # Execute
    print(f"🚀 Executing {len(statements)} statements...\n")

    succeeded = 0
    failed = 0
    errors = []
    start_time = time.time()

    for i, (line_num, stmt) in enumerate(statements):
        desc = get_stmt_description(stmt)

        try:
            cur.execute(stmt)
            succeeded += 1

            # Progress every 50 statements
            if succeeded % 50 == 0:
                elapsed = time.time() - start_time
                print(f"   ✅ {succeeded}/{len(statements)} completed ({elapsed:.0f}s)...")

        except Exception as e:
            failed += 1
            error_msg = str(e).strip()

            error_info = {
                "num": i + 1,
                "line": line_num,
                "desc": desc,
                "error": error_msg,
                "stmt": stmt[:800],
            }
            errors.append(error_info)

            print(f"\n{'─'*70}")
            print(f"❌ ERROR #{failed} at statement #{i+1} (line {line_num}):")
            print(f"   {desc}")
            print(f"   Error: {error_msg[:200]}")
            print(f"{'─'*70}")

            # Stop after 5 errors
            if failed >= 5:
                print(f"\n⛔ Too many errors ({failed}). Stopping.")
                break

            # Reset connection state after error
            try:
                conn.rollback()
            except:
                pass

    elapsed = time.time() - start_time

    # Results
    print(f"\n{'='*70}")
    print(f"📊 MIGRATION RESULTS ({elapsed:.1f}s)")
    print(f"{'='*70}")
    print(f"   ✅ Succeeded: {succeeded}")
    print(f"   ❌ Failed:    {failed}")
    print(f"   Total:       {len(statements)}")

    # Count tables
    try:
        cur.execute("SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public'")
        table_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM pg_views WHERE schemaname = 'public'")
        view_count = cur.fetchone()[0]
        print(f"   📋 Tables: {table_count}, Views: {view_count}")
    except:
        pass

    if errors:
        print(f"\n{'='*70}")
        print(f"❌ ERROR DETAILS ({len(errors)} errors)")
        print(f"{'='*70}")
        for err in errors:
            print(f"\n--- Statement #{err['num']} (line {err['line']}) ---")
            print(f"Description: {err['desc']}")
            print(f"Error: {err['error'][:300]}")
            print(f"Statement preview:")
            for line in err['stmt'][:400].split('\n'):
                print(f"  | {line}")
            if len(err['stmt']) > 400:
                print(f"  | ... (truncated)")

    cur.close()
    conn.close()

    print(f"\n{'='*70}")

    if failed == 0:
        print(f"🎉 MIGRATION COMPLETE — ALL {succeeded} STATEMENTS SUCCEEDED")
    else:
        print(f"⚠️  MIGRATION INCOMPLETE — {failed} ERRORS NEED FIXING")
        sys.exit(1)


if __name__ == '__main__':
    main()
