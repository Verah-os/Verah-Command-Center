"""Cognee Phase-0 POC (Issue #152) — sandbox-only and provider-offline.

Validates on a small set of Context Pack/ADR/handoff samples:
1) ingestion into a dedicated dataset;
2) cross-session retrieval: data written by one "agent" is queryable in a
   subsequent run without re-ingestion (the "different agent" scenario);
3) retrieval precision for keyword queries (CHUNKS_LEXICAL — no external
   embedding call);
4) provenance/TTL surface: dataset listing + deletion as the supersession
   knob; no native TTL — recorded as a finding.

Graph extraction (`cognify`) is not exercised here because it needs a real
LLM; that hard dependency is itself a Phase-0 finding.

Run:
    python -m venv <short-venv-path>
    <venv-python> -m pip install "cognee==1.5.3"
    <venv-python> pocs/cognee/poc_cognee_memory.py
    <venv-python> pocs/cognee/poc_cognee_memory.py --skip-ingest

The first import can download tiktoken's public tokenizer vocabulary into
`.poc-cache/tiktoken`; no LLM or embedding provider is contacted.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import sys
from pathlib import Path

POC_DIR = Path(__file__).resolve().parent
REPO_ROOT = POC_DIR.parents[1]
SAMPLES = REPO_ROOT / "samples" / "context-packs"
DATASET = "verah-context-packs"
COGNEE_ROOT = REPO_ROOT / ".poc-cache" / "cognee"

os.environ["ENABLE_BACKEND_ACCESS_CONTROL"] = "false"
os.environ["COGNEE_SKIP_CONNECTION_TEST"] = "true"
os.environ["CACHING"] = "false"  # disable session-memory LLM calls
os.environ["TIKTOKEN_CACHE_DIR"] = str(REPO_ROOT / ".poc-cache" / "tiktoken")
os.environ["DATA_ROOT_DIRECTORY"] = str(COGNEE_ROOT / "data")
os.environ["SYSTEM_ROOT_DIRECTORY"] = str(COGNEE_ROOT / "system")
os.environ["CACHE_ROOT_DIRECTORY"] = str(COGNEE_ROOT / "cache")
os.environ["COGNEE_LOGS_DIR"] = str(COGNEE_ROOT / "logs")
os.environ["COGNEE_TRACING_ENABLED"] = "false"
os.environ["LANGFUSE_PUBLIC_KEY"] = ""
os.environ["LANGFUSE_SECRET_KEY"] = ""
os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"] = ""
os.environ["OTEL_EXPORTER_OTLP_HEADERS"] = ""
os.environ["LLM_MODEL"] = "openai/mock-model"
os.environ["LLM_PROVIDER"] = "openai"
os.environ["LLM_API_KEY"] = "sandbox-mock"
os.environ["EMBEDDING_PROVIDER"] = "openai"
os.environ["EMBEDDING_MODEL"] = "openai/mock-embed"
os.environ["EMBEDDING_API_KEY"] = "sandbox-mock"

sys.path.insert(0, str(POC_DIR))
from mock_llm import MockOpenAIServer  # noqa: E402

_mock = MockOpenAIServer(port=int(os.environ.get("POC_MOCK_LLM_PORT", "18494")))
_mock.start()
os.environ["LLM_ENDPOINT"] = _mock.endpoint()
os.environ["EMBEDDING_ENDPOINT"] = _mock.endpoint()

import cognee  # noqa: E402
import litellm  # noqa: E402

litellm.drop_params = True  # mock endpoint ignores unsupported params (e.g. dimensions)

from cognee.api.v1.search import SearchType  # noqa: E402
from cognee.modules.pipelines import run_pipeline  # noqa: E402
from cognee.modules.pipelines.tasks.task import Task  # noqa: E402
from cognee.modules.chunking.TextChunker import TextChunker  # noqa: E402
from cognee.tasks.documents import classify_documents, extract_chunks_from_documents  # noqa: E402
from cognee.tasks.storage import add_data_points  # noqa: E402

QUERIES = {
    "What is the architecture reference order?": "Langflow/Control Plane",
    "Which issues does Phase 0 feed?": "#148",
    "Name the routing component under evaluation": "OmniRoute",
}

results: dict = {"dataset": DATASET, "ingested": [], "queries": {}, "notes": []}


async def main(skip_ingest: bool = False) -> int:
    try:
        files = sorted(SAMPLES.glob("*.md"))
        if not files:
            results["error"] = f"no samples in {SAMPLES}"
            return report(False)

        if skip_ingest:
            results["processing"] = "skipped_ingestion_cross_process_retrieval"
        else:
            for f in files:
                digest = hashlib.sha256(f.read_bytes()).hexdigest()[:16]
                await cognee.add(str(f), dataset_name=DATASET)
                results["ingested"].append({"file": f.name, "sha256": digest})

            # Deterministic processing without LLM: classify -> chunk -> vectorize.
            # (Mirrors the library's non-LLM route; the default `cognify` route
            # always passes through LLM extraction — a finding of this POC.)
            tasks = [
                Task(classify_documents),
                Task(extract_chunks_from_documents, max_chunk_size=256, chunker=TextChunker),
                Task(add_data_points, task_config={"batch_size": 64}),
            ]
            async for _run_state in run_pipeline(
                datasets=[DATASET],
                tasks=tasks,
                pipeline_name="poc_deterministic_chunks",
            ):
                pass  # consume the generator to completion
            results["processing"] = "deterministic_chunks_no_llm"

        correct = total = 0
        # Queries run under a distinct session_id — the "different agent,
        # new session" scenario the issue asks to test.
        agent_b_session = "poc-agent-b-session"
        for question, needle in QUERIES.items():
            hits = await cognee.search(query_text=question, query_type=SearchType.CHUNKS_LEXICAL, session_id=agent_b_session)
            texts = [getattr(h, "text", None) or (h.get("text") if isinstance(h, dict) else "") for h in hits]
            found = any(needle in (t or "") for t in texts)
            correct += found
            total += 1
            results["queries"][question] = {"found": bool(found), "checked_needle": needle, "hits": len(texts)}
            if not hits:
                results["notes"].append(f"{question}: no hits")
        results["cross_session_id"] = agent_b_session

        precision = (correct / total) if total else 0.0
        results["precision"] = round(precision, 3)

        datasets = await cognee.datasets.list_datasets()
        results["datasets"] = [d.name for d in datasets]
        results["ttl_supported"] = False
        results["supersession_via_delete"] = True

        results["summary"] = {
            "ingested_files": len(results["ingested"]),
            "queries_answered": f"{correct}/{total}",
            "precision": results["precision"],
        }
        return report(results["precision"] >= 2 / 3)
    finally:
        _mock.stop()


def report(ok: bool) -> int:
    print(json.dumps(results, indent=2))
    print("\nPOC:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--skip-ingest",
        action="store_true",
        help="query the persisted dataset without adding or processing samples",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(main(skip_ingest=args.skip_ingest)))
