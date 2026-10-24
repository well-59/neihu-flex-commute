// Publishes collected data after the morning run.
// Builds page data from every collected day and opens a PR from a fresh
// worktree off origin/main, so the local checkout is never touched.
//
// Usage:
//   node collector/publish-data.mjs              # today
//   node collector/publish-data.mjs --date 2026-10-23
//   node collector/publish-data.mjs --dry-run    # everything except push / PR
//
// Output in the PR:
//   dataset/csv/*.csv.gz      Neihu-bbox VD and section rows per day (gzipped CSV)
//   dataset/static/*.xml.gz   VD / Section metadata per day
//   web/data/neihu-data.js    rebuilt with scripts/build-data.mjs
// Log: data/logs/publish-YYYY-MM-DD.log

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(REPO, 'data');
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const DAY = args.includes('--date') ? args[args.indexOf('--date') + 1] : `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const LOG = path.join(DATA, 'logs', `publish-${DAY}.log`);

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.appendFileSync(LOG, line + '\n');
}

function run(cmd, cmdArgs, cwd = REPO) {
  log(`$ ${cmd} ${cmdArgs.join(' ')}`);
  const out = execFileSync(cmd, cmdArgs, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (out) log(out);
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForCollector() {
  const dayLog = path.join(DATA, 'logs', `${DAY}.log`);
  for (let i = 0; i < 90; i += 1) {   // up to 45 minutes
    if (fs.existsSync(dayLog) && fs.readFileSync(dayLog, 'utf8').includes('collector finished')) return dayLog;
    if (i === 0) log('collector not finished yet, waiting');
    await sleep(30000);
  }
  throw new Error(`collector did not finish for ${DAY} (no "collector finished" in ${dayLog})`);
}

function daySummary(day) {
  const csv = path.join(DATA, 'csv', `${day}_vd.csv`);
  const times = new Set();
  const lines = fs.readFileSync(csv, 'utf8').split('\n');
  const col = lines[0].replace(/^﻿/, '').split(',').indexOf('data_collect_time');
  for (const l of lines.slice(1)) if (l) times.add(l.split(',')[col]);
  const dayLog = path.join(DATA, 'logs', `${day}.log`);
  const text = fs.existsSync(dayLog) ? fs.readFileSync(dayLog, 'utf8') : '';
  return {
    day,
    minutes: times.size,
    errors: (text.match(/ERROR/g) || []).length,
    skipped: (text.match(/unchanged/g) || []).length,
  };
}

async function main() {
  log(`publish start for ${DAY}${DRY ? ' (dry run)' : ''}`);
  await waitForCollector();

  const days = fs.readdirSync(path.join(DATA, 'csv')).filter((f) => f.endsWith('_vd.csv')).map((f) => f.slice(0, 10)).sort();
  if (!days.includes(DAY)) throw new Error(`no CSV for ${DAY}`);
  const summary = days.map(daySummary);
  for (const s of summary) log(`${s.day}: ${s.minutes} minutes, ${s.errors} errors, ${s.skipped} skipped`);

  run('git', ['fetch', 'origin', 'main']);
  const wt = path.join(os.tmpdir(), `neihu-publish-${DAY}`);
  if (fs.existsSync(wt)) run('git', ['worktree', 'remove', '--force', wt]);
  run('git', ['worktree', 'prune']);
  let branch = `data/${DAY}`;
  const exists = (b) => {
    try { execFileSync('git', ['rev-parse', '--verify', '--quiet', b], { cwd: REPO, stdio: 'ignore' }); return true; } catch { return false; }
  };
  if (exists(branch) || exists(`origin/${branch}`)) branch += `-${pad(now.getHours())}${pad(now.getMinutes())}`;
  run('git', ['worktree', 'add', '-b', branch, wt, 'origin/main']);

  try {
    // data for build-data.mjs (ignored by git) + gzipped copies for the dataset folder
    for (const sub of ['csv', 'static']) {
      fs.mkdirSync(path.join(wt, 'data', sub), { recursive: true });
      fs.mkdirSync(path.join(wt, 'dataset', sub), { recursive: true });
      for (const f of fs.readdirSync(path.join(DATA, sub))) {
        const src = path.join(DATA, sub, f);
        fs.copyFileSync(src, path.join(wt, 'data', sub, f));
        const buf = fs.readFileSync(src);
        const dest = path.join(wt, 'dataset', sub, f.endsWith('.gz') ? f : f + '.gz');
        fs.writeFileSync(dest, f.endsWith('.gz') ? buf : zlib.gzipSync(buf));
      }
    }
    fs.writeFileSync(path.join(wt, 'dataset', 'README.md'), [
      '# 收集資料',
      '',
      '由 `collector/collect.mjs` 每分鐘抓取臺北市 VDLive / LiveTraffic，`collector/publish-data.mjs` 自動上傳。',
      '只保留內湖範圍（緯度 25.040–25.100、經度 121.555–121.640）的資料列；全臺北原始 XML 留在收集電腦上。',
      '',
      '| 日期 | 收到的分鐘數 | 錯誤 | 跳過 |',
      '|---|---|---|---|',
      ...summary.map((s) => `| ${s.day} | ${s.minutes} | ${s.errors} | ${s.skipped} |`),
      '',
      '- `csv/YYYY-MM-DD_vd.csv.gz`：每分鐘、每支 VD、每車道一列（速度、佔有率、四種車流量）。',
      '- `csv/YYYY-MM-DD_section.csv.gz`：每分鐘、每個路段一列（旅行時間、速度、壅塞等級）。',
      '- `static/`：當天的 VD 位置與路段資料。',
      '',
      '重建頁面資料：把 `csv/`、`static/` 解壓到 `data/` 底下，再執行 `node scripts/build-data.mjs`。',
      '',
    ].join('\n'));
    for (const f of ['publish-data.mjs', 'publish.cmd']) {
      fs.copyFileSync(path.join(REPO, 'collector', f), path.join(wt, 'collector', f));
    }

    run('node', ['scripts/build-data.mjs'], wt);
    run('git', ['add', 'dataset', 'web/data/neihu-data.js', 'collector/publish-data.mjs', 'collector/publish.cmd'], wt);
    const stat = run('git', ['diff', '--cached', '--stat'], wt);
    if (!stat) throw new Error('nothing to commit');

    const msg = [
      `data: add ${days.join(', ')} VD collection and rebuild page data`,
      '',
      ...summary.map((s) => `- ${s.day}: ${s.minutes} minutes, ${s.errors} errors, ${s.skipped} skipped`),
      '',
      'Generated by collector/publish-data.mjs after the morning collection.',
      '',
      'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>',
    ].join('\n');
    fs.writeFileSync(path.join(wt, '.git-commit-msg'), msg);
    run('git', ['commit', '-F', '.git-commit-msg'], wt);
    fs.unlinkSync(path.join(wt, '.git-commit-msg'));

    if (DRY) {
      log('dry run: skipping push and PR');
      return;
    }
    run('git', ['push', '-u', 'origin', branch], wt);
    const body = [
      '## 內容',
      `- 自動上傳 ${days.join('、')} 的 VD 收集資料（\`dataset/\`，內湖範圍，gzip CSV）`,
      '- 用全部天數重建 `web/data/neihu-data.js`',
      '- 附上這支自動上傳程式 `collector/publish-data.mjs`、`collector/publish.cmd`',
      '',
      '## 收集狀況',
      '| 日期 | 收到的分鐘數 | 錯誤 | 跳過 |',
      '|---|---|---|---|',
      ...summary.map((s) => `| ${s.day} | ${s.minutes} | ${s.errors} | ${s.skipped} |`),
      '',
      '## 注意',
      '- 由排程自動產生，沒有人工檢查。頁面目前只顯示第一天的資料；多天的容量是各天平均。',
      '- 合併前請確認收集狀況正常（06:45–10:30 應該約 226 分鐘）。',
      '',
      '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
    ].join('\n');
    const bodyFile = path.join(wt, '.pr-body.md');
    fs.writeFileSync(bodyFile, body);
    const url = run('gh', ['pr', 'create', '--base', 'main', '--head', branch,
      '--title', `data: ${DAY} VD 收集資料與頁面資料重建`, '--body-file', bodyFile], wt);
    fs.unlinkSync(bodyFile);
    log(`PR: ${url}`);
  } finally {
    run('git', ['worktree', 'remove', '--force', wt]);
    if (DRY) run('git', ['branch', '-D', branch]);
  }
  log('publish done');
}

main().catch((e) => {
  log(`ERROR ${e.stack || e.message}`);
  process.exitCode = 1;
  if (DRY) return;
  // Nobody is at the machine: report the failure where it can be seen from a phone.
  try {
    const tail = fs.readFileSync(LOG, 'utf8').trim().split('\n').slice(-40).join('\n');
    const body = path.join(os.tmpdir(), `neihu-publish-error-${DAY}.md`);
    fs.writeFileSync(body, `自動上傳 ${DAY} 的收集資料失敗。\n\n**錯誤**：${e.message}\n\nlog 最後 40 行：\n\n\`\`\`\n${tail}\n\`\`\`\n\n資料仍在收集電腦的 \`data/\` 底下，可以之後手動執行 \`node collector/publish-data.mjs --date ${DAY}\`。\n`);
    run('gh', ['issue', 'create', '--title', `自動上傳失敗：${DAY}`, '--body-file', body]);
  } catch (e2) {
    log(`could not open issue: ${e2.message}`);
  }
});
