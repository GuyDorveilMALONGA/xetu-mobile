#!/usr/bin/env python3
"""Build Xetu's reviewable offline spatial layer.

The builder is intentionally conservative:
- xetu_mvp.json remains the transit source of truth;
- Gemini/Maps candidates stay review data, never validated automatically;
- landmark -> stop links are deterministic suggestions with provenance.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def normalize_text(value: Any) -> str:
    value = strip_accents(str(value or "")).lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def stable_id(*parts: Any) -> str:
    raw = "_".join(normalize_text(part) for part in parts if str(part or "").strip())
    raw = re.sub(r"[^a-z0-9]+", "_", raw).strip("_")
    return raw[:180] or "spatial_item"


def dedupe_keep_order(values: list[Any]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        clean = re.sub(r"\s+", " ", str(value or "")).strip()
        if not clean:
            continue
        key = normalize_text(clean)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(clean)
    return out


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    if not path.exists():
        return records
    with path.open("r", encoding="utf-8") as f:
        for lineno, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise SystemExit(f"{path}:{lineno}: invalid JSONL: {exc}") from exc
    return records


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")


def write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False, sort_keys=True))
            f.write("\n")


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_m = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * radius_m * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def extract_stops(mvp: dict[str, Any]) -> list[dict[str, Any]]:
    stops: list[dict[str, Any]] = []
    for line, route in sorted((mvp.get("lignes") or {}).items(), key=lambda item: str(item[0])):
        for direction, suffix in (("arrets", "A"), ("arrets_retour", "R")):
            for index, stop in enumerate(route.get(direction) or []):
                lat = stop.get("lat")
                lon = stop.get("lon")
                if lat is None or lon is None:
                    continue
                aliases = dedupe_keep_order(stop.get("aliases_terrain") or [])
                name = str(stop.get("nom") or "").strip()
                stop_id = stop.get("stop_id") or f"L{line}_{index:03d}_{suffix}"
                names = dedupe_keep_order([name, *aliases])
                stops.append(
                    {
                        "id": stop_id,
                        "line": str(line),
                        "direction": direction,
                        "index": index,
                        "name": name,
                        "lat": float(lat),
                        "lon": float(lon),
                        "aliases": aliases,
                        "search_text": normalize_text(" ".join(names)),
                        "status": "validated",
                        "source": "xetu_mvp.json",
                    }
                )
    return stops


def normalized_tokens(value: str) -> set[str]:
    return {token for token in normalize_text(value).split() if len(token) >= 2}


def text_score(query: str, target: str) -> float:
    q = normalize_text(query)
    t = normalize_text(target)
    if not q or not t:
        return 0.0
    if q == t:
        return 1.0
    if len(q) >= 4 and q in t:
        return 0.9
    if len(t) >= 4 and t in q:
        return 0.85
    q_tokens = normalized_tokens(q)
    t_tokens = normalized_tokens(t)
    if not q_tokens or not t_tokens:
        return 0.0
    overlap = len(q_tokens & t_tokens)
    if not overlap:
        return 0.0
    return min(0.8, overlap / max(len(q_tokens), len(t_tokens)))


def best_text_score(queries: list[str], stop: dict[str, Any]) -> float:
    names = [stop["name"], *(stop.get("aliases") or [])]
    best = 0.0
    for query in queries:
        for name in names:
            best = max(best, text_score(query, name))
    return best


def coords_from_area(area: str | None, mvp: dict[str, Any]) -> tuple[float, float, str] | None:
    if not area:
        return None
    area_key = normalize_text(area)
    if not area_key:
        return None
    for section in ("quartiers", "hubs"):
        for item in mvp.get(section) or []:
            name = item.get("nom") or ""
            aliases = " ".join(item.get("noms_alternatifs") or [])
            key = normalize_text(f"{name} {aliases}")
            if area_key == normalize_text(name) or area_key in key or normalize_text(name) in area_key:
                lat = item.get("lat")
                lon = item.get("lon", item.get("lng"))
                if lat is not None and lon is not None:
                    return float(lat), float(lon), section[:-1]
    return None


def nearest_stops_for_landmark(
    landmark: dict[str, Any],
    stops: list[dict[str, Any]],
    mvp: dict[str, Any],
    limit: int = 3,
) -> list[dict[str, Any]]:
    candidate = str(landmark.get("candidate") or "")
    aliases = landmark.get("aliases") or []
    near_hint = str(landmark.get("near_stop_hint") or "")
    area = str(landmark.get("area") or "")
    queries = dedupe_keep_order([candidate, near_hint, area, *aliases])
    hint_queries = dedupe_keep_order([near_hint, candidate, *aliases])

    coord_source = "none"
    coord = None
    if landmark.get("lat") is not None and landmark.get("lon") is not None:
        coord = (float(landmark["lat"]), float(landmark["lon"]))
        coord_source = "landmark_candidate"
    else:
        area_coord = coords_from_area(area, mvp)
        if area_coord:
            coord = (area_coord[0], area_coord[1])
            coord_source = f"mvp_{area_coord[2]}"

    scored: list[tuple[float, float | None, dict[str, Any], str]] = []
    for stop in stops:
        direct = best_text_score(hint_queries, stop)
        area_match = text_score(area, stop["search_text"]) * 0.45
        score = max(direct, area_match)
        distance_m = None
        reason_parts: list[str] = []
        if direct >= 0.85:
            reason_parts.append("strong_text_match")
        elif direct > 0:
            reason_parts.append("text_overlap")
        if area_match > 0:
            reason_parts.append("area_text_overlap")
        if coord:
            distance_m = haversine_m(coord[0], coord[1], stop["lat"], stop["lon"])
            distance_score = max(0.0, 1.0 - min(distance_m, 2500.0) / 2500.0)
            if distance_score > 0:
                score = max(score, min(0.82, distance_score * 0.82))
                reason_parts.append(f"distance_from_{coord_source}")
        if score <= 0:
            continue
        scored.append((score, distance_m, stop, "+".join(reason_parts) or "weak_text_match"))

    scored.sort(key=lambda item: (-item[0], item[1] if item[1] is not None else 999_999, item[2]["line"]))
    nearby: list[dict[str, Any]] = []
    seen_physical: set[str] = set()
    for score, distance_m, stop, reason in scored:
        physical_key = f"{normalize_text(stop['name'])}:{round(stop['lat'], 4)}:{round(stop['lon'], 4)}"
        if physical_key in seen_physical:
            continue
        seen_physical.add(physical_key)
        nearby.append(
            {
                "line": stop["line"],
                "direction": stop["direction"],
                "stop_id": stop["id"],
                "stop_name": stop["name"],
                "lat": stop["lat"],
                "lon": stop["lon"],
                "distance_m": round(distance_m) if distance_m is not None else None,
                "score": round(score, 3),
                "reason": reason,
            }
        )
        if len(nearby) >= limit:
            break
    return nearby


def dedupe_candidate_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for record in records:
        candidate = str(record.get("candidate") or record.get("stop_name") or "").strip()
        if not candidate:
            continue
        key = stable_id(record.get("type") or "candidate", candidate, record.get("line") or "", record.get("direction") or "")
        current = grouped.get(key)
        if current is None:
            current = dict(record)
            current["id"] = record.get("id") or key
            current["normalized"] = normalize_text(candidate)
            current["merged_count"] = 1
            current["merged_sources"] = dedupe_keep_order([record.get("source") or "unknown", *(record.get("merged_sources") or [])])
            grouped[key] = current
        else:
            current["merged_count"] += 1
            current["merged_sources"] = dedupe_keep_order(
                [*(current.get("merged_sources") or []), record.get("source") or "unknown", *(record.get("merged_sources") or [])]
            )
            if not current.get("lat") and record.get("lat"):
                current["lat"] = record["lat"]
            if not current.get("lon") and record.get("lon"):
                current["lon"] = record["lon"]
    return sorted(grouped.values(), key=lambda r: (str(r.get("status")), str(r.get("type")), str(r.get("candidate"))))


def dedupe_landmarks(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for record in records:
        candidate = str(record.get("candidate") or "").strip()
        if not candidate:
            continue
        key = normalize_text(candidate)
        current = grouped.get(key)
        if current is None:
            current = dict(record)
            current["id"] = record.get("id") or stable_id("landmark", candidate)
            current["aliases"] = dedupe_keep_order(record.get("aliases") or [])
            current["merged_sources"] = dedupe_keep_order([record.get("source") or "unknown", *(record.get("merged_sources") or [])])
            current["status"] = "needs_review"
            current["review_status"] = record.get("review_status") or "pending_human_or_gps_validation"
            grouped[key] = current
        else:
            current["aliases"] = dedupe_keep_order([*(current.get("aliases") or []), *(record.get("aliases") or [])])
            current["merged_sources"] = dedupe_keep_order(
                [*(current.get("merged_sources") or []), record.get("source") or "unknown", *(record.get("merged_sources") or [])]
            )
            if not current.get("near_stop_hint") and record.get("near_stop_hint"):
                current["near_stop_hint"] = record["near_stop_hint"]
            if not current.get("area") and record.get("area"):
                current["area"] = record["area"]
    return sorted(grouped.values(), key=lambda r: normalize_text(r.get("candidate")))


def candidate_lines(*groups: list[dict[str, Any]]) -> list[str]:
    lines: set[str] = set()
    for group in groups:
        for item in group:
            for stop in item.get("nearby_stops") or []:
                if stop.get("line"):
                    lines.add(str(stop["line"]))
    return sorted(lines, key=lambda value: (len(value), value))


def build_layer(args: argparse.Namespace) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    mvp = load_json(Path(args.mvp_json))
    stops = extract_stops(mvp)
    raw_candidates = load_jsonl(Path(args.candidates))
    raw_landmarks = load_jsonl(Path(args.landmarks))
    deduped_candidates = dedupe_candidate_records(raw_candidates)
    landmarks = dedupe_landmarks(raw_landmarks)

    links: list[dict[str, Any]] = []
    linked_landmarks: list[dict[str, Any]] = []
    for landmark in landmarks:
        nearby = nearest_stops_for_landmark(landmark, stops, mvp, limit=3)
        link = {
            "id": landmark.get("id"),
            "landmark": landmark.get("candidate"),
            "type": landmark.get("type"),
            "area": landmark.get("area"),
            "status": "needs_review",
            "review_status": landmark.get("review_status") or "pending_human_or_gps_validation",
            "nearby_stops": nearby,
            "source": landmark.get("source"),
            "reason": "deterministic_text_area_distance_link; requires human or GPS review",
        }
        links.append(link)
        compact = {
            "id": landmark.get("id"),
            "name": landmark.get("candidate"),
            "aliases": landmark.get("aliases") or [],
            "type": landmark.get("type"),
            "area": landmark.get("area"),
            "status": "needs_review",
            "review_status": landmark.get("review_status") or "pending_human_or_gps_validation",
            "near_stop_hint": landmark.get("near_stop_hint"),
            "nearby_stops": nearby,
            "source": landmark.get("source"),
            "merged_sources": landmark.get("merged_sources") or [],
            "notes": landmark.get("notes"),
        }
        linked_landmarks.append(compact)

    zones = []
    for quartier in mvp.get("quartiers") or []:
        zones.append(
            {
                "id": stable_id("zone", quartier.get("nom")),
                "name": quartier.get("nom"),
                "kind": "zone",
                "lat": quartier.get("lat"),
                "lon": quartier.get("lon", quartier.get("lng")),
                "lines": quartier.get("lignes") or [],
                "nearby_stops": quartier.get("arrets_proches") or [],
                "status": "validated",
                "source": "xetu_mvp.quartiers",
            }
        )

    hubs = []
    for hub in mvp.get("hubs") or []:
        hubs.append(
            {
                "id": hub.get("id") or stable_id("hub", hub.get("nom")),
                "name": hub.get("nom"),
                "kind": "hub",
                "lat": hub.get("lat"),
                "lon": hub.get("lon", hub.get("lng")),
                "aliases": hub.get("noms_alternatifs") or [],
                "lines": hub.get("lignes") or [],
                "stops": hub.get("stops") or [],
                "status": "validated",
                "source": "xetu_mvp.hubs",
            }
        )

    layer = {
        "schema_version": "xetu_spatial_layer.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "policy": {
            "mvp_source_of_truth": str(Path(args.mvp_json)),
            "do_not_persist_google_maps_raw": True,
            "gemini_candidates_are_review_only": True,
            "validated_sources": ["xetu_mvp.json"],
        },
        "sources": {
            "mvp_json": str(Path(args.mvp_json)),
            "raw_candidates": str(Path(args.candidates)),
            "raw_landmarks": str(Path(args.landmarks)),
        },
        "counts": {
            "stops": len(stops),
            "zones": len(zones),
            "hubs": len(hubs),
            "raw_candidates": len(raw_candidates),
            "deduped_candidates": len(deduped_candidates),
            "raw_landmarks": len(raw_landmarks),
            "deduped_landmarks": len(linked_landmarks),
            "landmarks_with_links": sum(1 for item in linked_landmarks if item.get("nearby_stops")),
        },
        "stops": stops,
        "zones": zones,
        "hubs": hubs,
        "landmarks": linked_landmarks,
    }

    report = {
        "generated_at": layer["generated_at"],
        "counts": layer["counts"],
        "status_counts": {
            "landmarks_needs_review": len(linked_landmarks),
            "candidate_validated_from_mvp": sum(1 for item in deduped_candidates if item.get("status") == "validated"),
            "candidate_needs_review": sum(1 for item in deduped_candidates if item.get("status") != "validated"),
        },
        "target_examples_present": {
            "liberte_6": any("liberte 6" in normalize_text(item.get("name")) or "liberte 6" in normalize_text(" ".join(item.get("aliases") or [])) for item in [*zones, *hubs, *linked_landmarks]),
            "yoff": any("yoff" in normalize_text(item.get("name")) for item in [*zones, *hubs, *linked_landmarks]),
            "police_dieuppeul": any("police" in normalize_text(item.get("name")) and "dieuppeul" in normalize_text(item.get("name")) for item in linked_landmarks),
            "estg": any("estg" in normalize_text(item.get("name")) or "estg" in normalize_text(" ".join(item.get("aliases") or [])) for item in linked_landmarks),
            "sandaga": any("sandaga" in normalize_text(item.get("name")) for item in [*zones, *hubs, *linked_landmarks]),
        },
    }
    return layer, links, deduped_candidates, report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mvp-json", default=str(Path.home() / "Desktop" / "whatsapp-agent" / "Dashboard" / "data" / "xetu_mvp.json"))
    parser.add_argument("--landmarks", default="spatial_landmark_candidates.review.jsonl")
    parser.add_argument("--candidates", default="spatial_candidates.gemini.all.jsonl")
    parser.add_argument("--output", default="xetu_spatial_layer.json")
    parser.add_argument("--links-output", default="spatial_landmark_stop_links.review.jsonl")
    parser.add_argument("--candidates-output", default="spatial_candidates.review.jsonl")
    parser.add_argument("--report", default="spatial_layer.report.json")
    args = parser.parse_args()

    layer, links, deduped_candidates, report = build_layer(args)
    write_json(Path(args.output), layer)
    write_jsonl(Path(args.links_output), links)
    write_jsonl(Path(args.candidates_output), deduped_candidates)
    write_json(Path(args.report), report)
    print(
        json.dumps(
            {
                "status": "ok",
                "output": args.output,
                "links_output": args.links_output,
                "candidates_output": args.candidates_output,
                "report": args.report,
                "counts": layer["counts"],
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
