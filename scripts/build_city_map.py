"""Generate the map from the checked-in OSM GeoJSON (development dependency: shapely).

Run: python scripts/build_city_map.py
The application only consumes the generated JSON; no map service is called at runtime.
"""
import json
import math
from pathlib import Path

from shapely.geometry import Point, shape
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'frontend/src/assets'
WIDTH, HEIGHT = 346, 306
METERS_PER_DEGREE = math.pi * 6371008.8 / 180
LATITUDE = 47.0
X_FACTOR = METERS_PER_DEGREE * math.cos(math.radians(LATITUDE))


def build():
    source = json.loads((ASSETS / 'chisinau-sectors.geojson').read_text())
    def project(lon, lat, z=None):
        return (lon - 28.8) * X_FACTOR, -(lat - LATITUDE) * METERS_PER_DEGREE

    shapes = [(feature, transform(project, shape(feature['geometry']))) for feature in source['features']]
    city = unary_union([geometry for _, geometry in shapes])
    min_x, min_y, max_x, max_y = city.bounds
    scale = min((WIDTH - 42) / (max_x - min_x), (HEIGHT - 55) / (max_y - min_y))
    x_offset = (WIDTH - (max_x - min_x) * scale) / 2
    y_offset = 17

    def screen(x, y):
        return (x - min_x) * scale + x_offset, (y - min_y) * scale + y_offset

    sectors = []
    for feature, geometry in shapes:
        geometry = transform(screen, geometry)
        assert geometry.is_valid
        polygons = [geometry] if geometry.geom_type == 'Polygon' else list(geometry.geoms)
        paths = []
        for polygon in polygons:
            for ring in [polygon.exterior, *polygon.interiors]:
                paths.append('M' + 'L'.join(f'{x:.2f},{y:.2f}' for x, y in ring.coords) + 'Z')
        label = Point(screen(*project(*feature['properties']['label'])))
        if not geometry.contains(label):
            label = geometry.representative_point()
        dots = []
        for y in range(18, HEIGHT - 30, 4):
            for x in range(18, WIDTH - 18, 4):
                if geometry.contains(Point(x, y)):
                    dots.append([x, y])
        assert dots and geometry.contains(label)
        sectors.append({'id': feature['properties']['id'], 'path': ''.join(paths),
                        'dots': dots, 'label': [round(label.x, 2), round(label.y, 2)]})
    # Do not silently assign a grid point to two administrative sectors.
    positions = [tuple(dot) for sector in sectors for dot in sector['dots']]
    assert len(positions) == len(set(positions)), 'Overlapping sector geometry'
    places = json.loads((ASSETS / 'chisinau-places.geojson').read_text())
    neighborhoods = []
    for feature in places['features']:
        point = transform(project, shape(feature['geometry']))
        assert city.contains(point), f'{feature["properties"]["name"]} is outside city geometry'
        if feature['properties']['place'] == 'quarter':
            containing = [item['properties']['id'] for item, geometry in shapes if geometry.contains(point)]
            assert containing == ['centru'], 'Telecentru must lie in sectorul Centru'
            x, y = screen(point.x, point.y)
            neighborhoods.append({'name': feature['properties']['name'], 'sector': containing[0],
                                  'position': [round(x, 2), round(y, 2)]})
    result = {'width': WIDTH, 'height': HEIGHT, 'scaleBar': round(2000 * scale, 2),
              'sectors': sectors, 'neighborhoods': neighborhoods}
    (ASSETS / 'city-map.json').write_text(json.dumps(result, separators=(',', ':')) + '\n')
    print(f'Generated {len(positions)} geographically classified dots across {len(sectors)} sectors; 2 km = {result["scaleBar"]} SVG units')


if __name__ == '__main__':
    build()
