#!/usr/bin/env node
/*
 * README に載せている図を、examples/ の .swim から描き直す。
 *   node build/make-example.js
 * 図を変えたら必ずこれを走らせる。手直しした SVG を置かないための入口。
 *
 *   examples/order.swim    → docs/example.svg      （日本語の README 用）
 *   examples/order.en.swim → docs/example.en.svg   （英語の README 用）
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const Swimlane = require(path.join(root, 'swimlane.js'));

const jobs = [
  { src: 'examples/order.swim', out: 'docs/example.svg' },
  { src: 'examples/order.en.swim', out: 'docs/example.en.svg' },
];

jobs.forEach(job => {
  const src = path.join(root, job.src);
  const out = path.join(root, job.out);

  const result = Swimlane.render(fs.readFileSync(src, 'utf8'));
  if (!result.ok) {
    console.error(job.src + ' を描けませんでした:');
    result.errors.forEach(e => console.error('  ' + e));
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, result.svg);

  const size = result.svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  console.log('[make-example] ' + job.out + ' を書き出しました'
    + '（' + size[1] + ' x ' + size[2] + ' / エンジン ' + Swimlane.VERSION + '）');
});
