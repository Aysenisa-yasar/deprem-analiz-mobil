from functools import lru_cache

from forecast.geography import classify_turkey_region, is_in_turkey_mainland


@lru_cache(maxsize=8)
def generate_turkey_grid(step=0.5):
    min_lat = 35.5
    max_lat = 42.5
    min_lon = 25.5
    max_lon = 45.0
    points = []
    lat = min_lat
    while lat <= max_lat:
        lon = min_lon
        while lon <= max_lon:
            rounded_lat = round(lat, 4)
            rounded_lon = round(lon, 4)
            if is_in_turkey_mainland(rounded_lat, rounded_lon):
                points.append(
                    {
                        "lat": rounded_lat,
                        "lon": rounded_lon,
                        "id": f"{round(lat, 2)}_{round(lon, 2)}",
                        "region": classify_turkey_region(rounded_lat, rounded_lon),
                    }
                )
            lon += step
        lat += step
    return points
