"""Allow running as `python3 -m finault` in addition to the `finault` CLI command."""
from finault.sync import main

if __name__ == "__main__":
    main()
