#!/usr/bin/env python3
"""Resolve a local Dakar phrase against xetu_spatial_layer.json."""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path
from typing import Any


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def normalize_text(value: Any) -> str:
    value = strip_accents(str(value or "")).lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def tokens(value: str) -> set[str]:
    return {token for token in normalize_text(value).split() if len(token) >= 2}


def text_score(query: str, target: str) -> float:
    q = normalize_text(query)
    t = normalize_text(target)
    if not q or not t:
        return 0.0
    if q == t:
        return 1.0
    if len(q) >= 4 and q in t:
        return 0.92
    if len(t) >= 4 and t in q:
        return 0.88
    q_tokens = tokens(q)
    t_tokens = tokens(t)
    if not q_tokens or not t_tokens:
        return 0.0
    overlap = q_tokens & t_tokens
    if not overlap:
        return 0.0
    return min(0.82, len(overlap) / max(len(q_tokens), len(t_tokens)))


def load_layer(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def item_names(item: dict[str, Any]) -> list[str]:
    names = [item.get("name"), item.get("landmark"), *(item.get("aliases") or [])]
    return [str(name) for name in names if str(name or "").strip()]


def as_stop_candidate(stop: dict[str, Any], score: float) -> dict[str, Any]:
    return {
        "kind": "stop",
        "name": stop.get("name"),
        "status": stop.get("status"),
        "score": round(score, 3),
        "nearby_stops": [
            {
                "line": stop.get("line"),
                "direction": stop.get("direction"),
                "stop_id": stop.get("id"),
                "stop_name": stop.get("name"),
                "lat": stop.get("lat"),
                "lon": stop.get("lon"),
                "distance_m": 0,
                "score": round(score, 3),
                "reason": "exact_stop_or_alias_match",
            }
        ],
    }


def as_place_candidate(kind: str, item: dict[str, Any], score: float) -> dict[str, Any]:
    return {
        "kind": kind,
        "name": item.get("name"),
        "status": item.get("status"),
        "review_status": item.get("review_status"),
        "score": round(score, 3),
        "area": item.get("area"),
        "nearby_stops": item.get("nearby_stops") or item.get("stops") or [],
        "source": item.get("source"),
    }


def search_place(layer: dict[str, Any], query: str, limit: int = 5) -> list[dict[str, Any]]:
    scored: list[tuple[float, int, dict[str, Any]]] = []
    order = 0
    for stop in layer.get("stops") or []:
        score = max(text_score(query, name) for name in item_names(stop))
        if score >= 0.5:
            scored.append((score, order, as_stop_candidate(stop, score)))
            order += 1
    for kind, section in (("zone", "zones"), ("hub", "hubs"), ("landmark", "landmarks")):
        for item in layer.get(section) or []:
            score = max(text_score(query, name) for name in item_names(item))
            if score >= 0.45:
                scored.append((score, order, as_place_candidate(kind, item, score)))
                order += 1
    scored.sort(key=lambda item: (-item[0], item[1]))

    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for _, _, candidate in scored:
        key = f"{candidate['kind']}:{normalize_text(candidate.get('name'))}"
        if key in seen:
            continue
        seen.add(key)
        out.append(candidate)
        if len(out) >= limit:
            break
    return out


def split_query(query: str) -> tuple[str, str | None]:
    raw = query.strip()
    patterns = [r"\s+->\s+", r"\s+vers\s+", r"\s+pour\s+aller\s+a\s+", r"\s+pour\s+aller\s+à\s+"]
    normalized = raw
    for pattern in patterns:
        parts = re.split(pattern, normalized, maxsplit=1, flags=re.IGNORECASE)
        if len(parts) == 2:
            return parts[0].strip(), parts[1].strip()
    return raw, None


def stop_lines(candidates: list[dict[str, Any]]) -> set[str]:
    lines: set[str] = set()
    for candidate in candidates:
        for stop in candidate.get("nearby_stops") or []:
            line = stop.get("line") or stop.get("ligne")
            if line:
                lines.add(str(line))
    return lines


def compact_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    stops = candidate.get("nearby_stops") or []
    compact_stops = []
    for stop in stops[:3]:
        compact_stops.append(
            {
                "line": stop.get("line") or stop.get("ligne"),
                "direction": stop.get("direction"),
                "stop_id": stop.get("stop_id"),
                "stop_name": stop.get("stop_name") or stop.get("nom"),
                "distance_m": stop.get("distance_m"),
                "score": stop.get("score"),
                "reason": stop.get("reason"),
            }
        )
    return {
        "kind": candidate.get("kind"),
        "name": candidate.get("name"),
        "status": candidate.get("status"),
        "review_status": candidate.get("review_status"),
        "score": candidate.get("score"),
        "area": candidate.get("area"),
        "nearby_stops": compact_stops,
    }


def resolve(layer: dict[str, Any], query: str) -> dict[str, Any]:
    from_text, to_text = split_query(query)
    from_candidates = search_place(layer, from_text)
    to_candidates = search_place(layer, to_text) if to_text else []

    from_lines = stop_lines(from_candidates)
    to_lines = stop_lines(to_candidates)
    common_lines = sorted(from_lines & to_lines, key=lambda value: (len(value), value))
    candidate_lines = common_lines or sorted(from_lines | to_lines, key=lambda value: (len(value), value))

    needs_clarification = False
    clarification_reasons: list[str] = []
    if not from_candidates:
        needs_clarification = True
        clarification_reasons.append("origin_not_resolved")
    elif len(from_candidates) > 1 and from_candidates[0]["score"] < 0.9:
        needs_clarification = True
        clarification_reasons.append("origin_ambiguous")
    if to_text and not to_candidates:
        needs_clarification = True
        clarification_reasons.append("destination_not_resolved")
    elif to_text and len(to_candidates) > 1 and to_candidates[0]["score"] < 0.9:
        needs_clarification = True
        clarification_reasons.append("destination_ambiguous")
    if from_candidates and to_text and to_candidates and not common_lines:
        needs_clarification = True
        clarification_reasons.append("no_direct_line_in_nearby_candidates")

    question = None
    if needs_clarification:
        if "origin_not_resolved" in clarification_reasons:
            question = "Tu peux preciser ton point de depart ou activer le GPS ?"
        elif "destination_not_resolved" in clarification_reasons:
            question = "Tu veux aller vers quel arret ou repere exactement ?"
        elif "no_direct_line_in_nearby_candidates" in clarification_reasons:
            question = "Je vois plusieurs arrets possibles. Tu es plus proche de quel repere exact ?"
        else:
            question = "Tu peux preciser le repere exact ?"

    return {
        "query": query,
        "origin_query": from_text,
        "destination_query": to_text,
        "resolved_from": [compact_candidate(item) for item in from_candidates[:3]],
        "resolved_to": [compact_candidate(item) for item in to_candidates[:3]],
        "candidate_lines": candidate_lines[:8],
        "direct_line_candidates": common_lines,
        "needs_clarification": needs_clarification,
        "clarification_reasons": clarification_reasons,
        "question": question,
        "policy": {
            "llm_may_explain": True,
            "resolver_is_authority": True,
            "unreviewed_landmarks_remain_needs_review": True,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--layer", default="xetu_spatial_layer.json")
    parser.add_argument("--query", required=True)
    args = parser.parse_args()

    result = resolve(load_layer(Path(args.layer)), args.query)
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    if not result["resolved_from"] and not result["resolved_to"]:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
