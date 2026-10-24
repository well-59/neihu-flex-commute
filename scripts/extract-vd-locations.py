"""Extract the six VD records without inventing road or bridge coverage."""
import hashlib
import json
import pathlib
import sys
import xml.etree.ElementTree as ET

source = pathlib.Path(sys.argv[1]).read_bytes()
root = ET.fromstring(source)
ns = {'t': root.tag.split('}')[0][1:]}
ids = dict(zip(['VQBUL20', 'VRHT600', 'V6330G5', 'VTXQJ20', 'VQ6WK40', 'VMSV820'],
               ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']))
selected = ET.Element('SelectedVDRecords', {'source': 'https://tcgbusfs.blob.core.windows.net/blobtisv/VD.xml'})
records = []
for vd in root.findall('.//t:VD', ns):
    get = lambda key: vd.findtext('t:' + key, namespaces=ns)
    if get('VDID') not in ids:
        continue
    selected.append(vd)
    records.append({'gate': ids[get('VDID')], 'id': get('VDID'), 'road': get('RoadName'),
                    'lon': float(get('PositionLon')), 'lat': float(get('PositionLat')),
                    'directions': [d.text for d in vd.findall('.//t:RoadDirection', ns)]})
assert len(records) == 6, 'All six VD records must exist'
payload = {'source': selected.attrib['source'], 'updateTime': root.findtext('t:UpdateTime', namespaces=ns),
           'sourceSha256': hashlib.sha256(source).hexdigest(), 'records': records}
out = pathlib.Path(__file__).resolve().parents[1] / 'web/data'
(out / 'vd-locations.js').write_text('window.VD_LOCATIONS = ' + json.dumps(payload, ensure_ascii=False) + ';\n')
ET.ElementTree(selected).write(out / 'vd-static-selected.xml', encoding='utf-8', xml_declaration=True)
print('Extracted six official VD locations; corridor coverage still requires review.')
