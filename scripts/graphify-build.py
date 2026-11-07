#!/usr/bin/env python3
"""Build or update the GOOBER Graphify knowledge graph and architectural report."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

EXCLUDES = [
    ".env",
    ".env.*",
    ".git",
    ".local",
    ".agents",
    ".cursor",
    ".vscode",
    "node_modules",
    ".next",
    ".next-test",
    "dist",
    "coverage",
    "output",
    "test-results",
    "playwright-report",
    "packages/db/generated",
    "graphify-out",
]


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    python_exe = repo_root / ".local" / "skill-tools" / "graphify" / "Scripts" / "python.exe"
    graphify_exe = repo_root / ".local" / "skill-tools" / "graphify" / "Scripts" / "graphify.exe"

    if not graphify_exe.exists():
        print(f"ERROR: Graphify executable not found at {graphify_exe}", file=sys.stderr)
        return 1

    env = dict(os.environ)
    env["GRAPHIFY_NO_AUTO_REFRESH"] = "1"
    env["GRAPHIFY_BACKEND"] = "none"

    extract_cmd = [
        str(graphify_exe),
        "extract",
        str(repo_root),
        "--code-only",
        "--no-dedup",
        "--max-workers",
        "1",
    ]
    for pattern in EXCLUDES:
        extract_cmd.extend(["--exclude", pattern])

    print("[graphify-build] Running AST extraction across GOOBER codebase...")
    res = subprocess.run(extract_cmd, cwd=str(repo_root), env=env, text=True)
    if res.returncode != 0:
        print(f"ERROR: graphify extract exited with {res.returncode}", file=sys.stderr)
        return res.returncode

    cluster_cmd = [
        str(graphify_exe),
        "cluster-only",
        str(repo_root),
        "--no-label",
        "--no-viz",
    ]
    print("[graphify-build] Running cluster-only to generate GRAPH_REPORT.md...")
    res2 = subprocess.run(cluster_cmd, cwd=str(repo_root), env=env, text=True)
    if res2.returncode != 0:
        print(f"ERROR: graphify cluster-only exited with {res2.returncode}", file=sys.stderr)
        return res2.returncode

    graph_json = repo_root / "graphify-out" / "graph.json"
    report_md = repo_root / "graphify-out" / "GRAPH_REPORT.md"
    if not graph_json.exists() or not report_md.exists():
        print("ERROR: Expected graph.json or GRAPH_REPORT.md missing", file=sys.stderr)
        return 1

    data = json.loads(graph_json.read_text(encoding="utf-8"))
    nodes = data.get("nodes", [])
    links = data.get("links", data.get("edges", []))
    source_files = sorted({n.get("source_file", "") for n in nodes if n.get("source_file")})

    # Verify zero sensitive files (.env, .local) entered the graph
    forbidden = [sf for sf in source_files if sf.startswith(".env") or sf.startswith(".local/")]
    if forbidden:
        print(f"ERROR: Forbidden files indexed in graph: {forbidden}", file=sys.stderr)
        return 1

    summary = {
        "status": "OK",
        "graphJson": str(graph_json),
        "reportMd": str(report_md),
        "nodeCount": len(nodes),
        "edgeCount": len(links),
        "indexedFileCount": len(source_files),
        "forbiddenFilesIndexed": len(forbidden),
        "sampleSourceFiles": source_files[:25],
    }
    (repo_root / ".local" / "graphify-build-summary.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
