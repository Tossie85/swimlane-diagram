'use strict';
// 配るものの辻褄を見る。中身の正しさではなく、**食い違い**を捕まえるためのテスト。
//
//   1. swimlane.js の VERSION と package.json の version がずれていないこと
//   2. README が参照しているファイルが、実際に置いてあること
//   3. npm に配るファイル一覧（files）に、README が参照する図が入っていること
//
// 1 は実際にずれた。2026-11-19 に VERSION だけ 1.2.1 へ上げ、package.json が
// 1.2.0 のまま npm pack に出てきた。番号が食い違うと、同じ版で違う図が出回る。

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const Swimlane = require(path.join(root, 'swimlane.js'));
const pkg = require(path.join(root, 'package.json'));

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log('ok - ' + name);
  } catch (e) {
    failed++;
    console.error('NOT OK - ' + name);
    console.error('  ' + (e && e.message));
  }
}

check('swimlane.js の VERSION と package.json の version が同じ', () => {
  assert.strictEqual(
    Swimlane.VERSION, pkg.version,
    `swimlane.js は ${Swimlane.VERSION}、package.json は ${pkg.version}`
  );
});

const READMES = ['README.md', 'README.en.md'];

READMES.forEach(name => {
  check(name + ' が参照しているファイルが置いてある', () => {
    const md = fs.readFileSync(path.join(root, name), 'utf8');
    const refs = [...md.matchAll(/[!]?\[[^\]]*\]\(([^):?#]+)\)/g)]
      .map(m => m[1].replace(/^\.\//, ''))
      .filter(r => !/^(https?:|mailto:|#)/.test(r));
    assert.ok(refs.length > 0, name + ' がどのファイルも参照していない（書式が変わった？）');
    const missing = [...new Set(refs)].filter(r => !fs.existsSync(path.join(root, r)));
    assert.deepStrictEqual(missing, [], '置いていないファイルを指している: ' + missing.join(', '));
  });
});

check('README に書いてある CDN の版が、いまの version と同じ', () => {
  // 版を上げるたびに案内も直す必要がある。忘れると、古い版を勧め続けることになる。
  READMES.forEach(name => {
    const md = fs.readFileSync(path.join(root, name), 'utf8');
    const hits = [...md.matchAll(/swimlane-diagram@([\d.]+)/g)].map(m => m[1]);
    assert.ok(hits.length > 0, name + ' に CDN の案内が無い（書式が変わった？）');
    const stale = [...new Set(hits)].filter(v => v !== pkg.version);
    assert.deepStrictEqual(stale, [], name + ' が古い版を案内している: ' + stale.join(', '));
  });
});

check('README の図が、npm に配るファイル一覧に入っている', () => {
  const md = READMES.map(n => fs.readFileSync(path.join(root, n), 'utf8')).join('\n');
  const imgs = [...md.matchAll(/!\[[^\]]*\]\(([^):?#]+)\)/g)]
    .map(m => m[1].replace(/^\.\//, ''))
    .filter(r => !/^https?:/.test(r));
  imgs.forEach(img => {
    const listed = (pkg.files || []).some(f => f === img || img.startsWith(f.replace(/\/$/, '') + '/'));
    assert.ok(listed, `README の図 ${img} が package.json の files に無い`);
  });
});

if (failed) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll tests passed.');
