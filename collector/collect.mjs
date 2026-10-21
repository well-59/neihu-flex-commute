// Neihu morning-peak traffic collector.
// Polls Taipei open data (VDLive / LiveTraffic, updated every 60s) once per minute
// between --start and --end (local time), keeps gzipped raw XML and appends
// Neihu-area rows to daily CSV files.
//
// Usage:
//   node collect.mjs                      # default window 06:45-09:45
//   node collect.mjs --start 06:45 --end 09:45
//   node collect.mjs --once               # single fetch, for testing
//
// Output (relative to ../data):
//   static/YYYY-MM-DD_VD.xml.gz, static/YYYY-MM-DD_Section.xml.gz   (once per day)
//   raw/YYYY-MM-DD/HHMMSS_VDLive.xml.gz, raw/.../HHMMSS_LiveTraffic.xml.gz
//   csv/YYYY-MM-DD_vd.csv        one row per VD lane per minute (Neihu bbox)
//   csv/YYYY-MM-DD_section.csv   one row per road section per minute (Neihu bbox)
//   logs/YYYY-MM-DD.log

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const BASE = 'https://tcgbusfs.blob.core.windows.net/blobtisv/';
const URLS = {
  VDLive: BASE + 'VDLive.xml',
  LiveTraffic: BASE + 'LiveTraffic.xml',
  VD: BASE + 'VD.xml',
  Section: BASE + 'Section.xml',
};

// Neihu + its inbound bridges / approaches (Chengmei, Minquan, MacArthur, Huandong, Diding).
// Raw XML keeps the whole city, so this box can be changed later and CSVs rebuilt.
const BBOX = { latMin: 25.040, latMax: 25.100, lonMin: 121.555, lonMax: 121.640 };

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const ONCE = args.includes('--once');
const START = arg('--start', '06:45');
const END = arg('--end', '09:45');

const pad = (n) => String(n).padStart(2, '0');
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeStr = (d) => `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const atToday = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const inBox = (lat, lon) =>
  lat >= BBOX.latMin && lat <= BBOX.latMax && lon >= BBOX.lonMin && lon <= BBOX.lonMax;

function log(msg) {
  const now = new Date();
  const line = `${now.toISOString()} ${msg}`;
  console.log(line);
  fs.mkdirSync(path.join(DATA_DIR, 'logs'), { recursive: true });
  fs.appendFileSync(path.join(DATA_DIR, 'logs', `${dateStr(now)}.log`), line + '\n');
}

async function fetchText(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === tries) throw new Error(`${url} failed after ${tries} tries: ${e.message}`);
      await sleep(3000 * i);
    }
  }
}

// Minimal tag helpers; the feeds have a flat, regular structure.
const tag = (s, t) => (s.match(new RegExp(`<${t}>([^<]*)</${t}>`)) || [])[1] ?? '';
const blocks = (s, t) => s.split(`<${t}>`).slice(1).map((b) => b.split(`</${t}>`)[0]);
const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);

function appendCsv(file, header, rows) {
  if (!rows.length) return;
  const exists = fs.existsSync(file);
  const body = rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
  // BOM so Excel opens Chinese road names correctly.
  fs.appendFileSync(file, (exists ? '' : '﻿' + header.join(',') + '\n') + body);
}

function saveGz(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, zlib.gzipSync(text));
}

// Static metadata: VD positions and section geometry, refreshed once per day.
let vdMeta = null; // VDID -> { road, lat, lon }
let secMeta = null; // SectionID -> { name, road, dir, lengthKm }

async function loadStatic(day) {
  const vdFile = path.join(DATA_DIR, 'static', `${day}_VD.xml.gz`);
  const secFile = path.join(DATA_DIR, 'static', `${day}_Section.xml.gz`);
  const read = async (file, url) => {
    if (fs.existsSync(file)) return zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');
    const text = await fetchText(url);
    saveGz(file, text);
    return text;
  };

  const vdXml = await read(vdFile, URLS.VD);
  vdMeta = new Map();
  for (const b of blocks(vdXml, 'VD')) {
    const lat = +tag(b, 'PositionLat');
    const lon = +tag(b, 'PositionLon');
    if (inBox(lat, lon)) vdMeta.set(tag(b, 'VDID'), { road: tag(b, 'RoadName'), lat, lon });
  }

  const secXml = await read(secFile, URLS.Section);
  secMeta = new Map();
  for (const b of blocks(secXml, 'Section')) {
    const lats = [...b.matchAll(/<PositionLat>([^<]*)/g)].map((m) => +m[1]);
    const lons = [...b.matchAll(/<PositionLon>([^<]*)/g)].map((m) => +m[1]);
    if (lats.some((la, i) => inBox(la, lons[i]))) {
      secMeta.set(tag(b, 'SectionID'), {
        name: tag(b, 'SectionName'),
        road: tag(b, 'RoadName'),
        dir: tag(b, 'RoadDirection'),
        lengthKm: tag(b, 'SectionLength'),
      });
    }
  }
  log(`static loaded: ${vdMeta.size} VDs, ${secMeta.size} sections in Neihu bbox`);
}

const VD_HEADER = [
  'fetch_time', 'data_collect_time', 'vdid', 'road', 'lat', 'lon', 'status', 'link_id',
  'lane_id', 'lane_type', 'speed', 'occupancy',
  'vol_M', 'vol_S', 'vol_L', 'vol_T',
];
const SEC_HEADER = [
  'fetch_time', 'data_collect_time', 'section_id', 'section_name', 'road', 'direction',
  'length_km', 'travel_time_s', 'travel_speed', 'congestion_level', 'has_vd', 'has_etag',
];

// Last seen feed UpdateTime per day, persisted so a restarted process does not
// append the same minute twice.
let lastVdCollect = '';
let lastSecCollect = '';
let stateDay = '';
const stateFile = (day) => path.join(DATA_DIR, 'logs', `${day}.state.json`);

function loadState(day) {
  stateDay = day;
  try {
    ({ lastVdCollect = '', lastSecCollect = '' } = JSON.parse(fs.readFileSync(stateFile(day), 'utf8')));
  } catch {
    lastVdCollect = lastSecCollect = '';
  }
}

function saveState() {
  fs.mkdirSync(path.join(DATA_DIR, 'logs'), { recursive: true });
  fs.writeFileSync(stateFile(stateDay), JSON.stringify({ lastVdCollect, lastSecCollect }));
}

async function tick() {
  const now = new Date();
  const day = dateStr(now);
  const t = timeStr(now);
  const fetchTime = now.toISOString();
  if (stateDay !== day) loadState(day);
  if (!vdMeta || !fs.existsSync(path.join(DATA_DIR, 'static', `${day}_VD.xml.gz`))) {
    await loadStatic(day);
  }

  const [vdRes, ltRes] = await Promise.allSettled([
    fetchText(URLS.VDLive),
    fetchText(URLS.LiveTraffic),
  ]);

  if (vdRes.status === 'fulfilled') {
    const xml = vdRes.value;
    const updateTime = tag(xml, 'UpdateTime');
    if (updateTime === lastVdCollect) {
      log(`VDLive unchanged (${updateTime}), skipped`);
    } else {
      lastVdCollect = updateTime;
      saveGz(path.join(DATA_DIR, 'raw', day, `${t}_VDLive.xml.gz`), xml);
      const rows = [];
      for (const v of blocks(xml, 'VDLive')) {
        const id = tag(v, 'VDID');
        const meta = vdMeta.get(id);
        if (!meta) continue;
        const status = tag(v, 'Status');
        const collect = tag(v, 'DataCollectTime');
        for (const lf of blocks(v, 'LinkFlow')) {
          const linkId = tag(lf, 'LinkID');
          for (const lane of blocks(lf, 'Lane')) {
            const vol = { M: '', S: '', L: '', T: '' };
            for (const veh of blocks(lane, 'Vehicle')) vol[tag(veh, 'VehicleType')] = tag(veh, 'Volume');
            // Lane-level <Speed> appears before <Vehicles>, so match it there.
            const laneHead = lane.split('<Vehicles>')[0];
            rows.push([
              fetchTime, collect, id, meta.road, meta.lat, meta.lon, status, linkId,
              tag(lane, 'LaneID'), tag(lane, 'LaneType'), tag(laneHead, 'Speed'), tag(lane, 'Occupancy'),
              vol.M, vol.S, vol.L, vol.T,
            ]);
          }
        }
      }
      appendCsv(path.join(DATA_DIR, 'csv', `${day}_vd.csv`), VD_HEADER, rows);
      saveState();
      log(`VDLive ${updateTime}: ${rows.length} lane rows`);
    }
  } else {
    log(`ERROR ${vdRes.reason.message}`);
  }

  if (ltRes.status === 'fulfilled') {
    const xml = ltRes.value;
    const updateTime = tag(xml, 'UpdateTime');
    if (updateTime === lastSecCollect) {
      log(`LiveTraffic unchanged (${updateTime}), skipped`);
    } else {
      lastSecCollect = updateTime;
      saveGz(path.join(DATA_DIR, 'raw', day, `${t}_LiveTraffic.xml.gz`), xml);
      const rows = [];
      for (const s of blocks(xml, 'LiveTraffic')) {
        const id = tag(s, 'SectionID');
        const meta = secMeta.get(id);
        if (!meta) continue;
        rows.push([
          fetchTime, tag(s, 'DataCollectTime'), id, meta.name, meta.road, meta.dir, meta.lengthKm,
          tag(s, 'TravelTime'), tag(s, 'TravelSpeed'), tag(s, 'CongestionLevel'),
          tag(s, 'HasVD'), tag(s, 'HasETAG'),
        ]);
      }
      appendCsv(path.join(DATA_DIR, 'csv', `${day}_section.csv`), SEC_HEADER, rows);
      saveState();
      log(`LiveTraffic ${updateTime}: ${rows.length} section rows`);
    }
  } else {
    log(`ERROR ${ltRes.reason.message}`);
  }
}

async function safeTick() {
  try {
    await tick();
  } catch (e) {
    // Keep the loop alive; one bad minute must not lose the rest of the morning.
    log(`ERROR tick: ${e.stack || e.message}`);
  }
}

async function main() {
  if (ONCE) {
    await safeTick();
    return;
  }
  const start = atToday(START);
  const end = atToday(END);
  log(`collector started, window ${START}-${END}`);
  if (Date.now() < start.getTime()) {
    log(`waiting until ${START}`);
    await sleep(start.getTime() - Date.now());
  }
  while (Date.now() <= end.getTime()) {
    await safeTick();
    // Feeds refresh around :30-:40 of each minute; poll at :50 to catch the new file.
    const next = new Date();
    next.setSeconds(50, 0);
    if (next.getTime() <= Date.now()) next.setMinutes(next.getMinutes() + 1);
    await sleep(next.getTime() - Date.now());
  }
  log('collector finished');
}

main();
