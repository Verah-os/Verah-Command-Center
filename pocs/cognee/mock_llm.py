"""Loopback mock of a minimal OpenAI-compatible endpoint (chat + embeddings).

Cognee probes the LLM endpoint even during ingestion, so the POC mounts this
server on 127.0.0.1 instead of touching any real provider.
"""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class _Handler(BaseHTTPRequestHandler):
    def _ok(self, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802
        n = int(self.headers.get("Content-Length", "0"))
        req = json.loads(self.rfile.read(n) or b"{}")
        if self.path.rstrip("/").endswith("chat/completions"):
            wants_structured = bool(req.get("response_format"))
            if wants_structured:
                msgs = req.get("messages") or []
                snippet = (msgs[0].get("content") or "")[:160].replace("\n", " ") if msgs else ""
                print(f"[mock-llm] structured call, schema={req['response_format'].get('type')} system={snippet!r}", flush=True)
            content = '"test"' if wants_structured else "test"
            self._ok({
                "id": "mock-chat",
                "choices": [{
                    "index": 0,
                    "message": {"role": "assistant", "content": content},
                    "finish_reason": "stop",
                }],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            })
        elif self.path.rstrip("/").endswith("embeddings"):
            texts = req.get("input") or []
            if isinstance(texts, str):
                texts = [texts]
            # Deterministic 3072-dim vector (cognee default dimensions).
            data = []
            for t in texts:
                h = hash(str(t)) & 0xFFFF
                vec = [float(h % 1000) / 1000.0] * 3072
                data.append({"embedding": vec})
            self._ok({"data": data, "usage": {"total_tokens": len(data)}})
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *_args) -> None:
        pass


class MockOpenAIServer:
    def __init__(self, port: int = 18494) -> None:
        self.port = port
        self.base_url = f"http://127.0.0.1:{port}/v1"
        self._server = ThreadingHTTPServer(("127.0.0.1", port), _Handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)

    def start(self) -> None:
        self._thread.start()

    def endpoint(self) -> str:
        return self.base_url

    def stop(self) -> None:
        self._server.shutdown()
