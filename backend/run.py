"""Convenience entry point: ``python run.py`` (equivalent to the uvicorn command).

    python run.py                 # start on 127.0.0.1:8000
    python run.py --reload        # auto-reload during development
    python run.py --port 9000     # different port
    python run.py --host 0.0.0.0  # expose on the LAN (proxy through Apache)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Make ``app`` importable when run as ``python run.py`` from the backend folder.
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the SIH26108 FastAPI backend.")
    parser.add_argument("--host", default="127.0.0.1", help="Bind address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port (default: 8000)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload")
    parser.add_argument(
        "--log-level", default="info", choices=["critical", "error", "warning", "info", "debug"]
    )
    parser.add_argument(
        "--workers", type=int, default=1, help="Worker processes (ignored with --reload)"
    )
    return parser.parse_args()


def main() -> int:
    import uvicorn

    args = parse_args()
    print("=" * 78)
    print(" SIH26108 - AI-Powered Indian Standards Recommendation Engine")
    print(f" API      : http://{args.host}:{args.port}")
    print(f" Swagger  : http://{args.host}:{args.port}/docs")
    print(" Note     : SIH prototype / research decision-support system - not a BIS system.")
    print("=" * 78)

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level=args.log_level,
        workers=None if args.reload else max(1, args.workers),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
