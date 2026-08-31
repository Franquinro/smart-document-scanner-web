import test from 'node:test';
import assert from 'node:assert/strict';
import * as geometry from '../geometry.js';
import {
  orderPoints,
  polygonArea,
  quadMetrics,
  scoreQuad,
  evaluateDetection,
  computeOutputSize,
  chooseDetectionCandidate,
} from '../geometry.js';

const approx = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);

test('orderPoints returns TL TR BR BL regardless of input order', () => {
  const shuffled = [{x: 90,y: 80},{x: 10,y: 10},{x: 5,y: 90},{x: 100,y: 20}];
  assert.deepEqual(orderPoints(shuffled), [
    {x:10,y:10},{x:100,y:20},{x:90,y:80},{x:5,y:90}
  ]);
});

test('orderPoints rejects duplicate and non-four-point input', () => {
  assert.throws(() => orderPoints([{x:0,y:0}]), /four/i);
  assert.throws(() => orderPoints([{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:0}]), /unique/i);
});

test('polygonArea is orientation independent', () => {
  const square = [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}];
  assert.equal(polygonArea(square), 100);
  assert.equal(polygonArea([...square].reverse()), 100);
});

test('quadMetrics recognizes a strong centered rectangle', () => {
  const m = quadMetrics([{x:100,y:100},{x:900,y:100},{x:900,y:700},{x:100,y:700}], 1000, 800, 0.9);
  approx(m.coverage, 0.6);
  assert.equal(m.convex, true);
  assert.ok(m.angleScore > 0.99);
  assert.ok(m.oppositeConsistency > 0.99);
  assert.equal(m.touchesEdge, false);
  approx(m.edgeSupport, 0.9);
});

test('scoreQuad rewards document geometry over skewed low-support candidate', () => {
  const strong = scoreQuad(quadMetrics([{x:80,y:70},{x:920,y:70},{x:920,y:730},{x:80,y:730}],1000,800,0.9));
  const weak = scoreQuad(quadMetrics([{x:5,y:5},{x:700,y:40},{x:980,y:200},{x:20,y:790}],1000,800,0.2));
  assert.ok(strong > weak + 0.2, `${strong} > ${weak}`);
  assert.ok(strong > 0.75);
});

test('low-confidence candidate touching image edge requires manual adjustment', () => {
  const result = evaluateDetection(
    [{x:1,y:1},{x:999,y:2},{x:995,y:799},{x:2,y:798}], 1000, 800,
    { confidence: 0.61, method: 'canny-weak-1' }
  );
  assert.equal(result.needsManual, true);
  assert.equal(result.method, 'canny-weak-1');
});

test('high-confidence color mask still requires manual adjustment when multiple corners touch edges', () => {
  const result = evaluateDetection(
    [{x:1,y:1},{x:999,y:2},{x:995,y:799},{x:2,y:798}], 1000, 800,
    { confidence: 0.91, method: 'lab-paper-mask' }
  );
  assert.equal(result.needsManual, true);
});

test('single edge touch with strong geometry and color confidence can be accepted', () => {
  const result = evaluateDetection(
    [{x:1,y:90},{x:900,y:100},{x:890,y:700},{x:100,y:690}], 1000, 800,
    { confidence: 0.91, method: 'lab-paper-mask' }
  );
  assert.equal(result.needsManual, false);
});

test('paper mask candidate outranks a smaller internal Canny frame', () => {
  const internal = {method:'canny-weak-28-95',score:.89,metrics:{coverage:.67}};
  const paper = {method:'lab-paper-mask',score:.81,metrics:{coverage:.89}};
  assert.equal(chooseDetectionCandidate([internal,paper]), paper);
});

test('Canny candidate remains usable when no credible paper mask exists', () => {
  const edge = {method:'canny-weak-28-95',score:.76,metrics:{coverage:.62}};
  const noise = {method:'lab-paper-mask',score:.31,metrics:{coverage:.72}};
  assert.equal(chooseDetectionCandidate([edge,noise]), edge);
});

test('computeOutputSize preserves measured landscape geometry', () => {
  assert.deepEqual(computeOutputSize([{x:0,y:0},{x:400,y:0},{x:400,y:200},{x:0,y:200}]), {width:400,height:200});
});

test('computeOutputSize uses longest opposite edges and clamps minimum', () => {
  const size = computeOutputSize([{x:0,y:0},{x:300,y:0},{x:280,y:500},{x:10,y:480}], {min:32,max:1000});
  assert.equal(size.width, 300);
  assert.ok(size.height >= 500 && size.height <= 501);
  assert.deepEqual(computeOutputSize([{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}], {min:32}), {width:32,height:32});
});

test('computeOutputSize scales dimensions down to max without distortion', () => {
  assert.deepEqual(computeOutputSize([{x:0,y:0},{x:4000,y:0},{x:4000,y:2000},{x:0,y:2000}], {max:1000}), {width:1000,height:500});
});

test('paper mask morphology removes isolated background speckles before closing paper gaps', () => {
  assert.deepEqual(geometry.paperMaskMorphology(960, 1280), {neutralOpen:9, differenceOpen:13, close:13});
  assert.deepEqual(geometry.paperMaskMorphology(320, 240), {neutralOpen:3, differenceOpen:3, close:5});
});
