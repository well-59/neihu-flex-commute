/* Internal consistency diagnostics, not a traffic calibration or validation. */
(function(root) {
  'use strict';
  const queue = typeof module !== 'undefined' && module.exports
    ? require('./negotiation-model.js').queue : root.Negotiation.queue;
  const EPS = 1e-8;
  const sum = values => values.reduce((a, b) => a + b, 0);
  function audit(data) {
    if (!data || data.meta?.slotMinutes !== 15 || !Array.isArray(data.slots) || !data.slots.length ||
        !Array.isArray(data.gates) || !data.gates.length || !Array.isArray(data.meta.days) || !data.meta.days.length) {
      throw new Error('Baseline audit requires nonempty days, gates and 15-minute slots.');
    }
    if (new Set(data.gates.map(g => g.id)).size !== data.gates.length ||
        new Set(data.meta.days).size !== data.meta.days.length) throw new Error('Duplicate gate or day in baseline audit.');
    const gates = [];
    for (const day of data.meta.days) for (const gate of data.gates) {
      const arrivals = data.days?.[day]?.[gate.id];
      const waits = data.measured?.[day]?.[gate.id]?.wait;
      if (!Number.isFinite(gate.capacity) || gate.capacity <= 0 ||
          !Array.isArray(arrivals) || !Array.isArray(waits) ||
          arrivals.length !== data.slots.length || waits.length !== data.slots.length ||
          [...arrivals, ...waits].some(v => !Number.isFinite(v) || v < 0)) {
        throw new Error(`Invalid baseline inputs for ${day}/${gate.id}; missing values are not zero.`);
      }
      // This is exactly the production point-queue baseline, with its zero initial queue.
      // It is deliberately not reset to the inferred target when the two diverge.
      const baseline = queue(arrivals, gate.capacity);
      const rows = data.slots.map((time, i) => {
        const targetQueue = waits[i] * gate.capacity / 15;
        const baselineQueue = baseline.rows[i].queue;
        const error = baselineQueue - targetQueue;
        // Necessary bound under a hypothetical consistent inversion: rounding each
        // arrival to an integer can propagate at most 0.5 vehicles per interval.
        // max(0, q + arrival - capacity) is nonexpansive in q. Also allow the
        // reported wait's 0.005-minute error (two decimal places). The current
        // generator actually inverts the rounded wait, so this extra allowance is
        // conservative. Passing this bound never establishes the error's cause.
        const arrivalRoundingBound = 0.5 * (i + 1);
        const targetReportingBound = 0.005 * gate.capacity / 15;
        const roundingOnlyTolerance = arrivalRoundingBound + targetReportingBound;
        return { time, intervalIndex: i, waitMinutes: waits[i], arrival: arrivals[i],
          targetQueue, baselineQueue, error, absoluteError: Math.abs(error),
          arrivalRoundingBound, targetReportingBound, roundingOnlyTolerance,
          exceedsRoundingTolerance: Math.abs(error) > roundingOnlyTolerance + EPS };
      });
      const failures = rows.filter(r => r.exceedsRoundingTolerance);
      const maxAbsoluteError = Math.max(...rows.map(r => r.absoluteError));
      const status = failures.length ? 'INCONSISTENT' : maxAbsoluteError > EPS
        ? 'ROUNDING_COMPATIBLE_NOT_VALIDATED' : 'CONSISTENT_NOT_VALIDATED';
      gates.push({ day, gateId: gate.id, name: gate.name, capacity: gate.capacity,
        initialQueue: 0, status, mae: sum(rows.map(r => r.absoluteError)) / rows.length,
        maxAbsoluteError, exceedsRoundingCount: failures.length,
        maximumTargetQueue: Math.max(...rows.map(r => r.targetQueue)),
        maximumBaselineQueue: Math.max(...rows.map(r => r.baselineQueue)), rows });
    }
    const inconsistent = gates.filter(g => g.status === 'INCONSISTENT').length;
    const status = inconsistent ? 'INCONSISTENT'
      : gates.some(g => g.status === 'ROUNDING_COMPATIBLE_NOT_VALIDATED')
        ? 'ROUNDING_COMPATIBLE_NOT_VALIDATED' : 'CONSISTENT_NOT_VALIDATED';
    return { schemaVersion: 1, status, evidenceStatus: 'UNVERIFIED', physicalCalibration: 'UNVERIFIED',
      targetKind: 'INFERRED_NOT_OBSERVED', slotMinutes: 15,
      summary: { gateDayCount: gates.length, inconsistentGateDays: inconsistent,
        rowCount: sum(gates.map(g => g.rows.length)),
        exceedsRoundingCount: sum(gates.map(g => g.exceedsRoundingCount)) },
      gates,
      notes: [
        '目標 Q 也是由既有 wait 與容量推算，不是現場排隊觀測；時間標籤為區間起點，Q 依既有方法解讀為格末。',
        '每格整數需求的累積四捨五入上界為 0.5 × 已經過格數，另保守加入 wait 顯示至小數二位的誤差。超界可排除只有這些四捨五入誤差的解釋。',
        '未超界只表示未能用此界線反證，不證明誤差由四捨五入造成，也不驗證 threshold、初始排隊或反推方法。',
        '一致性不等於物理校準；原始逐分鐘資料品質、瓶頸容量、獨立排隊與旅行時間驗證仍為 UNVERIFIED。'
      ] };
  }
  const api = { audit };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BaselineAudit = api;
})(typeof window !== 'undefined' ? window : globalThis);
