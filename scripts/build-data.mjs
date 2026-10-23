// Builds web/data/neihu-data.js from collected VD CSVs (data/csv/*_vd.csv).
// Same output shape as make-sample-data.mjs; meta.source = 'real'.
//
// Usage: node scripts/build-data.mjs [YYYY-MM-DD ...]   (default: every day found)
//
// Method (per gate, per 15-min slot) — see ASSUMPTIONS below:
//   D_k  measured car flow (S+L+T) through the gate VD, inbound direction only
//   v_ref fastest 15-min mean speed seen in the window, used as an assumed
//        reference; this does not establish an observed uncongested speed.
//   w_k  delay per car = L × (1/v_k − 1/v_ref)
//   congested slot: w_k > CONGESTED_MIN
//   c    assumed capacity = mean D_k over inferred congested slots; whether this
//        detector measures saturated bottleneck discharge is not yet verified.
//   Q_k  queue at slot end = w_k × c / 15
//   A_k  demand = c + Q_k − Q_{k−1} in congested slots, D_k otherwise.
//        Threshold switching and clamping can break reproduction of inferred Q_k.
//        The emitted baselineAudit diagnoses this; consistency is not calibration.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import baselineAudit from '../web/baseline-audit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');

// ---- ASSUMPTIONS (shown as 推算 on the page) ----
const APPROACH_KM = 2;          // length of the queued approach in front of each gate
const SLOT_MIN = 15;
const FIRST_SLOT = '06:45';
const N_SLOTS = 15;             // 06:45 .. 10:15
const MIN_MINUTES = 12;         // a slot needs >= 12 of 15 minutes of data
const CONGESTED_MIN = 0.2;      // delay above this marks a slot as queued

// Gate VDs and inbound direction were checked against 2026-10-22 data:
// inbound speeds are clearly lower than outbound in the morning.
// G6: no VD is named 成美橋; the 新明路 VD near its Neihu end is a proxy (NEEDS_VERIFICATION).
const GATES = [
  { id: 'G1', name: '民權大橋', dir: '東向進內湖', vd: 'VQBUL20', bearing: 'E' },
  { id: 'G2', name: '堤頂大道', dir: '北向', vd: 'VRHT600', bearing: 'N' },
  { id: 'G3', name: '環東大道', dir: '西向', vd: 'V6330G5', bearing: 'W' },
  { id: 'G4', name: '內湖路一段', dir: '東向（大直）', vd: 'VTXQJ20', bearing: 'E' },
  { id: 'G5', name: '成功橋／成功路', dir: '北向（南港）', vd: 'VQ6WK40', bearing: 'N' },
  { id: 'G6', name: '成美橋', dir: '新明路端・東北向', vd: 'VMSV820', bearing: 'NE' },
];

// Simulated company types (not real companies). gateShare = share of a
// company's car commuters crossing each gate.
const dist = (pairs) => {
  const a = new Array(N_SLOTS).fill(0);
  for (const [i, v] of pairs) a[i] = v;
  return a;
};
const ARCHETYPES = [
  { id: 'A', name: '大型電子廠', staff: 3000, driveShare: 0.45, zone: '內科西區（瑞光／港墘）', start: '08:30',
    gateShare: { G2: 0.5, G1: 0.3, G4: 0.2 }, arrivalDist: dist([[4, 0.15], [5, 0.35], [6, 0.35], [7, 0.15]]) },
  { id: 'B', name: '金融後台', staff: 1200, driveShare: 0.35, zone: '內科中區（陽光／洲子）', start: '09:00',
    gateShare: { G1: 0.5, G4: 0.5 }, arrivalDist: dist([[6, 0.2], [7, 0.4], [8, 0.3], [9, 0.1]]) },
  { id: 'C', name: '零售總部', staff: 800, driveShare: 0.4, zone: '舊宗路', start: '09:00',
    gateShare: { G3: 0.5, G5: 0.3, G6: 0.2 }, arrivalDist: dist([[6, 0.25], [7, 0.4], [8, 0.25], [9, 0.1]]) },
  { id: 'D', name: '新創', staff: 300, driveShare: 0.15, zone: '港墘站周邊', start: '09:30',
    gateShare: { G4: 1 }, arrivalDist: dist([[6, 0.1], [7, 0.2], [8, 0.25], [9, 0.25], [10, 0.2]]) },
];

// ---- helpers ----
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const toHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const slots = Array.from({ length: N_SLOTS }, (_, i) => toHHMM(toMin(FIRST_SLOT) + i * SLOT_MIN));

function linkDirections(day) {
  const xml = zlib.gunzipSync(fs.readFileSync(path.join(DATA, 'static', `${day}_VD.xml.gz`))).toString('utf8');
  const map = new Map();
  for (const v of xml.split('<VD>').slice(1)) {
    const id = (v.match(/<VDID>([^<]*)/) || [])[1];
    for (const l of v.split('<DetectionLink>').slice(1)) {
      map.set(`${id}|${(l.match(/<LinkID>([^<]*)/) || [])[1]}`, (l.match(/<RoadDirection>([^<]*)/) || [])[1]);
    }
  }
  return map;
}

function buildDay(day) {
  const dirs = linkDirections(day);
  const lines = fs.readFileSync(path.join(DATA, 'csv', `${day}_vd.csv`), 'utf8').replace(/^﻿/, '').trim().split('\n');
  const ix = Object.fromEntries(lines[0].split(',').map((h, i) => [h, i]));
  const want = new Map(GATES.map((g) => [g.vd, g]));

  // per gate, per slot: car count, moto count, speed samples, minutes seen
  const acc = Object.fromEntries(GATES.map((g) => [g.id, slots.map(() => ({ car: 0, moto: 0, spd: 0, n: 0, mins: new Set() }))]));
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    const g = want.get(c[ix.vdid]);
    if (!g || c[ix.status] !== '0') continue;
    if (dirs.get(`${c[ix.vdid]}|${c[ix.link_id]}`) !== g.bearing) continue;
    const t = c[ix.data_collect_time].slice(11, 16);
    const k = Math.floor((toMin(t) - toMin(FIRST_SLOT)) / SLOT_MIN);
    if (k < 0 || k >= N_SLOTS) continue;
    const a = acc[g.id][k];
    a.car += Number(c[ix.vol_S]) + Number(c[ix.vol_L]) + Number(c[ix.vol_T]);
    a.moto += Number(c[ix.vol_M]);
    const v = Number(c[ix.speed]);
    if (v > 0) { a.spd += v; a.n += 1; }
    a.mins.add(t);
  }

  const out = {};
  let complete = N_SLOTS;
  for (const g of GATES) {
    const s = acc[g.id];
    const firstBad = s.findIndex((a) => a.mins.size < MIN_MINUTES);
    if (firstBad >= 0) complete = Math.min(complete, firstBad);
    out[g.id] = s;
  }
  if (complete < N_SLOTS) console.warn(`${day}: only ${complete} complete slots (data ends ${slots[complete] ?? 'n/a'})`);
  return { slots: out, complete };
}

function measure(s, nSlots) {
  // scale to a full 15 minutes when a minute or two is missing
  const flow = s.slice(0, nSlots).map((a) => (a.mins.size ? Math.round((a.car * SLOT_MIN) / a.mins.size) : 0));
  const speed = s.slice(0, nSlots).map((a) => (a.n ? a.spd / a.n : null));
  return { flow, speed, moto: s.slice(0, nSlots).map((a) => a.moto) };
}

function derive(m, vRef) {
  const wait = m.speed.map((v) => (v ? Math.max(0, APPROACH_KM * 60 * (1 / v - 1 / vRef)) : 0));
  const congested = wait.map((w) => w > CONGESTED_MIN);
  const qFlows = m.flow.filter((_, k) => congested[k]);
  const capacity = Math.round(qFlows.length ? qFlows.reduce((a, b) => a + b, 0) / qFlows.length : Math.max(...m.flow));
  const queue = wait.map((w) => (w * capacity) / SLOT_MIN);
  const arrivals = m.flow.map((d, k) =>
    Math.max(0, Math.round(congested[k] ? capacity + queue[k] - (k ? queue[k - 1] : 0) : d)));
  return { capacity, arrivals, wait: wait.map((w) => +w.toFixed(2)) };
}

// ---- main ----
const days = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(path.join(DATA, 'csv')).filter((f) => f.endsWith('_vd.csv')).map((f) => f.slice(0, 10)).sort();

const built = days.map((d) => ({ day: d, ...buildDay(d) }));
const nSlots = Math.min(...built.map((b) => b.complete));
const outSlots = slots.slice(0, nSlots);

const gatesOut = [];
const daysOut = Object.fromEntries(built.map((b) => [b.day, {}]));
const measured = Object.fromEntries(built.map((b) => [b.day, {}]));
for (const g of GATES) {
  const ms = built.map((b) => measure(b.slots[g.id], nSlots));
  const vRef = Math.max(...ms.flatMap((m) => m.speed.filter(Boolean)));
  // One capacity per gate: derive on each day, then average across days.
  const ds = ms.map((m) => derive(m, vRef));
  const capacity = Math.round(ds.reduce((a, d) => a + d.capacity, 0) / ds.length);
  built.forEach((b, i) => {
    const d = derive(ms[i], vRef);
    // re-run the inversion with the shared capacity so every day uses the same c
    const queue = d.wait.map((w) => (w * capacity) / SLOT_MIN);
    daysOut[b.day][g.id] = ms[i].flow.map((f, k) =>
      Math.max(0, Math.round(d.wait[k] > CONGESTED_MIN ? capacity + queue[k] - (k ? queue[k - 1] : 0) : f)));
    measured[b.day][g.id] = { flow: ms[i].flow, speed: ms[i].speed.map((v) => (v ? Math.round(v) : null)), wait: d.wait, moto: ms[i].moto };
  });
  gatesOut.push({ id: g.id, name: g.name, dir: g.dir, vds: [g.vd], capacity, vRef: Math.round(vRef) });
}

const data = {
  meta: {
    source: 'real',
    generated: new Date().toISOString(),
    slotMinutes: SLOT_MIN,
    days,
    note: `臺北市 VDLive 實測（${days.join('、')}）；延滯以前方 ${APPROACH_KM} km 車速推算`,
    assumptions: { approachKm: APPROACH_KM, capacity: 'mean 15-min car flow in inferred congested slots; fallback to maximum flow if none; average daily estimates across available days', vehicles: 'cars only (S+L+T)' },
  },
  slots: outSlots,
  gates: gatesOut,
  days: daysOut,
  measured,
  archetypes: ARCHETYPES.map((a) => ({ ...a, arrivalDist: a.arrivalDist.slice(0, nSlots) })),
};

const out = path.join(ROOT, 'web', 'data', 'neihu-data.js');
// Preserve the original estimates, including inconsistency evidence. Never force Q
// or change capacity to pass this audit. Invalid input throws before writing.
const audit = baselineAudit.audit(data);
data.meta.baselineAudit = {
  schemaVersion: audit.schemaVersion,
  status: audit.status,
  evidenceStatus: audit.evidenceStatus,
  physicalCalibration: audit.physicalCalibration,
  targetKind: audit.targetKind,
  summary: audit.summary,
  gateDays: audit.gates.map(({ day, gateId, status, mae, maxAbsoluteError, exceedsRoundingCount }) =>
    ({ day, gateId, status, mae, maxAbsoluteError, exceedsRoundingCount })),
};
if (audit.status === 'INCONSISTENT') console.warn('UNVERIFIED baseline: inferred Q is inconsistent beyond the rounding-only bound; estimates are retained for diagnosis, not validated effects.');
fs.writeFileSync(out, `// Generated by scripts/build-data.mjs from ${days.join(', ')}\nwindow.NEIHU_DATA = ${JSON.stringify(data)};\n`);
console.log(`wrote ${out}: ${days.length} day(s), ${nSlots} slots (${outSlots[0]}–${outSlots[nSlots - 1]})`);
for (const g of gatesOut) {
  const m = measured[days[0]][g.id];
  console.log(`${g.id} ${g.name.padEnd(8)} cap ${g.capacity} vRef ${g.vRef}  maxWait ${Math.max(...m.wait).toFixed(1)}m  demand ${daysOut[days[0]][g.id].join(' ')}`);
}
