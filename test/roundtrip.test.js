'use strict';
// 線の記法が「読めて、同じものに書き戻せる」ことを見る。
//
// 描画の見た目ではなく、parse → generate → parse の往復で情報が落ちないことを確かめる。
// 矢印が4種（-> --> => ==>）に増え、線に color が付いたので、
// 「読めるが書き戻せない」組み合わせが出やすくなった。
//
// 2026-11-21 に見つけた既存バグも、ここで固定しておく。
// 空白なしの `n1-->n2` は from が `n1-`、線種が破線ではなく実線になっていた。

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

const head = [
  'swimlane',
  'lane a "レーンA"',
  'node n1 "ひとつめ" lane=a',
  'node n2 "ふたつめ" lane=a',
];
const parse = (body) => Swimlane.parse(head.concat(body).join('\n'));
const onlyLink = (body) => {
  const r = parse(body);
  assert.deepStrictEqual(r.errors, [], 'エラーが出ないこと: ' + JSON.stringify(r.errors));
  assert.strictEqual(r.state.links.length, 1, '接続が1本だけ読めること');
  return r.state.links[0];
};

/* ---- 1. 矢印4種が線種に対応する ---- */

const ARROWS = [
  ['->',  'solid'],
  ['-->', 'dashed'],
  ['=>',  'thick'],
  ['==>', 'thickDashed'],
];

ARROWS.forEach(([arrow, style]) => {
  check('`n1 ' + arrow + ' n2` が ' + style + ' として読める', () => {
    assert.strictEqual(onlyLink(['n1 ' + arrow + ' n2']).style, style);
  });
});

check('LINK_STYLES の arrow と、パースが受け付ける記法が食い違っていない', () => {
  // 記法を足すときに LINK_STYLES だけ直してパース側を忘れる、という食い違いを捕まえる
  assert.deepStrictEqual(
    Swimlane.LINK_STYLES.map((s) => [s.arrow, s.v]),
    ARROWS,
    'LINK_STYLES の arrow が、このテストが見ている記法と同じであること'
  );
  Swimlane.LINK_STYLES.forEach((s) => {
    assert.strictEqual(onlyLink(['n1 ' + s.arrow + ' n2']).style, s.v, s.arrow + ' が読めること');
  });
});

check('LINK_STYLES が4種を公開していて、順番も記法どおり', () => {
  assert.deepStrictEqual(
    Swimlane.LINK_STYLES.map((s) => s.v),
    ['solid', 'dashed', 'thick', 'thickDashed']
  );
  Swimlane.LINK_STYLES.forEach((s) => assert.ok(s.label, s.v + ' にラベルがある'));
});

check('LINK_COLOR が既定の線色を公開している', () => {
  assert.strictEqual(Swimlane.LINK_COLOR, '#42506B');
});

/* ---- 2. 空白なしでも同じに読める（2026-11-21 のバグ修正） ---- */

ARROWS.forEach(([arrow, style]) => {
  check('空白なしの `n1' + arrow + 'n2` も ' + style + ' になる', () => {
    const e = onlyLink(['n1' + arrow + 'n2']);
    assert.strictEqual(e.from, 'n1', 'from が ' + e.from + ' になっている');
    assert.strictEqual(e.to, 'n2');
    assert.strictEqual(e.style, style);
  });
});

check('ID に `-` を含んでいても割れ目を間違えない', () => {
  const r = Swimlane.parse([
    'swimlane',
    'lane a "レーンA"',
    'node x-1 "ひとつめ" lane=a',
    'node y-2 "ふたつめ" lane=a',
    'x-1-->y-2',
  ].join('\n'));
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(
    r.state.links.map((e) => [e.from, e.to, e.style]),
    [['x-1', 'y-2', 'dashed']]
  );
});

/* ---- 3. color 属性 ---- */

check('ラベルと一緒に color を読める', () => {
  const e = onlyLink(['n1 -> n2 "承認" color=#D32F2F']);
  assert.strictEqual(e.label, '承認');
  assert.strictEqual(e.color, '#D32F2F');
});

check('ラベルなしでも color を読める', () => {
  const e = onlyLink(['n1 ==> n2 color=#1B5E20']);
  assert.strictEqual(e.label, '');
  assert.strictEqual(e.color, '#1B5E20');
  assert.strictEqual(e.style, 'thickDashed');
});

check('color を書かなければ空のまま（既定色は描画側で決める）', () => {
  assert.strictEqual(onlyLink(['n1 -> n2']).color, '');
});

check('ラベルの中の `color=` は属性として拾わない', () => {
  const e = onlyLink(['n1 -> n2 "color=#000000 と書く"']);
  assert.strictEqual(e.label, 'color=#000000 と書く');
  assert.strictEqual(e.color, '');
});

/* ---- 4. 連鎖はエラーにする（黙って捨てない） ---- */

check('`n1 -> n2 -> n3` はエラーになり、接続は作られない', () => {
  const r = Swimlane.parse(head.concat(['node n3 "みっつめ" lane=a', 'n1 -> n2 -> n3']).join('\n'));
  assert.strictEqual(r.state.links.length, 0, '中途半端な接続を作らないこと');
  assert.strictEqual(r.errors.length, 1);
  assert.ok(/2つまで/.test(r.errors[0]), 'エラー文が理由を言っていること: ' + r.errors[0]);
});

check('ラベルに矢印が入っていても連鎖とは見なさない', () => {
  const e = onlyLink(['n1 -> n2 "A -> B のこと"']);
  assert.strictEqual(e.label, 'A -> B のこと');
  assert.strictEqual(e.style, 'solid');
});

/* ---- 5. 往復（parse → generate → parse） ---- */

const CASES = [];
ARROWS.forEach(([arrow]) => {
  ['', ' "ラベル"'].forEach((label) => {
    ['', ' color=#D32F2F'].forEach((color) => {
      CASES.push('n1 ' + arrow + ' n2' + label + color);
    });
  });
});

CASES.forEach((body) => {
  check('往復しても変わらない: ' + body, () => {
    const first = parse([body]);
    assert.deepStrictEqual(first.errors, []);
    const code = Swimlane.generate(first.state);
    const second = Swimlane.parse(code);
    assert.deepStrictEqual(second.errors, [], '書き戻したコードが読めること:\n' + code);
    assert.deepStrictEqual(
      second.state.links,
      first.state.links,
      '2周目の接続が1周目と同じであること:\n' + code
    );
  });
});

check('空白なしで書いたものも、往復すると空白入りの同じ意味になる', () => {
  const first = parse(['n1==>n2']);
  const code = Swimlane.generate(first.state);
  assert.ok(/n1 ==> n2/.test(code), '書き戻しは `n1 ==> n2` になること:\n' + code);
  assert.deepStrictEqual(Swimlane.parse(code).state.links, first.state.links);
});

check('color を書いていない接続には color= を書き足さない', () => {
  const code = Swimlane.generate(parse(['n1 -> n2']).state);
  assert.ok(!/color=/.test(code), 'color= が現れないこと:\n' + code);
});

check('既定色と同じ色を明示していても、消さずに残す', () => {
  const code = Swimlane.generate(parse(['n1 -> n2 color=#42506B']).state);
  assert.ok(/color=#42506B/.test(code), '書いた色が残ること:\n' + code);
});

/* ---- 6. 描画に反映されている ---- */

const svgOf = (body) => {
  const r = Swimlane.render(head.concat(body).join('\n'));
  assert.ok(r.ok, '描けること: ' + JSON.stringify(r.errors));
  return r.svg;
};

check('太線は細線より太く描かれる', () => {
  assert.ok(/stroke-width="3"/.test(svgOf(['n1 => n2'])), '太線が stroke-width="3"');
  assert.ok(/stroke-width="1.6"/.test(svgOf(['n1 -> n2'])), '細線が stroke-width="1.6"');
});

check('破線の刻みは、細線と太線で違う', () => {
  assert.ok(/stroke-dasharray="6 4"/.test(svgOf(['n1 --> n2'])));
  assert.ok(/stroke-dasharray="10 6"/.test(svgOf(['n1 ==> n2'])));
});

check('実線には stroke-dasharray を付けない', () => {
  assert.ok(!/stroke-dasharray/.test(svgOf(['n1 -> n2'])));
  assert.ok(!/stroke-dasharray/.test(svgOf(['n1 => n2'])));
});

check('color を指定すると、線と矢じりの両方がその色になる', () => {
  const svg = svgOf(['n1 -> n2 color=#D32F2F']);
  assert.ok(/stroke="#D32F2F"/.test(svg), '線がその色');
  assert.ok(/<polygon class="sl-arrow"[^>]*fill="#D32F2F"/.test(svg), '矢じりがその色');
  assert.ok(!/fill="#42506B"><\/polygon>/.test(svg), '既定色の矢じりが残っていないこと');
});

check('color を指定しなければ、線と矢じりは既定色のまま', () => {
  const svg = svgOf(['n1 -> n2']);
  assert.ok(/stroke="#42506B"/.test(svg));
  assert.ok(/<polygon class="sl-arrow"[^>]*fill="#42506B"/.test(svg));
});

check('ラベルの箱は枠だけ線色に追従し、文字色は変えない', () => {
  const svg = svgOf(['n1 -> n2 "承認" color=#D32F2F']);
  assert.ok(/<rect [^>]*fill="#FFFFFF" stroke="#D32F2F"/.test(svg), '箱の枠が線色');
  assert.ok(/fill="#3C516C"/.test(svg), 'ラベルの文字色は固定のまま');
});

check('色を指定しないラベルの箱は、今までの枠色のまま', () => {
  assert.ok(/<rect [^>]*fill="#FFFFFF" stroke="#D3E1EF"/.test(svgOf(['n1 -> n2 "承認"'])));
});

check('太い矢じりは、細い矢じりより大きい', () => {
  const pts = (svg) => (svg.match(/class="sl-arrow" points="([^"]+)"/) || [])[1];
  const thin = pts(svgOf(['n1 -> n2']));
  const thick = pts(svgOf(['n1 => n2']));
  assert.ok(thin && thick, '矢じりが描かれていること');
  assert.notStrictEqual(thin, thick, '太線の矢じりは細線と同じ形ではないこと');
});

/* ---- 7. 既存の .swim が今までどおり読める ---- */

check('examples/order.swim が、エラーなく今までどおり読める', () => {
  const fs = require('fs');
  const file = path.join(path.resolve(__dirname, '..'), 'examples', 'order.swim');
  const r = Swimlane.parse(fs.readFileSync(file, 'utf8'));
  assert.deepStrictEqual(r.errors, []);
  assert.ok(r.state.links.length > 0, '接続が読めていること');
  r.state.links.forEach((e) => {
    assert.ok(e.style === 'solid' || e.style === 'dashed', '線種が今までの2種のまま: ' + e.style);
    assert.strictEqual(e.color, '', '色は付いていないこと');
  });
});

if (failed) {
  console.error('\n' + failed + ' test(s) failed.');
  process.exit(1);
}
console.log('\nAll tests passed.');
