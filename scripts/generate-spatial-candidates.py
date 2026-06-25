#!/usr/bin/env python3
"""
Generate reviewable Xetu spatial-layer candidates from xetu_mvp.json.

This script is intentionally conservative:
- it never edits xetu_mvp.json;
- it treats Gemini output as unverified suggestions;
- it writes JSONL records with provenance and status=needs_review;
- it processes arrets and arrets_retour;
- it can run without a Gemini key to export existing stops/hubs/quartiers.

Usage examples:
  python scripts/generate-spatial-candidates.py ^
    --input C:\\Users\\DELL\\Desktop\\whatsapp-agent\\Dashboard\\data\\xetu_mvp.json ^
    --output C:\\tmp\\xetu_spatial_candidates.jsonl ^
    --limit 20

  $env:GEMINI_API_KEY="..."
  python scripts/generate-spatial-candidates.py --with-gemini --limit 20 --sleep 5

  python scripts/generate-spatial-candidates.py --with-gemini ^
    --lines 232,9,6 --offset 50 --limit 50 --sleep 5 ^
    --output spatial_candidates.gemini.batch.jsonl
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


DEFAULT_INPUT = (
    Path.home()
    / "Desktop"
    / "whatsapp-agent"
    / "Dashboard"
    / "data"
    / "xetu_mvp.json"
)
DEFAULT_OUTPUT = Path("spatial_candidates.jsonl")
DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite"


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def normalize_text(value: str) -> str:
    value = strip_accents(value).lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def stable_id(*parts: str) -> str:
    raw = "_".join(normalize_text(p) for p in parts if p)
    raw = re.sub(r"[^a-z0-9]+", "_", raw).strip("_")
    return raw[:160] or "candidate"


def dedupe_keep_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        clean = re.sub(r"\s+", " ", str(value)).strip()
        if not clean:
            continue
        key = normalize_text(clean)
        if key in seen:
            continue
        seen.add(key)
        out.append(clean)
    return out


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False, sort_keys=True))
            f.write("\n")


def append_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    if not records:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="\n") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False, sort_keys=True))
            f.write("\n")
        f.flush()


def candidate_record(
    *,
    candidate: str,
    candidate_type: str,
    source: str,
    reason: str,
    status: str = "needs_review",
    confidence: str = "unverified",
    line: str | None = None,
    direction: str | None = None,
    stop_name: str | None = None,
    stop_id: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    record = {
        "id": stable_id(source, candidate_type, line or "", direction or "", stop_name or "", candidate),
        "candidate": candidate,
        "type": candidate_type,
        "status": status,
        "confidence": confidence,
        "source": source,
        "reason": reason,
        "line": line,
        "direction": direction,
        "stop_name": stop_name,
        "stop_id": stop_id,
        "lat": lat,
        "lon": lon,
    }
    if extra:
        record.update(extra)
    return record


def parse_csv_filter(value: str | None) -> set[str] | None:
    if not value:
        return None
    items = {part.strip() for part in value.split(",") if part.strip()}
    return items or None


def iter_stops(
    data: dict[str, Any],
    *,
    lines: set[str] | None = None,
    directions: set[str] | None = None,
    only_missing_aliases: bool = False,
):
    for line_id, line in sorted((data.get("lignes") or {}).items()):
        if lines is not None and str(line_id) not in lines:
            continue
        for direction in ("arrets", "arrets_retour"):
            if directions is not None and direction not in directions:
                continue
            for idx, stop in enumerate(line.get(direction) or []):
                if only_missing_aliases and stop.get("aliases_terrain"):
                    continue
                yield line_id, direction, idx, stop


def existing_dataset_candidates(data: dict[str, Any]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []

    for line_id, direction, idx, stop in iter_stops(data):
        stop_name = stop.get("nom", "")
        stop_id = f"L{line_id}_{idx:03d}_{'R' if direction == 'arrets_retour' else 'A'}"
        lat = stop.get("lat")
        lon = stop.get("lon")

        records.append(
            candidate_record(
                candidate=stop_name,
                candidate_type="stop_name",
                source="xetu_mvp.stop_name",
                reason="Official stop name from xetu_mvp.json.",
                status="validated",
                confidence="source_of_truth",
                line=line_id,
                direction=direction,
                stop_name=stop_name,
                stop_id=stop_id,
                lat=lat,
                lon=lon,
            )
        )

        for alias in stop.get("aliases_terrain") or []:
            records.append(
                candidate_record(
                    candidate=alias,
                    candidate_type="stop_alias",
                    source="xetu_mvp.aliases_terrain",
                    reason="Existing terrain alias already present in xetu_mvp.json.",
                    status="validated",
                    confidence="existing_dataset",
                    line=line_id,
                    direction=direction,
                    stop_name=stop_name,
                    stop_id=stop_id,
                    lat=lat,
                    lon=lon,
                )
            )

    for hub in data.get("hubs") or []:
        for name in dedupe_keep_order([hub.get("nom", ""), *(hub.get("noms_alternatifs") or [])]):
            records.append(
                candidate_record(
                    candidate=name,
                    candidate_type="hub_alias",
                    source="xetu_mvp.hubs",
                    reason="Hub or hub alternate name already present in xetu_mvp.json.",
                    status="validated",
                    confidence="existing_dataset",
                    lat=hub.get("lat"),
                    lon=hub.get("lng"),
                    extra={
                        "hub_id": hub.get("id"),
                        "lines": hub.get("lignes") or [],
                        "linked_stops": hub.get("stops") or [],
                    },
                )
            )

    for quartier in data.get("quartiers") or []:
        records.append(
            candidate_record(
                candidate=quartier.get("nom", ""),
                candidate_type="zone",
                source="xetu_mvp.quartiers",
                reason="Neighborhood/zone already present in xetu_mvp.json.",
                status="validated",
                confidence="existing_dataset",
                lat=quartier.get("lat"),
                lon=quartier.get("lng"),
                extra={
                    "zone": quartier.get("zone"),
                    "lines": quartier.get("lignes") or [],
                    "nearby_stops": quartier.get("arrets_proches") or [],
                },
            )
        )

    return records


@dataclass
class GeminiSuggestion:
    aliases: list[str]
    landmarks: list[str]
    notes: list[str]


def build_gemini_prompt(stop: dict[str, Any], line_id: str, direction: str) -> str:
    aliases = stop.get("aliases_terrain") or []
    return f"""
Tu aides à créer un dictionnaire terrain pour Xetu, une app de bus à Dakar.

Important :
- Ne donne que des CANDIDATS à vérifier, pas des vérités définitives.
- N'invente pas de coordonnées.
- N'utilise pas de temps de trajet ni d'itinéraires.
- Propose des noms que les gens diraient à l'oral autour de cet arrêt.
- Si tu n'es pas sûr, mets moins de candidats.

Arrêt :
- ligne: {line_id}
- sens: {direction}
- nom: {stop.get("nom")}
- lat: {stop.get("lat")}
- lon: {stop.get("lon")}
- alias déjà connus: {json.dumps(aliases, ensure_ascii=False)}

Réponds uniquement en JSON strict :
{{
  "aliases": ["..."],
  "landmarks": ["..."],
  "notes": ["..."]
}}
""".strip()


def call_gemini(prompt: str, api_key: str, model: str, timeout_s: int) -> dict[str, Any]:
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout_s) as response:
        raw = response.read().decode("utf-8")
    data = json.loads(raw)
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(text)


def gemini_candidates(
    data: dict[str, Any],
    *,
    api_key: str,
    model: str,
    offset: int,
    limit: int | None,
    lines: set[str] | None,
    directions: set[str] | None,
    only_missing_aliases: bool,
    sleep_s: float,
    timeout_s: int,
    retries: int,
    retry_sleep_s: float,
    incremental_output: Path | None,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    processed = 0
    skipped = 0

    for line_id, direction, idx, stop in iter_stops(
        data,
        lines=lines,
        directions=directions,
        only_missing_aliases=only_missing_aliases,
    ):
        if skipped < offset:
            skipped += 1
            continue
        if limit is not None and processed >= limit:
            break

        stop_name = stop.get("nom", "")
        stop_id = f"L{line_id}_{idx:03d}_{'R' if direction == 'arrets_retour' else 'A'}"
        prompt = build_gemini_prompt(stop, line_id, direction)
        processed += 1

        result = None
        for attempt in range(retries + 1):
            try:
                result = call_gemini(prompt, api_key, model, timeout_s)
                break
            except (TimeoutError, urllib.error.URLError, urllib.error.HTTPError, OSError, KeyError, json.JSONDecodeError) as exc:
                print(
                    f"[gemini:error] {line_id}/{direction}/{stop_name} "
                    f"attempt={attempt + 1}/{retries + 1}: {exc}",
                    file=sys.stderr,
                    flush=True,
                )
                if attempt < retries and retry_sleep_s > 0:
                    time.sleep(retry_sleep_s * (attempt + 1))
        if result is None:
            continue

        aliases = dedupe_keep_order([str(x) for x in result.get("aliases") or []])
        landmarks = dedupe_keep_order([str(x) for x in result.get("landmarks") or []])
        notes = dedupe_keep_order([str(x) for x in result.get("notes") or []])

        stop_records: list[dict[str, Any]] = []
        for alias in aliases:
            stop_records.append(
                candidate_record(
                    candidate=alias,
                    candidate_type="stop_alias",
                    source="gemini_suggestion_unverified",
                    reason="LLM-generated oral alias candidate. Must be reviewed before use.",
                    line=line_id,
                    direction=direction,
                    stop_name=stop_name,
                    stop_id=stop_id,
                    lat=stop.get("lat"),
                    lon=stop.get("lon"),
                    extra={"model": model, "notes": notes},
                )
            )

        for landmark in landmarks:
            stop_records.append(
                candidate_record(
                    candidate=landmark,
                    candidate_type="landmark_alias",
                    source="gemini_suggestion_unverified",
                    reason="LLM-generated nearby landmark candidate. Must be verified before persistence.",
                    line=line_id,
                    direction=direction,
                    stop_name=stop_name,
                    stop_id=stop_id,
                    lat=stop.get("lat"),
                    lon=stop.get("lon"),
                    extra={"model": model, "notes": notes},
                )
            )
        records.extend(stop_records)
        if incremental_output is not None:
            append_jsonl(incremental_output, stop_records)

        print(
            f"[gemini] {processed} (offset={offset}, skipped={skipped}): "
            f"L{line_id} {direction} {stop_name} "
            f"-> aliases={len(aliases)} landmarks={len(landmarks)}",
            flush=True,
        )
        if sleep_s > 0:
            time.sleep(sleep_s)

    return records


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--with-gemini", action="store_true")
    parser.add_argument("--gemini-api-key", default=os.environ.get("GEMINI_API_KEY"))
    parser.add_argument("--gemini-model", default=DEFAULT_GEMINI_MODEL)
    parser.add_argument("--offset", type=int, default=0, help="Skip this many filtered stops before Gemini calls.")
    parser.add_argument("--limit", type=int, default=None, help="Max stops to send to Gemini.")
    parser.add_argument("--lines", default=None, help="Comma-separated line filter, e.g. 232,9,6.")
    parser.add_argument("--directions", default=None, help="Comma-separated direction filter: arrets,arrets_retour.")
    parser.add_argument("--only-missing-aliases", action="store_true", help="Send only stops without aliases_terrain.")
    parser.add_argument("--sleep", type=float, default=5.0, help="Seconds between Gemini calls. Use >=5 for 15 RPM.")
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--retries", type=int, default=2, help="Retries per Gemini stop after transient failures.")
    parser.add_argument("--retry-sleep", type=float, default=6.0, help="Base seconds for retry backoff.")
    args = parser.parse_args()

    data = load_json(args.input)
    records = existing_dataset_candidates(data)
    print(f"[xetu] existing candidates: {len(records)}")

    if args.with_gemini:
        if not args.gemini_api_key:
            print("Missing GEMINI_API_KEY or --gemini-api-key.", file=sys.stderr)
            return 2
        write_jsonl(args.output, records)
        print(f"[xetu] wrote base candidates to {args.output}; Gemini candidates will append incrementally.")
        generated = gemini_candidates(
            data,
            api_key=args.gemini_api_key,
            model=args.gemini_model,
            offset=args.offset,
            limit=args.limit,
            lines=parse_csv_filter(args.lines),
            directions=parse_csv_filter(args.directions),
            only_missing_aliases=args.only_missing_aliases,
            sleep_s=args.sleep,
            timeout_s=args.timeout,
            retries=args.retries,
            retry_sleep_s=args.retry_sleep,
            incremental_output=args.output,
        )
        print(f"[gemini] generated candidates: {len(generated)}")
        print(f"[ok] wrote {len(records) + len(generated)} candidates to {args.output}")
    else:
        write_jsonl(args.output, records)
        print(f"[ok] wrote {len(records)} candidates to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
