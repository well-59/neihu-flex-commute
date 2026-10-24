"""Keep named arterial geometry and bridges from OSM API extracts; no traffic inference."""
import datetime
import hashlib
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

BBOX = [121.550, 25.047, 121.623, 25.091]
NAMES = re.compile(r'^(民權大橋|成美橋|成功橋|麥帥一橋|麥帥二橋|民權東路[五六]段|堤頂大道[一二]段|環東大道|內湖路一段|成功路[二三四五]段|東湖路|文德路|金湖路|新明路|南京東路[五六]段|瑞光路|洲子街|瑞湖街|陽光街|港墘路|基湖路|舊宗路[一二]段|塔悠路|濱江街)$')
nodes, ways, relations, sources = {}, {}, {}, []
for filename in sys.argv[1:]:
    raw = pathlib.Path(filename).read_bytes()
    root = ET.fromstring(raw)
    assert root.tag == 'osm'
    bounds = root.find('bounds')
    sources.append({'file': pathlib.Path(filename).name, 'sha256': hashlib.sha256(raw).hexdigest(),
                    'bounds': bounds.attrib if bounds is not None else {},
                    'generator': root.get('generator'),
                    'sourceTimestamp': (root.find('meta').get('osm_base') if root.find('meta') is not None else None)})
    for n in root.findall('node'):
        nodes[n.get('id')] = [float(n.get('lon')), float(n.get('lat'))]
    for w in root.findall('way'):
        ways[w.get('id')] = w
    for relation in root.findall('relation'):
        relations[relation.get('id')] = relation

def inside(p):
    return BBOX[0] <= p[0] <= BBOX[2] and BBOX[1] <= p[1] <= BBOX[3]

features, kept = [], []
for wid, w in ways.items():
    tags = {t.get('k'): t.get('v') for t in w.findall('tag')}
    name = tags.get('name:zh') or tags.get('name', '')
    river = tags.get('waterway') == 'river' and '基隆' in name
    water = tags.get('natural') == 'water' and tags.get('water') == 'river'
    highway = tags.get('highway', '')
    main = bool(highway) and bool(NAMES.fullmatch(name)) and highway not in ['footway', 'path', 'cycleway', 'steps']
    background = highway in ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']
    refs = [n.get('ref') for n in w.findall('nd')]
    if not (river or water or main or background) or any(n not in nodes for n in refs):
        continue
    coords = [nodes[n] for n in refs]
    if len(coords) < 2 or not any(inside(p) for p in coords):
        continue
    bridge = tags.get('bridge', 'no') not in ['no', '0', 'false']
    props = {'osmId': wid, 'name': name, 'highway': highway, 'bridge': bridge,
             'layer': tags.get('layer', '0'), 'oneway': tags.get('oneway', 'no'),
             'tunnel': tags.get('tunnel', 'no'), 'nodeRefs': refs, 'tags': tags,
             **{key: tags[key] for key in ['access', 'vehicle', 'motor_vehicle', 'motorcar', 'motorcycle',
                  'oneway:motorcycle', 'oneway:motor_vehicle', 'oneway:conditional', 'junction'] if key in tags},
             'kind': 'water' if water else 'river' if river else 'bridge' if bridge else 'road',
             'focus': main, 'timestamp': w.get('timestamp'), 'source': 'https://www.openstreetmap.org/way/' + wid}
    closed = coords[0] == coords[-1] and len(coords) >= 4
    geom = {'type': 'Polygon', 'coordinates': [coords]} if water and closed else {'type': 'LineString', 'coordinates': coords}
    features.append({'type': 'Feature', 'id': wid, 'properties': props, 'geometry': geom})
    kept.append((w, refs, tags))

assert all(any(f['properties']['name'] == name and f['properties']['bridge'] for f in features)
           for name in ['民權大橋', '成美橋', '成功橋']), 'Required bridge geometry missing'
kept_way_ids = {w.get('id') for w, _, _ in kept}
restrictions = []
for rid, relation in relations.items():
    tags = {t.get('k'): t.get('v') for t in relation.findall('tag')}
    if tags.get('type') != 'restriction':
        continue
    members = [dict(m.attrib) for m in relation.findall('member')]
    way_refs = [m['ref'] for m in members if m['type'] == 'way']
    if not way_refs or not all(ref in kept_way_ids for ref in way_refs):
        continue
    restrictions.append({'osmId': rid, 'tags': tags, 'members': members,
                         'source': 'https://www.openstreetmap.org/relation/' + rid})
out = pathlib.Path(__file__).resolve().parents[1] / 'web/data'
previous_path = out / 'neihu-road-network.js'
previous = json.loads(previous_path.read_text().split(' = ', 1)[1].rstrip(';\n')) if previous_path.exists() else {}
old_provenance = previous.get('provenance', {})
same_sources = old_provenance.get('sources') == sources
payload = {'type': 'FeatureCollection', 'bbox': BBOX,
           'provenance': {'source': 'https://www.openstreetmap.org',
                          'endpoints': ['https://api.openstreetmap.org/api/0.6/map', 'https://overpass-api.de/api/interpreter'],
                          'retrievedAt': old_provenance.get('retrievedAt') if same_sources else None,
                          'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                          'attribution': '© OpenStreetMap contributors', 'license': 'https://www.openstreetmap.org/copyright',
                          'sources': sources, 'note': 'Road geometry only; no routing or traffic coverage inferred.'},
           'features': features, 'restrictions': restrictions}
(out / 'neihu-road-network.js').write_text('window.NEIHU_ROADS = ' + json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ';\n')
snapshot = ET.Element('osm', {'version': '0.6', 'generator': 'neihu-road-network-extract',
                            'copyright': 'OpenStreetMap contributors', 'license': 'https://www.openstreetmap.org/copyright'})
restriction_node_refs = {m['ref'] for r in restrictions for m in r['members'] if m['type'] == 'node'}
for nid in sorted({n for _, refs, _ in kept for n in refs} | restriction_node_refs):
    ET.SubElement(snapshot, 'node', {'id': nid, 'lon': str(nodes[nid][0]), 'lat': str(nodes[nid][1])})
for w, refs, tags in kept:
    dst = ET.SubElement(snapshot, 'way', {k: w.attrib[k] for k in ['id', 'version', 'timestamp'] if k in w.attrib})
    for nid in refs:
        ET.SubElement(dst, 'nd', {'ref': nid})
    for key, val in tags.items():
        ET.SubElement(dst, 'tag', {'k': key, 'v': val})
for relation in restrictions:
    dst = ET.SubElement(snapshot, 'relation', {'id': relation['osmId']})
    for member in relation['members']:
        ET.SubElement(dst, 'member', member)
    for key, val in relation['tags'].items():
        ET.SubElement(dst, 'tag', {'k': key, 'v': val})
ET.ElementTree(snapshot).write(out / 'neihu-roads.osm', encoding='utf-8', xml_declaration=True)
print(json.dumps({'features': len(features), 'namedBridges': sorted({f['properties']['name'] for f in features if f['properties']['kind'] == 'bridge' and f['properties']['focus']})}, ensure_ascii=False))
