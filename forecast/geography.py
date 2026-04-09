from __future__ import annotations

TURKEY_MAINLAND_POLYGON = [
    (26.0, 40.8),
    (26.3, 40.0),
    (26.4, 39.3),
    (26.2, 38.6),
    (26.6, 37.8),
    (27.3, 36.8),
    (28.5, 36.2),
    (30.0, 36.0),
    (31.6, 36.2),
    (33.3, 36.0),
    (35.4, 36.0),
    (36.1, 36.6),
    (36.8, 36.7),
    (38.4, 36.6),
    (40.6, 37.1),
    (42.1, 37.2),
    (43.4, 37.6),
    (44.7, 39.3),
    (44.9, 40.5),
    (43.7, 41.9),
    (41.7, 41.6),
    (39.8, 41.8),
    (37.3, 41.7),
    (35.0, 41.8),
    (33.0, 41.5),
    (31.0, 41.3),
    (29.2, 41.1),
    (27.7, 41.2),
    (26.0, 40.8),
]


def point_in_polygon(lat: float, lon: float, polygon: list[tuple[float, float]]) -> bool:
    inside = False
    j = len(polygon) - 1
    for i, (lon_i, lat_i) in enumerate(polygon):
        lon_j, lat_j = polygon[j]
        intersects = ((lat_i > lat) != (lat_j > lat)) and (
            lon < (lon_j - lon_i) * (lat - lat_i) / ((lat_j - lat_i) or 1e-9) + lon_i
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def is_in_turkey_mainland(lat: float, lon: float) -> bool:
    if lat < 35.4 or lat > 42.6 or lon < 25.4 or lon > 45.1:
        return False
    return point_in_polygon(lat, lon, TURKEY_MAINLAND_POLYGON)


def classify_turkey_region(lat: float, lon: float) -> str:
    if lon < 28.5 and lat >= 39.0:
        return "marmara"
    if lon < 30.5 and lat < 39.0:
        return "ege"
    if 30.5 <= lon < 34.5 and lat < 38.8:
        return "akdeniz"
    if 34.5 <= lon < 39.5 and lat < 38.8:
        return "guneydogu"
    if lon >= 39.5 and lat < 39.3:
        return "dogu_anadolu"
    if lon >= 38.0 and lat >= 39.3:
        return "dogu_anadolu"
    if 28.5 <= lon < 34.5 and lat >= 39.0:
        return "ic_anadolu"
    return "karadeniz"
