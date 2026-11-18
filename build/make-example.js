#!/usr/bin/env node
/*
 * README に載せている図を、examples/order.swim から描き直す。
 *   node build/make-example.js
 * 図を変えたら必ずこれを走らせる。手直しした SVG を置かないための入口。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const Swimlane = require(path.join(root, 'swimlane.js'));

const src = path.join(root, 'examples', 'order.swim');
const out = path.join(root, 'docs', 'example.svg');

const result = Swimlane.render(fs.readFileSync(src, 'utf8'));
if (!result.ok) {
  console.error('描けませんでした:');
  result.errors.forEach(e => console.error('  ' + e));
  process.exit(1);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, result.svg);

const size = result.svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
console.log('[make-example] ' + path.relative(root, out) + ' を書き出しました'
  + '（' + size[1] + ' x ' + size[2] + ' / エンジン ' + Swimlane.VERSION + '）');
