import re
import math
from difflib import SequenceMatcher
from app.database import get_db


def normalize_text(text: str) -> str:
    """Normalize text by lowering, removing punctuation, and stripping extra whitespace."""
    if not text:
        return ""
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    tokens = text.split()
    return " ".join(tokens)


def compute_similarity(str1: str, str2: str) -> float:
    """
    Computes sequence similarity ratio using Python difflib SequenceMatcher
    combined with token set alignment and containment for robust local matching.
    """
    norm1 = normalize_text(str1)
    norm2 = normalize_text(str2)
    if not norm1 or not norm2:
        return 0.0

    # 1. Raw sequence ratio
    seq_ratio = SequenceMatcher(None, norm1, norm2).ratio()

    # 2. Sorted token sequence ratio (handles word reordering)
    words1 = norm1.split()
    words2 = norm2.split()
    sorted_tokens1 = " ".join(sorted(words1))
    sorted_tokens2 = " ".join(sorted(words2))
    sorted_seq_ratio = SequenceMatcher(None, sorted_tokens1, sorted_tokens2).ratio()

    # 3. Word set overlap & containment
    set1 = set(words1)
    set2 = set(words2)
    if not set1 or not set2:
        return seq_ratio

    intersection = set1 & set2
    jaccard = len(intersection) / len(set1 | set2)
    containment = len(intersection) / min(len(set1), len(set2))

    # Composite weighted similarity
    composite = (0.35 * sorted_seq_ratio) + (0.25 * seq_ratio) + (0.25 * containment) + (0.15 * jaccard)
    return round(composite, 3)


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Returns distance in metres between two WGS84 lat/lon coordinates using the Haversine formula."""
    R = 6_371_000  # Mean Earth radius in metres
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def check_duplicate_grievance(
    category: str,
    locality: str,
    title: str,
    description: str,
    exclude_case_id: str = None,
    latitude: float = None,
    longitude: float = None
) -> list:
    """
    Scans active grievances in the database for likely duplicates based on:
    1. Exact category match
    2. Normalized locality similarity
    3. Title & Description semantic text similarity via difflib
    4. (Optional) Geographic proximity via Haversine distance when coordinates are supplied

    Returns sorted list of matches (up to 5):
    [
      {
        "case_id": "CF-2026-0042",
        "title": "Broken water main on 4th Ave",
        "category": "Water Supply & Sewage",
        "locality": "Sector 4",
        "status": "In Progress",
        "submission_date": "2026-10-25 10:00:00",
        "similarity_score": 0.84,
        "is_high_confidence": True,
        "citizen_support_count": 4
      }
    ]
    """
    norm_locality = normalize_text(locality)
    combined_query_text = f"{title} {description}"

    matches = []

    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT case_id, title, description, category, locality, status,
                   submission_date, citizen_support_count, latitude, longitude
            FROM grievances
            WHERE status NOT IN ('Closed', 'Resolved')
        """
        params = []
        if exclude_case_id:
            query += " AND case_id != ?"
            params.append(exclude_case_id)

        cursor.execute(query, params)
        rows = cursor.fetchall()

        for row in rows:
            # 1. Category check: must match exactly (case-insensitive)
            if row["category"].strip().lower() != category.strip().lower():
                continue

            # 2. Locality check: check if locality words overlap or match
            row_norm_loc = normalize_text(row["locality"])
            loc_similarity = compute_similarity(norm_locality, row_norm_loc)

            # Check for geo proximity even if text localities don't match
            geo_close = False
            if (latitude is not None and longitude is not None
                    and row["latitude"] is not None and row["longitude"] is not None):
                try:
                    dist_m = haversine_distance_m(latitude, longitude, row["latitude"], row["longitude"])
                    geo_close = dist_m < 2000  # Within 2 km counts as locality proximity
                except Exception:
                    pass

            # If localities differ completely AND no geo proximity, skip this candidate
            if loc_similarity < 0.35 and norm_locality not in row_norm_loc and row_norm_loc not in norm_locality:
                if not geo_close:
                    continue

            # 3. Content similarity (title + description)
            row_combined_text = f"{row['title']} {row['description']}"
            content_similarity = compute_similarity(combined_query_text, row_combined_text)

            # Combined match score (65% content similarity + 35% locality similarity)
            overall_score = round((0.65 * content_similarity) + (0.35 * loc_similarity), 2)

            # 4. Geographic proximity bonus — only when coordinates are available for both
            geo_bonus = 0.0
            if (latitude is not None and longitude is not None
                    and row["latitude"] is not None and row["longitude"] is not None):
                try:
                    dist_m = haversine_distance_m(latitude, longitude, row["latitude"], row["longitude"])
                    if dist_m < 100:
                        geo_bonus = 0.25   # Almost same spot — very strong duplicate signal
                    elif dist_m < 500:
                        geo_bonus = 0.15   # Within 500 m — same neighbourhood issue likely
                    elif dist_m < 2000:
                        geo_bonus = 0.05   # Within 2 km — mild proximity bonus
                except Exception:
                    pass

            overall_score = min(round(overall_score + geo_bonus, 2), 1.0)

            # Threshold for suggestion: >= 0.45
            if overall_score >= 0.45:
                matches.append({
                    "case_id": row["case_id"],
                    "title": row["title"],
                    "category": row["category"],
                    "locality": row["locality"],
                    "status": row["status"],
                    "submission_date": row["submission_date"],
                    "similarity_score": overall_score,
                    "is_high_confidence": overall_score >= 0.70,
                    "citizen_support_count": row["citizen_support_count"]
                })

    # Sort descending by similarity score
    matches.sort(key=lambda m: m["similarity_score"], reverse=True)
    return matches[:5]
