"""Read public Taipei feeds; keep observations separate from historical geometry.

No credentials or third-party packages. --report writes the coverage inventory;
the preview server calls this without arguments for an on-demand live snapshot.
"""
import argparse
import concurrent.futures
import csv
from datetime import datetime, timezone
import gzip
import hashlib
import json
import math
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://tcgbusfs.blob.core.windows.net/blobtisv/'
FEEDS = {'VD': ('VDList', 'VD'), 'VDLive': ('VDLiveList', 'VDLive'),
         'Section': ('SectionList', 'Section'), 'LiveTraffic': ('LiveTrafficList', 'LiveTraffic')}
BBOX = [121.555, 25.040, 121.640, 25.100]


def number(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def inside(lat, lon):
    return lat is not None and lon is not None and BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]


def time_state(timestamp, now):
    try:
        value = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        if value.tzinfo is None:
            return 'missing'
        age = (datetime.fromisoformat(now) - value).total_seconds()
        return 'future' if age < -90 else 'stale' if age > 180 else 'fresh'
    except (AttributeError, TypeError, ValueError):
        return 'missing'


def parse_feed(raw, name):
    root = ET.fromstring(raw)
    for node in root.iter():
        node.tag = node.tag.rsplit('}', 1)[-1]
    if root.tag != FEEDS[name][0]:
        raise ValueError('Unexpected root: ' + root.tag)
    rows = root.findall('.//' + FEEDS[name][1])
    if not rows:
        raise ValueError('Empty feed')
    return root, rows


def indexed(rows, key):
    result = {}
    for row in rows:
        result.setdefault(row.findtext(key), []).append(row)
    return result


def one(index, key):
    items = index.get(key, [])
    return items[0] if len(items) == 1 else None


def lane_metrics(flow, expected, actual):
    """Conservative structural screening; missing diagnostic flags are disclosed."""
    lanes = flow.findall('./Lanes/Lane')
    reasons = []
    if not lanes or expected is None or len(lanes) != expected:
        reasons.append('車道數不符或未知')
    if actual is not None and actual != expected:
        reasons.append('偵測與實際車道數不符')
    ids = [lane.findtext('LaneID') for lane in lanes]
    if None in ids or len(ids) != len(set(ids)):
        reasons.append('車道編號缺少或重複')
    volumes = {kind: 0 for kind in 'MSLT'}
    seen = {kind: 0 for kind in 'MSLT'}
    weighted = total = 0
    speed_valid = True
    for lane in lanes:
        if any('Error' in node.tag for node in lane.iter()):
            reasons.append('來源新增診斷欄位；語意待核對')
        vehicles = lane.findall('./Vehicles/Vehicle')
        kinds = [v.findtext('VehicleType') for v in vehicles]
        if not vehicles or len(kinds) != len(set(kinds)) or any(k not in volumes for k in kinds):
            reasons.append('車種缺少、重複或未知')
        lane_volume = 0
        for vehicle in vehicles:
            kind, volume = vehicle.findtext('VehicleType'), number(vehicle.findtext('Volume'))
            if volume is None or volume < 0 or not volume.is_integer():
                reasons.append('流量無效')
                continue
            if kind in volumes:
                volumes[kind] += int(volume)
                seen[kind] += 1
                lane_volume += volume
        speed = number(lane.findtext('Speed'))
        if lane_volume > 0:
            if speed is None or speed <= 0 or speed > 200:
                speed_valid = False
            else:
                weighted += speed * lane_volume
            total += lane_volume
    # Omitted types are UNKNOWN, never converted to zero or assumed unsupported.
    kinds_complete = all(count == len(lanes) for count in seen.values())
    if not kinds_complete:
        reasons.append('分車種欄位不完整；不補零')
    valid = not reasons
    return dict(basicValid=valid, reasons=sorted(set(reasons)), laneCount=len(lanes),
                volumes=volumes if valid else None,
                totalVolume=sum(volumes.values()) if valid else None,
                speed=weighted / total if valid and speed_valid and total > 0 else None,
                speedBasis='同方向車道速度按分鐘車流量加權；不是分車種速度',
                diagnostics='UNAVAILABLE', occupancyAvailable=all(number(l.findtext('Occupancy')) is not None for l in lanes))


def build_snapshot(feeds, sources, now):
    history = json.loads((ROOT / 'web/data/route-clarity.json').read_text())
    old = {(d['vdId'], d['linkId']): d for d in history['directions']}
    vd_index = indexed(feeds.get('VDLive', []), 'VDID')
    vd_static = indexed(feeds.get('VD', []), 'VDID')
    section_index = indexed(feeds.get('LiveTraffic', []), 'SectionID')
    section_static = indexed(feeds.get('Section', []), 'SectionID')
    rows, sections = [], []
    for vd in feeds.get('VD', []):
        lat, lon = number(vd.findtext('PositionLat')), number(vd.findtext('PositionLon'))
        if not inside(lat, lon):
            continue
        vd_id = vd.findtext('VDID')
        live = one(vd_index, vd_id)
        flows = indexed(live.findall('./LinkFlows/LinkFlow'), 'LinkID') if live is not None else {}
        for link in vd.findall('./DetectionLinks/DetectionLink'):
            link_id = link.findtext('LinkID')
            flow = one(flows, link_id)
            prior = old.get((vd_id, link_id))
            metrics = lane_metrics(flow, number(link.findtext('LaneNum')), number(link.findtext('ActualLaneNum'))) if flow is not None else dict(basicValid=False, reasons=['缺少或重複分鐘觀測'], volumes=None, totalVolume=None, speed=None, diagnostics='UNAVAILABLE')
            if live is not None and live.findtext('Status') != '0':
                metrics['basicValid'] = False
                metrics['reasons'].append('設備狀態異常')
            if len(vd_static.get(vd_id, [])) != 1:
                metrics['basicValid'] = False
                metrics['reasons'].append('重複設備靜態資料')
            static_version, live_version = sources.get('VD', {}).get('linkVersion'), sources.get('VDLive', {}).get('linkVersion')
            if static_version != live_version or not static_version:
                metrics['basicValid'] = False
                metrics['reasons'].append('靜動態路段版本不符或未知')
            rows.append(dict(id=f'{vd_id}:{link_id}', vdId=vd_id, linkId=link_id,
                             roadName=vd.findtext('RoadName'), bearing=link.findtext('Bearing'),
                             roadDirection=link.findtext('RoadDirection'),
                             position=dict(lat=lat, lon=lon), laneCount=number(link.findtext('LaneNum')),
                             actualLaneCount=number(link.findtext('ActualLaneNum')),
                             dataCollectTime=live.findtext('DataCollectTime') if live is not None else None,
                             status=live.findtext('Status') if live is not None else None,
                             historicalMatch=prior is not None,
                             historicalSectionId=prior.get('geometry', {}).get('sectionId') if prior else None,
                             **{k: v for k, v in metrics.items() if k != 'laneCount'}))
    for section in feeds.get('Section', []):
        points = [(number(section.findtext(p + '/PositionLat')), number(section.findtext(p + '/PositionLon'))) for p in ['SectionStart', 'SectionEnd']]
        if not any(inside(*p) for p in points):
            continue
        sid = section.findtext('SectionID')
        live = one(section_index, sid)
        speed = number(live.findtext('TravelSpeed')) if live is not None else None
        travel_time = number(live.findtext('TravelTime')) if live is not None else None
        section_sources = {e.tag: e.text for e in live.findall('./DataSources/*')} if live is not None else {}
        # Historical-only estimates must not be promoted to current sensor observations.
        sensor_backed = any(section_sources.get(k) == '1' for k in ['HasVD', 'HasAVI', 'HasETAG', 'HasGVP', 'HasCVP'])
        valid = speed is not None and 0 < speed <= 200 and len(section_static.get(sid, [])) == 1 and sensor_backed
        sections.append(dict(sectionId=sid, name=section.findtext('SectionName'), roadName=section.findtext('RoadName'),
                             bearing=section.findtext('RoadDirection'), start=list(reversed(points[0])), end=list(reversed(points[1])),
                             speed=speed, travelTime=travel_time if travel_time is not None and travel_time > 0 else None,
                             congestionLevel=live.findtext('CongestionLevel') if live is not None else None,
                             congestionLevelId=live.findtext('CongestionLevelID') if live is not None else None,
                             dataCollectTime=live.findtext('DataCollectTime') if live is not None else None,
                             basicValid=valid, dataSources=section_sources))
    for row in rows:
        row['timeStateAtFetch'] = time_state(row['dataCollectTime'], now)
        row['usableAtFetch'] = row['basicValid'] and row['timeStateAtFetch'] == 'fresh'
    current = {r['id'] for r in rows}
    return dict(schemaVersion=1, fetchedAt=now, source='TAIPEI_OPEN_DATA', bbox=BBOX,
                scope='內湖與橋梁接近道路矩形範圍；不是行政區或完整入園邊界',
                staleAfterSeconds=180, intervalSeconds=60, sources=sources, rows=rows, sections=sections,
                historicalMissing=[d['id'] for d in history['directions'] if d['id'] not in current],
                limitations=['單次快照不是晨峰完整度或政策成效', '未提供逐車道診斷旗標；僅設備、結構、數值基本檢查',
                             '速度是車道加權或官方路段速度，不是機車專屬速度', '時間戳區間起訖待官方確認',
                             'Section 以起點或終點落入範圍篩選，可能漏掉穿越範圍的長路段',
                             '圖中動畫只使用既有幾何與相同設備／LinkID／方向對照；新增設備仍需補圖資'])


def collect(prefix=None, cache=ROOT / 'data/monitoring'):
    sources, feeds = {}, {}
    cache.mkdir(parents=True, exist_ok=True)
    def fetch(name):
        url = BASE + name + '.xml'
        try:
            if prefix:
                raw = Path(prefix + name + '.xml').read_bytes()
            else:
                request = urllib.request.Request(url, headers={'User-Agent': 'NeihuTrafficMonitoring/1.0'})
                with urllib.request.urlopen(request, timeout=20) as response:
                    raw = response.read(20_000_001)
                if len(raw) > 20_000_000:
                    raise ValueError('Feed size limit exceeded')
            root, rows = parse_feed(raw, name)
            digest = hashlib.sha256(raw).hexdigest()
            (cache / (name + '.xml.gz')).write_bytes(gzip.compress(raw))
            return name, rows, dict(url=url, status='PARSED', fetchedAt=datetime.now(timezone.utc).isoformat(),
                                   inputMode='LOCAL_CAPTURE' if prefix else 'NETWORK', updateTime=root.findtext('UpdateTime'),
                                   updateInterval=number(root.findtext('UpdateInterval')), linkVersion=root.findtext('LinkVersion'),
                                   count=len(rows), sha256=digest)
        except Exception as error:
            return name, [], dict(url=url, status='FAILED', error=type(error).__name__ + ': ' + str(error))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for name, rows, source in pool.map(fetch, FEEDS):
            feeds[name], sources[name] = rows, source
    result = build_snapshot(feeds, sources, datetime.now(timezone.utc).isoformat())
    (cache / 'latest.json').write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    return result


def report(result):
    target = ROOT / 'docs'
    (target / 'MONITORING-INVENTORY.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    fields = ['roadName', 'roadDirection', 'bearing', 'vdId', 'linkId', 'dataCollectTime', 'basicValid', 'timeStateAtFetch', 'usableAtFetch', 'historicalMatch', 'status', 'laneCount', 'actualLaneCount', 'totalVolume', 'speed', 'reasons']
    with (target / 'MONITORING-INVENTORY.csv').open('w', encoding='utf-8-sig', newline='') as file:
        writer = csv.DictWriter(file, fields, extrasaction='ignore', lineterminator='\n')
        writer.writeheader()
        for row in result['rows']:
            writer.writerow({**row, 'reasons': '；'.join(row['reasons'])})
    history = json.loads((ROOT / 'web/data/route-clarity.json').read_text())
    rows, old = result['rows'], history['directions']
    def counts(items):
        return [len({r['vdId'] for r in items}), len(items), len({r['linkId'] for r in items}), len({r['roadName'] for r in items})]
    lines = ['# 內湖道路監控來源與設備盤點', '',
             f"盤點產生：{result['fetchedAt']}。來源觀測更新：{result['sources'].get('VDLive', {}).get('updateTime', 'UNKNOWN')}。",
             '', '**FACT：這是單次官方來源回傳的盤點，不是全天有效率，也不是完整內湖監控覆蓋。**',
             '範圍沿用既有收集器：經度 121.555–121.640、緯度 25.040–25.100，包含部分松山、信義、南港接近道路。', '',
             '| 資料 | VD 設備 | 設備×LinkID 方向 | 不重複 LinkID | 道路名稱 |',
             '|---|---:|---:|---:|---:|',
             '| 本次公開來源 | '+' | '.join(map(str, counts(rows)))+' |',
             '| 既有歷史快照 | '+' | '.join(map(str, counts(old)))+' |', '',
             f"本次另有 {len(result['sections'])} 個官方發布 SectionID；它與 VD 的 LinkID 是不同口徑，不相加。",
             f"{sum(r['basicValid'] for r in rows)} 個設備方向通過本次結構與設備基本檢查，尚須檢查觀測時間才能當即時資料。",
             f"其中 {sum(r.get('usableAtFetch', False) for r in rows)} 個方向在接收當下也通過 180 秒時效檢查；這是單次可用數，不是長期完整度。",
             f"{sum(not r['historicalMatch'] for r in rows)} 個設備方向未見於既有快照，不自動套用鄰近路段幾何。", '',
             '## 實際收集的來源', '',
             '| 來源 | 介接位置 | 解析結果 | 全市筆數 | 來源更新時間 |', '|---|---|---|---:|---|']
    for name, source in result['sources'].items():
        lines.append(f"| {name} | [{name}.xml]({source['url']}) | {source['status']} | {source.get('count', '—')} | {source.get('updateTime', '—')} |")
    lines += ['', '- 公開 XML 來源：[臺北市 VD 靜態資料集](https://data.taipei/dataset/detail?id=47cb9090-e1c9-4b1d-b299-b11c375c5ee2)。四個 URL 也已存在本專案 `collector/collect.mjs`。',
              '- 歷史資料：隊友 TDX 彙整快照，日期 2026-09-23–10-22、07:00–09:30，56 設備／84 方向；原始分鐘檔未隨快照提供。[既有 API 清單](TDX-API-CATALOG.md)。',
              '- 地圖：OSM 道路模型與既有 TDX 路段線形。549 道路圖徵／400 動畫路徑是圖資與展示數量，不是監控設備或實測路段數。',
              '- 本次即時來源是臺北市公開 XML，未登入呼叫 TDX；兩個平台可能共用上游資料，不能算獨立驗證。', '',
              '## 本次 VD 道路清單', '', '| 道路名稱 | VD 設備 | 設備方向 | LinkID | 基本檢查通過 |', '|---|---:|---:|---:|---:|']
    for road in sorted({r['roadName'] for r in rows}):
        items = [r for r in rows if r['roadName'] == road]
        c = counts(items)
        lines.append(f"| {road} | {c[0]} | {c[1]} | {c[2]} | {sum(r['basicValid'] for r in items)} |")
    lines += ['', '## 本次官方發布路段', '', '| 道路 | SectionID 數 |', '|---|---:|']
    for road in sorted({s['roadName'] for s in result['sections']}):
        lines.append(f"| {road} | {sum(s['roadName'] == road for s in result['sections'])} |")
    lines += ['', '本次公開 Section 清單在範圍內以快速道路為主，不等於 TDX 歷史快照的全部市區發布路段。不可宣稱一般市區路段都有官方旅行時間；缺少時只顯示 VD 點位加權速度。', '',
              '## 原本歷史統計的道路', '', '、'.join(sorted({r['roadName'] for r in old}))+'。', '',
              '## 已發現的缺口', '', '既有快照中以下設備方向未見於本次範圍靜態清單；原因 UNKNOWN，不直接認定已拆除：', '']
    lines += ['- `'+rid+'`' for rid in result['historicalMissing']]
    lines += ['', '- 三條走廊仍需區分測點：民權東路六段不是民權大橋橋上；新明路不是成美橋橋上；堤頂單一測點不代表整條走廊。',
              '- 分車種欄位 M/S/L/T 已取得，不補缺值為零；M=0 不證明設備完整偵測機車。',
              f"- 2026-10-24 欄位修正：先前 bearing 使用 RoadDirection，現改保留 Bearing（路段方位）與 roadDirection（道路方向）兩欄；本批 {sum(r.get('bearing') != r.get('roadDirection') for r in rows)} 個方向兩者不同，其中 23 筆屬於既有歷史對照。依官方 VD 靜態定義區分，不能混用。來源：https://thbapp.thb.gov.tw/opendata/vdinfo.aspx 。",
              '- 公開 VDLive 沒有逐車道 ErrorDiags／ErrorType。本版只做設備狀態、車道數、重複、分車種與數值基本檢查，不能沿用歷史版的完整驗證宣稱。',
              '- 速度色帶為展示規則：≤15、15–30、>30 km/h；不是跨道路通用的官方壅塞分級。',
              '- 動畫疏密依各車種分鐘量 1–10、11–30、>30 分三級；汽車類合併 S/L/T。模型台數不等於實測車數，未校準排隊長度。',
              '- 動畫速度依採用的路段或 VD 速度，以統一 4 倍時間播放；汽機車沿用同一速度，不稱機車專屬速度。',
              '- 超過 180 秒、未來超過 90 秒、缺觀測時間或未通過基本檢查者不播放；畫面每 15 秒重判時效、每 60 秒查詢，離開即停止，後端合併並行請求與 60 秒快取。', '',
              '## 待擴充來源（未完成串接）', '',
              '| 類型 | 官方位置 | 本輪狀態 |', '|---|---|---|',
              '| CCTV | [臺北市介接說明](https://bote.gov.taipei/cp.aspx?n=8B8FFEA8353857B5) | 申請條件已查；未下載影像、未做 AI 辨識 |',
              '| AVI／eTag／CMS | [公路局清單](https://thbapp.thb.gov.tw/opendata/) | 供應類型已查；內湖覆蓋 UNVERIFIED |',
              '| 國道流量／旅行時間 | [高公局資料清單](https://www.freeway.gov.tw/download.aspx?UID=25&i=14) | M03A／M04A／M05A 已確認文件；未接入 |',
              '| 事故／施工／管制 | [臺北市交通網功能](https://its.taipei.gov.tw/Help/cht/Help/Help.htm) | 功能已查；事件 API 與內湖有效資料 UNVERIFIED |', '',
              '## 重現與保存', '',
              '`python3 scripts/monitoring-snapshot.py --report` 下載最新四份官方 XML，產生本清單、[逐方向 CSV](MONITORING-INVENTORY.csv)、[完整 JSON](MONITORING-INVENTORY.json)。',
              '原始來源 gzip 與 latest.json 保存在 Git 排除的 `data/monitoring/`，只保留最近一批；JSON 保留來源時間、版本與 SHA-256。`--input-prefix` 僅供既存本機抓取檔的重現，標記 LOCAL_CAPTURE，不作線上資料來源。',
              '本機服務 `/api/monitoring` 使用相同解析與基本檢查。單檔展示不呼叫 API，需開啟原專案服務才能即時監控。', '']
    (target / 'MONITORING-INVENTORY.md').write_text('\n'.join(lines))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input-prefix', help='Audit an existing local capture; never used by the live server')
    parser.add_argument('--report', action='store_true')
    args = parser.parse_args()
    snapshot = collect(args.input_prefix)
    if args.report:
        report(snapshot)
    print(json.dumps(snapshot, ensure_ascii=False))
