"""Build 15-minute counts from archived public CSVs; never expand missing minutes."""
from pathlib import Path
from collections import defaultdict
from datetime import datetime, timezone, timedelta
import csv
import gzip
import hashlib
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
KINDS = 'MSLT'


def metadata(raw):
    root = ET.fromstring(raw)
    for e in root.iter():
        e.tag = e.tag.split('}')[-1]
    result = {}
    for vd in root.iter('VD'):
        for link in vd.iter('DetectionLink'):
            result[vd.findtext('VDID') + ':' + link.findtext('LinkID')] = {
                'roadName': vd.findtext('RoadName'), 'bearing': link.findtext('Bearing'),
                'lanes': int(link.findtext('LaneNum')), 'actual': int(link.findtext('ActualLaneNum'))}
    return result


def aggregate(rows, links, day):
    groups = defaultdict(list)
    for r in rows:
        try:
            t = datetime.fromisoformat(r['data_collect_time'])
            if t.utcoffset() is None:
                continue
            t = t.astimezone(timezone(timedelta(hours=8)))
            if t.date().isoformat() != day or t.second or t.microsecond:
                continue
            minute = t.hour * 60 + t.minute
            if not 420 <= minute < 570:
                continue
            groups[(r['vdid'] + ':' + r['link_id'], minute)].append(r)
        except (ValueError, KeyError):
            continue
    result = {}
    for (key, minute), lane_rows in groups.items():
        meta = links.get(key)
        if not meta:
            continue
        item = result.setdefault(key, {**meta, 'periods': [dict(validMinutes=0, rejectedMinutes=0, volumes={k: 0 for k in KINDS}) for _ in range(10)]})
        slot = item['periods'][(minute - 420) // 15]
        lanes, valid = {}, meta['lanes'] > 0 and meta['lanes'] == meta['actual']
        for r in lane_rows:
            values = [r.get('vol_' + k, '') for k in KINDS]
            if r.get('status') != '0' or r.get('road') != meta['roadName'] or not re.fullmatch(r'\d+', r.get('lane_id', '')) or not all(re.fullmatch(r'\d+', v) for v in values):
                valid = False
                continue
            lane = int(r['lane_id'])
            counts = tuple(map(int, values))
            # Identical repeated polls count once; conflicting repeats invalidate the minute.
            if lane in lanes and lanes[lane] != counts:
                valid = False
            lanes[lane] = counts
        if not valid or len(lanes) != meta['lanes']:
            slot['rejectedMinutes'] += 1
            continue
        slot['validMinutes'] += 1
        for counts in lanes.values():
            for k, count in zip(KINDS, counts):
                slot['volumes'][k] += count
    return result


def build():
    output = {'schemaVersion': 1, 'source': 'Taipei public VDLive archived CSV',
              'sourceURL': 'https://tcgbusfs.blob.core.windows.net/blobtisv/VDLive.xml',
              'diagnostics': 'UNAVAILABLE', 'window': '07:00–09:30', 'sources': [], 'days': {}}
    for path in sorted((ROOT / 'dataset/csv').glob('*_vd.csv.gz')):
        day = path.name[:10]
        static = ROOT / 'dataset/static' / (day + '_VD.xml.gz')
        links = metadata(gzip.decompress(static.read_bytes()))
        with gzip.open(path, 'rt', encoding='utf-8-sig', newline='') as f:
            output['days'][day] = aggregate(csv.DictReader(f), links, day)
        for source in [path, static]:
            output['sources'].append({'path': str(source.relative_to(ROOT)), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()})
    dest = ROOT / 'web/data/period-flow.js'
    dest.write_text('window.NEIHU_PERIOD_FLOW=' + json.dumps(output, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print(json.dumps({'output': str(dest.relative_to(ROOT)), 'days': {d: len(v) for d, v in output['days'].items()}}))


if __name__ == '__main__':
    build()
