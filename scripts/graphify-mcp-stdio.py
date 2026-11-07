#!/usr/bin/env python3
"""Zero-dependency MCP stdio server wrapper for the local Graphify installation."""
from __future__ import annotations

import asyncio
import json
import os
import sys
import types as pytypes
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable


def _install_mcp_shim() -> None:
    if "mcp" in sys.modules:
        return
    mcp_mod = pytypes.ModuleType("mcp")
    mcp_mod.__path__ = []  # type: ignore[attr-defined]
    mcp_server_mod = pytypes.ModuleType("mcp.server")
    mcp_types_mod = pytypes.ModuleType("mcp.types")

    @dataclass
    class Tool:
        name: str
        description: str
        inputSchema: dict[str, Any] = field(default_factory=dict)

    @dataclass
    class Resource:
        uri: str
        name: str
        description: str = ""
        mimeType: str = "text/plain"

    @dataclass
    class TextContent:
        type: str
        text: str

    class Server:
        def __init__(self, name: str) -> None:
            self.name = name
            self._list_tools_fn: Callable[[], Any] | None = None
            self._call_tool_fn: Callable[[str, dict[str, Any]], Any] | None = None
            self._list_resources_fn: Callable[[], Any] | None = None
            self._read_resource_fn: Callable[[Any], Any] | None = None

        def list_tools(self) -> Any:
            def _d(fn: Any) -> Any:
                self._list_tools_fn = fn
                return fn
            return _d

        def call_tool(self) -> Any:
            def _d(fn: Any) -> Any:
                self._call_tool_fn = fn
                return fn
            return _d

        def list_resources(self) -> Any:
            def _d(fn: Any) -> Any:
                self._list_resources_fn = fn
                return fn
            return _d

        def read_resource(self) -> Any:
            def _d(fn: Any) -> Any:
                self._read_resource_fn = fn
                return fn
            return _d

    mcp_types_mod.Tool = Tool  # type: ignore[attr-defined]
    mcp_types_mod.Resource = Resource  # type: ignore[attr-defined]
    mcp_types_mod.TextContent = TextContent  # type: ignore[attr-defined]
    mcp_types_mod.AnyUrl = str  # type: ignore[attr-defined]
    mcp_server_mod.Server = Server  # type: ignore[attr-defined]
    mcp_mod.types = mcp_types_mod  # type: ignore[attr-defined]
    mcp_mod.server = mcp_server_mod  # type: ignore[attr-defined]
    sys.modules["mcp"] = mcp_mod
    sys.modules["mcp.server"] = mcp_server_mod
    sys.modules["mcp.types"] = mcp_types_mod


async def _handle(server: Any, msg: dict[str, Any]) -> dict[str, Any] | None:
    method = msg.get("method")
    req_id = msg.get("id")
    params = msg.get("params") or {}
    if req_id is None:
        return None
    try:
        if method == "initialize":
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "protocolVersion": params.get("protocolVersion", "2024-11-05"),
                    "capabilities": {"tools": {"listChanged": False}, "resources": {"subscribe": False, "listChanged": False}},
                    "serverInfo": {"name": "graphify-goober", "version": "0.9.96"},
                },
            }
        if method == "ping":
            return {"jsonrpc": "2.0", "id": req_id, "result": {}}
        if method == "tools/list":
            tools = await server._list_tools_fn()
            return {"jsonrpc": "2.0", "id": req_id, "result": {"tools": [{"name": t.name, "description": t.description, "inputSchema": t.inputSchema} for t in tools]}}
        if method == "tools/call":
            try:
                out = await server._call_tool_fn(params.get("name", ""), params.get("arguments") or {})
                return {"jsonrpc": "2.0", "id": req_id, "result": {"content": [{"type": c.type, "text": c.text} for c in out], "isError": False}}
            except Exception as err:
                return {"jsonrpc": "2.0", "id": req_id, "result": {"content": [{"type": "text", "text": str(err)}], "isError": True}}
        if method == "resources/list":
            res = await server._list_resources_fn()
            return {"jsonrpc": "2.0", "id": req_id, "result": {"resources": [{"uri": r.uri, "name": r.name, "description": r.description, "mimeType": r.mimeType} for r in res]}}
        if method == "resources/read":
            uri = params.get("uri", "")
            txt = await server._read_resource_fn(uri)
            return {"jsonrpc": "2.0", "id": req_id, "result": {"contents": [{"uri": uri, "mimeType": "text/markdown" if uri.endswith("report") else "text/plain", "text": txt}]}}
        return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Method not found: {method}"}}
    except Exception as exc:
        return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32603, "message": str(exc)}}


async def _self_test(server: Any) -> int:
    calls = [
        ("initialize", {"protocolVersion": "2024-11-05"}),
        ("tools/list", {}),
        ("resources/list", {}),
        ("tools/call", {"name": "graph_stats", "arguments": {}}),
        ("tools/call", {"name": "god_nodes", "arguments": {"top_n": 10}}),
        ("tools/call", {"name": "query_graph", "arguments": {"question": "PaystackAdapter parsePaystackTransaction parsePaystackCallback", "mode": "bfs", "depth": 2}}),
        ("tools/call", {"name": "query_graph", "arguments": {"question": "createQuote createOrder applyFundingEvent convertMinorCeil", "mode": "bfs", "depth": 2}}),
        ("tools/call", {"name": "query_graph", "arguments": {"question": "PaiAdapter GramlAdapter processInbox processOutbox", "mode": "bfs", "depth": 2}}),
        ("tools/call", {"name": "query_graph", "arguments": {"question": "AuthGuard AdminGuard getSession", "mode": "bfs", "depth": 2}}),
        ("tools/call", {"name": "shortest_path", "arguments": {"source": "CommerceController", "target": "withSerializable", "undirected": True}}),
    ]
    out = []
    for idx, (m, p) in enumerate(calls, 1):
        out.append({"method": m, "params": p, "response": await _handle(server, {"jsonrpc": "2.0", "id": idx, "method": m, "params": p})})
    print(json.dumps({"selfTest": "PASS", "checks": len(out), "results": out}, indent=2))
    return 0


async def _stdio(server: Any) -> None:
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        resp = await _handle(server, msg)
        if resp is not None:
            sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
            sys.stdout.flush()


def main() -> int:
    os.environ.setdefault("GRAPHIFY_NO_AUTO_REFRESH", "1")
    os.environ.setdefault("GRAPHIFY_BACKEND", "none")
    _install_mcp_shim()
    from graphify.serve import _build_server

    root = Path(__file__).resolve().parent.parent
    graph_arg = str(root / "graphify-out" / "graph.json")
    self_test = "--self-test" in sys.argv[1:]
    for i, a in enumerate(sys.argv[1:], 1):
        if a == "--graph" and i < len(sys.argv) - 1:
            graph_arg = sys.argv[i + 1]
    server = _build_server(graph_arg)
    return asyncio.run(_self_test(server) if self_test else _stdio(server))


if __name__ == "__main__":
    raise SystemExit(main())

