'use strict';

// 図の「読みやすさ」に直結する3点を検証する。
// どれも図としては成立してしまうので、寸法や線の出入りを見るテストでは捕まらない。
//
//   1. ●（開始/終了）のラベルが、隣のノードに貼り付いていないこと
//   2. フェーズの中に、誰も使っていない段が空いたまま残っていないこと
//   3. 接続ラベルの上を、他の接続の線が通っていないこと
//
// 3点とも 2026-11-18 に README の図で見つかったもの。

const assert = require('assert');
const Swimlane = require('../swimlane.js');

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failed++;
    console.error(`NOT OK - ${name}`);
    console.error('  ' + (err && err.message ? err.message : err));
  }
}

function layoutOf(code) {
  const parsed = Swimlane.parse(code);
  assert.strictEqual(parsed.errors.length, 0, '構文エラー: ' + JSON.stringify(parsed.errors));
  return Swimlane.computeLayout(parsed.state);
}

function boxMap(lay) {
  const m = new Map();
  lay.boxes.forEach(b => m.set(b.node.id, b));
  return m;
}

function svgOf(code) {
  const r = Swimlane.render(code);
  assert.ok(r.ok, '描画に失敗: ' + JSON.stringify(r.errors));
  return r.svg;
}

/* 経路（M x y V y H x …）を線分の配列にほどく */
function segmentsOf(d) {
  const t = String(d).trim().split(/\s+/);
  const segs = [];
  let x = 0, y = 0, i = 0;
  while (i < t.length) {
    const c = t[i++];
    if (c === 'M') { x = +t[i++]; y = +t[i++]; continue; }
    if (c === 'V') { const ny = +t[i++]; segs.push([x, y, x, ny]); y = ny; continue; }
    if (c === 'H') { const nx = +t[i++]; segs.push([x, y, nx, y]); x = nx; continue; }
    if (c === 'L') { const nx = +t[i++], ny = +t[i++]; segs.push([x, y, nx, ny]); x = nx; y = ny; continue; }
  }
  return segs;
}

function segHitsBox([x1, y1, x2, y2], b) {
  const lo = (p, q) => Math.min(p, q), hi = (p, q) => Math.max(p, q);
  if (lo(x1, x2) > b.x + b.w || hi(x1, x2) < b.x) return false;
  if (lo(y1, y2) > b.y + b.h || hi(y1, y2) < b.y) return false;
  return true;
}

// README に載せている図。3点とも、この図で見つかった。
const ORDER_FLOW = [
  'swimlane',
  'title "受注フロー"',
  'lane sales "営業"',
  'lane back "業務"',
  'lane ware "倉庫"',
  'phase p1 "受付"',
  'phase p2 "出荷"',
  'node s "引合" lane=sales phase=p1 shape=startdot',
  'node n1 "見積を出す" lane=sales phase=p1',
  'node n2 "注文を受ける" lane=sales phase=p1 shape=io',
  'node d1 "与信は足りるか" lane=back phase=p1 shape=decision',
  'node n3 "条件を見直す" lane=sales phase=p1',
  'node n4 "受注を登録する" lane=back phase=p2',
  'node n5 "出荷する" lane=ware phase=p2',
  'node e "完了" lane=ware phase=p2 shape=enddot',
  's -> n1',
  'n1 -> n2',
  'n2 -> d1 "審査を依頼"',
  'd1 -> n4 "OK"',
  'd1 -> n3 "NG"',
  'n3 -> n2 "再見積"',
  'n4 -> n5 "出荷を指示"',
  'n5 -> e',
].join('\n');

// ---------------------------------------------------------------------------
// 1. ●のラベルが隣のノードに貼り付かない
// ---------------------------------------------------------------------------

// ●は図形が小さいぶん、ラベルを図形の外（線の側）に添える。
// そのぶん余分に間隔を取らないと、ラベルと次のノードが1つの塊に見える。
// 2026-11-18 時点では 7px しか空いておらず、「引合」が「見積を出す」にくっついていた。
const DOT_LABEL_CLEARANCE = 14;

check('●のラベルと次のノードの間が空いている', () => {
  const lay = layoutOf([
    'swimlane',
    'lane a "担当"',
    'node s "引合" lane=a shape=startdot',
    'node n1 "見積を出す" lane=a',
    'node e "完了" lane=a shape=enddot',
    's -> n1',
    'n1 -> e',
  ].join('\n'));
  const by = boxMap(lay);
  const dot = by.get('s'), next = by.get('n1');
  // ラベルは●の下端 + 13 を基準線に描かれる。文字の下端はおよそ +3。
  const labelBottom = dot.y + dot.h + 16;
  const gap = next.y - labelBottom;
  assert.ok(
    gap >= DOT_LABEL_CLEARANCE,
    `●のラベルの下とノードの上が ${gap}px しか空いていない（${DOT_LABEL_CLEARANCE}px 以上ほしい）`
  );
});

// ---------------------------------------------------------------------------
// 2. 誰も使っていない段が残らない
// ---------------------------------------------------------------------------

check('段の間隔が一定で、空いた段が残らない', () => {
  // 段（行）はフェーズの中でレーンをまたいで揃えてある。どのレーンも使っていない段が
  // 残ると、そこだけ間隔が2倍になる。別レーンを経由して戻ってくる形で実際に起きていた
  // （「見積を出す」→「注文を受ける」だけ他の2.7倍空いていた）。
  const lay = layoutOf(ORDER_FLOW);
  const rows = [...new Set(
    lay.boxes.filter(b => !Swimlane.isDot(b.node.shape) && b.node.phaseId === 'p1')
             .map(b => b.y)
  )].sort((a, b) => a - b);
  assert.ok(rows.length >= 3, '段が少なすぎて検証にならない: ' + JSON.stringify(rows));
  const pitches = [];
  for (let i = 1; i < rows.length; i++) pitches.push(rows[i] - rows[i - 1]);
  const min = Math.min(...pitches), max = Math.max(...pitches);
  assert.ok(
    max - min <= 2,
    `段の間隔がそろっていない: ${JSON.stringify(pitches)}（誰も使っていない段が残っている）`
  );
});

// ---------------------------------------------------------------------------
// 3. ラベルの上を他の線が通らない
// ---------------------------------------------------------------------------

function labelCollisions(code) {
  const svg = svgOf(code);
  // 接続ラベル: 白い箱（height="18"）と、その直後のテキスト。data-pick="link" が付く。
  const boxes = [...svg.matchAll(
    /<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="18"[^>]*data-pick="link" data-idx="(\d+)"/g
  )].map(m => ({ x: +m[1], y: +m[2], w: +m[3], h: 18, idx: +m[4] }));
  assert.ok(boxes.length > 0, 'ラベルの箱が1つも見つからない（描画の形が変わった？）');

  // 線: data-idx を持つ path。同じ経路が2本（当たり判定用と見た目用）出るので idx でまとめる。
  const paths = new Map();
  [...svg.matchAll(/<path[^>]*d="([^"]+)"[^>]*data-pick="link" data-idx="(\d+)"/g)]
    .forEach(m => { if (!paths.has(+m[2])) paths.set(+m[2], segmentsOf(m[1])); });

  const hits = [];
  boxes.forEach(b => {
    paths.forEach((segs, idx) => {
      if (idx === b.idx) return;                 // 自分の線の上に載るのは当たり前
      if (segs.some(s => segHitsBox(s, b))) hits.push(`ラベル#${b.idx} を 線#${idx} が通っている`);
    });
  });
  return hits;
}

check('接続ラベルの上を、他の接続の線が通らない', () => {
  const hits = labelCollisions(ORDER_FLOW);
  assert.deepStrictEqual(hits, [], hits.join(' / '));
});

check('戻りの辺が、同じレーンの中に収まる', () => {
  // ラベルを避けるために線のほうを曲げると、同じレーンどうしの戻りが
  // 隣のレーンまで遠回りしてしまう。ラベルをずらす方式に戻した理由。
  const code = [
    'swimlane',
    'lane sales "営業"',
    'lane back "業務"',
    'lane ware "倉庫"',
    'node n1 "見積を出す" lane=sales',
    'node n2 "注文を受ける" lane=sales',
    'node d1 "与信は足りるか" lane=back shape=decision',
    'node n3 "条件を見直す" lane=sales',
    'node n5 "出荷する" lane=ware',
    'n1 -> n2',
    'n2 -> d1 "審査を依頼"',
    'd1 -> n3 "NG"',
    'n3 -> n2 "再見積"',
    'd1 -> n5 "OK"',
  ].join('\n');
  const svg = svgOf(code);
  const lay = layoutOf(code);
  const ware = lay.laneBands[2];
  const back = lay.boxes.find(b => b.node.id === 'n3');
  const idx = [...svg.matchAll(/<path[^>]*d="([^"]+)"[^>]*data-pick="link" data-idx="(\d+)"/g)]
    .find(m => +m[2] === 3);                      // 4本目 = n3 -> n2（戻り）
  assert.ok(idx, '戻りの辺が見つからない');
  const xs = segmentsOf(idx[1]).flatMap(([x1, , x2]) => [x1, x2]);
  const maxX = Math.max(...xs);
  assert.ok(
    maxX < ware.start,
    `戻りの辺が倉庫レーン（x>=${ware.start}）まで回り込んでいる: maxX=${maxX}`
  );
  assert.ok(back, 'ノードが見つからない');
});

// ---------------------------------------------------------------------------
// 4. 見た目の装飾（角丸・またぎ・合流の点・●のラベルの背景）
// ---------------------------------------------------------------------------

/* 同じ接続につき path が2本出る。class="sl-hit" が判定用（直角）、もう1本が見た目用。 */
function pathPairs(svg) {
  const hit = new Map();
  [...svg.matchAll(/<path class="sl-hit" d="([^"]+)"[^>]*data-idx="(\d+)"/g)]
    .forEach(m => hit.set(+m[2], m[1]));
  const shown = new Map();
  [...svg.matchAll(/<path d="([^"]+)"[^>]*data-pick="link" data-idx="(\d+)"/g)]
    .forEach(m => { if (!shown.has(+m[2])) shown.set(+m[2], m[1]); });
  return { hit, shown };
}

/* d の最初と最後の点 */
function endsOf(d) {
  const nums = [...String(d).matchAll(/[MLQ]\s+([-\d.]+)\s+([-\d.]+)(?:\s+([-\d.]+)\s+([-\d.]+))?/g)];
  const first = nums[0];
  const last = nums[nums.length - 1];
  return {
    start: { x: +first[1], y: +first[2] },
    end: last[3] !== undefined ? { x: +last[3], y: +last[4] } : { x: +last[1], y: +last[2] },
  };
}

check('装飾した線が、判定用の経路と同じ所から出て同じ所へ入る', () => {
  const svg = svgOf(ORDER_FLOW);
  const { hit, shown } = pathPairs(svg);
  assert.ok(hit.size > 0 && hit.size === shown.size, '経路の本数が合わない');
  hit.forEach((d, i) => {
    // 判定用は H/V の折れ線、見た目用は M/L/Q。読み方が違うので別々にほどく
    const segs = segmentsOf(d);
    const last = segs[segs.length - 1];
    const a = { start: { x: segs[0][0], y: segs[0][1] }, end: { x: last[2], y: last[3] } };
    const b = endsOf(shown.get(i));
    const far = (p, q) => Math.abs(p.x - q.x) > 0.6 || Math.abs(p.y - q.y) > 0.6;
    assert.ok(!far(a.start, b.start), `線#${i} の根元がずれている: ${JSON.stringify([a.start, b.start])}`);
    assert.ok(!far(a.end, b.end), `線#${i} の矢先がずれている: ${JSON.stringify([a.end, b.end])}`);
  });
});

check('交差している所に、またぎが入る', () => {
  // 関係のない2本が十字に交わる図。またがないと、つながって見える。
  const svg = svgOf([
    'swimlane',
    'lane a "A"',
    'lane b "B"',
    'node p1 "左上" lane=a',
    'node p2 "左下" lane=a',
    'node q1 "右上" lane=b',
    'node q2 "右下" lane=b',
    'p1 -> q2 "下へ"',
    'q1 -> p2 "上へ"',
  ].join('\n'));
  const { hit, shown } = pathPairs(svg);
  let hops = 0;
  hit.forEach((d, i) => {
    const corners = (d.match(/[HV]/g) || []).length - 1;     // 折れ角の数
    const curves = (shown.get(i).match(/Q/g) || []).length;  // 角丸 + またぎ
    hops += Math.max(0, curves - Math.max(0, corners));
  });
  assert.ok(hops >= 1, 'またぎが1つも入っていない（交差しているのに通り抜けている）');
});

check('合流している所に、点が打たれる', () => {
  // 2本が同じノードへ入る図。点が無いと、交差なのか合流なのか分からない。
  const svg = svgOf([
    'swimlane',
    'lane a "A"',
    'lane b "B"',
    'node s1 "受付" lane=a',
    'node s2 "再提出" lane=a',
    'node g "審査" lane=b',
    's1 -> g "新規"',
    's2 -> g "再"',
  ].join('\n'));
  const dots = (svg.match(/<circle[^>]*r="3\.2"/g) || []).length;
  assert.ok(dots >= 1, '合流の点が打たれていない');
});

check('●のラベルに背景の箱が敷かれている', () => {
  // ●から出る線はラベルの真上を通る。箱が無いと線が文字を貫いて読めない。
  const svg = svgOf([
    'swimlane',
    'lane a "担当"',
    'node s "引合" lane=a shape=startdot',
    'node n1 "見積を出す" lane=a',
    's -> n1',
  ].join('\n'));
  // ●のラベルは接続ラベルと違って data-pick を持たない白い箱
  const plain = [...svg.matchAll(/<rect x="[-\d.]+" y="[-\d.]+" width="[\d.]+" height="18" rx="4" fill="#FFFFFF" stroke="#D3E1EF"><\/rect>/g)];
  assert.ok(plain.length >= 1, '●のラベルの背景が無い');
  assert.ok(svg.includes('>引合</text>'), '●のラベルそのものが無い');
});

if (failed) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll tests passed.');
