import importlib.util
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location('monitor', Path(__file__).resolve().parents[1] / 'scripts/monitoring-snapshot.py')
monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)


def flow(volumes=(2, 3, 0, 0), speed='30'):
    vehicles = ''.join(f'<Vehicle><VehicleType>{kind}</VehicleType><Volume>{volume}</Volume></Vehicle>' for kind, volume in zip('MSLT', volumes))
    return ET.fromstring(f'<LinkFlow><Lanes><Lane><LaneID>0</LaneID><Speed>{speed}</Speed><Vehicles>{vehicles}</Vehicles></Lane></Lanes></LinkFlow>')


class QualityTests(unittest.TestCase):
    def test_mixed_speed_is_weighted_and_not_a_motorcycle_speed(self):
        result = monitor.lane_metrics(flow(), 1, 1)
        self.assertTrue(result['basicValid'])
        self.assertEqual(result['speed'], 30)
        self.assertEqual(result['volumes']['M'], 2)
        self.assertEqual(result['diagnostics'], 'UNAVAILABLE')

    def test_empty_zero_negative_and_missing_are_distinct(self):
        zero = monitor.lane_metrics(flow((0, 0, 0, 0), '0'), 1, 1)
        self.assertTrue(zero['basicValid'])
        self.assertEqual(zero['totalVolume'], 0)
        self.assertIsNone(zero['speed'])
        for volumes in [(0, -99, 0, 0), (0, 1.2, 0, 0), (0, 'NaN', 0, 0), (2, 3)]:
            result = monitor.lane_metrics(flow(volumes), 1, 1)
            self.assertFalse(result['basicValid'])
            self.assertIsNone(result['volumes'])

    def test_lane_count_duplicates_and_bad_speed(self):
        self.assertFalse(monitor.lane_metrics(flow(), 2, 2)['basicValid'])
        self.assertFalse(monitor.lane_metrics(flow(), 1, 2)['basicValid'])
        duplicate = flow()
        duplicate.find('./Lanes/Lane/Vehicles').append(ET.fromstring('<Vehicle><VehicleType>M</VehicleType><Volume>1</Volume></Vehicle>'))
        self.assertFalse(monitor.lane_metrics(duplicate, 1, 1)['basicValid'])
        self.assertIsNone(monitor.lane_metrics(flow(speed='-99'), 1, 1)['speed'])

    def test_namespace_and_invalid_feed(self):
        root, rows = monitor.parse_feed(b'<VDList xmlns="urn:test"><VDs><VD><VDID>A</VDID></VD></VDs></VDList>', 'VD')
        self.assertEqual(rows[0].findtext('VDID'), 'A')
        for raw in [b'<html>error</html>', b'<VDList/>']:
            with self.assertRaises(ValueError):
                monitor.parse_feed(raw, 'VD')

    def test_freshness_and_new_diagnostic_schema_fail_closed(self):
        now = '2026-10-24T03:20:00+00:00'
        self.assertEqual(monitor.time_state('2026-10-24T11:19:00+08:00', now), 'fresh')
        self.assertEqual(monitor.time_state('2026-10-24T11:16:00+08:00', now), 'stale')
        self.assertEqual(monitor.time_state('2026-10-24T11:30:00+08:00', now), 'future')
        self.assertEqual(monitor.time_state('2026-10-24T11:19:00', now), 'missing')
        self.assertEqual(monitor.time_state(None, now), 'missing')
        changed = flow()
        changed.find('./Lanes/Lane').append(ET.fromstring('<ErrorType>new-diagnostic</ErrorType>'))
        self.assertFalse(monitor.lane_metrics(changed, 1, 1)['basicValid'])

    def test_public_bearing_and_road_direction_are_not_interchangeable(self):
        static = ET.fromstring('<VD><VDID>V6121A0</VDID><RoadName>堤頂大道</RoadName><PositionLat>25.07</PositionLat><PositionLon>121.58</PositionLon><DetectionLinks><DetectionLink><LinkID>2000700100400A</LinkID><Bearing>W</Bearing><RoadDirection>N</RoadDirection><LaneNum>1</LaneNum><ActualLaneNum>1</ActualLaneNum></DetectionLink></DetectionLinks></VD>')
        result = monitor.build_snapshot({'VD': [static]}, {'VD': {'linkVersion': 'v'}, 'VDLive': {'linkVersion': 'v'}}, '2026-10-24T03:20:00+00:00')
        self.assertEqual(result['rows'][0]['bearing'], 'W')
        self.assertEqual(result['rows'][0]['roadDirection'], 'N')
        self.assertFalse(result['rows'][0]['basicValid'])


if __name__ == '__main__':
    unittest.main()
