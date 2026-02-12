#!/usr/bin/env python3
"""
Schema Audit Tool - Gap #3 Solution
====================================
Scans entire codebase to find unused database tables.
Generates comprehensive report of used vs unused tables.
"""

import re
import os
import json
from pathlib import Path
from collections import defaultdict

# Colors for terminal output
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    END = '\033[0m'

def extract_tables_from_schema(schema_file):
    """Extract all table names from SQL schema file."""
    tables = set()

    with open(schema_file, 'r') as f:
        content = f.read()

    # Match CREATE TABLE statements
    # Handles: CREATE TABLE IF NOT EXISTS table_name
    pattern = r'CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([a-zA-Z_][a-zA-Z0-9_]*)'
    matches = re.findall(pattern, content, re.IGNORECASE)

    for match in matches:
        tables.add(match.lower())

    return sorted(tables)

def search_codebase_for_table(table_name, repo_root):
    """Search entire codebase for references to a table."""
    references = []

    # Patterns to search for
    patterns = [
        rf"\.from\(['\"]({table_name})['\"]",  # Supabase: .from('table')
        rf"\.from\(\s*['\"]({table_name})['\"]",  # With whitespace
        rf"INSERT\s+INTO\s+({table_name})",  # SQL: INSERT INTO table
        rf"UPDATE\s+({table_name})",  # SQL: UPDATE table
        rf"DELETE\s+FROM\s+({table_name})",  # SQL: DELETE FROM table
        rf"SELECT\s+.*\s+FROM\s+({table_name})",  # SQL: SELECT ... FROM table
        rf"JOIN\s+({table_name})",  # SQL: JOIN table
        rf"INTO\s+({table_name})",  # SQL: INTO table
        rf"FROM\s+({table_name})",  # SQL: FROM table (standalone)
        rf"TABLE\s+({table_name})",  # CREATE/DROP TABLE
    ]

    # Directories to search
    search_dirs = ['apps', 'platform', 'database']

    # File extensions to search
    extensions = ['.js', '.ts', '.sql', '.py']

    for search_dir in search_dirs:
        dir_path = repo_root / search_dir
        if not dir_path.exists():
            continue

        for file_path in dir_path.rglob('*'):
            if not file_path.is_file():
                continue

            if file_path.suffix not in extensions:
                continue

            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                for pattern in patterns:
                    matches = re.finditer(pattern, content, re.IGNORECASE)
                    for match in matches:
                        line_num = content[:match.start()].count('\n') + 1
                        references.append({
                            'file': str(file_path.relative_to(repo_root)),
                            'line': line_num,
                            'pattern': pattern,
                            'match': match.group(0)
                        })
            except Exception as e:
                # Skip files we can't read
                pass

    return references

def generate_report(schema_file, repo_root):
    """Generate comprehensive audit report."""
    print(f"{Colors.BOLD}{Colors.BLUE}╔══════════════════════════════════════════════════════════════╗{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}║  FINAULT SCHEMA AUDIT - Gap #3 Solution                      ║{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}╚══════════════════════════════════════════════════════════════╝{Colors.END}\n")

    # Extract tables from schema
    print(f"{Colors.YELLOW}📊 Extracting tables from schema...{Colors.END}")
    tables = extract_tables_from_schema(schema_file)
    print(f"{Colors.GREEN}✓ Found {len(tables)} tables in schema{Colors.END}\n")

    # Analyze each table
    print(f"{Colors.YELLOW}🔍 Scanning codebase for table references...{Colors.END}\n")

    used_tables = []
    unused_tables = []
    table_usage = {}

    for i, table in enumerate(tables, 1):
        print(f"   [{i}/{len(tables)}] Checking {table}...", end='\r')
        references = search_codebase_for_table(table, repo_root)

        table_usage[table] = {
            'count': len(references),
            'references': references
        }

        if len(references) > 0:
            used_tables.append(table)
        else:
            unused_tables.append(table)

    print(f"{Colors.GREEN}✓ Scan complete!{' ' * 50}{Colors.END}\n")

    # Print summary
    print(f"{Colors.BOLD}═══════════════════════════════════════════════════════════════{Colors.END}")
    print(f"{Colors.BOLD}SUMMARY{Colors.END}")
    print(f"{Colors.BOLD}═══════════════════════════════════════════════════════════════{Colors.END}\n")

    print(f"Total tables in schema: {Colors.BOLD}{len(tables)}{Colors.END}")
    print(f"Used tables:            {Colors.GREEN}{Colors.BOLD}{len(used_tables)}{Colors.END} ({len(used_tables)/len(tables)*100:.1f}%)")
    print(f"Unused tables:          {Colors.RED}{Colors.BOLD}{len(unused_tables)}{Colors.END} ({len(unused_tables)/len(tables)*100:.1f}%)")
    print()

    # Print unused tables
    if unused_tables:
        print(f"{Colors.BOLD}═══════════════════════════════════════════════════════════════{Colors.END}")
        print(f"{Colors.BOLD}{Colors.RED}UNUSED TABLES (Dead Code){Colors.END}")
        print(f"{Colors.BOLD}═══════════════════════════════════════════════════════════════{Colors.END}\n")

        for table in unused_tables:
            print(f"{Colors.RED}✗ {table}{Colors.END}")
        print()

    # Print top used tables
    print(f"{Colors.BOLD}═══════════════════════════════════════════════════════════════{Colors.END}")
    print(f"{Colors.BOLD}{Colors.GREEN}TOP 10 MOST USED TABLES{Colors.END}")
    print(f"{Colors.BOLD}═══════════════════════════════════════════════════════════════{Colors.END}\n")

    sorted_tables = sorted(table_usage.items(), key=lambda x: x[1]['count'], reverse=True)[:10]
    for table, usage in sorted_tables:
        if usage['count'] > 0:
            print(f"{Colors.GREEN}✓ {table:<30} {usage['count']:>4} references{Colors.END}")
    print()

    # Save detailed JSON report
    report_file = repo_root / 'schema-audit-report.json'
    with open(report_file, 'w') as f:
        json.dump({
            'total_tables': len(tables),
            'used_tables': len(used_tables),
            'unused_tables': len(unused_tables),
            'unused_table_list': unused_tables,
            'used_table_list': used_tables,
            'detailed_usage': table_usage
        }, f, indent=2)

    print(f"{Colors.BLUE}📄 Detailed report saved to: {report_file.name}{Colors.END}\n")

    return {
        'total': len(tables),
        'used': len(used_tables),
        'unused': len(unused_tables),
        'unused_list': unused_tables,
        'usage': table_usage
    }

if __name__ == '__main__':
    # Find repo root
    repo_root = Path(__file__).parent.parent
    schema_file = repo_root / 'database' / 'safe-full-migration.sql'

    if not schema_file.exists():
        print(f"{Colors.RED}Error: {schema_file} not found!{Colors.END}")
        exit(1)

    # Run audit
    result = generate_report(schema_file, repo_root)

    # Exit with error code if unused tables found
    if result['unused'] > 0:
        print(f"{Colors.YELLOW}⚠️  WARNING: {result['unused']} unused tables found!{Colors.END}")
        print(f"{Colors.YELLOW}   Run the cleanup migration to remove them.{Colors.END}\n")
        exit(1)
    else:
        print(f"{Colors.GREEN}✅ All tables are being used!{Colors.END}\n")
        exit(0)
