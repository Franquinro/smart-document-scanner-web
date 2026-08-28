import test from 'node:test';
import assert from 'node:assert/strict';
import { getPreviewMaxDimension, getExportMaxDimension, createRafCoalescer, createDebouncedTask, createGenerationGate, getCachedValue } from '../performance.js';

test('interactive preview uses bounded desktop and mobile dimensions', () => {
  assert.equal(getPreviewMaxDimension(1440, false), 960);
  assert.equal(getPreviewMaxDimension(390, false), 640);
  assert.equal(getPreviewMaxDimension(1440, true), 640);
  assert.equal(getPreviewMaxDimension(390, true), 480);
});

test('requestAnimationFrame coalescer applies only the latest pointer move per frame', () => {
  const frames = [];
  const calls = [];
  const schedule = createRafCoalescer(value => calls.push(value), callback => frames.push(callback));
  schedule('first');
  schedule('second');
  schedule('latest');
  assert.equal(frames.length, 1);
  assert.deepEqual(calls, []);
  frames.shift()(10);
  assert.deepEqual(calls, ['latest']);
});

test('requestAnimationFrame coalescer can cancel a pending drag update', () => {
  const frames = [];
  const cancelled = [];
  const calls = [];
  const schedule = createRafCoalescer(value => calls.push(value), callback => {frames.push(callback); return 7;}, id => cancelled.push(id));
  schedule('pending');
  schedule.cancel();
  assert.deepEqual(cancelled, [7]);
  frames.shift()(10);
  assert.deepEqual(calls, []);
});

test('slider work is debounced for 200ms and runs only the latest settings', () => {
  const timers = new Map();
  let nextId = 0;
  const calls = [];
  const schedule = createDebouncedTask(value => calls.push(value), 200,
    (callback, delay) => { const id=++nextId; timers.set(id,{callback,delay}); return id; },
    id => timers.delete(id));
  schedule('old');
  schedule('latest');
  assert.equal(timers.size, 1);
  const pending = [...timers.values()][0];
  assert.equal(pending.delay, 200);
  pending.callback();
  assert.deepEqual(calls, ['latest']);
});

test('generation gate rejects stale preview work', () => {
  const gate = createGenerationGate();
  const oldGeneration = gate.begin();
  const latestGeneration = gate.begin();
  assert.equal(gate.isCurrent(oldGeneration), false);
  assert.equal(gate.isCurrent(latestGeneration), true);
});

test('preview cache reuses the perspective base for identical geometry', () => {
  const cache = new Map();
  let builds = 0;
  const first = getCachedValue(cache, 'page:corners:960', () => ({id:++builds}));
  const second = getCachedValue(cache, 'page:corners:960', () => ({id:++builds}));
  assert.equal(first, second);
  assert.equal(builds, 1);
});

test('export processing keeps the source long-side resolution', () => {
  assert.equal(getExportMaxDimension({width:4032,height:3024}), 4032);
  assert.equal(getExportMaxDimension({width:1080,height:1920}), 1920);
});
