'use strict';
// フェーズの帯の見え方を見る（2026-11-21 に直した3点）。
//
//   1. 帯の内側に余白がある。直す前は先頭のフェーズだけ余白が 0 で、
//      ノードの上端がレーン名の帯にくっついていた。
//   2. 帯どうしが地続きに並ぶ。離れていると、レーンの上に引く境目の線が
//      どちらの縁なのか決められない。
//   3. 最後のフェーズの下に、終了●の分の余白を二重に取らない。
//      直す前は examples/order.swim で 77px 空いていた。

const assert = require('assert');
const path = require('path');
const Swimlane = require(path.join(path.resolve(__dirname, '..'), 'swimlane.js'));

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

const PAD = 17;          // swimlane.js の LAYOUT.phasePad
const LABEL_BOX_H = 18;  // ●のラベルを入れる白い箱の高さ（swimlane.js と同じ値）

const code = (dir, extra) => [
  'swimlane',
  'direction ' + dir,
  'lane a "申請者"',
  'lane b "承認者"',
  'phase p1 "受付"',
  'phase p2 "承認"',
  'node s "開始" lane=a phase=p1 shape=startdot',
  'node n1 "申請する" lane=a phase=p1',
  'node n2 "受け取る" lane=b phase=p1',
  'node n3 "承認する" lane=b phase=p2',
  'node e "完了" lane=a phase=p2 shape=enddot',
  's -> n1',
  'n1 -> n2',
  'n2 -> n3',
  'n3 -> e',
].concat(extra || []).join('\n');

// ●を使わない図。帯の縁とノードの間だけを測りたいとき用
const codePlain = (dir) => [
  'swimlane',
  'direction ' + dir,
  'lane a "申請者"',
  'phase p1 "受付"',
  'phase p2 "承認"',
  'node n1 "申請する" lane=a phase=p1',
  'node n2 "承認する" lane=a phase=p2',
  'n1 -> n2',
].join('\n');

const layoutOf = (src) => {
  const r = Swimlane.parse(src);
  assert.deepStrictEqual(r.errors, [], '読めること: ' + JSON.stringify(r.errors));
  return Swimlane.computeLayout(r.state);
};
// 帯に入っているノードの、流れ方向の範囲
const spanIn = (lay, pb) => {
  const lo = (b) => (lay.dir === 'LR' ? b.x : b.y);
  const hi = (b) => (lay.dir === 'LR' ? b.x + b.w : b.y + b.h);
  const inside = lay.boxes.filter((b) => lo(b) >= pb.start - 1 && hi(b) <= pb.start + pb.size + 1);
  assert.ok(inside.length, '帯の中にノードがあること');
  return {
    lo: Math.min.apply(null, inside.map(lo)),
    hi: Math.max.apply(null, inside.map(hi)),
  };
};

['TB', 'LR'].forEach((dir) => {
  check(dir + ': どの帯も、内側にノードとの余白がある', () => {
    const lay = layoutOf(code(dir));
    lay.phaseBands.forEach((pb) => {
      const s = spanIn(lay, pb);
      assert.ok(s.lo - pb.start >= PAD - 0.5,
        pb.phase.id + ' の手前の余白が ' + (s.lo - pb.start) + 'px しかない');
      assert.ok((pb.start + pb.size) - s.hi >= PAD - 0.5,
        pb.phase.id + ' の奥の余白が ' + ((pb.start + pb.size) - s.hi) + 'px しかない');
    });
  });

  check(dir + ': 先頭の帯は見出しの帯にくっついていて、ノードは余白のぶん内側に入る', () => {
    const lay = layoutOf(code(dir));
    const first = lay.phaseBands[0];
    const s = spanIn(lay, first);
    assert.ok(s.lo - first.start >= PAD - 0.5, '先頭だけ余白が詰まっていないこと');
    // 流れ方向の先頭にある見出しの帯（TBはレーン名の行 38px、LRはレーン名の列 132px）
    const head = dir === 'LR' ? 132 : 38;
    assert.ok(first.start <= head + 0.5,
      '帯の始まりが見出しの帯に接していること: ' + first.start + ' / 見出し ' + head);
  });

  check(dir + ': 帯どうしが地続きに並ぶ（隙間が空かない）', () => {
    const lay = layoutOf(code(dir));
    for (let i = 0; i < lay.phaseBands.length - 1; i++) {
      const a = lay.phaseBands[i], b = lay.phaseBands[i + 1];
      assert.strictEqual(+(b.start - (a.start + a.size)).toFixed(3), 0,
        a.phase.id + ' と ' + b.phase.id + ' の帯が離れている');
    }
  });

  check(dir + ': 最後のノードの先に、余計な空きが残らない', () => {
    const lay = layoutOf(codePlain(dir));   // ●のラベルの分は別のテストで見る
    const end = lay.dir === 'LR' ? lay.width : lay.height;
    const last = Math.max.apply(null, lay.boxes.map((b) => (lay.dir === 'LR' ? b.x + b.w : b.y + b.h)));
    assert.ok(end - last <= PAD + 0.5,
      '終わりの余白が ' + (end - last) + 'px ある（' + PAD + 'px までのはず）');
  });

  check(dir + ': フェーズの境目が、レーンの上にも引かれる', () => {
    const r = Swimlane.render(code(dir));
    assert.ok(r.ok, '描けること');
    const lines = r.svg.match(/<line [^>]*><\/line>/g) || [];
    assert.strictEqual(lines.length, 1, '境目は帯の数より1本少ない（2フェーズなら1本）');
    const lay = layoutOf(code(dir));
    const at = lay.phaseBands[1].start;
    const want = dir === 'LR' ? 'x1="' + at + '"' : 'y1="' + at + '"';
    assert.ok(lines[0].indexOf(want) >= 0,
      '線が帯の境目にあること: ' + lines[0] + ' / 期待 ' + want);
  });
});

check('TB: 終了●のラベルの箱も、帯の内側に収まる', () => {
  // ラベルは●の枠の外（真下）に描かれる。箱を帯に入れていなかった頃は、
  // 「完了」のラベルが帯の縁の線に触っていた（2026-11-21）。
  const lay = layoutOf(code('TB'));
  const dot = lay.boxes.filter((b) => b.node.shape === 'enddot')[0];
  assert.ok(dot && dot.node.label, '終了●にラベルがあること');
  const labelBottom = dot.y + dot.h + LABEL_BOX_H;
  const space = lay.height - labelBottom;
  assert.ok(space >= PAD - 0.5 && space <= PAD + 0.5,
    'ラベルの箱と図の下端の間が ' + space + 'px（' + PAD + 'px のはず）');
});

check('LR: 終了●のラベルが長いと、その分だけ帯も伸びる', () => {
  // LRでは●のラベルが流れ方向（横）に広がるので、帯の幅に効く
  const short = layoutOf(code('LR'));
  const long = layoutOf(code('LR').replace('node e "完了"', 'node e "ここで完了とする"'));
  assert.ok(long.width > short.width,
    '長いラベルで図が広がること: ' + short.width + ' -> ' + long.width);
});

check('フェーズが1つだけなら、境目の線は引かない', () => {
  const r = Swimlane.render([
    'swimlane',
    'lane a "申請者"',
    'phase p1 "受付"',
    'node n1 "申請する" lane=a phase=p1',
    'node n2 "送る" lane=a phase=p1',
    'n1 -> n2',
  ].join('\n'));
  assert.ok(r.ok);
  assert.strictEqual((r.svg.match(/<line /g) || []).length, 0);
});

check('フェーズを使わない図には、境目の線も帯も出ない', () => {
  const src = [
    'swimlane',
    'lane a "申請者"',
    'node n1 "申請する" lane=a',
    'node n2 "送る" lane=a',
    'n1 -> n2',
  ].join('\n');
  const r = Swimlane.render(src);
  assert.ok(r.ok);
  assert.strictEqual((r.svg.match(/<line /g) || []).length, 0);
  assert.strictEqual(layoutOf(src).hasPhaseHeader, false);
});

check('中身の無いフェーズも、帯が潰れずに残る', () => {
  const lay = layoutOf([
    'swimlane',
    'lane a "申請者"',
    'phase p1 "受付"',
    'phase p2 "保留"',
    'phase p3 "承認"',
    'node n1 "申請する" lane=a phase=p1',
    'node n2 "承認する" lane=a phase=p3',
    'n1 -> n2',
  ].join('\n'));
  assert.strictEqual(lay.phaseBands.length, 3);
  lay.phaseBands.forEach((pb) => {
    assert.ok(pb.size > 0, pb.phase.id + ' の帯が潰れている');
  });
  for (let i = 0; i < 2; i++) {
    const a = lay.phaseBands[i], b = lay.phaseBands[i + 1];
    assert.ok(b.start >= a.start + a.size - 0.5,
      a.phase.id + ' と ' + b.phase.id + ' の帯が重なっている');
  }
});

check('既存の examples/order.swim で、下の余白が縮んでいる', () => {
  const fs = require('fs');
  const file = path.join(path.resolve(__dirname, '..'), 'examples', 'order.swim');
  const lay = layoutOf(fs.readFileSync(file, 'utf8'));
  const last = Math.max.apply(null, lay.boxes.map((b) => b.y + b.h));
  // 最後は「完了」のラベル付きの●なので、箱の高さ18pxと余白17pxが残る
  assert.ok(lay.height - last <= PAD + LABEL_BOX_H + 0.5,
    '最後の●の下に ' + (lay.height - last) + 'px 空いている（直す前は 83px）');
});

if (failed) {
  console.error('\n' + failed + ' test(s) failed.');
  process.exit(1);
}
console.log('\nAll tests passed.');
