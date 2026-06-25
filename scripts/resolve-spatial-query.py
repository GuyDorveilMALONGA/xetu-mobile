#!/usr/bin/env python3
"""Resolve a local Dakar phrase against xetu_spatial_layer.json."""

from __future__ import annotations

import argparse
import json
import math
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


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    radius_m = 6_371_000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return round(radius_m * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def stop_distance_m(stop: dict[str, Any], gps: tuple[float, float] | None) -> int | None:
    if not gps:
        return None
    lat = stop.get("lat")
    lon = stop.get("lon")
    if lat is None or lon is None:
        return None
    return haversine_m(gps[0], gps[1], float(lat), float(lon))


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


def as_stop_candidate(
    stop: dict[str, Any],
    score: float,
    *,
    distance_m: int | None = 0,
    reason: str = "exact_stop_or_alias_match",
    gps_distance_m: int | None = None,
) -> dict[str, Any]:
    return {
        "kind": "stop",
        "name": stop.get("name"),
        "status": stop.get("status"),
        "score": round(score, 3),
        "gps_distance_m": gps_distance_m,
        "nearby_stops": [
            {
                "line": stop.get("line"),
                "direction": stop.get("direction"),
                "stop_id": stop.get("id"),
                "stop_name": stop.get("name"),
                "lat": stop.get("lat"),
                "lon": stop.get("lon"),
                "distance_m": distance_m,
                "score": round(score, 3),
                "reason": reason,
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


def search_place(
    layer: dict[str, Any],
    query: str,
    limit: int = 5,
    gps: tuple[float, float] | None = None,
) -> list[dict[str, Any]]:
    scored: list[tuple[float, int, dict[str, Any]]] = []
    order = 0
    for stop in layer.get("stops") or []:
        score = max(text_score(query, name) for name in item_names(stop))
        if score >= 0.5:
            gps_distance_m = stop_distance_m(stop, gps) if gps else None
            scored.append(
                (
                    score,
                    order,
                    as_stop_candidate(stop, score, gps_distance_m=gps_distance_m),
                )
            )
            order += 1
    for kind, section in (("zone", "zones"), ("hub", "hubs"), ("landmark", "landmarks")):
        for item in layer.get(section) or []:
            score = max(text_score(query, name) for name in item_names(item))
            if score >= 0.45:
                scored.append((score, order, as_place_candidate(kind, item, score)))
                order += 1
    if gps:
        scored.sort(
            key=lambda item: (
                -item[0],
                item[2].get("gps_distance_m")
                if item[2].get("gps_distance_m") is not None
                else 999_999,
                item[1],
            )
        )
    else:
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


def nearest_stop_candidates(
    layer: dict[str, Any],
    gps: tuple[float, float],
    *,
    limit: int = 5,
    radius_m: int = 900,
) -> list[dict[str, Any]]:
    scored: list[tuple[int, int, dict[str, Any]]] = []
    for order, stop in enumerate(layer.get("stops") or []):
        distance_m = stop_distance_m(stop, gps)
        if distance_m is None or distance_m > radius_m:
            continue
        score = max(0.5, 1 - (distance_m / radius_m))
        scored.append(
            (
                distance_m,
                order,
                as_stop_candidate(
                    stop,
                    score,
                    distance_m=distance_m,
                    reason="gps_nearby_origin",
                    gps_distance_m=distance_m,
                ),
            )
        )
    scored.sort(key=lambda item: (item[0], item[1]))
    return [item[2] for item in scored[:limit]]


def merge_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_key: dict[str, dict[str, Any]] = {}
    for candidate in candidates:
        key = f"{candidate.get('kind')}:{normalize_text(candidate.get('name'))}"
        current = by_key.get(key)
        if not current:
            by_key[key] = candidate
            continue
        current_distance = current.get("gps_distance_m")
        candidate_distance = candidate.get("gps_distance_m")
        if current_distance is None or (
            candidate_distance is not None and candidate_distance < current_distance
        ):
            by_key[key] = candidate
    merged = list(by_key.values())
    merged.sort(
        key=lambda item: (
            item.get("gps_distance_m")
            if item.get("gps_distance_m") is not None
            else 999_999,
            -(item.get("score") or 0),
            normalize_text(item.get("name")),
        )
    )
    return merged


def split_query(query: str) -> tuple[str, str | None]:
    raw = query.strip()
    raw_ascii = strip_accents(raw)
    implicit_destination = re.match(
        r"^\s*(?:je\s+veux\s+aller\s+a|je\s+vais\s+a|aller\s+a)\s+(.+)$",
        raw_ascii,
        flags=re.IGNORECASE,
    )
    if implicit_destination:
        return "", implicit_destination.group(1).strip()
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


def direct_line_evidence(
    from_candidates: list[dict[str, Any]],
    to_candidates: list[dict[str, Any]],
    common_lines: list[str],
) -> list[dict[str, Any]]:
    evidence: list[dict[str, Any]] = []
    for line in common_lines:
        origin_stop = None
        destination_stop = None
        for candidate in from_candidates:
            for stop in candidate.get("nearby_stops") or []:
                if str(stop.get("line") or stop.get("ligne")) == line:
                    origin_stop = stop
                    break
            if origin_stop:
                break
        for candidate in to_candidates:
            for stop in candidate.get("nearby_stops") or []:
                if str(stop.get("line") or stop.get("ligne")) == line:
                    destination_stop = stop
                    break
            if destination_stop:
                break
        evidence.append(
            {
                "line": line,
                "origin_stop": {
                    "stop_id": origin_stop.get("stop_id") if origin_stop else None,
                    "stop_name": (origin_stop.get("stop_name") or origin_stop.get("nom"))
                    if origin_stop
                    else None,
                    "distance_m": origin_stop.get("distance_m") if origin_stop else None,
                    "direction": origin_stop.get("direction") if origin_stop else None,
                },
                "destination_stop": {
                    "stop_id": destination_stop.get("stop_id") if destination_stop else None,
                    "stop_name": (
                        destination_stop.get("stop_name") or destination_stop.get("nom")
                    )
                    if destination_stop
                    else None,
                    "distance_m": destination_stop.get("distance_m")
                    if destination_stop
                    else None,
                    "direction": destination_stop.get("direction") if destination_stop else None,
                },
            }
        )
    return evidence


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
        "gps_distance_m": candidate.get("gps_distance_m"),
        "nearby_stops": compact_stops,
    }


def resolve(
    layer: dict[str, Any],
    query: str,
    gps: tuple[float, float] | None = None,
) -> dict[str, Any]:
    from_text, to_text = split_query(query)
    from_candidates = search_place(layer, from_text, gps=gps) if from_text else []
    gps_candidates = nearest_stop_candidates(layer, gps) if gps else []
    if gps:
        from_candidates = merge_candidates([*from_candidates, *gps_candidates])
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
    if common_lines and clarification_reasons == ["origin_ambiguous"]:
        needs_clarification = False
        clarification_reasons = []

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
        "direct_line_evidence": direct_line_evidence(
            from_candidates,
            to_candidates,
            common_lines,
        ),
        "gps_context": {
            "used": gps is not None,
            "lat": gps[0] if gps else None,
            "lon": gps[1] if gps else None,
            "nearest_stops": [compact_candidate(item) for item in gps_candidates[:5]],
        },
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
    parser.add_argument("--lat", type=float)
    parser.add_argument("--lon", type=float)
    args = parser.parse_args()

    if (args.lat is None) != (args.lon is None):
        parser.error("--lat and --lon must be provided together")
    gps = (args.lat, args.lon) if args.lat is not None and args.lon is not None else None

    result = resolve(load_layer(Path(args.layer)), args.query, gps=gps)
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    if not result["resolved_from"] and not result["resolved_to"]:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
