import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeFileName,
  createCaptureFileName,
  shouldOpenEditorAfterImport,
  preferredPdfSaveMethod,
  isPageSequenceCurrent,
  writeBlobToFileHandle,
  createCameraOpenGate,
} from '../mobile-workflow.js';

test('page rename keeps a useful extension while replacing Windows-invalid characters', () => {
  assert.equal(sanitizeFileName('  客戶/報表:第一頁.jpg  ', '掃描頁.jpg'), '客戶_報表_第一頁.jpg');
  assert.equal(sanitizeFileName('...  ', '掃描頁.jpg'), '掃描頁.jpg');
});

test('continuous captures receive stable sequential JPEG names', () => {
  assert.equal(createCaptureFileName(1), '掃描頁_001.jpg');
  assert.equal(createCaptureFileName(27), '掃描頁_027.jpg');
});

test('mobile import stays in completed-preview mode until the user explicitly edits', () => {
  assert.equal(shouldOpenEditorAfterImport({ mobile: true, explicitEdit: false }), false);
  assert.equal(shouldOpenEditorAfterImport({ mobile: true, explicitEdit: true }), true);
  assert.equal(shouldOpenEditorAfterImport({ mobile: false, explicitEdit: false }), true);
});

test('PDF save picker is used only in a secure browser that supports it', () => {
  assert.equal(preferredPdfSaveMethod({ secureContext: true, hasSavePicker: true }), 'picker');
  assert.equal(preferredPdfSaveMethod({ secureContext: false, hasSavePicker: true }), 'download');
  assert.equal(preferredPdfSaveMethod({ secureContext: true, hasSavePicker: false }), 'download');
});

test('PDF export detects page additions, deletions, and reordering', () => {
  const pages = [{ id: 'a' }, { id: 'b' }];
  assert.equal(isPageSequenceCurrent(pages, ['a', 'b']), true);
  assert.equal(isPageSequenceCurrent([...pages].reverse(), ['a', 'b']), false);
  assert.equal(isPageSequenceCurrent([pages[0]], ['a', 'b']), false);
  assert.equal(isPageSequenceCurrent([...pages, { id: 'c' }], ['a', 'b']), false);
});

test('PDF picker writes and closes the writable stream on success', async () => {
  const calls = [];
  const blob = new Blob(['pdf'], { type: 'application/pdf' });
  const handle = { createWritable: async () => ({
    write: async value => calls.push(['write', value]),
    close: async () => calls.push(['close']),
    abort: async () => calls.push(['abort']),
  }) };

  await writeBlobToFileHandle(handle, blob);
  assert.deepEqual(calls, [['write', blob], ['close']]);
});

test('PDF picker aborts without retrying close when writing fails', async () => {
  const calls = [];
  const failure = new Error('磁碟已滿');
  const handle = { createWritable: async () => ({
    write: async () => { calls.push(['write']); throw failure; },
    close: async () => calls.push(['close']),
    abort: async () => calls.push(['abort']),
  }) };

  await assert.rejects(writeBlobToFileHandle(handle, new Blob()), error => error === failure);
  assert.deepEqual(calls, [['write'], ['abort']]);
});

test('PDF picker attempts abort and preserves the original close failure', async () => {
  const calls = [];
  const failure = new Error('關閉失敗');
  const handle = { createWritable: async () => ({
    write: async () => calls.push(['write']),
    close: async () => { calls.push(['close']); throw failure; },
    abort: async () => { calls.push(['abort']); throw new Error('中止也失敗'); },
  }) };

  await assert.rejects(writeBlobToFileHandle(handle, new Blob()), error => error === failure);
  assert.deepEqual(calls, [['write'], ['close'], ['abort']]);
});

test('camera open gate invalidates stale, cancelled, and exporting requests', () => {
  const gate = createCameraOpenGate();
  const first = gate.begin();
  assert.equal(gate.canUse(first, { exporting: false }), true);

  const second = gate.begin();
  assert.equal(gate.canUse(first, { exporting: false }), false);
  assert.equal(gate.canUse(second, { exporting: false }), true);

  gate.cancel();
  assert.equal(gate.canUse(second, { exporting: false }), false);

  const third = gate.begin();
  assert.equal(gate.canUse(third, { exporting: true }), false);
});
