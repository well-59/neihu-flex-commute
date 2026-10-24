import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('period_flow', Path(__file__).resolve().parents[1] / 'scripts/export-period-flow.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
META = {'vd:link': dict(roadName='路', bearing='E', lanes=2, actual=2)}


def row(lane='0', time='07:00', count='2', **kwargs):
    return dict(data_collect_time=f'2026-10-22T{time}:00+08:00', vdid='vd', link_id='link', road='路', status='0', lane_id=lane, vol_M=count, vol_S='3', vol_L='0', vol_T='0', **kwargs)


class PeriodTests(unittest.TestCase):
    def result(self, rows):
        return m.aggregate(rows, META, '2026-10-22')['vd:link']['periods']

    def test_boundary_source_time_and_duplicate_poll_not_expanded(self):
        a, b = row(), row('1')
        r = self.result([a, b, a, b, row(time='07:15'), row('1', time='07:15'), row(time='09:30'), row('1', time='09:30')])
        self.assertEqual(r[0]['validMinutes'], 1)
        self.assertEqual(r[0]['volumes'], dict(M=4, S=6, L=0, T=0))
        self.assertEqual(r[1]['validMinutes'], 1)
        self.assertEqual(sum(p['validMinutes'] for p in r), 2)

    def test_invalid_minute_excluded_not_partial_lane_sum(self):
        for bad in [dict(vol_M=''), dict(vol_M='-1'), dict(vol_M='1.5'), dict(status='1'), dict(road='別路')]:
            a = row('1'); a.update(bad)
            r = self.result([row(), a])[0]
            self.assertEqual(r['validMinutes'], 0)
            self.assertEqual(r['rejectedMinutes'], 1)
        self.assertEqual(self.result([row()])[0]['validMinutes'], 0)
        self.assertEqual(self.result([row(), row('1'), row(count='7')])[0]['validMinutes'], 0)

    def test_zero_is_valid_and_missing_is_not_zero(self):
        rows = [row(), row('1')]
        for r in rows:
            for k in 'MSLT':
                r['vol_' + k] = '0'
        p = self.result(rows)
        self.assertEqual(p[0]['validMinutes'], 1)
        self.assertEqual(sum(p[0]['volumes'].values()), 0)
        self.assertEqual(p[1]['validMinutes'], 0)

    def test_wrong_date_and_unknown_id_not_used(self):
        a = row(); a['data_collect_time'] = '2026-10-23T07:00:00+08:00'
        b = row(); b['vdid'] = 'other'
        self.assertEqual(m.aggregate([a, b], META, '2026-10-22'), {})


if __name__ == '__main__':
    unittest.main()
