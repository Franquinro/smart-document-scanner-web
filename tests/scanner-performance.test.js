import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scannerSource = await readFile(new URL('../scanner.js', import.meta.url), 'utf8');

test('LAB background mask does not scan every pixel through JavaScript ucharPtr', () => {
  assert.doesNotMatch(scannerSource, /for\s*\(let y=0;y<lab\.rows;y\+\+\)\s*for\s*\(let x=0;x<lab\.cols;x\+\+\)/);
  assert.match(scannerSource, /cv\.inRange\(lab,\s*lowerBg/);
});
